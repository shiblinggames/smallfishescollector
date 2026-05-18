'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { RAID_MAP, computeRaidMap, type RaidNodeView } from '@/lib/raidMap'

type Admin = ReturnType<typeof createAdminClient>

// Combat clears are DERIVED from existing data (no raid-engine changes):
//  - 'skirmish' = profiles.has_completed_practice_raid
//  - 'pete'     = at least one row in raid_completions
// One-time nodes (milestone/shop) persist in raid_node_progress.cleared[].
async function buildClearedSet(
  admin: Admin,
  userId: string,
  profile: { has_completed_practice_raid?: boolean | null; raid_node_progress?: unknown },
): Promise<Set<string>> {
  const cleared = new Set<string>()
  if (profile.has_completed_practice_raid) cleared.add('skirmish')

  const { count: peteCount } = await admin
    .from('raid_completions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
  if ((peteCount ?? 0) > 0) cleared.add('pete')

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  for (const id of prog.cleared ?? []) cleared.add(id)
  return cleared
}

export async function getRaidMapView(): Promise<{ views: RaidNodeView[]; doubloons: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { views: [], doubloons: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()

  const doubloons = profile?.doubloons ?? 0
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
  const cleared = await buildClearedSet(admin, user.id, profile ?? {})
  return { views: computeRaidMap(cleared, doubloons, navLevel), doubloons }
}

export async function claimMilestoneNode(
  nodeId: string,
): Promise<{ doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'milestone' || !node.milestone) return { error: 'Invalid node' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already claimed' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const doubloons = profile.doubloons ?? 0
  if (doubloons < node.milestone.amount) return { error: 'Not enough doubloons' }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newDoubloons = doubloons + (node.milestone.rewardDoubloons ?? 0)

  await admin
    .from('profiles')
    .update({
      doubloons: newDoubloons,
      raid_node_progress: { ...prog, cleared: newCleared },
    })
    .eq('id', user.id)

  return { doubloons: newDoubloons }
}
