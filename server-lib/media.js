import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { pool, ensureSchema, describeError } from './db';
import { useCloudinary, uploadImage, destroyAsset } from './cloudinary';

/**
 * The media library.
 *
 * Storage is unchanged — Cloudinary in production, public/uploads in local
 * development — this module only adds the catalogue on top, so the dashboard
 * can show what has been uploaded and reuse it instead of every image being a
 * write-only side effect of some other form.
 *
 * The catalogue is deliberately not the source of truth for the bytes: if the
 * `media` table is unavailable an upload still succeeds and still returns a
 * URL, it just isn't listed. Nothing that already works depends on it.
 */

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
export const IMAGE_MIME_RE = /^image\/(png|jpe?g|gif|webp|avif|svg\+xml)$/;

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

/** Store the bytes and return a row-shaped description of where they went. */
export async function storeUpload(file, buffer) {
  if (useCloudinary) {
    const result = await uploadImage(buffer);
    return {
      url: result.secure_url,
      public_id: result.public_id,
      filename: file.name || result.original_filename || null,
      mime_type: file.type || (result.format ? `image/${result.format}` : null),
      bytes: result.bytes ?? buffer.length,
      width: result.width ?? null,
      height: result.height ?? null,
    };
  }

  // Dev-only fallback (Vercel's filesystem is read-only in production).
  const ext = (path.extname(file.name || '') || '.png').toLowerCase();
  const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return {
    url: `/uploads/${name}`,
    public_id: null,
    filename: file.name || name,
    mime_type: file.type || null,
    bytes: buffer.length,
    width: null,
    height: null,
  };
}

/** Add an uploaded asset to the catalogue. Never throws — see the note above. */
export async function recordMedia(asset) {
  if (!pool) return null;
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      `INSERT INTO media (url, public_id, filename, mime_type, bytes, width, height, alt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        asset.url,
        asset.public_id || null,
        asset.filename || null,
        asset.mime_type || null,
        asset.bytes || null,
        asset.width || null,
        asset.height || null,
        asset.alt || '',
      ]
    );
    return rows[0];
  } catch (e) {
    console.error('[media:record]', describeError(e));
    return null;
  }
}

export async function listMedia({ limit = 200 } = {}) {
  if (!pool) return [];
  try {
    await ensureSchema();
    const { rows } = await pool.query(
      'SELECT * FROM media ORDER BY created_at DESC LIMIT $1',
      [Math.min(Number(limit) || 200, 500)]
    );
    return rows;
  } catch (e) {
    console.error('[media:list]', describeError(e));
    return [];
  }
}

/**
 * Forget an asset and delete the bytes behind it.
 *
 * A local dev file is unlinked; a Cloudinary asset is destroyed. Anything the
 * catalogue doesn't know about is left alone — this never takes a path from
 * the caller, only the stored URL of a row it just read.
 */
export async function deleteMedia(id) {
  if (!pool) return { error: 'Database not configured.', status: 503 };
  await ensureSchema();
  const { rows } = await pool.query('DELETE FROM media WHERE id = $1 RETURNING *', [id]);
  if (!rows.length) return { error: 'Not found.', status: 404 };
  const row = rows[0];

  if (row.public_id) {
    await destroyAsset(row.public_id);
  } else if (row.url?.startsWith('/uploads/')) {
    const name = path.basename(row.url);
    try {
      fs.unlinkSync(path.join(UPLOAD_DIR, name));
    } catch {
      /* already gone — the catalogue entry is what mattered */
    }
  }
  return { ok: true, deleted: row };
}
