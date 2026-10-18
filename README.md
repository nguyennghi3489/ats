# ATS

Applicant tracking system. Product and build decisions live in [`docs/decisions.md`](docs/decisions.md)
and the delivery plan in [`docs/roadmap.md`](docs/roadmap.md).

## Repository layout

pnpm monorepo:

| Path              | What                                              |
| ----------------- | ------------------------------------------------- |
| `apps/api`        | NestJS API and BullMQ worker (not yet added)      |
| `apps/web`        | Vue 3 + Vite recruiter app ([README](apps/web))   |
| `packages/shared` | `@ats/shared` — Zod schemas shared by api and web |

## Getting started

Requirements:

- Node.js 24 (see `.nvmrc`; run `nvm use`).
- pnpm at the version pinned in `package.json` → `packageManager`. The easiest way is Corepack, which ships
  with Node: `corepack enable`. pnpm then runs at the pinned version automatically.

Install:

```sh
nvm use
corepack enable
pnpm install
```

## Local services

`docker-compose.yml` runs every backing service the app needs, for development only. Requires Docker with
Compose v2. The first start pulls the docling-serve image, which is several GB.

```sh
cp .env.example .env          # connection values; the defaults match docker-compose.yml
docker compose up -d --wait   # start, and wait until every service is healthy
./docker/smoke-test.sh        # optional: checks each service with the values in .env
docker compose down           # stop; data is kept
docker compose down -v        # stop and delete all data volumes (database, Redis, files)
```

| Service         | Address (127.0.0.1 only)                    | Notes                                                                         |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `postgres`      | `5432`                                      | Postgres 18; databases `ats` (dev) and `ats_test`, `unaccent` enabled in both |
| `redis`         | `6379`                                      | BullMQ queues                                                                 |
| `versitygw`     | `http://127.0.0.1:7070`                     | S3 API; bucket `ats-dev` is created on every start                            |
| `mailpit`       | SMTP `1025`, web UI <http://127.0.0.1:8025> | Catches every email the app sends                                             |
| `docling-serve` | <http://127.0.0.1:5001> (health: `/health`) | CV to Markdown; API docs at <http://127.0.0.1:5001/docs>                      |

- Ports are published on `127.0.0.1` only. If one is taken, change it in `.env` (e.g. `POSTGRES_PORT=5433`)
  and update the matching URL (`DATABASE_URL`, `TEST_DATABASE_URL`, ...) in the same file.
- The Postgres init script (`docker/postgres/init/`) runs only when the data volume is first created.
  After changing it, run `docker compose down -v` to start from an empty database.
- The credentials in `.env.example` are for this local stack only.

## Root scripts

Run from the repository root. `lint`, `typecheck`, `test` and `build` run the same script in every
workspace package (`pnpm -r`); `format` and `format:check` run Prettier once over the whole repository.

| Command             | What it does                                       |
| ------------------- | -------------------------------------------------- |
| `pnpm lint`         | ESLint (flat config in `eslint.config.js`)         |
| `pnpm typecheck`    | `tsc --noEmit` in strict mode                      |
| `pnpm test`         | Vitest unit tests                                  |
| `pnpm build`        | Builds every package (e.g. `packages/shared/dist`) |
| `pnpm format`       | Prettier — rewrites files in place                 |
| `pnpm format:check` | Prettier — reports unformatted files (for CI)      |

Run a script in a single package with a filter, e.g. `pnpm --filter @ats/shared test`.

## Conventions

- TypeScript settings are shared through `tsconfig.base.json`; every package extends it.
- Editor settings come from `.editorconfig`; formatting from `.prettierrc.json`.
