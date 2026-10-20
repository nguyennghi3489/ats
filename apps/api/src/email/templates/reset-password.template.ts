import { z } from 'zod';
import { layoutHtml, layoutText, type LayoutContent } from './layout.js';
import { defineEmailTemplate, type EmailLocale } from './types.js';

const resetPasswordData = z.object({
  name: z.string().trim().min(1).max(200),
  /** The API reset callback with the token; valid 1 h, single use (decisions §2). */
  url: z.url({ protocol: /^https?$/ }),
});
type ResetPasswordData = z.output<typeof resetPasswordData>;

const content: Record<EmailLocale, (data: ResetPasswordData) => LayoutContent> = {
  vi: (data) => ({
    greeting: `Xin chào ${data.name},`,
    paragraphs: [
      'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ATS của bạn. Hãy mở liên kết bên dưới để tạo mật khẩu mới.',
      'Liên kết hết hạn sau 1 giờ và chỉ dùng được một lần. Sau khi đặt lại, mọi phiên đăng nhập của bạn sẽ bị đăng xuất.',
      'Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này. Mật khẩu của bạn sẽ không thay đổi.',
    ],
    action: { label: 'Đặt lại mật khẩu', url: data.url },
  }),
  en: (data) => ({
    greeting: `Hello ${data.name},`,
    paragraphs: [
      'We received a request to reset the password of your ATS account. Open the link below to choose a new password.',
      'The link expires in 1 hour and works only once. After the reset, all your sessions are signed out.',
      "If you didn't ask to reset your password, you can ignore this email. Your password stays the same.",
    ],
    action: { label: 'Reset password', url: data.url },
  }),
};

/** Sent on each password reset request; a newer email makes the older links stop working. */
export const resetPasswordTemplate = defineEmailTemplate({
  data: resetPasswordData,
  vi: {
    subject: () => 'Đặt lại mật khẩu ATS của bạn',
    html: (data) => layoutHtml('vi', content.vi(data)),
    text: (data) => layoutText('vi', content.vi(data)),
  },
  en: {
    subject: () => 'Reset your ATS password',
    html: (data) => layoutHtml('en', content.en(data)),
    text: (data) => layoutText('en', content.en(data)),
  },
});
