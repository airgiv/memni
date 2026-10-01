-- Мемме: photo analysis, replaceable payment adapters and billing country.
-- draft_assignments.look stays jsonb; its shape is now
--   { outfit: { optionId, resolvedPresetId?, text? }, appearance: { mode, presentation?, description? } }
-- (older {clothing, presetId} looks are migrated on read by the app).

alter table public.person_photos add column if not exists analysis jsonb;

alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('test_paid', 'paid', 'refunded'));
alter table public.purchases add column if not exists billing_country text;
