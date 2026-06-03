import {Link, NavLink} from 'react-router';
import {useCart} from '~/lib/cart';

export function Header() {
  const {count} = useCart();

  return (
    <header className="site-header">
      <Link className="site-brand" to="/" aria-label="Codex Meme Merch home">
        <span>Codex</span>
        <span>Meme Merch</span>
      </Link>
      <nav className="site-nav" aria-label="Primary navigation">
        <NavLink to="/" end>
          Shop
        </NavLink>
        <NavLink to="/cart">Cart {count ? `(${count})` : ''}</NavLink>
      </nav>
    </header>
  );
}
