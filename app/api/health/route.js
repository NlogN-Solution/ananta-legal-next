import { pool } from '@/server-lib/db';
import { useCloudinary } from '@/server-lib/cloudinary';
import { mailEnabled } from '@/server-lib/mailer';
import { loginEnabled } from '@/server-lib/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    db: Boolean(pool),
    cloudinary: useCloudinary,
    loginEnabled,
    mail: mailEnabled,
  });
}
