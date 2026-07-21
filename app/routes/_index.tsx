import {Link, useLoaderData, useSearchParams} from 'react-router';
import type {Route} from './+types/_index';
import {
  assetUrl,
  formatPrice,
  getMerchCategories,
  getMerchProducts,
  getPrimaryCustomerMockup,
  isPurchasableProduct,
  type MerchProduct,
} from '~/lib/merch';
import {useStorefrontMode} from '~/lib/storefront-mode';

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

export async function loader() {
  const products = getMerchProducts();

  return {
    products,
    categories: getMerchCategories(products),
  };
}

export default function Homepage() {
  const {products, categories} = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const filteredProducts = selectedCategory
    ? products.filter((product) => product.category === selectedCategory)
    : products;

  return (
    <div className="supply-page">
      <StoreRail
        categories={categories}
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
  selectedCategory,
}: {
  categories: string[];
  selectedCategory: string | null;
}) {
  const storefrontMode = useStorefrontMode();
  const preview = storefrontMode === 'preview';

  return (
    <aside className="store-rail" aria-label="Filters">
      <Link className="store-mark" to="/" aria-label="Codex Meme Merch home">
        <span>Codex</span>
        <span>Meme Merch</span>
      </Link>
      <Link className="rail-action" to="/how-it-works">
        How it works
      </Link>
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
        <span>{preview ? 'Prototype preview' : 'Production storefront'}</span>
        <span>{preview ? 'Checkout disabled' : 'Commerce server-gated'}</span>
      </div>
      <p className="rail-note">
        {preview
          ? 'Browse production-intent mockups. This build cannot create a payment or production order.'
          : 'Product and checkout eligibility are verified individually by server-side commerce gates.'}
      </p>
    </aside>
  );
}

function ProductTile({product}: {product: MerchProduct}) {
  const primaryMockup = assetUrl(getPrimaryCustomerMockup(product));

  return (
    <article className="product-tile">
      <Link
        aria-label={`${product.title}, ${formatPrice(product)}`}
        prefetch="intent"
        to={`/products/${product.commerce.handle}`}
      >
        <img src={primaryMockup} alt="" loading="lazy" />
        {!isPurchasableProduct(product) ? (
          <span className="preview-badge">Preview</span>
        ) : null}
        <span className="tile-meta">
          <span>{product.title}</span>
          <span>{formatPrice(product)}</span>
        </span>
      </Link>
    </article>
  );
}
