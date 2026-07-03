-- Crash safety net for the Davy Jones Gauntlet. The run is client-authoritative,
-- so a mid-run crash used to lose everything. We now checkpoint the run's
-- resumable state (depth, boons, curses, HP, pot, etc.) between fights, and allow
-- ONE resume per run (server-owned counter, ignores any client-reported value).
-- Applied to prod via MCP 2026-07-02 (migration: gauntlet_run_state_checkpoint).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gauntlet_run_state    jsonb,
  ADD COLUMN IF NOT EXISTS gauntlet_resumes_used integer NOT NULL DEFAULT 0;
