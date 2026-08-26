# Production deployment guide

This is the release contract for `self-tech-labs/codex-merch`. It keeps real
checkout disabled until the signed catalog has valid payment, database, worker,
fulfillment, policy, legal, tax, and shipping configuration. Secret values
belong in the provider
dashboards, Vercel, or an approved password manager—never Git, issues, PR
text, screenshots, or shell history.

The owner must record a current public-checkout authorization after every hard
blocker below is closed. The dated [`merchant-signoff.md`](merchant-signoff.md)
describes the former jury-only pilot and is historical evidence, not authority
for the current public storefront. The deployment remains fail-closed until
every runtime dependency and approval is live.

## Current public-checkout contract

- Merchant identity and contact: the identity shown on the current Terms and
  Privacy pages, with a valid merchant-controlled contact email supplied by
  `STOREFRONT_CONTACT_EMAIL`.
- Signed catalog: all eleven entries in `merch/merchant-jury-catalog.json`,
  with CH/US delivery. The long sleeve is **CHF 58.00** and the ten cotton
  sweatshirts are **CHF 88.00**; **CHF 9.10** shipping is charged once per
  order, making the respective one-item totals **CHF 67.10** and **CHF 97.10**,
  including any applicable tax.
- Customer-policy version: **2026-08-26**.
- Identity: independent fan-made content, not official OpenAI merchandise; no
  affiliation, authorization, sponsorship, approval, or endorsement. The
  project claims no rights in OpenAI names, marks, logos, or imagery and will
  promptly remove affected products or references on OpenAI's first notice.
- Checkout: public only after all explicit approvals and readiness checks pass.
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
overhead. That historical verification covers only the long sleeve. Reverify
every signed product and variant, requote representative sizes for the restored
sweatshirts and mixed/bulk carts, and verify the account's actual Stripe pricing
before launch.

The same signed M variant was also quoted read-only to OpenAI's published San
Francisco address: CHF 29.80 item/print, CHF 4.49 shipping, CHF 5.00 supplier
tax, CHF 39.29 total. No order was created.

## Current hard blockers

Close the non-mutating prerequisites in items 1–4 before a controlled launch.
Item 5 can run only after the coherent flags are temporarily enabled because
the readiness endpoint enforces the same fail-closed checkout contract.

1. **Stripe live account:** complete the merchant account's KYC,
   proprietor/representative and bank verification; confirm live charges and
   payouts; create a live key and live event destination; set
   `STRIPE_EXPECTED_MODE=live`; and verify customer receipt/order-confirmation
   email behavior.
2. **Production database and worker:** install the production Neon URL, run the
   committed migrations, configure production Inngest event/signing keys and
   origin, and verify the signed webhook-to-draft path.
3. **Printful merchant setup:** confirm billing/Wallet, return address, packing
   slip identity, CH/US product availability, product-safety information, claim
   handling, and manual-confirmation ownership.
4. **Policy and owner approval:** deploy policy `2026-08-26`, a valid
   merchant-controlled contact email, the persistent non-affiliation/no-rights/
   takedown disclosures, and record owner approval for public checkout.
5. **Post-enable canonical readiness:** after owner authorization and the
   section 10 flag sequence, deploy the exact reviewed commit and require HTTP
   200 from `/api/readiness?product=<signed-slug>` for every signed catalog
   entry. Then verify `paymentMode: live`, database/Stripe/Stripe-webhook/
   Printful checks, the fan disclaimer, CH/US address selection, product-
   specific pricing plus one CHF 9.10 shipping charge, required terms consent,
   and Stripe policy links in a signed-out browser.

Do not widen availability until item 5 and one controlled end-to-end live
payment pass. If either fails, restore the checkout and approval flags to
`false`, redeploy, and reconcile any paid order.

The non-affiliation and takedown terms do not grant a licence or eliminate
brand, tax, privacy, product, or consumer-law risk. Record the owner's current
decision and obtain appropriate professional advice before opening public sale.

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
STOREFRONT_CONTACT_EMAIL=
STOREFRONT_POLICY_VERSION=2026-08-26
STRIPE_EXPECTED_MODE=live
STRIPE_ALLOWED_SHIPPING_COUNTRIES=CH,US
STRIPE_FLAT_SHIPPING_AMOUNT=910
STRIPE_AUTOMATIC_TAX=false
PRINTFUL_AUTO_CONFIRM=false
PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS=false
```

Leave `STRIPE_SHIPPING_RATE_ID` unset when using the CHF 9.10 flat amount.
Set `STOREFRONT_CONTACT_EMAIL` to the valid merchant-controlled address shown on
the deployed policy pages before approval. `STRIPE_EXPECTED_MODE=live` does not
enable checkout by itself; it ensures any subsequently installed Stripe secret
must be live. `STOREFRONT_TAX_SHIPPING_APPROVED=false` remains fail-closed until
the full CH/US checkout configuration is deliberately enabled.

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
npx --yes vercel@56.4.1 link --project codex-merch --scope your-vercel-scope
npx --yes vercel@56.4.1 env ls production --project codex-merch --scope your-vercel-scope
npx --yes vercel@56.4.1 env add VARIABLE_NAME production --project codex-merch --scope your-vercel-scope --sensitive
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
3. Set the store/packing-slip identity to the same merchant identity shown on
   the current Terms and Privacy pages, and verify the customer return address
   and support instructions.
4. Confirm store currency, CHF retail values, Swiss shipping coverage,
   production region, inventory for every signed variant, required garment/product
   safety information, care/fibre labeling, and the supplier's current claims
   process. Confirm the approved Swiss route does not bill the recipient for
   import/customs/carrier clearance; the merchant bears and reimburses any
   normal delivery charge that nevertheless reaches the customer.
5. Keep `PRINTFUL_AUTO_CONFIRM=false`. A paid order may create one draft; an
   operator must compare its address, variant, retail amount, print files, and
   cost before manually confirming it.
6. Re-run the read-only and no-order checks from a credentialed environment for
   every slug in `merch/merchant-jury-catalog.json`:

   ```bash
   npm run merch:printful:verify -- --slug <signed-slug>
   npm run merch:fulfillment:order:dry-run -- --slug <signed-slug>
   ```

   Require `ok: true`, the exact signed Printful product ID and live/local
   variant mappings, top-level draft intent `confirm: false`, `retailCurrency:
   CHF`, the signed CHF 58.00 or CHF 88.00 retail price, a sanitized Swiss
   recipient, and no created order. The documented order body must not contain a
   `confirm` field and the endpoint must not contain `confirm=1`; POST `/orders`
   therefore creates a draft. Its synthetic `CM-DRY-…` `external_id` must also
   be no more than Printful's 32-character limit. This dry run proves payload shape only; the
   separate estimate and physical sample prove the actual Swiss route and cost.
7. Obtain fresh Printful cost/shipping estimates for representative variants of
   every signed product, plus a mixed and maximum-size cart, to a Swiss address.
   Compare the long sleeve with the 2026-07-21 CHF 41.56 one-item quote and
   investigate any difference before sign-off.
8. Order a physical sample and inspect artwork, print placement/quality,
   garment, size, label, packing slip, packaging, safety information, return
   handling, and delivery time.
9. If the product is rebranded, deploy immutable files first, upsert the
   revised Printful product, regenerate mockups, rerun verification, and obtain
   a new physical sample and approval.

## 6. Activate and configure Stripe

1. Activate the Stripe merchant account using its current legal identity,
   proprietor/representative verification, registered address, applicable
   registration details, payout bank account, support email/site, and requested
   documents. Require both live charges and payouts to show enabled.
2. Configure the public business details and a truthful, recognizable statement
   descriptor that does not imply OpenAI is the merchant or endorses the
   products. Verify the final descriptor on the controlled live card statement
   and receipt. Use the same merchant-controlled support email configured in
   `STOREFRONT_CONTACT_EMAIL` and these exact
   canonical HTTPS URLs (replace only the origin if the domain changes):

   - Terms: `https://codex-merch.vercel.app/policies/terms`
   - Privacy: `https://codex-merch.vercel.app/policies/privacy`
   - Support/contact: `https://codex-merch.vercel.app/policies/contact`

   The Terms URL is required because Checkout collects required terms consent.
   Verify the details and links shown by Stripe match the storefront.
3. Enable only payment methods the merchant supports. The application lets Stripe
   dynamically select methods eligible for the CHF, CH/US Checkout Session.
4. Confirm actual Swiss account fees. The CHF 2.25 fee in the sign-off record
   is only the stated 2.9% + CHF 0.30 planning assumption on the historical CHF
   67.10 long-sleeve order; recalculate for each actual cart.
5. The fixed consumer amounts are tax-inclusive by code: product
   `tax_behavior=inclusive` with General Tangible Goods
   (`txcd_99999999`), and shipping `tax_behavior=inclusive` with Shipping
   (`txcd_92010001`). The owner selected
   `STRIPE_AUTOMATIC_TAX=false` for the current signed catalog. Do not label the
   price “VAT included”; present each signed product price plus the single CHF
   9.10 shipping charge as the final configured amounts. One-item Checkout must
   remain CHF 67.10 for the long sleeve or CHF 97.10 for a sweatshirt.

6. Use exactly one live CHF shipping configuration. The signed catalog uses
   `STRIPE_FLAT_SHIPPING_AMOUNT=910` and no `STRIPE_SHIPPING_RATE_ID`. If a
   Stripe Shipping Rate is used instead, create it in live mode for CHF 9.10,
   inclusive tax behavior, Shipping tax code `txcd_92010001`, and the exact
   7–15-business-day estimate; set its live `shr_…` ID and remove the flat
   amount. The application rejects any mismatch. Test-mode rate IDs do not
   work with a live key.
7. Create a live Workbench event destination at:

   `https://<canonical-domain>/api/stripe/webhook`

   Select Account events, API version `2026-07-29.dahlia`, and exactly:

   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.closed`

8. Store the live `sk_live_…` server secret and that live endpoint's unique
   `whsec_…` secret as Sensitive Production variables, and set the non-secret
   `STRIPE_EXPECTED_MODE=live`. The application rejects a test key in Vercel
   Production and rejects webhook events whose live/test mode differs. It does
   not require a publishable key. Leave `STRIPE_API_VERSION` unset; code pins
   and type-checks the version.
9. Enable Stripe's successful-payment/receipt email as required. In test mode,
   verify `receipt_email`, the rendered receipt/preview, and a Dashboard test
   receipt to a verified account email; Stripe does not generally send every
   automatic test receipt. Verify real automatic delivery with the controlled
   live order. Do not infer email readiness from API-key readiness alone.

## 7. Add the complete Vercel Production contract

Open **Vercel → your scope → codex-merch → Settings → Environment Variables**.
Add secrets as Sensitive and target **Production only**. Use different values
for staging. The fail-closed flags remain `false` until the public-checkout
launch procedure in section 10.

| Variable | Production value or rule |
| --- | --- |
| `PUBLIC_SITE_URL` | Canonical HTTPS origin without a path; `https://codex-merch.vercel.app` until a reviewed custom domain replaces it |
| `STOREFRONT_MODE` | `preview` now; `production` only after all runtime gates pass |
| `DATABASE_URL` | Production pooled Neon/Postgres URL with TLS |
| `CHECKOUT_ENABLED` | `false` now; set `true` last after readiness prerequisites are complete |
| `MERCH_PILOT_APPROVED` | `false` until the owner closes every runtime gate and approves the current signed catalog |
| `MERCH_EXPANSION_APPROVED` | `false` unless a separately reviewed catalog revision adds another sellable product |
| `STOREFRONT_LEGAL_APPROVED` | `true` only after policy `2026-08-26` and the persistent non-affiliation/no-rights/takedown disclosures are inspected |
| `STOREFRONT_TAX_SHIPPING_APPROVED` | `true` only after the owner confirms the CH/US, CHF, shipping, and automatic-tax contract |
| `STOREFRONT_CONTACT_EMAIL` | Valid merchant-controlled address shown on the current policy pages |
| `STOREFRONT_POLICY_VERSION` | `2026-08-26` |
| `STRIPE_EXPECTED_MODE` | `live`; Vercel Production rejects any other mode |
| `STRIPE_SECRET_KEY` | Sensitive live `sk_live_…` for the activated merchant account; absence or mode mismatch blocks checkout |
| `STRIPE_WEBHOOK_SECRET` | Sensitive `whsec_…` from the live event destination |
| `STRIPE_ALLOWED_SHIPPING_COUNTRIES` | `CH,US` |
| `STRIPE_SHIPPING_RATE_ID` | Unset when using the recorded flat amount |
| `STRIPE_FLAT_SHIPPING_AMOUNT` | `910` CHF centimes; set this or a live rate, never both |
| `STRIPE_AUTOMATIC_TAX` | Explicit owner-approved `true` or `false`; current catalog uses `false`, with one-item totals of CHF 67.10 or CHF 97.10 depending on product |
| `PRINTFUL_TOKEN` | Sensitive single-store token with required scopes |
| `PRINTFUL_STORE_ID` | `18277037` for the currently verified Manual/API store |
| `PRINTFUL_AUTO_CONFIRM` | `false` throughout live sales |
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

## 8. Configure checkout and readiness rate limiting

In **Vercel → codex-merch → Firewall → Configure**:

1. Match method `POST` and path `/api/checkout`.
2. Select Rate Limit, Fixed Window, keyed by IP.
3. Start with 10 requests per 60 seconds and HTTP 429.
4. Run in Log mode during staging, review legitimate behavior, then enable and
   publish the rule.

Create a separate rule for method `GET` and path `/api/readiness`. Prefer an
operator-IP allowlist; otherwise start with 2 requests per 60 seconds per IP.
The endpoint performs authenticated database, Stripe, and Printful readiness
checks, so it must not be left as an unbounded public provider-call surface.

Do not apply either rule to `/api/stripe/webhook` or `/api/inngest`; those have
provider authentication and retry semantics.

## 9. Prove the staging path

1. Use branch-scoped Preview/custom staging with `STOREFRONT_MODE=production`,
   `CHECKOUT_ENABLED=true`, deliberate staging approval flags,
   `STRIPE_EXPECTED_MODE=test`, a matching Stripe sandbox key/webhook, staging
   database/Inngest, CH/US and CHF settings, policy version `2026-08-26`, and
   `PRINTFUL_AUTO_CONFIRM=false`.
2. Run the staging migration, deploy, then call the endpoint once for every
   signed catalog slug:

   ```text
   GET /api/readiness?product=<signed-slug>
   ```

   Require HTTP 200, `ready: true`, `paymentMode: test`, database, Stripe, and
   Printful readiness, CH/US shipping, CHF 9.10 shipping, policy `2026-08-26`,
   and `printfulAutoConfirm: false`.
3. Place a Stripe test payment to a Swiss test address with at least two
   different signed products. Verify every product and variant, the exact
   subtotal, one CHF 9.10 shipping charge, and the terms/policy disclosure.
   Verify `receipt_email`, the receipt preview, and a Dashboard test receipt to
   a verified testing email; reserve automatic-delivery proof for a controlled
   live order.
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
8. Cancel the staging draft before it is confirmed and retain sanitized
   evidence in the controlled operations record.

## 10. Launch public checkout

1. Merge the reviewed PR to `main` while Production remains
   `STOREFRONT_MODE=preview` and `CHECKOUT_ENABLED=false`.
2. Confirm the deployment is healthy, Terms and Privacy display the current
   merchant identity, every policy page displays version `2026-08-26`, the
   contact route uses the valid configured email, migrations exist, Inngest is
   synced, Printful verification passes, and the Stripe live endpoint is enabled.
3. Confirm live Stripe charges/payouts and webhook, the migrated production
   database, production Inngest, Printful billing/manual-draft operation, and
   the signed catalog mapping. Keep the fan/non-affiliation/no-rights/takedown
   disclosures visible.
4. Record a current owner authorization for public checkout. Only then set
   `MERCH_PILOT_APPROVED=true`,
   `STOREFRONT_LEGAL_APPROVED=true`, and
   `STOREFRONT_TAX_SHIPPING_APPROVED=true`.
5. Set `STRIPE_EXPECTED_MODE=live`, install the matching live Stripe key and
   live endpoint secret, set `STOREFRONT_MODE=production`, and, last,
   `CHECKOUT_ENABLED=true`. Redeploy the coherent configuration once.
   Keep `MERCH_EXPANSION_APPROVED=false`; it is not part of opening the signed
   eleven-product catalog and must not be enabled until a revised catalog has been
   separately reviewed.
6. For every signed catalog slug, require the readiness endpoint to return HTTP
   200, `ready: true`, `paymentMode: live`, `databaseReady: true`,
   `stripeReady: true`, `stripeWebhookReady: true`, `printfulReady: true`,
   CH/US shipping, CHF 9.10 shipping, policy `2026-08-26`, and
   `printfulAutoConfirm: false`.
7. In a signed-out browser, verify all eleven products appear and public
   checkout creates a live Stripe Checkout Session for the chosen signed
   product. Confirm its exact price plus CHF 9.10 shipping, required terms
   consent, policy links, and fan/non-affiliation disclosure before wider
   availability.
8. Complete one controlled real payment and verify its receipt, local order,
   signed live-mode webhook, Inngest run, and exactly one unconfirmed Printful
   draft before manually confirming it. Retain sanitized evidence in the
   controlled operations record. If any result differs or the launch is aborted,
   immediately reset `CHECKOUT_ENABLED`, `MERCH_PILOT_APPROVED`,
   `STOREFRONT_LEGAL_APPROVED`, and
   `STOREFRONT_TAX_SHIPPING_APPROVED` to `false` and redeploy. Keep
   `STOREFRONT_MODE=production` only long enough to reconcile an already-paid
   order, then restore it to `preview` and redeploy.
9. Verify physical dispatch/tracking and exercise a controlled refund if the
   launch test plan requires it.
10. Keep Printful manual confirmation throughout live sales. Reassess wider
   fulfillment automation only after multiple real orders, address formats,
   costs, claims, refunds, and margins have been reviewed.
   `PRINTFUL_AUTO_CONFIRM=true` is a separate future operational release.

## 11. Roll back

Set `CHECKOUT_ENABLED=false` and redeploy first. Paid orders can still finish
through Inngest. If fulfillment must stop, pause the Inngest function rather
than deleting orders or Stripe events. Use the inspection, retry, and
reconciliation commands in the runbook after the provider/configuration issue
is fixed.

## Primary references

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
