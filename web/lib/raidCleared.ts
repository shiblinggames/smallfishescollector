// Which raid-map nodes a player has cleared, against any store that can list
// the raids cleared. Pure (no server in it), so the offline core can use it;
// lib/raidProgress wraps it with the Supabase store for the web.

import { RAID_MAP } from '@/lib/raidMap'

/** buildClearedSet against any store that can list the raids cleared. */
export async function buildClearedSetVia(
  db: { clearedRaidIds(uid: string): Promise<string[]> },
  userId: string,
  profile: { has_completed_practice_raid?: boolean | null; raid_node_progress?: unknown },
): Promise<Set<string>> {
  const cleared = new Set<string>()
  if (profile.has_completed_practice_raid) cleared.add('skirmish')

  const doneRaidIds = new Set(await db.clearedRaidIds(userId))
  for (const node of RAID_MAP) {
    if (node.type === 'raid' && node.raidId && doneRaidIds.has(node.raidId)) {
      cleared.add(node.id)
    }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  for (const id of prog.cleared ?? []) cleared.add(id)
  return cleared
}
