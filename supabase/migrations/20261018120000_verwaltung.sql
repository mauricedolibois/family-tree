-- Werkzeuge für den Notfall: gesicherte Stände ansehen, zurückholen und von Hand sichern.
-- Liegen im eigenen Schema „verwaltung“, das nicht über die API erreichbar ist –
-- nutzbar nur im SQL-Editor von Supabase.
--
--   select * from verwaltung.staende limit 20;          -- letzte Stände
--   select verwaltung.wiederherstellen(123);             -- Stand 123 zurückholen
--   select verwaltung.sichern('vor dem Familienfest');   -- jetzt von Hand sichern

create schema if not exists verwaltung;
revoke all on schema verwaltung from public, anon, authenticated;

-- Alle gesicherten Stände, neueste zuerst
create or replace view verwaltung.staende as
select
  b.id,
  to_char(b.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI') as gesichert,
  f.name as familie,
  (select count(*) from jsonb_object_keys(b.tree_json -> 'members')) as personen,
  b.note as notiz
from public.family_trees_backup b
left join public.families f on f.id = b.family_id
order by b.backed_up_at desc;

-- Einen gesicherten Stand zurückholen. Der aktuelle Stand wird vorher selbst gesichert,
-- das Zurückholen lässt sich also ebenso wieder rückgängig machen.
create or replace function verwaltung.wiederherstellen(stand_id bigint)
returns text
language plpgsql
set search_path = public
as $$
declare
  stand public.family_trees_backup%rowtype;
  personen int;
begin
  select * into stand from public.family_trees_backup where id = stand_id;
  if not found then
    raise exception 'Einen Stand mit der Nummer % gibt es nicht.', stand_id;
  end if;

  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, format('vor dem Zurückholen von Stand %s', stand_id)
  from public.family_trees
  where family_id = stand.family_id;

  update public.family_trees
  set tree_json = stand.tree_json, updated_at = now()
  where family_id = stand.family_id;

  select count(*) into personen from jsonb_object_keys(stand.tree_json -> 'members');
  return format(
    'Stand %s vom %s ist zurückgeholt (%s Personen). Der Stand davor ist ebenfalls gesichert.',
    stand_id,
    to_char(stand.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
    personen
  );
end
$$;

-- Den aktuellen Stand aller Familien von Hand sichern (bleibt für immer)
create or replace function verwaltung.sichern(notiz text default 'von Hand gesichert')
returns text
language plpgsql
set search_path = public
as $$
declare
  anzahl int;
begin
  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, notiz from public.family_trees;
  get diagnostics anzahl = row_count;
  return format('%s Stammbaum/Stammbäume gesichert: „%s“', anzahl, notiz);
end
$$;

revoke all on all tables in schema verwaltung from public, anon, authenticated;
revoke all on function verwaltung.wiederherstellen(bigint) from public, anon, authenticated;
revoke all on function verwaltung.sichern(text) from public, anon, authenticated;
