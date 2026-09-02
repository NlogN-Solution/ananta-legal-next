/**
 * Canonical site identity, used for metadata, Open Graph and the sitemap.
 *
 * NEXT_PUBLIC_SITE_URL should be the production domain (no trailing slash).
 * It falls back to the Vercel-provided URL, then localhost, so previews and
 * local dev still produce valid absolute URLs.
 */
export const SITE_NAME = 'Ananta Legal';

export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : '') ||
  'http://localhost:3000'
).replace(/\/$/, '');

export const SITE_DESCRIPTION =
  'Plain-English legal for founders. Company formation, contracts, fundraising, IP and compliance — handled at startup speed, from Kathmandu, Nepal.';

export const absoluteUrl = (path = '/') =>
  `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
