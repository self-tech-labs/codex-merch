# Codex Merch

Production-oriented React Router storefront and garment workflow. The catalog
is owned by `merch/products.json`; Stripe Checkout collects payment; Neon stores
immutable order snapshots; Inngest runs durable fulfillment; Printful produces
the order.

Legacy non-draft products may be shown as no-index previews. Products created
by the weekly automation remain absent from catalog listings and product routes
until `workflow.status` is `published`. A product is purchasable only when it is
published and every available commerce variant has an available Printful
sync-variant mapping; the server enforces this again at checkout.

## Local verification

Use Node.js 22 or 24. Install the locked dependency graph from a fresh checkout:

```bash
npm ci
npm run merch:validate
npm test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

Database integration coverage is enabled when `TEST_DATABASE_URL` is set.

## Build Week: weekly signal studio

**Category:** Work & Productivity

**Pitch:** a Codex-operated weekly culture-to-commerce studio that turns a
recurring team signal into an original, production-ready garment and a testable
storefront drop.

Developer-relations, internal-culture, and creative-operations teams often move
from social listening to a creative brief, production files, provider setup,
and storefront publication by hand. This extension turns that repeated work
into one inspectable weekly run while preserving hard rights, quality, and
release gates. The useful outcome is not “AI makes a picture”; it is a
reproducible path from 30 authorized observations to a garment that can either
be safely skipped, prepared for review, or released without duplicate provider
products.

The extension requests exactly the latest 30 posts from one authorized X list,
asks GPT-5.6 for a structured trend decision, applies deterministic recurrence,
originality, novelty, and rights gates, asks GPT-5.6 for exactly three
panel-aware garment recipes, renders a bounded set of candidates locally, and
has GPT-5.6 inspect the actual output. A weak or unsafe signal ends successfully
as `no_trend`.

### Built with Codex

Codex was the working environment for the Build Week extension: it audited the
existing storefront, traced the X-to-art path, designed and implemented the
weekly state machine, extracted repository-owned prompts and schemas, improved
the deterministic garment renderer, added adversarial tests and fixtures,
reviewed release and commerce safety, and packaged the workflow as the
`codex-merch-weekly` skill plus a Codex Desktop scheduled task prompt.

This collaboration with Codex accelerated the move from an artistic-direction
audit to a tested end-to-end system, especially in cross-cutting state,
provenance, rendering, and commerce work. Key decisions remained owner-held:
Codex proposed and implemented mechanisms, while Elliot chose the audience,
creative medium, safety posture, target signal, and release authority.

Elliot retains the consequential product decisions: the target X list, weekly
cadence, garment medium, category, acceptable artistic direction, whether a
trend is authorized for commercial use, final brand and asset clearance,
provider credentials, merchant policies, and the explicit release kill switch.
The initial implementation reuses Elliot's existing local OpenAI API credential;
no credential value is stored in Git or in the automation prompt.

### GPT-5.6 and deterministic roles

| Stage | GPT-5.6 judgment | Deterministic authority |
| --- | --- | --- |
| [Trend analysis](scripts/prompts/weekly-trend.md) | Return one recurring trend or `no_trend` with evidence IDs, original phrases, scores, and rights risk under a [strict schema](merch/weekly/schemas/trend.schema.json). | Require exactly 30 normalized posts, evidence across authors, safe original language, novelty against published drops, low rights risk, and the minimum aggregate score. |
| [Art direction](scripts/prompts/weekly-art-director.md) | Propose exactly three materially distinct, panel-aware garment recipes under a [strict schema](merch/weekly/schemas/art-direction.schema.json). | Reject protected/source-overlapping language, incomplete panels, duplicate renderer recipes, and inadequate production or rights scores; then render at most two candidates. |
| [Actual-render critique](scripts/prompts/weekly-visual-critic.md) | Inspect resized images of the real panels and mockups and return a six-part rubric under a [strict schema](merch/weekly/schemas/visual-critic.schema.json). | Require the pass decision, score floors, zero critical defects, prepress validity, immutable hashes, and all repository checks. The model cannot publish or waive a gate. |

This repository existed before Build Week. The storefront, manual merch tools,
and early commerce/provider paths are prior work; the judged post-July-13 delta
is the reliable weekly Codex/GPT-5.6 loop, its state and safety model, renderer
quality work, fixtures/tests, scheduled-task workflow, and submission evidence.
See [provenance and judged delta](docs/build-week/provenance-delta.md) for the
baseline and dated commit record.

### Reproduce the weekly path

From a clean checkout with Node.js 22 or 24:

```bash
npm ci

# Check submission files, fixture presence, secrets, and Git provenance
npm run submission:verify

# Credential-free synthetic decision path; no catalog or asset mutation
npm run merch:weekly:demo -- --dry-run --week 2026-W30

# Full synthetic local preparation; still never releasable
npm run merch:weekly:demo -- --week 2026-W30

# Live X and GPT-5.6 decision path; requires local credentials
npm run merch:weekly -- --list-id 2067819170989854863 --count 30 --dry-run

# Inspect a run and print its release plan without external mutation
npm run merch:weekly:status -- --week 2026-W30
npm run merch:weekly:release -- --week 2026-W30
```

The synthetic fixture is deliberately non-releasable. Its non-dry command
intentionally changes the local manifest and generates assets, so run that
rehearsal in a disposable clean checkout; run `submission:verify` against the
untouched submission checkout. Production preparation requires a clean
dedicated checkout and live X plus live model provenance, but still never
commits, pushes, deploys, mutates Printful, publishes a product, enables
checkout, or creates an order. Release additionally requires the literal
`--release` flag, a kill switch, unchanged approved hashes, a non-default
branch, pilot/legal/commerce configuration, and
`PRINTFUL_AUTO_CONFIRM=false`. It also requires an explicit deployment provider;
the Vercel path binds a token, scope, and project ID to each exact candidate or
final commit before the existing public URL probes run.

The exact role prompts and strict schemas are public in
[`scripts/prompts`](scripts/prompts) and
[`merch/weekly/schemas`](merch/weekly/schemas). Start with the
[`Build Week submission index`](docs/build-week/README.md) for architecture,
automation, demo, provenance, judge access, rights, evidence, and the owner
checklist. The credential-free sample data is documented in
[`fixtures/x/README.md`](fixtures/x/README.md).

## Commerce infrastructure

1. Provision separate Neon databases or branches for staging and production.
2. Set `DATABASE_URL` and run `npm run db:migrate` once per environment.
3. Install the Inngest Vercel integration and set its event/signing keys.
4. Configure Stripe Checkout and a signed webhook at `/api/stripe/webhook`.
5. Configure a valid Printful Manual order/API store token.
6. Keep `PRINTFUL_AUTO_CONFIRM=false` through the pilot.
7. Configure a Vercel WAF fixed-window rule for `POST /api/checkout`: 10
   requests per IP per 60 seconds. Do not apply this rule to Stripe or Inngest
   webhook routes.
8. Set reviewed policy/contact, tax, country, and shipping values, then set
   `STOREFRONT_LEGAL_APPROVED=true`,
   `STOREFRONT_TAX_SHIPPING_APPROVED=true`, and finally
   `CHECKOUT_ENABLED=true`.

Required variables and fail-closed defaults are documented in `.env.example`.
No shipping address is stored in the application database; the fulfillment
worker retrieves it from the paid Stripe session and sends it to Printful.

## Order operations

```bash
npm run orders:inspect -- <order-id-or-CM-reference>
npm run orders:retry -- <order-id-or-CM-reference>
npm run orders:reconcile -- <order-id-or-CM-reference>
```

See `docs/production-runbook.md` for the staging smoke test, monitoring, and
rollback sequence.

## Merch pipeline

```bash
npm run merch:new -- "Product title"
npm run merch:research:x -- --slug <slug> --dry-run
npm run merch:art-director:review -- --slug <slug>
npm run merch:generate-artwork -- --slug <slug>
npm run merch:compose-print-files -- --slug <slug>
npm run merch:catalog:mockups -- --slug <slug>
npm run merch:printful:upsert -- --slug <slug> --site-url https://your-public-domain.example
npm run merch:mockups -- --slug <slug> --site-url https://your-public-domain.example
npm run merch:photoshoot -- --slug <slug>
npm run merch:printful:verify -- --slug <slug>
npm run merch:fulfillment:order:dry-run -- --slug <slug>
npm run merch:publish -- --slug <slug> --approve --by <name>
```

Publication requires research sources, a rights note, approval, provider
readiness, complete sync-variant mappings, and—on AOP cotton garments—the
prescribed customer photoshoot. Upstream artifact changes invalidate approval
and provider synchronization rather than silently leaving stale approvals.
