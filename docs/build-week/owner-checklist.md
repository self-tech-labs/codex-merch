# Owner checklist

Submission deadline: **2026-07-22 02:00 CEST** (2026-07-21 17:00 PDT). Complete the Devpost registration and create a draft submission immediately; do not wait for the implementation to finish.

## Identity, eligibility, and submission

- [ ] Register the entrant/team on Devpost; appoint an authorized team representative if applicable; and confirm age, Switzerland eligibility, employer permission, absence of conflicts, and compliance with the official rules.
- [ ] Select **Work & Productivity**.
- [ ] Add the final project name, short description, repository, live URL, and public YouTube URL.
- [ ] Keep the video below three minutes with spoken English audio explaining Codex and GPT-5.6; use no copyrighted music, third-party artwork, or marks beyond authorized/nominative references.
- [ ] Run `/feedback` in the primary Codex build task and enter its session ID in Devpost and this pack.
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
- [ ] Choose and add a code license, or keep the repository private and grant judge access.
- [ ] If private, invite `testing@devpost.com` and `build-week-event@openai.com` with sufficient read access.
- [ ] Confirm the submitted repository URL resolves to the exact judged commit.

## Branding, content, and commerce approval

- [ ] Approve a non-infringing project/store name and remove unlicensed “Codex Supply,” official OpenAI marks, and confusing affiliation claims from the repository, public demo, and sellable assets before submission.
- [ ] Confirm redistribution terms for Printful templates and third-party reference screenshots; remove or separately fetch anything that cannot be licensed in the submission repository.
- [ ] Complete `asset-and-rights.md`, including the historical-asset inventory and code/content license or private-repository decision.
- [ ] Confirm the submission is owned by the entrant/team and that every team contribution, dependency, API, data source, provider asset, and integration is used under applicable terms.
- [ ] Review generated text and images for copied X language, usernames, screenshots, likenesses, team marks, and protected brand references.
- [ ] Add merchant identity/contact, shipping, returns, privacy, terms, and contact policies.
- [ ] Approve countries, shipping rates, tax treatment, currency, pricing, and refund/fulfillment operations before enabling real checkout.
- [ ] Keep real sales disabled until legal and tax/shipping approval is recorded.
- [ ] Complete the existing pilot-product requirement before deliberately setting `MERCH_PILOT_APPROVED=true`; without it, the weekly release will stop at the publish command.

## Accounts and local secrets

Never paste secret values into Git, Codex chat, logs, screenshots, or this documentation.

- [x] Reuse the existing local `OPENAI_API_KEY` for the initial build.
- [x] Confirm OpenAI API access with live GPT-5.6 art-direction and actual-render critic calls; monitor billing and rate limits during any additional demo run.
- [ ] Confirm `X_BEARER_TOKEN` can call the list-post endpoint for list `2067819170989854863` and that use of the selected posts is authorized.
- [ ] Rotate the invalid `PRINTFUL_TOKEN`; confirm `PRINTFUL_STORE_ID`, Manual order/API store access, billing, product availability, and shipping regions.
- [ ] For a later production pilot, create or verify Stripe test-mode keys, a signed webhook, and approved shipping configuration. These are not required by the Build Week Preview.
- [ ] For a later production pilot, provision separate Neon staging/production databases and run migrations.
- [ ] For a later production pilot, create Inngest staging/production environments and configure event/signing keys and the served function URL.
- [ ] Verify `codex-merch` is linked to this Git repository under Vercel scope `ritsl`; install a least-privilege `VERCEL_TOKEN`; configure `MERCH_DEPLOY_PROVIDER=vercel`, `MERCH_VERCEL_SCOPE`, `MERCH_VERCEL_PROJECT_ID`, production environment variables, canonical `PUBLIC_SITE_URL`, and the checkout WAF rule.
- [x] `.gitignore` excludes `.env.*` variants while retaining `.env.example`; verify no secret-bearing env file is tracked before submission.
- [ ] Supply merchant contact and reviewed shipping, returns, privacy, terms, and contact policy text in the deployment environment.
- [x] Keep `CHECKOUT_ENABLED=false` for the submitted Preview. Enable it only in a later production environment after Stripe, Neon, Inngest, Printful, policy, legal, tax, and shipping staging proof passes.

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
CHECKOUT_ENABLED
STOREFRONT_LEGAL_APPROVED
STOREFRONT_TAX_SHIPPING_APPROVED
STOREFRONT_CONTACT_EMAIL
STOREFRONT_SHIPPING_POLICY
STOREFRONT_RETURNS_POLICY
STOREFRONT_PRIVACY_POLICY
STOREFRONT_TERMS_POLICY
STOREFRONT_CONTACT_POLICY
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
- [x] Run catalog validation, unit and database integration tests, typecheck, lint, build, production audit, and browser tests in CI; run `29818494790` passed the functional steps, with one browser check passing on retry, while the explicit owner-input gate remains open.
- [x] Trigger one owner-supplied trend from ordinary Codex chat and preserve its truthful provenance, generated panels, critic result, prepress result, and visible catalog candidate.
- [x] Push the judged implementation commit to a non-production branch, record the Vercel Preview URL and deployment SHA, then test through its account-free scoped link on desktop and mobile.
- [x] Verify the Preview exposes `/how-it-works`, keeps every product non-purchasable, and hard-blocks Stripe, Printful, order, and Inngest mutations.
- [ ] Record the exact tested commands and final SHA in `evidence/README.md`.

## Later production-pilot proof

- [ ] Run the release command once in staging with its explicit `--release` flag, weekly release kill switch, pilot approval, non-default branch, clean expected worktree, public HTTPS URL, and `PRINTFUL_AUTO_CONFIRM=false`.
- [ ] Verify both deployments, all public asset URLs, one Printful product, complete variant mappings, provider mockups, and one published catalog entry.
- [ ] Complete a Stripe test payment and verify exactly one Neon order, one processed webhook event, one Inngest run, and one Printful draft.
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
