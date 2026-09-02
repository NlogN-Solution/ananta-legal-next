import { v2 as cloudinary } from 'cloudinary';

/**
 * Image + document storage.
 *
 * Configured from CLOUDINARY_URL (or the split CLOUDINARY_CLOUD_NAME /
 * _API_KEY / _API_SECRET vars). When neither is set, callers fall back to
 * writing into public/uploads/ — dev only, since Vercel's filesystem is
 * read-only in production.
 */
let useCloudinary = false;

if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
  useCloudinary = Boolean(cloudinary.config().cloud_name);
} else if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    secure: true,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  useCloudinary = true;
}

export { useCloudinary };

/** Folder that Canva PDFs live in. Uploads are constrained to this prefix. */
export const DOCUMENT_FOLDER = 'ananta-blog/documents';

export function cloudName() {
  return cloudinary.config().cloud_name || '';
}

export function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'ananta-blog', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
}

/**
 * Parameters for a signed, direct browser -> Cloudinary upload.
 *
 * Vercel caps a serverless request body at ~4.5 MB, so a Canva PDF can't be
 * POSTed through a route handler. The browser uploads straight to Cloudinary
 * instead and we only ever handle the resulting public_id. `api_key` is a
 * public identifier; the API secret never leaves the server.
 */
export function signUpload() {
  const config = cloudinary.config();
  const timestamp = Math.round(Date.now() / 1000);
  // PDFs must be stored as `image` for Cloudinary's page (pg_N) transforms.
  const params = { folder: DOCUMENT_FOLDER, timestamp };
  const signature = cloudinary.utils.api_sign_request(params, config.api_secret);

  return {
    cloudName: config.cloud_name,
    apiKey: config.api_key,
    timestamp,
    folder: DOCUMENT_FOLDER,
    signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloud_name}/image/upload`,
  };
}

/**
 * Delivery URL for one page of a stored PDF, as a normal responsive image.
 *
 * NOTE: Cloudinary blocks PDF delivery by default on new accounts. Enable
 * Settings -> Security -> "Allow delivery of PDF and ZIP files" or these
 * URLs 404 (the HTML article still renders — only the page previews are lost).
 */
export function pdfPageUrl(publicId, page, width = 1200) {
  if (!publicId) return null;
  return cloudinary.url(publicId, {
    resource_type: 'image',
    format: 'jpg',
    secure: true,
    transformation: [{ page, width, crop: 'scale', quality: 'auto', fetch_format: 'auto' }],
  });
}

/** Original PDF, for the "open the document" link. */
export function pdfRawUrl(publicId) {
  if (!publicId) return null;
  return cloudinary.url(publicId, { resource_type: 'image', format: 'pdf', secure: true });
}

/** Remove a stored asset (used when an admin replaces or deletes a document). */
export async function destroyAsset(publicId) {
  if (!publicId || !useCloudinary) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true });
  } catch (e) {
    console.error('[cloudinary:destroy]', e.message);
  }
}

/**
 * Guard for the process endpoint: only fetch back assets that this account
 * actually stores, under our own document folder. Prevents the endpoint from
 * being used to pull arbitrary URLs server-side (SSRF).
 */
export function isOwnDocument(publicId, url) {
  if (!publicId || !String(publicId).startsWith(`${DOCUMENT_FOLDER}/`)) return false;
  if (publicId.includes('..')) return false;
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'res.cloudinary.com' &&
      parsed.pathname.startsWith(`/${cloudName()}/`)
    );
  } catch {
    return false;
  }
}
