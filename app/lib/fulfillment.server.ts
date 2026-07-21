import type Stripe from 'stripe';
import type {Order, OrderItem} from '~/db/schema.server';
import {requireEnv} from '~/lib/env.server';
import {assertProductionStorefrontMode} from '~/lib/stripe.server';

const PRINTFUL_API_BASE = 'https://api.printful.com';
const MAX_IN_REQUEST_RETRY_DELAY_MS = 5_000;

type PrintfulOrderResponse = {
  result?: {id?: string | number; status?: string};
};

export class PermanentFulfillmentError extends Error {}

export function assertFulfillmentConfiguration(env: AppEnv) {
  try {
    assertProductionStorefrontMode(env);
  } catch (error) {
    throw new PermanentFulfillmentError(
      error instanceof Error ? error.message : 'Fulfillment configuration is incomplete',
    );
  }
  if (env.PRINTFUL_AUTO_CONFIRM !== 'false') {
    throw new PermanentFulfillmentError(
      'Pilot fulfillment requires PRINTFUL_AUTO_CONFIRM=false',
    );
  }
}

export async function createOrFindPrintfulOrder({
  env,
  items,
  order,
  session,
}: {
  env: AppEnv;
  items: OrderItem[];
  order: Order;
  session: Stripe.Checkout.Session;
}) {
  assertFulfillmentConfiguration(env);
  if (order.providerOrderId) {
    const state = await getPrintfulOrderState(order.providerOrderId, env);
    return {id: order.providerOrderId, confirmed: state.committed};
  }
  const externalId = printfulExternalId(order);
  const existing = await findPrintfulOrder(externalId, env);
  const created = existing || (await printfulRequest('/orders', {
    env,
    method: 'POST',
    body: buildPrintfulOrderPayload({externalId, items, session}),
  }));
  const id = created.result?.id;
  if (!id) throw new Error('Printful order ID missing after order creation');
  return {
    id: String(id),
    confirmed: isCommittedPrintfulStatus(created.result?.status),
  };
}

export async function cancelPrintfulOrder(providerOrderId: string, env: AppEnv) {
  assertFulfillmentConfiguration(env);
  const path = `/orders/${encodeURIComponent(providerOrderId)}`;
  const {status} = await getPrintfulOrderState(providerOrderId, env);
  if (status === 'canceled') return true;
  if (!['draft', 'pending'].includes(status || '')) {
    throw new PermanentFulfillmentError(
      `Printful order cannot be safely cancelled from status ${status || 'unknown'}`,
    );
  }
  const cancelled = await printfulRequest(path, {env, method: 'DELETE'});
  if (cancelled.result?.status && cancelled.result.status !== 'canceled') {
    throw new Error(`Printful cancellation returned ${cancelled.result.status}`);
  }
  return true;
}

export async function getPrintfulOrderState(
  providerOrderId: string,
  env: AppEnv,
) {
  assertFulfillmentConfiguration(env);
  const current = await printfulRequest(
    `/orders/${encodeURIComponent(providerOrderId)}`,
    {env},
  );
  const status = current.result?.status;
  if (!status) throw new Error('Printful order status is missing');
  return {status, committed: isCommittedPrintfulStatus(status)};
}

function isCommittedPrintfulStatus(status: string | undefined) {
  return Boolean(status && !['canceled', 'draft', 'failed'].includes(status));
}

export function printfulExternalId(
  order: Pick<Order, 'publicReference'>,
) {
  const externalId = order.publicReference?.trim();
  if (!externalId || externalId.length > 32) {
    throw new PermanentFulfillmentError(
      'Printful external order ID must be a non-empty public reference of at most 32 characters',
    );
  }
  return externalId;
}

export function isRetriableFulfillmentError(error: unknown) {
  if (error instanceof PermanentFulfillmentError) return false;
  if (error instanceof PrintfulRequestError) return error.retriable;
  return true;
}

export function buildPrintfulOrderPayload({
  externalId,
  items,
  session,
}: {
  externalId: string;
  items: Array<Pick<OrderItem, 'syncVariantId' | 'quantity' | 'unitAmount'>>;
  session: Stripe.Checkout.Session;
}) {
  if (!externalId.trim() || externalId.length > 32) {
    throw new PermanentFulfillmentError(
      'Printful external order ID must be between 1 and 32 characters',
    );
  }
  return {
    external_id: externalId,
    recipient: printfulRecipient(session),
    items: items.map((item) => ({
      sync_variant_id: item.syncVariantId,
      quantity: item.quantity,
      retail_price: (item.unitAmount / 100).toFixed(2),
    })),
  };
}

async function findPrintfulOrder(externalId: string, env: AppEnv) {
  try {
    return await printfulRequest(
      `/orders/@${encodeURIComponent(externalId)}`,
      {env},
    );
  } catch (error) {
    if (error instanceof PrintfulRequestError && error.status === 404) return null;
    throw error;
  }
}

export class PrintfulRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retriable: boolean,
  ) {
    super(message);
  }
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
    method?: 'DELETE' | 'GET' | 'POST';
  },
): Promise<PrintfulOrderResponse> {
  try {
    requireEnv(env, ['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID']);
  } catch (error) {
    throw new PermanentFulfillmentError(
      error instanceof Error ? error.message : 'Printful configuration is incomplete',
    );
  }
  const maxRetries = Math.max(0, Number(env.PRINTFUL_MAX_RETRIES) || 3);
  const baseDelay = Math.max(100, Number(env.PRINTFUL_RETRY_BASE_MS) || 500);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${env.PRINTFUL_TOKEN}`,
          'Content-Type': 'application/json',
          'X-PF-Store-Id': env.PRINTFUL_STORE_ID || '',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(Number(env.PRINTFUL_TIMEOUT_MS) || 10_000),
      });
      if (response.ok) return response.json() as Promise<PrintfulOrderResponse>;

      const text = (await response.text()).slice(0, 1000);
      const retriable = response.status === 429 || response.status >= 500;
      if (!retriable || attempt === maxRetries) {
        throw new PrintfulRequestError(
          `Printful request failed (${response.status}): ${text}`,
          response.status,
          retriable,
        );
      }
      const retryDelay =
        retryAfterMilliseconds(response.headers.get('retry-after')) ??
        baseDelay * 2 ** attempt;
      await waitForPrintfulRetry(retryDelay, response.status);
    } catch (error) {
      if (error instanceof PrintfulRequestError) throw error;
      if (attempt === maxRetries) {
        throw new PrintfulRequestError(
          `Printful network request failed: ${error instanceof Error ? error.message : String(error)}`,
          0,
          true,
        );
      }
      await waitForPrintfulRetry(baseDelay * 2 ** attempt, 0);
    }
  }
  throw new Error('Printful request exhausted retries');
}

function printfulRecipient(session: Stripe.Checkout.Session) {
  const sessionWithShipping = session as Stripe.Checkout.Session & {
    shipping_details?: {
      name?: string | null;
      address?: Stripe.Address | null;
    } | null;
  };
  const shipping =
    session.collected_information?.shipping_details ||
    sessionWithShipping.shipping_details;
  const address = shipping?.address;
  if (!address?.line1 || !address.city || !address.country || !address.postal_code) {
    throw new PermanentFulfillmentError(
      'Stripe checkout session is missing a complete shipping address',
    );
  }
  return {
    name: shipping?.name || session.customer_details?.name || 'Codex Merch Customer',
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

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function waitForPrintfulRetry(milliseconds: number, status: number) {
  if (milliseconds > MAX_IN_REQUEST_RETRY_DELAY_MS) {
    throw new PrintfulRequestError(
      'Printful requested a deferred retry outside the safe in-request window',
      status,
      true,
    );
  }
  return delay(milliseconds);
}

function retryAfterMilliseconds(value: string | null) {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.max(0, date - Date.now());
}
