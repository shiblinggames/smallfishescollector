'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { RAID_MAP, computeRaidMap, type RaidNodeView } from '@/lib/raidMap'
import { GAUNTLET_LIVE, GAUNTLET_UNLOCK_NODE } from '@/lib/gauntlet'
import { raidDamageProfile } from '@/lib/expeditions'
import { getActiveEffects, exclusiveSiblingOf, effectiveOwnedItems } from '@/lib/raidItems'
import { getRaidPlayerStats } from '@/app/(app)/raids/actions'
import { buildClearedSet } from '@/lib/raidProgress'
import { loadDeployedParty } from '@/lib/crewData'
import { musterCrewFrom, musterReport, type MusterCrew } from '@/lib/crewMuster'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { GATE_NODE_TO_LEGENDARY, slugToCardKey, type UnlockedLegendary } from '@/lib/legendaryUnlocks'
import { eyeCharge } from '@/lib/finnItems'

type Admin = ReturnType<typeof createAdminClient>

/** Per-raid social records surfaced in the raid node sheet so players see
 *  the fastest clear, their own personal best, and how many other captains
 *  have cleared it. Admins are excluded from the fastest + total tallies
 *  (their times don't represent a real player run); the player's own best
 *  always shows even if they're admin. */
export interface RaidRecords {
  fastestUsername: string
  fastestMs: number
  yourBestMs: number | null
  totalClearers: number
}

async function loadRaidRecords(
  admin: Admin,
  userId: string,
): Promise<Record<string, RaidRecords>> {
  // Aggregated in SQL (raid_records): fastest non-admin clear + username, distinct
  // non-admin clearer count, and the caller's own best — instead of pulling the
  // whole raid_completions table + a profiles.in() and joining/aggregating in JS.
  const { data } = await admin.rpc('raid_records', { uid: userId })
  const result: Record<string, RaidRecords> = {}
  for (const row of (data ?? []) as Array<{ raid_id: string; fastest_username: string | null; fastest_ms: number | null; total_clearers: number | null; your_best_ms: number | null }>) {
    result[row.raid_id] = {
      // No non-admin fastest (only the admin/QA player cleared) → the JS version's
      // "—" / 0 placeholder.
      fastestUsername: row.fastest_username ?? '—',
      fastestMs: row.fastest_ms ?? 0,
      yourBestMs: row.your_best_ms ?? null,
      totalClearers: row.total_clearers ?? 0,
    }
  }
  return result
}

export async function getRaidMapView(): Promise<{ views: RaidNodeView[]; doubloons: number; spoilFree: string | null; spoilPaid: string | null; navLevel: number; raidRecords: Record<string, RaidRecords>; shipClasses: Record<string, string>; seenChapterUnlocks: string[]; seenUltimateUnlock: boolean; raidNodeChoices: Record<string, string>; musterParty: MusterCrew[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { views: [], doubloons: 0, spoilFree: null, spoilPaid: null, navLevel: 1, raidRecords: {}, shipClasses: {}, seenChapterUnlocks: [], seenUltimateUnlock: false, raidNodeChoices: {}, musterParty: [] }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('finn_spoil_free, finn_spoil_paid, doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, ship_classes, seen_chapter_unlocks, seen_ultimate_unlock, is_admin, ancient_catches')
    .eq('id', user.id)
    .single()

  const doubloons = profile?.doubloons ?? 0
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
  const isAdmin = profile?.is_admin === true
  const shipClasses = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const seenChapterUnlocks = (profile?.seen_chapter_unlocks as string[] | null) ?? []
  const seenUltimateUnlock = profile?.seen_ultimate_unlock === true
  // Per-event-node "chosen option" map (raid_node_progress.choices) —
  // lets the sheet mark which card the player picked when revisiting
  // a cleared event node. Empty for any node the player hasn't run yet.
  const raidNodeProgress = (profile?.raid_node_progress as { choices?: Record<string, string> } | null) ?? {}
  const raidNodeChoices = raidNodeProgress.choices ?? {}
  const [cleared, raidRecords, musterParty] = await Promise.all([
    buildClearedSet(admin, user.id, profile ?? {}),
    loadRaidRecords(admin, user.id),
    loadMusterParty(admin, user.id),
  ])
  // Ancient Deep giants landed — feeds the One Last Ride gate (requiresAncients).
  const ancientsCaught = ((profile?.ancient_catches as number[] | null) ?? []).length
  return { views: computeRaidMap(cleared, doubloons, navLevel, isAdmin, ancientsCaught), doubloons, spoilFree: (profile?.finn_spoil_free as string | null) ?? null, spoilPaid: (profile?.finn_spoil_paid as string | null) ?? null, navLevel, raidRecords, shipClasses, seenChapterUnlocks, seenUltimateUnlock, raidNodeChoices, musterParty }
}

/** First-time celebration dismiss — appends the chapter id to
 *  profiles.seen_chapter_unlocks (idempotent). The celebration overlay
 *  in RaidsSection fires once when a chapter unlocks; calling this
 *  prevents it from firing again on future visits / other devices. */
export async function markChapterUnlockSeen(
  chapterId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('seen_chapter_unlocks')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const seen = (profile.seen_chapter_unlocks as string[] | null) ?? []
  if (seen.includes(chapterId)) return { ok: true } // idempotent

  await admin
    .from('profiles')
    .update({ seen_chapter_unlocks: [...seen, chapterId] })
    .eq('id', user.id)
  return { ok: true }
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
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

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
): Promise<{ ok: true; unlockedLegendary?: UnlockedLegendary } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  // 'berth' clears like a story read — its purchase is separate, optional, and
  // stays available on revisit, so reading it never gates the chain (a captain
  // who cannot afford the refit yet still sails on).
  if (!node || (node.type !== 'story' && node.type !== 'berth')) return { error: 'Invalid node' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { ok: true } // idempotent
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  // Legendary unlock: if this is a gate node, add its legendary to the recruit
  // pool now (the debut cutscene doubles as the unlock). Written in the same
  // update; surfaced back so the client can fire the "recruitable" celebration.
  const patch: Record<string, unknown> = { raid_node_progress: { ...prog, cleared: newCleared } }
  const unlockedLegendary = await applyLegendaryGate(admin, nodeId, (profile.legendary_unlocks as string[] | null) ?? [], patch)

  await admin.from('profiles').update(patch).eq('id', user.id)

  return unlockedLegendary ? { ok: true, unlockedLegendary } : { ok: true }
}

// Grant a gate node's legendary into the recruit pool, mutating `updates` with
// the new legendary_unlocks array. Returns the crew's card details for the
// client celebration, or undefined if this node gates nothing / already
// unlocked. Shared by markStoryNodeRead and claimScoutDebt (scout_debt is a
// payoff node, so Dole's gate flows through the latter).
async function applyLegendaryGate(
  admin: Admin,
  nodeId: string,
  priorUnlocks: string[],
  updates: Record<string, unknown>,
): Promise<UnlockedLegendary | undefined> {
  const gateSlug = GATE_NODE_TO_LEGENDARY[nodeId]
  if (!gateSlug || priorUnlocks.some(u => u.toLowerCase() === gateSlug)) return undefined
  updates.legendary_unlocks = [...priorUnlocks, gateSlug]
  const { data: card } = await admin.from('cards').select('name, filename').eq('slug', slugToCardKey(gateSlug)).maybeSingle()
  return {
    slug: gateSlug,
    name: (card as any)?.name ?? gateSlug,
    filename: (card as any)?.filename ?? '',
  }
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
    .select('expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const expeditionXp = (profile.expedition_xp as number | null) ?? 0
  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { expeditionXp } // idempotent — already solved
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP(expeditionXp)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const puzzleXp = node.puzzle.rewardNavXp ?? 0
  const newExpeditionXp = expeditionXp + puzzleXp
  // Node Navigation XP charges The Primeval Eye like any other nav source.
  const reelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], puzzleXp)
  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  await admin.from('profiles').update({
    expedition_xp: newExpeditionXp,
    ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
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
    .select('has_completed_practice_raid, raid_node_progress, raid_items, expedition_xp, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

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


/** The RAID party as the inspection sees it: names, levels, and which of the five
 *  check answers each hand can actually produce. Loaded from the same place the raid
 *  itself loads its crew, so what the clerk counts is exactly who sails. */
async function loadMusterParty(admin: Admin, userId: string): Promise<MusterCrew[]> {
  const { data: p } = await admin
    .from('profiles')
    .select('ship_tier, ship_classes, has_sixth_berth')
    .eq('id', userId)
    .single()
  if (!p) return []
  const ship = EXPEDITION_SHIP_STATS[(p.ship_tier as number | null) ?? 0]
  if (!ship) return []
  const classSlots = aggregateShipClasses((p.ship_classes as Record<string, string> | null) ?? {}).crewSlots
  const berth = p.has_sixth_berth === true ? 1 : 0
  const party = await loadDeployedParty(admin, userId, ship.crewSlots + classSlots + berth, 'raid')
  return party.map(musterCrewFrom)
}

/** Stand for the muster. A ROSTER gate, not a fight: the don's clerk counts your raid
 *  crew and decides whether you are worth letting near the line. Server-authoritative
 *  on every rule, and it runs the SAME pure musterReport the sheet renders, so the
 *  button can never promise a pass the server then refuses. */
export async function standForMuster(nodeId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'muster' || !node.muster) return { error: 'Invalid node' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { ok: true }   // idempotent: already passed
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const party = await loadMusterParty(admin, user.id)
  const report = musterReport(node.muster, party)
  if (!report.passed) {
    const missing = report.rows.filter(r => !r.ok).map(r => r.label)
    return { error: `The clerk shakes his head: ${missing.join('; ')}.` }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const next = [...new Set([...(prog.cleared ?? []), nodeId])]
  await admin
    .from('profiles')
    .update({ raid_node_progress: { ...prog, cleared: next } })
    .eq('id', user.id)
  return { ok: true }
}

// Event nodes: one-time decision beats with branching outcomes (see
// RaidEventChoice in lib/raidMap). Validates the choice id against
// the node, applies its outcome (doubloons / Nav XP / nothing),
// inserts a ledger row if currency was moved, persists the chosen
// option in raid_node_progress.choices so the sheet can mark it on
// revisit, and adds the node to cleared[]. Idempotent guard: refuses
// if the node is already cleared (the other options stay gone for good).
export async function pickRaidEventChoice(
  nodeId: string,
  choiceId: string,
): Promise<{ ok: true; newDoubloons?: number; newExpeditionXp?: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'event' || !node.event) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  const choice = node.event.choices.find(c => c.id === choiceId)
  if (!choice) return { error: 'Invalid choice' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newChoices = { ...(prog.choices ?? {}), [nodeId]: choiceId }

  const updates: Record<string, unknown> = {
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  }
  let newDoubloons: number | undefined
  let newExpeditionXp: number | undefined

  if (choice.outcome.type === 'doubloons') {
    newDoubloons = (profile.doubloons ?? 0) + choice.outcome.amount
    updates.doubloons = newDoubloons
  } else if (choice.outcome.type === 'navXp') {
    newExpeditionXp = (profile.expedition_xp ?? 0) + choice.outcome.amount
    updates.expedition_xp = newExpeditionXp
  }

  await admin.from('profiles').update(updates).eq('id', user.id)

  // Ledger row for doubloon-bearing outcomes. Kept best-effort — a
  // failed insert shouldn't block the choice itself from settling.
  if (choice.outcome.type === 'doubloons') {
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: choice.outcome.amount,
      reason: `Raid event: ${node.label} (${choice.label})`,
    }).then(() => {}, () => {})
  }

  return { ok: true, newDoubloons, newExpeditionXp }
}

// Branching fork — the player commits to ONE of the two routes. Records the
// choice in raid_node_progress.choices (same as an event pick) + clears the
// node + grants Nav XP. Downstream nodes gate on the recorded choice so only
// the taken route opens; the other stays fogged.
export async function pickForkRoute(
  nodeId: string,
  routeId: string,
): Promise<{ ok: true; newExpeditionXp: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'fork' || !node.fork) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  if (!node.fork.routes.some(r => r.id === routeId)) return { error: 'Invalid route' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newChoices = { ...(prog.choices ?? {}), [nodeId]: routeId }
  const newExpeditionXp = ((profile.expedition_xp as number | null) ?? 0) + node.fork.rewardNavXp
  const forkReelCharge = eyeCharge(profile as Parameters<typeof eyeCharge>[0], node.fork.rewardNavXp)

  await admin.from('profiles').update({
    expedition_xp: newExpeditionXp,
    ...(forkReelCharge !== null ? { anglers_patience_xp: forkReelCharge } : {}),
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  }).eq('id', user.id)

  return { ok: true, newExpeditionXp }
}

// Dice node (a d20 skill-check throw). The player picks ONE approach; the server
// rolls a real d20, adds a small Navigation bonus, and the total vs the option's
// DC decides win or miss. Server-rolled so the throw can't be re-rolled or
// cheated. Risk/reward is per option: a miss can move doubloons NEGATIVE (clamped
// so the purse never goes below 0), and an option can require holding the at-risk
// amount up front. One-time: records the node cleared + which option in
// raid_node_progress.choices. Returns the roll details for the reveal animation.
export async function rollDiceNode(
  nodeId: string,
  optionId: string,
): Promise<
  | { roll: number; bonus: number; total: number; dc: number; success: boolean; doubloonsDelta: number; navXpDelta: number; newDoubloons: number; newExpeditionXp: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dice' || !node.dice) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  const option = node.dice.options.find(o => o.id === optionId)
  if (!option) return { error: 'Invalid option' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already thrown' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  if (node.requiresNavLevel && navLevel < node.requiresNavLevel) return { error: 'Locked' }

  const doubloons = profile.doubloons ?? 0
  if (option.requiresDoubloons && doubloons < option.requiresDoubloons) {
    return { error: `Need ${option.requiresDoubloons.toLocaleString()} doubloons to risk it` }
  }

  const bonus = Math.min(node.dice.maxBonus, Math.floor(navLevel / node.dice.bonusPerLevels))
  const roll = 1 + Math.floor(Math.random() * 20)
  const total = roll + bonus
  const success = total >= option.dc
  const grant = success ? option.win : option.miss

  const rawDoubloons = doubloons + (grant.doubloons ?? 0)
  const newDoubloons = Math.max(0, rawDoubloons)
  const doubloonsDelta = newDoubloons - doubloons // clamped actual movement
  const navXpDelta = grant.navXp ?? 0
  const newExpeditionXp = ((profile.expedition_xp as number | null) ?? 0) + navXpDelta

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newChoices = { ...(prog.choices ?? {}), [nodeId]: optionId }

  const updates: Record<string, unknown> = {
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  }
  if (doubloonsDelta !== 0) updates.doubloons = newDoubloons
  if (navXpDelta !== 0) updates.expedition_xp = newExpeditionXp

  await admin.from('profiles').update(updates).eq('id', user.id)

  if (doubloonsDelta !== 0) {
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsDelta,
      reason: `Raid: ${node.label} (${option.label}, ${success ? 'won' : 'lost'})`,
    }).then(() => {}, () => {})
  }

  return { roll, bonus, total, dc: option.dc, success, doubloonsDelta, navXpDelta, newDoubloons, newExpeditionXp }
}

// Server-side shot-damage roll — mirrors RaidCombat.rollShotDamage exactly, off
// the shared raidDamageProfile, so the DPS check uses the player's real cannon.
function rollDpsShot(res: 'critical' | 'hit' | 'graze' | 'miss', shipMinDamage: number, totalPower: number, damagePct: number): number {
  if (res === 'miss') return 0
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage, damagePct)
  if (res === 'critical') { const min = shipMinDamage * 2; return Math.floor(Math.random() * (critMax - min + 1)) + min }
  if (res === 'hit') return Math.floor(Math.random() * (powerMax - hitMin + 1)) + hitMin
  const grazeMax = Math.max(1, Math.ceil(powerMax * 0.4))
  return Math.floor(Math.random() * grazeMax) + 1
}

// Preview for the DPS check — the player's non-crit hit range, gear/class
// multiplier, and computed odds of clearing the threshold. Read-only; the node
// sheet shows this up front so the shot is an informed call.
export async function getDpsCheckPreview(nodeId: string): Promise<
  | { rangeMin: number; rangeMax: number; mult: number; threshold: number; passChance: number; power: number; shipMinDamage: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dps_check' || !node.dpsCheck) return { error: 'Invalid node' }

  const stats = await getRaidPlayerStats(user.id)
  const dmgProfile = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods.damagePct)
  const rangeMin = dmgProfile.hitMin
  const rangeMax = dmgProfile.powerMax
  const noncritMult = getActiveEffects(stats.equippedRaidItems)
    .filter(e => e.type === 'noncrit_damage_mult').reduce((a, e) => a * e.value, 1)
  const mult = stats.classDamageMult * noncritMult
  const threshold = node.dpsCheck.threshold
  // Chance a uniform hit roll clears the threshold after the multiplier.
  const needRoll = Math.ceil(threshold / mult)
  const total = rangeMax - rangeMin + 1
  const passing = Math.max(0, rangeMax - Math.max(rangeMin, needRoll) + 1)
  const passChance = total > 0 ? Math.max(0, Math.min(100, Math.round((passing / total) * 100))) : 0
  return { rangeMin, rangeMax, mult, threshold, passChance, power: stats.totalPower, shipMinDamage: stats.shipMinDamage }
}

// DPS check node — a coin-or-stats gate (lib/raidMap RaidDpsCheck). Either PAY
// to skip, or FIRE one shot: the server rolls a straight (non-crit) hit from the
// player's real damage profile (ship + power + gear/class mults), compares to
// the threshold, and applies the outcome. Pass = free; fall short = owe failCost.
type DpsBreakdown = { roll: number; rangeMin: number; rangeMax: number; mult: number }
export async function resolveDpsCheck(
  nodeId: string,
  action: 'pay' | 'shot',
): Promise<
  | { outcome: 'paid'; newDoubloons: number }
  | { outcome: 'passed'; damage: number; threshold: number; newDoubloons: number; breakdown: DpsBreakdown }
  | { outcome: 'failed'; damage: number; threshold: number; doubloonsDelta: number; newDoubloons: number; breakdown: DpsBreakdown }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dps_check' || !node.dpsCheck) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already cleared' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  if (node.requiresNavLevel && navLevel < node.requiresNavLevel) return { error: 'Locked' }

  const dc = node.dpsCheck
  const uid = user.id
  const nodeLabel = node.label
  const doubloons = profile.doubloons ?? 0
  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  // Write the clear + a (clamped) doubloon spend + ledger row.
  async function settle(cost: number, tag: string): Promise<{ newDoubloons: number; delta: number }> {
    const newDoubloons = Math.max(0, doubloons - cost)
    const delta = newDoubloons - doubloons
    const updates: Record<string, unknown> = {
      raid_node_progress: { ...prog, cleared: newCleared, choices: { ...(prog.choices ?? {}), [nodeId]: tag } },
    }
    if (delta !== 0) updates.doubloons = newDoubloons
    await admin.from('profiles').update(updates).eq('id', uid)
    if (delta !== 0) {
      await admin.from('doubloon_transactions').insert({
        user_id: uid, amount: delta, reason: `Raid: ${nodeLabel} (${tag})`,
      }).then(() => {}, () => {})
    }
    return { newDoubloons, delta }
  }

  if (action === 'pay') {
    if (doubloons < dc.payCost) return { error: `Need ${dc.payCost.toLocaleString()} doubloons` }
    const { newDoubloons } = await settle(dc.payCost, 'paid')
    return { outcome: 'paid', newDoubloons }
  }

  // action === 'shot' — must hold the full fail cost to even attempt it (a miss
  // owes that much), so a broke captain can't risk coin they don't have.
  if (doubloons < dc.failCost) return { error: `Need ${dc.failCost.toLocaleString()} doubloons to risk the shot` }
  // No aiming — always a straight (non-critical) HIT. The hit RANGE comes from
  // the player's stats (ship + crew power), so the breakdown can show it; the
  // roll within it is the luck. Bounds mirror rollDpsShot's 'hit' branch.
  const stats = await getRaidPlayerStats(user.id)
  const dmgProfile = raidDamageProfile(stats.totalPower, stats.shipMinDamage, stats.raidMods.damagePct)
  const rangeMin = dmgProfile.hitMin
  const rangeMax = dmgProfile.powerMax
  const base = rollDpsShot('hit', stats.shipMinDamage, stats.totalPower, stats.raidMods.damagePct)
  const noncritMult = getActiveEffects(stats.equippedRaidItems)
    .filter(e => e.type === 'noncrit_damage_mult').reduce((a, e) => a * e.value, 1)
  const mult = stats.classDamageMult * noncritMult
  const damage = Math.round(base * mult)
  const passed = damage >= dc.threshold
  const breakdown: DpsBreakdown = { roll: base, rangeMin, rangeMax, mult }

  if (passed) {
    const { newDoubloons } = await settle(0, 'passed')
    return { outcome: 'passed', damage, threshold: dc.threshold, newDoubloons, breakdown }
  }
  const { newDoubloons, delta } = await settle(dc.failCost, 'failed')
  return { outcome: 'failed', damage, threshold: dc.threshold, doubloonsDelta: delta, newDoubloons, breakdown }
}

// Choice-gated payoff (the freed-scout debt). A story-type node whose reward
// depends on a choice made at an EARLIER node (raid_node_progress.choices). If
// the prior choice matches node.payoff.requiresChoice, grant the coin + Nav XP;
// either way mark it read. Idempotent.
export async function claimScoutDebt(
  nodeId: string,
): Promise<{ met: boolean; doubloonsDelta: number; navXpDelta: number; newDoubloons: number; newExpeditionXp: number; unlockedLegendary?: UnlockedLegendary } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'story' || !node.payoff) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const doubloons = profile.doubloons ?? 0
  const expeditionXp = (profile.expedition_xp as number | null) ?? 0
  const met = prog.choices?.[node.payoff.requiresChoice.nodeId] === node.payoff.requiresChoice.choiceId

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) {
    return { met, doubloonsDelta: 0, navXpDelta: 0, newDoubloons: doubloons, newExpeditionXp: expeditionXp }
  }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const grant = met ? node.payoff.grant : {}
  const doubloonsDelta = grant.doubloons ?? 0
  const navXpDelta = grant.navXp ?? 0
  const newDoubloons = doubloons + doubloonsDelta
  const newExpeditionXp = expeditionXp + navXpDelta

  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const updates: Record<string, unknown> = {
    raid_node_progress: { ...prog, cleared: newCleared },
  }
  if (doubloonsDelta !== 0) updates.doubloons = newDoubloons
  if (navXpDelta !== 0) updates.expedition_xp = newExpeditionXp

  // Dole's gate: scout_debt is a payoff node, so her unlock rides this action.
  const unlockedLegendary = await applyLegendaryGate(admin, nodeId, (profile.legendary_unlocks as string[] | null) ?? [], updates)

  await admin.from('profiles').update(updates).eq('id', user.id)

  if (doubloonsDelta !== 0) {
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsDelta,
      reason: `Raid: ${node.label}`,
    }).then(() => {}, () => {})
  }

  return { met, doubloonsDelta, navXpDelta, newDoubloons, newExpeditionXp, unlockedLegendary }
}

// Chapter-end class pick. Writes profiles.ship_classes[chapterId] =
// classId and marks the node cleared. One pick per chapter, locked in
// permanently — the action refuses if the chapter already has a class
// picked (so the four-card UI being optimistic doesn't let a player
// double-write). The node's classPick.chapterId comes from RAID_MAP.
export async function pickShipClass(
  nodeId: string,
  classId: string,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'class_pick' || !node.classPick) return { error: 'Invalid node' }
  // Server-side validation of the class id against the registry. Lazy
  // import so this server action doesn't pull SHIP_CLASSES into the
  // raid map's edge bundle when unrelated callers compile it.
  const { SHIP_CLASSES, offeredShipClassIds } = await import('@/lib/shipClasses')
  if (!(classId in SHIP_CLASSES)) return { error: 'Invalid class' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress, ship_classes, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const picks = (profile.ship_classes as Record<string, string> | null) ?? {}
  if (picks[node.classPick.chapterId]) return { error: 'Class already picked for this chapter' }
  if (node.classPick.options) {
    // Pinned menu (the Ch4 augment): the pick must be one of the node's own
    // options — the class ladder doesn't apply here.
    if (!node.classPick.options.includes(classId)) {
      return { error: 'That choice is not on this menu' }
    }
  } else if (!offeredShipClassIds(picks).includes(classId as never)) {
    // Tall-vs-wide gating: the class must actually be ON THIS PLAYER'S MENU —
    // a Mark II is only offered for a line they already sail (a Mark I they
    // own). Computed from their other picks (this chapter isn't picked yet,
    // so picks already excludes it).
    return { error: 'That class is not available to you' }
  }

  const newPicks = { ...picks, [node.classPick.chapterId]: classId }
  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  await admin
    .from('profiles')
    .update({
      ship_classes: newPicks,
      raid_node_progress: { ...prog, cleared: newCleared },
    })
    .eq('id', user.id)

  // Clearing the Chapter 2 class node = Chapter 2 done. Once the Gauntlet is
  // live, that's the unlock — let the player know it just opened. Gated on
  // GAUNTLET_LIVE so this never fires while the Gauntlet is still admin-only.
  if (GAUNTLET_LIVE && nodeId === GAUNTLET_UNLOCK_NODE) {
    try {
      await admin.from('mail_messages').insert({
        subject: 'The Locker Opens — Davy Jones Gauntlet Unlocked',
        body: "You closed out Chapter 2. Word travels fast down in the dark, and something has taken notice.\n\nThe Davy Jones Gauntlet is open to you now. Descend as deep as you dare, fighting ship after ship while one pot swells with every kill. Cash out and it's all yours. Sink before you do and it goes to the deep with you.\n\nGo as deep as you can and you'll tear loose rewards that follow you topside. Find it under Expeditions.\n\n— Davy Jones",
        sender_label: 'Davy Jones',
        target_user_id: user.id,
      })
    } catch { /* best-effort */ }
  }

  return { ok: true }
}

/**
 * THE REFIT — spend the one free re-choice of every class pick.
 *
 * Earned by putting the don under (the Chapter IV boss), spendable once, ever.
 * The picks are permanent identity by design; this exists because the tradeoffs
 * cannot be read until you have fought with them, and committing forever was
 * the only way to find that out.
 *
 * Writes `ship_classes` and NOTHING ELSE. It deliberately does not re-open the
 * class nodes on the map: the Chapter II class node IS the Gauntlet's unlock
 * gate and later chapters hang off these nodes with requiresNode, so un-clearing
 * them to make a captain "re-earn" the picks would re-lock the Gauntlet and half
 * the campaign. The map is settled history; only the loadout moves.
 */
export async function refitShipClasses(
  next: Record<string, string>,
): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_classes, ship_refit_used')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  if (profile.ship_refit_used === true) return { error: 'You have already taken your refit.' }

  // The don has to be in the ground. Read off raid_completions, the same source
  // every other Chapter IV reveal on the ship screen uses.
  const { data: throne } = await admin.from('raid_completions')
    .select('raid_id').eq('user_id', user.id).eq('raid_id', 'the_throne').maybeSingle()
  if (!throne) return { error: 'The don is still sitting on his throne.' }

  const picks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const chapters = Object.keys(picks)
  if (chapters.length === 0) return { error: 'You have no classes to refit.' }

  const { validateClassPicks } = await import('@/lib/shipClasses')
  const check = validateClassPicks(next, chapters)
  if (!check.ok) return { error: check.error }

  // SPEND IT IN THE SAME WRITE. Conditional on the flag still being false, so
  // two taps cannot both land and hand out two refits.
  const { data: written } = await admin
    .from('profiles')
    .update({ ship_classes: next, ship_refit_used: true })
    .eq('id', user.id)
    .eq('ship_refit_used', false)
    .select('id')
  if (!(written ?? []).length) return { error: 'You have already taken your refit.' }

  return { ok: true }
}
