#!/bin/sh
# Runs once, when the postgres data volume is first created.
# Enables unaccent (decisions §11, search) in the dev database and creates the test
# database (name from POSTGRES_TEST_DB) with the same extension.
set -eu

test_db="${POSTGRES_TEST_DB:-ats_test}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v test_db="$test_db" -v owner="$POSTGRES_USER" <<'SQL'
CREATE EXTENSION IF NOT EXISTS unaccent;
SELECT format('CREATE DATABASE %I OWNER %I', :'test_db', :'owner')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'test_db')\gexec
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$test_db" <<'SQL'
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
