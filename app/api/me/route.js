import { getSession } from '@/server-lib/session';
import { loginConfigured } from '@/server-lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSession();
  return Response.json({
    authenticated: Boolean(session.admin),
    loginEnabled: await loginConfigured(),
  });
}
