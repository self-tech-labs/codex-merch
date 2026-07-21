import {readdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new Pool({connectionString: url});
const client = await pool.connect();
let migrationLockHeld = false;
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  await client.query(
    'SELECT pg_advisory_lock(hashtext($1))',
    ['codex-merch-schema-migrations'],
  );
  migrationLockHeld = true;
  const migrationDirectory = path.resolve('drizzle');
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
    .sort();
  if (!migrations.length) throw new Error('No database migrations found');

  let appliedCount = 0;
  for (const filename of migrations) {
    const name = filename.replace(/\.sql$/, '');
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [name],
    );
    if (applied.rowCount) continue;

    const sql = await readFile(path.join(migrationDirectory, filename), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      appliedCount += 1;
      console.log(`Applied database migration: ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
  if (!appliedCount) console.log('Database migrations already up to date.');
} finally {
  if (migrationLockHeld) {
    await client
      .query('SELECT pg_advisory_unlock(hashtext($1))', [
        'codex-merch-schema-migrations',
      ])
      .catch(() => undefined);
  }
  client.release();
  await pool.end();
}
