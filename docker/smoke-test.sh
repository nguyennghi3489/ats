#!/usr/bin/env bash
# Smoke test for the local Compose stack. Checks every backing service against the
# connection values in .env (or .env.example when .env is missing).
#
#   docker compose up -d --wait && ./docker/smoke-test.sh
#
# psql and redis-cli are used from the host when installed, otherwise from inside the
# containers. curl (with --aws-sigv4, curl >= 7.75) is required on the host.
set -euo pipefail

cd "$(dirname "$0")/.."

env_file=.env
[ -f "$env_file" ] || env_file=.env.example
set -a
# shellcheck disable=SC1090
. "./$env_file"
set +a

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}

# Rewrites postgres://user:pass@host:port/db so it works from inside the container.
in_container_url() { printf '%s' "$1" | sed -E 's#@[^/]+/#@localhost:5432/#'; }

run_psql() {
  local url=$1
  shift
  if command -v psql > /dev/null; then
    psql "$url" -XAtq "$@"
  else
    docker compose exec -T postgres psql "$(in_container_url "$url")" -XAtq "$@"
  fi
}

run_redis_cli() {
  if command -v redis-cli > /dev/null; then
    redis-cli -u "$REDIS_URL" "$@"
  else
    docker compose exec -T redis redis-cli "$@"
  fi
}

# 1. Every service is healthy.
for service in postgres redis versitygw mailpit docling-serve; do
  status=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q "$service")" 2> /dev/null || true)
  if [ "$status" = healthy ]; then pass "$service is healthy"; else fail "$service is healthy (got '${status:-not running}')"; fi
done

# 2. unaccent works in the dev database.
got=$(run_psql "$DATABASE_URL" -c "select unaccent('Nguyễn')" 2>&1 || true)
if [ "$got" = Nguyen ]; then pass "unaccent('Nguyễn') = Nguyen in dev database"; else fail "unaccent in dev database (got '$got')"; fi

# 3. The test database exists and has unaccent too.
got=$(run_psql "$TEST_DATABASE_URL" -c "select unaccent('Đặng Thị Hồng')" 2>&1 || true)
if [ "$got" = 'Dang Thi Hong' ]; then pass "test database exists with unaccent"; else fail "test database (got '$got')"; fi

# 4. Redis answers.
got=$(run_redis_cli ping 2>&1 || true)
if [ "$got" = PONG ]; then pass "redis ping = PONG"; else fail "redis ping (got '$got')"; fi

# 5. S3: put and get an object in the configured bucket.
key="smoke-test/$(date +%s)-$$.txt"
body="ats smoke test $key"
object_url="$S3_ENDPOINT/$S3_BUCKET/$key"
sigv4=(--aws-sigv4 "aws:amz:$S3_REGION:s3" --user "$S3_ACCESS_KEY_ID:$S3_SECRET_ACCESS_KEY")
if curl -fsS "${sigv4[@]}" -X PUT --data-binary "$body" -H 'Content-Type: text/plain' "$object_url" > /dev/null 2>&1 &&
  [ "$(curl -fsS "${sigv4[@]}" "$object_url" 2> /dev/null)" = "$body" ]; then
  pass "S3 put + get in bucket '$S3_BUCKET'"
else
  fail "S3 put + get in bucket '$S3_BUCKET' at $S3_ENDPOINT"
fi
curl -fsS "${sigv4[@]}" -X DELETE "$object_url" > /dev/null 2>&1 || true
code=$(curl -s -o /dev/null -w '%{http_code}' "$object_url" || true)
if [ "$code" = 403 ]; then pass "S3 rejects unsigned requests"; else fail "S3 rejects unsigned requests (got HTTP $code)"; fi

# 6. Mailpit: web UI up, SMTP accepts a message, message shows up in the API.
if curl -fsS "$MAILPIT_URL/readyz" > /dev/null 2>&1; then pass "Mailpit web UI reachable"; else fail "Mailpit web UI at $MAILPIT_URL"; fi
subject="ats-smoke-$(date +%s)-$$"
mail_file=$(mktemp)
printf 'From: smoke@example.test\r\nTo: dev@example.test\r\nSubject: %s\r\n\r\nhello\r\n' "$subject" > "$mail_file"
if curl -fsS "smtp://$SMTP_HOST:$SMTP_PORT" --mail-from smoke@example.test --mail-rcpt dev@example.test \
  --upload-file "$mail_file" > /dev/null 2>&1 &&
  curl -fsS "$MAILPIT_URL/api/v1/search?query=subject:$subject" 2> /dev/null | grep -q "\"$subject\""; then
  pass "Mailpit accepts SMTP on $SMTP_HOST:$SMTP_PORT"
else
  fail "Mailpit SMTP on $SMTP_HOST:$SMTP_PORT"
fi
rm -f "$mail_file"

# 7. docling-serve health.
if curl -fsS "$DOCLING_URL/health" 2> /dev/null | grep -q ok; then pass "docling-serve /health"; else fail "docling-serve /health at $DOCLING_URL"; fi

# 8. Published ports listen on 127.0.0.1 only.
urls=$(docker compose ps --format '{{range .Publishers}}{{if .PublishedPort}}{{.URL}} {{end}}{{end}}' 2> /dev/null | tr -s ' \n' '\n\n' | sort -u)
if [ "$urls" = 127.0.0.1 ]; then pass "published ports bound to 127.0.0.1"; else fail "published ports bound to 127.0.0.1 (got: $(echo $urls))"; fi

if [ "$failures" -gt 0 ]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
