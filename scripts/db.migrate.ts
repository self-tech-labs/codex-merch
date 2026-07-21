import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {Pool} from 'pg';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const pool = new Pool({connectionString: url});
try {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const applied = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE name = $1',
    ['0000_durable_orders'],
  );
  if (applied.rowCount) {
    console.log('Durable order migration already applied.');
    process.exitCode = 0;
  } else {
    const sql = await readFile(
      path.resolve('drizzle/0000_durable_orders.sql'),
      'utf8',
    );
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        '0000_durable_orders',
      ]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    console.log('Applied durable order migration.');
  }
} finally {
  await pool.end();
}
