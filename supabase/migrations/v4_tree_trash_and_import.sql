-- Version 4: deleting trees and importing them.
--
-- Admins can delete a tree: it is hidden from everyone at once and can be
-- restored until an admin deletes it for good. Imports replace a tree after a
-- backup of its own kind.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 4.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '3' then
    raise exception 'This script needs database version 3.';
  end if;
end
$$;

alter table public.trees add column deleted_at timestamptz;

alter table public.tree_backups drop constraint tree_backups_kind_check;
alter table public.tree_backups
  add constraint tree_backups_kind_check check (kind in ('change', 'daily', 'manual', 'restore', 'import'));

update public.app_meta set value = '4' where key = 'schema_version';

commit;

select 'Migrated to version 4.' as result;
