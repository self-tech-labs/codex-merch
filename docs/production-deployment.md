# Production deployment guide

This is the release contract for `ritsl/codex-merch`. It keeps real checkout
disabled until merchant, rights, tax, policy, payment, database, worker, and
fulfillment evidence all exists. Secret values belong in the provider
dashboards, Vercel, or an approved password manager—never Git, issues, PR
text, screenshots, or shell history.

The detailed merchant decision record is
[`merchant-signoff.md`](merchant-signoff.md). As of 2026-07-21, the truthful
production state is **not approved for real customer purchases**.

## Recorded merchant and pilot

- Merchant of record: **RITSL Elliot Vaucher**, Swiss sole proprietorship.
- Proprietor: **Elliot Richard Vaucher**.
- Registered address: **Avenue Virgile-Rossel 18, 1012 Lausanne,
  Switzerland**.
- UID: **CHE-205.406.793**; commercial-register number:
  **CH-550.1.243.579-7**.
- Customer/privacy contact: **elliot@ritsl.com**.
- Pilot: `codex-rate-reset-long-sleeve`, Switzerland delivery only, **CHF
  58.00** plus **CHF 9.10** shipping: **CHF 67.10 final customer total** for
  one item, including any applicable tax.
- Customer-policy version: **2026-07-21**.
- Printful remains manual: `PRINTFUL_AUTO_CONFIRM=false`.

The configured Printful Manual/API store and product/catalog-variant mapping
passed a credentialed, read-only verification on 2026-07-21 for product
`436601984`. Local sync IDs are `5338615120`, `5338615121`, and `5338615122`;
the upgraded verifier compared those IDs exactly with the live response and
passed on 2026-07-21 without creating or changing an order. A dated estimate
for each of M, L, and XL delivered to Lausanne was CHF 29.35 item/print, CHF
3.11 vendor tax, and CHF 9.10 shipping, or CHF 41.56 total. At a CHF 67.10 customer charge
and an illustrative Swiss-card Stripe fee of 2.9% + CHF 0.30, estimated
contribution is about CHF 23.29 before returns, disputes, discounts, and
overhead. Requote every size and verify the account's actual Stripe pricing
before launch.

## Current hard blockers

Do not turn any approval or checkout flag on until all pre-test gates below are
closed. The only exception is the owner-IP-restricted controlled-test window in
section 10: after the prelaunch authorization is signed, the three approval
flags and checkout may be enabled briefly to perform the single live purchase.
That exception never authorizes public customer access, and checkout must be
disabled again if the test does not pass.

1. **Commercial rights:** OpenAI's published brand guidance treats names,
   logos, and product identifiers as marks and prohibits putting OpenAI logos
   on tangible merchandise. The pilot uses the Codex product identifier.
   Obtain written permission covering the exact final product and paid sale,
   or neutrally rebrand and rerun the full rights/artwork review. A
   non-affiliation disclaimer alone does not grant a licence or cure this
   blocker. A ready-to-send request is in
   [`merchant-signoff.md`](merchant-signoff.md#permission-request-draft).
2. **VAT/tax:** the public UID record did not show a Swiss VAT number on
   2026-07-21. The owner/accountant must nevertheless confirm total taxable
   turnover and any expected threshold crossing across every RITSL activity,
   not merely this store, and record the resulting tax treatment.
3. **Stripe live account:** complete RITSL KYC, proprietor/representative and
   bank verification; confirm live charges and payouts; create a live key and
   live event destination; and verify customer receipt/order-confirmation
   email behavior.
4. **Printful merchant setup:** confirm billing/Wallet, return address, packing
   slip identity, CH product availability, product-safety information, claim
   handling, and manual-confirmation ownership.
5. **Physical and end-to-end evidence:** inspect a Printful sample and prove a
   sandbox checkout through Neon/Inngest to one unconfirmed Printful draft
   before opening the controlled-test window. The single live purchase is the
   final validation inside that restricted window and must pass before public
   launch approval.
6. **Registered purpose:** the current public commercial-register purpose does
   not expressly mention apparel or online retail. Confirm with the registry,
   a legal adviser, or Stripe KYC review whether it should be amended before
   systematic merchandise sales.
7. **Privacy processors/transfers:** review the actual Stripe, Printful/carrier,
   Vercel, Neon, Inngest, and support-email account terms, DPAs, subprocessors,
   processing countries, safeguards, retention, and access controls. Record the
   dated result before legal approval.

## Release topology

Use isolated provider state:

| Environment | Stripe | Database | Inngest | Printful | Checkout |
| --- | --- | --- | --- | --- | --- |
| Local | sandbox | local/test | dev | no mutation | disabled unless explicitly testing |
| Staging | sandbox | dedicated staging branch/database | dedicated environment | Manual/API store; drafts only | test payments only |
| Production | live | dedicated production database | production environment | Manual/API store; drafts only | enabled last |

For staging, use a Vercel custom environment or branch-scoped Preview
variables. Never put live Stripe values into Preview or sandbox values into
Production.

## 1. Preserve the fail-closed baseline

Before provider work, make these exact Production values effective and
redeploy:

```dotenv
STOREFRONT_MODE=preview
CHECKOUT_ENABLED=false
MERCH_PILOT_APPROVED=false
MERCH_EXPANSION_APPROVED=false
STOREFRONT_LEGAL_APPROVED=false
STOREFRONT_TAX_SHIPPING_APPROVED=false
STOREFRONT_CONTACT_EMAIL=elliot@ritsl.com
STOREFRONT_POLICY_VERSION=2026-07-21
STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH
STRIPE_FLAT_SHIPPING_AMOUNT=910
STRIPE_AUTOMATIC_TAX=false
PRINTFUL_AUTO_CONFIRM=false
PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS=false
```

Leave `STRIPE_SHIPPING_RATE_ID` unset when using the CHF 9.10 flat amount.
Setting `STRIPE_AUTOMATIC_TAX=false` here does not constitute tax approval;
`STOREFRONT_TAX_SHIPPING_APPROVED=false` remains the hard gate until the
business-wide VAT review is recorded.

## 2. Use the supported Vercel workflow

The failing command `vercel env run -e production -- npm run db:migrate` is
not valid with the installed Vercel CLI 47, which has no `env run` subcommand.
CLI 56 does provide `env run`, but it is still the wrong migration mechanism:
Sensitive values are not reliably retrievable, and running it inside this
repository can merge ignored local `.env` files over cloud values.

Prefer the Vercel dashboard for production secrets. For reproducible CLI
administration, pin the currently checked CLI and explicitly select the
project and scope:

```bash
npx --yes vercel@56.4.1 link --project codex-merch --scope ritsl
npx --yes vercel@56.4.1 env ls production --project codex-merch --scope ritsl
npx --yes vercel@56.4.1 env add VARIABLE_NAME production --project codex-merch --scope ritsl --sensitive
```

The last command prompts for the value. Omit `--sensitive` only for a
non-secret flag. If a variable already exists, inspect its scope and use the
CLI's `--force` option or the dashboard to replace that exact variable. Avoid
shell commands that put secrets in command arguments, pipes, terminal output,
or history. Do not use `env run` or `env pull` as a production-secret migration mechanism;
its behavior depends on environment/sensitivity and Vercel will not reveal a
Sensitive value after it has been stored.

Each variable update applies only to new deployments. Redeploy after a
coherent batch and verify the deployment—not just the Settings table.

## 3. Provision and migrate Postgres

1. In Neon, create separate staging and production branches or projects.
2. For each branch/database, copy both URLs: the pooled runtime URL and the
   direct, non-pooled migration URL. Require TLS, normally with
   `sslmode=require`, and never reuse staging in Production.
3. Store only the matching **pooled** runtime URL as `DATABASE_URL` in Vercel.
4. Run the migration against staging first using the **direct** URL for that
   same Neon branch/database. Paste it when prompted; input is hidden and not
   written to a file or shell history:

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

5. Repeat with the production branch's direct URL only after staging succeeds.
   Confirm that it names the same database/branch as the pooled runtime URL in
   Vercel. Retrieve it from Neon or the approved password manager, not Vercel
   Sensitive-value output.
6. Confirm `orders`, `order_items`, `stripe_events`, and `schema_migrations`
   exist; `0000_durable_orders`, `0001_refund_tracking`, and
   `0002_sync_variant_bigint` must be recorded; `order_items.sync_variant_id`
   must be `bigint`, and `orders.refunded_amount`, `orders.policy_version`, and
   the `stripe_events` processing-lease columns must exist. The application
   stores order totals, status, the accepted policy version, immutable product
   snapshots, and provider IDs; it does not persist shipping addresses.

## 4. Connect Inngest

1. Create distinct staging and production Inngest environments.
2. Install the official Vercel integration for `codex-merch`, or copy each
   environment's Event Key and Signing Key manually.
3. Scope `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to their matching Vercel
   environments.
4. Set production `INNGEST_SERVE_ORIGIN` to the same canonical HTTPS origin as
   `PUBLIC_SITE_URL`, for example `https://codex-merch.vercel.app`.
5. Redeploy and confirm `/api/inngest` syncs `fulfill-paid-order` with the
   expected 300-second maximum duration.
6. If staging uses Vercel Deployment Protection, configure an Inngest bypass;
   do not make unrelated Preview deployments public.

## 5. Finish the Printful merchant setup

1. Keep the verified Manual/API store and a single-store private token with
   only the required `orders` and `sync_products` scopes. Record its expiry.
2. Configure a primary billing method and sufficient Wallet/auto-recharge so
   an operator-confirmed order is not rejected for lack of fulfillment funds.
3. Set the store/packing-slip merchant identity to RITSL Elliot Vaucher and
   verify the customer return address and support instructions.
4. Confirm store currency, CHF retail values, Swiss shipping coverage,
   production region, inventory for all three sizes, required garment/product
   safety information, care/fibre labeling, and the supplier's current claims
   process. Confirm the approved Swiss route does not bill the recipient for
   import/customs/carrier clearance; RITSL bears and reimburses any normal
   delivery charge that nevertheless reaches the customer.
5. Keep `PRINTFUL_AUTO_CONFIRM=false`. A paid order may create one draft; an
   operator must compare its address, variant, retail amount, print files, and
   cost before manually confirming it.
6. Re-run the read-only and no-order checks from a credentialed environment:

   ```bash
   npm run merch:printful:verify -- --slug codex-rate-reset-long-sleeve
   npm run merch:fulfillment:order:dry-run -- --slug codex-rate-reset-long-sleeve
   ```

   Require `ok: true`, product `436601984`, exact live/local matches for all
   three sync-variant IDs, top-level draft intent `confirm: false`,
   `retailCurrency: CHF`, CHF 58.00 retail pricing, a sanitized Swiss recipient,
   and no created order. The documented order body itself must not contain a
   `confirm` field and the endpoint must not contain `confirm=1`; POST `/orders`
   therefore creates a draft. Its synthetic `CM-DRY-…` `external_id` must also
   be no more than Printful's 32-character limit. This dry run proves payload shape only; the
   separate estimate and physical sample prove the actual Swiss route and cost.
7. Obtain fresh Printful cost/shipping estimates for M, L, and XL to a Swiss
   address. Compare them with the 2026-07-21 CHF 41.56 one-item quote and
   investigate any difference before sign-off.
8. Order a physical sample and inspect artwork, print placement/quality,
   garment, size, label, packing slip, packaging, safety information, return
   handling, and delivery time.
9. If the product is rebranded, deploy immutable files first, upsert the
   revised Printful product, regenerate mockups, rerun verification, and obtain
   a new physical sample and approval.

## 6. Activate and configure Stripe

1. Activate the Stripe account as **RITSL Elliot Vaucher**, including legal
   identity, proprietor/representative verification, registered address, UID,
   payout bank account, support email/site, and requested documents. Require
   both live charges and payouts to show enabled.
2. Configure the public business details and a truthful, recognizable statement
   descriptor. Use `RITSL MERCH` if Stripe accepts it; do not use `CODEX` while
   commercial rights remain unresolved. Verify the final descriptor on the
   controlled live card statement and receipt. Set `elliot@ritsl.com` as the
   support email and use these exact
   canonical HTTPS URLs (replace only the origin if the domain changes):

   - Terms: `https://codex-merch.vercel.app/policies/terms`
   - Privacy: `https://codex-merch.vercel.app/policies/privacy`
   - Support/contact: `https://codex-merch.vercel.app/policies/contact`

   The Terms URL is required because Checkout collects required terms consent.
   Verify the details and links shown by Stripe match the storefront.
3. Enable only payment methods RITSL supports. The application lets Stripe
   dynamically select methods eligible for the CHF, CH-only Checkout Session.
4. Confirm actual Swiss account fees. The CHF 2.25 fee in the sign-off record
   is only the stated 2.9% + CHF 0.30 planning assumption on CHF 67.10.
5. The fixed consumer amounts are tax-inclusive by code: product
   `tax_behavior=inclusive` with General Tangible Goods
   (`txcd_99999999`), and shipping `tax_behavior=inclusive` with Shipping
   (`txcd_92010001`). After the all-RITSL VAT review, record one explicit
   choice:

   - use `STRIPE_AUTOMATIC_TAX=true` only after all applicable registrations
     and origins are configured, then prove in Stripe test mode that any tax is
     included within—not added to—the advertised CHF 58.00 + CHF 9.10; or
   - retain `STRIPE_AUTOMATIC_TAX=false` when the owner/accountant confirms that
     treatment. Do not label a price “VAT included” when RITSL is not
     VAT-registered. In either case, one-item Checkout must remain CHF 67.10.

6. Use exactly one live CHF shipping configuration. The recorded pilot uses
   `STRIPE_FLAT_SHIPPING_AMOUNT=910` and no `STRIPE_SHIPPING_RATE_ID`. If a
   Stripe Shipping Rate is used instead, create it in live mode for CHF 9.10,
   inclusive tax behavior, Shipping tax code `txcd_92010001`, and the exact
   7–15-business-day estimate; set its live `shr_…` ID and remove the flat
   amount. The application rejects any mismatch. Test-mode rate IDs do not
   work with a live key.
7. Create a live Workbench event destination at:

   `https://<canonical-domain>/api/stripe/webhook`

   Select Account events, API version `2026-06-24.dahlia`, and exactly:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`

8. Store the live `sk_live_…` server secret and that live endpoint's unique
   `whsec_…` secret as Sensitive Production variables. The application does
   not require a publishable key. Leave `STRIPE_API_VERSION` unset; code pins
   and type-checks the version.
9. Enable Stripe's successful-payment/receipt email as required. In test mode,
   verify `receipt_email`, the rendered receipt/preview, and a Dashboard test
   receipt to a verified account email; Stripe does not generally send every
   automatic test receipt. Verify real automatic delivery with the controlled
   live order. Do not infer email readiness from API-key readiness alone.

## 7. Add the complete Vercel Production contract

Open **Vercel → ritsl → codex-merch → Settings → Environment Variables**. Add
secrets as Sensitive and target **Production only**. Use different values for
staging. The fail-closed flags remain `false` until the controlled-test/public-
launch procedure in section 10.

| Variable | Production value or rule |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical HTTPS origin without a path; `https://codex-merch.vercel.app` until a reviewed custom domain replaces it |
| `STOREFRONT_MODE` | `preview` now; `production` only during the owner-IP-restricted controlled test and after final public-launch approval |
| `DATABASE_URL` | Production pooled Neon/Postgres URL with TLS |
| `CHECKOUT_ENABLED` | `false` now; set `true` last inside the restricted controlled-test window, and keep it enabled publicly only after final approval |
| `MERCH_PILOT_APPROVED` | `false` until every pilot/rights/sample gate is evidenced |
| `MERCH_EXPANSION_APPROVED` | `false` throughout the first pilot; separate post-pilot authority for any additional sellable product |
| `STOREFRONT_LEGAL_APPROVED` | `false` until policies are inspected and written rights or a neutral rebrand exists |
| `STOREFRONT_TAX_SHIPPING_APPROVED` | `false` until all-RITSL VAT and CH shipping review is signed |
| `STOREFRONT_CONTACT_EMAIL` | `elliot@ritsl.com` |
| `STOREFRONT_POLICY_VERSION` | `2026-07-21` |
| `STRIPE_SECRET_KEY` | Sensitive live `sk_live_…` for the activated RITSL account; absence blocks checkout |
| `STRIPE_WEBHOOK_SECRET` | Sensitive `whsec_…` from the live event destination |
| `STRIPE_ALLOWED_SHIPPING_COUNTRIES` | `CH` |
| `STRIPE_SHIPPING_RATE_ID` | Unset when using the recorded flat amount |
| `STRIPE_FLAT_SHIPPING_AMOUNT` | `910` CHF centimes; set this or a live rate, never both |
| `STRIPE_AUTOMATIC_TAX` | `false` only with the recorded VAT conclusion; otherwise configure registrations before selecting `true`; all configured prices remain inclusive and one-item total remains CHF 67.10 |
| `PRINTFUL_TOKEN` | Sensitive single-store token with required scopes |
| `PRINTFUL_STORE_ID` | `18277037` for the currently verified Manual/API store |
| `PRINTFUL_AUTO_CONFIRM` | `false` throughout the pilot |
| `PRINTFUL_MAX_RETRIES` | `3` |
| `PRINTFUL_RETRY_BASE_MS` | `1000` |
| `PRINTFUL_TIMEOUT_MS` | `10000` |
| `PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS` | `false` |
| `INNGEST_EVENT_KEY` | Sensitive Production Event Key |
| `INNGEST_SIGNING_KEY` | Sensitive Production Signing Key |
| `INNGEST_SERVE_ORIGIN` | Same canonical origin as `PUBLIC_SITE_URL` |

Do not create or override Vercel's `NODE_ENV`, `VERCEL`, or `VERCEL_ENV`.
`OPENAI_API_KEY`, X credentials, weekly-release credentials, and
`VERCEL_TOKEN` are operator/automation concerns, not customer-checkout
requirements. Do not grant the deployed storefront a deployment token unless
the separately gated weekly production workflow requires it.

## 8. Configure checkout rate limiting

In **Vercel → codex-merch → Firewall → Configure**:

1. Match method `POST` and path `/api/checkout`.
2. Select Rate Limit, Fixed Window, keyed by IP.
3. Start with 10 requests per 60 seconds and HTTP 429.
4. Run in Log mode during staging, review legitimate behavior, then enable and
   publish the rule.

Do not apply this rule to `/api/stripe/webhook` or `/api/inngest`; those have
provider authentication and retry semantics.

## 9. Prove the staging path

1. Use branch-scoped Preview/custom staging with `STOREFRONT_MODE=production`,
   `CHECKOUT_ENABLED=true`, the deliberate staging approval flags, a Stripe
   sandbox key/webhook, staging database/Inngest, CH/CHF settings, policy
   version `2026-07-21`, and `PRINTFUL_AUTO_CONFIRM=false`.
2. Run the staging migration, deploy, then call:

   ```text
   GET /api/readiness?product=codex-rate-reset-long-sleeve
   ```

   Require HTTP 200, `ready: true`, `paymentMode: test`, database and Stripe
   readiness, CH pilot configuration, and `printfulAutoConfirm: false`.
3. Place a Stripe test payment to a Swiss test address. Verify CHF 58.00 plus
   CHF 9.10 and the terms/policy disclosure. Verify `receipt_email`, the
   receipt preview, and a Dashboard test receipt to a verified testing email;
   reserve automatic-delivery proof for the controlled live order.
4. Verify exactly one local order, one processed Stripe event, one successful
   Inngest run, and one unconfirmed Printful draft whose `external_id` is the
   same `CM-…` public order reference (never the longer Checkout Session ID)
   and whose variant/retail values are correct.
5. Verify the success page shows the local `CM-…` reference and removes only
   purchased cart lines.
6. Resend the same Stripe event and rerun the same Inngest event. Neither may
   create a second Printful draft.
7. Exercise expiration, async-payment failure, refund, dispute state, and a
   forced transient fulfillment failure. Verify recovery commands in
   [`production-runbook.md`](production-runbook.md). Run `orders:*` only with
   its explicit target guard and password-manager-injected provider values;
   never use Vercel `env run`, `env pull`, or a repository `.env` for these
   operations.
8. Cancel the staging draft before it is confirmed and attach sanitized
   evidence to the merchant sign-off record.

## 10. Launch production

1. Merge the reviewed PR to `main` while Production remains
   `STOREFRONT_MODE=preview` and `CHECKOUT_ENABLED=false`.
2. Confirm the deployment is healthy, all policy/contact pages display RITSL
   identity and version `2026-07-21`, migrations exist, Inngest is synced,
   Printful verification passes, and the Stripe live endpoint is enabled.
3. Attach evidence for written OpenAI permission **or** a completed neutral
   rebrand; the all-RITSL VAT conclusion; Stripe charges/payouts; Printful
   account/sample; and the end-to-end staging order.
4. Complete the **prelaunch controlled-test authorization** in
   [`merchant-signoff.md`](merchant-signoff.md). This record contains every
   approval and evidence item except the result of the controlled live order;
   it authorizes only that test, not public customer sales. Only then set
   `MERCH_PILOT_APPROVED=true`,
   `STOREFRONT_LEGAL_APPROVED=true`, and
   `STOREFRONT_TAX_SHIPPING_APPROVED=true`.
5. Temporarily restrict `POST /api/checkout` in Vercel Firewall to the owner's
   controlled test IP. Do not restrict `/api/stripe/webhook` or `/api/inngest`.
   Set `STOREFRONT_MODE=production` and, last, `CHECKOUT_ENABLED=true`, then
   redeploy the coherent configuration once.
   Keep `MERCH_EXPANSION_APPROVED=false`; it is not part of opening the signed
   first product and must not be enabled until the pilot has been reviewed.
6. Require the readiness endpoint to return `paymentMode: live` and the exact
   CH/CHF pilot contract.
7. Place one owner-controlled live purchase. Verify the final CHF 67.10
   one-item amount, Stripe
   payment/receipt, local order, webhook, Inngest run, and exactly one
   unconfirmed Printful draft before manually confirming it.
8. Record the result and complete the **final public-launch approval** in
   `merchant-signoff.md`. If any result differs or the test is aborted,
   immediately reset `CHECKOUT_ENABLED`, `MERCH_PILOT_APPROVED`,
   `STOREFRONT_LEGAL_APPROVED`, and
   `STOREFRONT_TAX_SHIPPING_APPROVED` to `false` and redeploy. Keep
   `STOREFRONT_MODE=production` only long enough to reconcile an already-paid
   test order, then restore it to `preview` and redeploy. If the test passes,
   remove the temporary checkout IP restriction only after final approval is
   signed; that is when public customer purchases are authorized.
9. Verify physical dispatch/tracking and exercise a controlled refund if the
   launch test plan requires it.
10. Keep Printful manual confirmation until multiple real orders, address
   formats, costs, claims, refunds, and margins have been reviewed.
   `PRINTFUL_AUTO_CONFIRM=true` is a separate future operational release.

## 11. Roll back

Set `CHECKOUT_ENABLED=false` and redeploy first. Paid orders can still finish
through Inngest. If fulfillment must stop, pause the Inngest function rather
than deleting orders or Stripe events. Use the inspection, retry, and
reconciliation commands in the runbook after the provider/configuration issue
is fixed.

## Primary references

- [Swiss UID register record](https://www.uid.admin.ch/Detail.aspx?lang=en&uid_id=CHE205406793)
- [Swiss e-commerce statutory obligations](https://www.kmu.admin.ch/en/statutory-obligations-swiss-and-european-e-commerce-laws)
- [Swiss cancellation/return-right guidance](https://www.kmu.admin.ch/en/what-is-a-cancellation-right)
- [Swiss FDPIC privacy-statement guidance](https://www.edoeb.admin.ch/en/privacy-statements-on-the-internet)
- [OpenAI brand guidelines](https://openai.com/brand)
- [Vercel environments and variable scopes](https://vercel.com/docs/environment-variables)
- [Vercel WAF rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
- [Neon pooled and direct connections](https://neon.com/docs/connect/connection-pooling)
- [Stripe Checkout lifecycle](https://docs.stripe.com/payments/checkout/how-checkout-works)
- [Stripe go-live checklist](https://docs.stripe.com/get-started/checklist/go-live)
- [Stripe webhook setup](https://docs.stripe.com/webhooks)
- [Stripe Tax registrations](https://docs.stripe.com/tax/registering)
- [Printful API](https://developers.printful.com/docs/)
- [Printful Manual/API stores](https://help.printful.com/hc/en-us/articles/23581702148764-How-do-I-create-and-use-a-manual-order-API-store)
- [Printful billing and Wallet behavior](https://help.printful.com/hc/en-us/articles/360014007680-How-does-the-Printful-billing-system-work)
- [Printful returns policy](https://www.printful.com/policies/returns)
- [Inngest on Vercel](https://www.inngest.com/docs/deploy/vercel)
