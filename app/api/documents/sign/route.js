import { requireAdmin } from '@/server-lib/session';
import { signUpload, useCloudinary } from '@/server-lib/cloudinary';

export const dynamic = 'force-dynamic';

/**
 * Issue a signature so the admin's browser can upload a Canva PDF straight to
 * Cloudinary. Vercel caps serverless request bodies at ~4.5 MB, which is well
 * under a typical Canva export, so the file must not travel through this app.
 *
 * When Cloudinary isn't configured (local dev) the client falls back to
 * POST /api/documents instead.
 */
export async function POST() {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  if (!useCloudinary) {
    return Response.json(
      { error: 'Document storage is not configured. Set CLOUDINARY_URL.', direct: true },
      { status: 503 }
    );
  }

  return Response.json(signUpload());
}
