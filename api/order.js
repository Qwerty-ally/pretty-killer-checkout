// Looks up one order for the shop's confirmation page: GET /api/order?session_id=cs_...
// The session id comes back from Stripe after paying and is long and unguessable.

const { STRIPE_KEY, SOURCE, cors, stripe, orderSummary } = require("../lib/shop");

module.exports = async (req, res) => {
  cors(req, res, "GET");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Use GET." });
  if (!STRIPE_KEY) return res.status(500).json({ error: "Checkout isn't set up yet." });

  const id = String((req.query && req.query.session_id) || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: "That isn't an order." });
  try {
    const s = await stripe(`checkout/sessions/${id}?expand[]=line_items`);
    if (!s.metadata || s.metadata.source !== SOURCE) return res.status(404).json({ error: "Order not found." });
    const o = orderSummary(s);
    delete o.email;   // the confirmation page doesn't need it
    return res.status(200).json(o);
  } catch(e){
    console.error("Order lookup failed:", e.message);
    return res.status(404).json({ error: "Order not found." });
  }
};
