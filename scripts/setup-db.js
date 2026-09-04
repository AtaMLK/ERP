require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

function getSqlFiles() {
  const baseFiles = [
    'database/schema.sql',
    'database/extensions.sql',
    'database/constraints.sql',
  ];

  const migrationsDir = path.resolve(process.cwd(), 'database/migrations');
  const migrations = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir)
        .filter((name) => name.endsWith('.sql'))
        .sort()
        .map((name) => `database/migrations/${name}`)
    : [];

  return [...baseFiles, ...migrations];
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  const files = getSqlFiles();
  const client = await pool.connect();
  try {
    for (const relative of files) {
      const file = path.resolve(process.cwd(), relative);
      if (!fs.existsSync(file)) {
        console.warn(`Skipping missing ${relative}`);
        continue;
      }
      console.log(`Applying ${relative}...`);
      await client.query(fs.readFileSync(file, 'utf8'));
    }
    console.log('Database setup complete.');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`Database setup failed: ${error.message}`);
  process.exit(1);
});
