import { requireAdmin } from '@/server-lib/session';
import {
  listMedia,
  recordMedia,
  storeUpload,
  MAX_UPLOAD_BYTES,
  IMAGE_MIME_RE,
} from '@/server-lib/media';

export const dynamic = 'force-dynamic';

export async function GET() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;
  return Response.json(await listMedia());
}

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
    const row = await recordMedia({ ...asset, alt: String(form.get('alt') || '') });
    // `location` mirrors the older /api/upload response so either endpoint can
    // feed a picker.
    return Response.json({ ...(row || asset), location: asset.url }, { status: 201 });
  } catch (e) {
    console.error('[media:upload]', e.message);
    return Response.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
