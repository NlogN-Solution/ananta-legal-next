import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { requireAdmin } from '@/server-lib/session';
import { useCloudinary } from '@/server-lib/cloudinary';
import { extractPdf } from '@/server-lib/pdf/extract';
import { blocksToHtml, firstParagraph } from '@/server-lib/pdf/blocks-to-html';
import { assertValidPdf, PdfError } from '@/server-lib/pdf/validate';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Local-development upload path: accepts the PDF directly as multipart and
 * stores it under public/uploads/.
 *
 * Production uses the signed direct-to-Cloudinary flow instead
 * (/api/documents/sign + /api/documents/process), because Vercel's ~4.5 MB
 * request-body cap and read-only filesystem rule this route out there.
 */
export async function POST(request) {
  const unauthorized = await requireAdmin();
  if (unauthorized) return unauthorized;

  if (useCloudinary) {
    return Response.json(
      { error: 'Use the signed upload flow when Cloudinary is configured.' },
      { status: 400 }
    );
  }

  let form;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: 'No file was received.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ error: 'No file was received.' }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    assertValidPdf(buffer, { name: file.name });

    const { pageCount, blocks, text } = await extractPdf(buffer);
    if (!blocks.length || !text.trim()) {
      return Response.json(
        {
          error:
            'No text could be read from this PDF. If it was exported as images, re-export it from Canva as a normal PDF so the article text can be indexed.',
        },
        { status: 422 }
      );
    }

    const name = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`;
    const dir = path.join(process.cwd(), 'public', 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), buffer);

    return Response.json({
      publicId: null,
      documentUrl: `/uploads/${name}`,
      filename: file.name || name,
      size: buffer.length,
      mimeType: 'application/pdf',
      pageCount,
      blocks,
      text,
      html: blocksToHtml(blocks),
      excerptSuggestion: firstParagraph(blocks),
      // Without Cloudinary there is nothing to rasterise the pages, so the
      // post falls back to rendering its extracted text as the visible article.
      pageImages: [],
    });
  } catch (e) {
    if (e instanceof PdfError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error('[documents:upload]', e.message);
    return Response.json(
      { error: 'The document could not be processed. Please try uploading it again.' },
      { status: 500 }
    );
  }
}
