import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {
  createStructuredResponse,
  DEFAULT_OPENAI_TEXT_MODEL,
} from '../adapters/openai-responses.mjs';
import {validateWeeklyOutput, weeklySchema} from './weekly-schemas.mjs';

const artPromptUrl = new URL('../prompts/weekly-art-director.md', import.meta.url);
const criticPromptUrl = new URL('../prompts/weekly-visual-critic.md', import.meta.url);
const protectedTerms =
  /\b(?:openai|chatgpt|gpt(?:[- ]?\d+(?:\.\d+)?)?|codex|sora|supreme|nike|adidas)\b|https?:\/\/|@[a-z0-9_]+/i;
const unsupportedRendererClaims =
  /\b(?:archway|character|clock|cloud|door|doorway|gateway|hourglass|illustration|logo|mascot|photograph|portal|semaphore|storm|traffic light|tunnel)\b/i;
const upperAsciiDisplayCopy = /^[A-Z0-9][A-Z0-9 .,/&+:#()'!?-]*$/;
const asciiTitle = /^[A-Za-z0-9][A-Za-z0-9 .,/&+:#()'!?-]*$/;

export const WEEKLY_RENDERER_CONTRACT = {
  basePatterns: {
    microgrid:
      'A quiet microgrid fabric field with no independent custom torso symbol.',
    pinstripe:
      'A vertical pinstripe field plus a centered rectangular aperture or window, side connectors, and one accent bar.',
    'status-isobar-map':
      'Three sparse nested angular isobar or contour outlines plus one short accent path.',
    'queue-radar':
      'Branching queue lines on the left, a vertical clearing boundary, and check marks on the right.',
  },
  layouts: {
    'offset-ledger':
      'An asymmetric front header and text block, offset from center, with the renderer-backed body motif.',
    'center-monument':
      'Centered primary typography and geometry organized on one central axis.',
    'split-field':
      'A left-weighted primary text field and a vertical accent divider on the right.',
  },
  sleeveStyles: {
    wave:
      'Stepped branch lines on both sleeves with fewer lines and two clearing checks on the right sleeve.',
    'glyph-stack':
      'A stack of abstract shape-only nodes; the motif contains no letters, digits, words, code, or interface tokens.',
    'radar-rings':
      'Three concentric rings with a crosshair and a mirrored accent notch.',
    ladder:
      'Two vertical rails, nine rungs, and one accent rung at a different position on each sleeve.',
  },
  fidelityRule:
    'Rationale, sleeve motif, and visual prompt may only claim the visible primitives listed here. Do not invent extra figurative geometry.',
};

export async function directWeeklyGarment({
  trend,
  decision,
  baseProduct,
  artDirection,
  recentProductTitles = [],
  runKey,
  model = process.env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_TEXT_MODEL,
  reasoningEffort = process.env.OPENAI_ART_REASONING_EFFORT || 'medium',
  modelOutput,
  env = process.env,
} = {}) {
  if (!decision?.publishEligible) {
    throw new Error('Art direction requires a trend that passed deterministic gates');
  }

  if (modelOutput) {
    return {
      output: validateWeeklyOutput('artDirection', modelOutput),
      response: {responseId: 'offline-fixture', model: 'offline-fixture', usage: null},
    };
  }

  const instructions = await readFile(artPromptUrl, 'utf8');
  const response = await createStructuredResponse(
    {
      model,
      reasoningEffort,
      schema: weeklySchema('artDirection'),
      schemaName: 'weekly_garment_recipes',
      instructions,
      metadata: {pipeline: 'weekly-merch-v1', run_key: runKey || 'manual'},
      input: JSON.stringify({
        approvedTrend: {
          name: trend.trendName,
          summary: trend.summary,
          memeMechanic: trend.memeMechanic,
          teamConnection: trend.teamConnection,
          originalPhrases: decision.safeOriginalPhrases,
          visualMetaphors: trend.visualMetaphors,
          fingerprint: decision.fingerprint,
        },
        production: {
          garment: baseProduct?.title,
          technique: 'All-Over Cotton',
          placements: (baseProduct?.placements || []).map((placement) => ({
            area: placement.area,
            width: placement.width,
            height: placement.height,
          })),
          rendererContract: WEEKLY_RENDERER_CONTRACT,
        },
        houseDirection: {
          positioning: artDirection?.positioning,
          visualRules: artDirection?.visualRules,
          aopGarmentRules: artDirection?.aopGarmentRules,
          negativePromptRules: artDirection?.negativePromptRules,
        },
        recentProductTitles: recentProductTitles.slice(-8),
      }),
    },
    env,
  );

  return {
    output: validateWeeklyOutput('artDirection', response.value),
    response: responseMetadata(response),
  };
}

export function rankGarmentRecipes(output, {sourceTexts = []} = {}) {
  const combinationCounts = new Map();
  for (const candidate of output.candidates || []) {
    const combination = `${candidate.basePattern}:${candidate.layout}:${candidate.sleeves.style}`;
    combinationCounts.set(combination, (combinationCounts.get(combination) || 0) + 1);
  }

  return (output.candidates || [])
    .map((candidate, index) => {
      const productText = JSON.stringify({
        title: candidate.title,
        rationale: candidate.rationale,
        brandLabel: candidate.brandLabel,
        provenanceLine: candidate.provenanceLine,
        front: candidate.front,
        back: candidate.back,
        sleeves: candidate.sleeves,
        label: candidate.label,
        visualPrompt: candidate.visualPrompt,
      });
      const combination = `${candidate.basePattern}:${candidate.layout}:${candidate.sleeves.style}`;
      const checks = {
        lowRightsRisk: candidate.rightsRisk === 'low',
        noProtectedProductTerms: !protectedTerms.test(productText),
        noSourceTextOverlap: !candidateCopiesSource(candidate, sourceTexts),
        displayCopyQuality: hasProductionReadyDisplayCopy(candidate),
        rendererFaithful: matchesRendererContract(candidate),
        distinctRendererRecipe: combinationCounts.get(combination) === 1,
        productionScores:
          candidate.scores?.productionSafety >= 7 && candidate.scores?.rightsSafety >= 8,
        completePanels: Boolean(
          candidate.front?.primaryText &&
            candidate.back?.statement &&
            candidate.sleeves?.motif &&
            candidate.sleeves?.leftText &&
            candidate.sleeves?.rightText &&
            candidate.label?.line,
        ),
      };
      const weightedScore = Math.round(
        candidate.scores.conceptClarity * 1.5 +
          candidate.scores.garmentCoherence * 2 +
          candidate.scores.memeLegibility * 1.5 +
          candidate.scores.originality +
          candidate.scores.productionSafety * 2 +
          candidate.scores.rightsSafety * 2 -
          Math.max(
            0,
            (combinationCounts.get(
              `${candidate.basePattern}:${candidate.layout}:${candidate.sleeves.style}`,
            ) || 1) - 1,
          ) * 5,
      );
      return {
        candidate,
        originalIndex: index,
        eligible: Object.values(checks).every(Boolean),
        checks,
        weightedScore,
      };
    })
    .sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        right.weightedScore - left.weightedScore ||
        left.candidate.conceptId.localeCompare(right.candidate.conceptId),
    );
}

function hasProductionReadyDisplayCopy(candidate) {
  const displayCopy = [
    candidate.brandLabel,
    candidate.provenanceLine,
    candidate.front?.primaryText,
    candidate.front?.chestLabel,
    candidate.front?.mark,
    candidate.front?.subline,
    candidate.back?.statement,
    candidate.back?.subline,
    candidate.sleeves?.leftText,
    candidate.sleeves?.rightText,
    candidate.sleeves?.caption,
    candidate.label?.line,
  ];
  return isProductionTitle(candidate.title) && displayCopy.every(isUpperAsciiCopy);
}

function isProductionTitle(value) {
  const text = String(value || '');
  if (
    text !== text.trim() ||
    !asciiTitle.test(text) ||
    !/[A-Za-z]/.test(text) ||
    /\s{2,}/.test(text)
  ) {
    return false;
  }
  return (text.match(/[A-Za-z]+/g) || []).every(
    (word) => /^[A-Z]+$/.test(word) || /^[A-Z][a-z]+$/.test(word),
  );
}

function isUpperAsciiCopy(value) {
  const text = String(value || '');
  return (
    text === text.trim() &&
    upperAsciiDisplayCopy.test(text) &&
    /[A-Z]/.test(text) &&
    !/\s{2,}/.test(text)
  );
}

function matchesRendererContract(candidate) {
  const descriptiveText = [
    candidate.rationale,
    candidate.sleeves?.motif,
    candidate.visualPrompt,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (unsupportedRendererClaims.test(descriptiveText)) return false;

  const expected = {
    basePattern: {
      microgrid: [[/\bmicrogrid\b|\bmicro grid\b/]],
      pinstripe: [
        [/\bpinstripes?\b|\bvertical stripes?/],
        [/\baperture\b|\brectangular window\b/],
      ],
      'status-isobar-map': [
        [/\bisobar\b|\bcontour\b/],
        [/\bnested\b|\bangular\b/],
      ],
      'queue-radar': [
        [/\bbranch(?:ed|es|ing)?\b|\bqueue lines?\b/],
        [/\bchecks?\b|\bclearing marks?\b/],
      ],
    },
    layout: {
      'offset-ledger': [[/\basymmetric\b|\boffset\b/]],
      'center-monument': [[/\bcenter(?:ed)?\b|\bcentral axis\b/]],
      'split-field': [
        [/\bleft[- ]weighted\b|\bsplit field\b/],
        [/\bvertical (?:accent )?divider\b/],
      ],
    },
    sleeveStyle: {
      wave: [
        [/\bstepped\b|\bbranch lines?\b/],
        [/\bchecks?\b|\bclearing marks?\b/],
      ],
      'glyph-stack': [
        [/\bshape[- ]only\b|\babstract (?:shape )?nodes?\b/],
      ],
      'radar-rings': [
        [/\bconcentric rings?\b/],
        [/\bcrosshair\b|\baccent notch\b/],
      ],
      ladder: [
        [/\brails?\b/],
        [/\brungs?\b/],
      ],
    },
  };

  return [
    expected.basePattern[candidate.basePattern],
    expected.layout[candidate.layout],
    expected.sleeveStyle[candidate.sleeves?.style],
  ].every(
    (groups) =>
      Array.isArray(groups) &&
      groups.every((alternatives) => alternatives.some((pattern) => pattern.test(descriptiveText))),
  );
}

function candidateCopiesSource(candidate, sourceTexts) {
  const sources = sourceTexts.map(normalizedWords).filter(Boolean);
  const candidateStrings = [
    candidate.title,
    candidate.rationale,
    candidate.brandLabel,
    candidate.provenanceLine,
    candidate.front?.primaryText,
    candidate.front?.chestLabel,
    candidate.front?.mark,
    candidate.front?.subline,
    candidate.back?.statement,
    candidate.back?.subline,
    candidate.sleeves?.motif,
    candidate.sleeves?.leftText,
    candidate.sleeves?.rightText,
    candidate.sleeves?.caption,
    candidate.label?.line,
    candidate.visualPrompt,
  ];
  return candidateStrings.map(normalizedWords).filter(Boolean).some((candidateText) =>
    sources.some((sourceText) => hasDistinctiveNgramOverlap(candidateText, sourceText)),
  );
}

const overlapStopWords = new Set([
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'is', 'it', 'of',
  'on', 'or', 'the', 'to', 'with',
]);

function hasDistinctiveNgramOverlap(left, right) {
  const leftTokens = left.split(' ').filter(Boolean);
  const rightTokens = right.split(' ').filter(Boolean);
  for (const size of [3, 2]) {
    const rightNgrams = new Set(ngrams(rightTokens, size));
    for (const phrase of ngrams(leftTokens, size)) {
      const tokens = phrase.split(' ');
      const distinctive =
        size >= 3 ||
        (phrase.replaceAll(' ', '').length >= 10 &&
          tokens.every((token) => token.length >= 4 && !overlapStopWords.has(token)));
      if (distinctive && rightNgrams.has(phrase)) return true;
    }
  }
  return false;
}

function ngrams(tokens, size) {
  if (tokens.length < size) return [];
  return Array.from(
    {length: tokens.length - size + 1},
    (_, index) => tokens.slice(index, index + size).join(' '),
  );
}

function normalizedWords(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export async function critiqueWeeklyGarment({
  product,
  recipe,
  imagePaths,
  prepress,
  runKey,
  model = process.env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_TEXT_MODEL,
  reasoningEffort = process.env.OPENAI_CRITIC_REASONING_EFFORT || 'medium',
  modelOutput,
  env = process.env,
} = {}) {
  if (modelOutput) {
    return {
      output: validateWeeklyOutput('visualCritic', modelOutput),
      response: {responseId: 'offline-fixture', model: 'offline-fixture', usage: null},
    };
  }

  const instructions = await readFile(criticPromptUrl, 'utf8');
  const selectedImagePaths = (imagePaths || []).slice(0, 6);
  const inputImages = await Promise.all(selectedImagePaths.map(imageContent));
  const response = await createStructuredResponse(
    {
      model,
      reasoningEffort,
      schema: weeklySchema('visualCritic'),
      schemaName: 'weekly_visual_critic',
      instructions,
      metadata: {pipeline: 'weekly-merch-v1', run_key: runKey || 'manual'},
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify(
                buildVisualCriticContext({
                  product,
                  recipe,
                  imagePaths: selectedImagePaths,
                  prepress,
                }),
              ),
            },
            ...inputImages,
          ],
        },
      ],
    },
    env,
  );

  return {
    output: validateWeeklyOutput('visualCritic', response.value),
    response: responseMetadata(response),
  };
}

export function buildVisualCriticContext({
  product,
  recipe,
  imagePaths = [],
  prepress,
} = {}) {
  const expectedPlacements = (product?.production?.placements || []).map(
    (placement) => compactPlacement(placement),
  );
  const validatedPlacements = (prepress?.files || []).map((file) =>
    compactPlacement(file),
  );
  const status = prepress == null ? 'not_provided' : prepress.ok === true ? 'passed' : 'failed';

  return {
    product: {
      title: String(product?.title || '').slice(0, 200),
      technique: String(product?.production?.technique || '').slice(0, 100),
    },
    recipe,
    renderOrder: imagePaths.slice(0, 6).map((file, index) => {
      const role = criticRenderRole(product, file);
      return {
        image: index + 1,
        role,
        presentation:
          role === 'label_panel' || role === 'label_inside'
            ? 'rectangular direct-placement preview'
            : role === 'pattern_sheet'
              ? 'rectangular multi-panel artwork preview'
              : role.endsWith('_mockup') || role === 'customer_photo'
                ? 'garment view'
                : 'supporting render',
      };
    }),
    deterministicPrepress: {
      validator: 'weekly-prepress-v1',
      status,
      exactProviderDimensionsValidated: status === 'passed',
      requiredPlacementCount: expectedPlacements.length,
      validatedPlacementCount: validatedPlacements.length,
      issueCount: Array.isArray(prepress?.issues) ? prepress.issues.length : 0,
      expectedPlacements,
      validatedPlacements,
    },
  };
}

export function evaluateVisualCritic(output) {
  const coreScores = Object.values(output.scores || {});
  const passed =
    output.decision === 'pass' &&
    output.overallScore >= 80 &&
    coreScores.length === 6 &&
    coreScores.every((score) => score >= 7) &&
    output.criticalDefects.length === 0;
  return {
    passed,
    decision: passed ? 'pass' : output.decision === 'quarantine' ? 'quarantine' : 'revise',
    minimumOverallScore: 80,
    minimumCoreScore: 7,
  };
}

async function imageContent(filePath) {
  const sharp = (await import('sharp')).default;
  const buffer = await sharp(filePath)
    .resize({width: 1_536, height: 1_536, fit: 'inside', withoutEnlargement: true})
    .jpeg({quality: 86})
    .toBuffer();
  return {
    type: 'input_image',
    image_url: `data:image/jpeg;base64,${buffer.toString('base64')}`,
    detail: 'high',
  };
}

function compactPlacement(placement = {}) {
  return {
    area: safeIdentifier(placement.area),
    width: safePixelDimension(placement.width),
    height: safePixelDimension(placement.height),
    format: placement.format == null ? null : safeIdentifier(placement.format),
  };
}

function criticRenderRole(product, file) {
  const basename = path.basename(String(file || '')).toLowerCase();
  const printFile = (product?.assets?.printFiles || []).find(
    (asset) => path.basename(String(asset?.path || '')).toLowerCase() === basename,
  );
  if (printFile?.placement === 'label_panel') return 'label_panel';
  if (printFile?.placement === 'label_inside') return 'label_inside';

  if (/(?:^|-)catalog\.[a-z0-9]+$/i.test(basename)) return 'catalog_mockup';
  if (/(?:^|-)front\.[a-z0-9]+$/i.test(basename)) return 'front_mockup';
  if (/(?:^|-)back\.[a-z0-9]+$/i.test(basename)) return 'back_mockup';
  if (/(?:^|-)patterns\.[a-z0-9]+$/i.test(basename)) return 'pattern_sheet';

  const customerPhoto = (product?.assets?.customerPhotos || []).some(
    (asset) => path.basename(String(asset || '')).toLowerCase() === basename,
  );
  return customerPhoto ? 'customer_photo' : 'supporting_render';
}

function safeIdentifier(value) {
  const identifier = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return identifier || 'unknown';
}

function safePixelDimension(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 100_000 ? number : null;
}

function responseMetadata(response) {
  return {
    responseId: response.responseId,
    model: response.model,
    usage: response.usage,
  };
}
