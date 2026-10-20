#!/bin/sh
# Checks that supabase/setup.sql and the migrations lead to exactly the same schema:
# a new database from setup.sql is compared with old installations (tests/legacy-*.sql)
# after all migrations. Also checks the data taken over and the guards.
#
# Needs psql and pg_dump and a Postgres server where it may create databases
# (PGHOST, PGUSER, PGPASSWORD). Locally, for example:
#
#   docker run -d --name check-pg -e POSTGRES_PASSWORD=x postgres:15-alpine
#   docker run --rm --link check-pg -e PGHOST=check-pg -e PGUSER=postgres -e PGPASSWORD=x \
#     -v "$PWD/supabase:/supabase" postgres:15-alpine sh /supabase/check.sh
set -eu
cd "$(dirname "$0")"
export PGOPTIONS='-c client_min_messages=warning'
WORK=$(mktemp -d)
failed=0

until pg_isready -q; do sleep 1; done

q() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

# Like Supabase: API roles with default rights on new tables, and a storage schema
fresh_db() {
  q -d postgres -c "drop database if exists $1 with (force)" -c "create database $1"
  q -d postgres <<'SQL'
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
SQL
  q -d "$1" <<'SQL'
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean);
SQL
}

# Migrations in version order: v1_…, v2_…, v10_…
migrations() {
  ls migrations | sed -n 's/^v\([0-9][0-9]*\)_.*\.sql$/\1 &/p' | sort -n | cut -d' ' -f2
}

schema() {
  pg_dump -s -n public -n admin "$1" | grep -vE '^(--|\\(un)?restrict|SET |SELECT pg_catalog)' | grep -v '^$'
}

fresh_db check_setup
q -d check_setup -f setup.sql >/dev/null
schema check_setup > "$WORK/setup.sql"

for fixture in tests/legacy-*.sql; do
  name=$(basename "$fixture" .sql | tr '-' '_')
  db="check_$name"
  fresh_db "$db"
  q -d "$db" -f "$fixture" >/dev/null
  for m in $(migrations); do q -d "$db" -f "migrations/$m" >/dev/null; done
  schema "$db" > "$WORK/$name.sql"
  if diff -u "$WORK/setup.sql" "$WORK/$name.sql"; then
    echo "ok    $fixture + migrations = setup.sql"
  else
    echo "FAIL  $fixture + migrations differs from setup.sql (diff above)"
    failed=1
  fi
done

expect() {
  if [ "$(q -d "$1" -At -c "$2")" = "$3" ]; then echo "ok    $4"; else echo "FAIL  $4"; failed=1; fi
}
db=check_legacy_accounts
expect $db "select string_agg(name || ':' || (data is not null)::text || ':' || coalesce(calendar_token, '-'), ' ' order by name) from trees" \
  'Empty:false:- Reiser:true:calendar-token-0123456789' 'trees and calendar token taken over, keep-alive dummy dropped'
expect $db "select string_agg(kind || ':' || coalesce(note, '-'), ' ' order by id) from tree_backups" \
  'change:bearbeitet: Anna daily:- manual:- restore:before restoring backup 2' 'backup kinds and notes converted, orphan dropped'
expect $db "select count(*) from users where session_epoch = 2 and is_admin" '1' 'accounts taken over'
expect $db "select (select count(*) from memberships) + (select count(*) from invites) + (select count(*) from auth_tokens)" '3' \
  'memberships, invitations and tokens taken over'
expect $db "select count(*) from pg_namespace where nspname in ('legacy', 'verwaltung')" '0' 'old schemas removed'

if q -d check_setup -f migrations/v1_from_legacy.sql >/dev/null 2>&1; then
  echo "FAIL  v1_from_legacy.sql must refuse a new database"; failed=1
else echo "ok    v1_from_legacy.sql refuses a new database"; fi
if q -d check_setup -f setup.sql >/dev/null 2>&1; then
  echo "FAIL  setup.sql must refuse a database with tables"; failed=1
else echo "ok    setup.sql refuses a database with tables"; fi

for db in check_setup check_legacy_original check_legacy_accounts; do q -d postgres -c "drop database $db with (force)"; done
rm -rf "$WORK"
exit $failed
