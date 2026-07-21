# Merchant sign-off record

This is the production decision record for the first `codex-merch` sale. The
only authorized audience is the OpenAI Build Week jury, through the automatic
end of judging at `2026-08-06T00:00:00Z`. It is not a declaration that checkout
is ready. A gate marked **Open — runtime blocker** keeps
`STOREFRONT_MODE=preview`, `CHECKOUT_ENABLED=false`,
`MERCH_PILOT_APPROVED=false`, `MERCH_EXPANSION_APPROVED=false`,
`STOREFRONT_LEGAL_APPROVED=false`, and
`STOREFRONT_TAX_SHIPPING_APPROVED=false` in Production. The owner explicitly
accepted the brand, VAT, and pre-sample risks for this narrow competition pilot
on 2026-07-21; that acceptance does not extend to general public sales.

- Record date: **2026-07-21**
- Customer-policy version: **2026-07-21**
- Pilot product: **Codex Rate Reset Long Sleeve Tee**
  (`codex-rate-reset-long-sleeve`)

## Merchant of record

| Field | Recorded value |
| --- | --- |
| Legal name | RITSL Elliot Vaucher |
| Legal form | Swiss sole proprietorship |
| Proprietor | Elliot Richard Vaucher |
| Registered address | Avenue Virgile-Rossel 18, 1012 Lausanne, Switzerland |
| Swiss UID | CHE-205.406.793 |
| Commercial-register number | CH-550.1.243.579-7 |
| Customer and privacy contact | elliot@ritsl.com |

The identity and active status above were checked against the public
[Swiss UID register](https://www.uid.admin.ch/Detail.aspx?lang=en&uid_id=CHE205406793)
and the [Vaud commercial-register publication](https://www.faovd.ch/registre-commerce/?page=772)
on 2026-07-21. The UID record did not display a Swiss VAT number on that date.
That observation is not a tax opinion and does not replace the business-wide
turnover check below.

## Pilot commercial decision

| Decision | Pilot value |
| --- | --- |
| Authorized audience | OpenAI Build Week judges only; private code required |
| Checkout window | Ends automatically at `2026-08-06T00:00:00Z` |
| Customer and delivery territory | Switzerland and United States (`CH`, `US`) |
| Checkout and product currency | CHF |
| Product price | CHF 58.00 |
| Customer shipping charge | CHF 9.10, shown separately before payment |
| Final one-item customer total | CHF 67.10, including any applicable tax |
| Stripe tax behavior | Product and shipping amounts are inclusive; automatic tax remains off unless the all-RITSL VAT review requires and configures it |
| Fulfillment mode | Made to order; Printful draft reviewed and manually confirmed |
| Automatic Printful confirmation | Disabled (`PRINTFUL_AUTO_CONFIRM=false`) |
| Customer-policy version | `2026-07-21` |

### Quote and contribution check

Read-only Printful cost estimates for each configured pilot size delivered to
Lausanne were obtained on 2026-07-21. M, L, and XL returned the same values:

| Component | Estimate |
| --- | ---: |
| Printful item/print subtotal | CHF 29.35 |
| Printful vendor tax | CHF 3.11 |
| Printful shipping | CHF 9.10 |
| Printful total | CHF 41.56 |
| Estimated Stripe fee (2.9% of CHF 67.10 + CHF 0.30) | CHF 2.25 |
| Estimated contribution before returns, disputes, discounts, and overhead | **CHF 23.29** |

The estimates are dated operating assumptions, not guaranteed supplier costs
or profit. Requote all three sizes before launch and whenever Printful pricing,
shipping, taxes, or Stripe pricing changes. A refund, reprint, dispute, foreign
card, or failed delivery can consume some or all of the contribution.

Additional read-only quotes for the same M variant showed Printful shipping of
CHF 10.15 for two items, CHF 11.20 for three, and CHF 17.20 for ten. Charging a
flat CHF 9.10 therefore uses some merchandise contribution to cover
incremental shipping on multi-item carts; contribution before Stripe remained
CHF 50.68, CHF 75.82, and CHF 253.23 respectively. Checkout now caps the whole
order at ten items, matching the largest recorded quote. Revalidate this
assumption before changing price, quantity limits, or product mix.

A read-only U.S. estimate for the same signed M sync variant (`5338615120`),
delivered to OpenAI's published San Francisco address, returned CHF 29.80
item/print, CHF 4.49 shipping, CHF 5.00 supplier tax, and CHF 39.29 total. No
order was created. The customer-facing pilot keeps the same CHF 58.00 product
price and CHF 9.10 flat shipping charge for CH and US.

## Gate record

| Gate | Status on 2026-07-21 | Evidence or required completion |
| --- | --- | --- |
| Merchant identity | **Complete** | Public-register identity recorded above. |
| Pilot audience, window, territory, currency, price, and shipping decision | **Complete** | Judges only through 2026-08-06 00:00 UTC; CH/US; CHF 58.00 plus CHF 9.10 shipping. |
| Customer-policy draft | **Complete for deployment review** | Shipping, returns, privacy, terms, and contact version `2026-07-21`; inspect the deployed pages before approval. |
| Vercel fail-closed configuration | **Complete** | Production was reset to preview/false launch and expansion gates, CH, CHF 9.10, policy `2026-07-21`, and manual Printful confirmation; the unused `STRIPE_API_VERSION` override was removed. The immutable main build was redeployed and the canonical site returned Preview/Checkout disabled while readiness returned HTTP 503. |
| Exact pilot code/artifact lock | **Complete technically; commercial approval still open** | Checkout pins product `436601984`, M/L/XL catalog/sync mappings, title, CHF price, product revision `867adc…1246`, and build-time SHA-256 checks for every referenced artwork, print file, mockup, and customer photo. Any change fails checkout/build and requires a new sign-off revision. |
| Printful API product/catalog mapping | **Complete** | Read-only live verification passed for product `436601984` and all three expected catalog variants. |
| Exact Printful sync-ID recheck | **Complete** | Credentialed read-only verification on 2026-07-21 returned `ok: true` and matched local sync IDs `5338615120`, `5338615121`, and `5338615122` exactly to live catalog variants 10095, 10096, and 10097 for product `436601984`; no order or provider mutation was made. Rerun after any product change and immediately before launch. |
| Printful cost estimate | **Complete for M/L/XL at the recorded address** | Each size returned CHF 41.56 total; obtain fresh quotes before launch. |
| OpenAI/Codex fan-merch use | **Owner-accepted jury exception** | Keep the persistent “fan-made, not official OpenAI merchandise; no affiliation, sponsorship, or endorsement” disclaimer. This is not a licence and does not authorize general public sales. |
| VAT/tax treatment | **Owner-accepted jury exception** | Automatic tax remains off and prices are presented as the gross customer amounts for this competition pilot. Revisit before any broader sale. |
| Tax-inclusive price proof | **Complete in code; live check pending** | Checkout fixes CHF 58.00 plus CHF 9.10 shipping. Confirm the CHF 67.10 one-item total in the first live Checkout Session before sharing the code. |
| Commercial-register purpose | **Deferred beyond jury pilot** | Review before systematic merchandise sales. |
| Stripe live merchant activation | **Open — runtime blocker** | Complete RITSL KYC, charges/payouts, live key, and live webhook endpoint; verify a `RITSL MERCH` descriptor and confirmation email behavior. |
| Printful merchant account | **Open — runtime blocker** | Confirm billing/Wallet, return address, packing slip identity, CH/US availability, and manual-confirmation ownership. |
| Production data and worker | **Open — runtime blocker** | Install and migrate the production Neon database, configure the production Inngest event/signing keys and origin, and verify readiness. |
| Privacy processors and transfers | **Owner-accepted jury exception** | The deployed notice discloses the operational providers. Complete a full processor review before general public sales. |
| Import/clearance and physical sample | **Owner-accepted jury exception** | The owner accepts the limited pilot risk; inspect the first fulfilled garment and pause checkout on any quality or customs issue. |
| Staging purchase | **Strongly recommended; not claimed** | If time permits, complete a Stripe test payment through webhook, Neon, Inngest, and exactly one unconfirmed Printful draft; replay to prove idempotency. |
| Canonical readiness and judge access | **Open — runtime blocker** | Deploy this commit, require the private jury code, obtain HTTP 200 from `/api/readiness?product=codex-rate-reset-long-sleeve`, and verify the code is shared only in Devpost private instructions. |

No approver should set an approval flag merely because this document exists.
Close every runtime blocker first. Do not put the jury access code, secret keys,
webhook bodies, customer addresses, or identity documents in this repository.

## Fan-merch limitation

This pilot is intentionally framed as fan-made competition content, not as an
official OpenAI store or authorized OpenAI product. The owner instructed the
project to proceed for Build Week without a separate brand-rights or VAT review.
That is an accepted-risk product decision, not evidence of a licence. Every
storefront surface and Stripe Checkout must retain the non-affiliation
disclaimer, and the access gate must prevent anyone other than judges from
starting checkout. Close the pilot automatically when judging ends. Written
permission or a neutral rebrand remains the appropriate prerequisite for any
later general public sale.

## Prelaunch jury-pilot authorization

Complete this section after the runtime blockers above have evidence. Signing
it authorizes the jury-only pilot, not general public purchases.

- Owner brand/VAT/physical-sample risk exception: **Elliot Vaucher, 2026-07-21**
- Jury audience, CH/US territory, CHF pricing, and automatic close:
  **approved by owner, 2026-07-21**
- Live Stripe charges/payouts and webhook evidence: _open_
- Production database migration and Inngest evidence: _open_
- Printful billing/manual-draft evidence: _open_
- Readiness HTTP 200 and signed-out browser check: _open_
- Private access code stored in Vercel and Devpost private instructions: _open_
- Final owner authorization to share the code with judges: _open_

Until every open runtime field is complete, checkout remains fail-closed.

## First jury-order result

Complete this record only if a judge chooses to purchase:

- Controlled live-order reference and date: _open_
- Stripe final amount (must be CHF 67.10 for one item) and receipt evidence:
  _open_
- Signed webhook, local order, and Inngest evidence: _open_
- Printful draft ID and matching `CM-…` external ID: _open_
- Duplicate/replay and refund/cancellation result: _open_
- Any exception and remediation: _open_
- Final owner decision to keep or close the jury pilot, name and date: _open_

This pilot is never approved for general public purchases. If an order fails or
is aborted, immediately set
`CHECKOUT_ENABLED=false`, `MERCH_PILOT_APPROVED=false`,
`STOREFRONT_LEGAL_APPROVED=false`, and
`STOREFRONT_TAX_SHIPPING_APPROVED=false`, then redeploy. Keep
`STOREFRONT_MODE=production` only as long as needed to safely reconcile an
already-paid test order; then restore `STOREFRONT_MODE=preview` and redeploy.
If it passes, keep the code gate and automatic end date in place; do not remove
the audience restriction.
