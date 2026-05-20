-- Remember the bait the player last fished with so the fishing game
-- auto-selects it on next open. Stamped by the castLine server action
-- on every successful cast. Null until the player casts at least once.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_used_bait text;
