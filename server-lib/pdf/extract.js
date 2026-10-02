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
 *   runs + drawn bullets -> lines (shared baseline) -> table regions -> blocks
 *
 * Paragraphs and lists are allowed to carry over a page break, so a list that
 * straddles two pages stays one list.
 */
import { getDocumentProxy, getResolvedPDFJS } from 'unpdf';

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

/* Typed bullet glyphs. Symbol bullets may sit flush against the text; a dash
   only counts when a space follows it, or "-5%" would become a list. The
   \uF0xx code points are the Wingdings/Symbol bullets Word and Canva emit. */
const BULLET_RE = /^(?:[•‣◦▪▫·●○■□◆◇➢➤►▸✓✔]\s*|[-–—]\s+)(?=\S)/;
const ORDERED_RE = /^(\d{1,3})[.)]\s+/;
const ALPHA_RE = /^([a-z]|[ivxl]{1,4})[.)]\s+/i;
const RUN_MARKER_RE = /^(\d{1,3}|[a-z]|[ivxl]{1,4})[.)]$/i;

const BOLD_RE = /bold|black|heavy|semibold|extrabold|demibold/i;
const ITALIC_RE = /italic|oblique/i;

/* A paragraph that ends like this is finished, so the first line of the next
   page starts a new one instead of continuing it. */
const SENTENCE_END_RE = /[.!?:;]["'”’)\]]*$/;

/* Canva (and most design tools) draw list bullets as small filled shapes
   rather than typing a "•", so they never appear in the text layer. A shape
   counts as a bullet when it sits just left of a line's first word, roughly
   level with it, and is a small, roughly square mark. */
const MARK_MAX = 20; // pt — anything bigger is decoration, not a bullet
const MARK_MIN = 0.8;

const median = (values) => {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Join two wrapped lines of text. A line that ends in a hyphen straight after
 * a letter ("E-" / "Commerce") is one word broken by the wrap, so no space.
 */
const joinText = (a, b) => (/\p{L}-$/u.test(a) ? `${a}${b}` : `${a} ${b}`);

/* ------------------------------------------------------------- reading ---- */

/**
 * pdf.js hands out opaque font ids ("g_d0_f3") whose CSS fallback is always
 * "sans-serif", so bold can't be read from the text content alone. Building
 * the operator list populates commonObjs with the real embedded font names
 * ("Lora-Bold"), which is a reliable signal. The same list carries the vector
 * drawing, which is where drawn bullets are found.
 */
async function loadOperators(page) {
  try {
    return await page.getOperatorList();
  } catch {
    /* fonts stay unresolved and no bullets are found — both degrade to off */
    return null;
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

let opsPromise = null;
/** pdf.js operator codes, read from the same build unpdf loaded. */
function pdfOps() {
  opsPromise ??= getResolvedPDFJS()
    .then((pdfjs) => pdfjs.OPS || null)
    .catch(() => null);
  return opsPromise;
}

const multiply = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/**
 * Small painted shapes on a page, in page coordinates — the candidates for
 * drawn bullets. Tracks the transform stack so the boxes line up with the
 * text positions pdf.js reports.
 */
function findMarks(opList, OPS) {
  if (!opList || !OPS) return [];
  const painting = new Set(
    [
      OPS.fill,
      OPS.eoFill,
      OPS.fillStroke,
      OPS.eoFillStroke,
      OPS.closeFillStroke,
      OPS.closeEOFillStroke,
      OPS.stroke,
      OPS.closeStroke,
    ].filter((v) => v !== undefined)
  );

  const marks = [];
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const { fnArray, argsArray } = opList;

  for (let k = 0; k < fnArray.length; k++) {
    const fn = fnArray[k];
    const args = argsArray[k];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform && args) ctm = multiply(ctm, args);
    else if (fn === OPS.constructPath && args) {
      // pdf.js >= 5: [paintOp, [path], bbox]. Older builds: [ops, coords, bbox]
      // with the paint op as the next operator.
      const paintOp = typeof args[0] === 'number' ? args[0] : fnArray[k + 1];
      const box = args[2];
      if (!painting.has(paintOp) || !box || box.length < 4) continue;
      const [x0, y0, x1, y1] = box;
      if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
      const corners = [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x1, y1],
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]]);
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      const left = Math.min(...xs);
      const right = Math.max(...xs);
      const bottom = Math.min(...ys);
      const top = Math.max(...ys);
      const w = right - left;
      const h = top - bottom;
      if (w < MARK_MIN || h < MARK_MIN || w > MARK_MAX || h > MARK_MAX) continue;
      if (w / h > 2 || h / w > 2) continue; // underlines and rules, not bullets
      // A fill and its outline often paint the same shape twice.
      if (marks.some((m) => Math.abs(m.left - left) < 1 && Math.abs(m.bottom - bottom) < 1)) continue;
      marks.push({ left, right, bottom, top, w, h, cy: (top + bottom) / 2 });
    }
  }
  return marks;
}

/** All positioned, styled text runs on a page, plus resolved link URLs. */
async function readPage(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const opList = await loadOperators(page);
  const marks = findMarks(opList, await pdfOps());
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

  return { runs, marks };
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

/**
 * The drawn bullet belonging to a line, if any: just left of its first word,
 * level with the text, and sized like a bullet for that type size. Each mark
 * is claimed by one line at most.
 */
function takeMark(line, marks, used) {
  let best = null;
  let bestGap = Infinity;
  for (const m of marks) {
    if (used.has(m)) continue;
    const gap = line.x - m.right;
    if (gap < -0.5 || gap > line.size * 2.5) continue;
    if (m.cy < line.y - line.size * 0.15 || m.cy > line.y + line.size * 0.75) continue;
    if (m.w < line.size * 0.15 || m.h < line.size * 0.15) continue;
    if (m.w > line.size * 0.8 || m.h > line.size * 0.8) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = m;
    }
  }
  if (best) used.add(best);
  return best;
}

/** Group a page's runs into visual lines, keeping the runs for later splits. */
function groupLines({ runs, marks }, page) {
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

  const used = new Set();
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
      const line = {
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
      if (text.length) {
        const mark = takeMark(line, marks, used);
        if (mark) line.mark = mark;
      }
      return line;
    })
    .filter((l) => l.text.length > 0);
}

/**
 * Mark each line `full` (it runs to the right edge of the text column, so it
 * wrapped) or not (it stopped short, so its block ended there). The edge is
 * where long lines end — per page when the page has enough of them, else the
 * document's. With no long lines anywhere it stays unknown (null) and nothing
 * relies on it.
 */
function markFullLines(pages) {
  const edge = (lines) => {
    const rights = lines
      .filter((l) => l.text.length >= 60)
      .map((l) => l.right)
      .sort((a, b) => a - b);
    return rights.length >= 3 ? rights[Math.floor(rights.length * 0.8)] : null;
  };
  const fallback = edge(pages.flat());
  for (const lines of pages) {
    const measure = edge(lines) ?? fallback;
    for (const line of lines) {
      line.full = measure === null ? null : line.right >= measure - line.size * 5;
    }
  }
}

/* ------------------------------------------------------------- headings ---- */

const sizeKey = (size) => Math.round(size * 2) / 2;

/* Heading sizes within this fraction of a level's usual size are the same
   level — Canva shrinks a long heading to fit its line or pill. */
const SAME_LEVEL_RATIO = 0.85;

/**
 * Rank the heading sizes the document actually uses, so heading levels follow
 * its own hierarchy rather than fixed ratios: its section headings, anything
 * larger, and anything smaller each get their own level, from <h2> down to
 * <h4> (the page title is the only <h1>).
 *
 * A line is a heading candidate when its type is clearly larger than the body
 * text, or a little larger and entirely bold — the usual "bold subheading a
 * size up from the body" pattern.
 */
function buildSizeModel(lines) {
  const weight = new Map();
  for (const line of lines) {
    const key = sizeKey(line.size);
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

  // Clearly larger than the body: always a heading, and never part of a table.
  const isDisplay = (line) => line.text.length <= 200 && line.size / body >= 1.15;

  const isCandidate = (line) => {
    if (isDisplay(line)) return true;
    // Bold a size up from the body. Lines with an internal gutter are table
    // rows, not headings.
    return (
      line.text.length <= 200 &&
      line.size / body >= 1.1 &&
      line.bold &&
      !line.gutters.length
    );
  };

  // Group heading sizes into levels. A size joins the level above it when it
  // is within SAME_LEVEL_RATIO of that level's most used size.
  const counts = new Map();
  for (const line of lines) {
    if (!isCandidate(line)) continue;
    const key = sizeKey(line.size);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const groups = [];
  for (const size of [...counts.keys()].sort((a, b) => b - a)) {
    const group = groups[groups.length - 1];
    if (group && size >= group.mode * SAME_LEVEL_RATIO) {
      group.sizes.push(size);
      group.lines += counts.get(size);
      if (counts.get(size) > counts.get(group.mode)) group.mode = size;
    } else {
      groups.push({ sizes: [size], mode: size, lines: counts.get(size) });
    }
  }

  // The most used group is the document's section heading. Anything larger
  // (a title, a cover line, a "Thank you" panel) is <h2>; the sections sit
  // just below that, and smaller headings below them.
  let main = 0;
  groups.forEach((g, i) => {
    if (g.lines > groups[main].lines) main = i;
  });
  const levelOf = new Map();
  groups.forEach((g, i) => {
    const sectionLevel = main > 0 ? 3 : 2;
    const level = i < main ? 2 : Math.min(4, sectionLevel + (i - main));
    for (const size of g.sizes) levelOf.set(size, level);
  });

  const levelFor = (line) => (isCandidate(line) ? levelOf.get(sizeKey(line.size)) || 0 : 0);
  return { body, levelFor, isDisplay };
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
  const isHeading = (line) => sizes.isDisplay(line);

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

/** Remove a list marker from the front of a line's spans. Whitespace is not
    counted, so the cut lands in the same place however the runs were spaced. */
function stripMarker(spans, marker) {
  let remaining = marker.replace(/\s+/g, '').length;
  const out = [];
  for (const span of spans) {
    if (remaining <= 0) {
      out.push({ ...span });
      continue;
    }
    let i = 0;
    while (i < span.text.length && remaining > 0) {
      if (!/\s/.test(span.text[i])) remaining -= 1;
      i += 1;
    }
    const rest = span.text.slice(i);
    if (rest.length) out.push({ ...span, text: rest });
  }
  if (out.length) out[0].text = out[0].text.replace(/^\s+/, '');
  return out.filter((s) => s.text.length);
}

function joinSpans(a, b) {
  const out = a.map((s) => ({ ...s }));
  const next = b.map((s) => ({ ...s }));
  const last = out[out.length - 1];
  if (!last || !next.length) return out.concat(next);
  const glue = /\p{L}-$/u.test(last.text) ? '' : ' ';
  const first = next[0];
  if (
    !!last.bold === !!first.bold &&
    !!last.italic === !!first.italic &&
    last.href === first.href
  ) {
    last.text = `${last.text}${glue}${first.text}`;
    return out.concat(next.slice(1));
  }
  last.text = `${last.text}${glue}`;
  return out.concat(next);
}

/* ---------------------------------------------------------------- lists ---- */

const ROMAN = { i: 1, v: 5, x: 10, l: 50 };

function romanValue(token) {
  const s = token.toLowerCase();
  if (!/^[ivxl]+$/.test(s)) return 0;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]];
    total += v < (ROMAN[s[i + 1]] || 0) ? -v : v;
  }
  return total;
}

/**
 * Where a line's text begins after its marker, when the marker is a run of
 * its own ("1." then a gap, then the text). null when the marker shares a run
 * with the text, so the indent can't be measured.
 */
function textStart(line, marker) {
  const want = marker.replace(/\s+/g, '').length;
  let seen = 0;
  for (const run of line.runs) {
    if (seen === want) return run.x;
    if (seen > want) return null;
    seen += run.str.replace(/\s+/g, '').length;
  }
  return null;
}

/** The list marker a line starts with, if any — drawn, typed or numbered. */
function readMarker(line) {
  if (line.mark) {
    return { ordered: false, drawn: true, prefix: '', markerX: line.mark.left, textX: line.x };
  }
  const bullet = BULLET_RE.exec(line.text);
  if (bullet) {
    return {
      ordered: false,
      symbol: !/^[-–—]/.test(bullet[0]),
      prefix: bullet[0],
      markerX: line.x,
      textX: textStart(line, bullet[0]),
    };
  }
  let m = ORDERED_RE.exec(line.text) || ALPHA_RE.exec(line.text);
  // A number set as its own run is a marker even when the gap to the text is
  // too narrow to read as a space ("iii." tabbed tight against its text).
  const head = line.runs.length > 1 ? line.runs[0].str.trim() : '';
  if (!m && head && line.text.startsWith(head)) m = RUN_MARKER_RE.exec(head);
  if (!m) return null;
  return {
    ordered: true,
    token: m[1],
    prefix: m[0],
    markerX: line.x,
    textX: textStart(line, m[0]),
  };
}

/**
 * Numbering style and value of an ordered marker. "i." is ambiguous between
 * the ninth letter and roman one, so the list it would continue decides.
 */
function orderedStyle(token, ctx) {
  if (/^\d+$/.test(token)) return { style: '1', value: Number(token) };
  const lower = token.toLowerCase();
  const upper = token !== lower;
  const alpha = lower.length === 1 ? { style: upper ? 'A' : 'a', value: lower.charCodeAt(0) - 96 } : null;
  const rv = romanValue(lower);
  const roman = rv ? { style: upper ? 'I' : 'i', value: rv } : null;
  if (alpha && roman) {
    if (ctx?.style?.toLowerCase() === 'a' && ctx.next === alpha.value) return alpha;
    if (ctx?.style?.toLowerCase() === 'i' && ctx.next === roman.value) return roman;
    return lower === 'i' ? roman : alpha;
  }
  return alpha || roman;
}

/* ----------------------------------------------------------------- flow ---- */

/**
 * Turns the non-table lines of the whole document, in reading order, into
 * headings, paragraphs and (possibly nested) lists.
 *
 * State lives across pages so a paragraph or list broken by a page break is
 * rejoined. `close()` ends whatever is open — called before a table and at
 * the end of the document.
 */
function createFlow(sizes, out) {
  let paragraph = null;
  // Open lists, outermost first. Only the outermost is in `out`; the others
  // hang off the last item of the list above them.
  let stack = [];
  // The outermost list closed most recently, so numbering that resumes after
  // an interruption ("4." after a paragraph) is recognised as a list item.
  let recent = null;
  // The last line taken into the flow.
  let last = null;

  const tolFor = (line) => Math.max(4, line.size * 0.6);

  /** Does `line` sit close enough under the previous one to share a block? */
  const follows = (line, gapLines) => {
    if (!last) return false;
    if (line.page === last.page) {
      const gap = last.y - line.y;
      return gap > 0 && gap <= line.size * gapLines;
    }
    // The first line of the next page picks up where the last page ended.
    return line.page === last.page + 1;
  };

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

  const closeLists = () => {
    if (!stack.length) return;
    const root = stack[0];
    if (root.ordered) {
      recent = { markerX: root.markerX, ordered: true, style: root.style, next: root.next };
    }
    out.push(root.block);
    stack = [];
  };

  /** The open (or just closed) numbered list a marker at this indent would extend. */
  const orderedContext = (marker, tol) => {
    for (let i = stack.length - 1; i >= 0; i--) {
      const e = stack[i];
      if (e.ordered && Math.abs(e.markerX - marker.markerX) <= tol) return e;
    }
    if (recent && Math.abs(recent.markerX - marker.markerX) <= tol) return recent;
    return null;
  };

  const paragraphContinues = (line) =>
    Boolean(paragraph) &&
    Math.abs(line.size - paragraph.size) < 1.2 &&
    Math.abs(line.x - paragraph.x) < 26 &&
    follows(line, 2.6) &&
    // A short last line that ends a sentence is the end of the paragraph.
    !(last.full === false && SENTENCE_END_RE.test(paragraph.text)) &&
    // Across a page break only an unfinished sentence carries on.
    (line.page === paragraph.lastPage || !SENTENCE_END_RE.test(paragraph.text));

  /** The open list item a marker-less line would wrap into, with its depth. */
  const listTarget = (line) => {
    if (!stack.length || !follows(line, 2.6)) return null;
    const tol = tolFor(line);
    for (let i = stack.length - 1; i >= 0; i--) {
      const e = stack[i];
      if (Math.abs(line.size - e.size) >= 1.2) continue;
      const item = e.block.items[e.block.items.length - 1];
      const aligned =
        e.textX != null
          ? Math.abs(line.x - e.textX) <= tol
          : line.x > e.markerX + tol && line.x <= e.markerX + line.size * 5;
      // Lists without a hanging indent wrap back under the marker; that is
      // only a wrap when the line above ran to the margin mid-sentence.
      const wrapsUnder =
        i === stack.length - 1 &&
        Math.abs(line.x - e.markerX) <= tol &&
        last?.full === true &&
        !SENTENCE_END_RE.test(item.text);
      if (aligned || wrapsUnder) return { depth: i, item };
    }
    return null;
  };

  const openList = (line, marker, parent) => {
    const block = { type: 'list', ordered: marker.ordered, items: [], page: line.page };
    if (marker.ordered && marker.style !== '1') block.style = marker.style;
    if (parent) {
      const host = parent.block.items[parent.block.items.length - 1];
      (host.children ??= []).push(block);
    }
    const entry = {
      block,
      ordered: marker.ordered,
      style: marker.style,
      markerX: marker.markerX,
      textX: marker.textX,
      size: line.size,
      next: null,
    };
    stack.push(entry);
    return entry;
  };

  const addItem = (line, marker) => {
    const tol = tolFor(line);
    if (stack.length && !follows(line, 4)) closeLists();
    // Step out of sub-lists that are indented deeper than this marker.
    while (stack.length > 1 && stack[stack.length - 1].markerX > marker.markerX + tol) stack.pop();
    if (stack.length && stack[0].markerX > marker.markerX + tol) closeLists();

    const sameKind = (e) => e.ordered === marker.ordered && (!marker.ordered || e.style === marker.style);
    let entry = stack[stack.length - 1] || null;
    if (entry && Math.abs(entry.markerX - marker.markerX) <= tol) {
      if (!sameKind(entry)) {
        // A different kind of list at the same indent is a new list.
        if (stack.length === 1) {
          closeLists();
          entry = openList(line, marker, null);
        } else {
          stack.pop();
          entry = openList(line, marker, stack[stack.length - 1]);
        }
      }
    } else if (entry) {
      entry = openList(line, marker, entry); // deeper indent: a sub-list
    } else {
      entry = openList(line, marker, null);
    }

    const item = {
      spans: marker.prefix ? stripMarker(line.spans, marker.prefix) : line.spans.map((s) => ({ ...s })),
      text: clean(line.text.slice(marker.prefix.length)),
    };
    if (marker.ordered) {
      item.value = marker.value;
      entry.next = marker.value + 1;
    }
    entry.block.items.push(item);
    entry.size = line.size;
  };

  const remember = (line) => {
    last = { page: line.page, y: line.y, full: line.full };
  };

  const push = (line) => {
    const level = sizes.levelFor(line);
    if (level) {
      flushParagraph();
      closeLists();
      // A heading that wraps onto a second line at the same size is one heading.
      const previous = out[out.length - 1];
      if (
        previous?.type === 'heading' &&
        previous.level === level &&
        previous.page === line.page &&
        previous._y !== undefined &&
        previous._y - line.y < line.size * 2.2
      ) {
        previous.text = joinText(previous.text, line.text).trim();
        previous._y = line.y;
      } else {
        out.push({ type: 'heading', level, text: line.text, page: line.page, _y: line.y });
      }
      remember(line);
      return;
    }

    let marker = readMarker(line);
    if (marker?.ordered) Object.assign(marker, orderedStyle(marker.token, orderedContext(marker, tolFor(line))));

    // A wrapped line can happen to begin like a marker ("7. " or "– "). When
    // the line above ran to the margin mid-sentence, a typed marker only
    // counts if it is the expected next item of a list.
    if (marker && !marker.drawn && !marker.symbol && last?.full === true) {
      const target = listTarget(line);
      const before = paragraphContinues(line) ? paragraph.text : target ? target.item.text : null;
      if (before !== null && !SENTENCE_END_RE.test(before)) {
        const ctx = marker.ordered ? orderedContext(marker, tolFor(line)) : null;
        const expected = marker.ordered
          ? marker.value === 1 || (ctx && ctx.style === marker.style && ctx.next === marker.value)
          : stack.some((e) => !e.ordered && Math.abs(e.markerX - marker.markerX) <= tolFor(line));
        if (!expected) marker = null;
      }
    }

    if (marker) {
      flushParagraph();
      addItem(line, marker);
      remember(line);
      return;
    }

    const target = listTarget(line);
    // Text after a sub-list can't be folded back into its item without
    // reordering it, so it ends the list and stays a paragraph.
    if (target && !target.item.children?.length) {
      stack.length = target.depth + 1;
      target.item.spans = joinSpans(target.item.spans, line.spans);
      target.item.text = target.item.text ? joinText(target.item.text, line.text) : line.text;
      remember(line);
      return;
    }

    closeLists();

    if (paragraphContinues(line)) {
      paragraph.spans = joinSpans(paragraph.spans, line.spans);
      paragraph.text = joinText(paragraph.text, line.text);
      paragraph.lastPage = line.page;
    } else {
      flushParagraph();
      paragraph = {
        spans: line.spans.map((s) => ({ ...s })),
        text: line.text,
        page: line.page,
        lastPage: line.page,
        size: line.size,
        x: line.x,
      };
    }
    remember(line);
  };

  const close = () => {
    flushParagraph();
    closeLists();
    last = null;
  };

  return { push, close };
}

/** Plain text of a list, sub-lists included, one item per line. */
function listText(list) {
  return (list.items || [])
    .flatMap((item) => [item.text, ...(item.children || []).map(listText)])
    .filter(Boolean)
    .join('\n');
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

  markFullLines(pages);
  const sizes = buildSizeModel(pages.flat());
  const blocks = [];
  const flow = createFlow(sizes, blocks);

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

    for (const line of lines) {
      if (tableAt.has(line)) {
        flow.close();
        blocks.push(tableAt.get(line));
      }
      if (!claimed.has(line)) flow.push(line);
    }
  }
  flow.close();

  const text = blocks
    .map((b) => {
      if (b.type === 'heading' || b.type === 'paragraph') return b.text;
      if (b.type === 'list') return listText(b);
      if (b.type === 'table') return [b.headers, ...b.rows].map((r) => r.join(' — ')).join('\n');
      return '';
    })
    .filter(Boolean)
    .join('\n');

  // Drop internal bookkeeping before the blocks are persisted.
  const cleaned = blocks.map(({ _y, ...block }) => block);

  return { pageCount, blocks: cleaned, text };
}
