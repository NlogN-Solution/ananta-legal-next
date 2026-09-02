/**
 * Self-host TinyMCE: copy the installed `tinymce` package (skin, themes,
 * icons, plugins, models) into `public/tinymce/` so the blog editor can load
 * it from `/tinymce/tinymce.min.js` at runtime.
 *
 * The old Vite build imported `tinymce/*` as ES modules + `?inline` CSS;
 * webpack/Turbopack don't support that, so we serve the assets statically
 * instead. Runs automatically after `npm install` (postinstall).
 */
import { cp, rm, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const src = path.join(root, 'node_modules', 'tinymce');
const dest = path.join(root, 'public', 'tinymce');

try {
  await access(src);
} catch {
  console.warn('[copy-tinymce] node_modules/tinymce not found — skipping.');
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await cp(src, dest, { recursive: true });
console.log(`[copy-tinymce] copied ${src} -> ${dest}`);
