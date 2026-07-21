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

export const meta: Route.MetaFunction = () => [
  {title: 'Codex Meme Merch'},
  {
    name: 'description',
    content: 'Codex-native merch drops fulfilled through production providers.',
  },
];

export function loader({context, request}: Route.LoaderArgs) {
  return {
    requestId: request.headers.get('x-request-id'),
    storefrontMode: resolveStorefrontMode(getEnv(context).STOREFRONT_MODE),
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
  const {storefrontMode} = useLoaderData<typeof loader>();

  return (
    <PageLayout storefrontMode={storefrontMode}>
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
