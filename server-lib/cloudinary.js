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

/** Public delivery URL for the original PDF ("open the document" link). */
export function pdfRawUrl(publicId) {
  if (!publicId) return null;
  return cloudinary.url(publicId, { resource_type: 'image', format: 'pdf', secure: true });
}

/**
 * Signed, authenticated download URL for the stored PDF — used server-side to
 * read the file back for text extraction.
 *
 * Many Cloudinary accounts block *public* PDF delivery by default (the CDN
 * answers 401), which would otherwise break extraction entirely. This URL is
 * signed with the API secret and is not subject to that restriction, so the
 * workflow succeeds whether or not the account setting is enabled.
 *
 * It carries a signature — never store it or send it to the browser.
 */
export function pdfDownloadUrl(publicId) {
  if (!publicId || !useCloudinary) return null;
  try {
    return cloudinary.utils.private_download_url(publicId, 'pdf', {
      resource_type: 'image',
      type: 'upload',
      expires_at: Math.round(Date.now() / 1000) + 300, // only needed for this request
    });
  } catch (e) {
    console.error('[cloudinary:download-url]', e.message);
    return null;
  }
}

/**
 * Is the PDF readable over plain public delivery? Decides whether the public
 * page may offer an "open the original PDF" link — on a restricted account
 * that link would 401 for every visitor, so we omit it instead.
 */
export async function isPubliclyDeliverable(url) {
  if (!url) return false;
  // A freshly uploaded asset can 401 for a moment before it propagates to the
  // CDN, so a single failure isn't proof that delivery is blocked.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700));
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      if (res.ok) return true;
    } catch {
      /* retry once, then give up */
    }
  }
  return false;
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
