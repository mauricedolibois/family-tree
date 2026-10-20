-- Version 6: admins see trees only as members.
--
-- Until now admins could open every tree without being listed among its members.
-- From this version on, access to a tree comes only from a membership. So that
-- nobody loses access with the update, every admin becomes moderator of every
-- existing tree they are not a member of yet; existing roles stay as they are.
-- Afterwards each admin removes themselves on /admin from the trees they do not
-- belong to.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 6.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '5' then
    raise exception 'This script needs database version 5.';
  end if;
end
$$;

insert into public.memberships (user_id, tree_id, role)
select u.id, t.id, 'moderator'
from public.users u
cross join public.trees t
where u.is_admin and t.deleted_at is null
on conflict (user_id, tree_id) do nothing;

update public.app_meta set value = '6' where key = 'schema_version';

commit;

select format('Migrated to version 6: admins are now members of %s trees.',
              (select count(distinct m.tree_id) from public.memberships m join public.users u on u.id = m.user_id
               where u.is_admin)) as result;
