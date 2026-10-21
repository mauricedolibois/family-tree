-- Version 7: members with only part of a tree.
--
-- A membership (and the invitation that leads to it) can be limited to part of the
-- tree: a start person with ancestors, descendants and side lines, as in "only this
-- line". The member edits only that part and, if set so, sees only that part. Used
-- for people who married in and add their own family. Moderators always keep the
-- whole tree.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 7.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '6' then
    raise exception 'This script needs database version 6.';
  end if;
end
$$;

alter table public.memberships add column scope jsonb;
alter table public.memberships
  add constraint memberships_scope_role check (scope is null or role in ('viewer', 'editor'));

alter table public.invites add column scope jsonb;
alter table public.invites
  add constraint invites_scope_role check (scope is null or role in ('viewer', 'editor'));

update public.app_meta set value = '7' where key = 'schema_version';

commit;

select 'Migrated to version 7.' as result;
