-- The Forge: recipes are LEARNED with Fathoms before they can be forged (the
-- repeatable meta sink). Stores learned recipe result-ids. The Forge itself is
-- gated separately by the 'forge' Locker upgrade (hasForge).
-- Applied to prod via MCP 2026-07-03 (migration: forge_recipes_learned).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS forge_recipes_learned text[] NOT NULL DEFAULT '{}';
