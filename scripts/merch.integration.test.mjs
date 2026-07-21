import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateArtworkImage,
  generateEditedImage,
} from './adapters/openai-images.mjs';
import {searchRecentPosts} from './adapters/x-api.mjs';
import {
  confirmPrintfulOrder,
  createPrintfulOrder,
  createPrintfulMockupTask,
  createPrintfulStoreProduct,
  getPrintfulStoreProductByExternalId,
  updatePrintfulStoreProduct,
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

test('mocked happy path calls X, OpenAI, and Printful adapters', async () => {
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

    if (String(url).includes('/images/edits')) {
      assert.match(init.headers.Authorization, /Bearer openai-token/);
      assert.equal(init.method, 'POST');
      assert.equal(init.body instanceof FormData, true);
      return jsonResponse({data: [{b64_json: Buffer.from('photo').toString('base64')}]});
    }

    if (String(url).includes('/mockup-generator/create-task/')) {
      assert.equal(init.headers['X-PF-Store-Id'], 'store');
      assert.equal(init.method, 'POST');
      return jsonResponse({result: {task_key: 'mockup-task'}});
    }

    if (String(url).endsWith('/orders')) {
      assert.equal(init.headers['X-PF-Store-Id'], 'store');
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal('confirm' in body, false);
      return jsonResponse({result: {id: 55}});
    }

    if (String(url).endsWith('/orders/55/confirm')) {
      assert.equal(init.method, 'POST');
      return jsonResponse({result: {id: 55, status: 'confirmed'}});
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
    await generateEditedImage(
      {
        prompt: 'Render as a real merch photo.',
        images: [
          {
            path: 'source.png',
            buffer: Buffer.from('png'),
            name: 'source.png',
          },
        ],
      },
      {OPENAI_API_KEY: 'openai-token'},
    );
    await createPrintfulMockupTask(
      1418,
      {variant_ids: [33966], files: []},
      {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
    );
    await createPrintfulOrder(
      {confirm: false, recipient: {}, items: []},
      {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
    );
    await confirmPrintfulOrder(55, {
      PRINTFUL_TOKEN: 'printful',
      PRINTFUL_STORE_ID: 'store',
    });
  } finally {
    restore();
  }

  assert.equal(calls.length, 6);
});

test('Printful adapter retries rate-limited requests', async () => {
  let calls = 0;
  const restore = mockFetch(async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(
        JSON.stringify({error: {reason: 'TooManyRequests'}}),
        {
          status: 429,
          headers: {'Content-Type': 'application/json', 'Retry-After': '0'},
        },
      );
    }

    return jsonResponse({result: {id: 77}});
  });

  try {
    const result = await updatePrintfulSyncVariant(
      '123',
      {variant_id: 4017, files: []},
      {
        PRINTFUL_TOKEN: 'printful',
        PRINTFUL_STORE_ID: 'store',
        PRINTFUL_MAX_RETRIES: '1',
      },
    );

    assert.equal(result.result.id, 77);
    assert.equal(calls, 2);
  } finally {
    restore();
  }
});

test('Printful native store product adapter uses Manual order API endpoints', async () => {
  const calls = [];
  const restore = mockFetch(async (url, init = {}) => {
    calls.push({url: String(url), init});
    assert.equal(init.headers.Authorization, 'Bearer printful');
    assert.equal(init.headers['X-PF-Store-Id'], 'store');
    return jsonResponse({result: {id: 88, sync_variants: [{id: 99}]}});
  });

  try {
    await createPrintfulStoreProduct(
      {sync_product: {name: 'Test'}, sync_variants: []},
      {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
    );
    await getPrintfulStoreProductByExternalId('test-shirt', {
      PRINTFUL_TOKEN: 'printful',
      PRINTFUL_STORE_ID: 'store',
    });
    await updatePrintfulStoreProduct(
      88,
      {sync_product: {name: 'Test'}, sync_variants: []},
      {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
    );
  } finally {
    restore();
  }

  assert.equal(calls[0].url, 'https://api.printful.com/store/products');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(
    calls[1].url,
    'https://api.printful.com/store/products/@test-shirt',
  );
  assert.equal(
    calls[2].url,
    'https://api.printful.com/store/products/88',
  );
  assert.equal(calls[2].init.method, 'PUT');
});

test('Printful failures remain resumable', async () => {
  const restore = mockFetch(async () =>
    jsonResponse({error: {message: 'Not found'}}, 404),
  );

  try {
    await assert.rejects(
      createPrintfulOrder(
        {confirm: false, recipient: {}, items: []},
        {PRINTFUL_TOKEN: 'printful', PRINTFUL_STORE_ID: 'store'},
      ),
      /Printful request failed \(404/,
    );
  } finally {
    restore();
  }
});
