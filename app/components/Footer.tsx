import {Link} from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/">Codex Meme Merch</Link>
      <nav aria-label="Project and store information">
        <Link to="/how-it-works">How it works</Link>
        <Link to="/policies/shipping">Shipping</Link>
        <Link to="/policies/returns">Returns</Link>
        <Link to="/policies/privacy">Privacy</Link>
        <Link to="/policies/terms">Terms</Link>
        <Link to="/policies/contact">Contact</Link>
      </nav>
    </footer>
  );
}
