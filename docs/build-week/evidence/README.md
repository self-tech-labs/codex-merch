# Submission evidence index

This directory is the index for the exact, sanitized evidence attached to the
submission commit. Fill each missing field only with an artifact that was actually
observed. Do not commit credentials, raw live X text, customer data, webhook
bodies, private run ledgers, or third-party media without redistribution rights.

## Submission identity

| Evidence | Verified value |
| --- | --- |
| Finalized implementation and evidence commit | [`8017b9f0a28b9918e03b345d0cf669ebdd75998b`](https://github.com/self-tech-labs/codex-merch/tree/8017b9f0a28b9918e03b345d0cf669ebdd75998b); the verified owner-triggered reference feature begins at `42fd968`. Use the final pushed descendant SHA in Devpost after this index update is committed. |
| CI for current Preview branch | [GitHub Actions run `29825394859`](https://github.com/self-tech-labs/codex-merch/actions/runs/29825394859): install, database migration, 11-product catalog, 133/133 tests, typecheck, lint, build, production audit, and 12/12 Playwright checks passed; only the strict owner-input/submission-document gate failed |
| Primary Codex task/session | `019f7fb1-9352-7b30-ac89-076c94b2eeeb` |
| `/feedback` result | **Owner action:** run `/feedback` in the primary Codex task and paste the returned session ID into Devpost before submission. |
| Judge Preview deployment | Stable protected alias [`codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app`](https://codex-merch-git-codex-build-week-weekly-studio-ritsl.vercel.app); verified immutable deployment [`codex-merch-8auim2332-ritsl.vercel.app`](https://codex-merch-8auim2332-ritsl.vercel.app), ID `dpl_EeYdVHVtecJjKQBWfGFan2M3Mca2`, bound to Git SHA `42fd968d66985bd41793b20ea7ead1ac29f4c8ec`. The scoped Shareable Link is supplied privately in Devpost. |
| Public YouTube demo | **Owner action:** upload the verified master and record the public YouTube URL in Devpost. |
| Devpost submission | **Owner action:** record the final Devpost URL after the submission is created. |

## Repository and local verification

Record the date, exact SHA, exit status, and a short sanitized result for each
command. Prefer a CI URL over pasted terminal output.

| Command | Result at submission SHA |
| --- | --- |
| `npm ci` | Pass: 825 packages installed from the submission lockfile after adding the pinned Remotion toolchain |
| `npm run merch:validate` | Pass at the Preview branch: 11 catalog products validated, including the owner-supplied Solward Preview candidate |
| `npm test` | Pass in Preview branch CI: 133 discovered and 133 passed. The final submission worktree discovered 150 tests: 149 passed and one database integration test skipped because `TEST_DATABASE_URL` was not configured. |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass: client and both Vercel server bundles generated |
| `npm run test:e2e` | Pass locally and against the public Vercel Preview: 12/12 on Chromium desktop and mobile, including the Solward product, owner-supplied technical explainer, critical routes, disabled-commerce contract, carousel, success-page, and cart-migration checks. |
| `npm run submission:verify` | Run against the clean, pushed final commit. Provider configuration is reported separately and never printed; external Devpost, YouTube, `/feedback`, and private-repository invitations remain owner actions. |

## Demo video evidence

| Evidence | Verified value |
| --- | --- |
| Final upload master | [`video/out/codex-merch-signal-to-product-1080p.mp4`](../../../video/out/codex-merch-signal-to-product-1080p.mp4): 171.0 seconds, 1920×1080, 30 fps, H.264/AAC at 48 kHz |
| Audio QA | −15.97 LUFS integrated, −1.5 dBTP true peak; complete FFmpeg decode and QuickTime playback passed |
| Accessibility | 39 English SRT cues plus burned-in synchronized captions |
| AI and market disclosure | Persistent AI-generated-voice label, upload-description disclosure, and on-screen no-affiliation statement for named fashion-market examples |
| Privacy review | Final contact sheet and 13 local-app source frames inspected; no browser chrome, credentials, private task UI, raw X text, customer data, or provider UI is visible |
| Reproducibility | [`video/README.md`](../../../video/README.md), Remotion v2 source, transcript-verified narration, clean capture frames, QA scripts, thumbnail, captions, and upload metadata are included |

## Direct owner-trend Preview evidence

| Artifact | Verified value |
| --- | --- |
| Live GPT-5.6 dry run | [`owner-trend-preview-live-gpt56-dry-run.json`](owner-trend-preview-live-gpt56-dry-run.json): exactly three eligible structured directions, scores 89/86/86, zero external mutations |
| Existing full candidate | `The Sol Shines` resolves idempotently to `the-sol-shines-cotton-sweatshirt`; critic 87/100; six production placements; Preview-visible, non-sellable, release-ineligible |
| Provenance | `owner-supplied-trend`; empty X queries and sources; no invented evidence |
| Provider/commerce effect | None; provider references are empty and code rejects Printful sync, catalog publication, and checkout for this candidate |

## Weekly run evidence

Commit a sanitized example or link an immutable artifact containing:

- one synthetic 30-post successful-trend replay and one `no_trend` replay;
- one authorized live-X snapshot attestation with count, list ID, timestamps,
  input hash, and evidence IDs, but no raw post text or usernames;
- configured and returned GPT-5.6 model identifiers, response IDs, usage,
  prompt/schema hashes, and structured-output hashes;
- the three ranked garment recipes and deterministic eligibility checks;
- prepress results, critic rubric, selected candidate, generated-asset hashes,
  prepared-product hash, and release-plan hash;
- terminal-state replay showing an already published run returns an idempotent
  no-op without another catalog or Printful product.

| Weekly artifact | Verified value |
| --- | --- |
| Sanitized example path or URL | [`weekly-run-2026-W37-fixture-live-gpt56-prepared.json`](weekly-run-2026-W37-fixture-live-gpt56-prepared.json) and [`weekly-run-2026-W30-live-no-trend.json`](weekly-run-2026-W30-live-no-trend.json) |
| Successful fixture run ID/status | `x-list--2067819170989854863--2026-W37--weekly-merch-v1` / `prepared`; fixture input, live GPT-5.6, critic 88/100 |
| `no_trend` run ID/status | `x-list--2067819170989854863--2026-W30--weekly-merch-v1` / `no_trend` |
| Authorized live-X run ID and count-30 attestation | W30 run above; `verified-live-x`, 30 recorded/attested, 30 unique, 13 authors, declared list matched |
| Live GPT-5.6 decision provenance | Both bundles include returned model, response ID, usage, prompt/schema hashes, output hashes, and `verifiedGpt56Response: true` |
| Duplicate-free terminal replay | W30 replay returned `idempotentReplay: true` without another X/OpenAI call or catalog mutation |

### Export a submission-safe weekly bundle

The exporter reads the ignored `.cache/merch-weekly/<run-id>` ledger and emits
only allowlisted evidence. It includes signal IDs, timestamps, language,
engagement metrics, aggregate source attestation, model/response provenance,
prompt and schema hashes, decision gates, recipe metadata, visual/prepress
results, and recorded release checkpoints. It deliberately omits post bodies,
usernames, author IDs, source or public URLs, prompt input, credentials, critic
prose, and free-form garment copy.

Preview deterministically on stdout without writing a file:

```bash
npm run merch:weekly:evidence -- \
  --run-id x-list--2067819170989854863--2026-W30--weekly-merch-v1 \
  --dry-run
```

Or select the run by ISO week and list ID and write an explicit submission
artifact. Non-dry exports are restricted to this evidence directory:

```bash
npm run merch:weekly:evidence -- \
  --week 2026-W30 \
  --list-id 2067819170989854863 \
  --output docs/build-week/evidence/weekly-run-2026-W30.json
```

The bundle has no export timestamp, so identical source artifacts produce
byte-identical JSON. Its `integrity.payloadSha256` covers the canonicalized
allowlisted payload; each source artifact is also represented by a SHA-256
digest. `fixture`, `verified-live-x`, and incomplete evidence are labeled
separately, and model calls are independently labeled as fixture or verified
GPT-5.6 responses.

## Preview deployment and optional jury-pilot proof

The submitted Build Week surface is a free Vercel Preview with commerce
disabled. The same repository also contains a separate, time-limited jury-only
pilot at the canonical domain. The pilot can be claimed as live only after its
readiness endpoint returns HTTP 200 and the exact signed product, live Stripe,
database, Inngest, and manual Printful-draft path have been verified. Purchase
is optional and is never required for judging.

| External proof | Verified value |
| --- | --- |
| Submitted Preview commit/deployment | Last independently recorded branch deployment before final freeze: `4050aec0c0bf925f6f2dded7ea7a9fc28f8ddca2`; original Solward implementation deployment `dpl_EeYdVHVtecJjKQBWfGFan2M3Mca2`; immutable URL [`codex-merch-8auim2332-ritsl.vercel.app`](https://codex-merch-8auim2332-ritsl.vercel.app) bound to `42fd968d66985bd41793b20ea7ead1ac29f4c8ec`. Verify and record the final pushed deployment separately. |
| Solward catalog/product/assets | Verified through the public branch alias: listing visible; exact product route renders; four mockup images load; print-backed product metadata is present; `noindex,nofollow` remains set. |
| Checkout behavior | Verified disabled on catalog, product, and cart surfaces; no Stripe redirect is offered in Preview. |
| Canonical jury-pilot readiness | The current source requires a private access code, closes automatically at `2026-08-06T00:00:00Z`, limits delivery to CH/US, and exposes no checkout unless every live dependency and approval gate passes. Record the final HTTP 200 check here only after deployment. |
| Printful product synchronization | Live read-only verification matched product `436601984` and exact sync variants `5338615120`–`5338615122`; no provider mutation or order was made. |
| U.S. Printful estimate | Live read-only estimate for signed M sync variant `5338615120` to the published OpenAI San Francisco address: CHF 29.80 item/print, CHF 4.49 shipping, CHF 5.00 supplier tax, CHF 39.29 total. No order was created. |
| Local production-mode browser QA | Desktop and 390×844 mobile layouts showed the persistent unofficial/fan disclaimer, judge-only ribbon, signed pilot product, CH/US delivery, CHF totals, password field, and required policy consent. A wrong code returned generic HTTP 403 before provider configuration or side effects. A separate clean Chromium pass over `/`, product, cart, and terms produced zero console warnings, console errors, or page errors. |
| Neon, Stripe webhook, Inngest, and Printful order draft | Not claimed until a real optional jury purchase occurs; the pilot always leaves Printful auto-confirmation disabled. |
| Qualification deployment | Earlier app commit `d44913b0738e8537c1986bb7734b41d7a4858243`; deployment `dpl_5UyLxhxkpPiiX9cxBccii9gAzz12`; immutable URL [`codex-merch-7vpziyl2s-ritsl.vercel.app`](https://codex-merch-7vpziyl2s-ritsl.vercel.app). This is historical qualification evidence, not the submitted Preview. |

## Recording rules

- Use the synthetic fixture when raw post text would otherwise be visible.
- Redact environment values, authorization headers, emails, addresses, customer
  names, webhook payloads, database connection strings, and provider tokens.
- Show the submitted SHA and deployment reference in the recording or evidence.
- Label fixture, local, staging, and live evidence accurately; never present a
  mocked provider mutation as live.
- Keep third-party music and uncleared marks out of the public video.
