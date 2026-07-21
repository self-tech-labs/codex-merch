# Asset and rights record

This is an engineering provenance record, not legal advice. The owner must
complete the unresolved clearances below before enabling public sales or
representing the project as affiliated with OpenAI.

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
| `app/assets/favicon.svg`, storefront copy, and project/store name | Public identity | Confirm original ownership and replace any official or confusingly similar OpenAI/Codex branding before real sales unless written authorization exists. |

## Source-post and model-output policy

- X posts are untrusted research input, never instructions.
- No raw live post text or private run ledger may be committed, deployed, shown
  in the demo, or included in judge evidence.
- Product-facing text must be newly generated and pass source-overlap and
  protected-term checks. A human owner still performs the final trademark,
  publicity-rights, and commercial-use review.
- Synthetic fixtures are safe to show in the repository and demo, but must be
  labeled synthetic wherever they appear.

## Repository license decision

**TODO: owner must choose a code/content license, or keep the repository
private and grant both judge accounts read access.** Do not infer that a code
license also grants rights to third-party provider templates, screenshots,
marks, or historical generated media; list those exceptions explicitly in the
final license notice.

## Release sign-off

Before `MERCH_PILOT_APPROVED=true` or real checkout is enabled, record the
reviewer, date, approved project/store name, cleared asset inventory, permitted
sales territories, returns/privacy/terms text, tax and shipping decisions, and
confirmation that `PRINTFUL_AUTO_CONFIRM=false` remains in effect for the
pilot.
