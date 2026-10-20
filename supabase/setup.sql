-- Family tree database, version 1: everything a new installation needs.
--
-- Run the whole file once in the Supabase SQL editor (or with psql) on a database
-- without family tree tables. Existing installations do not use this file; they
-- run the scripts in supabase/migrations/ instead (see README, "Database").
-- Everything runs in one transaction: if anything fails, nothing is changed.

begin;

do $$
begin
  if to_regclass('public.trees') is not null or to_regclass('public.families') is not null then
    raise exception 'This database already has family tree tables. Use the scripts in supabase/migrations/ instead.';
  end if;
end
$$;

-- ── Trees ────────────────────────────────────────────────────────────────────

create table public.trees (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- The tree itself (see app/src/storage/schema.ts); null until it is first opened
  data jsonb,
  -- Doubles as the version for saving: a save only succeeds on the version it started from
  updated_at timestamptz not null default now(),
  -- Secret of the birthday calendar subscription. Calendar apps cannot sign in, so
  -- anyone with the link sees names and birthdays of living people.
  calendar_token text unique,
  created_at timestamptz not null default now()
);

-- Earlier versions of a tree. The app takes one before every change and once a
-- day (scripts/daily-backup.mjs prunes old ones by kind); admins add manual ones.
create table public.tree_backups (
  id bigint generated always as identity primary key,
  tree_id uuid not null references public.trees (id) on delete cascade,
  data jsonb not null,
  kind text not null check (kind in ('change', 'daily', 'manual', 'restore')),
  note text,
  created_at timestamptz not null default now()
);
create index tree_backups_tree on public.tree_backups (tree_id, created_at desc);

-- ── Accounts ─────────────────────────────────────────────────────────────────

create table public.users (
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
create unique index users_email_key on public.users (lower(email));

-- Who may see or edit which tree. Admins may do everything without a membership.
create table public.memberships (
  user_id uuid not null references public.users (id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  role text not null check (role in ('editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (user_id, tree_id)
);
create index memberships_tree on public.memberships (tree_id);

-- Invitation links. Only the SHA-256 hash of the token is stored; the token itself
-- exists only in the link. An invite grants a tree role, admin rights, or both.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  -- When set, the account must use this address
  email text,
  tree_id uuid references public.trees (id) on delete cascade,
  role text check (role in ('editor', 'viewer')),
  make_admin boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  constraint invites_role_with_tree check ((tree_id is null) = (role is null)),
  constraint invites_grants_something check (make_admin or tree_id is not null)
);

-- One-time tokens for email verification and password reset (hashed like invites)
create table public.auth_tokens (
  token_hash text primary key,
  user_id uuid not null references public.users (id) on delete cascade,
  purpose text not null check (purpose in ('verify', 'reset')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Throttles password guessing and mail flooding. Stores hashed keys only, never
-- addresses or IPs.
create table public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'register', 'forgot', 'invite')),
  key_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index auth_attempts_lookup on public.auth_attempts (kind, key_hash, created_at desc);

-- Version of this schema; the app checks it and asks for migrations when needed
create table public.app_meta (
  key text primary key,
  value text not null
);
insert into public.app_meta (key, value) values ('schema_version', '1');

-- ── Access ───────────────────────────────────────────────────────────────────

-- Only the app talks to these tables, server side with the service role key. The
-- public API roles get nothing, and RLS without policies blocks them as well.
do $$
declare
  t text;
begin
  foreach t in array array['trees', 'tree_backups', 'users', 'memberships', 'invites', 'auth_tokens',
                           'auth_attempts', 'app_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
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
-- Own schema, not exposed through the API:
--
--   select * from admin.backups limit 20;              -- latest backups
--   select admin.restore(17);                          -- preview backup 17
--   select admin.restore(17, true);                    -- restore backup 17
--   select admin.backup('before the family reunion');  -- manual backup of every tree
--   select admin.invite_admin('you@example.org');      -- one-time link for a new admin

create schema admin;
revoke all on schema admin from public, anon, authenticated;

create view admin.backups as
select
  b.id,
  to_char(b.created_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as taken,
  t.name as tree,
  (select count(*) from jsonb_object_keys(b.data -> 'members')) as people,
  b.kind,
  b.note
from public.tree_backups b
join public.trees t on t.id = b.tree_id
order by b.created_at desc;

-- Restores only with confirm = true; otherwise shows what would happen. The
-- current version is backed up first, so a restore can be undone the same way.
create function admin.restore(backup_id bigint, confirm boolean default false)
returns text
language plpgsql
set search_path = public
as $$
declare
  b public.tree_backups%rowtype;
  people_then int;
  people_now int;
  taken text;
begin
  select * into b from public.tree_backups where id = backup_id;
  if not found then
    raise exception 'There is no backup %.', backup_id;
  end if;

  select count(*) into people_then from jsonb_object_keys(b.data -> 'members');
  select count(*) into people_now from public.trees t, jsonb_object_keys(t.data -> 'members') where t.id = b.tree_id;
  taken := to_char(b.created_at at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI');

  if not confirm then
    return format(
      'Preview, nothing changed: backup %s from %s has %s people, the tree now has %s. Note: "%s". To restore: select admin.restore(%s, true);',
      backup_id, taken, people_then, people_now, coalesce(b.note, ''), backup_id
    );
  end if;

  insert into public.tree_backups (tree_id, data, kind, note)
  select id, data, 'restore', format('before restoring backup %s', backup_id)
  from public.trees
  where id = b.tree_id and data is not null;

  update public.trees set data = b.data, updated_at = now() where id = b.tree_id;

  return format('Backup %s from %s is restored (%s people). The version before is backed up too.',
                backup_id, taken, people_then);
end
$$;

-- Backs up the current version of every tree (manual backups are kept forever)
create function admin.backup(note text default null)
returns text
language plpgsql
set search_path = public
as $$
declare
  n int;
begin
  insert into public.tree_backups (tree_id, data, kind, note)
  select id, data, 'manual', backup.note from public.trees where data is not null;
  get diagnostics n = row_count;
  return format('%s tree(s) backed up.', n);
end
$$;

-- One-time link for a new admin, valid for 7 days. Returns the path; put the
-- app's address in front. Without an address anyone with the link can use it.
-- While no account exists the app writes such a link to its log on every start,
-- so this is only needed without access to the log or for further admins.
create function admin.invite_admin(invite_email text default null)
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

revoke all on all tables in schema admin from public, anon, authenticated;
revoke all on all functions in schema admin from public, anon, authenticated;

-- Let the API (PostgREST) see the new tables right away
notify pgrst, 'reload schema';

commit;

select 'Database is set up (version 1).' as result;
