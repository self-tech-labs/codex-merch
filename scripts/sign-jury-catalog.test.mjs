import assert from 'node:assert/strict';
import test from 'node:test';
import {signedJuryProduct} from './sign-jury-catalog.mjs';

test('merchant signing binds published CHF products, variants, and asset bytes', async () => {
  const product = {
    slug: 'release-product',
    title: 'Release Product',
    workflow: {status: 'published'},
    approval: {approvedAt: '2026-07-21T00:00:00Z', approvedBy: 'owner'},
    commerce: {
      currency: 'CHF',
      unitAmount: 8800,
      variants: [
        {
          id: 'release-product:1',
          size: 'M',
          availableForSale: true,
        },
      ],
    },
    production: {
      placements: [{file: 'assets/print/front.png'}],
    },
    providerRefs: {
      printful: {
        productId: 123,
        variants: [
          {
            variantId: 'release-product:1',
            catalogVariantId: 1,
            syncVariantId: 2,
            available: true,
          },
        ],
      },
    },
    assets: {
      artwork: 'assets/artwork/concept.png',
      printFiles: [{path: 'assets/print/front.png'}],
      mockups: [
        'assets/mockups/catalog.png',
        'assets/mockups/release-product-printful-1.jpg',
      ],
      customerPhotos: ['assets/mockups/photoshoot.png'],
    },
  };
  const signed = await signedJuryProduct(product, {
    read: async (asset) => Buffer.from(String(asset)),
  });
  assert.equal(signed.productSlug, product.slug);
  assert.equal(signed.printfulProductId, 123);
  assert.equal(signed.printfulVariants[0].syncVariantId, 2);
  assert.equal(Object.keys(signed.approvedAssetSha256).length, 5);
  assert.match(signed.approvedProductRevision, /^[a-f0-9]{64}$/);
});

test('merchant signing rejects incomplete or unsafe catalog products', async () => {
  await assert.rejects(
    () =>
      signedJuryProduct({
        slug: 'draft',
        workflow: {status: 'generated'},
      }),
    /not published/,
  );
});
