import {redirect} from 'react-router';
import type {Route} from './+types/api.checkout';
import {getEnv} from '~/lib/env.server';
import {MERCHANT_POLICY_VERSION} from '~/lib/merchant-policy.shared';
import {readRequestTextWithLimit} from '~/lib/request-body.server';
import {createCheckoutSession, normalizeCheckoutLines} from '~/lib/stripe.server';

const MAX_CHECKOUT_BYTES = 32_768;

export async function action({context, request}: Route.ActionArgs) {
  const env = getEnv(context);
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const origin = request.headers.get('origin');
  if (origin !== new URL(request.url).origin) {
    throw new Response('Cross-origin checkout is not allowed', {status: 403});
  }
  const contentType = request.headers.get('content-type')?.split(';', 1)[0];
  if (contentType !== 'application/x-www-form-urlencoded') {
    throw new Response('Unsupported checkout content type', {status: 415});
  }
  const body = await readRequestTextWithLimit(request, {
    maxBytes: MAX_CHECKOUT_BYTES,
    tooLargeMessage: 'Checkout payload is too large',
  });
  const fields = new URLSearchParams(body);
  if (fields.get('merchantTermsAccepted') !== MERCHANT_POLICY_VERSION) {
    throw new Response('Accept the current merchant terms before checkout', {
      status: 400,
    });
  }
  const rawCart = fields.get('cart');
  if (!rawCart) {
    throw new Response('Missing cart payload', {status: 400});
  }

  let lines;
  try {
    lines = normalizeCheckoutLines(JSON.parse(rawCart));
  } catch (error) {
    throw new Response(error instanceof Error ? error.message : 'Invalid cart', {
      status: 400,
    });
  }
  let session;
  try {
    ({session} = await createCheckoutSession({
      env,
      lines,
      request,
    }));
  } catch (error) {
    console.error(JSON.stringify({
      event: 'checkout_creation_failed',
      requestId,
      error: error instanceof Error ? error.message : String(error),
    }));
    throw new Response(`Checkout is temporarily unavailable. Reference: ${requestId}`, {
      status: 503,
    });
  }

  if (!session.url) throw new Response('Stripe did not return a checkout URL', {status: 502});
  return redirect(session.url, {status: 303});
}

export async function loader() {
  return redirect('/cart');
}
