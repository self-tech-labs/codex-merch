import {realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  buildWeeklyEvidence,
  serializeWeeklyEvidence,
  weeklyEvidenceRoot,
} from './services/weekly-evidence.mjs';
import {atomicWriteText} from './services/weekly-run-store.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function main(args = process.argv.slice(2)) {
  const options = parseEvidenceOptions(args);
  const bundle = await buildWeeklyEvidence(options);
  const serialized = serializeWeeklyEvidence(bundle);

  if (options.dryRun) {
    process.stdout.write(serialized);
    return bundle;
  }

  const output = await resolveEvidenceOutput(options.output);
  await atomicWriteText(output, serialized, {mode: 0o644});
  process.stdout.write(
    `${JSON.stringify({
      runId: bundle.identity.runId,
      status: bundle.state.status,
      output: path.relative(rootDir, output),
      payloadSha256: bundle.integrity.payloadSha256,
    }, null, 2)}\n`,
  );
  return bundle;
}

export function parseEvidenceOptions(args) {
  const valueFlags = new Set(['--run-id', '--week', '--list-id', '--output']);
  const booleanFlags = new Set(['--dry-run']);
  const values = {};
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!valueFlags.has(token) && !booleanFlags.has(token)) {
      throw new Error(`Unknown evidence option: ${token}`);
    }
    if (seen.has(token)) throw new Error(`Duplicate evidence option: ${token}`);
    seen.add(token);
    if (valueFlags.has(token)) {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for evidence option: ${token}`);
      }
      values[token] = value;
      index += 1;
    }
  }

  const dryRun = seen.has('--dry-run');
  if (dryRun && values['--output']) {
    throw new Error('--dry-run writes JSON to stdout; do not combine it with --output');
  }
  if (!dryRun && !values['--output']) {
    throw new Error('Evidence export requires an explicit --output path');
  }

  return {
    runId: values['--run-id'],
    week: values['--week'],
    listId: values['--list-id'],
    output: values['--output'],
    dryRun,
  };
}

async function resolveEvidenceOutput(value) {
  const evidenceRoot = await realpath(weeklyEvidenceRoot);
  const output = path.resolve(rootDir, value);
  if (
    output === evidenceRoot ||
    !output.startsWith(`${evidenceRoot}${path.sep}`) ||
    path.extname(output).toLowerCase() !== '.json'
  ) {
    throw new Error(
      'Evidence output must be a JSON file under docs/build-week/evidence',
    );
  }
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
