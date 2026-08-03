-- DON'S HARDCORE GAUNTLET — its own state, separate from Davy's.
-- Applied 2026-08-03.
--
-- Don's normal runs already keep their own columns (dons_gauntlet_deepest and
-- friends) while hardcore had only the Davy set (gauntlet_hc_*). Sharing those
-- would have meant one deepest, one daily budget and one ledger across two
-- descents that scale differently, drop different chases, and now sign
-- different terms.
--
-- Additive only: nothing is dropped or renamed, so every existing Davy hardcore
-- read and write is untouched.

alter table public.profiles
  add column if not exists dons_gauntlet_hc_deepest        integer     not null default 0,
  add column if not exists dons_gauntlet_hc_deepest_died   integer     not null default 0,
  add column if not exists dons_gauntlet_hc_deepest_run    jsonb,
  add column if not exists dons_gauntlet_hc_last_run       jsonb,
  add column if not exists dons_gauntlet_hc_last_run_at    timestamptz,
  add column if not exists dons_gauntlet_hc_runs_today     integer     not null default 0,
  add column if not exists dons_gauntlet_hc_best_depth     integer     not null default 0,
  add column if not exists dons_gauntlet_hc_best_depth_ms  integer,
  add column if not exists dons_gauntlet_hc_best_depth_at  timestamptz,
  add column if not exists dons_gauntlet_hc_best_pressure  integer     not null default 0,
  add column if not exists dons_gauntlet_hc_squad          bigint[];

-- The Don's Drowned Ledger. Mirrors leaderboard_gauntlet_hardcore exactly, over
-- the new columns, so both boards rank and filter on identical rules.
create or replace view public.leaderboard_dons_gauntlet_hardcore as
  select id as user_id,
         username,
         dons_gauntlet_hc_best_depth    as score,
         dons_gauntlet_hc_best_depth_ms as time_ms,
         dons_gauntlet_hc_best_depth_at as created_at
    from public.profiles p
   where dons_gauntlet_hc_best_depth > 0
     and is_admin = false
     and username is not null;

-- REQUIRED, and easy to miss. Every other gauntlet leaderboard view carries
-- security_invoker=on; without it the view runs with the CREATOR's permissions
-- and bypasses the querying user's RLS, which the security_definer_view advisor
-- flags as an ERROR. Verified clean after applying.
alter view public.leaderboard_dons_gauntlet_hardcore set (security_invoker = on);
