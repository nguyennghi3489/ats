# syntax=docker/dockerfile:1
# API image, also used for the BullMQ worker (decisions §1, §14). Build from the repo root:
#
#   docker build -f apps/api/Dockerfile -t ats-api .
#   docker run --init --env-file <env> -p 3000:3000 ats-api                       # HTTP API (default)
#   docker run --init --env-file <env> ats-api node dist/main.worker.js           # worker mode
#   docker run --init --env-file <env> ats-api node dist/queue/enqueue-ping.js    # enqueue a sample ping job
#
# The command selects the mode; Compose sets `command:` for the worker service. Configuration comes from
# the environment only (see apps/api/.env.example); the image contains no .env file.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm version comes from `packageManager` in package.json.
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Download every dependency from the lockfile alone, so source changes reuse this layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "api..."
RUN pnpm --filter api build
# Production dependencies only, with @ats/shared copied in (no workspace symlinks).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter api deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
ENV NODE_ENV=production
ENV API_PORT=3000
WORKDIR /app
COPY --from=build --chown=root:root /out/package.json ./package.json
COPY --from=build --chown=root:root /out/node_modules ./node_modules
COPY --from=build --chown=root:root /out/dist ./dist
# Files stay owned by root and read-only to the app; the process runs as the image's `node` user.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
