import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/policies.$page';
import {getEnv} from '~/lib/env.server';
import {
  isMerchantPolicyPageId,
  merchantIdentity,
  merchantPolicyPages,
  MERCHANT_POLICY_PAGE_IDS,
  MERCHANT_POLICY_VERSION,
} from '~/lib/merchant-policy';

export async function loader({context, params}: Route.LoaderArgs) {
  if (!isMerchantPolicyPageId(params.page)) {
    throw new Response('Policy page not found', {status: 404});
  }
  const env = getEnv(context);
  return {
    page: params.page,
    policy: merchantPolicyPages[params.page],
    reviewed: env.STOREFRONT_LEGAL_APPROVED === 'true',
  };
}

export const meta: Route.MetaFunction = ({data}) => [
  {title: `Codex Meme Merch | ${data?.policy.title || 'Policy'}`},
  ...(!data?.reviewed ? [{name: 'robots', content: 'noindex,nofollow'}] : []),
];

export default function PolicyPage() {
  const {page, policy} = useLoaderData<typeof loader>();
  return (
    <article className="policy-page">
      <header className="policy-header">
        <p className="policy-kicker">Merchant policy</p>
        <h1>{policy.title}</h1>
        <p className="policy-summary">{policy.summary}</p>
        <p className="policy-version">
          Effective <time dateTime={MERCHANT_POLICY_VERSION}>21 July 2026</time>
          {' · '}Version {MERCHANT_POLICY_VERSION}
        </p>
      </header>

      <nav className="policy-nav" aria-label="Merchant policies">
        {MERCHANT_POLICY_PAGE_IDS.map((policyPage) => (
          <Link
            key={policyPage}
            to={`/policies/${policyPage}`}
            aria-current={policyPage === page ? 'page' : undefined}
          >
            {merchantPolicyPages[policyPage].title}
          </Link>
        ))}
      </nav>

      <div className="policy-sections">
        {policy.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>

      <section className="merchant-card" aria-labelledby="merchant-details">
        <h2 id="merchant-details">Registered merchant</h2>
        <address>
          <strong>{merchantIdentity.legalName}</strong>
          <span>{merchantIdentity.legalForm}</span>
          <span>Proprietor: {merchantIdentity.proprietor}</span>
          <span>{merchantIdentity.address.street}</span>
          <span>
            {merchantIdentity.address.postalCode} {merchantIdentity.address.city}
          </span>
          <span>{merchantIdentity.address.country}</span>
          <span>UID: {merchantIdentity.uid}</span>
          <span>
            Commercial register: {merchantIdentity.commercialRegisterNumber}
          </span>
          <a href={`mailto:${merchantIdentity.email}`}>{merchantIdentity.email}</a>
        </address>
      </section>

      <Link className="policy-back" to="/">Back to the shop</Link>
    </article>
  );
}
