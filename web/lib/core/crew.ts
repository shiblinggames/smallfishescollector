// ── THE CREW HALL, CORE (Steam prep, 2026-09-29) ──
//
// The recruit board, the roster and the graveyard, party seats, the hall's
// upgrades and bunks, crew skins and promotions, with nothing of the web in
// them. Each takes the crew store (CrewData) and the captain's id. On the web
// the server actions (crew/actions, crew/bunkActions, crewPromotionActions)
// check the session and hand these the Supabase store; offline, the local
// save's.
//
// Moved verbatim out of those actions. The only edits: the session read became
// `uid`; the wallet and owned-list helpers became db.spend / db.grant /
// db.addToList; the bunk helpers take the store; the clock became clockNow. The
// web-only steps (telling Next the cached chart changed) stay in the actions.

import { getLevelFromXP } from '@/lib/expeditionLevel'
import { isPremiumActive } from '@/lib/premium'
import { crewCapacity } from '@/lib/crewCapacity'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { classSlotBonuses } from '@/lib/shipClasses'
import { crewDisplayName, FREE_WEIGHTS, GEM_WEIGHTS, DAILY_RECRUITS, type CrewRarity } from '@/lib/crewGen'
import { clampHallTier, nextHallTier, hallUpgradeBlocker, type CrewHallTierNum } from '@/lib/crewHall'
import {
  bunkRatePerHour, hallBunksOpen, stintDone, storesCapHours,
  canBunk, drillsMaxed, hallTierRequiredFor, isLeviathanSlot, ladderHallLocked, nextDrillCost, nextStoresCost, storesMaxed, tierNumeral,
} from '@/lib/crewBunks'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { getCrewSkin, resolveCrewFilename, type EquippedCrewSkins } from '@/lib/crewSkins'
import { bloodRerollTier, BLOOD_SKIN_GAMBLE_COST, hardcoreUnlocked } from '@/lib/gauntlet'
import { cardPools, rollRecruitBoard, pickBloodSkin, type CardRow, type CardMeta } from '@/lib/crewRules'
import { bunkContext, loadBunks, releaseBunk, NEUTRAL_OFFER, type TraitUpgrade } from '@/lib/crewBunkSettle'
import type { CrewXPGrant } from '@/lib/crewXPGrant'
import { CLASSES, classForSlug, CLASS_MILESTONE_LEVELS } from '@/lib/crewClasses'
import { stampBadges } from '@/lib/badgeStamps'
import { cardArt } from '@/lib/artUrl'
import { clockNow } from '@/lib/clock'
import type { CrewData } from '@/lib/data/crewData'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const REROLL_COST = 100

// ── Shared shapes (also consumed by the client) ────────────────────────────

export type BoardCandidate = {
  id: number
  slot: number
  source: 'free' | 'gem'
  cardId: number
  name: string
  filename: string
  /** Species slug. Recruit modal reads this through classForSlug() to show
   *  the would-be class to the player before they commit gems / a slot. */
  slug: string
  rarity: number
  power: number
  dodge: number
  fortune: number
  effects: string[]
  recruited: boolean
  /** Crew Hall XP seed stamped when this board was ROLLED. Recruiting uses
   *  this (not the live hall tier), so upgrading the hall mid-board doesn't
   *  retroactively level candidates — only the next roll benefits. */
  startXp: number
}

export type CrewMember = {
  id: number
  cardId: number
  /** Resolved display name — player nickname if set, otherwise the
   *  species-default nickname from `crewDisplayName(slug, name)`. */
  name: string
  /** Player-set nickname, or null if never renamed. One-shot — if non-null
   *  the rename affordance in the detail modal hides itself. */
  nickname: string | null
  /** Effective art filename — the equipped legendary skin if one is set, else base. */
  filename: string
  /** The un-skinned base art filename, so the Crew Hall skins tab can preview
   *  the "Original" even while a skin is equipped. */
  baseFilename: string
  /** Species slug (lower-cased card slug). Drives crew-class lookup via
   *  CLASS_BY_SLUG — every species maps to exactly one class. */
  slug: string
  rarity: number
  power: number
  dodge: number
  fortune: number
  effects: string[]
  /** A Leviathan re-cut waiting on a keep-or-replace answer, encoded s:P,D,F
   *  (or the neutral sentinel). Null for almost every crew. Held server-side
   *  so a refresh cannot re-roll it. */
  pendingTrait: string | null
  /** Voyage party slot (0..N) or null if not on the voyage track. Mutually
   *  exclusive with raidSlot via the DB CHECK constraint. */
  voyageSlot: number | null
  /** Raid loadout slot (0..N) or null if not on the raid track. */
  raidSlot: number | null
  /** Cumulative XP. Level + per-stat level bonus derived via lib/crewLevel. */
  xp: number
}

export type CrewState = {
  board: BoardCandidate[]
  roster: CrewMember[]
  capacity: number
  navLevel: number
  /** Raw Navigation XP. The crew-limit sheet turns "Navigation 60" into "4,100
   *  XP to go", which is the difference between a milestone and a plan. */
  navXp: number
  gems: number
  isPremium: boolean
  rerollCost: number
  /** Ship-tier crew-slot count. Used by the Crew Hall inline assignment
   *  toggle to pick the next-open slot on the chosen track. */
  shipCrewSlots: number
  /** user_crew ids that are currently AT SEA (in a pending voyage). The
   *  Crew Hall UI grays these cards out and disables the assignment
   *  toggle — players can't pull a crew off an in-progress voyage. */
  lockedCrewIds: number[]
  /** user_crew ids currently OUT ON A TRAWL — also locked from reassignment
   *  (they're hard-locked at sea for the hour), with a distinct badge. */
  trawlingCrewIds: number[]
  /** user_crew ids currently holding a bunk in the Crew Hall, running or
   *  finished. This USED to be a soft state that auto-evicted on assignment;
   *  it is a real commitment now, so see bunkLockedCrewIds for the subset that
   *  actually blocks orders. A finished stint keeps its row until collected,
   *  which is why a hand can hold a seat and a bunk at the same time. */
  bunkedCrewIds: number[]
  /** Subset of the above whose stint is STILL RUNNING. Hard-locked: they
   *  cannot be assigned, trawled or dismissed until it finishes. A finished
   *  stint is merely waiting to be collected, so it is not in here. */
  bunkLockedCrewIds: number[]
  /** Are the hall's bunks open to this player? Public since 2026-08-01
   *  (HALL_BUNKS_LIVE in lib/crewBunks.ts). Hides the UI; the actions enforce
   *  it independently. */
  hallBunksOpen: boolean
  /** crew id -> the terms that bunk is running on: when it started, the XP/hour
   *  agreed at entry, the stint length agreed at entry, and WHICH bunk they are
   *  in (0-5; 5 is the Leviathan bunk). Per-bunk rather than global, because
   *  buying Drills or Stores must not change a stint already under way. */
  bunkTerms: Record<number, { since: string; rate: number; cap: number; slot: number | null }>
  /** Drill level — multiplies the Nav-scaled training rate (XP per hour). */
  drillLevel: number
  /** Stores level — sets how long a bunk accrues before it fills. */
  storesLevel: number
  /** Hours a bunk accrues before capping, resolved from storesLevel. */
  capHours: number
  /** Crew Hall building tier (1..6). Drives the recruit board's visual theme
   *  and how many bunks the hall has (lib/crewHall.ts). */
  hallTier: CrewHallTierNum
  /** Doubloon balance — the hall upgrade currency. */
  doubloons: number
  /** Blood Gem balance — Hardcore Gauntlet premium currency; fuels blood-charged
   *  rerolls + the skin gamble. Shown only in the Crew Hall + Gauntlet. */
  bloodGems: number
  /** Can this player access the Hardcore Gauntlet? Surfaces the Blood Market
   *  tab once unlocked (so the currency is discoverable at 0 gems). */
  hardcoreUnlocked: boolean
  /** Crew skin ids the player owns (gem-bought legendary skins). */
  ownedCrewSkins: string[]
  /** Equipped skin per legendary slug ({ dole: 'dole_frostbite' }). */
  equippedCrewSkins: Record<string, string>
}

export type CrewActionResult = { state: CrewState } | { error: string }

function utcDate(): string {
  return new Date(clockNow()).toISOString().slice(0, 10) // YYYY-MM-DD in UTC
}

// The `cards` catalog is static game data (no runtime writes — only changes on
// deploy), yet loadCards is called several times PER request (getCrewState,
// applyAssignment ×N in crewTheDeck, recruit, reroll…). Cache the raw read at
// module scope (fetched once per warm instance) but rebuild byGroup/meta fresh on
// every call so no caller can mutate shared state.
let _cardCatalog: CardRow[] | null = null

/** Catalog → portrait pool by group + a lookup for name/filename. Laz the
 *  Coelacanth is a normal legendary in the pool (fully released 2026-07-07 — no
 *  longer Hardcore-discovery-gated). */
async function loadCards(db: CrewData) {
  if (!_cardCatalog) _cardCatalog = await db.cardCatalog()
  return cardPools(_cardCatalog)
}

/** Roll N candidate rows ready for insert into daily_recruits. startXp is
 *  the Crew Hall seed STAMPED AT ROLL TIME — upgrading the hall mid-board
 *  must not retroactively level candidates already on display, so the perk
 *  lives on the row, not the profile read at recruit time. */
function generateBoardRows(
  userId: string,
  size: number,
  source: 'free' | 'gem',
  weights: readonly [number, number, number, number],
  byGroup: Record<CrewRarity, number[]>,
  meta: Map<number, CardMeta>,
  startXp: number,
  legendaryUnlocks: readonly string[],
  /** One-shot gift/test flag: slot 0 is a guaranteed Legendary this roll. The
   *  caller clears it, so it fires exactly once. Only ever forces a legendary
   *  the player can actually roll — the campaign gate below still applies, so
   *  this cannot hand out someone whose chapter is unfinished. */
  guaranteeLegendary = false,
  /** WHICH legendary, when the flag above is set. Without it the card is drawn
   *  at random from every legendary in reach, so a gift aimed at one of the four
   *  was a one-in-four. Advisory: a slug that is locked or unknown falls through
   *  to the random draw rather than failing the roll, so the gate still decides
   *  what is reachable and this only decides among what already is. */
  legendarySlug: string | null = null,
) {
  // The roll (campaign gate, empty-group fallback, the one-shot gifted
  // legendary) is lib/crewRules rollRecruitBoard; this stamps the rows.
  return rollRecruitBoard({ size, weights, byGroup, meta, legendaryUnlocks, guaranteeLegendary, legendarySlug })
    .map((c, slot) => ({
      user_id: userId, slot, source,
      card_id: c.cardId, rarity: c.rarity,
      power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects,
      start_xp: startXp,
    }))
}

function toCandidate(r: any, meta: Map<number, CardMeta>): BoardCandidate {
  const m = meta.get(r.card_id)
  return {
    id: r.id, slot: r.slot, source: r.source, cardId: r.card_id,
    name: m ? crewDisplayName(m.slug, m.name) : 'Unknown',
    filename: m?.filename ?? '',
    slug: (m?.slug ?? '').toLowerCase(),
    rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
    effects: (r.effects ?? []) as string[], recruited: r.recruited,
    startXp: (r.start_xp as number | null) ?? 0,
  }
}

/** Roster display order: level desc, then rarity desc, then raw XP desc
 *  (finer tiebreak within a level), with the DB's recruited_at-desc order
 *  as the final stable fallback. Used by both the Crew Hall roster and the
 *  expeditions crew screen so the manifest reads the same everywhere. */
function rosterSort(a: CrewMember, b: CrewMember): number {
  return (
    crewLevelFromXP(b.xp) - crewLevelFromXP(a.xp) ||
    b.rarity - a.rarity ||
    b.xp - a.xp
  )
}

function toMember(r: any, meta: Map<number, CardMeta>, equippedSkins?: EquippedCrewSkins): CrewMember {
  const m = meta.get(r.card_id)
  const nickname = (r.nickname as string | null) ?? null
  const slug = (m?.slug ?? '').toLowerCase()
  return {
    id: r.id, cardId: r.card_id,
    name: nickname ?? (m ? crewDisplayName(m.slug, m.name) : 'Unknown'),
    nickname,
    // Equipped legendary skin (if any) swaps the base art everywhere toMember flows.
    filename: resolveCrewFilename(slug, m?.filename ?? '', equippedSkins),
    baseFilename: m?.filename ?? '',
    slug,
    rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
    effects: (r.effects ?? []) as string[],
    // A Leviathan re-cut awaiting keep-or-replace. Rides on the member so the
    // roster card can flag it wherever a crew is drawn, not just in the hall.
    pendingTrait: (r.pending_trait as string | null) ?? null,
    voyageSlot: (r.voyage_slot as number | null) ?? null,
    raidSlot:   (r.raid_slot as number | null) ?? null,
    xp: (r.xp as number | null) ?? 0,
  }
}

/**
 * TODAY'S FREE BOARD, rolled if it has not been yet. One implementation for
 * the crew screen and the day board's Recruits card, so a board is rolled once
 * a day whichever door you come in by.
 *
 * ── A GUARANTEED LEGENDARY NEVER LANDS HERE (Kong, 2026-09-26). The one-shot
 * flag (`crew_next_roll_legendary`, pinned or not) is honoured ONLY by the paid
 * reroll; this neither uses nor clears it. Free-board weights have no
 * legendary in them either (FREE_WEIGHTS), which is also why rolling it from
 * the day board spends nothing a player chose to keep.
 *
 * Stamp the date FIRST, and only if it is still stale. Two readers arriving at
 * the rollover both get here; only the one whose stamp lands refills, so
 * boards never stack.
 */
async function fillFreeBoardIfStale(
  db: CrewData,
  userId: string,
  prevDate: string | null,
  byGroup: Record<CrewRarity, number[]>,
  meta: Map<number, CardMeta>,
  legendaryUnlocks: readonly string[],
) {
  const today = utcDate()
  if (prevDate === today) return
  if (await db.stampFreeBoard(userId, prevDate, today)) {
    await db.replaceBoard(userId, generateBoardRows(userId, DAILY_RECRUITS, 'free', FREE_WEIGHTS, byGroup, meta, 0, legendaryUnlocks, false, null))
  }
}

export type RecruitFace = { rarity: number; name: string; art: string; recruited: boolean }

/**
 * THE FACES ON TODAY'S BOARD, for the day board's Recruits card (2026-09-26).
 * Rolls today's free board if nobody has looked yet (see fillFreeBoardIfStale).
 */
export async function todaysRecruits(db: CrewData, uid: string): Promise<{ faces: RecruitFace[] } | null> {
  const prof = await db.profile(uid, 'last_free_recruit_date, legendary_unlocks')
  if (!prof) return null
  const { byGroup, meta } = await loadCards(db)
  await fillFreeBoardIfStale(db, uid, ((prof as any).last_free_recruit_date as string | null) ?? null,
    byGroup, meta, ((prof as any).legendary_unlocks as string[] | null) ?? [])
  const rows = await db.board(uid)
  return {
    faces: rows.map(r => {
      const m = meta.get(r.card_id as number)
      return {
        rarity: Number(r.rarity) || 1,
        name: m?.name ?? 'A new hand',
        art: m ? cardArt(m.filename) : '',
        recruited: r.recruited === true,
      }
    }),
  }
}

// ── Read state (also lazily fills the once-a-day free board) ────────────────

export async function getCrewState(db: CrewData, uid: string): Promise<CrewState | null> {
  const prof = await db.profile(uid, 'gems, is_premium, premium_expires_at, expedition_xp, last_free_recruit_date, ship_tier, crew_hall_tier, crew_drill_level, crew_stores_level, doubloons, blood_gems, owned_crew_skins, equipped_crew_skins, is_admin, gauntlet_deepest, raid_node_progress, ship_classes, has_sixth_berth, legendary_unlocks, crew_next_roll_legendary, crew_next_roll_legendary_slug')
  if (!prof) return null

  const premium = isPremiumActive(prof as any)
  const navLevel = getLevelFromXP((prof as any).expedition_xp ?? 0)
  const capacity = crewCapacity(navLevel, (prof as any).crew_hall_tier)
  const gems = (prof as any).gems ?? 0
  const shipTier = (prof as any).ship_tier ?? 0
  // Hull berths + the Ch4 Expanded Quarters augment.
  const shipCrewSlots = (EXPEDITION_SHIP_STATS[shipTier]?.crewSlots ?? 1)
    + classSlotBonuses((prof as any).ship_classes as Record<string, string> | null).crewSlots
    + ((prof as any).has_sixth_berth === true ? 1 : 0)

  const { byGroup, meta } = await loadCards(db)
  const legendaryUnlocks = ((prof as any).legendary_unlocks as string[] | null) ?? []

  // Free board fills once per UTC day; gem rerolls (which set the date too)
  // won't be clobbered by this.
  await fillFreeBoardIfStale(db, uid, ((prof as any).last_free_recruit_date as string | null) ?? null, byGroup, meta, legendaryUnlocks)

  const boardRows = await db.board(uid)
  // Live roster only — fallen crew (died_at IS NOT NULL) live in the
  // Crew Hall Graveyard tab, not the active roster.
  const rosterRows = await db.roster(uid)

  // Pending voyage lock: any crew currently in a 'pending' daily_voyages
  // crew_variant_ids list can't be reassigned until the voyage reveals.
  // Surface those ids so the UI can gray out + disable the toggle.
  // Crew out on a Trawl are likewise locked from reassignment (hard-locked
  // at sea for the hour). Surfaced separately so the UI can label them.
  const [atSea, trawlingCrewIds, bunkRows] = await Promise.all([
    db.voyageAtSea(uid),
    db.trawling(uid),
    db.bunks(uid),
  ])
  const lockedCrewIds: number[] = atSea ?? []
  const bunkedCrewIds: number[] = ((bunkRows ?? []) as any[]).map(r => r.crew_id as number)
  const liveRate = bunkRatePerHour((prof as any).crew_drill_level ?? 1)
  const liveCap = storesCapHours((prof as any).crew_stores_level ?? 1)
  // Each bunk on ITS OWN terms. rate_per_hour / cap_hours are null only on rows
  // that predate the columns, which fall back to the live values.
  const bunkTerms: Record<number, { since: string; rate: number; cap: number; slot: number | null }> = Object.fromEntries(
    ((bunkRows ?? []) as any[]).map(r => [r.crew_id as number, {
      since: r.since as string,
      rate: (r.rate_per_hour as number | null) ?? liveRate,
      cap: (r.cap_hours as number | null) ?? liveCap,
      slot: (r.slot as number | null) ?? null,
    }]))
  // Still mid-stint: hard-locked out of parties, trawls and dismissal. Split
  // from bunkedCrewIds because a FINISHED stint is only waiting to be
  // collected and should not read as locked.
  const bunkLockedCrewIds: number[] = ((bunkRows ?? []) as any[])
    .filter(r => !stintDone(r.since as string, clockNow(), (r.cap_hours as number | null) ?? liveCap))
    .map(r => r.crew_id as number)

  const ownedCrewSkins = ((prof as any).owned_crew_skins as string[] | null) ?? []
  const equippedCrewSkins = ((prof as any).equipped_crew_skins as EquippedCrewSkins | null) ?? {}

  return {
    board: boardRows.map(r => toCandidate(r, meta)),
    roster: rosterRows.map(r => toMember(r, meta, equippedCrewSkins)).sort(rosterSort),
    capacity, navLevel, gems, isPremium: premium, rerollCost: REROLL_COST,
    shipCrewSlots, lockedCrewIds, trawlingCrewIds, bunkedCrewIds, bunkLockedCrewIds, bunkTerms,
    hallBunksOpen: hallBunksOpen((prof as any).is_admin),
    drillLevel: (prof as any).crew_drill_level ?? 1,
    storesLevel: (prof as any).crew_stores_level ?? 1,
    capHours: storesCapHours((prof as any).crew_stores_level ?? 1),
    hallTier: clampHallTier((prof as any).crew_hall_tier),
    doubloons: (prof as any).doubloons ?? 0,
    navXp: (prof as any).expedition_xp ?? 0,
    bloodGems: ((prof as any).blood_gems as number | null) ?? 0,
    hardcoreUnlocked: hardcoreUnlocked({
      // Captain's water (lib/captainWater); this only decides whether the
      // Blood Market door is drawn, the server keeps the gate itself.
      captain: premium,
      isAdmin: (prof as any).is_admin,
      clearedNodes: ((prof as any).raid_node_progress?.cleared as string[] | undefined) ?? [],
      deepest: (prof as any).gauntlet_deepest ?? 0,
    }),
    ownedCrewSkins, equippedCrewSkins,
  }
}

/** The state after a change, or the one failure every action reports. */
async function after(db: CrewData, uid: string): Promise<CrewActionResult> {
  const state = await getCrewState(db, uid)
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Just the owned LIVE roster (no recruit board, no graveyard), for the
 *  expeditions crew screen. */
export async function getCrewRoster(db: CrewData, uid: string): Promise<CrewMember[]> {
  // All three at once. The roster read waited on the other two for nothing:
  // it needs neither to be sent, only to be shaped.
  const [{ meta }, prof, rosterRows] = await Promise.all([
    loadCards(db),
    db.profile(uid, 'equipped_crew_skins'),
    db.roster(uid),
  ])
  const equippedCrewSkins = ((prof as any)?.equipped_crew_skins as EquippedCrewSkins | null) ?? {}
  return rosterRows.map(r => toMember(r, meta, equippedCrewSkins)).sort(rosterSort)
}

// ── Reroll the board for 100 gems (always 3 new, boosted odds) ──────────────
// Optional `bloodTierId` = a Blood Gem "blood-charged reroll" (BLOOD_REROLL_TIERS):
// spend Blood Gems ALONGSIDE the 100 gems to swap in a tier's boosted Epic +
// Legendary weights. Blood Gems come only from the Hardcore Gauntlet.

export async function rerollBoard(db: CrewData, uid: string, bloodTierId?: string | null): Promise<CrewActionResult> {
  const tier = bloodRerollTier(bloodTierId)
  if (bloodTierId && !tier) return { error: 'Unknown reroll tier' }

  const prof = await db.profile(uid, 'gems, crew_hall_tier, blood_gems, unlocked_badges, badge_unlocked_at, legendary_unlocks, crew_next_roll_legendary, crew_next_roll_legendary_slug')
  const gems = (prof as any)?.gems ?? 0
  const bloodGems = ((prof as any)?.blood_gems as number | null) ?? 0
  if (gems < REROLL_COST) return { error: 'Not enough gems' }
  if (tier && bloodGems < tier.bloodCost) return { error: 'Not enough Blood Gems' }

  // Both currencies leave in place (the guard against concurrent rerolls
  // overdrawing either). Gems first; if the Blood Gems fall short the gems
  // go back.
  if (await db.spend(uid, 'gems', REROLL_COST) === null) return { error: 'Not enough gems' }
  if (tier && await db.spend(uid, 'blood_gems', tier.bloodCost) === null) {
    await db.grant(uid, 'gems', REROLL_COST)
    return { error: 'Not enough gems or Blood Gems' }
  }
  // Stamp today's date so getCrewState() won't regenerate a free board over
  // this gem roll.
  await db.updateProfile(uid, { last_free_recruit_date: utcDate() })

  // Blood-Charged badge — hook-granted the first time a reroll is boosted with
  // Blood Gems (a blood-charged reroll; not derivable from stored state).
  if (tier) {
    const badges = ((prof as any)?.unlocked_badges as string[] | null) ?? []
    if (!badges.includes('blood_charged')) {
      await db.updateProfile(uid, { unlocked_badges: [...badges, 'blood_charged'], badge_unlocked_at: stampBadges((prof as { badge_unlocked_at?: unknown } | null)?.badge_unlocked_at, ['blood_charged']) })
    }
  }

  const { byGroup, meta } = await loadCards(db)
  const weights = tier ? tier.weights : GEM_WEIGHTS
  const legendaryUnlocks = ((prof as any)?.legendary_unlocks as string[] | null) ?? []
  // Same one-shot flag as the free board — whichever roll the captain does
  // first spends it. Cleared TOGETHER with its pin (a pin left behind would
  // aim the next gift at the wrong crew), and cleared BEFORE the roll with a
  // guarded write, so two rerolls fired together honour it only once.
  let owedLegendary = false
  if ((prof as any)?.crew_next_roll_legendary === true) {
    owedLegendary = await db.takeOneShotLegendary(uid)
  }
  const rows = generateBoardRows(uid, 3, 'gem', weights, byGroup, meta, 0, legendaryUnlocks, owedLegendary, owedLegendary ? ((prof as any)?.crew_next_roll_legendary_slug ?? null) : null)
  await db.replaceBoard(uid, rows)

  return after(db, uid)
}

// ── Blood Gem skin gamble ───────────────────────────────────────────────────
// Spend BLOOD_SKIN_GAMBLE_COST Blood Gems for ONE random skin the player doesn't
// own yet, from the NON-legendary pool (Rare + Epic crews). No dupes — dead once
// every non-legendary skin is owned. Granted to owned_crew_skins (not auto-
// equipped; the result is random).
export async function gambleBloodSkin(db: CrewData, uid: string): Promise<{ skinId: string; state: CrewState } | { error: string }> {
  const prof = await db.profile(uid, 'blood_gems, owned_crew_skins, unlocked_badges, badge_unlocked_at')
  if (!prof) return { error: 'Profile not found' }
  const bloodGems = ((prof as any).blood_gems as number | null) ?? 0
  if (bloodGems < BLOOD_SKIN_GAMBLE_COST) return { error: 'Not enough Blood Gems' }

  // One non-legendary skin not yet owned: lib/crewRules pickBloodSkin.
  const skin = pickBloodSkin(((prof as any).owned_crew_skins as string[] | null) ?? [])
  if (!skin) return { error: 'You already own every non-legendary skin.' }

  // Blood Gems leave in place first (the guard against a double-tap), then
  // the skin lands once. If a twin request already added this same skin,
  // the Blood Gems go back.
  if (await db.spend(uid, 'blood_gems', BLOOD_SKIN_GAMBLE_COST) === null) return { error: 'Not enough Blood Gems' }
  if (!(await db.addToList(uid, 'owned_crew_skins', skin.id))) {
    await db.grant(uid, 'blood_gems', BLOOD_SKIN_GAMBLE_COST)
    return { error: 'Try again' }
  }

  // Crimson Fortune badge — hook-granted the first time the blood gamble pays
  // out a skin (can't be derived from stored state; mirrors catfish_jackpot).
  const badges = ((prof as any).unlocked_badges as string[] | null) ?? []
  if (!badges.includes('crimson_fortune')) {
    await db.updateProfile(uid, { unlocked_badges: [...badges, 'crimson_fortune'], badge_unlocked_at: stampBadges((prof as { badge_unlocked_at?: unknown } | null)?.badge_unlocked_at, ['crimson_fortune']) })
  }

  const state = await getCrewState(db, uid)
  if (!state) return { error: 'Failed to load crew' }
  return { skinId: skin.id, state }
}

// ── Recruit a candidate (free, capacity-gated) ──────────────────────────────

export async function recruitCrew(db: CrewData, uid: string, recruitId: number): Promise<CrewActionResult> {
  const prof = await db.profile(uid, 'expedition_xp, crew_hall_tier')
  const capacity = crewCapacity(getLevelFromXP((prof as any)?.expedition_xp ?? 0), (prof as any)?.crew_hall_tier)

  // Claim the candidate FIRST, and only if it is still unclaimed. Two taps
  // fired together both reach here; only the one whose update comes back
  // with a row gets the crew member.
  const rec = await db.claimRecruit(uid, recruitId)
  if (!rec) {
    return { error: (await db.recruitExists(uid, recruitId)) ? 'Already recruited' : 'Recruit not found' }
  }
  // Capacity check counts LIVE roster only — fallen crew don't take
  // up a roster slot (graveyard is unlimited memorial space).
  // Roster full: hand the candidate back so it can be taken later.
  if ((await db.liveCount(uid)) >= capacity) {
    await db.unclaimRecruit(uid, recruitId)
    return { error: 'Roster full' }
  }

  await db.addCrew(uid, {
    card_id: (rec as any).card_id,
    rarity: (rec as any).rarity,
    power: (rec as any).power,
    dodge: (rec as any).dodge,
    fortune: (rec as any).fortune,
    effects: (rec as any).effects,
    voyage_slot: null,
    raid_slot: null,
    // Crew Hall perk: recruits arrive at the level stamped on the board
    // row WHEN IT WAS ROLLED (not the live hall tier), so upgrading the
    // hall mid-board only benefits the next roll. Level is derived from
    // XP, so seeding it covers stat ticks, ability unlock, chips and bars.
    xp: (rec as any).start_xp ?? 0,
  })
  // Lifetime recruit counter (cumulative; user_crew only holds the live roster).
  await db.bumpStat(uid, 'lifetime_recruits', 1)

  return after(db, uid)
}

// ── Upgrade the Crew Hall (doubloon-guarded tier bump) ───────────────────────

export async function upgradeCrewHall(db: CrewData, uid: string): Promise<CrewActionResult> {
  const prof = await db.profile(uid, 'doubloons, crew_hall_tier, expedition_xp')
  const current = clampHallTier((prof as any)?.crew_hall_tier)
  const next = nextHallTier(current)
  if (!next) return { error: 'Crew Hall is fully upgraded' }

  const doubloons = (prof as any)?.doubloons ?? 0
  // Server-side gate, not just a disabled button — the action is callable
  // directly. Same shape as the gear buys in lib/gearGating.
  const blocker = hallUpgradeBlocker(current, getLevelFromXP((prof as any)?.expedition_xp ?? 0), doubloons)
  if (blocker === 'nav') return { error: `Reach Navigation ${next.minNav} first.` }
  if (blocker === 'doubloons') return { error: 'Not enough doubloons' }

  // Guarded update: gte() stops concurrent taps from overdrawing, and the
  // eq() on the current tier stops a double-submit from buying two tiers
  // for one confirmation.
  if (await db.spend(uid, 'doubloons', next.cost) === null) return { error: 'Not enough doubloons' }
  if (!(await db.stepUp(uid, 'crew_hall_tier', current, next.tier))) {
    // A twin request bought this tier first; this payment goes back.
    await db.grant(uid, 'doubloons', next.cost)
    return { error: 'Crew Hall already upgraded' }
  }

  return after(db, uid)
}

// ── Dismiss a crew member (free up roster space) ─────────────────────────────

export async function dismissCrew(db: CrewData, uid: string, crewId: number): Promise<CrewActionResult> {
  // Locked crew (at sea on a voyage / out on a trawl) can't be dismissed in any
  // way — same guard as reassignment, server-side backstop for the UI gating.
  const guard = await assertCanReassign(db, uid, crewId)
  if ('error' in guard) return { error: guard.error }

  // Dismiss only applies to live crew. Fallen crew live in the
  // graveyard permanently — no "dismiss" affordance there.
  await db.dismiss(uid, crewId)

  return after(db, uid)
}

// ── Assignment: voyage / raid / bench ────────────────────────────────────────
// Each crew can live on EXACTLY ONE track at a time — the DB CHECK constraint
// `user_crew_one_track_only` enforces this so concurrent server-action races
// can't double-book a crew. The track-aware actions below also handle:
//   - in-progress voyage lock (a crew currently at sea can't be reassigned)
//   - one-card-per-track (you can't deploy two copies of the same fish on
//     the same voyage/raid simultaneously)
//   - slot collision (assigning to a taken slot benches the previous holder)

export type AssignTrack = 'voyage' | 'raid'

/** Common assignment guard: ownership, not-fallen, no in-progress voyage.
 *  Returns the crew row (id + card_id) or an error envelope to forward up. */
async function assertCanReassign(
  db: CrewData,
  userId: string,
  crewId: number,
): Promise<{ ok: true; crew: { id: number; card_id: number; voyage_slot: number | null } } | { error: string }> {
  const crew = await db.crew(userId, crewId, 'id, card_id, voyage_slot')
  if (!crew) return { error: 'Crew not found' }

  // In-progress voyage lock — if this crew is in a pending voyage's
  // crew_variant_ids, they're at sea right now and can't be reassigned
  // until the voyage reveals.
  if ((crew as any).voyage_slot != null) {
    const onActive = ((await db.voyageAtSea(userId)) ?? []).includes(crewId)
    if (onActive) return { error: 'This crew is at sea right now. Wait for their voyage to return.' }
  }

  // Trawl lock — a crew out on a trawl is hard-locked at sea for the hour.
  if (await db.onTrawl(userId, crewId)) return { error: 'This crew is out on a trawl. Collect it first to free them up.' }

  // Bunk lock — a hand in the hall is committed for the whole stint. This
  // USED to auto-evict them and bank the XP, which made bunking free; the
  // commitment is the price of the training, so it is a refusal now. Covers
  // dismissal too, since dismissCrew runs the same guard.
  //
  // A hand holds their bunk until the XP is CLAIMED, not merely until the
  // stint timer runs out. Letting a finished-but-unclaimed hand walk was the
  // one way a crew could be seated and bunked at the same time, which put a
  // "Training" badge on a party seat and made the hall look like it had lost
  // them. Claiming deletes the row, so the block clears the moment you collect.
  const onBunk = await db.bunkOf(userId, crewId)
  if (onBunk) {
    // The length AGREED when they went in, not the current Stores tier. Reading
    // the live tier would let a Stores purchase extend a hand's sentence after
    // the fact, or cut it short.
    let cap = (onBunk as any).cap_hours as number | null
    if (cap == null) {
      const prof = await db.profile(userId, 'crew_stores_level')
      cap = storesCapHours((prof as any)?.crew_stores_level ?? 1)
    }
    return stintDone((onBunk as any).since, clockNow(), cap)
      ? { error: 'This crew finished their training. Collect it in the hall to free them up.' }
      : { error: 'This crew is training in the hall. Their stint has to finish first.' }
  }

  return { ok: true, crew: crew as any }
}

async function applyAssignment(
  db: CrewData,
  userId: string,
  crewId: number,
  target: AssignTrack | null,
  slot: number | null,
): Promise<CrewActionResult> {
  const guard = await assertCanReassign(db, userId, crewId)
  if ('error' in guard) return { error: guard.error }
  const { crew } = guard

  if (target === null || slot === null) {
    // Bench — clear both columns. A bunk is kept deliberately: benched IS the
    // state a bunked crew lives in, so benching them changes nothing.
    await db.updateCrew(userId, crewId, { voyage_slot: null, raid_slot: null })
  } else {

    const prof = await db.profile(userId, 'ship_tier, ship_classes, has_sixth_berth')
    const tier = (prof as any)?.ship_tier ?? 0
    // Hull berths + the Ch4 Expanded Quarters augment.
    const crewSlots = (EXPEDITION_SHIP_STATS[tier]?.crewSlots ?? 1)
      + classSlotBonuses((prof as any)?.ship_classes as Record<string, string> | null).crewSlots
      + ((prof as any)?.has_sixth_berth === true ? 1 : 0)
    if (slot < 0 || slot >= crewSlots) return { error: 'Invalid slot' }

    const slotCol  = target === 'voyage' ? 'voyage_slot' : 'raid_slot'
    const otherCol = target === 'voyage' ? 'raid_slot'   : 'voyage_slot'

    // 1) Bench whoever currently holds this exact target slot.
    await db.vacateSeat(userId, target, slot)
    // 2) Bench any other copy of the same card already on the same track
    //    (one of each fish per track to stop "stack three swordfish for ult").
    await db.vacateSpecies(userId, target, crew.card_id, crewId)
    // 3) Clear THIS crew's other-track slot first — CHECK constraint requires
    //    one of {voyage_slot, raid_slot} to be null before writing.
    await db.updateCrew(userId, crewId, { [otherCol]: null })
    // 4) Finally place them on the target slot.
    await db.updateCrew(userId, crewId, { [slotCol]: slot })
  }

  return after(db, userId)
}

/** Assign a crew to a voyage slot. Pass `null` to bench the crew. */
export async function assignToVoyage(db: CrewData, uid: string, crewId: number, slot: number | null): Promise<CrewActionResult> {
  return applyAssignment(db, uid, crewId, slot === null ? null : 'voyage', slot)
}

/** Assign a crew to a raid loadout slot. Pass `null` to bench the crew. */
export async function assignToRaid(db: CrewData, uid: string, crewId: number, slot: number | null): Promise<CrewActionResult> {
  return applyAssignment(db, uid, crewId, slot === null ? null : 'raid', slot)
}

/** CLEAR A WHOLE PARTY IN ONE GO.
 *
 *  Emptying a six-seat party was six taps through a confirm each, which is the
 *  kind of chore that makes people leave a bad party sitting there.
 *
 *  Two refusals, and only two, because the rest of applyAssignment's guards do
 *  not apply to a party that is already seated:
 *    - a VOYAGE party cannot be broken up while it is at sea, or the voyage
 *      resolves against a crew that is no longer on it
 *    - a CAMPAIGN party cannot be broken up during an open OR paused gauntlet
 *      run, for the same reason (raids cannot be paused, so they need no check)
 *
 *  Nothing else can hold a seat: a trawling or bunked hand is never in a party
 *  to begin with, so there is no per-crew lock to check here.
 *
 *  One UPDATE for the whole party rather than N round-trips — this is a bulk
 *  clear, not a loop over the single-crew path. */
export async function clearParty(db: CrewData, uid: string, track: AssignTrack): Promise<CrewActionResult> {
  if (track === 'voyage') {
    if ((await db.voyageAtSea(uid)) !== null) return { error: 'Your crew is at sea. Wait for the voyage to return.' }
  } else {
    // `gauntlet_run_open` alone covers active AND paused: pausing flips
    // gauntlet_run_paused and deliberately leaves the run open, so a paused
    // run is still an open one holding this exact party.
    const prof = await db.profile(uid, 'gauntlet_run_open')
    if ((prof as { gauntlet_run_open?: boolean } | null)?.gauntlet_run_open) {
      return { error: 'A gauntlet run is still going. Finish or cash out first.' }
    }
  }

  // Everyone in the party leaves. There is no per-crew skip list because a
  // seated hand cannot also be trawling or bunked: starting a trawl benches
  // them outright, bunking refuses a seated crew, and a bunk is now held until
  // the XP is claimed — so the three states are mutually exclusive by
  // construction rather than by a filter that would drift out of step.
  await db.clearTrack(uid, track)

  return after(db, uid)
}

/** Bench a crew (clear both voyage_slot and raid_slot). */
export async function benchCrew(db: CrewData, uid: string, crewId: number): Promise<CrewActionResult> {
  return applyAssignment(db, uid, crewId, null, null)
}

/** One-shot crew rename. Sets `nickname` if it's still null; rejects every
 *  attempt after that so a name lands once and lives forever (same shape as
 *  the username rename flow). Trims whitespace, length-clamps to 1-30 chars,
 *  rejects empty strings. */
export async function renameCrew(db: CrewData, uid: string, crewId: number, nickname: string): Promise<CrewActionResult> {
  const clean = nickname.trim()
  if (clean.length < 1) return { error: 'Pick a name first.' }
  if (clean.length > 30) return { error: 'Name must be 30 characters or fewer.' }

  const crew = await db.crew(uid, crewId, 'id, nickname')
  if (!crew) return { error: 'Crew not found' }
  if ((crew as any).nickname != null) return { error: 'This crew has already been named.' }

  if (!(await db.updateCrew(uid, crewId, { nickname: clean }))) return { error: 'Could not save the name. Try again.' }

  return after(db, uid)
}

/** Promote an already-assigned crew to captain (slot 0) on whichever track
 *  they're on. Swaps slot indices with the current slot-0 holder if one
 *  exists; if slot 0 is empty, the crew just moves to it. No-op if the
 *  crew is benched or already the captain. */
export async function promoteToCaptain(db: CrewData, uid: string, crewId: number): Promise<CrewActionResult> {
  const guard = await assertCanReassign(db, uid, crewId)
  if ('error' in guard) return { error: guard.error }

  const target = await db.crew(uid, crewId, 'id, voyage_slot, raid_slot')
  if (!target) return { error: 'Crew not found' }

  const t = target as any
  const track: 'voyage' | 'raid' | null =
    t.voyage_slot !== null ? 'voyage' :
    t.raid_slot   !== null ? 'raid'   :
                              null
  if (!track) return { error: 'Bench a crew first to deploy them on a track before promoting.' }

  const slotCol = track === 'voyage' ? 'voyage_slot' : 'raid_slot'
  const targetOldSlot: number = t[slotCol]
  if (targetOldSlot === 0) return after(db, uid)  // already captain

  // Find current captain on the same track (slot 0) — null if no one's there.
  const captain = await db.captainOf(uid, track)

  if (captain != null) {
    // Swap. There's no unique-slot constraint, so a brief "both at slot 0"
    // intermediate state is technically allowed by the DB; doing it in two
    // sequential UPDATEs anyway for clarity.
    await db.updateCrew(uid, captain, { [slotCol]: targetOldSlot })
  }
  await db.updateCrew(uid, crewId, { [slotCol]: 0 })

  return after(db, uid)
}

// ── Crew skins: buy (gems) + equip (per legendary species) ──────────────────

/** Buy a legendary crew skin with gems. Gated: the skin must exist, the player
 *  must OWN that legendary (a live user_crew of its species), and not already
 *  own the skin. Guarded gem deduction prevents a double-spend race. */
export async function buyCrewSkin(db: CrewData, uid: string, skinId: string): Promise<CrewActionResult> {
  const skin = getCrewSkin(skinId)
  if (!skin) return { error: 'Unknown skin' }

  const prof = await db.profile(uid, 'gems, owned_crew_skins, equipped_crew_skins')
  if (!prof) return { error: 'Profile not found' }
  const owned = ((prof as any).owned_crew_skins as string[] | null) ?? []
  if (owned.includes(skinId)) return { error: 'Already owned' }
  const gems = (prof as any).gems ?? 0
  if (gems < skin.gemCost) return { error: 'Not enough gems' }

  // Must own the crew this skin is for (a live crew of that species).
  const cardId = await db.cardIdBySlug(skin.slug)
  if (cardId == null) return { error: 'Crew not found' }
  if ((await db.liveCount(uid, cardId)) === 0) return { error: 'Recruit this crew before buying its skins.' }

  // A first-time skin auto-equips — nearly everyone wants to wear what they
  // just bought. (They can still switch back to Original or another owned skin
  // from the Skins tab.)
  const equipped = { ...(((prof as any).equipped_crew_skins as EquippedCrewSkins | null) ?? {}) }
  equipped[skin.slug.toLowerCase()] = skinId

  // Gems leave in place first (the guard), then the skin is added once. If a
  // twin request already added it, the gems go back.
  if (await db.spend(uid, 'gems', skin.gemCost) === null) return { error: 'Not enough gems' }
  if (!(await db.addToList(uid, 'owned_crew_skins', skinId))) {
    await db.grant(uid, 'gems', skin.gemCost)
    return { error: 'Already owned' }
  }
  await db.updateProfile(uid, { equipped_crew_skins: equipped })

  return after(db, uid)
}

/** Equip a crew skin for its species (or pass null to revert to the base art).
 *  Must own the skin. Equipped state is a { slug: skinId } map on the profile. */
export async function equipCrewSkin(db: CrewData, uid: string, slug: string, skinId: string | null): Promise<CrewActionResult> {
  const key = slug.toLowerCase()

  const prof = await db.profile(uid, 'owned_crew_skins, equipped_crew_skins')
  if (!prof) return { error: 'Profile not found' }
  const owned = ((prof as any).owned_crew_skins as string[] | null) ?? []
  const equipped = { ...(((prof as any).equipped_crew_skins as EquippedCrewSkins | null) ?? {}) }

  if (skinId === null) {
    delete equipped[key]
  } else {
    const skin = getCrewSkin(skinId)
    if (!skin || skin.slug !== key) return { error: 'Unknown skin' }
    if (!owned.includes(skinId)) return { error: 'You do not own that skin' }
    equipped[key] = skinId
  }
  await db.updateProfile(uid, { equipped_crew_skins: equipped })

  return after(db, uid)
}

// ── Graveyard: fallen crew with the voyage they died on ──────────────────────

export type FallenCrew = CrewMember & {
  diedAt: string                              // ISO timestamp
  diedOnRoute: string | null                  // voyage route slug (coastal/open/deep), null if voyage row missing
  diedHardcoreDepth: number | null            // set if they drowned in the Hardcore Gauntlet (depth reached), else null
}

/** Memorial roll-call. Returns every crew member who died, most recent
 *  first, with the voyage route they fell on so the UI can render a
 *  "Fell on the Howling Deep · Mar 7" caption. Pre-graveyard losses
 *  (the player's user_crew row was hard-deleted) won't appear here —
 *  the graveyard starts populating from the migration forward. */
export async function getCrewGraveyard(db: CrewData, uid: string): Promise<FallenCrew[]> {
  const { meta } = await loadCards(db)
  const rows = await db.graveyard(uid)
  return (rows as any[]).map(r => {
    const m = meta.get(r.card_id)
    // voyage is a single object via the explicit FK join, but PostgREST
    // typings sometimes default it to an array — handle both shapes.
    const voyage = Array.isArray(r.voyage) ? r.voyage[0] : r.voyage
    const nickname = (r.nickname as string | null) ?? null
    return {
      id: r.id, cardId: r.card_id,
      name: nickname ?? (m ? crewDisplayName(m.slug, m.name) : 'Unknown'),
      nickname,
      filename: m?.filename ?? '',
      baseFilename: m?.filename ?? '',
      slug: (m?.slug ?? '').toLowerCase(),
      rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
      effects: (r.effects ?? []) as string[],
      // A fallen hand holds no offer -- the Leviathan bunk cannot reach them.
      pendingTrait: null,
      voyageSlot: null, raidSlot: null,
      xp: (r.xp as number | null) ?? 0,
      diedAt: r.died_at as string,
      diedOnRoute: (voyage?.route as string | undefined) ?? null,
      diedHardcoreDepth: (r.died_hardcore_depth as number | null) ?? null,
    }
  })
}

// ── CREW THE DECK ────────────────────────────────────────────────────────────
// One tap that fills every empty RAID slot with the best crew available.
//
// This exists because of the single worst leak in the game. voyage_slot and raid_slot
// are MUTUALLY EXCLUSIVE (a DB CHECK constraint), so a crew member is on the voyage
// track or the raid track and never both. New captains find voyages first — they are
// passive and forgiving — assign their crew there, and reasonably conclude "my crew is
// assigned". Then they open the campaign and sail into a raid with an EMPTY deck.
//
// The data was unambiguous: every player who beat Raid 1 had 4-6 raid crew. Every
// player who stalled had 0-2. One of them had run 23 voyages, bought a tier-3 ship, and
// never once put a soul in a raid slot.
//
// `pullFromVoyages` decides whether crew currently out on the voyage track may be
// recalled. Off by default: taking someone off a voyage is a real trade and the player
// should choose it, not have it happen to them.
export async function crewTheDeck(db: CrewData, uid: string, pullFromVoyages = false): Promise<
  { assigned: number; stillEmpty: number; onVoyages: number; state: CrewState } | { error: string }
> {
  const prof = await db.profile(uid, 'ship_tier, has_sixth_berth')

  const slots = EXPEDITION_SHIP_STATS[(prof?.ship_tier as number | null) ?? 0].crewSlots
    + ((prof as any)?.has_sixth_berth === true ? 1 : 0)

  const roster = await getCrewRoster(db, uid)
  const alive = roster.filter(c => c.raidSlot != null || c.voyageSlot != null || true)

  // Who is already aboard, and which slots are empty.
  const taken = new Set(alive.filter(c => c.raidSlot != null).map(c => c.raidSlot as number))
  const empty: number[] = []
  for (let i = 0; i < slots; i++) if (!taken.has(i)) empty.push(i)
  if (empty.length === 0) {
    const s = await getCrewState(db, uid)
    return s ? { assigned: 0, stillEmpty: 0, onVoyages: 0, state: s } : { error: 'Failed to load crew' }
  }

  // Eligible: not already on the raid track, and (unless recalled) not out on a voyage.
  // One of each fish per track — applyAssignment enforces it, so filter here too or the
  // second copy would silently bench the first.
  const aboardCards = new Set(alive.filter(c => c.raidSlot != null).map(c => c.cardId))
  const onVoyages = alive.filter(c => c.voyageSlot != null).length
  const pool = alive
    .filter(c => c.raidSlot == null)
    .filter(c => pullFromVoyages || c.voyageSlot == null)
    .filter(c => !aboardCards.has(c.cardId))
    // Best first: rarity, then the raw stat line. A new captain should not have to know
    // what "best" means yet — that is the whole point of the button.
    .sort((a, b) => (b.rarity - a.rarity) || ((b.power + b.dodge + b.fortune) - (a.power + a.dodge + a.fortune)))

  // The "at sea" locks that applyAssignment would re-check per pick — fetch them
  // ONCE: crew committed to a launched (pending) voyage, and crew out on a trawl.
  // Neither can be pulled onto the raid deck. (The roster already guarantees
  // ownership + alive + the one-of-each-card / empty-slot invariants, so the rest
  // of applyAssignment's per-call guard + profile read + state rebuild is
  // redundant here.)
  const [voyageCrew, trawling] = await Promise.all([db.voyageAtSea(uid), db.trawling(uid)])
  const atSea = new Set<number>(voyageCrew ?? [])
  const onTrawl = new Set<number>(trawling)

  // Pick best-available per empty slot (all in memory), skipping locked crew.
  const used = new Set<number>()
  const placements: { crewId: number; slot: number }[] = []
  for (const slot of empty) {
    const pick = pool.find(c => !used.has(c.id) && !aboardCards.has(c.cardId) && !atSea.has(c.id) && !onTrawl.has(c.id))
    if (!pick) break
    used.add(pick.id)
    aboardCards.add(pick.cardId)
    placements.push({ crewId: pick.id, slot })
  }

  // One UPDATE per placement, in parallel — distinct rows + distinct empty slots,
  // duplicates already filtered, so no collisions. Writing voyage_slot=null +
  // raid_slot=slot together satisfies the one-track-null CHECK in a single write.
  // Then rebuild state ONCE (vs applyAssignment's per-iteration rebuild).
  await Promise.all(placements.map(p => db.updateCrew(uid, p.crewId, { voyage_slot: null, raid_slot: p.slot })))
  const assigned = placements.length

  const state = await getCrewState(db, uid)
  if (!state) return { error: 'Failed to load crew' }
  return { assigned, stillEmpty: empty.length - assigned, onVoyages, state }
}

/** Mark the first-time Crew Hall guide as seen (tour-persistence convention). */
export async function markCrewGuideSeen(db: CrewData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_crew_guide: true })
}

// ── THE CREW HALL'S BUNKS ────────────────────────────────────────────────────
//
// A benched crew takes a bunk and is LOCKED there for a full stint (the hall's
// Stores tier sets how long). Collecting pays the whole stint and frees the
// bunk. There is no early exit, so there is no unbunk action: the only way out
// is to finish. The settlement helpers are lib/crewBunkSettle.

const CLOSED = 'The hall is not taking bunks yet.'

/** A claim reports what each crew earned AND who came back, so the panel can
 *  name every hand and flash level-ups without a second round trip.
 *  `freed` includes hands who earned nothing because they are already at the
 *  level ceiling — without it a claim of only maxed crew would look like
 *  nothing happened. */
export type BunkClaimResult =
  | { state: CrewState; grants: CrewXPGrant[]; freed: number[]; upgrades: TraitUpgrade[] }
  | { error: string }

/**
 * Put a hand in a bunk.
 *
 * `hours` is honoured on the LEVIATHAN bunk only, and only up to the Stores
 * cap. Stores buys a longer stint, which is pure convenience for XP (a stint
 * pays rate x hours and takes hours, so XP per day is rate x 24 whatever you
 * pick) - but the Leviathan bunk rolls ONE trait per stint, so a longer stint
 * is strictly fewer rolls. Buying Stores to six therefore used to cut the
 * re-cut rate to a sixth, which is an upgrade that makes you worse at the one
 * thing the top hall exists for. Choosing the length fixes that without
 * touching XP, because XP per day does not depend on it either way.
 *
 * The ordinary bunks keep taking the full cap: there is nothing to trade off
 * there, and a length picker on all six would be a decision with no stakes.
 */
export async function bunkCrew(db: CrewData, uid: string, crewId: number, slot: number, hours?: number): Promise<CrewActionResult> {
  const crew = await db.crew(uid, crewId, 'id, xp, voyage_slot, raid_slot, died_at, pending_trait', false)
  if (!crew) return { error: 'Crew not found' }
  if ((crew as any).died_at) return { error: 'That hand is gone.' }
  // A hand already holding an unanswered draw cannot go back down for another.
  // recutLeviathanTraits will not overwrite an open offer, so the stint would
  // run its full length and hand back nothing -- which is precisely how this
  // read as "the bunk stopped re-rolling". Answer the one you have first.
  if ((crew as any).pending_trait) {
    return { error: 'They are still holding a draw. Answer it first.' }
  }
  if ((crew as any).voyage_slot !== null || (crew as any).raid_slot !== null) {
    return { error: 'Take them out of their party first.' }
  }
  // Slot-aware: an ordinary bunk pays XP and a maxed hand has nothing to gain,
  // but the Leviathan bunk pays a trait RE-CUT and a maxed hand is exactly who
  // wants one. bunkCrew already knows which bunk is being filled, so the check
  // just has to be told.
  if (!canBunk((crew as any).xp ?? 0, slot)) {
    return { error: 'They are fully trained. Send them to the Leviathan bunk, or bunk a hand who can still learn.' }
  }

  // A trawling crew is away from the hall entirely.
  if (await db.onTrawl(uid, crewId)) return { error: 'They are out on a trawl. Collect it first.' }

  const ctx = await bunkContext(db, uid)
  if (!ctx.open) return { error: CLOSED }
  const bunks = await loadBunks(db, uid)
  if (bunks.some(b => b.crew_id === crewId)) return { error: 'They already have a bunk.' }
  if (bunks.length >= ctx.slots) return { error: 'Every bunk is taken. Build another.' }

  // WHICH bunk matters now that the sixth one can re-cut a trait, so the slot
  // comes from the tile you tapped rather than being picked for you.
  const want = Math.floor(slot)
  if (!Number.isFinite(want) || want < 0 || want >= ctx.slots) {
    return { error: 'That bunk is not open yet.' }
  }
  if (bunks.some(b => b.slot === want)) return { error: 'That bunk is taken.' }

  // Clamp to the Stores cap. Only the Leviathan bunk may shorten: everywhere
  // else the cap IS the stint. Validated here rather than trusted, since this
  // is an HTTP endpoint and a shorter stint means more trait rolls per day.
  const capHours = ctx.capHours
  const askedHours = Math.floor(Number(hours))
  const stintHours = isLeviathanSlot(want) && Number.isFinite(askedHours)
    ? Math.max(1, Math.min(capHours, askedHours))
    : capHours

  // Stamp the TERMS on the row. This is the deal: this rate, this long. Buying
  // Drills or Stores afterwards changes what the NEXT hand gets, never this one.
  // The unique indexes on crew_id and (user_id, slot) are the real guard against
  // a double tap putting one hand in two bunks, or two hands in one bunk.
  if (!(await db.addBunk(uid, { crew_id: crewId, slot: want, rate_per_hour: ctx.rate, cap_hours: stintHours }))) return { error: 'Could not bunk that hand.' }

  return after(db, uid)
}

/**
 * Answer a Leviathan offer: keep what the hand carries, or take the new roll.
 *
 * The offer lives on user_crew.pending_trait, written when the stint settled.
 * That is deliberate and it is the whole anti-reroll guard: if the roll were
 * held on the client, a refresh would draw a fresh one and the 1-in-28 would be
 * worth nothing. Same lesson as castLine's pending_cast token.
 *
 * BOTH answers clear the offer, and the clear is CONDITIONAL on the offer still
 * being there (`.not('pending_trait','is',null)`), so two taps cannot both
 * apply. Declining is a real decision with a real cost - that draw is spent.
 */
export async function resolveTraitOffer(db: CrewData, uid: string, crewId: number, accept: boolean): Promise<CrewActionResult> {
  const crew = await db.crew(uid, crewId, 'id, pending_trait, effects', false)
  if (!crew) return { error: 'Crew not found' }
  const offer = (crew as { pending_trait?: string | null }).pending_trait
  if (!offer) return { error: 'No offer to answer.' }

  // The neutral sentinel means the draw was 0/0/0 -- taking it strips the
  // trait, which is a legitimate (if unkind) outcome of a flat table.
  const nextEffects = offer === NEUTRAL_OFFER ? [] : [offer]

  // Idempotent: a second tap changes nothing.
  if (!(await db.answerTrait(uid, crewId, accept ? { effects: nextEffects, pending_trait: null } : { pending_trait: null }))) return { error: 'That offer was already answered.' }

  return after(db, uid)
}

/**
 * Collect ONE finished stint. Tapping a single hand used to collect every
 * finished bunk at once, which is a surprising amount to happen from one tap
 * on one crew. Does nothing if that stint is still running, so it is safe
 * against a stale tile.
 */
export async function collectBunk(db: CrewData, uid: string, crewId: number): Promise<BunkClaimResult> {
  const { grants, freed, upgrades } = await releaseBunk(db, uid, crewId)
  const state = await getCrewState(db, uid)
  return state ? { state, grants, freed, upgrades } : { error: 'Failed to load crew' }
}

/**
 * The hall's two in-panel upgrade trees: Drills buy XP PER HOUR, Stores buy
 * HOW MANY HOURS a bunk keeps earning before it fills. Bunk COUNT is not here —
 * that comes from the hall tier alone, so the three things you can buy never
 * overlap: upgrade the building for room, drill for speed, stock stores for
 * time.
 *
 * Canonical doubloon flow: spend first (a relative debit guarded on the live
 * balance, so two concurrent buys cannot both read the same balance and pay
 * once), then the step and a ledger row.
 */
export async function buyHallUpgrade(db: CrewData, uid: string, kind: 'drill' | 'stores'): Promise<CrewActionResult> {
  const ctx = await bunkContext(db, uid)
  if (!ctx.open) return { error: CLOSED }

  const isDrill = kind === 'drill'
  const from = isDrill ? ctx.drillLevel : ctx.storesLevel
  const col = isDrill ? 'crew_drill_level' : 'crew_stores_level'
  // Both ladders stop at six.
  if (isDrill && drillsMaxed(from)) return { error: 'The drills are as sharp as they get.' }
  if (!isDrill && storesMaxed(from)) return { error: 'Stores are already full.' }

  // The hall leads and its contents follow: tier N of either ladder needs hall
  // tier N. Enforced here and not only on the button, since the action is
  // callable directly.
  if (ladderHallLocked(from, clampHallTier(ctx.hallTier))) {
    return { error: `Upgrade the hall to tier ${hallTierRequiredFor(from + 1)} first.` }
  }

  const cost = isDrill ? nextDrillCost(from) : nextStoresCost(from)
  if (cost <= 0) return { error: 'Nothing left to buy.' }
  if (ctx.doubloons < cost) return { error: `Need ${cost.toLocaleString()} ⟡` }

  const newBalance = await db.spend(uid, 'doubloons', cost)
  if (newBalance === null) return { error: `Need ${cost.toLocaleString()} ⟡` }

  // Guarded on the level we priced against, so a double submit cannot buy two
  // levels for one payment.
  if (!(await db.stepUp(uid, col, from, from + 1))) {
    // Lost the race. Refund rather than charging for nothing. (This used to
    // call deduct_doubloons with a negative amount, which the RPC refuses, so
    // the refund silently never landed.)
    await db.grant(uid, 'doubloons', cost)
    return { error: 'That upgrade was already bought.' }
  }

  await db.ledger(uid, -cost, `Crew Hall: ${isDrill ? 'Drill' : 'Stores'} ${tierNumeral(from + 1)}`)
  return after(db, uid)
}

// ── WHO HAS BEEN PROMOTED ───────────────────────────────────────────────────
//
// Kong (2026-09-26): make crew levelling meaningful, above all when a hand
// crosses an ability threshold, without it becoming spam. A crew's Special
// steps up at Lv 10 / 25 / 40 / 75 / 100 (CLASS_MILESTONE_LEVELS past 1), five
// moments in a hand's whole life, and those five are the only thing that gets
// a moment of its own. Ordinary levels never pop.
//
// Checked here rather than at each XP source (raid kills, the gauntlet,
// voyages, trawls, bunk stints) so every source is covered by one read.
// `seen_promotions` holds 'crewId:level' for everything already celebrated. It
// starts NULL and the first check marks everything already reached as seen, so
// an old account is not handed a stack of promotions from last month.

export type Promotion = {
  key: string
  crewId: number
  name: string
  art: string
  className: string
  color: string
  /** Roman tier: Lv 1 is Tier I, so Lv 10 is Tier II and Lv 100 is Tier VI. */
  tier: string
  level: number
  /** What the Special did before, and what it does now. */
  from: string | null
  to: string
}

const TIER = ['I', 'II', 'III', 'IV', 'V', 'VI']
/** The promotions: every milestone past the Lv 1 unlock. */
const STEPS = CLASS_MILESTONE_LEVELS.filter(l => l > 1)

export async function checkPromotions(db: CrewData, uid: string): Promise<Promotion[]> {
  const [prof, crew, { meta }] = await Promise.all([
    db.profile(uid, 'seen_promotions'),
    db.roster(uid),
    loadCards(db),
  ])
  if (!prof) return []

  const seenCol = prof.seen_promotions as string[] | null
  const seen = new Set(seenCol ?? [])
  const out: Promotion[] = []
  const reachedAll: string[] = []

  for (const c of crew ?? []) {
    const card = meta.get(c.card_id as number)
    const cls = card ? classForSlug(card.slug) : null
    if (!card || !cls) continue
    const def = CLASSES[cls]
    const level = crewLevelFromXP(Number(c.xp) || 0)
    const reached = STEPS.filter(l => level >= l)
    if (reached.length === 0) continue
    const keys = reached.map(l => `${c.id}:${l}`)
    reachedAll.push(...keys)
    if (seenCol === null) continue
    const fresh = reached.filter(l => !seen.has(`${c.id}:${l}`))
    if (fresh.length === 0) continue
    // Two tiers crossed in one go (a long bunk stint, a big gauntlet) is ONE
    // card at the top one, with the ability it had before the jump.
    const top = fresh[fresh.length - 1]
    const idx = CLASS_MILESTONE_LEVELS.indexOf(top)
    const now = def.milestones.find(m => m.unlockLevel === top) ?? def.milestones[Math.min(idx, def.milestones.length - 1)]
    // The tier just below the lowest one crossed: what the card says it WAS.
    const beforeLevel = CLASS_MILESTONE_LEVELS[Math.max(0, CLASS_MILESTONE_LEVELS.indexOf(fresh[0]) - 1)]
    const before = def.milestones.find(m => m.unlockLevel === beforeLevel) ?? null
    out.push({
      key: `${c.id}:${top}`,
      crewId: c.id as number,
      name: (c.nickname as string | null) || card.name,
      art: cardArt(card.filename),
      className: def.name,
      color: def.color,
      tier: TIER[idx] ?? String(idx + 1),
      level: top,
      from: before && before.desc !== now.desc ? before.desc : null,
      to: now.desc,
    })
  }

  const next = new Set([...seen, ...reachedAll])
  if (seenCol === null || next.size > seen.size) {
    await db.updateProfile(uid, { seen_promotions: [...next] })
  }
  return out
}
