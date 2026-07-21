import {Link, NavLink} from 'react-router';
import {useCart} from '~/lib/cart';
import {useJurySales, useStorefrontMode} from '~/lib/storefront-mode';

export function Header() {
  const {count} = useCart();
  const storefrontMode = useStorefrontMode();
  const jurySales = useJurySales();
  const preview = storefrontMode === 'preview';

  return (
    <>
      <aside className="jury-ribbon" aria-label="Fan project and purchase access">
        <strong>Fan-made Build Week project · Not official OpenAI merch</strong>
        <span>
          {jurySales.enabled
            ? 'Real checkout is reserved exclusively for OpenAI Build Week judges.'
            : preview
              ? 'The judge demo is free and requires no purchase; checkout is disabled.'
              : 'Jury checkout is currently closed.'}
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
              : jurySales.enabled
                ? 'OpenAI Build Week jury pilot. Access code required.'
                : 'Production storefront. Jury checkout closed.'
          }
        >
          <span>
            {preview
              ? 'Prototype preview'
              : jurySales.enabled
                ? 'Jury sales pilot'
                : 'Production storefront'}
          </span>
          <span>
            {preview
              ? 'Checkout disabled'
              : jurySales.enabled
                ? 'Judge code required'
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
