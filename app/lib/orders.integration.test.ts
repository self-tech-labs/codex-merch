import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {eq} from 'drizzle-orm';
import {closeDatabases, getDatabase} from '~/db/client.server';
import {orders, stripeEvents} from '~/db/schema.server';
import {
  createPendingOrder,
  attachStripeSession,
  getOrderById,
  getOrderItems,
  recordStripeEvent,
} from './orders.server';
import {processStripeEvent} from './stripe-webhook.server';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'order snapshots are transactional and Stripe event IDs are concurrent-safe',
  {skip: !databaseUrl},
  async () => {
    const env: AppEnv = {...process.env, DATABASE_URL: databaseUrl};
    const order = await createPendingOrder({
      catalogRevision: 'test-revision',
      currency: 'USD',
      env,
      provider: 'printful',
      items: [
        {
          productSlug: 'test-product',
          productTitle: 'Test Product',
          variantId: 'test-product:1',
          variantLabel: 'Black / M',
          quantity: 1,
          unitAmount: 5800,
          currency: 'USD',
          provider: 'printful',
          catalogVariantId: 1,
          syncVariantId: 2,
        },
      ],
    });
    try {
      assert.equal((await getOrderItems(order.id, env)).length, 1);
      const accepted = await Promise.all([
        recordStripeEvent({id: `evt_${order.id}`, type: 'test'}, env),
        recordStripeEvent({id: `evt_${order.id}`, type: 'test'}, env),
      ]);
      assert.deepEqual(accepted.sort(), [false, true]);

      const sessionId = `cs_test_${order.id}`;
      await attachStripeSession(order.id, sessionId, env);
      const eventId = `evt_paid_${order.id}`;
      assert.equal(
        await recordStripeEvent(
          {id: eventId, type: 'checkout.session.completed'},
          env,
        ),
        true,
      );
      let handoffs = 0;
      const session = {
        id: sessionId,
        client_reference_id: order.id,
        metadata: {
          source: 'codex-merch',
          order_id: order.id,
          catalog_revision: 'test-revision',
        },
        payment_status: 'paid',
        currency: 'usd',
        amount_subtotal: 5800,
        amount_total: 5800,
        total_details: {
          amount_discount: 0,
          amount_shipping: 0,
          amount_tax: 0,
        },
        payment_intent: 'pi_test',
      } as unknown as Stripe.Checkout.Session;
      await processStripeEvent(
        {
          id: eventId,
          type: 'checkout.session.completed',
          data: {object: session},
        } as unknown as Stripe.Event,
        env,
        async () => {
          handoffs += 1;
          return {ids: ['inngest-test']};
        },
      );
      assert.equal(handoffs, 1);

      for (const type of [
        'checkout.session.async_payment_failed',
        'checkout.session.expired',
      ] as const) {
        await processStripeEvent(
          {
            id: `evt_late_${type}_${order.id}`,
            type,
            data: {object: session},
          } as unknown as Stripe.Event,
          env,
        );
      }
      const paidOrder = await getOrderById(order.id, env);
      assert.equal(paidOrder?.paymentStatus, 'paid');
      assert.equal(paidOrder?.checkoutStatus, 'complete');
      assert.equal(paidOrder?.fulfillmentStatus, 'queued');
    } finally {
      const db = getDatabase(env);
      await db.delete(stripeEvents).where(eq(stripeEvents.id, `evt_${order.id}`));
      await db.delete(stripeEvents).where(eq(stripeEvents.orderId, order.id));
      await db.delete(orders).where(eq(orders.id, order.id));
      await closeDatabases();
    }
  },
);
