// Which raid-map nodes a player has cleared.
//
// Lives in /lib rather than in a 'use server' file so BOTH the expeditions map
// actions and the raid loot claim can use it. (Exporting it from a 'use server'
// module would publish it as its own callable action endpoint, which is exactly the
// kind of thing we are trying to stop doing.)
import type { createAdminClient } from '@/lib/supabase/admin'
import { RAID_MAP } from '@/lib/raidMap'

type Admin = ReturnType<typeof createAdminClient>

// Combat clears are DERIVED from existing data (no raid-engine changes):
//  - 'skirmish'   = profiles.has_completed_practice_raid
//  - raid nodes   = a raid_completions row whose raid_id matches the
//                   node's RaidNode.raidId (legacy Pete rows backfilled
//                   to 'corsairs_reckoning' by the migration)
// One-time nodes (milestone/shop) persist in raid_node_progress.cleared[].
export async function buildClearedSet(
  admin: Admin,
  userId: string,
  profile: { has_completed_practice_raid?: boolean | null; raid_node_progress?: unknown },
): Promise<Set<string>> {
  const cleared = new Set<string>()
  if (profile.has_completed_practice_raid) cleared.add('skirmish')

  const { data: comps } = await admin
    .from('raid_completions')
    .select('raid_id')
    .eq('user_id', userId)
  const doneRaidIds = new Set((comps ?? []).map(r => (r as { raid_id: string }).raid_id))
  for (const node of RAID_MAP) {
    if (node.type === 'raid' && node.raidId && doneRaidIds.has(node.raidId)) {
      cleared.add(node.id)
    }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  for (const id of prog.cleared ?? []) cleared.add(id)
  return cleared
}
