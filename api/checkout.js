// Creates a Stripe Checkout Session for the Pretty Killer shop's whole bag.
// The shop (GitHub Pages) sends { name, items: [{ id, side, qty, free }] } and gets back { url }.
// Prices live in lib/shop.js, not in the request, so nobody can change what they pay.
// Orders are picked up at the merch stand, so no shipping address is asked for.

const crypto = require("crypto");
const { SHOP_URL, STRIPE_KEY, SOURCE, CATALOG, cors, stripe } = require("../lib/shop");
const MAX_QTY = 20;

module.exports = async (req, res) => {
  cors(req, res, "POST");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!STRIPE_KEY) return res.status(500).json({ error: "Checkout isn't set up yet." });

  const body = req.body || {};
  const name = String(body.name || "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!name) return res.status(400).json({ error: "Type your name so we know whose order it is." });
  const items = Array.isArray(body.items) ? body.items : [];
  const form = new URLSearchParams();
  let n = 0, freeMovie = false;

  for (const it of items.slice(0, 40)){
    const p = CATALOG[it && it.id];
    if (!p) return res.status(400).json({ error: "Something in your bag isn't for sale online." });
    // secret code: one free Movie per order, not charged
    if (it.free){ if (it.id === "movie") freeMovie = true; continue; }
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: `You can buy 1 to ${MAX_QTY} of each item.` });
    let itemName = p.name;
    if (p.variants){
      if (!p.variants[it.side]) return res.status(400).json({ error: `Pick the Pretty or Killer version of ${p.name}.` });
      itemName += ` (${p.variants[it.side]})`;
    }
    form.append(`line_items[${n}][price_data][currency]`, "usd");
    form.append(`line_items[${n}][price_data][unit_amount]`, String(p.price));
    form.append(`line_items[${n}][price_data][product_data][name]`, itemName);
    form.append(`line_items[${n}][quantity]`, String(qty));
    n++;
  }
  if (!n) return res.status(400).json({ error: "There's nothing to pay for in your bag." });

  // short order number to say at the stand, e.g. PK-4821
  const order = "PK-" + crypto.randomInt(1000, 10000);
  const meta = { source: SOURCE, order, name, ...(freeMovie ? { free_movie: "yes" } : {}) };
  Object.entries(meta).forEach(([k, v]) => {
    form.append(`metadata[${k}]`, v);
    form.append(`payment_intent_data[metadata][${k}]`, v);
  });
  form.append("payment_intent_data[description]", `Order ${order} · ${name}`);
  form.append("mode", "payment");
  form.append("success_url", SHOP_URL + "?paid=1&session_id={CHECKOUT_SESSION_ID}");
  form.append("cancel_url", SHOP_URL + "?canceled=1");
  form.append("custom_text[submit][message]",
    `Order ${order} for ${name}. Pick it up at the merch stand.` + (freeMovie ? " Your free Pretty Killer: The Movie (secret code) comes with it." : ""));

  try {
    const session = await stripe("checkout/sessions", form);
    return res.status(200).json({ url: session.url });
  } catch(e){
    console.error("Checkout failed:", e.message);
    return res.status(502).json({ error: "Stripe couldn't start checkout. Try again." });
  }
};
