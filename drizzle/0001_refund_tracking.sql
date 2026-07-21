ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'partially_refunded';
ALTER TYPE stripe_event_status ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS policy_version varchar(32);

UPDATE orders
SET policy_version = 'legacy-unversioned'
WHERE policy_version IS NULL;

ALTER TABLE orders
  ALTER COLUMN policy_version SET NOT NULL;

ALTER TABLE stripe_events
  ADD COLUMN IF NOT EXISTS processing_token text,
  ADD COLUMN IF NOT EXISTS processing_started_at timestamptz;

DO $$
BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_refunded_nonnegative CHECK (refunded_amount >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE orders
    ADD CONSTRAINT orders_refunded_not_above_total
    CHECK (refunded_amount <= total_amount);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
