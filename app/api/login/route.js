import { getSession, loginEnabled, ADMIN_USER, ADMIN_PASSWORD, safeEqual } from '@/server-lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!loginEnabled) {
    return Response.json(
      { error: 'Admin login is not configured (set ADMIN_PASSWORD).' },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const { username, password } = body || {};
  const ok =
    safeEqual(username || '', ADMIN_USER) && safeEqual(password || '', ADMIN_PASSWORD);
  if (!ok) {
    return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  }
  const session = await getSession();
  session.admin = true;
  await session.save();
  return Response.json({ ok: true });
}
