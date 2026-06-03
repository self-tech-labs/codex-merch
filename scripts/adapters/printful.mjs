const PRINTFUL_API_BASE = 'https://api.printful.com';
const DEFAULT_MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function retryDelayMs(response, text, attempt, env) {
  const configured = Number(env.PRINTFUL_RETRY_BASE_MS);
  const baseMs = Number.isFinite(configured) && configured >= 0 ? configured : 1000;
  const retryAfter = Number(response.headers.get('retry-after'));

  if (Number.isFinite(retryAfter) && retryAfter >= 0) {
    return retryAfter * 1000;
  }

  const secondsMatch = text.match(/after\s+(\d+)\s+seconds?/i);
  if (secondsMatch) {
    return Number(secondsMatch[1]) * 1000;
  }

  return baseMs * 2 ** attempt;
}

export function requirePrintfulEnv(env = process.env) {
  const missing = ['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID'].filter(
    (key) => !env[key],
  );

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return {
    token: env.PRINTFUL_TOKEN,
    storeId: env.PRINTFUL_STORE_ID,
  };
}

export async function createPrintfulStoreProduct(payload, env = process.env) {
  return printfulRequest('/store/products', {method: 'POST', body: payload}, env);
}

export async function updatePrintfulStoreProduct(productId, payload, env = process.env) {
  return printfulRequest(
    `/store/products/${encodeURIComponent(String(productId))}`,
    {method: 'PUT', body: payload},
    env,
  );
}

export async function getPrintfulStoreProduct(productId, env = process.env) {
  return printfulRequest(
    `/store/products/${encodeURIComponent(String(productId))}`,
    {},
    env,
  );
}

export async function getPrintfulStoreProductByExternalId(
  externalId,
  env = process.env,
) {
  return printfulRequest(`/store/products/${externalIdPath(externalId)}`, {}, env);
}

export async function createPrintfulSyncProduct(payload, env = process.env) {
  return createPrintfulStoreProduct(payload, env);
}

async function printfulRequest(path, {method = 'GET', body} = {}, env = process.env) {
  const {token, storeId} = requirePrintfulEnv(env);
  const configuredRetries = Number(env.PRINTFUL_MAX_RETRIES);
  const maxRetries =
    Number.isFinite(configuredRetries) && configuredRetries >= 0
      ? configuredRetries
      : DEFAULT_MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-PF-Store-Id': storeId,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.ok) {
      return response.json();
    }

    const text = await response.text();
    if (response.status === 429 && attempt < maxRetries) {
      await sleep(retryDelayMs(response, text, attempt, env));
      continue;
    }

    throw new Error(`Printful request failed (${response.status} ${path}): ${text}`);
  }
}

export function externalIdPath(id) {
  return `@${encodeURIComponent(String(id).replace(/^@/, ''))}`;
}

export async function getPrintfulSyncProductByExternalId(
  externalId,
  env = process.env,
) {
  return getPrintfulStoreProductByExternalId(externalId, env);
}

export async function listPrintfulSyncProducts(query = {}, env = process.env) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value));
  }

  const suffix = params.size ? `?${params}` : '';
  return printfulRequest(`/sync/products${suffix}`, {}, env);
}

export async function listPrintfulStoreProducts(query = {}, env = process.env) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value));
  }

  const suffix = params.size ? `?${params}` : '';
  return printfulRequest(`/store/products${suffix}`, {}, env);
}

export async function updatePrintfulSyncVariant(
  externalVariantId,
  payload,
  env = process.env,
) {
  return printfulRequest(
    `/sync/variant/${externalIdPath(externalVariantId)}`,
    {method: 'PUT', body: payload},
    env,
  );
}

export async function createPrintfulMockupTask(
  catalogProductId,
  payload,
  env = process.env,
) {
  return printfulRequest(
    `/mockup-generator/create-task/${catalogProductId}`,
    {method: 'POST', body: payload},
    env,
  );
}

export async function getPrintfulMockupTask(taskKey, env = process.env) {
  const params = new URLSearchParams({task_key: taskKey});
  return printfulRequest(`/mockup-generator/task?${params}`, {}, env);
}

export async function createPrintfulOrder(payload, env = process.env) {
  return printfulRequest('/orders', {method: 'POST', body: payload}, env);
}

export async function confirmPrintfulOrder(orderId, env = process.env) {
  return printfulRequest(`/orders/${orderId}/confirm`, {method: 'POST'}, env);
}
