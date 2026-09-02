import { Pool } from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000, ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined });
pool.on('error', (err) => console.error('PostgreSQL pool error', err));
