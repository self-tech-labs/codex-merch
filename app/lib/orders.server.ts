import {randomUUID} from 'node:crypto';
import {and, eq, inArray, isNull, lt, or, sql} from 'drizzle-orm';
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
  policyVersion,
  provider,
}: {
  catalogRevision: string;
  currency: string;
  env: AppEnv;
  items: CheckoutItemSnapshot[];
  policyVersion: string;
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
      policyVersion,
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
  const processingToken = randomUUID();
  const processingStartedAt = new Date();
  const inserted = await db
    .insert(stripeEvents)
    .values({
      id: event.id,
      type: event.type,
      status: 'processing',
      processingToken,
      processingStartedAt,
    })
    .onConflictDoNothing()
    .returning({id: stripeEvents.id});
  if (inserted.length > 0) {
    return {state: 'claimed' as const, processingToken};
  }
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
  const retried = await db
    .update(stripeEvents)
    .set({
      status: 'processing',
      processingToken,
      processingStartedAt,
      lastError: null,
      processedAt: null,
    })
    .where(
      and(
        eq(stripeEvents.id, event.id),
        or(
          eq(stripeEvents.status, 'failed'),
          eq(stripeEvents.status, 'received'),
          and(
            eq(stripeEvents.status, 'processing'),
            lt(stripeEvents.processingStartedAt, staleBefore),
          ),
        ),
      ),
    )
    .returning({id: stripeEvents.id});
  if (retried.length > 0) {
    return {state: 'claimed' as const, processingToken};
  }
  const existing = await db.query.stripeEvents.findFirst({
    columns: {status: true},
    where: eq(stripeEvents.id, event.id),
  });
  if (existing && ['processed', 'ignored'].includes(existing.status)) {
    return {state: 'complete' as const};
  }
  return {state: 'busy' as const};
}

export async function finishStripeEvent(
  eventId: string,
  status: 'processed' | 'ignored' | 'failed',
  env: AppEnv,
  options: {error?: unknown; orderId?: string; processingToken: string},
) {
  await getDatabase(env)
    .update(stripeEvents)
    .set({
      status,
      orderId: options.orderId,
      processingToken: null,
      processingStartedAt: null,
      lastError: options.error ? safeError(options.error) : null,
      processedAt: new Date(),
    })
    .where(
      and(
        eq(stripeEvents.id, eventId),
        eq(stripeEvents.status, 'processing'),
        eq(stripeEvents.processingToken, options.processingToken),
      ),
    );
}

export async function markOrderPaid({
  env,
  orderId,
  paymentIntentId,
  shippingAmount,
  taxAmount,
  totalAmount,
}: {
  env: AppEnv;
  orderId: string;
  paymentIntentId?: string | null;
  shippingAmount: number;
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
    return updated.length > 0;
  });
}

export async function setPaymentState(
  orderId: string,
  payment: 'failed' | 'disputed',
  env: AppEnv,
) {
  const currentState =
    payment === 'failed'
      ? eq(orders.paymentStatus, 'pending')
      : inArray(orders.paymentStatus, ['paid', 'partially_refunded']);
  await getDatabase(env)
    .update(orders)
    .set({
      paymentStatus: payment,
      fulfillmentStatus: payment === 'failed' ? 'cancelled' : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(orders.id, orderId), currentState));
}

export async function recordRefund(
  {
    amountRefunded,
    env,
    orderId,
    paymentIntentId,
    shippingAmount,
    taxAmount,
    totalAmount,
  }: {
    amountRefunded: number;
    env: AppEnv;
    orderId: string;
    paymentIntentId: string;
    shippingAmount: number;
    taxAmount: number;
    totalAmount: number;
  },
) {
  if (
    !Number.isInteger(amountRefunded) ||
    !Number.isInteger(totalAmount) ||
    !Number.isInteger(shippingAmount) ||
    !Number.isInteger(taxAmount) ||
    amountRefunded <= 0 ||
    totalAmount <= 0 ||
    shippingAmount < 0 ||
    taxAmount < 0 ||
    !paymentIntentId ||
    amountRefunded > totalAmount
  ) {
    throw new Error('Stripe refund amounts are invalid');
  }
  const fullyRefunded = amountRefunded === totalAmount;
  const db = getDatabase(env);
  const updated = await db
    .update(orders)
    .set({
      stripePaymentIntentId: paymentIntentId,
      checkoutStatus: 'complete',
      paymentStatus: fullyRefunded ? 'refunded' : 'partially_refunded',
      refundedAmount: amountRefunded,
      shippingAmount,
      taxAmount,
      totalAmount,
      paidAt: sql`coalesce(${orders.paidAt}, now())`,
      fulfillmentStatus: sql`
        case
          when ${orders.fulfillmentStatus} = 'confirmed'::fulfillment_status
            then ${orders.fulfillmentStatus}
          else 'cancelled'::fulfillment_status
        end
      `,
      lastError: fullyRefunded
        ? 'Full refund recorded; unconfirmed fulfillment cancelled'
        : 'Partial refund requires manual fulfillment review',
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(orders.id, orderId),
        or(
          and(
            eq(orders.paymentStatus, 'pending'),
            sql`${orders.subtotalAmount} + ${shippingAmount} = ${totalAmount}`,
          ),
          and(
            eq(orders.totalAmount, totalAmount),
            inArray(orders.paymentStatus, [
              'paid',
              'disputed',
              'partially_refunded',
              'refunded',
            ]),
          ),
        ),
        or(
          isNull(orders.stripePaymentIntentId),
          eq(orders.stripePaymentIntentId, paymentIntentId),
        ),
        sql`${orders.refundedAmount} <= ${amountRefunded}`,
      ),
    )
    .returning({
      fulfillmentStatus: orders.fulfillmentStatus,
      paymentStatus: orders.paymentStatus,
      providerOrderId: orders.providerOrderId,
      refundedAmount: orders.refundedAmount,
    });
  if (updated[0]) {
    return {
      ...updated[0],
      fullyRefunded: updated[0].refundedAmount === totalAmount,
    };
  }

  // Stripe refund snapshots are cumulative and may arrive out of order. A
  // stale or repeated snapshot is already handled when the local cumulative
  // amount is equal or greater; other state mismatches remain retryable.
  const current = await getOrderById(orderId, env);
  if (
    current?.totalAmount === totalAmount &&
    current.stripePaymentIntentId === paymentIntentId &&
    current.refundedAmount >= amountRefunded &&
    ['partially_refunded', 'refunded'].includes(current.paymentStatus)
  ) {
    return {
      fulfillmentStatus: current.fulfillmentStatus,
      paymentStatus: current.paymentStatus,
      providerOrderId: current.providerOrderId,
      refundedAmount: current.refundedAmount,
      fullyRefunded: current.refundedAmount === totalAmount,
    };
  }
  return null;
}

export async function markPrintfulCommitted(
  orderId: string,
  providerOrderId: string,
  env: AppEnv,
) {
  const updated = await getDatabase(env)
    .update(orders)
    .set({
      fulfillmentStatus: 'confirmed',
      fulfilledAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.providerOrderId, providerOrderId),
      ),
    )
    .returning({id: orders.id});
  return updated.length > 0;
}

export async function restorePaymentAfterWonDispute(
  orderId: string,
  env: AppEnv,
) {
  await getDatabase(env)
    .update(orders)
    .set({
      paymentStatus: sql`
        case
          when ${orders.refundedAmount} > 0
            then 'partially_refunded'::payment_status
          else 'paid'::payment_status
        end
      `,
      updatedAt: new Date(),
    })
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
  const updated = await getDatabase(env)
    .update(orders)
    .set({
      providerOrderId,
      fulfillmentStatus: confirmed ? 'confirmed' : 'draft_created',
      fulfillmentRunId: null,
      fulfilledAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
    })
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'paid'),
        confirmed
          ? or(
              and(
                eq(orders.fulfillmentStatus, 'draft_created'),
                eq(orders.providerOrderId, providerOrderId),
              ),
              and(
                eq(orders.fulfillmentStatus, 'processing'),
                isNull(orders.providerOrderId),
              ),
            )
          : eq(orders.fulfillmentStatus, 'processing'),
      ),
    )
    .returning({id: orders.id});
  return updated.length > 0;
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
    .where(
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'paid'),
        inArray(orders.fulfillmentStatus, ['queued', 'processing']),
      ),
    );
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
      and(
        eq(orders.id, orderId),
        eq(orders.paymentStatus, 'paid'),
        eq(orders.fulfillmentStatus, 'failed'),
      ),
    )
    .returning({attempt: orders.retryCount});
  return result[0]?.attempt ?? null;
}

function safeError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 2000);
}
