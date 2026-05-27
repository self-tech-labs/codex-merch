# Codex Meme Merch Manifest

`products.json` is the first source of truth for drops created from Codex conversations.
`base-products.json` defines the MVP Printful apparel blanks and their Shopify
variant matrix.

Each product keeps the creative brief, rights note, Shopify sync slots, Printful sync slots, print placements, and mockup paths together. The storefront reads this file for mocked data until real Shopify product and variant IDs are added.

Default workflow:

1. Add or update a product with `npm run merch:new -- "Product title"` or by editing `products.json`.
2. Research trend signals with `npm run merch:research:x -- --slug <slug> --dry-run`, then rerun without `--dry-run` when `X_BEARER_TOKEN` is configured.
3. Generate original artwork with `npm run merch:generate-artwork -- --slug <slug>`. This step first checks `base-products.json` and `customization-techniques.json` so the selected Printful base, technique, and placements are shippable before any OpenAI image request is sent. It also injects `art-direction.json`, which keeps the work in an original Supply Co.-adjacent Codex/skater/SF-geek direction while explicitly avoiding copied products, official marks, and protected streetwear branding.
4. Compose deterministic transparent print files with `npm run merch:compose-print-files -- --slug <slug>`.
5. Upload generated assets to Shopify Files with `npm run merch:upload-assets -- --slug <slug>`.
6. Create or update a draft Shopify product with `npm run merch:shopify:upsert -- --slug <slug>`.
7. After Printful imports the Shopify draft product, link Printful sync variants with `npm run merch:printful:sync -- --slug <slug>`.
8. Generate Printful mockups with `npm run merch:mockups -- --slug <slug>`, then poll with `npm run merch:mockups -- --slug <slug> --poll`.
9. Publish only after manual approval: `npm run merch:publish -- --slug <slug> --approve --by <name>`.

Real API mutation is intentionally gated behind credentials and explicit non-dry-run
commands. Shopify products stay drafts until `merch:publish` is run. Do not publish
designs using official marks, recognizable people, copied screenshots, or verbatim
social posts without clearance.
