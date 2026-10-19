import { z } from 'zod';
import { layoutHtml, layoutText, type LayoutContent } from './layout.js';
import { defineEmailTemplate, type EmailLocale } from './types.js';

const verifyEmailData = z.object({
  name: z.string().trim().min(1).max(200),
  /** The API verify endpoint with the token; valid 24 h (decisions §2). */
  url: z.url({ protocol: /^https?$/ }),
});
type VerifyEmailData = z.output<typeof verifyEmailData>;

const content: Record<EmailLocale, (data: VerifyEmailData) => LayoutContent> = {
  vi: (data) => ({
    greeting: `Xin chào ${data.name},`,
    paragraphs: [
      'Cảm ơn bạn đã đăng ký ATS. Hãy mở liên kết bên dưới để xác minh địa chỉ email và kích hoạt tài khoản.',
      'Liên kết hết hạn sau 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.',
    ],
    action: { label: 'Xác minh email', url: data.url },
  }),
  en: (data) => ({
    greeting: `Hello ${data.name},`,
    paragraphs: [
      'Thanks for signing up for ATS. Open the link below to verify your email address and activate your account.',
      "The link expires in 24 hours. If you didn't sign up, you can ignore this email.",
    ],
    action: { label: 'Verify email', url: data.url },
  }),
};

/** Sent on sign-up and on each resend; a newer email makes the older links stop working. */
export const verifyEmailTemplate = defineEmailTemplate({
  data: verifyEmailData,
  vi: {
    subject: () => 'Xác minh email của bạn trên ATS',
    html: (data) => layoutHtml('vi', content.vi(data)),
    text: (data) => layoutText('vi', content.vi(data)),
  },
  en: {
    subject: () => 'Verify your email for ATS',
    html: (data) => layoutHtml('en', content.en(data)),
    text: (data) => layoutText('en', content.en(data)),
  },
});
