import {hashJson} from './weekly-run-store.mjs';
import {recipeToAopSpec} from './weekly-product.mjs';

export const OWNER_TREND_PREVIEW_PIPELINE = 'owner-trend-preview-v1';
export const OWNER_TREND_PROFILE = 'owner-supplied-trend';

const AOP_BASE_ALIAS = 'printful-aop-cotton-sweatshirt-white';
const AOP_TECHNIQUE = 'All-Over Cotton';
const valueFlags = new Set(['--trend', '--context']);
const booleanFlags = new Set(['--dry-run']);

export function parseOwnerTrendPreviewOptions(args = []) {
  const values = new Map();
  const flags = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (booleanFlags.has(token)) {
      if (flags.has(token)) throw new Error(`Duplicate preview option: ${token}`);
      flags.add(token);
      continue;
    }
    if (!valueFlags.has(token)) {
      throw new Error(`Unknown preview option: ${token}`);
    }
    if (values.has(token)) throw new Error(`Duplicate preview option: ${token}`);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for preview option: ${token}`);
    }
    values.set(token, value);
    index += 1;
  }

  const trend = normalizeOwnerText(values.get('--trend'), {
    label: 'Owner-supplied trend',
    maximum: 240,
    required: true,
  });
  const context = normalizeOwnerText(values.get('--context'), {
    label: 'Owner-supplied context',
    maximum: 600,
    required: false,
  });

  return {
    trend,
    context,
    dryRun: flags.has('--dry-run'),
  };
}

export function ownerTrendInput({trend, context = ''} = {}) {
  const normalizedTrend = normalizeOwnerText(trend, {
    label: 'Owner-supplied trend',
    maximum: 240,
    required: true,
  });
  const normalizedContext = normalizeOwnerText(context, {
    label: 'Owner-supplied context',
    maximum: 600,
    required: false,
  });
  const inputHash = hashJson({
    pipelineVersion: OWNER_TREND_PREVIEW_PIPELINE,
    trend: normalizedTrend,
    context: normalizedContext,
  });
  const identityHash = ownerTrendIdentityHash({
    trend: normalizedTrend,
    context: normalizedContext,
  });

  return {
    trend: {
      trendName: normalizedTrend,
      summary: [
        'The project owner supplied this developer-culture trend directly as the creative premise.',
        normalizedContext ? `Owner context: ${normalizedContext}` : '',
      ]
        .filter(Boolean)
        .join(' '),
      memeMechanic:
        'Translate the supplied team in-joke into original abstract garment language without copying its wording onto the garment.',
      teamConnection:
        'The premise is explicitly identified by the project owner as a current team-relevant signal; it is not represented as X research.',
      originalPhrases: [],
      visualMetaphors: ['contrast', 'signal shift', 'repetition', 'release'],
    },
    decision: {
      artDirectionEligible: true,
      publishEligible: false,
      reason: 'Owner-supplied premise is eligible for preview art direction only.',
      fingerprint: `owner:${inputHash}`,
      safeOriginalPhrases: [],
      evidencePostIds: [],
      score: null,
    },
    inputHash,
    identityHash,
  };
}

export function buildOwnerTrendPreviewProduct({
  existingProducts = [],
  baseProduct,
  recipe,
  trend,
  context = '',
  inputHash,
  identityHash,
  unitAmount = 8_800,
  currency = 'USD',
} = {}) {
  if (baseProduct?.alias !== AOP_BASE_ALIAS) {
    throw new Error(`Owner-trend previews require ${AOP_BASE_ALIAS}`);
  }
  if (!recipe?.conceptId || !recipe?.title) {
    throw new Error('Owner-trend preview requires a complete garment recipe');
  }
  if (!/^[a-f0-9]{64}$/.test(String(inputHash || ''))) {
    throw new Error('Owner-trend preview requires a canonical input hash');
  }

  const normalizedTrend = normalizeOwnerText(trend, {
    label: 'Owner-supplied trend',
    maximum: 240,
    required: true,
  });
  const normalizedContext = normalizeOwnerText(context, {
    label: 'Owner-supplied context',
    maximum: 600,
    required: false,
  });
  const canonicalIdentityHash =
    identityHash ||
    ownerTrendIdentityHash({trend: normalizedTrend, context: normalizedContext});
  const desiredSlug = `${slugify(recipe.title)}-preview`;
  const slug = uniqueSlug(desiredSlug, existingProducts);
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

  const product = {
    id: `preview-${inputHash.slice(0, 12)}-${slug}`,
    slug,
    title: recipe.title,
    workflow: {status: 'draft', updatedAt: new Date().toISOString()},
    category: 'Build Week Preview',
    description:
      'A preview-only all-over cotton garment generated from a trend supplied directly by the project owner.',
    meme: {
      source: `Owner-supplied trend: ${normalizedTrend}`,
      brief: [
        'Create an original six-panel garment system from the owner-supplied premise.',
        normalizedContext
          ? 'The owner also supplied a creative clarification that is bound into the private input hash.'
          : '',
        'Do not represent this input as X research or reproduce protected names, marks, post language, screenshots, usernames, or likenesses.',
      ]
        .filter(Boolean)
        .join(' '),
      rightsNote:
        'Owner-supplied premise translated into an original abstract apparel system. No X evidence is claimed; no official logos, company marks, copied post language, screenshots, usernames, likenesses, or protected product layouts may appear.',
    },
    signals: {
      profile: OWNER_TREND_PROFILE,
      queries: [],
      sources: [],
    },
    commerce: {
      handle: slug,
      unitAmount: Math.round(unitAmount),
      currency: String(currency).toUpperCase(),
      tags: ['build-week-preview', 'sweatshirt', 'all-over-cotton'],
      variants: (baseProduct.variants || []).map((variant) =>
        previewCommerceVariant(slug, variant),
      ),
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
        `assets/mockups/${slug}-catalog.png`,
        `assets/mockups/${slug}-front.png`,
        `assets/mockups/${slug}-back.png`,
        `assets/mockups/${slug}-patterns.png`,
      ],
    },
    prompts: [recipe.visualPrompt],
    workflowNotes: [
      'Trend premise was supplied directly by the owner; no X posts, authors, or engagement records were fabricated.',
      'Preview-only candidate: generated for a Vercel Preview deployment, not approved for Printful synchronization, publication, checkout, or production release.',
      'GPT-5.6 supplies structured art direction and evaluates the actual deterministic garment renders; exact text and production panels are composed locally.',
    ],
    artDirector: {
      mode: 'gpt-5.6-owner-trend-preview',
      selectedConceptId: recipe.conceptId,
      recipe,
      aopSpec: recipeToAopSpec(recipe),
    },
    automation: {
      pipelineVersion: OWNER_TREND_PREVIEW_PIPELINE,
      inputMode: OWNER_TREND_PROFILE,
      inputHash,
      identityHash: canonicalIdentityHash,
      ownerContextProvided: Boolean(normalizedContext),
      previewOnly: true,
      releaseEligible: false,
      evidenceCount: 0,
    },
    approval: {
      approvedAt: null,
      approvedBy: null,
      notes:
        'Preview only. A separate sourced research run, human approval, provider synchronization, and explicit release authority are required before publication.',
    },
  };

  assertOwnerTrendPreviewProduct(product);
  return product;
}

export function findOwnerTrendPreview(products, inputHash, identityHash) {
  return (products || []).find(
    (product) =>
      product.automation?.pipelineVersion === OWNER_TREND_PREVIEW_PIPELINE &&
      (product.automation?.inputHash === inputHash ||
        (identityHash && product.automation?.identityHash === identityHash)),
  );
}

export function assertOwnerTrendPreviewProduct(product) {
  const issues = [];
  if (product?.automation?.pipelineVersion !== OWNER_TREND_PREVIEW_PIPELINE) {
    issues.push('unexpected pipeline version');
  }
  if (product?.automation?.previewOnly !== true) issues.push('previewOnly must be true');
  if (product?.automation?.releaseEligible !== false) {
    issues.push('releaseEligible must be false');
  }
  if (!/^[a-f0-9]{64}$/.test(String(product?.automation?.identityHash || ''))) {
    issues.push('owner identity hash must be canonical');
  }
  if (product?.automation?.runKey || product?.automation?.runId) {
    issues.push('owner preview must not impersonate an automated weekly run');
  }
  if (product?.signals?.profile !== OWNER_TREND_PROFILE) {
    issues.push('signal profile must identify owner-supplied input');
  }
  if ((product?.signals?.queries || []).length) issues.push('X queries must be empty');
  if ((product?.signals?.sources || []).length) issues.push('X sources must be empty');
  if (product?.providerRefs?.printful?.productId != null) {
    issues.push('Printful product ID must be empty');
  }
  if (product?.providerRefs?.printful?.mockupTaskKey != null) {
    issues.push('Printful mockup task key must be empty');
  }
  if ((product?.providerRefs?.printful?.variants || []).length) {
    issues.push('Printful variant mappings must be empty');
  }
  if ((product?.commerce?.variants || []).some((variant) => variant.availableForSale)) {
    issues.push('preview variants must not be available for sale');
  }
  if (!['draft', 'generated'].includes(product?.workflow?.status)) {
    issues.push('preview workflow status must remain draft or generated');
  }
  if (product?.approval?.approvedAt || product?.approval?.approvedBy) {
    issues.push('preview must not carry publication approval');
  }
  if (issues.length) {
    throw new Error(`Unsafe owner-trend preview product: ${issues.join('; ')}`);
  }
  return product;
}

export function ownerTrendPreviewAssetPaths(product) {
  return [
    product?.assets?.artwork,
    ...(product?.assets?.printFiles || []).map((file) => file.path),
    ...(product?.assets?.mockups || []),
    ...(product?.assets?.customerPhotos || []),
  ].filter(Boolean);
}

function normalizeOwnerText(value, {label, maximum, required}) {
  const raw = String(value || '');
  if (/\p{Cc}/u.test(raw)) throw new Error(`${label} must not contain control characters`);
  const normalized = raw.trim().replace(/\s+/g, ' ');
  if (required && !normalized) throw new Error(`${label} is required`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be at most ${maximum} characters`);
  }
  return normalized;
}

function ownerTrendIdentityHash({trend, context}) {
  return hashJson({
    pipelineVersion: OWNER_TREND_PREVIEW_PIPELINE,
    trend: trend.normalize('NFKC').toLocaleLowerCase('en-US'),
    context: context.normalize('NFKC').toLocaleLowerCase('en-US'),
  });
}

function previewCommerceVariant(slug, variant) {
  return {
    id: `${slug}:${variant.providerVariantId}`,
    sku: `${slug}-${variant.color}-${variant.size}`
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, ''),
    color: variant.color,
    size: variant.size,
    providerVariantId: variant.providerVariantId,
    availableForSale: false,
    selectedOptions: [
      {name: 'Color', value: variant.color},
      {name: 'Size', value: variant.size},
    ],
  };
}

function uniqueSlug(desired, products) {
  const slugs = new Set((products || []).map((product) => product.slug));
  if (!slugs.has(desired)) return desired;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${desired}-${index}`;
    if (!slugs.has(candidate)) return candidate;
  }
  throw new Error(`Could not allocate a unique preview slug for ${desired}`);
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
