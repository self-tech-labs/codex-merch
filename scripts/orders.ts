import {closeDatabases} from '../app/db/client.server';
import {enqueueFulfillment} from '../app/inngest/client.server';
import {
  getOrderById,
  getOrderByReference,
  getOrderItems,
  markOrderPaid,
  requeueOrder,
} from '../app/lib/orders.server';
import {retrieveCheckoutSession} from '../app/lib/stripe.server';

const [command, identifier] = process.argv.slice(2);
if (!command || !identifier) {
  throw new Error('Usage: npm run orders:<inspect|retry|reconcile> -- <order-id-or-reference>');
}

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
      if (session.amount_subtotal !== order.subtotalAmount || session.amount_total === null) {
        throw new Error('Stripe totals do not match the local order');
      }
      await markOrderPaid({
        env: process.env,
        orderId: order.id,
        paymentIntentId:
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id,
        shippingAmount: session.total_details?.amount_shipping || 0,
        taxAmount: session.total_details?.amount_tax || 0,
        totalAmount: session.amount_total,
      });
      await enqueueFulfillment(
        {orderId: order.id, sessionId: session.id},
        process.env,
      );
      console.log(`Reconciled and queued ${order.publicReference}.`);
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
