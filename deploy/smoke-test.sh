#!/usr/bin/env bash
# Smoke test for the running production stack (docker-compose.prod.yml). Run it on the Droplet after a
# deploy, or locally against a test stack with DOMAIN=localhost (see docs/deploy.md).
#
#   ./deploy/smoke-test.sh [env-file]        # env-file defaults to .env next to docker-compose.prod.yml
#
# Checks: every service running (and healthy where it has a health check), only Caddy publishes ports,
# HTTP redirects to HTTPS, the web app and the API health endpoint answer through Caddy, and a manual
# backup writes a pg_dump file. Needs curl.
set -euo pipefail

cd "$(dirname "$0")/.."

env_file=${1:-.env}
[ -f "$env_file" ] || {
  echo "env file not found: $env_file" >&2
  exit 2
}
set -a
# shellcheck disable=SC1090
. "./${env_file#./}"
set +a

compose() { docker compose -f docker-compose.prod.yml --env-file "$env_file" "$@"; }

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}

# Caddy signs `localhost` with its own local CA, which the host does not trust.
curl_opts=(-sS --max-time 10)
[ "$DOMAIN" = localhost ] && curl_opts+=(-k)
base="https://$DOMAIN"

# 1. Every service is running, and healthy when it has a health check.
for service in $(compose config --services); do
  id=$(compose ps -q "$service")
  state=$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$id" 2> /dev/null || true)
  case "$state" in
    'running healthy' | 'running none') pass "$service is ${state% none}" ;;
    *) fail "$service is running/healthy (got '${state:-not created}')" ;;
  esac
done

# 2. Only Caddy publishes host ports.
publishers=$(compose ps --format '{{.Service}} {{range .Publishers}}{{if .PublishedPort}}{{.PublishedPort}} {{end}}{{end}}' |
  awk 'NF > 1 { print $1 }' | sort -u | xargs)
if [ "$publishers" = caddy ]; then pass "only caddy publishes ports"; else fail "only caddy publishes ports (got: $publishers)"; fi

# 3. HTTP redirects to HTTPS.
code=$(curl "${curl_opts[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "http://$DOMAIN/" || true)
case "$code" in
  30[1278]\ https://*) pass "http://$DOMAIN/ redirects to HTTPS" ;;
  *) fail "http://$DOMAIN/ redirects to HTTPS (got '$code')" ;;
esac

# 4. The web app, including a deep link (SPA fallback).
for path in / /jobs/123; do
  if curl "${curl_opts[@]}" -f "$base$path" 2> /dev/null | grep -q '<div id="app">'; then
    pass "$base$path serves the web app"
  else
    fail "$base$path serves the web app"
  fi
done

# 5. The API health endpoint through Caddy.
body=$(curl "${curl_opts[@]}" -w '\n%{http_code}' "$base/api/health" 2> /dev/null || true)
if [ "$(tail -n 1 <<< "$body")" = 200 ] && grep -q '"status":"ok"' <<< "$body"; then
  pass "$base/api/health answers 200"
else
  fail "$base/api/health answers 200 (got '$(echo $body)')"
fi

# 6. A manual backup writes a gzipped pg_dump of the app database.
if compose exec -T pg-backup /backup.sh > /dev/null 2>&1 &&
  compose exec -T pg-backup sh -c "gzip -t /backups/daily/${POSTGRES_DB}-latest.sql.gz && \
    gunzip -c /backups/daily/${POSTGRES_DB}-latest.sql.gz | grep -q 'PostgreSQL database dump complete'"; then
  pass "manual backup writes /backups/daily/${POSTGRES_DB}-latest.sql.gz"
else
  fail "manual backup writes /backups/daily/${POSTGRES_DB}-latest.sql.gz"
fi

if [ "$failures" -gt 0 ]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
