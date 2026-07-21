import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {sanitizeXmlText} from './text-safety.mjs';

const AOP_BASE_ALIAS = 'printful-aop-cotton-sweatshirt-white';
const AOP_TECHNIQUE = 'All-Over Cotton';

export function buildWeeklyProduct({
  existingProducts,
  baseProduct,
  trend,
  trendDecision,
  recipe,
  posts,
  run,
  unitAmount = 8_800,
  currency = 'USD',
} = {}) {
  if (baseProduct?.alias !== AOP_BASE_ALIAS) {
    throw new Error(`Weekly products require ${AOP_BASE_ALIAS}`);
  }
  if (!trendDecision?.publishEligible) {
    throw new Error('Weekly product creation requires an approved trend');
  }
  if (!trend?.trendName) throw new Error('Weekly product creation requires a named trend');
  if (!recipe) throw new Error('Weekly product creation requires a garment recipe');

  const stableSuffix = run.identity.isoWeek.toLowerCase();
  const desiredSlug = `${slugify(recipe.title)}-${stableSuffix}`;
  const priorForCandidate = (existingProducts || []).find(
    (product) =>
      product.automation?.runKey === run.identity.runKey &&
      product.artDirector?.selectedConceptId === recipe.conceptId &&
      product.title === recipe.title,
  );
  const slug =
    priorForCandidate?.slug || uniqueSlug(desiredSlug, existingProducts || []);
  const evidenceIds = new Set(trendDecision.evidencePostIds);
  const sources = (posts || [])
    .filter((post) => evidenceIds.has(String(post.id)))
    .map(publicSignalSource);
  const placements = (baseProduct.placements || [])
    .filter(
      (placement) =>
        !placement.techniques || placement.techniques.includes(AOP_TECHNIQUE),
    )
    .map((placement) => ({
      area: placement.area,
      file: `assets/print/${slug}-${placement.area}_dtfabric.png`,
      width: placement.width || baseProduct.printfile.width,
      height: placement.height || baseProduct.printfile.height,
    }));
  const variants = baseProduct.variants.map((variant) =>
    commerceVariant(slug, variant),
  );
  const aopSpec = recipeToAopSpec(recipe);

  return {
    id: `weekly-${run.identity.isoWeek.toLowerCase()}-${slug}`,
    slug,
    title: recipe.title,
    workflow: {status: 'draft', updatedAt: new Date().toISOString()},
    category: 'Weekly Signal',
    description:
      'A weekly research-led, all-over cotton garment derived from a recurring developer-culture signal.',
    meme: {
      source: `Weekly X list signal ${run.identity.isoWeek}`,
      brief:
        'An original garment interpretation of an aggregate weekly developer-workflow signal.',
      rightsNote:
        'Derived from aggregate social signals only. Product text and artwork are original; no post wording, usernames, screenshots, likenesses, official marks, or protected brand expressions are reproduced.',
    },
    signals: {
      profile: 'weekly-x-list-trend',
      queries: [
        {
          provider: 'x',
          query: `list:${run.identity.listId}`,
          maxResults: run.requestedPostCount,
        },
      ],
      sources,
    },
    commerce: {
      handle: slug,
      unitAmount: Math.round(unitAmount),
      currency: String(currency).toUpperCase(),
      tags: ['weekly-signal', 'sweatshirt', 'all-over-cotton'],
      variants,
    },
    production: {
      provider: 'printful',
      baseProduct: baseProduct.alias,
      technique: AOP_TECHNIQUE,
      textLayer: recipe.front.primaryText,
      placements,
    },
    providerRefs: {
      printful: {productId: null, mockupTaskKey: null, variants: []},
    },
    assets: {
      artwork: `assets/artwork/${slug}-concept.png`,
      printFiles: placements.map((placement) => ({
        placement: placement.area,
        path: placement.file,
      })),
      customerPhotos: [],
      mockups: [
        `assets/mockups/${slug}-front.png`,
        `assets/mockups/${slug}-back.png`,
        `assets/mockups/${slug}-patterns.png`,
      ],
    },
    prompts: [recipe.visualPrompt],
    artDirector: {
      mode: 'gpt-5.6-structured-aop-cotton',
      selectedConceptId: recipe.conceptId,
      aopSpec,
    },
    automation: {
      pipelineVersion: run.identity.pipelineVersion,
      runId: run.identity.runId,
      runKey: run.identity.runKey,
      inputHash: run.inputHash,
      trendFingerprint: trendDecision.fingerprint,
      evidencePostIds: trendDecision.evidencePostIds,
      trendScore: trendDecision.score,
      model: run.model,
    },
    approval: {
      approvedAt: null,
      approvedBy: null,
      notes: 'Awaiting actual-render critic, provider readiness, and release authority.',
    },
  };
}

export function buildWeeklyCandidateProducts({recipes = [], ...options} = {}) {
  if (!Array.isArray(recipes) || recipes.length === 0) {
    throw new Error('Weekly candidate construction requires at least one recipe');
  }
  const reservedProducts = [...(options.existingProducts || [])];
  return recipes.map((recipe) => {
    const product = buildWeeklyProduct({
      ...options,
      existingProducts: reservedProducts,
      recipe,
    });
    assertWeeklyProductRecipeIdentity(product, recipe);
    reservedProducts.push(product);
    return product;
  });
}

export function assertWeeklyProductRecipeIdentity(product, recipe) {
  const issues = [];
  const slug = product?.slug;
  if (!slug) issues.push('missing product slug');
  if (product?.title !== recipe?.title) issues.push('title does not match recipe');
  if (product?.artDirector?.selectedConceptId !== recipe?.conceptId) {
    issues.push('selected concept does not match recipe');
  }
  if (product?.production?.textLayer !== recipe?.front?.primaryText) {
    issues.push('production text does not match recipe');
  }
  if (product?.prompts?.[0] !== recipe?.visualPrompt) {
    issues.push('visual prompt does not match recipe');
  }
  if (
    JSON.stringify(product?.artDirector?.aopSpec) !==
    JSON.stringify(recipeToAopSpec(recipe))
  ) {
    issues.push('AOP specification does not match recipe');
  }
  if (slug) {
    if (product.id !== `weekly-${product.automation?.runId?.split('--')[2]?.toLowerCase()}-${slug}`) {
      // Run IDs are deliberately inspectable but the exact shape is owned by the
      // run store. A suffix check still catches stale candidate identity safely.
      if (!String(product.id || '').endsWith(`-${slug}`)) {
        issues.push('product id does not match slug');
      }
    }
    if (product?.commerce?.handle !== slug) issues.push('commerce handle does not match slug');
    for (const variant of product?.commerce?.variants || []) {
      if (!String(variant.id || '').startsWith(`${slug}:`)) {
        issues.push(`variant ${variant.id || '<missing>'} does not match slug`);
      }
      const expectedSkuPrefix = slug.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
      if (!String(variant.sku || '').startsWith(expectedSkuPrefix)) {
        issues.push(`variant SKU ${variant.sku || '<missing>'} does not match slug`);
      }
    }
    for (const placement of product?.production?.placements || []) {
      if (!String(placement.file || '').startsWith(`assets/print/${slug}-`)) {
        issues.push(`placement ${placement.area || '<missing>'} does not match slug`);
      }
    }
    if (product?.assets?.artwork !== `assets/artwork/${slug}-concept.png`) {
      issues.push('artwork path does not match slug');
    }
    for (const file of product?.assets?.printFiles || []) {
      if (!String(file.path || '').startsWith(`assets/print/${slug}-`)) {
        issues.push(`print file ${file.path || '<missing>'} does not match slug`);
      }
    }
    for (const file of [
      ...(product?.assets?.mockups || []),
      ...(product?.assets?.customerPhotos || []),
    ]) {
      if (!String(file || '').startsWith(`assets/mockups/${slug}-`)) {
        issues.push(`mockup ${file || '<missing>'} does not match slug`);
      }
    }
  }
  if (issues.length) {
    throw new Error(`Weekly candidate identity mismatch: ${[...new Set(issues)].join('; ')}`);
  }
  return product;
}

export function upsertWeeklyProduct(products, product) {
  const byRun = products.findIndex(
    (candidate) => candidate.automation?.runKey === product.automation.runKey,
  );
  const bySlug = products.findIndex((candidate) => candidate.slug === product.slug);
  const index = byRun >= 0 ? byRun : bySlug;
  if (index >= 0) {
    products[index] = product;
    return {products, mode: 'updated', index};
  }
  products.push(product);
  return {products, mode: 'created', index: products.length - 1};
}

export async function renderWeeklyConceptBoard(product, outputPath) {
  const sharp = (await import('sharp')).default;
  const spec = product.artDirector.aopSpec;
  const palette = spec.palette;
  const svg = conceptBoardSvg(product, spec, palette);
  await mkdir(path.dirname(outputPath), {recursive: true});
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  return outputPath;
}

export function recipeToAopSpec(recipe) {
  return {
    garmentFirst: true,
    brandLabel: recipe.brandLabel,
    provenanceLine: recipe.provenanceLine,
    aestheticWorld: recipe.aestheticWorld,
    typeSystem: recipe.typeSystem,
    layout: recipe.layout,
    basePattern: recipe.basePattern,
    palette: recipe.palette,
    front: recipe.front,
    back: recipe.back,
    sleeves: recipe.sleeves,
    label: recipe.label,
  };
}

function publicSignalSource(post) {
  return {
    provider: 'x',
    id: String(post.id),
    url: `https://x.com/i/web/status/${encodeURIComponent(String(post.id))}`,
    createdAt: post.createdAt || null,
    lang: post.lang || null,
    metrics: post.metrics,
    matchedQuery: post.source?.listId
      ? `list:${post.source.listId}`
      : 'weekly-x-list',
  };
}

function commerceVariant(slug, variant) {
  const id = `${slug}:${variant.providerVariantId}`;
  return {
    id,
    sku: `${slug}-${variant.color}-${variant.size}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
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

function uniqueSlug(desired, products) {
  const slugs = new Set(products.map((product) => product.slug));
  if (!slugs.has(desired)) return desired;
  for (let index = 2; index < 100; index += 1) {
    if (!slugs.has(`${desired}-${index}`)) return `${desired}-${index}`;
  }
  throw new Error(`Could not allocate a unique weekly product slug for ${desired}`);
}

function slugify(value) {
  const slug = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56)
    .replace(/-+$/g, '');
  if (!slug) throw new Error('Garment recipe title cannot produce an empty slug');
  return slug;
}

function conceptBoardSvg(product, spec, palette) {
  const panels = [
    ['FRONT', spec.front.primaryText, spec.front.subline],
    ['BACK', spec.back.statement, spec.back.subline],
    ['LEFT SLEEVE', spec.sleeves.leftText, spec.sleeves.caption],
    ['RIGHT SLEEVE', spec.sleeves.rightText, spec.sleeves.caption],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1600" height="1600" viewBox="0 0 1600 1600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(product.title)} garment concept board">
  <rect width="1600" height="1600" fill="#e8e5df"/>
  <rect x="55" y="55" width="1490" height="1490" rx="28" fill="#f7f5f0" stroke="#151515" stroke-width="5"/>
  <text x="110" y="145" font-family="Arial, Helvetica, sans-serif" font-size="24" font-weight="800" fill="#151515">WEEKLY SIGNAL / GARMENT SYSTEM</text>
  <text x="110" y="220" font-family="Georgia, serif" font-size="64" fill="#151515">${escapeXml(product.title)}</text>
  <text x="110" y="270" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#555">${escapeXml(spec.brandLabel)} · ${escapeXml(spec.provenanceLine)}</text>
  ${panels
    .map(([label, primary, secondary], index) => {
      const x = 110 + (index % 2) * 700;
      const y = 350 + Math.floor(index / 2) * 510;
      return `<g transform="translate(${x} ${y})">
        <rect width="620" height="430" rx="18" fill="${palette.fabric}" stroke="${palette.ink}" stroke-width="5"/>
        <path d="M0 76H620M80 0V430M540 0V430" stroke="${palette.muted}" stroke-width="3" opacity="0.62"/>
        <circle cx="520" cy="90" r="42" fill="none" stroke="${palette.accent}" stroke-width="10"/>
        <text x="40" y="55" font-family="Arial, Helvetica, sans-serif" font-size="20" font-weight="800" fill="${palette.accent}">${escapeXml(label)}</text>
        <text x="310" y="210" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="${palette.ink}">${escapeXml(primary)}</text>
        <text x="310" y="270" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="800" fill="${palette.accent}">${escapeXml(secondary)}</text>
        <text x="40" y="392" font-family="Arial, Helvetica, sans-serif" font-size="16" fill="${palette.ink}" opacity="0.74">${escapeXml(spec.basePattern)}</text>
      </g>`;
    })
    .join('')}
  <g transform="translate(110 1390)">
    ${Object.values(palette)
      .map(
        (color, index) =>
          `<rect x="${index * 92}" width="74" height="74" rx="8" fill="${color}" stroke="#151515" stroke-width="2"/>`,
      )
      .join('')}
    <text x="430" y="48" font-family="Arial, Helvetica, sans-serif" font-size="18" fill="#151515">ALL-OVER COTTON · SIX PRODUCTION PANELS · LOCAL TYPE</text>
  </g>
</svg>`;
}

function escapeXml(value) {
  return sanitizeXmlText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
