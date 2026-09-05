import { Pool } from 'pg';

/**
 * Keep PostgreSQL completely out of Next.js build-time initialization.
 * The pool is created only when server code actually touches it.
 */
let poolInstance: Pool | null = null;

function getPool(): Pool {
  if (poolInstance) return poolInstance;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to access the database');
  }

  poolInstance = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
  });

  poolInstance.on('error', (err) => console.error('PostgreSQL pool error', err));
  return poolInstance;
}

// Preserve the existing `pool.query(...)` API across the application while
// avoiding Pool construction during Next.js static analysis/build.
export const pool = new Proxy({} as Pool, {
  get(_target, property, receiver) {
    const value = Reflect.get(getPool(), property, receiver);
    return typeof value === 'function' ? value.bind(getPool()) : value;
  },
});
