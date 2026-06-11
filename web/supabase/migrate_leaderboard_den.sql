-- The Den leaderboards (applied 2026-06-11 as den_leaderboards_lifetime_net).
-- Both slots and roulette move to lifetime net earnings/losses, matching
-- the Blackjack board's semantics exactly.

-- Fish Slots: was "best single spin payout"; now SUM(payout - wager)
-- across every spin. Includes net-down and broke-even players — anyone
-- who has spun at least once shows up (the old score > 0 filter is
-- gone on purpose). Ties broken by first spin.
CREATE OR REPLACE VIEW public.leaderboard_fish_slots AS
SELECT
  p.id        AS user_id,
  p.username  AS username,
  agg.score   AS score,
  agg.created_at
FROM public.profiles p
JOIN (
  SELECT
    user_id,
    SUM(payout - wager)::integer AS score,
    MIN(created_at)              AS created_at
  FROM public.slot_spins
  GROUP BY user_id
) agg ON agg.user_id = p.id
WHERE p.username IS NOT NULL
  AND NOT p.is_admin;

-- Combined Den earnings (applied 2026-06-11 as leaderboard_den_combined_net):
-- one row per player summing lifetime net across all three Den games.
-- Backs the lobby's High Rollers top-3 strip. Same inclusion rules as
-- the per-game views; ties broken by earliest play anywhere in the Den.
CREATE OR REPLACE VIEW public.leaderboard_den AS
SELECT
  p.id        AS user_id,
  p.username  AS username,
  agg.score   AS score,
  agg.created_at
FROM public.profiles p
JOIN (
  SELECT
    user_id,
    SUM(net)::integer AS score,
    MIN(first_at)     AS created_at
  FROM (
    SELECT user_id, SUM(net_delta) AS net, MIN(settled_at) AS first_at
    FROM public.blackjack_hands
    WHERE status = 'settled' AND net_delta IS NOT NULL AND settled_at IS NOT NULL
    GROUP BY user_id
    UNION ALL
    SELECT user_id, SUM(payout - wager), MIN(created_at)
    FROM public.slot_spins
    GROUP BY user_id
    UNION ALL
    SELECT user_id, SUM(net_chips), MIN(created_at)
    FROM public.roulette_spins
    GROUP BY user_id
  ) g
  GROUP BY user_id
) agg ON agg.user_id = p.id
WHERE p.username IS NOT NULL
  AND NOT p.is_admin;

-- Fish Roulette: SUM(net_chips) across every spin (net_chips already
-- nets payout - wagered per spin). Same inclusion rules as above.
CREATE OR REPLACE VIEW public.leaderboard_roulette AS
SELECT
  p.id        AS user_id,
  p.username  AS username,
  agg.score   AS score,
  agg.created_at
FROM public.profiles p
JOIN (
  SELECT
    user_id,
    SUM(net_chips)::integer AS score,
    MIN(created_at)         AS created_at
  FROM public.roulette_spins
  GROUP BY user_id
) agg ON agg.user_id = p.id
WHERE p.username IS NOT NULL
  AND NOT p.is_admin;
