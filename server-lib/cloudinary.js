import { v2 as cloudinary } from 'cloudinary';

/**
 * Image storage for the blog editor. Configured from CLOUDINARY_URL (or the
 * split CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET vars). When neither is
 * set, callers fall back to writing into public/uploads/ — dev only, since
 * Vercel's filesystem is read-only in production.
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

export function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'ananta-blog', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    stream.end(buffer);
  });
}
