-- Soft-delete columns for the crew graveyard. Lost crew used to be
-- hard-deleted from user_crew when their voyage settled; now we set
-- died_at + died_on_voyage_id instead so the crew's name / portrait
-- / rarity / traits stay accessible for a "Graveyard" memorial view
-- in the Crew Hall. Every live-roster query must add
-- `WHERE died_at IS NULL` to keep fallen crew out of active UI.
ALTER TABLE public.user_crew
  ADD COLUMN IF NOT EXISTS died_at timestamptz,
  ADD COLUMN IF NOT EXISTS died_on_voyage_id bigint REFERENCES public.daily_voyages(id) ON DELETE SET NULL;

-- Partial index so the graveyard query (rare, manual) doesn't pay
-- for a full scan and the live-roster filter (frequent, every crew
-- read) stays fast.
CREATE INDEX IF NOT EXISTS idx_user_crew_alive
  ON public.user_crew (user_id)
  WHERE died_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_crew_graveyard
  ON public.user_crew (user_id, died_at DESC)
  WHERE died_at IS NOT NULL;
