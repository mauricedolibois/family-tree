-- Bereits am 17.10.2026 direkt angewendet; hier zur Nachvollziehbarkeit.

-- Sicherungen von Stammbäumen (manuell und automatisch)
create table if not exists public.family_trees_backup (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  backed_up_at timestamptz not null default now()
);
alter table public.family_trees_backup enable row level security;

-- Vorbereitete Stände, die erst nach Freigabe übernommen werden
create table if not exists public.family_tree_drafts (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.family_tree_drafts enable row level security;
