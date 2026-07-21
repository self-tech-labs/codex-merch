import {sql} from 'drizzle-orm';
import {getDatabase} from '~/db/client.server';
import {stripeClient} from '~/lib/stripe.server';

type ProbeDependencies = {
  databaseProbe?: (env: AppEnv) => Promise<void>;
  stripeProbe?: (env: AppEnv) => Promise<{livemode: boolean}>;
};

const LIVE_PROBE_TIMEOUT_MS = 10_000;

export async function probeCheckoutDependencies(
  env: AppEnv,
  {
    databaseProbe = probeDatabase,
    stripeProbe = probeStripe,
  }: ProbeDependencies = {},
) {
  const paymentMode = stripePaymentMode(env.STRIPE_SECRET_KEY);
  const [, stripe] = await Promise.all([
    withTimeout(databaseProbe(env), 'database'),
    withTimeout(stripeProbe(env), 'Stripe'),
  ]);
  const expectedLiveMode = paymentMode === 'live';
  if (stripe.livemode !== expectedLiveMode) {
    throw new Error('Stripe key mode does not match the authenticated account mode');
  }

  return {
    databaseReady: true,
    stripeReady: true,
    paymentMode,
  } as const;
}

export function stripePaymentMode(secretKey: string | undefined) {
  const match = String(secretKey || '').match(
    /^sk_(test|live)_[A-Za-z0-9_]{16,}$/,
  );
  if (!match) throw new Error('Stripe secret key is not a live or test secret key');
  return match[1] as 'test' | 'live';
}

async function probeDatabase(env: AppEnv) {
  const result = await getDatabase(env).execute(sql`
    select
      1 as ready,
      to_regclass('public.orders')::text as orders_table,
      to_regclass('public.order_items')::text as order_items_table,
      to_regclass('public.stripe_events')::text as stripe_events_table,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'refunded_amount'
      ) as refund_tracking_ready,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'orders'
          and column_name = 'policy_version'
      ) as policy_version_ready,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'stripe_events'
          and column_name = 'processing_token'
      ) as webhook_lease_ready
  `);
  const row = result.rows[0] as
    | {
        ready?: number;
        orders_table?: string | null;
        order_items_table?: string | null;
        stripe_events_table?: string | null;
        refund_tracking_ready?: boolean;
        policy_version_ready?: boolean;
        webhook_lease_ready?: boolean;
      }
    | undefined;
  if (
    Number(row?.ready) !== 1 ||
    !row?.orders_table ||
    !row.order_items_table ||
    !row.stripe_events_table ||
    !row.refund_tracking_ready ||
    !row.policy_version_ready ||
    !row.webhook_lease_ready
  ) {
    throw new Error('Database is missing required checkout migrations');
  }
}

async function probeStripe(env: AppEnv) {
  const balance = await stripeClient(env).balance.retrieve();
  return {livemode: balance.livemode};
}

async function withTimeout<T>(promise: Promise<T>, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} readiness probe timed out`)),
          LIVE_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
