import {createHmac, timingSafeEqual} from 'node:crypto';
import {
  getMerchProduct,
  getPrimaryCustomerMockup,
  getProductVariant,
  type MerchProduct,
} from '~/lib/merch';
import {requireEnv, siteUrl} from '~/lib/env.server';

export type CheckoutLineInput = {
  productSlug: string;
  variantId: string;
  quantity: number;
};

export type StripeCheckoutLine = {
  product: MerchProduct;
  variantId: string;
  provider: string;
  providerVariantId: number;
  quantity: number;
};

export type StripeSession = {
  id: string;
  url?: string | null;
  customer_details?: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
  } | null;
  shipping_details?: {
    name?: string | null;
    address?: StripeAddress | null;
  } | null;
};

export type StripeLineItem = {
  quantity?: number | null;
  price?: {
    product?:
      | string
      | {
          metadata?: Record<string, string>;
        };
  } | null;
};

export type StripeAddress = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const DEFAULT_STRIPE_API_VERSION = '2026-02-25.clover';

export function normalizeCheckoutLines(lines: unknown): StripeCheckoutLine[] {
  if (!Array.isArray(lines)) throw new Error('Cart payload must be an array');

  return lines.map((line) => {
    const input = line as CheckoutLineInput;
    const productSlug = String(input.productSlug || '');
    const variantId = String(input.variantId || '');
    const product = getMerchProduct(productSlug);
    if (!product) throw new Error(`Unknown product: ${productSlug}`);

    const variant = getProductVariant(product, variantId);
    if (!variant) throw new Error(`Unknown variant: ${variantId}`);

    const quantity = Math.max(1, Math.min(Number(input.quantity) || 1, 10));
    return {
      product,
      variantId: variant.id,
      provider: product.production.provider,
      providerVariantId: variant.providerVariantId,
      quantity,
    };
  });
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
  requireEnv(env, ['STRIPE_SECRET_KEY']);
  if (!lines.length) throw new Error('Cart is empty');

  const baseUrl = siteUrl(env, request);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${baseUrl}/cart`);
  params.set('client_reference_id', `codex-merch-${Date.now()}`);
  params.set('metadata[source]', 'codex-merch');
  params.set('metadata[line_count]', String(lines.length));
  params.set(
    'automatic_tax[enabled]',
    env.STRIPE_AUTOMATIC_TAX === 'true' ? 'true' : 'false',
  );

  const countries = allowedShippingCountries(env);
  countries.forEach((country, index) => {
    params.set(`shipping_address_collection[allowed_countries][${index}]`, country);
  });

  if (env.STRIPE_SHIPPING_RATE_ID) {
    params.set('shipping_options[0][shipping_rate]', env.STRIPE_SHIPPING_RATE_ID);
  } else if (env.STRIPE_FLAT_SHIPPING_AMOUNT) {
    params.set(
      'shipping_options[0][shipping_rate_data][type]',
      'fixed_amount',
    );
    params.set(
      'shipping_options[0][shipping_rate_data][fixed_amount][amount]',
      String(Math.max(0, Number(env.STRIPE_FLAT_SHIPPING_AMOUNT) || 0)),
    );
    params.set(
      'shipping_options[0][shipping_rate_data][fixed_amount][currency]',
      lines[0].product.commerce.currency.toLowerCase(),
    );
    params.set(
      'shipping_options[0][shipping_rate_data][display_name]',
      'Standard shipping',
    );
  }

  lines.forEach((line, index) => {
    const unitAmount = Math.round(Number(line.product.commerce.price) * 100);
    params.set(`line_items[${index}][quantity]`, String(line.quantity));
    params.set(
      `line_items[${index}][price_data][currency]`,
      line.product.commerce.currency.toLowerCase(),
    );
    params.set(
      `line_items[${index}][price_data][unit_amount]`,
      String(unitAmount),
    );
    params.set(
      `line_items[${index}][price_data][product_data][name]`,
      line.product.title,
    );
    params.set(
      `line_items[${index}][price_data][product_data][metadata][slug]`,
      line.product.slug,
    );
    params.set(
      `line_items[${index}][price_data][product_data][metadata][variant_id]`,
      line.variantId,
    );
    params.set(
      `line_items[${index}][price_data][product_data][metadata][provider]`,
      line.provider,
    );
    params.set(
      `line_items[${index}][price_data][product_data][metadata][provider_variant_id]`,
      String(line.providerVariantId),
    );
    params.set(
      `line_items[${index}][price_data][product_data][images][0]`,
      new URL(getPrimaryCustomerMockup(line.product), baseUrl).toString(),
    );
  });

  return stripeRequest<StripeSession>('/checkout/sessions', {
    env,
    method: 'POST',
    params,
  });
}

export async function retrieveCheckoutSessionLineItems(
  sessionId: string,
  env: AppEnv,
) {
  const params = new URLSearchParams({
    limit: '100',
    'expand[]': 'data.price.product',
  });

  const response = await stripeRequest<{data: StripeLineItem[]}>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}/line_items?${params}`,
    {env},
  );

  return response.data || [];
}

export function verifyStripeWebhook(rawBody: string, signature: string, env: AppEnv) {
  requireEnv(env, ['STRIPE_WEBHOOK_SECRET']);
  const parsed = parseStripeSignature(signature);
  const signedPayload = `${parsed.timestamp}.${rawBody}`;
  const expected = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET || '')
    .update(signedPayload)
    .digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const valid = parsed.signatures.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate);
    return (
      candidateBuffer.length === expectedBuffer.length &&
      timingSafeEqual(candidateBuffer, expectedBuffer)
    );
  });

  if (!valid) throw new Error('Invalid Stripe webhook signature');
}

async function stripeRequest<T>(
  path: string,
  {
    env,
    method = 'GET',
    params,
  }: {
    env: AppEnv;
    method?: 'GET' | 'POST';
    params?: URLSearchParams;
  },
) {
  requireEnv(env, ['STRIPE_SECRET_KEY']);

  const response = await fetch(`${STRIPE_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': env.STRIPE_API_VERSION || DEFAULT_STRIPE_API_VERSION,
    },
    body: method === 'POST' ? params : undefined,
  });

  if (!response.ok) {
    throw new Error(`Stripe request failed (${response.status}): ${await response.text()}`);
  }

  return response.json() as Promise<T>;
}

function allowedShippingCountries(env: AppEnv) {
  const configured =
    env.STRIPE_ALLOWED_SHIPPING_COUNTRIES ||
    'US,CA,GB,CH,DE,FR,NL,ES,IT,AU';

  return configured
    .split(',')
    .map((country) => country.trim().toUpperCase())
    .filter(Boolean);
}

function parseStripeSignature(header: string) {
  const parts = Object.fromEntries(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value];
    }),
  );
  const timestamp = parts.t;
  const signatures = header
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestamp || !signatures.length) {
    throw new Error('Malformed Stripe signature header');
  }

  return {timestamp, signatures};
}
