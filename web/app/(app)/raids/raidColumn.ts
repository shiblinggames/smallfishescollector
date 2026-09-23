// The raid column's width, in its own module so the hosts (RaidGame, the
// gauntlet) can read it without statically importing RaidCombat, which they
// load as a separate chunk. RaidCombat re-exports it; see the note there.
export const RAID_COL_MAX = 720
