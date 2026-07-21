import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import * as schema from './schema.server';

const clients = new Map<string, ReturnType<typeof createClient>>();

function createClient(url: string) {
  const pool = new Pool({
    connectionString: url,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
  });
  return {db: drizzle(pool, {schema}), pool};
}

export function getDatabase(env: AppEnv = process.env) {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('Missing required env vars: DATABASE_URL');
  let client = clients.get(url);
  if (!client) {
    client = createClient(url);
    clients.set(url, client);
  }
  return client.db;
}

export async function closeDatabases() {
  await Promise.all([...clients.values()].map(({pool}) => pool.end()));
  clients.clear();
}

export type Database = ReturnType<typeof getDatabase>;
