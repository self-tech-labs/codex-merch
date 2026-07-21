import assert from 'node:assert/strict';
import test from 'node:test';
import {merchProducts} from './merch';
import {createReadinessLoader} from './readiness-route.server';
import {probeCheckoutDependencies} from './readiness.server';
import {loader} from '~/routes/api.readiness';

const configuredEnv: AppEnv = {
  NODE_ENV: 'production',
  STOREFRONT_MODE: 'production',
  CHECKOUT_ENABLED: 'true',
  JURY_SALES_ENABLED: 'true',
  JURY_ACCESS_CODE: ['unit', 'test', 'jury', 'access'].join('-'),
  JURY_SALES_END_AT: '2099-08-06T00:00:00Z',
  MERCH_PILOT_APPROVED: 'true',
  PUBLIC_SITE_URL: 'https://shop.example',
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
  STOREFRONT_CONTACT_EMAIL: 'elliot@ritsl.com',
  STOREFRONT_POLICY_VERSION: '2026-07-21',
  STOREFRONT_LEGAL_APPROVED: 'true',
  STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
  STRIPE_FLAT_SHIPPING_AMOUNT: '910',
};

test('readiness route proves one deployed variant without creating checkout', async () => {
  const product = merchProducts.find(
    (candidate) => candidate.slug === 'codex-rate-reset-long-sleeve',
  )!;
  const previousStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const liveLoader = createReadinessLoader({
      probeDependencies: async () => ({
        databaseReady: true,
        printfulReady: true,
        stripeReady: true,
        paymentMode: 'test' as const,
      }),
    });
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
      policyVersion: '2026-07-21',
      shippingCountries: ['CH', 'US'],
      shippingAmount: 910,
      maximumItemsPerOrder: 10,
      deliveryEstimateBusinessDays: {minimum: 7, maximum: 15},
      paymentMode: 'test',
      salesAudience: 'OpenAI Build Week judges',
      accessCodeRequired: true,
      salesEndAt: '2099-08-06T00:00:00Z',
      databaseReady: true,
      printfulReady: true,
      stripeReady: true,
      printfulAutoConfirm: false,
    });
  } finally {
    product.workflow.status = previousStatus;
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
      return {livemode: false};
    },
  });
  assert.deepEqual(ready, {
    databaseReady: true,
    printfulReady: true,
    stripeReady: true,
    paymentMode: 'test',
  });
  assert.deepEqual(events.sort(), ['database', 'printful', 'stripe']);

  await assert.rejects(
    () =>
      probeCheckoutDependencies(configuredEnv, {
        databaseProbe: async () => {},
        printfulProbe: async () => {},
        stripeProbe: async () => ({livemode: true}),
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
        stripeProbe: async () => ({livemode: false}),
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
        stripeProbe: async () => ({livemode: false}),
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
