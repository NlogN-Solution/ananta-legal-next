'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from '@/lib/router';
import { apiUrl } from '../lib/api';
import BlogPostView from './BlogPostView';

/**
 * Blog admin.
 *
 * New articles are designed in Canva, exported as PDF and uploaded here; the
 * server extracts the text into semantic HTML for search engines while the
 * stored PDF supplies the page images readers see. There is deliberately no
 * rich-text editor — Canva owns the visual design, this form owns metadata.
 *
 * Posts written with the old editor are still editable, but only their
 * metadata: their original HTML body is never sent back and so can never be
 * overwritten from here.
 */

const CATEGORIES = [
  'Company Formation',
  'Fundraising',
  'Intellectual Property',
  'Contracts',
  'Compliance',
  'Guide',
];

// Send the session cookie with API calls (works same-origin and cross-origin).
const api = (url, opts = {}) => fetch(apiUrl(url), { credentials: 'include', ...opts });

const STEPS = [
  ['uploading', 'Uploading document'],
  ['processing', 'Reading the PDF'],
  ['extracting', 'Extracting content'],
  ['ready', 'Preview ready'],
];
const STEP_ORDER = STEPS.map(([key]) => key);

/* An in-progress new post is kept in sessionStorage so that closing the tab or
   navigating away doesn't throw away a PDF that took real time to upload and
   extract. Only the "create" flow is cached — restoring a stale draft over a
   post that already exists in the database would be worse than losing it. */
const DRAFT_KEY = 'ananta:new-post-draft';

function readDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(value) {
  try {
    if (value) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* private mode or quota — the editor still works, just without recovery */
  }
}

/* --------------------------------------------------------------- login ---- */
function LoginGate({ onAuthed }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login failed.');
      onAuthed();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="editor-page">
      <div className="wrap editor-login">
        <img className="editor-login__mark" src="/logo.png" alt="" width="48" height="48" />
        <h1>Admin sign in</h1>
        <p>Sign in to write and edit blog posts.</p>
        {error && <div className="editor-error">{error}</div>}
        <form onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'} <span className="arr">↗</span>
          </button>
        </form>
        <Link to="/blog" className="editor-back" style={{ marginTop: '1.5rem', display: 'inline-block' }}>
          ← Back to blog
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------ document uploader -- */
function DocumentPanel({ doc, status, error, onPick, onRetry, disabled }) {
  const inputRef = useRef(null);
  const activeIndex = STEP_ORDER.indexOf(status);
  const busy = status && status !== 'ready' && status !== 'failed';

  return (
    <div className="editor-doc">
      <div className="editor-doc__head">
        <div>
          <strong>Canva PDF</strong>
          <p>Design the article in Canva, export it as a PDF, then upload it here.</p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          {doc ? 'Replace PDF' : 'Upload PDF'} <span className="arr">↗</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onPick(file);
          }}
        />
      </div>

      {(status || doc) && (
        <ol className="editor-steps">
          {STEPS.map(([key, label], i) => {
            const state =
              status === 'failed' && i === Math.max(activeIndex, 0)
                ? 'failed'
                : activeIndex > i || status === 'ready'
                  ? 'done'
                  : activeIndex === i
                    ? 'active'
                    : 'idle';
            return (
              <li key={key} className={`editor-step is-${state}`}>
                <span className="editor-step__dot" aria-hidden="true" />
                {label}
              </li>
            );
          })}
        </ol>
      )}

      {status === 'failed' && (
        <div className="editor-error">
          {error || 'The document could not be processed.'}
          <button type="button" className="editor-retry" onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {doc && status === 'ready' && (
        <p className="editor-doc__meta">
          <strong>{doc.filename || 'document.pdf'}</strong> — {doc.pageCount} page
          {doc.pageCount === 1 ? '' : 's'}
          {doc.size ? `, ${(doc.size / 1024 / 1024).toFixed(1)} MB` : ''}. Extracted{' '}
          {doc.text ? doc.text.split(/\s+/).filter(Boolean).length.toLocaleString() : 0} words of
          searchable text.
          {doc.pageImages?.length === 0 && (
            <>
              {' '}
              <span className="editor-warn">
                The designed pages can’t be rendered for this document, so the post will show
                the extracted text instead of the Canva layout.
              </span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- editor ---- */
export default function BlogEditorPage() {
  const { slug } = useParams(); // present when editing
  const navigate = useNavigate();

  const [authed, setAuthed] = useState(null); // null = checking
  const [loading, setLoading] = useState(Boolean(slug));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const editorScroll = useRef(0);

  const [post, setPost] = useState({
    id: null,
    slug: null,
    title: '',
    category: CATEGORIES[0],
    excerpt: '',
    cover_image: '',
    seo_title: '',
    seo_description: '',
    content_type: 'canva_pdf',
    content: '',
    published: false,
    created_at: null,
    read_time: '',
  });

  // Processed document: null until a PDF has been uploaded and extracted.
  const [doc, setDoc] = useState(null);
  const [docStatus, setDocStatus] = useState(null);
  const [docError, setDocError] = useState('');
  const lastFile = useRef(null);

  const isLegacy = post.content_type === 'legacy_html';

  /* --- session ---------------------------------------------------------- */
  useEffect(() => {
    let active = true;
    api('/api/me')
      .then((r) => r.json())
      .then((d) => active && setAuthed(Boolean(d.authenticated)))
      .catch(() => active && setAuthed(false));
    return () => {
      active = false;
    };
  }, []);

  /* --- load the post when editing --------------------------------------- */
  useEffect(() => {
    if (!slug || !authed) return;
    let active = true;
    api(`/api/posts/${slug}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('not found'))))
      .then((d) => {
        if (!active) return;
        setPost({
          id: d.id,
          slug: d.slug,
          title: d.title || '',
          category: d.category || CATEGORIES[0],
          excerpt: d.excerpt || '',
          cover_image: d.cover_image || '',
          seo_title: d.seo_title || '',
          seo_description: d.seo_description || '',
          content_type: d.content_type || 'legacy_html',
          content: d.content || '',
          published: Boolean(d.published),
          created_at: d.created_at,
          published_at: d.published_at,
          read_time: d.read_time || '',
        });
        if (d.content_type === 'canva_pdf' && d.structured_content) {
          setDoc({
            publicId: d.document_public_id,
            documentUrl: d.document_url,
            filename: d.document_filename,
            size: d.document_size,
            pageCount: d.document_page_count,
            blocks: d.structured_content,
            text: d.extracted_text || '',
            html: d.content || '',
            // Derived server-side from the stored document, so the preview
            // shows the same pages the public page renders.
            pageImages: d.page_images || [],
          });
          setDocStatus('ready');
        }
      })
      .catch(() => active && setError('Could not load this post.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug, authed]);

  const set = (k, v) => setPost((p) => ({ ...p, [k]: v }));

  /* --- preview -----------------------------------------------------------
     Preview swaps the whole screen for the rendered post, so it also takes
     over the browser's Back button: without this, Back would leave the editor
     entirely and throw away an upload that took real time to process. */
  const openPreview = useCallback(() => {
    editorScroll.current = window.scrollY;
    setPreviewing(true);
    // Top of the article, not wherever the form happened to be scrolled to.
    window.scrollTo(0, 0);
    try {
      window.history.pushState({ anantaPreview: true }, '', window.location.href);
    } catch {
      /* history is unavailable — the on-screen button still exits */
    }
  }, []);

  const closePreview = useCallback(() => {
    setPreviewing(false);
    if (window.history.state?.anantaPreview) {
      window.history.back(); // consume the entry we pushed
    }
    // Put the admin back where they were in the form.
    requestAnimationFrame(() => window.scrollTo(0, editorScroll.current));
  }, []);

  useEffect(() => {
    const onPopState = () => setPreviewing(false);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  /* --- crash/navigation recovery for the create flow --------------------- */
  const restored = useRef(false);
  useEffect(() => {
    if (slug || restored.current) return;
    restored.current = true;
    const saved = readDraft();
    if (!saved) return;
    if (saved.post) setPost((p) => ({ ...p, ...saved.post }));
    if (saved.doc) {
      setDoc(saved.doc);
      setDocStatus('ready');
    }
  }, [slug]);

  useEffect(() => {
    if (slug || !restored.current) return;
    const hasWork = post.title.trim() || post.excerpt.trim() || doc;
    writeDraft(hasWork ? { post, doc } : null);
  }, [slug, post, doc]);

  const logout = async () => {
    await api('/api/logout', { method: 'POST' });
    setAuthed(false);
  };

  /* --- cover image ------------------------------------------------------ */
  const uploadCover = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r = await api('/api/upload', { method: 'POST', body: fd });
      if (!r.ok) throw new Error();
      const d = await r.json();
      set('cover_image', d.location);
    } catch {
      setError('Cover image upload failed.');
    }
  };

  /* --- PDF upload + processing ------------------------------------------ */
  const processDocument = useCallback(async (file) => {
    lastFile.current = file;
    setDocError('');
    setError('');
    setDocStatus('uploading');

    try {
      // Ask for a signature. Vercel caps request bodies well below a typical
      // Canva export, so the file goes straight to Cloudinary from here.
      const signRes = await api('/api/documents/sign', { method: 'POST' });
      const signed = await signRes.json().catch(() => ({}));

      let payload;
      if (signRes.ok && signed.signature) {
        const form = new FormData();
        form.append('file', file);
        form.append('api_key', signed.apiKey);
        form.append('timestamp', signed.timestamp);
        form.append('folder', signed.folder);
        form.append('signature', signed.signature);

        const upload = await fetch(signed.uploadUrl, { method: 'POST', body: form });
        const stored = await upload.json().catch(() => ({}));
        if (!upload.ok || !stored.public_id) {
          throw new Error(
            stored?.error?.message ||
              'The document could not be uploaded. Please check your connection and try again.'
          );
        }

        setDocStatus('processing');
        const res = await api('/api/documents/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicId: stored.public_id,
            secureUrl: stored.secure_url,
            filename: file.name,
            bytes: stored.bytes,
          }),
        });
        payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The document could not be processed.');
      } else if (signed.direct) {
        // Local development without Cloudinary configured.
        setDocStatus('processing');
        const form = new FormData();
        form.append('file', file);
        const res = await api('/api/documents', { method: 'POST', body: form });
        payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'The document could not be processed.');
      } else {
        throw new Error(signed.error || 'Document uploads are not configured.');
      }

      setDocStatus('extracting');
      setDoc(payload);
      setPost((p) => ({
        ...p,
        content_type: 'canva_pdf',
        content: payload.html || '',
        excerpt: p.excerpt || payload.excerptSuggestion || '',
      }));
      setDocStatus('ready');
    } catch (e) {
      setDocError(e.message || 'The document could not be processed.');
      setDocStatus('failed');
    }
  }, []);

  /* --- save ------------------------------------------------------------- */
  const save = async ({ publish }) => {
    setError('');
    if (!post.title.trim()) {
      setError('Please add a title.');
      return;
    }
    if (!isLegacy && publish && (!doc || docStatus !== 'ready')) {
      setError('Upload and process a Canva PDF before publishing.');
      return;
    }

    setSaving(true);
    const payload = {
      title: post.title.trim(),
      category: post.category,
      excerpt: post.excerpt.trim(),
      cover_image: post.cover_image || null,
      seo_title: post.seo_title.trim() || null,
      seo_description: post.seo_description.trim() || null,
      published: publish,
    };

    // A legacy post sends no body fields at all, so its original editor HTML
    // stays exactly as it was.
    if (!isLegacy && doc) {
      Object.assign(payload, {
        content_type: 'canva_pdf',
        structured_content: doc.blocks,
        extracted_text: doc.text,
        document_url: doc.documentUrl,
        document_public_id: doc.publicId,
        document_filename: doc.filename,
        document_size: doc.size,
        document_mime_type: doc.mimeType || 'application/pdf',
        document_page_count: doc.pageCount,
      });
    }

    try {
      const url = post.id ? `/api/posts/${post.id}` : '/api/posts';
      const r = await api(url, {
        method: post.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed.');
      writeDraft(null); // the post now lives in the database
      navigate(publish ? `/blog/${data.slug}` : `/blog/edit/${data.slug}`);
    } catch (e) {
      setError(e.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!post.id) return;
    if (!window.confirm(`Delete "${post.title || 'this post'}"? This can't be undone.`)) return;
    setError('');
    setDeleting(true);
    try {
      const r = await api(`/api/posts/${post.id}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Delete failed.');
      navigate('/blog');
    } catch (e) {
      setError(e.message || 'Delete failed.');
      setDeleting(false);
    }
  };

  /* --- gates ------------------------------------------------------------ */
  if (authed === null) {
    return (
      <div className="editor-page">
        <div className="wrap editor-shell">
          <p className="editor-status">Checking your session…</p>
        </div>
      </div>
    );
  }
  if (!authed) return <LoginGate onAuthed={() => setAuthed(true)} />;
  if (loading) {
    return (
      <div className="editor-page">
        <div className="wrap editor-shell">
          <p className="editor-status">Loading…</p>
        </div>
      </div>
    );
  }

  /* --- preview ---------------------------------------------------------- */
  if (previewing) {
    const draft = {
      ...post,
      title: post.title || 'Untitled post',
      content: doc?.html || post.content || '',
      document_page_count: doc?.pageCount || post.document_page_count || null,
      created_at: post.created_at || new Date().toISOString(),
      published_at: post.published_at || null,
      read_time: post.read_time || '',
    };
    return (
      <>
        <div className="editor-previewbar">
          <span>Preview — this is how the post will look. Nothing has been saved yet.</span>
          <button type="button" className="btn btn-primary" onClick={closePreview}>
            ← Back to editing
          </button>
        </div>
        <div className="editor-previewbody">
          <BlogPostView post={draft} documentPages={doc?.pageImages || []} preview />
        </div>
      </>
    );
  }

  const canPublish = isLegacy || (doc && docStatus === 'ready');

  return (
    <div className="editor-page">
      <div className="wrap editor-shell">
        <div className="editor-bar">
          <Link to="/blog" className="editor-back">← Back to blog</Link>
          <h1>{post.id ? 'Edit post' : 'Create blog'}</h1>
          <button className="editor-back" onClick={logout} type="button">Log out</button>
          {post.id && (
            <button
              className="editor-delete"
              onClick={remove}
              disabled={deleting || saving}
              type="button"
            >
              {deleting ? 'Deleting…' : 'Delete post'}
            </button>
          )}
        </div>

        {error && <div className="editor-error">{error}</div>}

        {isLegacy && (
          <div className="editor-notice">
            <strong>This is an older post.</strong> Its article body was written in the previous
            editor and is preserved exactly as published — you can update the details below, and
            the body will not be changed. To rewrite the article, publish it again from a Canva PDF.
          </div>
        )}

        <label className="editor-field">
          <span>Title</span>
          <input
            className="editor-title"
            placeholder="Post title"
            value={post.title}
            onChange={(e) => set('title', e.target.value)}
          />
        </label>

        <label className="editor-field">
          <span>Excerpt</span>
          <textarea
            className="editor-excerpt"
            placeholder="Short excerpt (shown on the blog list and used as the meta description)…"
            rows={2}
            value={post.excerpt}
            onChange={(e) => set('excerpt', e.target.value)}
          />
          {doc?.excerptSuggestion && doc.excerptSuggestion !== post.excerpt && (
            <button
              type="button"
              className="editor-suggest"
              onClick={() => set('excerpt', doc.excerptSuggestion)}
            >
              Use the document’s opening paragraph
            </button>
          )}
        </label>

        <div className="editor-meta">
          <label>
            Category
            <select value={post.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <label className="editor-cover">
            Cover photo
            <input type="file" accept="image/*" onChange={uploadCover} />
          </label>

          {post.cover_image && (
            <img className="editor-cover-preview" src={post.cover_image} alt="cover preview" />
          )}
        </div>

        {!isLegacy && (
          <DocumentPanel
            doc={doc}
            status={docStatus}
            error={docError}
            onPick={processDocument}
            onRetry={() => lastFile.current && processDocument(lastFile.current)}
            disabled={saving || deleting}
          />
        )}

        <div className="editor-seo">
          <h2>Search engine listing</h2>
          <p>Optional. Leave blank to use the title and excerpt above.</p>
          <label className="editor-field">
            <span>SEO title</span>
            <input
              value={post.seo_title}
              placeholder={post.title || 'Post title'}
              onChange={(e) => set('seo_title', e.target.value)}
              maxLength={70}
            />
          </label>
          <label className="editor-field">
            <span>SEO description</span>
            <textarea
              rows={2}
              value={post.seo_description}
              placeholder={post.excerpt || 'Short description shown in search results'}
              onChange={(e) => set('seo_description', e.target.value)}
              maxLength={200}
            />
          </label>
        </div>

        <div className="editor-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => save({ publish: false })}
            disabled={saving || deleting}
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={openPreview}
            disabled={saving || deleting}
          >
            Preview
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => save({ publish: true })}
            disabled={saving || deleting || !canPublish}
            title={canPublish ? undefined : 'Upload and process a Canva PDF first'}
          >
            {saving ? 'Saving…' : post.published ? 'Update' : 'Publish'}{' '}
            <span className="arr">↗</span>
          </button>
        </div>

        <p className="editor-hint">
          Posts are saved to your PostgreSQL database; the Canva PDF and cover image upload to
          Cloudinary (or local disk in development).
        </p>
      </div>
    </div>
  );
}
