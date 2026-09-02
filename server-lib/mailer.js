import nodemailer from 'nodemailer';

/**
 * Enquiry-form email. Prefers Brevo's HTTPS API (port 443) when BREVO_API_KEY
 * is set — some hosts block raw SMTP ports — and falls back to plain SMTP when
 * SMTP_HOST/SMTP_USER/SMTP_PASS are provided. With neither, /api/contact
 * returns 503. Logic copied from the old server/index.js.
 */
export const MAIL_TO = process.env.MAIL_TO || 'anantalegal9@gmail.com';
export const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || MAIL_TO;

const BREVO_API_KEY = process.env.BREVO_API_KEY || '';

let mailer = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
  mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
}

export const mailEnabled = Boolean(BREVO_API_KEY || mailer);

export async function sendMail({ to, replyTo, subject, text, html }) {
  if (BREVO_API_KEY) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Ananta Legal Website', email: MAIL_FROM },
        to: [{ email: to }],
        replyTo: { email: replyTo },
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Brevo API ${res.status}: ${body}`);
    }
    return;
  }
  await mailer.sendMail({
    from: `"Ananta Legal Website" <${MAIL_FROM}>`,
    to,
    replyTo,
    subject,
    text,
    html,
  });
}

/* Tiny in-memory rate limit: max 5 submissions per 10 minutes per IP.
   Per warm container on serverless (was per-process on the old server). */
const contactHits = new Map();
export function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 10 * 60 * 1000;
  const hits = (contactHits.get(ip) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  contactHits.set(ip, hits);
  return hits.length > 5;
}
