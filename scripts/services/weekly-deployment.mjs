const VERCEL_API_ORIGIN = 'https://api.vercel.com';
const TERMINAL_FAILURE_STATES = new Set(['ERROR', 'CANCELED', 'BLOCKED']);

export function deploymentProviderConfig(env = process.env) {
  const provider = String(env.MERCH_DEPLOY_PROVIDER || '')
    .trim()
    .toLowerCase();
  if (!['vercel', 'external'].includes(provider)) {
    throw new Error(
      'MERCH_DEPLOY_PROVIDER must be explicitly set to vercel or external',
    );
  }
  if (provider === 'external') return {provider};

  const required = ['VERCEL_TOKEN', 'MERCH_VERCEL_SCOPE', 'MERCH_VERCEL_PROJECT_ID'];
  const missing = required.filter((name) => !String(env[name] || '').trim());
  if (missing.length) {
    throw new Error(`Missing Vercel deployment env vars: ${missing.join(', ')}`);
  }

  const scope = String(env.MERCH_VERCEL_SCOPE).trim();
  const projectId = String(env.MERCH_VERCEL_PROJECT_ID).trim();
  if (!/^(?:team_[A-Za-z0-9]+|[a-z0-9][a-z0-9_-]{0,63})$/.test(scope)) {
    throw new Error('MERCH_VERCEL_SCOPE is not a safe Vercel team ID or slug');
  }
  if (!/^prj_[A-Za-z0-9]+$/.test(projectId)) {
    throw new Error('MERCH_VERCEL_PROJECT_ID is not a valid Vercel project ID');
  }

  return {
    provider,
    token: String(env.VERCEL_TOKEN).trim(),
    scope,
    projectId,
    timeoutMs: positiveInteger(env.MERCH_VERCEL_API_TIMEOUT_MS, 20_000),
  };
}

export async function triggerProductionDeployment({
  phase,
  commit,
  branch,
  runId,
  existing = null,
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  assertDeploymentInput({phase, commit, branch, runId});
  const config = deploymentProviderConfig(env);
  if (existing) {
    assertDeploymentCheckpoint(existing, {phase, commit, branch, config});
    return {...existing, reused: true};
  }

  const triggeredAt = now().toISOString();
  if (config.provider === 'external') {
    return {
      provider: 'external',
      phase,
      target: 'production',
      commit,
      branch,
      deploymentId: null,
      deploymentUrl: null,
      state: 'EXTERNALLY_MANAGED',
      triggeredAt,
      reused: false,
    };
  }

  const project = await readVercelProject(config, fetchImpl);
  const existingDeployment = await findVercelProductionDeployment(
    config,
    {commit, branch},
    fetchImpl,
  );
  if (existingDeployment) {
    return checkpointFromVercel(existingDeployment, {
      phase,
      commit,
      branch,
      projectId: config.projectId,
      triggeredAt,
      reused: true,
    });
  }

  const url = vercelUrl('/v13/deployments', config, {forceNew: '1'});
  const deployment = await requestJson(
    url,
    {
      method: 'POST',
      headers: vercelHeaders(config),
      body: JSON.stringify({
        name: project.name,
        project: config.projectId,
        target: 'production',
        gitSource: {
          type: 'github',
          repoId: project.repoId,
          ref: branch,
          sha: commit,
        },
        meta: {
          merchRunId: runId,
          merchPhase: phase,
        },
      }),
      signal: AbortSignal.timeout(config.timeoutMs),
    },
    fetchImpl,
    'create deployment',
  );

  return checkpointFromVercel(deployment, {
    phase,
    commit,
    branch,
    projectId: config.projectId,
    triggeredAt,
    reused: false,
  });
}

export async function waitForProductionDeployment(
  checkpoint,
  {
    env = process.env,
    fetchImpl = fetch,
    now = () => new Date(),
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
  } = {},
) {
  const config = deploymentProviderConfig(env);
  assertDeploymentCheckpoint(checkpoint, {
    phase: checkpoint?.phase,
    commit: checkpoint?.commit,
    branch: checkpoint?.branch,
    config,
  });
  if (config.provider === 'external') return checkpoint;

  const timeoutMs = positiveInteger(env.MERCH_DEPLOY_TIMEOUT_MS, 10 * 60_000);
  const pollMs = positiveInteger(env.MERCH_DEPLOY_POLL_MS, 10_000);
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const deployment = await requestJson(
      vercelUrl(
        `/v13/deployments/${encodeURIComponent(checkpoint.deploymentId)}`,
        config,
      ),
      {
        headers: vercelHeaders(config),
        signal: AbortSignal.timeout(Math.min(config.timeoutMs, timeoutMs)),
      },
      fetchImpl,
      'read deployment',
    );
    const current = checkpointFromVercel(deployment, {
      phase: checkpoint.phase,
      commit: checkpoint.commit,
      branch: checkpoint.branch,
      projectId: config.projectId,
      triggeredAt: checkpoint.triggeredAt,
      reused: checkpoint.reused,
    });
    if (current.state === 'READY') {
      return {...current, readyAt: now().toISOString()};
    }
    if (TERMINAL_FAILURE_STATES.has(current.state)) {
      throw new Error(
        `Vercel ${checkpoint.phase} deployment ${checkpoint.deploymentId} ended in ${current.state}`,
      );
    }
    await sleep(pollMs);
  }
  throw new Error(
    `Timed out waiting for Vercel ${checkpoint.phase} deployment ${checkpoint.deploymentId}`,
  );
}

export function assertDeploymentCheckpoint(
  checkpoint,
  {phase, commit, branch, config = deploymentProviderConfig()},
) {
  if (!checkpoint || checkpoint.provider !== config.provider) {
    throw new Error('Deployment checkpoint provider does not match release configuration');
  }
  if (
    checkpoint.phase !== phase ||
    checkpoint.commit !== commit ||
    checkpoint.branch !== branch ||
    checkpoint.target !== 'production'
  ) {
    throw new Error('Deployment checkpoint does not match the requested Git commit');
  }
  assertDeploymentInput({phase, commit, branch, runId: 'checkpoint'});

  if (config.provider === 'external') {
    if (
      checkpoint.deploymentId !== null ||
      checkpoint.deploymentUrl !== null ||
      checkpoint.state !== 'EXTERNALLY_MANAGED'
    ) {
      throw new Error('External deployment checkpoint is malformed');
    }
    return;
  }

  if (
    checkpoint.projectId !== config.projectId ||
    !/^dpl_[A-Za-z0-9]+$/.test(checkpoint.deploymentId || '')
  ) {
    throw new Error('Vercel deployment checkpoint is malformed');
  }
  sanitizeDeploymentUrl(checkpoint.deploymentUrl);
}

export function sanitizeDeploymentUrl(value) {
  const raw = String(value || '').trim();
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error('Vercel deployment returned an invalid deployment URL');
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    !/^[a-z0-9.-]+\.vercel\.app$/i.test(parsed.hostname)
  ) {
    throw new Error('Vercel deployment returned an unsafe deployment URL');
  }
  return `https://${parsed.hostname.toLowerCase()}`;
}

async function readVercelProject(config, fetchImpl) {
  const project = await requestJson(
    vercelUrl(`/v9/projects/${encodeURIComponent(config.projectId)}`, config),
    {
      headers: vercelHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs),
    },
    fetchImpl,
    'read project',
  );
  if (
    project?.id !== config.projectId ||
    !/^[a-z0-9][a-z0-9-]{0,99}$/i.test(project?.name || '') ||
    project?.link?.type !== 'github' ||
    !/^[0-9]+$/.test(String(project?.link?.repoId || ''))
  ) {
    throw new Error('Configured Vercel project is not linked to a valid GitHub repository');
  }
  return {name: project.name, repoId: project.link.repoId};
}

async function findVercelProductionDeployment(
  config,
  {commit, branch},
  fetchImpl,
) {
  const result = await requestJson(
    vercelUrl('/v6/deployments', config, {
      projectId: config.projectId,
      target: 'production',
      limit: '100',
    }),
    {
      headers: vercelHeaders(config),
      signal: AbortSignal.timeout(config.timeoutMs),
    },
    fetchImpl,
    'list deployments',
  );
  const deployments = Array.isArray(result?.deployments) ? result.deployments : [];
  return deployments.find(
    (deployment) =>
      deployment?.projectId === config.projectId &&
      deployment?.target === 'production' &&
      deploymentCommit(deployment) === commit &&
      deploymentBranch(deployment) === branch,
  );
}

function checkpointFromVercel(
  deployment,
  {phase, commit, branch, projectId, triggeredAt, reused},
) {
  if (
    !/^dpl_[A-Za-z0-9]+$/.test(deployment?.id || '') ||
    deployment?.projectId !== projectId ||
    deployment?.target !== 'production' ||
    deploymentCommit(deployment) !== commit ||
    deploymentBranch(deployment) !== branch
  ) {
    throw new Error('Vercel deployment response does not match the requested production commit');
  }
  return {
    provider: 'vercel',
    phase,
    target: 'production',
    commit,
    branch,
    projectId,
    deploymentId: deployment.id,
    deploymentUrl: sanitizeDeploymentUrl(deployment.url),
    state: normalizedState(deployment),
    triggeredAt,
    reused: Boolean(reused),
  };
}

function deploymentCommit(deployment) {
  return (
    deployment?.gitSource?.sha ||
    deployment?.meta?.githubCommitSha ||
    deployment?.meta?.gitCommitSha ||
    null
  );
}

function deploymentBranch(deployment) {
  return (
    deployment?.gitSource?.ref ||
    deployment?.meta?.githubCommitRef ||
    deployment?.meta?.gitCommitRef ||
    null
  );
}

function normalizedState(deployment) {
  return String(
    deployment?.readyState || deployment?.state || deployment?.status || 'QUEUED',
  ).toUpperCase();
}

function vercelHeaders(config) {
  return {
    Authorization: `Bearer ${config.token}`,
    'Content-Type': 'application/json',
  };
}

function vercelUrl(pathname, config, extra = {}) {
  const url = new URL(pathname, VERCEL_API_ORIGIN);
  if (config.scope.startsWith('team_')) {
    url.searchParams.set('teamId', config.scope);
  } else {
    url.searchParams.set('slug', config.scope);
  }
  for (const [key, value] of Object.entries(extra)) url.searchParams.set(key, value);
  return url;
}

async function requestJson(url, options, fetchImpl, label) {
  let response;
  try {
    response = await fetchImpl(url, options);
  } catch (error) {
    throw new Error(`Vercel ${label} request failed: ${safeErrorName(error)}`);
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON failure is still reported without reflecting provider output.
  }
  if (!response.ok) {
    const code = safeProviderCode(body?.error?.code);
    throw new Error(
      `Vercel ${label} failed with HTTP ${response.status}${code ? ` (${code})` : ''}`,
    );
  }
  if (!body || typeof body !== 'object') {
    throw new Error(`Vercel ${label} returned an invalid JSON response`);
  }
  return body;
}

function assertDeploymentInput({phase, commit, branch, runId}) {
  if (!['candidate', 'final'].includes(phase)) {
    throw new Error('Deployment phase must be candidate or final');
  }
  if (!/^[0-9a-f]{40}$/.test(commit || '')) {
    throw new Error('Deployment requires an exact lowercase Git commit SHA');
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(branch || '') ||
    branch.includes('..') ||
    branch.includes('//')
  ) {
    throw new Error('Deployment requires a safe Git branch name');
  }
  if (!/^[A-Za-z0-9:_-]+$/.test(runId || '')) {
    throw new Error('Deployment requires a safe run ID');
  }
}

function safeProviderCode(value) {
  const code = String(value || '');
  return /^[A-Z0-9_-]{1,80}$/i.test(code) ? code : '';
}

function safeErrorName(error) {
  const name = String(error?.name || 'network error');
  return /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name) ? name : 'network error';
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
