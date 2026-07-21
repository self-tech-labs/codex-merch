#!/usr/bin/env node

import {execFileSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildStructuredResponseRequest,
  DEFAULT_OPENAI_TEXT_MODEL,
  requireGpt56TextModel,
} from './adapters/openai-responses.mjs';

export const BUILD_WEEK_PROVENANCE_START = '2026-07-13T09:00:00-07:00';
export const BUILD_WEEK_PROVENANCE_END = '2026-07-21T17:00:00-07:00';
export const BUILD_WEEK_BASELINE_COMMIT =
  '6de6ea7e2e19e3762d691d0861553e0f2c9f02d1';
export const BUILD_WEEK_BASELINE_TAG = 'pre-build-week-2026';
export const REQUIRED_X_FIXTURE =
  'fixtures/x/codex-team-meme-30.synthetic.json';

export const BUILD_WEEK_PREVIEW_FILES = [
  'app/components/Footer.tsx',
  'app/components/Header.tsx',
  'app/components/PageLayout.tsx',
  'app/inngest/fulfill-order.server.ts',
  'app/lib/commerce.test.ts',
  'app/lib/fulfillment.server.ts',
  'app/lib/stripe.server.ts',
  'app/lib/storefront-mode.test.ts',
  'app/lib/storefront-mode.tsx',
  'app/root.tsx',
  'app/routes/[sitemap.xml].tsx',
  'app/routes/_index.tsx',
  'app/routes/api.stripe.webhook.ts',
  'app/routes/cart.tsx',
  'app/routes/how-it-works.tsx',
  'app/routes/products.$handle.tsx',
  'app/styles/app.css',
  'assets/artwork/the-sol-shines-cotton-sweatshirt-concept.png',
  'assets/mockups/the-sol-shines-cotton-sweatshirt-back.png',
  'assets/mockups/the-sol-shines-cotton-sweatshirt-catalog.png',
  'assets/mockups/the-sol-shines-cotton-sweatshirt-front.png',
  'assets/mockups/the-sol-shines-cotton-sweatshirt-patterns.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-back_dtfabric.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-front_dtfabric.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-label_inside_dtfabric.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-label_panel_dtfabric.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-left_sleeve_dtfabric.png',
  'assets/print/the-sol-shines-cotton-sweatshirt-right_sleeve_dtfabric.png',
  'docs/build-week/evidence/owner-trend-preview-live-gpt56-dry-run.json',
  'e2e/storefront.spec.ts',
  'env.d.ts',
  'merch/products.json',
];

export const SUBMISSION_DOCUMENT_FILES = [
  'README.md',
  'docs/build-week/README.md',
  'docs/build-week/architecture.md',
  'docs/build-week/asset-and-rights.md',
  'docs/build-week/automation-prompt.md',
  'docs/build-week/demo-script.md',
  'docs/build-week/evidence/README.md',
  'docs/build-week/judge-access.md',
  'docs/build-week/owner-checklist.md',
  'docs/build-week/provenance-delta.md',
];

export const CORE_WEEKLY_FILES = [
  ...BUILD_WEEK_PREVIEW_FILES,
  'app/lib/merch.ts',
  'app/lib/weekly-visibility.test.ts',
  'fixtures/openai/weekly-happy-path.synthetic.json',
  'fixtures/openai/weekly-no-trend.synthetic.json',
  'fixtures/x/README.md',
  REQUIRED_X_FIXTURE,
  'fixtures/x/no-trend-30.synthetic.json',
  'merch/weekly/schemas/art-direction.schema.json',
  'merch/weekly/schemas/trend.schema.json',
  'merch/weekly/schemas/visual-critic.schema.json',
  'scripts/adapters/openai-responses.mjs',
  'scripts/adapters/x-api.mjs',
  'scripts/merch-renderer-quality.test.mjs',
  'scripts/merch.mjs',
  'scripts/owner-trend-preview.mjs',
  'scripts/owner-trend-preview.test.mjs',
  'scripts/prompts/weekly-art-director.md',
  'scripts/prompts/weekly-trend.md',
  'scripts/prompts/weekly-visual-critic.md',
  'scripts/services/weekly-art-director.mjs',
  'scripts/services/owner-trend-preview.mjs',
  'scripts/services/weekly-deployment.mjs',
  'scripts/services/weekly-prepress.mjs',
  'scripts/services/weekly-product.mjs',
  'scripts/services/weekly-run-store.mjs',
  'scripts/services/weekly-schemas.mjs',
  'scripts/services/weekly-trend.mjs',
  'scripts/weekly-core.test.mjs',
  'scripts/weekly-deployment.test.mjs',
  'scripts/weekly-merch.mjs',
];

export const REQUIRED_TRACKED_FILES = [
  '.env.example',
  '.github/workflows/ci.yml',
  '.gitignore',
  '.codex/skills/codex-merch-weekly/SKILL.md',
  ...SUBMISSION_DOCUMENT_FILES,
  'package.json',
  ...CORE_WEEKLY_FILES,
  'scripts/submission-verify.mjs',
  'scripts/submission-verify.test.mjs',
];

export const REQUIRED_BUILD_WEEK_DELTA_FILES = [
  'README.md',
  ...BUILD_WEEK_PREVIEW_FILES,
  'app/lib/merch.ts',
  'app/lib/weekly-visibility.test.ts',
  'fixtures/openai/weekly-happy-path.synthetic.json',
  'fixtures/openai/weekly-no-trend.synthetic.json',
  REQUIRED_X_FIXTURE,
  'merch/weekly/schemas/art-direction.schema.json',
  'merch/weekly/schemas/trend.schema.json',
  'merch/weekly/schemas/visual-critic.schema.json',
  'scripts/adapters/openai-responses.mjs',
  'scripts/adapters/x-api.mjs',
  'scripts/merch-renderer-quality.test.mjs',
  'scripts/merch.mjs',
  'scripts/owner-trend-preview.mjs',
  'scripts/owner-trend-preview.test.mjs',
  'scripts/prompts/weekly-art-director.md',
  'scripts/prompts/weekly-trend.md',
  'scripts/prompts/weekly-visual-critic.md',
  'scripts/services/weekly-art-director.mjs',
  'scripts/services/owner-trend-preview.mjs',
  'scripts/services/weekly-deployment.mjs',
  'scripts/services/weekly-prepress.mjs',
  'scripts/services/weekly-product.mjs',
  'scripts/services/weekly-run-store.mjs',
  'scripts/services/weekly-schemas.mjs',
  'scripts/services/weekly-trend.mjs',
  'scripts/weekly-core.test.mjs',
  'scripts/weekly-deployment.test.mjs',
  'scripts/weekly-merch.mjs',
];

const PLACEHOLDER_PATTERN =
  /\b(?:TODO|TBD|FIXME|CHANGEME|REPLACE(?:[_ -]?ME))\b/i;
const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.env',
  '.example',
  '.graphql',
  '.html',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.lock',
  '.md',
  '.mdc',
  '.mjs',
  '.scss',
  '.sh',
  '.sql',
  '.svg',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const RAW_SECRET_PATTERNS = [
  {
    type: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    type: 'openai-api-key',
    pattern: /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/,
  },
  {
    type: 'stripe-secret-key',
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/,
  },
  {
    type: 'stripe-webhook-secret',
    pattern: /\bwhsec_[A-Za-z0-9]{20,}\b/,
  },
  {
    type: 'github-token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  },
  {
    type: 'aws-access-key',
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  },
  {
    type: 'google-api-key',
    pattern: /\bAIza[A-Za-z0-9_-]{35}\b/,
  },
  {
    type: 'slack-token',
    pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
  },
];
const SECRET_ASSIGNMENT_PATTERN = new RegExp(
  String.raw`\b(OPENAI_API_KEY|X_BEARER_TOKEN|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|DATABASE_URL|INNGEST_EVENT_KEY|INNGEST_SIGNING_KEY|PRINTFUL_TOKEN|VERCEL_TOKEN|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY)\b\s*(?::|=)\s*["']?([^"'\x60,;\s#}]+)`,
  'i',
);

export function isForbiddenTrackedSecretFilename(file) {
  const normalized = String(file).replaceAll('\\', '/');
  const base = path.posix.basename(normalized).toLowerCase();
  const safeTemplate = /\.(?:example|sample|template)$/i.test(base);
  const envLike = /^\.env(?:\..+)?$/i.test(base) || /^\.envrc(?:\..+)?$/i.test(base);

  if (envLike && !safeTemplate) return true;
  if (['.netrc', 'credentials', 'credentials.csv'].includes(base)) return true;
  if (/\.(?:pem|key|p12|pfx|jks|kdbx|keystore)$/i.test(base)) return true;
  if (/^(?:id_rsa|id_ed25519)$/i.test(base)) return true;
  return /^(?:credentials|service-account|service_account|secrets?)\.(?:json|ya?ml|toml|ini)$/i.test(
    base,
  );
}

export function scanTrackedSecrets(trackedFiles, readText) {
  const findings = [];
  const unreadableFiles = [];

  for (const file of trackedFiles.filter(isTextFile)) {
    let text;
    try {
      text = readText(file);
    } catch {
      unreadableFiles.push(file);
      continue;
    }

    for (const [index, line] of String(text).split(/\r?\n/).entries()) {
      for (const {type, pattern} of RAW_SECRET_PATTERNS) {
        const match = line.match(pattern);
        if (match && !isObviouslyPlaceholderSecret(match[0])) {
          findings.push({file, line: index + 1, type});
        }
      }

      const assignment = line.match(SECRET_ASSIGNMENT_PATTERN);
      if (
        assignment &&
        assignment[2].length >= 12 &&
        !isObviouslyPlaceholderSecret(assignment[2])
      ) {
        findings.push({
          file,
          line: index + 1,
          type: `${assignment[1].toUpperCase()} assignment`,
        });
      }
    }
  }

  return {
    ok: findings.length === 0 && unreadableFiles.length === 0,
    findings: deduplicateFindings(findings),
    unreadableFiles: unreadableFiles.sort(),
  };
}

export function validateThirtyPostFixture(document) {
  const errors = [];
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return {
      ok: false,
      count: 0,
      uniqueIdCount: 0,
      errors: ['fixture_must_be_an_object'],
    };
  }
  if (document.synthetic !== true) errors.push('fixture_must_be_marked_synthetic');

  const posts = Array.isArray(document.posts) ? document.posts : [];
  if (posts.length !== 30) errors.push('fixture_must_contain_exactly_30_posts');
  const ids = new Set();

  for (const [index, post] of posts.entries()) {
    if (!post || typeof post !== 'object' || Array.isArray(post)) {
      errors.push(`post_${index + 1}_must_be_an_object`);
      continue;
    }
    const id = typeof post.id === 'string' ? post.id.trim() : '';
    const text = typeof post.text === 'string' ? post.text.trim() : '';
    const authorId = typeof post.authorId === 'string' ? post.authorId.trim() : '';
    if (!id) errors.push(`post_${index + 1}_requires_id`);
    else if (ids.has(id)) errors.push(`post_${index + 1}_duplicates_id`);
    else ids.add(id);
    if (!text) errors.push(`post_${index + 1}_requires_text`);
    if (!authorId) errors.push(`post_${index + 1}_requires_author_id`);
  }

  return {
    ok: errors.length === 0,
    count: posts.length,
    uniqueIdCount: ids.size,
    errors,
  };
}

export function hasThirtyPostFixture(document) {
  return validateThirtyPostFixture(document).ok;
}

export function runtimeGpt56Contract() {
  const checks = {
    canonicalDefault: DEFAULT_OPENAI_TEXT_MODEL === 'gpt-5.6',
    acceptsCanonical: false,
    rejectsOverride: false,
    requestBuilderPinsCanonical: false,
    requestBuilderRejectsOverride: false,
  };

  try {
    checks.acceptsCanonical = requireGpt56TextModel('gpt-5.6') === 'gpt-5.6';
  } catch {
    checks.acceptsCanonical = false;
  }
  try {
    requireGpt56TextModel('gpt-4.1');
  } catch {
    checks.rejectsOverride = true;
  }

  const requestInput = {
    instructions: 'Return the required object.',
    input: '{}',
    schemaName: 'submission_model_contract',
    schema: {type: 'object', properties: {}, required: [], additionalProperties: false},
  };
  try {
    checks.requestBuilderPinsCanonical =
      buildStructuredResponseRequest(requestInput).model === 'gpt-5.6';
  } catch {
    checks.requestBuilderPinsCanonical = false;
  }
  try {
    buildStructuredResponseRequest({...requestInput, model: 'gpt-4.1'});
  } catch {
    checks.requestBuilderRejectsOverride = true;
  }

  return {ok: Object.values(checks).every(Boolean), checks};
}

export function findUnresolvedPlaceholders(files, readText) {
  const findings = [];
  const unreadableFiles = [];
  for (const file of files) {
    let text;
    try {
      text = readText(file);
    } catch {
      unreadableFiles.push(file);
      continue;
    }
    for (const [index, line] of String(text).split(/\r?\n/).entries()) {
      const match = line.match(PLACEHOLDER_PATTERN);
      if (match) findings.push({file, line: index + 1, marker: match[0].toUpperCase()});
    }
  }
  return {
    ok: findings.length === 0 && unreadableFiles.length === 0,
    findings,
    unreadableFiles: unreadableFiles.sort(),
  };
}

export function evaluateRootReadme(text) {
  const value = String(text || '');
  const hasCodex = /\bCodex\b/i.test(value);
  const topics = {
    setupInstructions: /\bnpm\s+(?:ci|install)\b/i.test(value),
    reproducibleSampleData:
      /fixtures\/x\/codex-team-meme-30\.synthetic\.json/i.test(value) ||
      /\bmerch:weekly:demo\b/i.test(value),
    codexCollaboration:
      hasCodex && /\bcollaborat(?:e|ed|es|ing|ion)\b/i.test(value),
    codexAcceleration: hasCodex && /\baccelerat(?:e|ed|es|ing|ion)\b/i.test(value),
    keyDecisions: /\bkey\b[\s\S]{0,100}\bdecisions?\b/i.test(value),
    gpt56Role: /\bGPT[- ]?5\.6\b/i.test(value),
    buildWeekGuide: /docs\/build-week\/README\.md/i.test(value),
  };
  return {
    ok: Object.values(topics).every(Boolean),
    topics,
    missingTopics: Object.entries(topics)
      .filter(([, present]) => !present)
      .map(([topic]) => topic),
  };
}

export function evaluatePackageScripts(text) {
  let document;
  try {
    document = JSON.parse(String(text));
  } catch {
    return {ok: false, checks: {validJson: false}, missing: ['validJson']};
  }
  const scripts = document?.scripts || {};
  const finalVerifier = String(scripts['submission:verify'] || '');
  const repositoryVerifier = String(scripts['submission:verify:repository'] || '');
  const checks = {
    validJson: true,
    weeklyPrepare: scripts['merch:weekly'] === 'node scripts/weekly-merch.mjs prepare',
    ownerTrendPreview:
      scripts['merch:trend-preview'] === 'node scripts/owner-trend-preview.mjs',
    weeklyDemo: /weekly-merch\.mjs prepare/.test(String(scripts['merch:weekly:demo'] || '')),
    weeklyRelease: scripts['merch:weekly:release'] === 'node scripts/weekly-merch.mjs release',
    weeklyStatus: scripts['merch:weekly:status'] === 'node scripts/weekly-merch.mjs status',
    repositoryVerifier:
      repositoryVerifier === 'node scripts/submission-verify.mjs',
    validatesCatalog: /npm run merch:validate/.test(finalVerifier),
    runsTests: /npm test/.test(finalVerifier),
    runsTypecheck: /npm run typecheck/.test(finalVerifier),
    runsLint: /npm run lint/.test(finalVerifier),
    runsBuild: /npm run build/.test(finalVerifier),
    endsWithRepositoryVerifier: /npm run submission:verify:repository\s*$/.test(
      finalVerifier,
    ),
    e2eScript: scripts['test:e2e'] === 'playwright test',
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    missing: Object.entries(checks)
      .filter(([, present]) => !present)
      .map(([name]) => name),
  };
}

export function isTimestampWithinBuildWeek(timestamp) {
  const value = Date.parse(String(timestamp || ''));
  return (
    Number.isFinite(value) &&
    value >= Date.parse(BUILD_WEEK_PROVENANCE_START) &&
    value <= Date.parse(BUILD_WEEK_PROVENANCE_END)
  );
}

export function evaluateGitProvenance(gitFacts = {}) {
  const changed = new Set(gitFacts.changedSinceBaseline || []);
  const requiredDeltaFiles = REQUIRED_BUILD_WEEK_DELTA_FILES.map((file) => ({
    file,
    changed: changed.has(file),
  }));
  const checks = {
    headCommittedDuringBuildWeek: isTimestampWithinBuildWeek(gitFacts.headCommittedAt),
    hasCommitDuringBuildWeek: (gitFacts.commitsInWindow || []).length > 0,
    hasCoreCommitDuringBuildWeek: (gitFacts.coreCommitsInWindow || []).length > 0,
    baselineIsAncestor: gitFacts.baselineAncestor === true,
    annotatedBaselineTag:
      gitFacts.baselineTagAnnotated === true &&
      gitFacts.baselineTagSha === BUILD_WEEK_BASELINE_COMMIT,
    requiredDeltaFilesChanged: requiredDeltaFiles.every((item) => item.changed),
  };
  return {
    ok: Object.values(checks).every(Boolean),
    window: {start: BUILD_WEEK_PROVENANCE_START, end: BUILD_WEEK_PROVENANCE_END},
    headSha: gitFacts.headSha || null,
    headCommittedAt: gitFacts.headCommittedAt || null,
    commitCount: (gitFacts.commitsInWindow || []).length,
    coreCommitCount: (gitFacts.coreCommitsInWindow || []).length,
    baselineCommit: BUILD_WEEK_BASELINE_COMMIT,
    baselineTag: BUILD_WEEK_BASELINE_TAG,
    checks,
    requiredDeltaFiles,
  };
}

export function evaluatePushedHead(gitFacts = {}) {
  const localUpstreamMatches = Boolean(
    gitFacts.headSha &&
      gitFacts.upstream &&
      gitFacts.upstreamSha === gitFacts.headSha,
  );
  const ciRemoteCommitMatches = Boolean(
    gitFacts.headSha && gitFacts.ciHeadSha === gitFacts.headSha,
  );
  return {
    ok: localUpstreamMatches || ciRemoteCommitMatches,
    headSha: gitFacts.headSha || null,
    upstream: gitFacts.upstream || null,
    evidence: localUpstreamMatches
      ? 'local-upstream-ref'
      : ciRemoteCommitMatches
        ? 'ci-remote-commit'
        : null,
  };
}

export function configurationPresence(env = {}) {
  const present = (key) => typeof env[key] === 'string' && env[key].trim().length > 0;
  const enabled = (key) => String(env[key] || '').trim().toLowerCase() === 'true';
  const disabled = (key) => String(env[key] || '').trim().toLowerCase() === 'false';
  const gpt56Model = !present('OPENAI_TEXT_MODEL') || env.OPENAI_TEXT_MODEL.trim() === 'gpt-5.6';
  const merchantPolicies = [
    'STOREFRONT_CONTACT_EMAIL',
    'STOREFRONT_SHIPPING_POLICY',
    'STOREFRONT_RETURNS_POLICY',
    'STOREFRONT_PRIVACY_POLICY',
    'STOREFRONT_TERMS_POLICY',
    'STOREFRONT_CONTACT_POLICY',
  ].every(present);
  const shipping =
    (present('STRIPE_SHIPPING_RATE_ID') || present('STRIPE_FLAT_SHIPPING_AMOUNT')) &&
    present('STRIPE_ALLOWED_SHIPPING_COUNTRIES') &&
    present('STRIPE_AUTOMATIC_TAX');
  const deploymentProvider = String(env.MERCH_DEPLOY_PROVIDER || '')
    .trim()
    .toLowerCase();
  const deployment =
    deploymentProvider === 'external' ||
    (deploymentProvider === 'vercel' &&
      present('VERCEL_TOKEN') &&
      present('MERCH_VERCEL_SCOPE') &&
      /^prj_[A-Za-z0-9]+$/.test(String(env.MERCH_VERCEL_PROJECT_ID || '').trim()));

  return {
    openai: present('OPENAI_API_KEY') && gpt56Model,
    gpt56Model,
    x: present('X_BEARER_TOKEN'),
    publicHttpsSite:
      present('PUBLIC_SITE_URL') && /^https:\/\//i.test(env.PUBLIC_SITE_URL.trim()),
    deployment,
    stripe: present('STRIPE_SECRET_KEY') && present('STRIPE_WEBHOOK_SECRET'),
    database: present('DATABASE_URL'),
    inngest: present('INNGEST_EVENT_KEY') && present('INNGEST_SIGNING_KEY'),
    printful: present('PRINTFUL_TOKEN') && present('PRINTFUL_STORE_ID'),
    printfulAutoConfirmDisabled: disabled('PRINTFUL_AUTO_CONFIRM'),
    releaseEnabled: enabled('MERCH_WEEKLY_RELEASE_ENABLED'),
    commerceApprovals:
      enabled('CHECKOUT_ENABLED') &&
      enabled('MERCH_PILOT_APPROVED') &&
      enabled('STOREFRONT_LEGAL_APPROVED') &&
      enabled('STOREFRONT_TAX_SHIPPING_APPROVED'),
    merchantPolicies,
    shipping,
  };
}

export function buildSubmissionReport({
  trackedFiles,
  readText,
  gitFacts = {},
  env = {},
}) {
  const tracked = new Set(trackedFiles);
  const requiredTrackedFiles = REQUIRED_TRACKED_FILES.map((file) => ({
    file,
    tracked: tracked.has(file),
  }));
  const forbiddenTrackedSecretFiles = trackedFiles
    .filter(isForbiddenTrackedSecretFilename)
    .sort();
  const embeddedSecrets = scanTrackedSecrets(trackedFiles, readText);
  const modelContract = runtimeGpt56Contract();
  const fixture = inspectRequiredFixture(tracked, readText);
  const placeholders = findUnresolvedPlaceholders(SUBMISSION_DOCUMENT_FILES, readText);
  const rootReadme = readEvaluation('README.md', readText, evaluateRootReadme);
  const packageScripts = readEvaluation('package.json', readText, evaluatePackageScripts);
  const provenance = evaluateGitProvenance(gitFacts);
  const pushedHead = evaluatePushedHead(gitFacts);

  const repository = {
    requiredTrackedFiles: {
      ok: requiredTrackedFiles.every((item) => item.tracked),
      files: requiredTrackedFiles,
    },
    forbiddenTrackedSecretFiles: {
      ok: forbiddenTrackedSecretFiles.length === 0,
      files: forbiddenTrackedSecretFiles,
    },
    embeddedSecrets,
    weeklyModelContract: modelContract,
    thirtyPostFixture: fixture,
    unresolvedSubmissionPlaceholders: placeholders,
    rootReadme,
    packageScripts,
    workingTree: {ok: gitFacts.workingTreeClean === true},
    provenance,
    pushedHead,
  };

  return {
    ok: Object.values(repository).every((check) => check.ok),
    repository,
    configurationPresence: configurationPresence(env),
    note:
      'Configuration presence is informational only: values are not printed or authenticated, and it never changes the verifier exit code.',
  };
}

export function parseEnvFile(text) {
  const result = {};
  for (const line of String(text).split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    result[match[1]] = value;
  }
  return result;
}

function inspectRequiredFixture(tracked, readText) {
  if (!tracked.has(REQUIRED_X_FIXTURE)) {
    return {
      ok: false,
      file: REQUIRED_X_FIXTURE,
      tracked: false,
      count: 0,
      uniqueIdCount: 0,
      errors: ['required_fixture_is_not_tracked'],
    };
  }
  try {
    const validation = validateThirtyPostFixture(
      JSON.parse(readText(REQUIRED_X_FIXTURE)),
    );
    return {file: REQUIRED_X_FIXTURE, tracked: true, ...validation};
  } catch {
    return {
      ok: false,
      file: REQUIRED_X_FIXTURE,
      tracked: true,
      count: 0,
      uniqueIdCount: 0,
      errors: ['required_fixture_is_not_readable_json'],
    };
  }
}

function readEvaluation(file, readText, evaluate) {
  try {
    return evaluate(readText(file));
  } catch {
    return {ok: false, unreadableFile: file};
  }
}

function isTextFile(file) {
  const normalized = String(file).replaceAll('\\', '/');
  const base = path.posix.basename(normalized);
  return (
    TEXT_EXTENSIONS.has(path.posix.extname(base).toLowerCase()) ||
    ['.gitignore', '.npmrc', '.netrc', 'Dockerfile', 'Procfile'].includes(base)
  );
}

function isObviouslyPlaceholderSecret(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return (
    normalized.length < 12 ||
    /(?:example|sample|placeholder|replace|changeme|dummy|fake|unit(?:[_-]?test)?|localhost|local-only|not-a-secret|secret-value|your[_-]|process\.env|\$\{|<[^>]+>|^test(?:[-_]|$)|:\/\/test(?:$|\/)|^[a-z][a-z0-9_-]*-token$)/i.test(
      normalized,
    ) ||
    /^(?:x+|0+|\*+|-+)$/i.test(normalized)
  );
}

function deduplicateFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const key = `${finding.file}:${finding.line}:${finding.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function git(rootDir, args) {
  return execFileSync('git', ['-C', rootDir, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitOptional(rootDir, args) {
  try {
    return git(rootDir, args).trim() || null;
  } catch {
    return null;
  }
}

function gitLines(rootDir, args) {
  const output = gitOptional(rootDir, args);
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function gitSucceeds(rootDir, args) {
  try {
    git(rootDir, args);
    return true;
  } catch {
    return false;
  }
}

export function inspectGitFacts(rootDir, processEnvironment = process.env) {
  const headSha = gitOptional(rootDir, ['rev-parse', 'HEAD']);
  const upstream = gitOptional(rootDir, [
    'rev-parse',
    '--abbrev-ref',
    '--symbolic-full-name',
    '@{upstream}',
  ]);
  const baselineTagRef = `refs/tags/${BUILD_WEEK_BASELINE_TAG}`;
  const baselineTagSha = gitOptional(rootDir, [
    'rev-parse',
    `${baselineTagRef}^{commit}`,
  ]);

  return {
    headSha,
    headCommittedAt: gitOptional(rootDir, ['show', '-s', '--format=%cI', 'HEAD']),
    workingTreeClean:
      git(rootDir, ['status', '--porcelain=v1', '--untracked-files=all']).trim()
        .length === 0,
    commitsInWindow: gitLines(rootDir, [
      'log',
      `--since=${BUILD_WEEK_PROVENANCE_START}`,
      `--until=${BUILD_WEEK_PROVENANCE_END}`,
      '--format=%H',
    ]),
    coreCommitsInWindow: gitLines(rootDir, [
      'log',
      `--since=${BUILD_WEEK_PROVENANCE_START}`,
      `--until=${BUILD_WEEK_PROVENANCE_END}`,
      '--format=%H',
      '--',
      ...REQUIRED_BUILD_WEEK_DELTA_FILES,
    ]),
    changedSinceBaseline: gitSucceeds(rootDir, [
      'cat-file',
      '-e',
      `${BUILD_WEEK_BASELINE_COMMIT}^{commit}`,
    ])
      ? gitLines(rootDir, [
          'diff',
          '--name-only',
          `${BUILD_WEEK_BASELINE_COMMIT}..HEAD`,
          '--',
        ])
      : [],
    baselineAncestor: gitSucceeds(rootDir, [
      'merge-base',
      '--is-ancestor',
      BUILD_WEEK_BASELINE_COMMIT,
      'HEAD',
    ]),
    baselineTagSha,
    baselineTagAnnotated:
      baselineTagSha != null &&
      gitOptional(rootDir, ['cat-file', '-t', baselineTagRef]) === 'tag',
    upstream,
    upstreamSha: upstream ? gitOptional(rootDir, ['rev-parse', upstream]) : null,
    ciHeadSha:
      processEnvironment.GITHUB_SHA || processEnvironment.CI_COMMIT_SHA || null,
  };
}

export function inspectRepository(rootDir, processEnvironment = process.env) {
  const trackedFiles = git(rootDir, ['ls-files', '-z'])
    .split('\0')
    .filter(Boolean);
  const localEnvPath = path.join(rootDir, '.env');
  const fileEnvironment = existsSync(localEnvPath)
    ? parseEnvFile(readFileSync(localEnvPath, 'utf8'))
    : {};

  return buildSubmissionReport({
    trackedFiles,
    readText: (file) => {
      try {
        return readFileSync(path.join(rootDir, file), 'utf8');
      } catch {
        return git(rootDir, ['show', `:${file}`]);
      }
    },
    gitFacts: inspectGitFacts(rootDir, processEnvironment),
    env: {...fileEnvironment, ...processEnvironment},
  });
}

function run() {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  let report;
  try {
    report = inspectRepository(rootDir);
  } catch {
    report = {
      ok: false,
      repository: {inspection: {ok: false}},
      configurationPresence: configurationPresence(process.env),
      note: 'Repository inspection failed; no credential values were printed.',
    };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) run();
