import {useState} from 'react';
import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/products.$handle';
import {money, useCart} from '~/lib/cart';
import {
  getApprovedJuryProduct,
  merchantJuryCatalog,
  merchantJuryDisplayAmounts,
} from '~/lib/merchant-policy';
import {
  canInitiateStorefrontCheckout,
  useJurySales,
  useStorefrontMode,
} from '~/lib/storefront-mode';
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
    {title: `Codex Merch | ${data?.product.title ?? 'Product'}`},
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
  const storefrontMode = useStorefrontMode();
  const jurySales = useJurySales();
  const purchasable = canInitiateStorefrontCheckout(
    storefrontMode,
    isPurchasableProduct(product),
    jurySales.enabled,
  );
  const approvedForJury = Boolean(getApprovedJuryProduct(product.slug));
  const pilotAmounts = merchantJuryDisplayAmounts(
    product.commerce.unitAmount / 100,
  );

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
            {purchasable ? (
              <p className="preview-badge">OpenAI Build Week jury-only sale</p>
            ) : (
              <p className="preview-badge">
                {storefrontMode === 'preview'
                  ? 'Prototype preview — checkout disabled'
                  : 'Jury checkout closed'}
              </p>
            )}
            <p>{product.description}</p>
            <p className="fan-merch-disclaimer">
              Fan-made content. This is not official OpenAI merchandise and is
              not affiliated with, sponsored by, or endorsed by OpenAI.
            </p>
            <dl>
              <div>
                <dt>Technique</dt>
                <dd>{product.production.technique}</dd>
              </div>
              <div>
                <dt>Price</dt>
                <dd>{formatPrice(product)}</dd>
              </div>
              {approvedForJury ? (
                <>
                  <div>
                    <dt>Shipping</dt>
                    <dd>
                      {money(
                        pilotAmounts.shipping,
                        merchantJuryCatalog.currency,
                      )}{' '}
                      per order
                    </dd>
                  </div>
                  <div>
                    <dt>One-item total</dt>
                    <dd>
                      {money(
                        pilotAmounts.total,
                        merchantJuryCatalog.currency,
                      )}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {approvedForJury ? (
              <p>
                Switzerland and United States delivery only. RITSL bears normal
                import, customs, and carrier-clearance charges for the approved
                routes. Review the final CHF total before paying.
              </p>
            ) : null}
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
              {purchasable
                ? 'Add to jury cart'
                : storefrontMode === 'preview'
                  ? 'Checkout disabled'
                  : 'Jury checkout closed'}
            </button>
            <Link className="buy-link" to="/cart">
              View cart
            </Link>
          </div>

          {product.productDetails ? (
            <section className="product-information" aria-labelledby="product-information-title">
              <h2 id="product-information-title">Product information</h2>
              <dl>
                <div>
                  <dt>Material</dt>
                  <dd>{product.productDetails.materials.join('; ')}</dd>
                </div>
                {product.productDetails.fabricWeight ? (
                  <div>
                    <dt>Fabric weight</dt>
                    <dd>{product.productDetails.fabricWeight}</dd>
                  </div>
                ) : null}
                {product.productDetails.fit ? (
                  <div>
                    <dt>Fit</dt>
                    <dd>{product.productDetails.fit}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Made to order</dt>
                  <dd>
                    {approvedForJury
                      ? 'Production usually takes 2–5 business days. Delivery to Switzerland or the United States is estimated at 7–15 business days in total and is not guaranteed.'
                      : product.productDetails.productionTime}
                  </dd>
                </div>
                <div>
                  <dt>Origin and fulfillment</dt>
                  <dd>{product.productDetails.origin}</dd>
                </div>
              </dl>

              {product.productDetails.sizeGuide ? (
                <div className="size-guide">
                  <h3>Size guide ({product.productDetails.sizeGuide.unit})</h3>
                  <div className="size-guide-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Size</th>
                          <th scope="col">Length</th>
                          <th scope="col">Width</th>
                          <th scope="col">Sleeve</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.productDetails.sizeGuide.rows.map((row) => (
                          <tr key={row.size}>
                            <th scope="row">{row.size}</th>
                            <td>{row.length}</td>
                            <td>{row.width}</td>
                            <td>{row.sleeve}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p>{product.productDetails.sizeGuide.tolerance}</p>
                </div>
              ) : null}

              <details>
                <summary>Care and construction</summary>
                {product.productDetails.construction?.length ? (
                  <ul>
                    {product.productDetails.construction.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                <ul>
                  {product.productDetails.care.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </details>
              <p className="mockup-notice">{product.productDetails.mockupNotice}</p>
            </section>
          ) : null}

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
