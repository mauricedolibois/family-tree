-- Version 2: photos and documents only through the app.
--
-- The storage bucket becomes private, so files can no longer be opened through
-- public Supabase links. The app serves them at /api/media/<tree>/<file> after
-- checking that the viewer may see the tree; links stored in trees and backups
-- are rewritten to that path. Afterwards Supabase no longer needs to be reachable
-- from the internet (see README, "Private Supabase").
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 2.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '1' then
    raise exception 'This script needs database version 1.';
  end if;
end
$$;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets set public = false where id = 'media';
  end if;
end
$$;

-- https://<supabase>/storage/v1/object/public/media/<tree>/<file>  ->  /api/media/<tree>/<file>
update public.trees
set data = regexp_replace(data::text, 'https?://[^"]*?/storage/v1/object/public/media/', '/api/media/', 'g')::jsonb
where data::text like '%/storage/v1/object/public/media/%';

update public.tree_backups
set data = regexp_replace(data::text, 'https?://[^"]*?/storage/v1/object/public/media/', '/api/media/', 'g')::jsonb
where data::text like '%/storage/v1/object/public/media/%';

update public.app_meta set value = '2' where key = 'schema_version';

commit;

select format('Migrated to version 2: %s trees with photo links rewritten.',
              (select count(*) from public.trees where data::text like '%"/api/media/%')) as result;
