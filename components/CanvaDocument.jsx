/**
 * A Canva post's body.
 *
 * The article arrives as a PDF, but the reader is never shown one. The words,
 * headings, lists and tables extracted from that PDF server-side are rendered
 * as ordinary semantic HTML, set in the site's own type and colours on the
 * site's own background — so the body reads as part of the page instead of a
 * white sheet of paper pasted onto it, and it stays readable in dark mode,
 * selectable, translatable and reflowable on a phone.
 *
 * Nothing here re-interprets the document: every word comes from the PDF and
 * the order is the document's own. What is deliberately dropped is the page
 * furniture — the white ground, the page margins and the page breaks — since
 * that is the part that made an article feel like an attachment.
 *
 * The rasterised pages are still generated (see `pdfPageImages`); the first
 * one is what represents the post when it is shared.
 */
export default function CanvaDocument({ html = '' }) {
  if (!String(html).trim()) return null;

  return (
    <div
      className="blog-post-body blog-post-body--doc"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
