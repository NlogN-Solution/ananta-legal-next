import { pool, ensureSchema, describeError } from './db';
import { isPageKey } from '../lib/blocks/pages';

/**
 * Saved page layouts.
 *
 * Reads degrade to an empty array on any failure, and an empty array means
 * "this page has never been edited" — the site then renders the layout
 * composed in code. So a missing table, an unset DATABASE_URL or a database
 * outage costs the CMS, never the page.
 */

export async function getPageSections(page, { includeHidden = false } = {}) {
  if (!pool || !isPageKey(page)) return [];
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `SELECT id, page, position, type, visible, label, data
         FROM page_sections
        WHERE page = $1 ${includeHidden ? '' : 'AND visible = TRUE'}
        ORDER BY position, id`,
      [page]
    );
    return rows;
  } catch (e) {
    console.error('[sections:get]', describeError(e));
    return [];
  }
}

/**
 * Replace a page's layout with exactly what was sent, in one transaction —
 * reorders, edits, additions and deletions arrive together, so the page is
 * never briefly rendered from a half-applied layout.
 */
export async function savePageSections(page, sections) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM page_sections WHERE page = $1', [page]);
    for (const [index, section] of sections.entries()) {
      await client.query(
        `INSERT INTO page_sections (page, position, type, visible, label, data)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [
          page,
          index,
          section.type,
          section.visible !== false,
          section.label || null,
          JSON.stringify(section.data ?? {}),
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  return getPageSections(page, { includeHidden: true });
}

/** Forget a page's layout, which restores the one composed in code. */
export async function resetPageSections(page) {
  await ensureSchema();
  await pool.query('DELETE FROM page_sections WHERE page = $1', [page]);
}
