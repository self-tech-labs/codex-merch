import {Link} from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/">Codex Meme Merch</Link>
      <nav aria-label="Store policies">
        <Link to="/policies/shipping">Shipping</Link>
        <Link to="/policies/returns">Returns</Link>
        <Link to="/policies/privacy">Privacy</Link>
        <Link to="/policies/terms">Terms</Link>
        <Link to="/policies/contact">Contact</Link>
      </nav>
    </footer>
  );
}
