# Codex Meme Merch Manifest

`products.json` is the source of truth for merch drops created from Codex
conversations. `base-products.json` defines the MVP provider-backed apparel
blanks and variant matrix.

Each product keeps the creative brief, rights note, neutral commerce fields,
production placements, provider references, signal sources, generated print
files, and mockup paths together. The storefront reads this manifest directly.

Default workflow:

1. Add a product with `npm run merch:new -- "Product title"`. This scaffolds an
   All-Over Cotton garment by default. Use `npm run merch:new:standard -- "Product title"`
   only when a single-placement product is explicitly requested.
2. Research trend signals with
   `npm run merch:signals -- --provider x --slug <slug> --dry-run`, then rerun
   without `--dry-run` when `X_BEARER_TOKEN` is configured. `merch:signals:x`
   remains as a compatibility alias. Treat social posts as inspiration only; do
   not copy post text, screenshots, usernames, likenesses, or official marks.
3. Replace scaffold placeholders in `meme.brief`, `prompts`, and
   `artDirector.aopSpec`.
4. Review the art direction with `npm run merch:art-director:review -- --slug <slug>`.
5. Generate original artwork with `npm run merch:generate-artwork -- --slug <slug>`.
6. Compose deterministic print files with `npm run merch:compose-print-files -- --slug <slug>`.
7. Generate customer catalog mockups with `npm run merch:catalog:mockups -- --slug <slug>`.
   Product tiles fall back to `assets/mockups/<slug>-catalog.png`; when native
   Printful mockup photos are downloaded, the storefront prefers those customer
   photos automatically.
8. Create or update the native Printful Manual order/API store product with
   `npm run merch:printful:upsert -- --slug <slug> --site-url https://your-public-domain.example`.
   The site URL must be public HTTPS because Printful fetches the thumbnail and
   print files server-to-server.
9. Generate provider mockups with `npm run merch:mockups -- --slug <slug> --site-url https://your-public-domain.example`, then
   poll with `npm run merch:mockups -- --slug <slug> --poll`.
   Completed Printful mockup URLs are downloaded into `assets/mockups/` because
   Printful mockup URLs are temporary.
10. Verify provider readiness with `npm run merch:printful:verify -- --slug <slug>`.
   This checks Printful refs, AOP placements, variant IDs, print files, and
   live native store-product access when credentials are configured.
11. Dry-run a fulfillment order payload with
   `npm run merch:fulfillment:order:dry-run -- --provider printful --slug <slug> --site-url https://example.com`.
   `merch:printful:order:dry-run` remains as a compatibility alias.
12. Publish only after manual approval and provider readiness:
   `npm run merch:publish -- --slug <slug> --approve --by <name>`.

Real API mutation is gated behind credentials and explicit non-dry-run
commands. Do not publish designs using official marks, recognizable people,
copied screenshots, or verbatim social posts without clearance.
