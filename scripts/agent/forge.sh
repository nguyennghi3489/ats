#!/usr/bin/env bash
# Issue helpers for agents (GitHub via gh).
#   forge.sh blocked-by <issue> <blocker>     link: <issue> is blocked by <blocker>
#   forge.sh unblock <issue> <blocker>         remove that link
#   forge.sh blockers <issue>                  list blockers as "<number> <state>"
#   forge.sh milestone <issue> "<title>"       set the milestone
#   forge.sh check-body <form> <body-file>     validate a body against .github/ISSUE_TEMPLATE/<form>.yml
set -euo pipefail
REPO="${ATS_REPO:-nguyennghi3489/ats}"
cmd="${1:-}"; shift || true

id_of() { gh api "repos/$REPO/issues/$1" --jq .id; }

case "$cmd" in
  blocked-by)
    gh api -X POST "repos/$REPO/issues/$1/dependencies/blocked_by" -F issue_id="$(id_of "$2")" --silent
    ;;
  unblock)
    gh api -X DELETE "repos/$REPO/issues/$1/dependencies/blocked_by/$(id_of "$2")" --silent
    ;;
  blockers)
    gh api "repos/$REPO/issues/$1/dependencies/blocked_by" --jq '.[] | "\(.number) \(.state)"'
    ;;
  milestone)
    gh issue edit "$1" -R "$REPO" --milestone "$2" >/dev/null
    ;;
  check-body)
    python3 -I "$(dirname "$0")/check_body.py" "$(git rev-parse --show-toplevel)/.github/ISSUE_TEMPLATE/$1.yml" "$2"
    ;;
  *)
    sed -n '2,8p' "$0"; exit 2
    ;;
esac
