import crypto from 'node:crypto';
import { pool, ensureSchema, describeError } from './db';
import { ADMIN_USER, ADMIN_PASSWORD, safeEqual } from './session';

/**
 * Admin credentials.
 *
 * They used to be a pair of environment variables, which meant the password
 * could only be changed by editing the deployment. They now live in the
 * `admin_users` table as a scrypt digest, and ADMIN_USER / ADMIN_PASSWORD are
 * demoted to a *seed*: the first time an admin is needed and the table is
 * empty, the env pair is written in. From then on the row is the truth and the
 * env values are ignored, so changing the password in the dashboard sticks.
 *
 * With no DATABASE_URL there is nowhere to store a row, so login falls back to
 * comparing the env pair directly — exactly the old behaviour, and the account
 * screen says why it can't offer a change.
 */

const KEY_LENGTH = 64;
// Node's defaults with a raised maxmem: N=16384 needs ~32 MB, over the 32 MB
// default ceiling once r and p are applied.
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.scryptSync(String(password), salt, KEY_LENGTH, SCRYPT).toString('hex');
  return `scrypt$${salt}$${digest}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, digest] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  let derived;
  try {
    derived = crypto.scryptSync(String(password), salt, KEY_LENGTH, SCRYPT).toString('hex');
  } catch {
    return false;
  }
  if (derived.length !== digest.length) return false;
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(digest, 'hex'));
}

/** The stored admin row, seeding it from the environment when the table is empty. */
export async function getAdminUser() {
  if (!pool) return null;
  await ensureSchema();
  const { rows } = await pool.query(
    'SELECT id, username, password_hash, updated_at FROM admin_users ORDER BY id LIMIT 1'
  );
  if (rows[0]) return rows[0];
  if (!ADMIN_PASSWORD) return null;

  const { rows: seeded } = await pool.query(
    `INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)
     ON CONFLICT (username) DO UPDATE SET updated_at = now()
     RETURNING id, username, password_hash, updated_at`,
    [ADMIN_USER, hashPassword(ADMIN_PASSWORD)]
  );
  console.log('[auth] seeded the admin account from ADMIN_USER/ADMIN_PASSWORD');
  return seeded[0];
}

/** Is there any way to sign in at all? */
export async function loginConfigured() {
  if (ADMIN_PASSWORD) return true;
  try {
    return Boolean(await getAdminUser());
  } catch (e) {
    console.error('[auth] config check failed:', describeError(e));
    return false;
  }
}

/** True when credentials can actually be changed (i.e. there is a row to change). */
export async function credentialsEditable() {
  if (!pool) return false;
  try {
    return Boolean(await getAdminUser());
  } catch {
    return false;
  }
}

export async function verifyLogin(username, password) {
  const name = String(username || '');
  const secret = String(password || '');
  if (!secret) return false;

  try {
    const admin = await getAdminUser();
    if (admin) {
      return safeEqual(name, admin.username) && verifyPassword(secret, admin.password_hash);
    }
  } catch (e) {
    // A database blip must not silently fall back to a stale env password
    // when a row exists; only a missing row reaches the env path below.
    console.error('[auth] login lookup failed:', describeError(e));
    return false;
  }

  // No database (or no row and no seed): the original environment check.
  if (!ADMIN_PASSWORD) return false;
  return safeEqual(name, ADMIN_USER) && safeEqual(secret, ADMIN_PASSWORD);
}

/**
 * Change the username and/or password. The current password is always
 * required — a hijacked session shouldn't be able to lock the owner out.
 *
 * @returns {Promise<{ok: true, username: string} | {error: string, status: number}>}
 */
export async function updateCredentials({ username, currentPassword, newPassword }) {
  const admin = await getAdminUser();
  if (!admin) {
    return {
      error: pool
        ? 'No admin account exists yet. Set ADMIN_USER and ADMIN_PASSWORD once, sign in, and it will be created.'
        : 'Credentials are read from the environment because no database is configured.',
      status: 503,
    };
  }

  if (!verifyPassword(String(currentPassword || ''), admin.password_hash)) {
    return { error: 'Your current password is not correct.', status: 400 };
  }

  const nextName = String(username || '').trim() || admin.username;
  if (!/^[\w.@-]{3,64}$/.test(nextName)) {
    return {
      error: 'A username must be 3–64 characters, using letters, numbers, dot, dash, underscore or @.',
      status: 400,
    };
  }

  let hash = admin.password_hash;
  if (newPassword) {
    if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
      return {
        error: `A new password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
        status: 400,
      };
    }
    hash = hashPassword(String(newPassword));
  }

  if (nextName !== admin.username) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM admin_users WHERE username = $1 AND id <> $2',
      [nextName, admin.id]
    );
    if (rowCount) return { error: 'That username is already taken.', status: 409 };
  }

  await pool.query(
    'UPDATE admin_users SET username = $2, password_hash = $3, updated_at = now() WHERE id = $1',
    [admin.id, nextName, hash]
  );
  return { ok: true, username: nextName };
}
