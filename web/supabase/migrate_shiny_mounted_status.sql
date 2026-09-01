-- ── 'mounted' WAS NEVER A LEGAL STATUS ──────────────────────────────────────
--
-- mountGoldenTrophy has written status 'mounted' since the feature shipped on
-- 2026-06-02, and the CHECK only ever allowed hold | trophy | sold. So every
-- mount in the game's history was rejected by this constraint.
--
-- Nothing ever noticed because the write sits inside an `await Promise.all([])`
-- and supabase-js returns errors in the result object rather than throwing. The
-- sibling write set fish_collection.is_golden, so the fish went on the wall and
-- the Logbook plate appeared exactly as intended, while the shiny_catches row
-- stayed on 'hold' forever. A half-landed mount that looks complete from the
-- deck is the worst shape this bug could have taken: there was no symptom to
-- report. (actions.ts now checks both writes, so this cannot fail quietly
-- again.)
--
-- 'trophy' is plainly the value the schema intended. Widening to 'mounted'
-- instead of rewriting the code to say 'trophy': 'mounted' is the word every
-- surface in the app already uses for this — AlmanacGoldens, the Logbook plate,
-- the alreadyMounted flag — and matching the schema to the language beats
-- matching the language to a value nothing has ever written. 'trophy' stays in
-- the list rather than being dropped, because it costs nothing and this
-- migration is already the file that explains why it is unused.
alter table shiny_catches drop constraint shiny_catches_status_check;
alter table shiny_catches add constraint shiny_catches_status_check
  check (status = any (array['hold'::text, 'trophy'::text, 'mounted'::text, 'sold'::text]));

-- ── AND THE MOUNTS THAT ALREADY HAPPENED ────────────────────────────────────
--
-- 14 rows at time of writing: a golden whose species carries
-- fish_collection.is_golden but whose own row still says 'hold'. That pairing
-- can only be produced by a successful mount with a failed status write,
-- because mountGoldenTrophy is the sole writer of is_golden anywhere in the
-- codebase.
--
-- Unambiguous per row: every (user, fish) on the wall has exactly one 'hold'
-- row, so there is no question of which catch was the one mounted. Two on-wall
-- species have no shiny_catches history at all — the showcase account, seeded
-- by hand — and this join leaves them alone.
--
-- THIS IS THE PART THAT PROTECTS THE PLAYER. The sell path already refuses
-- anything that is not 'hold'; it simply had no way to know these were already
-- resolved. Left as they were, the recovery prompt would have offered fourteen
-- fish that are hanging on the wall right now and paid out full price for
-- selling them a second time.
update shiny_catches s
set status = 'mounted'
from fish_collection c
where c.user_id = s.user_id
  and c.fish_id = s.fish_id
  and c.is_golden
  and s.status = 'hold';
