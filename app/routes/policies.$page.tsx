import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/policies.$page';
import {getEnv} from '~/lib/env.server';
import {
  isMerchantPolicyPageId,
  merchantContactEmail,
  merchantIdentity,
  merchantPolicyPages,
} from '~/lib/merchant-policy.server';
import {
  MERCHANT_POLICY_EFFECTIVE_LABEL,
  MERCHANT_POLICY_PAGE_IDS,
  MERCHANT_POLICY_VERSION,
} from '~/lib/merchant-policy.shared';

export async function loader({context, params}: Route.LoaderArgs) {
  if (!isMerchantPolicyPageId(params.page)) {
    throw new Response('Policy page not found', {status: 404});
  }
  const env = getEnv(context);
  const showMerchantIdentity = ['privacy', 'terms'].includes(params.page);
  const contactEmail = merchantContactEmail(env);
  return {
    page: params.page,
    policy: merchantPolicyPages[params.page],
    policyNavigation: MERCHANT_POLICY_PAGE_IDS.map((id) => ({
      id,
      title: merchantPolicyPages[id].title,
    })),
    merchant: showMerchantIdentity
      ? {...merchantIdentity, contactEmail}
      : null,
    reviewed:
      env.STOREFRONT_LEGAL_APPROVED === 'true' && Boolean(contactEmail),
  };
}

export const meta: Route.MetaFunction = ({data}) => [
  {title: `Codex Merch | ${data?.policy.title || 'Policy'}`},
  ...(!data?.reviewed ? [{name: 'robots', content: 'noindex,nofollow'}] : []),
];

export default function PolicyPage() {
  const {merchant, page, policy, policyNavigation} =
    useLoaderData<typeof loader>();
  return (
    <article className="policy-page">
      <header className="policy-header">
        <p className="policy-kicker">Merchant policy</p>
        <h1>{policy.title}</h1>
        <p className="policy-summary">{policy.summary}</p>
        <p className="policy-version">
          Effective{' '}
          <time dateTime={MERCHANT_POLICY_VERSION}>
            {MERCHANT_POLICY_EFFECTIVE_LABEL}
          </time>
          {' · '}Version {MERCHANT_POLICY_VERSION}
        </p>
      </header>

      <nav className="policy-nav" aria-label="Merchant policies">
        {policyNavigation.map((policyPage) => (
          <Link
            key={policyPage.id}
            to={`/policies/${policyPage.id}`}
            aria-current={policyPage.id === page ? 'page' : undefined}
          >
            {policyPage.title}
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

      {merchant ? (
        <section className="merchant-card" aria-labelledby="merchant-details">
          <h2 id="merchant-details">
            {page === 'privacy' ? 'Data controller' : 'Seller'}
          </h2>
          <address>
            <strong>{merchant.legalName}</strong>
            <span>{merchant.legalForm}</span>
            <span>{merchant.address.street}</span>
            <span>
              {merchant.address.postalCode} {merchant.address.city}
            </span>
            <span>{merchant.address.country}</span>
            {merchant.contactEmail ? (
              <a href={`mailto:${merchant.contactEmail}`}>
                {merchant.contactEmail}
              </a>
            ) : (
              <span>Contact email is not configured in this preview.</span>
            )}
          </address>
        </section>
      ) : null}

      <Link className="policy-back" to="/">Back to the shop</Link>
    </article>
  );
}
