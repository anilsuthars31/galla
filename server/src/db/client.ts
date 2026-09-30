/* One database handle for the whole app. Production uses node-postgres against DATABASE_URL (Neon);
   local dev and tests use PGlite, a real Postgres compiled to WebAssembly, so no Docker is needed. */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import pg from 'pg';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export interface Database {
  db: Db;
  close: () => Promise<void>;
}

/**
 * `url` starting with postgres:// or postgresql:// connects to that server.
 * Anything else is a PGlite data directory; `memory://` keeps it in memory (tests).
 * Migrations run on open, so a fresh database is always usable.
 */
export async function openDatabase(url: string): Promise<Database> {
  if (/^postgres(ql)?:\/\//.test(url)) {
    const pool = new pg.Pool({ connectionString: url, max: 5 });
    const db = drizzlePg(pool, { schema });
    await migratePg(db, { migrationsFolder });
    return { db: db as unknown as Db, close: () => pool.end() };
  }
  if (!url.includes('://')) mkdirSync(url, { recursive: true }); // PGlite won't create parent folders
  const client = new PGlite(url);
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder });
  return { db: db as unknown as Db, close: () => client.close() };
}
