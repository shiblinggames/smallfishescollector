-- Crew leveling system: per-crew XP column on user_crew. Level is derived in
-- lib/crewLevel.ts (no level column — derived from xp to keep one source of
-- truth, mirroring how player fishing_xp / expedition_xp are handled).
--
-- Crew gain XP using the SAME rules the player does: every kill in a raid
-- pays the same XP to the player and to each alive crew member; voyages pay
-- the player's full voyageXP() to every surviving crew. Practice raid mirrors
-- the player's 25 XP per kill. Dead crew earn nothing after death.
--
-- Curve lives entirely in code: BASE_GAP=6, GAP_GROWTH=1.086, MAX_LEVEL=100.
-- Same shape as the player's nav curve but 1/10 the magnitude
-- (player Lv 100 = 2,458,518 XP; crew Lv 100 = 245,810 XP).
ALTER TABLE public.user_crew
  ADD COLUMN IF NOT EXISTS xp int NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.user_crew.xp IS
  'Cumulative XP earned by this crew member. Level is derived via lib/crewLevel.ts. Mirrors player XP gain rules: crew gains the same XP the player earns from each raid kill / completed voyage they were alive for.';
