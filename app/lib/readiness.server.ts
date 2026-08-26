import {sql} from 'drizzle-orm';
import {getDatabase} from '~/db/client.server';
import {
  merchantCatalog,
  type MerchantCatalogProduct,
} from '~/lib/merchant-catalog';
import {assertStripePaymentMode, stripeClient} from '~/lib/stripe.server';

type ProbeDependencies = {
  databaseProbe?: (env: AppEnv) => Promise<void>;
  printfulProbe?: (
    env: AppEnv,
    approvedProduct: MerchantCatalogProduct,
  ) => Promise<void>;
  stripeProbe?: (env: AppEnv) => Promise<{
    livemode: boolean;
    webhookReady: boolean;
  }>;
};

const LIVE_PROBE_TIMEOUT_MS = 10_000;
export const REQUIRED_STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed',
] as const;

export async function probeCheckoutDependencies(
  env: AppEnv,
  {
    databaseProbe = probeDatabase,
    printfulProbe = probePrintful,
    stripeProbe = probeStripe,
  }: ProbeDependencies = {},
  approvedProduct: MerchantCatalogProduct = merchantCatalog.products[0],
) {
  const paymentMode = assertStripePaymentMode(env);
  const [, , stripe] = await Promise.all([
    withTimeout(databaseProbe(env), 'database'),
    withTimeout(printfulProbe(env, approvedProduct), 'Printful'),
    withTimeout(stripeProbe(env), 'Stripe'),
  ]);
  const expectedLiveMode = paymentMode === 'live';
  if (stripe.livemode !== expectedLiveMode) {
    throw new Error('Stripe key mode does not match the authenticated account mode');
  }

  return {
    databaseReady: true,
    printfulReady: true,
    stripeReady: true,
    stripeWebhookReady: stripe.webhookReady,
    paymentMode,
  } as const;
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
      ) as webhook_lease_ready,
      exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'order_items'
          and column_name = 'sync_variant_id'
          and data_type = 'bigint'
      ) as sync_variant_bigint_ready
  `);
  assertDatabaseReadinessRow(result.rows[0]);
}

type DatabaseReadinessRow = {
  ready?: number;
  orders_table?: string | null;
  order_items_table?: string | null;
  stripe_events_table?: string | null;
  refund_tracking_ready?: boolean;
  policy_version_ready?: boolean;
  webhook_lease_ready?: boolean;
  sync_variant_bigint_ready?: boolean;
};

export function assertDatabaseReadinessRow(value: unknown) {
  const row = value as DatabaseReadinessRow | undefined;
  if (
    Number(row?.ready) !== 1 ||
    !row?.orders_table ||
    !row.order_items_table ||
    !row.stripe_events_table ||
    !row.refund_tracking_ready ||
    !row.policy_version_ready ||
    !row.webhook_lease_ready ||
    !row.sync_variant_bigint_ready
  ) {
    throw new Error('Database is missing required checkout migrations');
  }
}

async function probeStripe(env: AppEnv) {
  if (!env.PUBLIC_SITE_URL) {
    throw new Error('Stripe readiness requires the canonical public site URL');
  }
  const client = stripeClient(env);
  const [account, balance, endpoints] = await Promise.all([
    client.accounts.retrieveCurrent(),
    client.balance.retrieve(),
    client.webhookEndpoints.list({limit: 100}),
  ]);
  const expectedWebhookUrl = new URL(
    '/api/stripe/webhook',
    env.PUBLIC_SITE_URL,
  ).toString();
  const webhook = endpoints.data.find((endpoint) => {
    const events = new Set(endpoint.enabled_events);
    return (
      endpoint.status === 'enabled' &&
      endpoint.url === expectedWebhookUrl &&
      (events.has('*') ||
        REQUIRED_STRIPE_WEBHOOK_EVENTS.every((event) => events.has(event)))
    );
  });
  if (!webhook) {
    throw new Error(
      'Stripe is missing the enabled canonical webhook destination or required events',
    );
  }
  if (!account.charges_enabled || !account.payouts_enabled) {
    throw new Error('Stripe live charges or payouts are not enabled');
  }
  return {
    livemode: balance.livemode,
    webhookReady: true,
  };
}

async function probePrintful(
  env: AppEnv,
  approvedProduct: MerchantCatalogProduct,
) {
  const response = await fetch(
    `https://api.printful.com/store/products/${approvedProduct.printfulProductId}`,
    {
      headers: {
        Authorization: `Bearer ${env.PRINTFUL_TOKEN || ''}`,
        'X-PF-Store-Id': env.PRINTFUL_STORE_ID || '',
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Printful readiness probe failed (${response.status})`);
  }
  const body = (await response.json()) as {
    result?: {
      sync_product?: {id?: number};
      sync_variants?: Array<{id?: number}>;
    };
  };
  if (body.result?.sync_product?.id !== approvedProduct.printfulProductId) {
    throw new Error('Printful readiness probe returned the wrong product');
  }
  const liveVariants = new Set(
    (body.result.sync_variants || []).map((variant) => variant.id),
  );
  if (
    approvedProduct.printfulVariants.some(
      (variant) => !liveVariants.has(variant.syncVariantId),
    )
  ) {
    throw new Error('Printful readiness probe is missing an approved variant');
  }
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
