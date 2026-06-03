import {Link} from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/">Codex Meme Merch</Link>
      <span>Stripe checkout, provider fulfillment, manifest catalog.</span>
    </footer>
  );
}
