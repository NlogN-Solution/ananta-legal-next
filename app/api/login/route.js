import { getSession } from '@/server-lib/session';
import { verifyLogin, loginConfigured } from '@/server-lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!(await loginConfigured())) {
    return Response.json(
      { error: 'Admin login is not configured (set ADMIN_PASSWORD).' },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const { username, password } = body || {};

  if (!(await verifyLogin(username, password))) {
    return Response.json({ error: 'Invalid username or password.' }, { status: 401 });
  }

  const session = await getSession();
  session.admin = true;
  await session.save();
  return Response.json({ ok: true });
}
