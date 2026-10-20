-- Test fixture: the last state before supabase/setup.sql: the original tables plus
-- every migration that existed then (backups, throttling, admin tools, calendar
-- subscription, personal accounts), with some data in each table.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pass_hash text not null,
  created_at timestamptz default now()
);
create table public.family_trees (
  family_id uuid primary key references public.families (id),
  tree_json jsonb,
  updated_at timestamptz default now()
);

insert into public.families (id, name, pass_hash) values
  ('11111111-1111-1111-1111-111111111111', 'Reiser', '$2b$10$abcdefghijklmnopqrstuu'),
  ('22222222-2222-2222-2222-222222222222', 'Empty', '$2b$10$abcdefghijklmnopqrstuu'),
  ('33333333-3333-3333-3333-333333333333', '__keep_alive_test_family__', 'keep_alive_dummy_hash');
insert into public.family_trees (family_id, tree_json) values
  ('11111111-1111-1111-1111-111111111111', '{"version":3,"rootId":"a","members":{"a":{"id":"a","name":"Anna","gender":"FEMALE","childrenIds":[],"profile":{"titleImageUrl":"https://supabase.example.org/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/0f0e-anna.jpg","media":[{"id":"m1","kind":"image","url":"https://supabase.example.org/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/0f0e-anna.jpg"},{"id":"m2","kind":"pdf","url":"http://supabase.example.org:8000/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/77aa-brief.pdf"}]}}}}');

-- ════ 20261017180000_backups_and_drafts.sql ════

-- Originally applied by hand on 2026-10-17; kept here for the record.

-- Tree backups (manual and automatic)
create table if not exists public.family_trees_backup (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  backed_up_at timestamptz not null default now()
);
alter table public.family_trees_backup enable row level security;

-- Prepared versions that are only applied after approval
create table if not exists public.family_tree_drafts (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.family_tree_drafts enable row level security;

-- ════ 20261017200000_security_hardening.sql ════

-- The app only accesses the database server side with the service role key, so the
-- public roles (anon, authenticated) need no rights on the tables at all.
-- Only touches tables that exist (public.media is not present in every database).
do $$
declare
  t text;
begin
  foreach t in array array['families', 'family_trees', 'media', 'family_trees_backup', 'family_tree_drafts'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- Counter for sign-in and sign-up attempts (throttles password guessing).
-- Stores hashed keys only, never names or IP addresses.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'register')),
  key_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on public.auth_attempts (kind, key_hash, created_at desc);
alter table public.auth_attempts enable row level security;
revoke all on table public.auth_attempts from anon, authenticated;

-- ════ 20261018120000_verwaltung.sql ════

-- Emergency tools: list backups, restore one, take a manual backup.
-- They live in their own schema "verwaltung" (German for administration), which is
-- not exposed through the API and can only be used from the Supabase SQL editor.
-- Schema, function names and their messages are German; the README documents them.
--
--   select * from verwaltung.staende limit 20;          -- latest backups
--   select verwaltung.wiederherstellen(NUMMER);          -- restore backup NUMMER (see 20261018130000)
--   select verwaltung.sichern('vor dem Familienfest');   -- manual backup now

create schema if not exists verwaltung;
revoke all on schema verwaltung from public, anon, authenticated;

-- All backups, newest first
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

-- Restore a backup. The current version is backed up first, so a restore can be
-- undone the same way.
create or replace function verwaltung.wiederherstellen(stand_id bigint)
returns text
language plpgsql
set search_path = public
as $$
declare
  stand public.family_trees_backup%rowtype;
  personen int;
begin
  select * into stand from public.family_trees_backup where id = stand_id;
  if not found then
    raise exception 'Einen Stand mit der Nummer % gibt es nicht.', stand_id;
  end if;

  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, format('vor dem Zurückholen von Stand %s', stand_id)
  from public.family_trees
  where family_id = stand.family_id;

  update public.family_trees
  set tree_json = stand.tree_json, updated_at = now()
  where family_id = stand.family_id;

  select count(*) into personen from jsonb_object_keys(stand.tree_json -> 'members');
  return format(
    'Stand %s vom %s ist zurückgeholt (%s Personen). Der Stand davor ist ebenfalls gesichert.',
    stand_id,
    to_char(stand.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
    personen
  );
end
$$;

-- Manually back up the current version of every family (kept forever)
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

revoke all on all tables in schema verwaltung from public, anon, authenticated;
revoke all on function verwaltung.wiederherstellen(bigint) from public, anon, authenticated;
revoke all on function verwaltung.sichern(text) from public, anon, authenticated;

-- ════ 20261018130000_wiederherstellen_mit_vorschau.sql ════

-- Restore in two steps: preview first, then confirm explicitly.
-- (On 2026-10-18 an example line was run unchanged by accident.)
--
--   select verwaltung.wiederherstellen(17);         -- preview only
--   select verwaltung.wiederherstellen(17, true);   -- actually restores backup 17

create or replace function verwaltung.wiederherstellen(stand_id bigint, wirklich boolean)
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

-- Without confirmation: preview only
create or replace function verwaltung.wiederherstellen(stand_id bigint)
returns text
language sql
as $$ select verwaltung.wiederherstellen(stand_id, false) $$;

revoke all on function verwaltung.wiederherstellen(bigint, boolean) from public, anon, authenticated;
revoke all on function verwaltung.wiederherstellen(bigint) from public, anon, authenticated;

-- ════ 20261018140000_kalender_abo.sql ════

-- Secret token for the birthday calendar subscription (one per family).
-- Calendar apps cannot sign in; anyone with the link sees names and birthdays of
-- living people. A new token invalidates the old link.
alter table public.families add column if not exists calendar_token text;
create unique index if not exists families_calendar_token_key on public.families (calendar_token);

-- ════ 20261020120000_user_accounts.sql ════

-- Personal accounts: people sign in with their own email address and can belong
-- to several family trees. A tree is still a row in `families`; its old shared
-- password is no longer used but kept, so the previous app version keeps working
-- after a rollback.
--
-- First admin, from the Supabase SQL editor once this migration is applied:
--
--   select verwaltung.admin_invite('you@example.org');
--
-- It returns a one-time link path (valid for 7 days). Open it on the app's domain
-- to create the admin account.

alter table public.families alter column pass_hash drop not null;

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
-- exists only in the link. An invite either grants a tree role, admin rights, or both.
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

-- Throttling covers the new account actions as well
alter table public.auth_attempts drop constraint if exists auth_attempts_kind_check;
alter table public.auth_attempts
  add constraint auth_attempts_kind_check check (kind in ('login', 'register', 'forgot', 'invite'));

-- Only the server (service role) talks to these tables
alter table public.users enable row level security;
alter table public.memberships enable row level security;
alter table public.invites enable row level security;
alter table public.auth_tokens enable row level security;
revoke all on table public.users, public.memberships, public.invites, public.auth_tokens from anon, authenticated;

-- First admin (or another one) from the SQL editor. Returns the path of a one-time
-- link; prefix it with the app's address. Without an address anyone with the link
-- can use it, so hand it over carefully.
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

revoke all on function verwaltung.admin_invite(text) from public, anon, authenticated;

-- ════ 20261020180000_fix_search_path.sql ════

-- The preview-only wrapper of verwaltung.wiederherstellen was created without a fixed
-- search_path (Supabase advisor: "role mutable search_path"). Pin it like the other
-- verwaltung functions so a caller's search_path cannot change what it resolves to.
alter function verwaltung.wiederherstellen(bigint) set search_path = public;

-- ════ Data ════

update public.families set calendar_token = 'calendar-token-0123456789' where name = 'Reiser';
insert into public.family_trees_backup (family_id, tree_json, note, backed_up_at) values
  ('11111111-1111-1111-1111-111111111111', '{"members":{"a":{}}}', 'automatisch: vor Änderung (bearbeitet: Anna)', now() - interval '3 days'),
  ('11111111-1111-1111-1111-111111111111', '{"members":{"a":{"profile":{"titleImageUrl":"https://supabase.example.org/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/old.jpg"}}}}', 'automatisch: tägliche Sicherung', now() - interval '2 days'),
  ('11111111-1111-1111-1111-111111111111', '{"members":{"a":{}}}', 'von Hand gesichert', now() - interval '1 day'),
  ('11111111-1111-1111-1111-111111111111', '{"members":{"a":{}}}', 'vor dem Zurückholen von Stand 2', now() - interval '1 hour'),
  ('99999999-9999-9999-9999-999999999999', '{"members":{}}', 'tree deleted since', now());
insert into public.family_tree_drafts (family_id, tree_json) values ('11111111-1111-1111-1111-111111111111', '{}');
insert into public.users (id, email, name, pass_hash, is_admin, session_epoch) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'admin@example.org', 'Admin', '$2b$12$abcdefghijklmnopqrstuu', true, 2),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'viewer@example.org', 'Viewer', '$2b$12$abcdefghijklmnopqrstuu', false, 0);
insert into public.memberships (user_id, family_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'viewer');
insert into public.invites (token_hash, family_id, role, created_by, expires_at) values
  ('hash-1', '11111111-1111-1111-1111-111111111111', 'editor', 'aaaaaaaa-0000-0000-0000-000000000001', now() + interval '3 days');
insert into public.auth_tokens (token_hash, user_id, purpose, expires_at) values
  ('hash-2', 'aaaaaaaa-0000-0000-0000-000000000002', 'reset', now() + interval '1 hour');
insert into public.auth_attempts (kind, key_hash, success) values ('login', 'hash-3', false);
