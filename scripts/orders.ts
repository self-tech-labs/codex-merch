import {closeDatabases} from '../app/db/client.server';
import {enqueueFulfillment} from '../app/inngest/client.server';
import {
  getOrderById,
  getOrderByReference,
  getOrderItems,
  markOrderPaid,
  markPrintfulCommitted,
  requeueOrder,
} from '../app/lib/orders.server';
import {retrieveCheckoutSession} from '../app/lib/stripe.server';
import {paidCheckoutSnapshot} from '../app/lib/stripe-webhook.server';
import {getPrintfulOrderState} from '../app/lib/fulfillment.server';

const rawArgs = process.argv.slice(2);
const productionAcknowledged = rawArgs.includes('--production');
const [command, identifier, ...extraArgs] = rawArgs.filter(
  (argument) => argument !== '--production',
);
if (!command || !identifier || extraArgs.length) {
  throw new Error(
    'Usage: npm run orders:<inspect|retry|reconcile> -- <order-id-or-reference> [--production]',
  );
}

const operationsTarget = process.env.ORDER_OPERATIONS_TARGET;
if (!['development', 'staging', 'production'].includes(operationsTarget || '')) {
  throw new Error(
    'ORDER_OPERATIONS_TARGET must explicitly be development, staging, or production',
  );
}
if (operationsTarget === 'production') {
  if (!productionAcknowledged) {
    throw new Error('Production order operations require the --production acknowledgement');
  }
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Production order operations require NODE_ENV=production');
  }
} else if (productionAcknowledged) {
  throw new Error('--production does not match ORDER_OPERATIONS_TARGET');
}
if (
  ['retry', 'reconcile'].includes(command) &&
  operationsTarget !== 'development' &&
  process.env.NODE_ENV !== 'production'
) {
  throw new Error('Cloud staging/production mutations require NODE_ENV=production');
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (
  ['retry', 'reconcile'].includes(command) &&
  !process.env.INNGEST_EVENT_KEY
) {
  throw new Error('Retry/reconcile requires the target Inngest Event Key');
}
if (command === 'reconcile') {
  if (process.env.STOREFRONT_MODE !== 'production') {
    throw new Error('Reconcile requires STOREFRONT_MODE=production');
  }
  if (process.env.PRINTFUL_AUTO_CONFIRM !== 'false') {
    throw new Error('Reconcile requires PRINTFUL_AUTO_CONFIRM=false');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Reconcile requires the target Stripe secret key');
  }
  if (
    operationsTarget === 'production' &&
    !process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')
  ) {
    throw new Error('Production reconcile requires a live Stripe secret key');
  }
  if (
    operationsTarget !== 'production' &&
    process.env.STRIPE_SECRET_KEY.startsWith('sk_live_')
  ) {
    throw new Error('A live Stripe secret cannot be used outside the production target');
  }
}

let databaseTarget: URL;
try {
  databaseTarget = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error('DATABASE_URL must be a valid absolute Postgres URL');
}
if (!['postgres:', 'postgresql:'].includes(databaseTarget.protocol)) {
  throw new Error('DATABASE_URL must use the postgres or postgresql protocol');
}
const sanitizedDatabaseTarget = `${databaseTarget.hostname}${databaseTarget.pathname}`;
const expectedDatabaseTarget =
  process.env.ORDER_OPERATIONS_EXPECTED_DATABASE?.trim();
if (operationsTarget !== 'development' && !expectedDatabaseTarget) {
  throw new Error(
    'Cloud order operations require ORDER_OPERATIONS_EXPECTED_DATABASE=<hostname>/<database>',
  );
}
if (
  expectedDatabaseTarget &&
  expectedDatabaseTarget !== sanitizedDatabaseTarget
) {
  throw new Error(
    `Database target mismatch: expected ${expectedDatabaseTarget}; received ${sanitizedDatabaseTarget}`,
  );
}
console.error(
  `Verified order operations target: ${operationsTarget}; database: ${sanitizedDatabaseTarget}`,
);

try {
  const order = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(identifier)
    ? await getOrderById(identifier, process.env)
    : await getOrderByReference(identifier, process.env);
  if (!order) throw new Error(`Order not found: ${identifier}`);

  if (command === 'inspect') {
    const items = await getOrderItems(order.id, process.env);
    console.log(JSON.stringify({order, items}, null, 2));
  } else if (command === 'retry') {
    if (!order.stripeSessionId) throw new Error('Order has no Stripe session');
    const attempt = await requeueOrder(order.id, process.env);
    if (attempt === null) {
      throw new Error('Only paid orders can be requeued');
    }
    await enqueueFulfillment(
      {orderId: order.id, sessionId: order.stripeSessionId},
      process.env,
      attempt,
    );
    console.log(`Requeued ${order.publicReference}.`);
  } else if (command === 'reconcile') {
    if (!order.stripeSessionId) throw new Error('Order has no Stripe session');
    const session = await retrieveCheckoutSession(order.stripeSessionId, process.env);
    if (session.payment_status === 'paid' && order.paymentStatus === 'pending') {
      const payment = paidCheckoutSnapshot(session, order);
      if (!payment) throw new Error('Stripe Checkout Session is not paid');
      await markOrderPaid({
        env: process.env,
        orderId: order.id,
        paymentIntentId: payment.paymentIntentId,
        shippingAmount: payment.shippingAmount,
        taxAmount: payment.taxAmount,
        totalAmount: payment.totalAmount,
      });
      await enqueueFulfillment(
        {orderId: order.id, sessionId: session.id},
        process.env,
      );
      console.log(`Reconciled and queued ${order.publicReference}.`);
    } else if (order.providerOrderId) {
      if (!process.env.PRINTFUL_TOKEN || !process.env.PRINTFUL_STORE_ID) {
        throw new Error(
          'Reconciling an order with a provider draft requires the target Printful token and store ID',
        );
      }
      const provider = await getPrintfulOrderState(
        order.providerOrderId,
        process.env,
      );
      if (provider.committed && order.fulfillmentStatus !== 'confirmed') {
        await markPrintfulCommitted(order.id, order.providerOrderId, process.env);
      }
      console.log(JSON.stringify({
        reference: order.publicReference,
        localPayment: order.paymentStatus,
        localFulfillment: provider.committed
          ? 'confirmed'
          : order.fulfillmentStatus,
        printfulStatus: provider.status,
        stripePayment: session.payment_status,
      }, null, 2));
    } else {
      console.log(JSON.stringify({
        reference: order.publicReference,
        localPayment: order.paymentStatus,
        stripePayment: session.payment_status,
        fulfillment: order.fulfillmentStatus,
      }, null, 2));
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} finally {
  await closeDatabases();
}
