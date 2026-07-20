# Submission evidence index

This directory is the index for the exact, sanitized evidence attached to the
submission commit. Fill each missing field only with an artifact that was actually
observed. Do not commit credentials, raw live X text, customer data, webhook
bodies, private run ledgers, or third-party media without redistribution rights.

## Submission identity

| Evidence | Verified value |
| --- | --- |
| Submission commit SHA | **TODO** |
| CI run for that SHA | **TODO: URL** |
| Primary Codex task/session | `019f7fb1-9352-7b30-ac89-076c94b2eeeb` |
| `/feedback` result | **TODO: session ID** |
| Public deployment | [https://codex-merch.vercel.app](https://codex-merch.vercel.app); immutable qualification deployment [`codex-merch-7vpziyl2s-ritsl.vercel.app`](https://codex-merch-7vpziyl2s-ritsl.vercel.app), ID `dpl_5UyLxhxkpPiiX9cxBccii9gAzz12`, bound to Git SHA `d44913b0738e8537c1986bb7734b41d7a4858243` |
| Public YouTube demo | **TODO: URL** |
| Devpost submission | **TODO: URL** |

## Repository and local verification

Record the date, exact SHA, exit status, and a short sanitized result for each
command. Prefer a CI URL over pasted terminal output.

| Command | Result at submission SHA |
| --- | --- |
| `npm ci` | Pass: 659 packages installed from the committed lockfile |
| `npm run merch:validate` | Pass: four catalog products validated |
| `npm test` | Pass: 117 tests run; 116 passed and one database integration test skipped because `TEST_DATABASE_URL` is not configured |
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `npm run build` | Pass: client and both Vercel server bundles generated |
| `npm run test:e2e` | Pass: 8/8 Chromium desktop and mobile tests locally; 8/8 against `https://codex-merch.vercel.app` via `PLAYWRIGHT_BASE_URL` |
| `npm run submission:verify` | Repository, fixture, model-contract, provenance, and embedded-secret checks pass; final exit remains blocked by unresolved external submission, rights, owner-evidence, and commerce-configuration fields |

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

## External release and purchase proof

The weekly release never initiates checkout or creates an order. Preserve the
release evidence first, then exercise the customer purchase path separately in
Stripe test mode.

| External proof | Verified value |
| --- | --- |
| Candidate commit and exact production deployment checkpoint | Qualification app commit `d44913b0738e8537c1986bb7734b41d7a4858243`; deployment `dpl_5UyLxhxkpPiiX9cxBccii9gAzz12`; immutable URL [`codex-merch-7vpziyl2s-ritsl.vercel.app`](https://codex-merch-7vpziyl2s-ritsl.vercel.app). This proves Git/deployment binding, not a weekly product publication. |
| Public production-asset URL/hash checks | **TODO** |
| Stable Printful product ID and complete variant mapping | **TODO** |
| Provider mockup and customer-photoshoot gates | **TODO** |
| Final publication commit/deployment/product URL | **TODO: SHA, deployment ID, sanitized immutable URL, product URL** |
| Stripe test Checkout session | **TODO: redacted reference only** |
| Exactly one Neon order and processed webhook event | **TODO: redacted references only** |
| Inngest fulfillment run | **TODO: redacted reference only** |
| Exactly one unconfirmed Printful draft | **TODO: redacted reference only** |
| Webhook, fulfillment, and weekly-run replay result | **TODO** |

## Recording rules

- Use the synthetic fixture when raw post text would otherwise be visible.
- Redact environment values, authorization headers, emails, addresses, customer
  names, webhook payloads, database connection strings, and provider tokens.
- Show the submitted SHA and deployment reference in the recording or evidence.
- Label fixture, local, staging, and live evidence accurately; never present a
  mocked provider mutation as live.
- Keep third-party music and uncleared marks out of the public video.
