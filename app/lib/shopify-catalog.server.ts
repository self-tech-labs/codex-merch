import type {MerchProduct} from './merch';

type StorefrontClient = {
  query<T>(
    query: string,
    options?: {variables?: Record<string, unknown>},
  ): Promise<T>;
};

type ShopifyCatalogResult = {
  products: {
    nodes: ShopifyProductNode[];
  };
};

type ShopifyProductResult = {
  product: ShopifyProductNode | null;
};

type ShopifyProductNode = {
  id: string;
  handle: string;
  title: string;
  description: string;
  tags: string[];
  featuredImage: {
    url: string;
    altText: string | null;
  } | null;
  variants: {
    nodes: Array<{
      id: string;
      price: {
        amount: string;
        currencyCode: string;
      };
    }>;
  };
};

const SHOPIFY_PRODUCT_FIELDS = `#graphql
  fragment CodexMerchProductFields on Product {
    id
    handle
    title
    description
    tags
    featuredImage {
      url
      altText
    }
    variants(first: 1) {
      nodes {
        id
        price {
          amount
          currencyCode
        }
      }
    }
  }
`;

const SHOPIFY_MERCH_CATALOG_QUERY = `#graphql
  ${SHOPIFY_PRODUCT_FIELDS}
  query CodexMerchCatalog($query: String!, $first: Int!) {
    products(first: $first, query: $query) {
      nodes {
        ...CodexMerchProductFields
      }
    }
  }
`;

const SHOPIFY_MERCH_PRODUCT_QUERY = `#graphql
  ${SHOPIFY_PRODUCT_FIELDS}
  query CodexMerchProduct($handle: String!) {
    product(handle: $handle) {
      ...CodexMerchProductFields
    }
  }
`;

export async function loadShopifyMerchCatalog(storefront: StorefrontClient) {
  const result = await storefront.query<ShopifyCatalogResult>(
    SHOPIFY_MERCH_CATALOG_QUERY,
    {
      variables: {
        query: 'tag:codex',
        first: 48,
      },
    },
  );

  return result.products.nodes.map(mapShopifyProduct);
}

export async function loadShopifyMerchProduct(
  storefront: StorefrontClient,
  handle: string,
) {
  const result = await storefront.query<ShopifyProductResult>(
    SHOPIFY_MERCH_PRODUCT_QUERY,
    {
      variables: {handle},
    },
  );

  return result.product ? mapShopifyProduct(result.product) : null;
}

function mapShopifyProduct(product: ShopifyProductNode): MerchProduct {
  const firstVariant = product.variants.nodes[0];
  const firstImage = product.featuredImage?.url;

  return {
    id: product.id,
    slug: product.handle,
    title: product.title,
    status: firstVariant ? 'published' : 'draft',
    workflow: {
      status: firstVariant ? 'published' : 'draft',
    },
    category: categoryFromTags(product.tags),
    description: product.description,
    meme: {
      source: 'Shopify Storefront API',
      brief: product.description || 'Imported Shopify merch product.',
      rightsNote:
        'Imported from Shopify. Keep repo manifest rights notes canonical before publication.',
    },
    shopify: {
      handle: product.handle,
      price: firstVariant?.price.amount || '0.00',
      currency: firstVariant?.price.currencyCode || 'USD',
      tags: product.tags,
      variantId: firstVariant?.id || null,
      productId: product.id,
      variants: firstVariant
        ? [
            {
              id: firstVariant.id,
              externalId: firstVariant.id.split('/').pop() || firstVariant.id,
              sku: null,
              selectedOptions: [],
            },
          ]
        : [],
      fileUrls: {},
      mockupFileUrls: {},
    },
    printful: {
      productId: null,
      syncProductId: null,
      mockupTaskKey: null,
      variantIds: [],
      syncVariants: [],
      technique: 'DTG',
      placements: [],
    },
    assets: {
      artwork: firstImage || '',
      printFiles: [],
      mockups: firstImage ? [firstImage] : [],
    },
    approval: {
      approvedAt: null,
      approvedBy: null,
      notes: '',
    },
    prompts: ['Imported Shopify product. Add prompt history in merch manifest.'],
  };
}

function categoryFromTags(tags: string[]) {
  const normalized = tags.map((tag) => tag.toLowerCase());
  if (normalized.includes('gpt-55')) return 'GPT-5.5';
  if (normalized.includes('runtime') || normalized.includes('latency')) {
    return 'Runtime';
  }
  if (normalized.includes('tote') || normalized.includes('cap')) {
    return 'Utility';
  }
  if (normalized.includes('stickers') || normalized.includes('accessory')) {
    return 'Stickers';
  }
  return 'Codex';
}
