-- First-visit walkthrough for the Fishing hub, matching the Expeditions one.
-- A DB column rather than localStorage, so it follows the player across devices
-- and a reinstall does not replay the tour.
--
-- Applied 2026-08-06.
alter table profiles
  add column if not exists has_seen_fishing_hub_tour boolean not null default false;
