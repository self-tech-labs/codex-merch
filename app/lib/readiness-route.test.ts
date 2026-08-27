import assert from 'node:assert/strict';
import test from 'node:test';
import {merchantCatalog} from './merchant-catalog';
import {merchProducts} from './merch';
import {createReadinessLoader} from './readiness-route.server';
import {
  assertDatabaseReadinessRow,
  assertPrintfulProductReadiness,
  probeCheckoutDependencies,
} from './readiness.server';
import {loader} from '~/routes/api.readiness';

const configuredEnv: AppEnv = {
  NODE_ENV: 'production',
  STOREFRONT_MODE: 'production',
  CHECKOUT_ENABLED: 'true',
  MERCH_PILOT_APPROVED: 'true',
  PUBLIC_SITE_URL: 'https://shop.example',
  STRIPE_EXPECTED_MODE: 'test',
  STRIPE_SECRET_KEY: ['sk', 'test', 'unit', '1234567890abcdef'].join('_'),
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,US',
  STRIPE_AUTOMATIC_TAX: 'false',
  DATABASE_URL: 'postgres://example',
  INNGEST_EVENT_KEY: ['inngest', 'event', 'unit'].join('-'),
  INNGEST_SIGNING_KEY: ['inngest', 'signing', 'unit'].join('-'),
  PRINTFUL_TOKEN: 'printful-token',
  PRINTFUL_STORE_ID: 'printful-store',
  PRINTFUL_AUTO_CONFIRM: 'false',
  STOREFRONT_CONTACT_EMAIL: 'shop@example.com',
  STOREFRONT_POLICY_VERSION: '2026-08-26',
  STOREFRONT_LEGAL_APPROVED: 'true',
  STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
  STRIPE_FLAT_SHIPPING_AMOUNT: '910',
};

const stripeProbeResult = (livemode: boolean) => ({
  livemode,
  webhookReady: true,
});

test('database readiness requires bigint Printful sync IDs', () => {
  const readyRow = {
    ready: 1,
    orders_table: 'orders',
    order_items_table: 'order_items',
    stripe_events_table: 'stripe_events',
    refund_tracking_ready: true,
    policy_version_ready: true,
    webhook_lease_ready: true,
    sync_variant_bigint_ready: true,
  };
  assert.doesNotThrow(() => assertDatabaseReadinessRow(readyRow));
  assert.throws(
    () =>
      assertDatabaseReadinessRow({
        ...readyRow,
        sync_variant_bigint_ready: false,
      }),
    /required checkout migrations/,
  );
});

test('Printful readiness requires exact active signed variant mappings', () => {
  const approvedProduct = merchantCatalog.products[1];
  assert.ok(approvedProduct);
  const response = {
    result: {
      sync_product: {
        id: approvedProduct.printfulProductId,
        is_ignored: false,
      },
      sync_variants: approvedProduct.printfulVariants.map((variant) => ({
        id: variant.syncVariantId,
        variant_id: variant.catalogVariantId,
        synced: true,
        is_ignored: false,
        availability_status: 'active',
      })),
    },
  };
  assert.doesNotThrow(() =>
    assertPrintfulProductReadiness(approvedProduct, response),
  );

  const remapped = structuredClone(response);
  remapped.result.sync_variants[0].variant_id += 1;
  assert.throws(
    () => assertPrintfulProductReadiness(approvedProduct, remapped),
    /variant mapping does not match sign-off/,
  );

  const unavailable = structuredClone(response);
  unavailable.result.sync_variants[0].availability_status = 'out_of_stock';
  assert.throws(
    () => assertPrintfulProductReadiness(approvedProduct, unavailable),
    /variant is unavailable or unconfigured/,
  );
});

test('readiness route proves every signed product without creating checkout', async () => {
  const liveLoader = createReadinessLoader({
    probeDependencies: async () => ({
      databaseReady: true,
      printfulReady: true,
      stripeReady: true,
      stripeWebhookReady: true,
      paymentMode: 'test' as const,
    }),
  });

  for (const approvedProduct of merchantCatalog.products) {
    const product = merchProducts.find(
      (candidate) => candidate.slug === approvedProduct.productSlug,
    );
    assert.ok(product, `Missing signed product ${approvedProduct.productSlug}`);
    const request = new Request(
      `https://shop.example/api/readiness?product=${encodeURIComponent(product.slug)}`,
    );
    const response = await liveLoader({
      context: {env: configuredEnv},
      request,
    } as never);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ready: true,
      productSlug: product.slug,
      handle: product.commerce.handle,
      title: product.title,
      variantId: product.commerce.variants![0].id,
      currency: product.commerce.currency,
      unitAmount: product.commerce.unitAmount,
      provider: 'printful',
      policyVersion: '2026-08-26',
      shippingCountries: ['CH', 'US'],
      shippingAmount: 910,
      maximumItemsPerOrder: 10,
      deliveryEstimateBusinessDays: {minimum: 7, maximum: 15},
      paymentMode: 'test',
      databaseReady: true,
      printfulReady: true,
      stripeReady: true,
      stripeWebhookReady: true,
      printfulAutoConfirm: false,
    });
  }
});

test('readiness route rejects placeholder credentials without making live probes', async () => {
  const product = merchProducts.find(
    (candidate) => candidate.slug === 'codex-rate-reset-long-sleeve',
  )!;
  const previousStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const response = await loader({
      context: {
        env: {...configuredEnv, STRIPE_SECRET_KEY: 'sk_test_example'},
      },
      request: new Request(
        `https://shop.example/api/readiness?product=${encodeURIComponent(product.slug)}`,
      ),
    } as never);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ready: false,
      code: 'checkout_not_configured',
    });
  } finally {
    product.workflow.status = previousStatus;
  }
});

test('live dependency probes require database success and matching Stripe mode', async () => {
  const events: string[] = [];
  const ready = await probeCheckoutDependencies(configuredEnv, {
    databaseProbe: async () => {
      events.push('database');
    },
    printfulProbe: async () => {
      events.push('printful');
    },
    stripeProbe: async () => {
      events.push('stripe');
      return stripeProbeResult(false);
    },
  });
  assert.deepEqual(ready, {
    databaseReady: true,
    printfulReady: true,
    stripeReady: true,
    stripeWebhookReady: true,
    paymentMode: 'test',
  });
  assert.deepEqual(events.sort(), ['database', 'printful', 'stripe']);

  await assert.rejects(
    () =>
      probeCheckoutDependencies(
        {...configuredEnv, STRIPE_EXPECTED_MODE: 'live'},
        {
          databaseProbe: async () => {},
          printfulProbe: async () => {},
          stripeProbe: async () => stripeProbeResult(false),
        },
      ),
    /expected payment mode/,
  );
  await assert.rejects(
    () =>
      probeCheckoutDependencies(configuredEnv, {
        databaseProbe: async () => {},
        printfulProbe: async () => {},
        stripeProbe: async () => stripeProbeResult(true),
      }),
    /mode does not match/,
  );
  await assert.rejects(
    () =>
      probeCheckoutDependencies(configuredEnv, {
        databaseProbe: async () => {
          throw new Error('required checkout migrations missing');
        },
        printfulProbe: async () => {},
        stripeProbe: async () => stripeProbeResult(false),
      }),
    /migrations missing/,
  );
  await assert.rejects(
    () =>
      probeCheckoutDependencies(configuredEnv, {
        databaseProbe: async () => {},
        printfulProbe: async () => {
          throw new Error('invalid provider token');
        },
        stripeProbe: async () => stripeProbeResult(false),
      }),
    /invalid provider token/,
  );
});

test('readiness route fails closed when checkout configuration is absent', async () => {
  const product = merchProducts.find(
    (candidate) => candidate.slug === 'codex-rate-reset-long-sleeve',
  )!;
  const previousStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const response = await loader({
      context: {env: {NODE_ENV: 'production'}},
      request: new Request(
        `https://shop.example/api/readiness?product=${encodeURIComponent(product.slug)}`,
      ),
    } as never);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      ready: false,
      code: 'checkout_not_configured',
    });
  } finally {
    product.workflow.status = previousStatus;
  }
});
