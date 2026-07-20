# Judge access

Complete this page before submission. Do not put passwords, API keys, test customer data, or private X content in the repository.

## Links

- Live application: **TODO: public HTTPS URL**
- Public YouTube demo: **TODO: URL**
- Repository and submission commit: **TODO: URL and SHA**
- Sanitized example weekly run: **TODO: repository path or URL**
- Submission evidence index: [`evidence/README.md`](evidence/README.md)
- CI result: **TODO: URL**
- Support contact for judges: **TODO: email**

## Access model

- Application login required: **TODO: no, or document a free judge account delivery method outside Git**
- Payment mode: **TODO: verify Stripe test mode on the submitted deployment; no real charge**
- External fulfillment: **TODO: verify one Printful draft is created and `PRINTFUL_AUTO_CONFIRM=false` prevents confirmation**
- X input: **sanitized 30-post fixture by default; authorized live list read demonstrated separately**
- Expected browser/device support: **TODO: verified desktop and mobile browsers**

If the repository remains private, grant read access to both:

- `testing@devpost.com`
- `build-week-event@openai.com`

## Suggested judge path

Follow steps 1–5 only after the corresponding links and Stripe test path above
are verified. If an external step remains blocked, use the sanitized fixture and
evidence index and do not represent it as a live integration.

1. Open the live catalog and select the Build Week drop.
2. Inspect the garment views, technique, price, variant availability, and public rights note. The current product page does not expose the private trend rationale, critic score, or run ledger.
3. Select an available variant and enter Stripe test Checkout using Stripe’s documented test-payment method.
4. Return to the verified success page and inspect the non-sensitive order reference.
5. Open the separately linked sanitized example run to inspect the 30-post metadata, GPT-5.6 structured decisions, generated recipe, critic result, release gates, and duplicate-free replay. It must not include raw private X text.

## Expected limitations

- Real payments and Printful order confirmation remain disabled during judging unless the owner records separate legal, tax, shipping, and operational approval.
- A weekly run may validly return `no_trend`; the sanitized successful fixture exists so the complete judged path remains reproducible.
- The first release deployment exposes only the candidate's exact static asset URLs for Printful; automated weekly candidates are absent from storefront listings and product routes until the final `published` manifest is deployed with an available Printful mapping.
- The local Codex Desktop automation requires Elliot’s Mac to be powered on with Codex running. The example run and video remain available if the scheduled machine is offline during judging.

## Pre-submission access check

- [ ] Test every link in a signed-out browser window.
- [ ] Confirm the submitted commit contains setup instructions and sample data.
- [ ] Confirm no secret, customer data, private post content, or inaccessible local path appears in the judge path.
- [ ] Complete one fresh Stripe test checkout from the public deployment.
- [ ] Confirm the deployed checkout fails closed unless all required commerce variables and approval flags are present, then verify the configured test path creates exactly one order and one Printful draft.
- [ ] Verify the video is public, has audio, and is under three minutes.
- [ ] Verify private-repository invitations from both judge accounts were accepted or are pending with correct access.
