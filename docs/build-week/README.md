# Build Week submission index

## Project record

- Project name: **Codex Merch**
- One-line pitch: A Codex-operated weekly culture-to-commerce studio that turns a recurring team signal into an original, production-ready garment and a testable storefront drop.
- Category: **Work & Productivity**
- Entrant: **Elliot Vaucher**
- Country: Switzerland
- Live application: [https://codex-merch.vercel.app](https://codex-merch.vercel.app)
- Source repository: [`self-tech-labs/codex-merch` at qualified app commit `d44913b`](https://github.com/self-tech-labs/codex-merch/tree/d44913b0738e8537c1986bb7734b41d7a4858243)
- Demo video: **TODO: public YouTube URL, under three minutes**
- Primary Codex task/session: `019f7fb1-9352-7b30-ac89-076c94b2eeeb`
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
| Exact 30-post input, recurring-trend gate, and `no_trend` | Yes | Synthetic fixtures, unit coverage, and [`weekly-run-2026-W30-live-no-trend.json`](evidence/weekly-run-2026-W30-live-no-trend.json) | Verified live X list read: 30 unique posts, 13 authors, integrity hashes matched; the signal correctly ended `no_trend` at 15/72 |
| GPT-5.6 trend and three-recipe Structured Outputs | Yes | [`weekly-run-2026-W37-fixture-live-gpt56-prepared.json`](evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json) records fixture input with live GPT-5.6 and three eligible renderer-bound recipes | Live X W30 decision used `gpt-5.6-sol`; no recipe call was warranted after the trend gate failed |
| Deterministic rendering, prepress, actual-render critic, and rollback | Yes | The W37 sanitized bundle records exact placement/prepress results and an accepted 88/100 fallback candidate; 117 tests run, with 116 passing and one database test skipped | Candidate one was quarantined; candidate two passed without weakening thresholds |
| Codex Desktop weekly operation | Skill, prompts, the active local `Codex Merch Weekly Prepare` automation, and the paused owner-gated release automation are implemented | Clean-checkout offline prepare, live-X `no_trend`, and terminal `idempotentReplay: true` are preserved | First live manual prepare completed on 2026-07-20; scheduled release remains intentionally paused |
| Git/deployment/Printful release state machine | Yes | Plan-only, recovery, deployment-binding, and provider-idempotency tests pass; fixtures are deliberately non-releasable | The public storefront is deployed from an exact Git SHA and Printful authentication is verified; unattended weekly release remains blocked by the blank release-service Vercel token and owner approval gates |
| Stripe, Neon, Inngest, and Printful draft purchase path | Yes | 117 tests run with 116 passing and one database test skipped; Neon migration applied; desktop/mobile E2E passes 8/8 locally and 8/8 against the public URL | Stripe and Inngest credentials plus legal/shipping approvals are not yet configured, so checkout correctly fails closed |

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

Resolve every remaining owner-input marker in this directory with verified information. Do not invent a deployment URL, repository URL, video URL, session ID, judge credential, or post-July-13 commit. Run the repository submission verifier, update the readiness matrix, and attach a sanitized example from a verified weekly run. The submission requirements are governed by the [Build Week challenge page](https://openai.devpost.com/) and [official rules](https://openai.devpost.com/rules).
