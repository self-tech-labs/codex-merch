import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import type {Order} from '~/db/schema.server';
import {constructStripeEvent, stripeClient} from './stripe.server';
import {
  paidCheckoutSnapshot,
  reconcileRefundedFulfillment,
  refundStateFromCharge,
} from './stripe-webhook.server';

const env: AppEnv = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test',
};
const payload = JSON.stringify({
  id: 'evt_test',
  object: 'event',
  type: 'checkout.session.completed',
  data: {object: {id: 'cs_test'}},
});

test('full-refund webhook logic cancels a still-cancellable Printful pending order', async () => {
  const calls: string[] = [];
  await reconcileRefundedFulfillment(
    {
      fullyRefunded: true,
      fulfillmentStatus: 'cancelled',
      orderId: 'order-refunded',
      providerOrderId: 'pf-123',
    },
    {},
    {
      getState: async () => {
        calls.push('get-state');
        return {status: 'pending', committed: true};
      },
      cancel: async () => {
        calls.push('cancel');
        return true;
      },
      markCommitted: async () => {
        calls.push('mark-committed');
        return true;
      },
    },
  );
  assert.deepEqual(calls, ['get-state', 'cancel']);
});

test('Stripe webhook verification accepts a current SDK signature', () => {
  const signature = stripeClient(env).webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET!,
  });
  assert.equal(constructStripeEvent(payload, signature, env).id, 'evt_test');
});

test('Stripe webhook verification rejects stale and malformed signatures', () => {
  const signature = stripeClient(env).webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET!,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  assert.throws(() => constructStripeEvent(payload, signature, env));
  assert.throws(() => constructStripeEvent(payload, 't=1,v1=bad', env));
});

test('refund events distinguish partial and full amounts', () => {
  assert.deepEqual(
    refundStateFromCharge({amount: 6710, amount_refunded: 1000, refunded: false}),
    {amountRefunded: 1000, fullyRefunded: false, totalAmount: 6710},
  );
  assert.deepEqual(
    refundStateFromCharge({amount: 6710, amount_refunded: 6710, refunded: true}),
    {amountRefunded: 6710, fullyRefunded: true, totalAmount: 6710},
  );
  assert.throws(
    () => refundStateFromCharge({amount: 6710, amount_refunded: 1000, refunded: true}),
    /inconsistent/,
  );
  assert.throws(
    () => refundStateFromCharge({amount: 6710, amount_refunded: 0, refunded: false}),
    /invalid/,
  );
});

test('paid sessions remain bound to the server-recorded policy version', () => {
  const order = {
    id: 'order-policy-rollover',
    stripeSessionId: 'cs_policy_rollover',
    catalogRevision: 'catalog-old',
    policyVersion: '2026-07-20',
    currency: 'CHF',
    subtotalAmount: 5800,
  } as Order;
  const session = {
    id: 'cs_policy_rollover',
    client_reference_id: order.id,
    metadata: {
      source: 'codex-merch',
      order_id: order.id,
      catalog_revision: 'catalog-old',
      policy_version: '2026-07-20',
    },
    payment_status: 'paid',
    currency: 'chf',
    amount_subtotal: 5800,
    amount_total: 6710,
    total_details: {
      amount_discount: 0,
      amount_shipping: 910,
      amount_tax: 0,
    },
    payment_intent: 'pi_policy_rollover',
  } as unknown as Stripe.Checkout.Session;

  assert.deepEqual(paidCheckoutSnapshot(session, order), {
    paymentIntentId: 'pi_policy_rollover',
    shippingAmount: 910,
    taxAmount: 0,
    totalAmount: 6710,
  });
  session.total_details!.amount_tax = 500;
  assert.deepEqual(paidCheckoutSnapshot(session, order), {
    paymentIntentId: 'pi_policy_rollover',
    shippingAmount: 910,
    taxAmount: 500,
    totalAmount: 6710,
  });
  session.metadata!.policy_version = '2026-07-21';
  assert.throws(
    () => paidCheckoutSnapshot(session, order),
    /metadata does not match/,
  );
});
