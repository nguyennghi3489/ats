#!/usr/bin/env bash
# Static checks for docker-compose.prod.yml: renders it with .env.prod.example and checks the rules in
# docs/deploy.md (services, memory limits, published ports, named volumes, health checks, variables).
# Needs Docker Compose v2 and jq. Starts nothing.
#
#   ./deploy/check-config.sh
set -euo pipefail

cd "$(dirname "$0")/.."

compose_file=docker-compose.prod.yml
env_example=.env.prod.example

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  failures=$((failures + 1))
}
# check "<description>" <command...>: passes when the command succeeds.
check() {
  local description=$1
  shift
  if "$@"; then pass "$description"; else fail "$description"; fi
}

# 1. The file renders with the example values.
if ! config=$(docker compose -f "$compose_file" --env-file "$env_example" config --format json 2>&1); then
  printf 'FAIL %s renders with %s\n%s\n' "$compose_file" "$env_example" "$config"
  exit 1
fi
pass "$compose_file renders with $env_example"
q() { jq -r "$@" <<< "$config"; }

# 2. Required values have no defaults: rendering without an env file fails.
if docker compose -f "$compose_file" --env-file /dev/null config > /dev/null 2>&1; then
  fail "rendering without an env file fails (required variables have no defaults)"
else
  pass "rendering without an env file fails (required variables have no defaults)"
fi

# 3. Exactly the expected services.
expected="api caddy docling-serve pg-backup postgres redis versitygw web worker"
got=$(q '.services | keys | join(" ")')
check "services are: $expected (got: $got)" test "$got" = "$expected"

# 4. Memory limits: on every service, postgres 2 GiB, docling-serve 3 GiB, total at most 7 GiB.
gib=$((1024 * 1024 * 1024))
missing=$(q '[.services | to_entries[] | select((.value.deploy.resources.limits.memory // .value.mem_limit // "") == "") | .key] | join(" ")')
check "every service has a memory limit (missing: ${missing:-none})" test -z "$missing"
limit() { q --arg s "$1" '.services[$s] | (.deploy.resources.limits.memory // .mem_limit // 0) | tonumber'; }
check "postgres memory limit is 2 GiB" test "$(limit postgres)" -eq $((2 * gib))
check "docling-serve memory limit is 3 GiB" test "$(limit docling-serve)" -eq $((3 * gib))
total=$(q '[.services[] | (.deploy.resources.limits.memory // .mem_limit // 0) | tonumber] | add')
check "total memory limit $((total / 1024 / 1024)) MiB is at most 7168 MiB" test "$total" -le $((7 * gib))

# 5. Only caddy publishes host ports, and only 80 and 443.
publishers=$(q '[.services | to_entries[] | select((.value.ports // []) | length > 0) | .key] | join(" ")')
check "only caddy publishes ports (got: ${publishers:-none})" test "$publishers" = caddy
caddy_ports=$(q '[.services.caddy.ports[]?.published] | unique | join(" ")')
check "caddy publishes 80 and 443 (got: ${caddy_ports:-none})" test "$caddy_ports" = "443 80"
host_network=$(q '[.services | to_entries[] | select(.value.network_mode == "host") | .key] | join(" ")')
check "no service uses host networking (got: ${host_network:-none})" test -z "$host_network"

# 6. Data lives on named volumes.
mounted_volume() {
  q --arg s "$1" --arg t "$2" \
    '[.services[$s].volumes[]? | select(.type == "volume" and .target == $t) | .source] | first // ""'
}
for pair in postgres:/var/lib/postgresql versitygw:/data redis:/data caddy:/data caddy:/config pg-backup:/backups; do
  service=${pair%%:*}
  target=${pair#*:}
  source=$(mounted_volume "$service" "$target")
  check "$service $target is a named volume (${source:-none})" test -n "$source"
done

# 7. Restart policy, health checks and start order.
not_restarting=$(q '[.services | to_entries[] | select(.value.restart != "unless-stopped") | .key] | join(" ")')
check "every service restarts unless-stopped (except: ${not_restarting:-none})" test -z "$not_restarting"
for service in postgres redis api; do
  check "$service has a health check" test "$(q --arg s "$service" '.services[$s].healthcheck.test // [] | length')" -gt 0
done
for service in api worker; do
  for dependency in postgres redis; do
    condition=$(q --arg s "$service" --arg d "$dependency" '.services[$s].depends_on[$d].condition // ""')
    check "$service waits for $dependency to be healthy" test "$condition" = service_healthy
  done
done
check "worker runs in worker mode" test "$(q '.services.worker.command // [] | join(" ")')" = "node dist/main.worker.js"

# 8. Backup retention: 14 daily and 8 weekly dumps.
backup_env() { q --arg k "$1" '.services["pg-backup"].environment[$k] // ""'; }
check "pg-backup keeps 14 daily dumps" test "$(backup_env BACKUP_KEEP_DAYS)" = 14
check "pg-backup keeps 8 weekly dumps" test "$(backup_env BACKUP_KEEP_WEEKS)" = 8

# 9. The example lists exactly the variables the prod file references.
# Comment lines and escaped `$${...}` (expanded inside the container, not by Compose) do not count.
referenced=$(grep -vE '^[[:space:]]*#' "$compose_file" | grep -oE '(^|[^$])\$\{[A-Z0-9_]+' | sed -E 's/^.?\$\{//' | sort -u)
listed=$(grep -oE '^[A-Z0-9_]+=' "$env_example" | sed 's/=$//' | sort -u)
not_listed=$(comm -23 <(echo "$referenced") <(echo "$listed") | xargs)
unused=$(comm -13 <(echo "$referenced") <(echo "$listed") | xargs)
check "$env_example lists every referenced variable (missing: ${not_listed:-none})" test -z "$not_listed"
check "$env_example lists only referenced variables (unused: ${unused:-none})" test -z "$unused"

if [ "$failures" -gt 0 ]; then
  printf '\n%d check(s) failed\n' "$failures"
  exit 1
fi
printf '\nall checks passed\n'
