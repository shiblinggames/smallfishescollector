// ── THE CAMPAIGN MAP, CORE (Steam prep, 2026-09-29) ──
//
// The raid map's nodes with nothing of the web in them: the map view, the
// milestones, story reads and legendary gates, puzzles, the Quartermaster's
// pick, the muster, events, forks, the dice, the DPS gate, the scout's debt,
// the chapter class picks and the refit, and the Sunken Hand's spoils. Each
// takes the store (RaidData) and the captain's id. On the web the server
// actions (expeditions/raidMapActions, expeditions/spoilsActions) check the
// session and hand these the Supabase store; offline, the local save's.
//
// Moved verbatim out of those actions. The only edits: the session read became
// `uid`; the wallet and owned lists became store operations; the cleared set,
// the party and the loadout take the store.

import { inCaptainsWater } from '@/lib/captainWater'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { RAID_MAP, computeRaidMap, type RaidNodeView } from '@/lib/raidMap'
import { GAUNTLET_LIVE, GAUNTLET_UNLOCK_NODE } from '@/lib/gauntlet'
import { getRaidPlayerStatsVia } from '@/lib/raidLoadout'
import { buildClearedSetVia } from '@/lib/raidCleared'
import { loadDeployedPartyVia } from '@/lib/crewData'
import { musterCrewFrom, musterReport, type MusterCrew } from '@/lib/crewMuster'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { GATE_NODE_TO_LEGENDARY, slugToCardKey, type UnlockedLegendary } from '@/lib/legendaryUnlocks'
import { eyeCharge } from '@/lib/finnItems'
import { mapNodeRefusal, throwDice, dpsPreview, dpsShot } from '@/lib/raidRules'
import { SPOILS_PRICE } from '@/lib/shipBerth'
import type { RaidData } from '@/lib/data/raidData'

/**
 * ── A NODE CLEARS ONCE, AND ONLY THE CLEAR THAT LANDS PAYS ──────────────────
 *
 * Every paying node read the cleared set, then wrote raid_node_progress. Two
 * requests fired together both passed the read, so the clear has to be the
 * one-shot: this writes `patch` only while raid_node_progress is still exactly
 * the value this request read (or still null). A twin that cleared first
 * changed it, so the second write matches nothing and returns false, and the
 * caller pays nothing. Balances are NOT in the patch: callers move them in place
 * after this returns true (or spend first as the guard and refund on false).
 */
async function commitNodeClear(
  db: RaidData,
  userId: string,
  readProgress: unknown,
  patch: Record<string, unknown>,
): Promise<boolean> {
  return db.updateProfileIf(userId, patch, [readProgress == null
    ? { col: 'raid_node_progress', is: null }
    : { col: 'raid_node_progress', eq: JSON.stringify(readProgress) }])
}

/** Nav XP in place. */
async function addNavXp(db: RaidData, userId: string, n: number): Promise<void> {
  if (n > 0) await db.bumpStat(userId, 'expedition_xp', n)
}

/** Per-raid social records surfaced in the raid node sheet so players see
 *  the fastest clear, their own personal best, and how many other captains
 *  have cleared it. Admins are excluded from the fastest + total tallies; the
 *  player's own best always shows even if they're admin. */
export interface RaidRecords {
  fastestUsername: string
  fastestMs: number
  yourBestMs: number | null
  totalClearers: number
}

async function loadRaidRecords(db: RaidData, userId: string): Promise<Record<string, RaidRecords>> {
  // Aggregated in the store (raid_records): fastest non-admin clear + username,
  // distinct non-admin clearer count, and the caller's own best.
  const data = await db.raidRecords(userId)
  const result: Record<string, RaidRecords> = {}
  for (const row of data as Array<{ raid_id: string; fastest_username: string | null; fastest_ms: number | null; total_clearers: number | null; your_best_ms: number | null }>) {
    result[row.raid_id] = {
      // No non-admin fastest (only the admin/QA player cleared) → "—" / 0.
      fastestUsername: row.fastest_username ?? '—',
      fastestMs: row.fastest_ms ?? 0,
      yourBestMs: row.your_best_ms ?? null,
      totalClearers: row.total_clearers ?? 0,
    }
  }
  return result
}

export type RaidMapView = { views: RaidNodeView[]; doubloons: number; spoilFree: string | null; spoilPaid: string | null; navLevel: number; raidRecords: Record<string, RaidRecords>; shipClasses: Record<string, string>; seenChapterUnlocks: string[]; seenUltimateUnlock: boolean; raidNodeChoices: Record<string, string>; musterParty: MusterCrew[] }
export const NO_MAP_VIEW: RaidMapView = { views: [], doubloons: 0, spoilFree: null, spoilPaid: null, navLevel: 1, raidRecords: {}, shipClasses: {}, seenChapterUnlocks: [], seenUltimateUnlock: false, raidNodeChoices: {}, musterParty: [] }

export async function getRaidMapView(db: RaidData, uid: string): Promise<RaidMapView> {
  const profile = await db.profile(uid, 'finn_spoil_free, finn_spoil_paid, doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, ship_classes, seen_chapter_unlocks, seen_ultimate_unlock, is_admin, ancient_catches, is_premium, premium_expires_at')

  const doubloons = profile?.doubloons ?? 0
  const navLevel = getLevelFromXP(profile?.expedition_xp ?? 0)
  const isAdmin = profile?.is_admin === true
  const shipClasses = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const seenChapterUnlocks = (profile?.seen_chapter_unlocks as string[] | null) ?? []
  const seenUltimateUnlock = profile?.seen_ultimate_unlock === true
  // Per-event-node "chosen option" map (raid_node_progress.choices) — lets the
  // sheet mark which card the player picked when revisiting a cleared node.
  const raidNodeProgress = (profile?.raid_node_progress as { choices?: Record<string, string> } | null) ?? {}
  const raidNodeChoices = raidNodeProgress.choices ?? {}
  const [cleared, raidRecords, musterParty] = await Promise.all([
    buildClearedSetVia(db, uid, profile ?? {}),
    loadRaidRecords(db, uid),
    loadMusterParty(db, uid),
  ])
  // Ancient Deep giants landed — feeds the One Last Ride gate (requiresAncients).
  const ancientsCaught = ((profile?.ancient_catches as number[] | null) ?? []).length
  return { views: computeRaidMap(cleared, doubloons, navLevel, isAdmin, ancientsCaught, { captain: inCaptainsWater(profile) }), doubloons, spoilFree: (profile?.finn_spoil_free as string | null) ?? null, spoilPaid: (profile?.finn_spoil_paid as string | null) ?? null, navLevel, raidRecords, shipClasses, seenChapterUnlocks, seenUltimateUnlock, raidNodeChoices, musterParty }
}

/** First-time celebration dismiss — appends the chapter id to
 *  profiles.seen_chapter_unlocks (idempotent), so the overlay fires once. */
export async function markChapterUnlockSeen(db: RaidData, uid: string, chapterId: string): Promise<{ ok: true } | { error: string }> {
  const profile = await db.profile(uid, 'seen_chapter_unlocks')
  if (!profile) return { error: 'Profile not found' }

  const seen = (profile.seen_chapter_unlocks as string[] | null) ?? []
  if (seen.includes(chapterId)) return { ok: true } // idempotent

  await db.updateProfile(uid, { seen_chapter_unlocks: [...seen, chapterId] })
  return { ok: true }
}

export async function claimMilestoneNode(db: RaidData, uid: string, nodeId: string): Promise<{ doubloons: number } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'milestone' || !node.milestone) return { error: 'Invalid node' }

  const profile = await db.profile(uid, 'doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
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

  // A paid milestone spends FIRST (the guard); a reward milestone pays only
  // after its clear has landed.
  const cost = node.milestone.spend ? node.milestone.amount : 0
  if (cost > 0 && (await db.spend(uid, 'doubloons', cost)) == null) return { error: 'Not enough doubloons' }
  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, { raid_node_progress: { ...prog, cleared: newCleared } })
  if (!ok) {
    if (cost > 0) await db.grant(uid, 'doubloons', cost)
    return { error: 'Already claimed' }
  }
  const newDoubloons = await db.grant(uid, 'doubloons', node.milestone.spend ? 0 : (node.milestone.rewardDoubloons ?? 0))

  return { doubloons: newDoubloons }
}

// Story nodes have no fight and cost nothing — reading one marks it done and
// unlocks whatever it gates. Same persistence as milestones
// (raid_node_progress.cleared[]), no doubloon logic.
export async function markStoryNodeRead(db: RaidData, uid: string, nodeId: string): Promise<{ ok: true; unlockedLegendary?: UnlockedLegendary } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  // 'berth' clears like a story read — its purchase is separate, optional, and
  // stays available on revisit, so reading it never gates the chain.
  if (!node || (node.type !== 'story' && node.type !== 'berth')) return { error: 'Invalid node' }

  const profile = await db.profile(uid, 'has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
  if (cleared.has(nodeId)) return { ok: true } // idempotent
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  // Legendary unlock: if this is a gate node, add its legendary to the recruit
  // pool now (the debut cutscene doubles as the unlock). Written in the same
  // update; surfaced back so the client can fire the "recruitable" celebration.
  const patch: Record<string, unknown> = { raid_node_progress: { ...prog, cleared: newCleared } }
  const unlockedLegendary = await applyLegendaryGate(db, nodeId, (profile.legendary_unlocks as string[] | null) ?? [], patch)

  await db.updateProfile(uid, patch)

  return unlockedLegendary ? { ok: true, unlockedLegendary } : { ok: true }
}

// Grant a gate node's legendary into the recruit pool, mutating `updates` with
// the new legendary_unlocks array. Returns the crew's card details for the
// client celebration, or undefined if this node gates nothing / already
// unlocked. Shared by markStoryNodeRead and claimScoutDebt.
async function applyLegendaryGate(
  db: RaidData,
  nodeId: string,
  priorUnlocks: string[],
  updates: Record<string, unknown>,
): Promise<UnlockedLegendary | undefined> {
  const gateSlug = GATE_NODE_TO_LEGENDARY[nodeId]
  if (!gateSlug || priorUnlocks.some(u => u.toLowerCase() === gateSlug)) return undefined
  updates.legendary_unlocks = [...priorUnlocks, gateSlug]
  const card = await db.cardByKey(slugToCardKey(gateSlug))
  return {
    slug: gateSlug,
    name: card?.name ?? gateSlug,
    filename: card?.filename ?? '',
  }
}

// Puzzle nodes (beacon-chain / Lights Out) are solved client-side; the server
// just records completion and grants the Nav XP. Gates (requiresNode / Nav
// level) are still enforced here.
export async function solvePuzzleNode(db: RaidData, uid: string, nodeId: string): Promise<{ expeditionXp: number } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'puzzle' || !node.puzzle) return { error: 'Invalid node' }

  const profile = await db.profile(uid, 'expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const expeditionXp = (profile.expedition_xp as number | null) ?? 0
  const cleared = await buildClearedSetVia(db, uid, profile)
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

  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, {
    ...(reelCharge !== null ? { anglers_patience_xp: reelCharge } : {}),
    raid_node_progress: { ...prog, cleared: newCleared },
  })
  if (!ok) return { expeditionXp } // a twin solved it first; it paid
  await addNavXp(db, uid, puzzleXp)

  return { expeditionXp: newExpeditionXp }
}

// Quartermaster's Cache: a one-time pick-one. The chosen raid item is added to
// raid_items permanently and the node is cleared so the other option is gone.
export async function claimQuartermasterChoice(db: RaidData, uid: string, nodeId: string, itemId: string): Promise<{ ok: true } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || !node.choice) return { error: 'Invalid node' }
  if (!node.choice.items.includes(itemId)) return { error: 'Invalid choice' }

  const profile = await db.profile(uid, 'has_completed_practice_raid, raid_node_progress, raid_items, expedition_xp, is_admin')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  // One pick: only the one whose clear lands gets its item.
  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, { raid_node_progress: { ...prog, cleared: newCleared } })
  if (!ok) return { error: 'Already chosen' }
  await db.give(uid, 'raid_item', itemId)

  return { ok: true }
}

/** The RAID party as the inspection sees it: names, levels, and which of the five
 *  check answers each hand can actually produce. Loaded from the same place the raid
 *  itself loads its crew, so what the clerk counts is exactly who sails. */
async function loadMusterParty(db: RaidData, userId: string): Promise<MusterCrew[]> {
  const p = await db.profile(userId, 'ship_tier, ship_classes, has_sixth_berth')
  if (!p) return []
  const ship = EXPEDITION_SHIP_STATS[(p.ship_tier as number | null) ?? 0]
  if (!ship) return []
  const classSlots = aggregateShipClasses((p.ship_classes as Record<string, string> | null) ?? {}).crewSlots
  const berth = p.has_sixth_berth === true ? 1 : 0
  const party = await loadDeployedPartyVia(db, userId, ship.crewSlots + classSlots + berth, 'raid')
  return party.map(musterCrewFrom)
}

/** Stand for the muster. A ROSTER gate, not a fight: the don's clerk counts your raid
 *  crew. It runs the SAME pure musterReport the sheet renders, so the button can
 *  never promise a pass the server then refuses. */
export async function standForMuster(db: RaidData, uid: string, nodeId: string): Promise<{ ok: true } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'muster' || !node.muster) return { error: 'Invalid node' }

  const profile = await db.profile(uid, 'has_completed_practice_raid, raid_node_progress, is_admin, expedition_xp')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
  if (cleared.has(nodeId)) return { ok: true }   // idempotent: already passed
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const party = await loadMusterParty(db, uid)
  const report = musterReport(node.muster, party)
  if (!report.passed) {
    const missing = report.rows.filter(r => !r.ok).map(r => r.label)
    return { error: `The clerk shakes his head: ${missing.join('; ')}.` }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const next = [...new Set([...(prog.cleared ?? []), nodeId])]
  await db.updateProfile(uid, { raid_node_progress: { ...prog, cleared: next } })
  return { ok: true }
}

// Event nodes: one-time decision beats with branching outcomes (see
// RaidEventChoice in lib/raidMap). Applies the choice's outcome (doubloons /
// Nav XP / nothing), records it, and clears the node. Refuses if the node is
// already cleared (the other options stay gone for good).
export async function pickRaidEventChoice(db: RaidData, uid: string, nodeId: string, choiceId: string): Promise<{ ok: true; newDoubloons?: number; newExpeditionXp?: number } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'event' || !node.event) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  const choice = node.event.choices.find(c => c.id === choiceId)
  if (!choice) return { error: 'Invalid choice' }

  const profile = await db.profile(uid, 'doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
  if (cleared.has(nodeId)) return { error: 'Already chosen' }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }
  if (node.requiresNavLevel) {
    const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
    if (navLevel < node.requiresNavLevel) return { error: 'Locked' }
  }

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newChoices = { ...(prog.choices ?? {}), [nodeId]: choiceId }

  let newDoubloons: number | undefined
  let newExpeditionXp: number | undefined

  // A costly choice takes its coin first (the guard); a paying one pays only
  // after the clear lands.
  const coin = choice.outcome.type === 'doubloons' ? choice.outcome.amount : 0
  if (coin < 0) {
    const left = await db.spend(uid, 'doubloons', -coin)
    if (left == null) return { error: 'Not enough doubloons' }
    newDoubloons = left
  }
  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, {
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  })
  if (!ok) {
    if (coin < 0) await db.grant(uid, 'doubloons', -coin)
    return { error: 'Already chosen' }
  }
  if (coin > 0) newDoubloons = await db.grant(uid, 'doubloons', coin)
  if (choice.outcome.type === 'navXp') {
    newExpeditionXp = (profile.expedition_xp ?? 0) + choice.outcome.amount
    await addNavXp(db, uid, choice.outcome.amount)
  }

  // Ledger row for doubloon-bearing outcomes. Best-effort.
  if (choice.outcome.type === 'doubloons') {
    await db.ledger(uid, choice.outcome.amount, `Raid event: ${node.label} (${choice.label})`).then(() => {}, () => {})
  }

  return { ok: true, newDoubloons, newExpeditionXp }
}

// Branching fork — the player commits to ONE of the two routes. Records the
// choice, clears the node and grants Nav XP. Downstream nodes gate on the
// recorded choice so only the taken route opens.
export async function pickForkRoute(db: RaidData, uid: string, nodeId: string, routeId: string): Promise<{ ok: true; newExpeditionXp: number } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'fork' || !node.fork) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  if (!node.fork.routes.some(r => r.id === routeId)) return { error: 'Invalid route' }

  const profile = await db.profile(uid, 'expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, equipped_special_2, has_anglers_patience, anglers_patience_xp, finn_spoil_free, finn_spoil_paid')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
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

  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, {
    ...(forkReelCharge !== null ? { anglers_patience_xp: forkReelCharge } : {}),
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  })
  if (!ok) return { error: 'Already chosen' }
  await addNavXp(db, uid, node.fork.rewardNavXp)

  return { ok: true, newExpeditionXp }
}

export type DiceThrow = { roll: number; bonus: number; total: number; dc: number; success: boolean; doubloonsDelta: number; navXpDelta: number; newDoubloons: number; newExpeditionXp: number }

// Dice node (a d20 skill-check throw). The player picks ONE approach; the server
// rolls a real d20, adds a small Navigation bonus, and the total vs the option's
// DC decides win or miss. Server-rolled so the throw can't be re-rolled. A miss
// can move doubloons NEGATIVE (clamped so the purse never goes below 0). One-time.
export async function rollDiceNode(db: RaidData, uid: string, nodeId: string, optionId: string): Promise<DiceThrow | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dice' || !node.dice) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }
  const option = node.dice.options.find(o => o.id === optionId)
  if (!option) return { error: 'Invalid option' }

  const profile = await db.profile(uid, 'doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
  if (!profile) return { error: 'Profile not found' }
  const cleared = await buildClearedSetVia(db, uid, profile)
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  const gate = mapNodeRefusal(node, { isAdmin: profile.is_admin === true, cleared, navLevel }, 'Already thrown')
  if (gate) return { error: gate }

  const doubloons = profile.doubloons ?? 0
  if (option.requiresDoubloons && doubloons < option.requiresDoubloons) {
    return { error: `Need ${option.requiresDoubloons.toLocaleString()} doubloons to risk it` }
  }

  // The d20, the Navigation bonus and the clamped coin: lib/raidRules throwDice.
  const thrown = throwDice(node.dice, option, navLevel, doubloons)
  const { roll, bonus, total, success, navXpDelta } = thrown
  let doubloonsDelta = thrown.doubloonsDelta // clamped actual movement
  let newDoubloons = doubloons + doubloonsDelta
  const newExpeditionXp = ((profile.expedition_xp as number | null) ?? 0) + navXpDelta

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const newChoices = { ...(prog.choices ?? {}), [nodeId]: optionId }

  // One throw per node: only the throw whose clear lands moves any coin.
  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, {
    raid_node_progress: { ...prog, cleared: newCleared, choices: newChoices },
  })
  if (!ok) return { error: 'Already thrown' }

  // Coin moves in place. A loss is still floored at an empty purse: if the
  // purse fell since the read, take what is there rather than going negative.
  if (doubloonsDelta > 0) {
    newDoubloons = await db.grant(uid, 'doubloons', doubloonsDelta)
  } else if (doubloonsDelta < 0) {
    const left = await db.spend(uid, 'doubloons', -doubloonsDelta)
    if (left != null) {
      newDoubloons = left
    } else {
      const now = await db.profile(uid, 'doubloons')
      const have = Number(now?.doubloons ?? 0)
      const taken = await db.spend(uid, 'doubloons', have)
      newDoubloons = taken ?? 0
      doubloonsDelta = -have
    }
  }
  await addNavXp(db, uid, navXpDelta)

  if (doubloonsDelta !== 0) {
    await db.ledger(uid, doubloonsDelta, `Raid: ${node.label} (${option.label}, ${success ? 'won' : 'lost'})`).then(() => {}, () => {})
  }

  return { roll, bonus, total, dc: option.dc, success, doubloonsDelta, navXpDelta, newDoubloons, newExpeditionXp }
}

export type DpsPreview = { rangeMin: number; rangeMax: number; mult: number; threshold: number; passChance: number; power: number; shipMinDamage: number }

// Preview for the DPS check — the player's non-crit hit range, gear/class
// multiplier, and computed odds of clearing the threshold. Read-only.
export async function getDpsCheckPreview(db: RaidData, uid: string, nodeId: string): Promise<DpsPreview | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dps_check' || !node.dpsCheck) return { error: 'Invalid node' }

  const stats = await getRaidPlayerStatsVia(db, uid)
  const threshold = node.dpsCheck.threshold
  // The hit range, the multiplier and the odds: lib/raidRules dpsPreview.
  const { rangeMin, rangeMax, mult, passChance } = dpsPreview(stats, threshold)
  return { rangeMin, rangeMax, mult, threshold, passChance, power: stats.totalPower, shipMinDamage: stats.shipMinDamage }
}

type DpsBreakdown = { roll: number; rangeMin: number; rangeMax: number; mult: number }
export type DpsResolution =
  | { outcome: 'paid'; newDoubloons: number }
  | { outcome: 'passed'; damage: number; threshold: number; newDoubloons: number; breakdown: DpsBreakdown }
  | { outcome: 'failed'; damage: number; threshold: number; doubloonsDelta: number; newDoubloons: number; breakdown: DpsBreakdown }
  | { error: string }

// DPS check node — a coin-or-stats gate (lib/raidMap RaidDpsCheck). Either PAY
// to skip, or FIRE one shot: the server rolls a straight (non-crit) hit from the
// player's real damage profile and compares it to the threshold.
export async function resolveDpsCheck(db: RaidData, uid: string, nodeId: string, action: 'pay' | 'shot'): Promise<DpsResolution> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'dps_check' || !node.dpsCheck) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }

  const profile = await db.profile(uid, 'doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin')
  if (!profile) return { error: 'Profile not found' }
  const cleared = await buildClearedSetVia(db, uid, profile)
  const navLevel = getLevelFromXP((profile.expedition_xp as number | null) ?? 0)
  const gate = mapNodeRefusal(node, { isAdmin: profile.is_admin === true, cleared, navLevel }, 'Already cleared')
  if (gate) return { error: gate }

  const dc = node.dpsCheck
  const nodeLabel = node.label
  const doubloons = profile.doubloons ?? 0
  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  // Write the clear + a doubloon spend + ledger row. The spend goes FIRST as
  // the guard and comes back if a twin cleared the node meanwhile. null = the
  // toll could not be covered, or the node was already cleared.
  async function settle(cost: number, tag: string): Promise<{ newDoubloons: number; delta: number } | null> {
    let newDoubloons = doubloons
    if (cost > 0) {
      const left = await db.spend(uid, 'doubloons', cost)
      if (left == null) return null
      newDoubloons = left
    }
    const ok = await commitNodeClear(db, uid, profile!.raid_node_progress, {
      raid_node_progress: { ...prog, cleared: newCleared, choices: { ...(prog.choices ?? {}), [nodeId]: tag } },
    })
    if (!ok) {
      if (cost > 0) await db.grant(uid, 'doubloons', cost)
      return null
    }
    const delta = -cost
    if (delta !== 0) {
      await db.ledger(uid, delta, `Raid: ${nodeLabel} (${tag})`).then(() => {}, () => {})
    }
    return { newDoubloons, delta }
  }

  if (action === 'pay') {
    if (doubloons < dc.payCost) return { error: `Need ${dc.payCost.toLocaleString()} doubloons` }
    const paid = await settle(dc.payCost, 'paid')
    if (!paid) return { error: `Need ${dc.payCost.toLocaleString()} doubloons` }
    return { outcome: 'paid', newDoubloons: paid.newDoubloons }
  }

  // action === 'shot' — ANYONE MAY FIRE. No aiming — always a straight
  // (non-critical) HIT; the hit RANGE comes from the player's stats, the roll
  // within it is the luck. lib/raidRules dpsShot.
  const { damage, passed, breakdown } = dpsShot(await getRaidPlayerStatsVia(db, uid), dc.threshold)

  if (passed) {
    const done = await settle(0, 'passed')
    if (!done) return { error: 'Already cleared' }
    return { outcome: 'passed', damage, threshold: dc.threshold, newDoubloons: done.newDoubloons, breakdown }
  }
  // A MISS DOES NOT CLEAR THE GATE, AND DOES NOT BILL YOU: the gate behaves
  // like every other loss on this water. The shot missed, the gate holds, you
  // wake up at the wharf and sail back. Nothing is deducted or consumed.
  return { outcome: 'failed', damage, threshold: dc.threshold, doubloonsDelta: 0, newDoubloons: doubloons, breakdown }
}

export type ScoutDebt = { met: boolean; doubloonsDelta: number; navXpDelta: number; newDoubloons: number; newExpeditionXp: number; unlockedLegendary?: UnlockedLegendary }

// Choice-gated payoff (the freed-scout debt). A story-type node whose reward
// depends on a choice made at an EARLIER node. If the prior choice matches
// node.payoff.requiresChoice, grant the coin + Nav XP; either way mark it read.
export async function claimScoutDebt(db: RaidData, uid: string, nodeId: string): Promise<ScoutDebt | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'story' || !node.payoff) return { error: 'Invalid node' }
  if (node.comingSoon) return { error: 'Coming soon' }

  const profile = await db.profile(uid, 'doubloons, expedition_xp, has_completed_practice_raid, raid_node_progress, is_admin, legendary_unlocks')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const prog = (profile.raid_node_progress as { cleared?: string[]; choices?: Record<string, string> } | null) ?? {}
  const doubloons = profile.doubloons ?? 0
  const expeditionXp = (profile.expedition_xp as number | null) ?? 0
  const met = prog.choices?.[node.payoff.requiresChoice.nodeId] === node.payoff.requiresChoice.choiceId

  const cleared = await buildClearedSetVia(db, uid, profile)
  if (cleared.has(nodeId)) {
    return { met, doubloonsDelta: 0, navXpDelta: 0, newDoubloons: doubloons, newExpeditionXp: expeditionXp }
  }
  if (node.requiresNode && !cleared.has(node.requiresNode)) return { error: 'Locked' }

  const payoff = met ? node.payoff.grant : {}
  const doubloonsDelta = payoff.doubloons ?? 0
  const navXpDelta = payoff.navXp ?? 0
  let newDoubloons = doubloons + doubloonsDelta
  const newExpeditionXp = expeditionXp + navXpDelta

  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]
  const updates: Record<string, unknown> = {
    raid_node_progress: { ...prog, cleared: newCleared },
  }

  // Dole's gate: scout_debt is a payoff node, so her unlock rides this action.
  const unlockedLegendary = await applyLegendaryGate(db, nodeId, (profile.legendary_unlocks as string[] | null) ?? [], updates)

  // Paid only if this request's clear is the one that lands.
  const ok = await commitNodeClear(db, uid, profile.raid_node_progress, updates)
  if (!ok) return { met, doubloonsDelta: 0, navXpDelta: 0, newDoubloons: doubloons, newExpeditionXp: expeditionXp }
  if (doubloonsDelta > 0) newDoubloons = await db.grant(uid, 'doubloons', doubloonsDelta)
  await addNavXp(db, uid, navXpDelta)

  if (doubloonsDelta !== 0) {
    await db.ledger(uid, doubloonsDelta, `Raid: ${node.label}`).then(() => {}, () => {})
  }

  return { met, doubloonsDelta, navXpDelta, newDoubloons, newExpeditionXp, unlockedLegendary }
}

// Chapter-end class pick. Writes profiles.ship_classes[chapterId] = classId and
// marks the node cleared. One pick per chapter, locked in permanently.
export async function pickShipClass(db: RaidData, uid: string, nodeId: string, classId: string): Promise<{ ok: true } | { error: string }> {
  const node = RAID_MAP.find(n => n.id === nodeId)
  if (!node || node.type !== 'class_pick' || !node.classPick) return { error: 'Invalid node' }
  // Server-side validation of the class id against the registry. Lazy import so
  // SHIP_CLASSES stays out of bundles that only read the map.
  const { SHIP_CLASSES, offeredShipClassIds } = await import('@/lib/shipClasses')
  if (!(classId in SHIP_CLASSES)) return { error: 'Invalid class' }

  const profile = await db.profile(uid, 'has_completed_practice_raid, raid_node_progress, ship_classes, is_admin')
  if (!profile) return { error: 'Profile not found' }
  if (node.adminOnly && profile.is_admin !== true) return { error: 'Locked' }

  const cleared = await buildClearedSetVia(db, uid, profile)
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
    // Tall-vs-wide gating: the class must actually be ON THIS PLAYER'S MENU.
    return { error: 'That class is not available to you' }
  }

  const newPicks = { ...picks, [node.classPick.chapterId]: classId }
  const prog = (profile.raid_node_progress as { cleared?: string[] } | null) ?? {}
  const newCleared = [...new Set([...(prog.cleared ?? []), nodeId])]

  await db.updateProfile(uid, {
      ship_classes: newPicks,
      raid_node_progress: { ...prog, cleared: newCleared },
    })

  // Clearing the Chapter 2 class node = Chapter 2 done. Once the Gauntlet is
  // live, that's the unlock — let the player know it just opened.
  if (GAUNTLET_LIVE && nodeId === GAUNTLET_UNLOCK_NODE) {
    try {
      await db.mailTo(uid, {
        subject: 'The Locker Opens: Davy Jones Gauntlet Unlocked',
        body: "You closed out Chapter 2. Word travels fast down in the dark, and something has taken notice.\n\nThe Davy Jones Gauntlet is open to you now. Descend as deep as you dare, fighting ship after ship while one pot swells with every kill. Cash out and it's all yours. Sink before you do and it goes to the deep with you.\n\nGo as deep as you can and you'll tear loose rewards that follow you topside. Find it under Expeditions.\n\n— Davy Jones",
        sender: 'Davy Jones',
      })
    } catch { /* best-effort */ }
  }

  return { ok: true }
}

/**
 * THE REFIT — re-choose the class picks. Earned by putting the don under (the
 * Chapter IV boss); the first is free, every one after costs. Writes
 * `ship_classes` and NOTHING ELSE: the class nodes stay cleared, because the
 * Chapter II class node IS the Gauntlet's unlock gate and later chapters hang
 * off these nodes. The map is settled history; only the loadout moves.
 */
export async function refitShipClasses(db: RaidData, uid: string, next: Record<string, string>): Promise<{ ok: true; doubloons: number | null } | { error: string }> {
  const profile = await db.profile(uid, 'ship_classes, ship_refits_used, doubloons')
  if (!profile) return { error: 'Profile not found' }

  // The don has to be in the ground.
  const throne = await db.hasCleared(uid, 'the_throne')
  if (!throne) return { error: 'The don is still sitting on his throne.' }

  const picks = (profile.ship_classes as Record<string, string> | null) ?? {}
  const chapters = Object.keys(picks)
  if (chapters.length === 0) return { error: 'You have no classes to refit.' }

  const { validateClassPicks, shipRefitCost } = await import('@/lib/shipClasses')
  const check = validateClassPicks(next, chapters)
  if (!check.ok) return { error: check.error }

  // PRICED OFF THE COUNT, server-side.
  const used = (profile.ship_refits_used as number | null) ?? 0
  const cost = shipRefitCost(used)
  let spent: number | null = null

  if (cost > 0) {
    // Atomic, balance-guarded debit BEFORE the write.
    const left = await db.deductDoubloons(uid, cost)
    if (left == null) return { error: `A refit costs ${cost.toLocaleString()} ⟡.` }
    spent = left as number
    await db.ledger(uid, -cost, 'Ship refit: re-cut your class picks')
  }

  // Only from the refit count that was read: a twin that got there first wins.
  if (!(await db.updateProfileIf(uid, { ship_classes: next, ship_refits_used: used + 1 }, [{ col: 'ship_refits_used', eq: used }]))) {
    // The race was lost after the debit landed: hand it straight back.
    if (cost > 0) await db.grant(uid, 'doubloons', cost)
    return { error: 'That refit was already taken. Reload and try again.' }
  }

  return { ok: true, doubloons: spent }
}

// ── THE SPOILS OF THE SUNKEN HAND ─────────────────────────────────────────────
//
// Beating Finn opens ONE of two permanent slots for free; the other can be
// bought later for SPOILS_PRICE. Each slot accepts exactly one item, and that
// item only ever drops from him, so neither side is a general expansion.
//   'fishing' -> a SECOND fishing special slot   (The Primeval Eye)
//   'nav'     -> an extra raid item mount        (The Primeval Maw)
// Stored as separate columns (free / paid) so the free pick can never be spent
// twice.

export type SpoilSide = 'fishing' | 'nav'

const isSide = (v: unknown): v is SpoilSide => v === 'fishing' || v === 'nav'

async function loadSpoils(db: RaidData, uid: string) {
  const profile = await db.profile(uid, 'doubloons, finn_spoil_free, finn_spoil_paid')
  if (!profile) return { error: 'No profile.' as const }
  // The whole feature hangs off having actually beaten him.
  const cleared = await db.hasCleared(uid, 'the_sunken_hand')
  return { profile, cleared: !!cleared }
}

/** Mark the spoils node itself as cleared, so the last node of the campaign
 *  loses its unclaimed chrome once something is taken off the wreck. */
async function markSpoilsNodeCleared(db: RaidData, userId: string) {
  const row = await db.profile(userId, 'raid_node_progress')
  const prog = (row?.raid_node_progress as { cleared?: string[] } | null) ?? {}
  if ((prog.cleared ?? []).includes('spoils_of_the_hand')) return
  await db.updateProfile(userId, { raid_node_progress: { ...prog, cleared: [...new Set([...(prog.cleared ?? []), 'spoils_of_the_hand'])] } })
}

/** Take one side FREE. Only ever succeeds once. */
export async function chooseSpoil(db: RaidData, uid: string, side: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!isSide(side)) return { ok: false, error: 'Unknown spoil.' }
  const ctx = await loadSpoils(db, uid)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { profile, cleared } = ctx

  if (!cleared) return { ok: false, error: 'Put him down first.' }
  if (profile.finn_spoil_free) return { ok: false, error: 'You already took one off his wreck.' }

  // Conditional write on the column still being null guards a double-tap
  // handing out both sides for nothing.
  const updated = await db.updateProfileIf(uid, { finn_spoil_free: side }, [{ col: 'finn_spoil_free', is: null }])
  if (!updated) return { ok: false, error: 'You already took one off his wreck.' }
  await markSpoilsNodeCleared(db, uid)
  return { ok: true }
}

/** Buy the OTHER side. Must differ from the free pick, and costs SPOILS_PRICE. */
export async function buySpoil(db: RaidData, uid: string, side: unknown): Promise<{ ok: boolean; error?: string; doubloons?: number }> {
  if (!isSide(side)) return { ok: false, error: 'Unknown spoil.' }
  const ctx = await loadSpoils(db, uid)
  if ('error' in ctx) return { ok: false, error: ctx.error }
  const { profile, cleared } = ctx

  if (!cleared) return { ok: false, error: 'Put him down first.' }
  if (!profile.finn_spoil_free) return { ok: false, error: 'Take your free pick first.' }
  if (profile.finn_spoil_free === side) return { ok: false, error: 'You already carry that one.' }
  if (profile.finn_spoil_paid) return { ok: false, error: 'You already bought the other.' }

  // The spend is the guard; a twin that bought first gets this one refunded.
  const newDoubloons = await db.spend(uid, 'doubloons', SPOILS_PRICE)
  if (newDoubloons == null) {
    return { ok: false, error: `You need ${SPOILS_PRICE.toLocaleString()} doubloons.` }
  }
  const updated = await db.updateProfileIf(uid, { finn_spoil_paid: side }, [{ col: 'finn_spoil_paid', is: null }])
  if (!updated) {
    await db.grant(uid, 'doubloons', SPOILS_PRICE)
    return { ok: false, error: 'You already bought the other.' }
  }
  await markSpoilsNodeCleared(db, uid)
  return { ok: true, doubloons: newDoubloons }
}

/** Seat (or clear) The Primeval Eye in the SECOND fishing special slot. The
 *  slot must be unlocked, the item owned, and nothing else goes in there. */
export async function equipSecondSpecial(db: RaidData, uid: string, itemId: unknown): Promise<{ ok: boolean; error?: string }> {
  const profile = await db.profile(uid, 'finn_spoil_free, finn_spoil_paid, has_anglers_patience')
  if (!profile) return { ok: false, error: 'No profile.' }

  const hasSlot = profile.finn_spoil_free === 'fishing' || profile.finn_spoil_paid === 'fishing'
  if (!hasSlot) return { ok: false, error: 'You have not opened that slot.' }

  if (itemId === null) {
    await db.updateProfile(uid, { equipped_special_2: null })
    return { ok: true }
  }
  // The slot takes exactly ONE item, by design. This is the enforcement point.
  if (itemId !== 'anglers_patience') return { ok: false, error: 'Only his eye seats in that slot.' }
  if (profile.has_anglers_patience !== true) return { ok: false, error: "You do not carry The Primeval Eye." }

  await db.updateProfile(uid, { equipped_special_2: 'anglers_patience' })
  return { ok: true }
}
