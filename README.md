# Codex Merch

Hydrogen storefront plus a Codex-first merch pipeline for turning X trend
signals into Printful-backed Shopify draft products.

## Merch Pipeline

The pipeline is intentionally gated so live API calls only happen when the
required credentials are present and a non-dry-run command is executed.

```bash
npm run merch:research:x -- --slug <slug> --dry-run
npm run merch:generate-artwork -- --slug <slug>
npm run merch:compose-print-files -- --slug <slug>
npm run merch:upload-assets -- --slug <slug>
npm run merch:shopify:upsert -- --slug <slug>
npm run merch:printful:sync -- --slug <slug>
npm run merch:mockups -- --slug <slug>
npm run merch:mockups -- --slug <slug> --poll
npm run merch:publish -- --slug <slug> --approve --by <name>
```

Workflow status moves through `draft`, `generated`, `shopify_draft`,
`printful_imported`, `printful_synced`, `mockups_ready`, `approved`, and
`published`. Shopify products remain drafts until `merch:publish` is run.

Required live credentials are listed in `.env.example`: OpenAI, X, Shopify
Admin/Storefront, and Printful.

## Development

```bash
npm run dev
npm run test
npm run typecheck
npm run build
```
