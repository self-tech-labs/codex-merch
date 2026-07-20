import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  assertSubmissionSafeEvidence,
  buildWeeklyEvidence,
  serializeWeeklyEvidence,
} from './services/weekly-evidence.mjs';
import {parseEvidenceOptions} from './weekly-evidence.mjs';
import {
  createWeeklyRunIdentity,
  hashJson,
} from './services/weekly-run-store.mjs';

const listId = '2067819170989854863';
const week = '2026-W30';
const syntheticSecretLikeValue = ['sk', 'test', 'super', 'secret', 'material'].join('-');

test('weekly evidence export is deterministic, complete, and strips private source data', async () => {
  const fixture = await createEvidenceFixture();
  const byRunId = await buildWeeklyEvidence({
    runId: fixture.identity.runId,
    runRoot: fixture.runRoot,
  });
  const byWeek = await buildWeeklyEvidence({
    week,
    listId,
    runRoot: fixture.runRoot,
  });

  assert.deepEqual(byRunId, byWeek);
  assert.equal(serializeWeeklyEvidence(byRunId), serializeWeeklyEvidence(byWeek));
  assert.equal(byRunId.identity.runId, fixture.identity.runId);
  assert.equal(byRunId.state.status, 'published');
  assert.equal(byRunId.provenance.evidenceClass, 'fixture');
  assert.equal(byRunId.provenance.modelMode, 'live-api');
  assert.equal(byRunId.provenance.releasableProvenance, false);
  assert.equal(byRunId.signals.attestedCount, 30);
  assert.equal(byRunId.signals.records.length, 30);
  assert.equal(byRunId.signals.inputHash.matches, true);
  assert.equal(byRunId.signals.distinctAuthorCount, 30);
  assert.deepEqual(Object.keys(byRunId.signals.records[0]), [
    'sequence',
    'id',
    'createdAt',
    'lang',
    'metrics',
  ]);
  assert.equal(byRunId.definitions.length, 6);
  assert.equal(byRunId.modelCalls.length, 4);
  assert.equal(byRunId.modelCalls.every((call) => call.outputHash.computed), true);
  assert.equal(byRunId.recipes.length, 3);
  assert.equal(byRunId.visualReview.preparation.attempts.length, 1);
  assert.equal(byRunId.visualReview.final.gate.passed, true);
  assert.equal(byRunId.release.candidateCheckpoint.recorded, true);
  assert.equal(byRunId.release.providerCheckpoint.recorded, true);
  assert.equal(byRunId.release.publicationCheckpoint.recorded, true);
  assert.equal(byRunId.release.publicationCheckpoint.publicReferenceRecorded, true);
  assert.equal(byRunId.release.publicationCheckpoint.publicDeploymentCheckReached, true);

  const serialized = serializeWeeklyEvidence(byRunId);
  for (const forbidden of fixture.forbiddenValues) {
    assert.equal(
      serialized.includes(forbidden),
      false,
      `evidence leaked forbidden value: ${forbidden}`,
    );
  }
  for (const forbiddenKey of [
    '"text"',
    '"authorId"',
    '"authorUsername"',
    '"url"',
    '"rawPromptInput"',
    '"apiKey"',
  ]) {
    assert.equal(serialized.includes(forbiddenKey), false);
  }
  assert.doesNotThrow(() => assertSubmissionSafeEvidence(byRunId));
});

test('weekly evidence marks an intact live-X snapshot separately from model mode', async () => {
  const fixture = await createEvidenceFixture({
    inputMode: 'live-x',
    offlineModels: false,
    dryRun: false,
  });
  const evidence = await buildWeeklyEvidence({
    runId: fixture.identity.runId,
    runRoot: fixture.runRoot,
  });

  assert.equal(evidence.provenance.evidenceClass, 'verified-live-x');
  assert.equal(evidence.provenance.isFixture, false);
  assert.equal(evidence.provenance.isVerifiedLiveX, true);
  assert.equal(evidence.provenance.releasableProvenance, true);
});

test('weekly evidence safety assertion rejects forbidden structures and values', () => {
  assert.throws(
    () => assertSubmissionSafeEvidence({text: 'private post'}),
    /forbidden field/i,
  );
  assert.throws(
    () => assertSubmissionSafeEvidence({reference: 'https://x.com/private'}),
    /contains a URL/i,
  );
  assert.throws(
    () => assertSubmissionSafeEvidence({reference: syntheticSecretLikeValue}),
    /secret-like value/i,
  );
});

test('weekly evidence CLI requires one selector and an explicit safe output mode', () => {
  assert.deepEqual(
    parseEvidenceOptions(['--run-id', 'x-list--1--2026-W30--weekly-merch-v1', '--dry-run']),
    {
      runId: 'x-list--1--2026-W30--weekly-merch-v1',
      week: undefined,
      listId: undefined,
      output: undefined,
      dryRun: true,
    },
  );
  assert.deepEqual(
    parseEvidenceOptions([
      '--week',
      week,
      '--list-id',
      listId,
      '--output',
      'docs/build-week/evidence/live-run.json',
    ]),
    {
      runId: undefined,
      week,
      listId,
      output: 'docs/build-week/evidence/live-run.json',
      dryRun: false,
    },
  );
  assert.throws(
    () => parseEvidenceOptions(['--run-id', 'run']),
    /explicit --output/i,
  );
  assert.throws(
    () => parseEvidenceOptions(['--run-id', 'run', '--dry-run', '--output', 'x.json']),
    /do not combine/i,
  );
});

async function createEvidenceFixture({
  inputMode = 'fixture',
  offlineModels = false,
  dryRun = false,
} = {}) {
  const runRoot = await mkdtemp(path.join(os.tmpdir(), 'weekly-evidence-'));
  const identity = createWeeklyRunIdentity({listId, week});
  const directory = path.join(runRoot, identity.runId);
  await mkdir(directory, {recursive: true});

  const forbiddenValues = [
    'PRIVATE POST BODY 01',
    'private_user_0',
    'author-secret-0',
    'https://x.com/private_user_0/status/post-01',
    syntheticSecretLikeValue,
    'RAW PRIVATE PROMPT INPUT',
  ];
  const posts = Array.from({length: 30}, (_, index) => ({
    id: `post-${String(index + 1).padStart(2, '0')}`,
    text: `PRIVATE POST BODY ${String(index + 1).padStart(2, '0')} — never export this source sentence.`,
    authorId: `author-secret-${index}`,
    authorUsername: `private_user_${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 20, 12, 0, 0) - index * 60_000).toISOString(),
    lang: index % 2 ? 'fr' : 'en',
    url: `https://x.com/private_user_${index}/status/post-${index + 1}`,
    metrics: {
      replies: index,
      reposts: index + 1,
      likes: index + 2,
      quotes: index + 3,
    },
    source: {provider: 'x', kind: 'list_posts', listId},
  }));
  const inputHash = hashJson(
    posts.map((post) => ({
      id: post.id,
      text: post.text,
      authorId: post.authorId,
      createdAt: post.createdAt,
      metrics: post.metrics,
    })),
  );
  const definitionHashes = {
    'scripts/prompts/weekly-trend.md': '1'.repeat(64),
    'scripts/prompts/weekly-art-director.md': '2'.repeat(64),
    'scripts/prompts/weekly-visual-critic.md': '3'.repeat(64),
    'merch/weekly/schemas/trend.schema.json': '4'.repeat(64),
    'merch/weekly/schemas/art-direction.schema.json': '5'.repeat(64),
    'merch/weekly/schemas/visual-critic.schema.json': '6'.repeat(64),
  };
  const trendOutput = {
    status: 'trend',
    trendName: 'PRIVATE POST BODY 01',
    summary: 'Aggregate private evidence rendered as a new weekly mechanic.',
    memeMechanic: 'RAW PRIVATE PROMPT INPUT',
    teamConnection: 'A derived team ritual.',
    evidencePostIds: posts.slice(0, 8).map((post) => post.id),
    visualMetaphors: ['barometer'],
    originalPhrases: ['quiet passage'],
    fingerprintTerms: ['queue', 'weather', 'private_user_0'],
    rightsRisk: 'low',
    modelScores: {codexSpecificity: 18, merchability: 18, novelty: 17, rightsSafety: 10},
    reason: 'The aggregate pattern recurs across sources.',
  };
  const trendArtifact = {
    output: trendOutput,
    response: modelResponse('resp_trend_01'),
    outputHash: hashJson(trendOutput),
    rawPromptInput: 'RAW PRIVATE PROMPT INPUT',
  };
  const trendDecision = {
    status: 'trend',
    publishEligible: true,
    score: 91,
    minimumScore: 72,
    noveltySimilarity: 0.1,
    evidencePostIds: posts.slice(0, 8).map((post) => post.id),
    evidenceAuthorCount: 8,
    fingerprint: ['queue', 'weather', 'private_user_0'],
    safeOriginalPhrases: ['quiet passage', 'review pressure'],
    reason: 'Passed deterministic gates.',
    checks: {
      modelFoundTrend: true,
      enoughInputPosts: true,
      enoughEvidencePosts: true,
      enoughAuthors: true,
      lowRightsRisk: true,
      safeOriginalLanguage: true,
      meaningfulFingerprint: true,
      novelEnough: true,
      scoreReached: true,
    },
    components: {
      recurrence: 25,
      crossAuthor: 20,
      codexSpecificity: 18,
      merchability: 14,
      novelty: 8,
      rightsSafety: 10,
    },
  };
  const candidates = [
    recipe('field-one', 'offset-ledger', 'microgrid', 'wave', 9),
    recipe('field-two', 'center-monument', 'queue-radar', 'radar-rings', 8),
    recipe('field-three', 'split-field', 'pinstripe', 'ladder', 7),
  ];
  candidates[0].title = syntheticSecretLikeValue;
  const recipesArtifact = {
    output: {candidates},
    response: modelResponse('resp_art_01'),
    ranked: candidates.map((candidate, index) => ({
      conceptId: candidate.conceptId,
      eligible: true,
      weightedScore: 92 - index * 2,
      checks: {
        lowRightsRisk: true,
        noProtectedProductTerms: true,
        noSourceTextOverlap: true,
        distinctRendererRecipe: true,
        productionScores: true,
        completePanels: true,
      },
    })),
    outputHash: hashJson({candidates}),
  };
  const criticOutput = critic();
  const prepress = {
    ok: true,
    checkedAt: '2026-07-20T12:04:00.000Z',
    technique: 'All-Over Cotton',
    baseProduct: 'printful-aop-cotton-sweatshirt-white',
    files: [
      {
        area: 'front',
        path: 'assets/print/field-one-front.png',
        width: 4200,
        height: 4800,
        format: 'png',
        bytes: 123456,
        sha256: '7'.repeat(64),
      },
    ],
    issues: [syntheticSecretLikeValue],
  };
  const attempts = [
    {
      attempt: 1,
      conceptId: 'field-one',
      productTitle: 'PRIVATE POST BODY 01',
      productSlug: 'field-one-2026-w30',
      assetPaths: ['assets/print/field-one-front.png'],
      structuralReview: {
        accepted: true,
        score: 92,
        checkedAt: '2026-07-20T12:03:00.000Z',
        findings: ['RAW PRIVATE PROMPT INPUT'],
      },
      prepress,
      output: criticOutput,
      response: modelResponse('resp_critic_01'),
      gate: {passed: true, decision: 'pass', minimumOverallScore: 80, minimumCoreScore: 7},
    },
  ];
  const visualArtifact = {
    attempts,
    selected: {conceptId: 'field-one', title: 'PRIVATE POST BODY 01', productSlug: 'field-one-2026-w30'},
    outputHash: hashJson(attempts),
  };
  const finalCriticArtifact = {
    output: criticOutput,
    response: modelResponse('resp_final_critic_01'),
    gate: {passed: true, decision: 'pass', minimumOverallScore: 80, minimumCoreScore: 7},
    prepress,
  };
  const releasePlan = {
    runId: identity.runId,
    productSlug: 'field-one-2026-w30',
    steps: ['Never export this free-form plan detail.'],
  };
  const run = {
    identity,
    status: 'published',
    startedAt: '2026-07-20T12:00:00.000Z',
    completedAt: '2026-07-20T12:05:00.000Z',
    publishedAt: '2026-07-20T12:10:00.000Z',
    requestedPostCount: 30,
    signalCount: 30,
    inputMode,
    offlineModels,
    dryRun,
    model: 'gpt-5.6',
    definitionHashes,
    inputHash,
    productSlug: 'field-one-2026-w30',
    selectedConceptId: 'field-one',
    preparedBranch: 'codex/build-week-merch',
    preparedBaseCommit: 'a'.repeat(40),
    preparedProductHash: '8'.repeat(64),
    preparedDesignHash: '9'.repeat(64),
    releasePlanHash: hashJson(releasePlan),
    assetHashes: {'assets/print/field-one-front.png': '7'.repeat(64)},
    candidateCommit: 'b'.repeat(40),
    providerProductId: 'printful-private-reference',
    postCriticProductHash: 'c'.repeat(64),
    postCriticAssetHashes: {'assets/print/field-one-front.png': '7'.repeat(64)},
    finalCriticArtifactHash: hashJson(finalCriticArtifact),
    finalCriticResponseId: 'resp_final_critic_01',
    finalCriticModel: 'gpt-5.6',
    finalCommit: 'd'.repeat(40),
    finalProductHash: 'e'.repeat(64),
    finalHashes: {'assets/print/field-one-front.png': '7'.repeat(64)},
    publicUrl: 'https://shop.example/products/field-one-2026-w30',
    apiKey: syntheticSecretLikeValue,
  };

  await writeJson(directory, 'run.json', run);
  await writeJson(directory, 'signal-snapshot.json', {
    private: true,
    inputMode,
    listId,
    count: 30,
    inputHash,
    posts,
  });
  await writeJson(directory, 'trend-model-output.json', trendArtifact);
  await writeJson(directory, 'trend-decision.json', trendDecision);
  await writeJson(directory, 'garment-recipes.json', recipesArtifact);
  await writeJson(directory, 'visual-critic.json', visualArtifact);
  await writeJson(directory, 'release-plan.json', releasePlan);
  await writeJson(directory, 'final-visual-critic.json', finalCriticArtifact);

  return {runRoot, identity, forbiddenValues};
}

function modelResponse(responseId) {
  return {
    responseId,
    model: 'gpt-5.6',
    usage: {
      input_tokens: 100,
      output_tokens: 20,
      total_tokens: 120,
      input_tokens_details: {cached_tokens: 40, cache_write_tokens: 2},
      output_tokens_details: {reasoning_tokens: 5},
    },
  };
}

function recipe(conceptId, layout, basePattern, style, score) {
  return {
    conceptId,
    title: `${conceptId} title`,
    rationale: 'Aggregate rationale.',
    brandLabel: 'Field Office',
    provenanceLine: 'weekly signal study',
    layout,
    basePattern,
    palette: {fabric: '#F4F1E8', ink: '#151515', muted: '#777777', accent: '#FF5A36'},
    front: {primaryText: 'QUIET PASSAGE', chestLabel: 'FIELD', mark: '01', subline: 'review pressure'},
    back: {statement: 'THE QUEUE MOVES', subline: 'aggregate signal'},
    sleeves: {style, motif: 'abstract lines', leftText: 'WAIT', rightText: 'PASS', caption: 'weekly field'},
    label: {line: 'FIELD OFFICE 2026'},
    visualPrompt: 'A restrained garment system.',
    rightsRisk: 'low',
    scores: {
      conceptClarity: score,
      garmentCoherence: score,
      memeLegibility: score,
      originality: score,
      productionSafety: score,
      rightsSafety: score,
    },
  };
}

function critic() {
  return {
    decision: 'pass',
    overallScore: 91,
    scores: {
      garmentCoherence: 9,
      legibility: 9,
      panelIntent: 9,
      originality: 9,
      productionReadiness: 9,
      rightsSafety: 10,
    },
    criticalDefects: [],
    strengths: ['RAW PRIVATE PROMPT INPUT'],
    revisionBrief: syntheticSecretLikeValue,
  };
}

async function writeJson(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}
