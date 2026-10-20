-- Test fixture: the database of the original version (one shared password per
-- family), as the app created it before supabase/setup.sql existed.

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pass_hash text not null,
  created_at timestamptz default now()
);
create table public.family_trees (
  family_id uuid primary key references public.families (id),
  tree_json jsonb,
  updated_at timestamptz default now()
);

insert into public.families (id, name, pass_hash) values
  ('11111111-1111-1111-1111-111111111111', 'Reiser', '$2b$10$abcdefghijklmnopqrstuu'),
  ('22222222-2222-2222-2222-222222222222', 'Empty', '$2b$10$abcdefghijklmnopqrstuu'),
  ('33333333-3333-3333-3333-333333333333', '__keep_alive_test_family__', 'keep_alive_dummy_hash');
insert into public.family_trees (family_id, tree_json) values
  ('11111111-1111-1111-1111-111111111111', '{"version":3,"rootId":"a","members":{"a":{"id":"a","name":"Anna","gender":"FEMALE","childrenIds":[],"profile":{"titleImageUrl":"https://supabase.example.org/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/0f0e-anna.jpg","media":[{"id":"m1","kind":"image","url":"https://supabase.example.org/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/0f0e-anna.jpg"},{"id":"m2","kind":"pdf","url":"http://supabase.example.org:8000/storage/v1/object/public/media/11111111-1111-1111-1111-111111111111/77aa-brief.pdf"}]}}}}');
