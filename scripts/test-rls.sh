#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies Supabase stubs + migrations + seed, and runs RLS assertions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
cleanup() { "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
RUNAS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$TMP" 2>/dev/null || { useradd -m postgres; chown -R postgres "$TMP"; }; RUNAS="sudo -u postgres"; command -v sudo >/dev/null || RUNAS="su postgres -c"; fi
run() { if [ "$RUNAS" = "su postgres -c" ]; then su postgres -c "$*"; elif [ -n "$RUNAS" ]; then $RUNAS "$@"; else "$@"; fi; }
run "$PGBIN/initdb" -D "$TMP/data" -U postgres >/dev/null
run "$PGBIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" start >/dev/null
sleep 1
PSQL="psql -h $TMP -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "create database t" >/dev/null
$PSQL -d t -f "$ROOT/supabase/tests/stub_supabase.sql" >/dev/null
for f in "$ROOT"/supabase/migrations/*.sql; do $PSQL -d t -f "$f" >/dev/null; done
$PSQL -d t -f "$ROOT/supabase/seed.sql" >/dev/null
echo "Seed rows: $($PSQL -d t -tAc 'select count(*) from public.global_venues')"
$PSQL -t -d t -f "$ROOT/supabase/tests/rls_test.sql" 2>&1 | grep -v "^\s*$" | sed 's/^psql:[^ ]* NOTICE:  /  /'
