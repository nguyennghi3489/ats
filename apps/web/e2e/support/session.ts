// Signs a fresh synthetic user in, for specs that need a signed-in page now that every app route
// except the auth pages requires a session (#82). The API sends no verification mail a test can
// follow without a screen yet, so the email is marked verified in the Compose Postgres
// (`COMPOSE_PROJECT_NAME`, default `ats`).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Page, TestInfo } from '@playwright/test';

const composeFile = fileURLToPath(new URL('../../../../docker-compose.yml', import.meta.url));
const password = 'qa-Password-e2e!';

/** Runs one SQL statement in the Compose Postgres; throws when it fails. */
export function psql(sql: string): void {
  const project = process.env.COMPOSE_PROJECT_NAME || 'ats';
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      composeFile,
      '-p',
      project,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'ats',
      '-d',
      'ats',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      sql,
    ],
    { stdio: 'pipe' },
  );
}

/** SQL string literal. */
export const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;

/** A unique synthetic address per test and worker, so runs never collide. */
export function uniqueEmail(testInfo: TestInfo, prefix = 'qa'): string {
  return `${prefix}-${Date.now()}-${testInfo.workerIndex}-${testInfo.retry}@example.test`;
}

/**
 * Signs up `email` through the app's own auth client, marks it verified and signs in, so the
 * browser context holds a real session cookie. Leaves the page on `/sign-up`.
 */
export async function signInAsNewUser(
  page: Page,
  email: string,
  locale: 'vi' | 'en' = 'vi',
): Promise<void> {
  await page.goto('/sign-up');
  const call = (action: 'signUp' | 'signIn', input: Record<string, unknown>) =>
    page.evaluate(
      async ([clientPath, act, arg]) => {
        const { authApi } = (await import(/* @vite-ignore */ clientPath)) as {
          authApi: Record<'signUp' | 'signIn', (i: unknown) => Promise<unknown>>;
        };
        await authApi[act](arg);
      },
      ['/src/features/auth/auth-client.ts', action, input] as const,
    );
  await call('signUp', { name: 'QA Tester', email, password, locale });
  psql(`update "user" set email_verified = true where email = ${sqlString(email)}`);
  await call('signIn', { email, password });
}
