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
