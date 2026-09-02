import { blocksToHtml, blocksToText } from './pdf/blocks-to-html';

/**
 * Shared normalisation for the create/update endpoints.
 *
 * Two kinds of post live in the same table:
 *
 *   legacy_html — written with the old rich-text editor. Its `content` is the
 *                 editor's own HTML and is never rewritten here; the admin UI
 *                 doesn't even send it any more, so it can't be clobbered.
 *
 *   canva_pdf   — the article was extracted from an uploaded Canva PDF. Its
 *                 `content` is regenerated from `structured_content` on every
 *                 save, server-side. The browser's HTML is never trusted.
 */

const MAX_BLOCKS = 5000;

/** Keep only the block shapes the renderer understands, with plain values. */
function sanitizeBlocks(input) {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_BLOCKS) {
    throw new Error('The document has too many sections to store.');
  }

  const str = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v));
  const spans = (list) =>
    (Array.isArray(list) ? list : [])
      .map((s) => {
        const out = { text: str(s?.text) };
        if (s?.bold) out.bold = true;
        if (s?.italic) out.italic = true;
        if (typeof s?.href === 'string') out.href = s.href;
        return out;
      })
      .filter((s) => s.text.length);

  const blocks = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const page = Number.isFinite(raw.page) ? Number(raw.page) : undefined;

    if (raw.type === 'heading') {
      const text = str(raw.text).trim();
      if (text) {
        blocks.push({
          type: 'heading',
          level: Math.min(4, Math.max(2, Number(raw.level) || 2)),
          text,
          page,
        });
      }
    } else if (raw.type === 'paragraph') {
      const s = spans(raw.spans);
      const text = str(raw.text).trim();
      if (s.length || text) blocks.push({ type: 'paragraph', spans: s, text, page });
    } else if (raw.type === 'list') {
      const items = (Array.isArray(raw.items) ? raw.items : [])
        .map((i) => ({ spans: spans(i?.spans), text: str(i?.text).trim() }))
        .filter((i) => i.spans.length || i.text);
      if (items.length) blocks.push({ type: 'list', ordered: Boolean(raw.ordered), items, page });
    } else if (raw.type === 'table') {
      const row = (r) => (Array.isArray(r) ? r.map(str) : []);
      const headers = row(raw.headers);
      const rows = (Array.isArray(raw.rows) ? raw.rows : []).map(row);
      if (headers.length || rows.length) blocks.push({ type: 'table', headers, rows, page });
    }
  }
  return blocks;
}

const trimOrNull = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s.length ? s : null;
};

/**
 * Pull the document/SEO fields out of a request body.
 * Throws on malformed input; sets `publishBlocker` when the post isn't in a
 * state that may go live.
 */
export function postFieldsFromBody(body = {}) {
  const isCanva = body.content_type === 'canva_pdf' || Boolean(body.structured_content);
  const blocks = isCanva ? sanitizeBlocks(body.structured_content) : null;

  if (isCanva && (!blocks || blocks.length === 0)) {
    throw new Error('The uploaded document has no readable content. Please re-upload the PDF.');
  }

  const processingStatus = isCanva ? 'ready' : null;
  const extractedText = isCanva
    ? trimOrNull(body.extracted_text) || blocksToText(blocks)
    : null;

  let publishBlocker = null;
  if (isCanva && (!blocks?.length || !extractedText)) {
    publishBlocker = 'This post can’t be published until its document has been processed.';
  }

  return {
    isCanva,
    contentType: isCanva ? 'canva_pdf' : 'legacy_html',
    blocks,
    structuredContent: blocks ? JSON.stringify(blocks) : null,
    extractedText,
    documentUrl: isCanva ? trimOrNull(body.document_url) : null,
    documentPublicId: isCanva ? trimOrNull(body.document_public_id) : null,
    documentFilename: isCanva ? trimOrNull(body.document_filename) : null,
    documentSize: isCanva && Number.isFinite(Number(body.document_size))
      ? Number(body.document_size)
      : null,
    documentMimeType: isCanva ? trimOrNull(body.document_mime_type) || 'application/pdf' : null,
    documentPageCount: isCanva && Number.isFinite(Number(body.document_page_count))
      ? Number(body.document_page_count)
      : null,
    seoTitle: trimOrNull(body.seo_title),
    seoDescription: trimOrNull(body.seo_description),
    processingStatus,
    publishBlocker,
  };
}

/**
 * The article HTML to store. Canva posts are rendered from their blocks;
 * legacy posts keep whatever HTML they already had.
 */
export function buildPostContent(fields, legacyContent) {
  if (fields.isCanva) return blocksToHtml(fields.blocks);
  return typeof legacyContent === 'string' ? legacyContent : '';
}
