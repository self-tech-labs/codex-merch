import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

function runInspect(databaseUrl, expectedDatabase) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      'scripts/orders.ts',
      'inspect',
      'CM-TEST',
      '--production',
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        ORDER_OPERATIONS_TARGET: 'production',
        ORDER_OPERATIONS_EXPECTED_DATABASE: expectedDatabase,
        DATABASE_URL: databaseUrl,
      },
    },
  );
}

test('operator CLI never echoes a malformed database URL', () => {
  const secret = 'operator-password-must-not-leak';
  const result = runInspect(
    `postgresql://operator:${secret}@[invalid/neondb`,
    'expected.example/neondb',
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /valid absolute Postgres URL/);
  assert.doesNotMatch(output, new RegExp(secret));
});

test('operator CLI blocks an unexpected cloud database before querying', () => {
  const secret = 'another-password-must-not-leak';
  const result = runInspect(
    `postgresql://operator:${secret}@actual.example/neondb`,
    'expected.example/neondb',
  );
  const output = `${result.stdout}${result.stderr}`;

  assert.notEqual(result.status, 0);
  assert.match(output, /Database target mismatch/);
  assert.doesNotMatch(output, new RegExp(secret));
});
