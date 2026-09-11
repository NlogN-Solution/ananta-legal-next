'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { PAGES, findPage } from '@/lib/blocks/pages';
import { BLOCKS, PALETTE, blockLabel } from '@/lib/blocks/registry';
import { translations } from '@/i18n/translations';
import MediaLibrary from './MediaLibrary';

/**
 * The page builder.
 *
 * A page is a list of sections. Sections can be reordered, hidden, removed and
 * added from the block palette, and a block's copy is edited field by field in
 * both languages. Two kinds appear in the list:
 *
 *   blocks   — fully editable, rendered from the saved copy.
 *   built-in — panels the page's own code renders (the contact form, the
 *              practice-area grid). They can be moved, hidden or removed, but
 *              their content is markup with behaviour, not copy, so there are
 *              no fields to edit.
 *
 * A page that has never been saved shows the layout that ships in the code,
 * pre-filled with the live copy — so the first save changes nothing, and
 * "Reset" deletes the saved layout to return to exactly that.
 */

const LANGS = [
  ['en', 'English'],
  ['ne', 'नेपाली'],
];

const uid = () =>
  (globalThis.crypto?.randomUUID?.() || `s${Date.now()}${Math.random().toString(16).slice(2)}`);

/** Fill a new block with the copy that currently ships, in both languages. */
function seedData(type) {
  const def = BLOCKS[type];
  if (!def) return {};
  const data = {};
  for (const [lang] of LANGS) {
    const defaults = def.defaults(translations[lang] || translations.en) || {};
    const copy = {};
    for (const field of def.fields) {
      const value = defaults[field.name];
      if (value === undefined) copy[field.name] = field.type === 'list' || field.type === 'lines' ? [] : '';
      else copy[field.name] = structuredClone(value);
    }
    data[lang] = copy;
  }
  return data;
}

/** The layout composed in code, as editable sections. */
function seedLayout(pageKey) {
  const definition = findPage(pageKey);
  if (!definition) return [];
  return definition.layout.map((entry) =>
    entry.type === 'builtin'
      ? { uid: uid(), type: 'builtin', visible: true, label: '', data: { key: entry.key } }
      : { uid: uid(), type: entry.type, visible: true, label: '', data: seedData(entry.type) }
  );
}

/* ------------------------------------------------------------- fields ---- */

function ImageField({ value, onChange }) {
  const [picking, setPicking] = useState(false);
  return (
    <>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="/photo.jpg" />
        <button type="button" className="adm-btn adm-btn--sm" onClick={() => setPicking((p) => !p)}>
          {picking ? 'Close' : 'Library'}
        </button>
      </div>
      {value && (
        <img
          src={value}
          alt=""
          style={{ marginTop: '0.5rem', maxHeight: 120, borderRadius: 10, border: '1px solid var(--line)' }}
        />
      )}
      {picking && (
        <div style={{ marginTop: '0.6rem' }}>
          <MediaLibrary
            compact
            onPick={(item) => {
              onChange(item.url);
              setPicking(false);
            }}
          />
        </div>
      )}
    </>
  );
}

function ListField({ field, value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const atMax = field.max && rows.length >= field.max;

  const update = (index, key, next) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: next } : row)));
  const move = (index, delta) => {
    const next = [...rows];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <>
      {rows.map((row, index) => (
        <div className="adm-list-item" key={index}>
          <div className="adm-list-item__bar">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <button type="button" className="adm-btn adm-btn--sm" disabled={index === 0} onClick={() => move(index, -1)}>↑</button>
              <button type="button" className="adm-btn adm-btn--sm" disabled={index === rows.length - 1} onClick={() => move(index, 1)}>↓</button>
              <button
                type="button"
                className="adm-btn adm-btn--sm adm-btn--danger"
                onClick={() => onChange(rows.filter((_, i) => i !== index))}
              >
                Remove
              </button>
            </div>
          </div>
          {field.of.map((sub) => (
            <label className="adm-field" key={sub.name}>
              <span>{sub.label}</span>
              {sub.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={row[sub.name] ?? ''}
                  onChange={(e) => update(index, sub.name, e.target.value)}
                />
              ) : sub.type === 'image' ? (
                <ImageField value={row[sub.name]} onChange={(next) => update(index, sub.name, next)} />
              ) : (
                <input
                  value={row[sub.name] ?? ''}
                  placeholder={sub.placeholder}
                  onChange={(e) => update(index, sub.name, e.target.value)}
                />
              )}
            </label>
          ))}
        </div>
      ))}
      <button
        type="button"
        className="adm-btn adm-btn--sm"
        disabled={atMax}
        title={atMax ? `This block takes at most ${field.max}.` : undefined}
        onClick={() => onChange([...rows, Object.fromEntries(field.of.map((sub) => [sub.name, '']))])}
      >
        + Add {field.label.replace(/s$/, '').toLowerCase()}
      </button>
    </>
  );
}

function Field({ field, value, onChange }) {
  return (
    <label className="adm-field">
      <span>{field.label}</span>
      {field.type === 'textarea' && (
        <textarea rows={4} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === 'text' && (
        <input value={value ?? ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {field.type === 'lines' && (
        <textarea
          rows={Math.min(10, Math.max(3, (Array.isArray(value) ? value.length : 0) + 1))}
          value={Array.isArray(value) ? value.join('\n') : value || ''}
          onChange={(e) => onChange(e.target.value.split('\n').filter((line) => line.trim() !== ''))}
        />
      )}
      {field.type === 'image' && <ImageField value={value} onChange={onChange} />}
      {field.type === 'list' && <ListField field={field} value={value} onChange={onChange} />}
      {field.note && <small>{field.note}</small>}
    </label>
  );
}

/* ------------------------------------------------------------ builder ---- */

export default function PageBuilder() {
  const [pageKey, setPageKey] = useState(PAGES[0].key);
  const [sections, setSections] = useState(null);
  const [selected, setSelected] = useState(null);
  const [lang, setLang] = useState('en');
  const [customised, setCustomised] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [adding, setAdding] = useState(false);

  const page = findPage(pageKey);

  const load = useCallback((key) => {
    setSections(null);
    setSelected(null);
    setError('');
    setDone('');
    setDirty(false);
    apiFetch(`/api/sections?page=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load this page.'))))
      .then((d) => {
        const saved = (d.sections || []).map((row) => ({
          uid: `db-${row.id}`,
          type: row.type,
          visible: row.visible,
          label: row.label || '',
          data: row.data || {},
        }));
        setCustomised(Boolean(d.customised));
        setSections(saved.length ? saved : seedLayout(key));
      })
      .catch((e) => {
        setError(e.message);
        setSections(seedLayout(key));
      });
  }, []);

  useEffect(() => load(pageKey), [pageKey, load]);

  const current = useMemo(
    () => sections?.find((section) => section.uid === selected) || null,
    [sections, selected]
  );

  const mutate = (updater) => {
    setSections((prev) => updater(prev));
    setDirty(true);
    setDone('');
  };

  const move = (index, delta) =>
    mutate((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const setField = (fieldName, value) =>
    mutate((prev) =>
      prev.map((section) =>
        section.uid === selected
          ? { ...section, data: { ...section.data, [lang]: { ...(section.data[lang] || {}), [fieldName]: value } } }
          : section
      )
    );

  const save = async () => {
    setBusy(true);
    setError('');
    setDone('');
    try {
      const r = await apiFetch('/api/sections', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: pageKey,
          sections: sections.map(({ type, visible, label, data }) => ({ type, visible, label, data })),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not save this layout.');
      setCustomised(true);
      setDirty(false);
      setDone('Saved. The page is live with this layout.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Discard the saved layout and go back to the original page?')) return;
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch(`/api/sections?page=${encodeURIComponent(pageKey)}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Could not reset this page.');
      setCustomised(false);
      setSections(seedLayout(pageKey));
      setSelected(null);
      setDirty(false);
      setDone('Reset. The page renders its original layout again.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  /* What the section says, in a few words — enough to tell two card grids
     apart in the list without opening either. */
  const preview = (section) => {
    const copy = section.data?.[lang] || section.data?.en || {};
    const line = copy.head || copy.hlLine1 || copy.h2 || copy.label || '';
    return line ? String(line).slice(0, 46) : blockLabel(section.type);
  };

  const def = current && current.type !== 'builtin' ? BLOCKS[current.type] : null;
  const builtinLabel = (section) =>
    page?.layout.find((entry) => entry.key === section.data?.key)?.key || section.data?.key || 'Section';

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Pages</h1>
          <p>
            Arrange what each page is made of. Drop in a section, move it, hide it, or edit its
            words in English and Nepali.
          </p>
        </div>
        <div className="adm-actions">
          <select
            className="adm-btn"
            value={pageKey}
            onChange={(e) => {
              if (dirty && !window.confirm('Leave this page? Unsaved changes will be lost.')) return;
              setPageKey(e.target.value);
            }}
          >
            {PAGES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.name}</option>
            ))}
          </select>
          <a className="adm-btn" href={page?.path} target="_blank" rel="noreferrer">Open page ↗</a>
        </div>
      </div>

      {error && <div className="adm-msg adm-msg--err">{error}</div>}
      {done && <div className="adm-msg adm-msg--ok">{done}</div>}
      {!customised && (
        <div className="adm-msg adm-msg--note">
          This page has never been edited, so what you see below is the layout it ships with, filled
          in with the copy that is live right now. Saving takes over the page; nothing changes until
          you do.
        </div>
      )}

      {sections === null ? (
        <p className="adm-empty">Loading…</p>
      ) : (
        <div className="adm-build">
          {/* ---- the layout ---- */}
          <div>
            <div className="adm-card">
              <h2>Sections</h2>
              <p style={{ marginBottom: '0.8rem' }}>{sections.length} on this page.</p>

              <div className="adm-secs">
                {sections.map((section, index) => (
                  <div
                    className="adm-sec"
                    key={section.uid}
                    data-active={section.uid === selected}
                    data-hidden={!section.visible}
                  >
                    <div className="adm-sec__moves">
                      <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Move up">▲</button>
                      <button type="button" disabled={index === sections.length - 1} onClick={() => move(index, 1)} aria-label="Move down">▼</button>
                    </div>

                    <button
                      type="button"
                      style={{ background: 'none', border: 0, textAlign: 'left', font: 'inherit', color: 'inherit', cursor: 'pointer', padding: 0 }}
                      onClick={() => setSelected(section.uid)}
                    >
                      <span className="adm-sec__n">{String(index + 1).padStart(2, '0')}</span>{' '}
                      <span className="adm-sec__name">
                        {section.label || (section.type === 'builtin' ? builtinLabel(section) : blockLabel(section.type))}
                      </span>
                      <br />
                      <span className="adm-sec__type">
                        {section.type === 'builtin' ? 'Built into the page' : preview(section)}
                        {!section.visible && ' · hidden'}
                      </span>
                    </button>

                    <div className="adm-sec__moves">
                      <button
                        type="button"
                        onClick={() =>
                          mutate((prev) =>
                            prev.map((row) => (row.uid === section.uid ? { ...row, visible: !row.visible } : row))
                          )
                        }
                        aria-label={section.visible ? 'Hide' : 'Show'}
                        title={section.visible ? 'Hide this section' : 'Show this section'}
                      >
                        {section.visible ? '👁' : '🚫'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm('Remove this section from the page?')) return;
                          mutate((prev) => prev.filter((row) => row.uid !== section.uid));
                          if (selected === section.uid) setSelected(null);
                        }}
                        aria-label="Remove"
                        title="Remove from this page"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                type="button"
                className="adm-btn adm-btn--sm"
                style={{ marginTop: '0.8rem' }}
                onClick={() => setAdding((p) => !p)}
              >
                {adding ? 'Close' : '+ Add section'}
              </button>

              {adding && (
                <div className="adm-palette">
                  {PALETTE.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className="adm-palette__btn"
                      onClick={() => {
                        const section = { uid: uid(), type, visible: true, label: '', data: seedData(type) };
                        mutate((prev) => [...prev, section]);
                        setSelected(section.uid);
                        setAdding(false);
                      }}
                    >
                      <strong>{BLOCKS[type].label}</strong>
                      <span>{BLOCKS[type].summary}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ---- the selected section ---- */}
          <div>
            {!current && (
              <div className="adm-card">
                <h2>Nothing selected</h2>
                <p>Pick a section on the left to edit it, or add a new one.</p>
              </div>
            )}

            {current && (
              <div className="adm-card">
                <div className="adm-head" style={{ marginBottom: '1rem' }}>
                  <div>
                    <h2>{current.type === 'builtin' ? builtinLabel(current) : blockLabel(current.type)}</h2>
                    {def && <p>{def.summary}</p>}
                  </div>
                  {def && (
                    <div className="adm-langs">
                      {LANGS.map(([code, name]) => (
                        <button
                          key={code}
                          type="button"
                          aria-pressed={lang === code}
                          onClick={() => setLang(code)}
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="adm-field">
                  <span>Name in the page's side rail</span>
                  <input
                    value={current.label}
                    placeholder={current.type === 'builtin' ? builtinLabel(current) : blockLabel(current.type)}
                    onChange={(e) =>
                      mutate((prev) =>
                        prev.map((row) => (row.uid === selected ? { ...row, label: e.target.value } : row))
                      )
                    }
                  />
                  <small>Leave blank to keep the standard, translated label.</small>
                </label>

                {current.type === 'builtin' ? (
                  <div className="adm-msg adm-msg--note">
                    This panel is rendered by the page itself — a form, a grid or a map rather than a
                    slab of copy — so there are no fields to edit here. You can still move it, hide
                    it or take it off the page.
                  </div>
                ) : (
                  def?.fields.map((field) => (
                    <Field
                      key={field.name}
                      field={field}
                      value={current.data?.[lang]?.[field.name]}
                      onChange={(value) => setField(field.name, value)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {sections !== null && (
        <div className="adm-sticky">
          <p>
            {dirty ? 'Unsaved changes.' : customised ? 'Saved layout is live.' : 'Showing the original layout.'}
          </p>
          {customised && (
            <button type="button" className="adm-btn adm-btn--danger" onClick={reset} disabled={busy}>
              Reset to original
            </button>
          )}
          <button type="button" className="adm-btn adm-btn--primary" onClick={save} disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save layout'}
          </button>
        </div>
      )}
    </>
  );
}
