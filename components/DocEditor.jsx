'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cleanPastedHtml } from '../lib/doc-editing';
import { MAX_LIST_DEPTH } from '../server-lib/pdf/blocks-to-html';

/**
 * In-place editing of a Canva post's extracted article.
 *
 * The admin edits the article exactly where the preview shows it, in the
 * site's own article styles, so what they see while editing is what readers
 * get. The editable surface is a plain contentEditable element; formatting
 * goes through the browser's editing commands so native undo/redo keeps
 * working. When editing finishes, the DOM is read back into article blocks
 * (lib/doc-editing.js) and the server regenerates the HTML from those.
 *
 * `DocEditor` is the editable body; `DocToolbar` drives it through the shared
 * `editorRef` and lives in the preview's fixed bar.
 */

const BLOCK_CHOICES = [
  ['p', 'Paragraph'],
  ['h2', 'Heading — large'],
  ['h3', 'Heading — medium'],
  ['h4', 'Heading — small'],
];
const NUMBER_STYLES = [
  ['1', '1, 2, 3'],
  ['a', 'a, b, c'],
  ['A', 'A, B, C'],
  ['i', 'i, ii, iii'],
  ['I', 'I, II, III'],
];

const exec = (command, value) => {
  try {
    return document.execCommand(command, false, value);
  } catch {
    return false;
  }
};

/** Nearest ancestor of `node` matching `selector`, inside `root` only. */
function closestIn(node, selector, root) {
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  while (el && el !== root) {
    if (el.matches?.(selector)) return el;
    el = el.parentElement;
  }
  return null;
}

/** How many lists enclose `node` inside the editor. */
function listDepth(node, root) {
  let depth = 0;
  let el = node?.nodeType === 1 ? node : node?.parentElement;
  while (el && el !== root) {
    if (el.tagName === 'UL' || el.tagName === 'OL') depth += 1;
    el = el.parentElement;
  }
  return depth;
}

/**
 * Chrome copies computed styles (colour, background, font) onto content it
 * inserts or merges. They would be dropped on save anyway; removing them as
 * they appear keeps the editor looking like the article in both themes. Only
 * weight and slant carry meaning, so only those survive.
 */
function stripInlineStyles(root) {
  for (const el of root.querySelectorAll('[style]')) {
    const { fontWeight, fontStyle } = el.style;
    el.removeAttribute('style');
    if (fontWeight) el.style.fontWeight = fontWeight;
    if (fontStyle) el.style.fontStyle = fontStyle;
  }
}

/* ---------------------------------------------------------------- body ---- */

export function DocEditor({ html, editorRef, onInput }) {
  const ref = useRef(null);

  // The DOM is owned by the browser while editing; React only seeds it. A new
  // `html` (reset to the PDF version) re-seeds it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html || '<p><br></p>';
    editorRef.current = el;
    return () => {
      if (editorRef.current === el) editorRef.current = null;
    };
  }, [html, editorRef]);

  useEffect(() => {
    // Enter makes <p> paragraphs (Chrome otherwise makes <div>s), and styling
    // commands emit tags rather than inline CSS.
    exec('defaultParagraphSeparator', 'p');
    exec('styleWithCSS', false);
    ref.current?.focus({ preventScroll: true });
  }, []);

  const onPaste = (e) => {
    const data = e.clipboardData;
    if (!data) return;
    e.preventDefault();
    const html = data.getData('text/html');
    if (html) {
      const cleaned = cleanPastedHtml(html);
      if (cleaned) exec('insertHTML', cleaned);
      return;
    }
    const text = data.getData('text/plain');
    if (text) exec('insertText', text);
  };

  const onKeyDown = (e) => {
    const root = ref.current;
    const mod = e.metaKey || e.ctrlKey;
    // Underline has no place in the article format; it would vanish on save.
    if (mod && (e.key === 'u' || e.key === 'U')) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Tab') {
      const anchor = window.getSelection()?.anchorNode;
      if (!closestIn(anchor, 'li', root)) return; // Tab leaves the editor
      e.preventDefault();
      if (e.shiftKey) exec('outdent');
      else if (listDepth(anchor, root) < MAX_LIST_DEPTH) exec('indent');
    }
  };

  // Dropped files and pictures can't be part of the article.
  const onDrop = (e) => {
    if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
  };

  return (
    <div
      ref={ref}
      className="blog-post-body blog-post-body--doc doc-editable"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      role="textbox"
      aria-multiline="true"
      aria-label="Article content"
      onPaste={onPaste}
      onKeyDown={onKeyDown}
      onDrop={onDrop}
      onInput={(e) => {
        stripInlineStyles(e.currentTarget);
        onInput?.(e);
      }}
    />
  );
}

/* ------------------------------------------------------------- toolbar ---- */

const EMPTY_STATE = {
  inside: false,
  block: 'p',
  bold: false,
  italic: false,
  list: null,
  numberStyle: '1',
  start: 1,
  link: false,
  depth: 0,
};

export function DocToolbar({ editorRef, onDone, onReset, resetting, error }) {
  const [state, setState] = useState(EMPTY_STATE);
  const saved = useRef(null);

  const read = useCallback(() => {
    const root = editorRef.current;
    const sel = window.getSelection();
    if (!root || !sel?.rangeCount || !root.contains(sel.anchorNode)) {
      setState((s) => (s.inside ? { ...s, inside: false } : s));
      return;
    }
    saved.current = sel.getRangeAt(0).cloneRange();
    const anchor = sel.anchorNode;
    const blockEl = closestIn(anchor, 'h1,h2,h3,h4,h5,h6,p,li,td,th', root);
    const tag = blockEl?.tagName.toLowerCase() || 'p';
    const listEl = closestIn(anchor, 'ul,ol', root);
    const ol = listEl?.tagName === 'OL' ? listEl : null;
    let bold = false;
    let italic = false;
    try {
      bold = document.queryCommandState('bold');
      italic = document.queryCommandState('italic');
    } catch {
      /* unsupported — buttons just don't show an active state */
    }
    setState({
      inside: true,
      block: /^h[1-6]$/.test(tag) ? (tag === 'h1' ? 'h2' : tag > 'h4' ? 'h4' : tag) : 'p',
      bold,
      italic,
      list: listEl ? listEl.tagName.toLowerCase() : null,
      numberStyle: ol?.getAttribute('type') || '1',
      start: Math.max(1, parseInt(ol?.getAttribute('start'), 10) || 1),
      link: Boolean(closestIn(anchor, 'a', root)),
      depth: listDepth(anchor, root),
    });
  }, [editorRef]);

  useEffect(() => {
    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, [read]);

  /** Put the caret back where it was, then run a browser editing command. */
  const run = (command, value) => {
    const root = editorRef.current;
    if (!root) return;
    root.focus({ preventScroll: true });
    if (saved.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
    exec(command, value);
    read();
  };

  /** The numbered list the caret is in (attributes edited directly). */
  const currentOl = () => {
    const root = editorRef.current;
    const node = saved.current?.startContainer;
    return root && node ? closestIn(node, 'ol', root) : null;
  };

  const setNumberStyle = (style) => {
    const ol = currentOl();
    if (!ol) return;
    if (style === '1') ol.removeAttribute('type');
    else ol.setAttribute('type', style);
    read();
  };

  const setStart = (value) => {
    const ol = currentOl();
    if (!ol) return;
    const n = Math.max(1, Math.min(9999, parseInt(value, 10) || 1));
    if (n === 1) ol.removeAttribute('start');
    else ol.setAttribute('start', String(n));
    // An explicit start means plain sequential numbering from it.
    for (const li of ol.children) if (li.tagName === 'LI') li.removeAttribute('value');
    read();
  };

  const addLink = () => {
    const current = (() => {
      const node = saved.current?.startContainer;
      const a = node && closestIn(node, 'a', editorRef.current);
      return a?.getAttribute('href') || 'https://';
    })();
    const input = window.prompt('Link address', current);
    if (input == null) return;
    let url = input.trim();
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url)) url = `https://${url}`;
    run('createLink', url);
  };

  // Buttons keep the editor's selection: act on mousedown, never take focus.
  const keep = (e) => e.preventDefault();
  const tool = ({ label, title, active, disabled, onClick }) => (
    <button
      key={title}
      type="button"
      className={`doc-tool${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={keep}
      onClick={onClick}
    >
      {label}
    </button>
  );

  const off = !state.inside;
  const inList = Boolean(state.list);

  return (
    <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
      <div className="doc-toolbar__row">
        <select
          className="doc-select"
          aria-label="Text style"
          value={state.block}
          disabled={off || inList}
          title={inList ? 'Leave the list to change this into a heading' : 'Text style'}
          onChange={(e) => run('formatBlock', `<${e.target.value}>`)}
        >
          {BLOCK_CHOICES.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        <span className="doc-toolbar__group">
          {tool({ label: <b>B</b>, title: 'Bold (Ctrl+B)', active: state.bold, disabled: off, onClick: () => run('bold') })}
          {tool({ label: <i>I</i>, title: 'Italic (Ctrl+I)', active: state.italic, disabled: off, onClick: () => run('italic') })}
          {tool({ label: 'Link', title: 'Add or change link', active: state.link, disabled: off, onClick: addLink })}
          {state.link && tool({ label: 'Unlink', title: 'Remove link', disabled: off, onClick: () => run('unlink') })}
          {tool({ label: 'Clear', title: 'Clear bold, italic and links', disabled: off, onClick: () => run('removeFormat') })}
        </span>

        <span className="doc-toolbar__group">
          {tool({ label: '• List', title: 'Bulleted list', active: state.list === 'ul', disabled: off, onClick: () => run('insertUnorderedList') })}
          {tool({ label: '1. List', title: 'Numbered list', active: state.list === 'ol', disabled: off, onClick: () => run('insertOrderedList') })}
          {tool({ label: '⇤', title: 'Move list item out (Shift+Tab)', disabled: off || !inList, onClick: () => run('outdent') })}
          {tool({
            label: '⇥',
            title: 'Make a sub-item (Tab)',
            disabled: off || !inList || state.depth >= MAX_LIST_DEPTH,
            onClick: () => run('indent'),
          })}
        </span>

        {state.list === 'ol' && (
          <span className="doc-toolbar__group">
            <select
              className="doc-select"
              aria-label="Numbering style"
              value={state.numberStyle}
              onChange={(e) => setNumberStyle(e.target.value)}
            >
              {NUMBER_STYLES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <label className="doc-start">
              Start at
              <input
                type="number"
                min="1"
                max="9999"
                value={state.start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
          </span>
        )}

        <span className="doc-toolbar__group">
          {tool({ label: '↶', title: 'Undo (Ctrl+Z)', onClick: () => run('undo') })}
          {tool({ label: '↷', title: 'Redo (Ctrl+Shift+Z)', onClick: () => run('redo') })}
        </span>
      </div>

      <div className="doc-toolbar__row doc-toolbar__row--end">
        {error ? (
          <span className="doc-toolbar__error">{error}</span>
        ) : (
          <span className="doc-toolbar__hint">
            Editing the article. Click into the text to change it.
          </span>
        )}
        <button type="button" className="btn btn-ghost doc-reset" onClick={onReset} disabled={resetting}>
          {resetting ? 'Restoring…' : 'Reset to PDF version'}
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Done editing
        </button>
      </div>
    </div>
  );
}
