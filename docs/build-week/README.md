# Build Week submission index

## Project record

- Project name: **Codex Merch**
- One-line pitch: Tell Codex a team trend—or let its weekly X-list reader find one—and receive an original, production-ready garment in an inspectable storefront Preview.
- Category: **Work & Productivity**
- Entrant: **Elliot Vaucher**
- Country: Switzerland
- Judge Preview: [`codex-build-week-weekly-studio` branch alias](https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app) — open the scoped Vercel Shareable Link supplied privately in Devpost; the repository never stores its access token
- Source repository: [`self-tech-labs/codex-merch` at owner-triggered Preview commit `42fd968`](https://github.com/self-tech-labs/codex-merch/tree/42fd968d66985bd41793b20ea7ead1ac29f4c8ec)
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

The judged Preview exposes a direct Codex Desktop path that does not depend on
a scheduled automation: the owner says “Create a preview merch for the trend
‘The Sol Shines’.” The repository skill records an owner-supplied trend contract
without inventing social evidence, creates three garment directions, renders
the selected six-panel system, critiques the actual output, validates prepress,
updates the catalog, and makes the candidate available to a Vercel Preview. It
remains visibly non-purchasable.

The same application has a production intake designed for a two-phase Codex
Desktop scheduled task:

1. Request the latest 30 posts from an authorized X list, require exactly 30 valid normalized records, preserve a private reproducible signal snapshot, and use one GPT-5.6 Structured Outputs call to return either a recurring, rights-safe trend or `no_trend`.
2. Normalize the approved trend into the same contract used by the direct Preview path; turn it into three garment recipes, render and evaluate production assets, then optionally release through guarded deployments, Printful synchronization, and final catalog publication. A separately configured user checkout can exercise Stripe, Neon, Inngest, and Printful draft fulfillment; none of those systems is enabled for the judged Preview.

Codex owns orchestration, repository changes, validation, release reporting, and recovery. GPT-5.6 performs the judgment-heavy trend decision, art-direction, and visual-evaluation steps. Deterministic code owns templates, rendering, variant mappings, price, publication gates, and run/provider idempotency. The configured OpenAI image model is used later for the customer photoshoot.

## Truthful readiness matrix

This table records the 2026-07-21 Preview scope. Replace a blocked or partial
entry only after preserving the cited evidence at the submission commit.

| Capability | Implemented | Local or automated evidence | Live external proof |
| --- | --- | --- | --- |
| Exact 30-post input, recurring-trend gate, and `no_trend` | Yes | Synthetic fixtures, unit coverage, and [`weekly-run-2026-W30-live-no-trend.json`](evidence/weekly-run-2026-W30-live-no-trend.json) | Verified live X list read: 30 unique posts, 13 authors, integrity hashes matched; the signal correctly ended `no_trend` at 15/72 |
| GPT-5.6 trend and three-recipe Structured Outputs | Yes | [`weekly-run-2026-W37-fixture-live-gpt56-prepared.json`](evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json) records fixture input with live GPT-5.6 and three eligible renderer-bound recipes | Live X W30 decision used `gpt-5.6-sol`; no recipe call was warranted after the trend gate failed |
| Deterministic rendering, prepress, actual-render critic, and rollback | Yes | The W37 sanitized bundle records exact placement/prepress results and an accepted 88/100 fallback candidate; 130 tests run, with 129 passing and one database test skipped | Candidate one was quarantined; candidate two passed without weakening thresholds |
| Direct Codex prompt to visible Preview merch | Yes | [`owner-trend-preview-live-gpt56-dry-run.json`](evidence/owner-trend-preview-live-gpt56-dry-run.json) records a live three-direction GPT-5.6 dry run; Solward replays idempotently as the full six-panel reference candidate | Vercel deployment `dpl_EeYdVHVtecJjKQBWfGFan2M3Mca2`, bound to `42fd968`; 10/10 desktop/mobile browser checks passed through its scoped Shareable Link |
| Codex Desktop weekly operation | Skill, prompts, the active local `Codex Merch Weekly Prepare` automation, and the paused owner-gated release automation are implemented | Clean-checkout offline prepare, live-X `no_trend`, and terminal `idempotentReplay: true` are preserved | First live manual prepare completed on 2026-07-20; scheduled release remains intentionally paused |
| Git/deployment/Printful production release state machine | Implemented, outside judged Preview | Plan-only, recovery, deployment-binding, and provider-idempotency tests pass; fixtures and owner-supplied trends are deliberately non-releasable | Not claimed as a live Build Week proof; provider and owner approval gates remain closed |
| Stripe, Neon, Inngest, and Printful draft purchase path | Implemented, outside judged Preview | Unit coverage verifies server-side pricing, webhook signatures, immutable order snapshots, idempotency, and fail-closed configuration | Checkout is intentionally disabled for judging; no payment or fulfillment claim is made |

## Implemented boundary

- A direct owner-trend preparation explicitly skips X ingestion and the trend-discovery model call. It records owner-supplied provenance, then reuses the downstream GPT-5.6 art director and visual critic plus deterministic rendering and prepress. Its `generated` product can appear only as a non-purchasable Preview and cannot enter the production weekly release state machine.
- A Preview deployment is a repository build of the generated manifest and immutable assets on a non-production branch. It does not call Printful, create a Stripe session, enable checkout, change a product to `published`, or run Inngest.
- `npm run merch:weekly -- --dry-run` reads the input and, when a trend passes, produces the trend decision plus three art-director-ordered recipes. Every recipe carries the exact approved trend phrase as hero copy and uses a distinct aesthetic world, type system, pattern, layout, and sleeve story. A weak signal still ends successfully at `no_trend`. Dry-run does not render assets or create a release plan.
- `npm run merch:weekly` requires a clean checkout for a production-style run, writes only local candidate manifest/assets, preserves the art director's order, and performs prepress plus advisory actual-render review across at most two candidates. Only critical rights or production defects override the creative choice. It then runs catalog validation, tests, typecheck, lint, and a production build. It ends at `prepared`, `no_trend`, `quarantined`, or `failed` and performs no Git push, deployment, Printful mutation, catalog publication, or order creation.
- `npm run merch:weekly:release` is plan-only unless both literal `--release` authority and `MERCH_WEEKLY_RELEASE_ENABLED=true` are present. Live release also requires live-X/live-model provenance, `PRINTFUL_AUTO_CONFIRM=false`, deliberate pilot approval, checkout/legal/tax approval flags, a non-default branch, unchanged approved hashes, expected worktree changes, a public HTTPS site, an explicit deployment provider (plus Vercel token/scope/project when selected), working OpenAI/Printful/Stripe credentials, database and Inngest configuration, merchant policies/contact, and an approved shipping rate.
- Release makes the product `published`, verifies its public page and provider mapping, and polls a no-order `/api/readiness` probe that validates the deployed product/variant and fail-closed checkout configuration. This does not create or prove a live Stripe session, signed webhook, durable Inngest run, or Printful order draft; that customer path remains a separate staging proof.
- The scheduled task must inspect the current ISO-week status before calling prepare. Treat `published`, `no_trend`, and `quarantined` as terminal no-ops, reuse an existing `prepared` run, and route every partial release state—`releasing_candidate`, `pushing_candidate`, `waiting_candidate_deployment`, `syncing_provider`, `finalizing_publication`, `pushing_final`, `awaiting_final_deployment`, or `release_failed`—through same-run inspection/recovery instead of preparation. Stage-aware retry behavior remains a required staging test before unattended release is enabled.

## Reproduce and inspect

Use Node.js 22 or 24 from a clean checkout:

```bash
npm ci

npm run submission:verify

# Direct Build Week path: one owner-supplied trend, no claimed X evidence
npm run merch:trend-preview -- --trend "Compiler Summer" \
  --context "A team joke about fast builds arriving with warm weather" --dry-run

# Full direct preparation: writes a generated, non-sellable catalog candidate
npm run merch:trend-preview -- --trend "The Sol Shines"

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

The direct command requires `OPENAI_API_KEY` and uses GPT-5.6 for art direction
and actual-render critique. Its normalized input hash makes an identical retry
idempotent. It records zero X evidence, keeps every variant non-sellable, and is
hard-blocked from provider synchronization and production publication.

The sample posts are entirely synthetic and documented in
[`fixtures/x/README.md`](../../fixtures/x/README.md). A non-dry prepare changes
the local manifest and assets; use a disposable checkout when reproducing a new
candidate and run `submission:verify` against the untouched submission checkout.
Never add `--release` while following this reproduction path.

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
