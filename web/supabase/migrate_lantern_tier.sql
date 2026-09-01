-- ── THE LANTERN BECOMES A LADDER ────────────────────────────────────────────
--
-- Night on the chart is a few things that EMIT while everything else stops, and
-- yours is the pool under the hull. It was a constant: every captain sailed the
-- dark with the same circle of light from their first hour. Five rungs now, and
-- the top one is exactly the light the sea already drew.
--
-- DEFAULT 4 FOR THE BACKFILL, so every existing captain keeps the night they
-- already had — nobody wakes up worse off. Then the default drops to 0 in the
-- second statement, because a column default applies to NEW rows too and a
-- captain signing up tomorrow arriving topped out would make the ladder dead on
-- arrival for exactly the people it was built for.
--
-- The CHECK matches MAX_LANTERN_TIER in lib/shipyard, and it is worth saying
-- why that is written down: a CHECK that drifted from a TypeScript ladder is
-- what silently ate 200,000 doubloons of hull refits earlier the same day.
alter table profiles
  add column if not exists lantern_tier int not null default 4;

alter table profiles
  add constraint profiles_lantern_tier_range
  check (lantern_tier >= 0 and lantern_tier <= 4);

alter table profiles alter column lantern_tier set default 0;
