-- The Reef Skirmish's guided intro, seen once per account.
-- Applied to the remote project 2026-09-16 via apply_migration (skirmish_tour_seen).
alter table public.profiles add column if not exists has_seen_skirmish_tour boolean not null default false;
