// QA for issue #86: the check-email page at /verify-email (design AUTH-03, AUTH-04).
// Adds what verify-email.spec.ts does not cover:
// - a real resend after the real 60 s wait (no mock, no fake clock) that delivers a second
//   verification email to Mailpit (needs the email worker running against the same Redis);
// - the full vi and en copy of both states, the notice tones and the outline button;
// - screenshots of AUTH-03 / AUTH-04 at 1440 px and 360 px in light and dark for the design review.
import { expect, test, type Page } from '@playwright/test';
import en from '../src/i18n/locales/en.json' with { type: 'json' };
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { uniqueEmail } from './support/session';

const mailpitUrl = (process.env.MAILPIT_URL || 'http://127.0.0.1:8025').replace(/\/$/, '');
const RESEND_PATH = '**/api/auth/send-verification-email';

const pageFor = (email: string) => `/verify-email?email=${encodeURIComponent(email)}`;
const resendButton = (page: Page) => page.getByTestId('check-email-resend');
const notice = (page: Page) => page.getByTestId('check-email-notice');
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

/** Number of Mailpit messages whose recipient is exactly `address`. */
async function messagesTo(address: string): Promise<number> {
  const query = new URLSearchParams({ query: `to:"${address}"`, limit: '50' });
  const response = await fetch(`${mailpitUrl}/api/v1/search?${query}`);
  const body = (await response.json()) as {
    messages: Array<{ To: Array<{ Address: string }> | null }>;
  };
  return body.messages.filter((message) =>
    (message.To ?? []).some((to) => to.Address.toLowerCase() === address.toLowerCase()),
  ).length;
}

async function signUp(page: Page, email: string, locale: 'vi' | 'en' = 'vi') {
  const response = await page.request.post('/api/auth/sign-up/email', {
    data: { name: 'QA Tester', email, password: 'qa86-Password!', locale },
  });
  expect(response.ok()).toBe(true);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((value) => {
    document.documentElement.dataset.theme = value;
  }, theme);
}

test.describe('check-email page (QA #86)', () => {
  test.use({ locale: 'vi-VN' });

  test('real resend after the real 60 s wait shows AUTH-04 and a second email reaches Mailpit', async ({
    page,
  }, testInfo) => {
    test.setTimeout(150_000);
    const email = uniqueEmail(testInfo, 'qa86-mailpit');
    await signUp(page, email);
    await expect.poll(() => messagesTo(email), { timeout: 15_000 }).toBe(1);

    await page.goto(pageFor(email));
    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText(/^Gửi lại sau \d+ giây$/);
    await expect(resendButton(page)).toBeEnabled({ timeout: 70_000 });
    await expect(resendButton(page)).toHaveText(vi.auth.checkEmail.resend);

    const response = page.waitForResponse(RESEND_PATH);
    await resendButton(page).click();
    expect((await response).status()).toBe(200);

    await expect(heading(page)).toHaveText(vi.auth.checkEmail.resentTitle);
    await expect(notice(page)).toContainText(vi.auth.checkEmail.resentNotice);
    await expect(resendButton(page)).toBeDisabled();
    await expect(resendButton(page)).toHaveText(/^Gửi lại sau (60|59) giây$/);
    await expect.poll(() => messagesTo(email), { timeout: 15_000 }).toBe(2);
  });

  for (const lang of ['vi', 'en'] as const) {
    test(`${lang}: AUTH-03 then AUTH-04 copy, tones and button match the design`, async ({
      page,
    }, testInfo) => {
      const copy = (lang === 'vi' ? vi : en).auth.checkEmail;
      const email = uniqueEmail(testInfo, `qa86-copy-${lang}`);
      await page.route(RESEND_PATH, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
      );
      await page.clock.install();
      await page.goto(pageFor(email));
      if (lang === 'en') {
        await page.getByRole('button', { name: vi.auth.layout.enName, exact: true }).click();
      }

      // AUTH-03
      await expect(heading(page)).toHaveText(copy.title);
      await expect(page.getByText(copy.subtitle, { exact: true })).toBeVisible();
      await expect(page.getByLabel(copy.recipient)).toHaveValue(email);
      await expect(notice(page)).toHaveClass(/ats-notice--info/);
      await expect(notice(page)).toContainText(copy.notice);
      await expect(resendButton(page)).toHaveClass(/ats-button--outline/);
      await expect(resendButton(page)).toBeDisabled();
      await page.clock.runFor(15_000);
      await expect(resendButton(page)).toHaveText(
        lang === 'vi' ? 'Gửi lại sau 45 giây' : 'Resend in 45 s',
      );
      await expect(page.getByText(copy.wrongEmail)).toBeVisible();
      await expect(page.getByRole('link', { name: copy.backToSignUp })).toHaveAttribute(
        'href',
        '/sign-up',
      );
      await page.clock.runFor(45_000);
      await expect(resendButton(page)).toBeEnabled();
      await expect(resendButton(page)).toHaveText(copy.resend);

      // AUTH-04
      await resendButton(page).click();
      await expect(heading(page)).toHaveText(copy.resentTitle);
      await expect(page.getByText(copy.resentSubtitle, { exact: true }).first()).toBeVisible();
      await expect(notice(page)).toHaveClass(/ats-notice--success/);
      await expect(notice(page)).toContainText(copy.resentNotice);
      await expect(page.getByText(copy.resentFooter)).toBeVisible();
      await expect(page.getByRole('link', { name: copy.backToSignUp })).toHaveCount(0);
      await page.clock.runFor(60_000);
      await expect(resendButton(page)).toBeEnabled();
      await expect(resendButton(page)).toHaveText(copy.resendAgain);
    });
  }

  for (const width of [1440, 360]) {
    test(`screenshots of AUTH-03 and AUTH-04 at ${width} px, light and dark`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route(RESEND_PATH, (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":true}' }),
      );
      await page.clock.install();
      await page.goto(pageFor('minh.anh@example.com'));
      await expect(heading(page)).toHaveText(vi.auth.checkEmail.title);

      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await page.screenshot({
          path: testInfo.outputPath(`auth-03-${width}-${theme}.png`),
          fullPage: true,
        });
      }
      await page.clock.runFor(60_000);
      await resendButton(page).click();
      await expect(heading(page)).toHaveText(vi.auth.checkEmail.resentTitle);
      for (const theme of ['light', 'dark'] as const) {
        await setTheme(page, theme);
        await page.screenshot({
          path: testInfo.outputPath(`auth-04-${width}-${theme}.png`),
          fullPage: true,
        });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
        );
        expect(overflow).toBe(false);
      }
    });
  }
});
