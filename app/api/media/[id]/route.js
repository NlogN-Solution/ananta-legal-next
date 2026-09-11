import { requireAdmin } from '@/server-lib/session';
import { deleteMedia } from '@/server-lib/media';

export const dynamic = 'force-dynamic';

export async function DELETE(_request, { params }) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  try {
    const result = await deleteMedia(id);
    if (result.error) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[media:delete]', e.message);
    return Response.json({ error: 'Could not delete this file.' }, { status: 500 });
  }
}
