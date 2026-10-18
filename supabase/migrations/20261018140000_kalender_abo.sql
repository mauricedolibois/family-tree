-- Geheimer Schlüssel für das Kalender-Abo der Geburtstage (pro Familie).
-- Kalender-Apps können sich nicht anmelden; wer den Link kennt, sieht Namen
-- und Geburtstage der Lebenden. Ein neuer Schlüssel macht den alten Link ungültig.
alter table public.families add column if not exists calendar_token text;
create unique index if not exists families_calendar_token_key on public.families (calendar_token);
