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
  /\b(?:add|draw|feature|include|show|use|uses|using|with)\b[^.]{0,72}\b(?:archway|character|clock|cloud|door|doorway|gateway|hourglass|illustration|logo|mascot|photograph|portal|semaphore|storm|traffic light|tunnel)\b|\b(?:large|literal)\s+(?:archway|character|clock|cloud|door|doorway|gateway|hourglass|illustration|logo|mascot|photograph|portal|semaphore|storm|traffic light|tunnel)\b/i;
const upperAsciiDisplayCopy = /^[A-Z0-9][A-Z0-9 .,/&+:#()'!?-]*$/;
const asciiTitle = /^[A-Za-z0-9][A-Za-z0-9 .,/&+:#()'!?-]*$/;

export const WEEKLY_RENDERER_CONTRACT = {
  aestheticWorlds: {
    'sf-skate':
      'Bay Area skate-poster energy with oversized type, deck-strip geometry, hard contrast, and irreverent spacing.',
    'coastal-surf':
      'Northern California surf-club energy with sun bands, rolling stripes, rounded type, and relaxed rhythm.',
    'zine-punk':
      'Photocopied zine and gig-poster energy with condensed type, halftone texture, diagonals, and abrupt scale shifts.',
    'sports-club':
      'A fictional local-club uniform with varsity type, badge geometry, racing bands, and bilateral sleeve logic.',
    'lab-utility':
      'A technical workshop uniform with monospace labels, grids, status systems, and engineered panel logic.',
    'minimal-type':
      'A radical type-led garment with one enormous phrase, sharp negative space, and minimal supporting furniture.',
  },
  typeSystems: {
    'grotesk-poster': 'Heavy grotesk display type with compact sans-serif support copy.',
    'serif-editorial': 'High-contrast editorial serif display type with restrained sans-serif support copy.',
    'mono-utility': 'Monospaced display and utility copy with engineered spacing.',
    'rounded-surf': 'Rounded heavy display type with relaxed sans-serif support copy.',
    'varsity-block': 'Wide block display type with compact athletic support copy.',
    'condensed-zine': 'Condensed poster display type with narrow photocopy-style support copy.',
  },
  basePatterns: {
    microgrid:
      'A quiet microgrid fabric field with no independent custom torso symbol.',
    pinstripe:
      'A vertical pinstripe field plus a centered rectangular aperture or window, side connectors, and one accent bar.',
    'status-isobar-map':
      'Three sparse nested angular isobar or contour outlines plus one short accent path.',
    'queue-radar':
      'Branching queue lines on the left, a vertical clearing boundary, and check marks on the right.',
    checkerboard:
      'A bold two-tone checker field with large production-safe squares.',
    'sun-stripes':
      'Wide horizontal sun bands with a flat rising-disc geometry and no gradient.',
    'halftone-noise':
      'A deterministic field of large halftone dots with a cropped poster block.',
    'wavy-bands':
      'Broad rolling horizontal bands that move across the garment like an abstract swell.',
  },
  layouts: {
    'offset-ledger':
      'An asymmetric front header and text block, offset from center, with the renderer-backed body motif.',
    'center-monument':
      'Centered primary typography and geometry organized on one central axis.',
    'split-field':
      'A left-weighted primary text field and a vertical accent divider on the right.',
    'giant-type':
      'One oversized hero phrase dominates the torso with radical negative space and minimal support copy.',
    'badge-stack':
      'A large original circular badge system anchors the torso with stacked type and bilateral balance.',
    'horizon-band':
      'The hero phrase sits across a broad horizontal band with open space above and movement below.',
    'diagonal-poster':
      'A rotated poster block and diagonal support rule create an asymmetric zine composition.',
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
    'racing-stripe':
      'Two broad longitudinal stripes and one narrow accent stripe run down each sleeve.',
    'checker-cuff':
      'A large checker field resolves into a strong checked cuff band.',
    'sun-wave':
      'Three broad rolling wave lines and one flat accent sun move down each sleeve.',
    'badge-repeat':
      'Three original geometric badge rings repeat vertically with alternating accent fills.',
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
  recentProducts = [],
  requiredDisplayPhrase,
  inputMode,
  runKey,
  model = process.env.OPENAI_TEXT_MODEL || DEFAULT_OPENAI_TEXT_MODEL,
  reasoningEffort = process.env.OPENAI_ART_REASONING_EFFORT || 'medium',
  modelOutput,
  env = process.env,
} = {}) {
  if (!decision?.publishEligible && !decision?.artDirectionEligible) {
    throw new Error(
      'Art direction requires a research-approved trend or an explicit preview-only art-direction decision',
    );
  }

  if (modelOutput) {
    return {
      output: validateWeeklyOutput('artDirection', modelOutput),
      response: {responseId: 'offline-fixture', model: 'offline-fixture', usage: null},
    };
  }

  const instructions = await readFile(artPromptUrl, 'utf8');
  const mandatoryDisplayPhrase = toTrendDisplayPhrase(
    requiredDisplayPhrase || trend.trendName,
  );
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
        creativeAuthority: {
          inputMode:
            inputMode || (decision.publishEligible ? 'weekly-derived-trend' : 'owner-supplied-trend'),
          mandatoryDisplayPhrase,
          literalDisplayPhraseAuthorized: true,
          candidateOrderIsFinalArtDirectorPreference: true,
          downstreamScoresAreAdvisory: true,
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
          creativeMandate: artDirection?.creativeMandate,
          aestheticWorlds: artDirection?.aestheticWorlds,
        },
        recentProductTitles: recentProductTitles.slice(-8),
        recentDesignSignatures: recentProducts
          .slice(-8)
          .map(recentDesignSignature)
          .filter(Boolean),
      }),
    },
    env,
  );

  return {
    output: validateWeeklyOutput('artDirection', response.value),
    response: responseMetadata(response),
  };
}

export function toTrendDisplayPhrase(value) {
  const phrase = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 .,/&+:#()'!?-]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (!phrase) throw new Error('Trend must produce printable hero copy');
  if (phrase.length > 36) {
    throw new Error('Trend hero copy must be at most 36 printable characters');
  }
  return phrase;
}

function recentDesignSignature(product) {
  const spec = product?.artDirector?.aopSpec;
  if (!spec) return null;
  return {
    title: String(product?.title || '').slice(0, 80),
    aestheticWorld: spec.aestheticWorld || null,
    typeSystem: spec.typeSystem || null,
    layout: spec.layout || null,
    basePattern: spec.basePattern || null,
    sleeveStyle: spec.sleeves?.style || null,
    palette: spec.palette || null,
  };
}

export function rankGarmentRecipes(
  output,
  {sourceTexts = [], requiredDisplayPhrase} = {},
) {
  const mandatoryDisplayPhrase = requiredDisplayPhrase
    ? toTrendDisplayPhrase(requiredDisplayPhrase)
    : null;
  const combinationCounts = new Map();
  const worldCounts = new Map();
  const typeCounts = new Map();
  for (const candidate of output.candidates || []) {
    const combination = creativeSignature(candidate);
    combinationCounts.set(combination, (combinationCounts.get(combination) || 0) + 1);
    worldCounts.set(
      candidate.aestheticWorld,
      (worldCounts.get(candidate.aestheticWorld) || 0) + 1,
    );
    typeCounts.set(
      candidate.typeSystem,
      (typeCounts.get(candidate.typeSystem) || 0) + 1,
    );
  }

  return (output.candidates || [])
    .map((candidate, index) => {
      const productText = protectedTermReviewText(candidate, mandatoryDisplayPhrase);
      const combination = creativeSignature(candidate);
      const checks = {
        lowRightsRisk: candidate.rightsRisk === 'low',
        noProtectedProductTerms: !protectedTerms.test(productText),
        noSourceTextOverlap: !candidateCopiesSource(candidate, sourceTexts, {
          allowedDisplayPhrase: mandatoryDisplayPhrase,
        }),
        trendPhrasePresent:
          mandatoryDisplayPhrase == null ||
          normalizedDisplayCopy(candidate.front?.primaryText) === mandatoryDisplayPhrase,
        displayCopyQuality: hasProductionReadyDisplayCopy(candidate),
        rendererFaithful: matchesRendererContract(candidate),
        distinctRendererRecipe: combinationCounts.get(combination) === 1,
        distinctCreativeWorld: worldCounts.get(candidate.aestheticWorld) === 1,
        distinctTypeSystem: typeCounts.get(candidate.typeSystem) === 1,
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
            (combinationCounts.get(combination) || 1) - 1,
          ) * 5,
      );
      return {
        candidate,
        originalIndex: index,
        eligible: [
          'lowRightsRisk',
          'noProtectedProductTerms',
          'noSourceTextOverlap',
          'trendPhrasePresent',
          'displayCopyQuality',
          'rendererFaithful',
          'distinctRendererRecipe',
          'distinctCreativeWorld',
          'distinctTypeSystem',
          'completePanels',
        ].every((check) => checks[check]),
        checks,
        weightedScore,
      };
    })
    .sort(
      (left, right) =>
        Number(right.eligible) - Number(left.eligible) ||
        left.originalIndex - right.originalIndex,
    );
}

function protectedTermReviewText(candidate, mandatoryDisplayPhrase) {
  const heroCopy = String(candidate.front?.primaryText || '');
  const exactAuthorizedHero =
    mandatoryDisplayPhrase != null &&
    normalizedDisplayCopy(heroCopy) === mandatoryDisplayPhrase;
  const reviewHero = exactAuthorizedHero
    ? heroCopy.replace(/\bcodex\b/gi, '')
    : heroCopy;
  return JSON.stringify({
    title: candidate.title,
    rationale: candidate.rationale,
    brandLabel: candidate.brandLabel,
    provenanceLine: candidate.provenanceLine,
    front: {...candidate.front, primaryText: reviewHero},
    back: candidate.back,
    sleeves: candidate.sleeves,
    label: candidate.label,
    visualPrompt: candidate.visualPrompt,
  });
}

function creativeSignature(candidate) {
  return [
    candidate.aestheticWorld,
    candidate.typeSystem,
    candidate.basePattern,
    candidate.layout,
    candidate.sleeves?.style,
  ].join(':');
}

function normalizedDisplayCopy(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase();
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
  if (!WEEKLY_RENDERER_CONTRACT.aestheticWorlds[candidate.aestheticWorld]) return false;
  if (!WEEKLY_RENDERER_CONTRACT.typeSystems[candidate.typeSystem]) return false;
  const descriptiveText = [
    candidate.rationale,
    candidate.sleeves?.motif,
    candidate.visualPrompt,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(
      /\b(?:no|without)\s+(?:archways?|characters?|clocks?|clouds?|doors?|doorways?|gateways?|hourglasses?|illustrations?|logos?|mascots?|photographs?|portals?|semaphores?|storms?|traffic lights?|tunnels?)\b/g,
      '',
    );
  if (unsupportedRendererClaims.test(descriptiveText)) return false;

  const expected = {
    aestheticWorld: {
      'sf-skate': [[/\bskate\b|\bdeck[- ]strip\b|\bposter\b/]],
      'coastal-surf': [[/\bsurf\b|\bcoastal\b|\bsun bands?\b|\bswell\b/]],
      'zine-punk': [[/\bzine\b|\bphotocop(?:y|ied)\b|\bgig[- ]poster\b/]],
      'sports-club': [[/\bclub\b|\bvarsity\b|\bathletic\b|\buniform\b/]],
      'lab-utility': [[/\blab\b|\butility\b|\bworkshop\b|\btechnical\b/]],
      'minimal-type': [[/\bminimal\b|\bnegative space\b|\btype[- ]led\b/]],
    },
    typeSystem: {
      'grotesk-poster': [[/\bgrotesk\b|\bposter type\b|\bheavy sans\b/]],
      'serif-editorial': [[/\bserif\b|\beditorial\b/]],
      'mono-utility': [[/\bmono(?:space|spaced)?\b|\butility type\b/]],
      'rounded-surf': [[/\brounded\b|\bsurf type\b/]],
      'varsity-block': [[/\bvarsity\b|\bblock type\b|\bathletic type\b/]],
      'condensed-zine': [[/\bcondensed\b|\bzine type\b|\bnarrow type\b/]],
    },
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
      checkerboard: [[/\bchecker(?:board|ed)?\b/]],
      'sun-stripes': [[/\bsun bands?\b|\bsun stripes?\b|\brising disc\b/]],
      'halftone-noise': [[/\bhalftone\b/], [/\bdots?\b|\bposter block\b/]],
      'wavy-bands': [[/\bwavy bands?\b|\brolling bands?\b|\babstract swell\b/]],
    },
    layout: {
      'offset-ledger': [[/\basymmetric\b|\boffset\b/]],
      'center-monument': [[/\bcenter(?:ed)?\b|\bcentral axis\b/]],
      'split-field': [
        [/\bleft[- ]weighted\b|\bsplit field\b/],
        [/\bvertical (?:accent )?divider\b/],
      ],
      'giant-type': [[/\bgiant type\b|\boversized (?:hero )?phrase\b/]],
      'badge-stack': [[/\bbadge (?:stack|system)\b|\bcircular badge\b/]],
      'horizon-band': [[/\bhorizon band\b|\bhorizontal band\b/]],
      'diagonal-poster': [[/\bdiagonal poster\b|\brotated poster\b/]],
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
      'racing-stripe': [[/\bracing stripes?\b|\blongitudinal stripes?\b/]],
      'checker-cuff': [[/\bchecker(?:ed)? cuff\b|\bchecked cuff\b/]],
      'sun-wave': [[/\bsun wave\b|\brolling wave lines?\b/]],
      'badge-repeat': [[/\bbadge rings?\b|\brepeating badges?\b/]],
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

function candidateCopiesSource(candidate, sourceTexts, {allowedDisplayPhrase} = {}) {
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
  const allowed = normalizedWords(allowedDisplayPhrase);
  return candidateStrings.map(normalizedWords).filter(Boolean).filter(
    (candidateText) => !allowed || candidateText !== allowed,
  ).some((candidateText) =>
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
  const criticalDefects = output.criticalDefects || [];
  const passed =
    output.decision !== 'quarantine' &&
    criticalDefects.length === 0;
  return {
    passed,
    decision: passed ? 'pass' : output.decision === 'quarantine' ? 'quarantine' : 'revise',
    authority: 'art-director',
    scoresAdvisory: true,
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
