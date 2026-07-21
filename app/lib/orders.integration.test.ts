import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import {eq} from 'drizzle-orm';
import {closeDatabases, getDatabase} from '~/db/client.server';
import {orders, stripeEvents} from '~/db/schema.server';
import {
  createPendingOrder,
  attachStripeSession,
  finishStripeEvent,
  getOrderById,
  getOrderItems,
  markFulfillmentFailed,
  recordRefund,
  recordStripeEvent,
  requeueOrder,
} from './orders.server';
import {processStripeEvent} from './stripe-webhook.server';

const databaseUrl = process.env.TEST_DATABASE_URL;

test(
  'order snapshots are transactional and Stripe event IDs are concurrent-safe',
  {skip: !databaseUrl},
  async () => {
    const env: AppEnv = {...process.env, DATABASE_URL: databaseUrl};
    const createdOrderIds: string[] = [];
    const order = await createPendingOrder({
      catalogRevision: 'test-revision',
      currency: 'USD',
      env,
      policyVersion: '2026-07-21',
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
    createdOrderIds.push(order.id);
    try {
      assert.equal((await getOrderItems(order.id, env)).length, 1);
      assert.equal(
        (await getOrderById(order.id, env))?.policyVersion,
        '2026-07-21',
      );
      const accepted = await Promise.all([
        recordStripeEvent({id: `evt_${order.id}`, type: 'test'}, env),
        recordStripeEvent({id: `evt_${order.id}`, type: 'test'}, env),
      ]);
      assert.equal(
        accepted.filter((claim) => claim.state === 'claimed').length,
        1,
      );
      const firstClaim = accepted.find((claim) => claim.state === 'claimed');
      assert.equal(firstClaim?.state, 'claimed');
      if (!firstClaim || firstClaim.state !== 'claimed') {
        throw new Error('initial event was not claimed');
      }
      const firstToken = firstClaim.processingToken;
      assert.ok(firstToken);
      await finishStripeEvent(`evt_${order.id}`, 'failed', env, {
        error: new Error('simulated transient failure'),
        processingToken: firstToken,
      });
      const retryClaim = await recordStripeEvent(
        {id: `evt_${order.id}`, type: 'test'},
        env,
      );
      assert.equal(retryClaim.state, 'claimed');
      if (retryClaim.state !== 'claimed') throw new Error('retry was not claimed');
      const retryToken = retryClaim.processingToken;
      assert.notEqual(retryToken, firstToken);
      await finishStripeEvent(`evt_${order.id}`, 'processed', env, {
        processingToken: retryToken,
      });

      const abandonedEventId = `evt_abandoned_${order.id}`;
      const abandonedClaim = await recordStripeEvent(
        {id: abandonedEventId, type: 'test'},
        env,
      );
      assert.equal(abandonedClaim.state, 'claimed');
      if (abandonedClaim.state !== 'claimed') {
        throw new Error('abandoned event was not claimed');
      }
      const abandonedToken = abandonedClaim.processingToken;
      await getDatabase(env)
        .update(stripeEvents)
        .set({processingStartedAt: new Date(Date.now() - 10 * 60 * 1000)})
        .where(eq(stripeEvents.id, abandonedEventId));
      const reclaimedClaim = await recordStripeEvent(
        {id: abandonedEventId, type: 'test'},
        env,
      );
      assert.equal(reclaimedClaim.state, 'claimed');
      if (reclaimedClaim.state !== 'claimed') {
        throw new Error('stale event was not reclaimed');
      }
      const reclaimedToken = reclaimedClaim.processingToken;
      assert.notEqual(reclaimedToken, abandonedToken);
      await finishStripeEvent(abandonedEventId, 'processed', env, {
        processingToken: abandonedToken,
      });
      const afterStaleFinish = await getDatabase(
        env,
      ).query.stripeEvents.findFirst({
        columns: {processingToken: true, status: true},
        where: eq(stripeEvents.id, abandonedEventId),
      });
      assert.deepEqual(afterStaleFinish, {
        processingToken: reclaimedToken,
        status: 'processing',
      });
      await finishStripeEvent(abandonedEventId, 'processed', env, {
        processingToken: reclaimedToken,
      });

      const sessionId = `cs_test_${order.id}`;
      await attachStripeSession(order.id, sessionId, env);
      const eventId = `evt_paid_${order.id}`;
      assert.equal(
        (
          await recordStripeEvent(
            {id: eventId, type: 'checkout.session.completed'},
            env,
          )
        ).state,
        'claimed',
      );
      let handoffs = 0;
      const session = {
        id: sessionId,
        client_reference_id: order.id,
        metadata: {
          source: 'codex-merch',
          order_id: order.id,
          catalog_revision: 'test-revision',
          policy_version: '2026-07-21',
        },
        consent: {terms_of_service: 'accepted'},
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
        customer_details: {email: 'buyer@example.com'},
      } as unknown as Stripe.Checkout.Session;
      let receipts = 0;
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
        async ({email, paymentIntentId, sessionId: receiptSessionId}) => {
          assert.equal(email, 'buyer@example.com');
          assert.equal(paymentIntentId, 'pi_test');
          assert.equal(receiptSessionId, sessionId);
          receipts += 1;
        },
      );
      assert.equal(handoffs, 1);
      assert.equal(receipts, 1);

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
      assert.equal(await requeueOrder(order.id, env), null);
      await markFulfillmentFailed(order.id, new Error('retry test'), env);
      assert.equal(
        (await getOrderById(order.id, env))?.fulfillmentStatus,
        'failed',
      );
      assert.notEqual(await requeueOrder(order.id, env), null);
      assert.equal(
        (await getOrderById(order.id, env))?.fulfillmentStatus,
        'queued',
      );

      const partial = await recordRefund({
        amountRefunded: 1000,
        env,
        orderId: order.id,
        paymentIntentId: 'pi_test',
        shippingAmount: 0,
        taxAmount: 0,
        totalAmount: 5800,
      });
      assert.equal(partial?.paymentStatus, 'partially_refunded');
      assert.equal(partial?.refundedAmount, 1000);
      assert.equal(partial?.fulfillmentStatus, 'cancelled');

      const stalePartial = await recordRefund({
        amountRefunded: 500,
        env,
        orderId: order.id,
        paymentIntentId: 'pi_test',
        shippingAmount: 0,
        taxAmount: 0,
        totalAmount: 5800,
      });
      assert.equal(stalePartial?.refundedAmount, 1000);

      const full = await recordRefund({
        amountRefunded: 5800,
        env,
        orderId: order.id,
        paymentIntentId: 'pi_test',
        shippingAmount: 0,
        taxAmount: 0,
        totalAmount: 5800,
      });
      assert.equal(full?.fullyRefunded, true);
      assert.equal(full?.paymentStatus, 'refunded');
      const fullReplay = await recordRefund({
        amountRefunded: 5800,
        env,
        orderId: order.id,
        paymentIntentId: 'pi_test',
        shippingAmount: 0,
        taxAmount: 0,
        totalAmount: 5800,
      });
      assert.equal(fullReplay?.fullyRefunded, true);

      const refundedBeforeCompletion = await createPendingOrder({
        catalogRevision: 'test-refund-first',
        currency: 'CHF',
        env,
        policyVersion: '2026-07-21',
        provider: 'printful',
        items: [
          {
            productSlug: 'test-refund-first',
            productTitle: 'Test Refund First',
            variantId: 'test-refund-first:1',
            variantLabel: 'Black / M',
            quantity: 1,
            unitAmount: 5800,
            currency: 'CHF',
            provider: 'printful',
            catalogVariantId: 1,
            syncVariantId: 2,
          },
        ],
      });
      createdOrderIds.push(refundedBeforeCompletion.id);
      const refundFirstSessionId = `cs_test_${refundedBeforeCompletion.id}`;
      await attachStripeSession(
        refundedBeforeCompletion.id,
        refundFirstSessionId,
        env,
      );
      await recordRefund({
        amountRefunded: 1000,
        env,
        orderId: refundedBeforeCompletion.id,
        paymentIntentId: 'pi_refund_first',
        shippingAmount: 910,
        taxAmount: 500,
        totalAmount: 6710,
      });
      const refundFirstOrder = await getOrderById(
        refundedBeforeCompletion.id,
        env,
      );
      assert.equal(refundFirstOrder?.paymentStatus, 'partially_refunded');
      assert.equal(refundFirstOrder?.totalAmount, 6710);
      assert.equal(refundFirstOrder?.taxAmount, 500);
      assert.equal(refundFirstOrder?.stripePaymentIntentId, 'pi_refund_first');

      let refundFirstHandoffs = 0;
      await processStripeEvent(
        {
          id: `evt_paid_${refundedBeforeCompletion.id}`,
          type: 'checkout.session.completed',
          data: {
            object: {
              id: refundFirstSessionId,
              client_reference_id: refundedBeforeCompletion.id,
              metadata: {
                source: 'codex-merch',
                order_id: refundedBeforeCompletion.id,
                catalog_revision: 'test-refund-first',
                policy_version: '2026-07-21',
              },
              consent: {terms_of_service: 'accepted'},
              payment_status: 'paid',
              currency: 'chf',
              amount_subtotal: 5800,
              amount_total: 6710,
              total_details: {
                amount_discount: 0,
                amount_shipping: 910,
                amount_tax: 500,
              },
              payment_intent: 'pi_refund_first',
              customer_details: {email: 'buyer@example.com'},
            },
          },
        } as unknown as Stripe.Event,
        env,
        async () => {
          refundFirstHandoffs += 1;
          return {ids: ['should-not-send']};
        },
        async () => undefined,
      );
      assert.equal(refundFirstHandoffs, 0);
      assert.equal(
        (await getOrderById(refundedBeforeCompletion.id, env))?.paymentStatus,
        'partially_refunded',
      );
    } finally {
      const db = getDatabase(env);
      for (const orderId of createdOrderIds) {
        await db.delete(stripeEvents).where(eq(stripeEvents.orderId, orderId));
        await db.delete(orders).where(eq(orders.id, orderId));
      }
      await db
        .delete(stripeEvents)
        .where(eq(stripeEvents.id, `evt_${order.id}`));
      await db
        .delete(stripeEvents)
        .where(eq(stripeEvents.id, `evt_abandoned_${order.id}`));
      await db
        .delete(stripeEvents)
        .where(eq(stripeEvents.id, `evt_paid_${order.id}`));
      await closeDatabases();
    }
  },
);
