// Admin list of paid shop orders: GET /api/orders with header X-Admin-Key: <ADMIN_KEY>.
// ADMIN_KEY is an environment variable on Vercel. Returns the newest 300 paid orders from this shop.

const crypto = require("crypto");
const { STRIPE_KEY, SOURCE, cors, stripe, orderSummary } = require("../lib/shop");
const ADMIN_KEY = (process.env.ADMIN_KEY || "").trim();

const sameText = (a, b) => {
  const x = crypto.createHash("sha256").update(String(a)).digest(), y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

module.exports = async (req, res) => {
  cors(req, res, "GET");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!STRIPE_KEY || !ADMIN_KEY) return res.status(500).json({ error: "The admin page isn't set up yet." });
  if (!sameText(req.headers["x-admin-key"] || "", ADMIN_KEY)) return res.status(401).json({ error: "Wrong password." });

  try {
    const orders = [];
    let after = "";
    for (let page = 0; page < 3; page++){   // up to 300 most recent checkouts
      const list = await stripe(`checkout/sessions?limit=100&status=complete&expand[]=data.line_items${after ? `&starting_after=${after}` : ""}`);
      list.data.filter(s => s.metadata && s.metadata.source === SOURCE && s.payment_status === "paid")
        .forEach(s => orders.push(orderSummary(s)));
      if (!list.has_more || !list.data.length) break;
      after = list.data[list.data.length - 1].id;
    }
    return res.status(200).json({ orders });
  } catch(e){
    console.error("Order list failed:", e.message);
    return res.status(502).json({ error: "Couldn't load orders from Stripe. Try again." });
  }
};
