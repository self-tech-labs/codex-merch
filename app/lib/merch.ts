import products from '../../merch/products.json';
import baseProducts from '../../merch/base-products.json';

export type MerchStatus =
  | 'draft'
  | 'generated'
  | 'mockups_ready'
  | 'approved'
  | 'published'
  | 'archived';

export type ProductionTechnique =
  | 'DTG'
  | 'DTFlex'
  | 'Embroidery'
  | 'Sublimation'
  | 'All-Over Cotton'
  | 'All-Over Synthetic'
  | 'Knitting';

export type ProductionProvider = 'printful';

export interface CommerceVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  providerVariantId: number;
  availableForSale: boolean;
  selectedOptions: Array<{name: string; value: string}>;
}

export interface SignalQuery {
  provider: string;
  query: string;
  maxResults?: number;
}

export interface SignalSource {
  provider: string;
  id?: string;
  url?: string;
  authorUsername?: string;
  authorVerified?: boolean;
  createdAt?: string | null;
  lang?: string | null;
  matchedQuery?: string;
  metrics?: {
    replies: number;
    reposts: number;
    likes: number;
    quotes: number;
  };
}

export interface ProductionPlacement {
  area: string;
  file: string;
  text?: string;
  url?: string;
  width?: number;
  height?: number;
  position?: Record<string, number>;
}

export interface MerchProduct {
  id: string;
  slug: string;
  aliases?: string[];
  title: string;
  workflow: {
    status: MerchStatus;
    updatedAt?: string;
    lastError?: string | null;
  };
  category: string;
  description: string;
  productDetails?: {
    materials: string[];
    fabricWeight?: string;
    fit?: string;
    construction?: string[];
    care: string[];
    origin: string;
    productionTime: string;
    mockupNotice: string;
    sizeGuide?: {
      unit: string;
      tolerance: string;
      rows: Array<{
        size: string;
        length: string;
        width: string;
        sleeve: string;
      }>;
    };
  };
  meme: {
    source: string;
    brief: string;
    rightsNote: string;
  };
  signals: {
    profile: string;
    queries: SignalQuery[];
    sources: SignalSource[];
  };
  commerce: {
    handle: string;
    unitAmount: number;
    currency: string;
    tags: string[];
    variants?: CommerceVariant[];
  };
  production: {
    provider: ProductionProvider;
    baseProduct: string | null;
    technique: ProductionTechnique;
    textLayer?: string;
    placements: ProductionPlacement[];
  };
  providerRefs: {
    printful?: {
      productId: number | null;
      mockupTaskKey?: string | null;
      mockupTaskFailures?: number;
      lastFailedMockupTaskKey?: string | null;
      variants: Array<{
        variantId: string;
        catalogVariantId: number;
        syncVariantId: number;
        available: boolean;
      }>;
    };
    [provider: string]: unknown;
  };
  assets: {
    artwork: string;
    printFiles?: Array<{
      placement: string;
      path: string;
      url?: string;
    }>;
    customerPhotos?: string[];
    mockups: string[];
  };
  approval?: {
    approvedAt: string | null;
    approvedBy: string | null;
    notes: string;
  };
  automation?: {
    runId?: string;
    runKey?: string;
    [key: string]: unknown;
  };
  prompts: string[];
}

type BaseProductVariant = {
  color: string;
  size: string;
  providerVariantId: number;
};

type BaseProduct = {
  alias: string;
  provider?: ProductionProvider;
  variants?: BaseProductVariant[];
};

export const merchProducts = products as unknown as MerchProduct[];
const baseProductCatalog = baseProducts as {products: BaseProduct[]};
const providerMockupPattern = /(?:^|-)printful-\d+\.(?:jpe?g|png|webp)$/i;

export function isPubliclyVisibleProduct(product: MerchProduct) {
  const status = merchWorkflowStatus(product);
  if (product.automation?.runKey) return status === 'published';
  return status !== 'draft' && status !== 'archived';
}

export function isPurchasableProduct(product: MerchProduct) {
  if (merchWorkflowStatus(product) !== 'published') return false;
  const printful = product.providerRefs.printful;
  if (!printful?.productId) return false;

  const mappings = new Map(
    printful.variants.map((variant) => [variant.variantId, variant]),
  );
  return getProductVariants(product).some((variant) => {
    const mapping = mappings.get(variant.id);
    return Boolean(
      variant.availableForSale &&
        mapping?.available &&
        Number.isInteger(mapping.syncVariantId) &&
        mapping.syncVariantId > 0,
    );
  });
}

export function isPurchasableVariant(
  product: MerchProduct,
  variant: CommerceVariant,
) {
  if (!isPurchasableProduct(product) || !variant.availableForSale) return false;
  return Boolean(getPrintfulVariantMapping(product, variant.id)?.available);
}

export function getMerchProducts(options: {includeInternal?: boolean} = {}) {
  if (options.includeInternal) return merchProducts;
  return merchProducts.filter(isPubliclyVisibleProduct);
}

export function getMerchProduct(
  handle: string,
  options: {includeInternal?: boolean} = {},
) {
  return getMerchProducts(options).find(
    (product) =>
      product.slug === handle ||
      product.commerce.handle === handle ||
      product.aliases?.includes(handle),
  );
}

export function getMerchCategories(items: MerchProduct[] = getMerchProducts()) {
  return Array.from(new Set(items.map((product) => product.category)));
}

export function formatPrice(product: MerchProduct) {
  const amount = product.commerce.unitAmount / 100;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.commerce.currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function merchWorkflowStatus(product: MerchProduct) {
  return product.workflow.status;
}

export function assetUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

export function getCustomerMockups(product: MerchProduct) {
  const customerPhotos = product.assets.customerPhotos || [];
  const mockups = product.assets.mockups || [];
  const providerMockups = mockups.filter((mockup) =>
    providerMockupPattern.test(mockup),
  );
  const preferredMockupSet = new Set([...customerPhotos, ...providerMockups]);
  const ordered = providerMockups.length
    ? [
        ...customerPhotos,
        ...providerMockups,
        ...mockups.filter((mockup) => !preferredMockupSet.has(mockup)),
      ]
    : [
        ...customerPhotos,
        ...mockups.filter((mockup) => !preferredMockupSet.has(mockup)),
      ];

  return ordered.length ? ordered : [product.assets.artwork].filter(Boolean);
}

export function getPrimaryCustomerMockup(product: MerchProduct) {
  return getCustomerMockups(product)[0] || product.assets.artwork;
}

export function getBaseProduct(product: MerchProduct) {
  const baseProduct = product.production.baseProduct;
  if (!baseProduct) return null;
  return (
    baseProductCatalog.products.find((item) => item.alias === baseProduct) ||
    null
  );
}

export function getPrintfulVariantMapping(
  product: MerchProduct,
  variantId: string,
) {
  return product.providerRefs.printful?.variants.find(
    (variant) => variant.variantId === variantId,
  );
}

export function getProductVariants(product: MerchProduct): CommerceVariant[] {
  if (product.commerce.variants?.length) return product.commerce.variants;

  const baseProduct = getBaseProduct(product);
  return (baseProduct?.variants || []).map((variant) =>
    commerceVariantForBaseVariant(product, variant),
  );
}

export function getProductVariant(product: MerchProduct, variantId: string) {
  return getProductVariants(product).find((variant) => variant.id === variantId);
}

export function defaultProductVariant(product: MerchProduct) {
  const variants = getProductVariants(product);
  return (
    variants.find(
      (variant) => variant.size === 'M' && isPurchasableVariant(product, variant),
    ) ||
    variants.find((variant) => isPurchasableVariant(product, variant)) ||
    variants.find((variant) => variant.size === 'M') ||
    variants[0] ||
    null
  );
}

export function variantLabel(variant: CommerceVariant, duplicateSize = false) {
  if (variant.size && !duplicateSize) return variant.size;
  return [variant.color, variant.size].filter(Boolean).join(' / ') || 'OS';
}

function commerceVariantForBaseVariant(
  product: MerchProduct,
  variant: BaseProductVariant,
): CommerceVariant {
  const sku = `${product.slug}-${variant.color}-${variant.size}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    id: `${product.slug}:${variant.providerVariantId}`,
    sku,
    color: variant.color,
    size: variant.size,
    providerVariantId: variant.providerVariantId,
    availableForSale: true,
    selectedOptions: [
      {name: 'Color', value: variant.color},
      {name: 'Size', value: variant.size},
    ],
  };
}
