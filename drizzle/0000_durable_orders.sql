CREATE TYPE "checkout_status" AS ENUM ('creating', 'open', 'complete', 'expired', 'failed');
CREATE TYPE "payment_status" AS ENUM ('pending', 'paid', 'failed', 'refunded', 'disputed');
CREATE TYPE "fulfillment_status" AS ENUM ('not_ready', 'queued', 'processing', 'draft_created', 'confirmed', 'failed', 'cancelled');
CREATE TYPE "stripe_event_status" AS ENUM ('received', 'processed', 'ignored', 'failed');

CREATE TABLE "orders" (
  "id" uuid PRIMARY KEY,
  "public_reference" varchar(24) NOT NULL,
  "catalog_revision" varchar(64) NOT NULL,
  "stripe_session_id" text,
  "stripe_payment_intent_id" text,
  "checkout_status" "checkout_status" NOT NULL DEFAULT 'creating',
  "payment_status" "payment_status" NOT NULL DEFAULT 'pending',
  "fulfillment_status" "fulfillment_status" NOT NULL DEFAULT 'not_ready',
  "currency" varchar(3) NOT NULL,
  "subtotal_amount" integer NOT NULL CHECK ("subtotal_amount" >= 0),
  "shipping_amount" integer NOT NULL DEFAULT 0 CHECK ("shipping_amount" >= 0),
  "tax_amount" integer NOT NULL DEFAULT 0 CHECK ("tax_amount" >= 0),
  "total_amount" integer NOT NULL CHECK ("total_amount" >= 0),
  "provider" varchar(32) NOT NULL,
  "provider_order_id" text,
  "fulfillment_run_id" text,
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "paid_at" timestamptz,
  "fulfilled_at" timestamptz
);

CREATE UNIQUE INDEX "orders_public_reference_unique" ON "orders" ("public_reference");
CREATE UNIQUE INDEX "orders_stripe_session_unique" ON "orders" ("stripe_session_id");
CREATE UNIQUE INDEX "orders_provider_order_unique" ON "orders" ("provider", "provider_order_id");
CREATE INDEX "orders_fulfillment_status_idx" ON "orders" ("fulfillment_status");

CREATE TABLE "order_items" (
  "id" uuid PRIMARY KEY,
  "order_id" uuid NOT NULL REFERENCES "orders" ("id") ON DELETE CASCADE,
  "product_slug" text NOT NULL,
  "product_title" text NOT NULL,
  "variant_id" text NOT NULL,
  "variant_label" text NOT NULL,
  "quantity" integer NOT NULL CHECK ("quantity" BETWEEN 1 AND 10),
  "unit_amount" integer NOT NULL CHECK ("unit_amount" > 0),
  "currency" varchar(3) NOT NULL,
  "provider" varchar(32) NOT NULL,
  "catalog_variant_id" integer NOT NULL CHECK ("catalog_variant_id" > 0),
  "sync_variant_id" integer NOT NULL CHECK ("sync_variant_id" > 0)
);
CREATE INDEX "order_items_order_id_idx" ON "order_items" ("order_id");
CREATE UNIQUE INDEX "order_items_order_variant_unique" ON "order_items" ("order_id", "product_slug", "variant_id");

CREATE TABLE "stripe_events" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL,
  "order_id" uuid REFERENCES "orders" ("id") ON DELETE SET NULL,
  "status" "stripe_event_status" NOT NULL DEFAULT 'received',
  "last_error" text,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "processed_at" timestamptz
);
CREATE INDEX "stripe_events_order_id_idx" ON "stripe_events" ("order_id");
