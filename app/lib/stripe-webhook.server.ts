import type Stripe from 'stripe';
import type {Order} from '~/db/schema.server';
import {enqueueFulfillment} from '~/inngest/client.server';
import {
  getOrderById,
  markCheckoutExpired,
  markOrderPaid,
  markPrintfulCommitted,
  recordRefund,
  restorePaymentAfterWonDispute,
  setPaymentState,
} from '~/lib/orders.server';
import {
  checkoutSessionForPaymentIntent,
  stripeClient,
} from '~/lib/stripe.server';
import {
  cancelPrintfulOrder,
  getPrintfulOrderState,
} from '~/lib/fulfillment.server';

export async function processStripeEvent(
  event: Stripe.Event,
  env: AppEnv,
  handoff = enqueueFulfillment,
  sendReceipt = sendStripeReceipt,
) {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded':
      return processPaidSession(
        event.data.object,
        env,
        handoff,
        sendReceipt,
      );
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
      const charge = event.data.object;
      const context = await orderContextFromCharge(charge, env);
      if (!context) return null;
      const payment = paidCheckoutSnapshot(context.session, context.order);
      if (!payment || payment.paymentIntentId !== context.paymentIntentId) {
        throw new Error('Refunded charge does not match a paid Checkout Session');
      }
      const refund = refundStateFromCharge(charge);
      if (payment.totalAmount !== refund.totalAmount) {
        throw new Error('Refunded charge total does not match Checkout');
      }

      const updated = await recordRefund({
        amountRefunded: refund.amountRefunded,
        env,
        orderId: context.order.id,
        paymentIntentId: payment.paymentIntentId,
        shippingAmount: payment.shippingAmount,
        taxAmount: payment.taxAmount,
        totalAmount: refund.totalAmount,
      });
      if (!updated) throw new Error('Refund does not match a refundable local order');
      await reconcileRefundedFulfillment(
        {...updated, orderId: context.order.id},
        env,
      );
      return context.order.id;
    }
    case 'charge.dispute.created': {
      const dispute = event.data.object;
      const charge =
        typeof dispute.charge === 'string'
          ? await stripeClient(env).charges.retrieve(dispute.charge)
          : dispute.charge;
      const orderId = charge
        ? (await orderContextFromCharge(charge, env))?.order.id || null
        : null;
      if (orderId) await setPaymentState(orderId, 'disputed', env);
      return orderId;
    }
    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      const charge =
        typeof dispute.charge === 'string'
          ? await stripeClient(env).charges.retrieve(dispute.charge)
          : dispute.charge;
      const orderId = charge
        ? (await orderContextFromCharge(charge, env))?.order.id || null
        : null;
      if (orderId && dispute.status === 'won') {
        await restorePaymentAfterWonDispute(orderId, env);
      }
      return orderId;
    }
    default:
      return null;
  }
}

export async function reconcileRefundedFulfillment(
  updated: {
    fullyRefunded: boolean;
    fulfillmentStatus: string;
    orderId: string;
    providerOrderId: string | null;
  },
  env: AppEnv,
  operations = {
    cancel: cancelPrintfulOrder,
    getState: getPrintfulOrderState,
    markCommitted: markPrintfulCommitted,
  },
) {
  if (!updated.providerOrderId || updated.fulfillmentStatus === 'confirmed') {
    return;
  }
  const providerState = await operations.getState(updated.providerOrderId, env);
  if (
    updated.fullyRefunded &&
    ['draft', 'pending'].includes(providerState.status)
  ) {
    await operations.cancel(updated.providerOrderId, env);
    return;
  }
  if (providerState.committed) {
    await operations.markCommitted(
      updated.orderId,
      updated.providerOrderId,
      env,
    );
  }
}

export function refundStateFromCharge(
  charge: Pick<Stripe.Charge, 'amount' | 'amount_refunded' | 'refunded'>,
) {
  const totalAmount = charge.amount;
  const amountRefunded = charge.amount_refunded;
  if (
    !Number.isInteger(totalAmount) ||
    !Number.isInteger(amountRefunded) ||
    totalAmount <= 0 ||
    amountRefunded <= 0 ||
    amountRefunded > totalAmount
  ) {
    throw new Error('Stripe refund amounts are invalid');
  }
  const fullyRefunded = amountRefunded === totalAmount;
  if (charge.refunded !== fullyRefunded) {
    throw new Error('Stripe refund state is inconsistent');
  }
  return {amountRefunded, fullyRefunded, totalAmount};
}

async function processPaidSession(
  session: Stripe.Checkout.Session,
  env: AppEnv,
  handoff: typeof enqueueFulfillment,
  sendReceipt: typeof sendStripeReceipt,
) {
  if (session.metadata?.source !== 'codex-merch') return null;
  const orderId = session.metadata.order_id;
  if (!orderId) throw new Error('Checkout session is missing order metadata');
  const order = await getOrderById(orderId, env);
  if (!order || order.stripeSessionId !== session.id) {
    throw new Error('Checkout session does not match a local order');
  }
  const payment = paidCheckoutSnapshot(session, order);
  if (!payment) return orderId;
  const receiptEmail = session.customer_details?.email;
  if (!receiptEmail) {
    throw new Error('Paid checkout is missing receipt details');
  }
  await sendReceipt(
    {
      email: receiptEmail,
      paymentIntentId: payment.paymentIntentId,
      sessionId: session.id,
    },
    env,
  );
  const newlyPaid = await markOrderPaid({
    env,
    orderId,
    paymentIntentId: payment.paymentIntentId,
    shippingAmount: payment.shippingAmount,
    taxAmount: payment.taxAmount,
    totalAmount: payment.totalAmount,
  });
  const currentPaymentStatus = newlyPaid
    ? 'paid'
    : (await getOrderById(orderId, env))?.paymentStatus;
  if (currentPaymentStatus === 'paid') {
    await handoff({orderId, sessionId: session.id}, env);
  }
  return orderId;
}

export function paidCheckoutSnapshot(
  session: Stripe.Checkout.Session,
  order: Order,
) {
  if (
    session.metadata?.catalog_revision !== order.catalogRevision ||
    session.client_reference_id !== order.id ||
    session.metadata?.policy_version !== order.policyVersion
  ) {
    throw new Error('Checkout session metadata does not match the order');
  }
  if (session.payment_status !== 'paid') return null;
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
    taxAmount < 0 ||
    taxAmount > totalAmount ||
    order.subtotalAmount + shippingAmount !== totalAmount
  ) {
    throw new Error('Checkout total components do not match the order');
  }
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) {
    throw new Error('Paid checkout is missing payment details');
  }
  return {
    paymentIntentId,
    shippingAmount,
    taxAmount,
    totalAmount,
  };
}

export async function sendStripeReceipt(
  {
    email,
    paymentIntentId,
    sessionId,
  }: {email: string; paymentIntentId: string; sessionId: string},
  env: AppEnv,
) {
  await stripeClient(env).paymentIntents.update(
    paymentIntentId,
    {receipt_email: email},
    {idempotencyKey: `receipt:${sessionId}`},
  );
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

async function orderContextFromCharge(charge: Stripe.Charge, env: AppEnv) {
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
  const sessionPaymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (
    !order ||
    order.stripeSessionId !== session.id ||
    sessionPaymentIntentId !== paymentIntentId ||
    (order.stripePaymentIntentId &&
      order.stripePaymentIntentId !== paymentIntentId)
  ) {
    return null;
  }
  return {order, paymentIntentId, session};
}
