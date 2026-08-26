import {useEffect} from 'react';
import {Link, useLoaderData, useRevalidator} from 'react-router';
import type {Route} from './+types/checkout.success';
import {useCart} from '~/lib/cart';
import {getEnv} from '~/lib/env.server';
import {getOrderBySession, getOrderItems} from '~/lib/orders.server';
import {retrieveCheckoutSession} from '~/lib/stripe.server';
import {merchantCatalog} from '~/lib/merchant-catalog';

export const meta: Route.MetaFunction = () => [
  {title: 'Codex Merch | Checkout status'},
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
      session.metadata.policy_version !== order.policyVersion ||
      session.payment_status !== 'paid' ||
      session.consent?.terms_of_service !== 'accepted' ||
      session.currency?.toUpperCase() !== order.currency ||
      session.amount_subtotal !== order.subtotalAmount ||
      session.total_details?.amount_shipping !== merchantCatalog.shippingAmount ||
      session.amount_total !== order.subtotalAmount + merchantCatalog.shippingAmount
    ) {
      return {state: 'unverified' as const};
    }
    if (order.paymentStatus === 'pending') {
      return {
        state: 'processing' as const,
        reference: order.publicReference,
      };
    }
    if (order.paymentStatus !== 'paid' || session.amount_total !== order.totalAmount) {
      return {
        state: 'review' as const,
        reference: order.publicReference,
      };
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
  const revalidator = useRevalidator();

  useEffect(() => {
    if (data.state === 'paid') {
      removePurchasedLines(data.reference, data.purchasedLines);
    }
  }, [data, removePurchasedLines]);

  useEffect(() => {
    if (data.state !== 'processing' || revalidator.state !== 'idle') return;
    const timeout = window.setTimeout(
      () => void revalidator.revalidate(),
      2_000,
    );
    return () => window.clearTimeout(timeout);
  }, [data.state, revalidator]);

  if (data.state === 'processing') {
    return (
      <section className="checkout-result" aria-live="polite">
        <h1>Payment received.</h1>
        <p>
          Stripe confirmed your payment. We are securely recording the order;
          this page will update automatically.
        </p>
        <p>Reference: <strong>{data.reference}</strong></p>
        <Link to="/">Back to the shop</Link>
      </section>
    );
  }

  if (data.state === 'review') {
    return (
      <section className="checkout-result">
        <h1>Order under review.</h1>
        <p>
          Stripe matched this payment, but the order needs attention before
          fulfillment. Keep your receipt and reference for support.
        </p>
        <p>Reference: <strong>{data.reference}</strong></p>
        <Link to="/policies/contact">Contact</Link>
      </section>
    );
  }

  if (data.state === 'unverified') {
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
