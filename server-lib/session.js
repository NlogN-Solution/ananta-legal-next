import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';

/**
 * Admin session — a single boolean (`admin`) sealed into an encrypted cookie.
 *
 * Replaces the old express-session + connect-pg-simple store (which needs a
 * long-lived server). Behaviour from the admin's point of view is identical:
 * POST /api/login seals the cookie, it survives ~30 days, POST /api/logout
 * clears it.
 */
const IS_PROD = process.env.NODE_ENV === 'production';

export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
export const loginEnabled = Boolean(ADMIN_PASSWORD);

const sessionOptions = {
  password: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me-please-32+',
  cookieName: 'ananta.sid',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession(cookieStore, sessionOptions);
}

/** Returns null when authed, or a 401 Response to return from the handler. */
export async function requireAdmin() {
  const session = await getSession();
  if (session.admin) return null;
  return Response.json({ error: 'Not authenticated.' }, { status: 401 });
}

/** Constant-time-ish string compare (matches the old server's safeEqual intent). */
export function safeEqual(a, b) {
  const A = String(a);
  const B = String(b);
  if (A.length !== B.length) return false;
  let out = 0;
  for (let i = 0; i < A.length; i++) out |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return out === 0;
}
