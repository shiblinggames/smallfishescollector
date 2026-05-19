-- Tide Run best-distance tiebreaker: when a new personal best lands,
-- stamp the moment so the leaderboard can rank tied scores by who got
-- there first instead of by account age. Backfill existing rows to
-- profiles.created_at so current ranks don't reshuffle silently.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tide_run_best_distance_set_at timestamptz;

UPDATE public.profiles
SET tide_run_best_distance_set_at = created_at
WHERE tide_run_best_distance_set_at IS NULL
  AND COALESCE(tide_run_best_distance, 0) > 0;

-- Expose the timestamp as the view's created_at so the existing
-- actions.ts query (ORDER BY score DESC, created_at ASC) tiebreaks on
-- first-to-reach instead of account age.
CREATE OR REPLACE VIEW public.leaderboard_tide_run AS
SELECT
  id AS user_id,
  username,
  tide_run_best_distance AS score,
  COALESCE(tide_run_best_distance_set_at, created_at) AS created_at
FROM public.profiles
WHERE tide_run_best_distance > 0
  AND username IS NOT NULL
  AND NOT is_admin;

-- Fish Slots tiebreaker: ties broken by the earliest spin that hit the
-- user's best payout. No schema change needed; slot_spins.created_at
-- carries the per-spin timestamp.
CREATE OR REPLACE VIEW public.leaderboard_fish_slots AS
SELECT
  p.id AS user_id,
  p.username,
  agg.score,
  agg.created_at
FROM public.profiles p
JOIN (
  SELECT s.user_id,
         best.score,
         MIN(s.created_at) AS created_at
  FROM public.slot_spins s
  JOIN (
    SELECT user_id, MAX(payout) AS score
    FROM public.slot_spins
    GROUP BY user_id
  ) best ON best.user_id = s.user_id AND s.payout = best.score
  GROUP BY s.user_id, best.score
) agg ON agg.user_id = p.id
WHERE p.username IS NOT NULL
  AND NOT p.is_admin
  AND agg.score > 0;
