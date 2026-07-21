import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BUILD_WEEK_PREVIEW_FILES,
  BUILD_WEEK_BASELINE_COMMIT,
  BUILD_WEEK_PROVENANCE_END,
  BUILD_WEEK_PROVENANCE_START,
  CORE_WEEKLY_FILES,
  REQUIRED_BUILD_WEEK_DELTA_FILES,
  REQUIRED_TRACKED_FILES,
  REQUIRED_X_FIXTURE,
  SUBMISSION_DOCUMENT_FILES,
  buildSubmissionReport,
  configurationPresence,
  evaluateGitProvenance,
  evaluatePackageScripts,
  evaluatePushedHead,
  evaluateRootReadme,
  findUnresolvedPlaceholders,
  hasThirtyPostFixture,
  isForbiddenTrackedSecretFilename,
  isTimestampWithinBuildWeek,
  parseEnvFile,
  runtimeGpt56Contract,
  scanTrackedSecrets,
  validateThirtyPostFixture,
} from './submission-verify.mjs';

const validReadme = `
# Weekly Signal Studio

Install dependencies with \`npm install\`.
Run the sample data with \`npm run merch:weekly:demo\`, which uses
\`fixtures/x/codex-team-meme-30.synthetic.json\`.

We collaborated with Codex throughout the implementation. Codex accelerated
the orchestration, tests, and release-safety work. Key product, engineering,
and design decisions separate GPT-5.6 judgment from deterministic gates.
See docs/build-week/README.md for the submission and judge guide.
`;

const validPackage = JSON.stringify({
  scripts: {
    'merch:validate': 'node scripts/merch.mjs validate',
    test: "node --import tsx --test 'scripts/*.test.mjs' 'app/**/*.test.ts'",
    typecheck: 'react-router typegen && tsc --noEmit',
    lint: 'eslint .',
    build: 'react-router build',
    'test:e2e': 'playwright test',
    'merch:weekly': 'node scripts/weekly-merch.mjs prepare',
    'merch:trend-preview': 'node scripts/owner-trend-preview.mjs',
    'merch:weekly:demo':
      'node scripts/weekly-merch.mjs prepare --fixture fixtures/x/codex-team-meme-30.synthetic.json --offline',
    'merch:weekly:release': 'node scripts/weekly-merch.mjs release',
    'merch:weekly:status': 'node scripts/weekly-merch.mjs status',
    'submission:verify:repository': 'node scripts/submission-verify.mjs',
    'submission:verify':
      'npm run merch:validate && npm test && npm run typecheck && npm run lint && npm run build && npm run submission:verify:repository',
  },
});

function syntheticPosts() {
  return Array.from({length: 30}, (_, index) => ({
    id: `synthetic-${String(index + 1).padStart(2, '0')}`,
    text: `Original synthetic post ${index + 1}`,
    authorId: `synthetic-author-${(index % 8) + 1}`,
  }));
}

function validFixture() {
  return {synthetic: true, posts: syntheticPosts()};
}

function validGitFacts(overrides = {}) {
  const headSha = 'a'.repeat(40);
  return {
    headSha,
    headCommittedAt: '2026-07-20T14:00:00+02:00',
    workingTreeClean: true,
    commitsInWindow: [headSha],
    coreCommitsInWindow: [headSha],
    changedSinceBaseline: [...REQUIRED_BUILD_WEEK_DELTA_FILES],
    baselineAncestor: true,
    baselineTagSha: BUILD_WEEK_BASELINE_COMMIT,
    baselineTagAnnotated: true,
    upstream: 'origin/codex/build-week-weekly-studio',
    upstreamSha: headSha,
    ciHeadSha: null,
    ...overrides,
  };
}

function validInputs(overrides = {}) {
  const trackedFiles = [...new Set(REQUIRED_TRACKED_FILES)];
  const texts = new Map(
    trackedFiles.map((file) => [file, '# Complete submission artifact\n']),
  );
  texts.set('README.md', validReadme);
  texts.set('package.json', validPackage);
  texts.set(REQUIRED_X_FIXTURE, JSON.stringify(validFixture()));

  return {
    trackedFiles,
    readText: (file) => {
      if (!texts.has(file)) throw new Error(`Missing test file: ${file}`);
      return texts.get(file);
    },
    gitFacts: validGitFacts(),
    env: {},
    ...overrides,
  };
}

test('required artifacts cover weekly runtime, prompts, schemas, fixtures, rights, and evidence', () => {
  for (const file of [
    'docs/build-week/asset-and-rights.md',
    'docs/build-week/evidence/README.md',
    'fixtures/openai/weekly-happy-path.synthetic.json',
    'fixtures/openai/weekly-no-trend.synthetic.json',
    REQUIRED_X_FIXTURE,
    'fixtures/x/no-trend-30.synthetic.json',
    'merch/weekly/schemas/trend.schema.json',
    'merch/weekly/schemas/art-direction.schema.json',
    'merch/weekly/schemas/visual-critic.schema.json',
    'scripts/prompts/weekly-trend.md',
    'scripts/prompts/weekly-art-director.md',
    'scripts/prompts/weekly-visual-critic.md',
    'scripts/services/weekly-run-store.mjs',
    'scripts/weekly-merch.mjs',
    'scripts/owner-trend-preview.mjs',
    'scripts/owner-trend-preview.test.mjs',
    'scripts/services/owner-trend-preview.mjs',
    'app/routes/how-it-works.tsx',
    'app/lib/storefront-mode.tsx',
    'docs/build-week/evidence/owner-trend-preview-live-gpt56-dry-run.json',
    'merch/products.json',
  ]) {
    assert.equal(REQUIRED_TRACKED_FILES.includes(file), true, file);
  }
  assert.equal(CORE_WEEKLY_FILES.includes('scripts/adapters/x-api.mjs'), true);
  assert.equal(
    BUILD_WEEK_PREVIEW_FILES.includes(
      'assets/mockups/the-sol-shines-cotton-sweatshirt-catalog.png',
    ),
    true,
  );
  assert.equal(BUILD_WEEK_PREVIEW_FILES.includes('app/lib/fulfillment.server.ts'), true);
  assert.equal(
    BUILD_WEEK_PREVIEW_FILES.includes('app/routes/api.stripe.webhook.ts'),
    true,
  );
  assert.equal(BUILD_WEEK_PREVIEW_FILES.includes('app/routes/how-it-works.tsx'), true);
});

test('runtime GPT-5.6 contract pins requests and rejects overrides without source counting', () => {
  const contract = runtimeGpt56Contract();
  assert.equal(contract.ok, true);
  assert.deepEqual(contract.checks, {
    canonicalDefault: true,
    acceptsCanonical: true,
    rejectsOverride: true,
    requestBuilderPinsCanonical: true,
    requestBuilderRejectsOverride: true,
  });
});

test('known X fixture requires exactly 30 unique usable synthetic posts', () => {
  const document = validFixture();
  assert.deepEqual(validateThirtyPostFixture(document), {
    ok: true,
    count: 30,
    uniqueIdCount: 30,
    errors: [],
  });
  assert.equal(hasThirtyPostFixture(document), true);

  const tooShort = validFixture();
  tooShort.posts.pop();
  assert.equal(validateThirtyPostFixture(tooShort).ok, false);

  const duplicate = validFixture();
  duplicate.posts[29].id = duplicate.posts[0].id;
  assert.equal(validateThirtyPostFixture(duplicate).errors.includes('post_30_duplicates_id'), true);

  const emptyText = validFixture();
  emptyText.posts[4].text = '  ';
  assert.equal(validateThirtyPostFixture(emptyText).errors.includes('post_5_requires_text'), true);

  const emptyAuthor = validFixture();
  emptyAuthor.posts[5].authorId = '';
  assert.equal(
    validateThirtyPostFixture(emptyAuthor).errors.includes('post_6_requires_author_id'),
    true,
  );

  assert.equal(
    validateThirtyPostFixture({synthetic: false, posts: syntheticPosts()}).errors.includes(
      'fixture_must_be_marked_synthetic',
    ),
    true,
  );
});

test('forbidden tracked secret filenames reject credentials but allow templates', () => {
  assert.equal(isForbiddenTrackedSecretFilename('.env'), true);
  assert.equal(isForbiddenTrackedSecretFilename('.env.production'), true);
  assert.equal(isForbiddenTrackedSecretFilename('.envrc'), true);
  assert.equal(isForbiddenTrackedSecretFilename('.netrc'), true);
  assert.equal(isForbiddenTrackedSecretFilename('.env.example'), false);
  assert.equal(isForbiddenTrackedSecretFilename('.env.production.example'), false);
  assert.equal(isForbiddenTrackedSecretFilename('config/service-account.json'), true);
  assert.equal(isForbiddenTrackedSecretFilename('private/credentials.csv'), true);
  assert.equal(isForbiddenTrackedSecretFilename('public/certificate.pem'), true);
});

test('embedded-secret scan reports locations and types without returning values', () => {
  const realOpenAi = `sk-proj-${'A1'.repeat(20)}`;
  const realStripe = `sk_test_${'B2'.repeat(16)}`;
  const realGithub = `ghp_${'C3'.repeat(20)}`;
  const texts = new Map([
    ['src/config.ts', `OPENAI_API_KEY = '${realOpenAi}'\nconst stripe = '${realStripe}'\n`],
    ['config/token.yml', `token: ${realGithub}\n`],
    [
      'src/placeholders.ts',
      "STRIPE_WEBHOOK_SECRET: 'whsec_unit_test'\nDATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test'\n",
    ],
  ]);
  const result = scanTrackedSecrets([...texts.keys()], (file) => texts.get(file));
  assert.equal(result.ok, false);
  assert.equal(result.findings.some((finding) => finding.type === 'openai-api-key'), true);
  assert.equal(result.findings.some((finding) => finding.type === 'stripe-secret-key'), true);
  assert.equal(result.findings.some((finding) => finding.type === 'github-token'), true);
  assert.equal(result.findings.some((finding) => finding.file === 'src/placeholders.ts'), false);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(realOpenAi), false);
  assert.equal(serialized.includes(realStripe), false);
  assert.equal(serialized.includes(realGithub), false);
});

test('submission docs reject unresolved placeholders without echoing document lines', () => {
  const files = ['docs/build-week/README.md', 'docs/build-week/judge-access.md'];
  const texts = new Map([
    [files[0], '# Complete\n'],
    [files[1], 'Live URL: TODO: owner must add\n'],
  ]);
  const result = findUnresolvedPlaceholders(files, (file) => texts.get(file));
  assert.deepEqual(result.findings, [
    {file: files[1], line: 1, marker: 'TODO'},
  ]);
  assert.equal(JSON.stringify(result).includes('owner must add'), false);
});

test('root README must cover setup, sample data, Codex collaboration, acceleration, decisions, and GPT-5.6', () => {
  assert.equal(evaluateRootReadme(validReadme).ok, true);
  const incomplete = evaluateRootReadme('# App\nRun npm install. Built with GPT-5.6 and Codex.');
  assert.equal(incomplete.ok, false);
  assert.deepEqual(incomplete.missingTopics, [
    'reproducibleSampleData',
    'codexCollaboration',
    'codexAcceleration',
    'keyDecisions',
    'buildWeekGuide',
  ]);
});

test('package scripts make the final verifier run functional checks before repository checks', () => {
  assert.equal(evaluatePackageScripts(validPackage).ok, true);
  const weak = evaluatePackageScripts(
    JSON.stringify({scripts: {'submission:verify': 'node scripts/submission-verify.mjs'}}),
  );
  assert.equal(weak.ok, false);
  assert.equal(weak.missing.includes('runsTests'), true);
  assert.equal(weak.missing.includes('runsBuild'), true);
  assert.equal(weak.missing.includes('repositoryVerifier'), true);
});

test('Build Week provenance window includes exact boundaries and excludes late commits', () => {
  assert.equal(isTimestampWithinBuildWeek(BUILD_WEEK_PROVENANCE_START), true);
  assert.equal(isTimestampWithinBuildWeek(BUILD_WEEK_PROVENANCE_END), true);
  assert.equal(isTimestampWithinBuildWeek('2026-07-13T08:59:59-07:00'), false);
  assert.equal(isTimestampWithinBuildWeek('2026-07-21T17:00:01-07:00'), false);
  assert.equal(isTimestampWithinBuildWeek('not-a-date'), false);

  assert.equal(evaluateGitProvenance(validGitFacts()).ok, true);
  assert.equal(
    evaluateGitProvenance(
      validGitFacts({headCommittedAt: '2026-07-21T17:00:01-07:00'}),
    ).ok,
    false,
  );
});

test('provenance requires meaningful core delta, baseline ancestry, and annotated exact tag', () => {
  const missingDelta = evaluateGitProvenance(
    validGitFacts({changedSinceBaseline: ['README.md']}),
  );
  assert.equal(missingDelta.ok, false);
  assert.equal(missingDelta.checks.requiredDeltaFilesChanged, false);

  assert.equal(evaluateGitProvenance(validGitFacts({coreCommitsInWindow: []})).ok, false);
  assert.equal(evaluateGitProvenance(validGitFacts({baselineAncestor: false})).ok, false);
  assert.equal(evaluateGitProvenance(validGitFacts({baselineTagAnnotated: false})).ok, false);
  assert.equal(
    evaluateGitProvenance(validGitFacts({baselineTagSha: 'b'.repeat(40)})).ok,
    false,
  );
});

test('pushed HEAD accepts matching upstream or CI SHA and rejects local-only commits', () => {
  assert.equal(evaluatePushedHead(validGitFacts()).ok, true);
  assert.equal(
    evaluatePushedHead(
      validGitFacts({upstream: null, upstreamSha: null, ciHeadSha: 'a'.repeat(40)}),
    ).ok,
    true,
  );
  assert.equal(
    evaluatePushedHead(
      validGitFacts({upstreamSha: 'b'.repeat(40), ciHeadSha: null}),
    ).ok,
    false,
  );
});

test('complete repository report passes strict tracked, content, model, and Git checks', () => {
  const report = buildSubmissionReport(validInputs());
  assert.equal(report.ok, true);
  assert.equal(report.repository.weeklyModelContract.ok, true);
  assert.equal(report.repository.thirtyPostFixture.count, 30);
  assert.equal(report.repository.thirtyPostFixture.uniqueIdCount, 30);
  assert.equal(report.repository.provenance.ok, true);
  assert.equal(report.repository.pushedHead.ok, true);
});

test('report fails for an unrelated fixture, placeholders, weak README, secrets, and local-only HEAD', () => {
  const base = validInputs();
  const texts = new Map(
    base.trackedFiles.map((file) => [file, base.readText(file)]),
  );
  texts.set(
    REQUIRED_X_FIXTURE,
    JSON.stringify({
      synthetic: true,
      posts: Array.from({length: 30}, () => ({
        id: 'duplicate',
        text: 'text',
        authorId: 'author',
      })),
    }),
  );
  texts.set('README.md', '# TODO\nBuilt with Codex.');
  texts.set('docs/build-week/judge-access.md', 'Demo: TBD\n');
  texts.set('src/config.ts', `STRIPE_SECRET_KEY='sk_live_${'Z9'.repeat(16)}'\n`);
  const trackedFiles = [...base.trackedFiles, 'src/config.ts'];
  const report = buildSubmissionReport({
    ...base,
    trackedFiles,
    readText: (file) => texts.get(file),
    gitFacts: validGitFacts({upstreamSha: 'b'.repeat(40)}),
  });
  assert.equal(report.ok, false);
  assert.equal(report.repository.thirtyPostFixture.ok, false);
  assert.equal(report.repository.unresolvedSubmissionPlaceholders.ok, false);
  assert.equal(report.repository.rootReadme.ok, false);
  assert.equal(report.repository.embeddedSecrets.ok, false);
  assert.equal(report.repository.pushedHead.ok, false);
});

test('configuration report is explicitly presence-only and covers site, approvals, policies, and shipping', () => {
  assert.deepEqual(configurationPresence({}), {
    openai: false,
    gpt56Model: true,
    x: false,
    publicHttpsSite: false,
    deployment: false,
    stripe: false,
    database: false,
    inngest: false,
    printful: false,
    printfulAutoConfirmDisabled: false,
    releaseEnabled: false,
    commerceApprovals: false,
    merchantPolicies: false,
    shipping: false,
  });

  const configured = {
    OPENAI_API_KEY: 'openai-secret-value',
    OPENAI_TEXT_MODEL: 'gpt-5.6',
    X_BEARER_TOKEN: 'x-secret-value',
    PUBLIC_SITE_URL: 'https://shop.example',
    MERCH_DEPLOY_PROVIDER: 'vercel',
    MERCH_VERCEL_SCOPE: 'ritsl',
    MERCH_VERCEL_PROJECT_ID: 'prj_Example123',
    VERCEL_TOKEN: 'vercel-secret-value',
    STRIPE_SECRET_KEY: 'stripe-secret-value',
    STRIPE_WEBHOOK_SECRET: 'webhook-secret-value',
    DATABASE_URL: 'postgres-secret-value',
    INNGEST_EVENT_KEY: 'inngest-event-secret-value',
    INNGEST_SIGNING_KEY: 'inngest-signing-secret-value',
    PRINTFUL_TOKEN: 'printful-secret-value',
    PRINTFUL_STORE_ID: 'printful-store-secret-value',
    PRINTFUL_AUTO_CONFIRM: 'false',
    MERCH_WEEKLY_RELEASE_ENABLED: 'true',
    CHECKOUT_ENABLED: 'true',
    MERCH_PILOT_APPROVED: 'true',
    STOREFRONT_LEGAL_APPROVED: 'true',
    STOREFRONT_TAX_SHIPPING_APPROVED: 'true',
    STOREFRONT_CONTACT_EMAIL: 'support@example.com',
    STOREFRONT_SHIPPING_POLICY: 'Reviewed shipping policy',
    STOREFRONT_RETURNS_POLICY: 'Reviewed returns policy',
    STOREFRONT_PRIVACY_POLICY: 'Reviewed privacy policy',
    STOREFRONT_TERMS_POLICY: 'Reviewed terms policy',
    STOREFRONT_CONTACT_POLICY: 'Reviewed contact policy',
    STRIPE_FLAT_SHIPPING_AMOUNT: '500',
    STRIPE_ALLOWED_SHIPPING_COUNTRIES: 'CH,US',
    STRIPE_AUTOMATIC_TAX: 'false',
  };
  const report = buildSubmissionReport(validInputs({env: configured}));
  assert.equal(Object.values(report.configurationPresence).every(Boolean), true);
  const serialized = JSON.stringify(report);
  for (const secret of Object.values(configured)) {
    if (['false', 'true', 'gpt-5.6', '500', 'CH,US'].includes(secret)) continue;
    assert.equal(serialized.includes(secret), false);
  }

  assert.equal(
    configurationPresence({...configured, OPENAI_TEXT_MODEL: 'gpt-4.1'}).openai,
    false,
  );
});

test('env parser supports simple quoted values without evaluating them', () => {
  assert.deepEqual(
    parseEnvFile("A=one\nexport B='two words'\nC=\"three\"\n# D=four\n"),
    {A: 'one', B: 'two words', C: 'three'},
  );
});

test('missing tracked core artifacts, dirty worktree, or unreadable submission docs fail', () => {
  const base = validInputs();
  const missing = buildSubmissionReport({
    ...base,
    trackedFiles: base.trackedFiles.filter(
      (file) => file !== 'scripts/prompts/weekly-trend.md',
    ),
    gitFacts: validGitFacts({workingTreeClean: false}),
    readText: (file) => {
      if (file === SUBMISSION_DOCUMENT_FILES[1]) throw new Error('unreadable');
      return base.readText(file);
    },
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.repository.requiredTrackedFiles.ok, false);
  assert.equal(missing.repository.workingTree.ok, false);
  assert.equal(missing.repository.unresolvedSubmissionPlaceholders.ok, false);
});
