# Judge access

Complete this page before submission. Do not put passwords, API keys, test customer data, or private X content in the repository.

## Links

- Judge Preview base alias: [https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app](https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app)
- Judge access: the branch alias is public and requires no Vercel account, login, or access token.
- Public YouTube demo: **owner action required before submission: upload the verified master and paste the public URL here and in Devpost**
- Optional real-merch pilot: [https://codex-merch.vercel.app](https://codex-merch.vercel.app) — fan-made, unofficial merch; private jury code supplied only in Devpost testing instructions; delivery to CH/US; no purchase required to judge the project
- Verified local upload master: [`video/out/codex-merch-signal-to-product-1080p.mp4`](../../video/out/codex-merch-signal-to-product-1080p.mp4) — 2:51, 1920×1080/30 fps, H.264/AAC, 39 caption cues, AI disclosure, market-example disclaimer, and privacy review included
- Repository finalized implementation: [`self-tech-labs/codex-merch` at `8017b9f`](https://github.com/self-tech-labs/codex-merch/tree/8017b9f0a28b9918e03b345d0cf669ebdd75998b). The owner-triggered reference feature begins at `42fd968`; copy the final pushed descendant SHA into Devpost.
- Sanitized example weekly runs: [`evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json`](evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json) and [`evidence/weekly-run-2026-W30-live-no-trend.json`](evidence/weekly-run-2026-W30-live-no-trend.json)
- Submission evidence index: [`evidence/README.md`](evidence/README.md)
- Current Preview branch CI: [GitHub Actions run `29825394859`](https://github.com/self-tech-labs/codex-merch/actions/runs/29825394859) — install, migration, catalog validation, tests, typecheck, lint, build, production audit, and Playwright passed; only the intentional owner-input/submission-document gate failed
- Support contact for judges: `elliot@ritsl.com`

## Access model

- Application login required: **No**
- Payment mode: **Disabled in the submitted Preview. The separate optional pilot accepts live payment only when public readiness reports `paymentMode: live` and the private jury code and time window pass**
- External fulfillment: **Disabled in the submitted Preview. A paid optional pilot order creates one unconfirmed Printful draft for manual review; the required judge path creates none**
- X input: **sanitized 30-post fixture by default; authorized live list read demonstrated separately**
- Expected browser/device support: **Chromium desktop and Pixel 7 mobile profiles; 12/12 current checks passed locally and against the public Vercel Preview on 2026-07-21**

If the repository remains private, grant read access to both:

- `testing@devpost.com`
- `build-week-event@openai.com`

## Suggested judge path

1. Open the public Preview and select **Solward Index Cotton Sweatshirt**.
2. Inspect its catalog, front, back, pattern, technique, price, and public rights note. Confirm the action says Preview only and remains disabled.
3. Open `/how-it-works` from the primary navigation. Follow the five-stage signal → direction → render → proof → release loop and inspect the four repository seams designed to be replaced.
4. Review the commercial thesis, then compare the safe Preview with the explicitly authorized production path. Named fashion groups are market examples, not claimed customers or partners.
5. Open the sanitized example run to inspect GPT-5.6 Structured Outputs, the selected recipe, actual-render critic, deterministic gate results, and hashes. It must not include raw private X text.
6. Optional: use the privately supplied jury code on the canonical pilot to purchase the signed physical product. This is fan-made, unofficial merchandise and is never required for testing or evaluation.

## Expected limitations

- Payments and fulfillment remain outside the submitted Build Week Preview. The optional code-protected jury pilot is separate; its `/api/readiness` response is the only source of truth for whether live payment is currently available.
- A weekly run may validly return `no_trend`; the sanitized successful fixture exists so the complete judged path remains reproducible.
- Owner-supplied trends are explicitly marked as such, contain no invented X evidence, and are ineligible for unattended weekly production release.
- The local Codex Desktop automation requires Elliot’s Mac to be powered on with Codex running. The example run and video remain available if the scheduled machine is offline during judging.

## Pre-submission access check

- [x] Test the public Preview link and critical routes in fresh desktop and mobile browser contexts.
- [x] Confirm the submitted branch contains setup instructions and sanitized sample data.
- [x] Confirm the embedded-secret scan is clean and no customer data, raw private post content, or inaccessible local path appears in the judge path.
- [x] Confirm product actions and checkout remain disabled in the submitted Preview.
- [x] Confirm the canonical pilot fails closed unless the jury flag, private code, expiry, signed product, provider mappings, live payment mode, database, webhook, and fulfillment dependencies all pass.
- [x] Confirm `/how-it-works` accurately distinguishes demonstrated Preview behavior from production-only integrations.
- [x] Verify the local upload master has audio, is under three minutes, decodes fully, and passes the visual privacy review.
- [ ] Verify the uploaded YouTube video is public and preserves the final audio, captions, thumbnail, and description.
- [ ] Verify private-repository invitations from both judge accounts were accepted or are pending with correct access, or make the repository public under the recorded code/asset license split.
- [ ] Put the jury access code only in Devpost's private testing instructions. Never commit it, place it in the video, or show it on the public site.
