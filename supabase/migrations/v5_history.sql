-- Version 5: history. Every version of a tree records who made the change that
-- followed it, how many people it has and, for changes, what they did by name, so
-- the history page can list versions quickly and in every language.
--
-- Run the whole file once in the Supabase SQL editor, together with deploying the
-- app version that needs database version 5.

begin;

do $$
begin
  if to_regclass('public.app_meta') is null
     or (select value from public.app_meta where key = 'schema_version') is distinct from '4' then
    raise exception 'This script needs database version 4.';
  end if;
end
$$;

alter table public.tree_backups add column people integer;
alter table public.tree_backups add column change jsonb;
alter table public.tree_backups add column created_by uuid references public.users (id) on delete set null;

-- Existing versions: count their people once
update public.tree_backups set people = (select count(*) from jsonb_object_keys(data -> 'members'));

-- The admin tools record the number of people as well
create or replace function admin.restore(backup_id bigint, confirm boolean default false)
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

create or replace function admin.backup(note text default null)
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

revoke all on all functions in schema admin from public, anon, authenticated;

update public.app_meta set value = '5' where key = 'schema_version';

commit;

select 'Migrated to version 5.' as result;
