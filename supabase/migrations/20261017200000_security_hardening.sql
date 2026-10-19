-- Sicherheit: Die App greift nur serverseitig mit dem Service-Role-Key zu.
-- Öffentliche Rollen (anon, authenticated) brauchen keinerlei Rechte auf die Tabellen.
-- Nur vorhandene Tabellen (public.media gibt es nicht in jeder Datenbank).
do $$
declare
  t text;
begin
  foreach t in array array['families', 'family_trees', 'media', 'family_trees_backup', 'family_tree_drafts'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end
$$;

-- Zähler für Login- und Registrierungsversuche (Bremse gegen Passwort-Raten).
-- Gespeichert werden nur gehashte Schlüssel, keine Namen oder IP-Adressen.
create table if not exists public.auth_attempts (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('login', 'register')),
  key_hash text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists auth_attempts_lookup on public.auth_attempts (kind, key_hash, created_at desc);
alter table public.auth_attempts enable row level security;
revoke all on table public.auth_attempts from anon, authenticated;
