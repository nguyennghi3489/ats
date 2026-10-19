import { html } from './html.js';
import type { EmailLocale } from './types.js';

/** The body of a layout-based email. Every string is plain text; the layout escapes it. */
export interface LayoutContent {
  greeting: string;
  paragraphs: readonly string[];
  /** The one button. Its link is repeated as text below it for clients that hide buttons. */
  action: { label: string; url: string };
}

const LAYOUT_COPY: Record<EmailLocale, { linkHint: string; footer: string }> = {
  vi: {
    linkHint: 'Nếu nút không hoạt động, hãy sao chép liên kết này vào trình duyệt:',
    footer: 'Email này được gửi tự động từ ATS. Vui lòng không trả lời email này.',
  },
  en: {
    linkHint: "If the button doesn't work, copy this link into your browser:",
    footer: 'This email was sent automatically by ATS. Please do not reply to it.',
  },
};

/** Only web links go into a button; anything else (javascript:, data:) is a bug upstream. */
function assertWebLink(url: string): void {
  let protocol: string;
  try {
    protocol = new URL(url).protocol;
  } catch {
    throw new Error('EMAIL_UNSAFE_LINK');
  }
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error('EMAIL_UNSAFE_LINK');
}

/**
 * Shared HTML frame: workspace-neutral "ATS" header, greeting and paragraphs, one button, the
 * link repeated as text, footer. Inline styles and tables only, as email clients expect.
 */
export function layoutHtml(locale: EmailLocale, content: LayoutContent): string {
  assertWebLink(content.action.url);
  const copy = LAYOUT_COPY[locale];
  const { label, url } = content.action;
  return html`<!doctype html>
    <html lang="${locale}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body
        style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;"
      >
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          style="background:#f4f4f5;"
        >
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                style="max-width:560px;background:#ffffff;border-radius:8px;"
              >
                <tr>
                  <td
                    style="padding:24px 32px;border-bottom:1px solid #e4e4e7;font-size:20px;font-weight:bold;"
                  >
                    ATS
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px;font-size:15px;line-height:1.6;">
                    <p style="margin:0 0 16px;">${content.greeting}</p>
                    ${content.paragraphs.map((paragraph) => html`<p style="margin:0 0 16px;">${paragraph}</p> `)}
                    <p style="margin:24px 0;">
                      <a
                        href="${url}"
                        style="display:inline-block;padding:12px 24px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;"
                        >${label}</a
                      >
                    </p>
                    <p style="margin:0 0 8px;font-size:13px;color:#52525b;">${copy.linkHint}</p>
                    <p style="margin:0;font-size:13px;word-break:break-all;">
                      <a href="${url}" style="color:#2563eb;">${url}</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td
                    style="padding:16px 32px;border-top:1px solid #e4e4e7;font-size:12px;color:#71717a;"
                  >
                    ${copy.footer}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html> `.toString();
}

/** Plain-text twin of `layoutHtml`, for clients that do not show HTML. */
export function layoutText(locale: EmailLocale, content: LayoutContent): string {
  assertWebLink(content.action.url);
  const copy = LAYOUT_COPY[locale];
  return [
    'ATS',
    '',
    content.greeting,
    '',
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    `${content.action.label}: ${content.action.url}`,
    '',
    '--',
    copy.footer,
    '',
  ].join('\n');
}
