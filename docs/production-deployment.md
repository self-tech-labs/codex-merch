# Production deployment guide

This guide is the release contract for `ritsl/codex-merch`. It deliberately
keeps checkout disabled until the merchant, tax, policy, payment, database,
worker, and fulfillment checks have all passed. Secret values belong in the
provider dashboards and Vercel, never in Git, issues, PR text, or screenshots.

## Repository and provider status on 2026-07-21

- Vercel project `ritsl/codex-merch` is linked to this GitHub repository;
  `main` is the Production Branch and the runtime is Node.js 24.
- `codex-rate-reset-long-sleeve` is the designated pilot. It is published in
  the catalog, has sanitized live-X research metadata, and its three immutable
  Printful sync-variant IDs pass the live repository verifier.
- The Printful token and configured Manual order/API store work. The pilot's
  existing provider product uses the legacy external ID `codex-rate-reset`;
  the code accepts that declared catalog alias without creating a duplicate.
- The configured Stripe credential is a sandbox key. The account audit showed
  that live charges and payouts are not enabled, so it cannot accept real
  payments yet. The sandbox webhook also needs
  `checkout.session.async_payment_failed` added to its event selection.
- The Vercel project already has Inngest keys and some preview-era provider
  variables, but it does not yet have the complete production runtime contract
  below. Updating a Vercel variable requires a new deployment before the value
  is used.

## Release topology

Use isolated provider state:

| Environment | Stripe | Database | Inngest | Printful | Checkout |
| --- | --- | --- | --- | --- | --- |
| Local | sandbox | local/test | dev | no mutation | disabled unless explicitly testing |
| Staging | sandbox | dedicated staging branch/database | dedicated environment | same Manual/API store, drafts only | enabled for test payments |
| Production | live | dedicated production database | production environment | same Manual/API store, drafts first | enabled last |

For staging, use a Vercel custom environment or branch-scoped Preview
variables. Do not put sandbox values into the Production scope, and do not put
live Stripe values into Preview.

## 1. Record the owner decisions first

Before changing any approval flag to `true`, record the responsible reviewer,
date, and decision for all of the following:

1. Merchant legal identity, support email, statement descriptor, and payout
   bank account.
2. Commercial rights to the store name, product text, artwork, mockups, and
   Printful assets. Resolve the open branding and license items in
   `docs/build-week/asset-and-rights.md`.
3. The exact pilot countries, product price, Printful base cost, expected
   fulfillment tax, shipping charge, Stripe fees, refund exposure, and minimum
   margin.
4. Reviewed shipping, returns, privacy, terms, and contact text. The text must
   match the actual merchant, territories, made-to-order process, refund
   practice, Stripe data flow, and Printful data flow.
5. Tax registrations and collection method. This is a merchant/tax-adviser
   decision, not a deployment default.

Keep `STOREFRONT_MODE=preview`, `CHECKOUT_ENABLED=false`, and every approval
flag `false` until these decisions are complete.

## 2. Provision and migrate Postgres

1. In Neon, create separate staging and production branches or projects.
2. Copy each pooled Postgres connection string. Require TLS, normally with
   `sslmode=require`, and never reuse the staging database in production.
3. Add the staging URL only to the staging Vercel environment and the
   production URL only to Production as `DATABASE_URL`.
4. From the repository root, run the migration against staging first. Paste
   the exact staging Neon pooled URL when prompted; the input is hidden and is
   not written to a file or shell history:

   ```zsh
   read -r -s 'MIGRATION_DATABASE_URL?Paste the target DATABASE_URL (input hidden): '
   printf '\n'
   (
     export DATABASE_URL
     printf -v DATABASE_URL '%s' "$MIGRATION_DATABASE_URL"
     npm run db:migrate
   )
   unset MIGRATION_DATABASE_URL
   ```

   Repeat the same command with the production Neon pooled URL only after the
   staging migration succeeds. Use the same URLs stored in the corresponding
   Vercel environments. Do not rely on a previously exported `DATABASE_URL`.
   Vercel CLI 47 does not have `vercel env run`, and Sensitive Vercel values
   cannot be read back for a local migration; retain the original URLs in Neon
   or an approved password manager.
5. Confirm that `orders`, `order_items`, `stripe_events`, and
   `schema_migrations` exist. The application never stores a shipping address;
   it stores order totals, statuses, product snapshots, and provider IDs.

## 3. Connect Inngest

1. In the Inngest dashboard, create distinct staging and production
   environments.
2. Install the official Inngest Vercel integration for the `codex-merch`
   project, or manually copy the environment-specific Event Key and Signing
   Key.
3. In Vercel, verify `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` are scoped
   to their matching environments.
4. Set production `INNGEST_SERVE_ORIGIN` to the canonical HTTPS site origin,
   for example `https://codex-merch.vercel.app`.
5. Redeploy, then confirm that `/api/inngest` syncs the
   `fulfill-paid-order` function and that its maximum duration is 300 seconds.
6. If staging has Vercel Deployment Protection, configure the Inngest
   protection bypass; do not make unrelated Preview deployments public.

## 4. Finish the Printful merchant setup

1. In Printful, use **Stores → Connect via API** to create a Manual order/API
   store. The configured `codex-merch-new` store is already this native store
   type.
2. In the Printful Developer Portal, create a private token for a single store.
   It needs `orders` and `sync_products` read/write access. Add only additional
   scopes used by an operator workflow, and note the token expiry date.
3. Set a primary billing method and configure the Printful Wallet/auto-recharge
   so a confirmed order cannot fail merely because fulfillment funds are
   unavailable.
4. Verify store currency, return address, packing-slip identity, product
   availability, production region, and shipping coverage for every country in
   `STRIPE_ALLOWED_SHIPPING_COUNTRIES`.
5. Keep `PRINTFUL_AUTO_CONFIRM=false` for launch. A paid order will create one
   Printful draft; an operator must inspect and confirm it in Printful. This
   prevents an address, price, or print-file mistake from immediately entering
   production.
6. Verify the pilot from a credentialed local environment:

   ```bash
   npm run merch:printful:verify -- --slug codex-rate-reset-long-sleeve
   npm run merch:fulfillment:order:dry-run -- --slug codex-rate-reset-long-sleeve
   ```

   The first command must report `ok: true`, product ID `436601984`, and three
   available sync variants. The second command must show `confirm: false` and
   must not create an order.
7. Place a Printful sample order before launch and inspect the physical print,
   garment, sizes, labels, packaging, and delivery time.
8. If artwork or product configuration changes, deploy the immutable files
   first, then run `merch:printful:upsert`, regenerate/download mockups, rerun
   verification, and reapprove the product. Do not upsert merely to rename the
   existing legacy external ID; the catalog alias is intentionally supported.

## 5. Activate and configure Stripe

1. Complete Stripe account activation: merchant/business details,
   representative verification, bank account, support details, public website,
   statement descriptor, and any requested documents. Do not proceed until
   live charges and payouts are enabled.
2. In **Workbench → API keys**, create or rotate the production server secret.
   Put the `sk_live_…` value only in Vercel Production as
   `STRIPE_SECRET_KEY`. The application does not use a publishable key because
   it redirects to Stripe-hosted Checkout.
3. In **Settings → Payment methods**, enable only the payment methods the
   merchant supports. The code intentionally lets Stripe dynamically select
   eligible methods rather than hard-coding card types.
4. Decide shipping. Use exactly one of these configurations:

   - Create a live-mode Stripe Shipping Rate in USD and set its live `shr_…`
     ID as `STRIPE_SHIPPING_RATE_ID`; or
   - Set `STRIPE_FLAT_SHIPPING_AMOUNT` to an approved integer number of USD
     cents, such as `1200` for USD 12.00.

   Do not set both. Sandbox Shipping Rate IDs cannot be used with a live key.
   A single flat rate is only appropriate if it covers every enabled country;
   otherwise narrow the pilot territory before launch.
5. Decide tax before setting `STRIPE_AUTOMATIC_TAX`:

   - Set `true` only after the merchant has completed applicable tax/VAT/GST
     registrations in Stripe Tax and set the physical-goods and shipping tax
     codes; or
   - Set `false` only after the merchant has approved another compliant tax
     treatment.

6. In live mode, create a Workbench event destination with this exact HTTPS
   URL:

   `https://<canonical-domain>/api/stripe/webhook`

   Select **Account** events, use API version `2026-06-24.dahlia`, and subscribe
   to exactly:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`

7. Reveal that live endpoint's unique `whsec_…` signing secret and store it in
   Vercel Production as `STRIPE_WEBHOOK_SECRET`. A sandbox endpoint and a live
   endpoint have different secrets even when their URLs match.
8. Leave the Vercel variable `STRIPE_API_VERSION` unset or remove it. The SDK
   version is deliberately pinned and type-checked in code; that variable is
   not read.

## 6. Add Vercel Production variables

Open **Vercel → ritsl → codex-merch → Settings → Environment Variables**.
Add secrets as Sensitive where supported, select **Production only**, and use
the table below. Configure staging separately with sandbox/provider staging
values. Keep the source value of every Sensitive variable in its provider or
an approved password manager: after creation, Vercel does not reveal it again.

| Variable | Production value or rule |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical HTTPS origin only, no path; initially `https://codex-merch.vercel.app` unless a custom domain is ready |
| `STOREFRONT_MODE` | `preview` until the final launch step, then `production` |
| `DATABASE_URL` | Production pooled Postgres URL with TLS |
| `CHECKOUT_ENABLED` | `false` until the final launch step, then `true` |
| `MERCH_PILOT_APPROVED` | `false` until the owner records the pilot approval, then `true` |
| `STOREFRONT_LEGAL_APPROVED` | `false` until policy/rights review, then `true` |
| `STOREFRONT_TAX_SHIPPING_APPROVED` | `false` until tax/shipping review, then `true` |
| `STOREFRONT_CONTACT_EMAIL` | Monitored merchant support address |
| `STOREFRONT_SHIPPING_POLICY` | Reviewed customer-facing shipping text |
| `STOREFRONT_RETURNS_POLICY` | Reviewed customer-facing returns/refund text |
| `STOREFRONT_PRIVACY_POLICY` | Reviewed customer-facing privacy text |
| `STOREFRONT_TERMS_POLICY` | Reviewed customer-facing sales terms |
| `STOREFRONT_CONTACT_POLICY` | Reviewed support/contact instructions |
| `STRIPE_SECRET_KEY` | Rotated `sk_live_…` production secret |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the live event destination |
| `STRIPE_ALLOWED_SHIPPING_COUNTRIES` | Explicit approved comma-separated ISO codes; start with the smallest supported pilot territory |
| `STRIPE_SHIPPING_RATE_ID` | Live `shr_…` rate; set this or the flat amount, never both |
| `STRIPE_FLAT_SHIPPING_AMOUNT` | Integer USD cents; set this or the rate ID, never both |
| `STRIPE_AUTOMATIC_TAX` | Explicitly `true` or `false` according to the recorded tax decision |
| `PRINTFUL_TOKEN` | Single-store private token with the required scopes |
| `PRINTFUL_STORE_ID` | `18277037` for the currently verified Manual/API store |
| `PRINTFUL_AUTO_CONFIRM` | `false` for the production pilot |
| `PRINTFUL_MAX_RETRIES` | `3` |
| `PRINTFUL_RETRY_BASE_MS` | `1000` |
| `PRINTFUL_TIMEOUT_MS` | `10000` |
| `PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS` | `false` |
| `INNGEST_EVENT_KEY` | Production Inngest Event Key |
| `INNGEST_SIGNING_KEY` | Production Inngest Signing Key |
| `INNGEST_SERVE_ORIGIN` | Same canonical origin as `PUBLIC_SITE_URL` |

`NODE_ENV`, `VERCEL`, and `VERCEL_ENV` are Vercel system values; do not create
or override them. `OPENAI_API_KEY`, X variables, weekly-release variables, and
`VERCEL_TOKEN` are operator/automation credentials, not required for customer
checkout. Scope them separately and do not grant the deployed storefront a
deployment token unless the weekly production release workflow is enabled.

After saving variables, trigger a new deployment. Existing deployments retain
their previous environment values.

## 7. Configure the checkout rate limit

In **Vercel → codex-merch → Firewall → Configure**, create a custom rule:

1. Conditions: request method equals `POST` and request path equals
   `/api/checkout`.
2. Action: Rate Limit.
3. Strategy: Fixed Window; key by IP; 10 requests per 60 seconds; respond 429.
4. Start in Log mode during staging, inspect legitimate checkout traffic, then
   enable enforcement and Publish the firewall change.

Do not apply this rule to `/api/stripe/webhook` or `/api/inngest`; those
services implement their own authentication/retry behavior.

## 8. Prove the complete staging path

1. Use branch-scoped Preview or a custom staging environment with
   `STOREFRONT_MODE=production`, `CHECKOUT_ENABLED=true`, a Stripe sandbox key
   and sandbox webhook secret, the staging database, staging Inngest keys, and
   `PRINTFUL_AUTO_CONFIRM=false`.
2. Run the migration, deploy, and request:

   ```text
   GET /api/readiness?product=codex-rate-reset-long-sleeve
   ```

   Require HTTP 200, `ready: true`, `paymentMode: test`, database readiness,
   Stripe readiness, and `printfulAutoConfirm: false`.
3. Place a Stripe sandbox order using a test address in an allowed country.
4. Verify exactly one local order, one processed Stripe event, one successful
   Inngest run, and one Printful draft whose `external_id` is the Checkout
   Session ID.
5. Verify the success page shows the local `CM-…` reference and removes only
   the purchased cart lines.
6. Resend the same Stripe event and rerun the same Inngest event. Confirm that
   neither creates a second Printful order.
7. Exercise expiration, async-payment failure, refund, and a forced transient
   fulfillment failure. Verify retry and reconciliation with the commands in
   `docs/production-runbook.md`.
8. Cancel/delete the staging draft in Printful before it is confirmed.

## 9. Launch production

1. Merge the reviewed PR to `main` while Production still has
   `STOREFRONT_MODE=preview` and `CHECKOUT_ENABLED=false`.
2. Confirm the production deployment is healthy, policies show the final text,
   the database migration is present, Inngest is synced, the Printful live
   verifier passes, and the live Stripe event destination is enabled.
3. Record owner approval, then set `MERCH_PILOT_APPROVED=true`,
   `STOREFRONT_LEGAL_APPROVED=true`, and
   `STOREFRONT_TAX_SHIPPING_APPROVED=true`.
4. Set `STOREFRONT_MODE=production` and, last, `CHECKOUT_ENABLED=true`.
   Redeploy once so both final values become active together.
5. Call the readiness endpoint again and require `paymentMode: live`.
6. Place one controlled live pilot purchase. Confirm the Stripe payment, local
   order, processed webhook, Inngest run, and single Printful draft before
   manually confirming production in Printful.
7. Keep manual Printful confirmation until multiple real orders, refunds,
   retries, address formats, shipping costs, and margins have been reviewed.
   Changing `PRINTFUL_AUTO_CONFIRM=true` is a separate operational decision.

## 10. Rollback

Set `CHECKOUT_ENABLED=false` and redeploy first. Existing paid orders can still
finish through Inngest. If fulfillment itself must stop, pause the Inngest
function rather than deleting orders or Stripe events. Use the inspection,
retry, and reconciliation commands in `docs/production-runbook.md` after the
provider or configuration problem is fixed.

## Primary provider references

- [Vercel environments and variable scopes](https://vercel.com/docs/environment-variables)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Stripe Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe webhook setup and signature verification](https://docs.stripe.com/webhooks)
- [Stripe Tax registrations](https://docs.stripe.com/tax/registering)
- [Printful API authentication, scopes, products, and orders](https://developers.printful.com/docs/)
- [Printful Manual order/API stores](https://help.printful.com/hc/en-us/articles/23581702148764-How-do-I-create-and-use-a-manual-order-API-store)
- [Printful billing and Wallet behavior](https://help.printful.com/hc/en-us/articles/360014007680-How-does-the-Printful-billing-system-work)
- [Inngest on Vercel](https://www.inngest.com/docs/deploy/vercel)
