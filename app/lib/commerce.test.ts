import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import type {Order} from '~/db/schema.server';
import {
  buildPrintfulOrderPayload,
  confirmPrintfulOrder,
  createOrFindPrintfulOrder,
} from './fulfillment.server';
import {
  isPubliclyVisibleProduct,
  isPurchasableProduct,
  merchProducts,
  type MerchProduct,
} from './merch';
import {
  assertCheckoutConfiguration,
  normalizeCheckoutLines,
} from './stripe.server';

test('preview products are visible but not purchasable', () => {
  const preview = merchProducts[0];
  assert.equal(isPubliclyVisibleProduct(preview), true);
  assert.equal(isPurchasableProduct(preview), false);
});

test('published products require an available sync mapping', () => {
  const product = structuredClone(merchProducts[0]) as MerchProduct;
  product.workflow.status = 'published';
  assert.equal(isPurchasableProduct(product), true);
  product.providerRefs.printful!.variants[0].available = false;
  product.commerce.variants![0].availableForSale = false;
  assert.equal(isPurchasableProduct(product), true);
  for (const variant of product.commerce.variants || []) variant.availableForSale = false;
  assert.equal(isPurchasableProduct(product), false);
});

test('checkout rejects preview products and non-integer quantities', () => {
  const product = merchProducts[0];
  const variant = product.commerce.variants![0];
  assert.throws(
    () =>
      normalizeCheckoutLines([
        {productSlug: product.slug, variantId: variant.id, quantity: 1},
      ]),
    /not available for purchase/,
  );
  assert.throws(
    () =>
      normalizeCheckoutLines([
        {productSlug: product.slug, variantId: variant.id, quantity: 1.5},
      ]),
    /integers/,
  );
});

test('checkout snapshots server prices and aggregates duplicate lines', () => {
  const product = merchProducts[0];
  const originalStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const variant = product.commerce.variants![0];
    const lines = normalizeCheckoutLines([
      {productSlug: product.slug, variantId: variant.id, quantity: 2},
      {productSlug: product.slug, variantId: variant.id, quantity: 3},
    ]);
    assert.equal(lines.length, 1);
    assert.equal(lines[0].quantity, 5);
    assert.equal(lines[0].product.commerce.unitAmount, 8800);
  } finally {
    product.workflow.status = originalStatus;
  }
});

test('checkout enforces aggregate quantities, availability, currencies, and unique lines', () => {
  const original = merchProducts.map((product) => ({
    status: product.workflow.status,
    currency: product.commerce.currency,
  }));
  for (const product of merchProducts) product.workflow.status = 'published';
  try {
    const first = merchProducts[0];
    const firstVariant = first.commerce.variants![0];
    assert.throws(
      () =>
        normalizeCheckoutLines([
          {productSlug: first.slug, variantId: firstVariant.id, quantity: 6},
          {productSlug: first.slug, variantId: firstVariant.id, quantity: 5},
        ]),
      /exceeds 10/,
    );

    const mapping = first.providerRefs.printful!.variants[0];
    mapping.available = false;
    assert.throws(
      () =>
        normalizeCheckoutLines([
          {productSlug: first.slug, variantId: firstVariant.id, quantity: 1},
        ]),
      /not available/,
    );
    mapping.available = true;

    const second = merchProducts[1];
    second.commerce.currency = 'EUR';
    assert.throws(
      () =>
        normalizeCheckoutLines([
          {productSlug: first.slug, variantId: firstVariant.id, quantity: 1},
          {
            productSlug: second.slug,
            variantId: second.commerce.variants![0].id,
            quantity: 1,
          },
        ]),
      /one currency/,
    );
    second.commerce.currency = original[1].currency;

    const eleven = merchProducts
      .flatMap((product) =>
        product.commerce.variants!.map((variant) => ({
          productSlug: product.slug,
          variantId: variant.id,
          quantity: 1,
        })),
      )
      .slice(0, 11);
    assert.equal(eleven.length, 11);
    assert.throws(() => normalizeCheckoutLines(eleven), /too many unique lines/);
  } finally {
    merchProducts.forEach((product, index) => {
      product.workflow.status = original[index].status;
      product.commerce.currency = original[index].currency;
    });
  }
});

test('production checkout configuration fails closed', () => {
  const configured: AppEnv = {
    NODE_ENV: 'production',
    STOREFRONT_MODE: 'production',
    CHECKOUT_ENABLED: 'true',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,DE,FR',
    STRIPE_AUTOMATIC_TAX: 'false',
    DATABASE_URL: 'postgres://test',
    INNGEST_EVENT_KEY: 'event',
    INNGEST_SIGNING_KEY: 'signing',
    PRINTFUL_TOKEN: 'printful',
    PRINTFUL_STORE_ID: 'store',
    STRIPE_FLAT_SHIPPING_AMOUNT: '500',
    STOREFRONT_LEGAL_APPROVED: 'true',
    STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
  };
  assert.throws(() => assertCheckoutConfiguration(configured), /public site URL/);
  configured.PUBLIC_SITE_URL = 'https://shop.example';
  assert.throws(() => assertCheckoutConfiguration(configured), /contact email/);
  configured.STOREFRONT_CONTACT_EMAIL = 'support@example.com';
  assert.throws(() => assertCheckoutConfiguration(configured), /policy copy/);
  configured.STOREFRONT_SHIPPING_POLICY = 'Reviewed shipping policy';
  configured.STOREFRONT_RETURNS_POLICY = 'Reviewed returns policy';
  configured.STOREFRONT_PRIVACY_POLICY = 'Reviewed privacy policy';
  configured.STOREFRONT_TERMS_POLICY = 'Reviewed terms policy';
  configured.STOREFRONT_CONTACT_POLICY = 'Reviewed contact policy';
  assert.doesNotThrow(() => assertCheckoutConfiguration(configured));
  assert.throws(
    () =>
      assertCheckoutConfiguration({
        ...configured,
        VERCEL_ENV: 'production',
      }),
    /live Stripe secret key/,
  );
  assert.doesNotThrow(() =>
    assertCheckoutConfiguration({
      ...configured,
      VERCEL_ENV: 'production',
      STRIPE_SECRET_KEY: 'sk_live_unit',
    }),
  );
  assert.throws(
    () =>
      assertCheckoutConfiguration({
        ...configured,
        STRIPE_SHIPPING_RATE_ID: 'shr_live',
      }),
    /exactly one approved shipping-rate configuration/,
  );
});

test('checkout requires explicit production storefront mode', () => {
  const configured: AppEnv = {
    STOREFRONT_MODE: 'production',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    DATABASE_URL: 'postgres://test',
    INNGEST_EVENT_KEY: 'event',
    INNGEST_SIGNING_KEY: 'signing',
    PRINTFUL_TOKEN: 'printful',
    PRINTFUL_STORE_ID: 'store',
  };

  assert.doesNotThrow(() => assertCheckoutConfiguration(configured));
  assert.throws(
    () => assertCheckoutConfiguration({...configured, STOREFRONT_MODE: 'preview'}),
    /explicit production storefront mode/,
  );
  assert.throws(
    () => assertCheckoutConfiguration({...configured, STOREFRONT_MODE: undefined}),
    /explicit production storefront mode/,
  );
  assert.throws(
    () => assertCheckoutConfiguration({...configured, STOREFRONT_MODE: 'PRODUCTION'}),
    /explicit production storefront mode/,
  );
});

test('Printful payload uses immutable sync variants and no print files', () => {
  const session = {
    id: 'cs_test_123',
    collected_information: {
      shipping_details: {
        name: 'Test Customer',
        address: {
          line1: 'Test street 1',
          city: 'Zurich',
          country: 'CH',
          postal_code: '8000',
        },
      },
    },
    customer_details: {email: 'test@example.com'},
  } as unknown as Stripe.Checkout.Session;
  const payload = buildPrintfulOrderPayload({
    session,
    items: [{syncVariantId: 55, quantity: 2, unitAmount: 5800}],
  });
  assert.equal(payload.external_id, 'cs_test_123');
  assert.deepEqual(payload.items, [
    {sync_variant_id: 55, quantity: 2, retail_price: '58.00'},
  ]);
  assert.equal('files' in payload.items[0], false);
});

test('Printful draft creation and confirmation are idempotent', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{method: string; url: string}> = [];
  const session = {
    id: 'cs_test_idempotent',
    collected_information: {
      shipping_details: {
        name: 'Test Customer',
        address: {
          line1: 'Test street 1',
          city: 'Zurich',
          country: 'CH',
          postal_code: '8000',
        },
      },
    },
    customer_details: {email: 'test@example.com'},
  } as unknown as Stripe.Checkout.Session;
  const env: AppEnv = {
    NODE_ENV: 'production',
    STOREFRONT_MODE: 'production',
    CHECKOUT_ENABLED: 'false',
    STRIPE_SECRET_KEY: 'stripe',
    DATABASE_URL: 'postgres://test',
    INNGEST_EVENT_KEY: 'event',
    INNGEST_SIGNING_KEY: 'signing',
    PRINTFUL_TOKEN: 'token',
    PRINTFUL_STORE_ID: 'store',
  };
  const baseOrder = {
    providerOrderId: null,
    fulfillmentStatus: 'processing',
  } as unknown as Order;
  let confirmationChecks = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || 'GET';
    requests.push({method, url});
    if (url.endsWith('/orders/@cs_test_idempotent')) {
      return new Response('', {status: 404});
    }
    if (url.endsWith('/orders') && method === 'POST') {
      return Response.json({result: {id: 99, status: 'draft'}});
    }
    if (url.endsWith('/orders/99') && method === 'GET') {
      confirmationChecks += 1;
      return Response.json({
        result: {id: 99, status: confirmationChecks === 1 ? 'draft' : 'confirmed'},
      });
    }
    if (url.endsWith('/orders/99/confirm')) {
      return Response.json({result: {id: 99, status: 'confirmed'}});
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  try {
    const created = await createOrFindPrintfulOrder({
      env,
      items: [{syncVariantId: 55, quantity: 1, unitAmount: 5800}] as any,
      order: baseOrder,
      session,
    });
    assert.deepEqual(created, {id: '99', confirmed: false});
    const foundLocally = await createOrFindPrintfulOrder({
      env,
      items: [] as any,
      order: {
        ...baseOrder,
        providerOrderId: '99',
        fulfillmentStatus: 'draft_created',
      },
      session,
    });
    assert.deepEqual(foundLocally, {id: '99', confirmed: false});
    await confirmPrintfulOrder('99', env);
    await confirmPrintfulOrder('99', env);
    assert.equal(
      requests.filter((request) => request.url.endsWith('/orders') && request.method === 'POST').length,
      1,
    );
    assert.equal(
      requests.filter((request) => request.url.endsWith('/confirm')).length,
      1,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('preview mode blocks Printful fulfillment before any provider request', async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    throw new Error('Preview mode must not reach Printful');
  };

  try {
    await assert.rejects(
      createOrFindPrintfulOrder({
        env: {
          STOREFRONT_MODE: 'preview',
          PRINTFUL_TOKEN: 'token',
          PRINTFUL_STORE_ID: 'store',
        },
        items: [] as any,
        order: {providerOrderId: null} as Order,
        session: {id: 'cs_preview_blocked'} as Stripe.Checkout.Session,
      }),
      /explicit production storefront mode/,
    );
    await assert.rejects(
      confirmPrintfulOrder('99', {
        STOREFRONT_MODE: 'preview',
        PRINTFUL_TOKEN: 'token',
        PRINTFUL_STORE_ID: 'store',
      }),
      /explicit production storefront mode/,
    );
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
