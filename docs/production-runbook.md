# Production runbook

Complete the account, provider, and Vercel configuration in
[`production-deployment.md`](production-deployment.md) before using this
operational runbook.

## Staging gate

1. Use Stripe test mode, a dedicated Neon branch, a dedicated Inngest
   environment, and `PRINTFUL_AUTO_CONFIRM=false`.
2. Confirm `npm run merch:printful:verify -- --slug
   codex-rate-reset-long-sleeve` succeeds against the configured Manual/API
   store. Its legacy provider external ID is an explicitly supported alias.
3. Confirm the published pilot still has reviewed research metadata, approval,
   immutable sync-variant mappings, and unchanged asset hashes.
4. Deploy staging and complete one Stripe test payment. Verify exactly one
   Printful draft, a `draft_created` local order, a verified success page, and
   a cleared cart.
5. Replay the Stripe event and the Inngest function. Confirm neither operation
   creates a second Printful order.
6. After explicit operational sign-off, set `MERCH_PILOT_APPROVED=true` to
   unlock publication of the remaining products one at a time. This flag does
   not enable automatic Printful confirmation.

## Monitoring

- Alert on Stripe webhook delivery failures and `/api/stripe/webhook` 5xx.
- Alert on failed Inngest runs and local `fulfillment_status = 'failed'`.
- Monitor Printful 401, 429, and 5xx responses separately.
- Monitor Vercel function error rate and latency for checkout, webhook, and
  Inngest routes.
- Logs use order IDs/references and provider IDs only; do not add addresses,
  raw webhook bodies, API credentials, or customer emails.

## Recovery

- Inspect failures with `npm run orders:inspect -- <reference>`.
- After correcting a transient/configuration problem, run
  `npm run orders:retry -- <reference>`.
- Use `orders:reconcile` when Stripe shows a paid session that did not reach
  the local paid state.
- Keep Printful drafts manual until the pilot has been reviewed. Enabling
  `PRINTFUL_AUTO_CONFIRM=true` is an explicit operational release, not a code
  deployment default.

## Rollback

Set `CHECKOUT_ENABLED=false` first. Existing paid orders continue through the
durable worker. If fulfillment itself must stop, pause the Inngest function;
do not delete local orders or Stripe events. Restore service, reconcile paid
orders, and replay failed runs.
