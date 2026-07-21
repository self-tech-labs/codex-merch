import {sql} from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const checkoutStatus = pgEnum('checkout_status', [
  'creating',
  'open',
  'complete',
  'expired',
  'failed',
]);
export const paymentStatus = pgEnum('payment_status', [
  'pending',
  'paid',
  'failed',
  'partially_refunded',
  'refunded',
  'disputed',
]);
export const fulfillmentStatus = pgEnum('fulfillment_status', [
  'not_ready',
  'queued',
  'processing',
  'draft_created',
  'confirmed',
  'failed',
  'cancelled',
]);
export const stripeEventStatus = pgEnum('stripe_event_status', [
  'received',
  'processing',
  'processed',
  'ignored',
  'failed',
]);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey(),
    publicReference: varchar('public_reference', {length: 24}).notNull(),
    catalogRevision: varchar('catalog_revision', {length: 64}).notNull(),
    policyVersion: varchar('policy_version', {length: 32}).notNull(),
    stripeSessionId: text('stripe_session_id'),
    stripePaymentIntentId: text('stripe_payment_intent_id'),
    checkoutStatus: checkoutStatus('checkout_status').notNull().default('creating'),
    paymentStatus: paymentStatus('payment_status').notNull().default('pending'),
    fulfillmentStatus: fulfillmentStatus('fulfillment_status')
      .notNull()
      .default('not_ready'),
    currency: varchar('currency', {length: 3}).notNull(),
    subtotalAmount: integer('subtotal_amount').notNull(),
    shippingAmount: integer('shipping_amount').notNull().default(0),
    taxAmount: integer('tax_amount').notNull().default(0),
    refundedAmount: integer('refunded_amount').notNull().default(0),
    totalAmount: integer('total_amount').notNull(),
    provider: varchar('provider', {length: 32}).notNull(),
    providerOrderId: text('provider_order_id'),
    fulfillmentRunId: text('fulfillment_run_id'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', {withTimezone: true}).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', {withTimezone: true}).notNull().defaultNow(),
    paidAt: timestamp('paid_at', {withTimezone: true}),
    fulfilledAt: timestamp('fulfilled_at', {withTimezone: true}),
  },
  (table) => [
    uniqueIndex('orders_public_reference_unique').on(table.publicReference),
    uniqueIndex('orders_stripe_session_unique').on(table.stripeSessionId),
    uniqueIndex('orders_provider_order_unique').on(
      table.provider,
      table.providerOrderId,
    ),
    index('orders_fulfillment_status_idx').on(table.fulfillmentStatus),
    check('orders_subtotal_nonnegative', sql`${table.subtotalAmount} >= 0`),
    check('orders_shipping_nonnegative', sql`${table.shippingAmount} >= 0`),
    check('orders_tax_nonnegative', sql`${table.taxAmount} >= 0`),
    check('orders_refunded_nonnegative', sql`${table.refundedAmount} >= 0`),
    check(
      'orders_refunded_not_above_total',
      sql`${table.refundedAmount} <= ${table.totalAmount}`,
    ),
    check('orders_total_nonnegative', sql`${table.totalAmount} >= 0`),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, {onDelete: 'cascade'}),
    productSlug: text('product_slug').notNull(),
    productTitle: text('product_title').notNull(),
    variantId: text('variant_id').notNull(),
    variantLabel: text('variant_label').notNull(),
    quantity: integer('quantity').notNull(),
    unitAmount: integer('unit_amount').notNull(),
    currency: varchar('currency', {length: 3}).notNull(),
    provider: varchar('provider', {length: 32}).notNull(),
    catalogVariantId: integer('catalog_variant_id').notNull(),
    syncVariantId: bigint('sync_variant_id', {mode: 'number'}).notNull(),
  },
  (table) => [
    index('order_items_order_id_idx').on(table.orderId),
    uniqueIndex('order_items_order_variant_unique').on(
      table.orderId,
      table.productSlug,
      table.variantId,
    ),
    check('order_items_quantity_valid', sql`${table.quantity} BETWEEN 1 AND 10`),
    check('order_items_unit_amount_positive', sql`${table.unitAmount} > 0`),
    check('order_items_catalog_variant_positive', sql`${table.catalogVariantId} > 0`),
    check('order_items_sync_variant_positive', sql`${table.syncVariantId} > 0`),
  ],
);

export const stripeEvents = pgTable(
  'stripe_events',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    orderId: uuid('order_id').references(() => orders.id, {onDelete: 'set null'}),
    status: stripeEventStatus('status').notNull().default('received'),
    processingToken: text('processing_token'),
    processingStartedAt: timestamp('processing_started_at', {withTimezone: true}),
    lastError: text('last_error'),
    receivedAt: timestamp('received_at', {withTimezone: true}).notNull().defaultNow(),
    processedAt: timestamp('processed_at', {withTimezone: true}),
  },
  (table) => [index('stripe_events_order_id_idx').on(table.orderId)],
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
