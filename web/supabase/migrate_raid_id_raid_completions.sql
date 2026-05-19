-- Distinguish which boss raid a completion row belongs to, so the raid
-- map can derive each raid node's "cleared" state independently. Existing
-- rows backfill to Corsair's Reckoning (the only raid before this).
ALTER TABLE public.raid_completions
  ADD COLUMN IF NOT EXISTS raid_id text NOT NULL DEFAULT 'corsairs_reckoning';

CREATE INDEX IF NOT EXISTS raid_completions_user_raid_idx
  ON public.raid_completions (user_id, raid_id);
