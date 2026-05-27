import {Link, useLoaderData, useSearchParams} from 'react-router';
import type {Route} from './+types/_index';
import {useAside} from '~/components/Aside';
import {
  assetUrl,
  formatPrice,
  getMerchCategories,
  isLiveShopifyConfigured,
  isShopifyProductReady,
  merchWorkflowStatus,
  merchProducts,
  type MerchProduct,
} from '~/lib/merch';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Meme Merch'},
    {
      name: 'description',
      content:
        'A Codex-first meme merch storefront prototype backed by repo manifests.',
    },
  ];
};

export async function loader({context}: Route.LoaderArgs) {
  const liveShopifyConfigured = isLiveShopifyConfigured(context.env);
  const products = liveShopifyConfigured
    ? await import('~/lib/shopify-catalog.server')
        .then(({loadShopifyMerchCatalog}) =>
          loadShopifyMerchCatalog(context.storefront),
        )
        .catch(() => merchProducts)
    : merchProducts;

  return {
    products,
    categories: getMerchCategories(products),
    liveShopifyConfigured,
  };
}

export default function Homepage() {
  const {products, categories, liveShopifyConfigured} =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const filteredProducts = selectedCategory
    ? products.filter((product) => product.category === selectedCategory)
    : products;

  return (
    <div className="supply-page">
      <StoreRail
        categories={categories}
        liveShopifyConfigured={liveShopifyConfigured}
        selectedCategory={selectedCategory}
      />
      <section className="product-grid" aria-label="Codex meme merch products">
        {filteredProducts.map((product) => (
          <ProductTile key={product.id} product={product} />
        ))}
      </section>
    </div>
  );
}

function StoreRail({
  categories,
  liveShopifyConfigured,
  selectedCategory,
}: {
  categories: string[];
  liveShopifyConfigured: boolean;
  selectedCategory: string | null;
}) {
  const {open} = useAside();

  return (
    <aside className="store-rail" aria-label="Filters">
      <Link className="store-mark" to="/" aria-label="Codex Meme Merch home">
        <span>Codex</span>
        <span>Meme Merch</span>
      </Link>
      <button className="rail-action" type="button" onClick={() => open('cart')}>
        Cart
      </button>
      <nav className="rail-nav" aria-label="Product categories">
        <Link className={!selectedCategory ? 'active' : ''} to="/">
          All
        </Link>
        {categories.map((category) => (
          <Link
            className={selectedCategory === category ? 'active' : ''}
            key={category}
            to={`/?category=${encodeURIComponent(category)}`}
          >
            {category}
          </Link>
        ))}
      </nav>
      <div className="rail-status">
        <span>{liveShopifyConfigured ? 'Shopify live' : 'Manifest mode'}</span>
        <span>Printful dry-run</span>
      </div>
      <p className="rail-note">
        Drops are created from Codex conversations, reviewed for rights, then
        synced to Printful and Shopify.
      </p>
    </aside>
  );
}

function ProductTile({product}: {product: MerchProduct}) {
  const ready = isShopifyProductReady(product);
  const primaryMockup = assetUrl(product.assets.mockups[0]);
  const status = merchWorkflowStatus(product);

  return (
    <article className="product-tile">
      <Link
        aria-label={`${product.title}, ${formatPrice(product)}`}
        prefetch="intent"
        to={`/products/${product.shopify.handle}`}
      >
        <img src={primaryMockup} alt="" loading="lazy" />
        <span className="tile-meta">
          <span>{product.title}</span>
          <span>{formatPrice(product)}</span>
        </span>
        <span className={ready ? 'tile-state synced' : 'tile-state'}>
          {ready ? 'Synced' : status.replaceAll('_', ' ')}
        </span>
      </Link>
    </article>
  );
}
