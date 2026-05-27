const PRINTFUL_API_BASE = 'https://api.printful.com';

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

export async function createPrintfulSyncProduct(payload, env = process.env) {
  const {token, storeId} = requirePrintfulEnv(env);
  const response = await fetch(`${PRINTFUL_API_BASE}/store/products`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': storeId,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Printful sync failed (${response.status}): ${await response.text()}`,
    );
  }

  return response.json();
}

async function printfulRequest(path, {method = 'GET', body} = {}, env = process.env) {
  const {token, storeId} = requirePrintfulEnv(env);
  const response = await fetch(`${PRINTFUL_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-PF-Store-Id': storeId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(
      `Printful request failed (${response.status} ${path}): ${await response.text()}`,
    );
  }

  return response.json();
}

export function externalIdPath(id) {
  return `@${encodeURIComponent(String(id).replace(/^@/, ''))}`;
}

export async function getPrintfulSyncProductByExternalId(
  externalId,
  env = process.env,
) {
  return printfulRequest(`/sync/products/${externalIdPath(externalId)}`, {}, env);
}

export async function listPrintfulSyncProducts(query = {}, env = process.env) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value));
  }

  const suffix = params.size ? `?${params}` : '';
  return printfulRequest(`/sync/products${suffix}`, {}, env);
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
