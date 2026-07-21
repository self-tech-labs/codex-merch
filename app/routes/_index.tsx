import {Link, useLoaderData, useSearchParams} from 'react-router';
import type {Route} from './+types/_index';
import {money} from '~/lib/cart';
import {
  getApprovedJuryProduct,
  merchantJuryCatalog,
  merchantJuryDisplayAmounts,
} from '~/lib/merchant-policy';
import {
  assetUrl,
  formatPrice,
  getMerchCategories,
  getMerchProducts,
  getPrimaryCustomerMockup,
  isPurchasableProduct,
  type MerchProduct,
} from '~/lib/merch';
import {useJurySales, useStorefrontMode} from '~/lib/storefront-mode';

export const meta: Route.MetaFunction = () => {
  return [
    {title: 'Codex Merch | Signal to product'},
    {
      name: 'description',
      content:
        'An open-source, hackable pipeline that turns trend signals into production-ready garments.',
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
  const storefrontMode = useStorefrontMode();
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const storefrontProducts =
    storefrontMode === 'preview'
      ? products
      : products.filter(
          (product) =>
            isPurchasableProduct(product) &&
            Boolean(getApprovedJuryProduct(product.slug)),
        );
  const storefrontCategories =
    storefrontMode === 'preview'
      ? categories
      : getMerchCategories(storefrontProducts);
  const filteredProducts = selectedCategory
    ? storefrontProducts.filter(
        (product) => product.category === selectedCategory,
      )
    : storefrontProducts;

  return (
    <div className="supply-page">
      <StoreRail
        categories={storefrontCategories}
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
  const jurySales = useJurySales();
  const preview = storefrontMode === 'preview';

  return (
    <aside className="store-rail" aria-label="Filters">
      <Link className="store-mark" to="/" aria-label="Codex Merch home">
        <span>Codex</span>
        <span>Signal → Merch</span>
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
        <span>
          {preview
            ? 'Prototype preview'
            : jurySales.enabled
              ? 'OpenAI jury pilot'
              : 'Production storefront'}
        </span>
        <span>
          {preview
            ? 'Checkout disabled'
            : jurySales.enabled
              ? 'Jury code required'
              : 'Checkout closed'}
        </span>
      </div>
      <p className="rail-note">
        {preview
          ? 'Open signal-to-product proof. Browse real garment outputs; payment and production orders are disabled.'
          : jurySales.enabled
            ? 'Fan-made, unofficial merch. Real purchases are temporarily reserved for OpenAI Build Week judges.'
            : 'Product and checkout eligibility are verified individually by server-side commerce gates.'}
      </p>
    </aside>
  );
}

function ProductTile({product}: {product: MerchProduct}) {
  const primaryMockup = assetUrl(getPrimaryCustomerMockup(product));
  const approvedForJury = Boolean(getApprovedJuryProduct(product.slug));
  const pilotShipping = merchantJuryDisplayAmounts(0).shipping;
  const shippingDisclosure = approvedForJury
    ? ` + ${money(pilotShipping, merchantJuryCatalog.currency)} shipping`
    : '';

  return (
    <article className="product-tile">
      <Link
        aria-label={`${product.title}, ${formatPrice(product)}${shippingDisclosure}`}
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
          {approvedForJury ? (
            <span>
              + {money(pilotShipping, merchantJuryCatalog.currency)} shipping
            </span>
          ) : null}
        </span>
      </Link>
    </article>
  );
}
