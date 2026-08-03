// @y2f/db-schema — connection helpers.
//
// Two factories, one per Neon connection mode:
//   - createDirectClient  — `pg.Client` (non-pooled). For the worker, migrations,
//     and any long-running job. Defaults to DATABASE_URL.
//   - createPooledClient  — `pg.Pool` (sized for serverless). For apps/api.
//     Defaults to DATABASE_URL_POOLED.
//
// Each factory refuses a connection string whose pooled/direct shape
// contradicts its purpose. Neon distinguishes the two endpoints by a
// `-pooler` infix on the same compute id — easy to paste in swapped or
// identical. That mistake is silent until a migration misbehaves, so the
// helper asserts it up front (mirrors scripts/smoke/checks.ts → checkConnStrings).

import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type DbClient = NodePgDatabase<typeof schema>;

/** Extract the hostname from a Postgres connection string, or null if unparseable. */
export function safeHost(connectionString: string): string | null {
  try {
    return new URL(connectionString).hostname;
  } catch {
    return null;
  }
}

function assertHostShape(connectionString: string, expectPooled: boolean): void {
  const host = safeHost(connectionString);
  if (host === null) {
    throw new Error(
      `Could not parse a hostname from the connection string (expected a ${
        expectPooled ? 'pooled' : 'direct'
      } Neon endpoint).`,
    );
  }
  const isPooled = host.includes('-pooler');
  if (expectPooled && !isPooled) {
    throw new Error(
      `Refusing to build a pooled client from a non-pooler host (${host}). ` +
        'Pass DATABASE_URL_POOLED (the host with the -pooler infix), not DATABASE_URL.',
    );
  }
  if (!expectPooled && isPooled) {
    throw new Error(
      `Refusing to build a direct client from a pooler host (${host}). ` +
        'Pass DATABASE_URL (the direct, non-pooled endpoint), not DATABASE_URL_POOLED.',
    );
  }
}

/**
 * Single non-pooled `pg.Client`. For migrations, the always-on worker, and any
 * long-running job. Defaults to `process.env.DATABASE_URL`.
 */
export function createDirectClient(connectionString?: string): {
  client: pg.Client;
  db: DbClient;
} {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is not set and no connection string was provided.');
  }
  assertHostShape(url, false);
  const client = new pg.Client({ connectionString: url });
  const db = drizzle(client, { schema });
  return { client, db };
}

/**
 * `pg.Pool` sized for serverless reads. For `apps/api`. Defaults to
 * `process.env.DATABASE_URL_POOLED`.
 */
export function createPooledClient(connectionString?: string): {
  pool: pg.Pool;
  db: DbClient;
} {
  const url = connectionString ?? process.env.DATABASE_URL_POOLED;
  if (!url) {
    throw new Error('DATABASE_URL_POOLED is not set and no connection string was provided.');
  }
  assertHostShape(url, true);
  const pool = new pg.Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  return { pool, db };
}