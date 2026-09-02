import { getSession } from '@/server-lib/session';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await getSession();
  session.destroy();
  return Response.json({ ok: true });
}
