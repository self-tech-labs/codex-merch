#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertReleaseAuthority} from './merch.mjs';
import {atomicWriteJson} from './services/weekly-run-store.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(rootDir, 'merch/products.json');
const signedCatalogPath = path.join(rootDir, 'merch/merchant-jury-catalog.json');

export const juryProductSlugs = [
  'codex-rate-reset-long-sleeve',
  'research-deployment-co-sweatshirt',
  'terminal-ritual-sweatshirt',
  'queue-weather-cotton-sweatshirt',
  'solward-index-cotton-sweatshirt',
  'field-clearing-cotton-sweatshirt',
  'clean-slate-club-cotton-sweatshirt',
  'parallel-noise-poster-cotton-sweatshirt',
  'sun-break-victory-cotton-sweatshirt',
  'tastemaxxing-cutline-cotton-sweatshirt',
  'archive-monument-cotton-sweatshirt',
];

export async function signedJuryProduct(product, {read = readFile} = {}) {
  const printful = product?.providerRefs?.printful;
  const variants = product?.commerce?.variants || [];
  const mappings = printful?.variants || [];
  if (product?.workflow?.status !== 'published') {
    throw new Error(`${product?.slug || 'Unknown product'} is not published`);
  }
  if (product?.commerce?.currency !== 'CHF') {
    throw new Error(`${product.slug} must use CHF before merchant sign-off`);
  }
  if (!product?.approval?.approvedAt || !product?.approval?.approvedBy) {
    throw new Error(`${product.slug} is missing explicit release approval`);
  }
  if (!printful?.productId || mappings.length !== variants.length) {
    throw new Error(`${product.slug} has incomplete Printful mappings`);
  }

  const printfulVariants = variants.map((variant) => {
    const mapping = mappings.find((candidate) => candidate.variantId === variant.id);
    if (
      !variant.availableForSale ||
      !mapping?.available ||
      !Number.isInteger(mapping.catalogVariantId) ||
      !Number.isInteger(mapping.syncVariantId)
    ) {
      throw new Error(`${product.slug}: variant ${variant.id} is not release-ready`);
    }
    return {
      variantId: variant.id,
      size: variant.size,
      catalogVariantId: mapping.catalogVariantId,
      syncVariantId: mapping.syncVariantId,
    };
  });

  const signedAssets = [
    product.assets?.artwork,
    ...(product.assets?.printFiles || []).map((file) => file.path),
    ...(product.assets?.mockups || []),
    ...(product.assets?.customerPhotos || []),
  ].filter(Boolean);
  const approvedAssetSha256 = {};
  for (const asset of [...new Set(signedAssets)]) {
    const bytes = await read(path.join(rootDir, asset));
    approvedAssetSha256[asset] = createHash('sha256').update(bytes).digest('hex');
  }

  return {
    productSlug: product.slug,
    productTitle: product.title,
    unitAmount: product.commerce.unitAmount,
    printfulProductId: printful.productId,
    printfulVariants,
    approvedProductRevision: createHash('sha256')
      .update(JSON.stringify(product))
      .digest('hex'),
    approvedAssetSha256,
  };
}

async function main() {
  const args = process.argv.slice(2);
  assertReleaseAuthority(args);
  if (process.env.MERCH_EXPANSION_APPROVED !== 'true') {
    throw new Error('MERCH_EXPANSION_APPROVED=true is required to sign the wider jury catalog');
  }
  const products = JSON.parse(await readFile(productsPath, 'utf8'));
  const signed = [];
  for (const slug of juryProductSlugs) {
    const product = products.find((candidate) => candidate.slug === slug);
    if (!product) throw new Error(`Missing jury product: ${slug}`);
    signed.push(await signedJuryProduct(product));
  }
  await atomicWriteJson(signedCatalogPath, signed);
  process.stdout.write(
    `${JSON.stringify({signedProducts: signed.length, signedVariants: signed.reduce((total, product) => total + product.printfulVariants.length, 0)}, null, 2)}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
