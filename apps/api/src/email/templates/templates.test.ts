import { describe, expect, it } from 'vitest';
import { escapeHtml, html, SafeHtml } from './html.js';
import { EMAIL_LOCALES } from './types.js';
import { EMAIL_TEMPLATES, isEmailTemplateName, renderEmail } from './registry.js';

const data = { name: 'Lan Nguyễn', url: 'https://ats.example.test/welcome?token=abc&step=2' };

describe('escapeHtml', () => {
  it('escapes the five HTML special characters', () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('html tagged template', () => {
  it('escapes interpolated values but keeps nested SafeHtml as is', () => {
    const inner = html`<b>${'<i>'}</b>`;
    const outer = html`<p>${inner}${'"'}</p>`;

    expect(outer).toBeInstanceOf(SafeHtml);
    expect(outer.toString()).toBe('<p><b>&lt;i&gt;</b>&quot;</p>');
  });

  it('joins arrays of SafeHtml', () => {
    const items = ['a', '<b>'].map((item) => html`<li>${item}</li>`);

    const list = html`<ul>
      ${items}
    </ul>`;

    // Prettier lays out `html` templates over several lines; compare without that whitespace.
    expect(list.toString().replace(/\s+/g, '')).toBe('<ul><li>a</li><li>&lt;b&gt;</li></ul>');
  });
});

describe('test template', () => {
  it('renders the English subject, HTML and text parts in the shared layout', () => {
    const email = renderEmail('test', 'en', data);

    expect(email.subject).toBe('ATS test email');
    expect(email.html).toContain('<html lang="en">');
    expect(email.html).toContain('ATS');
    expect(email.html).toContain('Hello Lan Nguyễn,');
    // Button and the same link repeated as text, both escaped for HTML.
    expect(email.html).toContain('href="https://ats.example.test/welcome?token=abc&amp;step=2"');
    expect(email.html).toMatch(/>Open ATS<\/a\s*>/);
    expect(email.html).toContain("If the button doesn't work".replace("'", '&#39;'));
    expect(
      email.html.match(/https:\/\/ats\.example\.test\/welcome\?token=abc&amp;step=2/g),
    ).toHaveLength(3);
    expect(email.html).toContain('This email was sent automatically by ATS.');

    expect(email.text).toContain('Hello Lan Nguyễn,');
    expect(email.text).toContain('https://ats.example.test/welcome?token=abc&step=2');
    expect(email.text).toContain('This email was sent automatically by ATS.');
    expect(email.text).not.toMatch(/<[a-z]/i);
  });

  it('renders the Vietnamese version', () => {
    const email = renderEmail('test', 'vi', data);

    expect(email.subject).toBe('Email thử nghiệm từ ATS');
    expect(email.html).toContain('<html lang="vi">');
    expect(email.html).toContain('Xin chào Lan Nguyễn,');
    expect(email.html).toMatch(/>Mở ATS<\/a\s*>/);
    expect(email.text).toContain('Xin chào Lan Nguyễn,');
    expect(email.text).toContain('Email này được gửi tự động từ ATS.');
  });

  it('escapes data containing <script> in the HTML part', () => {
    const email = renderEmail('test', 'en', {
      name: '<script>alert("x")</script>',
      url: 'https://ats.example.test/a"onmouseover="alert(1)',
    });

    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(email.html).not.toContain('"onmouseover="');
    // The plain-text part is not HTML: the name reads as typed.
    expect(email.text).toContain('Hello <script>alert("x")</script>,');
  });

  it('refuses a link that is not http(s)', () => {
    expect(() => renderEmail('test', 'en', { name: 'A', url: 'javascript:alert(1)' })).toThrow(
      /EMAIL_INVALID_DATA/,
    );
  });

  it('refuses missing data and unknown templates', () => {
    expect(() => renderEmail('test', 'en', { name: 'A' })).toThrow(/EMAIL_INVALID_DATA: url/);
    expect(() => renderEmail('nope', 'en', data)).toThrow(/EMAIL_UNKNOWN_TEMPLATE/);
  });
});

describe('registry', () => {
  it('renders every template in every locale', () => {
    expect(isEmailTemplateName('test')).toBe(true);
    expect(isEmailTemplateName('toString')).toBe(false);
    for (const name of Object.keys(EMAIL_TEMPLATES)) {
      for (const locale of EMAIL_LOCALES) {
        expect(EMAIL_TEMPLATES[name as keyof typeof EMAIL_TEMPLATES][locale]).toBeDefined();
      }
    }
  });
});
