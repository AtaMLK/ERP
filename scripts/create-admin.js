require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function ask(question) {
  if (question.toLowerCase().includes('email') && process.env.FZ_ADMIN_EMAIL) return Promise.resolve(process.env.FZ_ADMIN_EMAIL);
  return new Promise((resolve) => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); });
  });
}

function askSecret(question) {
  if (process.env.FZ_ADMIN_PASSWORD) return Promise.resolve(process.env.FZ_ADMIN_PASSWORD);
  if (!process.stdin.isTTY) return ask(question);

  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let value = '';
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };
    const onData = (key) => {
      if (key === '\u0003') { cleanup(); reject(new Error('Cancelled')); return; }
      if (key === '\r' || key === '\n') { stdout.write('\n'); cleanup(); resolve(value); return; }
      if (key === '\u007f' || key === '\b') { if (value.length) value = value.slice(0, -1); return; }
      value += key;
    };
    stdin.on('data', onData);
  });
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  const emailArg = process.argv.find((v) => v.startsWith('--email='));
  const nameArg = process.argv.find((v) => v.startsWith('--name='));
  const email = emailArg ? emailArg.slice(8) : await ask('Admin email: ');
  const name = nameArg ? nameArg.slice(7) : await ask('Admin name: ');
  const password = await askSecret('Admin password: ');
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  if (!normalizedEmail || !normalizedName || password.length < 12) throw new Error('Email, name and a password of at least 12 characters are required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);

    // Look up first and UPDATE an existing account directly. This avoids the
    // PostgreSQL BEFORE INSERT max-user trigger firing during an UPSERT before
    // the unique-email conflict can be resolved. Updating an already-active
    // user must not consume another one of the five active-user slots.
    const existing = await client.query(
      'SELECT id,email FROM users WHERE lower(email)=lower($1) LIMIT 1',
      [normalizedEmail]
    );

    let user;
    if (existing.rows[0]) {
      user = await client.query(
        `UPDATE users
         SET name=$1,password_hash=$2,updated_at=now(),deleted_at=NULL
         WHERE id=$3
         RETURNING id,email,name`,
        [normalizedName, hash, existing.rows[0].id]
      );
    } else {
      user = await client.query(
        `INSERT INTO users(email,name,password_hash)
         VALUES($1,$2,$3)
         RETURNING id,email,name`,
        [normalizedEmail, normalizedName, hash]
      );
    }

    const role = await client.query(`SELECT id FROM roles WHERE name='Admin' LIMIT 1`);
    if (!role.rows[0]) throw new Error('Admin role not found. Run database/schema.sql first.');
    await client.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [user.rows[0].id, role.rows[0].id]);
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

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
