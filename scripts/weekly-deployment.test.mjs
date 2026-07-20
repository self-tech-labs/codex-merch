import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deploymentProviderConfig,
  sanitizeDeploymentUrl,
  triggerProductionDeployment,
  waitForProductionDeployment,
} from './services/weekly-deployment.mjs';

const COMMIT = 'a'.repeat(40);
const BRANCH = 'codex/weekly-release';
const RUN_ID = 'x-list--123--2026-W30--weekly-merch-v1';
const PROJECT_ID = 'prj_8EwSYjyvg6SFIJXIDpjHFt4A9Uop';
const VERCEL_ENV = {
  MERCH_DEPLOY_PROVIDER: 'vercel',
  MERCH_VERCEL_SCOPE: 'ritsl',
  MERCH_VERCEL_PROJECT_ID: PROJECT_ID,
  VERCEL_TOKEN: 'test-token-never-serialized',
  MERCH_DEPLOY_TIMEOUT_MS: '1000',
  MERCH_DEPLOY_POLL_MS: '1',
};

test('deployment provider must be explicit and Vercel config fails closed', () => {
  assert.throws(() => deploymentProviderConfig({}), /explicitly set/);
  assert.throws(
    () => deploymentProviderConfig({MERCH_DEPLOY_PROVIDER: 'automatic'}),
    /explicitly set/,
  );
  assert.deepEqual(
    deploymentProviderConfig({MERCH_DEPLOY_PROVIDER: 'external'}),
    {provider: 'external'},
  );
  assert.throws(
    () => deploymentProviderConfig({MERCH_DEPLOY_PROVIDER: 'vercel'}),
    /VERCEL_TOKEN.*MERCH_VERCEL_SCOPE.*MERCH_VERCEL_PROJECT_ID/,
  );
});

test('Vercel trigger binds an exact branch and SHA to a sanitized production checkpoint', async () => {
  const requests = [];
  const responses = [
    {
      id: PROJECT_ID,
      name: 'codex-merch',
      link: {type: 'github', repoId: 123456789},
    },
    {deployments: []},
    vercelDeployment({state: 'QUEUED'}),
  ];
  const fetchImpl = async (url, options = {}) => {
    requests.push({url: String(url), options});
    return jsonResponse(responses.shift());
  };

  const checkpoint = await triggerProductionDeployment({
    phase: 'candidate',
    commit: COMMIT,
    branch: BRANCH,
    runId: RUN_ID,
    env: VERCEL_ENV,
    fetchImpl,
    now: () => new Date('2026-07-20T10:00:00.000Z'),
  });

  assert.deepEqual(checkpoint, {
    provider: 'vercel',
    phase: 'candidate',
    target: 'production',
    commit: COMMIT,
    branch: BRANCH,
    projectId: PROJECT_ID,
    deploymentId: 'dpl_WeeklyMerch123',
    deploymentUrl: 'https://codex-merch-abc.vercel.app',
    state: 'QUEUED',
    triggeredAt: '2026-07-20T10:00:00.000Z',
    reused: false,
  });
  assert.equal(requests.length, 3);
  assert.match(requests[0].url, /\/v9\/projects\/prj_/);
  assert.match(requests[0].url, /slug=ritsl/);
  assert.match(requests[1].url, /\/v6\/deployments/);
  assert.match(requests[2].url, /\/v13\/deployments/);
  assert.match(requests[2].url, /forceNew=1/);
  const body = JSON.parse(requests[2].options.body);
  assert.deepEqual(body.gitSource, {
    type: 'github',
    repoId: 123456789,
    ref: BRANCH,
    sha: COMMIT,
  });
  assert.equal(body.target, 'production');
  assert.doesNotMatch(JSON.stringify(checkpoint), /test-token-never-serialized/);

  let replayRequests = 0;
  const replay = await triggerProductionDeployment({
    phase: 'candidate',
    commit: COMMIT,
    branch: BRANCH,
    runId: RUN_ID,
    existing: checkpoint,
    env: VERCEL_ENV,
    fetchImpl: async () => {
      replayRequests += 1;
      throw new Error('must not call Vercel for a persisted checkpoint');
    },
  });
  assert.equal(replayRequests, 0);
  assert.equal(replay.deploymentId, checkpoint.deploymentId);
  assert.equal(replay.reused, true);
});

test('Vercel trigger recovers an existing production deployment instead of duplicating it', async () => {
  const existingDeployment = vercelDeployment({state: 'BUILDING'});
  const responses = [
    {
      id: PROJECT_ID,
      name: 'codex-merch',
      link: {type: 'github', repoId: 123456789},
    },
    {deployments: [existingDeployment]},
  ];
  let requests = 0;
  const checkpoint = await triggerProductionDeployment({
    phase: 'final',
    commit: COMMIT,
    branch: BRANCH,
    runId: RUN_ID,
    env: VERCEL_ENV,
    fetchImpl: async () => {
      requests += 1;
      return jsonResponse(responses.shift());
    },
  });

  assert.equal(requests, 2);
  assert.equal(checkpoint.reused, true);
  assert.equal(checkpoint.phase, 'final');
  assert.equal(checkpoint.state, 'BUILDING');
});

test('Vercel readiness polling preserves the commit binding and records READY', async () => {
  const checkpoint = {
    provider: 'vercel',
    phase: 'candidate',
    target: 'production',
    commit: COMMIT,
    branch: BRANCH,
    projectId: PROJECT_ID,
    deploymentId: 'dpl_WeeklyMerch123',
    deploymentUrl: 'https://codex-merch-abc.vercel.app',
    state: 'QUEUED',
    triggeredAt: '2026-07-20T10:00:00.000Z',
    reused: false,
  };
  const responses = [
    vercelDeployment({state: 'BUILDING'}),
    vercelDeployment({state: 'READY'}),
  ];
  const ready = await waitForProductionDeployment(checkpoint, {
    env: VERCEL_ENV,
    fetchImpl: async () => jsonResponse(responses.shift()),
    sleep: async () => {},
    now: () => new Date('2026-07-20T10:05:00.000Z'),
  });
  assert.equal(ready.state, 'READY');
  assert.equal(ready.readyAt, '2026-07-20T10:05:00.000Z');
  assert.equal(ready.commit, COMMIT);

  await assert.rejects(
    () =>
      waitForProductionDeployment(checkpoint, {
        env: VERCEL_ENV,
        fetchImpl: async () =>
          jsonResponse(vercelDeployment({state: 'ERROR'})),
        sleep: async () => {},
      }),
    /ended in ERROR/,
  );
});

test('external deployment mode is explicit and still records the pushed commit', async () => {
  const checkpoint = await triggerProductionDeployment({
    phase: 'final',
    commit: COMMIT,
    branch: BRANCH,
    runId: RUN_ID,
    env: {MERCH_DEPLOY_PROVIDER: 'external'},
    fetchImpl: async () => {
      throw new Error('external mode has no deployment API');
    },
    now: () => new Date('2026-07-20T10:00:00.000Z'),
  });
  assert.deepEqual(checkpoint, {
    provider: 'external',
    phase: 'final',
    target: 'production',
    commit: COMMIT,
    branch: BRANCH,
    deploymentId: null,
    deploymentUrl: null,
    state: 'EXTERNALLY_MANAGED',
    triggeredAt: '2026-07-20T10:00:00.000Z',
    reused: false,
  });
});

test('deployment URLs cannot persist tokens, paths, or non-Vercel hosts', () => {
  assert.equal(
    sanitizeDeploymentUrl('codex-merch-abc.vercel.app'),
    'https://codex-merch-abc.vercel.app',
  );
  assert.throws(
    () => sanitizeDeploymentUrl('https://codex-merch-abc.vercel.app/?token=secret'),
    /unsafe deployment URL/,
  );
  assert.throws(
    () => sanitizeDeploymentUrl('https://user:secret@codex-merch.vercel.app'),
    /unsafe deployment URL/,
  );
  assert.throws(
    () => sanitizeDeploymentUrl('https://attacker.example'),
    /unsafe deployment URL/,
  );
});

function vercelDeployment({state}) {
  return {
    id: 'dpl_WeeklyMerch123',
    projectId: PROJECT_ID,
    target: 'production',
    url: 'codex-merch-abc.vercel.app',
    readyState: state,
    gitSource: {type: 'github', ref: BRANCH, sha: COMMIT},
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}
