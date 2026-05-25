'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { RAID_MAP, computeRaidMap, type RaidNodeView } from '@/lib/raidMap'

type Admin = ReturnType<typeof createAdminClient>

// Combat clears are DERIVED from existing data (no raid-engine changes):
//  - 'skirmish'   = profiles.has_completed_practice_raid
//  - raid nodes   = a raid_completions row whose raid_id matches the
//                   node's RaidNode.raidId (legacy Pete rows backfilled
//                   to 'corsairs_reckoning' by the migration)
// One-time nodes (milestone/shop) persist in raid_node_progress.cleared[].
async function buildClearedSet(
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
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already claimed' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const doubloons = profile.doubloons ?? 0
  if (doubloons < node.milestone.amount) return { error: 'Not enough doubloons' }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newDoubloons = node.milestone.spend
    ? doubloons - node.milestone.amount
    : doubloons + (node.milestone.rewardDoubloons ?? 0)

  await admin
    .from('profiles')
    .update({
      doubloons: newDoubloons,
      raid_node_progress: { ...prog, cleared: newCleared },
    })
    .eq('id', user.id)

  return { doubloons: newDoubloons }
}

// Story nodes have no fight and cost nothing — reading one marks it
// done and unlocks whatever it gates. Same persistence as milestones
// (raid_node_progress.cleared[]), no doubloon logic.
export async function markStoryNodeRead(
  nodeId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'story') return { error: 'Invalid node' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { ok: true } // idempotent
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  await admin
    .from('profiles')
    .update({ raid_node_progress: { ...prog, cleared: newCleared } })
    .eq('id', user.id)

  return { ok: true }
}

// Puzzle nodes (beacon-chain / Lights Out) are solved client-side; the server
// just records completion and grants the Nav XP (no doubloons — solving the
// network map is a navigation discovery). Same trust level as a story node —
// there's no economy-breaking payout and the puzzle is a one-time narrative
// gate. Gates (requiresNode / Nav level) are still enforced here.
export async function solvePuzzleNode(
  nodeId: string,
): Promise<{ expeditionXp: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'puzzle' || !node.puzzle) return { error: 'Invalid node' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const expeditionXp = (profile.expedition_xp as number | null) ?? 0
  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { expeditionXp } // idempotent — already solved
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP(expeditionXp)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const newExpeditionXp = expeditionXp + (node.puzzle.rewardNavXp ?? 0)
  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  await admin.from('profiles').update({
    expedition_xp: newExpeditionXp,
    raid_node_progress: { ...prog, cleared: newCleared },
  }).eq('id', user.id)

  return { expeditionXp: newExpeditionXp }
}

// Quartermaster's Cache: a one-time pick-one. The chosen raid item is
// added to raid_items permanently and the node is cleared so the other
// option is gone for good.
export async function claimQuartermasterChoice(
  nodeId: string,
  itemId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || !node.choice) return { error: 'Invalid node' }
  if (!node.choice.items.includes(itemId)) return { error: 'Invalid choice' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress, raid_items, expedition_xp')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const ownedItems = (profile.raid_items as string[] | null) ?? []
  const newItems = [...new Set([...ownedItems, itemId])]

  await admin
    .from('profiles')
    .update({
      raid_items: newItems,
      raid_node_progress: { ...prog, cleared: newCleared },
    })
    .eq('id', user.id)

  return { ok: true }
}
