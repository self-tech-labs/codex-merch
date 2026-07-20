import {Link} from 'react-router';
import type {Route} from './+types/checkout.cancel';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Meme Merch | Checkout canceled'},
    {name: 'robots', content: 'noindex,nofollow'},
  ];
};

export default function CheckoutCancel() {
  return (
    <section className="checkout-result">
      <h1>Checkout canceled.</h1>
      <p>Your cart is still local to this browser.</p>
      <Link to="/cart">Return to cart</Link>
    </section>
  );
}
