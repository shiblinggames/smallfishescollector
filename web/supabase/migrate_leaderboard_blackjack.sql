-- Blackjack total winnings leaderboard. Score is SUM(net_delta)
-- across all settled hands per user (so doubles/splits/insurance
-- net out correctly via the existing net_delta integer column).
-- Excludes admins + usernames-not-yet-set, but DOES include net-down
-- and broke-even players — anyone who's settled at least one hand
-- shows up. Winners on top, losers at the bottom (visualized in the
-- UI via score-sign-colored value text). Ties broken by first
-- settled hand (created_at ASC, matching the other tavern boards).
CREATE OR REPLACE VIEW public.leaderboard_blackjack AS
SELECT
  p.id        AS user_id,
  p.username  AS username,
  agg.score   AS score,
  agg.created_at
FROM public.profiles p
JOIN (
  SELECT
    user_id,
    SUM(net_delta)::integer AS score,
    MIN(settled_at)         AS created_at
  FROM public.blackjack_hands
  WHERE status = 'settled'
    AND net_delta IS NOT NULL
    AND settled_at IS NOT NULL
  GROUP BY user_id
) agg ON agg.user_id = p.id
WHERE p.username IS NOT NULL
  AND NOT p.is_admin;
