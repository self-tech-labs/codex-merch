import {useState} from 'react';
import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {useCart} from '~/lib/cart';
import {
  assetUrl,
  defaultProductVariant,
  formatPrice,
  getCustomerMockups,
  getMerchProduct,
  getProductVariants,
  isPurchasableProduct,
  isPurchasableVariant,
  variantLabel,
  type CommerceVariant,
  type MerchProduct,
} from '~/lib/merch';

export const meta: Route.MetaFunction = ({data}) => {
  const metadata = [
    {title: `Codex Meme Merch | ${data?.product.title ?? 'Product'}`},
    {
      name: 'description',
      content: data?.product.description ?? 'Codex meme merch product.',
    },
  ];
  if (data?.product && !isPurchasableProduct(data.product)) {
    metadata.push({name: 'robots', content: 'noindex,nofollow'});
  }
  return metadata;
};

export async function loader({params}: Route.LoaderArgs) {
  const handle = params.handle;
  if (!handle) throw new Response('Missing product handle', {status: 400});

  const product = getMerchProduct(handle);
  if (!product) throw new Response('Product not found', {status: 404});

  return {product};
}

export default function Product() {
  const {product} = useLoaderData<typeof loader>();
  const [activeMockup, setActiveMockup] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const variants = getProductVariants(product);
  const defaultVariant = defaultProductVariant(product);
  const [selectedVariantId, setSelectedVariantId] = useState(
    defaultVariant?.id || '',
  );
  const selectedVariant =
    variants.find((variant) => variant.id === selectedVariantId) ||
    defaultVariant;
  const mockups = getCustomerMockups(product);
  const currentMockup = mockups[activeMockup] || mockups[0];
  const {addLine} = useCart();
  const purchasable = isPurchasableProduct(product);

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
              {'<'}
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
              {'>'}
            </button>
          </div>

          <MockupStrip
            activeMockup={activeMockup}
            mockups={mockups}
            product={product}
            setActiveMockup={setActiveMockup}
          />

          <div className="product-copy">
            {!purchasable ? <p className="preview-badge">Preview — not yet available</p> : null}
            <p>{product.description}</p>
            <dl>
              <div>
                <dt>Technique</dt>
                <dd>{product.production.technique}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{formatPrice(product)}</dd>
              </div>
            </dl>
          </div>

          <SizeRow
            disabled={!purchasable}
            onSelect={setSelectedVariantId}
            selectedVariantId={selectedVariant?.id || ''}
            variants={variants}
          />

          <div className="product-actions">
            <button
              className="add-to-cart-button"
              disabled={!selectedVariant || !purchasable || !isPurchasableVariant(product, selectedVariant)}
              type="button"
              onClick={() => {
                if (!selectedVariant) return;
                addLine({
                  productSlug: product.slug,
                  variantId: selectedVariant.id,
                  quantity: 1,
                });
              }}
            >
              {purchasable ? 'Add to cart' : 'Preview only'}
            </button>
            <Link className="buy-link" to="/cart">
              View cart
            </Link>
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

function SizeRow({
  disabled,
  onSelect,
  selectedVariantId,
  variants,
}: {
  disabled: boolean;
  onSelect: (variantId: string) => void;
  selectedVariantId: string;
  variants: CommerceVariant[];
}) {
  if (!variants.length) return null;

  const sizeCounts = variants.reduce<Record<string, number>>(
    (counts, variant) => {
      counts[variant.size] = (counts[variant.size] || 0) + 1;
      return counts;
    },
    {},
  );

  return (
    <div className="size-row" aria-label="Size options">
      {variants.map((variant) => {
        const label = variantLabel(variant, sizeCounts[variant.size] > 1);
        const isSelected = variant.id === selectedVariantId;

        return (
          <button
            aria-label={`Choose size ${label}`}
            aria-pressed={isSelected}
            className={isSelected ? 'selected' : ''}
            disabled={disabled || !variant.availableForSale}
            key={variant.id}
            onClick={() => onSelect(variant.id)}
            type="button"
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
