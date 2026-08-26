import {getApprovedProduct} from '~/lib/merchant-catalog';
import {
  isPurchasableProduct,
  isPurchasableVariant,
  type CommerceVariant,
  type MerchProduct,
} from '~/lib/merch';

export function isApprovedProductPurchasable(product: MerchProduct) {
  return Boolean(getApprovedProduct(product.slug)) && isPurchasableProduct(product);
}

export function isApprovedVariantPurchasable(
  product: MerchProduct,
  variant: CommerceVariant,
) {
  return (
    Boolean(getApprovedProduct(product.slug)) &&
    isPurchasableVariant(product, variant)
  );
}
