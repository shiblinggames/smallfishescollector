-- Persistent raid-map progression. Stores one-time node completion state
-- (milestone / shop nodes); combat clears are derived from existing data
-- (has_completed_practice_raid + raid_completions). Shape:
--   { "cleared": ["bilge_milestone", ...] }
-- Applied to the remote DB on 2026-05-18.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS raid_node_progress jsonb NOT NULL DEFAULT '{}'::jsonb;
