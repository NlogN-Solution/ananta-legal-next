import { pool, ensureSchema } from './db';

/**
 * Direct database reads for the public blog pages.
 *
 * The blog pages are server components, so they read Postgres here rather than
 * calling their own API over HTTP — one less round trip, and the article HTML
 * ends up in the server-rendered response where search engines can see it.
 *
 * Every function degrades to an empty result when DATABASE_URL is unset, so
 * the site still builds and renders without a database.
 */

const LIST_COLUMNS = `
  id, slug, title, excerpt, category, cover_image, read_time,
  content_type, created_at, published_at, published
`;

export async function listPosts({ includeDrafts = false } = {}) {
  if (!pool) return [];
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT ${LIST_COLUMNS}
         FROM posts
        ${includeDrafts ? '' : 'WHERE published = TRUE'}
        ORDER BY COALESCE(published_at, created_at) DESC`
    );
    return rows;
  } catch (e) {
    console.error('[posts-repo:list]', e.message);
    return [];
  }
}

export async function getPostBySlug(slug, { includeDrafts = false } = {}) {
  if (!pool || !slug) return null;
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT * FROM posts WHERE slug = $1 ${includeDrafts ? '' : 'AND published = TRUE'} LIMIT 1`,
      [slug]
    );
    return rows[0] || null;
  } catch (e) {
    console.error('[posts-repo:get]', e.message);
    return null;
  }
}

/** Slug + last-modified pairs for the sitemap. */
export async function getPublishedSlugs() {
  if (!pool) return [];
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT slug, updated_at, published_at, created_at
         FROM posts WHERE published = TRUE ORDER BY COALESCE(published_at, created_at) DESC`
    );
    return rows;
  } catch (e) {
    console.error('[posts-repo:slugs]', e.message);
    return [];
  }
}

/**
 * Trim a row down to what the browser actually needs. Keeps the extracted
 * text and raw block JSON (which can be large) out of the page payload —
 * the rendered HTML in `content` already carries the article.
 */
export function toPublicPost(row) {
  if (!row) return null;
  const {
    extracted_text, // eslint-disable-line no-unused-vars
    structured_content, // eslint-disable-line no-unused-vars
    processing_error, // eslint-disable-line no-unused-vars
    ...rest
  } = row;
  return {
    ...rest,
    created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    published_at: row.published_at ? new Date(row.published_at).toISOString() : null,
  };
}
