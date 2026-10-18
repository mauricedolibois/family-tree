-- Zurückholen in zwei Schritten: erst Vorschau, dann bewusst bestätigen.
-- (Am 18.10.2026 wurde eine Beispielzeile versehentlich unverändert ausgeführt.)
--
--   select verwaltung.wiederherstellen(17);         -- zeigt nur, was passieren würde
--   select verwaltung.wiederherstellen(17, true);   -- holt Stand 17 wirklich zurück

create or replace function verwaltung.wiederherstellen(stand_id bigint, wirklich boolean)
returns text
language plpgsql
set search_path = public
as $$
declare
  stand public.family_trees_backup%rowtype;
  personen_damals int;
  personen_jetzt int;
  zeit text;
begin
  select * into stand from public.family_trees_backup where id = stand_id;
  if not found then
    raise exception 'Einen Stand mit der Nummer % gibt es nicht.', stand_id;
  end if;

  select count(*) into personen_damals from jsonb_object_keys(stand.tree_json -> 'members');
  select count(*) into personen_jetzt
  from public.family_trees t, jsonb_object_keys(t.tree_json -> 'members')
  where t.family_id = stand.family_id;
  zeit := to_char(stand.backed_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI');

  if not coalesce(wirklich, false) then
    return format(
      'Vorschau, noch nichts geändert: Stand %s vom %s hat %s Personen, der Baum jetzt %s. Notiz: „%s“. Zum Zurückholen: select verwaltung.wiederherstellen(%s, true);',
      stand_id, zeit, personen_damals, personen_jetzt, coalesce(stand.note, ''), stand_id
    );
  end if;

  insert into public.family_trees_backup (family_id, tree_json, note)
  select family_id, tree_json, format('vor dem Zurückholen von Stand %s', stand_id)
  from public.family_trees
  where family_id = stand.family_id;

  update public.family_trees
  set tree_json = stand.tree_json, updated_at = now()
  where family_id = stand.family_id;

  return format(
    'Stand %s vom %s ist zurückgeholt (%s Personen). Der Stand davor ist ebenfalls gesichert.',
    stand_id, zeit, personen_damals
  );
end
$$;

-- Ohne Bestätigung nur Vorschau
create or replace function verwaltung.wiederherstellen(stand_id bigint)
returns text
language sql
as $$ select verwaltung.wiederherstellen(stand_id, false) $$;

revoke all on function verwaltung.wiederherstellen(bigint, boolean) from public, anon, authenticated;
revoke all on function verwaltung.wiederherstellen(bigint) from public, anon, authenticated;
