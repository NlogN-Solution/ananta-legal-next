import { requireAdmin } from '@/server-lib/session';
import {
  storeUpload,
  recordMedia,
  MAX_UPLOAD_BYTES,
  IMAGE_MIME_RE,
} from '@/server-lib/media';

export const dynamic = 'force-dynamic';

/**
 * Single-image upload used by the blog editor's cover picker.
 *
 * It answers `{ location }` exactly as before; the only change is that the
 * asset is now also recorded in the media library, so an image uploaded here
 * can be found and reused from the dashboard instead of disappearing into the
 * post that happened to need it.
 */
export async function POST(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'No image uploaded.' }, { status: 400 });
  }
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No image uploaded.' }, { status: 400 });
  }
  if (file.type && !IMAGE_MIME_RE.test(file.type)) {
    return Response.json({ error: 'Unsupported image type.' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_UPLOAD_BYTES) {
    return Response.json({ error: 'Image is too large (max 8 MB).' }, { status: 400 });
  }

  try {
    const asset = await storeUpload(file, buffer);
    await recordMedia(asset);
    return Response.json({ location: asset.url });
  } catch (e) {
    console.error('[upload]', e.message);
    return Response.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
