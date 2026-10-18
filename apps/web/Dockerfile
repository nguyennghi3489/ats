# syntax=docker/dockerfile:1
# Recruiter web app image (decisions §14): the static Vite build served by Caddy. Build from the repo root:
#
#   docker build -f apps/web/Dockerfile -t ats-web .
#   docker run -p 8080:8080 ats-web            # http://localhost:8080
#
# Plain HTTP on port 8080 with SPA fallback: any path that is not a file returns index.html, so deep
# links such as /jobs/123 load the app. HTTPS and the /api proxy belong to the production Caddy
# config (roadmap step 17).

ARG NODE_VERSION=24
ARG CADDY_VERSION=2

FROM node:${NODE_VERSION}-alpine AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# pnpm version comes from `packageManager` in package.json.
RUN corepack enable
WORKDIR /repo
# Download every dependency from the lockfile alone, so source changes reuse this layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --filter "@ats/web..."
# Builds @ats/shared first, then type-checks and bundles the app into apps/web/dist.
RUN pnpm --filter "@ats/web..." build

FROM caddy:${CADDY_VERSION}-alpine AS runtime
COPY <<'EOF' /etc/caddy/Caddyfile
{
	admin off
	auto_https off
	persist_config off
}

:8080 {
	root * /srv
	encode zstd gzip
	# Hashed bundle files never change; index.html is always revalidated so a deploy shows at once.
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"
	header ?Cache-Control "no-cache"
	try_files {path} /index.html
	file_server
}
EOF
COPY --from=build --chown=root:root /repo/apps/web/dist /srv
# Caddy writes only to its data and config dirs; give them to an unprivileged user and run as it.
RUN addgroup -S -g 1000 web \
    && adduser -S -D -H -u 1000 -G web web \
    && chown -R web:web /data /config
USER web
EXPOSE 8080
