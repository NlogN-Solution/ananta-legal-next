/**
 * Canva PDF -> structured content.
 *
 * Runs server-side only, once per upload (never per page view). Uses `unpdf`,
 * a pure-JS pdf.js build with no native binaries, so it works inside a Vercel
 * serverless function.
 *
 * The job here is *extraction*, never authoring: every word in the output
 * comes from the document. Where a structure can't be reconstructed with
 * confidence we fall back to plainer blocks rather than guessing — losing
 * layout is acceptable, losing or scrambling text is not.
 *
 * Pipeline per page:
 *   runs -> lines (shared baseline) -> table regions -> blocks
 */
import { getDocumentProxy } from 'unpdf';

/* Canva exports justified text one item per word and splits ligatures into
   their own runs ("Of" + "fi" + "ce"). Runs closer than this fraction of the
   font size are the same word and get concatenated with no space. */
const GLUE_RATIO = 0.22;
/* Two runs share a visual line when their baselines are this close. */
const LINE_RATIO = 0.5;
/* A horizontal gap this many times the font size is a column gutter, not a
   word space. */
const GUTTER_RATIO = 1.8;
/* Consecutive lines in the same column further apart than this many line
   heights start a new table row. */
const ROW_BREAK_RATIO = 1.55;

const BULLET_RE = /^([•‣◦▪·]|[-–—])\s+/;
const ORDERED_RE = /^(\d{1,3})[.)]\s+/;
const ALPHA_RE = /^([a-z]|[ivxl]{1,4})[.)]\s+/i;

const BOLD_RE = /bold|black|heavy|semibold|extrabold|demibold/i;
const ITALIC_RE = /italic|oblique/i;

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------- reading ---- */

/**
 * pdf.js hands out opaque font ids ("g_d0_f3") whose CSS fallback is always
 * "sans-serif", so bold can't be read from the text content alone. Building
 * the operator list populates commonObjs with the real embedded font names
 * ("Lora-Bold"), which is a reliable signal.
 */
async function primeFonts(page) {
  try {
    await page.getOperatorList();
  } catch {
    /* fonts stay unresolved; bold detection simply degrades to off */
  }
}

function resolveFont(page, id, cache) {
  if (cache.has(id)) return cache.get(id);
  let name = '';
  try {
    name = page.commonObjs.get(id)?.name || '';
  } catch {
    /* font not resolvable — treat it as regular weight */
  }
  const style = { bold: BOLD_RE.test(name), italic: ITALIC_RE.test(name) };
  cache.set(id, style);
  return style;
}

/** All positioned, styled text runs on a page, plus resolved link URLs. */
async function readPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  await primeFonts(page);
  const content = await page.getTextContent();

  const links = [];
  try {
    const seen = new Set();
    for (const a of await page.getAnnotations()) {
      const url = a.url || a.unsafeUrl;
      if (a.subtype !== 'Link' || !url || !a.rect) continue;
      const key = `${url}|${a.rect.map((n) => Math.round(n)).join(',')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [x1, y1, x2, y2] = a.rect;
      links.push({
        url,
        left: Math.min(x1, x2),
        right: Math.max(x1, x2),
        bottom: Math.min(y1, y2),
        top: Math.max(y1, y2),
      });
    }
  } catch {
    /* annotations are optional */
  }

  const cache = new Map();
  const runs = [];
  for (const item of content.items) {
    if (!item.str) continue;
    // Canva pads justified text and table gutters with whitespace-only runs
    // that are as wide as the gap they fill. Keeping them would hide every
    // column boundary, so drop them and let the gap logic re-derive spacing.
    if (!item.str.trim()) continue;
    const t = item.transform;
    const size = Math.hypot(t[2], t[3]) || item.height || 0;
    if (!size) continue;
    const x = t[4];
    const y = t[5];
    const width = item.width || 0;
    const font = resolveFont(page, item.fontName, cache);
    const midX = x + width / 2;
    const midY = y + size * 0.35;
    const link = links.find(
      (l) => midX >= l.left - 1 && midX <= l.right + 1 && midY >= l.bottom - 1 && midY <= l.top + 1
    );
    runs.push({
      str: item.str,
      x,
      y,
      width,
      size,
      bold: font.bold,
      italic: font.italic,
      href: link ? link.url : undefined,
    });
  }

  return runs;
}

/* --------------------------------------------------------------- lines ---- */

/** Join a set of runs into inline spans, gluing ligature fragments. */
function runsToSpans(runs) {
  const spans = [];
  let prev = null;
  for (const run of runs) {
    if (!run.str) continue;
    const gap = prev && run.x - (prev.x + prev.width) > run.size * GLUE_RATIO ? ' ' : '';
    const piece = gap + run.str;
    const last = spans[spans.length - 1];
    if (last && last.bold === run.bold && last.italic === run.italic && last.href === run.href) {
      last.text += piece;
    } else {
      spans.push({ text: piece, bold: run.bold, italic: run.italic, href: run.href });
    }
    prev = run;
  }
  if (spans.length) {
    spans[0].text = spans[0].text.replace(/^\s+/, '');
    spans[spans.length - 1].text = spans[spans.length - 1].text.replace(/\s+$/, '');
  }
  return spans
    .filter((s) => s.text.length)
    .map((s) => {
      const out = { text: s.text };
      if (s.bold) out.bold = true;
      if (s.italic) out.italic = true;
      if (s.href) out.href = s.href;
      return out;
    });
}

/** Group a page's runs into visual lines, keeping the runs for later splits. */
function groupLines(runs, page) {
  const ordered = [...runs].sort((a, b) => b.y - a.y || a.x - b.x);
  const buckets = [];
  let bucket = [];

  for (const run of ordered) {
    if (!bucket.length) {
      bucket = [run];
      continue;
    }
    const ref = bucket[0];
    if (Math.abs(run.y - ref.y) <= Math.max(ref.size, run.size) * LINE_RATIO) bucket.push(run);
    else {
      buckets.push(bucket);
      bucket = [run];
    }
  }
  if (bucket.length) buckets.push(bucket);

  return buckets
    .map((b) => {
      const sorted = [...b].sort((a, b2) => a.x - b2.x);
      const spans = runsToSpans(sorted);
      const text = clean(spans.map((s) => s.text).join(''));
      // Internal gutters: the x of every run that starts a new column.
      const gutters = [];
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width);
        if (gap > sorted[i].size * GUTTER_RATIO) gutters.push(sorted[i].x);
      }
      return {
        runs: sorted,
        spans,
        text,
        gutters,
        page,
        x: sorted[0].x,
        right: Math.max(...sorted.map((r) => r.x + r.width)),
        y: sorted[0].y,
        size: median(sorted.map((r) => r.size)),
        bold: sorted.every((r) => r.bold),
      };
    })
    .filter((l) => l.text.length > 0);
}

/* ------------------------------------------------------------- headings ---- */

/**
 * Rank the distinct font sizes larger than the body size, so heading levels
 * follow the document's own hierarchy rather than fixed ratios.
 */
function buildSizeModel(lines) {
  const weight = new Map();
  for (const line of lines) {
    const key = Math.round(line.size * 2) / 2;
    weight.set(key, (weight.get(key) || 0) + line.text.length);
  }
  let body = 11;
  let best = -1;
  for (const [size, chars] of weight) {
    if (chars > best) {
      best = chars;
      body = size;
    }
  }
  // Heading level from how much bigger the type is than the body. Ratios keep
  // the hierarchy shallow and valid (h1 title -> h2 -> h3 -> h4) no matter how
  // many distinct sizes a Canva document happens to use.
  const levelFor = (size) => {
    const ratio = size / body;
    if (ratio >= 1.5) return 2;
    if (ratio >= 1.28) return 3;
    if (ratio >= 1.15) return 4;
    return 0;
  };
  return { body, levelFor };
}

/* --------------------------------------------------------------- tables ---- */

/** Cluster x positions into bands. */
function clusterX(values, tolerance = 14) {
  const bands = [];
  for (const v of [...values].sort((a, b) => a - b)) {
    const hit = bands.find((b) => Math.abs(b.x - v) <= tolerance);
    if (hit) {
      hit.n += 1;
      hit.x += (v - hit.x) / hit.n;
    } else bands.push({ x: v, n: 1 });
  }
  return bands;
}

/**
 * Split a page's lines into runs of table-ish lines and normal lines.
 * A line is table-ish when it has an internal gutter, or when it starts at a
 * secondary column band that a neighbouring gutter line established.
 */
function findTableRegions(lines, sizes) {
  const gutterX = clusterX(lines.flatMap((l) => l.gutters)).filter((b) => b.n >= 2);
  const regions = [];
  let current = null;

  // A heading never belongs to a table — the pill headings Canva sets between
  // tables would otherwise be swallowed into the row above them.
  const isHeading = (line) => line.text.length <= 200 && sizes.levelFor(line.size) > 0;

  const isTabular = (line, i) => {
    if (isHeading(line)) return false;
    if (line.gutters.length) return true;
    if (!gutterX.length) return false;
    // Sits in a right-hand column established by nearby gutter lines.
    const inColumn = gutterX.some((b) => Math.abs(line.x - b.x) <= 18);
    if (!inColumn) return false;
    const near = lines.slice(Math.max(0, i - 3), i + 4);
    return near.some((l) => l !== line && (l.gutters.length || Math.abs(l.x - line.x) > 60));
  };

  lines.forEach((line, i) => {
    if (isTabular(line, i)) {
      if (!current) current = { start: i, lines: [] };
      current.lines.push(line);
      current.end = i;
    } else if (current) {
      // Allow one stray non-tabular line inside a table (a wrapped cell that
      // happens to fill its column).
      const nextTabular = lines[i + 1] && isTabular(lines[i + 1], i + 1);
      const closeEnough =
        nextTabular &&
        !isHeading(line) &&
        line.page === current.lines[current.lines.length - 1].page &&
        Math.abs(current.lines[current.lines.length - 1].y - line.y) < line.size * 3.2;
      if (closeEnough) {
        current.lines.push(line);
        current.end = i;
      } else {
        regions.push(current);
        current = null;
      }
    }
  });
  if (current) regions.push(current);

  return regions.filter((r) => r.lines.length >= 2);
}

/**
 * Turn a table region into a grid. Returns null when the structure isn't
 * confident enough — the caller then keeps the lines as paragraphs, so the
 * text survives either way.
 */
function regionToTable(region) {
  const lines = region.lines;

  // Column boundaries: gutter positions plus every distinct line-start x.
  const starts = clusterX(lines.map((l) => l.x)).filter((b) => b.n >= 1);
  const gutters = clusterX(lines.flatMap((l) => l.gutters));
  const boundaries = clusterX([...starts.map((b) => b.x), ...gutters.map((b) => b.x)], 16)
    .map((b) => b.x)
    .sort((a, b) => a - b);

  if (boundaries.length < 2) return null;

  const columnFor = (x) => {
    let index = 0;
    for (let i = 0; i < boundaries.length; i++) {
      if (x >= boundaries[i] - 12) index = i;
    }
    return index;
  };

  // Split each line's runs across columns, then place the fragments.
  const cells = [];
  for (const line of lines) {
    const byColumn = new Map();
    for (const run of line.runs) {
      const col = columnFor(run.x);
      if (!byColumn.has(col)) byColumn.set(col, []);
      byColumn.get(col).push(run);
    }
    for (const [col, runs] of byColumn) {
      const text = clean(runsToSpans(runs).map((s) => s.text).join(''));
      if (text) cells.push({ col, y: line.y, size: line.size, text });
    }
  }
  if (!cells.length) return null;

  // Rows: driven by the leftmost populated column, breaking on a large gap.
  const firstCol = Math.min(...cells.map((c) => c.col));
  const anchors = cells
    .filter((c) => c.col === firstCol)
    .sort((a, b) => b.y - a.y);
  if (anchors.length < 2) return null;

  const rowBands = [];
  for (const anchor of anchors) {
    const last = rowBands[rowBands.length - 1];
    if (last && last.top - anchor.y <= anchor.size * ROW_BREAK_RATIO) {
      last.bottom = anchor.y;
      last.top = Math.max(last.top, anchor.y);
    } else {
      rowBands.push({ top: anchor.y, bottom: anchor.y });
    }
  }
  if (rowBands.length < 2) return null;

  const centres = rowBands.map((b) => (b.top + b.bottom) / 2);
  const columnCount = Math.max(...cells.map((c) => c.col)) + 1;
  const grid = rowBands.map(() => Array.from({ length: columnCount }, () => []));

  for (const cell of cells) {
    let best = 0;
    let bestDistance = Infinity;
    centres.forEach((centre, i) => {
      const d = Math.abs(centre - cell.y);
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    });
    grid[best][cell.col].push(cell);
  }

  const rows = grid.map((row) =>
    row.map((parts) =>
      parts
        .sort((a, b) => b.y - a.y || a.col - b.col)
        .map((p) => p.text)
        .join(' ')
        .trim()
    )
  );

  const populated = rows.filter((r) => r.some((c) => c.length));
  if (populated.length < 2) return null;
  // A "table" where every row has only one non-empty cell is really just text.
  const multiCellRows = populated.filter((r) => r.filter((c) => c.length).length >= 2);
  if (multiCellRows.length < 2) return null;

  const [headers, ...body] = populated;
  return { type: 'table', headers, rows: body, page: lines[0].page };
}

/* --------------------------------------------------------------- blocks ---- */

function stripPrefix(spans, count) {
  const out = [];
  let remaining = count;
  for (const span of spans) {
    if (remaining <= 0) out.push({ ...span });
    else if (span.text.length > remaining) {
      out.push({ ...span, text: span.text.slice(remaining) });
      remaining = 0;
    } else remaining -= span.text.length;
  }
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, '');
  return out.filter((s) => s.text.length);
}

function joinSpans(a, b) {
  const out = a.map((s) => ({ ...s }));
  const last = out[out.length - 1];
  const first = b[0];
  if (last && first && !!last.bold === !!first.bold && last.href === first.href) {
    last.text = `${last.text} ${first.text}`;
    return out.concat(b.slice(1).map((s) => ({ ...s })));
  }
  if (last) last.text = `${last.text} `;
  return out.concat(b.map((s) => ({ ...s })));
}

/** Convert the non-table lines of a page into headings, lists and paragraphs. */
function flowToBlocks(lines, sizes, out) {
  let paragraph = null;
  let list = null;

  const flushParagraph = () => {
    if (paragraph?.spans.length) {
      out.push({
        type: 'paragraph',
        spans: paragraph.spans,
        text: clean(paragraph.text),
        page: paragraph.page,
      });
    }
    paragraph = null;
  };
  const flushList = () => {
    if (list?.items.length) out.push(list);
    list = null;
  };

  for (const line of lines) {
    // Long lines are body copy however large the type is — a heading is short.
    const level = line.text.length <= 200 ? sizes.levelFor(line.size) : 0;

    if (level) {
      flushParagraph();
      flushList();
      // A heading that wraps onto a second line at the same size is one heading.
      const previous = out[out.length - 1];
      if (
        previous?.type === 'heading' &&
        previous.level === level &&
        previous.page === line.page &&
        previous._y !== undefined &&
        previous._y - line.y < line.size * 2.2
      ) {
        previous.text = `${previous.text} ${line.text}`.trim();
        previous._y = line.y;
      } else {
        out.push({ type: 'heading', level, text: line.text, page: line.page, _y: line.y });
      }
      continue;
    }

    const bullet = BULLET_RE.exec(line.text);
    const ordered = ORDERED_RE.exec(line.text) || ALPHA_RE.exec(line.text);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const marker = (bullet || ordered)[0];
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { type: 'list', ordered: isOrdered, items: [], page: line.page };
      }
      list.items.push({
        spans: stripPrefix(line.spans, marker.length),
        text: clean(line.text.slice(marker.length)),
      });
      continue;
    }

    flushList();

    const continues =
      paragraph &&
      line.page === paragraph.page &&
      Math.abs(line.size - paragraph.size) < 1.2 &&
      Math.abs(line.x - paragraph.x) < 26 &&
      paragraph.y - line.y < line.size * 2.6;

    if (continues) {
      paragraph.spans = joinSpans(paragraph.spans, line.spans);
      paragraph.text = `${paragraph.text} ${line.text}`;
      paragraph.y = line.y;
    } else {
      flushParagraph();
      paragraph = {
        spans: line.spans.map((s) => ({ ...s })),
        text: line.text,
        page: line.page,
        size: line.size,
        x: line.x,
        y: line.y,
      };
    }
  }

  flushParagraph();
  flushList();
}

/* ----------------------------------------------------------------- api ---- */

/**
 * Extract a Canva PDF into structured blocks plus plain text.
 *
 * @param {Uint8Array|ArrayBuffer|Buffer} data raw PDF bytes
 * @returns {Promise<{pageCount:number, blocks:Array, text:string}>}
 */
export async function extractPdf(data) {
  // pdf.js rejects a Node Buffer even though it subclasses Uint8Array, so
  // always hand it a plain view over the same bytes.
  const source = data instanceof Uint8Array ? data : new Uint8Array(data);
  const bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  const pdf = await getDocumentProxy(bytes);
  const pageCount = pdf.numPages;

  const pages = [];
  for (let n = 1; n <= pageCount; n++) {
    pages.push(groupLines(await readPage(pdf, n), n));
  }

  const sizes = buildSizeModel(pages.flat());
  const blocks = [];

  for (const lines of pages) {
    const regions = findTableRegions(lines, sizes);
    const claimed = new Set();
    const tableAt = new Map();

    for (const region of regions) {
      const table = regionToTable(region);
      if (!table) continue; // stays as normal flow text — nothing is dropped
      region.lines.forEach((l) => claimed.add(l));
      tableAt.set(region.lines[0], table);
    }

    let buffer = [];
    for (const line of lines) {
      if (tableAt.has(line)) {
        flowToBlocks(buffer, sizes, blocks);
        buffer = [];
        blocks.push(tableAt.get(line));
      }
      if (!claimed.has(line)) buffer.push(line);
    }
    flowToBlocks(buffer, sizes, blocks);
  }

  const text = blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'paragraph') return b.text;
      if (b.type === 'list') return b.items.map((i) => i.text).join('\n');
      if (b.type === 'table') return [b.headers, ...b.rows].map((r) => r.join(' — ')).join('\n');
      return '';
    })
    .filter(Boolean)
    .join('\n');

  // Drop internal bookkeeping before the blocks are persisted.
  const cleaned = blocks.map(({ _y, ...block }) => block);

  return { pageCount, blocks: cleaned, text };
}
