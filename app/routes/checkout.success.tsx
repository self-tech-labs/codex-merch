import {Link, useSearchParams} from 'react-router';
import type {Route} from './+types/checkout.success';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Codex Meme Merch | Checkout complete'}];
};

export default function CheckoutSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');

  return (
    <section className="checkout-result">
      <h1>Order received.</h1>
      <p>
        Stripe confirmed payment. Fulfillment is created from the paid checkout
        session.
      </p>
      {sessionId ? <code>{sessionId}</code> : null}
      <Link to="/">Back to the shop</Link>
    </section>
  );
}
