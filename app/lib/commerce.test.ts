import assert from 'node:assert/strict';
import test from 'node:test';
import type Stripe from 'stripe';
import type {Order} from '~/db/schema.server';
import {
  buildPrintfulOrderPayload,
  cancelPrintfulOrder,
  createOrFindPrintfulOrder,
  getPrintfulOrderState,
  printfulExternalId,
} from './fulfillment.server';
import {
  isPubliclyVisibleProduct,
  isPurchasableProduct,
  merchProducts,
  type MerchProduct,
} from './merch';
import {
  allowedShippingCountries,
  assertCheckoutConfiguration,
  assertMerchantJuryLines,
  normalizeCheckoutLines,
  shippingOptions,
} from './stripe.server';

test('preview products are visible but not purchasable', () => {
  const preview = merchProducts.find((product) => product.automation?.previewOnly)!;
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
  const product = merchProducts.find((candidate) => candidate.automation?.previewOnly)!;
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

test('jury catalog pins approved products, prices, and whole-cart quantity', () => {
  const product = merchProducts.find(
    (candidate) => candidate.slug === 'codex-rate-reset-long-sleeve',
  )!;
  const originalStatus = product.workflow.status;
  product.workflow.status = 'published';
  try {
    const variants = product.commerce.variants!;
    assert.throws(
      () =>
        normalizeCheckoutLines([
          {productSlug: product.slug, variantId: variants[0].id, quantity: 6},
          {productSlug: product.slug, variantId: variants[1].id, quantity: 5},
        ]),
      /at most 10 items/,
    );
    const lines = normalizeCheckoutLines([
      {productSlug: product.slug, variantId: variants[0].id, quantity: 1},
    ]);
    assert.doesNotThrow(() => assertMerchantJuryLines(lines));
    product.commerce.unitAmount = 5900;
    assert.throws(() => assertMerchantJuryLines(lines), /approved jury catalog/);
    product.commerce.unitAmount = 5800;
    product.providerRefs.printful!.variants[0].syncVariantId += 1;
    assert.throws(
      () => assertMerchantJuryLines(lines),
      /product revision does not match/,
    );
  } finally {
    product.commerce.unitAmount = 5800;
    product.providerRefs.printful!.variants[0].syncVariantId = 5338615120;
    product.workflow.status = originalStatus;
  }
});

test('production checkout configuration fails closed', () => {
  const configured: AppEnv = {
    NODE_ENV: 'production',
    STOREFRONT_MODE: 'production',
    CHECKOUT_ENABLED: 'true',
    JURY_SALES_ENABLED: 'true',
    JURY_ACCESS_CODE: ['unit', 'test', 'jury', 'access'].join('-'),
    JURY_SALES_END_AT: '2099-08-06T00:00:00Z',
    MERCH_PILOT_APPROVED: 'true',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,US',
    STRIPE_AUTOMATIC_TAX: 'false',
    DATABASE_URL: 'postgres://test',
    INNGEST_EVENT_KEY: 'event',
    INNGEST_SIGNING_KEY: 'signing',
    PRINTFUL_TOKEN: 'printful',
    PRINTFUL_STORE_ID: 'store',
    PRINTFUL_AUTO_CONFIRM: 'false',
    STRIPE_FLAT_SHIPPING_AMOUNT: '910',
    STOREFRONT_LEGAL_APPROVED: 'true',
    STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
  };
  assert.throws(() => assertCheckoutConfiguration(configured), /public site URL/);
  configured.PUBLIC_SITE_URL = 'https://shop.example';
  assert.throws(() => assertCheckoutConfiguration(configured), /contact email/);
  configured.STOREFRONT_CONTACT_EMAIL = 'support@example.com';
  assert.throws(() => assertCheckoutConfiguration(configured), /contact email/);
  configured.STOREFRONT_CONTACT_EMAIL = 'elliot@ritsl.com';
  assert.throws(() => assertCheckoutConfiguration(configured), /policy version/);
  configured.STOREFRONT_POLICY_VERSION = '2026-07-21';
  assert.doesNotThrow(() => assertCheckoutConfiguration(configured));
  assert.throws(
    () =>
      assertCheckoutConfiguration({...configured, JURY_SALES_ENABLED: 'false'}),
    /Jury sales are disabled/,
  );
  assert.throws(
    () => assertCheckoutConfiguration({...configured, JURY_ACCESS_CODE: ''}),
    /Jury access is not configured/,
  );
  assert.throws(
    () => assertCheckoutConfiguration({...configured, MERCH_PILOT_APPROVED: 'false'}),
    /pilot approval/,
  );
  assert.throws(
    () => assertCheckoutConfiguration({...configured, PRINTFUL_AUTO_CONFIRM: 'true'}),
    /manual Printful confirmation/,
  );
  assert.throws(
    () =>
      assertCheckoutConfiguration({
        ...configured,
        STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,DE',
      }),
    /CH and US only/,
  );
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
    JURY_SALES_ENABLED: 'true',
    JURY_ACCESS_CODE: ['unit', 'test', 'jury', 'access'].join('-'),
    JURY_SALES_END_AT: '2099-08-06T00:00:00Z',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    DATABASE_URL: 'postgres://test',
    INNGEST_EVENT_KEY: 'event',
    INNGEST_SIGNING_KEY: 'signing',
    PRINTFUL_TOKEN: 'printful',
    PRINTFUL_STORE_ID: 'store',
    PRINTFUL_AUTO_CONFIRM: 'false',
    MERCH_PILOT_APPROVED: 'true',
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

test('pilot shipping countries and delivery configuration fail closed', async () => {
  assert.deepEqual(allowedShippingCountries({}), ['CH', 'US']);
  assert.deepEqual(
    allowedShippingCountries({STRIPE_ALLOWED_SHIPPING_COUNTRIES: ' ch, us '}),
    ['CH', 'US'],
  );
  assert.throws(
    () => allowedShippingCountries({STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,FR'}),
    /CH and US only/,
  );

  assert.deepEqual(
    await shippingOptions({STRIPE_FLAT_SHIPPING_AMOUNT: '910'}, 'CHF'),
    [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {amount: 910, currency: 'chf'},
          display_name: 'Standard shipping',
          tax_behavior: 'inclusive',
          tax_code: 'txcd_92010001',
          delivery_estimate: {
            minimum: {unit: 'business_day', value: 7},
            maximum: {unit: 'business_day', value: 15},
          },
        },
      },
    ],
  );
  await assert.rejects(
    shippingOptions({STRIPE_FLAT_SHIPPING_AMOUNT: '-1'}, 'CHF'),
    /non-negative integer/,
  );

  const rateClient = (rate: Partial<Stripe.ShippingRate>) =>
    ({
      shippingRates: {
        retrieve: async () => ({
          active: true,
          fixed_amount: {amount: 910, currency: 'chf'},
          tax_behavior: 'inclusive',
          tax_code: 'txcd_92010001',
          delivery_estimate: {
            minimum: {unit: 'business_day', value: 7},
            maximum: {unit: 'business_day', value: 15},
          },
          ...rate,
        }),
      },
    }) as unknown as Pick<Stripe, 'shippingRates'>;
  assert.deepEqual(
    await shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({}),
    ),
    [{shipping_rate: 'shr_test'}],
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({active: false}),
    ),
    /inactive/,
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({fixed_amount: {amount: 910, currency: 'usd'}}),
    ),
    /currency/,
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({fixed_amount: {amount: 900, currency: 'chf'}}),
    ),
    /amount does not match/,
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({tax_behavior: 'exclusive'}),
    ),
    /tax treatment/,
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({tax_code: 'txcd_99999999'}),
    ),
    /tax treatment/,
  );
  await assert.rejects(
    shippingOptions(
      {STRIPE_SHIPPING_RATE_ID: 'shr_test'},
      'CHF',
      rateClient({delivery_estimate: null}),
    ),
    /delivery estimate/,
  );
});

test('Printful payload uses immutable sync variants and no print files', () => {
  const session = {
    id: `cs_test_${'x'.repeat(60)}`,
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
    externalId: 'CM-1234567890',
    session,
    items: [{syncVariantId: 55, quantity: 2, unitAmount: 5800}],
  });
  assert.equal(payload.external_id, 'CM-1234567890');
  assert.ok(payload.external_id.length <= 32);
  assert.deepEqual(payload.items, [
    {sync_variant_id: 55, quantity: 2, retail_price: '58.00'},
  ]);
  assert.equal('files' in payload.items[0], false);
  assert.equal('confirm' in payload, false);
  assert.equal(
    printfulExternalId({publicReference: 'CM-1234567890'}),
    'CM-1234567890',
  );
  assert.throws(
    () => printfulExternalId({publicReference: 'x'.repeat(33)}),
    /at most 32 characters/,
  );
});

test('Printful draft creation is idempotent and never calls confirmation', async () => {
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
    PRINTFUL_AUTO_CONFIRM: 'false',
  };
  const baseOrder = {
    publicReference: 'CM-IDEMPOTENT',
    providerOrderId: null,
    fulfillmentStatus: 'processing',
  } as unknown as Order;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method || 'GET';
    requests.push({method, url});
    if (url.endsWith('/orders/@CM-IDEMPOTENT')) {
      return new Response('', {status: 404});
    }
    if (url.endsWith('/orders') && method === 'POST') {
      return Response.json({result: {id: 99, status: 'draft'}});
    }
    if (url.endsWith('/orders/99') && method === 'GET') {
      return Response.json({result: {id: 99, status: 'draft'}});
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
    assert.equal(
      requests.filter((request) => request.url.endsWith('/orders') && request.method === 'POST').length,
      1,
    );
    assert.equal(requests.some((request) => request.url.endsWith('/confirm')), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Printful cancellation only acts on cancellable unconfirmed orders', async () => {
  const originalFetch = globalThis.fetch;
  const methods: string[] = [];
  const env: AppEnv = {
    STOREFRONT_MODE: 'production',
    PRINTFUL_TOKEN: 'token',
    PRINTFUL_STORE_ID: 'store',
    PRINTFUL_AUTO_CONFIRM: 'false',
  };
  globalThis.fetch = async (_input, init) => {
    const method = init?.method || 'GET';
    methods.push(method);
    return Response.json({
      result: {id: 99, status: method === 'DELETE' ? 'canceled' : 'draft'},
    });
  };
  try {
    assert.equal(await cancelPrintfulOrder('99', env), true);
    assert.deepEqual(methods, ['GET', 'DELETE']);

    methods.length = 0;
    globalThis.fetch = async (_input, init) => {
      methods.push(init?.method || 'GET');
      return Response.json({result: {id: 100, status: 'confirmed'}});
    };
    await assert.rejects(cancelPrintfulOrder('100', env), /cannot be safely cancelled/);
    assert.deepEqual(methods, ['GET']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Printful provider state recognizes dashboard-confirmed orders', async () => {
  const originalFetch = globalThis.fetch;
  const env: AppEnv = {
    STOREFRONT_MODE: 'production',
    PRINTFUL_TOKEN: 'token',
    PRINTFUL_STORE_ID: 'store',
    PRINTFUL_AUTO_CONFIRM: 'false',
  };
  globalThis.fetch = async () =>
    Response.json({result: {id: 101, status: 'pending'}});
  try {
    assert.deepEqual(await getPrintfulOrderState('101', env), {
      status: 'pending',
      committed: true,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Printful defers long Retry-After windows to the caller', async () => {
  const originalFetch = globalThis.fetch;
  const env: AppEnv = {
    STOREFRONT_MODE: 'production',
    PRINTFUL_TOKEN: 'token',
    PRINTFUL_STORE_ID: 'store',
    PRINTFUL_AUTO_CONFIRM: 'false',
    PRINTFUL_MAX_RETRIES: '1',
  };
  globalThis.fetch = async () =>
    new Response('rate limited', {
      status: 429,
      headers: {'Retry-After': '600'},
    });
  try {
    const startedAt = Date.now();
    await assert.rejects(
      getPrintfulOrderState('101', env),
      /outside the safe in-request window/,
    );
    assert.ok(Date.now() - startedAt < 1_000);
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
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
