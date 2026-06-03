import {redirect} from 'react-router';
import type {Route} from './+types/api.checkout';
import {getEnv} from '~/lib/env.server';
import {createCheckoutSession, normalizeCheckoutLines} from '~/lib/stripe.server';

export async function action({context, request}: Route.ActionArgs) {
  const formData = await request.formData();
  const rawCart = formData.get('cart');
  if (typeof rawCart !== 'string') {
    throw new Response('Missing cart payload', {status: 400});
  }

  const lines = normalizeCheckoutLines(JSON.parse(rawCart));
  const session = await createCheckoutSession({
    env: getEnv(context),
    lines,
    request,
  });

  if (!session.url) throw new Response('Stripe did not return a checkout URL', {status: 502});
  return redirect(session.url, {status: 303});
}

export async function loader() {
  return redirect('/cart');
}
