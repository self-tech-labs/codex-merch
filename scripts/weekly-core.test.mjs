import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildListPostsUrl,
  summarizeListPosts,
} from './adapters/x-api.mjs';
import {
  buildStructuredResponseRequest,
  DEFAULT_OPENAI_TEXT_MODEL,
  parseStructuredResponse,
  requireGpt56TextModel,
} from './adapters/openai-responses.mjs';
import {
  buildVisualCriticContext,
  evaluateVisualCritic,
  rankGarmentRecipes,
} from './services/weekly-art-director.mjs';
import {
  assertWeeklyProductRecipeIdentity,
  buildWeeklyCandidateProducts,
  buildWeeklyProduct,
  upsertWeeklyProduct,
} from './services/weekly-product.mjs';
import {
  atomicWriteText,
  createWeeklyRunIdentity,
  hashJson,
  readWeeklyArtifact,
  readWeeklyBinaryArtifact,
} from './services/weekly-run-store.mjs';
import {evaluateTrendCandidate} from './services/weekly-trend.mjs';
import {sanitizeStructuredStrings, sanitizeXmlText} from './services/text-safety.mjs';
import {
  armPreparationRecovery,
  assertPostCriticCheckpoint,
  assertReplayInputMode,
  buildPostCriticCheckpoint,
  candidateRecoveryAssetPaths,
  completePreparationRecovery,
  criticImagePaths,
  immutableProductProjection,
  liveReleaseProvenance,
  publicCommerceReadinessMatches,
  recoverPreparationRecovery,
  releaseStage,
  restorePreparationRecoveryAssets,
  runVerifiedProviderMutation,
} from './weekly-merch.mjs';

const TARGET_LIST_ID = '2067819170989854863';

test('atomic text restoration preserves catalog bytes exactly', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-store-'));
  const file = path.join(directory, 'products.json');
  const original = '{\n  "products": [ { "id": "original-format" } ]\n}\n';

  try {
    await atomicWriteText(file, original);
    assert.equal(await readFile(file, 'utf8'), original);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('SIGKILL-style preparation recovery restores exact bytes and only quarantines inventoried assets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-crash-recovery-'));
  const workspaceRoot = path.join(directory, 'workspace');
  const runRoot = path.join(directory, 'runs');
  const catalogPath = path.join(workspaceRoot, 'merch/products.json');
  const existingAsset = 'assets/artwork/existing.png';
  const generatedAsset = 'assets/print/generated.png';
  const unrelatedFile = path.join(workspaceRoot, 'notes.txt');
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W31',
  });
  const originalCatalog = '[\n  { "id": "existing", "title": "Keep formatting" }\n]\n';

  try {
    await mkdir(path.dirname(catalogPath), {recursive: true});
    await mkdir(path.join(workspaceRoot, 'assets/artwork'), {recursive: true});
    await mkdir(path.join(workspaceRoot, 'assets/print'), {recursive: true});
    await writeFile(catalogPath, originalCatalog);
    await writeFile(path.join(workspaceRoot, existingAsset), 'approved-before');
    await writeFile(unrelatedFile, 'unrelated-before');

    await armPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      assetPaths: [existingAsset, generatedAsset],
      runRoot,
    });

    // This is the filesystem shape a SIGKILL can leave behind: the catch block
    // never ran after the catalog and generated files were mutated.
    await writeFile(
      catalogPath,
      `${JSON.stringify([
        {id: 'existing', title: 'Keep formatting'},
        {id: 'candidate', automation: {runKey: identity.runKey}},
      ], null, 2)}\n`,
    );
    await writeFile(path.join(workspaceRoot, existingAsset), 'overwritten-during-prepare');
    await writeFile(path.join(workspaceRoot, generatedAsset), 'new-generated-by-prepare');
    await writeFile(unrelatedFile, 'unrelated-after-crash');

    const recovered = await recoverPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      runRoot,
    });
    assert.equal(recovered.recovered, true);
    assert.equal(recovered.catalogRecovery, 'exact');
    assert.equal(await readFile(catalogPath, 'utf8'), originalCatalog);
    assert.equal(
      await readFile(path.join(workspaceRoot, existingAsset), 'utf8'),
      'approved-before',
    );
    await assert.rejects(
      readFile(path.join(workspaceRoot, generatedAsset)),
      /ENOENT/,
    );
    assert.equal(await readFile(unrelatedFile, 'utf8'), 'unrelated-after-crash');

    const journal = await readWeeklyArtifact(
      identity,
      'preparation-recovery',
      {runRoot},
    );
    assert.equal(journal.active, false);
    assert.equal(journal.catalogRecovery, 'exact');
    assert.equal(journal.quarantinedAssets.length, 2);
    const preservedGenerated = journal.quarantinedAssets.find(
      (asset) => asset.path === generatedAsset,
    );
    const preservedOverwrite = journal.quarantinedAssets.find(
      (asset) => asset.path === existingAsset,
    );
    assert.equal(
      (
        await readWeeklyBinaryArtifact(
          identity,
          preservedGenerated.artifact,
          {runRoot},
        )
      ).toString('utf8'),
      'new-generated-by-prepare',
    );
    assert.equal(
      (
        await readWeeklyBinaryArtifact(
          identity,
          preservedOverwrite.artifact,
          {runRoot},
        )
      ).toString('utf8'),
      'overwritten-during-prepare',
    );

    assert.deepEqual(
      await recoverPreparationRecovery(identity, {
        workspaceRoot,
        catalogPath,
        runRoot,
      }),
      {recovered: false},
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('preparation recovery preserves unrelated catalog edits with a surgical rollback', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-catalog-recovery-'));
  const workspaceRoot = path.join(directory, 'workspace');
  const runRoot = path.join(directory, 'runs');
  const catalogPath = path.join(workspaceRoot, 'merch/products.json');
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W32',
  });

  try {
    await mkdir(path.dirname(catalogPath), {recursive: true});
    await writeFile(catalogPath, '[{"id":"unrelated","title":"Before"}]\n');
    await armPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      assetPaths: [],
      runRoot,
    });
    await writeFile(
      catalogPath,
      `${JSON.stringify([
        {id: 'unrelated', title: 'User edit after crash'},
        {id: 'candidate', automation: {runKey: identity.runKey}},
      ])}\n`,
    );

    const recovered = await recoverPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      runRoot,
    });
    assert.equal(recovered.catalogRecovery, 'surgical');
    assert.deepEqual(JSON.parse(await readFile(catalogPath, 'utf8')), [
      {id: 'unrelated', title: 'User edit after crash'},
    ]);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('prepared replay closes an armed recovery journal without rolling back the candidate', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-prepared-replay-'));
  const workspaceRoot = path.join(directory, 'workspace');
  const runRoot = path.join(directory, 'runs');
  const catalogPath = path.join(workspaceRoot, 'merch/products.json');
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W33',
  });
  const preparedCatalog = '[{"id":"prepared-candidate"}]\n';

  try {
    await mkdir(path.dirname(catalogPath), {recursive: true});
    await writeFile(catalogPath, preparedCatalog);
    await armPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      assetPaths: [],
      runRoot,
    });

    await completePreparationRecovery(identity, 'prepared-replay', {runRoot});
    const journal = await readWeeklyArtifact(identity, 'preparation-recovery', {
      runRoot,
    });
    assert.equal(journal.active, false);
    assert.equal(journal.outcome, 'prepared-replay');
    assert.equal(await readFile(catalogPath, 'utf8'), preparedCatalog);
    assert.deepEqual(
      await recoverPreparationRecovery(identity, {
        workspaceRoot,
        catalogPath,
        runRoot,
      }),
      {recovered: false},
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('model strings and XML text remove invalid control characters without losing Unicode', () => {
  assert.equal(sanitizeXmlText('Odd\u0007 Interval 🛰️'), 'Odd  Interval 🛰️');
  assert.deepEqual(
    sanitizeStructuredStrings({
      label: 'Panel\u0000 / Inside\u0007',
      nested: ['safe', 'line\u000bfeed'],
    }),
    {
      label: 'Panel  / Inside ',
      nested: ['safe', 'line feed'],
    },
  );
});

test('X list request uses the target list ID and exactly 30 posts', () => {
  const url = new URL(
    buildListPostsUrl({listId: TARGET_LIST_ID, maxResults: 30}),
  );

  assert.equal(url.origin, 'https://api.x.com');
  assert.equal(url.pathname, `/2/lists/${TARGET_LIST_ID}/tweets`);
  assert.equal(url.searchParams.get('max_results'), '30');
  assert.match(url.searchParams.get('tweet.fields'), /created_at/);
  assert.throws(
    () => buildListPostsUrl({listId: 'not-a-list', maxResults: 30}),
    /numeric X list ID/,
  );
});

test('X list normalization keeps sanitized post text in the private signal record', () => {
  const posts = summarizeListPosts(
    {
      data: [
        {
          id: 'post-1',
          author_id: 'author-1',
          text: '  private signal\r\nwith context\u0000  ',
          created_at: '2026-07-20T08:00:00.000Z',
          lang: 'en',
          public_metrics: {
            reply_count: 2,
            retweet_count: 3,
            like_count: 5,
            quote_count: 1,
          },
        },
      ],
      includes: {
        users: [{id: 'author-1', username: 'private_user', verified: true}],
      },
    },
    TARGET_LIST_ID,
  );

  assert.equal(posts.length, 1);
  assert.equal(posts[0].text, 'private signal\nwith context');
  assert.equal(posts[0].authorUsername, 'private_user');
  assert.equal(posts[0].source.listId, TARGET_LIST_ID);
  assert.deepEqual(posts[0].metrics, {
    replies: 2,
    reposts: 3,
    likes: 5,
    quotes: 1,
  });
});

test('OpenAI structured request defaults to canonical GPT-5.6 text.format', () => {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: {status: {type: 'string'}},
  };
  const request = buildStructuredResponseRequest({
    instructions: 'Return a validated decision.',
    input: 'signal input',
    schema,
    schemaName: 'weekly_test_decision',
  });

  assert.equal(DEFAULT_OPENAI_TEXT_MODEL, 'gpt-5.6');
  assert.equal(request.model, DEFAULT_OPENAI_TEXT_MODEL);
  assert.equal(request.store, false);
  assert.deepEqual(request.reasoning, {effort: 'medium'});
  assert.deepEqual(request.text.format, {
    type: 'json_schema',
    name: 'weekly_test_decision',
    strict: true,
    schema,
  });
  assert.equal('response_format' in request, false);
  assert.equal(requireGpt56TextModel(), 'gpt-5.6');
  assert.throws(
    () => requireGpt56TextModel('gpt-4.1'),
    /requires gpt-5\.6/,
  );
  assert.throws(
    () =>
      buildStructuredResponseRequest({
        instructions: 'Return a validated decision.',
        input: 'signal input',
        schema,
        schemaName: 'weekly_test_decision',
        model: 'gpt-4.1',
      }),
    /requires gpt-5\.6/,
  );
});

test('OpenAI structured parser rejects incomplete responses and refusals', () => {
  assert.throws(
    () =>
      parseStructuredResponse({
        status: 'incomplete',
        incomplete_details: {reason: 'max_output_tokens'},
      }),
    /not completed: max_output_tokens/,
  );

  assert.throws(
    () =>
      parseStructuredResponse({
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{type: 'refusal', refusal: 'unsafe request'}],
          },
        ],
      }),
    /refused the request: unsafe request/,
  );
});

test('trend publication requires recurring evidence, author spread, low rights risk, and a trend decision', () => {
  const posts = [
    signalPost('1', 'author-a'),
    signalPost('2', 'author-b'),
    signalPost('3', 'author-c'),
    signalPost('4', 'author-a'),
  ];
  const output = trendOutput();

  const accepted = evaluateTrendCandidate(output, posts);
  assert.equal(accepted.publishEligible, true);
  assert.equal(accepted.status, 'trend');
  assert.equal(accepted.evidencePostIds.length, 4);
  assert.equal(accepted.evidenceAuthorCount, 3);

  const tooLittleEvidence = evaluateTrendCandidate(
    {...output, evidencePostIds: ['1', '2', '3']},
    posts,
  );
  assert.equal(tooLittleEvidence.publishEligible, false);
  assert.equal(tooLittleEvidence.checks.enoughEvidencePosts, false);
  assert.equal(tooLittleEvidence.status, 'no_trend');

  const tooFewAuthors = evaluateTrendCandidate(output, [
    signalPost('1', 'author-a'),
    signalPost('2', 'author-a'),
    signalPost('3', 'author-b'),
    signalPost('4', 'author-b'),
  ]);
  assert.equal(tooFewAuthors.publishEligible, false);
  assert.equal(tooFewAuthors.checks.enoughAuthors, false);

  const unsafe = evaluateTrendCandidate(
    {...output, rightsRisk: 'high'},
    posts,
  );
  assert.equal(unsafe.publishEligible, false);
  assert.equal(unsafe.checks.lowRightsRisk, false);

  const modelSkipped = evaluateTrendCandidate(
    {...output, status: 'no_trend'},
    posts,
  );
  assert.equal(modelSkipped.publishEligible, false);
  assert.equal(modelSkipped.checks.modelFoundTrend, false);
  assert.equal(modelSkipped.status, 'no_trend');
});

test('garment recipe ranking rejects protected product text and rewards a distinct eligible system', () => {
  const protectedCandidate = garmentRecipe({
    conceptId: 'protected-high-score',
    title: 'Codex Rally Uniform',
    scores: recipeScores(10),
  });
  const duplicateCandidate = garmentRecipe({
    conceptId: 'safe-but-duplicate',
    title: 'Retry Window Uniform',
    scores: recipeScores(9),
  });
  const distinctCandidate = garmentRecipe({
    conceptId: 'safe-and-distinct',
    title: 'Quiet Queue Uniform',
    aestheticWorld: 'coastal-surf',
    typeSystem: 'rounded-surf',
    basePattern: 'pinstripe',
    layout: 'split-field',
    sleeveStyle: 'radar-rings',
    scores: recipeScores(9),
  });

  const ranked = rankGarmentRecipes({
    candidates: [protectedCandidate, duplicateCandidate, distinctCandidate],
  });
  const rejected = ranked.find(
    (entry) => entry.candidate.conceptId === 'protected-high-score',
  );
  const duplicate = ranked.find(
    (entry) => entry.candidate.conceptId === 'safe-but-duplicate',
  );

  assert.equal(rejected.eligible, false);
  assert.equal(rejected.checks.noProtectedProductTerms, false);
  assert.equal(duplicate.eligible, false);
  assert.equal(duplicate.checks.distinctRendererRecipe, false);
  assert.equal(ranked[0].candidate.conceptId, 'safe-and-distinct');
  assert.equal(ranked[0].eligible, true);
});

test('garment recipe ranking rejects copied source phrases hidden inside longer fields', () => {
  const copied = garmentRecipe({
    conceptId: 'source-copy',
    title: 'Independent Field Uniform',
    basePattern: 'status-isobar-map',
    layout: 'center-monument',
    sleeveStyle: 'wave',
    scores: recipeScores(9),
  });
  copied.visualPrompt =
    'A restrained garment with an original frame around the queue depth indicator.';

  const [result] = rankGarmentRecipes(
    {candidates: [copied]},
    {sourceTexts: ['The queue depth indicator became a running joke today.']},
  );

  assert.equal(result.eligible, false);
  assert.equal(result.checks.noSourceTextOverlap, false);
});

test('art director order is authoritative and the approved trend phrase must be hero copy', () => {
  const first = garmentRecipe({
    conceptId: 'first-authority-choice',
    title: 'Taste Practice Sweatshirt',
    aestheticWorld: 'sf-skate',
    typeSystem: 'grotesk-poster',
    basePattern: 'checkerboard',
    layout: 'giant-type',
    sleeveStyle: 'racing-stripe',
    scores: recipeScores(7),
  });
  first.front.primaryText = 'TASTEMAXXING';
  first.rationale =
    'Skate poster direction with a bold checkerboard, giant type, and racing stripes.';
  first.sleeves.motif = 'Broad longitudinal racing stripes on both sleeves.';
  first.visualPrompt =
    'SF skate poster garment with a checkerboard field, oversized hero phrase, giant type, and longitudinal racing stripes.';

  const second = garmentRecipe({
    conceptId: 'second-higher-score',
    title: 'Taste Signal Sweatshirt',
    aestheticWorld: 'coastal-surf',
    typeSystem: 'rounded-surf',
    basePattern: 'wavy-bands',
    layout: 'horizon-band',
    sleeveStyle: 'sun-wave',
    scores: recipeScores(10),
  });
  second.front.primaryText = 'A HIGHER STANDARD';
  second.rationale =
    'Coastal surf direction with rolling bands, a horizon band, and rolling wave lines.';
  second.sleeves.motif = 'Three rolling wave lines with a flat accent sun.';
  second.visualPrompt =
    'Coastal surf garment with rolling wavy bands, a horizontal horizon band, and sun wave sleeves.';

  const ranked = rankGarmentRecipes(
    {candidates: [first, second]},
    {requiredDisplayPhrase: 'tastemaxxing'},
  );

  assert.equal(ranked[0].candidate.conceptId, 'first-authority-choice');
  assert.equal(ranked[0].eligible, true);
  assert.equal(ranked[0].checks.trendPhrasePresent, true);
  assert.equal(ranked[1].eligible, false);
  assert.equal(ranked[1].checks.trendPhrasePresent, false);
});

test('an exact owner-authorized Codex hero phrase is allowed only in the hero placement', () => {
  const authorized = garmentRecipe({
    conceptId: 'authorized-codex-reset',
    title: 'Clear State Shift Cotton Sweatshirt',
  });
  authorized.front.primaryText = 'CODEX RESET';

  const [accepted] = rankGarmentRecipes(
    {candidates: [authorized]},
    {requiredDisplayPhrase: 'codex reset'},
  );
  assert.equal(accepted.checks.noProtectedProductTerms, true);
  assert.equal(accepted.eligible, true);

  authorized.back.statement = 'CODEX SYSTEMS';
  const [rejected] = rankGarmentRecipes(
    {candidates: [authorized]},
    {requiredDisplayPhrase: 'codex reset'},
  );
  assert.equal(rejected.checks.noProtectedProductTerms, false);
  assert.equal(rejected.eligible, false);
});

test('garment recipe ranking rejects malformed display copy before rendering', () => {
  const malformedCase = garmentRecipe({
    conceptId: 'malformed-case',
    title: 'The Clearance Interval',
    basePattern: 'pinstripe',
    layout: 'center-monument',
    sleeveStyle: 'ladder',
  });
  malformedCase.front.primaryText = 'THE CURRENT STATE ISy';

  const malformedUnicode = garmentRecipe({
    conceptId: 'malformed-unicode',
    title: 'The Patient Interval',
    basePattern: 'status-isobar-map',
    layout: 'split-field',
    sleeveStyle: 'glyph-stack',
  });
  malformedUnicode.provenanceLine = 'FIELD STUDY MADEŞ';

  const valid = garmentRecipe({
    conceptId: 'production-copy',
    title: 'The Clear Interval',
    basePattern: 'queue-radar',
    layout: 'offset-ledger',
    sleeveStyle: 'radar-rings',
  });

  for (const candidate of [malformedCase, malformedUnicode]) {
    const [ranked] = rankGarmentRecipes({candidates: [candidate]});
    assert.equal(ranked.eligible, false);
    assert.equal(ranked.checks.displayCopyQuality, false);
  }
  const [rankedValid] = rankGarmentRecipes({candidates: [valid]});
  assert.equal(rankedValid.checks.displayCopyQuality, true);
  assert.equal(rankedValid.eligible, true);
});

test('garment recipe ranking rejects concepts that promise unsupported renderer geometry', () => {
  const candidate = garmentRecipe({
    conceptId: 'imaginary-doorway',
    title: 'The Clear Interval',
    basePattern: 'pinstripe',
    layout: 'center-monument',
    sleeveStyle: 'ladder',
  });
  candidate.visualPrompt += ' Add a large doorway as the focal object.';

  const [ranked] = rankGarmentRecipes({candidates: [candidate]});
  assert.equal(ranked.eligible, false);
  assert.equal(ranked.checks.rendererFaithful, false);
});

test('visual critic is advisory unless it finds a critical or quarantine defect', () => {
  const passing = criticOutput();
  assert.deepEqual(evaluateVisualCritic(passing), {
    passed: true,
    decision: 'pass',
    authority: 'art-director',
    scoresAdvisory: true,
  });

  assert.equal(
    evaluateVisualCritic({...passing, overallScore: 79}).passed,
    true,
  );
  assert.equal(
    evaluateVisualCritic({
      ...passing,
      scores: {...passing.scores, panelIntent: 6},
    }).passed,
    true,
  );
  assert.equal(
    evaluateVisualCritic({
      ...passing,
      criticalDefects: ['Sleeve seam clips the primary motif.'],
    }).passed,
    false,
  );
  assert.equal(
    evaluateVisualCritic({...passing, decision: 'quarantine'}).decision,
    'quarantine',
  );
});

test('visual critic receives a sanitized deterministic-prepress summary and render roles', () => {
  const product = {
    title: 'Quiet Queue Cotton Sweatshirt',
    production: {
      technique: 'All-Over Cotton',
      placements: [
        {area: 'front', width: 4_200, height: 4_800, file: '/private/front.png'},
        {area: 'label_inside', width: 375, height: 150, file: '/private/label.png'},
      ],
    },
    assets: {
      mockups: [
        'assets/mockups/quiet-queue-catalog.png',
        'assets/mockups/quiet-queue-patterns.png',
      ],
      printFiles: [
        {
          placement: 'label_inside',
          path: 'assets/print/quiet-queue-label_inside_dtfabric.png',
        },
      ],
    },
  };
  const prepress = {
    ok: true,
    checkedAt: '2026-07-20T08:00:00.000Z',
    baseProduct: 'private-provider-alias',
    files: [
      {
        area: 'front',
        path: '/Users/operator/private/front.png',
        width: 4_200,
        height: 4_800,
        format: 'png',
        bytes: 999_999,
        sha256: 'secret-file-hash',
      },
      {
        area: 'label_inside',
        path: '/Users/operator/private/label.png',
        width: 375,
        height: 150,
        format: 'png',
        bytes: 999,
        sha256: 'secret-label-hash',
      },
    ],
    issues: [],
  };

  const context = buildVisualCriticContext({
    product,
    recipe: {conceptId: 'quiet-queue-01'},
    imagePaths: [
      '/workspace/assets/mockups/quiet-queue-catalog.png',
      '/workspace/assets/mockups/quiet-queue-patterns.png',
      '/workspace/assets/print/quiet-queue-label_inside_dtfabric.png',
    ],
    prepress,
  });

  assert.deepEqual(
    context.renderOrder.map(({role, presentation}) => [role, presentation]),
    [
      ['catalog_mockup', 'garment view'],
      ['pattern_sheet', 'rectangular multi-panel artwork preview'],
      ['label_inside', 'rectangular direct-placement preview'],
    ],
  );
  assert.deepEqual(context.deterministicPrepress, {
    validator: 'weekly-prepress-v1',
    status: 'passed',
    exactProviderDimensionsValidated: true,
    requiredPlacementCount: 2,
    validatedPlacementCount: 2,
    issueCount: 0,
    expectedPlacements: [
      {area: 'front', width: 4_200, height: 4_800, format: null},
      {area: 'label_inside', width: 375, height: 150, format: null},
    ],
    validatedPlacements: [
      {area: 'front', width: 4_200, height: 4_800, format: 'png'},
      {area: 'label_inside', width: 375, height: 150, format: 'png'},
    ],
  });
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /operator|private-provider|secret-file|checkedAt|sha256|bytes/);
});

test('critic image selection reserves six ordered views for garment and label inspection', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-critic-images-'));
  const files = [
    'assets/mockups/study-printful-1.jpg',
    'assets/mockups/study-photoshoot-front.png',
    'assets/mockups/study-patterns.png',
    'assets/mockups/study-back.png',
    'assets/mockups/study-catalog.png',
    'assets/mockups/study-front.png',
    'assets/print/study-label_inside_dtfabric.png',
    'assets/print/study-label_panel_dtfabric.png',
    'assets/print/study-front_dtfabric.png',
  ];

  try {
    for (const file of files) {
      await mkdir(path.dirname(path.join(directory, file)), {recursive: true});
      await writeFile(path.join(directory, file), 'fixture');
    }
    const product = {
      slug: 'study',
      assets: {
        customerPhotos: ['assets/mockups/study-photoshoot-front.png'],
        mockups: [
          'assets/mockups/study-printful-1.jpg',
          'assets/mockups/study-patterns.png',
          'assets/mockups/study-back.png',
          'assets/mockups/study-catalog.png',
          'assets/mockups/study-front.png',
        ],
        printFiles: [
          {placement: 'front', path: 'assets/print/study-front_dtfabric.png'},
          {
            placement: 'label_inside',
            path: 'assets/print/study-label_inside_dtfabric.png',
          },
          {
            placement: 'label_panel',
            path: 'assets/print/study-label_panel_dtfabric.png',
          },
        ],
      },
    };

    const selected = criticImagePaths(product, {
      preferCustomer: true,
      rootDir: directory,
    });
    assert.deepEqual(selected.map((file) => path.basename(file)), [
      'study-catalog.png',
      'study-front.png',
      'study-back.png',
      'study-patterns.png',
      'study-label_panel_dtfabric.png',
      'study-label_inside_dtfabric.png',
    ]);
    assert.equal(selected.length, 6);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('visual critic prompt does not treat intentionally absent production overlays as defects', async () => {
  const prompt = await readFile(
    new URL('./prompts/weekly-visual-critic.md', import.meta.url),
    'utf8',
  );
  assert.match(prompt, /rectangular previews of the actual per-placement artwork/i);
  assert.match(prompt, /exact provider dimensions/i);
  assert.match(prompt, /Do not lower production readiness or fail a garment solely because cut paths/i);
});

test('weekly run identity and canonical JSON hash are stable', () => {
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W30',
  });

  assert.deepEqual(identity, {
    runId: `x-list--${TARGET_LIST_ID}--2026-W30--weekly-merch-v1`,
    runKey: `x-list:${TARGET_LIST_ID}:2026-W30:weekly-merch-v1`,
    isoWeek: '2026-W30',
    listId: TARGET_LIST_ID,
    pipelineVersion: 'weekly-merch-v1',
    timeZone: 'Europe/Zurich',
  });

  const firstHash = hashJson({b: 2, nested: {z: 3, a: 1}, a: 1});
  const reorderedHash = hashJson({a: 1, nested: {a: 1, z: 3}, b: 2});
  assert.match(firstHash, /^[a-f0-9]{64}$/);
  assert.equal(firstHash, reorderedHash);
  assert.notEqual(firstHash, hashJson({a: 1, b: 3, nested: {a: 1, z: 3}}));
});

test('release provenance rejects fixtures and failed runs resume from their checkpoint', () => {
  assert.deepEqual(
    liveReleaseProvenance({
      inputMode: 'live-x',
      offlineModels: false,
      dryRun: false,
    }),
    {
      liveX: true,
      liveModels: true,
      preparedMutationRun: true,
      releasable: true,
    },
  );
  assert.equal(
    liveReleaseProvenance({
      inputMode: 'fixture',
      offlineModels: false,
      dryRun: false,
    }).releasable,
    false,
  );
  assert.equal(
    releaseStage({
      status: 'release_failed',
      resumeFrom: 'awaiting_final_deployment',
    }),
    'awaiting_final_deployment',
  );
});

test('a frozen fixture snapshot cannot be relabeled as live X on replay', () => {
  assert.throws(
    () =>
      assertReplayInputMode(
        {inputHash: 'frozen', inputMode: 'fixture'},
        'live-x',
      ),
    /refusing to relabel/,
  );
  assert.doesNotThrow(() =>
    assertReplayInputMode(
      {inputHash: 'frozen', inputMode: 'live-x'},
      'live-x',
    ),
  );
  assert.throws(
    () => assertReplayInputMode({inputHash: 'frozen'}, 'live-x'),
    /missing trustworthy input provenance/,
  );
});

test('release design checkpoint ignores provider progress but detects creative edits', () => {
  const product = {
    title: 'Approved field garment',
    workflow: {status: 'generated'},
    providerRefs: {printful: {productId: null, variants: []}},
    assets: {artwork: 'assets/artwork/a.png', mockups: []},
    approval: {approvedAt: null},
    artDirector: {aopSpec: {front: {primaryText: 'CLEAR SLOT'}}},
  };
  const approved = hashJson(immutableProductProjection(product));
  product.workflow.status = 'published';
  product.providerRefs.printful.productId = 42;
  product.assets.mockups.push('assets/mockups/a-printful-1.jpg');
  product.approval.approvedAt = '2026-07-20T00:00:00.000Z';
  assert.equal(hashJson(immutableProductProjection(product)), approved);

  product.artDirector.aopSpec.front.primaryText = 'UNAPPROVED EDIT';
  assert.notEqual(hashJson(immutableProductProjection(product)), approved);
});

test('post-critic checkpoint binds provider renders, customer photos, and critic evidence', () => {
  const product = {
    title: 'Reviewed field garment',
    workflow: {status: 'mockups_ready'},
    approval: {approvedAt: null, approvedBy: null},
    providerRefs: {
      printful: {
        productId: 42,
        variants: [
          {
            variantId: 'field:4017',
            catalogVariantId: 4017,
            syncVariantId: 99,
            available: true,
          },
        ],
      },
    },
    assets: {
      artwork: 'assets/artwork/field.png',
      printFiles: [{placement: 'front', path: 'assets/print/field.png'}],
      mockups: ['assets/mockups/field-printful-1.jpg'],
      customerPhotos: ['assets/mockups/field-photoshoot-front.png'],
    },
  };
  const assetHashes = {
    'assets/artwork/field.png': 'art-hash',
    'assets/mockups/field-printful-1.jpg': 'provider-hash',
    'assets/mockups/field-photoshoot-front.png': 'customer-hash',
  };
  const criticArtifact = {
    output: {decision: 'pass', overallScore: 91},
    response: {responseId: 'resp_final', model: 'gpt-5.6'},
    gate: {passed: true},
    prepress: {ok: true},
  };
  const run = {
    ...buildPostCriticCheckpoint({product, assetHashes, criticArtifact}),
    finalCriticResponseId: 'resp_final',
    finalCriticModel: 'gpt-5.6',
  };

  product.workflow.status = 'published';
  product.approval = {approvedAt: '2026-07-20T00:00:00.000Z', approvedBy: 'codex'};
  assert.doesNotThrow(() =>
    assertPostCriticCheckpoint(run, {product, assetHashes, criticArtifact}),
  );

  product.assets.customerPhotos[0] = 'assets/mockups/unreviewed.png';
  assert.throws(
    () => assertPostCriticCheckpoint(run, {product, assetHashes, criticArtifact}),
    /Post-critic product changed/,
  );
  product.assets.customerPhotos[0] = 'assets/mockups/field-photoshoot-front.png';
  assert.throws(
    () =>
      assertPostCriticCheckpoint(run, {
        product,
        assetHashes: {...assetHashes, 'assets/mockups/field-printful-1.jpg': 'changed'},
        criticArtifact,
      }),
    /Post-critic assets changed/,
  );
  assert.throws(
    () =>
      assertPostCriticCheckpoint(run, {
        product,
        assetHashes,
        criticArtifact: {...criticArtifact, output: {decision: 'revise'}},
      }),
    /critic artifact changed/,
  );
});

test('provider mutation runs only after the public candidate hashes are reverified', async () => {
  const events = [];
  const result = await runVerifiedProviderMutation({
    siteUrl: 'https://shop.example',
    assetHashes: {'assets/print/front.png': 'approved-hash'},
    verifyAssets: async (siteUrl, hashes) => {
      events.push(['verify', siteUrl, hashes]);
    },
    mutate: async () => {
      events.push(['mutate']);
      return 'updated';
    },
  });
  assert.equal(result, 'updated');
  assert.deepEqual(events.map(([event]) => event), ['verify', 'mutate']);

  let mutated = false;
  await assert.rejects(
    () =>
      runVerifiedProviderMutation({
        siteUrl: 'https://shop.example',
        assetHashes: {'assets/print/front.png': 'approved-hash'},
        verifyAssets: async () => {
          throw new Error('deployed bytes changed');
        },
        mutate: async () => {
          mutated = true;
        },
      }),
    /deployed bytes changed/,
  );
  assert.equal(mutated, false);
});

test('public readiness binds the exact deployed commerce manifest', () => {
  const product = {
    slug: 'research-deployment',
    title: 'Research & Deployment Co.',
    production: {provider: 'printful'},
    commerce: {
      handle: 'research-deployment',
      currency: 'USD',
      unitAmount: 8800,
      variants: [{id: 'research-deployment:4017', availableForSale: true}],
    },
    providerRefs: {
      printful: {
        variants: [
          {
            variantId: 'research-deployment:4017',
            syncVariantId: 99,
            available: true,
          },
        ],
      },
    },
  };
  const response = {
    ready: true,
    productSlug: product.slug,
    handle: product.commerce.handle,
    title: product.title,
    variantId: 'research-deployment:4017',
    currency: 'USD',
    unitAmount: 8800,
    provider: 'printful',
    paymentMode: 'test',
    databaseReady: true,
    stripeReady: true,
    printfulAutoConfirm: false,
  };

  assert.equal(publicCommerceReadinessMatches(response, product, 'test'), true);
  assert.equal(
    publicCommerceReadinessMatches({...response, unitAmount: 100}, product, 'test'),
    false,
  );
  assert.equal(
    publicCommerceReadinessMatches(
      {...response, title: 'Research &amp; Deployment Co.'},
      product,
      'test',
    ),
    false,
  );
});

test('weekly product strips private post fields and upserts idempotently by run key', () => {
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W30',
  });
  const run = {
    identity,
    requestedPostCount: 30,
    inputHash: hashJson({fixture: 'weekly'}),
    model: 'gpt-5.6',
  };
  const posts = [
    {
      ...signalPost('1', 'author-a'),
      text: 'PRIVATE_POST_TEXT_DO_NOT_PUBLISH',
      authorUsername: 'private_user',
      authorVerified: true,
      url: null,
      lang: 'en',
      source: {provider: 'x', listId: TARGET_LIST_ID},
    },
    signalPost('2', 'author-b'),
    signalPost('3', 'author-c'),
    signalPost('4', 'author-a'),
  ];
  const decision = evaluateTrendCandidate(trendOutput(), posts);
  const recipe = garmentRecipe({
    conceptId: 'weekly-candidate',
    title: 'Quiet Queue Uniform',
    basePattern: 'pinstripe',
    layout: 'split-field',
    sleeveStyle: 'radar-rings',
  });
  const product = buildWeeklyProduct({
    existingProducts: [],
    baseProduct: weeklyBaseProduct(),
    trend: trendOutput(),
    trendDecision: decision,
    recipe,
    posts,
    run,
  });

  assert.equal(product.signals.sources.length, 4);
  for (const source of product.signals.sources) {
    assert.equal('text' in source, false);
    assert.equal('authorUsername' in source, false);
    assert.equal('authorVerified' in source, false);
    assert.equal('authorId' in source, false);
  }
  assert.doesNotMatch(
    JSON.stringify(product.signals.sources),
    /PRIVATE_POST_TEXT_DO_NOT_PUBLISH|private_user/,
  );

  const catalog = [];
  const created = upsertWeeklyProduct(catalog, product);
  assert.equal(created.mode, 'created');
  assert.equal(catalog.length, 1);

  const revised = buildWeeklyProduct({
    existingProducts: catalog,
    baseProduct: weeklyBaseProduct(),
    trend: trendOutput(),
    trendDecision: decision,
    recipe: {...recipe, title: 'A Revised Weekly Title'},
    posts,
    run,
  });
  assert.notEqual(revised.slug, product.slug);
  assert.match(revised.slug, /^a-revised-weekly-title-/);

  const updated = upsertWeeklyProduct(catalog, revised);
  assert.equal(updated.mode, 'updated');
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].automation.runKey, identity.runKey);
  assert.equal(catalog[0].title, 'A Revised Weekly Title');
});

test('fallback candidates receive independent product identities and asset namespaces', () => {
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W30',
  });
  const run = {
    identity,
    requestedPostCount: 30,
    inputHash: hashJson({fixture: 'candidate-fallback'}),
    model: 'gpt-5.6',
  };
  const posts = [
    signalPost('1', 'author-a'),
    signalPost('2', 'author-b'),
    signalPost('3', 'author-c'),
    signalPost('4', 'author-a'),
  ];
  const decision = evaluateTrendCandidate(trendOutput(), posts);
  const primary = garmentRecipe({
    conceptId: 'patch-pressure-01',
    title: 'Patch Pressure',
    basePattern: 'pinstripe',
    layout: 'split-field',
    sleeveStyle: 'radar-rings',
  });
  const fallback = garmentRecipe({
    conceptId: 'mqw-forecast-03',
    title: 'Merge Queue Weather',
    basePattern: 'microgrid',
    layout: 'offset-ledger',
    sleeveStyle: 'wave',
  });

  const [first, second] = buildWeeklyCandidateProducts({
    existingProducts: [],
    baseProduct: weeklyBaseProduct(),
    trend: trendOutput(),
    trendDecision: decision,
    recipes: [primary, fallback],
    posts,
    run,
  });

  assertWeeklyProductRecipeIdentity(first, primary);
  assertWeeklyProductRecipeIdentity(second, fallback);
  assert.equal(first.slug, 'patch-pressure-2026-w30');
  assert.equal(second.slug, 'merge-queue-weather-2026-w30');
  assert.notEqual(first.id, second.id);
  assert.equal(second.title, fallback.title);
  assert.equal(second.commerce.handle, second.slug);
  assert.equal(second.artDirector.selectedConceptId, fallback.conceptId);
  assert.equal(second.production.textLayer, fallback.front.primaryText);
  assert.ok(
    second.commerce.variants.every((variant) =>
      variant.id.startsWith(`${second.slug}:`),
    ),
  );
  assert.ok(
    candidateRecoveryAssetPaths([first, second]).some((file) =>
      file.includes(`${first.slug}-catalog.png`),
    ),
  );
  assert.ok(
    candidateRecoveryAssetPaths([first, second]).some((file) =>
      file.includes(`${second.slug}-catalog.png`),
    ),
  );
  assert.doesNotMatch(JSON.stringify(second), /patch-pressure/i);

  const persisted = [];
  upsertWeeklyProduct(persisted, first);
  upsertWeeklyProduct(persisted, second);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].title, fallback.title);
  assert.equal(persisted[0].slug, second.slug);
  assert.equal(persisted[0].commerce.handle, second.slug);
  assert.equal(persisted[0].artDirector.selectedConceptId, fallback.conceptId);
  assert.doesNotMatch(JSON.stringify(persisted[0]), /patch-pressure/i);
});

test('rejected candidate cleanup restores only its tracked namespace', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'weekly-attempt-cleanup-'));
  const workspaceRoot = path.join(directory, 'workspace');
  const runRoot = path.join(directory, 'runs');
  const catalogPath = path.join(workspaceRoot, 'merch/products.json');
  const firstAsset = 'assets/artwork/patch-pressure-2026-w30-concept.png';
  const secondAsset = 'assets/artwork/merge-queue-weather-2026-w30-concept.png';
  const identity = createWeeklyRunIdentity({
    listId: TARGET_LIST_ID,
    week: '2026-W30',
  });

  try {
    await mkdir(path.dirname(catalogPath), {recursive: true});
    await mkdir(path.join(workspaceRoot, 'assets/artwork'), {recursive: true});
    await writeFile(catalogPath, '[]\n');
    await armPreparationRecovery(identity, {
      workspaceRoot,
      catalogPath,
      assetPaths: [firstAsset, secondAsset],
      runRoot,
    });
    await writeFile(path.join(workspaceRoot, firstAsset), 'rejected-first-render');

    const cleanup = await restorePreparationRecoveryAssets(
      identity,
      [firstAsset],
      {
        workspaceRoot,
        runRoot,
        reason: 'visual-rejection:patch-pressure-01',
      },
    );
    assert.equal(cleanup.quarantinedAssets.length, 1);
    await assert.rejects(readFile(path.join(workspaceRoot, firstAsset)), /ENOENT/);
    await writeFile(path.join(workspaceRoot, secondAsset), 'approved-fallback-render');
    await completePreparationRecovery(identity, 'prepared', {runRoot});
    assert.equal(
      await readFile(path.join(workspaceRoot, secondAsset), 'utf8'),
      'approved-fallback-render',
    );

    const journal = await readWeeklyArtifact(identity, 'preparation-recovery', {
      runRoot,
    });
    assert.equal(journal.active, false);
    assert.deepEqual(
      journal.assets.map((asset) => asset.path).sort(),
      [firstAsset, secondAsset].sort(),
    );
    assert.equal(journal.candidateCleanups.length, 1);
    assert.equal(
      journal.candidateCleanups[0].reason,
      'visual-rejection:patch-pressure-01',
    );
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

function signalPost(id, authorId) {
  return {
    id,
    text: `Recurring queue ritual ${id}`,
    authorId,
    createdAt: `2026-07-${String(10 + Number(id)).padStart(2, '0')}T08:00:00.000Z`,
    metrics: {replies: 1, reposts: 2, likes: 5, quotes: 1},
    source: {provider: 'x', listId: TARGET_LIST_ID},
  };
}

function trendOutput(overrides = {}) {
  return {
    status: 'trend',
    trendName: 'Quiet Queue Ritual',
    summary: 'A recurring team ritual turns waiting into a visible shared cadence.',
    memeMechanic: 'Operational waiting is treated like a calm weather system.',
    teamConnection: 'Multiple authors independently describe the same queue rhythm.',
    evidencePostIds: ['1', '2', '3', '4'],
    visualMetaphors: ['isobar bands', 'quiet queue markers'],
    originalPhrases: ['Quiet queue', 'Window ready'],
    fingerprintTerms: ['quiet', 'queue', 'window', 'cadence'],
    rightsRisk: 'low',
    modelScores: {
      codexSpecificity: 20,
      merchability: 20,
      novelty: 20,
      rightsSafety: 10,
    },
    reason: 'The signal recurs across independent authors.',
    ...overrides,
  };
}

function garmentRecipe({
  conceptId,
  title,
  aestheticWorld = 'lab-utility',
  typeSystem = 'mono-utility',
  basePattern = 'microgrid',
  layout = 'offset-ledger',
  sleeveStyle = 'wave',
  scores = recipeScores(9),
} = {}) {
  return {
    conceptId,
    title,
    rationale: `Translate the recurring cadence through ${rendererContractDescription(
      basePattern,
      layout,
      sleeveStyle,
    )}.`,
    brandLabel: 'WEEKLY SIGNAL DEPT.',
    provenanceLine: 'OBSERVED / ABSTRACTED / REDRAWN',
    aestheticWorld,
    typeSystem,
    layout,
    basePattern,
    palette: {
      fabric: '#F1EEE6',
      ink: '#121212',
      muted: '#85827B',
      accent: '#2855FF',
    },
    front: {
      primaryText: 'QUIET QUEUE',
      chestLabel: 'WINDOW STUDY',
      mark: 'Q/W',
      subline: 'A CALM OPERATIONAL CADENCE',
    },
    back: {
      statement: 'WAITING IS A SHARED SYSTEM',
      subline: 'OBSERVED ACROSS INDEPENDENT SIGNALS',
    },
    sleeves: {
      style: sleeveStyle,
      motif: rendererContractDescription(basePattern, layout, sleeveStyle),
      leftText: 'QUEUE',
      rightText: 'WINDOW',
      caption: 'RECURRENCE / RELEASE',
    },
    label: {line: 'WEEKLY SIGNAL / 2026-W30'},
    visualPrompt: `A restrained six-panel cotton garment system using ${rendererContractDescription(
      basePattern,
      layout,
      sleeveStyle,
    )}.`,
    rightsRisk: 'low',
    scores,
  };
}

function rendererContractDescription(basePattern, layout, sleeveStyle) {
  const patterns = {
    microgrid: 'a quiet microgrid field',
    pinstripe: 'vertical pinstripes and a rectangular aperture',
    'status-isobar-map': 'three nested angular isobar contours',
    'queue-radar': 'branching queue lines and clearing checks',
  };
  const layouts = {
    'offset-ledger': 'an asymmetric offset text block',
    'center-monument': 'a centered central axis',
    'split-field': 'a left-weighted split field with a vertical accent divider',
  };
  const sleeves = {
    wave: 'stepped branch lines with clearing checks',
    'glyph-stack': 'abstract shape-only nodes',
    'radar-rings': 'concentric rings with a crosshair and accent notch',
    ladder: 'two rails and nine rungs',
  };
  return `${patterns[basePattern]}, ${layouts[layout]}, and ${sleeves[sleeveStyle]}`;
}

function recipeScores(value) {
  return {
    conceptClarity: value,
    garmentCoherence: value,
    memeLegibility: value,
    originality: value,
    productionSafety: value,
    rightsSafety: value,
  };
}

function criticOutput() {
  return {
    decision: 'pass',
    overallScore: 80,
    scores: {
      garmentCoherence: 7,
      legibility: 7,
      panelIntent: 7,
      originality: 7,
      productionReadiness: 7,
      rightsSafety: 7,
    },
    criticalDefects: [],
    strengths: ['The six panels read as one garment system.'],
    revisionBrief: '',
  };
}

function weeklyBaseProduct() {
  return {
    alias: 'printful-aop-cotton-sweatshirt-white',
    title: 'All-Over Print Unisex Cotton Sweatshirt',
    printfile: {width: 4_200, height: 4_800},
    placements: [
      {area: 'front', width: 4_200, height: 4_800},
      {area: 'back', width: 4_200, height: 4_800},
      {area: 'left_sleeve', width: 4_200, height: 4_800},
      {area: 'right_sleeve', width: 4_200, height: 4_800},
      {area: 'label_panel', width: 4_200, height: 4_800},
      {area: 'label_inside', width: 375, height: 150},
    ],
    variants: [
      {color: 'White', size: 'M', providerVariantId: 33966},
      {color: 'White', size: 'L', providerVariantId: 33967},
    ],
  };
}
