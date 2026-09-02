'use client';

import React from 'react';
import { Link } from '@/lib/router';
import CTA from '../components/CTA';
import DeckLayout from '../components/DeckLayout';
import useAuth from '../hooks/useAuth';
import { useLang } from '../i18n/LanguageContext';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function PostCard({ post }) {
  return (
    <article className="blog-card">
      <div className="blog-thumb">
        {post.cover_image ? (
          <img
            src={post.cover_image}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: '100%', height: '100%',
              background: 'linear-gradient(135deg, var(--olive-2), var(--surface))',
              display: 'grid', placeItems: 'center',
              fontFamily: 'var(--font-display)', fontSize: '2.5rem', fontWeight: 700,
              color: 'var(--bg)', opacity: 0.85,
            }}
          >
            §
          </div>
        )}
        <span className="blog-cat">{post.category}</span>
      </div>
      <div className="blog-body">
        <div className="blog-meta">
          <span>{fmtDate(post.published_at || post.created_at)}</span>
          <span className="blog-dot"></span>
          <span>{post.read_time}</span>
          {post.published === false && <span className="blog-draft-tag">Draft</span>}
        </div>
        <h3>
          <Link to={`/blog/${post.slug}`}>{post.title}</Link>
        </h3>
        <p className="blog-excerpt">{post.excerpt}</p>
        <Link to={`/blog/${post.slug}`} className="blog-read">
          Read article <span className="arr">→</span>
        </Link>
      </div>
    </article>
  );
}

/**
 * Blog index. Posts are supplied by the server component that renders this,
 * so the cards (and the links search engines follow) are in the initial HTML.
 */
export default function BlogListView({ posts = [] }) {
  const { t } = useLang();
  const b = t.blog;
  const authenticated = useAuth();

  const Intro = (
    <section className="page-header">
      <div className="wrap">
        <div className="sec-label mono">{b.label}</div>
        <h1>{b.h1}<span style={{ color: 'var(--lime)' }}>.</span></h1>
        <p className="sub">{b.sub}</p>
        {authenticated && (
          <Link to="/blog/new" className="btn btn-ghost" style={{ marginTop: '1.6rem' }}>
            {b.write || 'Write a post'} <span className="arr">↗</span>
          </Link>
        )}
      </div>
    </section>
  );

  const Grid = (
    <section className="blog-grid-section">
      <div className="wrap">
        {posts.length === 0 ? (
          <div className="blog-empty">
            <p>No posts published yet.</p>
            {authenticated && (
              <Link to="/blog/new" className="btn btn-primary" style={{ marginTop: '1rem' }}>
                {b.write || 'Write a post'} <span className="arr">↗</span>
              </Link>
            )}
          </div>
        ) : (
          <div className="blog-grid">
            {posts.map((post) => (
              <PostCard post={post} key={post.id} />
            ))}
          </div>
        )}
      </div>
    </section>
  );

  const PAGES = [
    { id: 'blog-intro', label: b.labels.intro, node: Intro },
    { id: 'blog-grid', label: b.labels.grid, node: Grid },
    { id: 'blog-cta', label: t.deck.labels.contact, node: <CTA /> },
  ];

  return <DeckLayout pages={PAGES} />;
}
