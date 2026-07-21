import type Stripe from 'stripe';
import type {Route} from './+types/api.stripe.webhook';
import {getEnv} from '~/lib/env.server';
import {
  finishStripeEvent,
  recordStripeEvent,
} from '~/lib/orders.server';
import {
  assertProductionStorefrontMode,
  constructStripeEvent,
} from '~/lib/stripe.server';
import {processStripeEvent} from '~/lib/stripe-webhook.server';

export async function action({context, request}: Route.ActionArgs) {
  const env = getEnv(context);
  try {
    assertProductionStorefrontMode(env);
  } catch {
    throw new Response('Stripe webhooks are disabled', {status: 503});
  }
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) throw new Response('Missing Stripe signature', {status: 400});

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(rawBody, signature, env);
  } catch {
    throw new Response('Invalid Stripe signature', {status: 400});
  }

  const claim = await recordStripeEvent(event, env);
  if (claim.state === 'complete') {
    return Response.json({received: true, duplicate: true});
  }
  if (claim.state === 'busy') {
    throw new Response('Webhook event is already processing', {
      status: 503,
      headers: {'Retry-After': '300'},
    });
  }
  const {processingToken} = claim;

  try {
    const orderId = await processStripeEvent(event, env);
    await finishStripeEvent(event.id, orderId ? 'processed' : 'ignored', env, {
      orderId: orderId || undefined,
      processingToken,
    });
    return Response.json({received: true});
  } catch (error) {
    await finishStripeEvent(event.id, 'failed', env, {
      error,
      processingToken,
    });
    console.error(JSON.stringify({
      event: 'stripe_webhook_failed',
      stripeEventId: event.id,
      stripeEventType: event.type,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw new Response('Webhook processing failed', {status: 500});
  }
}

export async function loader() {
  return new Response('Method not allowed', {status: 405});
}
