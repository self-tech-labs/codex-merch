# Contributing to Codex Merch

Thanks for helping make the signal-to-product pipeline more useful. The best
contributions keep its central contract intact: model judgment is inspectable,
software gates are deterministic, and external release remains human-authorized.

## Set up the project

Use Node.js 22 or 24. Node 22 is recorded in `.nvmrc`.

```bash
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

The checked-in defaults are Preview-safe. Do not enable production flags or add
real credentials to reproduce a storefront or fixture test.

## Choose a useful seam

- Signal adapters live in `scripts/adapters/` and `scripts/services/signals.mjs`.
- Model instructions and strict response contracts live in `scripts/prompts/`
  and `merch/weekly/schemas/`.
- Product and customization contracts live in `merch/*.json`.
- Rendering, prepress, provider, and release logic lives in `scripts/services/`.
- The React Router storefront lives in `app/`.

Small, well-tested changes at one seam are easier to review than a new opaque
end-to-end path.

## Development rules

1. Create a focused branch from the current default branch.
2. Keep X posts and other external content untrusted. Never commit raw private
   post text, credentials, customer data, or local run ledgers.
3. Do not copy usernames, likenesses, screenshots, protected brand language,
   or source artwork into prompts or product outputs.
4. Preserve truthful provenance. Owner input, synthetic data, and live research
   must retain different labels and release permissions.
5. Accept `no_trend` as success; do not weaken gates to force a product.
6. Keep `PRINTFUL_AUTO_CONFIRM=false`. Tests and contribution work must not
   create or confirm a customer order.
7. Add or update tests for behavior changes, including failure and retry paths.

## Validate your change

```bash
npm run merch:validate
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

For Build Week or submission-facing changes, also run:

```bash
npm run submission:verify
```

## Pull requests

Explain the user-visible outcome, the system seam changed, and the checks you
ran. Call out catalog or asset mutations explicitly. Include screenshots for UI
work and sanitized evidence for pipeline behavior; never attach raw signal data
or secret-bearing logs.

By submitting a contribution, you agree that your software contribution may be
distributed under the repository's MIT license. Artwork and third-party assets
have different terms; read [`ASSET-LICENSE.md`](ASSET-LICENSE.md) before adding
media.
