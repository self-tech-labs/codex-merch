import {Link, useLoaderData, useSearchParams} from 'react-router';
import type {Route} from './+types/_index';
import {money} from '~/lib/cart';
import {
  getApprovedProduct,
  merchantCatalog,
  merchantDisplayAmounts,
} from '~/lib/merchant-catalog';
import {
  assetUrl,
  formatPrice,
  getMerchCategories,
  getMerchProducts,
  getPrimaryCustomerMockup,
  isPurchasableProduct,
} from '~/lib/merch';
import {
  useCheckoutAvailability,
  useStorefrontMode,
} from '~/lib/storefront-mode';

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
    products: products.map((product) => ({
      approvedForSale: Boolean(getApprovedProduct(product.slug)),
      category: product.category,
      formattedPrice: formatPrice(product),
      handle: product.commerce.handle,
      id: product.id,
      imageUrl: assetUrl(getPrimaryCustomerMockup(product)),
      purchasable: isPurchasableProduct(product),
      title: product.title,
    })),
    categories: getMerchCategories(products),
  };
}

type PublicProduct = Awaited<ReturnType<typeof loader>>['products'][number];

export default function Homepage() {
  const {products, categories} = useLoaderData<typeof loader>();
  const storefrontMode = useStorefrontMode();
  const [searchParams] = useSearchParams();
  const selectedCategory = searchParams.get('category');
  const storefrontProducts =
    storefrontMode === 'preview'
      ? products
      : products.filter(
          (product) => product.purchasable && product.approvedForSale,
        );
  const storefrontCategories =
    storefrontMode === 'preview'
      ? categories
      : Array.from(
          new Set(storefrontProducts.map((product) => product.category)),
        );
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
  const checkout = useCheckoutAvailability();
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
        <span>{preview ? 'Prototype preview' : 'Production storefront'}</span>
        <span>
          {preview
            ? 'Checkout disabled'
            : checkout.enabled
              ? 'Live checkout'
              : 'Checkout closed'}
        </span>
      </div>
      <p className="rail-note">
        {preview
          ? 'Open signal-to-product proof. Browse real garment outputs; payment and production orders are disabled.'
          : checkout.enabled
            ? 'Fan-made, unofficial merchandise with secure payment through Stripe.'
            : 'Product and checkout eligibility are verified individually by server-side commerce gates.'}
      </p>
    </aside>
  );
}

function ProductTile({product}: {product: PublicProduct}) {
  const shipping = merchantDisplayAmounts(0).shipping;
  const shippingDisclosure = product.approvedForSale
    ? ` + ${money(shipping, merchantCatalog.currency)} shipping`
    : '';

  return (
    <article className="product-tile">
      <Link
        aria-label={`${product.title}, ${product.formattedPrice}${shippingDisclosure}`}
        prefetch="intent"
        to={`/products/${product.handle}`}
      >
        <img src={product.imageUrl} alt="" loading="lazy" />
        {!product.purchasable ? (
          <span className="preview-badge">Preview</span>
        ) : null}
        <span className="tile-meta">
          <span>{product.title}</span>
          <span>{product.formattedPrice}</span>
          {product.approvedForSale ? (
            <span>
              + {money(shipping, merchantCatalog.currency)} shipping
            </span>
          ) : null}
        </span>
      </Link>
    </article>
  );
}
