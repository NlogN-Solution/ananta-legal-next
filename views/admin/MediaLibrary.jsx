'use client';

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

/**
 * The media library: every image uploaded through the dashboard, in one place,
 * with its URL a click away so it can be pasted into a section or a cover.
 *
 * Storage is the same as it always was (Cloudinary, or public/uploads in
 * development) — this only keeps a catalogue of what went where.
 */

const size = (bytes) => {
  if (!bytes) return '';
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.round(kb)} KB`;
};

export default function MediaLibrary({ onPick, compact = false }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [copied, setCopied] = useState(null);
  const inputRef = useRef(null);

  const load = () => {
    apiFetch('/api/media')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load the library.'))))
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e) => {
        setError(e.message);
        setItems([]);
      });
  };

  useEffect(load, []);

  const upload = async (files) => {
    const list = Array.from(files || []).filter((f) => f.type.startsWith('image/'));
    if (!list.length) return;
    setBusy(true);
    setError('');
    try {
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        const r = await apiFetch('/api/media', { method: 'POST', body: form });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || `${file.name} could not be uploaded.`);
      }
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const remove = async (item) => {
    if (!window.confirm('Delete this file? Anything still using it will lose the image.')) return;
    setError('');
    try {
      const r = await apiFetch(`/api/media/${item.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete this file.');
      setItems((prev) => prev.filter((row) => row.id !== item.id));
    } catch (e) {
      setError(e.message);
    }
  };

  const copy = async (item) => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(item.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError('Your browser blocked the clipboard — the URL is on the image itself.');
    }
  };

  return (
    <>
      {!compact && (
        <div className="adm-head">
          <div>
            <h1>Media</h1>
            <p>Images available to posts and page sections. Drop files here to add them.</p>
          </div>
        </div>
      )}

      {error && <div className="adm-msg adm-msg--err">{error}</div>}

      <div
        className="adm-drop"
        data-over={over}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          id="adm-media-input"
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => upload(e.target.files)}
        />
        <label htmlFor="adm-media-input">
          {busy ? 'Uploading…' : 'Choose images'}
        </label>
        <div style={{ fontSize: '0.85rem', marginTop: '0.3rem' }}>
          or drag them here · PNG, JPG, WebP, GIF or SVG up to 8 MB
        </div>
      </div>

      {items === null && <p className="adm-empty">Loading…</p>}
      {items?.length === 0 && <p className="adm-empty">Nothing uploaded yet.</p>}

      {items?.length > 0 && (
        <div className="adm-media">
          {items.map((item) => (
            <figure key={item.id}>
              <img src={item.url} alt={item.alt || item.filename || ''} loading="lazy" />
              <figcaption>
                <span className="adm-media__name" title={item.filename || item.url}>
                  {item.filename || item.url}
                </span>
                <span>
                  {[item.width && `${item.width}×${item.height}`, size(item.bytes)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="adm-media__acts">
                  {onPick ? (
                    <button type="button" className="adm-btn adm-btn--sm" onClick={() => onPick(item)}>
                      Use
                    </button>
                  ) : null}
                  <button type="button" className="adm-btn adm-btn--sm" onClick={() => copy(item)}>
                    {copied === item.id ? 'Copied' : 'Copy URL'}
                  </button>
                  <button
                    type="button"
                    className="adm-btn adm-btn--sm adm-btn--danger"
                    onClick={() => remove(item)}
                  >
                    Delete
                  </button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </>
  );
}
