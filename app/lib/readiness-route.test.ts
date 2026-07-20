import assert from 'node:assert/strict';
import test from 'node:test';
import {merchProducts} from './merch';
import {createReadinessLoader} from './readiness-route.server';
import {probeCheckoutDependencies} from './readiness.server';
import {loader} from '~/routes/api.readiness';

const configuredEnv: AppEnv = {
  NODE_ENV: 'production',
  CHECKOUT_ENABLED: 'true',
  PUBLIC_SITE_URL: 'https://shop.example',
  STRIPE_SECRET_KEY: 'sk_test_1234567890abcdef',
  STRIPE_WEBHOOK_SECRET: 'whsec_example',
  DATABASE_URL: 'postgres://example',
  INNGEST_EVENT_KEY: 'inngest-event',
  INNGEST_SIGNING_KEY: 'inngest-signing',
  PRINTFUL_TOKEN: 'printful-token',
  PRINTFUL_STORE_ID: 'printful-store',
  PRINTFUL_AUTO_CONFIRM: 'false',
  STOREFRONT_CONTACT_EMAIL: 'merchant@example.com',
  STOREFRONT_SHIPPING_POLICY: 'Shipping policy',
  STOREFRONT_RETURNS_POLICY: 'Returns policy',
  STOREFRONT_PRIVACY_POLICY: 'Privacy policy',
  STOREFRONT_TERMS_POLICY: 'Terms policy',
  STOREFRONT_CONTACT_POLICY: 'Contact policy',
  STOREFRONT_LEGAL_APPROVED: 'true',
  STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
  STRIPE_FLAT_SHIPPING_AMOUNT: '500',
};

test('readiness route proves one deployed variant without creating checkout', async () => {
  const product = merchProducts[0];
  const previousStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const liveLoader = createReadinessLoader({
      probeDependencies: async () => ({
        databaseReady: true,
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
      paymentMode: 'test',
      databaseReady: true,
      stripeReady: true,
      printfulAutoConfirm: false,
    });
  } finally {
    product.workflow.status = previousStatus;
  }
});

test('readiness route rejects placeholder credentials without making live probes', async () => {
  const product = merchProducts[0];
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
    stripeProbe: async () => {
      events.push('stripe');
      return {livemode: false};
    },
  });
  assert.deepEqual(ready, {
    databaseReady: true,
    stripeReady: true,
    paymentMode: 'test',
  });
  assert.deepEqual(events.sort(), ['database', 'stripe']);

  await assert.rejects(
    () =>
      probeCheckoutDependencies(configuredEnv, {
        databaseProbe: async () => {},
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
        stripeProbe: async () => ({livemode: false}),
      }),
    /migrations missing/,
  );
});

test('readiness route fails closed when checkout configuration is absent', async () => {
  const product = merchProducts[0];
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
