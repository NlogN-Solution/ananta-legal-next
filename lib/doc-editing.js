/**
 * Edited article DOM -> structured blocks, in the browser.
 *
 * The admin edits a Canva post's extracted article in place (a contentEditable
 * copy of the rendered body). On save the edited DOM is read back into the
 * same block shapes the PDF extractor produces, and only those blocks are
 * sent: the server sanitises them and regenerates the HTML itself, exactly as
 * it does for an untouched upload. No edited HTML is ever stored or trusted.
 *
 * The reader is deliberately forgiving, because contentEditable markup is
 * messy and differs per browser: <div> or <p> paragraphs, <b>/<strong>,
 * <span style="font-weight:…">, Chrome's sub-lists placed directly inside a
 * list instead of inside an item, stray <br>s, &nbsp; runs. Anything the
 * article format can't express (colours, underline, images) is dropped; text
 * is never dropped.
 */
import { blocksToHtml, MAX_LIST_DEPTH } from '@/server-lib/pdf/blocks-to-html';

const HEADING_LEVEL = { H1: 2, H2: 2, H3: 3, H4: 4, H5: 4, H6: 4 };
const OL_TYPES = new Set(['1', 'a', 'A', 'i', 'I']);
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'IMG', 'SVG', 'VIDEO', 'AUDIO',
  'IFRAME', 'OBJECT', 'CANVAS', 'HEAD', 'META', 'LINK', 'TITLE', 'BUTTON', 'INPUT', 'SELECT',
  'TEXTAREA']);
const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE',
  'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'HEADER',
  'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'PRE', 'FIGURE', 'FIGCAPTION', 'ADDRESS', 'DL', 'DT', 'DD',
  'HR', 'CENTER']);

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* --------------------------------------------------------------- inline ---- */

function weight(el) {
  const fw = el.style?.fontWeight;
  if (!fw) return undefined;
  if (fw === 'bold' || fw === 'bolder') return true;
  if (fw === 'normal' || fw === 'lighter') return false;
  const n = Number(fw);
  return Number.isFinite(n) ? n >= 600 : undefined;
}

function slant(el) {
  const fs = el.style?.fontStyle;
  if (!fs) return undefined;
  return fs === 'italic' || fs === 'oblique';
}

/**
 * Flatten one node's inline content into styled text pieces. Block-level
 * boundaries and <br> become `{ br: true }` markers so the caller can decide
 * whether they split paragraphs or just separate words.
 */
function inlineFrom(node, ctx, out) {
  if (node.nodeType === 3) {
    out.push({ text: node.data, bold: ctx.bold, italic: ctx.italic, href: ctx.href });
    return;
  }
  if (node.nodeType !== 1) return;
  const tag = node.tagName.toUpperCase();
  if (SKIP.has(tag)) return;
  if (tag === 'BR') {
    out.push({ br: true });
    return;
  }

  const next = { ...ctx };
  if (tag === 'B' || tag === 'STRONG') next.bold = true;
  if (tag === 'I' || tag === 'EM') next.italic = true;
  const w = weight(node);
  if (w !== undefined) next.bold = w;
  const s = slant(node);
  if (s !== undefined) next.italic = s;
  if (tag === 'A' && node.getAttribute('href')) next.href = node.getAttribute('href').trim();

  const blockish = BLOCK.has(tag);
  if (blockish) out.push({ br: true });
  for (const child of node.childNodes) inlineFrom(child, next, out);
  if (blockish) out.push({ br: true });
}

/** Styled pieces -> clean spans: whitespace collapsed, equal styles merged. */
function toSpans(pieces) {
  const spans = [];
  for (const p of pieces) {
    if (p.br) continue;
    let text = p.text.replace(/\s+/g, ' ');
    const last = spans[spans.length - 1];
    if (last && last.text.endsWith(' ') && text.startsWith(' ')) text = text.slice(1);
    if (!text) continue;
    if (
      last &&
      !!last.bold === !!p.bold &&
      !!last.italic === !!p.italic &&
      (last.href || '') === (p.href || '')
    ) {
      last.text += text;
    } else {
      spans.push({ text, bold: p.bold, italic: p.italic, href: p.href });
    }
  }
  if (spans.length) {
    spans[0].text = spans[0].text.replace(/^ /, '');
    const end = spans[spans.length - 1];
    end.text = end.text.replace(/ $/, '');
  }
  return spans
    .filter((s) => s.text.length)
    .map((s) => {
      const o = { text: s.text };
      if (s.bold) o.bold = true;
      if (s.italic) o.italic = true;
      if (s.href) o.href = s.href;
      return o;
    });
}

/** Split pieces at line breaks into separate span runs (empty runs dropped). */
function toLines(pieces) {
  const lines = [];
  let current = [];
  for (const p of pieces) {
    if (p.br) {
      lines.push(current);
      current = [];
    } else current.push(p);
  }
  lines.push(current);
  return lines.map(toSpans).filter((spans) => spans.length);
}

const spansText = (spans) => spans.map((s) => s.text).join('');

const paragraph = (spans) => ({ type: 'paragraph', spans, text: spansText(spans) });

/* ---------------------------------------------------------------- lists ---- */

/** Flatten sub-lists past the depth the renderer allows into their parent. */
function flattenInto(items, list) {
  for (const item of list.items) {
    const { children, ...rest } = item;
    items.push(rest);
    for (const child of children || []) flattenInto(items, child);
  }
}

function readItem(li, depth) {
  const pieces = [];
  const children = [];
  for (const node of li.childNodes) {
    const tag = node.nodeType === 1 ? node.tagName.toUpperCase() : '';
    if (tag === 'UL' || tag === 'OL') {
      const sub = readList(node, depth + 1);
      if (sub) children.push(sub);
      continue;
    }
    inlineFrom(node, {}, pieces);
  }
  // Inside an item a line break is just a word boundary — items are one line
  // of the article format.
  const spans = toSpans(pieces.map((p) => (p.br ? { text: ' ' } : p)));
  const item = { spans, text: spansText(spans) };
  if (children.length) item.children = children;
  return item;
}

function readList(el, depth = 0) {
  const ordered = el.tagName.toUpperCase() === 'OL';
  const block = { type: 'list', ordered, items: [] };
  if (ordered) {
    const type = el.getAttribute('type');
    if (OL_TYPES.has(type) && type !== '1') block.style = type;
  }
  let n = ordered ? Math.max(1, parseInt(el.getAttribute('start'), 10) || 1) : 0;
  let loose = [];

  const pushItem = (item, explicit) => {
    if (!item.spans.length && !item.children) return; // empty item: not numbered
    if (ordered) {
      if (explicit > 0) n = explicit;
      item.value = n;
      n += 1;
    }
    if (item.children && depth + 1 >= MAX_LIST_DEPTH) {
      const kids = item.children;
      delete item.children;
      block.items.push(item);
      for (const kid of kids) flattenInto(block.items, kid);
      return;
    }
    block.items.push(item);
  };
  const flushLoose = () => {
    const spans = toSpans(loose.map((p) => (p.br ? { text: ' ' } : p)));
    if (spans.length) pushItem({ spans, text: spansText(spans) }, 0);
    loose = [];
  };

  for (const node of el.childNodes) {
    const tag = node.nodeType === 1 ? node.tagName.toUpperCase() : '';
    if (tag === 'LI') {
      flushLoose();
      pushItem(readItem(node, depth), parseInt(node.getAttribute('value'), 10) || 0);
    } else if (tag === 'UL' || tag === 'OL') {
      flushLoose();
      // Chrome's "indent" puts the sub-list straight inside the list rather
      // than inside the item above it. It belongs to that item.
      const sub = readList(node, depth + 1);
      if (!sub) continue;
      const host = block.items[block.items.length - 1];
      if (host && depth + 1 < MAX_LIST_DEPTH) (host.children ??= []).push(sub);
      else flattenInto(block.items, sub);
    } else {
      inlineFrom(node, {}, loose); // text typed straight into the list
    }
  }
  flushLoose();
  return block.items.length ? block : null;
}

/* --------------------------------------------------------------- tables ---- */

function readTable(table) {
  const rows = [...table.querySelectorAll('tr')]
    .filter((tr) => tr.closest('table') === table)
    .map((tr) => [...tr.children]
      .filter((c) => /^(TD|TH)$/i.test(c.tagName))
      .map((c) => {
        // Cells hold plain text; a line break inside one separates words.
        const pieces = [];
        for (const node of c.childNodes) inlineFrom(node, {}, pieces);
        return spansText(toSpans(pieces.map((p) => (p.br ? { text: ' ' } : p))));
      }));
  const kept = rows.filter((r) => r.length);
  if (!kept.length || kept.every((r) => r.every((c) => !c))) return null;
  const [headers, ...body] = kept;
  return { type: 'table', headers, rows: body };
}

/* ---------------------------------------------------------------- walk ---- */

function hasBlockChild(el) {
  for (const child of el.children) {
    if (BLOCK.has(child.tagName.toUpperCase())) return true;
  }
  return false;
}

function walk(container, out) {
  let pending = [];
  const flush = () => {
    for (const spans of toLines(pending)) out.push(paragraph(spans));
    pending = [];
  };

  for (const node of container.childNodes) {
    if (node.nodeType === 3) {
      pending.push({ text: node.data });
      continue;
    }
    if (node.nodeType !== 1) continue;
    const tag = node.tagName.toUpperCase();
    if (SKIP.has(tag)) continue;

    if (HEADING_LEVEL[tag]) {
      flush();
      const text = clean(node.textContent);
      if (text) out.push({ type: 'heading', level: HEADING_LEVEL[tag], text });
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      const list = readList(node);
      if (list) out.push(list);
    } else if (tag === 'TABLE') {
      flush();
      const table = readTable(node);
      if (table) out.push(table);
    } else if (tag === 'HR') {
      flush();
    } else if (tag === 'BR') {
      pending.push({ br: true });
    } else if (BLOCK.has(tag)) {
      flush();
      if (hasBlockChild(node)) walk(node, out);
      else {
        inlineFrom(node, {}, pending);
        flush();
      }
    } else {
      inlineFrom(node, {}, pending); // inline element sitting at block level
    }
  }
  flush();
}

/**
 * Read an element's edited content into article blocks.
 * @param {Element} root the editable container (or a parsed fragment's body)
 */
export function htmlToBlocks(root) {
  const out = [];
  if (root) walk(root, out);
  return out;
}

/**
 * Clipboard HTML -> markup safe to insert into the editor: only what the
 * article format can represent survives (Word/Google Docs styling, images,
 * colours and fonts are dropped; bold, italic, links, lists, headings and
 * tables are kept). A single pasted paragraph is returned as inline markup so
 * it merges into the paragraph being edited instead of splitting it.
 */
export function cleanPastedHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const blocks = htmlToBlocks(doc.body);
  if (!blocks.length) return '';
  const out = blocksToHtml(blocks);
  if (blocks.length === 1 && blocks[0].type === 'paragraph') {
    // Inline paste keeps the spaces at its edges, so words don't run together.
    // Non-breaking, because insertHTML drops plain edge whitespace; it reads
    // back as an ordinary space.
    const raw = doc.body.textContent || '';
    const lead = /^\s/.test(raw) ? '&nbsp;' : '';
    const trail = /\s$/.test(raw) ? '&nbsp;' : '';
    return lead + out.replace(/^<p>/, '').replace(/<\/p>$/, '') + trail;
  }
  return out;
}
