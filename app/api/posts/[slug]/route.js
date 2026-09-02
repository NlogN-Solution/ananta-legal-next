import { pool, ensureSchema, dbUnavailableResponse } from '@/server-lib/db';
import { requireAdmin } from '@/server-lib/session';
import { estimateReadTime } from '@/server-lib/posts-util';

export const dynamic = 'force-dynamic';

/**
 * The old Express API used:
 *   GET    /api/posts/:slug   (lookup by slug)
 *   PUT    /api/posts/:id     (numeric id)
 *   DELETE /api/posts/:id     (numeric id)
 * All three collapse onto this one dynamic segment; the param is treated as a
 * slug for GET and as a numeric id for PUT/DELETE — exact same external URLs.
 */

export async function GET(_request, { params }) {
  if (!pool) return dbUnavailableResponse();
  const { slug } = await params;
  try {
    await ensureSchema();
    const { rows } = await pool.query('SELECT * FROM posts WHERE slug = $1', [slug]);
    if (rows.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json(rows[0]);
  } catch (e) {
    console.error('[posts:get]', e.message);
    return Response.json({ error: 'Failed to load post.' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  if (!pool) return dbUnavailableResponse();
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { slug: id } = await params;
  const body = await request.json().catch(() => ({}));
  const { title, excerpt, category, content, cover_image, published } = body || {};
  try {
    await ensureSchema();
    const read_time =
      body.read_time || (content != null ? estimateReadTime(content) : undefined);
    const { rows } = await pool.query(
      `UPDATE posts SET
         title = COALESCE($2, title),
         excerpt = COALESCE($3, excerpt),
         category = COALESCE($4, category),
         content = COALESCE($5, content),
         cover_image = COALESCE($6, cover_image),
         read_time = COALESCE($7, read_time),
         published = COALESCE($8, published),
         updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, title, excerpt, category, content, cover_image, read_time, published]
    );
    if (rows.length === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json(rows[0]);
  } catch (e) {
    console.error('[posts:update]', e.message);
    return Response.json({ error: 'Failed to update post.' }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  if (!pool) return dbUnavailableResponse();
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const { slug: id } = await params;
  try {
    await ensureSchema();
    const { rowCount } = await pool.query('DELETE FROM posts WHERE id = $1', [id]);
    if (rowCount === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[posts:delete]', e.message);
    return Response.json({ error: 'Failed to delete post.' }, { status: 500 });
  }
}
