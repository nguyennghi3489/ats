import { z } from 'zod';
import { layoutHtml, layoutText, type LayoutContent } from './layout.js';
import { defineEmailTemplate, type EmailLocale } from './types.js';

const testData = z.object({
  name: z.string().trim().min(1).max(200),
  url: z.url({ protocol: /^https?$/ }),
});
type TestData = z.output<typeof testData>;

const content: Record<EmailLocale, (data: TestData) => LayoutContent> = {
  vi: (data) => ({
    greeting: `Xin chào ${data.name},`,
    paragraphs: ['Đây là email thử nghiệm từ ATS. Bạn không cần làm gì thêm.'],
    action: { label: 'Mở ATS', url: data.url },
  }),
  en: (data) => ({
    greeting: `Hello ${data.name},`,
    paragraphs: ['This is a test email from ATS. There is nothing you need to do.'],
    action: { label: 'Open ATS', url: data.url },
  }),
};

/** Proves the pipeline end to end (enqueue, render, deliver); used by tests and QA. */
export const testTemplate = defineEmailTemplate({
  data: testData,
  vi: {
    subject: () => 'Email thử nghiệm từ ATS',
    html: (data) => layoutHtml('vi', content.vi(data)),
    text: (data) => layoutText('vi', content.vi(data)),
  },
  en: {
    subject: () => 'ATS test email',
    html: (data) => layoutHtml('en', content.en(data)),
    text: (data) => layoutText('en', content.en(data)),
  },
});
