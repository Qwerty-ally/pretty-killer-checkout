# Pretty Killer Checkout

A tiny Vercel server that starts Stripe Checkout for the whole bag in the [Pretty Killer shop](https://qwerty-ally.github.io/pretty-killer-shop/).

- `api/checkout.js` takes the bag (`{ items: [{ id, side, qty, free }] }`), looks up the real prices in `CATALOG`, and returns a Stripe Checkout link.
- **If you change a price in the shop, change it in `CATALOG` too.** The server's price is what people actually pay.
- The Stripe secret key is **only** in Vercel's environment variables (`STRIPE_SECRET_KEY`), never in this repo.

## Switching from test to live

In Vercel → this project → Settings → Environment Variables, replace `STRIPE_SECRET_KEY` with your `sk_live_…` key, then redeploy (`npx vercel --prod`).
