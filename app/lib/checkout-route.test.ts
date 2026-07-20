import assert from 'node:assert/strict';
import test from 'node:test';
import {action} from '~/routes/api.checkout';

function request(body: string, headers: Record<string, string> = {}) {
  return new Request('https://shop.example/api/checkout', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      origin: 'https://shop.example',
      ...headers,
    },
  });
}

async function responseFrom(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error('Expected the route to throw a response');
  } catch (error) {
    assert.ok(error instanceof Response);
    return error;
  }
}

test('checkout route rejects missing origins and unsupported bodies', async () => {
  const missingOrigin = request('cart=[]');
  missingOrigin.headers.delete('origin');
  assert.equal(
    (await responseFrom(action({request: missingOrigin} as any))).status,
    403,
  );

  const unsupported = request('{}', {'content-type': 'application/json'});
  assert.equal(
    (await responseFrom(action({request: unsupported} as any))).status,
    415,
  );
});

test('checkout route rejects malformed and oversized carts before side effects', async () => {
  const malformed = request('cart=not-json');
  assert.equal(
    (await responseFrom(action({request: malformed} as any))).status,
    400,
  );

  const oversized = request(`cart=${'x'.repeat(33_000)}`);
  assert.equal(
    (await responseFrom(action({request: oversized} as any))).status,
    413,
  );
});
