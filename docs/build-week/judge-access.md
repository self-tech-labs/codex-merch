# Judge access

Complete this page before submission. Do not put passwords, API keys, test customer data, or private X content in the repository.

## Links

- Public application: [https://codex-merch.vercel.app](https://codex-merch.vercel.app); replace this with the exact submitted Vercel Preview URL after the final branch deployment
- Public YouTube demo: **TODO: URL**
- Repository and qualified app commit: [`self-tech-labs/codex-merch` at `d44913b`](https://github.com/self-tech-labs/codex-merch/tree/d44913b0738e8537c1986bb7734b41d7a4858243); final submission SHA remains to be recorded
- Sanitized example weekly runs: [`evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json`](evidence/weekly-run-2026-W37-fixture-live-gpt56-prepared.json) and [`evidence/weekly-run-2026-W30-live-no-trend.json`](evidence/weekly-run-2026-W30-live-no-trend.json)
- Submission evidence index: [`evidence/README.md`](evidence/README.md)
- Qualification CI result: [GitHub Actions run `29779894993`](https://github.com/self-tech-labs/codex-merch/actions/runs/29779894993) — every functional gate passed; the final strict submission verifier remains blocked on owner-supplied evidence
- Support contact for judges: **TODO: email**

## Access model

- Application login required: **No**
- Payment mode: **Disabled in the submitted Preview; no payment form or real charge**
- External fulfillment: **Disabled in the submitted Preview; no Printful product or order is created by the judge path**
- X input: **sanitized 30-post fixture by default; authorized live list read demonstrated separately**
- Expected browser/device support: **Chromium desktop and mobile profiles; local suite verified, submitted Vercel Preview verification pending the final push**

If the repository remains private, grant read access to both:

- `testing@devpost.com`
- `build-week-event@openai.com`

## Suggested judge path

1. Open the public Preview and select **Solward Index Cotton Sweatshirt**.
2. Inspect its catalog, front, back, pattern, technique, price, and public rights note. Confirm the action says Preview only and remains disabled.
3. Open `/how-it-works` from the primary navigation. Follow the owner-supplied trend path and the weekly 30-post X path into their shared art-direction, renderer, critic, and prepress stages.
4. Compare Preview and Production on that page. The former stops after a branch deployment; the latter adds explicit provider publication and commerce gates.
5. Open the sanitized example run to inspect GPT-5.6 Structured Outputs, the selected recipe, actual-render critic, deterministic gate results, and hashes. It must not include raw private X text.

## Expected limitations

- Payments, Printful synchronization, and fulfillment are outside the submitted Build Week Preview. They are implemented as fail-closed production adapters but are not claimed as live proof.
- A weekly run may validly return `no_trend`; the sanitized successful fixture exists so the complete judged path remains reproducible.
- Owner-supplied trends are explicitly marked as such, contain no invented X evidence, and are ineligible for unattended weekly production release.
- The local Codex Desktop automation requires Elliot’s Mac to be powered on with Codex running. The example run and video remain available if the scheduled machine is offline during judging.

## Pre-submission access check

- [ ] Test every link in a signed-out browser window.
- [ ] Confirm the submitted commit contains setup instructions and sample data.
- [ ] Confirm no secret, customer data, private post content, or inaccessible local path appears in the judge path.
- [ ] Confirm product actions and checkout remain disabled in the submitted Preview.
- [ ] Confirm `/how-it-works` accurately distinguishes demonstrated Preview behavior from production-only integrations.
- [ ] Verify the video is public, has audio, and is under three minutes.
- [ ] Verify private-repository invitations from both judge accounts were accepted or are pending with correct access.
