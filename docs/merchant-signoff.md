# Merchant sign-off record

This is the production decision record for the first `codex-merch` sale. It is
not a declaration that checkout is ready. A gate marked **Open** keeps
`STOREFRONT_MODE=preview`, `CHECKOUT_ENABLED=false`,
`MERCH_PILOT_APPROVED=false`, `MERCH_EXPANSION_APPROVED=false`,
`STOREFRONT_LEGAL_APPROVED=false`, and
`STOREFRONT_TAX_SHIPPING_APPROVED=false` in Production, except for the
IP-restricted controlled-live-test window described below after the prelaunch
authorization is signed.

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
| Customer and delivery territory | Switzerland only (`CH`) |
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

## Gate record

| Gate | Status on 2026-07-21 | Evidence or required completion |
| --- | --- | --- |
| Merchant identity | **Complete** | Public-register identity recorded above. |
| Pilot territory, currency, price, and shipping decision | **Complete** | CH only; CHF 58.00 plus CHF 9.10 shipping. |
| Customer-policy draft | **Complete for deployment review** | Shipping, returns, privacy, terms, and contact version `2026-07-21`; inspect the deployed pages before approval. |
| Vercel fail-closed configuration | **Complete** | Production was reset to preview/false launch and expansion gates, CH, CHF 9.10, policy `2026-07-21`, and manual Printful confirmation; the unused `STRIPE_API_VERSION` override was removed. The immutable main build was redeployed and the canonical site returned Preview/Checkout disabled while readiness returned HTTP 503. |
| Exact pilot code/artifact lock | **Complete technically; commercial approval still open** | Checkout pins product `436601984`, M/L/XL catalog/sync mappings, title, CHF price, product revision `867adc…1246`, and build-time SHA-256 checks for every referenced artwork, print file, mockup, and customer photo. Any change fails checkout/build and requires a new sign-off revision. |
| Printful API product/catalog mapping | **Complete** | Read-only live verification passed for product `436601984` and all three expected catalog variants. |
| Exact Printful sync-ID recheck | **Complete** | Credentialed read-only verification on 2026-07-21 returned `ok: true` and matched local sync IDs `5338615120`, `5338615121`, and `5338615122` exactly to live catalog variants 10095, 10096, and 10097 for product `436601984`; no order or provider mutation was made. Rerun after any product change and immediately before launch. |
| Printful cost estimate | **Complete for M/L/XL at the recorded address** | Each size returned CHF 41.56 total; obtain fresh quotes before launch. |
| OpenAI/Codex commercial rights | **Open — hard blocker** | Obtain express written permission covering the actual name, artwork, product page, and paid merchandise, or replace every OpenAI/Codex mark and confusing brand element with a neutral original brand and rerun rights review. |
| Swiss VAT treatment | **Open — hard blocker** | Owner/accountant must confirm total taxable turnover and any expected threshold crossing across all RITSL activities, not only this store, then record whether Stripe automatic tax remains off or registrations are required. |
| Tax-inclusive price proof | **Open — hard blocker** | After the VAT choice, prove in Stripe test mode that the advertised CHF 58.00 plus CHF 9.10 remains a CHF 67.10 one-item total. If automatic tax is on, the tax amount must be included within—not added to—those amounts. |
| Commercial-register purpose | **Open — owner/legal review** | The recorded purpose does not expressly name apparel or online retail. Confirm whether an amendment is appropriate before systematic merchandise sales and retain the conclusion. |
| Stripe live merchant activation | **Open — hard blocker** | Complete RITSL KYC, representative and bank verification; confirm live charges and payouts; install a live secret and live webhook endpoint; configure/verify a safe descriptor such as `RITSL MERCH` (not `CODEX` while rights are unresolved); verify receipt/confirmation email behavior. |
| Printful merchant account | **Open — hard blocker** | Confirm billing/Wallet, return address, packing slip identity, CH availability, product-safety information, and the operator process for claims and manual confirmation. |
| Privacy processors and transfers | **Open — hard blocker for legal approval** | Review and retain dated processor/DPA terms, current subprocessors, relevant processing countries, transfer safeguards, retention, security/access controls, and the actual support-email provider for Stripe, Printful/carriers, Vercel, Neon, and Inngest. Ensure the deployed notice matches the result. |
| Swiss import/clearance treatment | **Open — hard blocker** | Confirm with a quote and physical sample that the recipient is not billed normal import/customs/carrier-clearance charges. RITSL bears or reimburses any such approved-route charge. |
| Physical sample | **Open — hard blocker** | Order and inspect print quality, garment, size, label, packing slip, packaging, and Swiss delivery. |
| Staging purchase | **Open — hard blocker** | Complete one Stripe test payment through webhook, Neon, Inngest, and exactly one unconfirmed Printful draft; replay to prove idempotency. |
| Controlled live purchase | **Open — final public-launch gate** | After every earlier gate and the prelaunch authorization pass, allow one IP-restricted owner order and inspect the CHF 67.10 payment, receipt, local order, event processing, `CM-…` Printful external ID, draft, and refund path before public approval. |

No approver should set an approval flag merely because this document exists.
Attach dated evidence to each open row and record the final owner decision
below. Do not put secret keys, webhook bodies, customer addresses, or identity
documents in this repository.

## Trademark and commercial-merch blocker

[OpenAI's published brand guidelines](https://openai.com/brand) treat names,
logos, and product identifiers as OpenAI marks and prohibit applying OpenAI
logos to tangible merchandise. The current product name and artwork use the
Codex product identifier, so the conservative commercial decision is **not
cleared**. A statement that RITSL is independent of or not endorsed by OpenAI
does not grant a licence and does not cure the rights issue.

Production must therefore remain fail-closed until one of these two pieces of
evidence exists:

1. written OpenAI permission that clearly covers the final tangible product,
   artwork, name, sales page, Swiss territory, and paid sale; or
2. a completed neutral rebrand, followed by a new trademark, artwork,
   provenance, product-page, Printful-file, and physical-sample review.

### Permission-request draft

This is a draft only; do not treat it as sent or as permission.

**To:** partnercomms@openai.com

**Subject:** Written permission request — limited Swiss Codex merchandise pilot

> Hello OpenAI Brand/Partner Communications team,
>
> I am Elliot Vaucher, proprietor of RITSL Elliot Vaucher, a Swiss sole
> proprietorship (UID CHE-205.406.793) at Avenue Virgile-Rossel 18,
> 1012 Lausanne, Switzerland.
>
> I am requesting express written permission for a small, made-to-order Swiss
> pilot of a long-sleeve garment currently called “Codex Rate Reset Long
> Sleeve Tee.” The current product name and artwork contain the Codex product
> identifier. Sales would be limited to delivery addresses in Switzerland,
> at CHF 58.00 plus CHF 9.10 shipping, fulfilled by Printful. RITSL would be
> the independent merchant of record and would not claim OpenAI sponsorship,
> partnership, or endorsement.
>
> Before any sale, please confirm whether OpenAI authorizes this commercial use
> of the Codex name and the exact attached final artwork/mockups on tangible
> merchandise and on its product and checkout pages. Please also specify any
> required attribution, disclaimer, design restrictions, quantity, territory,
> channel, or time limit. I can provide the final artwork, mockups, product URL,
> and proposed customer-facing copy for review.
>
> RITSL will keep checkout disabled unless and until written permission covering
> the final use is received. If permission is not available, the product will
> be neutrally rebranded and all OpenAI/Codex marks removed before sale.
>
> Kind regards,
>
> Elliot Vaucher
>
> RITSL Elliot Vaucher
>
> elliot@ritsl.com

Before sending, attach the exact production artwork and mockups and replace any
draft URL with the final reviewable page. Save the written answer with the
rights record; an automated acknowledgement or silence is not permission.

## Prelaunch controlled-test authorization

Complete this section only after every gate above except the controlled live
purchase has evidence. Signing it authorizes one owner-controlled live test
behind a temporary Vercel Firewall restriction on `POST /api/checkout`; it does
not authorize public customer purchases.

- Commercial-rights evidence and date: _open_
- All-RITSL VAT/turnover conclusion, reviewer, and date: _open_
- Commercial-register-purpose conclusion, reviewer, and date: _open_
- Stripe live charges/payouts and webhook evidence: _open_
- Printful account/sample evidence: _open_
- Staging end-to-end evidence: _open_
- Tax-inclusive CHF 67.10 Stripe test proof: _open_
- Privacy processor/DPA/transfer/security review: _open_
- Final policy-page review: _open_
- Owner authorization for one controlled live test, name and date: _open_

Until these fields are complete, checkout remains fail-closed. After they are
complete, follow the controlled-test procedure in `production-deployment.md`;
keep checkout IP-restricted and do not promote the store.

## Controlled live-test result and final public-launch approval

Complete this second record only after the authorized live test:

- Controlled live-order reference and date: _open_
- Stripe final amount (must be CHF 67.10 for one item) and receipt evidence:
  _open_
- Signed webhook, local order, and Inngest evidence: _open_
- Printful draft ID and matching `CM-…` external ID: _open_
- Duplicate/replay and refund/cancellation result: _open_
- Any exception and remediation: _open_
- Final owner approval for public customer purchases, name and date: _open_

Until this second record is complete, the truthful result is **not approved for
public customer purchases**. If the test fails or is aborted, immediately set
`CHECKOUT_ENABLED=false`, `MERCH_PILOT_APPROVED=false`,
`STOREFRONT_LEGAL_APPROVED=false`, and
`STOREFRONT_TAX_SHIPPING_APPROVED=false`, then redeploy. Keep
`STOREFRONT_MODE=production` only as long as needed to safely reconcile an
already-paid test order; then restore `STOREFRONT_MODE=preview` and redeploy.
If it passes, public launch begins only when the owner signs the final line and
the temporary checkout IP restriction is removed.
