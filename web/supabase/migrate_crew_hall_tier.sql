-- Crew Hall upgrade ladder: tier 1 (base) .. 5. Higher tiers make new
-- recruits start at higher levels (Lv 1/3/5/7/10 — see lib/crewHall.ts).
-- Only ever written by the service-role upgradeCrewHall action; read
-- alongside other profile fields already covered by the profiles RLS
-- policies. Applied to the live project 2026-06-10.
alter table public.profiles add column if not exists crew_hall_tier int not null default 1;
