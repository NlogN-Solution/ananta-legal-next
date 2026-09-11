import { requireAdmin } from '@/server-lib/session';
import { getAdminUser, credentialsEditable, updateCredentials } from '@/server-lib/auth';

export const dynamic = 'force-dynamic';

/** Who is signed in, and can the credentials be changed from here? */
export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const admin = await getAdminUser().catch(() => null);
  return Response.json({
    username: admin?.username || null,
    updated_at: admin?.updated_at || null,
    editable: await credentialsEditable(),
  });
}

export async function PUT(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  try {
    const result = await updateCredentials(body || {});
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json(result);
  } catch (e) {
    console.error('[account:update]', e.message);
    return Response.json({ error: 'Could not update your credentials.' }, { status: 500 });
  }
}
