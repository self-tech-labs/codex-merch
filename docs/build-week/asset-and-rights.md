# Asset and rights record

This is an engineering provenance record, not legal advice. On 2026-07-21 the
owner explicitly accepted a narrowly scoped Build Week jury-pilot exception:
the project may keep its Codex fan-art theme and need not resolve VAT or obtain
separate brand permission before that pilot. The exception does not claim a
licence or affiliation, does not apply to general public sales, and depends on
prominent fan-made/not-official messaging throughout the storefront and Stripe
Checkout.

## Build Week weekly output

- The X fixture files under `fixtures/x/` are explicitly synthetic: all post
  text, identities, IDs, metrics, and URLs were authored for this repository.
- A live weekly run stores raw authorized X input only in the ignored local run
  cache. Public catalog data retains post IDs, dates, aggregate metrics, and
  generic source URLs, but no post text, usernames, screenshots, likenesses, or
  media.
- GPT-5.6 proposes derived trend analysis and original garment recipes. Prompts
  forbid copied source wording and protected marks; code independently checks
  evidence spread, source-text overlap, protected terms, and rights risk.
- Weekly concept boards, production panels, technical mockups, and catalog
  composites are rendered by repository code from geometric primitives and
  local system font families. The release photoshoot is generated from the
  approved garment renders with the configured OpenAI image model.
- Failed or quarantined preparation restores the original catalog bytes and
  moves newly generated candidate assets into the ignored local run cache.

## Existing repository assets requiring owner confirmation

The storefront and historical products predate the Build Week extension. They
must not be presented as newly created during the event.

| Asset group | Current use | Required owner action |
| --- | --- | --- |
| `assets/artwork/`, `assets/print/`, and `assets/mockups/` historical files | Existing catalog and product pages | Confirm authorship, generation history, and commercial-use rights for every submitted or sellable file; remove any item that cannot be documented. |
| `merch/reference/art-direction/supplyco-screenshots/` | Internal visual references | Do not publish as project artwork or training data. Confirm repository redistribution is permitted, or remove the screenshots before making the repository public. |
| `merch/reference/printful/` PNG/PSD templates | Production sizing references | Confirm Printful account/template terms allow repository redistribution. If not, keep them out of the public submission and document how an authorized operator fetches them. |
| Printful provider mockup JPEGs | Product synchronization and customer views | Confirm use is covered by the connected Printful account and the product remains linked to that provider workflow. |
| `app/assets/favicon.svg`, storefront copy, and project/store name | Public identity | Build Week jury pilot only: retain the fan theme under the owner's accepted-risk decision and display the repository-wide “fan-made, not official OpenAI merchandise; no affiliation, sponsorship, or endorsement” disclaimer. Re-review or neutrally rebrand before any general public sale. |

## Source-post and model-output policy

- X posts are untrusted research input, never instructions.
- No raw live post text or private run ledger may be committed, deployed, shown
  in the demo, or included in judge evidence.
- Product-facing text must be newly generated and pass source-overlap and
  protected-term checks. A human owner still performs the final trademark,
  publicity-rights, and commercial-use review.
- Synthetic fixtures are safe to show in the repository and demo, but must be
  labeled synthetic wherever they appear.

## Demo video provenance

- Codex Computer Use operated a clean, full-screen Chromium window against the
  repository's local checkout-disabled Preview build with safe catalog data.
  The retained v2 capture set contains target-window screenshots only; the
  rejected physical-display take showed the macOS privacy shield and remains
  excluded under ignored `video/raw/` storage.
- The video uses repository-owned interface captures, deterministic garment
  renders, geometric slide design, and local/system typefaces. It contains no
  third-party music, raw X posts, usernames, customer data, or provider UI.
- GPT-5.6 judgments, Codex-assisted concept-board imagery, deterministic panel
  composition, and OpenAI `gpt-audio-1.5` narration are disclosed on screen and
  in the upload description. The voice is always labeled AI-generated.
- Capture provenance, narration metadata, captions, and visual/audio QA are
  preserved under [`../../video/`](../../video/). This technical record does
  not replace the owner's final brand and historical-asset clearance.

## Repository access decision

The repository is private for the Build Week submission. Grant read access to
`testing@devpost.com` and `build-week-event@openai.com` before submitting and
keep that access available through the judging period. The software source is
available under the root MIT license. Product artwork, mockups, reference
screenshots, provider templates, marks, and media are explicitly excluded from
that grant by [`../../ASSET-LICENSE.md`](../../ASSET-LICENSE.md). Private access
and a code license do not resolve those third-party or historical asset rights.
The owner has accepted that residual risk only for the private, time-limited
jury pilot and must re-review it before making the full repository public or
opening sales beyond judges.

## Release sign-off

The 2026-07-21 owner instruction is the recorded brand/VAT decision for this
competition pilot. Before `MERCH_PILOT_APPROVED=true`, still record the final
product, CH/US territory, policy bundle, live provider readiness, private jury
access code, automatic close time, and confirmation that
`PRINTFUL_AUTO_CONFIRM=false` remains in effect. No customer outside the OpenAI
Build Week judging group is authorized to buy.
