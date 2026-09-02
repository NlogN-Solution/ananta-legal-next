/**
 * Structured blocks -> semantic HTML for the public article body.
 *
 * This runs on the server every time a post is saved, re-derived from
 * `structured_content` — the browser's HTML is never trusted. Because every
 * text node is escaped and only the fixed tag set below is ever emitted, a
 * hostile payload can't inject markup, so no HTML sanitizer is needed.
 *
 * Tags emitted: h2 h3 h4 p ul ol li table thead tbody tr th td strong a
 * The output deliberately uses no classes or inline styles so it inherits the
 * site's existing `.blog-post-body` rules in styles/blog.css.
 */

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

/** Only absolute http(s) and mailto/tel links survive. */
function safeHref(href) {
  if (!href) return null;
  const value = String(href).trim();
  if (!/^(https?:\/\/|mailto:|tel:)/i.test(value)) return null;
  if (value.length > 2000) return null;
  return value;
}

function renderSpans(spans, fallbackText = '') {
  if (!Array.isArray(spans) || spans.length === 0) {
    return escapeHtml(fallbackText);
  }
  return spans
    .map((span) => {
      const text = escapeHtml(span?.text ?? '');
      if (!text) return '';
      let out = span?.bold ? `<strong>${text}</strong>` : text;
      const href = safeHref(span?.href);
      if (href) {
        out = `<a href="${escapeHtml(href)}" rel="noopener nofollow" target="_blank">${out}</a>`;
      }
      return out;
    })
    .join('');
}

function renderTable(block) {
  const headers = Array.isArray(block.headers) ? block.headers : [];
  const rows = Array.isArray(block.rows) ? block.rows : [];
  if (!rows.length && !headers.length) return '';

  const head = headers.length
    ? `<thead><tr>${headers.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>`
    : '';
  const body = rows.length
    ? `<tbody>${rows
        .map((row) => `<tr>${(row || []).map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`)
        .join('')}</tbody>`
    : '';

  return `<table>${head}${body}</table>`;
}

/**
 * @param {Array} blocks structured_content
 * @returns {string} article inner HTML ('' when there is nothing to render)
 */
export function blocksToHtml(blocks) {
  if (!Array.isArray(blocks)) return '';

  const parts = [];

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue;

    switch (block.type) {
      case 'heading': {
        // The page already renders the post title as the single <h1>, so
        // extracted headings start at <h2> and never go past <h4>.
        const level = Math.min(4, Math.max(2, Number(block.level) || 2));
        const text = escapeHtml(block.text || '');
        if (text) parts.push(`<h${level}>${text}</h${level}>`);
        break;
      }
      case 'paragraph': {
        const html = renderSpans(block.spans, block.text);
        if (html.trim()) parts.push(`<p>${html}</p>`);
        break;
      }
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const items = (Array.isArray(block.items) ? block.items : [])
          .map((item) => renderSpans(item?.spans, item?.text))
          .filter((html) => html.trim())
          .map((html) => `<li>${html}</li>`)
          .join('');
        if (items) parts.push(`<${tag}>${items}</${tag}>`);
        break;
      }
      case 'table': {
        const html = renderTable(block);
        if (html) parts.push(html);
        break;
      }
      default:
        break;
    }
  }

  return parts.join('\n');
}

/** Plain text of the blocks — used for read-time and excerpt suggestions. */
export function blocksToText(blocks) {
  if (!Array.isArray(blocks)) return '';
  const out = [];
  for (const block of blocks) {
    if (!block) continue;
    if (block.type === 'heading' || block.type === 'paragraph') {
      out.push(block.text || (block.spans || []).map((s) => s.text).join(''));
    } else if (block.type === 'list') {
      for (const item of block.items || []) {
        out.push(item.text || (item.spans || []).map((s) => s.text).join(''));
      }
    } else if (block.type === 'table') {
      for (const row of [block.headers || [], ...(block.rows || [])]) {
        out.push((row || []).join(' '));
      }
    }
  }
  return out.filter(Boolean).join('\n');
}

/** First real paragraph — offered to the admin as an excerpt suggestion. */
export function firstParagraph(blocks, maxLength = 240) {
  if (!Array.isArray(blocks)) return '';
  const block = blocks.find(
    (b) => b?.type === 'paragraph' && (b.text || '').trim().length > 60
  );
  if (!block) return '';
  const text = (block.text || '').trim().replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).replace(/\s+\S*$/, '')}…`;
}
