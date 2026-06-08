-- Split the single user_crew.assigned_slot column into two: one slot for
-- voyages, one slot for raids. A crew can be assigned to at most ONE track
-- at a time (CHECK constraint enforces this at the row level so concurrent
-- server-action writes can't accidentally double-book a crew). Existing
-- assignments migrate to voyage_slot to preserve who's "out there" right
-- now; players can re-route to raids from the Crew Hall.

ALTER TABLE public.user_crew
  ADD COLUMN IF NOT EXISTS voyage_slot int,
  ADD COLUMN IF NOT EXISTS raid_slot   int;

-- Backfill: existing assigned_slot becomes voyage_slot.
UPDATE public.user_crew
SET voyage_slot = assigned_slot
WHERE assigned_slot IS NOT NULL AND voyage_slot IS NULL;

-- Mutual-exclusion constraint. A crew can be voyage-assigned, raid-assigned,
-- or unassigned — never both. Named so future migrations can find/drop it.
ALTER TABLE public.user_crew
  DROP CONSTRAINT IF EXISTS user_crew_one_track_only;
ALTER TABLE public.user_crew
  ADD CONSTRAINT user_crew_one_track_only
  CHECK (voyage_slot IS NULL OR raid_slot IS NULL);

-- Indexes mirroring the old assigned_slot index pattern — partial so they
-- stay cheap (most rows are unassigned).
CREATE INDEX IF NOT EXISTS idx_user_crew_voyage
  ON public.user_crew (user_id, voyage_slot)
  WHERE voyage_slot IS NOT NULL AND died_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_crew_raid
  ON public.user_crew (user_id, raid_slot)
  WHERE raid_slot IS NOT NULL AND died_at IS NULL;

-- Drop the old column. The split takes effect immediately — all server
-- actions that referenced assigned_slot need to switch to voyage_slot or
-- raid_slot in the next deploy.
ALTER TABLE public.user_crew DROP COLUMN IF EXISTS assigned_slot;

COMMENT ON COLUMN public.user_crew.voyage_slot IS
  'Slot index 0..N for the daily voyage party, or NULL if not on the voyage track. Mutually exclusive with raid_slot.';
COMMENT ON COLUMN public.user_crew.raid_slot IS
  'Slot index 0..N for the raid loadout, or NULL if not on the raid track. Mutually exclusive with voyage_slot.';
