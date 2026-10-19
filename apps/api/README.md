# api

NestJS API (decisions §1). ESM, TypeScript strict, Express.

```sh
pnpm --filter api dev         # build, then rebuild and restart on change; http://localhost:3000/health
pnpm --filter api build       # compile to dist/
pnpm --filter api start       # run dist/main.js with the environment as-is (production)
pnpm --filter api test        # unit tests in src/ (Vitest; needs Compose Redis and Mailpit, no database)
pnpm --filter api test:integration  # API integration tests in test/ against the Compose test Postgres
```

Integration tests (`test/**/*.test.ts`, `vitest.integration.config.ts`) reset `TEST_DATABASE_URL`
(must name a `*_test` database other than `DATABASE_URL`'s) and apply every migration once per run,
then truncate every table before each test. Boot the API with `startTestApp()` from
`test/support/test-app.ts` and call it with `api.request('/path')`.

## Database

Postgres through Drizzle ORM (`drizzle-orm/node-postgres`), migrations by drizzle-kit (decisions §1).
The API reads `DATABASE_URL`; tests use `TEST_DATABASE_URL` (default: the Compose `ats_test` database).

```sh
docker compose up -d --wait postgres
pnpm --filter api db:migrate                      # apply pending migrations; no-op when up to date
pnpm --filter api db:generate                     # write a migration from changes in *.schema.ts
pnpm --filter api db:migrate:create --name=<name> # write an empty SQL migration to fill in by hand
pnpm --filter api db:reset                        # development only: drop everything, migrate again
```

- `src/database` holds the client. Inject it with `@Inject(DATABASE) database: Database`, then query
  with `database.db` (Drizzle query builder; `sql` for raw fragments such as `unaccent(lower(...))`).
- `database.transaction(async (tx) => { ... })` commits when the callback resolves and rolls back
  when it throws. Run every query of the transaction on `tx`, not `database.db`.
- `GET /health` returns `{ status: "ok", db: "ok" }`, or 503 `{ status: "error", db: "down" }` when
  Postgres does not answer. The API still starts without Postgres.

### Adding a migration

1. Declare or change tables in the feature's own file, `src/<feature>/<feature>.schema.ts` (picked
   up by `drizzle.config.ts`).
2. Run `pnpm --filter api db:generate`. It writes `drizzle/NNNN_<name>.sql` plus a snapshot in
   `drizzle/meta`. For SQL drizzle-kit cannot express (extensions, functions, data fixes), run
   `db:migrate:create --name=<name>` and write the SQL yourself.
3. Read the generated SQL, then run `pnpm --filter api db:migrate` and the tests.
4. Commit the SQL file and the `drizzle/meta` changes together. Never edit or delete a migration
   that has reached `main`; add a new one instead. If two branches both added migration `NNNN`,
   the later one deletes its own and generates it again on top of `main`.

Applied migrations are recorded in `drizzle.__drizzle_migrations`; each one runs in a transaction.

## Worker mode

The same codebase runs the BullMQ worker (decisions §1): `src/main.worker.ts` starts a Nest
application context with every processor and no HTTP listener. It needs `REDIS_URL` and the SMTP settings (see Email), not
`API_PORT`.

```sh
docker compose up -d --wait redis mailpit
pnpm --filter api worker:dev    # build, then rebuild and restart on change
pnpm --filter api worker:start  # run dist/main.worker.js with the environment as-is (production)
pnpm --filter api queue:ping [--fail N] [--duration MS] [--count N]   # enqueue sample ping jobs
```

- Queues are declared once with `defineQueue(name, { attempts, backoff })` (`src/queue`), default
  3 attempts with exponential backoff from 1 s. Producers can override per job:
  `queue.add(name, data, { attempts: 4, backoff: stepBackoff([10_000, 30_000, 90_000]) })`.
- Producers import `QueueModule.forRoot({ redisUrl })` and `QueueModule.register(QUEUE)`, then
  `@InjectQueue(QUEUE.name)`. Jobs are only processed where a `@Processor` is registered, which is
  `WorkerModule` alone, so the HTTP API never consumes jobs.
- Processors extend `LoggedWorkerHost` and use `@Processor(QUEUE.name, workerOptions())`: every
  failed attempt is logged (`warn` with `retryInMs` while retrying, `error` when giving up).
- SIGTERM/SIGINT: the worker takes no new job, lets the active one finish, then exits.

## Email

Transactional email goes through the BullMQ `email` queue (decisions §1). A module imports
`EmailModule`, injects `EmailService` and calls:

```ts
await emails.enqueue({ to, locale: 'vi', template: 'test', data: { name, url } });
```

`enqueue` validates the address, the locale (`vi` | `en`, the recipient's language, decisions §12),
the template name and its data, then adds a job; it throws `EmailError` (`EMAIL_INVALID_MESSAGE`,
`EMAIL_UNKNOWN_TEMPLATE`, `EMAIL_INVALID_DATA`) otherwise. The worker renders the template and
sends it with Nodemailer over SMTP: 5 attempts with exponential backoff from 10 s; sent jobs are
removed, jobs that gave up stay in the failed set. Logs carry the job id, template and outcome,
never the recipient address or the rendered body.

The worker reads `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER` + `SMTP_PASSWORD` (both or
neither) and `EMAIL_FROM`; it refuses to start without them. Locally they point at the Compose
`mailpit` service (`docker compose up -d --wait mailpit`); read the mail at http://127.0.0.1:8025.

### Email verification

Sign-up enqueues the `verify-email` template in the user's `locale`. The link opens
`GET /api/auth/verify-email` and is valid 24 h; it redirects to `WEB_ORIGIN/verify-email/success`, or
to `/verify-email/expired` when the link is expired, tampered with or replaced by a newer one.
`POST /api/auth/send-verification-email` sends a new link: 429 `RESEND_TOO_SOON` within 60 s of the
last send, 429 `RESEND_LIMIT` after 5 sends in a rolling hour (both with `retryAfterSeconds`), and
the usual `{ status: true }` for unknown or verified addresses, which get no email. The counters and
the current link live in Redis (`src/auth/verification-resend.ts`), keyed by an HMAC of the address.

### Adding a template

1. Create `src/email/templates/<name>.template.ts` with `defineEmailTemplate({ data, vi, en })`:
   `data` is the Zod schema of what callers pass (use `z.url({ protocol: /^https?$/ })` for links);
   `vi` and `en` each have `subject(data)`, `html(data)` and `text(data)`.
2. Build the body with `layoutHtml(locale, content)` and `layoutText(locale, content)` from
   `layout.ts` (ATS header, greeting, paragraphs, one button, the link repeated as text, footer).
   Content is plain text and is HTML-escaped by the layout. For custom markup use the `html` tag
   from `html.ts`, which escapes every interpolated value; never build HTML by concatenating strings.
3. Register it in `EMAIL_TEMPLATES` (`registry.ts`). Its key is the template name, stored in each
   job: to rename one, add the new name and remove the old one a release later.
4. Test both locales and the escaping in `templates.test.ts`. English copy needs human review.

## Configuration

`src/config/config.ts` validates the environment with Zod at startup. A missing or invalid value stops
the process with exit code 1 and names the variable. Variables are listed in `.env.example`.

`dev` loads `apps/api/.env.example`, then the root `.env` and `apps/api/.env` if they exist (later files
win). Variables set in the shell win over every file: `API_PORT=4000 pnpm --filter api dev`.

## Conventions

- Errors: every error response is `{ code, message }`. Throw an `HttpException` carrying a code, e.g.
  `new ForbiddenException({ code: 'WORKSPACE_ACCESS_REVOKED' })`; without one the code is the status
  name (`NOT_FOUND`). Unexpected errors become `500 INTERNAL_ERROR` and are only logged. The web app
  translates codes (decisions §12).
- Logs: one JSON object per line. Each request gets an `x-request-id` (a well-formed incoming one is
  kept), returned in the response and added to every log record written while handling it.
