# Owner checklist

Submission deadline: **2026-07-22 02:00 CEST** (2026-07-21 17:00 PDT). Complete the Devpost registration and create a draft submission immediately; do not wait for the implementation to finish.

## Identity, eligibility, and submission

- [ ] Register the entrant/team on Devpost; appoint an authorized team representative if applicable; and confirm age, Switzerland eligibility, employer permission, absence of conflicts, and compliance with the official rules.
- [ ] Select **Work & Productivity**.
- [ ] Add the final project name, short description, repository, live URL, and public YouTube URL.
- [ ] Keep the video below three minutes with spoken English audio explaining Codex and GPT-5.6; use no copyrighted music, third-party artwork, or marks beyond authorized/nominative references.
- [x] Submit `/feedback` without logs for the primary Codex build task and record session ID `019f7fb1-9352-7b30-ac89-076c94b2eeeb` in this pack; paste it into Devpost.
- [ ] Verify judges receive free access and no production payment is required.
- [ ] Submit before the deadline and save the confirmation URL/time.
- [ ] Keep the repository, application, and video available through at least 2026-08-12.
- [ ] Freeze the submitted links and judged commit at the deadline; do not imply that later portfolio updates were part of the judged submission.

## Git and provenance

- [x] Create and push the annotated `pre-build-week-2026` tag at `6de6ea7`.
- [x] Put Build Week work on `codex/build-week-weekly-studio` without backdating commits.
- [x] Separate judged features from unrelated cleanup and generated-file churn.
- [ ] Fill `provenance-delta.md` with real commit SHAs, CI evidence, and the submission SHA.
- [ ] Fill `evidence/README.md` with the exact final SHA, sanitized run, deployment, checkout, and replay proof.
- [x] Add an MIT code license plus an explicit asset-license boundary; repository visibility/judge invitations remain an owner account action.
- [ ] If private, invite `testing@devpost.com` and `build-week-event@openai.com` with sufficient read access.
- [ ] Confirm the submitted repository URL resolves to the exact judged commit.

## Branding, content, and commerce approval

- [x] Record the owner's Build Week decision to retain the fan-made Codex premise for a time-limited jury pilot and add a prominent global “fan-made / not official OpenAI merchandise / no affiliation” disclosure. This decision is competition-specific and is not represented as an OpenAI trademark licence.
- [ ] Confirm redistribution terms for Printful templates and third-party reference screenshots; remove or separately fetch anything that cannot be licensed in the submission repository.
- [ ] Complete `asset-and-rights.md`, including the historical-asset inventory and code/content license or private-repository decision.
- [ ] Confirm the submission is owned by the entrant/team and that every team contribution, dependency, API, data source, provider asset, and integration is used under applicable terms.
- [ ] Review generated text and images for copied X language, usernames, screenshots, likenesses, team marks, and protected brand references.
- [ ] Add merchant identity/contact, shipping, returns, privacy, terms, and contact policies.
- [x] Owner approved the jury pilot contract requested in this task: CH/US delivery, CHF 58.00 product, CHF 9.10 flat shipping, inclusive pricing with automatic tax off, manual Printful draft confirmation, and no separate VAT gate for this competition pilot.
- [ ] Keep real sales disabled until live Stripe, production database, Inngest, webhook, jury-code, expiry, and deployed-readiness checks pass.
- [ ] Use `MERCH_PILOT_APPROVED=true` only for the signed first-product launch. Complete and review that live pilot before separately setting `MERCH_EXPANSION_APPROVED=true`; without the expansion flag, a weekly release stops before publishing another product.

## Accounts and local secrets

Never paste secret values into Git, Codex chat, logs, screenshots, or this documentation.

- [x] Reuse the existing local `OPENAI_API_KEY` for the initial build.
- [x] Confirm OpenAI API access with live GPT-5.6 art-direction and actual-render critic calls; monitor billing and rate limits during any additional demo run.
- [ ] Confirm `X_BEARER_TOKEN` can call the list-post endpoint for list `2067819170989854863` and that use of the selected posts is authorized.
- [x] Confirm the current `PRINTFUL_TOKEN` and `PRINTFUL_STORE_ID` have read access to the Manual order/API store and exact pilot mapping; billing, merchant settings, product safety, and the physical sample remain production owner actions.
- [ ] Add a live Stripe secret and live webhook secret as Vercel Sensitive Production variables; verify RITSL live charges/payouts and the endpoint before opening the optional jury pilot.
- [ ] Confirm the Production Neon database exists and contains every migration.
- [ ] Confirm Production Inngest event/signing keys and served function URL.
- [ ] Verify `codex-merch` is linked to this Git repository under Vercel scope `ritsl`; install a least-privilege `VERCEL_TOKEN`; configure `MERCH_DEPLOY_PROVIDER=vercel`, `MERCH_VERCEL_SCOPE`, `MERCH_VERCEL_PROJECT_ID`, production environment variables, canonical `PUBLIC_SITE_URL`, and the checkout WAF rule.
- [x] `.gitignore` excludes `.env.*` variants while retaining `.env.example`; verify no secret-bearing env file is tracked before submission.
- [x] Keep reviewed merchant policy copy version-controlled in `app/lib/merchant-policy.ts`; set the matching `STOREFRONT_CONTACT_EMAIL` and `STOREFRONT_POLICY_VERSION` in each deployment environment.
- [x] Keep `CHECKOUT_ENABLED=false` for the submitted Preview. The separate canonical pilot additionally requires a private jury code and unexpired sales window before checkout can render or execute.

Expected secret/configuration names include:

```text
OPENAI_API_KEY
X_BEARER_TOKEN
DATABASE_URL
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
INNGEST_EVENT_KEY
INNGEST_SIGNING_KEY
PRINTFUL_TOKEN
PRINTFUL_STORE_ID
PRINTFUL_AUTO_CONFIRM
PUBLIC_SITE_URL
STOREFRONT_MODE
MERCH_DEPLOY_PROVIDER
MERCH_VERCEL_SCOPE
MERCH_VERCEL_PROJECT_ID
VERCEL_TOKEN
MERCH_WEEKLY_RELEASE_ENABLED
MERCH_PILOT_APPROVED
MERCH_EXPANSION_APPROVED
CHECKOUT_ENABLED
JURY_SALES_ENABLED
JURY_ACCESS_CODE
JURY_SALES_END_AT
STOREFRONT_LEGAL_APPROVED
STOREFRONT_TAX_SHIPPING_APPROVED
STOREFRONT_CONTACT_EMAIL
STOREFRONT_POLICY_VERSION
STRIPE_SHIPPING_RATE_ID or STRIPE_FLAT_SHIPPING_AMOUNT
STRIPE_ALLOWED_SHIPPING_COUNTRIES
STRIPE_AUTOMATIC_TAX
INNGEST_SERVE_ORIGIN
```

Secret presence is not production proof. Treat provider publication and checkout
as outside the Build Week Preview until each credential is verified in its
target environment and the legal, tax, shipping, webhook, migration, retry, and
rollback checks pass. Do not weaken Preview safety because a variable happens
to be present.

## Build Week Preview proof

- [x] Run the sanitized 30-post fixture and one authorized live-list read.
- [x] Show a `no_trend` run and a successful candidate run.
- [x] Run catalog validation, tests, typecheck, lint, build, production audit, and browser tests in CI; Preview branch run `29825394859` passed an 11-product catalog, 133/133 tests, and 12/12 browser checks while the explicit owner-input gate remains open.
- [x] Trigger one owner-supplied trend from ordinary Codex chat and preserve its truthful provenance, generated panels, critic result, prepress result, and visible catalog candidate.
- [x] Push the judged implementation commit to a non-production branch, record the Vercel Preview URL and deployment SHA, then test through its account-free scoped link on desktop and mobile.
- [x] Verify the Preview exposes `/how-it-works`, keeps every product non-purchasable, and hard-blocks Stripe, Printful, order, and Inngest mutations.
- [ ] Record the exact tested commands and final SHA in `evidence/README.md`.

## Optional Build Week jury-pilot proof

- [ ] Run the release command once in staging with its explicit `--release` flag, weekly release kill switch, pilot approval, non-default branch, clean expected worktree, public HTTPS URL, and `PRINTFUL_AUTO_CONFIRM=false`.
- [ ] Verify both deployments, all public asset URLs, one Printful product, complete variant mappings, provider mockups, and one published catalog entry.
- [ ] Complete a Stripe test payment and verify exactly one Neon order, one processed webhook event, one Inngest run, and one Printful draft.
- [x] Obtain a read-only U.S. Printful estimate for the exact signed M sync variant; on 2026-07-21 it returned CHF 39.29 estimated provider cost and no order was created.
- [x] Require the private jury code on the server before any local order or Stripe session; set expiry to `2026-08-06T00:00:00Z`; unit tests and rendered local QA verify wrong/missing codes return a generic HTTP 403.
- [ ] Probe the canonical deployment and require HTTP 200, `ready: true`, `paymentMode: live`, `salesAudience: OpenAI Build Week judges`, `accessCodeRequired: true`, and CH/US shipping before sharing the pilot.
- [ ] Replay the same webhook, fulfillment event, and weekly run ID and confirm no duplicate product, publication, or order.
- [ ] Verify a repeated scheduled task treats a current-week `published` run as a no-op and never re-enters prepare; verify retries after provider sync and after the final push use stage-appropriate hashes before enabling unattended release.

## Codex Desktop automation

- [x] Create the standalone `Codex Merch Weekly Prepare` task using `automation-prompt.md` and the repository-owned `codex-merch-weekly` skill.
- [x] Use the clean local project checkout and schedule preparation Monday at 09:00 `Europe/Zurich`; this preserves the ignored run ledger and candidate for release.
- [x] Create the separate `Codex Merch Weekly Release` local task in a paused, owner-gated state.
- [x] Trigger the preparation path manually with the configured X credential and preserve the sanitized 30-post `no_trend` result for the demo.
- [ ] Ensure the Mac is powered on, networked, and running Codex Desktop at execution time.
- [ ] Pre-authorize only the commands and credentials needed by the task; unattended tasks cannot stop for approval.
- [x] Start in prepare-only mode with the release task paused.
- [ ] Enable the release task and kill switch only after staging sign-off.
- [ ] Configure `planned`, `prepared`, `no_trend`, `published`, `quarantined`, `failed`, and `release_failed` notifications without secret values.
