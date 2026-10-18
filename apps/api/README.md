# api

NestJS API (decisions §1). ESM, TypeScript strict, Express.

```sh
pnpm --filter api dev         # build, then rebuild and restart on change; http://localhost:3000/health
pnpm --filter api build       # compile to dist/
pnpm --filter api start       # run dist/main.js with the environment as-is (production)
pnpm --filter api test        # unit tests (Vitest)
```

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
