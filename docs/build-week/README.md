# Build Week submission index

## Project record

- Project name: **TODO: final non-infringing name**
- One-line pitch: A Codex-operated weekly culture-to-commerce studio that turns a recurring team signal into an original, production-ready garment and a testable storefront drop.
- Category: **Work & Productivity**
- Entrant: **TODO: entrant and team-member names**
- Country: Switzerland
- Live application: **TODO: public URL**
- Source repository: **TODO: submission commit URL**
- Demo video: **TODO: public YouTube URL, under three minutes**
- Primary Codex task/session: **TODO: session ID**
- `/feedback` session ID: **TODO: feedback ID from the primary build task**
- Devpost submission: **TODO: submission URL**
- Eligibility and employer/conflict check: **TODO: confirmed by entrant**
- Brand, asset, and commercial-use clearance: **TODO: confirmed before submission, public demonstration, or live sales**

Submission deadline: **2026-07-22 02:00 CEST** (2026-07-21 17:00 PDT).

## Problem, audience, and impact

The intended users are developer-relations, internal-culture, and creative
operations teams that repeatedly translate a fast-moving team conversation into
a brief, production files, provider configuration, and a storefront launch.
Today that chain is fragmented, slow, and easy to make legally or operationally
unsafe.

The project turns it into one inspectable weekly workflow. Codex operates the
repository and recovery path; GPT-5.6 makes bounded cultural and visual
judgments; deterministic software owns evidence thresholds, originality and
rights checks, rendering, prepress, prices, variants, hashes, and publication.
The workflow can safely skip a weak week, prepare a strong concept without
external mutation, or—only after explicit owner approval—converge on one
provider product and one published storefront item.

The distinctive idea is the complete culture-to-commerce loop rather than a
standalone image generator: the same run preserves inspectable decisions,
production artifacts, deployment gates, and duplicate-safe provider state.

## What the project demonstrates

The weekly workflow is designed for a two-phase Codex Desktop scheduled task:

1. Request the latest 30 posts from an authorized X list, require exactly 30 valid normalized records, preserve a private reproducible signal snapshot, and use one GPT-5.6 Structured Outputs call to return either a recurring, rights-safe trend or `no_trend`.
2. Turn an approved trend into three garment recipes, render production assets deterministically, evaluate them, then release through guarded candidate/final Git pushes, deployment checks, Printful synchronization, and a final catalog publication. A separately configured user checkout exercises Stripe, Neon, Inngest, and Printful draft fulfillment; the weekly release never creates an order.

Codex owns orchestration, repository changes, validation, release reporting, and recovery. GPT-5.6 performs the judgment-heavy trend decision, art-direction, and visual-evaluation steps. Deterministic code owns templates, rendering, variant mappings, price, publication gates, and run/provider idempotency. The configured OpenAI image model is used later for the customer photoshoot.

## Truthful readiness matrix

This table records the 2026-07-20 audit state. Replace a blocked or partial
entry only after preserving the cited evidence at the submission commit.

| Capability | Implemented | Local or automated evidence | Live external proof |
| --- | --- | --- | --- |
| Exact 30-post input, recurring-trend gate, and `no_trend` | Yes | Synthetic 30-post and no-trend fixtures plus unit coverage; final sanitized run link is TODO | Authorized live X read is blocked pending `X_BEARER_TOKEN` |
| GPT-5.6 trend and three-recipe Structured Outputs | Yes | Live prepare-only structured calls were exercised with synthetic X input; submission-safe response metadata is TODO | A full authorized live-X run is not yet preserved |
| Deterministic rendering, prepress, actual-render critic, and rollback | Yes | Renderer, pipeline, visibility, and submission tests exist; rerun the full suite at the final SHA and attach CI | Final live multimodal candidate evidence is TODO |
| Codex Desktop weekly operation | Skill, prompts, the active local `Codex Merch Weekly Prepare` automation, and the paused owner-gated release automation are implemented | Clean-checkout offline prepare, idempotent replay, plan-only release, and `no_trend` rehearsals pass | First successful live-X manual/scheduled run is pending the owner-provided X credential |
| Git/deployment/Printful release state machine | Yes | Plan-only and state-machine tests; fixtures are deliberately non-releasable | Blocked pending valid Printful credentials, deployment setup, owner gates, and staging proof |
| Stripe, Neon, Inngest, and Printful draft purchase path | Yes | Unit/integration coverage is present; database coverage requires `TEST_DATABASE_URL` | No submitted-deployment test checkout has been verified yet |

## Implemented boundary

- `npm run merch:weekly -- --dry-run` reads the input and, when a trend passes, produces the trend decision plus three ranked recipes and ends at `planned`. A weak signal still ends successfully at `no_trend`. Dry-run does not render assets or create a release plan.
- `npm run merch:weekly` requires a clean checkout for a production-style run, writes only local candidate manifest/assets, performs prepress and actual-render critique across at most two ranked candidates, then runs catalog validation, tests, typecheck, lint, and a production build. It ends at `prepared`, `no_trend`, `quarantined`, or `failed` and performs no Git push, deployment, Printful mutation, catalog publication, or order creation.
- `npm run merch:weekly:release` is plan-only unless both literal `--release` authority and `MERCH_WEEKLY_RELEASE_ENABLED=true` are present. Live release also requires live-X/live-model provenance, `PRINTFUL_AUTO_CONFIRM=false`, deliberate pilot approval, checkout/legal/tax approval flags, a non-default branch, unchanged approved hashes, expected worktree changes, a public HTTPS site, an explicit deployment provider (plus Vercel token/scope/project when selected), working OpenAI/Printful/Stripe credentials, database and Inngest configuration, merchant policies/contact, and an approved shipping rate.
- Release makes the product `published`, verifies its public page and provider mapping, and polls a no-order `/api/readiness` probe that validates the deployed product/variant and fail-closed checkout configuration. This does not create or prove a live Stripe session, signed webhook, durable Inngest run, or Printful order draft; that customer path remains a separate staging proof.
- The scheduled task must inspect the current ISO-week status before calling prepare. Treat `published`, `no_trend`, and `quarantined` as terminal no-ops, reuse an existing `prepared` run, and route every partial release state—`releasing_candidate`, `pushing_candidate`, `waiting_candidate_deployment`, `syncing_provider`, `finalizing_publication`, `pushing_final`, `awaiting_final_deployment`, or `release_failed`—through same-run inspection/recovery instead of preparation. Stage-aware retry behavior remains a required staging test before unattended release is enabled.

## Reproduce and inspect

Use Node.js 22 or 24 from a clean checkout:

```bash
npm ci

npm run submission:verify

# Credential-free, synthetic, decision-only replay
npm run merch:weekly:demo -- --dry-run --week 2026-W30

# Full local synthetic candidate; intentionally non-releasable
npm run merch:weekly:demo -- --week 2026-W30

# Live X and GPT-5.6 decision path; requires local credentials
npm run merch:weekly -- --list-id 2067819170989854863 --count 30 --dry-run

# Inspect status and the exact plan without external mutation
npm run merch:weekly:status -- --week 2026-W30
npm run merch:weekly:release -- --week 2026-W30
```

The sample posts are entirely synthetic and documented in
[`fixtures/x/README.md`](../../fixtures/x/README.md). A non-dry prepare requires
a clean checkout and intentionally changes its local manifest/assets; use a
disposable checkout for that rehearsal and run `submission:verify` against the
untouched submission checkout. Never add `--release` while following this
reproduction path.

## Submission documents

- [Provenance and judged delta](provenance-delta.md)
- [Architecture and model roles](architecture.md)
- [Three-minute demo script](demo-script.md)
- [Codex Desktop automation prompt](automation-prompt.md)
- [Judge access](judge-access.md)
- [Asset and rights record](asset-and-rights.md)
- [Submission evidence index](evidence/README.md)
- [Owner checklist](owner-checklist.md)

## Before submitting

Replace every `TODO` in this directory with verified information. Do not invent a deployment URL, repository URL, video URL, session ID, judge credential, or post-July-13 commit. Run the repository submission verifier, update the readiness matrix, and attach a sanitized example from a verified weekly run. The submission requirements are governed by the [Build Week challenge page](https://openai.devpost.com/) and [official rules](https://openai.devpost.com/rules).
