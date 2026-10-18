# api

NestJS API (decisions §1). ESM, TypeScript strict, Express.

```sh
pnpm --filter api dev         # build, then rebuild and restart on change; http://localhost:3000/health
pnpm --filter api build       # compile to dist/
pnpm --filter api start       # run dist/main.js with the environment as-is (production)
pnpm --filter api test        # unit and integration tests (Vitest; needs Compose Redis)
```

## Worker mode

The same codebase runs the BullMQ worker (decisions §1): `src/main.worker.ts` starts a Nest
application context with every processor and no HTTP listener. It needs `REDIS_URL`, not `API_PORT`.

```sh
docker compose up -d --wait redis
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
