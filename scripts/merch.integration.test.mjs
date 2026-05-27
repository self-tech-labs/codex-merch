import test from 'node:test';
import assert from 'node:assert/strict';
import {generateArtworkImage} from './adapters/openai-images.mjs';
import {searchRecentPosts} from './adapters/x-api.mjs';
import {upsertShopifyProductSet} from './adapters/shopify-admin.mjs';
import {
  getPrintfulSyncProductByExternalId,
  updatePrintfulSyncVariant,
} from './adapters/printful.mjs';

function mockFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = original;
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

test('mocked happy path calls X, OpenAI, Shopify, and Printful adapters', async () => {
  const calls = [];
  const restore = mockFetch(async (url, init = {}) => {
    calls.push({url: String(url), init});

    if (String(url).includes('/tweets/search/recent')) {
      assert.match(init.headers.Authorization, /Bearer x-token/);
      return jsonResponse({data: [], includes: {users: []}});
    }

    if (String(url).includes('/images/generations')) {
      const body = JSON.parse(init.body);
      assert.equal(body.model, 'gpt-image-2');
      return jsonResponse({data: [{b64_json: Buffer.from('png').toString('base64')}]});
    }

    if (String(url).includes('/admin/api/')) {
      assert.equal(init.headers['X-Shopify-Access-Token'], 'shop-token');
      return jsonResponse({
        data: {
          productSet: {
            product: {
              id: 'gid://shopify/Product/1',
              handle: 'test-shirt',
              status: 'DRAFT',
              variants: {nodes: []},
            },
            productSetOperation: null,
            userErrors: [],
          },
        },
      });
    }

    if (String(url).includes('/sync/products/')) {
      assert.equal(init.headers['X-PF-Store-Id'], 'store');
      return jsonResponse({result: {sync_product: {id: 55}}});
    }

    if (String(url).includes('/sync/variant/')) {
      assert.equal(init.method, 'PUT');
      return jsonResponse({result: {id: 77}});
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });

  try {
    await searchRecentPosts(
      {query: 'codex lang:en -is:retweet'},
      {X_BEARER_TOKEN: 'x-token'},
    );
    await generateArtworkImage(
      {prompt: 'Original apparel artwork'},
      {OPENAI_API_KEY: 'openai-token'},
    );
    await upsertShopifyProductSet(
      {
        input: {title: 'Test Shirt', handle: 'test-shirt'},
        identifier: {customId: {namespace: 'codex_merch', key: 'manifest_id', value: '1'}},
        synchronous: true,
      },
      {PUBLIC_STORE_DOMAIN: 'example.myshopify.com', SHOPIFY_ADMIN_ACCESS_TOKEN: 'shop-token'},
    );
    await getPrintfulSyncProductByExternalId('1', {
      PRINTFUL_TOKEN: 'printful',
      PRINTFUL_STORE_ID: 'store',
    });
    await updatePrintfulSyncVariant(
      '123',
      {variant_id: 4017, files: []},
      {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
    );
  } finally {
    restore();
  }

  assert.equal(calls.length, 5);
});

test('Printful import-not-ready failure remains resumable', async () => {
  const restore = mockFetch(async () =>
    jsonResponse({error: {message: 'Not found'}}, 404),
  );

  try {
    await assert.rejects(
      getPrintfulSyncProductByExternalId('missing', {
        PRINTFUL_TOKEN: 'printful',
        PRINTFUL_STORE_ID: 'store',
      }),
      /Printful request failed \(404/,
    );
  } finally {
    restore();
  }
});
