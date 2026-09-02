import pg from 'pg';

/**
 * Blog posts live in PostgreSQL. On serverless (Vercel) each invocation may
 * reuse a warm container, so we cache the Pool on `globalThis` to avoid
 * opening a new pool per request.
 *
 * With no DATABASE_URL the post endpoints return 503 and the public site
 * falls back to its built-in behavior — same as the old Express server.
 */
const DATABASE_URL = process.env.DATABASE_URL || '';

const g = globalThis;

function makePool() {
  if (!DATABASE_URL) return null;
  const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
  const pool = new pg.Pool({
    connectionString: DATABASE_URL,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 3,
  });
  pool.on('error', (e) => console.error('[db] pool error:', e.message));
  return pool;
}

export const pool = g.__anantaPool ?? (g.__anantaPool = makePool());

async function runEnsureSchema() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id          SERIAL PRIMARY KEY,
      slug        TEXT UNIQUE NOT NULL,
      title       TEXT NOT NULL,
      excerpt     TEXT NOT NULL DEFAULT '',
      category    TEXT NOT NULL DEFAULT 'Article',
      cover_image TEXT,
      read_time   TEXT NOT NULL DEFAULT '',
      content     TEXT NOT NULL DEFAULT '',
      published   BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  /* Canva-PDF posts. Purely additive: every existing row keeps its content and
     picks up content_type = 'legacy_html', so posts written with the old
     rich-text editor keep rendering exactly as they always have. `content`
     stays the rendered article HTML for BOTH kinds — for legacy posts it is
     the editor's own output (never rewritten), for Canva posts it is
     regenerated server-side from structured_content on every save. */
  await pool.query(`
    ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS content_type        TEXT NOT NULL DEFAULT 'legacy_html',
      ADD COLUMN IF NOT EXISTS document_url        TEXT,
      ADD COLUMN IF NOT EXISTS document_public_id  TEXT,
      ADD COLUMN IF NOT EXISTS document_filename   TEXT,
      ADD COLUMN IF NOT EXISTS document_size       INTEGER,
      ADD COLUMN IF NOT EXISTS document_mime_type  TEXT,
      ADD COLUMN IF NOT EXISTS document_page_count INTEGER,
      ADD COLUMN IF NOT EXISTS extracted_text      TEXT,
      ADD COLUMN IF NOT EXISTS structured_content  JSONB,
      ADD COLUMN IF NOT EXISTS seo_title           TEXT,
      ADD COLUMN IF NOT EXISTS seo_description     TEXT,
      ADD COLUMN IF NOT EXISTS processing_status   TEXT,
      ADD COLUMN IF NOT EXISTS processing_error    TEXT,
      ADD COLUMN IF NOT EXISTS published_at        TIMESTAMPTZ;
  `);

  // Backfill published_at once for rows that predate the column.
  await pool.query(
    `UPDATE posts SET published_at = created_at WHERE published = TRUE AND published_at IS NULL`
  );

  console.log('[db] schema ready');
}

/** Idempotent; the CREATE TABLE runs at most once per warm container. */
export function ensureSchema() {
  if (!pool) return Promise.resolve();
  if (!g.__anantaSchema) {
    g.__anantaSchema = runEnsureSchema().catch((e) => {
      g.__anantaSchema = null; // allow a retry on the next request
      console.error('[db] schema init failed:', e.message);
      throw e;
    });
  }
  return g.__anantaSchema;
}

/** Returns false + writes a 503 JSON response when the DB isn't configured. */
export function dbUnavailableResponse() {
  return Response.json(
    { error: 'Database not configured. Set DATABASE_URL and restart.' },
    { status: 503 }
  );
}
