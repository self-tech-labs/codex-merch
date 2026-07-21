import {createHash, randomUUID} from 'node:crypto';
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const WEEKLY_PIPELINE_VERSION = 'weekly-merch-v1';

export function defaultWeeklyRunRoot(env = process.env) {
  return path.resolve(rootDir, env.MERCH_WEEKLY_RUN_ROOT || '.cache/merch-weekly');
}

export function createWeeklyRunIdentity({
  listId,
  date = new Date(),
  timeZone = 'Europe/Zurich',
  week,
  pipelineVersion = WEEKLY_PIPELINE_VERSION,
} = {}) {
  if (!listId || !/^\d+$/.test(String(listId))) {
    throw new Error('A numeric X list ID is required for the weekly run');
  }
  const isoWeek = week || isoWeekInTimeZone(date, timeZone);
  if (!/^\d{4}-W\d{2}$/.test(isoWeek)) {
    throw new Error('Week must use ISO format YYYY-Www');
  }
  const runKey = `x-list:${listId}:${isoWeek}:${pipelineVersion}`;
  const runId = runKey.replaceAll(':', '--');
  return {runId, runKey, isoWeek, listId: String(listId), pipelineVersion, timeZone};
}

export async function readWeeklyRun(identity, options = {}) {
  const file = runFile(identity, options);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeWeeklyRun(identity, run, options = {}) {
  const file = runFile(identity, options);
  const next = {...run, updatedAt: new Date().toISOString()};
  await atomicWriteJson(file, next, {mode: 0o600});
  return next;
}

export async function writeWeeklyArtifact(identity, name, value, options = {}) {
  assertSafeArtifactName(name);
  const directory = runDirectory(identity, options);
  const file = safeChild(directory, name.endsWith('.json') ? name : `${name}.json`);
  await atomicWriteJson(file, value, {mode: 0o600});
  return path.relative(rootDir, file);
}

export async function readWeeklyArtifact(identity, name, options = {}) {
  const directory = runDirectory(identity, options);
  const file = safeChild(directory, name.endsWith('.json') ? name : `${name}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function writeWeeklyBinaryArtifact(identity, name, value, options = {}) {
  assertSafeArtifactName(name);
  const directory = runDirectory(identity, options);
  const file = safeChild(directory, name);
  await atomicWriteBuffer(file, value, {mode: 0o600});
  return path.relative(rootDir, file);
}

export async function readWeeklyBinaryArtifact(identity, name, options = {}) {
  assertSafeArtifactName(name);
  const directory = runDirectory(identity, options);
  const file = safeChild(directory, name);
  try {
    return await readFile(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

export async function withWeeklyRunLock(identity, callback, options = {}) {
  const directory = runDirectory(identity, options);
  await mkdir(directory, {recursive: true});
  const lockPath = safeChild(directory, 'run.lock');
  let handle;
  try {
    handle = await open(lockPath, 'wx', 0o600);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const details = await stat(lockPath);
    const staleAfterMs = Number(options.staleAfterMs || 6 * 60 * 60 * 1_000);
    if (Date.now() - details.mtimeMs <= staleAfterMs) {
      throw new Error(`Weekly run is already locked: ${identity.runId}`);
    }
    const stalePath = safeChild(
      directory,
      `run.lock.stale-${new Date().toISOString().replace(/[^0-9]/g, '')}`,
    );
    await rename(lockPath, stalePath);
    handle = await open(lockPath, 'wx', 0o600);
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({pid: process.pid, acquiredAt: new Date().toISOString()})}\n`,
    );
    return await callback();
  } finally {
    await handle?.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }
}

export async function recentTrendFingerprints(options = {}) {
  const root = path.resolve(options.runRoot || defaultWeeklyRunRoot(options.env));
  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (options.excludeRunId && entry.name === options.excludeRunId) continue;
    const runStateFile = safeChild(path.join(root, entry.name), 'run.json');
    const file = safeChild(path.join(root, entry.name), 'trend-decision.json');
    try {
      const runState = JSON.parse(await readFile(runStateFile, 'utf8'));
      if (runState?.status !== 'published') continue;
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (value?.fingerprint?.length) {
        const details = await stat(file);
        candidates.push({fingerprint: value.fingerprint, mtimeMs: details.mtimeMs});
      }
    } catch (error) {
      if (error?.code !== 'ENOENT' && error?.name !== 'SyntaxError') throw error;
    }
  }

  return candidates
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, Number(options.limit || 8))
    .map((item) => item.fingerprint);
}

export function hashJson(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export async function atomicWriteJson(filePath, value, {mode = 0o644} = {}) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`, {mode});
}

export async function atomicWriteText(filePath, value, {mode = 0o644} = {}) {
  await atomicWriteBuffer(filePath, value, {mode});
}

export async function atomicWriteBuffer(filePath, value, {mode = 0o644} = {}) {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, value, {mode});
    await rename(temporary, filePath);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

function assertSafeArtifactName(name) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) {
    throw new Error(`Unsafe weekly artifact name: ${name}`);
  }
}

function runDirectory(identity, options) {
  const root = path.resolve(options.runRoot || defaultWeeklyRunRoot(options.env));
  return safeChild(root, identity.runId);
}

function runFile(identity, options) {
  return safeChild(runDirectory(identity, options), 'run.json');
}

function safeChild(parent, child) {
  const resolvedParent = path.resolve(parent);
  const resolved = path.resolve(resolvedParent, child);
  if (!resolved.startsWith(`${resolvedParent}${path.sep}`)) {
    throw new Error(`Unsafe weekly run path: ${child}`);
  }
  return resolved;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function isoWeekInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - weekday);
  const isoYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((localDate - yearStart) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}
