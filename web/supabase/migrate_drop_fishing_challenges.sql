-- Drop the dead async fishing-duel feature.  APPLIED 2026-08-10.
--
-- The feature was create/accept/decline duels with a wager, a trash-talk line
-- and a W-L record on /social.  Its UI and server actions were removed at some
-- earlier point; what survived was an orphaned table and one RPC that nothing
-- called.  Six rows in total -- two complete from 2026-05-02, four cancelled,
-- nothing at all since 2026-07-10.
--
-- Checked before dropping, rather than assumed:
--   * no code reference to `fishing_challenges` or `increment_challenge_score`
--     anywhere under app/, lib/ or components/
--   * no view and no function body referencing the table (the RPC below was the
--     only one, and it is dropped with it)
--   * no foreign key pointing at it
--   * no badge depends on it -- every "challenge" badge in lib/badges.ts is
--     RAID challenge mode, which is a different system entirely
--
-- It also carried RLS enabled with ZERO policies: inert to clients, but dead
-- weight that any future schema work would still have had to reason about.
--
-- The follow graph it sat beside is untouched and still live; only the duels go.

drop function if exists public.increment_challenge_score(uuid, boolean, integer);
drop table if exists public.fishing_challenges;
