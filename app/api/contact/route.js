import { sendMail, mailEnabled, isRateLimited, MAIL_TO } from '@/server-lib/mailer';
import { escapeHtml, EMAIL_RE } from '@/server-lib/posts-util';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  if (!mailEnabled) {
    return Response.json(
      {
        error:
          'Mail is not configured. Set BREVO_API_KEY (or SMTP_HOST/SMTP_USER/SMTP_PASS) and restart.',
      },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => ({}));

  // Honeypot: real visitors never fill this hidden field; bots usually do.
  if (body?.website) return Response.json({ ok: true });

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown';
  if (isRateLimited(ip)) {
    return Response.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
  }

  const { name, email, company = '', service = '', message } = body || {};
  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return Response.json({ error: 'Name, email, and message are required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email.trim())) {
    return Response.json({ error: 'Please provide a valid email address.' }, { status: 400 });
  }

  try {
    await sendMail({
      to: MAIL_TO,
      replyTo: email.trim(),
      subject: `New enquiry — ${name.trim()}${service ? ` (${service})` : ''}`,
      text: [
        `Name: ${name.trim()}`,
        `Email: ${email.trim()}`,
        company ? `Company: ${company.trim()}` : null,
        service ? `Service: ${service.trim()}` : null,
        '',
        message.trim(),
      ]
        .filter(Boolean)
        .join('\n'),
      html: `
        <p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
        <p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
        ${company ? `<p><strong>Company:</strong> ${escapeHtml(company.trim())}</p>` : ''}
        ${service ? `<p><strong>Service:</strong> ${escapeHtml(service.trim())}</p>` : ''}
        <p><strong>Message:</strong></p>
        <p>${escapeHtml(message.trim()).replace(/\n/g, '<br>')}</p>
      `,
    });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[contact]', e.message);
    return Response.json(
      { error: 'Failed to send your message. Please try again or email us directly.' },
      { status: 502 }
    );
  }
}
