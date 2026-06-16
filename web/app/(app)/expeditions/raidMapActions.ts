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
  // No FK between raid_completions.user_id and profiles, so PostgREST can't
  // auto-resolve the join. Two queries + a JS join. Table is tiny (<100 rows
  // expected for the lifetime of the game), so the extra round-trip is fine.
  const { data: allRows } = await admin
    .from('raid_completions')
    .select('raid_id, user_id, elapsed_ms')
    .order('elapsed_ms', { ascending: true })
  const rows = (allRows ?? []) as { raid_id: string; user_id: string; elapsed_ms: number }[]

  const userIds = Array.from(new Set(rows.map(r => r.user_id)))
  const { data: profileRows } = userIds.length > 0
    ? await admin.from('profiles').select('id, username, is_admin').in('id', userIds)
    : { data: [] as { id: string; username: string; is_admin: boolean | null }[] }
  const profileMap = new Map<string, { username: string; is_admin: boolean | null }>()
  for (const p of (profileRows ?? []) as { id: string; username: string; is_admin: boolean | null }[]) {
    profileMap.set(p.id, { username: p.username, is_admin: p.is_admin })
  }

  const result: Record<string, RaidRecords> = {}
  const seenClearers = new Map<string, Set<string>>() // raid_id → set of user_ids
  for (const r of rows) {
    const pr = profileMap.get(r.user_id)
    if (!pr || pr.is_admin) continue
    if (!result[r.raid_id]) {
      // First non-admin row per raid_id is the fastest (we ordered ASC).
      result[r.raid_id] = {
        fastestUsername: pr.username,
        fastestMs: r.elapsed_ms,
        yourBestMs: null,
        totalClearers: 0,
      }
    }
    const set = seenClearers.get(r.raid_id) ?? new Set<string>()
    set.add(r.user_id)
    seenClearers.set(r.raid_id, set)
  }
  for (const [raidId, set] of seenClearers) {
    if (result[raidId]) result[raidId].totalClearers = set.size
  }

  // Player's own best — folded in even if the player is admin, so a
  // dev/owner running through it for QA still sees their own time.
  for (const r of rows) {
    if (r.user_id !== userId) continue
    if (!result[r.raid_id]) {
      // Edge case: only this player (admin) has cleared. No public fastest.
      result[r.raid_id] = {
        fastestUsername: '—',
        fastestMs: 0,
        yourBestMs: r.elapsed_ms,
        totalClearers: 0,
      }
    } else if (result[r.raid_id].yourBestMs == null || r.elapsed_ms < (result[r.raid_id].yourBestMs ?? Infinity)) {
      result[r.raid_id].yourBestMs = r.elapsed_ms
    }
  }
  return result
}

export async function getRaidMapView(): Promise<{ views: RaidNodeView[]; doubloons: number; navLevel: number; raidRecords: Record<string, RaidRecords>; shipClasses: Record<string, string>; seenChapterUnlocks: string[]; raidNodeChoices: Record<string, string> }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { views: [], doubloons: 0, navLevel: 1, raidRecords: {}, shipClasses: {}, seenChapterUnlocks: [], raidNodeChoices: {} }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, ship_classes, seen_chapter_unlocks')
    .eq('id', user.id)
    .single()

  const doubloons = profile?.doubloons ?? 0
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
  const shipClasses = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const seenChapterUnlocks = (profile?.seen_chapter_unlocks as string[] | null) ?? []
  // Per-event-node "chosen option" map (raid_node_progress.choices) —
  // lets the sheet mark which card the player picked when revisiting
  // a cleared event node. Empty for any node the player hasn't run yet.
  const raidNodeProgress = (profile?.raid_node_progress as { choices?: Record<string, string> } | null) ?? {}
  const raidNodeChoices = raidNodeProgress.choices ?? {}
  const [cleared, raidRecords] = await Promise.all([
    buildClearedSet(admin, user.id, profile ?? {}),
    loadRaidRecords(admin, user.id),
  ])
  return { views: computeRaidMap(cleared, doubloons, navLevel), doubloons, navLevel, raidRecords, shipClasses, seenChapterUnlocks, raidNodeChoices }
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
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress')
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
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

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

// Choice-gated payoff (the freed-scout debt). A story-type node whose reward
// depends on a choice made at an EARLIER node (raid_node_progress.choices). If
// the prior choice matches node.payoff.requiresChoice, grant the coin + Nav XP;
// either way mark it read. Idempotent.
export async function claimScoutDebt(
  nodeId: string,
): Promise<{ met: boolean; doubloonsDelta: number; navXpDelta: number; newDoubloons: number; newExpeditionXp: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'story' || !node.payoff) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

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

  await admin.from('profiles').update(updates).eq('id', user.id)

  if (doubloonsDelta !== 0) {
    await admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsDelta,
      reason: `Raid: ${node.label}`,
    }).then(() => {}, () => {})
  }

  return { met, doubloonsDelta, navXpDelta, newDoubloons, newExpeditionXp }
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
  const { SHIP_CLASSES } = await import('@/lib/shipClasses')
  if (!(classId in SHIP_CLASSES)) return { error: 'Invalid class' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_completed_practice_raid, raid_node_progress, ship_classes')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const cleared = await buildClearedSet(admin, user.id, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const picks = (profile.ship_classes as Record<string, string> | null) ?? {}
  if (picks[node.classPick.chapterId]) return { error: 'Class already picked for this chapter' }

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

  return { ok: true }
}
