import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useRouteError,
  useRouteLoaderData,
} from 'react-router';
import type {Route} from './+types/root';
import favicon from '~/assets/favicon.svg';
import resetStyles from '~/styles/reset.css?url';
import appStyles from '~/styles/app.css?url';
import {PageLayout} from './components/PageLayout';
import {getEnv} from '~/lib/env.server';
import {resolveStorefrontMode} from '~/lib/storefront-mode';
import {assertCheckoutConfiguration} from '~/lib/stripe.server';
import type {CartCatalogProduct} from '~/lib/cart';
import {
  isApprovedProductPurchasable,
  isApprovedVariantPurchasable,
} from '~/lib/storefront-sale';
import {
  assetUrl,
  getMerchProducts,
  getPrimaryCustomerMockup,
  getProductVariants,
} from '~/lib/merch';

export const meta: Route.MetaFunction = () => [
  {title: 'Codex Merch'},
  {
    name: 'description',
    content:
      'An open-source, hackable pipeline from trend signal to production-ready merch.',
  },
];

export function loader({context, request}: Route.LoaderArgs) {
  const env = getEnv(context);
  const storefrontMode = resolveStorefrontMode(env.STOREFRONT_MODE);
  let checkoutEnabled = false;
  if (storefrontMode === 'production') {
    try {
      assertCheckoutConfiguration(env);
      checkoutEnabled = true;
    } catch {
      checkoutEnabled = false;
    }
  }
  const cartCatalog: CartCatalogProduct[] = getMerchProducts().map((product) => {
    return {
      slug: product.slug,
      title: product.title,
      currency: product.commerce.currency,
      imageUrl: assetUrl(getPrimaryCustomerMockup(product)),
      provider: product.production.provider,
      purchasable: isApprovedProductPurchasable(product),
      unitAmount: product.commerce.unitAmount,
      variants: getProductVariants(product).map((variant) => ({
        id: variant.id,
        size: variant.size,
        purchasable: isApprovedVariantPurchasable(product, variant),
      })),
    };
  });
  return {
    cartCatalog,
    requestId: request.headers.get('x-request-id'),
    storefrontMode,
    checkoutEnabled,
  };
}

export function links() {
  return [{rel: 'icon', type: 'image/svg+xml', href: favicon}];
}

export function Layout({children}: {children?: React.ReactNode}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={resetStyles}></link>
        <link rel="stylesheet" href={appStyles}></link>
        <Meta />
        <Links nonce="" />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const {cartCatalog, checkoutEnabled, storefrontMode} =
    useLoaderData<typeof loader>();

  return (
    <PageLayout
      checkoutEnabled={checkoutEnabled}
      cartCatalog={cartCatalog}
      storefrontMode={storefrontMode}
    >
      <Outlet />
    </PageLayout>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const rootData = useRouteLoaderData<typeof loader>('root');
  let errorMessage = 'Something went wrong. Please try again.';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
    if (error.status >= 500) errorMessage = 'Something went wrong. Please try again.';
  } else if (import.meta.env.DEV && error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="route-error">
      <h1>Oops</h1>
      <h2>{errorStatus}</h2>
      <p>{errorMessage}</p>
      {rootData?.requestId ? <p>Reference: {rootData.requestId}</p> : null}
    </div>
  );
}
