import {useState} from 'react';
import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {AddToCartButton} from '~/components/AddToCartButton';
import {useAside} from '~/components/Aside';
import {
  assetUrl,
  formatPrice,
  getMerchProduct,
  isLiveShopifyConfigured,
  isShopifyProductReady,
  merchWorkflowStatus,
  type MerchProduct,
} from '~/lib/merch';

export const meta: Route.MetaFunction = ({data}) => {
  return [
    {title: `Codex Meme Merch | ${data?.product.title ?? 'Product'}`},
    {
      name: 'description',
      content: data?.product.description ?? 'Codex meme merch product.',
    },
  ];
};

export async function loader({params, context}: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response('Missing product handle', {status: 400});

  let product = getMerchProduct(handle);
  if (isLiveShopifyConfigured(context.env)) {
    const liveProduct = await import('~/lib/shopify-catalog.server')
      .then(({loadShopifyMerchProduct}) =>
        loadShopifyMerchProduct(context.storefront, handle),
      )
      .catch(() => null);

    if (liveProduct) {
      product = product ? mergeLiveProduct(product, liveProduct) : liveProduct;
    }
  }

  if (!product) throw new Response('Product not found', {status: 404});

  return {product};
}

export default function Product() {
  const {product} = useLoaderData<typeof loader>();
  const [activeMockup, setActiveMockup] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const mockups = product.assets.mockups;
  const currentMockup = mockups[activeMockup] || mockups[0];
  const ready = isShopifyProductReady(product);
  const status = merchWorkflowStatus(product);
  const {open} = useAside();

  return (
    <div className="product-page">
      <div className="product-backdrop" />
      <section className="product-window" aria-labelledby="product-title">
        <header className="window-titlebar">
          <h1 id="product-title">{product.title}</h1>
          <Link className="window-close" to="/" aria-label="Close product">
            x
          </Link>
        </header>
        <div className="window-body">
          <div className="media-stage">
            <button
              className="media-arrow prev"
              type="button"
              aria-label="Previous mockup"
              onClick={() =>
                setActiveMockup((index) =>
                  index === 0 ? mockups.length - 1 : index - 1,
                )
              }
            >
              ←
            </button>
            <button
              className={zoomed ? 'mockup-frame zoomed' : 'mockup-frame'}
              type="button"
              aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
              onClick={() => setZoomed((value) => !value)}
            >
              <img
                src={assetUrl(currentMockup)}
                alt={`${product.title} mockup`}
              />
            </button>
            <button
              className="media-arrow next"
              type="button"
              aria-label="Next mockup"
              onClick={() =>
                setActiveMockup((index) =>
                  index === mockups.length - 1 ? 0 : index + 1,
                )
              }
            >
              →
            </button>
          </div>

          <MockupStrip
            activeMockup={activeMockup}
            mockups={mockups}
            product={product}
            setActiveMockup={setActiveMockup}
          />

          <div className="product-copy">
            <p>{product.description}</p>
            <dl>
              <div>
                <dt>Technique</dt>
                <dd>{product.printful.technique}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{ready ? status.replaceAll('_', ' ') : 'Manifest draft'}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{formatPrice(product)}</dd>
              </div>
            </dl>
          </div>

          <SizeRow product={product} />

          <div className="product-actions">
            {ready && product.shopify.variantId ? (
              <AddToCartButton
                lines={[
                  {
                    merchandiseId: product.shopify.variantId,
                    quantity: 1,
                  },
                ]}
                onClick={() => open('cart')}
              >
                Add to cart
              </AddToCartButton>
            ) : (
              <button className="sync-disabled" type="button" disabled>
                Sync to Shopify first
              </button>
            )}
          </div>

          <details className="rights-panel">
            <summary>Rights note</summary>
            <p>{product.meme.rightsNote}</p>
          </details>
        </div>
      </section>
    </div>
  );
}

function MockupStrip({
  activeMockup,
  mockups,
  product,
  setActiveMockup,
}: {
  activeMockup: number;
  mockups: string[];
  product: MerchProduct;
  setActiveMockup: (index: number) => void;
}) {
  return (
    <div className="mockup-strip" aria-label="Product views">
      {mockups.map((mockup, index) => (
        <button
          className={activeMockup === index ? 'active' : ''}
          key={mockup}
          type="button"
          onClick={() => setActiveMockup(index)}
        >
          <img
            src={assetUrl(mockup)}
            alt={`${product.title} view ${index + 1}`}
          />
        </button>
      ))}
    </div>
  );
}

function mergeLiveProduct(manifest: MerchProduct, live: MerchProduct) {
  return {
    ...manifest,
    status: live.status,
    shopify: {
      ...manifest.shopify,
      ...live.shopify,
    },
    assets: {
      ...manifest.assets,
      mockups: live.assets.mockups.length
        ? live.assets.mockups
        : manifest.assets.mockups,
    },
  } satisfies MerchProduct;
}

function SizeRow({product}: {product: MerchProduct}) {
  const isAccessory =
    product.slug.includes('tote') ||
    product.slug.includes('cap') ||
    product.slug.includes('sticker');
  const options = isAccessory ? ['OS'] : ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

  return (
    <div className="size-row" aria-label="Product options">
      {options.map((option) => (
        <button key={option} type="button" disabled>
          {option}
        </button>
      ))}
    </div>
  );
}
