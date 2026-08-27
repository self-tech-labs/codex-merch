import {createHash} from 'node:crypto';
import Stripe from 'stripe';
import {
  getMerchProduct,
  getPrimaryCustomerMockup,
  getPrintfulVariantMapping,
  getProductVariant,
  isPurchasableProduct,
  isPurchasableVariant,
  merchProducts,
  variantLabel,
  type MerchProduct,
} from '~/lib/merch';
import {requireEnv, siteUrl} from '~/lib/env.server';
import {
  attachStripeSession,
  createPendingOrder,
  markCheckoutCreationFailed,
} from '~/lib/orders.server';
import {
  getApprovedProduct,
  merchantCatalog,
} from '~/lib/merchant-catalog';
import {isValidMerchantContactEmail} from '~/lib/merchant-policy.server';
import {MERCHANT_POLICY_VERSION} from '~/lib/merchant-policy.shared';

export type CheckoutLineInput = {
  productSlug: string;
  variantId: string;
  quantity: number;
};

export type StripeCheckoutLine = {
  product: MerchProduct;
  variantId: string;
  provider: string;
  catalogVariantId: number;
  syncVariantId: number;
  quantity: number;
};

export type StripeSession = Stripe.Checkout.Session;
export type StripeEvent = Stripe.Event;

const stripeClients = new Map<string, Stripe>();
const MAX_UNIQUE_LINES = 10;
const MAX_INPUT_LINES = 100;
const MAX_QUANTITY = 10;
const CHECKOUT_SESSION_TTL_SECONDS = 35 * 60;

export type StripePaymentMode = 'test' | 'live';

export const FIXED_CURRENCY_CHECKOUT_CONTROLS = {
  adaptive_pricing: {enabled: false},
  consent_collection: {terms_of_service: 'required'},
} as const satisfies Pick<
  Stripe.Checkout.SessionCreateParams,
  'adaptive_pricing' | 'consent_collection'
>;

export function checkoutSessionExpiresAt(nowMilliseconds = Date.now()) {
  return Math.floor(nowMilliseconds / 1000) + CHECKOUT_SESSION_TTL_SECONDS;
}

export function stripePaymentMode(secretKey: string | undefined) {
  const match = String(secretKey || '').match(
    /^sk_(test|live)_[A-Za-z0-9_]{16,}$/,
  );
  if (!match) throw new Error('Stripe secret key is not a live or test secret key');
  return match[1] as StripePaymentMode;
}

export function expectedStripePaymentMode(env: AppEnv): StripePaymentMode {
  const expected = env.STRIPE_EXPECTED_MODE?.trim().toLowerCase();
  if (expected === 'test' || expected === 'live') return expected;
  if (env.NODE_ENV === 'production') {
    throw new Error('Production checkout requires an explicit Stripe payment mode');
  }
  return stripePaymentMode(env.STRIPE_SECRET_KEY);
}

export function assertStripePaymentMode(env: AppEnv) {
  const actual = stripePaymentMode(env.STRIPE_SECRET_KEY);
  const expected = expectedStripePaymentMode(env);
  if (actual !== expected) {
    throw new Error('Stripe secret key does not match the expected payment mode');
  }
  if (env.VERCEL_ENV === 'production' && expected !== 'live') {
    throw new Error('Vercel production checkout requires live Stripe mode');
  }
  return actual;
}

export function assertStripeEventMode(event: Stripe.Event, env: AppEnv) {
  const expected = assertStripePaymentMode(env);
  if (event.livemode !== (expected === 'live')) {
    throw new Error('Stripe webhook event mode does not match checkout mode');
  }
}

export function stripeClient(env: AppEnv) {
  requireEnv(env, ['STRIPE_SECRET_KEY']);
  const key = env.STRIPE_SECRET_KEY || '';
  let client = stripeClients.get(key);
  if (!client) {
    client = new Stripe(key, {
      apiVersion: '2026-07-29.dahlia',
      maxNetworkRetries: 2,
      timeout: 10_000,
    });
    stripeClients.set(key, client);
  }
  return client;
}

export function assertCheckoutConfiguration(env: AppEnv) {
  assertProductionStorefrontMode(env);
  if (env.CHECKOUT_ENABLED !== 'true') {
    throw new Error('Checkout is disabled');
  }
  requireEnv(env, [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'PRINTFUL_TOKEN',
    'PRINTFUL_STORE_ID',
  ]);
  assertStripePaymentMode(env);
  if (env.MERCH_PILOT_APPROVED !== 'true') {
    throw new Error('Checkout requires explicit catalog approval');
  }
  if (env.PRINTFUL_AUTO_CONFIRM !== 'false') {
    throw new Error('Checkout requires manual Printful confirmation');
  }
  if (env.NODE_ENV === 'production') {
    if (!env.PUBLIC_SITE_URL) {
      throw new Error('Production checkout requires a canonical public site URL');
    }
    assertCanonicalProductionSiteUrl(env.PUBLIC_SITE_URL);
    if (!isValidMerchantContactEmail(env.STOREFRONT_CONTACT_EMAIL)) {
      throw new Error('Production checkout requires a valid merchant contact email');
    }
    if (env.STOREFRONT_POLICY_VERSION !== MERCHANT_POLICY_VERSION) {
      throw new Error('Production checkout requires the deployed merchant policy version');
    }
    if (!env.STRIPE_ALLOWED_SHIPPING_COUNTRIES) {
      throw new Error('Production checkout requires approved shipping countries');
    }
    allowedShippingCountries(env);
    if (
      Boolean(env.STRIPE_SHIPPING_RATE_ID) ===
      Boolean(env.STRIPE_FLAT_SHIPPING_AMOUNT)
    ) {
      throw new Error(
        'Production checkout requires exactly one approved shipping-rate configuration',
      );
    }
    if (
      env.STRIPE_FLAT_SHIPPING_AMOUNT &&
      Number(env.STRIPE_FLAT_SHIPPING_AMOUNT) !==
        merchantCatalog.shippingAmount
    ) {
      throw new Error('Production checkout shipping does not match the approved catalog');
    }
    if (!['true', 'false'].includes(env.STRIPE_AUTOMATIC_TAX || '')) {
      throw new Error('Production checkout requires an explicit automatic-tax decision');
    }
    if (
      env.STOREFRONT_LEGAL_APPROVED !== 'true' ||
      env.STOREFRONT_TAX_SHIPPING_APPROVED !== 'true'
    ) {
      throw new Error('Production checkout requires legal and tax/shipping approval');
    }
  }
}

export function assertStripeWebhookConfiguration(env: AppEnv) {
  requireEnv(env, [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
  ]);
  assertStripePaymentMode(env);
}

function assertCanonicalProductionSiteUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Production checkout requires a valid canonical public site URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== '/' && url.pathname !== '')
  ) {
    throw new Error('Production checkout requires a canonical HTTPS origin without a path');
  }
}

export function assertProductionStorefrontMode(env: AppEnv) {
  if (env.STOREFRONT_MODE !== 'production') {
    throw new Error('Storefront operations require explicit production storefront mode');
  }
}

export function normalizeCheckoutLines(lines: unknown): StripeCheckoutLine[] {
  if (!Array.isArray(lines)) throw new Error('Cart payload must be an array');
  if (!lines.length) throw new Error('Cart is empty');
  if (lines.length > MAX_INPUT_LINES) throw new Error('Cart payload has too many lines');

  const normalized = new Map<string, StripeCheckoutLine>();
  for (const rawLine of lines) {
    if (!rawLine || typeof rawLine !== 'object') throw new Error('Invalid cart line');
    const input = rawLine as CheckoutLineInput;
    const productSlug = String(input.productSlug || '');
    const variantId = String(input.variantId || '');
    const quantity = Number(input.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw new Error('Cart quantities must be integers between 1 and 10');
    }

    const product = getMerchProduct(productSlug, {includeInternal: true});
    if (!product || !isPurchasableProduct(product)) {
      throw new Error(`Product is not available for purchase: ${productSlug}`);
    }
    const variant = getProductVariant(product, variantId);
    if (!variant || !isPurchasableVariant(product, variant)) {
      throw new Error(`Variant is not available for purchase: ${variantId}`);
    }
    const mapping = getPrintfulVariantMapping(product, variant.id);
    if (!mapping) throw new Error(`Missing provider mapping: ${variant.id}`);

    const key = `${product.slug}:${variant.id}`;
    const previous = normalized.get(key);
    const nextQuantity = (previous?.quantity || 0) + quantity;
    if (nextQuantity > MAX_QUANTITY) throw new Error('Combined line quantity exceeds 10');
    normalized.set(key, {
      product,
      variantId: variant.id,
      provider: product.production.provider,
      catalogVariantId: mapping.catalogVariantId,
      syncVariantId: mapping.syncVariantId,
      quantity: nextQuantity,
    });
  }

  const result = [...normalized.values()];
  if (result.length > MAX_UNIQUE_LINES) {
    throw new Error('Cart has too many unique lines');
  }
  const totalQuantity = result.reduce((sum, line) => sum + line.quantity, 0);
  if (totalQuantity > merchantCatalog.maximumItemsPerOrder) {
    throw new Error(
      `An order may contain at most ${merchantCatalog.maximumItemsPerOrder} items`,
    );
  }
  const currencies = new Set(result.map((line) => line.product.commerce.currency));
  const providers = new Set(result.map((line) => line.provider));
  if (currencies.size !== 1) throw new Error('A checkout may contain only one currency');
  if (providers.size !== 1) throw new Error('A checkout may contain only one provider');
  return result;
}

export function assertApprovedCatalogLines(lines: StripeCheckoutLine[]) {
  if (!lines.length) {
    throw new Error('Checkout lines do not match the approved catalog');
  }

  const products = new Map<string, MerchProduct>();
  for (const line of lines) {
    const approvedProduct = getApprovedProduct(line.product.slug);
    if (
      !approvedProduct ||
      line.product.title !== approvedProduct.productTitle ||
      line.product.commerce.unitAmount !== approvedProduct.unitAmount ||
      line.product.commerce.currency !== merchantCatalog.currency
    ) {
      throw new Error('Checkout lines do not match the approved catalog');
    }

    const previous = products.get(line.product.slug);
    if (previous && previous !== line.product) {
      throw new Error(
        'Checkout lines must use one approved snapshot per product',
      );
    }
    products.set(line.product.slug, line.product);

    const approvedVariant = approvedProduct.printfulVariants.find(
      (variant) => variant.variantId === line.variantId,
    );
    if (
      !approvedVariant ||
      line.catalogVariantId !== approvedVariant.catalogVariantId ||
      line.syncVariantId !== approvedVariant.syncVariantId
    ) {
      throw new Error('Printful variant does not match merchant sign-off');
    }
  }

  for (const [productSlug, product] of products) {
    const approvedProduct = getApprovedProduct(productSlug);
    if (!approvedProduct) {
      throw new Error('Checkout contains an unapproved product');
    }
    const revision = createHash('sha256')
      .update(JSON.stringify(product))
      .digest('hex');
    if (revision !== approvedProduct.approvedProductRevision) {
      throw new Error('Product revision does not match merchant sign-off');
    }
    if (
      product.production.provider !== 'printful' ||
      product.providerRefs.printful?.productId !==
        approvedProduct.printfulProductId
    ) {
      throw new Error('Printful product does not match merchant sign-off');
    }
  }
}

export function stripeCheckoutLineItem({
  baseUrl,
  currency,
  line,
}: {
  baseUrl: string;
  currency: string;
  line: StripeCheckoutLine;
}) {
  const variant = getProductVariant(line.product, line.variantId);
  if (!variant) throw new Error(`Unknown variant: ${line.variantId}`);
  return {
    quantity: line.quantity,
    price_data: {
      currency: currency.toLowerCase(),
      unit_amount: line.product.commerce.unitAmount,
      tax_behavior: merchantCatalog.stripeTaxBehavior,
      product_data: {
        name: line.product.title,
        description: variantLabel(variant, true),
        tax_code: merchantCatalog.stripeProductTaxCode,
        images: [
          new URL(getPrimaryCustomerMockup(line.product), baseUrl).toString(),
        ],
        metadata: {
          slug: line.product.slug,
          variant_id: line.variantId,
          provider: line.provider,
          catalog_variant_id: String(line.catalogVariantId),
          sync_variant_id: String(line.syncVariantId),
        },
      },
    },
  } satisfies Stripe.Checkout.SessionCreateParams.LineItem;
}

export async function createCheckoutSession({
  env,
  lines,
  request,
}: {
  env: AppEnv;
  lines: StripeCheckoutLine[];
  request: Request;
}) {
  assertCheckoutConfiguration(env);
  const baseUrl = siteUrl(env, request);
  const catalogRevision = createHash('sha256')
    .update(JSON.stringify(merchProducts))
    .digest('hex');
  assertApprovedCatalogLines(lines);
  const currency = lines[0].product.commerce.currency;
  const provider = lines[0].provider;
  const checkoutShippingOptions = await shippingOptions(env, currency);
  const snapshots = lines.map((line) => {
    const variant = getProductVariant(line.product, line.variantId);
    if (!variant) throw new Error(`Unknown variant: ${line.variantId}`);
    return {
      productSlug: line.product.slug,
      productTitle: line.product.title,
      variantId: line.variantId,
      variantLabel: variantLabel(variant, true),
      quantity: line.quantity,
      unitAmount: line.product.commerce.unitAmount,
      currency,
      provider,
      catalogVariantId: line.catalogVariantId,
      syncVariantId: line.syncVariantId,
    };
  });
  const order = await createPendingOrder({
    catalogRevision,
    currency,
    env,
    items: snapshots,
    policyVersion: MERCHANT_POLICY_VERSION,
    provider,
  });

  try {
    const metadata = {
      source: 'codex-merch',
      sales_channel: 'public-storefront',
      order_id: order.id,
      catalog_revision: catalogRevision,
      policy_version: MERCHANT_POLICY_VERSION,
    };
    const session = await stripeClient(env).checkout.sessions.create(
      {
        ...FIXED_CURRENCY_CHECKOUT_CONTROLS,
        mode: 'payment',
        expires_at: checkoutSessionExpiresAt(),
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/cart`,
        client_reference_id: order.id,
        metadata,
        payment_intent_data: {metadata},
        branding_settings: {display_name: 'Independent Build Week Merch'},
        phone_number_collection: {enabled: true},
        custom_text: {
          submit: {
            message: `Independent, fan-made merchandise created for OpenAI Build Week. Not official or endorsed by OpenAI. By paying, you agree to the Terms and Privacy Policy (version ${MERCHANT_POLICY_VERSION}).`,
          },
        },
        automatic_tax: {enabled: env.STRIPE_AUTOMATIC_TAX === 'true'},
        shipping_address_collection: {
          allowed_countries: allowedShippingCountries(env),
        },
        shipping_options: checkoutShippingOptions,
        line_items: lines.map((line) =>
          stripeCheckoutLineItem({baseUrl, currency, line}),
        ),
      },
      {idempotencyKey: `checkout:${order.id}`},
    );
    await attachStripeSession(order.id, session.id, env);
    return {order, session};
  } catch (error) {
    await markCheckoutCreationFailed(order.id, error, env);
    throw error;
  }
}

export async function retrieveCheckoutSession(sessionId: string, env: AppEnv) {
  return stripeClient(env).checkout.sessions.retrieve(sessionId);
}

export function constructStripeEvent(
  rawBody: string,
  signature: string,
  env: AppEnv,
) {
  requireEnv(env, ['STRIPE_WEBHOOK_SECRET']);
  return stripeClient(env).webhooks.constructEvent(
    rawBody,
    signature,
    env.STRIPE_WEBHOOK_SECRET || '',
    300,
  );
}

export async function checkoutSessionForPaymentIntent(
  paymentIntentId: string,
  env: AppEnv,
) {
  const sessions = await stripeClient(env).checkout.sessions.list({
    payment_intent: paymentIntentId,
    limit: 1,
  });
  return sessions.data[0] || null;
}

export function allowedShippingCountries(env: AppEnv) {
  const configured =
    env.STRIPE_ALLOWED_SHIPPING_COUNTRIES ||
    merchantCatalog.shippingCountries.join(',');
  const countries = configured
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
  if (
    countries.length !== merchantCatalog.shippingCountries.length ||
    countries.some(
      (country, index) =>
        country !== merchantCatalog.shippingCountries[index],
    )
  ) {
    throw new Error('The storefront supports shipping to CH and US only');
  }
  return countries as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}

export async function shippingOptions(
  env: AppEnv,
  currency: string,
  client?: Pick<Stripe, 'shippingRates'>,
) {
  if (env.STRIPE_SHIPPING_RATE_ID) {
    const rate = await (client || stripeClient(env)).shippingRates.retrieve(
      env.STRIPE_SHIPPING_RATE_ID,
    );
    if (!rate.active) throw new Error('Configured Stripe shipping rate is inactive');
    if (rate.fixed_amount?.currency?.toUpperCase() !== currency.toUpperCase()) {
      throw new Error('Configured Stripe shipping rate currency does not match the order');
    }
    if (rate.fixed_amount?.amount !== merchantCatalog.shippingAmount) {
      throw new Error('Configured Stripe shipping rate amount does not match the catalog');
    }
    const rateTaxCode =
      typeof rate.tax_code === 'string' ? rate.tax_code : rate.tax_code?.id;
    if (
      rate.tax_behavior !== merchantCatalog.stripeTaxBehavior ||
      rateTaxCode !== merchantCatalog.stripeShippingTaxCode
    ) {
      throw new Error(
        'Configured Stripe shipping rate tax treatment does not match the catalog',
      );
    }
    if (
      rate.delivery_estimate?.minimum?.unit !== 'business_day' ||
      rate.delivery_estimate.minimum.value !==
        merchantCatalog.deliveryEstimateBusinessDays.minimum ||
      rate.delivery_estimate?.maximum?.unit !== 'business_day' ||
      rate.delivery_estimate.maximum.value !==
        merchantCatalog.deliveryEstimateBusinessDays.maximum
    ) {
      throw new Error(
        'Configured Stripe shipping rate delivery estimate does not match the catalog',
      );
    }
    return [{shipping_rate: env.STRIPE_SHIPPING_RATE_ID}];
  }
  if (env.STRIPE_FLAT_SHIPPING_AMOUNT) {
    const amount = Number(env.STRIPE_FLAT_SHIPPING_AMOUNT);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('STRIPE_FLAT_SHIPPING_AMOUNT must be a non-negative integer');
    }
    if (amount !== merchantCatalog.shippingAmount) {
      throw new Error('Flat shipping amount does not match the approved catalog');
    }
    return [
      {
        shipping_rate_data: {
          type: 'fixed_amount' as const,
          fixed_amount: {amount, currency: currency.toLowerCase()},
          display_name: 'Standard shipping',
          tax_behavior: merchantCatalog.stripeTaxBehavior,
          tax_code: merchantCatalog.stripeShippingTaxCode,
          delivery_estimate: {
            minimum: {
              unit: 'business_day' as const,
              value: merchantCatalog.deliveryEstimateBusinessDays.minimum,
            },
            maximum: {
              unit: 'business_day' as const,
              value: merchantCatalog.deliveryEstimateBusinessDays.maximum,
            },
          },
        },
      },
    ];
  }
  return undefined;
}
