// Creates a Stripe Checkout Session for the Pretty Killer shop's whole bag.
// The shop (GitHub Pages) sends { items: [{ id, side, qty, free }] } and gets back { url }.
// Prices live HERE, not in the request, so nobody can change what they pay.
// The secret key comes from the STRIPE_SECRET_KEY environment variable on Vercel.

const SHOP_URL = process.env.SHOP_URL || "https://qwerty-ally.github.io/pretty-killer-shop/";
const ALLOWED_ORIGINS = ["https://qwerty-ally.github.io", "http://localhost:8080", "http://127.0.0.1:8080"];
const MAX_QTY = 20;
const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();   // trim: a pasted key can pick up a stray newline

// price in cents; variants = Pretty / Killer versions (shared items have one version)
const CATALOG = {
  finnschoice: { name: "Finn's Choice", price: 10500, variants: { pretty: "With the Pretty ver. CD", killer: "With the Killer ver. CD" } },
  book:        { name: "Pretty Killer Tour Book (Hardcover)", price: 4500 },
  kpopcd:      { name: "K-pop Style CD", price: 3500, variants: { pretty: "Pretty ver.", killer: "Killer ver." } },
  cd:          { name: "Standard CD", price: 2200, variants: { pretty: "Pretty cover", killer: "Killer cover" } },
  keychain:    { name: "Mini CD Keychain", price: 1500, variants: { pretty: "Pretty ver.", killer: "Killer ver." } },
  stickers:    { name: "Sticker Pack", price: 800, variants: { pretty: "Pretty pack", killer: "Killer pack" } },
  cards:       { name: "Mystery Trading Cards", price: 1000, variants: { pretty: "Pretty pack · 5 random cards", killer: "Killer pack · 5 random cards" } },
  poster:      { name: "Tour Poster", price: 500, variants: { pretty: "Pretty poster · 8.5×11 in", killer: "Killer poster · 8.5×11 in" } },
  hat:         { name: "Reversible Bucket Hat (Killer outside, Pretty reverse side)", price: 3000 },
  digital:     { name: "Digital Album", price: 1000, digital: true, variants: { pretty: "Pretty ver. · download", killer: "Killer ver. · download" } },
  movie:       { name: "Pretty Killer: The Movie", price: 1500 },
  test:        { name: "Test Item", price: 100, digital: true }   // hidden $1 item for testing real checkout
};

function cors(req, res){
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });
  if (!STRIPE_KEY) return res.status(500).json({ error: "Checkout isn't set up yet." });

  const items = req.body && Array.isArray(req.body.items) ? req.body.items : [];
  const form = new URLSearchParams();
  let n = 0, physical = false, freeMovie = false;

  for (const it of items.slice(0, 40)){
    const p = CATALOG[it && it.id];
    if (!p) return res.status(400).json({ error: "Something in your bag isn't for sale online." });
    // secret code: one free Movie per order, not charged
    if (it.free){ if (it.id === "movie") { freeMovie = true; physical = true; } continue; }
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= MAX_QTY)) return res.status(400).json({ error: `You can buy 1 to ${MAX_QTY} of each item.` });
    let name = p.name;
    if (p.variants){
      if (!p.variants[it.side]) return res.status(400).json({ error: `Pick the Pretty or Killer version of ${p.name}.` });
      name += ` (${p.variants[it.side]})`;
    }
    if (!p.digital) physical = true;
    form.append(`line_items[${n}][price_data][currency]`, "usd");
    form.append(`line_items[${n}][price_data][unit_amount]`, String(p.price));
    form.append(`line_items[${n}][price_data][product_data][name]`, name);
    form.append(`line_items[${n}][quantity]`, String(qty));
    n++;
  }
  if (!n) return res.status(400).json({ error: "There's nothing to pay for in your bag." });

  form.append("mode", "payment");
  form.append("success_url", SHOP_URL + "?paid=1");
  form.append("cancel_url", SHOP_URL + "?canceled=1");
  if (physical) form.append("shipping_address_collection[allowed_countries][0]", "US");
  if (freeMovie){
    form.append("metadata[free_movie]", "yes");
    form.append("custom_text[submit][message]", "Your free Pretty Killer: The Movie (secret code) comes with this order.");
  }

  try {
    const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${STRIPE_KEY}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    const data = await r.json();
    if (!r.ok){ console.error("Stripe error:", data.error && data.error.message); return res.status(502).json({ error: "Stripe couldn't start checkout. Try again." }); }
    return res.status(200).json({ url: data.url });
  } catch(e){
    console.error("Checkout failed:", e && e.message);
    return res.status(502).json({ error: "Couldn't reach Stripe. Try again." });
  }
};
