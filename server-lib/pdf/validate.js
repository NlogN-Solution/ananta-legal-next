/**
 * Server-side PDF validation.
 *
 * The browser's reported MIME type is never trusted — a renamed .docx claims
 * application/pdf just as happily as a real one. We check the file's own magic
 * header and its size, and return plain user-facing messages (internals stay
 * in the server log).
 */
export const PDF_MAX_MB = Number(process.env.PDF_MAX_MB || 25);
export const PDF_MAX_BYTES = PDF_MAX_MB * 1024 * 1024;

export class PdfError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Every PDF begins with "%PDF-" within the first few bytes. */
export function looksLikePdf(buffer) {
  if (!buffer || buffer.length < 5) return false;
  const head = Buffer.from(buffer.subarray(0, 1024)).toString('latin1');
  return head.startsWith('%PDF-') || head.indexOf('%PDF-') > -1;
}

/**
 * Throws a PdfError with a message safe to show an administrator.
 * @param {Buffer|Uint8Array} buffer
 * @param {{ name?: string }} [file]
 */
export function assertValidPdf(buffer, file = {}) {
  if (!buffer || !buffer.length) {
    throw new PdfError('No file was received. Please choose a PDF and try again.');
  }
  if (buffer.length > PDF_MAX_BYTES) {
    throw new PdfError(`File too large — the maximum allowed size is ${PDF_MAX_MB} MB.`, 413);
  }
  if (!looksLikePdf(buffer)) {
    throw new PdfError('Invalid file — only valid PDF documents are accepted.');
  }
  if (file.name && !/\.pdf$/i.test(file.name)) {
    throw new PdfError('Invalid file — the document must have a .pdf extension.');
  }
  return true;
}
