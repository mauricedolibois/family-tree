-- Version 3: moderators. Besides viewers and editors a tree can have moderators,
-- who also invite people to the tree and manage its members.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 3.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '2' then
    raise exception 'This script needs database version 2.';
  end if;
end
$$;

alter table public.memberships drop constraint memberships_role_check;
alter table public.memberships
  add constraint memberships_role_check check (role in ('viewer', 'editor', 'moderator'));

alter table public.invites drop constraint invites_role_check;
alter table public.invites
  add constraint invites_role_check check (role in ('viewer', 'editor', 'moderator'));

update public.app_meta set value = '3' where key = 'schema_version';

commit;

select 'Migrated to version 3.' as result;
