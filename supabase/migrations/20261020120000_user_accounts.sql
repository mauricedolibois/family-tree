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
