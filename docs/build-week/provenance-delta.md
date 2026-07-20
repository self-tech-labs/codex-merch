# Provenance and judged delta

## Pre-Build-Week baseline

- Baseline commit: `6de6ea7e2e19e3762d691d0861553e0f2c9f02d1` (`Add codex rate reset long sleeve`)
- Commit date: 2026-06-04
- Baseline branch at audit: `codex/rate-reset-long-sleeve`
- Annotated local baseline tag: `pre-build-week-2026` (created 2026-07-20 CEST)

The baseline already contained a React Router storefront, a JSON product manifest, manual merch CLI stages, an X recent-search adapter, rule-based AOP validation, OpenAI image generation, Printful product tooling, and a Stripe checkout/fulfillment path. These pre-existing capabilities must not be presented as Build Week work.

At the initial 2026-07-20 audit, no Git ref contained a commit dated after 2026-07-13. The worktree also contained substantial uncommitted and untracked work. Git cannot establish when uncommitted work was authored, so only truthful, dated commits made during the event should appear in the judged-delta table.

## Meaningful post-July-13 extension

The intended judged extension is the reliable autonomous loop, not the existence of a merch storefront:

- exact 30-post ingestion from an authorized X list, with a replayable fixture;
- one GPT-5.6 Structured Outputs call for trend detection and evidence-aware `no_trend` decisions;
- GPT-5.6 generation of three materially distinct, panel-aware garment recipes;
- visual evaluation with bounded fallback across at most two ranked candidates using the actual rendered assets;
- a resumable run ledger, prompt/input/output hashes, locks, and provider idempotency;
- a two-phase local Codex Desktop automation with explicit release authority;
- guarded public catalog publication followed by separately testable Stripe Checkout and durable fulfillment;
- submission fixtures, tests, documentation, and an inspectable Codex task history.

## Judged commits

Fill this table from Git after each cohesive commit. Do not backdate, amend away useful history, or include unrelated cleanup.

| Date (CEST) | Commit | Build Week delta | Verification |
| --- | --- | --- | --- |
| 2026-07-20 | `1e10977` | GPT-5.6 trend decision; garment recipes; deterministic renderer/prepress; visual critic; resumable prepare/release; commerce; automation; submission package | 116 tests pass, one DB integration test skipped; typecheck, lint, build, and 6/6 E2E pass |
| 2026-07-20 | `7fd90c3` | Removed 38 audited orphaned Shopify/demo files and about 30 MiB of unreferenced legacy merch assets | Full verification repeated after cleanup |

## Evidence to preserve

- Primary Codex task/session ID: **TODO**
- `/feedback` session ID: **TODO**
- Submission commit SHA: **TODO**
- Sanitized example run directory: `docs/build-week/evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json` and `docs/build-week/evidence/weekly-run-2026-W30-live-no-trend.json`
- Duplicate-free replay result: W30 terminal replay returned `idempotentReplay: true`
- CI run URL: **TODO**
- Production deployment URL and immutable deployment ID: **TODO**

The example run should retain sanitized normalized signal metadata, prompt/schema hashes, GPT-5.6 structured decisions, garment recipes, critic results, asset hashes, provider references, candidate/final deployment IDs, sanitized immutable deployment URLs and commit bindings, and the final publication result. Preserve dashboard screenshots or API summaries as separate submission evidence without exposing the Vercel token. Never commit API keys, customer data, private X content, or raw third-party media.
