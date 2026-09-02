'use client';

import { useState } from 'react';

/**
 * The Canva-designed document, page by page.
 *
 * The page images are produced by Cloudinary from the stored PDF, so nothing
 * PDF-related ships to the browser — they're ordinary responsive <img>s that
 * lazy-load as the reader scrolls. The article text above this section is the
 * accessible, crawlable version of the same content; this is the visual
 * companion, which is why the whole block is hidden from assistive tech only
 * when it fails to load, never by default.
 */
export default function CanvaDocument({ pages = [], fileUrl, title, pageCount }) {
  const [failed, setFailed] = useState(() => new Set());

  const total = pageCount || pages.length;
  const usable = pages.filter((p) => !failed.has(p.page));

  if (!pages.length && !fileUrl) return null;

  const markFailed = (page) =>
    setFailed((prev) => {
      const next = new Set(prev);
      next.add(page);
      return next;
    });

  return (
    <section className="canva-doc" aria-labelledby="canva-doc-heading">
      <div className="canva-doc__head">
        <h2 id="canva-doc-heading">The designed document</h2>
        <p>
          {total ? `${total} page${total === 1 ? '' : 's'}. ` : ''}
          The full article is written out above — this is the same document as it was designed.
        </p>
      </div>

      {usable.length > 0 && (
        <ol className="canva-doc__pages">
          {usable.map((p) => (
            <li key={p.page}>
              <img
                src={p.src}
                srcSet={p.srcSet}
                sizes="(max-width: 820px) 92vw, 740px"
                alt={`${title} — page ${p.page} of ${total}`}
                loading="lazy"
                decoding="async"
                onError={() => markFailed(p.page)}
              />
            </li>
          ))}
        </ol>
      )}

      {fileUrl && (
        <a
          className="canva-doc__download"
          href={fileUrl}
          target="_blank"
          rel="noopener nofollow"
        >
          Open the original PDF <span className="arr">↗</span>
        </a>
      )}
    </section>
  );
}
