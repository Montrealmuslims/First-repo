import pg from 'pg';

export const pool = new pg.Pool({
  // DATABASE_URL, or POSTGRES_URL as set by the Neon ↔ Vercel integration.
  connectionString: process.env.DATABASE_URL ?? process.env.POSTGRES_URL,
  // Require TLS to the database outside local development.
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: true },
  // Serverless (Vercel) runs many small instances: keep each pool small and
  // use the provider's pooled connection string.
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: 10_000,
});

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
