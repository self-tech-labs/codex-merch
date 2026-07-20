import {randomUUID} from 'node:crypto';
import {and, eq, or, sql} from 'drizzle-orm';
import {getDatabase} from '~/db/client.server';
import {
  orderItems,
  orders,
  stripeEvents,
  type NewOrderItem,
} from '~/db/schema.server';

export type CheckoutItemSnapshot = Omit<NewOrderItem, 'id' | 'orderId'>;

export async function createPendingOrder({
  catalogRevision,
  currency,
  env,
  items,
  provider,
}: {
  catalogRevision: string;
  currency: string;
  env: AppEnv;
  items: CheckoutItemSnapshot[];
  provider: string;
}) {
  if (!items.length || items.length > 10) {
    throw new Error('An order must contain between 1 and 10 unique lines');
  }
  const keys = new Set<string>();
  for (const item of items) {
    const key = `${item.productSlug}:${item.variantId}`;
    if (keys.has(key)) throw new Error(`Duplicate order item: ${key}`);
    keys.add(key);
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10 ||
      !Number.isInteger(item.unitAmount) ||
      item.unitAmount < 1 ||
      item.currency !== currency ||
      item.provider !== provider
    ) {
      throw new Error(`Invalid order item snapshot: ${key}`);
    }
  }
  const db = getDatabase(env);
  const id = randomUUID();
  const publicReference = `CM-${id.replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const subtotalAmount = items.reduce(
    (sum, item) => sum + item.unitAmount * item.quantity,
    0,
  );

  await db.transaction(async (transaction) => {
    await transaction.insert(orders).values({
      id,
      publicReference,
      catalogRevision,
      currency,
      subtotalAmount,
      totalAmount: subtotalAmount,
      provider,
    });
    await transaction.insert(orderItems).values(
      items.map((item) => ({...item, id: randomUUID(), orderId: id})),
    );
  });

  return {id, publicReference, subtotalAmount};
}

export async function attachStripeSession(
  orderId: string,
  sessionId: string,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({stripeSessionId: sessionId, checkoutStatus: 'open', updatedAt: new Date()})
    .where(eq(orders.id, orderId));
}

export async function markCheckoutCreationFailed(
  orderId: string,
  error: unknown,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({
      checkoutStatus: 'failed',
      lastError: safeError(error),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

export async function getOrderById(orderId: string, env: AppEnv) {
  return getDatabase(env).query.orders.findFirst({
    where: eq(orders.id, orderId),
  });
}

export async function getOrderBySession(sessionId: string, env: AppEnv) {
  return getDatabase(env).query.orders.findFirst({
    where: eq(orders.stripeSessionId, sessionId),
  });
}

export async function getOrderByReference(reference: string, env: AppEnv) {
  return getDatabase(env).query.orders.findFirst({
    where: eq(orders.publicReference, reference),
  });
}

export async function getOrderItems(orderId: string, env: AppEnv) {
  return getDatabase(env).query.orderItems.findMany({
    where: eq(orderItems.orderId, orderId),
  });
}

export async function recordStripeEvent(
  event: {id: string; type: string},
  env: AppEnv,
) {
  const db = getDatabase(env);
  const inserted = await db
    .insert(stripeEvents)
    .values({id: event.id, type: event.type})
    .onConflictDoNothing()
    .returning({id: stripeEvents.id});
  if (inserted.length > 0) return true;
  const retried = await db
    .update(stripeEvents)
    .set({status: 'received', lastError: null, processedAt: null})
    .where(
      and(
        eq(stripeEvents.id, event.id),
        eq(stripeEvents.status, 'failed'),
      ),
    )
    .returning({id: stripeEvents.id});
  return retried.length > 0;
}

export async function finishStripeEvent(
  eventId: string,
  status: 'processed' | 'ignored' | 'failed',
  env: AppEnv,
  options: {error?: unknown; orderId?: string} = {},
) {
  await getDatabase(env)
    .update(stripeEvents)
    .set({
      status,
      orderId: options.orderId,
      lastError: options.error ? safeError(options.error) : null,
      processedAt: new Date(),
    })
    .where(eq(stripeEvents.id, eventId));
}

export async function markOrderPaid({
  env,
  orderId,
  paymentIntentId,
  shippingAmount,
  stripeEventId,
  taxAmount,
  totalAmount,
}: {
  env: AppEnv;
  orderId: string;
  paymentIntentId?: string | null;
  shippingAmount: number;
  stripeEventId?: string;
  taxAmount: number;
  totalAmount: number;
}) {
  const db = getDatabase(env);
  return db.transaction(async (transaction) => {
    const updated = await transaction
      .update(orders)
      .set({
      stripePaymentIntentId: paymentIntentId || null,
      checkoutStatus: 'complete',
      paymentStatus: 'paid',
      fulfillmentStatus: 'queued',
      shippingAmount,
      taxAmount,
      totalAmount,
      paidAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
      .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'pending'),
      ),
    )
      .returning({id: orders.id});
    if (stripeEventId) {
      await transaction
        .update(stripeEvents)
        .set({
          orderId,
          status: 'processed',
          lastError: null,
          processedAt: new Date(),
        })
        .where(eq(stripeEvents.id, stripeEventId));
    }
    return updated.length > 0;
  });
}

export async function setPaymentState(
  orderId: string,
  payment: 'failed' | 'refunded' | 'disputed',
  env: AppEnv,
) {
  const currentState =
    payment === 'failed'
      ? eq(orders.paymentStatus, 'pending')
      : payment === 'refunded'
        ? or(
            eq(orders.paymentStatus, 'paid'),
            eq(orders.paymentStatus, 'disputed'),
          )
        : eq(orders.paymentStatus, 'paid');
  await getDatabase(env)
    .update(orders)
    .set({
      paymentStatus: payment,
      fulfillmentStatus: payment === 'failed' ? 'cancelled' : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, orderId), currentState));
}

export async function restorePaymentAfterWonDispute(
  orderId: string,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({paymentStatus: 'paid', updatedAt: new Date()})
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'disputed'),
      ),
    );
}

export async function markCheckoutExpired(orderId: string, env: AppEnv) {
  await getDatabase(env)
    .update(orders)
    .set({checkoutStatus: 'expired', fulfillmentStatus: 'cancelled', updatedAt: new Date()})
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'pending'),
      ),
    );
}

export async function claimFulfillment(
  orderId: string,
  runId: string,
  env: AppEnv,
) {
  const claimed = await getDatabase(env)
    .update(orders)
    .set({
      fulfillmentStatus: 'processing',
      fulfillmentRunId: runId,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'paid'),
        or(
          eq(orders.fulfillmentStatus, 'queued'),
          eq(orders.fulfillmentRunId, runId),
        ),
      ),
    )
    .returning({id: orders.id});
  return claimed.length > 0;
}

export async function markPrintfulCreated(
  orderId: string,
  providerOrderId: string,
  confirmed: boolean,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({
      providerOrderId,
      fulfillmentStatus: confirmed ? 'confirmed' : 'draft_created',
      fulfillmentRunId: null,
      fulfilledAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(eq(orders.id, orderId));
}

export async function markFulfillmentFailed(
  orderId: string,
  error: unknown,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({
      fulfillmentStatus: 'failed',
      fulfillmentRunId: null,
      retryCount: sql`${orders.retryCount} + 1`,
      lastError: safeError(error),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));
}

export async function requeueOrder(orderId: string, env: AppEnv) {
  const result = await getDatabase(env)
    .update(orders)
    .set({
      fulfillmentStatus: 'queued',
      fulfillmentRunId: null,
      retryCount: sql`${orders.retryCount} + 1`,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(
      and(eq(orders.id, orderId), eq(orders.paymentStatus, 'paid')),
    )
    .returning({attempt: orders.retryCount});
  return result[0]?.attempt ?? null;
}

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 2000);
}
