import { getSession, loginEnabled } from '@/server-lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return Response.json({ authenticated: Boolean(session.admin), loginEnabled });
}
