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
