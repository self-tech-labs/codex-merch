export function requireShopifyAdminEnv(env = process.env) {
  const missing = ['PUBLIC_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN'].filter(
    (key) => !env[key],
  );

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  return {
    storeDomain: env.PUBLIC_STORE_DOMAIN,
    token: env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    apiVersion: env.SHOPIFY_ADMIN_API_VERSION || '2026-04',
  };
}

export async function shopifyAdminGraphql(query, variables, env = process.env) {
  const {storeDomain, token, apiVersion} = requireShopifyAdminEnv(env);
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
