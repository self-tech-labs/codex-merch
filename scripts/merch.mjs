#!/usr/bin/env node
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const productsPath = path.join(rootDir, 'merch/products.json');
const baseProductsPath = path.join(rootDir, 'merch/base-products.json');
const customizationTechniquesPath = path.join(
  rootDir,
  'merch/customization-techniques.json',
);
const artDirectionPath = path.join(rootDir, 'merch/art-direction.json');

const AOP_COTTON_REQUIRED_PLACEMENTS = [
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
  'shopify_draft',
  'printful_imported',
  'printful_synced',
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
      'shopify',
      'printful',
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

    if (!allowedTechniques.has(product?.printful?.technique)) {
      errors.push(`${label}: unsupported Printful technique`);
    }

    if (!product?.printful?.placements?.length) {
      errors.push(`${label}: at least one Printful placement is required`);
    }

    if (
      ['generated', 'shopify_draft', 'printful_imported', 'printful_synced', 'mockups_ready', 'approved', 'published'].includes(
        status,
      )
    ) {
      for (const placement of product?.printful?.placements || []) {
        if (!existsSync(path.join(rootDir, placement.file))) {
          errors.push(`${label}: missing print file ${placement.file}`);
        }
      }
    }

    if (['printful_synced', 'mockups_ready', 'approved', 'published'].includes(status)) {
      if (!product?.printful?.syncProductId) {
        errors.push(`${label}: Printful sync product ID is required`);
      }
      if (!product?.printful?.syncVariants?.length) {
        errors.push(`${label}: Printful sync variants are required`);
      }
    }

    if (!product?.assets?.mockups?.length) {
      errors.push(`${label}: at least one mockup image is required`);
    }

    if (!Array.isArray(product?.prompts) || product.prompts.length === 0) {
      errors.push(`${label}: at least one image prompt is required`);
    }

    if (!product?.shopify?.handle) {
      errors.push(`${label}: Shopify handle is required`);
    }
  });

  return errors;
}

export function printfulPayload(product) {
  return {
    sync_product: {
      name: product.title,
      external_id: product.slug,
      thumbnail: product.assets.mockups[0],
    },
    sync_variants: (product.printful.variantIds || []).map((variantId) => ({
      variant_id: variantId,
      retail_price: product.shopify.price,
      files: product.printful.placements.map((placement) => ({
        type: placement.area,
        url: placement.url || placement.file,
      })),
    })),
  };
}

export function productSetIdentifier(product) {
  if (product.shopify?.productId) return {id: product.shopify.productId};

  return {handle: product.shopify.handle};
}

export function shopifyProductSetInput(product, baseProduct, {includeFiles = true} = {}) {
  const status = workflowStatus(product) === 'published' ? 'ACTIVE' : 'DRAFT';
  const variants = baseProduct
    ? baseProduct.variants.map((variant) => ({
        optionValues: [
          {optionName: 'Color', name: variant.color},
          {optionName: 'Size', name: variant.size},
        ],
        price: product.shopify.price,
        sku: skuForVariant(product, variant),
      }))
    : [
        {
          optionValues: [{optionName: 'Title', name: 'Default Title'}],
          price: product.shopify.price,
          sku: skuForVariant(product),
        },
      ];

  const files = includeFiles
    ? shopifyMediaSources(product).map((source, index) => ({
        originalSource: source,
        alt: `${product.title} mockup ${index + 1}`,
        filename: `${product.slug}-mockup-${index + 1}${extensionFromUrl(source)}`,
        contentType: 'IMAGE',
      }))
    : [];

  return {
    handle: product.shopify.handle,
    title: product.title,
    descriptionHtml: `<p>${escapeHtml(product.description || '')}</p>`,
    tags: Array.from(new Set([...(product.shopify.tags || []), 'codex'])),
    status,
    productOptions: baseProduct
      ? [
          {
            name: 'Color',
            position: 1,
            values: unique(baseProduct.variants.map((variant) => variant.color)).map(
              (name) => ({name}),
            ),
          },
          {
            name: 'Size',
            position: 2,
            values: unique(baseProduct.variants.map((variant) => variant.size)).map(
              (name) => ({name}),
            ),
          },
        ]
      : [{name: 'Title', position: 1, values: [{name: 'Default Title'}]}],
    ...(files.length ? {files} : {}),
    variants,
    metafields: [
      {
        namespace: 'codex_merch',
        key: 'manifest_id',
        type: 'single_line_text_field',
        value: product.id,
      },
      {
        namespace: 'codex_merch',
        key: 'workflow_status',
        type: 'single_line_text_field',
        value: workflowStatus(product),
      },
      {
        namespace: 'codex_merch',
        key: 'rights_note',
        type: 'multi_line_text_field',
        value: product.meme.rightsNote,
      },
      {
        namespace: 'codex_merch',
        key: 'printful_technique',
        type: 'single_line_text_field',
        value: product.printful.technique,
      },
      {
        namespace: 'codex_merch',
        key: 'base_product',
        type: 'single_line_text_field',
        value: product.baseProduct || baseProduct?.alias || 'unassigned',
      },
    ],
  };
}

export function shopifyPayload(product) {
  return shopifyProductSetInput(product, null);
}

export function printfulSyncVariantPayload(product, baseProduct, shopifyVariant) {
  const baseVariant = findBaseVariant(baseProduct, shopifyVariant);
  if (!baseVariant) {
    throw new Error(`No Printful base variant matches ${shopifyVariant?.sku}`);
  }

  return {
    variant_id: baseVariant.printfulVariantId,
    retail_price: product.shopify.price,
    sku: shopifyVariant.sku,
    files: printfulPlacementFiles(product, {baseProduct}),
    options: baseProduct.techniqueOptions?.[product.printful.technique] || [],
  };
}

export function printfulMockupTaskPayload(product, baseProduct, options = {}) {
  return {
    variant_ids: baseProduct.variants.map((variant) => variant.printfulVariantId),
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
  const technique = product.printful?.technique;
  const techniqueRule = techniqueCatalog?.techniques?.[technique];

  if (!baseProduct) {
    errors.push(`${product.slug}: base product is required before generation`);
  }

  if (!techniqueRule) {
    errors.push(`${product.slug}: missing Printful technique rule for ${technique}`);
  }

  if (baseProduct && !baseProduct.techniques?.includes(technique)) {
    errors.push(
      `${product.slug}: ${baseProduct.alias} does not support ${technique}`,
    );
  }

  if (baseProduct && !baseProduct.catalogProductId) {
    errors.push(`${product.slug}: base product is missing a Printful catalog product ID`);
  }

  if (baseProduct && !baseProduct.variants?.every((variant) => variant.printfulVariantId)) {
    errors.push(`${product.slug}: every base variant needs a Printful variant ID`);
  }

  if (technique === 'All-Over Cotton') {
    const configuredAreas = new Set(
      (product.printful?.placements || []).map((placement) => placement.area),
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

  for (const placement of product.printful?.placements || []) {
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
    supportedPlacements: (product.printful?.placements || []).map((placement) =>
      resolveBasePlacement(baseProduct, placement.area, technique),
    ),
  };
}

export function printfulTechniquePrompt(product, baseProduct, techniqueCatalog) {
  const preflight = generationPreflight(product, baseProduct, techniqueCatalog);
  if (!preflight.ok) {
    throw new Error(preflight.errors.join('\n'));
  }

  const placementText = preflight.supportedPlacements
    .filter(Boolean)
    .map((placement) => `${placement.area} -> Printful file type ${placement.printfulType}`)
    .join('; ');

  return [
    `Printful production technique: ${product.printful.technique}.`,
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
  if (!artDirection) return '';

  return [
    `Art direction: ${artDirection.name}.`,
    artDirection.positioning,
    ...(artDirection.pillars || []).map((rule) => `Style pillar: ${rule}.`),
    ...(artDirection.visualRules || []).map((rule) => `Visual rule: ${rule}`),
    ...(artDirection.aopGarmentRules || []).map((rule) => `AOP garment rule: ${rule}`),
    (artDirection.referenceScreenshots || []).length
      ? `Local art-direction reference screenshots: ${artDirection.referenceScreenshots.join(', ')}.`
      : '',
    `Use motifs only when they fit the product: ${(artDirection.motifBank || []).join(', ')}.`,
    ...(artDirection.negativePromptRules || []).map((rule) => `Avoid: ${rule}`),
  ]
    .filter(Boolean)
    .join(' ');
}

export function generationDirectionPrompt(product, baseProduct, techniqueCatalog, artDirection) {
  return [
    printfulTechniquePrompt(product, baseProduct, techniqueCatalog),
    artDirectionPrompt(artDirection),
  ]
    .filter(Boolean)
    .join(' ');
}

export function artDirectorReview(product, baseProduct, artDirection) {
  const findings = [];
  const prompts = [product.meme?.brief, ...(product.prompts || [])]
    .filter(Boolean)
    .join(' ');
  const areas = new Set((product.printful?.placements || []).map((placement) => placement.area));
  const spec = product.artDirector?.aopSpec;

  if (product.printful?.technique !== 'All-Over Cotton') {
    findings.push('Rejected: art director validator is only for All-Over Cotton products.');
  }

  if (baseProduct?.kind !== 'all-over-cotton-sweatshirt') {
    findings.push('Rejected: selected base is not the Printful all-over cotton sweatshirt.');
  }

  for (const area of AOP_COTTON_REQUIRED_PLACEMENTS) {
    if (!areas.has(area)) findings.push(`Rejected: missing required AOP placement ${area}.`);
  }

  if (!spec) {
    findings.push('Rejected: missing artDirector.aopSpec garment plan.');
  } else {
    if (!spec.garmentFirst) findings.push('Rejected: aopSpec must set garmentFirst=true.');
    if (!spec.palette?.fabric || !spec.palette?.ink) {
      findings.push('Rejected: aopSpec needs fabric and ink palette values.');
    }
    if (!spec.front?.primaryText && !spec.front?.mark) {
      findings.push('Rejected: front panel needs an intentional chest mark or primary text.');
    }
    if (!spec.sleeves?.motif) {
      findings.push('Rejected: sleeve system needs a dedicated motif.');
    }
    if (!spec.back?.statement) {
      findings.push('Rejected: back panel needs a quieter statement or back identity mark.');
    }
  }

  const banned = ['openai', 'chatgpt', 'supreme', 'nike', 'adidas'];
  for (const word of banned) {
    if (new RegExp(`\\b${word}\\b`, 'i').test(prompts)) {
      findings.push(`Rejected: prompt uses protected/reference word "${word}".`);
    }
  }

  if (/poster collage|sticker.?bomb|dense collage|square artwork/i.test(prompts)) {
    findings.push('Rejected: prompt still asks for poster/collage logic.');
  }

  const accepted = findings.length === 0;
  return {
    accepted,
    score: accepted ? 92 : Math.max(0, 72 - findings.length * 12),
    reviewer: 'codex-aop-art-director-validator',
    checkedAt: new Date().toISOString(),
    referenceScreenshots: artDirection?.referenceScreenshots || [],
    findings: accepted
      ? [
          'Accepted: garment-first AOP cotton plan with panel-specific sleeves, front, back, label panel, and inside label.',
          'Accepted: production files can be composed from exact Printful cotton sweatshirt panel dimensions.',
        ]
      : findings,
  };
}

function aopCottonSupervisorPrompt(product, baseProduct, techniqueCatalog, artDirection) {
  const spec = product.artDirector?.aopSpec || {};
  const palette = spec.palette || {};
  return [
    'You are a senior apparel art director creating one original all-over cotton sweatshirt concept.',
    'Create a flat product concept board that shows the full garment idea: front body, back body, both sleeves, collar/cuff attitude, and label treatment.',
    generationDirectionPrompt(product, baseProduct, techniqueCatalog, artDirection),
    `Garment design brief: ${product.meme.brief}`,
    `Local deterministic type plan: front="${spec.front?.primaryText || product.printful.textLayer || product.title}", back="${spec.back?.statement || ''}", sleeves="${spec.sleeves?.motif || ''}".`,
    `Palette: fabric ${palette.fabric || 'muted cotton'}, ink ${palette.ink || 'dark ink'}, accent ${palette.accent || 'single accent'}.`,
    'Aesthetic: restrained Supply Co-adjacent research-lab/skater merchandise, premium negative space, no copied layout.',
    'Do not make a dense poster, sticker sheet, ecommerce stock photo, official logo, real brand parody, or screenshot.',
    'Keep text minimal and treat exact readable text as local production composition.',
  ].join(' ');
}

export function composePrintFilePlan(product) {
  return {
    slug: product.slug,
    technique: product.printful.technique,
    deterministicTextLayer: true,
    artwork: product.assets.artwork,
    placements: product.printful.placements,
    artDirectorMode:
      product.printful.technique === 'All-Over Cotton'
        ? 'supervised-aop-cotton-garment-system'
        : 'standard-placement-artwork',
    outputChecks: [
      'transparent PNG output',
      'text rendered by local composition rather than image model',
      'placement dimensions verified against selected Printful variant template',
      product.printful.technique === 'All-Over Cotton'
        ? 'all required cut-and-sew panel files generated without Printful guide layers'
        : null,
    ].filter(Boolean),
  };
}

function shopifyMediaSources(product) {
  const remoteMockups = (product.assets.mockups || []).filter(isRemoteUrl);
  if (remoteMockups.length) return remoteMockups;

  const uploaded = Object.values(product.shopify?.mockupFileUrls || {}).filter(Boolean);
  if (uploaded.length) return uploaded;

  return [];
}

function printfulPlacementFiles(product, {allowLocal = false, baseProduct = null} = {}) {
  return (product.printful.placements || []).map((placement) => {
    const printFile = (product.assets.printFiles || []).find(
      (file) => file.placement === placement.area || file.path === placement.file,
    );
    const url = printFile?.url || placement.url || (allowLocal ? placement.file : null);
    if (!url) {
      throw new Error(`${product.slug}: missing uploaded URL for ${placement.area}`);
    }

    const basePlacement = resolveBasePlacement(
      baseProduct,
      placement.area,
      product.printful.technique,
    );

    return {
      type:
        basePlacement?.printfulType ||
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

function isTransientPrintTransferUrl(url) {
  return (
    typeof url === 'string' &&
    url.includes('shopify-staged-uploads.storage.googleapis.com')
  );
}

function clearTransientPrintTransferUrls(product) {
  if (product.shopify?.fileUrls) {
    for (const [placement, url] of Object.entries(product.shopify.fileUrls)) {
      if (isTransientPrintTransferUrl(url)) {
        delete product.shopify.fileUrls[placement];
      }
    }

    if (!Object.keys(product.shopify.fileUrls).length) {
      delete product.shopify.fileUrls;
    }
  }

  for (const printFile of product.assets?.printFiles || []) {
    if (isTransientPrintTransferUrl(printFile.url)) {
      delete printFile.url;
    }
  }
}

function resolveBasePlacement(baseProduct, area, technique) {
  const placements = baseProduct?.placements || [];
  for (const placement of placements) {
    if (typeof placement === 'string') {
      if (placement === area) {
        return {
          area,
          printfulType: area === 'front' ? 'default' : area,
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

function findBaseVariant(baseProduct, shopifyVariant) {
  if (!baseProduct?.variants?.length) return null;
  const options = new Map(
    (shopifyVariant?.selectedOptions || shopifyVariant?.options || []).map((option) => [
      option.name,
      option.value,
    ]),
  );

  return (
    baseProduct.variants.find(
      (variant) =>
        variant.color === options.get('Color') && variant.size === options.get('Size'),
    ) || baseProduct.variants[0]
  );
}

function skuForVariant(product, variant = null) {
  const base = product.slug.toUpperCase().replaceAll('-', '_');
  if (!variant) return base;
  return `${base}_${variant.color}_${variant.size}`
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function unique(values) {
  return Array.from(new Set(values));
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

function extensionFromUrl(value) {
  const pathname = new URL(value, 'https://example.com').pathname;
  const extension = path.extname(pathname);
  return extension || '.jpg';
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

function mimeTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  return 'image/png';
}

function imageContentType(mimeType) {
  return mimeType.startsWith('image/') ? 'IMAGE' : 'FILE';
}

function gidTail(gid) {
  return String(gid || '').split('/').pop();
}

function baseForProduct(baseProducts, product) {
  if (!product.baseProduct) return null;
  const base = baseProducts.products.find((item) => item.alias === product.baseProduct);
  if (!base) throw new Error(`${product.slug}: unknown base product ${product.baseProduct}`);
  return base;
}

function selectProducts(products, args) {
  const slug = readArg(args, '--slug') || args.find((arg) => !arg.startsWith('--'));
  if (!slug || slug === 'all') return products;

  const product = products.find(
    (item) => item.slug === slug || item.shopify.handle === slug,
  );
  if (!product) throw new Error(`Unknown merch product: ${slug}`);
  return [product];
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

async function runNew(args) {
  const title = args.join(' ').trim();
  if (!title) throw new Error('Usage: npm run merch:new -- "Product title"');

  const slug = slugify(title);
  const products = await readProducts();
  if (products.some((product) => product.slug === slug)) {
    throw new Error(`Product already exists: ${slug}`);
  }

  products.push({
    id: `drop-${String(products.length + 1).padStart(3, '0')}-${slug}`,
    slug,
    title,
    status: 'draft',
    workflow: {status: 'draft', updatedAt: new Date().toISOString()},
    baseProduct: 'bella-canvas-3001-black',
    category: 'Codex',
    description: 'Draft product created from a Codex merch conversation.',
    meme: {
      source: 'User-provided prompt',
      brief: 'Fill in the meme brief before sync.',
      rightsNote:
        'Rights review required before publishing. Avoid official marks, recognizable people, copied screenshots, or verbatim social posts.',
      xQuery: '',
      xSources: [],
    },
    shopify: {
      handle: slug,
      price: '42.00',
      currency: 'USD',
      tags: ['codex'],
      variantId: null,
      productId: null,
      variants: [],
      fileUrls: {},
      mockupFileUrls: {},
    },
    printful: {
      productId: null,
      syncProductId: null,
      mockupTaskKey: null,
      variantIds: [],
      syncVariants: [],
      technique: 'DTFlex',
      placements: [{area: 'front', file: `assets/print/${slug}-front.png`}],
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
  });

  await writeProducts(products);
  process.stdout.write(`Created ${slug}\n`);
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

async function runResearchX(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const maxResults = Number(readArg(args, '--max-results', 25));
  const products = await readProducts();
  const selected = selectProducts(products, args);
  const {buildRecentSearchUrl, searchRecentPosts, summarizeRecentSearch} =
    await import('./adapters/x-api.mjs');

  const requests = selected.map((product) => {
    const query =
      readArg(args, '--query') ||
      product.meme.xQuery ||
      `${product.meme.brief} lang:en -is:retweet`;
    return {product, query, maxResults};
  });

  if (dryRun) {
    printJson(
      requests.map(({product, query}) => ({
        slug: product.slug,
        url: buildRecentSearchUrl({query, maxResults}),
      })),
    );
    return;
  }

  requireEnv(['X_BEARER_TOKEN']);
  for (const request of requests) {
    const result = await searchRecentPosts(request);
    request.product.meme.xQuery = request.query;
    request.product.meme.xSources = summarizeRecentSearch(result, request.query);
    request.product.meme.source = 'X API recent search';
    request.product.meme.rightsNote =
      request.product.meme.rightsNote ||
      'Use X posts as trend signals only. Do not copy text, screenshots, usernames, likenesses, or protected marks into merch.';
  }

  await writeProducts(products);
  printJson(
    requests.map(({product}) => ({
      slug: product.slug,
      sources: product.meme.xSources.length,
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
    const preflight = generationPreflight(product, base, techniqueCatalog);
    if (!preflight.ok) {
      throw new Error(preflight.errors.join('\n'));
    }
    if (preflight.warnings.length) {
      console.warn(preflight.warnings.join('\n'));
    }
    const review =
      product.printful.technique === 'All-Over Cotton'
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
      product.printful.technique === 'All-Over Cotton'
        ? aopCottonSupervisorPrompt(product, base, techniqueCatalog, artDirection)
        : buildImagePrompt({
            brief: `${productionConstraints} Creative brief: ${product.meme.brief} ${product.prompts.join(' ')}`,
            textLayer: product.printful.textLayer || product.title,
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
        printfulPreflight: preflight,
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
  if (product.printful.technique === 'All-Over Cotton') {
    return composeAopCottonProductFiles(product, baseProduct);
  }

  const sharp = (await import('sharp')).default;
  const dimensions = baseProduct?.printfile || {width: 1800, height: 2400};
  const text = product.printful.textLayer || product.title;
  const placements = product.printful.placements || [];
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

  for (const placement of product.printful.placements || []) {
    const resolved = resolveBasePlacement(
      baseProduct,
      placement.area,
      product.printful.technique,
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

async function composeAopCottonMockups(product, spec, sharp) {
  const mockups = product.assets.mockups?.length
    ? product.assets.mockups
    : [
        `assets/mockups/${product.slug}-front.png`,
        `assets/mockups/${product.slug}-back.png`,
        `assets/mockups/${product.slug}-patterns.png`,
      ];
  product.assets.mockups = mockups;

  for (const mockupPath of mockups) {
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
  const text = {
    title: product.printful.textLayer || product.title,
    front: spec.front?.primaryText || product.printful.textLayer || product.title,
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
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} inside label">
  <rect width="${width}" height="${height}" fill="${palette.fabric}"/>
  <rect x="8" y="8" width="${width - 16}" height="${height - 16}" fill="none" stroke="${palette.ink}" stroke-width="3"/>
  <text x="${width / 2}" y="54" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="800" fill="${palette.ink}">CODEX SUPPLY</text>
  <text x="${width / 2}" y="91" text-anchor="middle" font-family="Georgia, serif" font-size="20" fill="${palette.ink}">${escapeXml(spec.label?.line || product.printful.textLayer || product.title)}</text>
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
  </defs>`;
}

function aopBasePattern({area, spec, palette, width, height}) {
  const pattern = spec.basePattern || 'pinstripe';
  const bg =
    pattern === 'pinstripe'
      ? `<rect width="${width}" height="${height}" fill="url(#pinstripe)" opacity="0.65"/>`
      : `<rect width="${width}" height="${height}" fill="url(#microgrid)" opacity="0.85"/>`;
  const sleeve =
    area.includes('sleeve')
      ? `${aopTribalWave({x: width * 0.36, y: height * 0.11, width: width * 0.28, height: height * 0.72, color: palette.accent})}
         ${aopTribalWave({x: width * 0.57, y: height * 0.19, width: width * 0.18, height: height * 0.58, color: palette.ink, opacity: 0.4})}`
      : '';
  return `${bg}${sleeve}`;
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

function aopMockupSvg({product, spec, angle}) {
  const palette = aopPalette(spec);
  if (angle === 'patterns') {
    return aopPatternSheetMockup({product, spec, palette});
  }

  const isBack = angle === 'back';
  const bodyText = isBack
    ? spec.back?.statement || product.title
    : spec.front?.primaryText || product.printful.textLayer || product.title;
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
    <path d="M400 452h380v520H400z" fill="url(#${spec.basePattern === 'microgrid' ? 'microgrid' : 'pinstripe'})" opacity="0.7"/>
    <path d="M306 198l-250 600 170 64 174-410z" fill="url(#${spec.basePattern === 'microgrid' ? 'microgrid' : 'pinstripe'})" opacity="0.7"/>
    <path d="M874 198l250 600-170 64-174-410z" fill="url(#${spec.basePattern === 'microgrid' ? 'microgrid' : 'pinstripe'})" opacity="0.7"/>
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
        <rect width="560" height="390" fill="url(#${spec.basePattern === 'microgrid' ? 'microgrid' : 'pinstripe'})" opacity="0.62"/>
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

async function runUploadAssets(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const products = await readProducts();
  const selected = selectProducts(products, args);
  const files = selected.flatMap((product) =>
    (product.assets.printFiles || product.printful.placements || []).map((file) => ({
      product,
      placement: file.placement || file.area,
      path: file.path || file.file,
    })),
  );

  if (dryRun) {
    printJson(
      files.map((file) => ({
        slug: file.product.slug,
        placement: file.placement,
        path: file.path,
        stagedUpload: {
          filename: path.basename(file.path),
          mimeType: mimeTypeFor(file.path),
          resource: 'FILE',
        },
      })),
    );
    return;
  }

  requireEnv(['PUBLIC_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']);
  const {createStagedUploadTarget, uploadToStagedTarget} = await import(
    './adapters/shopify-admin.mjs'
  );

  for (const file of files) {
    const fullPath = localPath(file.path);
    const buffer = await readFile(fullPath);
    const mimeType = mimeTypeFor(file.path);
    const target = await createStagedUploadTarget({
      filename: path.basename(file.path),
      mimeType,
      resource: 'FILE',
      httpMethod: 'POST',
    });

    await uploadToStagedTarget(target, {
      filename: path.basename(file.path),
      mimeType,
      buffer,
    });

    const url = target.resourceUrl;
    file.product.shopify.fileUrls = file.product.shopify.fileUrls || {};
    file.product.shopify.fileUrls[file.placement] = url;
    for (const printFile of file.product.assets.printFiles || []) {
      if (printFile.placement === file.placement) {
        printFile.url = url;
        printFile.shopifyFileId = null;
      }
    }
  }

  await writeProducts(products);
  printJson(selected.map((product) => ({slug: product.slug, fileUrls: product.shopify.fileUrls})));
}

function shopifyFileUrl(file) {
  return file?.url || file?.image?.url || null;
}

async function runShopifyUpsert(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const includeExistingMedia = hasFlag(args, '--include-media');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const payloads = selected.map((product) => {
    const base = baseForProduct(bases, product);
    return {
      product,
      input: shopifyProductSetInput(product, base, {
        includeFiles: includeExistingMedia || !product.shopify.productId,
      }),
      identifier: productSetIdentifier(product),
    };
  });

  if (dryRun) {
    printJson(payloads.map(({product, input, identifier}) => ({slug: product.slug, identifier, input})));
    return;
  }

  requireEnv(['PUBLIC_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']);
  const {upsertShopifyProductSet} = await import('./adapters/shopify-admin.mjs');

  for (const payload of payloads) {
    const result = await upsertShopifyProductSet({
      input: payload.input,
      identifier: payload.identifier,
      synchronous: true,
    });
    const productNode = result.product;
    payload.product.shopify.productId = productNode.id;
    payload.product.shopify.variants = productNode.variants.nodes.map((variant) => ({
      id: variant.id,
      externalId: gidTail(variant.id),
      sku: variant.sku,
      selectedOptions: variant.selectedOptions,
    }));
    payload.product.shopify.variantId =
      payload.product.shopify.variants[0]?.id || payload.product.shopify.variantId;
    if (workflowStatus(payload.product) !== 'published') {
      advanceWorkflowStatus(payload.product, 'shopify_draft');
    }
  }

  await writeProducts(products);
  printJson(
    selected.map((product) => ({
      slug: product.slug,
      productId: product.shopify.productId,
      variants: product.shopify.variants?.length || 0,
    })),
  );
}

async function runPrintfulSync(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const payloads = selected.map((product) => {
    const base = baseForProduct(bases, product);
    return {
      product,
      base,
      externalProductId: gidTail(product.shopify.productId),
      variants: (product.shopify.variants || []).map((variant) => ({
        externalVariantId: variant.externalId || gidTail(variant.id),
        payload: printfulSyncVariantPayload(product, base, variant),
      })),
    };
  });

  if (dryRun) {
    printJson(payloads);
    return;
  }

  requireEnv(['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID']);
  const {getPrintfulSyncProductByExternalId, updatePrintfulSyncVariant} =
    await import('./adapters/printful.mjs');

  for (const item of payloads) {
    const syncProduct = await getPrintfulSyncProductByExternalId(item.externalProductId);
    item.product.printful.syncProductId = syncProduct.result?.sync_product?.id;
    item.product.printful.productId = item.product.printful.syncProductId;
    setWorkflowStatus(item.product, 'printful_imported');

    const updated = [];
    for (const variant of item.variants) {
      const result = await updatePrintfulSyncVariant(
        variant.externalVariantId,
        variant.payload,
      );
      updated.push({
        id: result.result?.id,
        externalId: variant.externalVariantId,
        printfulVariantId: variant.payload.variant_id,
      });
    }

    item.product.printful.syncVariants = updated;
    clearTransientPrintTransferUrls(item.product);
    setWorkflowStatus(item.product, 'printful_synced');
  }

  await writeProducts(products);
  printJson(
    selected.map((product) => ({
      slug: product.slug,
      syncProductId: product.printful.syncProductId,
      syncVariants: product.printful.syncVariants?.length || 0,
    })),
  );
}

async function runMockups(args) {
  const dryRun = hasFlag(args, '--dry-run');
  const pollOnly = hasFlag(args, '--poll');
  const products = await readProducts();
  const bases = await readBaseProducts();
  const selected = selectProducts(products, args);
  const payloads = selected.map((product) => {
    const base = baseForProduct(bases, product);
    return {
      product,
      base,
      payload: printfulMockupTaskPayload(product, base, {allowLocal: dryRun}),
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

  requireEnv(['PRINTFUL_TOKEN', 'PRINTFUL_STORE_ID']);
  const {createPrintfulMockupTask, getPrintfulMockupTask} = await import(
    './adapters/printful.mjs'
  );

  for (const item of payloads) {
    let task;
    if (pollOnly && item.product.printful.mockupTaskKey) {
      task = await getPrintfulMockupTask(item.product.printful.mockupTaskKey);
    } else {
      task = await createPrintfulMockupTask(item.base.catalogProductId, item.payload);
      item.product.printful.mockupTaskKey = task.result?.task_key;
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
      taskKey: product.printful.mockupTaskKey,
      status: workflowStatus(product),
      mockups: product.assets.mockups,
    })),
  );
}

async function persistMockupsFromTask(product, task) {
  const urls = [];
  for (const mockup of task.mockups || []) {
    for (const extra of mockup.extra || []) {
      if (extra.url) urls.push(extra.url);
    }
  }

  if (!urls.length) return;

  requireEnv(['PUBLIC_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']);
  const {createShopifyFiles, waitForShopifyFilesReady} = await import(
    './adapters/shopify-admin.mjs'
  );
  const files = await createShopifyFiles(
    urls.map((url, index) => ({
      originalSource: url,
      contentType: 'IMAGE',
      filename: `${product.slug}-mockup-${index + 1}${extensionFromUrl(url)}`,
      alt: `${product.title} mockup ${index + 1}`,
    })),
  );

  const readyFiles = await waitForShopifyFilesReady(
    files.map((file) => file.id).filter(Boolean),
  );
  const uploaded = (readyFiles.length ? readyFiles : files).map(shopifyFileUrl).filter(Boolean);
  if (uploaded.length) {
    product.assets.mockups = uploaded;
    product.shopify.mockupFileUrls = Object.fromEntries(
      uploaded.map((url, index) => [`mockup_${index + 1}`, url]),
    );
  }
}

async function runPublish(args) {
  const approve = hasFlag(args, '--approve');
  const includeExistingMedia = hasFlag(args, '--include-media');
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

  requireEnv(['PUBLIC_STORE_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN']);
  const {upsertShopifyProductSet} = await import('./adapters/shopify-admin.mjs');

  for (const product of selected) {
    const base = baseForProduct(bases, product);
    setWorkflowStatus(product, 'published');
    await upsertShopifyProductSet({
      input: shopifyProductSetInput(product, base, {
        includeFiles: includeExistingMedia || !product.shopify.productId,
      }),
      identifier: productSetIdentifier(product),
      synchronous: true,
    });
  }

  await writeProducts(products);
  printJson(selected.map((product) => ({slug: product.slug, status: workflowStatus(product)})));
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
    case 'research:x':
      await runResearchX(args);
      break;
    case 'generate-artwork':
      await runGenerateArtwork(args);
      break;
    case 'compose-print-file':
    case 'compose-print-files':
      await runComposePrintFiles(args);
      break;
    case 'upload-assets':
      await runUploadAssets(args);
      break;
    case 'shopify:upsert':
    case 'sync:shopify':
      await runShopifyUpsert(args);
      break;
    case 'printful:sync':
    case 'sync:printful':
      await runPrintfulSync(args);
      break;
    case 'mockups':
      await runMockups(args);
      break;
    case 'publish':
      await runPublish(args);
      break;
    case 'compose-print-file-plan':
      await runComposePlan(args);
      break;
    default:
      throw new Error(
        'Usage: node scripts/merch.mjs <new|validate|research:x|generate-artwork|compose-print-files|upload-assets|shopify:upsert|printful:sync|mockups|publish>',
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
