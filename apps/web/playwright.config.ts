import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

// URLs come from the environment so QA and CI can move ports; the defaults match `.env.example`.
//   E2E_BASE_URL  where the web app is served           (default http://localhost:5173)
//   E2E_API_URL   where the API listens                 (default http://localhost:3000)
//   MAILPIT_URL   Mailpit HTTP API, read by e2e helpers (default http://127.0.0.1:8025)
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:5173';
const apiURL = process.env.E2E_API_URL || 'http://localhost:3000';
const isCI = Boolean(process.env.CI);

function portOf(url: string): string {
  const parsed = new URL(url);
  return parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
}

const apiDir = fileURLToPath(new URL('../api', import.meta.url));
const webDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 2 : undefined,
  reporter: [['list'], ['html', { outputFolder: './playwright-report', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Locally an already running API or dev server is reused; CI always starts fresh ones. The email
  // worker is always started.
  webServer: [
    {
      name: 'api',
      // Same env files as `pnpm --filter api dev`; API_PORT from the shell wins over them. Pending
      // migrations are applied first (a no-op when there are none) so a fresh Compose database has
      // the auth tables the session specs sign up into.
      command:
        'pnpm build && node --env-file=.env.example --env-file-if-exists=../../.env --env-file-if-exists=.env dist/database/migrate.js && node --env-file=.env.example --env-file-if-exists=../../.env --env-file-if-exists=.env dist/main.js',
      cwd: apiDir,
      url: `${apiURL}/health`,
      env: { API_PORT: portOf(apiURL), NODE_ENV: 'test', LOG_LEVEL: 'warn' },
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      // Emails are only delivered by the worker (decisions §1): the API enqueues them in Redis and
      // this process sends them to Mailpit, where the e2e helpers read them. It runs the `dist`
      // the API entry above has just built, and is always started fresh (it has no URL to reuse).
      name: 'worker',
      command:
        'node --env-file=.env.example --env-file-if-exists=../../.env --env-file-if-exists=.env dist/main.worker.js',
      cwd: apiDir,
      // "worker ready" for the email queue is logged once the BullMQ worker is listening.
      wait: { stdout: /"message":"worker ready".*"queue":"email"/ },
      env: { NODE_ENV: 'test', LOG_LEVEL: 'log' },
      timeout: 60_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      name: 'web',
      command: `pnpm exec vite --port ${portOf(baseURL)} --strictPort`,
      cwd: webDir,
      url: baseURL,
      env: { API_PROXY_TARGET: apiURL },
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
});
