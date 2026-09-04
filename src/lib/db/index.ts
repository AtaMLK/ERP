import { Pool } from 'pg';

// Do not throw during Next.js build/static analysis. A database connection is
// only required when an API/server action actually executes a query.
const connectionString = process.env.DATABASE_URL;

export const pool = new Pool({
  ...(connectionString ? { connectionString } : {}),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => console.error('PostgreSQL pool error', err));
