#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  artDirectionPrompt as isolatedArtDirectionPrompt,
  artDirectorReview as isolatedArtDirectorReview,
} from './services/art-director.mjs';
import {
  productionProviders,
  providerForProduction,
} from './services/production-providers.mjs';

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

export const allowedTechniques = new Set([
  'DTG',
  'DTFlex',
  'Embroidery',
  'Sublimation',
  'All-Over Cotton',
  'All-Over Synthetic',
  'Knitting',
]);

export async function readProducts() {
  return JSON.parse(await readFile(productsPath, 'utf8'));
}

export async function writeProducts(products) {
  await writeFile(productsPath, `${JSON.stringify(products, null, 2)}\n`);
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
  return product?.workflow?.status || product?.status || 'draft';
}

export function setWorkflowStatus(product, status) {
  if (!workflowStatuses.includes(status)) {
    throw new Error(`Unsupported workflow status: ${status}`);
  }

  product.status = status;
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
      'status',
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

    if (!product?.commerce?.price || !product?.commerce?.currency) {
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
      retail_price: product.commerce.price,
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
  return (ref.variantIds || []).map((providerVariantId) => ({
    id: `${product.slug}:${providerVariantId}`,
    sku: `${product.slug}-${providerVariantId}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    providerVariantId,
  }));
}

function publicAssetUrl(file, siteUrl) {
  if (!file || isRemoteUrl(file)) return file;
  return new URL(`/${String(file).replace(/^\/+/, '')}`, siteUrl).toString();
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
  return String(value)
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
    '--site-url',
    '--by',
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
    status: 'draft',
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
      price: '88.00',
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
        variantIds: baseProduct.variants.map((variant) => variant.providerVariantId),
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
    status: 'draft',
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
      price: '42.00',
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
        variantIds: [],
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
  const errors = validateProducts(products);
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
    if (workflowStatus(product) === 'draft') setWorkflowStatus(product, 'generated');
  }

  await writeProducts(products);
  printJson(plans.map(({product}) => ({slug: product.slug, printFiles: product.assets.printFiles})));
}

async function composeProductPrintFiles(product, baseProduct) {
  const production = productProduction(product);
  if (production.technique === 'All-Over Cotton') {
    return composeAopCottonProductFiles(product, baseProduct);
  }

  const sharp = (await import('sharp')).default;
  const dimensions = baseProduct?.printfile || {width: 1800, height: 2400};
  const text = production.textLayer || product.title;
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

function aopPanelSvg({product, spec, area, width, height}) {
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
  ${aopBasePattern({area, spec, palette, width, height})}
  ${aopPanelComposition({area, text, spec, palette, width, height})}
</svg>`;
}

function aopInsideLabelSvg({product, spec, width, height}) {
  const palette = aopPalette(spec);
  const production = productProduction(product);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} inside label">
  <rect width="${width}" height="${height}" fill="${palette.fabric}"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="${palette.ink}" stroke-width="3"/>
  <text x="${width / 2}" y="54" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="${palette.ink}">CODEX SUPPLY</text>
  <text x="${width / 2}" y="91" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${palette.ink}">${escapeXml(spec.label?.line || production.textLayer || product.title)}</text>
  <text x="${width / 2}" y="124" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="14" fill="${palette.ink}">95% COTTON / 5% ELASTANE / MADE ON DEMAND</text>
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
      <path d="M-40 270C80 210 160 315 300 240C390 192 420 218 520 166" fill="none" stroke="${palette.ink}" stroke-width="5" opacity="0.22"/>
      <path d="M-20 90C90 34 174 122 286 78C360 48 414 54 472 18" fill="none" stroke="${palette.muted}" stroke-width="4" opacity="0.28"/>
      <circle cx="288" cy="92" r="28" fill="none" stroke="${palette.accent}" stroke-width="5" opacity="0.72"/>
    </pattern>
  </defs>`;
}

function aopPatternId(spec) {
  if (spec.basePattern === 'pinstripe') return 'pinstripe';
  if (spec.basePattern === 'status-isobar-map' || spec.basePattern === 'queue-radar') {
    return 'statusmap';
  }
  return 'microgrid';
}

function aopBasePattern({area, spec, palette, width, height}) {
  const pattern = aopPatternId(spec);
  const bg = `<rect width="${width}" height="${height}" fill="url(#${pattern})" opacity="${pattern === 'pinstripe' ? 0.65 : 0.85}"/>`;
  const statusOverlay =
    pattern === 'statusmap'
      ? `<g opacity="0.62">
          <path d="M${width * 0.08} ${height * 0.22}C${width * 0.22} ${height * 0.08} ${width * 0.42} ${height * 0.34} ${width * 0.62} ${height * 0.2}C${width * 0.78} ${height * 0.09} ${width * 0.88} ${height * 0.2} ${width * 0.96} ${height * 0.13}" fill="none" stroke="${palette.ink}" stroke-width="${width * 0.006}"/>
          <path d="M${width * 0.04} ${height * 0.64}C${width * 0.2} ${height * 0.52} ${width * 0.34} ${height * 0.76} ${width * 0.5} ${height * 0.62}C${width * 0.66} ${height * 0.48} ${width * 0.76} ${height * 0.68} ${width * 0.95} ${height * 0.55}" fill="none" stroke="${palette.muted}" stroke-width="${width * 0.005}"/>
          <g transform="translate(${width * 0.78} ${height * 0.23})" fill="none" stroke="${palette.accent}" stroke-width="${width * 0.006}">
            <circle r="${width * 0.055}"/>
            <circle r="${width * 0.085}" opacity="0.42"/>
            <path d="M${-width * 0.09} 0H${width * 0.09}M0 ${-width * 0.09}V${width * 0.09}"/>
          </g>
        </g>`
      : '';
  const sleeve =
    area.includes('sleeve')
      ? `${aopTribalWave({x: width * 0.36, y: height * 0.11, width: width * 0.28, height: height * 0.72, color: palette.accent})}
         ${aopTribalWave({x: width * 0.57, y: height * 0.19, width: width * 0.18, height: height * 0.58, color: palette.ink, opacity: 0.4})}`
      : '';
  return `${bg}${statusOverlay}${sleeve}`;
}

function aopPanelComposition({area, text, spec, palette, width, height}) {
  if (area === 'front') {
    return `
      ${fittedTextSvg({text: text.chest, x: width * 0.27, y: height * 0.24, maxWidth: width * 0.34, fontMax: width * 0.04, fontMin: width * 0.022, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent})}
      ${aopAbstractMark({x: width * 0.69, y: height * 0.25, size: width * 0.12, palette})}
      ${fittedTextSvg({text: text.front, x: width * 0.5, y: height * 0.38, maxWidth: width * 0.72, fontMax: width * 0.064, fontMin: width * 0.036, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 18})}
      <text x="${width * 0.5}" y="${height * 0.45}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.026}" font-weight="700" letter-spacing="0" fill="${palette.ink}" opacity="0.74">${escapeXml(spec.front?.subline || 'CUT AND SEWN FOR RESEARCH CREWS')}</text>
      ${aopFooterCode({palette, width, height})}`;
  }

  if (area === 'back') {
    return `
      ${fittedTextSvg({text: text.back, x: width * 0.5, y: height * 0.22, maxWidth: width * 0.68, fontMax: width * 0.058, fontMin: width * 0.032, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 18})}
      <text x="${width * 0.5}" y="${height * 0.31}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.027}" font-weight="800" fill="${palette.accent}">${escapeXml(spec.back?.subline || 'SAN FRANCISCO / MODEL WORKSHOP')}</text>
      ${aopTribalWave({x: width * 0.14, y: height * 0.42, width: width * 0.72, height: height * 0.14, color: palette.ink, opacity: 0.42, horizontal: true})}
      ${aopFooterCode({palette, width, height})}`;
  }

  if (area === 'left_sleeve' || area === 'right_sleeve') {
    const sleeveText = area === 'left_sleeve' ? text.sleeveLeft : text.sleeveRight;
    return `
      <g transform="translate(${width * 0.5} ${height * 0.53}) rotate(-90)">
        <text x="0" y="0" text-anchor="middle" font-family="Georgia, serif" font-size="${width * 0.11}" fill="${palette.ink}">${escapeXml(sleeveText)}</text>
        <text x="0" y="${width * 0.08}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.032}" font-weight="800" fill="${palette.accent}">${escapeXml(spec.sleeves?.caption || 'RESEARCH CREW')}</text>
      </g>
      ${aopSleeveGlyphStack({palette, width, height, flip: area === 'right_sleeve'})}`;
  }

  if (area === 'label_panel') {
    return `
      <rect x="${width * 0.31}" y="${height * 0.28}" width="${width * 0.38}" height="${height * 0.18}" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="12"/>
      <text x="${width * 0.5}" y="${height * 0.35}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.05}" font-weight="800" fill="${palette.ink}">CODEX SUPPLY</text>
      <text x="${width * 0.5}" y="${height * 0.405}" text-anchor="middle" font-family="Georgia, serif" font-size="${width * 0.035}" fill="${palette.accent}">${escapeXml(spec.label?.line || text.title)}</text>`;
  }

  return '';
}

function aopFooterCode({palette, width, height}) {
  return `<g opacity="0.8">
    <rect x="${width * 0.33}" y="${height * 0.79}" width="${width * 0.34}" height="${height * 0.052}" fill="${palette.ink}"/>
    <text x="${width * 0.5}" y="${height * 0.824}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.024}" font-weight="800" fill="${palette.fabric}">CODEX / CUT-SEW / ${new Date().getFullYear()}</text>
  </g>`;
}

function fittedTextSvg({
  text,
  x,
  y,
  maxWidth,
  fontMax,
  fontMin,
  family,
  weight = 400,
  fill,
  maxLineLength = 16,
}) {
  const lines = wrapText(text, maxLineLength).slice(0, 3);
  const longest = Math.max(...lines.map((line) => line.length), 1);
  const fontSize = Math.max(
    fontMin,
    Math.min(fontMax, Math.floor(maxWidth / (longest * 0.58))),
  );
  const lineHeight = fontSize * 1.08;

  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" text-anchor="middle" font-family="${family}" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`,
    )
    .join('');
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

function aopSleeveGlyphStack({palette, width, height, flip = false}) {
  const x = flip ? width * 0.25 : width * 0.75;
  const glyphs = ['<>', 'CMD', '01', '++', 'C'];
  return glyphs
    .map(
      (glyph, index) => `
        <g transform="translate(${x} ${height * (0.22 + index * 0.1)})">
          <circle r="${width * 0.045}" fill="none" stroke="${palette.ink}" stroke-width="8" opacity="0.7"/>
          <text y="${width * 0.017}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${width * 0.04}" font-weight="800" fill="${index % 2 ? palette.ink : palette.accent}">${escapeXml(glyph)}</text>
        </g>`,
    )
    .join('');
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

function aopCatalogMockupSvg({product, spec}) {
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
  const bodyPath =
    'M500 338C548 395 660 424 800 424C940 424 1052 395 1100 338C1160 492 1198 684 1210 892L1233 1304C1124 1355 953 1378 800 1378C647 1378 476 1355 367 1304L390 892C402 684 440 492 500 338Z';
  const leftSleevePath =
    'M491 345C404 381 291 507 238 718L144 1110C177 1164 237 1198 315 1208L455 775C468 618 482 468 491 345Z';
  const rightSleevePath =
    'M1109 345C1196 381 1309 507 1362 718L1456 1110C1423 1164 1363 1198 1285 1208L1145 775C1132 618 1118 468 1109 345Z';
  const garmentPath = `${leftSleevePath}${rightSleevePath}${bodyPath}`;

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
  </defs>
  <rect width="1600" height="1600" fill="url(#studioBackdrop)"/>
  <rect width="1600" height="1600" fill="url(#studioGlow)"/>
  <rect width="1600" height="1600" fill="#ffffff" opacity="0.1" filter="url(#photoGrain)"/>
  <ellipse cx="805" cy="1407" rx="470" ry="52" fill="#000000" opacity="0.2"/>
  <ellipse cx="805" cy="1378" rx="345" ry="26" fill="#ffffff" opacity="0.28"/>
  <g transform="translate(12 -18) rotate(-1.2 800 870)" filter="url(#catalogShadow)">
    <path d="${leftSleevePath}" fill="url(#catalogFabric)"/>
    <path d="${rightSleevePath}" fill="url(#catalogFabric)"/>
    <path d="${bodyPath}" fill="url(#catalogFabric)"/>
    <g clip-path="url(#catalogGarmentClip)">
      <rect x="100" y="300" width="1400" height="1100" fill="url(#catalogChestLight)"/>
      <rect x="100" y="300" width="1400" height="1100" fill="url(#${aopPatternId(spec)})" opacity="${patternOpacity}"/>
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
      ${fittedTextSvg({text: chestText, x: 642, y: 565, maxWidth: 300, fontMax: 30, fontMin: 20, family: 'Arial, Helvetica, sans-serif', weight: 800, fill: palette.accent, maxLineLength: 14})}
      ${fittedTextSvg({text: bodyText, x: 760, y: 668, maxWidth: 420, fontMax: 42, fontMin: 28, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 17})}
      <text x="760" y="770" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" letter-spacing="0" fill="${palette.accent}">${escapeXml(subline)}</text>
      ${aopAbstractMark({x: 1010, y: 580, size: 78, palette})}
      ${aopTribalWave({x: 875, y: 982, width: 250, height: 190, color: palette.accent, opacity: 0.62})}
      <text x="286" y="845" text-anchor="middle" transform="rotate(-76 286 845)" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="800" fill="${palette.accent}">${escapeXml(leftSleeveText)}</text>
      <text x="1314" y="845" text-anchor="middle" transform="rotate(76 1314 845)" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="${palette.ink}">${escapeXml(rightSleeveText)}</text>
    </g>
    <path d="${leftSleevePath}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
    <path d="${rightSleevePath}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
    <path d="${bodyPath}" fill="none" stroke="${seam}" stroke-width="4" opacity="0.44"/>
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

function aopMockupSvg({product, spec, angle}) {
  const palette = aopPalette(spec);
  const production = productProduction(product);
  if (angle === 'patterns') {
    return aopPatternSheetMockup({product, spec, palette});
  }

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
    ${fittedTextSvg({text: bodyText, x: 590, y: 400, maxWidth: 510, fontMax: 52, fontMin: 32, family: 'Georgia, serif', fill: palette.ink, maxLineLength: 16})}
    <text x="590" y="520" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="${palette.accent}">${escapeXml(bodySub)}</text>
    ${aopAbstractMark({x: 760, y: 350, size: 90, palette})}
    <text x="178" y="590" text-anchor="middle" transform="rotate(-68 178 590)" font-family="Georgia, serif" font-size="48" fill="${palette.ink}">${escapeXml(spec.sleeves?.leftText || 'RESEARCH')}</text>
    <text x="1002" y="590" text-anchor="middle" transform="rotate(68 1002 590)" font-family="Georgia, serif" font-size="48" fill="${palette.ink}">${escapeXml(spec.sleeves?.rightText || 'DEPLOYMENT')}</text>
  </g>
</svg>`;
}

function aopPatternSheetMockup({product, spec, palette}) {
  const panels = [
    ['front', spec.front?.primaryText || product.title],
    ['back', spec.back?.statement || product.title],
    ['left sleeve', spec.sleeves?.leftText || 'LEFT'],
    ['right sleeve', spec.sleeves?.rightText || 'RIGHT'],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1200" viewBox="0 0 1600 1200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} AOP pattern sheet">
  ${aopDefs(palette)}
  <rect width="1600" height="1200" fill="#e6e6e6"/>
  ${panels
    .map((panel, index) => {
      const x = 120 + (index % 2) * 700;
      const y = 110 + Math.floor(index / 2) * 500;
      return `<g transform="translate(${x} ${y})">
        <rect width="560" height="390" fill="${palette.fabric}" stroke="#222" stroke-width="5"/>
        <rect width="560" height="390" fill="url(#${aopPatternId(spec)})" opacity="0.62"/>
        <text x="280" y="188" text-anchor="middle" font-family="Georgia, serif" font-size="46" fill="${palette.ink}">${escapeXml(panel[1])}</text>
        <text x="280" y="342" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="${palette.accent}">${escapeXml(panel[0].toUpperCase())}</text>
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
      throw new Error(
        `${item.product.slug}: Printful mockup task failed: ${task.result.error || 'unknown error'}`,
      );
    }

    if (task.result?.status === 'completed') {
      await persistMockupsFromTask(item.product, task.result);
      setWorkflowStatus(item.product, 'mockups_ready');
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

function buildProviderMockupTaskPayload(provider, product, baseProduct, options) {
  if (provider.name === 'printful') {
    return buildPrintfulMockupTaskPayload(product, baseProduct, options);
  }

  throw new Error(`Unsupported mockup provider: ${provider.name}`);
}

async function persistMockupsFromTask(product, task) {
  const urls = [];
  for (const mockup of task.mockups || []) {
    for (const extra of mockup.extra || []) {
      if (extra.url) urls.push(extra.url);
    }
  }

  if (!urls.length) return;

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
  const variantIds = ref.variantIds || [];
  const issues = [];

  if (production.provider !== 'printful') {
    issues.push(`${product.slug}: expected printful provider`);
  }

  if (production.technique !== 'All-Over Cotton') {
    issues.push(`${product.slug}: expected All-Over Cotton technique`);
  }

  if (production.baseProduct !== 'printful-aop-cotton-sweatshirt-white') {
    issues.push(`${product.slug}: expected Printful AOP cotton sweatshirt base product`);
  }

  if (!baseProduct) {
    issues.push(`${product.slug}: base product template is missing`);
  }

  if (!ref.productId) {
    issues.push(`${product.slug}: missing providerRefs.printful.productId`);
  }

  for (const expectedVariantId of expectedVariantIds) {
    if (!variantIds.includes(expectedVariantId)) {
      issues.push(`${product.slug}: missing Printful variant ID ${expectedVariantId}`);
    }
  }

  for (const requiredPlacement of AOP_COTTON_REQUIRED_PLACEMENTS) {
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

  if (!ref.mockupTaskKey && !(product.assets?.mockups || []).some(isRemoteUrl)) {
    issues.push(`${product.slug}: missing Printful mockup task key or verified mockup URLs`);
  }

  return {
    slug: product.slug,
    ok: issues.length === 0,
    issues,
    productId: ref.productId || null,
    mockupTaskKey: ref.mockupTaskKey || null,
    variantIds,
    expectedVariantIds,
    placements: [...placementAreas],
    primaryMockup: primaryMockup || null,
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
  return product.id || product.product_id || product.sync_product_id || null;
}

function printfulStoreSyncVariantIds(response) {
  const variants = response?.result?.sync_variants || response?.result?.variants || [];
  return variants
    .map((variant) => variant.id || variant.sync_variant_id)
    .filter((variantId) => Number.isFinite(Number(variantId)));
}

async function runPrintfulUpsert(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const siteUrl = readArg(args, '--site-url', process.env.PUBLIC_SITE_URL);
  if (!dryRun) assertPrintfulPublicAssetUrl(siteUrl);

  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
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
    let remoteProductId = ref.productId;
    let response;
    let mode = remoteProductId ? 'updated' : 'created';
    let staleRef = false;

    if (remoteProductId) {
      try {
        response = await updatePrintfulStoreProduct(remoteProductId, job.payload);
      } catch (error) {
        if (!isPrintfulNotFound(error)) throw error;
        staleRef = true;
        remoteProductId = null;
      }
    }

    if (!response && !remoteProductId) {
      try {
        remoteProductId = printfulStoreProductId(
          await getPrintfulStoreProductByExternalId(job.product.slug),
        );
        mode = 'relinked-and-updated';
      } catch (error) {
        if (!isPrintfulNotFound(error)) throw error;
      }
    }

    if (!response) {
      if (!remoteProductId) mode = 'created';
      response = remoteProductId
        ? await updatePrintfulStoreProduct(remoteProductId, job.payload)
        : await createPrintfulStoreProduct(job.payload);
    }

    const productId = printfulStoreProductId(response) || remoteProductId;
    if (staleRef || String(ref.productId || '') !== String(productId || '')) {
      ref.mockupTaskKey = null;
      delete ref.syncVariantIds;
    }

    ref.productId = productId;
    ref.variantIds = job.payload.sync_variants.map((variant) => variant.variant_id);
    const syncVariantIds = printfulStoreSyncVariantIds(response);
    if (syncVariantIds.length) ref.syncVariantIds = syncVariantIds;

    results.push({
      slug: job.product.slug,
      mode,
      replacedStaleProductId: staleRef,
      productId,
      variantIds: ref.variantIds,
      syncVariantIds: ref.syncVariantIds || [],
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
          const syncProduct = await getPrintfulStoreProductByExternalId(productReport.slug);
          const result = syncProduct.result || {};
          const remoteProduct = result.sync_product || result;
          const remoteProductId =
            remoteProduct.id || remoteProduct.product_id || remoteProduct.sync_product_id;
          const remoteVariants = result.sync_variants || [];
          const remoteVariantIds = new Set(
            remoteVariants
              .map((variant) => variant.variant_id)
              .filter((variantId) => Number.isFinite(Number(variantId))),
          );

          productReport.liveProductId = remoteProductId || null;
          if (
            productReport.productId &&
            remoteProductId &&
            String(remoteProductId) !== String(productReport.productId)
          ) {
            productReport.issues.push(
              `${productReport.slug}: Printful product ID mismatch, local ${productReport.productId}, live ${remoteProductId}`,
            );
          }

          if (remoteVariants.length) {
            for (const expectedVariantId of productReport.expectedVariantIds) {
              if (!remoteVariantIds.has(expectedVariantId)) {
                productReport.issues.push(
                  `${productReport.slug}: live Printful product missing variant ${expectedVariantId}`,
                );
              }
            }
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
  const siteUrl = readArg(args, '--site-url', process.env.PUBLIC_SITE_URL || 'https://example.com');

  printJson(
    selected.map((product) => {
      const provider = providerForProduction(productProduction(product).provider);
      if (provider.name !== providerName) {
        throw new Error(`${product.slug}: expected ${providerName} provider, found ${provider.name}`);
      }
      const base = baseForProduct(bases, product);
      const ref = productProviderRef(product, provider.name);
      const fallbackVariant = base?.variants?.[0] || {
        color: 'Default',
        size: 'OS',
        providerVariantId: ref.variantIds?.[0],
      };
      const variant =
        product.commerce?.variants?.[0] ||
        commerceVariantForBaseVariant(product.slug, fallbackVariant);

      return {
        slug: product.slug,
        endpoint: 'POST https://api.printful.com/orders',
        payload: {
          external_id: `dry-run-${product.slug}`,
          confirm: false,
          recipient: {
            name: 'Dry Run Customer',
            address1: '123 Test St',
            city: 'San Francisco',
            state_code: 'CA',
            country_code: 'US',
            zip: '94107',
            email: 'dry-run@example.com',
          },
          items: [
            {
              variant_id: variant.providerVariantId,
              quantity: 1,
              retail_price: product.commerce.price,
              files: printfulOrderFiles(product, {baseProduct: base, siteUrl}),
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

    const production = productProduction(product);
    if (production.provider === 'printful' && production.technique === 'All-Over Cotton') {
      const readiness = verifyPrintfulReadiness(product, baseForProduct(bases, product));
      if (!readiness.ok) {
        throw new Error(
          `${product.slug}: publish requires Printful readiness: ${readiness.issues.join('; ')}`,
        );
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
        'Usage: node scripts/merch.mjs <new|validate|signals|signals:x|art-director:review|generate-artwork|compose-print-files|catalog-mockups|mockups|fulfillment:verify|printful:verify|printful:upsert|fulfillment:order:dry-run|printful:order:dry-run|publish>',
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
