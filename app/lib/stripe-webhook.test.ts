import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import type {Order} from '~/db/schema.server';
import {
  assertStripeEventMode,
  constructStripeEvent,
  stripeClient,
} from './stripe.server';
import {
  disputeOutcome,
  paidCheckoutSnapshot,
  reconcileStoppedFulfillment,
  refundStateFromCharge,
} from './stripe-webhook.server';
import {readRequestTextWithLimit} from './request-body.server';

const env: AppEnv = {
  STRIPE_SECRET_KEY: 'sk_test_unit_1234567890abcdef',
  STRIPE_EXPECTED_MODE: 'test',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test',
};
const payload = JSON.stringify({
  id: 'evt_test',
  object: 'event',
  type: 'checkout.session.completed',
  data: {object: {id: 'cs_test'}},
});

test('webhook body limit stops oversized chunked requests while streaming', async () => {
  const chunk = new Uint8Array(600_000);
  let sent = 0;
  const request = new Request('https://shop.example/api/stripe/webhook', {
    method: 'POST',
    body: new ReadableStream({
      pull(controller) {
        if (sent++ < 2) controller.enqueue(chunk);
        else controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit);
  await assert.rejects(
    readRequestTextWithLimit(request, {
      maxBytes: 1024 * 1024,
      tooLargeMessage: 'Stripe webhook payload is too large',
    }),
    (error) => error instanceof Response && error.status === 413,
  );
});

test('payment-risk webhook logic cancels a still-cancellable Printful pending order', async () => {
  const calls: string[] = [];
  await reconcileStoppedFulfillment(
    {
      fulfillmentStatus: 'confirmed',
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
      markCancelled: async () => {
        calls.push('mark-cancelled');
        return true;
      },
      markCommitted: async () => {
        calls.push('mark-committed');
        return true;
      },
    },
  );
  assert.deepEqual(calls, ['get-state', 'cancel', 'mark-cancelled']);
});

test('payment-risk webhook replay persists an already-cancelled Printful order', async () => {
  const calls: string[] = [];
  await reconcileStoppedFulfillment(
    {
      fulfillmentStatus: 'confirmed',
      orderId: 'order-refunded',
      providerOrderId: 'pf-123',
    },
    env,
    {
      getState: async () => {
        calls.push('get-state');
        return {status: 'canceled', committed: false};
      },
      cancel: async () => {
        calls.push('cancel');
        return true;
      },
      markCancelled: async () => {
        calls.push('mark-cancelled');
        return true;
      },
      markCommitted: async () => {
        calls.push('mark-committed');
        return true;
      },
    },
  );
  assert.deepEqual(calls, ['get-state', 'mark-cancelled']);
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

test('Stripe webhook mode must match the configured secret and expected mode', () => {
  assert.doesNotThrow(() =>
    assertStripeEventMode({livemode: false} as Stripe.Event, env),
  );
  assert.throws(
    () => assertStripeEventMode({livemode: true} as Stripe.Event, env),
    /does not match checkout mode/,
  );
  assert.throws(
    () =>
      assertStripeEventMode(
        {livemode: false} as Stripe.Event,
        {...env, STRIPE_EXPECTED_MODE: 'live'},
      ),
    /secret key does not match/,
  );
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

test('dispute outcomes restore, hold, or cancel fulfillment safely', () => {
  for (const status of ['won', 'warning_closed', 'prevented'] as const) {
    assert.equal(disputeOutcome(status), 'restore');
  }
  for (const status of [
    'needs_response',
    'under_review',
    'warning_needs_response',
    'warning_under_review',
  ] as const) {
    assert.equal(disputeOutcome(status), 'hold');
  }
  assert.equal(disputeOutcome('lost'), 'cancel');
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
    consent: {terms_of_service: 'accepted'},
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

test('paid sessions require Stripe-hosted terms consent and catalog shipping', () => {
  const order = {
    id: 'order-consent',
    stripeSessionId: 'cs_consent',
    catalogRevision: 'catalog',
    policyVersion: '2026-08-26',
    currency: 'CHF',
    subtotalAmount: 5800,
  } as Order;
  const session = {
    id: 'cs_consent',
    client_reference_id: order.id,
    metadata: {
      source: 'codex-merch',
      order_id: order.id,
      catalog_revision: 'catalog',
      policy_version: '2026-08-26',
    },
    payment_status: 'paid',
    currency: 'chf',
    amount_subtotal: 5800,
    amount_total: 6710,
    total_details: {amount_discount: 0, amount_shipping: 910, amount_tax: 0},
    payment_intent: 'pi_consent',
  } as unknown as Stripe.Checkout.Session;
  assert.throws(() => paidCheckoutSnapshot(session, order), /terms consent/);
  session.consent = {promotions: 'opt_out', terms_of_service: 'accepted'};
  session.total_details!.amount_shipping = 0;
  assert.throws(() => paidCheckoutSnapshot(session, order), /total components/);
});
