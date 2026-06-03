import type {Route} from './+types/api.stripe.webhook';
import {fulfillStripeCheckout} from '~/lib/fulfillment.server';
import {getEnv} from '~/lib/env.server';
import {
  retrieveCheckoutSessionLineItems,
  verifyStripeWebhook,
  type StripeSession,
} from '~/lib/stripe.server';

type StripeWebhookEvent = {
  type: string;
  data: {
    object: StripeSession;
  };
};

export async function action({context, request}: Route.ActionArgs) {
  const env = getEnv(context);
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) throw new Response('Missing Stripe signature', {status: 400});

  verifyStripeWebhook(rawBody, signature, env);
  const event = JSON.parse(rawBody) as StripeWebhookEvent;

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const lineItems = await retrieveCheckoutSessionLineItems(session.id, env);
    await fulfillStripeCheckout({env, lineItems, request, session});
  }

  return Response.json({received: true});
}

export async function loader() {
  return new Response('Stripe webhook endpoint', {status: 405});
}
