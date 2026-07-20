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
  return (
    <aside className="store-rail" aria-label="Filters">
      <Link className="store-mark" to="/" aria-label="Codex Meme Merch home">
        <span>Codex</span>
        <span>Meme Merch</span>
      </Link>
      <Link className="rail-action" to="/cart">
        Cart
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
        <span>Manifest catalog</span>
        <span>Stripe checkout</span>
      </div>
      <p className="rail-note">
        Drops are created from Codex conversations, reviewed for rights, then
        routed to the configured production provider after checkout.
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
