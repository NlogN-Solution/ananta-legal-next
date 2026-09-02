import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { requireAdmin } from '@/server-lib/session';
import { useCloudinary, uploadToCloudinary } from '@/server-lib/cloudinary';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 8 * 1024 * 1024;
const MIME_RE = /^image\/(png|jpe?g|gif|webp|svg\+xml)$/;

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
  if (file.type && !MIME_RE.test(file.type)) {
    return Response.json({ error: 'Unsupported image type.' }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_BYTES) {
    return Response.json({ error: 'Image is too large (max 8 MB).' }, { status: 400 });
  }

  try {
    if (useCloudinary) {
      const url = await uploadToCloudinary(buffer);
      return Response.json({ location: url });
    }
    // Dev-only fallback (Vercel's filesystem is read-only in production).
    const ext = (path.extname(file.name || '') || '.png').toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const dir = path.join(process.cwd(), 'public', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);
    return Response.json({ location: `/uploads/${name}` });
  } catch (e) {
    console.error('[upload]', e.message);
    return Response.json({ error: 'Image upload failed.' }, { status: 500 });
  }
}
