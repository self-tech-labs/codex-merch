import {
  getMerchProduct,
  getProductionPlacementFiles,
  getProductVariant,
} from '~/lib/merch';
import {requireEnv, siteUrl} from '~/lib/env.server';
import type {StripeLineItem, StripeSession} from '~/lib/stripe.server';

const PRINTFUL_API_BASE = 'https://api.printful.com';

type PrintfulOrderResponse = {
  result?: {
    id?: string | number;
  };
};

export async function fulfillStripeCheckout({
  env,
  lineItems,
  request,
  session,
}: {
  env: AppEnv;
  lineItems: StripeLineItem[];
  request: Request;
  session: StripeSession;
}) {
  const payload = buildFulfillmentOrderPayload({
    env,
    lineItems,
    session,
    siteUrl: siteUrl(env, request),
  });
  const order = await createPrintfulOrder(payload, env);

  if (env.PRINTFUL_AUTO_CONFIRM === 'true') {
    return confirmPrintfulOrder(order.result?.id, env);
  }

  return order;
}

export function buildPrintfulOrderPayload(input: {
  env?: AppEnv;
  lineItems: StripeLineItem[];
  session: StripeSession;
  siteUrl: string;
}) {
  return buildFulfillmentOrderPayload(input);
}

export function buildFulfillmentOrderPayload({
  env = process.env,
  lineItems,
  session,
  siteUrl,
}: {
  env?: AppEnv;
  lineItems: StripeLineItem[];
  session: StripeSession;
  siteUrl: string;
}) {
  assertPrintfulAssetUrl(siteUrl, env);

  const recipient = printfulRecipient(session);
  const items = lineItems.map((lineItem) => {
    const metadata = productMetadata(lineItem);
    const product = getMerchProduct(metadata.slug);
    if (!product) throw new Error(`Unknown product in Stripe line item: ${metadata.slug}`);
    if ((metadata.provider || product.production.provider) !== 'printful') {
      throw new Error(`Unsupported fulfillment provider: ${metadata.provider}`);
    }

    const variant = getProductVariant(product, metadata.variant_id);
    if (!variant) {
      throw new Error(`Unknown variant in Stripe line item: ${metadata.variant_id}`);
    }

    return {
      sync_variant_id: null,
      variant_id: variant.providerVariantId,
      quantity: Math.max(1, Number(lineItem.quantity) || 1),
      retail_price: product.commerce.price,
      files: getProductionPlacementFiles(product, siteUrl),
      name: product.title,
    };
  });

  return {
    external_id: session.id,
    confirm: false,
    recipient,
    items,
  };
}

function assertPrintfulAssetUrl(url: string, env: AppEnv) {
  if (env.PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS === 'true') return;

  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') {
    throw new Error(
      'Printful requires PUBLIC_SITE_URL to be a public HTTPS origin so it can fetch print files.',
    );
  }
}

async function createPrintfulOrder(payload: unknown, env: AppEnv) {
  return printfulRequest('/orders', {env, method: 'POST', body: payload});
}

async function confirmPrintfulOrder(orderId: string | number | undefined, env: AppEnv) {
  if (!orderId) throw new Error('Printful order ID missing after order creation');
  return printfulRequest(`/orders/${orderId}/confirm`, {env, method: 'POST'});
}

async function printfulRequest(
  path: string,
  {
    body,
    env,
    method = 'GET',
  }: {
    body?: unknown;
    env: AppEnv;
    method?: 'GET' | 'POST';
  },
) {
  requireEnv(env, ['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID']);
  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PRINTFUL_TOKEN}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': env.PRINTFUL_STORE_ID || '',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Printful request failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<PrintfulOrderResponse>;
}

function productMetadata(lineItem: StripeLineItem) {
  const product = lineItem.price?.product;
  const metadata = typeof product === 'object' ? product.metadata || {} : {};
  if (!metadata.slug || !metadata.variant_id) {
    throw new Error('Stripe line item is missing product metadata');
  }

  return metadata;
}

function printfulRecipient(session: StripeSession) {
  const address = session.shipping_details?.address;
  if (!address?.line1 || !address.city || !address.country || !address.postal_code) {
    throw new Error('Stripe checkout session is missing a complete shipping address');
  }

  return {
    name:
      session.shipping_details?.name ||
      session.customer_details?.name ||
      'Codex Merch Customer',
    address1: address.line1,
    address2: address.line2 || '',
    city: address.city,
    state_code: address.state || '',
    country_code: address.country,
    zip: address.postal_code,
    email: session.customer_details?.email || '',
    phone: session.customer_details?.phone || '',
  };
}
