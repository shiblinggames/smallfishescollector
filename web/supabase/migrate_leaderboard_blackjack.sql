-- Blackjack total winnings leaderboard. Score is SUM(net_delta)
-- across all settled hands per user (so doubles/splits/insurance
-- net out correctly via the existing net_delta integer column).
-- Excludes admins, hidden usernames, and anyone net-down or even
-- (only positive winnings show on the board). Ties broken by first
-- settled hand (created_at ASC convention matches the other boards).
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
  AND NOT p.is_admin
  AND agg.score > 0;
