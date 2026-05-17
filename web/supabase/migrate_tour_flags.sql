-- Move the Market in-page tour and the Tide Run tour off per-device
-- localStorage and onto per-account DB flags, matching every other tour
-- (has_seen_* + a server action). Applied to the remote DB on 2026-05-17.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_seen_market_tour boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_seen_tide_run_tour boolean NOT NULL DEFAULT false;
