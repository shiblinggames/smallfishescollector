-- Per-player preference: whether to show the cast→bite count-up
-- timer in the waiting pill. Default ON so players get the data they
-- asked for; togglable from the Gear modal for anyone who prefers
-- the ambient / no-clock vibe.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS show_wait_timer boolean NOT NULL DEFAULT true;
