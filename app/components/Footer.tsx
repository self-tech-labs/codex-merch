import {Link} from 'react-router';

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer-identity">
        <Link to="/">Codex Merch · Signal → Product</Link>
        <span>
          Fan-made project · Not official OpenAI merchandise · Not affiliated
          with, sponsored by, or endorsed by OpenAI
        </span>
        <span>
          Made with love by{' '}
          <a
            href="https://www.linkedin.com/in/elliotvaucher"
            rel="noreferrer"
            target="_blank"
          >
            Elliot Vaucher
          </a>{' '}
          for the OpenAI Build Week
        </span>
      </div>
      <div className="site-footer-links">
        <nav aria-label="Project and store information">
          <Link to="/how-it-works">How it works</Link>
          <Link to="/policies/shipping">Shipping</Link>
          <Link to="/policies/returns">Returns</Link>
          <Link to="/policies/privacy">Privacy</Link>
          <Link to="/policies/terms">Terms</Link>
          <Link to="/policies/contact">Contact</Link>
        </nav>
      </div>
    </footer>
  );
}
