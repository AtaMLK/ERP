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
  if (!email || !name || password.length < 12) throw new Error('Email, name and a password of at least 12 characters are required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hash = await bcrypt.hash(password, 12);
    const user = await client.query(`
      INSERT INTO users(email,name,password_hash)
      VALUES($1,$2,$3)
      ON CONFLICT(email) DO UPDATE SET
        name=EXCLUDED.name,
        password_hash=EXCLUDED.password_hash,
        updated_at=now(),
        deleted_at=NULL
      RETURNING id,email,name
    `, [email.trim().toLowerCase(), name.trim(), hash]);
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
