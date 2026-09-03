'use client';

import { useState } from 'react';

/**
 * A Canva post's body: one article, expressed as two layers over the same
 * content.
 *
 * Visual layer — the design itself. Cloudinary rasterises each page of the
 * stored PDF and the pages are stacked edge to edge, so a multi-page export
 * reads as a single continuous surface: no gaps, borders, shadows, numbering
 * or any other page furniture. Nothing about the design is re-interpreted;
 * the pages are delivered as ordinary responsive images.
 *
 * Text layer — the same words, extracted from the same PDF server-side, as
 * plain semantic HTML. To a screen reader the layer above is a wall of images
 * of text, so this is its text alternative: it is *visually* hidden (clipped,
 * never `display:none`) precisely so assistive technology, reader modes and
 * crawlers can still reach it. It carries exactly what the design shows and
 * never appears as a second visible copy of the article.
 *
 * When the page images can't be delivered — no Cloudinary in development, or
 * an account with PDF delivery switched off — the text layer becomes the
 * visible article instead, so a post is never blank.
 */
export default function CanvaDocument({ pages = [], html = '' }) {
  const [failed, setFailed] = useState(() => new Set());

  const usable = pages.filter((p) => !failed.has(p.page));
  const hasVisual = usable.length > 0;

  if (!hasVisual && !html) return null;

  const markFailed = (page) =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(page);
      return next;
    });

  return (
    <>
      {hasVisual && (
        // Hidden from assistive tech because the text layer below conveys the
        // same content in a form a screen reader can actually use.
        <div className="canva-doc" aria-hidden="true">
          {usable.map((p) => (
            <img
              key={p.page}
              className="canva-doc__page"
              src={p.src}
              srcSet={p.srcSet}
              sizes="(max-width: 915px) 94vw, 860px"
              alt=""
              // The opening screens carry the article's LCP; the rest can wait
              // until the reader scrolls to them.
              loading={p.page <= 2 ? 'eager' : 'lazy'}
              fetchPriority={p.page === 1 ? 'high' : undefined}
              decoding="async"
              draggable={false}
              onError={() => markFailed(p.page)}
            />
          ))}
        </div>
      )}

      {html && (
        <div
          className={hasVisual ? 'blog-post-body canva-doc__text' : 'blog-post-body'}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </>
  );
}
