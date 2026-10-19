-- The preview-only wrapper of verwaltung.wiederherstellen was created without a fixed
-- search_path (Supabase advisor: "role mutable search_path"). Pin it like the other
-- verwaltung functions so a caller's search_path cannot change what it resolves to.
alter function verwaltung.wiederherstellen(bigint) set search_path = public;
