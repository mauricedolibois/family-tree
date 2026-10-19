-- Secret token for the birthday calendar subscription (one per family).
-- Calendar apps cannot sign in; anyone with the link sees names and birthdays of
-- living people. A new token invalidates the old link.
alter table public.families add column if not exists calendar_token text;
create unique index if not exists families_calendar_token_key on public.families (calendar_token);
