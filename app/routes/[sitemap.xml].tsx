import type {Route} from './+types/[sitemap.xml]';
import {getMerchProducts, isPurchasableProduct} from '~/lib/merch';

export function loader({request}: Route.LoaderArgs) {
  const origin = new URL(request.url).origin;
  const urls = [
    '/',
    '/how-it-works',
    ...getMerchProducts()
      .filter(isPurchasableProduct)
      .map((product) => `/products/${product.commerce.handle}`),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (path) => `  <url>
    <loc>${origin}${path}</loc>
  </url>`,
  )
  .join('\n')}
</urlset>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': `max-age=${60 * 60 * 24}`,
    },
  });
}
