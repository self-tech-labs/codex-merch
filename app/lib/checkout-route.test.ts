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
  const termsResponse = await responseFrom(action({request: malformed} as any));
  assert.equal(termsResponse.status, 400);
  assert.match(await termsResponse.text(), /merchant terms/);

  const acceptedMalformed = request(
    'cart=not-json&merchantTermsAccepted=2026-07-21&juryAccessCode=unit-test-jury-access',
  );
  assert.equal(
    (
      await responseFrom(
        action({
          context: {
            env: {
              JURY_SALES_ENABLED: 'true',
              JURY_ACCESS_CODE: ['unit', 'test', 'jury', 'access'].join('-'),
              JURY_SALES_END_AT: '2099-08-06T00:00:00Z',
            },
          },
          request: acceptedMalformed,
        } as any),
      )
    ).status,
    400,
  );

  const denied = request(
    'cart=%5B%5D&merchantTermsAccepted=2026-07-21&juryAccessCode=wrong',
  );
  const deniedResponse = await responseFrom(
    action({
      context: {
        env: {
          JURY_SALES_ENABLED: 'true',
          JURY_ACCESS_CODE: ['unit', 'test', 'jury', 'access'].join('-'),
          JURY_SALES_END_AT: '2099-08-06T00:00:00Z',
        },
      },
      request: denied,
    } as any),
  );
  assert.equal(deniedResponse.status, 403);
  assert.equal(await deniedResponse.text(), 'Jury purchase access could not be verified');

  const oversized = request(`cart=${'x'.repeat(33_000)}`);
  assert.equal(
    (await responseFrom(action({request: oversized} as any))).status,
    413,
  );
});
