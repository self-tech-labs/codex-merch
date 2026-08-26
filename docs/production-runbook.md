# Production runbook

Complete [`production-deployment.md`](production-deployment.md), close every
runtime blocker, and record current owner approval before operating real
checkout. The signed catalog currently permits the Codex Rate Reset Long Sleeve
Tee at CHF 58.00 and ten cotton sweatshirts at CHF 88.00 for public sale to
Switzerland and the United States. Shipping is CHF 9.10 once per order, making
the respective one-item totals CHF 67.10 and CHF 97.10, including any
applicable tax. Customer-policy version `2026-08-26` and manual Printful draft
confirmation apply to all eleven products. It is an independent, fan-made
project, not official OpenAI merchandise and not affiliated with, authorized,
sponsored, approved, or endorsed by OpenAI.

## Non-negotiable production state

- Until current public-checkout authorization: `STOREFRONT_MODE=preview`,
  `CHECKOUT_ENABLED=false`, `MERCH_PILOT_APPROVED=false`,
  `MERCH_EXPANSION_APPROVED=false`,
  `STOREFRONT_LEGAL_APPROVED=false`, and
  `STOREFRONT_TAX_SHIPPING_APPROVED=false`.
- Vercel Production requires `STRIPE_EXPECTED_MODE=live` and an `sk_live_…`
  secret. Checkout rejects a key whose mode differs, and the webhook rejects an
  event whose `livemode` value differs from the configured payment mode.
- Throughout live sales: `STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH,US`, exactly one
  approved CHF shipping setting, `STOREFRONT_POLICY_VERSION=2026-08-26`, and
  `PRINTFUL_AUTO_CONFIRM=false`.
- `MERCH_EXPANSION_APPROVED=false` remains separate from signed-catalog launch
  authority and blocks publication of additional sellable products.
- Persistent fan-made/not-official and non-affiliation disclosures are
  mandatory. The owner must separately review brand, tax, shipping, policy,
  product, and physical-sample risk before enabling public checkout.

## Staging gate

1. Use Stripe test mode, a dedicated Neon branch, a dedicated Inngest
   environment, `STRIPE_EXPECTED_MODE=test`, CH/US and CHF settings, and
   `PRINTFUL_AUTO_CONFIRM=false`.
2. For every slug in `merch/merchant-jury-catalog.json`, run
   `npm run merch:printful:verify -- --slug <slug>` and the fulfillment dry-run.
   Require `ok: true`, the exact signed Printful product and variant mappings,
   top-level draft intent `confirm: false`, no `confirm` field in the request
   body, no `confirm=1` query, and no created order.
3. Confirm all eleven published products retain their signed CHF 58.00 or CHF
   88.00 prices and exact immutable assets/variant mappings, and policy version
   `2026-08-26` is visible on deployed shipping, returns, privacy, terms, and
   contact pages.
4. Complete a CH- or US-address Stripe test payment containing both a CHF 58.00
   and a CHF 88.00 signed product. Verify the CHF 146.00 subtotal, single CHF
   9.10 shipping charge, CHF 155.10 total, each selected variant, policy
   disclosure, `receipt_email`, receipt preview, and a Dashboard test receipt
   to a verified test-account email. Automatic test receipts are not generally
   delivered; prove automatic delivery with a controlled live order.
5. Verify exactly one local order, one processed webhook event, one successful
   Inngest run, one unconfirmed Printful draft, a verified `CM-…` success page,
   and removal of only purchased cart lines.
6. Compare the draft's address, size, print files, retail amount, and current
   cost with the customer order. Do not confirm the draft.
7. Replay the Stripe event and Inngest function. Neither may create a duplicate
   local order or Printful draft.
8. Exercise expiration, asynchronous failure, refund, dispute state, a forced
   transient Printful failure, retry, and reconciliation. Cancel the test
   draft and save only sanitized evidence.

## Prelaunch public-checkout check

Before setting any approval flag to `true`, the operator verifies and records
these non-mutating prerequisites:

1. Current owner approval for public sale, the signed catalog, fan-brand/tax/
   shipping/sample risk, policy `2026-08-26`, and the persistent
   non-affiliation/no-rights/takedown disclosures.
2. Stripe merchant-account KYC, live charges, live payouts, payout account,
   public details, supported payment methods, receipt email, live key, and live
   webhook health.
3. Printful billing/Wallet, return address, packing slip, CH/US availability,
   safety/label information, claim workflow, and current quotes for M/L/XL.
4. Production database migration, Inngest sync, firewall rule, canonical HTTPS
   origin, current policy/contact pages, and the successful staging evidence.
5. `STRIPE_EXPECTED_MODE=live`, a matching `sk_live_…` key and live endpoint
   secret, `STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH,US`, CHF 9.10 live shipping,
   and `PRINTFUL_AUTO_CONFIRM=false` in the effective deployment.
The owner then records a current public-checkout authorization, changes the
catalog, legal, and tax/shipping approval flags to `true`, sets
`STOREFRONT_MODE=production`, sets `STRIPE_EXPECTED_MODE=live`, and sets
`CHECKOUT_ENABLED=true` last. Redeploy and require the readiness probe to return
HTTP 200 with `ready: true`, `paymentMode: live`, database, Stripe account,
Stripe webhook, and Printful checks true, CH/US territory, CHF 9.10 shipping,
policy `2026-08-26`, and
`printfulAutoConfirm: false`.

While the launch window remains restricted, complete one controlled live
Checkout and prove the final amount, required terms consent, receipt, signed
live-mode webhook, local order, Inngest event, and exactly one unconfirmed
Printful draft before wider availability. If any result differs, immediately
set `CHECKOUT_ENABLED` and the approval flags back to `false`, redeploy, and
reconcile the paid order before proceeding.

## Secure production operator shell

Never use `vercel env run`, `vercel env pull`, or a repository `.env` file for
production order commands. Vercel Sensitive values are intentionally not a
secret-retrieval mechanism. Launch each command through the approved password
manager's ephemeral environment injection using values copied from the
provider/source of truth, and close that shell when finished.

Set the non-secret guards `ORDER_OPERATIONS_TARGET=production`,
`NODE_ENV=production`, and `ORDER_OPERATIONS_EXPECTED_DATABASE` to the exact
sanitized Production Neon `<hostname>/<database>` value (for example,
`ep-example-pooler.eu-central-1.aws.neon.tech/neondb`). Reconcile also requires
`PRINTFUL_AUTO_CONFIRM=false`. Every production
command requires the explicit `--production` argument. Before its first query,
the script compares the actual URL host/name to
`ORDER_OPERATIONS_EXPECTED_DATABASE` and fails closed on any mismatch; its
successful target line contains no credentials. In Neon's SQL editor,
independently verify `current_database()` and `current_user` for the same
branch. Required injected secrets are:

- inspect: Production pooled `DATABASE_URL`;
- retry: Production pooled `DATABASE_URL` and Production
  `INNGEST_EVENT_KEY`;
- reconcile: Production pooled `DATABASE_URL`, live `STRIPE_SECRET_KEY`,
  Production `INNGEST_EVENT_KEY`, and—when a provider order exists—the
  single-store `PRINTFUL_TOKEN` and matching `PRINTFUL_STORE_ID`.

With those values injected, use:

```bash
ORDER_OPERATIONS_TARGET=production NODE_ENV=production ORDER_OPERATIONS_EXPECTED_DATABASE='your-production-pooler-host/neondb' npm run orders:inspect -- <CM-reference> --production
ORDER_OPERATIONS_TARGET=production NODE_ENV=production ORDER_OPERATIONS_EXPECTED_DATABASE='your-production-pooler-host/neondb' npm run orders:retry -- <CM-reference> --production
ORDER_OPERATIONS_TARGET=production NODE_ENV=production ORDER_OPERATIONS_EXPECTED_DATABASE='your-production-pooler-host/neondb' PRINTFUL_AUTO_CONFIRM=false npm run orders:reconcile -- <CM-reference> --production
```

Use `ORDER_OPERATIONS_TARGET=staging` without `--production` for the isolated
staging providers, and set `ORDER_OPERATIONS_EXPECTED_DATABASE` to the staging
host/name. Cloud retry/reconcile still requires `NODE_ENV=production` so
Inngest uses the keyed cloud environment rather than local dev mode; reconcile
also requires `PRINTFUL_AUTO_CONFIRM=false`. Never
mix a live Stripe key, Production Inngest key, or Production database with a
staging target.

## Per-order operation

For each new paid order:

1. Confirm Stripe shows a successful live CHF payment and the customer received
   confirmation. Never rely on a screenshot or customer message alone.
2. Confirm the local order/reference and successful signed webhook event.
3. Confirm one successful Inngest run and exactly one Printful **draft** with
   `external_id` equal to the order's `CM-…` public reference.
4. Compare recipient country (`CH` or `US`), deliverable address, variant, quantity,
   CHF retail amount, print files, current Printful cost, and contribution.
   Contact the customer before confirmation if an address or selection is
   ambiguous.
5. Manually confirm the draft only when all values match and billing funds are
   available. Immediately use the guarded production
   `orders:reconcile` command above so the local order records Printful's
   submitted/committed state. Record the provider order ID without copying
   customer data into logs or Git.
6. Monitor fulfillment, capture tracking, and send/verify customer updates.
   Escalate production or delivery exceptions promptly.

Never enable `PRINTFUL_AUTO_CONFIRM=true` merely to clear an order backlog.

## Monitoring

- Alert on Stripe event-destination failures and `/api/stripe/webhook` 5xx.
- Alert on failed Inngest runs and local `fulfillment_status = 'failed'`.
- Monitor Printful 401, 429, 5xx, billing, inventory, and address-validation
  failures separately.
- Monitor Vercel checkout/webhook/Inngest error rate and latency, Neon
  availability/connection pressure, and readiness-probe failures.
- Reconcile Stripe paid sessions, local orders, and Printful drafts daily during
  live sales. Track realized Printful/Stripe cost against the CHF 23.29 dated
  planning contribution.
- Logs use order references and provider IDs only. Do not log customer email,
  address, raw webhook body, payment details, credentials, or identity files.

## Recovery

- Inspect with the guarded target command above.
- After correcting a transient/configuration issue:
  use the guarded `orders:retry` command. It accepts a paid or partially
  refunded order whose local fulfillment state is `queued` or `failed`.
  Partial refunds are discounts in this workflow, so retry only when the
  complete original order should still ship unchanged.
- If Stripe is paid but local state did not advance:
  use the guarded `orders:reconcile` command.
- Before any retry, inspect Stripe, local state, Inngest, and Printful for an
  existing draft. Idempotency keys protect the normal path, but the operator
  still verifies that no provider-side manual duplicate exists.
- If the Printful quote, item, shipping, tax, or address differs materially,
  leave the draft unconfirmed, disable checkout if systemic, and resolve the
  discrepancy before charging or confirming another order.

## Returns, defects, delivery, and disputes

1. Authenticate the order using its `CM-…` reference and Stripe/customer
   details without asking for full payment-card data.
2. Record issue date, type, affected item, tracking, and photographs when
   relevant. Keep evidence in the approved support system, not the repository.
3. For a misprint, damage, defect, wrong item, or lost shipment, open the
   Printful claim inside its applicable deadline and preserve the customer's
   mandatory Swiss warranty rights. Do not promise that Printful's internal
   decision limits the merchant's customer obligation.
4. Apply the published voluntary 14-day return option to eligible unused,
   unworn, unwashed, non-personalized goods. Obtain authorization before a
   return, charge customer return postage for change-of-mind cases, and keep
   every mandatory defect remedy unaffected.
5. Issue refunds from Stripe against the correct charge and verify customer
   notification. The signed webhook records cumulative partial/full refund
   amounts. A partial refund is treated as a discount and the complete original
   order continues to fulfillment, so issue one only when every original item
   should still ship unchanged. A full refund stops unconfirmed fulfillment and
   attempts to cancel its Printful draft. Verify the local and provider states;
   never create a second charge to “reverse” an error.
6. On a dispute, preserve order confirmation, policy acceptance, delivery,
   tracking, and support evidence; respond within Stripe's deadline and disable
   checkout if fraud or configuration appears systemic. An active or
   under-review dispute stops new fulfillment; leave any existing Printful
   draft unconfirmed. A `won`, `warning_closed`, or `prevented` result restores
   or requeues eligible fulfillment, while `lost` cancels any still-cancellable
   draft. A fully refunded order remains refunded and must not be reopened by a
   later dispute event. After every terminal result, compare Stripe, local, and
   Printful state—especially when a recovery draft was canceled—and reconcile
   any mismatch before further fulfillment.

## Security and privacy incidents

1. Disable checkout and rotate the affected provider credential immediately if
   a secret may be exposed. Redeploy and verify old credentials are revoked.
2. Pause Inngest if continued fulfillment could disclose data or create bad
   drafts. Do not delete audit/order records during investigation.
3. Minimize customer-data access and record who handled the incident. Follow
   the versioned privacy policy and applicable Swiss notification duties;
   obtain legal/privacy advice when exposure is material.
4. Restore one integration at a time, reconcile paid orders, and complete a
   controlled test before reopening.

## Rollback and reopening

Set `CHECKOUT_ENABLED=false` and redeploy first. Existing paid orders may still
finish through the durable worker. If fulfillment itself must stop, pause the
Inngest function; do not delete local orders or Stripe events.

After the cause is fixed, reconcile every payment and draft created during the
incident, rerun readiness and staging-level checks, record the owner reopening
decision, and only then set `CHECKOUT_ENABLED=true` and redeploy. Keep
`PRINTFUL_AUTO_CONFIRM=false`.
