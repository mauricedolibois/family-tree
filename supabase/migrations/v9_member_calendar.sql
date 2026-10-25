-- Version 9: a birthday calendar of their own for members who see only their part.
--
-- The tree's calendar link (trees.calendar_token) holds every birthday of the tree,
-- so members whose part hides the rest were not offered it. Now each of them gets
-- a secret link of their own. Its feed is cut to what the member sees at the time
-- it is fetched: a wider or narrower part shows at the next refresh, and the link
-- stops when the membership ends, the account is disabled or the tree is deleted.
-- "Create new link" renews only the member's own link.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 9.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '8' then
    raise exception 'This script needs database version 8.';
  end if;
end
$$;

alter table public.memberships add column calendar_token text unique;

update public.app_meta set value = '9' where key = 'schema_version';

-- Let the API (PostgREST) see the new column right away
notify pgrst, 'reload schema';

commit;

select 'Migrated to version 9.' as result;
