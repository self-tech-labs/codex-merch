# Production runbook

Complete [`production-deployment.md`](production-deployment.md) and every hard
blocker in [`merchant-signoff.md`](merchant-signoff.md) before operating real
checkout. The launch pilot is RITSL Elliot Vaucher, Switzerland only, CHF 58.00
per garment plus CHF 9.10 shipping (CHF 67.10 final one-item total, including
any applicable tax), customer-policy version `2026-07-21`, and manual Printful
draft confirmation.

## Non-negotiable production state

- Until prelaunch controlled-test authorization: `STOREFRONT_MODE=preview`,
  `CHECKOUT_ENABLED=false`, `MERCH_PILOT_APPROVED=false`,
  `MERCH_EXPANSION_APPROVED=false`,
  `STOREFRONT_LEGAL_APPROVED=false`, and
  `STOREFRONT_TAX_SHIPPING_APPROVED=false`.
- The only pre-final-sign-off exception is the owner-IP-restricted live-test
  window described below. It permits the three pilot approval flags and
  checkout to be enabled only for the single controlled order; it does not
  authorize public access. If the test fails or is aborted, reset checkout and
  all three approval flags to `false`; retain production mode only long enough
  to reconcile an already-paid order, then return it to `preview`.
- Throughout the pilot: `STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH`, exactly one CHF
  shipping setting, `STOREFRONT_POLICY_VERSION=2026-07-21`, and
  `PRINTFUL_AUTO_CONFIRM=false`.
- `MERCH_EXPANSION_APPROVED=false` remains separate from first-pilot launch
  authority and blocks publication of additional sellable products.
- Written OpenAI permission for the exact paid tangible merchandise or a
  completed neutral rebrand is a hard gate. A disclaimer is not permission.
- The owner/accountant must record the VAT conclusion across all RITSL
  activities. The absence of a VAT number in a public register is not, by
  itself, tax sign-off.

## Staging gate

1. Use Stripe test mode, a dedicated Neon branch, a dedicated Inngest
   environment, CH/CHF settings, and `PRINTFUL_AUTO_CONFIRM=false`.
2. Confirm `npm run merch:printful:verify -- --slug
   codex-rate-reset-long-sleeve` returns `ok: true` for Printful product
   `436601984` and all three sync variants. Run the fulfillment dry-run and
   require top-level draft intent `confirm: false`, no `confirm` field in the
   request body, no `confirm=1` query, and no created order.
3. Confirm the published pilot remains CHF 58.00, approved for the exact
   immutable assets/variant mappings, and policy version `2026-07-21` is
   visible on deployed shipping, returns, privacy, terms, and contact pages.
4. Complete one Swiss-address Stripe test payment for CHF 58.00 plus CHF 9.10.
   Verify the policy disclosure, `receipt_email`, the receipt preview, and a
   Dashboard test receipt to a verified test-account email. Automatic test
   receipts are not generally delivered; prove automatic delivery with the
   controlled live order.
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

## Prelaunch controlled-test check

Before setting any approval flag to `true`, the operator verifies and records:

1. OpenAI's written authorization covering the final product/name/artwork and
   paid Swiss sale, or evidence of the completed neutral rebrand.
2. Owner/accountant all-RITSL VAT conclusion and the matching Stripe Tax choice.
3. Stripe RITSL KYC, live charges, live payouts, payout account, public details,
   supported payment methods, receipt email, live key, and live webhook health.
4. Printful billing/Wallet, return address, packing slip, product availability,
   safety/label information, claim workflow, merchant-paid Swiss import and
   clearance treatment, physical sample, and current quotes for M/L/XL.
5. Production database migration, Inngest sync, firewall rule, canonical HTTPS
   origin, RITSL policy/contact pages, and the successful staging evidence.
6. `STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH`, CHF 9.10 live shipping, and
   `PRINTFUL_AUTO_CONFIRM=false` in the effective deployment.
7. The processor/DPA, subprocessor, processing-country, transfer-safeguard,
   retention, and access-control review for every provider named in the privacy
   notice.

The owner then completes the prelaunch controlled-test authorization in
`merchant-signoff.md`. Temporarily restrict `POST /api/checkout` to the owner's
test IP, change the three approval flags to `true`, set
`STOREFRONT_MODE=production`, and set `CHECKOUT_ENABLED=true` last. Redeploy and
require the readiness probe to show live payment mode before placing the one
authorized live purchase. The owner signs the separate final public-launch
approval only after that purchase passes; only then may the checkout IP
restriction be removed.

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
`STOREFRONT_MODE=production` and `PRINTFUL_AUTO_CONFIRM=false`. Every production
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
ORDER_OPERATIONS_TARGET=production NODE_ENV=production ORDER_OPERATIONS_EXPECTED_DATABASE='your-production-pooler-host/neondb' STOREFRONT_MODE=production PRINTFUL_AUTO_CONFIRM=false npm run orders:reconcile -- <CM-reference> --production
```

Use `ORDER_OPERATIONS_TARGET=staging` without `--production` for the isolated
staging providers, and set `ORDER_OPERATIONS_EXPECTED_DATABASE` to the staging
host/name. Cloud retry/reconcile still requires `NODE_ENV=production` so
Inngest uses the keyed cloud environment rather than local dev mode; reconcile
also uses `STOREFRONT_MODE=production` and `PRINTFUL_AUTO_CONFIRM=false`. Never
mix a live Stripe key, Production Inngest key, or Production database with a
staging target.

## Per-order pilot operation

For each new paid order:

1. Confirm Stripe shows a successful live CHF payment and the customer received
   confirmation. Never rely on a screenshot or customer message alone.
2. Confirm the local order/reference and successful signed webhook event.
3. Confirm one successful Inngest run and exactly one Printful **draft** with
   `external_id` equal to the order's `CM-…` public reference.
4. Compare recipient country (`CH`), deliverable address, variant, quantity,
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
  the pilot. Track realized Printful/Stripe cost against the CHF 23.29 dated
  planning contribution.
- Logs use order references and provider IDs only. Do not log customer email,
  address, raw webhook body, payment details, credentials, or identity files.

## Recovery

- Inspect with the guarded target command above.
- After correcting a transient/configuration issue:
  use the guarded `orders:retry` command. It accepts only a paid order whose
  local fulfillment state is `failed`.
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
   decision limits RITSL's customer obligation.
4. Apply the published voluntary 14-day return option to eligible unused,
   unworn, unwashed, non-personalized goods. Obtain authorization before a
   return, charge customer return postage for change-of-mind cases, and keep
   every mandatory defect remedy unaffected.
5. Issue refunds from Stripe against the correct charge and verify customer
   notification. The signed webhook records cumulative partial/full refund
   amounts, blocks unconfirmed fulfillment for manual review, and attempts to
   cancel a full-refund Printful draft. Verify the local and provider states;
   never create a second charge to “reverse” an error.
6. On a dispute, preserve order confirmation, policy acceptance, delivery,
   tracking, and support evidence; respond within Stripe's deadline and disable
   checkout if fraud or configuration appears systemic.

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
