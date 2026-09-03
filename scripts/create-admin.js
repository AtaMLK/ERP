const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const readline = require('readline');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function ask(question, hidden = false) {
  if (process.env[hidden ? 'FZ_ADMIN_PASSWORD' : 'FZ_ADMIN_EMAIL']) {
    return Promise.resolve(process.env[hidden ? 'FZ_ADMIN_PASSWORD' : 'FZ_ADMIN_EMAIL']);
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const email = (process.argv.find((v) => v.startsWith('--email=')) || '').slice(8) || await ask('Admin email: ');
  const name = (process.argv.find((v) => v.startsWith('--name=')) || '').slice(7) || await ask('Admin name: ');
  const password = await ask('Admin password: ', true);
  if (!email || !name || password.length < 12) throw new Error('Email, name and a password of at least 12 characters are required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);
    const user = await client.query(`
      INSERT INTO users(email,name,password_hash)
      VALUES($1,$2,$3)
      ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,updated_at=now(),deleted_at=NULL
      RETURNING id,email,name
    `, [email.toLowerCase(), name, hash]);
    const role = await client.query(`SELECT id FROM roles WHERE name='Admin' LIMIT 1`);
    if (!role.rows[0]) throw new Error('Admin role not found. Run database/schema.sql first.');
    await client.query(`INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [user.rows[0].id, role.rows[0].id]);
    await client.query('COMMIT');
    console.log(`Admin user ready: ${user.rows[0].email}`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
