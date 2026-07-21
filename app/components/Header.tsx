import {Link, NavLink} from 'react-router';
import {useCart} from '~/lib/cart';
import {useStorefrontMode} from '~/lib/storefront-mode';

export function Header() {
  const {count} = useCart();
  const storefrontMode = useStorefrontMode();
  const preview = storefrontMode === 'preview';

  return (
    <header className="site-header">
      <Link className="site-brand" to="/" aria-label="Codex Meme Merch home">
        <span>Codex</span>
        <span>Meme Merch</span>
      </Link>
      <p
        className={`site-mode ${storefrontMode}`}
        aria-label={
          preview
            ? 'Prototype preview. Checkout disabled.'
            : 'Production storefront. Commerce remains server gated.'
        }
      >
        <span>{preview ? 'Prototype preview' : 'Production storefront'}</span>
        <span>{preview ? 'Checkout disabled' : 'Commerce gated'}</span>
      </p>
      <nav className="site-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          Shop
        </NavLink>
        <NavLink to="/how-it-works">How it works</NavLink>
        <NavLink to="/cart">Cart {count ? `(${count})` : ''}</NavLink>
      </nav>
    </header>
  );
}
