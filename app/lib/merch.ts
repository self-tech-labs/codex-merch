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
  url?: string;
  width?: number;
  height?: number;
  position?: Record<string, number>;
}

export interface MerchProduct {
  id: string;
  slug: string;
  title: string;
  status: MerchStatus;
  workflow?: {
    status: MerchStatus;
    updatedAt?: string;
    lastError?: string | null;
  };
  category: string;
  description: string;
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
    price: string;
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
      productId: number | string | null;
      mockupTaskKey?: string | null;
      variantIds: number[];
      syncVariantIds?: number[];
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
    mockups: string[];
  };
  approval?: {
    approvedAt: string | null;
    approvedBy: string | null;
    notes: string;
  };
  prompts: string[];
}

type BaseProductVariant = {
  color: string;
  size: string;
  providerVariantId: number;
};

type BaseProductPlacement = {
  area: string;
  providerPlacementType?: string;
  mockupPlacement?: string;
  techniques?: string[];
};

type BaseProduct = {
  alias: string;
  provider?: ProductionProvider;
  variants?: BaseProductVariant[];
  placements?: Array<BaseProductPlacement | string>;
};

export const merchProducts = products as unknown as MerchProduct[];
const baseProductCatalog = baseProducts as {products: BaseProduct[]};
const providerMockupPattern = /(?:^|-)printful-\d+\.(?:jpe?g|png|webp)$/i;

export function isCustomerVisibleProduct(product: MerchProduct) {
  const status = merchWorkflowStatus(product);
  return status !== 'draft' && status !== 'archived';
}

export function getMerchProducts(options: {includeInternal?: boolean} = {}) {
  if (options.includeInternal) return merchProducts;
  return merchProducts.filter(isCustomerVisibleProduct);
}

export function getMerchProduct(
  handle: string,
  options: {includeInternal?: boolean} = {},
) {
  return getMerchProducts(options).find(
    (product) => product.slug === handle || product.commerce.handle === handle,
  );
}

export function getMerchCategories(items: MerchProduct[] = getMerchProducts()) {
  return Array.from(new Set(items.map((product) => product.category)));
}

export function formatPrice(product: MerchProduct) {
  const amount = Number(product.commerce.price);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.commerce.currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function merchWorkflowStatus(product: MerchProduct) {
  return product.workflow?.status || product.status;
}

export function assetUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

export function getCustomerMockups(product: MerchProduct) {
  const mockups = product.assets.mockups || [];
  const providerMockups = mockups.filter((mockup) => providerMockupPattern.test(mockup));
  const providerMockupSet = new Set(providerMockups);
  const ordered = providerMockups.length
    ? [...providerMockups, ...mockups.filter((mockup) => !providerMockupSet.has(mockup))]
    : mockups;

  return ordered.length ? ordered : [product.assets.artwork].filter(Boolean);
}

export function getPrimaryCustomerMockup(product: MerchProduct) {
  return getCustomerMockups(product)[0] || product.assets.artwork;
}

export function absoluteAssetUrl(path: string, siteUrl: string) {
  if (/^https?:\/\//.test(path)) return path;
  return new URL(assetUrl(path), siteUrl).toString();
}

export function getBaseProduct(product: MerchProduct) {
  const baseProduct = product.production.baseProduct;
  if (!baseProduct) return null;
  return (
    baseProductCatalog.products.find((item) => item.alias === baseProduct) ||
    null
  );
}

export function getProviderRef(product: MerchProduct, provider = product.production.provider) {
  return product.providerRefs[provider] || null;
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
    variants.find((variant) => variant.size === 'M') ||
    variants.find((variant) => variant.availableForSale) ||
    variants[0] ||
    null
  );
}

export function variantLabel(variant: CommerceVariant, duplicateSize = false) {
  if (variant.size && !duplicateSize) return variant.size;
  return [variant.color, variant.size].filter(Boolean).join(' / ') || 'OS';
}

export function getProductionPlacementFiles(product: MerchProduct, siteUrl: string) {
  const baseProduct = getBaseProduct(product);

  return product.production.placements.map((placement) => {
    const printFile = (product.assets.printFiles || []).find(
      (file) => file.placement === placement.area || file.path === placement.file,
    );
    const source = printFile?.url || placement.url || printFile?.path || placement.file;
    const resolved = resolveBasePlacement(
      baseProduct,
      placement.area,
      product.production.technique,
    );

    return {
      type:
        resolved?.providerPlacementType ||
        (placement.area === 'front' ? 'default' : placement.area),
      url: absoluteAssetUrl(source, siteUrl),
    };
  });
}

export function getPrintfulPlacementFiles(product: MerchProduct, siteUrl: string) {
  return getProductionPlacementFiles(product, siteUrl);
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

function resolveBasePlacement(
  baseProduct: BaseProduct | null,
  area: string,
  technique: ProductionTechnique,
) {
  for (const placement of baseProduct?.placements || []) {
    if (typeof placement === 'string') {
      if (placement === area) return {area, providerPlacementType: area};
      continue;
    }

    if (
      placement.area === area &&
      (!placement.techniques || placement.techniques.includes(technique))
    ) {
      return placement;
    }
  }

  return null;
}
