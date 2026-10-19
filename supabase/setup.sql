-- Family tree database: setup and upgrade in one file.
--
-- Run the whole file in the Supabase SQL editor (or with psql). It can be run as
-- often as you like:
--   - on an empty database it creates everything the app needs;
--   - on an existing one (also the original version with one shared password per
--     family) it adds what is missing and leaves your data alone.
--
-- The app compares app_meta.schema_version with the version it needs and tells
-- admins (log, admin page, sign-in page) when this file has to be run again.
-- Everything runs in one transaction: if anything fails, nothing is changed.

begin;

-- ── Trees ────────────────────────────────────────────────────────────────────

-- One row per family tree. pass_hash is the shared family password of versions
-- before personal accounts; it is no longer used but kept for rollbacks.
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pass_hash text,
  created_at timestamptz not null default now()
);
alter table public.families alter column pass_hash drop not null;

-- Secret token of the birthday calendar subscription. Calendar apps cannot sign
-- in, so anyone with the link sees names and birthdays of living people.
alter table public.families add column if not exists calendar_token text;
create unique index if not exists families_calendar_token_key on public.families (calendar_token);

create table if not exists public.family_trees (
  family_id uuid primary key references public.families (id) on delete cascade,
  tree_json jsonb not null,
  updated_at timestamptz not null default now()
);

-- Snapshots: before every change (by the app), daily (scripts/daily-backup.mjs)
-- and by hand (verwaltung.sichern).
create table if not exists public.family_trees_backup (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  backed_up_at timestamptz not null default now()
);

-- ── Accounts ─────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text not null,
  pass_hash text not null,
  is_admin boolean not null default false,
  email_verified_at timestamptz,
  -- Raising it signs the user out everywhere: sessions carry the value they were issued with
  session_epoch integer not null default 0,
  locale text,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists users_email_key on public.users (lower(email));

-- Who may see or edit which tree. Admins may do everything without a membership.
create table if not exists public.memberships (
  user_id uuid not null references public.users (id) on delete cascade,
  family_id uuid not null references public.families (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, family_id)
);
create index if not exists memberships_family on public.memberships (family_id);

-- Invitation links. Only the SHA-256 hash of the token is stored; the token itself
-- exists only in the link. An invite grants a tree role, admin rights, or both.
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  -- When set, the account must use this address
  email text,
  family_id uuid references public.families (id) on delete cascade,
  role text check (role in ('editor', 'viewer')),
  make_admin boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  check ((family_id is null) = (role is null)),
  check (make_admin or family_id is not null)
);

-- One-time tokens for email verification and password reset (hashed like invites)
create table if not exists public.auth_tokens (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Throttles password guessing and mail flooding. Stores hashed keys only, never
-- addresses or IPs.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null,
  key_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on public.auth_attempts (kind, key_hash, created_at desc);
alter table public.auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table public.auth_attempts
  add constraint auth_attempts_kind_check check (kind in ('login', 'register', 'forgot', 'invite'));

-- ── Access ───────────────────────────────────────────────────────────────────

-- Only the app talks to these tables, server side with the service role key. The
-- public API roles get nothing, and RLS without policies blocks them as well.
do $$
declare
  t text;
begin
  foreach t in array array['families', 'family_trees', 'family_trees_backup', 'users', 'memberships',
                           'invites', 'auth_tokens', 'auth_attempts', 'app_meta'] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- Photos and documents. Only exists on Supabase (not on a plain Postgres).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict (id) do nothing;
  end if;
end
$$;

-- ── Admin tools for the SQL editor ───────────────────────────────────────────
-- Own schema, not exposed through the API. Names and messages are German; the
-- README lists them.
--
--   select * from verwaltung.staende limit 20;          -- latest backups
--   select verwaltung.wiederherstellen(17);             -- preview backup 17
--   select verwaltung.wiederherstellen(17, true);       -- restore backup 17
--   select verwaltung.sichern('vor dem Familienfest');  -- manual backup now
--   select verwaltung.admin_invite('you@example.org');  -- one-time admin link

create schema if not exists verwaltung;
revoke all on schema verwaltung from public, anon, authenticated;

create or replace view verwaltung.staende as
select
  b.id,
  to_char(b.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') as gesichert,
  f.name as familie,
  (select count(*) from jsonb_object_keys(b.tree_json -> 'members')) as personen,
  b.note as notiz
from public.family_trees_backup b
left join public.families f on f.id = b.family_id
order by b.backed_up_at desc;

-- Restores only with wirklich = true; otherwise shows a preview. The current
-- version is backed up first, so a restore can be undone the same way.
-- Older versions had a separate one-argument variant; the default replaces it.
drop function if exists verwaltung.wiederherstellen(bigint);
create or replace function verwaltung.wiederherstellen(stand_id bigint, wirklich boolean default false)
returns text
language plpgsql
set search_path = public
as $$
declare
  stand public.family_trees_backup%rowtype;
  personen_damals int;
  personen_jetzt int;
  zeit text;
begin
  select * into stand from public.family_trees_backup where id = stand_id;
  if not found then
    raise exception 'Einen Stand mit der Nummer % gibt es nicht.', stand_id;
  end if;

  select count(*) into personen_damals from jsonb_object_keys(stand.tree_json -> 'members');
  select count(*) into personen_jetzt
  from public.family_trees t, jsonb_object_keys(t.tree_json -> 'members')
  where t.family_id = stand.family_id;
  zeit := to_char(stand.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI');

  if not coalesce(wirklich, false) then
    return format(
      'Vorschau, noch nichts geändert: Stand %s vom %s hat %s Personen, der Baum jetzt %s. Notiz: „%s“. Zum Zurückholen: select verwaltung.wiederherstellen(%s, true);',
      stand_id, zeit, personen_damals, personen_jetzt, coalesce(stand.note, ''), stand_id
    );
  end if;

  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, format('vor dem Zurückholen von Stand %s', stand_id)
  from public.family_trees
  where family_id = stand.family_id;

  update public.family_trees
  set tree_json = stand.tree_json, updated_at = now()
  where family_id = stand.family_id;

  return format(
    'Stand %s vom %s ist zurückgeholt (%s Personen). Der Stand davor ist ebenfalls gesichert.',
    stand_id, zeit, personen_damals
  );
end
$$;

-- Backs up the current version of every tree (kept forever)
create or replace function verwaltung.sichern(notiz text default 'von Hand gesichert')
returns text
language plpgsql
set search_path = public
as $$
declare
  anzahl int;
begin
  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, notiz from public.family_trees;
  get diagnostics anzahl = row_count;
  return format('%s Stammbaum/Stammbäume gesichert: „%s“', anzahl, notiz);
end
$$;

-- One-time link for a new admin, valid for 7 days. Returns the path; put the
-- app's address in front. Without an address anyone with the link can use it.
-- On first start the app also writes such a link to its log, so this is only
-- needed without access to the log or for further admins.
create or replace function verwaltung.admin_invite(invite_email text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  token text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  insert into public.invites (token_hash, email, make_admin, expires_at)
  values (encode(sha256(convert_to(token, 'UTF8')), 'hex'), lower(nullif(trim(invite_email), '')), true,
          now() + interval '7 days');
  return '/invite/' || token;
end
$$;

revoke all on all tables in schema verwaltung from public, anon, authenticated;
revoke all on all functions in schema verwaltung from public, anon, authenticated;

-- ── Version ──────────────────────────────────────────────────────────────────

create table if not exists public.app_meta (
  key text primary key,
  value text not null
);
alter table public.app_meta enable row level security;
revoke all on table public.app_meta from anon, authenticated;

-- Raise together with REQUIRED_SCHEMA in app/src/lib/schema.ts. Never lowered, so an
-- older copy of this file cannot make a newer database look outdated.
insert into public.app_meta (key, value) values ('schema_version', '1')
on conflict (key) do update set value = greatest(app_meta.value::int, excluded.value::int)::text;

-- Let the API (PostgREST) see new tables right away
notify pgrst, 'reload schema';

commit;

select 'Datenbank ist eingerichtet (Version 1).' as ergebnis;
