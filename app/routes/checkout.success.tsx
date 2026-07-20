import {useEffect} from 'react';
import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/checkout.success';
import {useCart} from '~/lib/cart';
import {getEnv} from '~/lib/env.server';
import {getOrderBySession, getOrderItems} from '~/lib/orders.server';
import {retrieveCheckoutSession} from '~/lib/stripe.server';

export const meta: Route.MetaFunction = () => [
  {title: 'Codex Meme Merch | Checkout status'},
  {name: 'robots', content: 'noindex,nofollow'},
];

export async function loader({context, request}: Route.LoaderArgs) {
  const sessionId = new URL(request.url).searchParams.get('session_id');
  if (!sessionId?.startsWith('cs_')) return {state: 'unverified' as const};
  try {
    const env = getEnv(context);
    const [session, order] = await Promise.all([
      retrieveCheckoutSession(sessionId, env),
      getOrderBySession(sessionId, env),
    ]);
    if (
      !order ||
      session.metadata?.source !== 'codex-merch' ||
      session.metadata.order_id !== order.id ||
      session.metadata.catalog_revision !== order.catalogRevision ||
      session.payment_status !== 'paid' ||
      order.paymentStatus !== 'paid' ||
      session.currency?.toUpperCase() !== order.currency ||
      session.amount_subtotal !== order.subtotalAmount ||
      session.amount_total !== order.totalAmount
    ) {
      return {state: 'unverified' as const};
    }
    const items = await getOrderItems(order.id, env);
    return {
      state: 'paid' as const,
      reference: order.publicReference,
      fulfillmentStatus: order.fulfillmentStatus,
      purchasedLines: items.map((item) => ({
        productSlug: item.productSlug,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    };
  } catch {
    return {state: 'unverified' as const};
  }
}

export default function CheckoutSuccess() {
  const data = useLoaderData<typeof loader>();
  const {removePurchasedLines} = useCart();

  useEffect(() => {
    if (data.state === 'paid') {
      removePurchasedLines(data.reference, data.purchasedLines);
    }
  }, [data, removePurchasedLines]);

  if (data.state !== 'paid') {
    return (
      <section className="checkout-result">
        <h1>Payment not verified.</h1>
        <p>
          We could not match this page to a paid Codex Merch order. Check your
          Stripe receipt or return to your cart.
        </p>
        <Link to="/cart">Return to cart</Link>
      </section>
    );
  }

  return (
    <section className="checkout-result">
      <h1>Order received.</h1>
      <p>
        Payment is confirmed. Your order is {fulfillmentCopy(data.fulfillmentStatus)}.
      </p>
      <p>Reference: <strong>{data.reference}</strong></p>
      <Link to="/">Back to the shop</Link>
    </section>
  );
}

function fulfillmentCopy(status: string) {
  if (status === 'confirmed') return 'confirmed with the production partner';
  if (status === 'draft_created') return 'awaiting production review';
  if (status === 'failed') return 'being reviewed after a fulfillment error';
  return 'being prepared for fulfillment';
}
