#!/usr/bin/env node
import {mkdir, readFile, rename, unlink, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {atomicWriteJson} from './services/weekly-run-store.mjs';
import {sanitizeXmlText} from './services/text-safety.mjs';
import {
  artDirectionPrompt as isolatedArtDirectionPrompt,
  artDirectorReview as isolatedArtDirectorReview,
} from './services/art-director.mjs';
import {
  productionProviders,
  providerForProduction,
} from './services/production-providers.mjs';
import {validateCatalog} from './validate-catalog.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(rootDir, 'merch/products.json');
const baseProductsPath = path.join(rootDir, 'merch/base-products.json');
const customizationTechniquesPath = path.join(
  rootDir,
  'merch/customization-techniques.json',
);
const artDirectionPath = path.join(rootDir, 'merch/art-direction.json');

export const AOP_COTTON_REQUIRED_PLACEMENTS = [
  'front',
  'back',
  'left_sleeve',
  'right_sleeve',
  'label_panel',
  'label_inside',
];

export const workflowStatuses = [
  'draft',
  'generated',
  'mockups_ready',
  'approved',
  'published',
  'archived',
];

export const pilotProductSlug = 'codex-rate-reset-long-sleeve';

export function printfulDryRunExternalId(slug) {
  return `CM-DRY-${String(slug).slice(0, 25)}`;
}

export function assertPilotPublicationAllowed(selected, env = process.env) {
  const blocked = selected.filter((product) => product.slug !== pilotProductSlug);
  if (blocked.length && env.MERCH_EXPANSION_APPROVED !== 'true') {
    throw new Error(
      `Publish ${pilotProductSlug}, complete the live pilot, and set MERCH_EXPANSION_APPROVED=true before publishing: ${blocked
        .map((product) => product.slug)
        .join(', ')}`,
    );
  }
}

export function assertProviderMutationAllowed(selected, action = 'provider mutation') {
  const blocked = selected.filter(
    (product) =>
      product.automation?.previewOnly === true ||
      product.automation?.releaseEligible === false,
  );
  if (blocked.length) {
    throw new Error(
      `${action} is disabled for preview-only products: ${blocked
        .map((product) => product.slug)
        .join(', ')}`,
    );
  }
}

export const allowedTechniques = new Set([
  'DTG',
  'DTFlex',
  'Embroidery',
  'Sublimation',
  'All-Over Cotton',
  'All-Over Synthetic',
  'Knitting',
]);

const providerMockupPattern = /(?:^|-)printful-\d+\.(?:jpe?g|png|webp)$/i;
const generatedCustomerPhotoPattern = /(?:^|-)photoshoot-[a-z0-9-]+\.(?:jpe?g|png|webp)$/i;

export async function readProducts() {
  return JSON.parse(await readFile(productsPath, 'utf8'));
}

export async function writeProducts(products) {
  await atomicWriteJson(productsPath, products);
}

export async function readBaseProducts() {
  return JSON.parse(await readFile(baseProductsPath, 'utf8'));
}

export async function readCustomizationTechniques() {
  return JSON.parse(await readFile(customizationTechniquesPath, 'utf8'));
}

export async function readArtDirection() {
  return JSON.parse(await readFile(artDirectionPath, 'utf8'));
}

export function workflowStatus(product) {
  return product?.workflow?.status || 'draft';
}

export function setWorkflowStatus(product, status) {
  if (!workflowStatuses.includes(status)) {
    throw new Error(`Unsupported workflow status: ${status}`);
  }

  const current = workflowStatus(product);
  if (current === status) return;
  const currentIndex = workflowStatuses.indexOf(current);
  const nextIndex = workflowStatuses.indexOf(status);
  if (nextIndex < currentIndex && status !== 'archived') {
    product.approval = {approvedAt: null, approvedBy: null, notes: 'Invalidated by upstream artifact change.'};
    const printful = product.providerRefs?.printful;
    if (printful) {
      printful.productId = null;
      printful.mockupTaskKey = null;
      printful.variants = [];
    }
    if (status === 'generated') {
      product.assets.customerPhotos = [];
    }
  }

  product.workflow = {
    ...(product.workflow || {}),
    status,
    updatedAt: new Date().toISOString(),
  };
}

export function advanceWorkflowStatus(product, status) {
  const currentIndex = workflowStatuses.indexOf(workflowStatus(product));
  const nextIndex = workflowStatuses.indexOf(status);
  if (nextIndex === -1) {
    throw new Error(`Unsupported workflow status: ${status}`);
  }

  if (currentIndex === -1 || nextIndex > currentIndex) {
    setWorkflowStatus(product, status);
  }
}

export function productProduction(product) {
  return product?.production || {};
}

export function productProviderRef(product, provider = productProduction(product).provider) {
  return product?.providerRefs?.[provider] || {};
}

export function productionTemplateSpec(product, baseProduct) {
  const production = productProduction(product);
  return {
    provider: production.provider,
    baseProduct: production.baseProduct,
    technique: production.technique,
    requiredPlacements:
      production.technique === 'All-Over Cotton'
        ? AOP_COTTON_REQUIRED_PLACEMENTS
        : [],
    placements: baseProduct?.placements || [],
    templateNotes: baseProduct?.templateNotes || [],
    templates: baseProduct?.templates || {},
    dimensions: baseProduct?.printfile || null,
    kind: baseProduct?.kind || null,
  };
}

export function validateProducts(products) {
  const errors = [];
  const seenSlugs = new Set();

  if (!Array.isArray(products)) {
    return ['Manifest root must be an array.'];
  }

  products.forEach((product, index) => {
    const label = product?.slug || `item ${index}`;
    const required = [
      'id',
      'slug',
      'title',
      'workflow',
      'meme',
      'commerce',
      'production',
      'providerRefs',
      'signals',
      'assets',
      'prompts',
    ];

    for (const key of required) {
      if (!product?.[key]) errors.push(`${label}: missing ${key}`);
    }

    if (seenSlugs.has(product?.slug)) errors.push(`${label}: duplicate slug`);
    seenSlugs.add(product?.slug);

    const status = workflowStatus(product);
    if (!workflowStatuses.includes(status)) {
      errors.push(`${label}: unsupported workflow status`);
    }

    if (!product?.meme?.rightsNote || product.meme.rightsNote.length < 20) {
      errors.push(`${label}: rights note is required and must be specific`);
    }

    if (product?.printful) {
      errors.push(`${label}: legacy printful field must be migrated to production/providerRefs`);
    }

    if (Object.hasOwn(product || {}, 'baseProduct')) {
      errors.push(`${label}: legacy baseProduct field must be moved to production.baseProduct`);
    }

    if (product?.meme?.xQuery || product?.meme?.xSources) {
      errors.push(`${label}: legacy X signal fields must be moved to signals`);
    }

    const production = productProduction(product);

    if (!production.provider) {
      errors.push(`${label}: production provider is required`);
    } else if (!productionProviders[production.provider]) {
      errors.push(`${label}: unsupported production provider ${production.provider}`);
    }

    if (!allowedTechniques.has(production.technique)) {
      errors.push(`${label}: unsupported production technique`);
    }

    if (!production.placements?.length) {
      errors.push(`${label}: at least one production placement is required`);
    }

    if (production.technique === 'All-Over Cotton') {
      const placementAreas = new Set(
        (production.placements || []).map((placement) => placement.area),
      );
      for (const requiredPlacement of AOP_COTTON_REQUIRED_PLACEMENTS) {
        if (!placementAreas.has(requiredPlacement)) {
          errors.push(`${label}: missing AOP placement ${requiredPlacement}`);
        }
      }
    }

    if (
      ['generated', 'mockups_ready', 'approved', 'published'].includes(
        status,
      )
    ) {
      for (const placement of production.placements || []) {
        if (!existsSync(path.join(rootDir, placement.file))) {
          errors.push(`${label}: missing print file ${placement.file}`);
        }
      }
    }

    if (!product?.assets?.mockups?.length) {
      errors.push(`${label}: at least one mockup image is required`);
    }

    for (const customerPhoto of product?.assets?.customerPhotos || []) {
      if (!isSupportedImagePath(customerPhoto)) {
        errors.push(`${label}: unsupported customer photo type ${customerPhoto}`);
      } else if (!isRemoteUrl(customerPhoto) && !existsSync(path.join(rootDir, customerPhoto))) {
        errors.push(`${label}: missing customer photo ${customerPhoto}`);
      }
    }

    if (
      production.technique === 'All-Over Cotton' &&
      ['generated', 'mockups_ready', 'approved', 'published'].includes(status)
    ) {
      const primaryMockup = product?.assets?.mockups?.[0];
      if (!primaryMockup?.endsWith('-catalog.png')) {
        errors.push(`${label}: primary mockup must be assets/mockups/<slug>-catalog.png`);
      } else if (!isRemoteUrl(primaryMockup) && !existsSync(path.join(rootDir, primaryMockup))) {
        errors.push(`${label}: missing primary catalog mockup ${primaryMockup}`);
      }
    }

    if (!Array.isArray(product?.prompts) || product.prompts.length === 0) {
      errors.push(`${label}: at least one image prompt is required`);
    }

    if (!product?.commerce?.handle) {
      errors.push(`${label}: commerce handle is required`);
    }

    if (
      !Number.isInteger(product?.commerce?.unitAmount) ||
      product.commerce.unitAmount <= 0 ||
      !product?.commerce?.currency
    ) {
      errors.push(`${label}: commerce price and currency are required`);
    }
  });

  return errors;
}

export function printfulPayload(product, baseProduct = null, options = {}) {
  return buildPrintfulSyncProductPayload(product, baseProduct, options);
}

export function buildPrintfulSyncProductPayload(
  product,
  baseProduct = null,
  {allowLocal = false, siteUrl = process.env.PUBLIC_SITE_URL} = {},
) {
  const production = productProduction(product);
  const variantOptions = baseProduct?.techniqueOptions?.[production.technique] || [];
  const files = printfulOrderFiles(product, {allowLocal, baseProduct, siteUrl});
  const thumbnail = product.assets?.mockups?.[0] || product.assets?.artwork;
  const thumbnailUrl =
    (siteUrl ? publicAssetUrl(thumbnail, siteUrl) : null) ||
    (allowLocal ? thumbnail : null);

  if (!thumbnailUrl) {
    throw new Error(`${product.slug}: missing public thumbnail URL for Printful product`);
  }

  return {
    sync_product: {
      name: product.title,
      external_id: product.slug,
      thumbnail: thumbnailUrl,
    },
    sync_variants: printfulProductVariants(product, baseProduct).map((variant) => ({
      external_id: variant.id || `${product.slug}:${variant.providerVariantId}`,
      sku:
        variant.sku ||
        `${product.slug}-${variant.providerVariantId}`
          .toUpperCase()
          .replace(/[^A-Z0-9]+/g, '_')
          .replace(/^_+|_+$/g, ''),
      variant_id: variant.providerVariantId,
      retail_price: moneyFromMinorUnits(product.commerce.unitAmount),
      files,
      options: variantOptions,
    })),
  };
}

export function printfulMockupTaskPayload(product, baseProduct, options = {}) {
  return buildPrintfulMockupTaskPayload(product, baseProduct, options);
}

export function buildPrintfulMockupTaskPayload(product, baseProduct, options = {}) {
  return {
    variant_ids: baseProduct.variants.map((variant) => variant.providerVariantId),
    format: 'jpg',
    width: 1600,
    files: printfulPlacementFiles(product, {...options, baseProduct}).map((file) => ({
      placement: file.mockupPlacement,
      image_url: file.url,
      position: file.position || file.mockupPosition || baseProduct.defaultPosition,
    })),
  };
}

export function generationPreflight(product, baseProduct, techniqueCatalog) {
  const errors = [];
  const warnings = [];
  const production = productProduction(product);
  const technique = production.technique;
  const techniqueRule = techniqueCatalog?.techniques?.[technique];

  if (!baseProduct) {
    errors.push(`${product.slug}: base product is required before generation`);
  }

  if (!techniqueRule) {
    errors.push(`${product.slug}: missing production technique rule for ${technique}`);
  }

  if (baseProduct && !baseProduct.techniques?.includes(technique)) {
    errors.push(
      `${product.slug}: ${baseProduct.alias} does not support ${technique}`,
    );
  }

  if (baseProduct && !baseProduct.catalogProductId) {
    errors.push(`${product.slug}: base product is missing a Printful catalog product ID`);
  }

  if (baseProduct && !baseProduct.variants?.every((variant) => variant.providerVariantId)) {
    errors.push(`${product.slug}: every base variant needs a provider variant ID`);
  }

  if (technique === 'All-Over Cotton') {
    const configuredAreas = new Set(
      (production.placements || []).map((placement) => placement.area),
    );
    for (const area of AOP_COTTON_REQUIRED_PLACEMENTS) {
      if (!configuredAreas.has(area)) {
        errors.push(`${product.slug}: All-Over Cotton requires ${area} placement`);
      }
    }
    if (baseProduct?.kind !== 'all-over-cotton-sweatshirt') {
      errors.push(
        `${product.slug}: All-Over Cotton MVP is restricted to the Printful all-over cotton sweatshirt base`,
      );
    }
  }

  for (const placement of production.placements || []) {
    const resolved = resolveBasePlacement(baseProduct, placement.area, technique);
    if (!resolved) {
      errors.push(
        `${product.slug}: ${technique} on ${baseProduct?.alias || 'unknown base'} does not support placement ${placement.area}`,
      );
    }
  }

  const promptText = product.prompts?.join(' ') || '';
  if (/mockup|ecommerce photo|product photo/i.test(promptText)) {
    warnings.push(
      `${product.slug}: prompt mentions mockups/photos; generation will force standalone print artwork`,
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    technique,
    baseProduct: baseProduct?.alias || null,
    promptConstraints: techniqueRule?.promptRules || [],
    supportedPlacements: (production.placements || []).map((placement) =>
      resolveBasePlacement(baseProduct, placement.area, technique),
    ),
  };
}

export function printfulTechniquePrompt(product, baseProduct, techniqueCatalog) {
  return productionTechniquePrompt(product, baseProduct, techniqueCatalog);
}

export function productionTechniquePrompt(product, baseProduct, techniqueCatalog) {
  const preflight = generationPreflight(product, baseProduct, techniqueCatalog);
  if (!preflight.ok) {
    throw new Error(preflight.errors.join('\n'));
  }

  const placementText = preflight.supportedPlacements
    .filter(Boolean)
    .map((placement) => `${placement.area} -> provider file type ${placement.providerPlacementType}`)
    .join('; ');

  return [
    `Production provider: ${productProduction(product).provider}.`,
    `Production technique: ${productProduction(product).technique}.`,
    `Selected shippable base: ${baseProduct.title} (${baseProduct.alias}), catalog product ${baseProduct.catalogProductId}.`,
    `Allowed placements for this design: ${placementText}.`,
    baseProduct.templateNotes?.length
      ? `Printful template notes: ${baseProduct.templateNotes.join(' ')}`
      : '',
    ...preflight.promptConstraints,
  ]
    .filter(Boolean)
    .join(' ');
}

export function artDirectionPrompt(artDirection) {
  return isolatedArtDirectionPrompt(artDirection);
}

export function generationDirectionPrompt(product, baseProduct, techniqueCatalog, artDirection) {
  return [
    productionTechniquePrompt(product, baseProduct, techniqueCatalog),
    artDirectionPrompt(artDirection),
  ]
    .filter(Boolean)
    .join(' ');
}

export function artDirectorReview(product, baseProduct, artDirection) {
  return isolatedArtDirectorReview(
    product,
    productionTemplateSpec(product, baseProduct),
    artDirection,
  );
}

function aopCottonSupervisorPrompt(product, baseProduct, techniqueCatalog, artDirection) {
  const spec = product.artDirector?.aopSpec || {};
  const production = productProduction(product);
  const palette = spec.palette || {};
  return [
    'You are a senior apparel art director creating one original all-over cotton sweatshirt concept.',
    'Create a flat product concept board that shows the full garment idea: front body, back body, both sleeves, collar/cuff attitude, and label treatment.',
    generationDirectionPrompt(product, baseProduct, techniqueCatalog, artDirection),
    `Garment design brief: ${product.meme.brief}`,
    `Local deterministic type plan: front="${spec.front?.primaryText || production.textLayer || product.title}", back="${spec.back?.statement || ''}", sleeves="${spec.sleeves?.motif || ''}".`,
    `Palette: fabric ${palette.fabric || 'muted cotton'}, ink ${palette.ink || 'dark ink'}, accent ${palette.accent || 'single accent'}.`,
    'Aesthetic: restrained Supply Co-adjacent research-lab/skater merchandise, premium negative space, no copied layout.',
    'Do not make a dense poster, sticker sheet, ecommerce stock photo, official logo, real brand parody, or screenshot.',
    'Keep text minimal and treat exact readable text as local production composition.',
  ].join(' ');
}

export function composePrintFilePlan(product) {
  const production = productProduction(product);
  return {
    slug: product.slug,
    provider: production.provider,
    technique: production.technique,
    deterministicTextLayer: true,
    artwork: product.assets.artwork,
    placements: production.placements,
    artDirectorMode:
      production.technique === 'All-Over Cotton'
        ? 'supervised-aop-cotton-garment-system'
        : 'standard-placement-artwork',
    outputChecks: [
      'transparent PNG output',
      'text rendered by local composition rather than image model',
      'placement dimensions verified against selected Printful variant template',
      production.technique === 'All-Over Cotton'
        ? 'all required cut-and-sew panel files generated without Printful guide layers'
        : null,
    ].filter(Boolean),
  };
}

function printfulPlacementFiles(
  product,
  {allowLocal = false, baseProduct = null, siteUrl = process.env.PUBLIC_SITE_URL} = {},
) {
  const production = productProduction(product);
  return (production.placements || []).map((placement) => {
    const printFile = (product.assets.printFiles || []).find(
      (file) => file.placement === placement.area || file.path === placement.file,
    );
    const localFile = printFile?.path || placement.file;
    const url =
      printFile?.url ||
      placement.url ||
      (siteUrl ? publicAssetUrl(localFile, siteUrl) : null) ||
      (allowLocal ? localFile : null);
    if (!url) {
      throw new Error(`${product.slug}: missing uploaded URL for ${placement.area}`);
    }

    const basePlacement = resolveBasePlacement(
      baseProduct,
      placement.area,
      production.technique,
    );

    return {
      type:
        basePlacement?.providerPlacementType ||
        (placement.area === 'front' ? 'default' : placement.area),
      mockupPlacement:
        basePlacement?.mockupPlacement ||
        (placement.area === 'front' ? 'front' : placement.area),
      url,
      position: placement.position,
      mockupPosition: basePlacement?.mockupPosition,
    };
  });
}

function printfulOrderFiles(product, options = {}) {
  return printfulPlacementFiles(product, options).map(({type, url}) => ({
    type,
    url,
  }));
}

function printfulProductVariants(product, baseProduct) {
  if (product.commerce?.variants?.length) return product.commerce.variants;

  if (baseProduct?.variants?.length) {
    return baseProduct.variants.map((variant) =>
      commerceVariantForBaseVariant(product.slug, variant),
    );
  }

  const ref = productProviderRef(product, 'printful');
  return (ref.variants || []).map((mapping) => ({
    id: mapping.variantId,
    sku: `${product.slug}-${mapping.catalogVariantId}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    providerVariantId: mapping.catalogVariantId,
  }));
}

function moneyFromMinorUnits(unitAmount) {
  return (Number(unitAmount) / 100).toFixed(2);
}

function publicAssetUrl(file, siteUrl) {
  if (!file || isRemoteUrl(file)) return file;
  const url = new URL(`/${String(file).replace(/^\/+/, '')}`, siteUrl);
  const version = localAssetVersion(file);
  if (version) url.searchParams.set('v', version);
  return url.toString();
}

function localAssetVersion(file) {
  if (!file || isRemoteUrl(file)) return null;
  const filePath = localPath(file);
  if (!existsSync(filePath)) return null;
  return createHash('sha256')
    .update(readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);
}

function assertPrintfulPublicAssetUrl(siteUrl) {
  if (process.env.PRINTFUL_ALLOW_NON_PUBLIC_ASSET_URLS === 'true') return;
  if (!siteUrl) {
    throw new Error(
      'Printful live calls require --site-url or PUBLIC_SITE_URL set to a public HTTPS origin.',
    );
  }

  const parsed = new URL(siteUrl);
  if (parsed.protocol !== 'https:') {
    throw new Error(
      'Printful live calls require a public HTTPS site URL so Printful can fetch print files.',
    );
  }
}

function resolveBasePlacement(baseProduct, area, technique) {
  const placements = baseProduct?.placements || [];
  for (const placement of placements) {
    if (typeof placement === 'string') {
      if (placement === area) {
        return {
          area,
          providerPlacementType: area === 'front' ? 'default' : area,
          mockupPlacement: area,
          techniques: baseProduct.techniques || [],
        };
      }
      continue;
    }

    if (
      placement.area === area &&
      (!technique || !placement.techniques || placement.techniques.includes(technique))
    ) {
      return placement;
    }
  }

  return null;
}

function commerceVariantForBaseVariant(slug, variant) {
  const sku = `${slug}-${variant.color}-${variant.size}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return {
    id: `${slug}:${variant.providerVariantId}`,
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

function escapeHtml(value) {
  return sanitizeXmlText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeXml(value) {
  return escapeHtml(value).replaceAll("'", '&apos;');
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function readArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function isRemoteUrl(value) {
  return /^https?:\/\//.test(String(value || ''));
}

function localPath(value) {
  if (isRemoteUrl(value)) {
    throw new Error(`Expected local path, received URL: ${value}`);
  }

  return path.join(rootDir, value);
}

function baseForProduct(baseProducts, product) {
  const baseProduct = productProduction(product).baseProduct;
  if (!baseProduct) return null;
  const base = baseProducts.products.find((item) => item.alias === baseProduct);
  if (!base) throw new Error(`${product.slug}: unknown base product ${baseProduct}`);
  return base;
}

function selectProducts(products, args) {
  const valueFlags = new Set([
    '--slug',
    '--query',
    '--provider',
    '--max-results',
    '--max-source-images',
    '--site-url',
    '--by',
    '--view',
    '--model',
    '--size',
    '--quality',
    '--background',
    '--output-format',
    '--input-fidelity',
  ]);
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith('--')) positional.push(arg);
  }
  const slug = readArg(args, '--slug') || positional[0];
  if (!slug || slug === 'all') return products;

  const product = products.find(
    (item) => item.slug === slug || item.commerce?.handle === slug,
  );
  if (!product) throw new Error(`Unknown merch product: ${slug}`);
  return [product];
}

export function catalogMockupPath(product) {
  return `assets/mockups/${product.slug}-catalog.png`;
}

export function customerPhotoPath(product, view = 'front', extension = 'png') {
  const normalizedView = slugify(view || 'front') || 'front';
  const normalizedExtension =
    extension === 'jpeg' ? 'jpg' : String(extension || 'png').replace(/^\./, '');
  return `assets/mockups/${product.slug}-photoshoot-${normalizedView}.${normalizedExtension}`;
}

function defaultAopMockupPaths(product) {
  return [
    `assets/mockups/${product.slug}-front.png`,
    `assets/mockups/${product.slug}-back.png`,
    `assets/mockups/${product.slug}-patterns.png`,
  ];
}

export function ensureCatalogMockupFirst(product) {
  product.assets = product.assets || {};
  const catalogPath = catalogMockupPath(product);
  const existingMockups = product.assets.mockups?.length
    ? product.assets.mockups
    : defaultAopMockupPaths(product);
  const secondaryMockups = existingMockups.filter(
    (mockup) => mockup && mockup !== catalogPath,
  );

  product.assets.mockups = [catalogPath, ...secondaryMockups];
  return catalogPath;
}

export function photoshootSourceCandidates(product) {
  const mockups = product.assets?.mockups || [];
  const catalogPath = catalogMockupPath(product);
  const customerPhotos = new Set(product.assets?.customerPhotos || []);
  const providerMockups = mockups.filter((mockup) => providerMockupPattern.test(mockup));
  const catalogMockups = mockups.filter((mockup) => mockup === catalogPath);
  const technicalMockups = mockups.filter(
    (mockup) =>
      mockup !== catalogPath &&
      !providerMockupPattern.test(mockup) &&
      !generatedCustomerPhotoPattern.test(mockup),
  );

  return uniqueAssetList([
    ...providerMockups,
    ...catalogMockups,
    ...technicalMockups,
    product.assets?.artwork,
  ]).filter(
    (asset) =>
      asset &&
      !customerPhotos.has(asset) &&
      !generatedCustomerPhotoPattern.test(asset),
  );
}

export function photoshootPrompt(product, baseProduct, artDirection, options = {}) {
  const view = options.view || 'front';
  const spec = product.artDirector?.aopSpec || {};
  const palette = spec.palette || {};
  const production = productProduction(product);
  const placementText = (production.placements || [])
    .map((placement) =>
      placement.text ? `${placement.area}: "${placement.text}"` : '',
    )
    .filter(Boolean);

  return [
    'You are the final Codex merch photoshooter.',
    'Use the supplied mockup images as the source of truth for garment silhouette, fabric color, graphic placement, proportions, and readable text.',
    'Render one realistic customer-facing merch photo, not a vector mockup, sketch, template, mannequin shot, or model photo.',
    `Target view: ${view}. Garment: ${baseProduct?.title || product.category || 'apparel'}.`,
    `Product title: ${product.title}.`,
    `Garment brief: ${product.meme?.brief || product.description || product.title}.`,
    `Known fabric palette: fabric ${palette.fabric || 'match source images'}, ink ${palette.ink || 'match source images'}, accent ${palette.accent || 'match source images'}.`,
    `Deterministic text layer to preserve: ${production.textLayer || product.title}.`,
    placementText.length
      ? `Exact visible print text by placement: ${placementText.join('; ')}. Preserve these strings when visible; do not hallucinate, rewrite, or mutate letters.`
      : '',
    'Art direction: isolated premium merch photography on a very light warm-gray ecommerce background, straight-on composition, soft studio shadow, realistic cotton fleece texture, ribbed cuffs/collar/hem, subtle wrinkles, natural stitching, product filled like real merch but unworn.',
    'Match the established Codex Supply House direction: quiet research-lab/skater merchandise, restrained negative space, precise sleeve story, and realistic garment depth like the hoodie and long-sleeve reference shots.',
    'Keep the background blank except for the garment shadow; do not add titles, captions, labels, badges, UI, or any text outside the garment itself.',
    artDirection?.aopGarmentRules?.length
      ? `Garment rules: ${artDirection.aopGarmentRules.join(' ')}`
      : '',
    'Do not invent new slogans, add official marks, add public figures, add hangers, add models, add packaging, crop off sleeves, change the garment category, or replace the supplied artwork.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function verifyPhotoshootReadiness(product, options = {}) {
  const {checkFiles = true} = options;
  const customerPhotos = product.assets?.customerPhotos || [];
  const issues = [];

  if (!customerPhotos.length) {
    issues.push(`${product.slug}: missing photoshooter customer photo`);
  }

  for (const customerPhoto of customerPhotos) {
    if (!isSupportedImagePath(customerPhoto)) {
      issues.push(`${product.slug}: unsupported customer photo type ${customerPhoto}`);
      continue;
    }

    if (checkFiles && !isRemoteUrl(customerPhoto) && !existsSync(localPath(customerPhoto))) {
      issues.push(`${product.slug}: missing customer photo ${customerPhoto}`);
    }
  }

  return {
    slug: product.slug,
    ok: issues.length === 0,
    issues,
    customerPhotos,
  };
}

function loadLocalEnv() {
  for (const name of ['.env.local', '.env']) {
    const file = path.join(rootDir, name);
    if (!existsSync(file)) continue;

    const lines = String(readFileSync(file, 'utf8')).split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

function uniqueAssetList(assets) {
  return [...new Set(assets.filter(Boolean))];
}

function isSupportedImagePath(asset) {
  return /\.(?:png|jpe?g|webp)$/i.test(String(asset || ''));
}

function localPhotoshootSources(product, maxSourceImages) {
  return photoshootSourceCandidates(product)
    .filter((asset) => !isRemoteUrl(asset))
    .filter(isSupportedImagePath)
    .filter((asset) => existsSync(localPath(asset)))
    .slice(0, maxSourceImages);
}

export function parseNewProductArgs(args) {
  const wantsAop = hasFlag(args, '--aop');
  const wantsStandard = hasFlag(args, '--standard');
  if (wantsAop && wantsStandard) {
    throw new Error('Choose either --aop or --standard, not both.');
  }

  const title = args
    .filter((arg) => arg !== '--aop' && arg !== '--standard')
    .join(' ')
    .trim();
  if (!title) {
    throw new Error(
      'Usage: npm run merch:new -- "Product title" [--aop|--standard]',
    );
  }

  return {title, mode: wantsStandard ? 'standard' : 'aop'};
}

async function runNew(args) {
  const {title, mode} = parseNewProductArgs(args);
  const slug = slugify(title);
  const products = await readProducts();
  if (products.some((product) => product.slug === slug)) {
    throw new Error(`Product already exists: ${slug}`);
  }

  const product =
    mode === 'aop'
      ? await newAopCottonProduct({products, slug, title})
      : newStandardPlacementProduct({products, slug, title});

  products.push(product);
  await writeProducts(products);
  process.stdout.write(`Created ${slug} (${mode})\n`);
}

async function newAopCottonProduct({products, slug, title}) {
  const baseProducts = await readBaseProducts();
  const baseProduct = baseProducts.products.find(
    (product) => product.alias === 'printful-aop-cotton-sweatshirt-white',
  );
  if (!baseProduct) {
    throw new Error('Missing base product: printful-aop-cotton-sweatshirt-white');
  }

  const placements = AOP_COTTON_REQUIRED_PLACEMENTS.map((area) => ({
    area,
    file: `assets/print/${slug}-${area}_dtfabric.png`,
    width: area === 'label_inside' ? 375 : baseProduct.printfile.width,
    height: area === 'label_inside' ? 150 : baseProduct.printfile.height,
  }));

  return {
    id: `drop-${String(products.length + 1).padStart(3, '0')}-${slug}`,
    slug,
    title,
    workflow: {status: 'draft', updatedAt: new Date().toISOString()},
    category: 'Codex',
    description:
      'Draft all-over cotton garment. Complete X trend research and art direction before generation.',
    meme: {
      source: 'Pending X trend research',
      brief:
        'Replace this placeholder with a research-backed garment brief before generation.',
      rightsNote:
        'Rights review required before publishing. Use X posts as trend signals only; do not copy text, screenshots, usernames, likenesses, official marks, or protected brand references.',
    },
    signals: {
      profile: 'codex-trend-research',
      queries: [
        {
          provider: 'x',
          query:
            '(codex OR "code agent" OR agents OR "terminal") (ship OR eval OR diff OR review OR deploy) lang:en -is:retweet',
        },
      ],
      sources: [],
    },
    commerce: {
      handle: slug,
      unitAmount: 8800,
      currency: 'USD',
      tags: ['codex', 'sweatshirt', 'all-over-cotton'],
      variants: baseProduct.variants.map((variant) =>
        commerceVariantForBaseVariant(slug, variant),
      ),
    },
    production: {
      provider: 'printful',
      baseProduct: baseProduct.alias,
      technique: 'All-Over Cotton',
      textLayer: title,
      placements,
    },
    providerRefs: {
      printful: {
        productId: null,
        mockupTaskKey: null,
        variants: [],
      },
    },
    assets: {
      artwork: `assets/artwork/${slug}-concept.png`,
      printFiles: placements.map((placement) => ({
        placement: placement.area,
        path: placement.file,
      })),
      mockups: [
        `assets/mockups/${slug}-front.png`,
        `assets/mockups/${slug}-back.png`,
        `assets/mockups/${slug}-patterns.png`,
      ],
    },
    prompts: [
      'Replace this placeholder with a research-backed all-over cotton garment concept before generating artwork.',
    ],
    workflowNotes: [
      'Run merch:signals -- --provider x first, then replace meme.brief, prompts, and artDirector.aopSpec.',
      'Do not run merch:generate-artwork until artDirectorReview accepts the AOP spec.',
    ],
    artDirector: {
      mode: 'supervised-aop-cotton',
      aopSpec: {
        garmentFirst: true,
        basePattern: 'TBD after X research',
        palette: {
          fabric: '#TBD',
          ink: '#TBD',
          muted: '#TBD',
          accent: '#TBD',
        },
        front: {
          primaryText: 'TBD after X research',
          chestLabel: 'TBD',
          mark: 'TBD',
          subline: 'TBD',
        },
        back: {
          statement: 'TBD after X research',
          subline: 'TBD',
        },
        sleeves: {
          motif: 'TBD after X research',
          leftText: 'TBD',
          rightText: 'TBD',
          caption: 'TBD',
        },
        label: {
          line: 'TBD',
        },
      },
    },
    approval: {approvedAt: null, approvedBy: null, notes: ''},
  };
}

function newStandardPlacementProduct({products, slug, title}) {
  return {
    id: `drop-${String(products.length + 1).padStart(3, '0')}-${slug}`,
    slug,
    title,
    workflow: {status: 'draft', updatedAt: new Date().toISOString()},
    category: 'Codex',
    description: 'Draft product created from a Codex merch conversation.',
    meme: {
      source: 'User-provided prompt',
      brief: 'Fill in the meme brief before sync.',
      rightsNote:
        'Rights review required before publishing. Avoid official marks, recognizable people, copied screenshots, or verbatim social posts.',
    },
    signals: {
      profile: 'codex-trend-research',
      queries: [],
      sources: [],
    },
    commerce: {
      handle: slug,
      unitAmount: 4200,
      currency: 'USD',
      tags: ['codex'],
      variants: [],
    },
    production: {
      provider: 'printful',
      baseProduct: 'bella-canvas-3001-black',
      technique: 'DTFlex',
      placements: [{area: 'front', file: `assets/print/${slug}-front.png`}],
    },
    providerRefs: {
      printful: {
        productId: null,
        mockupTaskKey: null,
        variants: [],
      },
    },
    assets: {
      artwork: `assets/artwork/${slug}.png`,
      printFiles: [{placement: 'front', path: `assets/print/${slug}-front.png`}],
      mockups: [
        `merch/mockups/${slug}-front.svg`,
        `merch/mockups/${slug}-back.svg`,
        `merch/mockups/${slug}-detail.svg`,
      ],
    },
    approval: {approvedAt: null, approvedBy: null, notes: ''},
    prompts: ['Fill in the image-generation prompt before producing assets.'],
  };
}

async function runValidate() {
  const products = await readProducts();
  const legacyErrors = validateProducts(products);
  const {errors: schemaErrors} = await validateCatalog();
  const errors = [...legacyErrors, ...schemaErrors];
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Validated ${products.length} merch products.\n`);
}

async function runComposePlan() {
  const products = await readProducts();
  printJson(products.map(composePrintFilePlan));
}

async function runCatalogMockups(args) {
  const products = await readProducts();
  const selected = selectProducts(products, args);
  const sharp = (await import('sharp')).default;
  const results = [];

  for (const product of selected) {
    const production = productProduction(product);
    if (production.technique !== 'All-Over Cotton') {
      throw new Error(`${product.slug}: catalog mockups require All-Over Cotton`);
    }

    const spec = product.artDirector?.aopSpec;
    if (!spec) {
      throw new Error(`${product.slug}: catalog mockups require artDirector.aopSpec`);
    }

    const mockupPath = await composeAopCatalogMockup(product, spec, sharp);
    results.push({slug: product.slug, catalogMockup: mockupPath});
  }

  await writeProducts(products);
  printJson(results);
}

async function runResearchX(args) {
  return runSignals(['--provider', 'x', ...args]);
}

async function runSignals(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const maxResults = Number(readArg(args, '--max-results', 25));
  const providerName = readArg(args, '--provider', 'x');
  const products = await readProducts();
  const selected = selectProducts(products, args);
  const {providerForSignal} = await import('./services/signals.mjs');
  const provider = providerForSignal(providerName);

  const requests = selected.map((product) => {
    const configuredQuery = (product.signals?.queries || []).find(
      (query) => query.provider === provider.name,
    );
    const query =
      readArg(args, '--query') ||
      configuredQuery?.query ||
      `${product.meme.brief} lang:en -is:retweet`;
    return {product, query, maxResults};
  });

  if (dryRun) {
    printJson(
      requests.map(({product, query}) => ({
        slug: product.slug,
        provider: provider.name,
        ...provider.dryRun({query, maxResults}),
      })),
    );
    return;
  }

  requireEnv(['X_BEARER_TOKEN']);
  for (const request of requests) {
    request.product.signals = request.product.signals || {
      profile: 'codex-trend-research',
      queries: [],
      sources: [],
    };
    const queryIndex = request.product.signals.queries.findIndex(
      (query) => query.provider === provider.name,
    );
    const queryRecord = {provider: provider.name, query: request.query, maxResults};
    if (queryIndex === -1) {
      request.product.signals.queries.push(queryRecord);
    } else {
      request.product.signals.queries[queryIndex] = queryRecord;
    }
    request.product.signals.sources = (await provider.retrieve(request)).map((source) => ({
      provider: provider.name,
      ...source,
    }));
    request.product.meme.source = `Signal provider: ${provider.name}`;
    request.product.meme.rightsNote =
      request.product.meme.rightsNote ||
      'Use social posts as trend signals only. Do not copy text, screenshots, usernames, likenesses, or protected marks into merch.';
  }

  await writeProducts(products);
  printJson(
    requests.map(({product}) => ({
      slug: product.slug,
      sources: product.signals.sources.length,
    })),
  );
}

async function runGenerateArtwork(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const force = hasFlag(args, '--force');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const techniqueCatalog = await readCustomizationTechniques();
  const artDirection = await readArtDirection();
  const selected = selectProducts(products, args);
  const {
    buildImageGenerationRequest,
    buildImagePrompt,
    firstImageBase64,
    generateArtworkImage,
  } = await import('./adapters/openai-images.mjs');

  const jobs = selected.map((product) => {
    const base = baseForProduct(bases, product);
    const production = productProduction(product);
    const preflight = generationPreflight(product, base, techniqueCatalog);
    if (!preflight.ok) {
      throw new Error(preflight.errors.join('\n'));
    }
    if (preflight.warnings.length) {
      console.warn(preflight.warnings.join('\n'));
    }
    const review =
      production.technique === 'All-Over Cotton'
        ? artDirectorReview(product, base, artDirection)
        : null;
    if (review && !review.accepted) {
      throw new Error(
        `${product.slug}: art director validator rejected design before image generation\n${review.findings.join('\n')}`,
      );
    }
    const productionConstraints = generationDirectionPrompt(
      product,
      base,
      techniqueCatalog,
      artDirection,
    );
    const prompt =
      production.technique === 'All-Over Cotton'
        ? aopCottonSupervisorPrompt(product, base, techniqueCatalog, artDirection)
        : buildImagePrompt({
            brief: `${productionConstraints} Creative brief: ${product.meme.brief} ${product.prompts.join(' ')}`,
            textLayer: production.textLayer || product.title,
            productKind: base?.title || product.category || 'apparel',
          });

    return {
      product,
      prompt,
      preflight,
      review,
      request: buildImageGenerationRequest({prompt}),
    };
  });

  if (dryRun) {
    printJson(
      jobs.map(({product, preflight, request, review}) => ({
        slug: product.slug,
        productionPreflight: preflight,
        artDirectorReview: review,
        request,
      })),
    );
    return;
  }

  requireEnv(['OPENAI_API_KEY']);
  for (const job of jobs) {
    if (existsSync(localPath(job.product.assets.artwork)) && !force) continue;

    const result = await generateArtworkImage(job.request);
    const image = Buffer.from(firstImageBase64(result), 'base64');
    const output = localPath(job.product.assets.artwork);
    await mkdir(path.dirname(output), {recursive: true});
    await writeFile(output, image);
    if (job.review) {
      job.product.artDirector = {
        ...(job.product.artDirector || {}),
        review: job.review,
      };
    }
    setWorkflowStatus(job.product, 'generated');
  }

  await writeProducts(products);
  printJson(jobs.map(({product}) => ({slug: product.slug, artwork: product.assets.artwork})));
}

async function runComposePrintFiles(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const plans = selected.map((product) => {
    const base = baseForProduct(bases, product);
    return {product, base, plan: composePrintFilePlan(product)};
  });

  if (dryRun) {
    printJson(plans.map(({plan}) => plan));
    return;
  }

  for (const {product, base} of plans) {
    await composeProductPrintFiles(product, base);
    setWorkflowStatus(product, 'generated');
  }

  await writeProducts(products);
  printJson(plans.map(({product}) => ({slug: product.slug, printFiles: product.assets.printFiles})));
}

export async function composeProductPrintFiles(product, baseProduct) {
  const production = productProduction(product);
  if (production.technique === 'All-Over Cotton') {
    return composeAopCottonProductFiles(product, baseProduct);
  }

  const sharp = (await import('sharp')).default;
  const dimensions = baseProduct?.printfile || {width: 1800, height: 2400};
  const placements = production.placements || [];
  product.assets.printFiles = product.assets.printFiles || [];

  for (const placement of placements) {
    const outputPath = localPath(placement.file);
    await mkdir(path.dirname(outputPath), {recursive: true});

    const width = placement.width || dimensions.width;
    const height = placement.height || dimensions.height;
    const composites = [];
    const artworkPath = localPath(product.assets.artwork);

    const layout = printPlacementLayout({width, height, placement: placement.area});
    const text = placement.text || production.textLayer || product.title;

    if (existsSync(artworkPath)) {
      const artwork = await sharp(artworkPath)
        .resize({
          width: layout.artwork.width,
          height: layout.artwork.height,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const artworkMeta = await sharp(artwork).metadata();
      composites.push({
        input: artwork,
        left: Math.round((width - (artworkMeta.width || layout.artwork.width)) / 2),
        top: layout.artwork.top,
      });
    }

    composites.push({
      input: Buffer.from(
        printTextSvg({width, height, text, layout}),
      ),
      gravity: 'center',
    });

    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: {r: 0, g: 0, b: 0, alpha: 0},
      },
    })
      .composite(composites)
      .png()
      .toFile(outputPath);

    const existing = product.assets.printFiles.find(
      (file) => file.placement === placement.area,
    );
    if (existing) {
      existing.path = placement.file;
    } else {
      product.assets.printFiles.push({placement: placement.area, path: placement.file});
    }
  }
}

async function composeAopCottonProductFiles(product, baseProduct) {
  const sharp = (await import('sharp')).default;
  const spec = product.artDirector?.aopSpec;
  if (!spec) {
    throw new Error(`${product.slug}: All-Over Cotton composition requires artDirector.aopSpec`);
  }

  product.assets.printFiles = product.assets.printFiles || [];
  const production = productProduction(product);

  for (const placement of production.placements || []) {
    const resolved = resolveBasePlacement(
      baseProduct,
      placement.area,
      production.technique,
    );
    if (!resolved) {
      throw new Error(`${product.slug}: unsupported AOP placement ${placement.area}`);
    }

    const outputPath = localPath(placement.file);
    await mkdir(path.dirname(outputPath), {recursive: true});
    const width = placement.width || resolved.width || baseProduct.printfile.width;
    const height = placement.height || resolved.height || baseProduct.printfile.height;
    const svg =
      placement.area === 'label_inside'
        ? aopInsideLabelSvg({product, spec, width, height})
        : aopPanelSvg({product, spec, area: placement.area, width, height});

    await sharp(Buffer.from(svg)).png().toFile(outputPath);

    const existing = product.assets.printFiles.find(
      (file) => file.placement === placement.area,
    );
    if (existing) {
      existing.path = placement.file;
    } else {
      product.assets.printFiles.push({placement: placement.area, path: placement.file});
    }
  }

  await composeAopCottonMockups(product, spec, sharp);
}

async function composeAopCatalogMockup(product, spec, sharp) {
  const mockupPath = ensureCatalogMockupFirst(product);
  const outputPath = localPath(mockupPath);
  await mkdir(path.dirname(outputPath), {recursive: true});
  await sharp(Buffer.from(aopCatalogMockupSvg({product, spec})))
    .png()
    .toFile(outputPath);
  return mockupPath;
}

async function composeAopCottonMockups(product, spec, sharp) {
  const catalogPath = await composeAopCatalogMockup(product, spec, sharp);
  const secondaryMockups = product.assets.mockups
    .filter((mockupPath) => mockupPath !== catalogPath);
  const technicalMockups = secondaryMockups.length
    ? secondaryMockups
    : defaultAopMockupPaths(product);
  product.assets.mockups = [
    catalogPath,
    ...technicalMockups.filter((mockupPath) => mockupPath !== catalogPath),
  ];

  for (const mockupPath of product.assets.mockups.slice(1)) {
    const angle = mockupPath.includes('-back')
      ? 'back'
      : mockupPath.includes('-patterns')
        ? 'patterns'
        : 'front';
    const outputPath = localPath(mockupPath);
    await mkdir(path.dirname(outputPath), {recursive: true});
    await sharp(Buffer.from(aopMockupSvg({product, spec, angle})))
      .png()
      .toFile(outputPath);
  }
}

function aopPalette(spec) {
  return {
    fabric: spec.palette?.fabric || '#f4efe6',
    ink: spec.palette?.ink || '#111111',
    muted: spec.palette?.muted || '#d8d2c6',
    accent: spec.palette?.accent || '#0047ff',
    accent2: spec.palette?.accent2 || spec.palette?.accent || '#0047ff',
  };
}

export function aopPanelSvg({product, spec, area, width, height}) {
  const palette = aopPalette(spec);
  const production = productProduction(product);
  const text = {
    title: production.textLayer || product.title,
    front: spec.front?.primaryText || production.textLayer || product.title,
    chest: spec.front?.chestLabel || product.title,
    mark: spec.front?.mark || 'C/DX',
    back: spec.back?.statement || spec.front?.primaryText || product.title,
    sleeveLeft: spec.sleeves?.leftText || spec.sleeves?.text || product.title,
    sleeveRight: spec.sleeves?.rightText || spec.sleeves?.text || product.title,
  };

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} ${area} AOP panel">
  ${aopDefs(palette)}
  <rect width="${width}" height="${height}" fill="${palette.fabric}"/>
  <g data-aop-aesthetic-world="${escapeXml(spec.aestheticWorld || 'legacy')}" data-aop-type-system="${escapeXml(spec.typeSystem || 'serif-editorial')}">
    ${aopBasePattern({area, spec, palette, width, height})}
    ${aopPanelComposition({area, text, spec, palette, width, height})}
  </g>
</svg>`;
}

function aopInsideLabelSvg({product, spec, width, height}) {
  const palette = aopPalette(spec);
  const production = productProduction(product);
  const brandLabel = spec.brandLabel || 'CODEX SUPPLY';
  const labelLine = spec.label?.line || production.textLayer || product.title;
  const contentWidth = Math.max(1, width - 72);
  const type = aopTypeSystem(spec);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} inside label">
  <rect width="${width}" height="${height}" fill="${palette.fabric}"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="${palette.ink}" stroke-width="3"/>
  ${fittedTextSvg({text: brandLabel, x: width / 2, y: 29, maxWidth: contentWidth, maxHeight: 29, fontMax: 26, fontMin: 14, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 28, maxLines: 1, role: 'inside-label-brand'})}
  ${fittedTextSvg({text: labelLine, x: width / 2, y: 68, maxWidth: contentWidth, maxHeight: 25, fontMax: 20, fontMin: 12, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: 32, maxLines: 1, role: 'inside-label-line'})}
  ${fittedTextSvg({text: '95% COTTON / 5% ELASTANE / MADE ON DEMAND', x: width / 2, y: 111, maxWidth: contentWidth, maxHeight: 18, fontMax: 13, fontMin: 8, family: type.supportFamily, weight: 700, fill: palette.ink, maxLineLength: 52, maxLines: 1, role: 'inside-label-fiber'})}
</svg>`;
}

function aopDefs(palette) {
  return `<defs>
    <pattern id="pinstripe" width="160" height="160" patternUnits="userSpaceOnUse">
      <rect width="160" height="160" fill="transparent"/>
      <path d="M0 0V160" stroke="${palette.ink}" stroke-width="5" opacity="0.52"/>
      <path d="M78 0V160" stroke="${palette.muted}" stroke-width="2" opacity="0.4"/>
    </pattern>
    <pattern id="microgrid" width="260" height="260" patternUnits="userSpaceOnUse">
      <path d="M0 0H260M0 0V260" stroke="${palette.muted}" stroke-width="5" opacity="0.22"/>
    </pattern>
    <pattern id="statusmap" width="360" height="360" patternUnits="userSpaceOnUse">
      <path d="M0 0H360M0 0V360" stroke="${palette.muted}" stroke-width="4" opacity="0.18"/>
      <path d="M-30 282L72 228L154 256L246 190L390 218" fill="none" stroke="${palette.ink}" stroke-width="5" opacity="0.22"/>
      <path d="M-18 96L86 46L172 112L276 64L390 82" fill="none" stroke="${palette.muted}" stroke-width="4" opacity="0.28"/>
      <path d="M270 80h44v44h-44z" fill="none" stroke="${palette.accent}" stroke-width="5" opacity="0.72"/>
    </pattern>
    <pattern id="queuegrid" width="320" height="320" patternUnits="userSpaceOnUse">
      <path d="M0 52H320M0 168H320M0 284H320" stroke="${palette.muted}" stroke-width="4" opacity="0.16"/>
      <circle cx="52" cy="52" r="10" fill="${palette.ink}" opacity="0.3"/>
      <circle cx="150" cy="168" r="10" fill="${palette.ink}" opacity="0.28"/>
      <path d="M52 52V168H150V284H258" fill="none" stroke="${palette.ink}" stroke-width="5" opacity="0.22"/>
    </pattern>
    <pattern id="checkerboard" width="320" height="320" patternUnits="userSpaceOnUse">
      <rect width="320" height="320" fill="transparent"/>
      <rect width="160" height="160" fill="${palette.ink}" opacity="0.2"/>
      <rect x="160" y="160" width="160" height="160" fill="${palette.ink}" opacity="0.2"/>
    </pattern>
    <pattern id="sunstripes" width="400" height="520" patternUnits="userSpaceOnUse">
      <rect width="400" height="120" fill="${palette.accent}" opacity="0.32"/>
      <rect y="170" width="400" height="72" fill="${palette.ink}" opacity="0.12"/>
      <rect y="300" width="400" height="150" fill="${palette.muted}" opacity="0.2"/>
    </pattern>
    <pattern id="halftone" width="180" height="180" patternUnits="userSpaceOnUse">
      <circle cx="35" cy="35" r="18" fill="${palette.ink}" opacity="0.22"/>
      <circle cx="125" cy="125" r="28" fill="${palette.accent}" opacity="0.24"/>
    </pattern>
    <pattern id="wavybands" width="480" height="360" patternUnits="userSpaceOnUse">
      <path d="M-40 88C70 18 168 158 280 88S490 18 560 88" fill="none" stroke="${palette.accent}" stroke-width="54" opacity="0.28"/>
      <path d="M-40 244C70 174 168 314 280 244S490 174 560 244" fill="none" stroke="${palette.ink}" stroke-width="32" opacity="0.14"/>
    </pattern>
  </defs>`;
}

function usesRecipeAopRenderer(spec) {
  return Boolean(spec.layout || spec.sleeves?.style);
}

function aopPatternId(spec) {
  if (spec.basePattern === 'pinstripe') return 'pinstripe';
  if (spec.basePattern === 'queue-radar') return 'queuegrid';
  if (spec.basePattern === 'checkerboard') return 'checkerboard';
  if (spec.basePattern === 'sun-stripes') return 'sunstripes';
  if (spec.basePattern === 'halftone-noise') return 'halftone';
  if (spec.basePattern === 'wavy-bands') return 'wavybands';
  if (spec.basePattern === 'status-isobar-map') {
    return 'statusmap';
  }
  return 'microgrid';
}

function aopBasePattern({area, spec, palette, width, height}) {
  const pattern = aopPatternId(spec);
  const recipeMode = usesRecipeAopRenderer(spec);
  const bg = `<rect width="${width}" height="${height}" fill="url(#${pattern})" opacity="${
    recipeMode ? (pattern === 'pinstripe' ? 0.28 : 0.44) : pattern === 'pinstripe' ? 0.65 : 0.85
  }"/>`;
  const statusOverlay =
    pattern === 'statusmap' && !recipeMode
      ? `<g opacity="0.62">
          <path d="M${width * 0.08} ${height * 0.22}C${width * 0.22} ${height * 0.08} ${width * 0.42} ${height * 0.34} ${width * 0.62} ${height * 0.2}C${width * 0.78} ${height * 0.09} ${width * 0.88} ${height * 0.2} ${width * 0.96} ${height * 0.13}" fill="none" stroke="${palette.ink}" stroke-width="${width * 0.006}"/>
          <path d="M${width * 0.04} ${height * 0.64}C${width * 0.2} ${height * 0.52} ${width * 0.34} ${height * 0.76} ${width * 0.5} ${height * 0.62}C${width * 0.66} ${height * 0.48} ${width * 0.76} ${height * 0.68} ${width * 0.95} ${height * 0.55}" fill="none" stroke="${palette.muted}" stroke-width="${width * 0.005}"/>
        </g>`
      : '';
  const sleeve =
    area.includes('sleeve')
      ? aopSleeveMotif({spec, palette, width, height, area})
      : recipeMode && (area === 'front' || area === 'back')
        ? aopBodyMotif({spec, palette, width, height, area})
        : '';
  return `${bg}${statusOverlay}${sleeve}`;
}

function aopBodyMotif({spec, palette, width, height, area}) {
  const mutedStroke = Math.max(5, width * 0.008);
  const strongStroke = Math.max(8, width * 0.014);
  const backShift = area === 'back' ? width * 0.045 : 0;

  if (spec.basePattern === 'status-isobar-map') {
    const x = width * 0.5 + backShift;
    const y = height * (area === 'back' ? 0.55 : 0.58);
    const rings = [
      [0.32, 0.16, 0.34],
      [0.25, 0.12, 0.56],
      [0.18, 0.085, 0.82],
    ];
    return `<g data-aop-motif="status-isobar-map" fill="none" stroke-linejoin="miter">
      ${rings
        .map(([rx, ry, opacity]) => {
          const left = x - width * rx;
          const right = x + width * rx;
          const top = y - height * ry;
          const bottom = y + height * ry;
          const notch = width * 0.055;
          return `<path d="M${left + notch} ${top}H${right - notch}L${right} ${top + notch}V${bottom - notch}L${right - notch} ${bottom}H${left + notch}L${left} ${bottom - notch}V${top + notch}Z" stroke="${palette.ink}" stroke-width="${mutedStroke}" opacity="${opacity}"/>`;
        })
        .join('')}
      <path d="M${x + width * 0.17} ${y - height * 0.085}H${x + width * 0.28}L${x + width * 0.32} ${y - height * 0.045}" stroke="${palette.accent}" stroke-width="${strongStroke}"/>
    </g>`;
  }

  if (spec.basePattern === 'pinstripe') {
    const windowX = width * 0.5;
    const windowY = height * (area === 'back' ? 0.58 : 0.56);
    return `<g data-aop-motif="pinstripe-window" fill="none" stroke-linejoin="miter">
      <path d="M${width * 0.12} ${windowY}H${windowX - width * 0.2}L${windowX - width * 0.14} ${windowY - height * 0.07}" stroke="${palette.muted}" stroke-width="${strongStroke}"/>
      <rect x="${windowX - width * 0.14}" y="${windowY - height * 0.075}" width="${width * 0.28}" height="${height * 0.15}" stroke="${palette.ink}" stroke-width="${strongStroke}"/>
      <path d="M${windowX + width * 0.14} ${windowY + height * 0.075}L${windowX + width * 0.2} ${windowY}H${width * 0.88}" stroke="${palette.muted}" stroke-width="${strongStroke}"/>
      <path d="M${windowX - width * 0.09} ${windowY}H${windowX + width * 0.09}" stroke="${palette.accent}" stroke-width="${strongStroke * 1.25}"/>
    </g>`;
  }

  if (spec.basePattern === 'queue-radar') {
    const splitX = width * (area === 'back' ? 0.52 : 0.62);
    const branchLines = Array.from({length: 4}, (_, index) => {
      const y = height * (0.48 + index * 0.065);
      const endX = splitX - width * (0.06 + index * 0.025);
      return `<path d="M${width * 0.1} ${y}H${endX - width * 0.08}L${endX} ${y + height * 0.025}"/>`;
    }).join('');
    const checks = Array.from({length: 3}, (_, index) => {
      const x = splitX + width * (0.09 + index * 0.085);
      const y = height * (0.51 + index * 0.075);
      return `<path d="M${x - width * 0.025} ${y}l${width * 0.018} ${height * 0.018}l${width * 0.04} ${-height * 0.04}"/>`;
    }).join('');
    return `<g data-aop-motif="queue-radar" fill="none" stroke-linecap="square" stroke-linejoin="miter">
      <g stroke="${palette.ink}" stroke-width="${mutedStroke}" opacity="0.62">${branchLines}</g>
      <path d="M${splitX} ${height * 0.45}V${height * 0.76}" stroke="${palette.muted}" stroke-width="${mutedStroke}" opacity="0.5"/>
      <g stroke="${palette.accent}" stroke-width="${strongStroke}">${checks}</g>
    </g>`;
  }

  if (spec.basePattern === 'checkerboard') {
    const y = height * (area === 'back' ? 0.58 : 0.56);
    return `<g data-aop-motif="checkerboard" fill="none">
      <rect x="${width * 0.12}" y="${y - height * 0.12}" width="${width * 0.76}" height="${height * 0.24}" rx="${width * 0.05}" stroke="${palette.ink}" stroke-width="${strongStroke}"/>
      <path d="M${width * 0.2} ${y}H${width * 0.8}" stroke="${palette.accent}" stroke-width="${strongStroke * 1.35}"/>
    </g>`;
  }

  if (spec.basePattern === 'sun-stripes') {
    const sunX = width * (area === 'back' ? 0.66 : 0.32);
    const sunY = height * 0.58;
    return `<g data-aop-motif="sun-stripes">
      <circle cx="${sunX}" cy="${sunY}" r="${width * 0.19}" fill="${palette.accent}" opacity="0.92"/>
      <rect x="${width * 0.08}" y="${sunY}" width="${width * 0.84}" height="${height * 0.052}" fill="${palette.fabric}"/>
      <rect x="${width * 0.08}" y="${sunY + height * 0.07}" width="${width * 0.84}" height="${height * 0.025}" fill="${palette.ink}" opacity="0.78"/>
    </g>`;
  }

  if (spec.basePattern === 'halftone-noise') {
    const rotation = area === 'back' ? -7 : 7;
    return `<g data-aop-motif="halftone-noise" transform="rotate(${rotation} ${width * 0.5} ${height * 0.58})">
      <rect x="${width * 0.14}" y="${height * 0.45}" width="${width * 0.72}" height="${height * 0.28}" fill="${palette.ink}" opacity="0.12"/>
      <rect x="${width * 0.2}" y="${height * 0.5}" width="${width * 0.6}" height="${height * 0.18}" fill="none" stroke="${palette.accent}" stroke-width="${strongStroke}"/>
    </g>`;
  }

  if (spec.basePattern === 'wavy-bands') {
    return `<g data-aop-motif="wavy-bands" fill="none" stroke-linecap="round">
      <path d="M${-width * 0.08} ${height * 0.52}C${width * 0.18} ${height * 0.42} ${width * 0.32} ${height * 0.64} ${width * 0.55} ${height * 0.52}S${width * 0.92} ${height * 0.4} ${width * 1.08} ${height * 0.52}" stroke="${palette.accent}" stroke-width="${width * 0.075}"/>
      <path d="M${-width * 0.08} ${height * 0.65}C${width * 0.18} ${height * 0.55} ${width * 0.32} ${height * 0.77} ${width * 0.55} ${height * 0.65}S${width * 0.92} ${height * 0.53} ${width * 1.08} ${height * 0.65}" stroke="${palette.ink}" stroke-width="${width * 0.035}" opacity="0.68"/>
    </g>`;
  }

  return '';
}

function aopSleeveMotif({spec, palette, width, height, area}) {
  const style = spec.sleeves?.style;
  const right = area === 'right_sleeve';
  const motifX = width * (right ? 0.65 : 0.35);
  if (style === 'glyph-stack') {
    return aopSleeveNodeStack({
      palette,
      width,
      height,
      flip: right,
    });
  }
  if (style === 'radar-rings') {
    return `<g data-aop-motif="radar-rings" transform="translate(${motifX} ${height * 0.54})" fill="none" stroke-linejoin="miter">
      <g stroke="${palette.ink}" stroke-width="${Math.max(7, width * 0.012)}">
        <circle r="${width * 0.095}"/><circle r="${width * 0.19}" opacity="0.7"/><circle r="${width * 0.285}" opacity="0.42"/>
      </g>
      <path d="M${right ? width * 0.19 : -width * 0.19} ${-width * 0.19}h${right ? width * 0.13 : -width * 0.13}v${right ? width * 0.055 : -width * 0.055}" stroke="${palette.accent}" stroke-width="${Math.max(10, width * 0.018)}"/>
      <path d="M0 ${-width * 0.32}V${width * 0.32}M${-width * 0.32} 0H${width * 0.32}" stroke="${palette.muted}" stroke-width="${Math.max(4, width * 0.006)}" opacity="0.46"/>
    </g>`;
  }
  if (style === 'ladder') {
    const rungs = Array.from({length: 9}, (_, index) => {
      const y = height * (0.18 + index * 0.075);
      const accent = index === (right ? 5 : 3);
      return `<path d="M${width * 0.35} ${y}H${width * 0.65}" stroke="${accent ? palette.accent : palette.ink}" stroke-width="${accent ? width * 0.025 : width * 0.014}" opacity="${accent ? 1 : 0.58}"/>`;
    }).join('');
    return `<g data-aop-motif="ladder" fill="none">
      <path d="M${width * 0.35} ${height * 0.15}V${height * 0.82}M${width * 0.65} ${height * 0.15}V${height * 0.82}" stroke="${palette.ink}" stroke-width="${width * 0.018}" opacity="0.58"/>
      ${rungs}
    </g>`;
  }
  if (style === 'racing-stripe') {
    return `<g data-aop-motif="racing-stripe">
      <rect x="${width * (right ? 0.18 : 0.58)}" y="${height * 0.08}" width="${width * 0.13}" height="${height * 0.82}" fill="${palette.ink}" opacity="0.82"/>
      <rect x="${width * (right ? 0.33 : 0.43)}" y="${height * 0.08}" width="${width * 0.075}" height="${height * 0.82}" fill="${palette.accent}"/>
      <rect x="${width * (right ? 0.43 : 0.35)}" y="${height * 0.08}" width="${width * 0.025}" height="${height * 0.82}" fill="${palette.muted}"/>
    </g>`;
  }
  if (style === 'checker-cuff') {
    const cells = Array.from({length: 8}, (_, index) => {
      const x = (index % 4) * width * 0.25;
      const y = height * (0.66 + Math.floor(index / 4) * 0.12);
      const filled = (index + Math.floor(index / 4)) % 2 === 0;
      return `<rect x="${x}" y="${y}" width="${width * 0.25}" height="${height * 0.12}" fill="${filled ? palette.ink : palette.accent}" opacity="${filled ? 0.82 : 0.9}"/>`;
    }).join('');
    return `<g data-aop-motif="checker-cuff">${cells}</g>`;
  }
  if (style === 'sun-wave') {
    return `<g data-aop-motif="sun-wave" fill="none" stroke-linecap="round">
      <circle cx="${width * (right ? 0.68 : 0.32)}" cy="${height * 0.24}" r="${width * 0.13}" fill="${palette.accent}" stroke="none"/>
      <path d="M${width * 0.08} ${height * 0.48}C${width * 0.28} ${height * 0.4} ${width * 0.42} ${height * 0.56} ${width * 0.62} ${height * 0.48}S${width * 0.9} ${height * 0.4} ${width * 1.05} ${height * 0.48}" stroke="${palette.ink}" stroke-width="${width * 0.04}"/>
      <path d="M${-width * 0.05} ${height * 0.59}C${width * 0.18} ${height * 0.51} ${width * 0.38} ${height * 0.67} ${width * 0.58} ${height * 0.59}S${width * 0.86} ${height * 0.51} ${width * 1.08} ${height * 0.59}" stroke="${palette.muted}" stroke-width="${width * 0.026}"/>
    </g>`;
  }
  if (style === 'badge-repeat') {
    const badges = Array.from({length: 3}, (_, index) => {
      const y = height * (0.24 + index * 0.22);
      return `<g transform="translate(${motifX} ${y})">
        <circle r="${width * 0.12}" fill="${index === 1 ? palette.accent : 'none'}" stroke="${palette.ink}" stroke-width="${width * 0.018}"/>
        <path d="M${-width * 0.065} 0H${width * 0.065}M0 ${-width * 0.065}V${width * 0.065}" stroke="${index === 1 ? palette.fabric : palette.accent}" stroke-width="${width * 0.018}"/>
      </g>`;
    }).join('');
    return `<g data-aop-motif="badge-repeat">${badges}</g>`;
  }
  if (style === 'wave') {
    const lineCount = right ? 3 : 6;
    const waveLines = Array.from({length: lineCount}, (_, index) => {
      const y = height * (0.26 + index * (right ? 0.13 : 0.075));
      const startX = width * (right ? 0.26 : 0.14);
      const endX = width * (right ? 0.68 : 0.78);
      const step = width * (right ? 0.1 : 0.065);
      return `<path d="M${startX} ${y}H${endX - step}L${endX} ${y + height * 0.035}"/>`;
    }).join('');
    const clearingMarks = right
      ? `<g stroke="${palette.accent}" stroke-width="${Math.max(9, width * 0.017)}">
          <path d="M${width * 0.62} ${height * 0.68}l${width * 0.035} ${height * 0.025}l${width * 0.075} ${-height * 0.06}"/>
          <path d="M${width * 0.48} ${height * 0.78}l${width * 0.035} ${height * 0.025}l${width * 0.075} ${-height * 0.06}"/>
        </g>`
      : '';
    return `<g data-aop-motif="wave" fill="none" stroke-linejoin="miter">
      <g stroke="${palette.ink}" stroke-width="${Math.max(7, width * 0.012)}" opacity="${right ? 0.38 : 0.68}">${waveLines}</g>
      ${clearingMarks}
    </g>`;
  }
  return `${aopTribalWave({x: width * 0.36, y: height * 0.11, width: width * 0.28, height: height * 0.72, color: palette.accent})}
    ${aopTribalWave({x: width * 0.57, y: height * 0.19, width: width * 0.18, height: height * 0.58, color: palette.ink, opacity: 0.4})}`;
}

function aopPanelComposition({area, text, spec, palette, width, height}) {
  if (!usesRecipeAopRenderer(spec)) {
    return legacyAopPanelComposition({area, text, spec, palette, width, height});
  }

  const layout = spec.layout || 'center-monument';
  const safeX = width * 0.065;
  const safeY = height * 0.07;
  const frontX = layout === 'offset-ledger' ? width * 0.46 : layout === 'split-field' ? width * 0.42 : width * 0.5;
  const frontWidth = layout === 'split-field' ? width * 0.48 : layout === 'offset-ledger' ? width * 0.64 : width * 0.68;
  const brandLabel = spec.brandLabel || 'CODEX SUPPLY';
  const provenance = spec.provenanceLine || 'CODEX / CUT-SEW / 2026';
  const type = aopTypeSystem(spec);

  if (area === 'front') {
    if (['giant-type', 'badge-stack', 'horizon-band', 'diagonal-poster'].includes(layout)) {
      return aopExpressiveFrontComposition({
        layout,
        text,
        spec,
        palette,
        width,
        height,
        brandLabel,
        provenance,
        type,
      });
    }
    const mainTop = height * (layout === 'split-field' ? 0.31 : 0.3);
    const mainLayout = fitTextLayout({
      text: text.front,
      maxWidth: frontWidth,
      maxHeight: height * 0.17,
      fontMax: width * 0.064,
      fontMin: width * 0.026,
      maxLineLength: layout === 'split-field' ? 16 : 18,
      maxLines: 3,
      family: type.displayFamily,
    });
    const subTop = mainTop + mainLayout.height + height * 0.025;
    return `
      ${fittedTextSvg({text: text.chest, x: width * 0.34, y: height * 0.17, maxWidth: width * 0.28, maxHeight: height * 0.07, fontMax: width * 0.034, fontMin: width * 0.018, family: type.supportFamily, weight: 800, fill: palette.accent, maxLineLength: 18, maxLines: 2, role: 'front-chest'})}
      ${fittedTextSvg({text: text.mark, x: width * 0.72, y: height * 0.165, maxWidth: width * 0.14, maxHeight: height * 0.075, fontMax: width * 0.05, fontMin: width * 0.022, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 8, maxLines: 1, role: 'front-mark'})}
      ${fittedTextSvg({text: text.front, x: frontX, y: mainTop, maxWidth: frontWidth, maxHeight: height * 0.17, fontMax: width * 0.064, fontMin: width * 0.026, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: layout === 'split-field' ? 16 : 18, maxLines: 3, role: 'front-primary', layout: mainLayout})}
      ${fittedTextSvg({text: spec.front?.subline || 'CUT AND SEWN FOR RESEARCH CREWS', x: frontX, y: subTop, maxWidth: Math.min(frontWidth, width - safeX * 2), maxHeight: height * 0.055, fontMax: width * 0.024, fontMin: width * 0.014, family: type.supportFamily, weight: 700, fill: palette.ink, maxLineLength: 28, maxLines: 2, role: 'front-subline'})}
      ${layout === 'split-field' ? `<rect x="${width * 0.68}" y="${height * 0.32}" width="${width * 0.008}" height="${height * 0.3}" fill="${palette.accent}"/>` : ''}
      ${aopFooterCode({palette, width, height, provenance})}`;
  }

  if (area === 'back') {
    if (['giant-type', 'badge-stack', 'horizon-band', 'diagonal-poster'].includes(layout)) {
      return aopExpressiveBackComposition({
        layout,
        text,
        spec,
        palette,
        width,
        height,
        brandLabel,
        provenance,
        type,
      });
    }
    const mainTop = height * 0.16;
    const mainLayout = fitTextLayout({
      text: text.back,
      maxWidth: width * 0.72,
      maxHeight: height * 0.2,
      fontMax: width * 0.058,
      fontMin: width * 0.024,
      maxLineLength: 18,
      maxLines: 3,
      family: type.displayFamily,
    });
    const subTop = mainTop + mainLayout.height + Math.max(height * 0.03, mainLayout.fontSize);
    return `
      ${fittedTextSvg({text: text.back, x: width * 0.5, y: mainTop, maxWidth: width * 0.72, maxHeight: height * 0.2, fontMax: width * 0.058, fontMin: width * 0.024, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: 18, maxLines: 3, role: 'back-primary', layout: mainLayout})}
      ${fittedTextSvg({text: spec.back?.subline || 'SAN FRANCISCO / MODEL WORKSHOP', x: width * 0.5, y: subTop, maxWidth: width * 0.66, maxHeight: height * 0.06, fontMax: width * 0.026, fontMin: width * 0.014, family: type.supportFamily, weight: 800, fill: palette.accent, maxLineLength: 28, maxLines: 2, role: 'back-subline'})}
      ${aopFooterCode({palette, width, height, provenance})}`;
  }

  if (area === 'left_sleeve' || area === 'right_sleeve') {
    const sleeveText = area === 'left_sleeve' ? text.sleeveLeft : text.sleeveRight;
    const right = area === 'right_sleeve';
    const rotation = right ? 90 : -90;
    const textX = width * (right ? 0.42 : 0.58);
    const textY = height * 0.56;
    const primaryMaxWidth = height * 0.38;
    const captionMaxWidth = height * 0.32;
    const primaryLane = -width * 0.06;
    const captionLane = -width * 0.16;
    const primaryLayout = fitTextLayout({
      text: sleeveText,
      maxWidth: primaryMaxWidth,
      maxHeight: width * 0.1,
      fontMax: width * 0.075,
      fontMin: width * 0.026,
      family: type.displayFamily,
      maxLineLength: 28,
      maxLines: 1,
    });
    const caption = spec.sleeves?.caption || 'RESEARCH CREW';
    const captionLayout = fitTextLayout({
      text: caption,
      maxWidth: captionMaxWidth,
      maxHeight: width * 0.06,
      fontMax: width * 0.03,
      fontMin: width * 0.016,
      family: type.supportFamily,
      maxLineLength: 28,
      maxLines: 1,
    });
    return `
      <g transform="translate(${textX} ${textY}) rotate(${rotation})" data-aop-role="sleeve-type-${right ? 'right' : 'left'}" data-aop-text-lane="outer" data-aop-primary-lane="${primaryLane}" data-aop-caption-lane="${captionLane}">
        ${fittedTextSvg({text: sleeveText, x: 0, y: primaryLane - primaryLayout.fontSize, maxWidth: primaryMaxWidth, maxHeight: width * 0.1, fontMax: width * 0.075, fontMin: width * 0.026, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: 28, maxLines: 1, role: 'sleeve-primary', layout: primaryLayout})}
        ${fittedTextSvg({text: caption, x: 0, y: captionLane - captionLayout.fontSize, maxWidth: captionMaxWidth, maxHeight: width * 0.06, fontMax: width * 0.03, fontMin: width * 0.016, family: type.supportFamily, weight: 800, fill: palette.accent, maxLineLength: 28, maxLines: 1, role: 'sleeve-caption', layout: captionLayout})}
      </g>
      <rect x="${safeX}" y="${safeY}" width="${width - safeX * 2}" height="${height - safeY * 2}" fill="none" stroke="none" data-aop-safe-margin="true"/>`;
  }

  if (area === 'label_panel') {
    return `
      <rect x="${width * 0.23}" y="${height * 0.29}" width="${width * 0.54}" height="${height * 0.2}" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="${Math.max(8, width * 0.008)}"/>
      ${fittedTextSvg({text: brandLabel, x: width * 0.5, y: height * 0.325, maxWidth: width * 0.46, maxHeight: height * 0.055, fontMax: width * 0.042, fontMin: width * 0.018, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 28, maxLines: 1, role: 'label-brand'})}
      ${fittedTextSvg({text: spec.label?.line || text.title, x: width * 0.5, y: height * 0.405, maxWidth: width * 0.46, maxHeight: height * 0.045, fontMax: width * 0.03, fontMin: width * 0.015, family: type.displayFamily, weight: type.displayWeight, fill: palette.accent, maxLineLength: 32, maxLines: 1, role: 'label-line'})}`;
  }

  return '';
}

function aopExpressiveFrontComposition({
  layout,
  text,
  spec,
  palette,
  width,
  height,
  brandLabel,
  provenance,
  type,
}) {
  const support = spec.front?.subline || 'ORIGINAL CUT AND SEWN EDITION';
  const brand = fittedTextSvg({
    text: brandLabel,
    x: width * 0.5,
    y: height * 0.105,
    maxWidth: width * 0.72,
    maxHeight: height * 0.055,
    fontMax: width * 0.032,
    fontMin: width * 0.014,
    family: type.supportFamily,
    weight: 800,
    fill: palette.ink,
    maxLineLength: 28,
    maxLines: 1,
    role: 'front-chest',
  });
  const provenanceText = aopPlainProvenance({
    palette,
    width,
    height,
    provenance,
    family: type.supportFamily,
  });

  if (layout === 'giant-type') {
    return `<g data-aop-layout="giant-type"></g>${brand}
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.23, maxWidth: width * 0.68, maxHeight: height * 0.34, fontMax: width * 0.135, fontMin: width * 0.04, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: 11, maxLines: 3, role: 'front-primary'})}
      <rect x="${width * 0.09}" y="${height * 0.63}" width="${width * 0.82}" height="${height * 0.018}" fill="${palette.accent}"/>
      ${fittedTextSvg({text: support, x: width * 0.5, y: height * 0.675, maxWidth: width * 0.74, maxHeight: height * 0.06, fontMax: width * 0.032, fontMin: width * 0.015, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 30, maxLines: 2, role: 'front-subline'})}
      ${provenanceText}`;
  }

  if (layout === 'badge-stack') {
    return `${brand}
      <g data-aop-layout="badge-stack">
        <circle cx="${width * 0.5}" cy="${height * 0.47}" r="${width * 0.31}" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="${width * 0.026}"/>
        <circle cx="${width * 0.5}" cy="${height * 0.47}" r="${width * 0.255}" fill="none" stroke="${palette.accent}" stroke-width="${width * 0.014}"/>
      </g>
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.355, maxWidth: width * 0.46, maxHeight: height * 0.19, fontMax: width * 0.082, fontMin: width * 0.032, family: type.displayFamily, weight: type.displayWeight, fill: palette.ink, maxLineLength: 12, maxLines: 3, role: 'front-primary'})}
      ${fittedTextSvg({text: support, x: width * 0.5, y: height * 0.63, maxWidth: width * 0.58, maxHeight: height * 0.055, fontMax: width * 0.026, fontMin: width * 0.014, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 26, maxLines: 2, role: 'front-subline'})}
      ${provenanceText}`;
  }

  if (layout === 'horizon-band') {
    return `${brand}
      <g data-aop-layout="horizon-band">
        <rect x="0" y="${height * 0.34}" width="${width}" height="${height * 0.24}" fill="${palette.ink}"/>
        <rect x="0" y="${height * 0.58}" width="${width}" height="${height * 0.035}" fill="${palette.accent}"/>
      </g>
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.385, maxWidth: width * 0.86, maxHeight: height * 0.145, fontMax: width * 0.105, fontMin: width * 0.038, family: type.displayFamily, weight: type.displayWeight, fill: palette.fabric, maxLineLength: 15, maxLines: 2, role: 'front-primary'})}
      ${fittedTextSvg({text: support, x: width * 0.5, y: height * 0.67, maxWidth: width * 0.72, maxHeight: height * 0.06, fontMax: width * 0.03, fontMin: width * 0.014, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 28, maxLines: 2, role: 'front-subline'})}
      ${provenanceText}`;
  }

  return `${brand}
    <g data-aop-layout="diagonal-poster" transform="rotate(-7 ${width * 0.5} ${height * 0.47})">
      <rect x="${width * 0.11}" y="${height * 0.24}" width="${width * 0.78}" height="${height * 0.43}" fill="${palette.ink}"/>
      <rect x="${width * 0.14}" y="${height * 0.27}" width="${width * 0.72}" height="${height * 0.37}" fill="none" stroke="${palette.accent}" stroke-width="${width * 0.018}"/>
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.335, maxWidth: width * 0.62, maxHeight: height * 0.19, fontMax: width * 0.105, fontMin: width * 0.038, family: type.displayFamily, weight: type.displayWeight, fill: palette.fabric, maxLineLength: 12, maxLines: 3, role: 'front-primary'})}
      ${fittedTextSvg({text: support, x: width * 0.5, y: height * 0.565, maxWidth: width * 0.6, maxHeight: height * 0.055, fontMax: width * 0.027, fontMin: width * 0.013, family: type.supportFamily, weight: 800, fill: palette.accent, maxLineLength: 28, maxLines: 2, role: 'front-subline'})}
    </g>
    ${provenanceText}`;
}

function aopExpressiveBackComposition({
  layout,
  text,
  spec,
  palette,
  width,
  height,
  brandLabel,
  provenance,
  type,
}) {
  const support = spec.back?.subline || brandLabel;
  const alignedX = layout === 'diagonal-poster' ? width * 0.46 : width * 0.5;
  const mainY = layout === 'horizon-band' ? height * 0.5 : height * 0.2;
  const band = layout === 'horizon-band'
    ? `<rect x="0" y="${height * 0.44}" width="${width}" height="${height * 0.25}" fill="${palette.accent}" opacity="0.92" data-aop-layout="horizon-band"/>`
    : '';
  const badge = layout === 'badge-stack'
    ? `<g data-aop-layout="badge-stack"><circle cx="${width * 0.5}" cy="${height * 0.54}" r="${width * 0.27}" fill="none" stroke="${palette.ink}" stroke-width="${width * 0.024}"/><circle cx="${width * 0.5}" cy="${height * 0.54}" r="${width * 0.21}" fill="none" stroke="${palette.accent}" stroke-width="${width * 0.012}"/></g>`
    : '';
  const posterOpen = layout === 'diagonal-poster'
    ? `<g data-aop-layout="diagonal-poster" transform="rotate(7 ${width * 0.5} ${height * 0.42})"><rect x="${width * 0.09}" y="${height * 0.14}" width="${width * 0.82}" height="${height * 0.42}" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="${width * 0.024}"/>`
    : '';
  const posterClose = layout === 'diagonal-poster' ? '</g>' : '';
  const supportY = layout === 'badge-stack' ? height * 0.79 : height * 0.73;
  return `${band}${badge}${posterOpen}
    ${fittedTextSvg({text: text.back, x: alignedX, y: mainY, maxWidth: width * 0.66, maxHeight: height * 0.24, fontMax: width * (layout === 'giant-type' ? 0.12 : 0.085), fontMin: width * 0.028, family: type.displayFamily, weight: type.displayWeight, fill: layout === 'horizon-band' ? palette.ink : palette.ink, maxLineLength: 14, maxLines: 3, role: 'back-primary'})}
    ${fittedTextSvg({text: support, x: width * 0.5, y: supportY, maxWidth: width * 0.62, maxHeight: height * 0.05, fontMax: width * 0.026, fontMin: width * 0.012, family: type.supportFamily, weight: 800, fill: palette.ink, maxLineLength: 28, maxLines: 2, role: 'back-subline'})}
    ${posterClose}
    ${aopPlainProvenance({palette, width, height, provenance, family: type.supportFamily})}`;
}

function aopPlainProvenance({palette, width, height, provenance, family}) {
  return fittedTextSvg({
    text: provenance,
    x: width * 0.5,
    y: height * 0.86,
    maxWidth: width * 0.7,
    maxHeight: height * 0.04,
    fontMax: width * 0.022,
    fontMin: width * 0.01,
    family,
    weight: 800,
    fill: palette.ink,
    maxLineLength: 44,
    maxLines: 1,
    role: 'provenance',
  });
}

function aopTypeSystem(spec) {
  const systems = {
    'grotesk-poster': {
      displayFamily: 'Arial Black, Helvetica, sans-serif',
      supportFamily: 'Arial, Helvetica, sans-serif',
      displayWeight: 900,
    },
    'serif-editorial': {
      displayFamily: 'Georgia, Times New Roman, serif',
      supportFamily: 'Arial, Helvetica, sans-serif',
      displayWeight: 700,
    },
    'mono-utility': {
      displayFamily: 'Courier New, monospace',
      supportFamily: 'Courier New, monospace',
      displayWeight: 800,
    },
    'rounded-surf': {
      displayFamily: 'Arial Rounded MT Bold, Arial, sans-serif',
      supportFamily: 'Arial, Helvetica, sans-serif',
      displayWeight: 900,
    },
    'varsity-block': {
      displayFamily: 'Impact, Arial Black, sans-serif',
      supportFamily: 'Arial Narrow, Arial, sans-serif',
      displayWeight: 900,
    },
    'condensed-zine': {
      displayFamily: 'Impact, Arial Narrow, sans-serif',
      supportFamily: 'Arial Narrow, Arial, sans-serif',
      displayWeight: 900,
    },
  };
  return systems[spec.typeSystem] || systems['serif-editorial'];
}

function legacyAopPanelComposition({area, text, spec, palette, width, height}) {
  const brandLabel = spec.brandLabel || 'CODEX SUPPLY';
  const provenance = spec.provenanceLine || 'CODEX / CUT-SEW / 2026';
  if (area === 'front') {
    return `
      ${fittedTextSvg({text: text.chest, x: width * 0.27, y: height * 0.22, maxWidth: width * 0.34, maxHeight: height * 0.06, fontMax: width * 0.04, fontMin: width * 0.022, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent})}
      ${aopAbstractMark({x: width * 0.69, y: height * 0.25, size: width * 0.12, palette})}
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.35, maxWidth: width * 0.72, maxHeight: height * 0.14, fontMax: width * 0.064, fontMin: width * 0.03, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 18})}
      ${fittedTextSvg({text: spec.front?.subline || 'CUT AND SEWN FOR RESEARCH CREWS', x: width * 0.5, y: height * 0.47, maxWidth: width * 0.68, maxHeight: height * 0.05, fontMax: width * 0.026, fontMin: width * 0.015, family: 'Arial, Helvetica, sans-serif', weight: 700, fill: palette.ink, maxLineLength: 32, maxLines: 1})}
      ${aopFooterCode({palette, width, height, provenance})}`;
  }
  if (area === 'back') {
    return `
      ${fittedTextSvg({text: text.back, x: width * 0.5, y: height * 0.19, maxWidth: width * 0.68, maxHeight: height * 0.16, fontMax: width * 0.058, fontMin: width * 0.028, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 18})}
      ${fittedTextSvg({text: spec.back?.subline || 'SAN FRANCISCO / MODEL WORKSHOP', x: width * 0.5, y: height * 0.35, maxWidth: width * 0.68, maxHeight: height * 0.05, fontMax: width * 0.027, fontMin: width * 0.015, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 32, maxLines: 1})}
      ${aopTribalWave({x: width * 0.14, y: height * 0.42, width: width * 0.72, height: height * 0.14, color: palette.ink, opacity: 0.42, horizontal: true})}
      ${aopFooterCode({palette, width, height, provenance})}`;
  }
  if (area === 'left_sleeve' || area === 'right_sleeve') {
    const sleeveText = area === 'left_sleeve' ? text.sleeveLeft : text.sleeveRight;
    return `<g transform="translate(${width * 0.5} ${height * 0.53}) rotate(-90)">
      ${fittedTextSvg({text: sleeveText, x: 0, y: -width * 0.055, maxWidth: height * 0.58, maxHeight: width * 0.11, fontMax: width * 0.095, fontMin: width * 0.03, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 28, maxLines: 1})}
      ${fittedTextSvg({text: spec.sleeves?.caption || 'RESEARCH CREW', x: 0, y: width * 0.04, maxWidth: height * 0.5, maxHeight: width * 0.06, fontMax: width * 0.03, fontMin: width * 0.016, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 28, maxLines: 1})}
    </g>${aopSleeveNodeStack({palette, width, height, flip: area === 'right_sleeve'})}`;
  }
  if (area === 'label_panel') {
    return `<rect x="${width * 0.31}" y="${height * 0.28}" width="${width * 0.38}" height="${height * 0.18}" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="12"/>
      ${fittedTextSvg({text: brandLabel, x: width * 0.5, y: height * 0.32, maxWidth: width * 0.32, maxHeight: height * 0.055, fontMax: width * 0.04, fontMin: width * 0.018, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.ink, maxLineLength: 24, maxLines: 1})}
      ${fittedTextSvg({text: spec.label?.line || text.title, x: width * 0.5, y: height * 0.39, maxWidth: width * 0.32, maxHeight: height * 0.045, fontMax: width * 0.03, fontMin: width * 0.014, family: 'Georgia, serif', fill: palette.accent, maxLineLength: 28, maxLines: 1})}`;
  }
  return '';
}

function aopFooterCode({palette, width, height, provenance}) {
  const x = width * 0.27;
  const y = height * 0.82;
  const footerWidth = width * 0.46;
  const footerHeight = height * 0.065;
  return `<g opacity="0.88" data-aop-role="provenance">
    <rect x="${x}" y="${y}" width="${footerWidth}" height="${footerHeight}" fill="${palette.ink}"/>
    ${fittedTextSvg({text: provenance, x: width * 0.5, y: y + footerHeight * 0.23, maxWidth: footerWidth * 0.88, maxHeight: footerHeight * 0.55, fontMax: width * 0.021, fontMin: width * 0.01, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.fabric, maxLineLength: 44, maxLines: 1, role: 'provenance-text'})}
  </g>`;
}

function estimatedTextUnits(text, family = '') {
  const serif = /Georgia|serif/i.test(family);
  return [...String(text)].reduce((total, character) => {
    if (/\s/.test(character)) return total + 0.32;
    if (/[I1|!.,:;'`]/.test(character)) return total + 0.34;
    if (/[MW@%&]/.test(character)) return total + (serif ? 0.98 : 0.9);
    if (/[\[\](){}<>/\\\-+]/.test(character)) return total + 0.48;
    return total + (serif ? 0.61 : 0.57);
  }, 0);
}

function wrapTextForFit(text, maxLineLength, maxLines) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  if (!normalized) return [''];
  let lineLength = Math.max(1, maxLineLength);
  let lines = wrapText(normalized, lineLength);
  while (lines.length > maxLines && lineLength < normalized.length) {
    lineLength += 1;
    lines = wrapText(normalized, lineLength);
  }
  return lines;
}

export function fitTextLayout({
  text,
  maxWidth,
  maxHeight = Number.POSITIVE_INFINITY,
  fontMax,
  fontMin = 8,
  family = 'Arial, Helvetica, sans-serif',
  maxLineLength = 16,
  maxLines = 3,
  lineHeightRatio = 1.12,
}) {
  const lines = wrapTextForFit(text, maxLineLength, maxLines);
  const longestUnits = Math.max(...lines.map((line) => estimatedTextUnits(line, family)), 1);
  const widthFit = maxWidth / longestUnits;
  const heightFit = Number.isFinite(maxHeight)
    ? maxHeight / (1 + (lines.length - 1) * lineHeightRatio)
    : fontMax;
  const availableSize = Math.min(fontMax, widthFit, heightFit);
  const fontSize = availableSize < fontMin
    ? Math.max(1, availableSize)
    : Math.min(fontMax, availableSize);
  const lineHeight = fontSize * lineHeightRatio;
  const height = fontSize + (lines.length - 1) * lineHeight;
  const width = Math.max(...lines.map((line) => estimatedTextUnits(line, family) * fontSize), 0);

  return {lines, fontSize, lineHeight, width, height};
}

function fittedTextSvg({
  text,
  x,
  y,
  maxWidth,
  maxHeight = Number.POSITIVE_INFINITY,
  fontMax,
  fontMin,
  family,
  weight = 400,
  fill,
  maxLineLength = 16,
  maxLines = 3,
  lineHeightRatio = 1.12,
  role = 'fitted-text',
  layout: suppliedLayout = null,
}) {
  const layout = suppliedLayout || fitTextLayout({
    text,
    maxWidth,
    maxHeight,
    fontMax,
    fontMin,
    family,
    maxLineLength,
    maxLines,
    lineHeightRatio,
  });
  const linesMarkup = layout.lines
    .map((line, index) => {
      const lineWidth = Math.min(
        maxWidth,
        estimatedTextUnits(line, family) * layout.fontSize,
      );
      const fittedLength = line ? ` textLength="${lineWidth.toFixed(2)}" lengthAdjust="spacingAndGlyphs"` : '';
      return `<text x="${x}" y="${y + layout.fontSize + index * layout.lineHeight}" text-anchor="middle" font-family="${family}" font-size="${layout.fontSize}" font-weight="${weight}" fill="${fill}"${fittedLength}>${escapeXml(line)}</text>`;
    })
    .join('');
  return `<g data-aop-role="${escapeXml(role)}" data-fit-width="${layout.width.toFixed(2)}" data-fit-height="${layout.height.toFixed(2)}" data-fit-max-width="${maxWidth}" data-fit-max-height="${Number.isFinite(maxHeight) ? maxHeight : ''}">${linesMarkup}</g>`;
}

function aopAbstractMark({x, y, size, palette}) {
  return `<g transform="translate(${x} ${y})" fill="none" stroke="${palette.accent}" stroke-width="${size * 0.075}" stroke-linecap="round">
    <circle cx="0" cy="0" r="${size * 0.34}"/>
    <path d="M0 ${-size * 0.34}C${size * 0.34} ${-size * 0.18} ${size * 0.34} ${size * 0.18} 0 ${size * 0.34}C${-size * 0.34} ${size * 0.18} ${-size * 0.34} ${-size * 0.18} 0 ${-size * 0.34}Z"/>
    <path d="M${-size * 0.36} 0H${size * 0.36}M0 ${-size * 0.36}V${size * 0.36}"/>
  </g>`;
}

function aopTribalWave({x, y, width, height, color, opacity = 1, horizontal = false}) {
  const segments = 8;
  const points = [];
  for (let index = 0; index <= segments; index += 1) {
    const t = index / segments;
    const wobble = Math.sin(t * Math.PI * 4) * (horizontal ? height : width) * 0.22;
    const px = horizontal ? x + width * t : x + width * 0.5 + wobble;
    const py = horizontal ? y + height * 0.5 + wobble : y + height * t;
    points.push(`${px},${py}`);
  }
  return `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="${horizontal ? height * 0.24 : width * 0.2}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}"/>`;
}

function aopSleeveNodeStack({palette, width, height, flip = false}) {
  const radius = width * 0.037;
  const nodeMarks = [
    `<circle r="${radius * 0.25}" fill="${palette.accent}"/>`,
    `<path d="M0 ${-radius * 0.48}L${radius * 0.48} 0L0 ${radius * 0.48}L${-radius * 0.48} 0Z" fill="none" stroke="${palette.accent}" stroke-width="${Math.max(5, width * 0.007)}"/>`,
    `<path d="M${-radius * 0.48} 0H${radius * 0.48}M0 ${-radius * 0.48}V${radius * 0.48}" fill="none" stroke="${palette.ink}" stroke-width="${Math.max(5, width * 0.007)}"/>`,
    `<path d="M${-radius * 0.48} ${-radius * 0.28}H${radius * 0.48}M${-radius * 0.48} ${radius * 0.28}H${radius * 0.48}" fill="none" stroke="${palette.accent}" stroke-width="${Math.max(5, width * 0.007)}"/>`,
  ];
  return `<g data-aop-motif="glyph-stack" data-aop-semantic-copy="none">${nodeMarks
    .map(
      (mark, index) => {
        const x = width * ((flip ? 0.28 : 0.72) + index * (flip ? 0.05 : -0.05));
        return `
        <g transform="translate(${x} ${height * (0.14 + index * 0.055)})">
          <circle r="${radius}" fill="none" stroke="${palette.ink}" stroke-width="${Math.max(6, width * 0.008)}" opacity="0.7"/>
          ${mark}
        </g>`;
      },
    )
    .join('')}</g>`;
}

function normalizeHex(value, fallback = '#000000') {
  const raw = String(value || fallback).trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(raw)) {
    return `#${raw.split('').map((digit) => `${digit}${digit}`).join('')}`;
  }
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`;
  return fallback;
}

function hexToRgb(value) {
  const hex = normalizeHex(value).slice(1);
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  };
}

function rgbToHex({r, g, b}) {
  return `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

function mixHex(source, target, weight = 0.5) {
  const from = hexToRgb(source);
  const to = hexToRgb(target);
  return rgbToHex({
    r: from.r + (to.r - from.r) * weight,
    g: from.g + (to.g - from.g) * weight,
    b: from.b + (to.b - from.b) * weight,
  });
}

function relativeLuminance(value) {
  const {r, g, b} = hexToRgb(value);
  const convert = (channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * convert(r) + 0.7152 * convert(g) + 0.0722 * convert(b);
}

const AOP_BODY_PATH =
  'M500 338C548 395 660 424 800 424C940 424 1052 395 1100 338C1160 492 1198 684 1210 892L1233 1304C1124 1355 953 1378 800 1378C647 1378 476 1355 367 1304L390 892C402 684 440 492 500 338Z';
const AOP_LEFT_SLEEVE_PATH =
  'M491 345C404 381 291 507 238 718L144 1110C177 1164 237 1198 315 1208L455 775C468 618 482 468 491 345Z';
const AOP_RIGHT_SLEEVE_PATH =
  'M1109 345C1196 381 1309 507 1362 718L1456 1110C1423 1164 1363 1198 1285 1208L1145 775C1132 618 1118 468 1109 345Z';

function aopGarmentClipDefs(prefix) {
  return `<clipPath id="${prefix}BodyClip"><path d="${AOP_BODY_PATH}"/></clipPath>
    <clipPath id="${prefix}LeftSleeveClip"><path d="${AOP_LEFT_SLEEVE_PATH}"/></clipPath>
    <clipPath id="${prefix}RightSleeveClip"><path d="${AOP_RIGHT_SLEEVE_PATH}"/></clipPath>`;
}

function aopGarmentSurfaceLayers({product, spec, side = 'front', prefix}) {
  const palette = aopPalette(spec);
  const text = {
    title: productProduction(product).textLayer || product.title,
    front: spec.front?.primaryText || productProduction(product).textLayer || product.title,
    chest: spec.front?.chestLabel || product.title,
    mark: spec.front?.mark || 'C/DX',
    back: spec.back?.statement || spec.front?.primaryText || product.title,
    sleeveLeft: spec.sleeves?.leftText || spec.sleeves?.text || product.title,
    sleeveRight: spec.sleeves?.rightText || spec.sleeves?.text || product.title,
  };
  const surface = (area) => `${aopBasePattern({area, spec, palette, width: 1000, height: 1300})}${aopPanelComposition({area, text, spec, palette, width: 1000, height: 1300})}`;

  return `<g data-aop-surface-source="shared" data-aop-side="${side}">
    <g clip-path="url(#${prefix}BodyClip)">
      <svg x="345" y="315" width="910" height="1090" viewBox="0 0 1000 1300" preserveAspectRatio="none">${surface(side)}</svg>
    </g>
    <g clip-path="url(#${prefix}LeftSleeveClip)">
      <svg x="70" y="285" width="520" height="990" viewBox="0 0 1000 1300" preserveAspectRatio="none">${surface('left_sleeve')}</svg>
    </g>
    <g clip-path="url(#${prefix}RightSleeveClip)">
      <svg x="1010" y="285" width="520" height="990" viewBox="0 0 1000 1300" preserveAspectRatio="none">${surface('right_sleeve')}</svg>
    </g>
  </g>`;
}

export function aopCatalogMockupSvg({product, spec}) {
  const palette = aopPalette(spec);
  const production = productProduction(product);
  const luminance = relativeLuminance(palette.fabric);
  const highlight = mixHex(palette.fabric, '#ffffff', luminance > 0.32 ? 0.52 : 0.2);
  const lowlight = mixHex(palette.fabric, '#000000', luminance > 0.32 ? 0.2 : 0.38);
  const rib = mixHex(palette.fabric, luminance > 0.32 ? '#000000' : '#ffffff', 0.14);
  const seam = mixHex(palette.ink, palette.fabric, 0.28);
  const fold = luminance > 0.32 ? '#0b0f12' : '#ffffff';
  const patternOpacity = luminance > 0.32 ? 0.2 : 0.14;
  const bodyText = spec.front?.primaryText || production.textLayer || product.title;
  const chestText = spec.front?.chestLabel || product.title;
  const subline = spec.front?.subline || 'CUT AND SEWN';
  const leftSleeveText = spec.sleeves?.leftText || product.title;
  const rightSleeveText = spec.sleeves?.rightText || product.title;
  const garmentPath = `${AOP_LEFT_SLEEVE_PATH}${AOP_RIGHT_SLEEVE_PATH}${AOP_BODY_PATH}`;
  const recipeMode = usesRecipeAopRenderer(spec);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} catalog sweatshirt mockup">
  ${aopDefs(palette)}
  <defs>
    <linearGradient id="studioBackdrop" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0" stop-color="#f4f2ee"/>
      <stop offset="0.58" stop-color="#dedbd4"/>
      <stop offset="1" stop-color="#c8c5bd"/>
    </linearGradient>
    <radialGradient id="studioGlow" cx="50%" cy="34%" r="62%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.76"/>
      <stop offset="0.66" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#6f6b62" stop-opacity="0.2"/>
    </radialGradient>
    <radialGradient id="garmentVolume" cx="48%" cy="34%" r="64%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${luminance > 0.32 ? 0.36 : 0.12}"/>
      <stop offset="0.48" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${luminance > 0.32 ? 0.18 : 0.36}"/>
    </radialGradient>
    <filter id="catalogShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="34" stdDeviation="30" flood-color="#000000" flood-opacity="0.28"/>
    </filter>
    <filter id="photoGrain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.92" numOctaves="2" seed="17"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.045"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
    <filter id="fabricNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.82" numOctaves="4" seed="11"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer>
        <feFuncA type="table" tableValues="0 0.14"/>
      </feComponentTransfer>
      <feBlend in="SourceGraphic" mode="multiply"/>
    </filter>
    <linearGradient id="catalogFabric" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0" stop-color="${highlight}"/>
      <stop offset="0.42" stop-color="${palette.fabric}"/>
      <stop offset="1" stop-color="${lowlight}"/>
    </linearGradient>
    <radialGradient id="catalogChestLight" cx="48%" cy="35%" r="58%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="${luminance > 0.32 ? 0.42 : 0.12}"/>
      <stop offset="0.6" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#000000" stop-opacity="${luminance > 0.32 ? 0.1 : 0.24}"/>
    </radialGradient>
    <pattern id="ribKnit" width="18" height="18" patternUnits="userSpaceOnUse">
      <rect width="18" height="18" fill="${rib}"/>
      <path d="M3 0V18M9 0V18M15 0V18" stroke="${seam}" stroke-width="1" opacity="0.42"/>
    </pattern>
    <clipPath id="catalogGarmentClip">
      <path d="${garmentPath}"/>
    </clipPath>
    ${aopGarmentClipDefs('catalog')}
  </defs>
  <rect width="1600" height="1600" fill="url(#studioBackdrop)"/>
  <rect width="1600" height="1600" fill="url(#studioGlow)"/>
  <rect width="1600" height="1600" fill="#ffffff" opacity="0.1" filter="url(#photoGrain)"/>
  <ellipse cx="805" cy="1407" rx="470" ry="52" fill="#000000" opacity="0.2"/>
  <ellipse cx="805" cy="1378" rx="345" ry="26" fill="#ffffff" opacity="0.28"/>
  <g transform="translate(12 -18) rotate(-1.2 800 870)" filter="url(#catalogShadow)">
    <path d="${AOP_LEFT_SLEEVE_PATH}" fill="url(#catalogFabric)"/>
    <path d="${AOP_RIGHT_SLEEVE_PATH}" fill="url(#catalogFabric)"/>
    <path d="${AOP_BODY_PATH}" fill="url(#catalogFabric)"/>
    <g clip-path="url(#catalogGarmentClip)">
      <rect x="100" y="300" width="1400" height="1100" fill="url(#catalogChestLight)"/>
      ${recipeMode ? '' : `<rect x="100" y="300" width="1400" height="1100" fill="url(#${aopPatternId(spec)})" opacity="${patternOpacity}"/>`}
      <rect x="100" y="300" width="1400" height="1100" fill="${palette.fabric}" opacity="0.22" filter="url(#fabricNoise)"/>
      <rect x="100" y="300" width="1400" height="1100" fill="url(#garmentVolume)"/>
      <path d="M587 426C558 630 548 930 565 1338" fill="none" stroke="${fold}" stroke-width="10" opacity="0.12"/>
      <path d="M1013 426C1042 630 1052 930 1035 1338" fill="none" stroke="${fold}" stroke-width="10" opacity="0.12"/>
      <path d="M742 430C721 662 719 998 737 1370" fill="none" stroke="${fold}" stroke-width="6" opacity="0.1"/>
      <path d="M867 430C884 676 883 1010 864 1371" fill="none" stroke="${fold}" stroke-width="6" opacity="0.1"/>
      <path d="M636 468C712 500 895 502 968 466" fill="none" stroke="#ffffff" stroke-width="8" opacity="${luminance > 0.32 ? 0.22 : 0.08}"/>
      <path d="M606 1180C704 1212 907 1214 1002 1180" fill="none" stroke="#000000" stroke-width="10" opacity="0.06"/>
      <path d="M285 721C336 778 394 805 455 783" fill="none" stroke="${fold}" stroke-width="8" opacity="0.13"/>
      <path d="M1315 721C1264 778 1206 805 1145 783" fill="none" stroke="${fold}" stroke-width="8" opacity="0.13"/>
      <path d="M414 778C454 826 478 920 472 1036" fill="none" stroke="#000000" stroke-width="7" opacity="0.08"/>
      <path d="M1186 778C1146 826 1122 920 1128 1036" fill="none" stroke="#000000" stroke-width="7" opacity="0.08"/>
      ${recipeMode
        ? aopGarmentSurfaceLayers({product, spec, side: 'front', prefix: 'catalog'})
        : `${fittedTextSvg({text: chestText, x: 642, y: 535, maxWidth: 300, maxHeight: 55, fontMax: 30, fontMin: 20, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 14})}
          ${fittedTextSvg({text: bodyText, x: 760, y: 626, maxWidth: 420, maxHeight: 90, fontMax: 42, fontMin: 28, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 17})}
          ${fittedTextSvg({text: subline, x: 760, y: 742, maxWidth: 500, maxHeight: 38, fontMax: 24, fontMin: 15, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 32, maxLines: 1})}
          ${aopAbstractMark({x: 1010, y: 580, size: 78, palette})}
          ${aopTribalWave({x: 875, y: 982, width: 250, height: 190, color: palette.accent, opacity: 0.62})}
          <text x="286" y="845" text-anchor="middle" transform="rotate(-76 286 845)" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="${palette.accent}">${escapeXml(leftSleeveText)}</text>
          <text x="1314" y="845" text-anchor="middle" transform="rotate(76 1314 845)" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="${palette.ink}">${escapeXml(rightSleeveText)}</text>`}
    </g>
    <path d="${AOP_LEFT_SLEEVE_PATH}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
    <path d="${AOP_RIGHT_SLEEVE_PATH}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
    <path d="${AOP_BODY_PATH}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
    <path d="M500 338C548 395 660 424 800 424C940 424 1052 395 1100 338" fill="none" stroke="#ffffff" stroke-width="10" opacity="${luminance > 0.32 ? 0.28 : 0.1}"/>
    <path d="M594 313C638 388 962 388 1006 313C973 284 910 270 800 270C690 270 627 284 594 313Z" fill="url(#ribKnit)" stroke="${seam}" stroke-width="3"/>
    <path d="M638 319C684 356 916 356 962 319" fill="none" stroke="${palette.fabric}" stroke-width="30" stroke-linecap="round" opacity="0.92"/>
    <path d="M630 324C678 374 922 374 970 324" fill="none" stroke="${seam}" stroke-width="5" opacity="0.5"/>
    <path d="M150 1088C184 1148 242 1185 316 1195L300 1247C226 1237 165 1202 123 1148Z" fill="url(#ribKnit)" stroke="${seam}" stroke-width="3"/>
    <path d="M1450 1088C1416 1148 1358 1185 1284 1195L1300 1247C1374 1237 1435 1202 1477 1148Z" fill="url(#ribKnit)" stroke="${seam}" stroke-width="3"/>
    <path d="M369 1272C488 1326 650 1348 800 1348C950 1348 1112 1326 1231 1272L1237 1344C1122 1394 953 1417 800 1417C647 1417 478 1394 363 1344Z" fill="url(#ribKnit)" stroke="${seam}" stroke-width="3"/>
  </g>
</svg>`;
}

export function aopMockupSvg({product, spec, angle}) {
  const palette = aopPalette(spec);
  if (angle === 'patterns') {
    return aopPatternSheetMockup({product, spec, palette});
  }
  if (!usesRecipeAopRenderer(spec)) {
    return legacyAopMockupSvg({product, spec, angle, palette});
  }

  const isBack = angle === 'back';
  const side = isBack ? 'back' : 'front';
  const outline = mixHex(palette.ink, palette.fabric, 0.2);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} ${angle} mockup">
  ${aopDefs(palette)}
  <defs>${aopGarmentClipDefs('technical')}</defs>
  <rect width="1600" height="1200" fill="#d0d0cf"/>
  <g transform="translate(0 -130)">
    <g transform="scale(1 0.9)">
      <path d="${AOP_LEFT_SLEEVE_PATH}" fill="${palette.fabric}"/>
      <path d="${AOP_RIGHT_SLEEVE_PATH}" fill="${palette.fabric}"/>
      <path d="${AOP_BODY_PATH}" fill="${palette.fabric}"/>
      ${aopGarmentSurfaceLayers({product, spec, side, prefix: 'technical'})}
      <path d="${AOP_LEFT_SLEEVE_PATH}" fill="none" stroke="${outline}" stroke-width="7"/>
      <path d="${AOP_RIGHT_SLEEVE_PATH}" fill="none" stroke="${outline}" stroke-width="7"/>
      <path d="${AOP_BODY_PATH}" fill="none" stroke="${outline}" stroke-width="7"/>
      <path d="M500 338C548 395 660 424 800 424C940 424 1052 395 1100 338" fill="none" stroke="${outline}" stroke-width="18" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;
}

function legacyAopMockupSvg({product, spec, angle, palette}) {
  const production = productProduction(product);
  const isBack = angle === 'back';
  const bodyText = isBack
    ? spec.back?.statement || product.title
    : spec.front?.primaryText || production.textLayer || product.title;
  const bodySub = isBack
    ? spec.back?.subline || 'MODEL WORKSHOP'
    : spec.front?.subline || 'RESEARCH CREW';

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} ${angle} mockup">
  ${aopDefs(palette)}
  <rect width="1600" height="1200" fill="#c9c9c9"/>
  <g transform="translate(180 90)">
    <path d="M420 110h340l114 88 250 600-170 64-174-410v520H400V452L226 862 56 798l250-600z" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="8" stroke-linejoin="round"/>
    <path d="M420 110c36 74 304 74 340 0" fill="none" stroke="${palette.ink}" stroke-width="28" stroke-linecap="round"/>
    <path d="M400 452h380v520H400z" fill="url(#${aopPatternId(spec)})" opacity="0.7"/>
    <path d="M306 198l-250 600 170 64 174-410z" fill="url(#${aopPatternId(spec)})" opacity="0.7"/>
    <path d="M874 198l250 600-170 64-174-410z" fill="url(#${aopPatternId(spec)})" opacity="0.7"/>
    ${fittedTextSvg({text: bodyText, x: 590, y: 350, maxWidth: 510, maxHeight: 130, fontMax: 52, fontMin: 28, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 16})}
    ${fittedTextSvg({text: bodySub, x: 590, y: 510, maxWidth: 510, maxHeight: 45, fontMax: 28, fontMin: 16, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 30, maxLines: 1})}
    ${aopAbstractMark({x: 760, y: 350, size: 90, palette})}
    <text x="178" y="590" text-anchor="middle" transform="rotate(-68 178 590)" font-family="Georgia, serif" font-size="48" fill="${palette.ink}">${escapeXml(spec.sleeves?.leftText || 'RESEARCH')}</text>
    <text x="1002" y="590" text-anchor="middle" transform="rotate(68 1002 590)" font-family="Georgia, serif" font-size="48" fill="${palette.ink}">${escapeXml(spec.sleeves?.rightText || 'DEPLOYMENT')}</text>
  </g>
</svg>`;
}

function aopPatternSheetMockup({product, spec, palette}) {
  const panels = ['front', 'back', 'left_sleeve', 'right_sleeve'];
  const text = {
    title: productProduction(product).textLayer || product.title,
    front: spec.front?.primaryText || productProduction(product).textLayer || product.title,
    chest: spec.front?.chestLabel || product.title,
    mark: spec.front?.mark || 'C/DX',
    back: spec.back?.statement || spec.front?.primaryText || product.title,
    sleeveLeft: spec.sleeves?.leftText || spec.sleeves?.text || product.title,
    sleeveRight: spec.sleeves?.rightText || spec.sleeves?.text || product.title,
  };
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} AOP pattern sheet">
  ${aopDefs(palette)}
  <rect width="1600" height="1200" fill="#e6e6e6"/>
  ${panels
    .map((area, index) => {
      const x = 100 + (index % 2) * 800;
      const y = 70 + Math.floor(index / 2) * 555;
      const label = area.replace('_', ' ').toUpperCase();
      return `<g transform="translate(${x} ${y})">
        <rect width="600" height="500" rx="8" fill="#f3f3f1" stroke="#222" stroke-width="5"/>
        <svg x="124" y="18" width="352" height="430" viewBox="0 0 1000 1300" preserveAspectRatio="xMidYMid meet" overflow="hidden" data-aop-pattern-panel="${area}">
          <rect width="1000" height="1300" fill="${palette.fabric}"/>
          ${aopBasePattern({area, spec, palette, width: 1000, height: 1300})}
          ${aopPanelComposition({area, text, spec, palette, width: 1000, height: 1300})}
        </svg>
        <text x="300" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="22" font-weight="800" letter-spacing="2" fill="${palette.accent}">${escapeXml(label)}</text>
      </g>`;
    })
    .join('')}
</svg>`;
}

function printPlacementLayout({width, height, placement}) {
  const sleeve = String(placement).includes('sleeve');
  return {
    artwork: {
      width: Math.round(width * (sleeve ? 0.48 : 0.7)),
      height: Math.round(height * (sleeve ? 0.58 : 0.48)),
      top: Math.round(height * (sleeve ? 0.16 : 0.16)),
    },
    labelY: Math.round(height * (sleeve ? 0.78 : placement === 'back' ? 0.72 : 0.76)),
    textMaxWidth: sleeve ? 0.58 : 0.76,
    fontMax: sleeve ? 84 : 96,
    maxLineLength: sleeve ? 12 : 18,
  };
}

function printTextSvg({width, height, text, layout}) {
  const lines = wrapText(text, layout.maxLineLength).slice(0, 3);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const fontSize = Math.max(
    48,
    Math.min(layout.fontMax, Math.floor((width * layout.textMaxWidth) / (longest * 0.64))),
  );
  const yStart = layout.labelY;
  const color = '#ffffff';
  const lineHeight = fontSize * 1.12;
  const labelWidth = Math.min(width * 0.86, longest * fontSize * 0.68 + fontSize * 1.5);
  const labelHeight = lines.length * lineHeight + fontSize * 0.48;
  const labelX = (width - labelWidth) / 2;
  const labelY = yStart - fontSize * 0.94;

  return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <style>
      text {
        font-family: "Arial", "Helvetica", sans-serif;
        font-weight: 800;
        letter-spacing: 0;
      }
    </style>
    <rect x="${labelX}" y="${labelY}" width="${labelWidth}" height="${labelHeight}" rx="${Math.round(fontSize * 0.18)}" fill="#050505" fill-opacity="0.88" stroke="#ffffff" stroke-opacity="0.82" stroke-width="${Math.max(3, Math.round(fontSize / 24))}" />
    ${lines
      .map(
        (line, index) =>
          `<text x="${width / 2}" y="${yStart + index * lineHeight}" text-anchor="middle" font-size="${fontSize}" fill="${color}" stroke="#111111" stroke-width="${Math.max(4, Math.round(fontSize / 20))}" paint-order="stroke">${escapeXml(line)}</text>`,
      )
      .join('\n')}
  </svg>`;
}

function wrapText(text, maxLineLength) {
  const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxLineLength && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function runMockups(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const pollOnly = hasFlag(args, '--poll');
  const siteUrl = readArg(args, '--site-url', process.env.PUBLIC_SITE_URL);
  if (!dryRun && !pollOnly) assertPrintfulPublicAssetUrl(siteUrl);
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  if (!dryRun) assertProviderMutationAllowed(selected, 'Printful mockup generation');
  const payloads = selected.map((product) => {
    const base = baseForProduct(bases, product);
    const provider = providerForProduction(productProduction(product).provider);
    return {
      product,
      base,
      provider,
      payload: pollOnly
        ? null
        : buildProviderMockupTaskPayload(provider, product, base, {
            allowLocal: dryRun,
            siteUrl,
          }),
    };
  });

  if (dryRun) {
    printJson(
      payloads.map(({product, base, payload}) => ({
        slug: product.slug,
        endpoint: `POST https://api.printful.com/mockup-generator/create-task/${base.catalogProductId}`,
        payload,
      })),
    );
    return;
  }

  for (const {provider} of payloads) requireEnv(provider.requiredEnv);
  const {createPrintfulMockupTask, getPrintfulMockupTask} = await import(
    './adapters/printful.mjs'
  );

  for (const item of payloads) {
    const ref = item.product.providerRefs[item.provider.name];
    let task;
    if (pollOnly && ref.mockupTaskKey) {
      task = await getPrintfulMockupTask(ref.mockupTaskKey);
    } else {
      task = await createPrintfulMockupTask(item.base.catalogProductId, item.payload);
      ref.mockupTaskKey = task.result?.task_key;
    }

    if (task.result?.status === 'failed') {
      recordPrintfulMockupTaskFailure(ref);
      await writeProducts(products);
      throw new Error(
        `${item.product.slug}: Printful mockup task failed: ${task.result.error || 'unknown error'}`,
      );
    }

    if (task.result?.status === 'completed') {
      let savedMockups;
      try {
        savedMockups = await persistMockupsFromTask(item.product, task.result);
      } catch (error) {
        recordPrintfulMockupTaskFailure(ref);
        await writeProducts(products);
        throw error;
      }
      if (!savedMockups.length) {
        recordPrintfulMockupTaskFailure(ref);
        await writeProducts(products);
        throw new Error(
          `${item.product.slug}: completed Printful task returned no downloadable mockups`,
        );
      }
      advanceWorkflowStatus(item.product, 'mockups_ready');
    }
  }

  await writeProducts(products);
  printJson(
    selected.map((product) => ({
      slug: product.slug,
      taskKey: productProviderRef(product).mockupTaskKey,
      status: workflowStatus(product),
      mockups: product.assets.mockups,
    })),
  );
}

export function recordPrintfulMockupTaskFailure(ref) {
  if (!ref || typeof ref !== 'object') {
    throw new Error('Printful mockup failure requires a provider reference');
  }
  const failures = Number(ref.mockupTaskFailures);
  ref.lastFailedMockupTaskKey = ref.mockupTaskKey || null;
  ref.mockupTaskFailures =
    (Number.isInteger(failures) && failures >= 0 ? failures : 0) + 1;
  ref.mockupTaskKey = null;
  return ref;
}

function buildProviderMockupTaskPayload(provider, product, baseProduct, options) {
  if (provider.name === 'printful') {
    return buildPrintfulMockupTaskPayload(product, baseProduct, options);
  }

  throw new Error(`Unsupported mockup provider: ${provider.name}`);
}

async function persistMockupsFromTask(product, task) {
  const urls = [];
  for (const mockup of task.mockups || []) {
    if (mockup.mockup_url) urls.push(mockup.mockup_url);
    for (const extra of mockup.extra || []) {
      if (extra.url) urls.push(extra.url);
    }
  }

  if (!urls.length) return [];

  const catalogPath = ensureCatalogMockupFirst(product);
  const saved = [];
  for (const [index, url] of urls.entries()) {
    const extension = path.extname(new URL(url).pathname) || '.jpg';
    const outputPath = `assets/mockups/${product.slug}-printful-${index + 1}${extension}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `${product.slug}: failed to download Printful mockup ${index + 1} (${response.status})`,
      );
    }
    await mkdir(path.dirname(localPath(outputPath)), {recursive: true});
    await writeFile(localPath(outputPath), Buffer.from(await response.arrayBuffer()));
    saved.push(outputPath);
  }

  product.assets.mockups = [
    catalogPath,
    ...saved,
    ...(product.assets.mockups || [])
      .filter((mockupPath) => mockupPath !== catalogPath)
      .filter((mockupPath) => !saved.includes(mockupPath)),
  ];
  return saved;
}

async function runPhotoshoot(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const force = hasFlag(args, '--force');
  const view = readArg(args, '--view', 'front');
  const model = readArg(
    args,
    '--model',
    process.env.OPENAI_PHOTOSHOOT_MODEL || 'gpt-image-1.5',
  );
  const size = readArg(args, '--size', process.env.OPENAI_PHOTOSHOOT_SIZE || '1536x1024');
  const quality = readArg(args, '--quality', process.env.OPENAI_PHOTOSHOOT_QUALITY || 'high');
  const background = readArg(args, '--background', 'opaque');
  const outputFormat = readArg(args, '--output-format', 'png');
  const inputFidelity = readArg(
    args,
    '--input-fidelity',
    model === 'gpt-image-1' ? 'high' : null,
  );
  const maxSourceImages = Math.max(
    1,
    Math.min(16, Number(readArg(args, '--max-source-images', 4)) || 4),
  );
  const products = await readProducts();
  const bases = await readBaseProducts();
  const artDirection = await readArtDirection();
  const selected = selectProducts(products, args);
  const {
    buildImageEditRequest,
    firstImageBase64,
    generateEditedImage,
  } = await import('./adapters/openai-images.mjs');

  const jobs = selected.map((product) => {
    const base = baseForProduct(bases, product);
    const sourceImages = localPhotoshootSources(product, maxSourceImages);
    if (!sourceImages.length) {
      throw new Error(
        `${product.slug}: photoshoot requires at least one local PNG, JPG, or WebP source mockup`,
      );
    }

    const prompt = photoshootPrompt(product, base, artDirection, {
      view,
      sourceImages,
    });
    const request = buildImageEditRequest({
      prompt,
      model,
      size,
      quality,
      background,
      output_format: outputFormat,
      ...(inputFidelity ? {input_fidelity: inputFidelity} : {}),
    });
    const outputPath = customerPhotoPath(product, view, outputFormat);

    return {
      product,
      sourceImages,
      outputPath,
      request,
    };
  });

  if (dryRun) {
    printJson(
      jobs.map(({product, sourceImages, outputPath, request}) => ({
        slug: product.slug,
        endpoint: 'POST https://api.openai.com/v1/images/edits',
        sourceImages,
        outputPath,
        request,
      })),
    );
    return;
  }

  requireEnv(['OPENAI_API_KEY']);
  const results = [];
  for (const job of jobs) {
    const output = localPath(job.outputPath);
    const {skippedExisting} = await ensurePhotoshootOutput({
      outputPath: output,
      force,
      generate: async () => {
        const result = await generateEditedImage({
          ...job.request,
          images: job.sourceImages.map((sourceImage) => localPath(sourceImage)),
        });
        return Buffer.from(firstImageBase64(result), 'base64');
      },
    });

    job.product.assets.customerPhotos = [
      job.outputPath,
      ...(job.product.assets.customerPhotos || []).filter(
        (customerPhoto) => customerPhoto !== job.outputPath,
      ),
    ];
    results.push({
      slug: job.product.slug,
      customerPhoto: job.outputPath,
      skippedExisting,
    });
  }

  await writeProducts(products);
  printJson(results);
}

export async function ensurePhotoshootOutput({outputPath, force = false, generate}) {
  if (!outputPath || typeof generate !== 'function') {
    throw new Error('Photoshoot output requires a path and image generator');
  }

  const temporaryPath = `${outputPath}.tmp`;
  await unlink(temporaryPath).catch((error) => {
    if (error?.code !== 'ENOENT') throw error;
  });

  if (!force && existsSync(outputPath) && (await imageDecodes(outputPath))) {
    return {skippedExisting: true};
  }

  const image = await generate();
  if (!Buffer.isBuffer(image) || !(await imageDecodes(image))) {
    throw new Error('Photoshoot generator returned an invalid image');
  }

  await mkdir(path.dirname(outputPath), {recursive: true});
  try {
    await writeFile(temporaryPath, image, {flag: 'wx'});
    await rename(temporaryPath, outputPath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }

  return {skippedExisting: false};
}

async function imageDecodes(input) {
  try {
    const sharp = (await import('sharp')).default;
    await sharp(input).stats();
    return true;
  } catch {
    return false;
  }
}

export function verifyPrintfulReadiness(product, baseProduct, options = {}) {
  const {checkFiles = true} = options;
  const production = productProduction(product);
  const ref = productProviderRef(product, 'printful');
  const placementAreas = new Set(
    (production.placements || []).map((placement) => placement.area),
  );
  const expectedVariantIds = (baseProduct?.variants || [])
    .map((variant) => variant.providerVariantId)
    .filter((variantId) => Number.isFinite(Number(variantId)));
  const variantMappings = ref.variants || [];
  const variantIds = variantMappings.map((variant) => variant.catalogVariantId);
  const issues = [];

  if (production.provider !== 'printful') {
    issues.push(`${product.slug}: expected printful provider`);
  }

  if (!baseProduct) {
    issues.push(`${product.slug}: base product template is missing`);
  } else if (!baseProduct.techniques?.includes(production.technique)) {
    issues.push(`${product.slug}: base product does not support ${production.technique}`);
  }

  if (!ref.productId) {
    issues.push(`${product.slug}: missing providerRefs.printful.productId`);
  }

  for (const expectedVariantId of expectedVariantIds) {
    const mapping = variantMappings.find(
      (variant) => variant.catalogVariantId === expectedVariantId,
    );
    if (!mapping?.syncVariantId) {
      issues.push(`${product.slug}: missing Printful variant ID ${expectedVariantId}`);
    }
  }

  const requiredPlacements = [
    ...new Set(
      (baseProduct?.placements || [])
        .filter(
          (placement) =>
            typeof placement === 'string' ||
            !placement.techniques ||
            placement.techniques.includes(production.technique),
        )
        .map((placement) =>
          typeof placement === 'string' ? placement : placement.area,
        ),
    ),
  ];
  for (const requiredPlacement of requiredPlacements) {
    if (!placementAreas.has(requiredPlacement)) {
      issues.push(`${product.slug}: missing AOP placement ${requiredPlacement}`);
      continue;
    }

    const placement = (production.placements || []).find(
      (item) => item.area === requiredPlacement,
    );
    const printFile = (product.assets?.printFiles || []).find(
      (file) => file.placement === requiredPlacement || file.path === placement?.file,
    );
    const source = printFile?.path || placement?.file;
    if (checkFiles && source && !isRemoteUrl(source) && !existsSync(localPath(source))) {
      issues.push(`${product.slug}: missing print file ${source}`);
    }
  }

  const primaryMockup = product.assets?.mockups?.[0];
  if (!primaryMockup?.endsWith('-catalog.png')) {
    issues.push(`${product.slug}: primary customer mockup must be the catalog PNG`);
  } else if (
    checkFiles &&
    !isRemoteUrl(primaryMockup) &&
    !existsSync(localPath(primaryMockup))
  ) {
    issues.push(`${product.slug}: missing catalog mockup ${primaryMockup}`);
  }

  if (!(product.assets?.mockups || []).some(providerMockupPattern.test.bind(providerMockupPattern))) {
    issues.push(`${product.slug}: missing downloaded Printful provider mockup`);
  }

  return {
    slug: product.slug,
    ok: issues.length === 0,
    issues,
    productId: ref.productId || null,
    mockupTaskKey: ref.mockupTaskKey || null,
    variantIds,
    variantMappings: variantMappings.map((variant) => ({
      catalogVariantId: Number(variant.catalogVariantId),
      syncVariantId: Number(variant.syncVariantId),
    })),
    expectedVariantIds,
    placements: [...placementAreas],
    primaryMockup: primaryMockup || null,
    externalIds: printfulProductExternalIds(product),
  };
}

function printfulStoreAccessIssue(error) {
  const message = String(error?.message || error);
  if (message.includes('/store/products') || /Manual Order\/API/i.test(message)) {
    return [
      'Connected Printful store does not allow /store/products.',
      'Use a Manual Order/API Printful store for API creation, or sync products manually',
      'in the dashboard and record the resulting providerRefs.printful values.',
      `Raw error: ${message}`,
    ].join(' ');
  }

  return `Printful store access check failed: ${message}`;
}

function printfulProductLookupIssue(slug, error) {
  const message = String(error?.message || error);
  if (isPrintfulNotFound(error)) {
    return `${slug}: Printful store product not found for external_id ${slug}`;
  }

  return `${slug}: Printful store product lookup failed: ${message}`;
}

function isPrintfulNotFound(error) {
  const message = String(error?.message || error);
  return message.includes('(404') || /"reason"\s*:\s*"NotFound"/i.test(message);
}

function printfulStoreProductId(response) {
  const result = response?.result || {};
  const product = result.sync_product || result;
  const id = Number(product.id || product.product_id || product.sync_product_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function printfulStoreProductExternalId(response) {
  const result = response?.result || {};
  const product = result.sync_product || result;
  const externalId = product?.external_id;
  return externalId == null || externalId === '' ? null : String(externalId);
}

export function printfulStoreProductMatchesExternalId(response, expectedExternalId) {
  const actual = printfulStoreProductExternalId(response);
  return actual !== null && actual === String(expectedExternalId);
}

export function printfulStoreProductMatchesAnyExternalId(
  response,
  expectedExternalIds,
) {
  const actual = printfulStoreProductExternalId(response);
  return (
    actual !== null &&
    (expectedExternalIds || []).some(
      (expectedExternalId) => actual === String(expectedExternalId),
    )
  );
}

function printfulProductExternalIds(product) {
  return [
    ...new Set(
      [product?.slug, ...(product?.aliases || [])]
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
}

export function printfulStoreSyncVariantIds(response) {
  return printfulStoreSyncVariants(response)
    .map((variant) => variant.id || variant.sync_variant_id)
    .filter((variantId) => Number.isFinite(Number(variantId)));
}

export function printfulStoreSyncVariants(response) {
  const result = response?.result || {};
  if (Array.isArray(result.sync_variants)) return result.sync_variants;
  if (Array.isArray(result.variants)) return result.variants;
  return [];
}

export function missingPrintfulCatalogVariantIds(expectedVariantIds, response) {
  const remoteVariantIds = new Set(
    printfulStoreSyncVariants(response)
      .map((variant) => Number(variant.variant_id))
      .filter((variantId) => Number.isInteger(variantId) && variantId > 0),
  );
  return (expectedVariantIds || [])
    .map((variantId) => Number(variantId))
    .filter(
      (variantId) =>
        Number.isInteger(variantId) &&
        variantId > 0 &&
        !remoteVariantIds.has(variantId),
    );
}

export function mismatchedPrintfulSyncVariantMappings(expectedMappings, response) {
  const remoteByCatalogVariant = new Map(
    printfulStoreSyncVariants(response)
      .map((variant) => [
        Number(variant.variant_id),
        Number(variant.id || variant.sync_variant_id),
      ])
      .filter(
        ([catalogVariantId, syncVariantId]) =>
          Number.isInteger(catalogVariantId) &&
          catalogVariantId > 0 &&
          Number.isInteger(syncVariantId) &&
          syncVariantId > 0,
      ),
  );
  return (expectedMappings || []).flatMap((mapping) => {
    const catalogVariantId = Number(mapping.catalogVariantId);
    const expectedSyncVariantId = Number(mapping.syncVariantId);
    const actualSyncVariantId = remoteByCatalogVariant.get(catalogVariantId);
    if (!actualSyncVariantId || actualSyncVariantId === expectedSyncVariantId) {
      return [];
    }
    return [{catalogVariantId, expectedSyncVariantId, actualSyncVariantId}];
  });
}

export function printfulPayloadWithSyncVariantIds(payload, response) {
  const existingVariants = printfulStoreSyncVariants(response);
  if (!existingVariants.length) return payload;

  const byExternalId = new Map();
  const byProviderVariantId = new Map();
  for (const variant of existingVariants) {
    const id = variant.id || variant.sync_variant_id;
    if (!id) continue;
    if (variant.external_id) byExternalId.set(String(variant.external_id), id);
    if (variant.variant_id) byProviderVariantId.set(String(variant.variant_id), id);
  }

  return {
    ...payload,
    sync_variants: (payload.sync_variants || []).map((variant) => {
      const id =
        variant.id ||
        byExternalId.get(String(variant.external_id || '')) ||
        byProviderVariantId.get(String(variant.variant_id || ''));
      return id ? {...variant, id} : variant;
    }),
  };
}

async function runPrintfulUpsert(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const siteUrl = readArg(args, '--site-url', process.env.PUBLIC_SITE_URL);
  if (!dryRun) assertPrintfulPublicAssetUrl(siteUrl);

  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  if (!dryRun) assertProviderMutationAllowed(selected, 'Printful product synchronization');
  const jobs = selected.map((product) => {
    const base = baseForProduct(bases, product);
    const ref = product.providerRefs.printful || {};
    const payload = buildPrintfulSyncProductPayload(product, base, {
      allowLocal: dryRun,
      siteUrl,
    });

    return {
      product,
      base,
      ref,
      payload,
      endpoint: ref.productId
        ? `PUT https://api.printful.com/store/products/${ref.productId}`
        : 'POST https://api.printful.com/store/products',
    };
  });

  if (dryRun) {
    printJson(
      jobs.map(({endpoint, payload, product}) => ({
        slug: product.slug,
        endpoint,
        payload,
      })),
    );
    return;
  }

  requireEnv(['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID']);
  const {
    createPrintfulStoreProduct,
    getPrintfulStoreProduct,
    getPrintfulStoreProductByExternalId,
    listPrintfulStoreProducts,
    updatePrintfulStoreProduct,
  } = await import('./adapters/printful.mjs');
  const results = [];

  try {
    await listPrintfulStoreProducts({limit: 1});
  } catch (error) {
    throw new Error(printfulStoreAccessIssue(error));
  }

  for (const job of jobs) {
    job.product.providerRefs.printful = job.product.providerRefs.printful || {};
    const ref = job.product.providerRefs.printful;
    const externalIds = printfulProductExternalIds(job.product);
    let remoteProductId = ref.productId;
    let response;
    let remoteProductResponse;
    let mode = remoteProductId ? 'updated' : 'created';
    let staleRef = false;
    const updateRemoteProduct = async (productId, currentResponse = null) => {
      const productResponse = currentResponse || (await getPrintfulStoreProduct(productId));
      if (!printfulStoreProductMatchesAnyExternalId(productResponse, externalIds)) {
        throw new Error(
          `${job.product.slug}: refusing to update Printful product ${productId} because its external_id does not match the slug or a catalog alias`,
        );
      }
      const payload = printfulPayloadWithSyncVariantIds(job.payload, productResponse);
      return updatePrintfulStoreProduct(productId, payload);
    };

    if (remoteProductId) {
      try {
        remoteProductResponse = await getPrintfulStoreProduct(remoteProductId);
        if (
          printfulStoreProductMatchesAnyExternalId(
            remoteProductResponse,
            externalIds,
          )
        ) {
          response = await updateRemoteProduct(remoteProductId, remoteProductResponse);
        } else {
          staleRef = true;
          remoteProductId = null;
          remoteProductResponse = null;
        }
      } catch (error) {
        if (!isPrintfulNotFound(error)) throw error;
        staleRef = true;
        remoteProductId = null;
      }
    }

    if (!response && !remoteProductId) {
      for (const externalId of externalIds) {
        try {
          remoteProductResponse = await getPrintfulStoreProductByExternalId(externalId);
          if (
            !printfulStoreProductMatchesAnyExternalId(
              remoteProductResponse,
              externalIds,
            )
          ) {
            throw new Error(
              `${job.product.slug}: Printful external-id lookup returned a different product`,
            );
          }
          remoteProductId = printfulStoreProductId(remoteProductResponse);
          if (!remoteProductId) {
            throw new Error(`${job.product.slug}: Printful lookup returned no product ID`);
          }
          mode = 'relinked-and-updated';
          break;
        } catch (error) {
          if (!isPrintfulNotFound(error)) throw error;
        }
      }
    }

    if (!response) {
      if (!remoteProductId) mode = 'created';
      response = remoteProductId
        ? await updateRemoteProduct(remoteProductId, remoteProductResponse)
        : await createPrintfulStoreProduct(job.payload);
    }

    const productId = printfulStoreProductId(response) || remoteProductId;
    if (staleRef || String(ref.productId || '') !== String(productId || '')) {
      ref.mockupTaskKey = null;
      ref.mockupTaskFailures = 0;
      ref.lastFailedMockupTaskKey = null;
      ref.variants = [];
    }

    ref.productId = productId;
    let remoteVariants = printfulStoreSyncVariants(response);
    if (!remoteVariants.length && productId) {
      remoteVariants = printfulStoreSyncVariants(
        await getPrintfulStoreProduct(productId),
      );
    }
    ref.variants = job.payload.sync_variants.flatMap((variant) => {
      const remote = remoteVariants.find(
        (candidate) =>
          String(candidate.external_id || '') === String(variant.external_id) ||
          String(candidate.variant_id || '') === String(variant.variant_id),
      );
      const syncVariantId = Number(remote?.id || remote?.sync_variant_id);
      if (!Number.isInteger(syncVariantId) || syncVariantId <= 0) return [];
      return [{
        variantId: variant.external_id,
        catalogVariantId: variant.variant_id,
        syncVariantId,
        available: true,
      }];
    });

    results.push({
      slug: job.product.slug,
      mode,
      replacedStaleProductId: staleRef,
      productId,
      variants: ref.variants,
    });
  }

  await writeProducts(products);
  printJson(results);
}

async function runPrintfulVerify(args) {
  const localOnly = hasFlag(args, '--local-only');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const productReports = selected.map((product) =>
    verifyPrintfulReadiness(product, baseForProduct(bases, product)),
  );
  const report = {
    ok: false,
    mode: localOnly ? 'local-only' : 'live',
    storeIssues: [],
    products: productReports,
  };

  if (!localOnly) {
    const {
      getPrintfulStoreProductByExternalId,
      listPrintfulStoreProducts,
      requirePrintfulEnv,
    } = await import('./adapters/printful.mjs');
    let envReady = true;

    try {
      requirePrintfulEnv();
    } catch (error) {
      envReady = false;
      report.storeIssues.push(`Printful credentials missing: ${error.message}`);
    }

    if (envReady) {
      try {
        await listPrintfulStoreProducts({limit: 1});
      } catch (error) {
        report.storeIssues.push(printfulStoreAccessIssue(error));
      }

      for (const productReport of report.products) {
        try {
          let syncProduct = null;
          for (const externalId of productReport.externalIds) {
            try {
              syncProduct = await getPrintfulStoreProductByExternalId(externalId);
              break;
            } catch (error) {
              if (!isPrintfulNotFound(error)) throw error;
            }
          }
          if (!syncProduct) {
            throw new Error(
              `Printful request failed (404): no product matched ${productReport.externalIds.join(', ')}`,
            );
          }
          const result = syncProduct.result || {};
          const remoteProduct = result.sync_product || result;
          const remoteProductId =
            remoteProduct.id || remoteProduct.product_id || remoteProduct.sync_product_id;
          const missingVariantIds = missingPrintfulCatalogVariantIds(
            productReport.expectedVariantIds,
            syncProduct,
          );
          const mismatchedVariantMappings = mismatchedPrintfulSyncVariantMappings(
            productReport.variantMappings,
            syncProduct,
          );

          productReport.liveProductId = remoteProductId || null;
          if (!remoteProductId) {
            productReport.issues.push(
              `${productReport.slug}: live Printful response is missing a product ID`,
            );
          }
          if (
            productReport.productId &&
            remoteProductId &&
            String(remoteProductId) !== String(productReport.productId)
          ) {
            productReport.issues.push(
              `${productReport.slug}: Printful product ID mismatch, local ${productReport.productId}, live ${remoteProductId}`,
            );
          }

          for (const expectedVariantId of missingVariantIds) {
            productReport.issues.push(
              `${productReport.slug}: live Printful product missing variant ${expectedVariantId}`,
            );
          }
          for (const mismatch of mismatchedVariantMappings) {
            productReport.issues.push(
              `${productReport.slug}: Printful sync variant mismatch for catalog variant ${mismatch.catalogVariantId}; local ${mismatch.expectedSyncVariantId}, live ${mismatch.actualSyncVariantId}`,
            );
          }
        } catch (error) {
          productReport.issues.push(printfulProductLookupIssue(productReport.slug, error));
        }

        productReport.ok = productReport.issues.length === 0;
      }
    }
  }

  report.ok =
    report.storeIssues.length === 0 &&
    report.products.every((productReport) => productReport.issues.length === 0);

  printJson(report);
  if (!report.ok) {
    throw new Error('Printful readiness verification failed');
  }
}

async function runPrintfulOrderDryRun(args) {
  return runFulfillmentOrderDryRun(['--provider', 'printful', ...args]);
}

async function runFulfillmentOrderDryRun(args) {
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const providerName = readArg(args, '--provider', 'printful');
  printJson(
    selected.map((product) => {
      const provider = providerForProduction(productProduction(product).provider);
      if (provider.name !== providerName) {
        throw new Error(`${product.slug}: expected ${providerName} provider, found ${provider.name}`);
      }
      const base = baseForProduct(bases, product);
      const ref = productProviderRef(product, provider.name);
      const firstMapping = ref.variants?.[0];
      const fallbackVariant = base?.variants?.[0] || {
        color: 'Default',
        size: 'OS',
        providerVariantId: firstMapping?.catalogVariantId,
      };
      const variant =
        product.commerce?.variants?.[0] ||
        commerceVariantForBaseVariant(product.slug, fallbackVariant);

      return {
        slug: product.slug,
        endpoint: 'POST https://api.printful.com/orders',
        confirm: false,
        retailCurrency: product.commerce.currency,
        payload: {
          external_id: printfulDryRunExternalId(product.slug),
          recipient: {
            name: 'Dry Run Customer',
            address1: 'Avenue Virgile-Rossel 18',
            city: 'Lausanne',
            state_code: 'VD',
            country_code: 'CH',
            zip: '1012',
            email: 'dry-run@example.com',
          },
          items: [
            {
              sync_variant_id:
                ref.variants?.find((mapping) => mapping.variantId === variant.id)
                  ?.syncVariantId || null,
              quantity: 1,
              retail_price: moneyFromMinorUnits(product.commerce.unitAmount),
            },
          ],
        },
      };
    }),
  );
}

async function runPublish(args) {
  const approve = hasFlag(args, '--approve');
  const approvedBy = readArg(args, '--by', 'codex');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  assertPilotPublicationAllowed(selected);
  assertProviderMutationAllowed(selected, 'Catalog publication');

  for (const product of selected) {
    if (approve) {
      product.approval = {
        ...(product.approval || {}),
        approvedAt: new Date().toISOString(),
        approvedBy,
      };
      setWorkflowStatus(product, 'approved');
    }

    if (!product.approval?.approvedAt && workflowStatus(product) !== 'approved') {
      throw new Error(`${product.slug}: publish requires approval`);
    }

    if (!product.signals?.sources?.length) {
      throw new Error(`${product.slug}: publish requires at least one research source`);
    }

    if (!product.meme?.rightsNote || product.meme.rightsNote.length < 20) {
      throw new Error(`${product.slug}: publish requires a specific rights review note`);
    }

    const production = productProduction(product);
    if (production.provider === 'printful') {
      const readiness = verifyPrintfulReadiness(product, baseForProduct(bases, product));
      if (!readiness.ok) {
        throw new Error(
          `${product.slug}: publish requires Printful readiness: ${readiness.issues.join('; ')}`,
        );
      }

      if (production.technique === 'All-Over Cotton') {
        const photoshootReadiness = verifyPhotoshootReadiness(product);
        if (!photoshootReadiness.ok) {
          throw new Error(
            `${product.slug}: publish requires photoshooter image: ${photoshootReadiness.issues.join('; ')}`,
          );
        }
      }
    }
  }

  if (hasFlag(args, '--dry-run')) {
    printJson(
      selected.map((product) => ({
        slug: product.slug,
        approvedAt: product.approval?.approvedAt,
        nextStatus: 'published',
      })),
    );
    return;
  }

  for (const product of selected) {
    setWorkflowStatus(product, 'published');
  }

  await writeProducts(products);
  printJson(
    selected.map((product) => ({
      slug: product.slug,
      status: workflowStatus(product),
    })),
  );
}

async function main() {
  loadLocalEnv();
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case 'new':
      await runNew(args);
      break;
    case 'validate':
      await runValidate();
      break;
    case 'signals:x':
    case 'research:x':
      await runResearchX(args);
      break;
    case 'signals':
      await runSignals(args);
      break;
    case 'art-director:review':
      await runGenerateArtwork([...args, '--dry-run']);
      break;
    case 'generate-artwork':
      await runGenerateArtwork(args);
      break;
    case 'compose-print-file':
    case 'compose-print-files':
      await runComposePrintFiles(args);
      break;
    case 'catalog-mockups':
      await runCatalogMockups(args);
      break;
    case 'mockups':
      await runMockups(args);
      break;
    case 'photoshoot':
      await runPhotoshoot(args);
      break;
    case 'printful:verify':
    case 'fulfillment:verify':
      await runPrintfulVerify(args);
      break;
    case 'printful:upsert':
      await runPrintfulUpsert(args);
      break;
    case 'printful:order:dry-run':
      await runPrintfulOrderDryRun(args);
      break;
    case 'fulfillment:order:dry-run':
      await runFulfillmentOrderDryRun(args);
      break;
    case 'publish':
      await runPublish(args);
      break;
    case 'compose-print-file-plan':
      await runComposePlan(args);
      break;
    default:
      throw new Error(
        'Usage: node scripts/merch.mjs <new|validate|signals|signals:x|art-director:review|generate-artwork|compose-print-files|catalog-mockups|mockups|photoshoot|fulfillment:verify|printful:verify|printful:upsert|fulfillment:order:dry-run|printful:order:dry-run|publish>',
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
