-- Originally applied by hand on 2026-10-17; kept here for the record.

-- Tree backups (manual and automatic)
create table if not exists public.family_trees_backup (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  backed_up_at timestamptz not null default now()
);
alter table public.family_trees_backup enable row level security;

-- Prepared versions that are only applied after approval
create table if not exists public.family_tree_drafts (
  id bigint generated always as identity primary key,
  family_id uuid not null,
  tree_json jsonb not null,
  note text,
  created_at timestamptz not null default now()
);
alter table public.family_tree_drafts enable row level security;
