# Codex Merch

React Router storefront plus a Codex-first merch pipeline for turning signal
research into provider-backed merch products. The catalog is owned by
`merch/products.json`, checkout is owned by Stripe, and fulfillment is routed
through the configured production provider after paid checkout. Printful and X
are the first live providers.

## Development

```bash
npm run dev
npm run test
npm run typecheck
npm run build
```

## Merch Pipeline

```bash
npm run merch:new -- "Product title"
npm run merch:signals -- --provider x --slug <slug> --dry-run
npm run merch:signals:x -- --slug <slug> --dry-run
npm run merch:art-director:review -- --slug <slug>
npm run merch:generate-artwork -- --slug <slug>
npm run merch:compose-print-files -- --slug <slug>
npm run merch:catalog:mockups -- --slug <slug>
npm run merch:printful:upsert -- --slug <slug> --site-url https://your-public-domain.example
npm run merch:mockups -- --slug <slug> --dry-run
npm run merch:mockups -- --slug <slug> --site-url https://your-public-domain.example
npm run merch:fulfillment:order:dry-run -- --provider printful --slug <slug> --site-url https://example.com
npm run merch:printful:order:dry-run -- --slug <slug> --site-url https://example.com
npm run merch:publish -- --slug <slug> --approve --by <name>
```

Workflow status moves through `draft`, `generated`, `mockups_ready`,
`approved`, `published`, and `archived`.

Required live credentials are listed in `.env.example`: Stripe, Printful, X,
and OpenAI. Set `PUBLIC_SITE_URL` to a public HTTPS origin before live Printful
calls; Printful fetches `/assets/print/...` files from that URL. The product
manifest uses generic `production`, `providerRefs`, and `signals` fields so
future POD and research providers can be added behind adapters. Printful does
not collect customer payment for this custom storefront; Stripe Checkout
collects payment, then the webhook creates the Printful fulfillment order. By
default `PRINTFUL_AUTO_CONFIRM=false`, so live orders are created for review
before Printful charges/fulfills them.
