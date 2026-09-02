import { pool, ensureSchema, dbUnavailableResponse } from '@/server-lib/db';
import { requireAdmin } from '@/server-lib/session';
import { slugify, uniqueSlug, estimateReadTime } from '@/server-lib/posts-util';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!pool) return dbUnavailableResponse();
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, slug, title, excerpt, category, cover_image, read_time, created_at
         FROM posts WHERE published = TRUE ORDER BY created_at DESC`
    );
    return Response.json(rows);
  } catch (e) {
    console.error('[posts:list]', e.message);
    return Response.json({ error: 'Failed to load posts.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!pool) return dbUnavailableResponse();
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const {
    title,
    excerpt = '',
    category = 'Article',
    content = '',
    cover_image = null,
  } = body || {};
  if (!title || !title.trim()) {
    return Response.json({ error: 'Title is required.' }, { status: 400 });
  }
  try {
    await ensureSchema();
    const slug = await uniqueSlug(slugify(title));
    const read_time = body.read_time || estimateReadTime(content);
    const { rows } = await pool.query(
      `INSERT INTO posts (slug, title, excerpt, category, cover_image, read_time, content)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [slug, title.trim(), excerpt, category, cover_image, read_time, content]
    );
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    console.error('[posts:create]', e.message);
    return Response.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
