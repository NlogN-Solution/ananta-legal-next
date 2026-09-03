'use client';

import React from 'react';
import { Link } from '@/lib/router';
import CTA from '../components/CTA';
import DeckLayout from '../components/DeckLayout';
import CanvaDocument from '../components/CanvaDocument';
import useAuth from '../hooks/useAuth';
import { useLang } from '../i18n/LanguageContext';

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Public article body. The post now arrives as a prop from the server
 * component that renders this page, so the article HTML is present in the
 * server response for search engines instead of being fetched after hydration.
 *
 * `preview` renders the same markup for the admin's pre-publish preview, so
 * what they approve is what visitors get.
 */
export default function BlogPostView({ post, documentPages = [], preview = false }) {
  const { t } = useLang();
  const bp = t.blogPost;
  const authenticated = useAuth();

  const isCanva = post.content_type === 'canva_pdf';

  const Title = (
    <section className="page-header blog-post-title">
      <div className="wrap">
        <div className="sec-label mono">
          <Link to="/blog" style={{ color: 'var(--olive)' }}>{bp.breadcrumb}</Link> / {bp.crumbTail}
        </div>
        <header className="blog-post-header">
          <span className="blog-cat-tag">{post.category}</span>
          <h1>{post.title}</h1>
          <div className="blog-post-meta">
            <span>{bp.publishedOn} {fmtDate(post.published_at || post.created_at)}</span>
            <span>•</span>
            <span>{post.read_time}</span>
            {post.published === false && (
              <>
                <span>•</span>
                <span className="blog-draft-tag">Draft</span>
              </>
            )}
            {authenticated && !preview && (
              <>
                <span>•</span>
                <Link to={`/blog/edit/${post.slug}`} style={{ color: 'var(--olive)' }}>Edit</Link>
              </>
            )}
          </div>
        </header>
      </div>
    </section>
  );

  /* Two shapes of post share this one <article>:
     - canva_pdf: the uploaded design is the article the visitor reads, with
       the extracted text riding along as its accessible/crawlable equivalent.
       The cover image is the blog card's thumbnail, not part of the document,
       so it isn't repeated above the design.
     - legacy_html: the old editor's own HTML, rendered exactly as before. */
  const Body = (
    <section className={`blog-post${isCanva ? ' blog-post--doc' : ''}`}>
      <div className="wrap">
        {!isCanva && post.cover_image && (
          <img className="blog-post-cover" src={post.cover_image} alt="" />
        )}
        <article className="blog-post-article">
          {isCanva ? (
            <CanvaDocument pages={documentPages} html={post.content || ''} />
          ) : (
            <div
              className="blog-post-body"
              dangerouslySetInnerHTML={{ __html: post.content || '' }}
            />
          )}
        </article>
      </div>
    </section>
  );

  const PAGES = [
    { id: 'bp-title', label: bp.labels.title, node: Title },
    { id: 'bp-body', label: bp.labels.body, node: Body },
    { id: 'bp-cta', label: t.deck.labels.contact, node: <CTA /> },
  ];

  // In the admin preview the stack is mounted mid-page, so the scroll-triggered
  // reveal would leave every panel invisible — show them straight away instead.
  return <DeckLayout pages={PAGES} reveal={!preview} />;
}
