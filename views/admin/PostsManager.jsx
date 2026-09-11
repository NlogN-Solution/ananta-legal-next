'use client';

import { useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/router';
import { apiFetch } from '@/lib/api';

/**
 * The post list.
 *
 * Writing and editing is unchanged — it opens the same editor, which still
 * takes a Canva PDF, extracts it and saves it exactly as before. This screen
 * only adds what was missing: somewhere to see every post, including drafts,
 * and act on it.
 */
const fmt = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export default function PostsManager() {
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => {
    apiFetch('/api/posts?all=1')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Could not load posts.'))))
      .then((d) => setPosts(Array.isArray(d) ? d : []))
      .catch((e) => {
        setError(e.message);
        setPosts([]);
      });
  };

  useEffect(load, []);

  const shown = useMemo(() => {
    if (!posts) return [];
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (filter === 'live' && !post.published) return false;
      if (filter === 'draft' && post.published) return false;
      if (!q) return true;
      return `${post.title} ${post.category} ${post.excerpt}`.toLowerCase().includes(q);
    });
  }, [posts, filter, query]);

  const togglePublish = async (post) => {
    setBusyId(post.id);
    setError('');
    try {
      const r = await apiFetch(`/api/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ published: !post.published }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not update this post.');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (post) => {
    if (!window.confirm(`Delete “${post.title}”? This can't be undone.`)) return;
    setBusyId(post.id);
    setError('');
    try {
      const r = await apiFetch(`/api/posts/${post.id}`, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete this post.');
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Blog</h1>
          <p>Every article, published or not. Posts are written by uploading the Canva PDF — the same flow as before.</p>
        </div>
        <div className="adm-actions">
          <Link className="adm-btn adm-btn--primary" to="/admin/blog/new">Write a post</Link>
        </div>
      </div>

      {error && <div className="adm-msg adm-msg--err">{error}</div>}

      <div className="adm-card">
        <div className="adm-filters">
          <input
            className="adm-search adm-field"
            style={{ margin: 0 }}
            placeholder="Search posts…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {[['all', 'All'], ['live', 'Live'], ['draft', 'Drafts']].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`adm-btn adm-btn--sm${filter === key ? ' adm-btn--primary' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {posts === null && <p className="adm-empty">Loading posts…</p>}
        {posts?.length === 0 && <p className="adm-empty">No posts yet.</p>}
        {posts?.length > 0 && shown.length === 0 && <p className="adm-empty">Nothing matches that.</p>}

        <div className="adm-rows">
          {shown.map((post) => (
            <div className="adm-row" key={post.id}>
              <div>
                <h3>{post.title}</h3>
                <div className="adm-row__meta">
                  <span className={`adm-tag ${post.published ? 'adm-tag--live' : 'adm-tag--draft'}`}>
                    {post.published ? 'Live' : 'Draft'}
                  </span>
                  <span>{post.category}</span>
                  {post.read_time && <span>{post.read_time}</span>}
                  <span>{fmt(post.published_at || post.created_at)}</span>
                  {post.content_type === 'legacy_html' && <span className="adm-tag">Legacy</span>}
                </div>
              </div>
              <div className="adm-actions">
                <Link className="adm-btn adm-btn--sm" to={`/blog/${post.slug}`}>View</Link>
                <Link className="adm-btn adm-btn--sm" to={`/admin/blog/${post.slug}`}>Edit</Link>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm"
                  disabled={busyId === post.id}
                  onClick={() => togglePublish(post)}
                >
                  {post.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  className="adm-btn adm-btn--sm adm-btn--danger"
                  disabled={busyId === post.id}
                  onClick={() => remove(post)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
