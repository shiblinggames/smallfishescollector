-- One-time crew rename. nickname is null until the player sets it once via
-- renameCrew; after that it's permanent (server action rejects further
-- renames). 30-char cap matches the username max so nameplate rows stay
-- bounded across roster cards, raid combat nameplates, public profile
-- showcases, and graveyard memorials.
ALTER TABLE public.user_crew
  ADD COLUMN IF NOT EXISTS nickname text;

ALTER TABLE public.user_crew
  DROP CONSTRAINT IF EXISTS user_crew_nickname_length;
ALTER TABLE public.user_crew
  ADD CONSTRAINT user_crew_nickname_length
  CHECK (nickname IS NULL OR (char_length(btrim(nickname)) BETWEEN 1 AND 30));

COMMENT ON COLUMN public.user_crew.nickname IS
  'Optional player-set nickname. One-shot rename — NULL until the player names them, then permanent.';
