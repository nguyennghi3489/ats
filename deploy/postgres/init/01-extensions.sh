#!/bin/sh
# Production Postgres init (docker-compose.prod.yml). Runs once, when the data volume is first created.
# Enables unaccent (decisions §11, search) in the app database. Unlike the local stack, no test database.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS unaccent;
SQL
