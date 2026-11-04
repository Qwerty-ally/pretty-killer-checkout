// In-person sales the admin types in, so they show on admin.html next to the online orders.
// Each one is a Stripe invoice marked "paid outside of Stripe" (paid_out_of_band): nobody is
// charged or emailed, and it shows in the Stripe dashboard too. All calls need X-Admin-Key.
//   GET    /api/manual              -> { items }: what can be sold (from CATALOG), for the admin form
//   POST   /api/manual              { name, method, note, items: [{ id, side, qty } or { custom, name, price (cents), qty }] }
//   DELETE /api/manual?id=in_...    -> hides that sale from the admin list (paid invoices can't be deleted)

const crypto = require("crypto");
const { STRIPE_KEY, SOURCE, CATALOG, cors, stripe, isAdmin, manualSummary } = require("../lib/shop");
const METHODS = ["Cash", "Venmo", "Zelle", "Card at the stand", "Other"];
const MAX_QTY = 50;

module.exports = async (req, res) => {
  cors(req, res, "GET, POST, DELETE");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (!STRIPE_KEY) return res.status(500).json({ error: "The admin page isn't set up yet." });
  if (!isAdmin(req)) return res.status(401).json({ error: "Wrong password." });

  if (req.method === "GET"){
    const items = Object.entries(CATALOG).filter(([id]) => id !== "test")
      .map(([id, p]) => ({ id, name: p.name, price: p.price, variants: p.variants || null }));
    return res.status(200).json({ items, methods: METHODS });
  }

  if (req.method === "DELETE"){
    const id = String((req.query && req.query.id) || "");
    if (!/^in_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "That isn't a sale." });
    try {
      const inv = await stripe(`invoices/${id}`);
      if (!inv.metadata || inv.metadata.source !== SOURCE || inv.metadata.manual !== "yes") return res.status(404).json({ error: "Sale not found." });
      await stripe(`invoices/${id}`, new URLSearchParams({ "metadata[hidden]": "yes" }));
      return res.status(200).json({ ok: true });
    } catch(e){
      console.error("Hiding a sale failed:", e.message);
      return res.status(502).json({ error: "Couldn't remove it. Try again." });
    }
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Use GET, POST or DELETE." });
  const body = req.body || {};
  const clean = (t, n) => String(t || "").replace(/\s+/g, " ").trim().slice(0, n);
  const name = clean(body.name, 60) || "In-person buyer";
  const method = METHODS.includes(body.method) ? body.method : "Cash";
  const note = clean(body.note, 200);

  // work out each line from the catalog (or a custom item with its own price)
  const lines = [];
  for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 30)){
    const qty = Math.floor(Number(it && it.qty));
    if (!(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: `Quantity has to be 1 to ${MAX_QTY}.` });
    if (it.custom){
      const label = clean(it.name, 80), price = Math.round(Number(it.price));
      if (!label || !(price >= 0 && price <= 100000)) return res.status(400).json({ error: "Give the other item a name and a price." });
      lines.push({ label, price, qty });
      continue;
    }
    const p = CATALOG[it && it.id];
    if (!p || it.id === "test") return res.status(400).json({ error: "Pick an item from the list." });
    let label = p.name;
    if (p.variants){
      if (!p.variants[it.side]) return res.status(400).json({ error: `Pick the Pretty or Killer version of ${p.name}.` });
      label += ` (${p.variants[it.side]})`;
    }
    lines.push({ label, price: p.price, qty });
  }
  if (!lines.length) return res.status(400).json({ error: "Add at least one item." });

  const order = "PK-" + crypto.randomInt(1000, 10000);
  const itemsText = lines.map(l => `${l.qty}×${l.label}`).join("|").slice(0, 500);
  try {
    const customer = await stripe("customers", new URLSearchParams({ name, description: `In-person · ${order}`, "metadata[source]": SOURCE }));
    for (const l of lines){
      await stripe("invoiceitems", new URLSearchParams({
        customer: customer.id, currency: "usd", amount: String(l.price * l.qty),
        description: l.qty > 1 ? `${l.label} × ${l.qty}` : l.label
      }));
    }
    const meta = { source: SOURCE, manual: "yes", order, name, method, items: itemsText, ...(note ? { note } : {}) };
    const form = new URLSearchParams({ customer: customer.id, collection_method: "send_invoice", days_until_due: "1",
      pending_invoice_items_behavior: "include", description: `In-person sale ${order} · ${name} · ${method}` });
    Object.entries(meta).forEach(([k, v]) => form.append(`metadata[${k}]`, v));
    let inv = await stripe("invoices", form);
    inv = await stripe(`invoices/${inv.id}/finalize`, new URLSearchParams({ auto_advance: "false" }));
    if (inv.status !== "paid") inv = await stripe(`invoices/${inv.id}/pay`, new URLSearchParams({ paid_out_of_band: "true" }));
    return res.status(200).json({ order: manualSummary(inv) });
  } catch(e){
    console.error("Adding a sale failed:", e.message);
    return res.status(502).json({ error: "Stripe couldn't save the sale. Try again." });
  }
};
