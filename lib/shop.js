// Shared pieces for the Pretty Killer shop's server: prices, CORS and Stripe calls.
// The secret key comes from the STRIPE_SECRET_KEY environment variable on Vercel.

const SHOP_URL = process.env.SHOP_URL || "https://qwerty-ally.github.io/pretty-killer-shop/";
const ALLOWED_ORIGINS = ["https://qwerty-ally.github.io", "http://localhost:8080", "http://127.0.0.1:8080"];
const STRIPE_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();   // trim: a pasted key can pick up a stray newline
// tags every order from this shop, since the Stripe account is shared with the old merch site
const SOURCE = "pretty-killer-shop";

// price in cents; variants = Pretty / Killer versions (shared items have one version)
const CATALOG = {
  finnschoice: { name: "Finn's Choice", price: 11500, variants: { pretty: "With the Pretty ver. CD", killer: "With the Killer ver. CD" } },
  book:        { name: "Pretty Killer Tour Book (Hardcover)", price: 4500 },
  kpopcd:      { name: "K-pop Style CD", price: 4500, variants: { pretty: "Pretty ver.", killer: "Killer ver." } },
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

function cors(req, res, methods){
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods + ", OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Admin-Key");
  res.setHeader("Cache-Control", "no-store");
}

// Calls the Stripe API. `form` is a URLSearchParams for POSTs; GETs put their params in `path`.
async function stripe(path, form){
  const r = await fetch("https://api.stripe.com/v1/" + path, {
    method: form ? "POST" : "GET",
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
    body: form
  });
  const data = await r.json();
  if (!r.ok) throw new Error((data.error && data.error.message) || `Stripe error ${r.status}`);
  return data;
}

// The parts of a paid Checkout Session that the confirmation page and admin page show.
function orderSummary(s){
  const m = s.metadata || {};
  return {
    order: m.order || "",
    name: m.name || "",
    freeMovie: m.free_movie === "yes",
    paid: s.payment_status === "paid",
    total: s.amount_total || 0,
    created: (s.created || 0) * 1000,
    email: (s.customer_details && s.customer_details.email) || "",
    items: ((s.line_items && s.line_items.data) || []).map(li => ({ name: li.description, qty: li.quantity }))
  };
}

module.exports = { SHOP_URL, STRIPE_KEY, SOURCE, CATALOG, cors, stripe, orderSummary };
