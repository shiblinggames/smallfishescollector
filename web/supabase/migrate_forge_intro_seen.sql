-- One-time "The Forge Awakens" celebration flag (tour-persistence convention:
-- has_seen_X DB columns, never localStorage). Set true the first time the player
-- opens the Forge after unlocking it.
-- Applied to prod via MCP 2026-07-03 (migration: forge_intro_seen).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS has_seen_forge_intro boolean NOT NULL DEFAULT false;
