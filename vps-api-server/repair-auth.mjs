import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '.env'), override: true });

const ADMIN_EMAIL = 'admin@pulse.com';
const ADMIN_PASSWORD = 'Pulse@2026!';
const TEMP_PASSWORD = 'Pulse@2026!';
const RESET_ALL_USER_PASSWORDS = process.env.RESET_ALL_USER_PASSWORDS === 'true';
const ALLOW_SCHEMA_CHANGES = process.env.REPAIR_AUTH_ALLOW_SCHEMA_CHANGES === 'true';
const VALID_ROLES = new Set([
  'admin',
  'videomaker',
  'social_media',
  'editor',
  'endomarketing',
  'parceiro',
  'fotografo',
  'designer',
  'copywriter',
  'gestor_projetos',
  'socio_gestor',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeRole(role) {
  const value = String(role || '').trim();
  return VALID_ROLES.has(value) ? value : 'editor';
}

function isPresentHash(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const pgConnectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const pgPassword = process.env.PG_PASSWORD ?? process.env.PGPASSWORD ?? process.env.DB_PASSWORD;
const pool = pgConnectionString
  ? new Pool({ connectionString: pgConnectionString })
  : new Pool({
      host: process.env.PG_HOST || process.env.PGHOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || process.env.PGPORT || 5432),
      database: process.env.PG_DATABASE || process.env.PGDATABASE || process.env.DB_NAME || 'pulse_db',
      user: process.env.PG_USER || process.env.PGUSER || process.env.DB_USER || 'pulse_user',
      ...(typeof pgPassword === 'string' && pgPassword.length > 0 ? { password: pgPassword } : {}),
    });

async function tableExists(client, tableName) {
  const { rows } = await client.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return Boolean(rows[0]?.exists);
}

async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
     ) AS exists`,
    [tableName, columnName],
  );
  return Boolean(rows[0]?.exists);
}

async function backupTable(client, backupDir, tableName) {
  if (!(await tableExists(client, tableName))) return 0;
  const { rows } = await client.query(`SELECT * FROM ${tableName}`);
  await fs.writeFile(path.join(backupDir, `${tableName}.json`), JSON.stringify(rows, null, 2));
  return rows.length;
}

async function ensureAuthTables(client) {
  if (!ALLOW_SCHEMA_CHANGES) {
    for (const tableName of ['profiles', 'auth_users', 'user_roles']) {
      if (!(await tableExists(client, tableName))) {
        throw new Error(`Tabela obrigatória ausente: ${tableName}. Reparo abortado para não alterar schema.`);
      }
    }

    const requiredColumns = [
      ['profiles', 'id'],
      ['profiles', 'email'],
      ['auth_users', 'id'],
      ['auth_users', 'email'],
      ['auth_users', 'password_hash'],
      ['user_roles', 'user_id'],
      ['user_roles', 'role'],
    ];

    for (const [tableName, columnName] of requiredColumns) {
      if (!(await columnExists(client, tableName, columnName))) {
        throw new Error(`Coluna obrigatória ausente: ${tableName}.${columnName}. Reparo abortado para não alterar schema.`);
      }
    }

    return;
  }

  await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  await client.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_sign_in TIMESTAMPTZ
    );

    ALTER TABLE auth_users
      ADD COLUMN IF NOT EXISTS last_sign_in TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS user_roles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      role TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, role)
    );

    CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users (lower(email));
    CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles (user_id);
    CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles (role);
  `);
}

async function ensureAdminProfile(client, passwordHash) {
  const normalizedEmail = normalizeEmail(ADMIN_EMAIL);
  const { rows } = await client.query('SELECT id FROM profiles WHERE lower(email) = lower($1) LIMIT 1', [normalizedEmail]);
  let userId = rows[0]?.id;
  const hasRole = await columnExists(client, 'profiles', 'role');
  const hasName = await columnExists(client, 'profiles', 'name');

  if (!userId) {
    if (!ALLOW_SCHEMA_CHANGES) {
      throw new Error(`Perfil admin não encontrado (${ADMIN_EMAIL}). Reparo abortado para não criar registros novos sem confirmação.`);
    }

    const columns = ['id', 'email'];
    const values = ['gen_random_uuid()', '$1'];
    if (hasName) {
      columns.push('name');
      values.push(`'Admin'`);
    }
    if (hasRole) {
      columns.push('role');
      values.push(`'admin'`);
    }
    const inserted = await client.query(
      `INSERT INTO profiles (${columns.join(', ')})
       VALUES (${values.join(', ')})
       RETURNING id`,
      [normalizedEmail],
    );
    userId = inserted.rows[0].id;
  } else if (hasRole) {
    await client.query('UPDATE profiles SET role = $1 WHERE id = $2', ['admin', userId]);
  }

  await upsertAuthUser(client, userId, normalizedEmail, passwordHash);

  await client.query(
    `INSERT INTO user_roles (user_id, role)
     VALUES ($1, 'admin')
     ON CONFLICT (user_id, role) DO NOTHING`,
    [userId],
  );

  return userId;
}

async function upsertAuthUser(client, userId, email, passwordHash) {
  const normalizedEmail = normalizeEmail(email);

  await client.query(
    `DELETE FROM auth_users
      WHERE lower(email) = lower($1)
        AND id <> $2`,
    [normalizedEmail, userId],
  );

  const updated = await client.query(
    `UPDATE auth_users
        SET email = $2,
            password_hash = $3,
            updated_at = now()
      WHERE id = $1`,
    [userId, normalizedEmail, passwordHash],
  );

  if (updated.rowCount > 0) return;

  await client.query(
    `INSERT INTO auth_users (id, email, password_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           updated_at = now()`,
    [userId, normalizedEmail, passwordHash],
  );
}

async function repairProfiles(client) {
  if (!(await tableExists(client, 'profiles'))) {
    throw new Error('Tabela profiles não existe. O banco correto não foi selecionado.');
  }

  const hasCreatedAt = await columnExists(client, 'profiles', 'created_at');
  const hasProfileHash = await columnExists(client, 'profiles', 'password_hash');
  const passwordHashSelect = hasProfileHash ? 'password_hash' : 'NULL::text AS password_hash';
  const orderBy = hasCreatedAt ? 'ORDER BY created_at NULLS LAST, name NULLS LAST' : 'ORDER BY name NULLS LAST';
  const { rows: profiles } = await client.query(
    `SELECT id, name, email, role::text AS role, ${passwordHashSelect}
       FROM profiles
      WHERE email IS NOT NULL AND trim(email) <> ''
      ${orderBy}`,
  );

  const tempHash = await bcrypt.hash(TEMP_PASSWORD, 12);
  let preserved = 0;
  let createdWithTemp = 0;
  let rolesRepaired = 0;

  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    if (!email) continue;

    const { rows: existingAuthRows } = await client.query(
      'SELECT id, password_hash FROM auth_users WHERE id = $1 OR lower(email) = lower($2) LIMIT 1',
      [profile.id, email],
    );
    const existingAuth = existingAuthRows[0];
    const chosenHash = RESET_ALL_USER_PASSWORDS
      ? tempHash
      : isPresentHash(existingAuth?.password_hash)
      ? existingAuth.password_hash.trim()
      : isPresentHash(profile.password_hash)
        ? profile.password_hash.trim()
        : tempHash;

    if (RESET_ALL_USER_PASSWORDS || (chosenHash === tempHash && !isPresentHash(existingAuth?.password_hash) && !isPresentHash(profile.password_hash))) {
      createdWithTemp += 1;
    } else {
      preserved += 1;
    }

    await upsertAuthUser(client, profile.id, email, chosenHash);

    if (hasProfileHash) {
      await client.query(
        `UPDATE profiles
            SET password_hash = $1${await columnExists(client, 'profiles', 'updated_at') ? ', updated_at = now()' : ''}
          WHERE id = $2`,
        [chosenHash, profile.id],
      );
    }

    const role = normalizeRole(profile.role);
    const roleInsert = await client.query(
      `INSERT INTO user_roles (user_id, role)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [profile.id, role],
    );
    rolesRepaired += roleInsert.rowCount || 0;
  }

  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const adminId = await ensureAdminProfile(client, adminHash);
  const { rows: [adminAuth] } = await client.query(
    'SELECT password_hash FROM auth_users WHERE id = $1 OR lower(email) = lower($2) LIMIT 1',
    [adminId, ADMIN_EMAIL],
  );
  const adminPasswordVerified = Boolean(adminAuth?.password_hash && await bcrypt.compare(ADMIN_PASSWORD, adminAuth.password_hash));

  if (!adminPasswordVerified) {
    throw new Error('Hash do admin não confere após o reparo. Nenhuma senha foi exibida.');
  }

  const { rows: counts } = await client.query(`
    SELECT
      (SELECT count(*)::int FROM profiles) AS profiles,
      (SELECT count(*)::int FROM auth_users) AS auth_users,
      (SELECT count(*)::int FROM user_roles) AS user_roles
  `);

  return {
    adminId,
    profiles: profiles.length,
    preserved,
    createdWithTemp,
    rolesRepaired,
    counts: counts[0],
  };
}

async function main() {
  const client = await pool.connect();
  const backupDir = path.join('/var/backups/pulse-auth', new Date().toISOString().replace(/[:.]/g, '-'));

  try {
    await fs.mkdir(backupDir, { recursive: true });
    await ensureAuthTables(client);

    const backedUp = {};
    for (const table of ['profiles', 'auth_users', 'user_roles']) {
      backedUp[table] = await backupTable(client, backupDir, table);
    }

    const result = await repairProfiles(client);

    console.log(JSON.stringify({
      ok: true,
      backupDir,
      backedUp,
      adminEmail: ADMIN_EMAIL,
      adminPasswordUpdated: true,
      resetAllUserPasswords: RESET_ALL_USER_PASSWORDS,
      schemaChangesAllowed: ALLOW_SCHEMA_CHANGES,
      ...result,
    }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2));
  process.exit(1);
});