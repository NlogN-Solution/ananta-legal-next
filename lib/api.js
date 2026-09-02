/**
 * Base URL of the backend API.
 *
 * The default deploy runs the frontend and the API routes on the same origin
 * (one Next.js app on Vercel), so this stays blank and calls go to "/api/...".
 * Set NEXT_PUBLIC_API_URL only if the API is hosted on a different origin
 * (no trailing slash).
 */
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

export function apiFetch(path, opts = {}) {
  return fetch(apiUrl(path), { credentials: 'include', ...opts });
}
