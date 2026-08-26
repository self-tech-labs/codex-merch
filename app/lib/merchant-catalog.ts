import signedProducts from '../../merch/merchant-jury-catalog.json';

// The signed source also preserves historical expansion products. Live checkout
// authority is intentionally limited to this exact product until a reviewed
// catalog revision changes this source contract.
const APPROVED_PRODUCT_SLUG = 'codex-rate-reset-long-sleeve';
const approvedProduct = signedProducts.find(
  (product) => product.productSlug === APPROVED_PRODUCT_SLUG,
);
if (!approvedProduct) {
  throw new Error(`Signed merchant product is missing: ${APPROVED_PRODUCT_SLUG}`);
}

/**
 * Exact merchant-approved catalog contract. Every product added here must pin
 * its local manifest revision, public assets, Printful product, and Printful
 * variants before production checkout can accept it.
 */
export const merchantCatalog = {
  currency: 'CHF',
  shippingAmount: 910,
  shippingCountries: ['CH', 'US'],
  deliveryEstimateBusinessDays: {minimum: 7, maximum: 15},
  maximumItemsPerOrder: 10,
  stripeTaxBehavior: 'inclusive',
  stripeProductTaxCode: 'txcd_99999999',
  stripeShippingTaxCode: 'txcd_92010001',
  products: [approvedProduct],
} as const;

export type MerchantCatalogProduct = (typeof merchantCatalog.products)[number];

export function getApprovedProduct(productSlug: string) {
  return merchantCatalog.products.find(
    (product) => product.productSlug === productSlug,
  );
}

export function merchantDisplayAmounts(subtotal: number) {
  const shipping = merchantCatalog.shippingAmount / 100;
  return {shipping, total: subtotal + shipping};
}
