import products from '../../merch/products.json';

export type MerchStatus =
  | 'draft'
  | 'generated'
  | 'shopify_draft'
  | 'printful_imported'
  | 'printful_synced'
  | 'mockups_ready'
  | 'approved'
  | 'published'
  | 'archived';

export type PrintfulTechnique =
  | 'DTG'
  | 'DTFlex'
  | 'Embroidery'
  | 'Sublimation'
  | 'All-Over Cotton'
  | 'All-Over Synthetic'
  | 'Knitting';

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
  baseProduct?: string | null;
  category: string;
  description: string;
  meme: {
    source: string;
    brief: string;
    rightsNote: string;
    xQuery?: string;
    xSources?: Array<{
      id: string;
      url: string;
      authorUsername: string;
      authorVerified: boolean;
      createdAt: string | null;
      lang: string | null;
      matchedQuery: string;
      metrics: {
        replies: number;
        reposts: number;
        likes: number;
        quotes: number;
      };
    }>;
  };
  shopify: {
    handle: string;
    price: string;
    currency: string;
    tags: string[];
    variantId: string | null;
    productId: string | null;
    variants?: Array<{
      id: string;
      externalId: string;
      sku: string | null;
      selectedOptions: Array<{name: string; value: string}>;
    }>;
    fileUrls?: Record<string, string>;
    mockupFileUrls?: Record<string, string>;
  };
  printful: {
    productId: number | string | null;
    syncProductId?: number | string | null;
    mockupTaskKey?: string | null;
    variantIds: number[];
    syncVariants?: Array<unknown>;
    technique: PrintfulTechnique;
    textLayer?: string;
    placements: Array<{
      area: string;
      file: string;
      url?: string;
      width?: number;
      height?: number;
      position?: Record<string, number>;
    }>;
  };
  assets: {
    artwork: string;
    printFiles?: Array<{
      placement: string;
      path: string;
      url?: string;
      shopifyFileId?: string;
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

export const merchProducts = products as MerchProduct[];

export function getMerchProduct(handle: string) {
  return merchProducts.find(
    (product) => product.slug === handle || product.shopify.handle === handle,
  );
}

export function getMerchCategories(products: MerchProduct[] = merchProducts) {
  return Array.from(new Set(products.map((product) => product.category)));
}

export function formatPrice(product: MerchProduct) {
  const amount = Number(product.shopify.price);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: product.shopify.currency,
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isShopifyProductReady(product: MerchProduct) {
  return Boolean(product.shopify.variantId && product.shopify.productId);
}

export function merchWorkflowStatus(product: MerchProduct) {
  return product.workflow?.status || product.status;
}

export function assetUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `/${path.replace(/^\/+/, '')}`;
}

export function isLiveShopifyConfigured(env: {
  PUBLIC_STORE_DOMAIN?: string;
  PUBLIC_STOREFRONT_API_TOKEN?: string;
}) {
  return Boolean(env.PUBLIC_STORE_DOMAIN && env.PUBLIC_STOREFRONT_API_TOKEN);
}
