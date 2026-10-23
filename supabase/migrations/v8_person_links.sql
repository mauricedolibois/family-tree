-- Version 8: accounts linked to people in the tree, and requests from members.
--
-- A membership can name the person in the tree the account belongs to ("that's
-- me"): set by the invitation, which names that person, or confirmed later by a
-- moderator or a close relative with a confirmed person of their own. One account
-- per person and tree. Members can ask for that link (person_claims) and for more
-- of the tree (access_requests); moderators decide.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 8.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '7' then
    raise exception 'This script needs database version 7.';
  end if;
end
$$;

alter table public.memberships add column person_id text;
alter table public.memberships add column person_confirmed_by text;
alter table public.memberships
  add constraint memberships_person_confirmed_by check (person_confirmed_by in ('invite', 'moderator', 'relative'));
alter table public.memberships
  add constraint memberships_person_confirmed check ((person_id is null) = (person_confirmed_by is null));
create unique index memberships_person on public.memberships (tree_id, person_id) where person_id is not null;

alter table public.invites add column person_id text;
alter table public.invites add constraint invites_person_tree check (person_id is null or tree_id is not null);

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

alter table public.person_claims enable row level security;
revoke all on table public.person_claims from anon, authenticated;
alter table public.access_requests enable row level security;
revoke all on table public.access_requests from anon, authenticated;

update public.app_meta set value = '8' where key = 'schema_version';

-- Let the API (PostgREST) see the new tables right away
notify pgrst, 'reload schema';

commit;

select 'Migrated to version 8.' as result;
