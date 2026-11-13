// Applies db/migrations/*.sql in filename order, each once, each in its own
// transaction. Applied migrations are recorded in schema_migrations.
//   DATABASE_URL=... npm run db:migrate
// On Vercel this runs on every deploy (the "vercel-build" script).

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/migrations');

export async function migrate(db, log = console.log) {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const done = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      log(`applied ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(`${file}: ${error.message}`);
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Use a direct (unpooled) connection when the provider offers one: the
  // session-level advisory lock below does not work through PgBouncer.
  const direct = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
  if (direct) process.env.DATABASE_URL = direct;
  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL) {
    console.error('DATABASE_URL is not set; skipping migrations');
    process.exit(process.env.VERCEL ? 1 : 0);
  }
  const { pool } = await import('../src/lib/db.js');
  // Serialise concurrent runs (e.g. several containers starting at once).
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(727274)');
    await migrate(pool);
    console.log('migrations up to date');
  } finally {
    await lock.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    lock.release();
    await pool.end();
  }
}
