# End-to-end tests

Playwright (Chromium) drives the web app against a real API and the Compose services (decisions §14).
`playwright.config.ts` starts both apps through `webServer`: the API is built and run from `apps/api`,
then the Vite dev server proxies `/api/*` to it.

```sh
docker compose up -d --wait           # backing services (Mailpit is needed by the helper tests)
pnpm exec playwright install chromium # once per machine
pnpm test:e2e                         # from the repo root, or inside apps/web
```

Locally an API or dev server already listening on the configured port is reused; CI always starts
fresh ones.

## Environment

| Variable       | Default                 | Meaning                               |
| -------------- | ----------------------- | ------------------------------------- |
| `E2E_BASE_URL` | `http://localhost:5173` | Web app URL; its port is used by Vite |
| `E2E_API_URL`  | `http://localhost:3000` | API URL; its port becomes `API_PORT`  |
| `MAILPIT_URL`  | `http://127.0.0.1:8025` | Mailpit HTTP API                      |
| `SMTP_HOST`    | `127.0.0.1`             | SMTP host for `support/smtp.ts`       |
| `SMTP_PORT`    | `1025`                  | SMTP port for `support/smtp.ts`       |

## When a test fails

A failing test keeps its trace, screenshot and error context under `apps/web/test-results/`, and the
HTML report is written to `apps/web/playwright-report/`. Open them with:

```sh
pnpm --filter @ats/web test:e2e:report
pnpm --filter @ats/web exec playwright show-trace test-results/<test>/trace.zip
```

In CI the `e2e` job uploads both folders as the `playwright-report` artifact when it fails.

## Helpers

- `support/mailpit.ts`: `latestMessageTo(address)` polls Mailpit and returns the newest message sent
  to that address (subject, text, HTML). Use a unique address per test so runs never collide.
- `support/smtp.ts`: `sendMail()` sends a plain-text message to Mailpit over SMTP. Only for testing
  the helper; app mail goes through the API.
