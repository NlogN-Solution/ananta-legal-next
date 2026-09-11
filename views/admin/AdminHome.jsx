'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/lib/router';
import { apiFetch } from '@/lib/api';
import { PAGES } from '@/lib/blocks/pages';

/** Overview: what exists, and the way in to each part of the dashboard. */
export default function AdminHome() {
  const [posts, setPosts] = useState(null);
  const [media, setMedia] = useState(null);

  useEffect(() => {
    let active = true;
    apiFetch('/api/posts?all=1')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => active && setPosts(Array.isArray(d) ? d : []))
      .catch(() => active && setPosts([]));
    apiFetch('/api/media')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => active && setMedia(Array.isArray(d) ? d : []))
      .catch(() => active && setMedia([]));
    return () => {
      active = false;
    };
  }, []);

  const published = posts?.filter((p) => p.published).length ?? null;
  const drafts = posts?.filter((p) => !p.published).length ?? null;
  const count = (n) => (n === null ? '—' : n);

  return (
    <>
      <div className="adm-head">
        <div>
          <h1>Dashboard</h1>
          <p>Everything that makes up the site: articles, the pages they sit on, and the files they use.</p>
        </div>
        <div className="adm-actions">
          <Link className="adm-btn adm-btn--primary" to="/admin/blog/new">Write a post</Link>
        </div>
      </div>

      <div className="adm-grid">
        <Link className="adm-tile" to="/admin/blog">
          <span className="adm-tile__n">{count(published)}</span>
          <h3>Published posts</h3>
          <p>{count(drafts)} draft{drafts === 1 ? '' : 's'} waiting.</p>
        </Link>
        <Link className="adm-tile" to="/admin/pages">
          <span className="adm-tile__n">{PAGES.length}</span>
          <h3>Pages</h3>
          <p>Rearrange, hide or add sections on any page.</p>
        </Link>
        <Link className="adm-tile" to="/admin/media">
          <span className="adm-tile__n">{count(media?.length ?? null)}</span>
          <h3>Media</h3>
          <p>Images uploaded for posts and sections.</p>
        </Link>
        <Link className="adm-tile" to="/admin/account">
          <span className="adm-tile__n">🔑</span>
          <h3>Account</h3>
          <p>Change your username or password.</p>
        </Link>
      </div>

      <div className="adm-card" style={{ marginTop: '1rem' }}>
        <h2>Recent posts</h2>
        {posts === null && <p>Loading…</p>}
        {posts?.length === 0 && <p>No posts yet — the first one starts with a Canva PDF.</p>}
        {posts?.length > 0 && (
          <div className="adm-rows">
            {posts.slice(0, 5).map((post) => (
              <div className="adm-row" key={post.id}>
                <div>
                  <h3>{post.title}</h3>
                  <div className="adm-row__meta">
                    <span className={`adm-tag ${post.published ? 'adm-tag--live' : 'adm-tag--draft'}`}>
                      {post.published ? 'Live' : 'Draft'}
                    </span>
                    <span>{post.category}</span>
                    <span>{post.read_time}</span>
                  </div>
                </div>
                <Link className="adm-btn adm-btn--sm" to={`/admin/blog/${post.slug}`}>Edit</Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
