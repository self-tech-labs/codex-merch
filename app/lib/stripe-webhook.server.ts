import type Stripe from 'stripe';
import {enqueueFulfillment} from '~/inngest/client.server';
import {
  getOrderById,
  markCheckoutExpired,
  markOrderPaid,
  restorePaymentAfterWonDispute,
  setPaymentState,
} from '~/lib/orders.server';
import {
  checkoutSessionForPaymentIntent,
  stripeClient,
} from '~/lib/stripe.server';

export async function processStripeEvent(
  event: Stripe.Event,
  env: AppEnv,
  handoff = enqueueFulfillment,
) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return processPaidSession(event.data.object, event.id, env, handoff);
    case 'checkout.session.async_payment_failed': {
      const session = event.data.object;
      const orderId = await verifiedSessionOrderId(session, env);
      if (orderId) await setPaymentState(orderId, 'failed', env);
      return orderId;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      const orderId = await verifiedSessionOrderId(session, env);
      if (orderId) await markCheckoutExpired(orderId, env);
      return orderId;
    }
    case 'charge.refunded': {
      const orderId = await orderIdFromCharge(event.data.object, env);
      if (orderId) await setPaymentState(orderId, 'refunded', env);
      return orderId;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const charge =
        typeof dispute.charge === 'string'
          ? await stripeClient(env).charges.retrieve(dispute.charge)
          : dispute.charge;
      const orderId = charge ? await orderIdFromCharge(charge, env) : null;
      if (orderId) await setPaymentState(orderId, 'disputed', env);
      return orderId;
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const charge =
        typeof dispute.charge === 'string'
          ? await stripeClient(env).charges.retrieve(dispute.charge)
          : dispute.charge;
      const orderId = charge ? await orderIdFromCharge(charge, env) : null;
      if (orderId && dispute.status === 'won') {
        await restorePaymentAfterWonDispute(orderId, env);
      }
      return orderId;
    }
    default:
      return null;
  }
}

async function processPaidSession(
  session: Stripe.Checkout.Session,
  stripeEventId: string,
  env: AppEnv,
  handoff: typeof enqueueFulfillment,
) {
  if (session.metadata?.source !== 'codex-merch') return null;
  const orderId = session.metadata.order_id;
  if (!orderId) throw new Error('Checkout session is missing order metadata');
  const order = await getOrderById(orderId, env);
  if (!order || order.stripeSessionId !== session.id) {
    throw new Error('Checkout session does not match a local order');
  }
  if (
    session.metadata.catalog_revision !== order.catalogRevision ||
    session.client_reference_id !== order.id
  ) {
    throw new Error('Checkout session metadata does not match the order');
  }
  if (session.payment_status !== 'paid') return orderId;
  if (session.currency?.toUpperCase() !== order.currency) {
    throw new Error('Checkout currency does not match the order');
  }
  if (session.amount_subtotal !== order.subtotalAmount) {
    throw new Error('Checkout subtotal does not match the order');
  }
  const totalAmount = session.amount_total;
  if (totalAmount === null || totalAmount < order.subtotalAmount) {
    throw new Error('Checkout total is invalid');
  }
  const shippingAmount = session.total_details?.amount_shipping || 0;
  const taxAmount = session.total_details?.amount_tax || 0;
  const discountAmount = session.total_details?.amount_discount || 0;
  if (
    discountAmount !== 0 ||
    order.subtotalAmount + shippingAmount + taxAmount !== totalAmount
  ) {
    throw new Error('Checkout total components do not match the order');
  }
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  await markOrderPaid({
    env,
    orderId,
    paymentIntentId,
    shippingAmount,
    stripeEventId,
    taxAmount,
    totalAmount,
  });
  await handoff({orderId, sessionId: session.id}, env);
  return orderId;
}

async function verifiedSessionOrderId(
  session: Stripe.Checkout.Session,
  env: AppEnv,
) {
  if (session.metadata?.source !== 'codex-merch') return null;
  const orderId = session.metadata.order_id;
  if (!orderId) return null;
  const order = await getOrderById(orderId, env);
  return order?.stripeSessionId === session.id ? orderId : null;
}

async function orderIdFromCharge(charge: Stripe.Charge, env: AppEnv) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;
  if (!paymentIntentId) return null;
  const session = await checkoutSessionForPaymentIntent(paymentIntentId, env);
  if (session?.metadata?.source !== 'codex-merch') return null;
  const orderId = session.metadata.order_id;
  if (!orderId) return null;
  const order = await getOrderById(orderId, env);
  return order?.stripeSessionId === session.id &&
    order.stripePaymentIntentId === paymentIntentId
    ? orderId
    : null;
}
