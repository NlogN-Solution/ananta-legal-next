import { requireAdmin } from '@/server-lib/session';
import { isOwnDocument, pdfRawUrl, pdfPageUrl } from '@/server-lib/cloudinary';
import { extractPdf } from '@/server-lib/pdf/extract';
import { blocksToHtml, firstParagraph } from '@/server-lib/pdf/blocks-to-html';
import { assertValidPdf, PdfError } from '@/server-lib/pdf/validate';

export const dynamic = 'force-dynamic';
// Extraction of a long document is CPU-bound; give it room beyond the default.
export const maxDuration = 60;

/**
 * Second half of the upload flow: the browser has already pushed the PDF to
 * Cloudinary, so we fetch the stored bytes back (server-to-server, no body
 * limit), validate them, and extract the article once.
 *
 * The result is returned to the admin UI for preview and is re-validated when
 * the post is saved — the HTML is always regenerated server-side from the
 * blocks, so nothing the browser sends is trusted as markup.
 */
export async function POST(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const { publicId, secureUrl, filename, bytes } = body || {};

  if (!isOwnDocument(publicId, secureUrl)) {
    return Response.json({ error: 'Unknown document reference.' }, { status: 400 });
  }

  const source = pdfRawUrl(publicId) || secureUrl;

  try {
    const response = await fetch(source);
    if (!response.ok) {
      // A 401 here almost always means the account still blocks PDF delivery.
      console.error('[documents:process] fetch', response.status, source);
      return Response.json(
        {
          error:
            'The uploaded document could not be read back from storage. If this keeps happening, enable “Allow delivery of PDF and ZIP files” in your Cloudinary security settings.',
        },
        { status: 502 }
      );
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    assertValidPdf(buffer, { name: filename });

    const { pageCount, blocks, text } = await extractPdf(buffer);
    const html = blocksToHtml(blocks);

    if (!blocks.length || !text.trim()) {
      return Response.json(
        {
          error:
            'No text could be read from this PDF. If it was exported as images, re-export it from Canva as a normal PDF so the article text can be indexed.',
        },
        { status: 422 }
      );
    }

    return Response.json({
      publicId,
      documentUrl: source,
      filename: filename || null,
      size: Number(bytes) || buffer.length,
      mimeType: 'application/pdf',
      pageCount,
      blocks,
      text,
      html,
      excerptSuggestion: firstParagraph(blocks),
      // Same URLs the public page will use, so the preview is faithful.
      pageImages: Array.from({ length: Math.min(pageCount, 60) }, (_, i) => ({
        page: i + 1,
        src: pdfPageUrl(publicId, i + 1, 1200),
        srcSet: [740, 1200, 1600]
          .map((w) => `${pdfPageUrl(publicId, i + 1, w)} ${w}w`)
          .join(', '),
      })),
    });
  } catch (e) {
    if (e instanceof PdfError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error('[documents:process]', e.message);
    return Response.json(
      { error: 'The document could not be processed. Please try uploading it again.' },
      { status: 500 }
    );
  }
}
