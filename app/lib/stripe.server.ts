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

export function stripeClient(env: AppEnv) {
  requireEnv(env, ['STRIPE_SECRET_KEY']);
  const key = env.STRIPE_SECRET_KEY || '';
  let client = stripeClients.get(key);
  if (!client) {
    client = new Stripe(key, {
      apiVersion: '2026-06-24.dahlia',
      maxNetworkRetries: 2,
      timeout: 10_000,
    });
    stripeClients.set(key, client);
  }
  return client;
}

export function assertCheckoutConfiguration(env: AppEnv) {
  requireEnv(env, [
    'STRIPE_SECRET_KEY',
    'DATABASE_URL',
    'INNGEST_EVENT_KEY',
    'INNGEST_SIGNING_KEY',
    'PRINTFUL_TOKEN',
    'PRINTFUL_STORE_ID',
  ]);
  if (env.NODE_ENV === 'production') {
    if (env.CHECKOUT_ENABLED !== 'true') throw new Error('Production checkout is disabled');
    if (!env.PUBLIC_SITE_URL) {
      throw new Error('Production checkout requires a canonical public site URL');
    }
    if (!env.STOREFRONT_CONTACT_EMAIL) {
      throw new Error('Production checkout requires a merchant contact email');
    }
    if (
      !env.STOREFRONT_SHIPPING_POLICY ||
      !env.STOREFRONT_RETURNS_POLICY ||
      !env.STOREFRONT_PRIVACY_POLICY ||
      !env.STOREFRONT_TERMS_POLICY ||
      !env.STOREFRONT_CONTACT_POLICY
    ) {
      throw new Error('Production checkout requires merchant-reviewed policy copy');
    }
    if (!env.STRIPE_SHIPPING_RATE_ID && !env.STRIPE_FLAT_SHIPPING_AMOUNT) {
      throw new Error('Production checkout requires an approved shipping rate');
    }
    if (
      env.STOREFRONT_LEGAL_APPROVED !== 'true' ||
      env.STOREFRONT_TAX_SHIPPING_APPROVED !== 'true'
    ) {
      throw new Error('Production checkout requires legal and tax/shipping approval');
    }
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
  const currencies = new Set(result.map((line) => line.product.commerce.currency));
  const providers = new Set(result.map((line) => line.provider));
  if (currencies.size !== 1) throw new Error('A checkout may contain only one currency');
  if (providers.size !== 1) throw new Error('A checkout may contain only one provider');
  return result;
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
  const currency = lines[0].product.commerce.currency;
  const provider = lines[0].provider;
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
    provider,
  });

  try {
    const metadata = {
      source: 'codex-merch',
      order_id: order.id,
      catalog_revision: catalogRevision,
    };
    const session = await stripeClient(env).checkout.sessions.create(
      {
        mode: 'payment',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/cart`,
        client_reference_id: order.id,
        metadata,
        payment_intent_data: {metadata},
        automatic_tax: {enabled: env.STRIPE_AUTOMATIC_TAX === 'true'},
        shipping_address_collection: {
          allowed_countries: allowedShippingCountries(env),
        },
        shipping_options: shippingOptions(env, currency),
        line_items: lines.map((line) => ({
          quantity: line.quantity,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: line.product.commerce.unitAmount,
            product_data: {
              name: line.product.title,
              images: [new URL(getPrimaryCustomerMockup(line.product), baseUrl).toString()],
              metadata: {
                slug: line.product.slug,
                variant_id: line.variantId,
                provider: line.provider,
                catalog_variant_id: String(line.catalogVariantId),
                sync_variant_id: String(line.syncVariantId),
              },
            },
          },
        })),
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

function allowedShippingCountries(env: AppEnv) {
  const configured =
    env.STRIPE_ALLOWED_SHIPPING_COUNTRIES ||
    'US,CA,GB,CH,DE,FR,NL,ES,IT,AU';
  return configured
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean) as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[];
}

function shippingOptions(env: AppEnv, currency: string) {
  if (env.STRIPE_SHIPPING_RATE_ID) {
    return [{shipping_rate: env.STRIPE_SHIPPING_RATE_ID}];
  }
  if (env.STRIPE_FLAT_SHIPPING_AMOUNT) {
    const amount = Number(env.STRIPE_FLAT_SHIPPING_AMOUNT);
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error('STRIPE_FLAT_SHIPPING_AMOUNT must be a non-negative integer');
    }
    return [
      {
        shipping_rate_data: {
          type: 'fixed_amount' as const,
          fixed_amount: {amount, currency: currency.toLowerCase()},
          display_name: 'Standard shipping',
        },
      },
    ];
  }
  return undefined;
}
