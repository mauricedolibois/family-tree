-- Sicherheit: Die App greift nur serverseitig mit dem Service-Role-Key zu.
-- Öffentliche Rollen (anon, authenticated) brauchen keinerlei Rechte auf die Tabellen.
revoke all on table public.families, public.family_trees, public.media,
  public.family_trees_backup, public.family_tree_drafts
  from anon, authenticated;

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
