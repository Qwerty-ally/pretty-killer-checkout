# Pretty Killer Checkout

A tiny Vercel server for the [Pretty Killer shop](https://qwerty-ally.github.io/pretty-killer-shop/).

- `api/checkout.js` takes the buyer's name and bag (`{ name, items: [{ id, side, qty, free }] }`), gives the order a number like `PK-4821`, and returns a Stripe Checkout link. Orders are picked up at the merch stand, so no address is asked for.
- `api/order.js` looks up one order for the shop's confirmation screen (`?session_id=cs_…`).
- `api/orders.js` lists paid shop orders for `admin.html`. It needs the `X-Admin-Key` header to match the `ADMIN_KEY` setting.
- `lib/shop.js` has the prices (`CATALOG`). **If you change a price in the shop, change it here too.** This is what people actually pay.
- Secrets (`STRIPE_SECRET_KEY`, `ADMIN_KEY`) are only in Vercel → Settings → Environment Variables, never in this repo. Redeploy after changing them (`npx vercel --prod`).
- Every order is tagged `source: pretty-killer-shop` because the Stripe account is shared with the old merch site.
- `api/manual.js` adds in-person sales from `admin.html` (`X-Admin-Key` needed): each is a Stripe invoice marked paid outside of Stripe (nobody is charged or emailed), listed by `api/orders.js` with the online orders. `DELETE ?id=` hides one from the list (paid invoices cant be deleted). The in-person tees (`mtee`, `ntee`) are in `CATALOG` for this but can not be bought online.
