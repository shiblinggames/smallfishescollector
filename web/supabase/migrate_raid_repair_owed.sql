-- Raid sink penalty. When a ship sinks in a real raid, the player owes a
-- repair fee (scaled by ship tier, see lib/expeditions.RAID_REPAIR_COST)
-- before they can raid again. 0 = ship fine. Snapshot of the fee is
-- stored here at sink time so swapping boats can't dodge the debt.
-- Applied to the remote DB on 2026-05-18.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS raid_repair_owed integer NOT NULL DEFAULT 0;
