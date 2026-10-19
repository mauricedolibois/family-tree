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
