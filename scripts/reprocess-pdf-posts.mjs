/**
 * Re-extract every Canva PDF post with the current extractor.
 *
 * A Canva post's article HTML is generated once, when it is saved, from the
 * blocks extracted at upload time. Improving the extractor therefore changes
 * nothing for posts that already exist — this script re-reads each post's
 * stored PDF from Cloudinary and regenerates its blocks, HTML, plain text and
 * read time through exactly the same code the upload + save endpoints use.
 *
 * Nothing else on the post is touched (title, excerpt, SEO fields, cover,
 * published state, slug). Posts whose article was corrected by hand in the
 * editor are skipped, so those corrections are never overwritten — pass
 * --include-edited to re-extract them anyway (their edits are lost).
 *
 * Usage:
 *   node scripts/reprocess-pdf-posts.mjs                 # dry run, all posts
 *   node scripts/reprocess-pdf-posts.mjs --slug my-post  # dry run, one post
 *   node scripts/reprocess-pdf-posts.mjs --apply         # write the changes
 *   node scripts/reprocess-pdf-posts.mjs --include-edited  # also hand-edited posts
 *
 * A dry run writes each post's current and regenerated HTML side by side into
 * the output folder (printed at the start) so they can be compared before
 * anything is written. --apply also saves a backup of every row it changes
 * there; `--restore <backup.json>` puts those rows back exactly.
 *
 * Reads DATABASE_URL and CLOUDINARY_URL from .env.local / .env.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Env first: db.js and cloudinary.js read it when they are imported.
for (const file of ['.env.local', '.env']) {
  const full = path.join(root, file);
  if (fs.existsSync(full)) process.loadEnvFile(full);
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const apply = flag('--apply');
const onlySlug = option('--slug');
const restoreFile = option('--restore');
const includeEdited = flag('--include-edited');

const { pool, describeError, ensureSchema } = await import('../server-lib/db.js');
const { pdfDownloadUrl, pdfRawUrl } = await import('../server-lib/cloudinary.js');
const { assertValidPdf } = await import('../server-lib/pdf/validate.js');
const { extractPdf } = await import('../server-lib/pdf/extract.js');
const { postFieldsFromBody, buildPostContent } = await import('../server-lib/post-content.js');
const { estimateReadTime } = await import('../server-lib/posts-util.js');

if (!pool) {
  console.error('DATABASE_URL is not set (looked in .env.local and .env).');
  process.exit(1);
}
// Writing runs add any column this version of the code expects
// (content_edited). A dry run changes nothing, so it only checks for it.
if (apply || restoreFile) await ensureSchema();
const { rowCount: hasEditedColumn } = await pool.query(
  `SELECT 1 FROM information_schema.columns
    WHERE table_name = 'posts' AND column_name = 'content_edited'`
);

/* ------------------------------------------------------------- restore ---- */

if (restoreFile) {
  const rows = JSON.parse(fs.readFileSync(restoreFile, 'utf8'));
  for (const row of rows) {
    await pool.query(
      `UPDATE posts SET structured_content = $2::jsonb, content = $3, extracted_text = $4,
         read_time = $5, document_page_count = $6, updated_at = $7,
         content_edited = $8
       WHERE id = $1`,
      [
        row.id,
        row.structured_content == null ? null : JSON.stringify(row.structured_content),
        row.content,
        row.extracted_text,
        row.read_time,
        row.document_page_count,
        row.updated_at,
        Boolean(row.content_edited),
      ]
    );
    console.log(`restored  ${row.slug}`);
  }
  await pool.end();
  process.exit(0);
}

/* ----------------------------------------------------------- reprocess ---- */

const outDir = path.join(os.tmpdir(), `ananta-reprocess-${new Date().toISOString().replace(/[:.]/g, '-')}`);
fs.mkdirSync(outDir, { recursive: true });
console.log(`${apply ? 'APPLY' : 'DRY RUN'} — output in ${outDir}\n`);

/** Same sources, in the same order, as /api/documents/process. */
async function fetchPdf(row) {
  const sources = [pdfDownloadUrl(row.document_public_id), pdfRawUrl(row.document_public_id), row.document_url]
    .filter(Boolean);
  for (const url of sources) {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) return Buffer.from(await res.arrayBuffer());
  }
  throw new Error('the stored PDF could not be downloaded from Cloudinary');
}

const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;

const { rows } = await pool.query(
  `SELECT id, slug, title, document_public_id, document_url, document_page_count,
          structured_content, content, extracted_text, read_time, updated_at,
          ${hasEditedColumn ? 'content_edited' : 'FALSE AS content_edited'}
     FROM posts
    WHERE content_type = 'canva_pdf'
      AND document_public_id IS NOT NULL
      ${onlySlug ? 'AND slug = $1' : ''}
    ORDER BY created_at`,
  onlySlug ? [onlySlug] : []
);

if (!rows.length) {
  console.log(onlySlug ? `No Canva PDF post with slug "${onlySlug}".` : 'No Canva PDF posts found.');
  await pool.end();
  process.exit(0);
}

const backup = [];
let changed = 0;
let failed = 0;

let skipped = 0;
for (const row of rows) {
  if (row.content_edited && !includeEdited) {
    skipped += 1;
    console.log(`skipped   ${row.slug}  (edited by hand — use --include-edited to replace)`);
    continue;
  }
  try {
    const buffer = await fetchPdf(row);
    assertValidPdf(buffer, { name: `${row.slug}.pdf` });

    const { pageCount, blocks, text } = await extractPdf(buffer);
    if (!blocks.length || !text.trim()) throw new Error('no readable text in the PDF');

    // Exactly what the save endpoint stores: sanitised blocks, HTML rebuilt
    // from them on the server, read time from the extracted text.
    const fields = postFieldsFromBody({
      content_type: 'canva_pdf',
      structured_content: JSON.parse(JSON.stringify(blocks)),
      extracted_text: text,
    });
    const content = buildPostContent(fields, null);
    const readTime = estimateReadTime(fields.extractedText || content);

    fs.writeFileSync(path.join(outDir, `${row.slug}.before.html`), row.content || '');
    fs.writeFileSync(path.join(outDir, `${row.slug}.after.html`), content);

    const same = content === (row.content || '');
    console.log(
      `${same ? 'unchanged' : 'changed  '} ${row.slug}  ` +
        `(words ${words(row.extracted_text)} -> ${words(fields.extractedText)}, ` +
        `blocks ${(row.structured_content || []).length} -> ${fields.blocks.length})`
    );
    if (same) continue;
    changed += 1;

    if (apply) {
      backup.push({
        id: row.id,
        slug: row.slug,
        structured_content: row.structured_content,
        content: row.content,
        extracted_text: row.extracted_text,
        read_time: row.read_time,
        document_page_count: row.document_page_count,
        updated_at: row.updated_at,
        content_edited: row.content_edited,
      });
      // Written before every update, so a crash mid-run still leaves a
      // complete backup of everything already changed.
      fs.writeFileSync(path.join(outDir, 'backup.json'), JSON.stringify(backup, null, 2));

      await pool.query(
        `UPDATE posts SET
           structured_content  = $2::jsonb,
           content             = $3,
           extracted_text      = $4,
           read_time           = $5,
           document_page_count = $6,
           content_edited      = FALSE,
           updated_at          = now()
         WHERE id = $1`,
        [row.id, fields.structuredContent, content, fields.extractedText, readTime, pageCount]
      );
    }
  } catch (e) {
    failed += 1;
    console.error(`FAILED    ${row.slug}: ${describeError(e)} — left as it was`);
  }
}

console.log(
  `\n${rows.length} post(s): ${changed} ${apply ? 'updated' : 'would change'}, ` +
    `${skipped} skipped (edited by hand), ${failed} failed.`
);
if (apply && backup.length) {
  console.log(`Backup: ${path.join(outDir, 'backup.json')}`);
  console.log(`Undo:   node scripts/reprocess-pdf-posts.mjs --restore "${path.join(outDir, 'backup.json')}"`);
  console.log('Public pages pick the change up within 5 minutes (revalidate = 300).');
} else if (!apply && changed) {
  console.log('Compare the *.before.html / *.after.html files, then re-run with --apply.');
}

await pool.end();
