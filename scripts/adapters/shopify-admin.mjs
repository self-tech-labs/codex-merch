const TOKEN_REFRESH_BUFFER_MS = 60_000;
let clientCredentialsToken = null;
let clientCredentialsTokenKey = null;
let clientCredentialsTokenExpiresAt = 0;

function normalizeStoreDomain(env = process.env) {
  const raw = env.PUBLIC_STORE_DOMAIN || env.SHOPIFY_SHOP;
  if (!raw) return null;

  const host = raw
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '')
    .replace(/\.myshopify\.com$/, '');

  return `${host}.myshopify.com`;
}

export function requireShopifyAdminEnv(env = process.env) {
  const storeDomain = normalizeStoreDomain(env);
  const hasClientCredentials = env.SHOPIFY_CLIENT_ID && env.SHOPIFY_CLIENT_SECRET;
  const missing = [];
  if (!storeDomain) missing.push('PUBLIC_STORE_DOMAIN');
  if (!env.SHOPIFY_ADMIN_ACCESS_TOKEN && !hasClientCredentials) {
    missing.push('SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_CLIENT_ID/SHOPIFY_CLIENT_SECRET');
  }

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return {
    storeDomain,
    token: env.SHOPIFY_ADMIN_ACCESS_TOKEN || null,
    clientId: env.SHOPIFY_CLIENT_ID || null,
    clientSecret: env.SHOPIFY_CLIENT_SECRET || null,
    apiVersion: env.SHOPIFY_ADMIN_API_VERSION || '2026-04',
  };
}

export async function getShopifyAdminAccessToken(env = process.env) {
  const context = requireShopifyAdminEnv(env);
  if (!context.clientId || !context.clientSecret) return context.token;

  const cacheKey = `${context.storeDomain}:${context.clientId}`;
  if (
    clientCredentialsToken &&
    clientCredentialsTokenKey === cacheKey &&
    Date.now() < clientCredentialsTokenExpiresAt - TOKEN_REFRESH_BUFFER_MS
  ) {
    return clientCredentialsToken;
  }

  const response = await fetch(
    `https://${context.storeDomain}/admin/oauth/access_token`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: context.clientId,
        client_secret: context.clientSecret,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shopify Admin token request failed (${response.status}): ${await response.text()}`,
    );
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error(`Shopify Admin token response missing access_token`);
  }

  clientCredentialsToken = payload.access_token;
  clientCredentialsTokenKey = cacheKey;
  clientCredentialsTokenExpiresAt =
    Date.now() + Number(payload.expires_in || 86400) * 1000;

  return clientCredentialsToken;
}

export async function shopifyAdminGraphql(query, variables, env = process.env) {
  const {storeDomain, apiVersion} = requireShopifyAdminEnv(env);
  const token = await getShopifyAdminAccessToken(env);
  const response = await fetch(
    `https://${storeDomain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({query, variables}),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Shopify Admin request failed (${response.status}): ${await response.text()}`,
    );
  }

  const result = await response.json();
  if (result.errors?.length) {
    throw new Error(`Shopify Admin GraphQL errors: ${JSON.stringify(result.errors)}`);
  }

  return result;
}

export async function listShopifyPublications(env = process.env) {
  const query = `#graphql
    query CodexMerchPublications {
      publications(first: 50) {
        nodes {
          id
          name
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(query, {}, env);
  return result.data?.publications?.nodes || [];
}

export function findShopifyPublication(publications, name) {
  const normalizedName = String(name || '').trim().toLowerCase();
  return publications.find(
    (publication) => publication.name.toLowerCase() === normalizedName,
  );
}

export async function publishShopifyResource(
  {resourceId, publicationId},
  env = process.env,
) {
  const mutation = `#graphql
    mutation CodexMerchPublish($id: ID!, $publicationId: ID!) {
      publishablePublish(id: $id, input: {publicationId: $publicationId}) {
        publishable {
          publishedOnPublication(publicationId: $publicationId)
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(
    mutation,
    {id: resourceId, publicationId},
    env,
  );
  const payload = result.data?.publishablePublish;
  const errors = payload?.userErrors || [];
  if (errors.length) {
    throw new Error(`Shopify publish user errors: ${JSON.stringify(errors)}`);
  }

  return payload;
}

export async function upsertShopifyProductSet(
  {input, identifier = null, synchronous = true},
  env = process.env,
) {
  const mutation = `#graphql
    mutation CodexMerchProductSet(
      $input: ProductSetInput!
      $identifier: ProductSetIdentifiers
      $synchronous: Boolean!
    ) {
      productSet(
        input: $input
        identifier: $identifier
        synchronous: $synchronous
      ) {
        product {
          id
          handle
          status
          variants(first: 100) {
            nodes {
              id
              sku
              selectedOptions {
                name
                value
              }
            }
          }
        }
        productSetOperation {
          id
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(
    mutation,
    {input, identifier, synchronous},
    env,
  );

  const errors = result.data?.productSet?.userErrors || [];
  if (errors.length) {
    throw new Error(`Shopify productSet user errors: ${JSON.stringify(errors)}`);
  }

  return result.data.productSet;
}

export async function createStagedUploadTarget(file, env = process.env) {
  const mutation = `#graphql
    mutation CodexMerchStagedUpload($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(
    mutation,
    {
      input: [
        {
          filename: file.filename,
          mimeType: file.mimeType,
          resource: file.resource || 'IMAGE',
          httpMethod: file.httpMethod || 'POST',
        },
      ],
    },
    env,
  );

  const payload = result.data?.stagedUploadsCreate;
  const errors = payload?.userErrors || [];
  if (errors.length) {
    throw new Error(`Shopify staged upload errors: ${JSON.stringify(errors)}`);
  }

  return payload.stagedTargets[0];
}

export async function uploadToStagedTarget(target, file) {
  if (file.httpMethod === 'PUT') {
    const response = await fetch(target.url, {
      method: 'PUT',
      headers: {'Content-Type': file.mimeType},
      body: file.buffer,
    });

    if (!response.ok) {
      throw new Error(
        `Shopify staged PUT failed (${response.status}): ${await response.text()}`,
      );
    }

    return;
  }

  const form = new FormData();
  for (const parameter of target.parameters || []) {
    form.append(parameter.name, parameter.value);
  }
  form.append('file', new Blob([file.buffer], {type: file.mimeType}), file.filename);

  const response = await fetch(target.url, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    throw new Error(
      `Shopify staged POST failed (${response.status}): ${await response.text()}`,
    );
  }
}

export async function createShopifyFiles(files, env = process.env) {
  const mutation = `#graphql
    mutation CodexMerchFileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          alt
          fileStatus
          ... on MediaImage {
            image {
              url
            }
          }
          ... on GenericFile {
            url
          }
        }
        userErrors {
          field
          message
          code
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(mutation, {files}, env);
  const payload = result.data?.fileCreate;
  const errors = payload?.userErrors || [];
  if (errors.length) {
    throw new Error(`Shopify fileCreate user errors: ${JSON.stringify(errors)}`);
  }

  return payload.files;
}

export async function getShopifyFilesByIds(ids, env = process.env) {
  if (!ids.length) return [];

  const query = `#graphql
    query CodexMerchFiles($ids: [ID!]!) {
      nodes(ids: $ids) {
        id
        ... on MediaImage {
          alt
          fileStatus
          image {
            url
          }
        }
        ... on GenericFile {
          alt
          fileStatus
          url
        }
      }
    }
  `;

  const result = await shopifyAdminGraphql(query, {ids}, env);
  return result.data?.nodes?.filter(Boolean) || [];
}

export async function waitForShopifyFilesReady(
  ids,
  {attempts = 12, delayMs = 1500} = {},
  env = process.env,
) {
  let files = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    files = await getShopifyFilesByIds(ids, env);
    const ready = files.every(
      (file) =>
        file?.fileStatus === 'READY' &&
        (file?.image?.url || file?.url),
    );

    if (ready) return files;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return files;
}
