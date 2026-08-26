import {Link, NavLink} from 'react-router';
import {useCart} from '~/lib/cart';
import {
  useCheckoutAvailability,
  useStorefrontMode,
} from '~/lib/storefront-mode';

export function Header() {
  const {count} = useCart();
  const storefrontMode = useStorefrontMode();
  const checkout = useCheckoutAvailability();
  const preview = storefrontMode === 'preview';

  return (
    <>
      <aside className="project-ribbon" aria-label="Fan project and checkout status">
        <strong>Fan-made Build Week project · Not official OpenAI merch</strong>
        <span>
          {checkout.enabled
            ? 'Secure live checkout is available through Stripe.'
            : preview
              ? 'The public preview requires no purchase; checkout is disabled.'
              : 'Checkout is currently closed.'}
        </span>
      </aside>
      <header className="site-header">
        <Link className="site-brand" to="/" aria-label="Codex Merch home">
          <span>Codex</span>
          <span>Signal → Merch</span>
        </Link>
        <p
          className={`site-mode ${storefrontMode}`}
          aria-label={
            preview
              ? 'Prototype preview. Checkout disabled.'
              : checkout.enabled
                ? 'Production storefront. Live Stripe checkout enabled.'
                : 'Production storefront. Checkout closed.'
          }
        >
          <span>
            {preview ? 'Prototype preview' : 'Production storefront'}
          </span>
          <span>
            {preview
              ? 'Checkout disabled'
              : checkout.enabled
                ? 'Live checkout'
                : 'Checkout closed'}
          </span>
        </p>
        <nav className="site-nav" aria-label="Primary navigation">
          <NavLink to="/" end>
            Garments
          </NavLink>
          <NavLink to="/how-it-works">How it works</NavLink>
          <NavLink to="/cart">Cart {count ? `(${count})` : ''}</NavLink>
        </nav>
      </header>
    </>
  );
}
