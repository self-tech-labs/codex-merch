import assert from 'node:assert/strict';
import test from 'node:test';
import {constructStripeEvent, stripeClient} from './stripe.server';

const env: AppEnv = {
  STRIPE_SECRET_KEY: 'sk_test_unit',
  STRIPE_WEBHOOK_SECRET: 'whsec_unit_test',
};
const payload = JSON.stringify({
  id: 'evt_test',
  object: 'event',
  type: 'checkout.session.completed',
  data: {object: {id: 'cs_test'}},
});

test('Stripe webhook verification accepts a current SDK signature', () => {
  const signature = stripeClient(env).webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET!,
  });
  assert.equal(constructStripeEvent(payload, signature, env).id, 'evt_test');
});

test('Stripe webhook verification rejects stale and malformed signatures', () => {
  const signature = stripeClient(env).webhooks.generateTestHeaderString({
    payload,
    secret: env.STRIPE_WEBHOOK_SECRET!,
    timestamp: Math.floor(Date.now() / 1000) - 600,
  });
  assert.throws(() => constructStripeEvent(payload, signature, env));
  assert.throws(() => constructStripeEvent(payload, 't=1,v1=bad', env));
});
