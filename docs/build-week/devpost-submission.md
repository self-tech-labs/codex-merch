# Devpost submission copy

Use this page as the copy-and-paste source for the OpenAI Build Week submission.
The externally hosted fields called out as **Owner action** must be completed in
Devpost before the deadline: **2026-07-22 02:00 CEST** (2026-07-21 17:00 PDT).

## Project overview

- **Project name:** Codex Merch
- **Tagline (117/140 characters):** Tell Codex a team trend. Get an original, production-ready garment—with GPT-5.6 taste and deterministic safety gates.
- **Category:** Work & Productivity
- **Submitter type:** Individual
- **Entrant:** Elliot Vaucher
- **Country:** Switzerland
- **Thumbnail:** [`media/devpost-thumbnail.png`](media/devpost-thumbnail.png) (3:2 PNG, below Devpost's 5 MB limit)
- **Try it out:** [https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app](https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app)
- **Code repository:** [https://github.com/self-tech-labs/codex-merch](https://github.com/self-tech-labs/codex-merch) (private; push the final submission commit and grant judge access as described below). The deployed judged Preview is independently bound to `4050aec0c0bf925f6f2dded7ea7a9fc28f8ddca2`.
- **Demo video:** [`../../video/out/codex-merch-build-week-1080p.mp4`](../../video/out/codex-merch-build-week-1080p.mp4) is the verified 2:50 upload master. **Owner action — upload it publicly to YouTube and paste the URL.**
- **YouTube package:** [`../../video/out/youtube-description.md`](../../video/out/youtube-description.md), [`../../video/out/codex-merch-build-week-thumbnail.png`](../../video/out/codex-merch-build-week-thumbnail.png), and [`../../video/out/codex-merch-build-week.en.srt`](../../video/out/codex-merch-build-week.en.srt)
- **Primary Codex task/session:** `019f7fb1-9352-7b30-ac89-076c94b2eeeb`
- **Codex `/feedback` session ID:** **Owner action — run `/feedback` in the primary build task and paste the returned ID.**
- **Judge support:** `elliot@ritsl.com`

## Project story

### Inspiration

Developer-relations, internal-culture, and creative-operations teams often turn
a fast-moving team conversation into a brief, artwork, production files,
provider configuration, and a storefront launch by hand. That chain is slow,
fragmented, and easy to make legally or operationally unsafe. We wanted to see
whether Codex could operate the whole creative system—not just generate an
image—while keeping human release authority and deterministic safety gates.

### What it does

Codex Merch turns one approved team trend into an original, production-ready
garment and an inspectable storefront Preview.

The direct Build Week path starts with an ordinary Codex request such as
“Create a preview merch for the trend ‘The Sol Shines’.” The repository-owned
skill records that this is an owner-supplied premise instead of inventing social
evidence. GPT-5.6 returns exactly three materially different, panel-aware
garment directions. Deterministic code selects the provider template, composes
the front, back, both sleeves, label panel, and inside label at exact production
dimensions, validates rights and prepress constraints, hashes every artifact,
and asks GPT-5.6 to critique the actual renders. The accepted candidate appears
in a public, non-purchasable storefront Preview.

The same downstream pipeline also supports a weekly mode that reads exactly 30
posts from one authorized X list. GPT-5.6 either identifies a recurring,
rights-safe trend with evidence across multiple authors or returns `no_trend`.
A weak week is a successful skip, not a reason to force merchandise.

### How we built it

Codex was the working environment for the Build Week extension. It audited the
pre-existing storefront, traced the signal-to-art path, designed and implemented
the weekly state machine, extracted prompts and strict JSON schemas, improved
the deterministic garment renderer, added adversarial tests and sanitized
fixtures, reviewed commerce and release safety, and packaged the workflow as a
repository-owned Codex skill plus Codex Desktop automation prompts.

GPT-5.6 is used through the OpenAI Responses API with `store: false` and strict
Structured Outputs. It has three bounded judgment roles: recurring-trend
analysis, strongest-first art direction, and visual critique of actual rendered
panels. TypeScript and Node.js orchestration validate every model response with
AJV. Sharp owns deterministic pixel composition. React Router presents the
catalog and technical explainer. Vercel hosts the Preview, and Playwright tests
desktop and mobile behavior.

The production adapters for Printful, Stripe, Neon, and Inngest are implemented
behind fail-closed gates, but they are deliberately disabled in the judged
Preview. The demo does not claim a payment, provider product, or fulfillment
order.

### Challenges we ran into

The hardest design problem was deciding which decisions belong to a model and
which need deterministic authority. Re-ranking creative taste with self-scores
made the system less coherent, while allowing a model to waive production or
rights checks made it unsafe. The final boundary preserves GPT-5.6's
strongest-first creative choice but lets code reject only concrete schema,
rights, renderer, prepress, or critical visual defects.

The second challenge was truthful provenance. The project supports live social
signals, synthetic replay data, and direct owner-supplied trends, and those
inputs must never be presented as interchangeable. Each mode now records its
own provenance, hashes, and release eligibility. Raw live posts remain private
and never enter public product copy or artwork.

The third challenge was making retries safe across long-running work. Stable run
keys, locks, immutable hashes, terminal-state replay, and provider/deployment
checkpoints make a retry converge on the same candidate instead of duplicating
products or publishing stale assets.

### Accomplishments that we're proud of

- One sentence in Codex becomes a complete six-panel garment system, not a flat image.
- GPT-5.6 sees and critiques the real renders while deterministic software keeps final production authority.
- The workflow can safely return `no_trend`, quarantine a defective render, or replay a completed run without duplication.
- The public Preview is a coherent product experience with a clear technical explainer and checkout disabled on both the client and server.
- Sanitized evidence preserves model identifiers, response IDs, prompt/schema hashes, decisions, critic results, prepress checks, and artifact hashes without exposing raw social content or credentials.

### What we learned

Agentic creative systems are more reliable when model judgment and software
guarantees are explicit contracts rather than a single opaque prompt. We also
learned that provenance is part of product quality: “owner supplied,” “synthetic
fixture,” and “verified live signal” need different permissions and claims even
when they eventually feed the same art-direction pipeline.

Codex accelerated the cross-cutting implementation work—state, tests, rendering,
deployment gates, documentation, and recovery—but the consequential decisions
remained human-held: audience, signal source, garment medium, safety posture,
creative acceptance, rights clearance, and release authority.

### What's next

After the Build Week judging period, the next milestone is a controlled staging
pilot: finalize asset and trademark clearance, run one provider sync with
`PRINTFUL_AUTO_CONFIRM=false`, complete a Stripe test payment, verify one Neon
order and one idempotent Inngest fulfillment run, replay every event to prove no
duplicates, and only then consider enabling production commerce. The judged
Preview will remain free and non-purchasable.

## Built with

Use these Devpost tags:

`codex`, `gpt-5.6`, `openai-api`, `responses-api`, `structured-outputs`,
`typescript`, `node.js`, `react-router`, `sharp`, `ajv`, `playwright`, `vercel`,
`x-api`, `printful`, `stripe`, `neon`, `inngest`

## Additional Build Week answers

### Is this project new or pre-existing?

This is a meaningful Build Week extension to a pre-existing project. Before
July 13, 2026, the repository already contained a React Router storefront, a
JSON catalog, manual merch CLI stages, early provider tooling, and a checkout
path. The judged work is the post-July-13 Codex/GPT-5.6 extension: exact
30-post ingestion; evidence-aware `no_trend`; three structured garment
directions; deterministic six-panel rendering and prepress; actual-render
critique; truthful owner-supplied previews; a resumable run ledger; duplicate-
safe release checkpoints; adversarial tests; the repository skill; automation
prompts; and submission evidence. The baseline tag is
`pre-build-week-2026`; the dated delta is documented in
[`provenance-delta.md`](provenance-delta.md).

### How did Codex and GPT-5.6 contribute?

Codex operated the repository throughout the extension: audit, architecture,
implementation, tests, visual QA, security review, documentation, and recovery
design. GPT-5.6 performs the bounded, structured cultural and visual judgments
at runtime. Elliot made the key audience, product, safety, rights, and release
decisions. The primary Codex build task is recorded above and in the repository
evidence pack.

### How can judges test it?

1. Open the public Preview and choose **Solward Index Cotton Sweatshirt**.
2. Inspect the catalog, front, back, and pattern views; confirm the product says
   **Prototype preview — checkout disabled**.
3. Open **How it works** and follow the owner-supplied path and weekly X-list
   path into their shared art-direction, renderer, critic, and prepress stages.
4. Review the sanitized run files under `docs/build-week/evidence/`.
5. From a clean checkout with Node.js 22 or 24, run `npm ci`,
   `npm run submission:verify`, and `npm run test:e2e`.

No account, payment, API key, or rebuild is needed for the web Preview. The
credential-free synthetic replay is documented in the root README.

### Repository access

The repository is private. Before submitting, grant read access to both
`testing@devpost.com` and `build-week-event@openai.com`, then verify both
invitations are pending or accepted. Do not put credentials in Devpost; only
include the repository URL and the public Preview URL.

## Media upload order

1. Thumbnail: [`media/devpost-thumbnail.png`](media/devpost-thumbnail.png)
2. Product Preview: [`media/devpost-product-preview.png`](media/devpost-product-preview.png)
3. Technical explainer: [`media/devpost-how-it-works.png`](media/devpost-how-it-works.png)
4. Front render: [`../../assets/mockups/the-sol-shines-cotton-sweatshirt-front.png`](../../assets/mockups/the-sol-shines-cotton-sweatshirt-front.png)
5. Panel system: [`../../assets/mockups/the-sol-shines-cotton-sweatshirt-patterns.png`](../../assets/mockups/the-sol-shines-cotton-sweatshirt-patterns.png)

Recommended captions:

- “One owner-supplied team trend becomes an original six-panel garment; the judged Preview cannot create a payment or provider order.”
- “The public explainer separates GPT-5.6 judgment from deterministic rights, rendering, prepress, idempotency, and release gates.”
- “Exact provider-sized panels and typography are composed deterministically, then reviewed from the actual rendered output.”

## Owner-only finalization

- Create or open the Devpost draft and paste this page into the matching fields.
- Upload the thumbnail and gallery images in the order above.
- Upload the verified 2:50 master with its supplied thumbnail, captions, description, chapters, and AI disclosure; then paste the public YouTube URL.
- Run `/feedback` in the primary Codex task and paste the returned session ID.
- Confirm eligibility, employer/conflict status, ownership, and brand/asset clearance.
- Grant both judge email addresses read access to the private repository.
- Freeze and record the final judged commit, verify all links in a signed-out browser, accept the terms, and submit before the deadline.
