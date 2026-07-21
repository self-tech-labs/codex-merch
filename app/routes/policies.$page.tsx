import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/policies.$page';
import {getEnv} from '~/lib/env.server';

const policyPages = {
  shipping: {
    title: 'Shipping',
    body: 'Available destinations, delivery estimates, and shipping charges are shown in Stripe Checkout before payment. Production begins only after payment and fulfillment review.',
  },
  returns: {
    title: 'Returns and issues',
    body: 'Each item is made to order. Contact us promptly about damaged, misprinted, or incorrect items and include your order reference and photos. Eligibility for replacement or refund is assessed before a return is requested.',
  },
  privacy: {
    title: 'Privacy',
    body: 'Payments and checkout details are handled by Stripe, and shipping details are sent to Printful for fulfillment. Codex Merch stores order status and product snapshots but does not retain shipping addresses in its own database.',
  },
  terms: {
    title: 'Terms',
    body: 'Products, prices, availability, shipping destinations, and delivery estimates may change before checkout. An order is accepted after successful payment validation. Consumer rights that cannot be excluded by applicable law remain unaffected.',
  },
  contact: {
    title: 'Contact',
    body: 'For order support, include the public order reference shown after checkout.',
  },
} as const;

export async function loader({context, params}: Route.LoaderArgs) {
  const page = params.page as keyof typeof policyPages;
  const policy = policyPages[page];
  if (!policy) throw new Response('Policy page not found', {status: 404});
  const env = getEnv(context);
  const configuredCopy: Record<keyof typeof policyPages, string | undefined> = {
    shipping: env.STOREFRONT_SHIPPING_POLICY,
    returns: env.STOREFRONT_RETURNS_POLICY,
    privacy: env.STOREFRONT_PRIVACY_POLICY,
    terms: env.STOREFRONT_TERMS_POLICY,
    contact: env.STOREFRONT_CONTACT_POLICY,
  };
  return {
    policy: {...policy, body: configuredCopy[page] || policy.body},
    contactEmail: env.STOREFRONT_CONTACT_EMAIL || null,
    reviewed: env.STOREFRONT_LEGAL_APPROVED === 'true',
  };
}

export const meta: Route.MetaFunction = ({data}) => [
  {title: `Codex Meme Merch | ${data?.policy.title || 'Policy'}`},
  ...(!data?.reviewed ? [{name: 'robots', content: 'noindex,nofollow'}] : []),
];

export default function PolicyPage() {
  const {contactEmail, policy} = useLoaderData<typeof loader>();
  return (
    <article className="policy-page">
      <h1>{policy.title}</h1>
      <p>{policy.body}</p>
      {contactEmail ? <p>Email: <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p> : null}
      <Link to="/">Back to the shop</Link>
    </article>
  );
}
