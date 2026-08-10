-- A ONE-SHOT guaranteed legendary on the next recruit roll.  APPLIED 2026-08-10.
--
-- Honoured by whichever roll the captain does first, the free daily board or a
-- gem reroll, and cleared by that same roll so it can never fire twice. The
-- free-board path clears it in the SAME update that stamps last_free_recruit_date,
-- so a second tab arriving late finds the flag already spent.
--
-- Exists so a gift or a test does not mean writing a crew straight onto
-- somebody's board. Handed the card directly the player never gets the roll,
-- and the roll is the part that is worth anything.
--
-- It forces the RARITY of slot 0 only. Which legendary appears is still drawn
-- from the player's own unlocked pool, so the campaign gate in
-- isLegendaryLocked() still applies and this can never hand out a legendary
-- whose chapter is unfinished. Service-role only, like every other grant.

alter table public.profiles
  add column if not exists crew_next_roll_legendary boolean not null default false;

comment on column public.profiles.crew_next_roll_legendary is
  'One-shot: forces slot 0 of the next recruit roll to Legendary, then clears itself.';
