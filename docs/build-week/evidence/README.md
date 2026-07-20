# Submission evidence index

This directory is the index for the exact, sanitized evidence attached to the
submission commit. Replace each `TODO` only with an artifact that was actually
observed. Do not commit credentials, raw live X text, customer data, webhook
bodies, private run ledgers, or third-party media without redistribution rights.

## Submission identity

| Evidence | Verified value |
| --- | --- |
| Submission commit SHA | **TODO** |
| CI run for that SHA | **TODO: URL** |
| Primary Codex task/session | **TODO: session ID** |
| `/feedback` result | **TODO: session ID** |
| Public deployment | **TODO: URL and immutable deployment reference** |
| Public YouTube demo | **TODO: URL** |
| Devpost submission | **TODO: URL** |

## Repository and local verification

Record the date, exact SHA, exit status, and a short sanitized result for each
command. Prefer a CI URL over pasted terminal output.

| Command | Result at submission SHA |
| --- | --- |
| `npm ci` | **TODO** |
| `npm run merch:validate` | **TODO** |
| `npm test` | **TODO: include database-test status** |
| `npm run typecheck` | **TODO** |
| `npm run lint` | **TODO** |
| `npm run build` | **TODO** |
| `npm run test:e2e` | **TODO** |
| `npm run submission:verify` | **TODO** |

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
| Sanitized example path or URL | **TODO** |
| Successful fixture run ID/status | **TODO** |
| `no_trend` run ID/status | **TODO** |
| Authorized live-X run ID and count-30 attestation | **TODO** |
| Live GPT-5.6 decision provenance | **TODO** |
| Duplicate-free terminal replay | **TODO** |

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
| Candidate commit and exact production deployment checkpoint | **TODO: SHA, deployment ID, sanitized immutable URL** |
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
