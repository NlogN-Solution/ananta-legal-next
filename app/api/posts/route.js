import { revalidatePath } from 'next/cache';
import { pool, ensureSchema, dbUnavailableResponse } from '@/server-lib/db';
import { requireAdmin, getSession } from '@/server-lib/session';
import { slugify, uniqueSlug, estimateReadTime } from '@/server-lib/posts-util';
import { buildPostContent, postFieldsFromBody } from '@/server-lib/post-content';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  if (!pool) return dbUnavailableResponse();
  // Admins can list drafts too, so they can find an unpublished post again.
  const wantsAll = new URL(request.url).searchParams.get('all') === '1';
  const session = wantsAll ? await getSession() : null;
  const includeDrafts = Boolean(session?.admin);

  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, slug, title, excerpt, category, cover_image, read_time,
              content_type, published, created_at, published_at
         FROM posts
        ${includeDrafts ? '' : 'WHERE published = TRUE'}
        ORDER BY COALESCE(published_at, created_at) DESC`
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
  const { title, excerpt = '', category = 'Article', cover_image = null } = body || {};

  if (!title || !title.trim()) {
    return Response.json({ error: 'Title is required.' }, { status: 400 });
  }

  let fields;
  try {
    fields = postFieldsFromBody(body);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }

  const published = body.published !== false;
  if (published && fields.publishBlocker) {
    return Response.json({ error: fields.publishBlocker }, { status: 400 });
  }

  try {
    await ensureSchema();
    const slug = await uniqueSlug(slugify(title));
    const content = buildPostContent(fields, body.content);
    const read_time = body.read_time || estimateReadTime(fields.extractedText || content);

    const { rows } = await pool.query(
      `INSERT INTO posts (
         slug, title, excerpt, category, cover_image, read_time, content, published,
         content_type, document_url, document_public_id, document_filename,
         document_size, document_mime_type, document_page_count,
         extracted_text, structured_content, seo_title, seo_description,
         processing_status, published_at
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,
         $13,$14,$15,
         $16,$17,$18,$19,
         $20, CASE WHEN $8 THEN now() ELSE NULL END
       ) RETURNING *`,
      [
        slug,
        title.trim(),
        excerpt,
        category,
        cover_image,
        read_time,
        content,
        published,
        fields.contentType,
        fields.documentUrl,
        fields.documentPublicId,
        fields.documentFilename,
        fields.documentSize,
        fields.documentMimeType,
        fields.documentPageCount,
        fields.extractedText,
        fields.structuredContent,
        fields.seoTitle,
        fields.seoDescription,
        fields.processingStatus,
      ]
    );

    revalidatePath('/blog');
    revalidatePath(`/blog/${slug}`);
    revalidatePath('/sitemap.xml');
    return Response.json(rows[0], { status: 201 });
  } catch (e) {
    console.error('[posts:create]', e.message);
    return Response.json({ error: 'Failed to create post.' }, { status: 500 });
  }
}
