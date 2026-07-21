import {Link} from 'react-router';
import type {Route} from './+types/how-it-works';
import {useJurySales, useStorefrontMode} from '~/lib/storefront-mode';

export const meta: Route.MetaFunction = () => [
  {title: 'Codex Merch | How it works'},
  {
    name: 'description',
    content:
      'An open-source, hackable pipeline from a trusted trend signal to a production-ready garment.',
  },
];

const ownerPrompt = 'Create a preview merch for the trend ‘The Sol Shines’.';

const pipeline = [
  {
    verb: 'Signal',
    title: 'Start with a premise',
    body: 'Use a direct owner brief, or let the weekly workflow inspect exactly 30 posts from an authorized X list. Provenance stays attached, so an owner idea is never passed off as discovered evidence.',
    output: 'Trusted trend contract',
  },
  {
    verb: 'Direct',
    title: 'Choose a visual world',
    body: 'GPT-5.6 proposes exactly three materially different, panel-aware garment systems in strongest-first order. On the weekly route, a weak or unsafe signal ends successfully as no_trend.',
    output: 'Three ranked recipes',
  },
  {
    verb: 'Build',
    title: 'Make the real files',
    body: 'Deterministic code composes the front, back, both sleeves, label panel, and inside label against the provider template. The same inputs reproduce the same files and hashes.',
    output: 'Six production panels',
  },
  {
    verb: 'Prove',
    title: 'Review what was rendered',
    body: 'GPT-5.6 critiques the actual garment output. Code separately enforces rights rules, placement coverage, exact dimensions, PNG integrity, prepress, and repository checks.',
    output: 'Inspectable proof',
  },
  {
    verb: 'Release',
    title: 'Stop safely—or ship',
    body: 'The judged path stops at a non-purchasable Vercel Preview. A production run needs separate human authority before provider sync, publication, checkout, and fulfillment can open.',
    output: 'Preview or gated product',
  },
] as const;

const roles = [
  {
    eyebrow: 'Taste',
    title: 'GPT-5.6 proposes',
    items: [
      'Interpret a recurring signal',
      'Rank three garment directions',
      'Critique the actual render',
    ],
  },
  {
    eyebrow: 'Guarantees',
    title: 'Code proves',
    items: [
      'Track provenance and rights checks',
      'Render exact provider-sized panels',
      'Gate hashes, retries, and publication',
    ],
  },
  {
    eyebrow: 'Authority',
    title: 'A human releases',
    items: [
      'Authorize the signal source',
      'Approve brand and commercial rights',
      'Enable providers and commerce',
    ],
  },
] as const;

const hackPoints = [
  {
    label: '01 / Signal',
    title: 'Bring another source',
    body: 'Replace X with a community feed, search signal, sell-through data, or an internal trend desk.',
    path: 'scripts/adapters/ · scripts/services/signals.mjs',
  },
  {
    label: '02 / Judgment',
    title: 'Change the decision contract',
    body: 'Prompts and strict JSON Schemas are repository files, not instructions hidden inside an app.',
    path: 'scripts/prompts/ · merch/weekly/schemas/',
  },
  {
    label: '03 / Product',
    title: 'Change the physical format',
    body: 'Add another garment, print technique, panel system, or deterministic composition grammar.',
    path: 'merch/base-products.json · scripts/services/weekly-product.mjs',
  },
  {
    label: '04 / Outcome',
    title: 'Change where it lands',
    body: 'Keep the Preview, connect another provider, or route validated concepts into an existing commerce stack.',
    path: 'scripts/services/production-providers.mjs · app/',
  },
] as const;

const opportunities = [
  {
    metric: 'Speed',
    title: 'Shorter signal-to-sample loops',
    body: 'Turn a qualified cultural signal into a testable product system in one traceable run—relevant to high-velocity retailers such as Zara and Shein.',
  },
  {
    metric: 'Specificity',
    title: 'Smaller, sharper capsules',
    body: 'Translate community, geography, or customer-segment signals into micro-runs without rebuilding the creative and production workflow each time.',
  },
  {
    metric: 'R&D',
    title: 'A replaceable fashion lab',
    body: 'Luxury groups such as Richemont and LVMH could evaluate models, sources, product formats, and approval policies as separate components instead of one opaque generator.',
  },
] as const;

export default function HowItWorks() {
  const storefrontMode = useStorefrontMode();
  const jurySales = useJurySales();
  const preview = storefrontMode === 'preview';

  return (
    <article className="how-page">
      <header className="how-hero">
        <div className="how-hero-copy">
          <p className="how-kicker">Open-source signal-to-product system</p>
          <h1>Signal in.<br />Merch out.</h1>
          <p className="how-deck">
            Codex Merch is a hackable pipeline that turns a trusted trend into
            an original, production-ready garment—not just an image. Model
            taste, software guarantees, and human release authority stay
            deliberately separate.
          </p>
        </div>

        <figure className="owner-prompt">
          <figcaption>One-sentence Build Week input</figcaption>
          <blockquote>
            <p>{ownerPrompt}</p>
          </blockquote>
          <p>Output / 6 panels · catalog entry · hashed proof</p>
        </figure>
      </header>

      <section
        className={`prototype-disclosure ${storefrontMode}`}
        aria-labelledby="preview-title"
      >
        <div>
          <p className="disclosure-label">Current deployment</p>
          <div>
            <h2 id="preview-title">
              {preview ? 'Inspectable Preview' : 'Production mode'}
            </h2>
            <p>
              {preview
                ? 'Explore the products and the complete creative proof. Checkout, provider mutation, and production orders are disabled.'
                : jurySales.enabled
                  ? 'The free judge demo remains open. Optional real checkout is time-limited, access-code protected, and reserved exclusively for OpenAI Build Week judges.'
                  : 'Commerce is fail-closed because the jury-only sales window is closed or not fully configured.'}
            </p>
          </div>
        </div>
        <span>
          {preview
            ? 'No payment · No order'
            : jurySales.enabled
              ? 'Jury code · Real order'
              : 'Commerce · Closed'}
        </span>
      </section>

      <section className="how-flow" aria-labelledby="flow-title">
        <header className="how-section-heading">
          <p className="how-kicker">The complete loop</p>
          <h2 id="flow-title">Five moves. One inspectable run.</h2>
          <p>
            Every stage leaves a contract, artifact, or decision that can be
            reviewed and replaced. That is what makes the pipeline useful
            beyond this storefront.
          </p>
        </header>

        <div className="intake-switch" aria-label="Supported signal inputs">
          <div>
            <span>Direct path</span>
            <strong>Owner-supplied trend</strong>
            <small>No discovery claim</small>
          </div>
          <span aria-hidden="true">or</span>
          <div>
            <span>Weekly path</span>
            <strong>30 authorized X posts</strong>
            <small>Recurring trend or no_trend</small>
          </div>
          <b aria-hidden="true">↓</b>
          <p>One normalized trend contract</p>
        </div>

        <ol className="signal-flow">
          {pipeline.map((stage, index) => (
            <li key={stage.verb}>
              <span className="flow-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <p>{stage.verb}</p>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </div>
              <strong>{stage.output}</strong>
            </li>
          ))}
        </ol>
      </section>

      <section className="how-roles" aria-labelledby="roles-title">
        <header className="how-section-heading inverse">
          <p className="how-kicker">Clear authority</p>
          <h2 id="roles-title">Taste is not permission.</h2>
          <p>
            The model can make subjective calls. It cannot invent provenance,
            waive a production check, publish a product, or create an order.
          </p>
        </header>
        <div className="role-grid">
          {roles.map((role) => (
            <section key={role.eyebrow}>
              <span>{role.eyebrow}</span>
              <h3>{role.title}</h3>
              <ul>
                {role.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </section>

      <section className="how-hackable" aria-labelledby="hackable-title">
        <header className="how-section-heading">
          <p className="how-kicker">Open by design</p>
          <h2 id="hackable-title">Fork the pipeline, not the promise.</h2>
          <p>
            The prompts, schemas, renderer, state machine, tests, and adapters
            live together in the repository. Each seam can evolve without
            turning the whole system into a black box.
          </p>
        </header>
        <div className="hack-grid">
          {hackPoints.map((point) => (
            <article key={point.label}>
              <span>{point.label}</span>
              <h3>{point.title}</h3>
              <p>{point.body}</p>
              <code>{point.path}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="market-thesis" aria-labelledby="market-title">
        <header>
          <p className="how-kicker">Commercial thesis</p>
          <h2 id="market-title">A small proof for a large fashion problem.</h2>
          <p>
            Fashion groups invest heavily in speed, signal quality, and
            personalization. This project makes that signal-to-product loop
            visible, modular, and testable at garment level.
          </p>
        </header>
        <div className="opportunity-grid">
          {opportunities.map((opportunity) => (
            <article key={opportunity.metric}>
              <span>{opportunity.metric}</span>
              <h3>{opportunity.title}</h3>
              <p>{opportunity.body}</p>
            </article>
          ))}
        </div>
        <p className="market-note">
          Named companies are market examples only. No affiliation, endorsement,
          customer relationship, or use of their proprietary data is claimed.
        </p>
      </section>

      <section className="release-boundary" aria-labelledby="release-title">
        <header className="how-section-heading">
          <p className="how-kicker">Honest boundary</p>
          <h2 id="release-title">The proof is live. Commerce is gated.</h2>
          <p>
            The same creative pipeline can end at a safe concept Preview or
            continue through provider and storefront adapters. Those are
            intentionally different permissions.
          </p>
        </header>
        <div className="release-lanes">
          <section>
            <span>Now / Visible</span>
            <h3>Build Week Preview</h3>
            <p>
              Generated garments, catalog data, public rights notes, and the
              system story are available to inspect. No account or API key is
              required, and checkout is disabled on both client and server.
            </p>
            <Link to="/">Browse the proof garments</Link>
          </section>
          <section>
            <span>
              {jurySales.enabled
                ? 'Now / Jury-only pilot'
                : 'Later / Explicit authority'}
            </span>
            <h3>Production release</h3>
            <p>
              {jurySales.enabled
                ? 'Optional real purchases are reserved for OpenAI Build Week judges behind a private access code. This is fan-made, unofficial merchandise; browsing and evaluation never require payment.'
                : 'A live run adds immutable deployment checks, provider assets, idempotent Printful sync, publication, Stripe, Neon, and Inngest. Every external mutation remains fail-closed by default.'}
            </p>
            <a
              href="https://github.com/self-tech-labs/codex-merch"
              rel="noreferrer"
              target="_blank"
            >
              Inspect the source repository
            </a>
          </section>
        </div>
      </section>
    </article>
  );
}
