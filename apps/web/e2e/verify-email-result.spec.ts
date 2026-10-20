// Issue #87: where a verification link lands (AUTH-05 `/verify-email/success`, AUTH-06
// `/verify-email/expired`), followed in a real browser against the real API, the Compose Postgres,
// Redis and Mailpit. The verification emails are delivered by the worker that `playwright.config.ts`
// starts next to the API. Addresses are synthetic and unique per test.
//
// A resend within 60 s of the last email is refused (decisions §2). Rather than wait a minute, the
// test clears the resend counters in the Compose Redis (`COMPOSE_PROJECT_NAME`, default `ats`); their
// keys carry an HMAC of the address, so every `*:verify-email:sends:*` key is removed. No other e2e
// spec relies on a refused resend.
//
// The light / dark baselines live in verify-email-result.spec.ts-snapshots/, one per platform: `-linux`
// is what CI compares against (made in the mcr.microsoft.com/playwright image of the installed
// version), and `-darwin` serves local runs on macOS. Refresh both with `--update-snapshots` after a
// visual change.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import vi from '../src/i18n/locales/vi.json' with { type: 'json' };
import { latestMessageTo, type MailpitMessage } from './support/mailpit';
import { uniqueEmail } from './support/session';

const password = 'qa-Password-87!';
const composeFile = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url));

/** Runs `redis-cli` in the Compose Redis and returns its output. */
function redisCli(...args: string[]): string {
  const project = process.env.COMPOSE_PROJECT_NAME || 'ats';
  return execFileSync(
    'docker',
    ['compose', '-f', composeFile, '-p', project, 'exec', '-T', 'redis', 'redis-cli', ...args],
    { encoding: 'utf8' },
  ).trim();
}

/** Forgets every verification email sent, so the next resend is not refused as too soon. */
function clearResendCounters(): void {
  const keys = redisCli('--scan', '--pattern', '*:verify-email:sends:*')
    .split('\n')
    .filter(Boolean);
  if (keys.length > 0) redisCli('del', ...keys);
}

/** The verification link of an email, as the user would click it. */
function verificationLink(message: MailpitMessage): string {
  const link = /https?:\/\/\S*\/verify-email\?token=[^\s"'<>)]+/.exec(message.text)?.[0];
  if (!link) throw new Error(`No verification link in "${message.subject}"`);
  return link;
}

/** Waits for an email to `address` newer than `previous`. */
async function nextMessageTo(address: string, previous: MailpitMessage): Promise<MailpitMessage> {
  let message = previous;
  await expect
    .poll(
      async () => {
        message = await latestMessageTo(address, { timeoutMs: 20_000 });
        return message.id;
      },
      { timeout: 20_000 },
    )
    .not.toBe(previous.id);
  return message;
}

async function signUp(page: Page, email: string): Promise<void> {
  await page.goto('/sign-up');
  await page.getByTestId('sign-up-name').fill('QA Verify');
  await page.getByTestId('sign-up-email').fill(email);
  await page.getByTestId('sign-up-password').fill(password);
  await page.getByTestId('sign-up-submit').click();
  await expect(page).toHaveURL(/\/verify-email\?email=/);
}

const checkEmailUrl = (email: string) =>
  new RegExp(`/verify-email\\?email=${encodeURIComponent(email).replace(/\./g, '\\.')}$`);

test.describe('verification link result pages', () => {
  // A Vietnamese browser, so the pages open in Vietnamese.
  test.use({ locale: 'vi-VN' });

  test('a new link from the expired page arrives, the old link expires and the new one verifies', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const email = uniqueEmail(testInfo, 'qa87');

    await signUp(page, email);
    const first = await latestMessageTo(email, { timeoutMs: 20_000 });
    const firstLink = verificationLink(first);

    clearResendCounters();

    await test.step('"Gửi liên kết mới" sends a new email and opens the check-email page', async () => {
      await page.goto('/verify-email/expired');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.auth.linkExpired.title);
      await page.getByLabel(vi.auth.linkExpired.email).fill(email);
      await page.getByRole('button', { name: vi.auth.linkExpired.submit }).click();
      await expect(page).toHaveURL(checkEmailUrl(email));
    });
    const second = await nextMessageTo(email, first);
    const secondLink = verificationLink(second);
    expect(secondLink).not.toBe(firstLink);

    await test.step('the old link, replaced by the new one, lands on the expired page', async () => {
      await page.goto(firstLink);
      await expect(page).toHaveURL(/\/verify-email\/expired$/);
      await expect(page.getByTestId('link-expired-notice')).toHaveText(vi.auth.linkExpired.notice);
    });

    await test.step('the new link lands on the success page; "Đăng nhập" opens sign-in', async () => {
      await page.goto(secondLink);
      await expect(page).toHaveURL(/\/verify-email\/success$/);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(vi.auth.verified.title);
      await expect(page.getByTestId('verified-notice')).toHaveText(vi.auth.verified.notice);
      await page.getByRole('button', { name: vi.auth.verified.signIn }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
    });
  });

  test('the sign-up link lands on the success page; "Đăng nhập" opens sign-in', async ({
    page,
  }, testInfo) => {
    const email = uniqueEmail(testInfo, 'qa87-ok');
    await signUp(page, email);
    const link = verificationLink(await latestMessageTo(email, { timeoutMs: 20_000 }));

    await page.goto(link);
    await expect(page).toHaveURL(/\/verify-email\/success$/);
    await page.getByRole('button', { name: vi.auth.verified.signIn }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  for (const colorScheme of ['light', 'dark'] as const) {
    for (const [width, height] of [
      [1440, 900],
      [360, 800],
    ] as const) {
      for (const [name, path] of [
        ['verified', '/verify-email/success'],
        ['link-expired', '/verify-email/expired'],
      ] as const) {
        test(`${name} matches the design at ${width} px (${colorScheme})`, async ({ page }) => {
          await page.emulateMedia({ colorScheme });
          await page.setViewportSize({ width, height });
          await page.goto(path);
          await expect(page.locator('html')).toHaveAttribute('data-theme', colorScheme);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await page.evaluate(() => document.fonts.ready);

          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
          );
          expect(overflow, 'no horizontal scrolling').toBeLessThanOrEqual(0);
          if (width === 1440) {
            expect((await page.locator('.auth-layout__card').boundingBox())?.width).toBe(448);
          }
          await expect(page).toHaveScreenshot(`${name}-${width}-${colorScheme}.png`, {
            fullPage: true,
            animations: 'disabled',
            caret: 'hide',
            maxDiffPixelRatio: 0.02,
          });
        });
      }
    }
  }
});
