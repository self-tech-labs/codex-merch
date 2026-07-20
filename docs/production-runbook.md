# Production runbook

## Staging gate

1. Use Stripe test mode, a dedicated Neon branch, a dedicated Inngest
   environment, and `PRINTFUL_AUTO_CONFIRM=false`.
2. Rotate the currently invalid Printful token and confirm
   `npm run merch:printful:verify -- --slug codex-rate-reset-long-sleeve` succeeds.
3. Add at least one reviewed X research source to the pilot manifest and rerun
   `npm run merch:validate`.
4. Reapprove and publish the `codex-rate-reset-long-sleeve` pilot. The former
   `codex-rate-reset` storefront handle remains a read-only compatibility alias.
5. Deploy staging and complete one Stripe test payment. Verify exactly one
   Printful draft, a `draft_created` local order, a verified success page, and
   a cleared cart.
6. Replay the Stripe event and the Inngest function. Confirm neither operation
   creates a second Printful order.
7. After explicit operational sign-off, set `MERCH_PILOT_APPROVED=true` to
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
