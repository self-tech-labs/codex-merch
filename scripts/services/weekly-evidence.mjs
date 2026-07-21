import {createHash} from 'node:crypto';
import {lstat, readFile, realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  canonicalJson,
  createWeeklyRunIdentity,
  defaultWeeklyRunRoot,
  hashJson,
} from './weekly-run-store.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export const WEEKLY_EVIDENCE_SCHEMA_VERSION = 'weekly-evidence-v1';

const ARTIFACT_NAMES = [
  'run.json',
  'signal-snapshot.json',
  'trend-model-output.json',
  'trend-decision.json',
  'garment-recipes.json',
  'visual-critic.json',
  'release-plan.json',
  'final-visual-critic.json',
];

const PROMPT_PATHS = new Set([
  'scripts/prompts/weekly-art-director.md',
  'scripts/prompts/weekly-trend.md',
  'scripts/prompts/weekly-visual-critic.md',
]);

const SCHEMA_PATHS = new Set([
  'merch/weekly/schemas/art-direction.schema.json',
  'merch/weekly/schemas/trend.schema.json',
  'merch/weekly/schemas/visual-critic.schema.json',
]);

const RELEASE_STAGES = [
  'prepared',
  'releasing_candidate',
  'pushing_candidate',
  'waiting_candidate_deployment',
  'syncing_provider',
  'finalizing_publication',
  'pushing_final',
  'awaiting_final_deployment',
  'published',
];

const FORBIDDEN_OUTPUT_KEYS = new Set([
  'apikey',
  'authorization',
  'authorid',
  'authorusername',
  'credential',
  'credentials',
  'databaseurl',
  'email',
  'headers',
  'password',
  'posttext',
  'promptinput',
  'publicurl',
  'rawprompt',
  'secret',
  'text',
  'url',
  'webhookbody',
]);

const SECRET_VALUE_PATTERNS = [
  /\b(?:sk|rk|pk)_(?:live|test)_[a-z0-9_-]{8,}\b/i,
  /\b(?:sk|sess|proj)-[a-z0-9_-]{8,}\b/i,
  /\bwhsec_[a-z0-9_-]{8,}\b/i,
  /\bxox(?:a|b|p|r|s)-[a-z0-9-]{8,}\b/i,
  /\bgh(?:p|o|u|s|r)_[a-z0-9]{8,}\b/i,
  /\bBearer\s+[^\s"']+/i,
  /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s,;]+/i,
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/i,
  /(?:^|[-_])(?:api[-_]?key|credential|password|secret)(?:[-_]|$)/i,
];

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s"']+/i;
const EMAIL_PATTERN = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i;
const HANDLE_PATTERN = /(^|[\s"'(])@[a-z0-9_]{1,50}\b/i;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

export async function buildWeeklyEvidence({runId, week, listId, runRoot} = {}) {
  const identity = resolveEvidenceIdentity({runId, week, listId});
  const directory = await resolveRunDirectory(
    identity.runId,
    runRoot || defaultWeeklyRunRoot(),
  );
  const artifacts = {};
  const sourceArtifacts = [];

  for (const name of ARTIFACT_NAMES) {
    const artifact = await readArtifact(directory, name);
    if (!artifact) continue;
    artifacts[name] = artifact.value;
    sourceArtifacts.push({name, sha256: artifact.sha256});
  }

  const run = artifacts['run.json'];
  if (!run) throw new Error(`Weekly run is missing run.json: ${identity.runId}`);
  if (String(run.identity?.runId || '') !== identity.runId) {
    throw new Error('Weekly run identity does not match its artifact directory');
  }
  if (week && run.identity?.isoWeek !== week) {
    throw new Error(`Weekly run reports ${run.identity?.isoWeek}; requested ${week}`);
  }
  if (listId && String(run.identity?.listId) !== String(listId)) {
    throw new Error(`Weekly run reports list ${run.identity?.listId}; requested ${listId}`);
  }

  const privateContext = collectPrivateContext(artifacts);
  const snapshot = artifacts['signal-snapshot.json'];
  const signalEvidence = buildSignalEvidence(run, snapshot);
  const provenance = classifyProvenance(run, snapshot, signalEvidence);
  const trend = buildTrendEvidence(
    artifacts['trend-model-output.json'],
    artifacts['trend-decision.json'],
    privateContext,
  );
  const recipes = buildRecipeEvidence(
    artifacts['garment-recipes.json'],
    privateContext,
  );
  const visualReview = buildVisualEvidence(
    artifacts['visual-critic.json'],
    artifacts['final-visual-critic.json'],
    privateContext,
  );
  const modelCalls = buildModelCalls({
    trend: artifacts['trend-model-output.json'],
    recipes: artifacts['garment-recipes.json'],
    critic: artifacts['visual-critic.json'],
    finalCritic: artifacts['final-visual-critic.json'],
    privateContext,
  });

  const payload = {
    schemaVersion: WEEKLY_EVIDENCE_SCHEMA_VERSION,
    identity: {
      runId: safeReference(run.identity?.runId, privateContext),
      runKey: safeReference(run.identity?.runKey, privateContext),
      isoWeek: safeWeek(run.identity?.isoWeek),
      listId: safeNumericId(run.identity?.listId),
      pipelineVersion: safeReference(run.identity?.pipelineVersion, privateContext),
      timeZone: safeTimeZone(run.identity?.timeZone),
    },
    state: {
      status: safeStatus(run.status),
      startedAt: safeTimestamp(run.startedAt),
      completedAt: safeTimestamp(run.completedAt),
      failedAt: safeTimestamp(run.failedAt),
      publishedAt: safeTimestamp(run.publishedAt),
      failureRecorded: Boolean(run.error),
      failureFingerprint: run.error ? sha256String(run.error) : null,
    },
    provenance,
    definitions: buildDefinitionEvidence(run.definitionHashes),
    signals: signalEvidence,
    modelCalls,
    trend,
    recipes,
    visualReview,
    release: buildReleaseEvidence(
      run,
      artifacts['release-plan.json'],
      artifacts['final-visual-critic.json'],
      privateContext,
    ),
    sourceArtifacts: sourceArtifacts.sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
  };

  assertSubmissionSafeEvidence(payload, privateContext);
  const bundle = {
    ...payload,
    integrity: {
      payloadSha256: hashJson(payload),
      canonicalization: 'RFC-8785-like sorted JSON keys via repository canonicalJson',
      safetyProfile: 'allowlisted metadata; private source content omitted',
    },
  };
  assertSubmissionSafeEvidence(bundle, privateContext);
  return bundle;
}

export function resolveEvidenceIdentity({runId, week, listId} = {}) {
  if (runId && (week || listId)) {
    throw new Error('Use either --run-id or the --week/--list-id pair, not both');
  }
  if (runId) {
    if (!/^[a-z0-9][a-z0-9-]{0,239}$/i.test(String(runId))) {
      throw new Error('Unsafe weekly run ID');
    }
    return {runId: String(runId)};
  }
  if (!week || !listId) {
    throw new Error('Evidence export requires --run-id or both --week and --list-id');
  }
  return createWeeklyRunIdentity({week, listId});
}

export function serializeWeeklyEvidence(bundle) {
  return `${JSON.stringify(bundle, null, 2)}\n`;
}

export function assertSubmissionSafeEvidence(value, privateContext = {}) {
  walk(value, (key, item) => {
    const normalizedKey = String(key || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (FORBIDDEN_OUTPUT_KEYS.has(normalizedKey)) {
      throw new Error(`Submission evidence contains forbidden field: ${key}`);
    }
    if (typeof item !== 'string') return;
    if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(item))) {
      throw new Error(`Submission evidence contains a secret-like value at ${key}`);
    }
    if (URL_PATTERN.test(item)) {
      throw new Error(`Submission evidence contains a URL at ${key}`);
    }
    if (EMAIL_PATTERN.test(item) || HANDLE_PATTERN.test(item)) {
      throw new Error(`Submission evidence contains a source identity at ${key}`);
    }
  });

  const outputStrings = [];
  walk(value, (_key, item) => {
    if (typeof item === 'string') outputStrings.push(item.trim().toLowerCase());
  });
  for (const privateValue of privateContext.forbiddenValues || []) {
    const normalized = String(privateValue || '').trim().toLowerCase();
    if (normalized.length >= 4 && outputStrings.includes(normalized)) {
      throw new Error('Submission evidence contains a private source or credential value');
    }
  }
  for (const post of privateContext.postTexts || []) {
    const normalized = String(post || '').trim().toLowerCase();
    if (normalized.length >= 8 && outputStrings.includes(normalized)) {
      throw new Error('Submission evidence contains raw post content');
    }
  }
  return true;
}

function buildSignalEvidence(run, snapshot) {
  const posts = Array.isArray(snapshot?.posts) ? snapshot.posts : [];
  const records = posts.map((post, index) => ({
    sequence: index + 1,
    id: safeSignalId(post?.id),
    createdAt: safeTimestamp(post?.createdAt),
    lang: safeLanguage(post?.lang),
    metrics: summarizeMetrics(post?.metrics),
  }));
  const sources = uniqueSorted(
    posts.map((post) => ({
      provider: safeSourceName(post?.source?.provider),
      kind: safeSourceName(post?.source?.kind),
      listId: safeNumericId(post?.source?.listId),
    })),
  );
  const timestamps = records.map((record) => record.createdAt).filter(Boolean).sort();
  const computedPrivateInputHash = posts.length
    ? hashJson(
        posts.map((post) => ({
          id: post?.id,
          text: post?.text,
          authorId: post?.authorId,
          createdAt: post?.createdAt,
          metrics: post?.metrics,
        })),
      )
    : null;
  const recordedRunHash = safeSha256(run.inputHash);
  const recordedSnapshotHash = safeSha256(snapshot?.inputHash);
  const allSourcesMatchList = Boolean(
    posts.length &&
      sources.length &&
      sources.every(
        (source) =>
          source.provider === 'x' &&
          source.listId === safeNumericId(run.identity?.listId),
      ),
  );

  return {
    declaredMode: safeInputMode(run.inputMode),
    snapshotMode: safeInputMode(snapshot?.inputMode),
    requestedCount: safeNonnegativeInteger(run.requestedPostCount),
    recordedCount: safeNonnegativeInteger(run.signalCount),
    attestedCount: records.length,
    listId: safeNumericId(snapshot?.listId || run.identity?.listId),
    inputHash: {
      run: recordedRunHash,
      snapshot: recordedSnapshotHash,
      recomputedPrivately: computedPrivateInputHash,
      matches:
        Boolean(recordedRunHash) &&
        recordedRunHash === recordedSnapshotHash &&
        recordedRunHash === computedPrivateInputHash,
    },
    oldestCreatedAt: timestamps[0] || null,
    newestCreatedAt: timestamps.at(-1) || null,
    distinctAuthorCount: new Set(
      posts.map((post) => String(post?.authorId || '')).filter(Boolean),
    ).size,
    sources,
    allSourcesMatchDeclaredList: allSourcesMatchList,
    records,
    recordAttestationHash: hashJson(records),
    sourceAttestationHash: hashJson(sources),
    privateFieldsOmitted: [
      'post body',
      'source username',
      'source author identifier',
      'source link',
    ],
  };
}

function classifyProvenance(run, snapshot, signalEvidence) {
  const runMode = safeInputMode(run.inputMode);
  const snapshotMode = safeInputMode(snapshot?.inputMode);
  const fixture = runMode === 'fixture' || snapshotMode === 'fixture';
  const verifiedLive = Boolean(
    runMode === 'live-x' &&
      snapshotMode === 'live-x' &&
      signalEvidence.attestedCount > 0 &&
      signalEvidence.allSourcesMatchDeclaredList &&
      signalEvidence.inputHash.matches,
  );
  const evidenceClass = fixture
    ? 'fixture'
    : verifiedLive
      ? 'verified-live-x'
      : 'unverified-or-incomplete';
  const modelMode =
    run.offlineModels === true
      ? 'offline-fixture'
      : run.offlineModels === false
        ? 'live-api'
        : 'unknown';

  return {
    evidenceClass,
    inputMode: runMode,
    isFixture: fixture,
    isVerifiedLiveX: verifiedLive,
    modelMode,
    configuredModel: safeModel(run.model),
    dryRun: run.dryRun === true,
    releasableProvenance:
      verifiedLive && modelMode === 'live-api' && run.dryRun === false,
  };
}

function buildDefinitionEvidence(definitionHashes) {
  const definitions = [];
  for (const [name, value] of Object.entries(definitionHashes || {})) {
    const kind = PROMPT_PATHS.has(name)
      ? 'system-prompt'
      : SCHEMA_PATHS.has(name)
        ? 'structured-output-schema'
        : null;
    const sha256 = safeSha256(value);
    if (kind && sha256) definitions.push({kind, name, sha256});
  }
  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

function buildTrendEvidence(modelArtifact, decisionArtifact, privateContext) {
  if (!modelArtifact && !decisionArtifact) return null;
  const output = modelArtifact?.output || {};
  const decision = decisionArtifact || {};
  return {
    modelStatus: safeEnum(output.status, ['trend', 'no_trend']),
    decisionStatus: safeEnum(decision.status, ['trend', 'no_trend']),
    publishEligible: safeBoolean(decision.publishEligible),
    score: safeNumber(decision.score),
    minimumScore: safeNumber(decision.minimumScore),
    noveltySimilarity: safeNumber(decision.noveltySimilarity),
    rightsRisk: safeEnum(output.rightsRisk, ['low', 'medium', 'high']),
    evidencePostIds: safeReferenceList(
      decision.evidencePostIds || output.evidencePostIds,
      privateContext,
    ),
    evidenceAuthorCount: safeNonnegativeInteger(decision.evidenceAuthorCount),
    fingerprintTerms: safeReferenceList(
      decision.fingerprint || output.fingerprintTerms,
      privateContext,
    ),
    checks: pickBooleans(decision.checks, [
      'modelFoundTrend',
      'enoughInputPosts',
      'enoughEvidencePosts',
      'enoughAuthors',
      'lowRightsRisk',
      'safeOriginalLanguage',
      'meaningfulFingerprint',
      'novelEnough',
      'scoreReached',
    ]),
    components: pickNumbers(decision.components, [
      'recurrence',
      'crossAuthor',
      'codexSpecificity',
      'merchability',
      'novelty',
      'rightsSafety',
    ]),
    modelScores: pickNumbers(output.modelScores, [
      'codexSpecificity',
      'merchability',
      'novelty',
      'rightsSafety',
    ]),
    derivedCopyHashes: {
      trendName: hashOptional(output.trendName),
      summary: hashOptional(output.summary),
      memeMechanic: hashOptional(output.memeMechanic),
      teamConnection: hashOptional(output.teamConnection),
      reason: hashOptional(output.reason),
      deterministicReason: hashOptional(decision.reason),
      safeOriginalPhrases: hashJson(decision.safeOriginalPhrases || []),
    },
    outputHash: hashEvidence(modelArtifact?.output, modelArtifact?.outputHash),
    decisionHash: decisionArtifact ? hashJson(decisionArtifact) : null,
  };
}

function buildRecipeEvidence(artifact, privateContext) {
  if (!artifact) return [];
  const candidates = Array.isArray(artifact.output?.candidates)
    ? artifact.output.candidates
    : [];
  const byId = new Map(
    candidates.map((candidate) => [String(candidate?.conceptId || ''), candidate]),
  );
  const ranked = Array.isArray(artifact.ranked)
    ? artifact.ranked
    : candidates.map((candidate) => ({conceptId: candidate?.conceptId}));

  return ranked.map((entry, index) => {
    const candidate = byId.get(String(entry?.conceptId || '')) || {};
    return {
      rank: index + 1,
      conceptId: safeReference(entry?.conceptId || candidate.conceptId, privateContext),
      eligible: safeBoolean(entry?.eligible),
      weightedScore: safeNumber(entry?.weightedScore),
      deterministicChecks: pickBooleans(entry?.checks, [
        'lowRightsRisk',
        'noProtectedProductTerms',
        'noSourceTextOverlap',
        'trendPhrasePresent',
        'distinctCreativeWorld',
        'distinctTypeSystem',
        'distinctRendererRecipe',
        'productionScores',
        'completePanels',
      ]),
      renderer: {
        aestheticWorld: safeEnum(candidate.aestheticWorld, [
          'sf-skate',
          'coastal-surf',
          'zine-punk',
          'sports-club',
          'lab-utility',
          'minimal-type',
        ]),
        typeSystem: safeEnum(candidate.typeSystem, [
          'grotesk-poster',
          'serif-editorial',
          'mono-utility',
          'rounded-surf',
          'varsity-block',
          'condensed-zine',
        ]),
        layout: safeEnum(candidate.layout, [
          'offset-ledger',
          'center-monument',
          'split-field',
          'giant-type',
          'badge-stack',
          'horizon-band',
          'diagonal-poster',
        ]),
        basePattern: safeEnum(candidate.basePattern, [
          'microgrid',
          'pinstripe',
          'status-isobar-map',
          'queue-radar',
          'checkerboard',
          'sun-stripes',
          'halftone-noise',
          'wavy-bands',
        ]),
        sleeveStyle: safeEnum(candidate.sleeves?.style, [
          'wave',
          'glyph-stack',
          'radar-rings',
          'ladder',
          'racing-stripe',
          'checker-cuff',
          'sun-wave',
          'badge-repeat',
        ]),
        palette: pickColors(candidate.palette),
      },
      rightsRisk: safeEnum(candidate.rightsRisk, ['low', 'medium', 'high']),
      scores: pickNumbers(candidate.scores, [
        'conceptClarity',
        'garmentCoherence',
        'memeLegibility',
        'originality',
        'productionSafety',
        'rightsSafety',
      ]),
      surfacesPresent: {
        front: Boolean(candidate.front),
        back: Boolean(candidate.back),
        sleeves: Boolean(candidate.sleeves),
        label: Boolean(candidate.label),
      },
      creativeCopyHashes: {
        title: hashOptional(candidate.title),
        rationale: hashOptional(candidate.rationale),
        front: hashOptional(candidate.front),
        back: hashOptional(candidate.back),
        sleeves: hashOptional(candidate.sleeves),
        label: hashOptional(candidate.label),
        visualDirection: hashOptional(candidate.visualPrompt),
      },
      recipeHash: Object.keys(candidate).length ? hashJson(candidate) : null,
    };
  });
}

function buildVisualEvidence(artifact, finalArtifact, privateContext) {
  if (!artifact && !finalArtifact) return null;
  const attempts = (artifact?.attempts || []).map((attempt, index) => ({
    attempt: safeNonnegativeInteger(attempt?.attempt) || index + 1,
    conceptId: safeReference(attempt?.conceptId, privateContext),
    productSlug: safeReference(attempt?.productSlug, privateContext),
    structuralReview: summarizeStructuralReview(attempt?.structuralReview),
    prepress: summarizePrepress(attempt?.prepress, privateContext),
    critic: summarizeCriticOutput(attempt?.output),
    gate: summarizeGate(attempt?.gate),
    attemptHash: hashJson(attempt || {}),
  }));
  const selected = artifact?.selected
    ? {
        conceptId: safeReference(artifact.selected.conceptId, privateContext),
        productSlug: safeReference(artifact.selected.productSlug, privateContext),
        titleHash: hashOptional(artifact.selected.title),
      }
    : null;

  return {
    preparation: artifact
      ? {
          selected,
          attempts,
          outputHash: hashEvidence(artifact.attempts, artifact.outputHash),
        }
      : null,
    final: finalArtifact
      ? {
          prepress: summarizePrepress(finalArtifact.prepress, privateContext),
          critic: summarizeCriticOutput(finalArtifact.output),
          gate: summarizeGate(finalArtifact.gate),
          artifactHash: hashJson(finalArtifact),
        }
      : null,
  };
}

function buildModelCalls({trend, recipes, critic, finalCritic, privateContext}) {
  const calls = [];
  addModelCall(calls, 'trend-analysis', trend?.response, trend?.output, trend?.outputHash, privateContext);
  addModelCall(calls, 'art-direction', recipes?.response, recipes?.output, recipes?.outputHash, privateContext);
  for (const [index, attempt] of (critic?.attempts || []).entries()) {
    if (!attempt?.response) continue;
    addModelCall(
      calls,
      `visual-critic-attempt-${index + 1}`,
      attempt.response,
      attempt.output,
      null,
      privateContext,
    );
  }
  addModelCall(
    calls,
    'final-visual-critic',
    finalCritic?.response,
    finalCritic?.output,
    null,
    privateContext,
  );
  return calls;
}

function addModelCall(calls, stage, response, output, recordedOutputHash, privateContext) {
  if (!response) return;
  const responseId = safeReference(response.responseId, privateContext);
  const model = safeModel(response.model);
  calls.push({
    stage,
    responseId,
    model,
    usage: summarizeUsage(response.usage),
    outputHash: hashEvidence(output, recordedOutputHash),
    fixtureResponse:
      response.responseId === 'offline-fixture' || response.model === 'offline-fixture',
    verifiedGpt56Response: Boolean(
      response.responseId &&
        response.responseId !== 'offline-fixture' &&
        /^gpt-5\.6(?:[-.][a-z0-9.-]+)?$/i.test(String(response.model || '')),
    ),
  });
}

function buildReleaseEvidence(run, releasePlan, finalCritic, privateContext) {
  const stage = run.status === 'release_failed' ? run.resumeFrom : run.status;
  const releasePresent = Boolean(
    releasePlan ||
      run.releasePlanHash ||
      run.candidateCommit ||
      run.providerProductId ||
      run.finalCommit ||
      run.publicUrl,
  );
  if (!releasePresent) return null;

  return {
    recordedStage: safeStatus(run.status),
    resumeStage: safeStatus(stage),
    releasePlan: {
      present: Boolean(releasePlan),
      recordedHash: safeSha256(run.releasePlanHash),
      recomputedHash: releasePlan ? hashJson(releasePlan) : null,
      matches:
        Boolean(releasePlan && safeSha256(run.releasePlanHash)) &&
        hashJson(releasePlan) === safeSha256(run.releasePlanHash),
    },
    preparationCheckpoint: {
      recorded: Boolean(run.preparedProductHash || run.preparedDesignHash),
      branch: safeReference(run.branch || run.preparedBranch, privateContext),
      baseCommit: safeCommit(run.preparedBaseCommit),
      productHash: safeSha256(run.preparedProductHash),
      designHash: safeSha256(run.preparedDesignHash),
      assetHashes: summarizeAssetHashes(run.assetHashes, privateContext),
    },
    candidateCheckpoint: {
      recorded: Boolean(run.candidateCommit),
      commit: safeCommit(run.candidateCommit),
      deploymentCheckReached: stageReached(stage, 'syncing_provider'),
    },
    providerCheckpoint: {
      recorded: Boolean(run.providerProductId || run.postCriticProductHash),
      providerReferencePresent: Boolean(run.providerProductId),
      providerReferenceHash: hashOptional(run.providerProductId),
      postCriticProductHash: safeSha256(run.postCriticProductHash),
      postCriticAssetHashes: summarizeAssetHashes(
        run.postCriticAssetHashes,
        privateContext,
      ),
      finalCriticArtifactHash: safeSha256(run.finalCriticArtifactHash),
      finalCriticResponseId: safeReference(run.finalCriticResponseId, privateContext),
      finalCriticModel: safeModel(run.finalCriticModel),
      finalCriticArtifactMatches:
        Boolean(finalCritic && safeSha256(run.finalCriticArtifactHash)) &&
        hashJson(finalCritic) === safeSha256(run.finalCriticArtifactHash),
    },
    publicationCheckpoint: {
      recorded: Boolean(run.finalCommit || run.finalProductHash),
      commit: safeCommit(run.finalCommit),
      productHash: safeSha256(run.finalProductHash),
      assetHashes: summarizeAssetHashes(run.finalHashes, privateContext),
      publicReferenceRecorded: Boolean(run.publicUrl),
      publicDeploymentCheckReached: run.status === 'published',
      publishedAt: safeTimestamp(run.publishedAt),
    },
  };
}

function summarizeStructuralReview(review) {
  if (!review) return null;
  return {
    accepted: safeBoolean(review.accepted),
    score: safeNumber(review.score),
    checkedAt: safeTimestamp(review.checkedAt),
    findingCount: Array.isArray(review.findings) ? review.findings.length : 0,
    findingsHash: hashJson(review.findings || []),
    reviewHash: hashJson(review),
  };
}

function summarizePrepress(prepress, privateContext) {
  if (!prepress) return null;
  return {
    ok: safeBoolean(prepress.ok),
    checkedAt: safeTimestamp(prepress.checkedAt),
    technique: safeReference(prepress.technique, privateContext),
    baseProduct: safeReference(prepress.baseProduct, privateContext),
    issueCount: Array.isArray(prepress.issues) ? prepress.issues.length : 0,
    issuesHash: hashJson(prepress.issues || []),
    files: (prepress.files || []).map((file) => ({
      area: safeReference(file?.area, privateContext),
      path: safeRelativePath(file?.path, privateContext),
      width: safeNonnegativeInteger(file?.width),
      height: safeNonnegativeInteger(file?.height),
      format: safeReference(file?.format, privateContext),
      bytes: safeNonnegativeInteger(file?.bytes),
      sha256: safeSha256(file?.sha256),
    })),
    prepressHash: hashJson(prepress),
  };
}

function summarizeCriticOutput(output) {
  if (!output) return null;
  return {
    decision: safeEnum(output.decision, ['pass', 'revise', 'quarantine']),
    overallScore: safeNumber(output.overallScore),
    scores: pickNumbers(output.scores, [
      'garmentCoherence',
      'legibility',
      'panelIntent',
      'originality',
      'productionReadiness',
      'rightsSafety',
    ]),
    criticalDefectCount: Array.isArray(output.criticalDefects)
      ? output.criticalDefects.length
      : 0,
    criticalDefectsHash: hashJson(output.criticalDefects || []),
    strengthCount: Array.isArray(output.strengths) ? output.strengths.length : 0,
    strengthsHash: hashJson(output.strengths || []),
    revisionBriefHash: hashOptional(output.revisionBrief),
    outputHash: hashJson(output),
  };
}

function summarizeGate(gate) {
  if (!gate) return null;
  return {
    passed: safeBoolean(gate.passed),
    decision: safeEnum(gate.decision, ['pass', 'revise', 'quarantine']),
    minimumOverallScore: safeNumber(gate.minimumOverallScore),
    minimumCoreScore: safeNumber(gate.minimumCoreScore),
    gateHash: hashJson(gate),
  };
}

function summarizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const result = {
    inputTokens: safeNonnegativeInteger(usage.input_tokens ?? usage.inputTokens),
    outputTokens: safeNonnegativeInteger(usage.output_tokens ?? usage.outputTokens),
    totalTokens: safeNonnegativeInteger(usage.total_tokens ?? usage.totalTokens),
    cachedInputTokens: safeNonnegativeInteger(
      usage.input_tokens_details?.cached_tokens ?? usage.cachedInputTokens,
    ),
    cacheWriteInputTokens: safeNonnegativeInteger(
      usage.input_tokens_details?.cache_write_tokens ?? usage.cacheWriteInputTokens,
    ),
    reasoningOutputTokens: safeNonnegativeInteger(
      usage.output_tokens_details?.reasoning_tokens ?? usage.reasoningOutputTokens,
    ),
  };
  return Object.values(result).some((value) => value !== null) ? result : null;
}

function summarizeAssetHashes(value, privateContext) {
  return Object.entries(value || {})
    .map(([assetPath, sha256]) => ({
      path: safeRelativePath(assetPath, privateContext),
      sha256: safeSha256(sha256),
    }))
    .filter((entry) => entry.path && entry.sha256)
    .sort((left, right) => left.path.localeCompare(right.path));
}

function hashEvidence(output, recordedHash) {
  const computed = output === undefined || output === null ? null : hashJson(output);
  const recorded = safeSha256(recordedHash);
  return {
    recorded,
    computed,
    matches: Boolean(recorded && computed && recorded === computed),
  };
}

function collectPrivateContext(artifacts) {
  const snapshot = artifacts['signal-snapshot.json'];
  const posts = Array.isArray(snapshot?.posts) ? snapshot.posts : [];
  const forbiddenValues = new Set();
  const postTexts = [];
  for (const post of posts) {
    addForbidden(forbiddenValues, post?.authorId);
    addForbidden(forbiddenValues, post?.authorUsername);
    addForbidden(forbiddenValues, post?.url);
    if (post?.text) postTexts.push(String(post.text));
  }
  for (const artifact of Object.values(artifacts)) {
    collectCredentialValues(artifact, forbiddenValues);
  }
  return {forbiddenValues: [...forbiddenValues], postTexts};
}

function collectCredentialValues(value, output) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (
      typeof item === 'string' &&
      /(?:apikey|authorization|credential|databaseurl|instructions|password|privatekey|promptinput|rawprompt|requestbody|secret|token)$/.test(
        normalized,
      )
    ) {
      addForbidden(output, item);
    }
    if (item && typeof item === 'object') collectCredentialValues(item, output);
  }
}

function addForbidden(output, value) {
  const normalized = String(value || '').trim();
  if (normalized.length >= 4) output.add(normalized);
}

async function resolveRunDirectory(runId, configuredRoot) {
  const runRoot = await realpath(path.resolve(configuredRoot));
  const candidate = path.join(runRoot, runId);
  const details = await lstat(candidate).catch((error) => {
    if (error?.code === 'ENOENT') throw new Error(`Unknown weekly run: ${runId}`);
    throw error;
  });
  if (!details.isDirectory() || details.isSymbolicLink()) {
    throw new Error('Weekly run artifact path must be a real directory');
  }
  const directory = await realpath(candidate);
  if (!directory.startsWith(`${runRoot}${path.sep}`)) {
    throw new Error('Weekly run artifact path escaped the configured run root');
  }
  return directory;
}

async function readArtifact(directory, name) {
  const file = path.join(directory, name);
  const details = await lstat(file).catch((error) => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!details) return null;
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new Error(`Weekly evidence artifact must be a regular file: ${name}`);
  }
  if (details.size > MAX_ARTIFACT_BYTES) {
    throw new Error(`Weekly evidence artifact is unexpectedly large: ${name}`);
  }
  const bytes = await readFile(file);
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`Weekly evidence artifact is not valid JSON: ${name}`);
  }
  return {value, sha256: sha256Bytes(bytes)};
}

function stageReached(current, target) {
  const currentIndex = RELEASE_STAGES.indexOf(current);
  const targetIndex = RELEASE_STAGES.indexOf(target);
  return currentIndex >= 0 && targetIndex >= 0 && currentIndex >= targetIndex;
}

function safeReference(value, privateContext = {}) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  if (
    text.length <= 240 &&
    /^[a-z0-9][a-z0-9._:/-]*$/i.test(text) &&
    !containsSensitiveValue(text, privateContext)
  ) {
    return text;
  }
  return `redacted-sha256-${sha256String(text).slice(0, 16)}`;
}

function safeReferenceList(values, privateContext) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) =>
    safeReference(value, privateContext),
  ).filter(Boolean))];
}

function safeSignalId(value) {
  const text = String(value || '').trim();
  if (/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(text) && !containsSecret(text)) return text;
  return text ? `redacted-sha256-${sha256String(text).slice(0, 16)}` : null;
}

function safeRelativePath(value, privateContext) {
  const text = String(value || '').trim();
  if (
    !text ||
    text.startsWith('/') ||
    text.includes('..') ||
    text.includes('\\') ||
    !/^[a-z0-9][a-z0-9._/-]{0,499}$/i.test(text) ||
    containsSensitiveValue(text, privateContext)
  ) {
    return text ? `redacted-sha256-${sha256String(text).slice(0, 16)}` : null;
  }
  return text;
}

function containsSensitiveValue(value, privateContext) {
  if (containsSecret(value) || URL_PATTERN.test(value) || EMAIL_PATTERN.test(value)) return true;
  const normalized = String(value).toLowerCase();
  return (privateContext.forbiddenValues || []).some((privateValue) => {
    const candidate = String(privateValue || '').trim().toLowerCase();
    return candidate.length >= 4 && normalized.includes(candidate);
  });
}

function containsSecret(value) {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(String(value || '')));
}

function safeModel(value) {
  const model = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(model) && !containsSecret(model)
    ? model
    : model
      ? `redacted-sha256-${sha256String(model).slice(0, 16)}`
      : null;
}

function safeCommit(value) {
  const commit = String(value || '').trim();
  return /^[a-f0-9]{7,64}$/i.test(commit) ? commit : null;
}

function safeSha256(value) {
  const hash = String(value || '').trim();
  return /^[a-f0-9]{64}$/i.test(hash) ? hash.toLowerCase() : null;
}

function safeWeek(value) {
  const week = String(value || '').trim();
  return /^\d{4}-W\d{2}$/.test(week) ? week : null;
}

function safeNumericId(value) {
  const id = String(value || '').trim();
  return /^\d{1,32}$/.test(id) ? id : null;
}

function safeTimestamp(value) {
  if (!value || typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? null : parsed.toISOString();
}

function safeTimeZone(value) {
  const zone = String(value || '').trim();
  return /^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zone) ? zone : null;
}

function safeLanguage(value) {
  const language = String(value || '').trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language) ? language : null;
}

function safeSourceName(value) {
  const source = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,47}$/.test(source) ? source : null;
}

function safeStatus(value) {
  return safeReference(value, {});
}

function safeInputMode(value) {
  return safeEnum(value, ['fixture', 'live-x']);
}

function safeEnum(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function safeBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeNonnegativeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function summarizeMetrics(value) {
  return {
    replies: safeNonnegativeInteger(value?.replies) || 0,
    reposts: safeNonnegativeInteger(value?.reposts) || 0,
    likes: safeNonnegativeInteger(value?.likes) || 0,
    quotes: safeNonnegativeInteger(value?.quotes) || 0,
  };
}

function pickBooleans(value, names) {
  return Object.fromEntries(
    names.map((name) => [name, safeBoolean(value?.[name])]),
  );
}

function pickNumbers(value, names) {
  return Object.fromEntries(names.map((name) => [name, safeNumber(value?.[name])]));
}

function pickColors(value) {
  return Object.fromEntries(
    ['fabric', 'ink', 'muted', 'accent'].map((name) => {
      const color = String(value?.[name] || '');
      return [name, /^#[a-f0-9]{6}$/i.test(color) ? color.toUpperCase() : null];
    }),
  );
}

function uniqueSorted(values) {
  const byCanonicalValue = new Map();
  for (const value of values) {
    const key = canonicalJson(value);
    if (!byCanonicalValue.has(key)) byCanonicalValue.set(key, value);
  }
  return [...byCanonicalValue.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
}

function hashOptional(value) {
  return value === undefined || value === null || value === '' ? null : hashJson(value);
}

function sha256String(value) {
  return sha256Bytes(Buffer.from(String(value)));
}

function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walk(value, callback, key = '$') {
  callback(key, value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, callback, `${key}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [childKey, item] of Object.entries(value)) {
    walk(item, callback, childKey);
  }
}

export const weeklyEvidenceRoot = path.join(rootDir, 'docs/build-week/evidence');
