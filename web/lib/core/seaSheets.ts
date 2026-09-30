// ── THE SEA'S SHEETS, LATCHES AND BOARDS, CORE (Steam prep, 2026-09-29) ──
//
// The chart's reads and its teaching, with nothing of the web in them: the two
// tours' latches and steps, the loadout sheet's pickers, the raid sheet, a
// campaign node's sheet, the boss card, and the Day board. Each takes the store
// (SeaData) and the captain's id. On the web the server actions (sea/tour,
// loadout, raidSheet, nodeSheet, bossCard and day actions) check the session
// and hand these the Supabase store; offline, the local save's.
//
// THE DAY BOARD FANS OUT TO EACH SYSTEM'S OWN READER, so nothing on it can
// disagree with the sheet it opens. The core takes those readers as inputs
// (DaySources): the web hands it its actions, the desktop its local API.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; table reads became store operations; the day's page revalidation
// stays in the web wrapper; the clock is the game's.

import { clockNow } from '@/lib/clock'
import { isPremiumActive } from '@/lib/premium'
import { unlockedCosmetics } from '@/lib/cosmeticUnlocks'
import { ownedRodTiers } from '@/lib/rods'
import { ownedSpecialIds, SPECIAL_OWNED_COLUMN } from '@/lib/specialItems'
import { getRaidPlayerStatsVia, type RaidPlayerStats } from '@/lib/raidLoadout'
import { getRaidMapView, type RaidRecords } from '@/lib/core/raidMap'
import { BASE_VOYAGE_MS } from '@/lib/voyage'
import { listDone } from '@/lib/dayList'
import type { RaidNodeView } from '@/lib/raidMap'
import type { MusterCrew } from '@/lib/crewMuster'
import type { DailyChallengeState } from '@/lib/dailyChallenges'
import type { RecruitFace } from '@/lib/core/crew'
import type { SeaData } from '@/lib/data/seaData'
import { distinctIds } from '@/lib/listCounts'
import { heldRodTiers } from '@/lib/data/inventory'

// ══ THE TOURS ═════════════════════════════════════════════════════════════════
//
// Profile columns, never localStorage: a tour that replays after a reinstall,
// or on the captain's other device, reads as a bug rather than as help.

/** Skip the lot: both walkthroughs latched shut at once. One way. */
export async function skipTutorials(db: SeaData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_sea_tour: true, has_seen_gate_tour: true })
}

/** Shut the arrival walkthrough for good. */
export async function markSeaTourSeen(db: SeaData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_sea_tour: true })
}

/** Where the first voyage has got to. Only ever forwards: two surfaces write
 *  it, and a stale render must not walk the tour backwards. True if it moved. */
export async function setSeaTourStep(db: SeaData, uid: string, step: number): Promise<boolean> {
  const n = Math.max(0, Math.min(99, Math.floor(step)))
  const data = await db.profile(uid, 'sea_tour_step')
  if (Number(data?.sea_tour_step ?? 0) >= n) return false
  await db.updateProfile(uid, { sea_tour_step: n })
  return true
}

/** The step, straight from the store: the page's copy can be stale. */
export async function getSeaTourStep(db: SeaData, uid: string): Promise<number> {
  const data = await db.profile(uid, 'sea_tour_step')
  return Number(data?.sea_tour_step ?? 0)
}

/** Remember that a port's first-landfall line has been shown. */
export async function markSeaHintSeen(db: SeaData, uid: string, portId: string): Promise<void> {
  const id = (portId ?? '').trim()
  if (!id) return
  const data = await db.profile(uid, 'sea_hints_seen')
  const seen = ((data?.sea_hints_seen as string[] | null) ?? [])
  if (seen.includes(id)) return
  await db.updateProfile(uid, { sea_hints_seen: [...seen, id] })
}

/** The anchorage's tour: its own latch and its own step. */
export async function markGateTourSeen(db: SeaData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_gate_tour: true })
}

/** Only ever forwards, same as the first voyage's. */
export async function setGateTourStep(db: SeaData, uid: string, step: number): Promise<void> {
  const n = Math.max(0, Math.min(99, Math.floor(step)))
  const data = await db.profile(uid, 'gate_tour_step')
  if (Number(data?.gate_tour_step ?? 0) >= n) return
  await db.updateProfile(uid, { gate_tour_step: n })
}

// ══ THE LOADOUT SHEET ═════════════════════════════════════════════════════════
//
// Everything the loadout's pickers offer, fetched when the sheet opens rather
// than with the chart. Equip only: nothing here buys anything (the shops are
// buildings on an island, and reaching them is a sail with a decision in it).

export type LoadoutGear = {
  rods: number[]
  colors: string[]
  boats: string[]
  hats: string[]
  pets: string[]
  equipped: { rod: number; color: string; boat: string | null; hat: string | null; pet: string | null }
}

export async function loadoutGear(db: SeaData, uid: string): Promise<LoadoutGear | null> {
  const [profile, rodRows, achievementPoints] = await Promise.all([
    db.profile(uid, 'rod_tier, character_color, equipped_boat, equipped_hat, equipped_pet, fishing_xp, expedition_xp, prestige_levels, unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets'),
    heldRodTiers(db, uid),
    db.achievementPoints(uid),
  ])
  if (!profile) return null

  const rodTier = Number(profile.rod_tier ?? 0)
  const unlocked = unlockedCosmetics(profile as never, achievementPoints)

  return {
    // Free tiers are not in the rod store and have to be added back. See lib/rods.
    rods: ownedRodTiers(rodRows.map(Number), rodTier),
    colors: [...new Set(unlocked.colors)],
    boats: [...new Set(unlocked.boats)],
    hats: [...new Set(unlocked.hats)],
    pets: [...new Set(unlocked.pets)],
    equipped: {
      rod: rodTier,
      color: (profile.character_color as string | null) ?? 'default',
      boat: (profile.equipped_boat as string | null) ?? null,
      hat: (profile.equipped_hat as string | null) ?? null,
      pet: (profile.equipped_pet as string | null) ?? null,
    },
  }
}

// ══ THE RAID SHEET, THE NODE SHEET, THE BOSS CARD ═════════════════════════════

/** What a fight needs to know about its captain: the loadout every raid route
 *  gathers, and the expedition XP its bar starts at. Nothing refuses a fight
 *  here any more (going down costs the sail back from the Gunwharf). */
export type RaidSheetState = RaidPlayerStats & { expeditionXP: number }

export async function raidSheetState(db: SeaData, uid: string): Promise<RaidSheetState | { error: string }> {
  const [profile, stats] = await Promise.all([db.profile(uid, 'expedition_xp'), getRaidPlayerStatsVia(db, uid)])
  return { ...stats, expeditionXP: Number(profile?.expedition_xp ?? 0) }
}

export type NodeSheetState = {
  doubloons: number
  /** Chapter id → the ship class picked for it. */
  shipClasses: Record<string, string>
  /** Raid items already in the hold. */
  ownedItems: string[]
  /** Nav level, which sets the odds on a bones throw. */
  navLevel: number
  /** The raid party as the don's clerk counts it. Drives the muster. */
  musterParty: MusterCrew[]
  /** Which node the captain chose what at. */
  choices: Record<string, string>
  /** Finn's two spoils: the one taken free and the one bought. */
  spoilFree: string | null
  spoilPaid: string | null
  /** Refits already owned. */
  hasSixthBerth: boolean
  hasArmoryExpansion: boolean
}

/** What a campaign node's sheet needs, from the map's own read, so the two
 *  surfaces cannot disagree about whether you passed an inspection. */
export async function nodeSheet(db: SeaData, uid: string): Promise<NodeSheetState | { error: string }> {
  const [view, prof] = await Promise.all([
    getRaidMapView(db, uid),
    db.profile(uid, 'raid_items, has_sixth_berth, has_armory_expansion'),
  ])
  if (!prof) return { error: 'No profile.' }
  return {
    doubloons: view.doubloons,
    shipClasses: view.shipClasses,
    ownedItems: distinctIds((prof.raid_items as string[] | null) ?? []),
    navLevel: view.navLevel,
    musterParty: view.musterParty,
    choices: view.raidNodeChoices,
    spoilFree: view.spoilFree,
    spoilPaid: view.spoilPaid,
    hasSixthBerth: prof.has_sixth_berth === true,
    hasArmoryExpansion: prof.has_armory_expansion === true,
  }
}

export type BossCardState = {
  views: RaidNodeView[]
  raidRecords: Record<string, RaidRecords>
  ownedRaidItems: string[]
  ownedShipSkins: string[]
  ownedSpecialItems: string[]
  totalFortune: number
  clearedNodeIds: string[]
}

/** What the boss card needs, from the node map's own read, so the card at sea
 *  cannot drift from the card on the page. */
export async function bossCardState(db: SeaData, uid: string): Promise<BossCardState | { error: string }> {
  const [map, stats, profile] = await Promise.all([
    getRaidMapView(db, uid),
    getRaidPlayerStatsVia(db, uid),
    // The specials are one boolean column EACH, not a `special_items` array.
    db.profile(uid, `raid_items, ship_skins, ${Object.values(SPECIAL_OWNED_COLUMN).join(', ')}`),
  ])
  // AN EMPTY MAP IS A FAILED READ, not an answer. Say it failed, so the card
  // offers Try again.
  if (map.views.length === 0) return { error: 'The charts would not open. Try again.' }
  return {
    views: map.views,
    raidRecords: map.raidRecords,
    ownedRaidItems: distinctIds((profile?.raid_items as string[] | null) ?? []),
    ownedShipSkins: (profile?.ship_skins as string[] | null) ?? [],
    ownedSpecialItems: ownedSpecialIds(profile),
    totalFortune: stats.totalFortune,
    clearedNodeIds: map.views.filter(v => v.status === 'cleared').map(v => v.node.id),
  }
}

// ══ THE DAY BOARD ═════════════════════════════════════════════════════════════
//
// Everything that resets, in one read: the dailies are hidden in their own
// buildings, and every one of them only says its state once you go and look.

export type DayState = {
  /** The Daily Haul: gems and bait every day, a crate every Monday. */
  haul: { isPremium: boolean; gemsClaimed: boolean; baitClaimed: boolean; crateClaimed: boolean } | null
  /** Today's recruit board: the three faces, and which have been signed. */
  recruits: { faces: RecruitFace[] } | null
  /** Today's Orders: the daily challenges. */
  orders: { done: number; total: number; ready: number; sweepClaimed: boolean } | null
  /** The daily voyage. `startsAt` is when it sailed, for the progress bar. */
  voyage: { state: 'none' | 'at_sea' | 'ready'; endsAt: number | null; startsAt?: number | null } | null
  /** The trawls: how many crews are out, how many hauls are waiting. */
  trawls: { out: number; ready: number; slots: number; nextBack: number | null } | null
  /** The Posting House board. */
  bounties: { unlocked: boolean; claimed: number; total: number; claimable: number; remaining: number } | null
  /** The Chart Room's week: four puzzles. */
  chart: { solved: number; total: number } | null
  /** The Parlor: tonight's board and this week's ladder. */
  parlor: { boardPlayedToday: boolean; ladderDone: boolean } | null
  /** When the next thing comes back on its own, epoch ms, or null. The client
   *  sets one timer for this moment instead of polling. */
  nextAt: number | null
  /** Today's list, checked off. `fullDays` only ever goes up (no streak, no
   *  FOMO), credited once per UTC day, the moment a read sees it done. */
  list: { recruitsSeen: boolean; fullDays: number; countedToday: boolean; justCounted: boolean }
}

/** Each system's own reader, as the board needs it. A reader that throws or
 *  fails leaves its row null; a board that is empty when one table hiccups is
 *  a board that flashes for nothing. */
export type DaySources = {
  profile: () => Promise<Record<string, unknown> | null>
  orders: () => Promise<DailyChallengeState | null>
  voyage: () => Promise<{ readyVoyage?: unknown; todayVoyage?: unknown } | { error: string } | null>
  trawls: () => Promise<{ zones: { trawl: { ready: boolean; endsAt: string } | null }[]; unlockedSlots: number } | { error: string } | null>
  bounties: () => Promise<{ unlocked: boolean; remaining: number; bounties: { claimed: boolean; progress: number; target: number }[] } | null>
  hold: () => Promise<{ puzzles: { solved: unknown }[] } | { error: string } | null>
  match: () => Promise<{ status: 'active' | 'cleared' } | { error: string } | null>
  minefield: () => Promise<{ status: 'active' | 'cleared' } | { error: string } | null>
  rigging: () => Promise<{ status: 'active' | 'cleared' } | { error: string } | null>
  /** This week's Parlor board answers and ladder status. */
  parlorWeek: () => Promise<{ answers: Record<string, { day?: string }>; ladderStatus: string | undefined } | null>
  haul: () => Promise<DayState['haul']>
  recruits: () => Promise<{ faces: RecruitFace[] } | null>
}

const safe = async <T,>(f: () => Promise<T>): Promise<T | null> => {
  try { return await f() } catch { return null }
}

export async function dayState(db: SeaData, uid: string, src: DaySources): Promise<DayState | null> {
  const today = new Date(clockNow()).toISOString().split('T')[0]

  const [profile, orders, voyage, trawls, board, hold, mtch, mine, rig, parlorWeek, haul, recruits] = await Promise.all([
    safe(src.profile), safe(src.orders), safe(src.voyage), safe(src.trawls), safe(src.bounties),
    safe(src.hold), safe(src.match), safe(src.minefield), safe(src.rigging), safe(src.parlorWeek),
    safe(src.haul), safe(src.recruits),
  ])

  const prof = profile as { full_days?: number | null; last_full_day?: string | null; recruits_seen_on?: string | null } | null
  const out: DayState = {
    haul, recruits: recruits ?? null, orders: null, voyage: null, trawls: null, bounties: null, chart: null, parlor: null, nextAt: null,
    list: {
      recruitsSeen: prof?.recruits_seen_on === today,
      fullDays: Number(prof?.full_days ?? 0),
      countedToday: prof?.last_full_day === today,
      justCounted: false,
    },
  }
  const now = clockNow()
  /** Keep the soonest future moment anything flips. */
  const soon = (t: number | null) => {
    if (t == null || !(t > now)) return
    if (out.nextAt == null || t < out.nextAt) out.nextAt = t
  }

  if (orders) {
    const n = orders.challenges.length
    const done = orders.challenges.filter((c, i) => (orders.progress[i] ?? 0) >= c.target).length
    const ready = orders.challenges.filter((c, i) => (orders.progress[i] ?? 0) >= c.target && !orders.claimed[i]).length
    out.orders = { done, total: n, ready, sweepClaimed: orders.sweepClaimed }
  }

  if (voyage && !('error' in voyage)) {
    if (voyage.readyVoyage) out.voyage = { state: 'ready', endsAt: null }
    else if (voyage.todayVoyage) {
      // The same fallback the reader uses, so "back in" is never blank.
      const v = voyage.todayVoyage as { created_at: string; duration_ms?: number | null }
      const endsAt = new Date(v.created_at).getTime() + (v.duration_ms ?? BASE_VOYAGE_MS)
      out.voyage = { state: 'at_sea', endsAt, startsAt: new Date(v.created_at).getTime() }
      soon(endsAt)
    } else out.voyage = { state: 'none', endsAt: null }
  }

  if (trawls && !('error' in trawls)) {
    const active = trawls.zones.filter(z => z.trawl)
    const ready = active.filter(z => z.trawl?.ready).length
    const backs = active.filter(z => z.trawl && !z.trawl.ready).map(z => new Date(z.trawl!.endsAt).getTime())
    out.trawls = { out: active.length, ready, slots: trawls.unlockedSlots, nextBack: backs.length ? Math.min(...backs) : null }
    for (const t of backs) soon(t)
  }

  if (board) {
    const claimable = board.bounties.filter(b => !b.claimed && b.progress >= b.target).length
    const claimed = board.bounties.filter(b => b.claimed).length
    out.bounties = { unlocked: board.unlocked, claimed, total: board.bounties.length, claimable, remaining: board.remaining }
  }

  {
    const holdSolved = hold && !('error' in hold) ? (hold.puzzles.filter(p => p.solved).length > 0 ? 1 : 0) : 0
    const cleared = (s: { status: 'active' | 'cleared' } | { error: string } | null) => (s && !('error' in s) && s.status === 'cleared' ? 1 : 0)
    out.chart = { solved: holdSolved + cleared(mtch) + cleared(mine) + cleared(rig), total: 4 }
  }

  {
    const answers = parlorWeek?.answers ?? {}
    const picksAllowed = isPremiumActive(profile as Parameters<typeof isPremiumActive>[0]) ? 2 : 1
    const picksToday = Object.values(answers).filter(a => a.day === today).length
    // The ladder is one climb a week: anything but an active climb is settled.
    const ladder = parlorWeek?.ladderStatus
    out.parlor = { boardPlayedToday: picksToday >= picksAllowed, ladderDone: ladder === 'walked' || ladder === 'busted' || ladder === 'crowned' }
  }

  // ── A FULL DAY, CREDITED ONCE ── only the first read that sees it done writes.
  if (!out.list.countedToday && listDone(out)) {
    const moved = await db.creditFullDay(uid, today, out.list.fullDays + 1)
    if (moved != null) {
      out.list.fullDays = moved
      out.list.countedToday = true
      out.list.justCounted = true
    }
  }

  return out
}
