-- Family tree database, version 9: everything a new installation needs.
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
  created_at timestamptz not null default now(),
  -- Set when an admin deletes the tree: it is hidden from everyone and can be
  -- restored until an admin deletes it for good (then rows and files are removed)
  deleted_at timestamptz
);

-- Earlier versions of a tree. The app takes one before every change, before an
-- import replaces the tree and once a day (app/src/lib/dailyJob.ts prunes old
-- ones by kind); admins add manual ones.
create table public.tree_backups (
  id bigint generated always as identity primary key,
  tree_id uuid not null references public.trees (id) on delete cascade,
  data jsonb not null,
  kind text not null check (kind in ('change', 'daily', 'manual', 'restore', 'import')),
  note text,
  created_at timestamptz not null default now(),
  -- Number of people, for listing versions without reading every tree
  people integer,
  -- For kind "change": what the following change did, by name (added, removed,
  -- edited, relinked, rootChanged), so the history can show it in any language
  change jsonb
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

-- Who made the change, restore or import that followed this version
alter table public.tree_backups add column created_by uuid references public.users (id) on delete set null;

-- Who may do what in which tree: viewers read, editors also change the tree,
-- moderators also invite people and manage the members of the tree. This is the
-- only way into a tree, for admins too: admin rights are about running the server,
-- and everyone who can read a tree appears among its members.
create table public.memberships (
  user_id uuid not null references public.users (id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  role text not null check (role in ('viewer', 'editor', 'moderator')),
  created_at timestamptz not null default now(),
  -- Only part of the tree (app/src/family/scope.ts): blood lines (a person with
  -- ancestors and descendants), where the part ends, exceptions, and whether the
  -- rest is hidden. Null = the whole tree. Moderators always have the whole tree:
  -- they see history and imports.
  scope jsonb,
  -- The person in the tree this account belongs to ("that's me"): named by the
  -- invitation, or confirmed by a moderator or a close relative with a confirmed
  -- person of their own. One account per person and tree.
  person_id text,
  person_confirmed_by text,
  -- Secret of the member's own birthday calendar, for members whose part hides the
  -- rest (the tree's calendar holds every birthday). Its feed shows what the member
  -- sees when it is fetched.
  calendar_token text unique,
  primary key (user_id, tree_id),
  constraint memberships_scope_role check (scope is null or role in ('viewer', 'editor')),
  constraint memberships_person_confirmed_by check (person_confirmed_by in ('invite', 'moderator', 'relative')),
  constraint memberships_person_confirmed check ((person_id is null) = (person_confirmed_by is null))
);
create index memberships_tree on public.memberships (tree_id);
create unique index memberships_person on public.memberships (tree_id, person_id) where person_id is not null;

-- Invitation links. Only the SHA-256 hash of the token is stored; the token itself
-- exists only in the link. An invite grants a tree role, admin rights, or both.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  -- When set, the account must use this address
  email text,
  tree_id uuid references public.trees (id) on delete cascade,
  role text check (role in ('viewer', 'editor', 'moderator')),
  make_admin boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references public.users (id) on delete set null,
  revoked_at timestamptz,
  -- Part of the tree the membership will get, as in memberships.scope
  scope jsonb,
  -- The person in the tree the invited account belongs to, linked on accepting
  person_id text,
  constraint invites_role_with_tree check ((tree_id is null) = (role is null)),
  constraint invites_grants_something check (make_admin or tree_id is not null),
  constraint invites_scope_role check (scope is null or role in ('viewer', 'editor')),
  constraint invites_person_tree check (person_id is null or tree_id is not null)
);

-- Members asking to be linked to a person ("that's me"); a moderator or a close
-- relative with a confirmed person decides. At most one open claim per member.
create table public.person_claims (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  person_id text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null,
  approved boolean
);
create unique index person_claims_open on public.person_claims (tree_id, user_id) where decided_at is null;

-- Members with part of a tree asking for another blood line (a locked person's
-- family); moderators decide. At most one open request per member.
create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  line jsonb not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.users (id) on delete set null,
  approved boolean
);
create unique index access_requests_open on public.access_requests (tree_id, user_id) where decided_at is null;

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
insert into public.app_meta (key, value) values ('schema_version', '9');

-- ── Access ───────────────────────────────────────────────────────────────────

-- Only the app talks to these tables, server side with the service role key. The
-- public API roles get nothing, and RLS without policies blocks them as well.
do $$
declare
  t text;
begin
  foreach t in array array['trees', 'tree_backups', 'users', 'memberships', 'invites', 'person_claims',
                           'access_requests', 'auth_tokens', 'auth_attempts', 'app_meta'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end
$$;

-- Photos and documents. Private: the app serves them at /api/media/<tree>/<file>
-- after checking that the viewer may see the tree. Only exists on Supabase (not on
-- a plain Postgres).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('media', 'media', false)
    on conflict (id) do update set public = false;
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

  insert into public.tree_backups (tree_id, data, kind, note, people)
  select id, data, 'restore', format('before restoring backup %s', backup_id), people_now
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
  insert into public.tree_backups (tree_id, data, kind, note, people)
  select id, data, 'manual', backup.note, (select count(*) from jsonb_object_keys(data -> 'members'))
  from public.trees
  where data is not null;
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

select 'Database is set up (version 8).' as result;
