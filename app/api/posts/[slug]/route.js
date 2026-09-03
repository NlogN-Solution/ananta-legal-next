import { revalidatePath } from 'next/cache';
import { pool, ensureSchema, dbUnavailableResponse } from '@/server-lib/db';
import { requireAdmin, getSession } from '@/server-lib/session';
import { estimateReadTime } from '@/server-lib/posts-util';
import { buildPostContent, postFieldsFromBody } from '@/server-lib/post-content';
import { destroyAsset, pdfPageImages } from '@/server-lib/cloudinary';

export const dynamic = 'force-dynamic';

/**
 * The original Express API used:
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

    // Drafts are only visible to a signed-in admin.
    if (!rows[0].published) {
      const session = await getSession();
      if (!session?.admin) return Response.json({ error: 'Not found.' }, { status: 404 });
    }
    // The admin preview renders the same document the public page does, so it
    // needs the page images too — they are derived, never stored.
    return Response.json({
      ...rows[0],
      page_images: pdfPageImages(rows[0].document_public_id, rows[0].document_page_count),
    });
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
  const { title, excerpt, category, cover_image, published } = body || {};

  try {
    await ensureSchema();
    const existing = await pool.query('SELECT * FROM posts WHERE id = $1', [id]);
    if (existing.rowCount === 0) return Response.json({ error: 'Not found.' }, { status: 404 });
    const previous = existing.rows[0];

    // A post is a Canva post if the request carries a document, or if it
    // already was one and the request isn't replacing the document.
    const isCanvaRequest = body.content_type === 'canva_pdf' || Boolean(body.structured_content);
    const staysCanva = previous.content_type === 'canva_pdf' && !isCanvaRequest;

    let fields = null;
    if (isCanvaRequest) {
      try {
        fields = postFieldsFromBody(body);
      } catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
      }
    }

    const willPublish = published === undefined ? previous.published : Boolean(published);
    if (willPublish && fields?.publishBlocker) {
      return Response.json({ error: fields.publishBlocker }, { status: 400 });
    }
    if (willPublish && !fields && previous.content_type === 'canva_pdf'
        && previous.processing_status !== 'ready') {
      return Response.json(
        { error: 'This post can’t be published until its document has been processed.' },
        { status: 400 }
      );
    }

    // Legacy posts are edited as metadata only — `content` is passed as NULL so
    // COALESCE keeps the original editor HTML exactly as it was.
    const content = fields ? buildPostContent(fields, null) : null;
    const read_time = fields
      ? estimateReadTime(fields.extractedText || content)
      : body.read_time || null;

    const { rows } = await pool.query(
      `UPDATE posts SET
         title               = COALESCE($2, title),
         excerpt             = COALESCE($3, excerpt),
         category            = COALESCE($4, category),
         cover_image         = COALESCE($5, cover_image),
         content             = COALESCE($6, content),
         read_time           = COALESCE($7, read_time),
         published           = COALESCE($8, published),
         seo_title           = $9,
         seo_description     = $10,
         content_type        = COALESCE($11, content_type),
         document_url        = COALESCE($12, document_url),
         document_public_id  = COALESCE($13, document_public_id),
         document_filename   = COALESCE($14, document_filename),
         document_size       = COALESCE($15, document_size),
         document_mime_type  = COALESCE($16, document_mime_type),
         document_page_count = COALESCE($17, document_page_count),
         extracted_text      = COALESCE($18, extracted_text),
         structured_content  = COALESCE($19::jsonb, structured_content),
         processing_status   = COALESCE($20, processing_status),
         processing_error    = NULL,
         published_at        = CASE
                                 WHEN COALESCE($8, published) AND published_at IS NULL THEN now()
                                 ELSE published_at
                               END,
         updated_at          = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        title,
        excerpt,
        category,
        cover_image,
        content,
        read_time,
        published,
        fields ? fields.seoTitle : (body.seo_title ?? previous.seo_title) || null,
        fields ? fields.seoDescription : (body.seo_description ?? previous.seo_description) || null,
        fields ? fields.contentType : staysCanva ? 'canva_pdf' : null,
        fields?.documentUrl ?? null,
        fields?.documentPublicId ?? null,
        fields?.documentFilename ?? null,
        fields?.documentSize ?? null,
        fields?.documentMimeType ?? null,
        fields?.documentPageCount ?? null,
        fields?.extractedText ?? null,
        fields?.structuredContent ?? null,
        fields?.processingStatus ?? null,
      ]
    );

    // The document was replaced — drop the old asset so nothing is orphaned.
    if (
      fields?.documentPublicId &&
      previous.document_public_id &&
      previous.document_public_id !== fields.documentPublicId
    ) {
      await destroyAsset(previous.document_public_id);
    }

    revalidatePath('/blog');
    revalidatePath(`/blog/${rows[0].slug}`);
    revalidatePath('/sitemap.xml');
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
    const { rows, rowCount } = await pool.query(
      'DELETE FROM posts WHERE id = $1 RETURNING slug, document_public_id',
      [id]
    );
    if (rowCount === 0) return Response.json({ error: 'Not found.' }, { status: 404 });

    await destroyAsset(rows[0].document_public_id);

    revalidatePath('/blog');
    revalidatePath(`/blog/${rows[0].slug}`);
    revalidatePath('/sitemap.xml');
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[posts:delete]', e.message);
    return Response.json({ error: 'Failed to delete post.' }, { status: 500 });
  }
}
