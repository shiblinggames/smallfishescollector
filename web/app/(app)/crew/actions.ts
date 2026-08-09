'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { crewCapacity } from '@/lib/crewCapacity'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { classSlotBonuses } from '@/lib/shipClasses'
import {
  groupForSlug, rollRarity, rollCrew, crewDisplayName,
  FREE_WEIGHTS, GEM_WEIGHTS, type CrewRarity,
} from '@/lib/crewGen'
import { clampHallTier, nextHallTier, hallUpgradeBlocker, type CrewHallTierNum } from '@/lib/crewHall'
import { bunkContext, loadBunks } from '@/lib/crewBunkSettle'
import { bunkRatePerHour, hallBunksOpen, stintDone, storesCapHours } from '@/lib/crewBunks'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { getCrewSkin, resolveCrewFilename, CREW_SKINS, type EquippedCrewSkins } from '@/lib/crewSkins'
import { bloodRerollTier, BLOOD_SKIN_GAMBLE_COST, hardcoreUnlocked } from '@/lib/gauntlet'
import { isLegendaryLocked } from '@/lib/legendaryUnlocks'

const REROLL_COST = 100

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
  /** Voyage party slot (0..N) or null if not on the voyage track. Mutually
   *  exclusive with raidSlot via the DB CHECK constraint. */
  voyageSlot: number | null
  /** Raid loadout slot (0..N) or null if not on the raid track. */
  raidSlot: number | null
  /** Cumulative XP. Level + per-stat level bonus derived via lib/crewLevel. */
  xp: number
}

// NOTE: helper crewAssignment + type CrewAssignment USED to live here, but
// 'use server' files in Next.js strip every non-async export. They moved
// to web/lib/crewAssignment.ts so both server (this file's callers) and
// client (CrewClient) can import them.

export type CrewState = {
  board: BoardCandidate[]
  roster: CrewMember[]
  capacity: number
  navLevel: number
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

/* eslint-disable @typescript-eslint/no-explicit-any */

type CardMeta = { name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }

function utcDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
}

type CardRow = { id: number; name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }
// The `cards` catalog is static game data (no runtime writes — only changes on
// deploy), yet loadCards is called several times PER request (getCrewState,
// applyAssignment ×N in crewTheDeck, recruit, reroll…). Cache the raw read at
// module scope (fetched once per warm instance) but rebuild byGroup/meta fresh on
// every call so no caller can mutate shared state.
let _cardCatalog: CardRow[] | null = null

/** Catalog → portrait pool by group + a lookup for name/filename. Laz the
 *  Coelacanth is a normal legendary in the pool (fully released 2026-07-07 — no
 *  longer Hardcore-discovery-gated). */
async function loadCards(admin: ReturnType<typeof createAdminClient>) {
  if (!_cardCatalog) {
    const { data } = await admin.from('cards').select('id, name, filename, slug, power, dodge, fortune')
    _cardCatalog = (data ?? []) as CardRow[]
  }
  const byGroup: Record<CrewRarity, number[]> = { 1: [], 2: [], 3: [], 4: [] }
  const meta = new Map<number, CardMeta>()
  for (const c of _cardCatalog) {
    meta.set(c.id, { name: c.name, filename: c.filename, slug: c.slug, power: c.power, dodge: c.dodge, fortune: c.fortune })
    const g = groupForSlug(c.slug)
    if (g) byGroup[g].push(c.id)
  }
  return { byGroup, meta }
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
) {
  // Campaign gate: a locked legendary (Mako/Dole/Laz/Mira before its chapter
  // node is cleared) is dropped from the group-4 pool for THIS player. Catfish
  // + Doby Mick are never gated, so group 4 is never empty — new players can
  // still roll the two originals. If every legendary happened to be locked, the
  // empty-group fallback below drops the roll to Epic.
  const group4 = byGroup[4].filter(id => !isLegendaryLocked(meta.get(id)?.slug ?? '', legendaryUnlocks))
  const poolFor = (r: CrewRarity) => (r === 4 ? group4 : byGroup[r])
  const rows: any[] = []
  for (let slot = 0; slot < size; slot++) {
    let rarity = rollRarity(weights)
    // Fall back to a populated group if the rolled one is empty (defensive).
    while (poolFor(rarity).length === 0 && rarity > 1) rarity = (rarity - 1) as CrewRarity
    const pool = poolFor(rarity)
    if (pool.length === 0) continue
    const cardId = pool[Math.floor(Math.random() * pool.length)]
    const m = meta.get(cardId)
    const profile = { power: m?.power ?? 1, dodge: m?.dodge ?? 1, fortune: m?.fortune ?? 1 }
    const c = rollCrew(cardId, rarity, profile)
    rows.push({
      user_id: userId, slot, source,
      card_id: c.cardId, rarity: c.rarity,
      power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects,
      start_xp: startXp,
    })
  }
  return rows
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
    voyageSlot: (r.voyage_slot as number | null) ?? null,
    raidSlot:   (r.raid_slot as number | null) ?? null,
    xp: (r.xp as number | null) ?? 0,
  }
}

// ── Read state (also lazily fills the once-a-day free board) ────────────────

export async function getCrewState(): Promise<CrewState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()

  const { data: prof } = await admin
    .from('profiles')
    .select('gems, is_premium, premium_expires_at, expedition_xp, last_free_recruit_date, ship_tier, crew_hall_tier, crew_drill_level, crew_stores_level, doubloons, blood_gems, owned_crew_skins, equipped_crew_skins, is_admin, gauntlet_deepest, raid_node_progress, ship_classes, has_sixth_berth, legendary_unlocks')
    .eq('id', user.id)
    .single()
  if (!prof) return null

  const premium = isPremiumActive(prof as any)
  const navLevel = getLevelFromXP((prof as any).expedition_xp ?? 0)
  const capacity = crewCapacity(navLevel)
  const gems = (prof as any).gems ?? 0
  const shipTier = (prof as any).ship_tier ?? 0
  // Hull berths + the Ch4 Expanded Quarters augment.
  const shipCrewSlots = (EXPEDITION_SHIP_STATS[shipTier]?.crewSlots ?? 1)
    + classSlotBonuses((prof as any).ship_classes as Record<string, string> | null).crewSlots
    + ((prof as any).has_sixth_berth === true ? 1 : 0)

  const { byGroup, meta } = await loadCards(admin)
  const today = utcDate()
  const legendaryUnlocks = ((prof as any).legendary_unlocks as string[] | null) ?? []

  // Free board fills once per UTC day; gem rerolls (which set the date too)
  // won't be clobbered by this.
  if ((prof as any).last_free_recruit_date !== today) {
    await admin.from('daily_recruits').delete().eq('user_id', user.id)
    const rows = generateBoardRows(user.id, premium ? 3 : 2, 'free', FREE_WEIGHTS, byGroup, meta, 0, legendaryUnlocks)
    if (rows.length) await admin.from('daily_recruits').insert(rows)
    await admin.from('profiles').update({ last_free_recruit_date: today }).eq('id', user.id)
  }

  const { data: boardRows } = await admin
    .from('daily_recruits')
    .select('id, slot, source, card_id, rarity, power, dodge, fortune, effects, recruited, start_xp')
    .eq('user_id', user.id)
    .order('slot')
  // Live roster only — fallen crew (died_at IS NOT NULL) live in the
  // Crew Hall Graveyard tab, not the active roster.
  const { data: rosterRows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, voyage_slot, raid_slot, xp, nickname')
    .eq('user_id', user.id)
    .is('died_at', null)
    .order('recruited_at', { ascending: false })

  // Pending voyage lock: any crew currently in a 'pending' daily_voyages
  // crew_variant_ids list can't be reassigned until the voyage reveals.
  // Surface those ids so the UI can gray out + disable the toggle.
  // Crew out on a Trawl are likewise locked from reassignment (hard-locked
  // at sea for the hour). Surfaced separately so the UI can label them.
  const [{ data: pendingVoyage }, { data: trawlRows }, { data: bunkRows }] = await Promise.all([
    admin.from('daily_voyages').select('crew_variant_ids').eq('user_id', user.id).eq('status', 'pending').maybeSingle(),
    admin.from('trawls').select('crew_id').eq('user_id', user.id),
    admin.from('crew_hall_bunks').select('crew_id, since, rate_per_hour, cap_hours, slot').eq('user_id', user.id),
  ])
  const lockedCrewIds: number[] = (pendingVoyage as any)?.crew_variant_ids ?? []
  const trawlingCrewIds: number[] = ((trawlRows ?? []) as any[]).map(r => r.crew_id as number)
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
    .filter(r => !stintDone(r.since as string, Date.now(), (r.cap_hours as number | null) ?? liveCap))
    .map(r => r.crew_id as number)

  const ownedCrewSkins = ((prof as any).owned_crew_skins as string[] | null) ?? []
  const equippedCrewSkins = ((prof as any).equipped_crew_skins as EquippedCrewSkins | null) ?? {}

  return {
    board: ((boardRows ?? []) as any[]).map(r => toCandidate(r, meta)),
    roster: ((rosterRows ?? []) as any[]).map(r => toMember(r, meta, equippedCrewSkins)).sort(rosterSort),
    capacity, navLevel, gems, isPremium: premium, rerollCost: REROLL_COST,
    shipCrewSlots, lockedCrewIds, trawlingCrewIds, bunkedCrewIds, bunkLockedCrewIds, bunkTerms,
    hallBunksOpen: hallBunksOpen((prof as any).is_admin),
    drillLevel: (prof as any).crew_drill_level ?? 1,
    storesLevel: (prof as any).crew_stores_level ?? 1,
    capHours: storesCapHours((prof as any).crew_stores_level ?? 1),
    hallTier: clampHallTier((prof as any).crew_hall_tier),
    doubloons: (prof as any).doubloons ?? 0,
    bloodGems: ((prof as any).blood_gems as number | null) ?? 0,
    hardcoreUnlocked: hardcoreUnlocked({
      isAdmin: (prof as any).is_admin,
      clearedNodes: ((prof as any).raid_node_progress?.cleared as string[] | undefined) ?? [],
      deepest: (prof as any).gauntlet_deepest ?? 0,
    }),
    ownedCrewSkins, equippedCrewSkins,
  }
}

/** Just the owned LIVE roster (no recruit board, no graveyard), for the
 *  expeditions crew screen. */
export async function getCrewRoster(): Promise<CrewMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = createAdminClient()
  const [{ meta }, { data: prof }] = await Promise.all([
    loadCards(admin),
    admin.from('profiles').select('equipped_crew_skins').eq('id', user.id).single(),
  ])
  const equippedCrewSkins = ((prof as any)?.equipped_crew_skins as EquippedCrewSkins | null) ?? {}
  const { data: rosterRows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, voyage_slot, raid_slot, xp, nickname')
    .eq('user_id', user.id)
    .is('died_at', null)
    .order('recruited_at', { ascending: false })
  return ((rosterRows ?? []) as any[]).map(r => toMember(r, meta, equippedCrewSkins)).sort(rosterSort)
}

// ── Reroll the board for 100 gems (always 3 new, boosted odds) ──────────────
// Optional `bloodTierId` = a Blood Gem "blood-charged reroll" (BLOOD_REROLL_TIERS):
// spend Blood Gems ALONGSIDE the 100 gems to swap in a tier's boosted Epic +
// Legendary weights. Blood Gems come only from the Hardcore Gauntlet.

export async function rerollBoard(bloodTierId?: string | null): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const tier = bloodRerollTier(bloodTierId)
  if (bloodTierId && !tier) return { error: 'Unknown reroll tier' }

  const { data: prof } = await admin.from('profiles').select('gems, crew_hall_tier, blood_gems, unlocked_badges, legendary_unlocks').eq('id', user.id).single()
  const gems = (prof as any)?.gems ?? 0
  const bloodGems = ((prof as any)?.blood_gems as number | null) ?? 0
  if (gems < REROLL_COST) return { error: 'Not enough gems' }
  if (tier && bloodGems < tier.bloodCost) return { error: 'Not enough Blood Gems' }

  // Guarded deduction: gte() on BOTH currencies stops concurrent rerolls from
  // overdrawing gems OR blood gems. Also stamp today's date so getCrewState()
  // won't regenerate a free board over this gem roll.
  let q = admin
    .from('profiles')
    .update({ gems: gems - REROLL_COST, ...(tier ? { blood_gems: bloodGems - tier.bloodCost } : {}), last_free_recruit_date: utcDate() })
    .eq('id', user.id)
    .gte('gems', REROLL_COST)
  if (tier) q = q.gte('blood_gems', tier.bloodCost)
  const { data: updated } = await q.select('gems').single()
  if (!updated) return { error: tier ? 'Not enough gems or Blood Gems' : 'Not enough gems' }

  // Blood-Charged badge — hook-granted the first time a reroll is boosted with
  // Blood Gems (a blood-charged reroll; not derivable from stored state).
  if (tier) {
    const badges = ((prof as any)?.unlocked_badges as string[] | null) ?? []
    if (!badges.includes('blood_charged')) {
      await admin.from('profiles').update({ unlocked_badges: [...badges, 'blood_charged'] }).eq('id', user.id)
    }
  }

  const { byGroup, meta } = await loadCards(admin)
  await admin.from('daily_recruits').delete().eq('user_id', user.id)
  const weights = tier ? tier.weights : GEM_WEIGHTS
  const legendaryUnlocks = ((prof as any)?.legendary_unlocks as string[] | null) ?? []
  const rows = generateBoardRows(user.id, 3, 'gem', weights, byGroup, meta, 0, legendaryUnlocks)
  if (rows.length) await admin.from('daily_recruits').insert(rows)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Blood Gem skin gamble ───────────────────────────────────────────────────
// Spend BLOOD_SKIN_GAMBLE_COST Blood Gems for ONE random skin the player doesn't
// own yet, from the NON-legendary pool (Rare + Epic crews). No dupes — dead once
// every non-legendary skin is owned. Granted to owned_crew_skins (not auto-
// equipped; the result is random).
export async function gambleBloodSkin(): Promise<{ skinId: string; state: NonNullable<Awaited<ReturnType<typeof getCrewState>>> } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: prof } = await admin.from('profiles').select('blood_gems, owned_crew_skins, unlocked_badges').eq('id', user.id).single()
  if (!prof) return { error: 'Profile not found' }
  const bloodGems = ((prof as any).blood_gems as number | null) ?? 0
  if (bloodGems < BLOOD_SKIN_GAMBLE_COST) return { error: 'Not enough Blood Gems' }

  const ownedArr = ((prof as any).owned_crew_skins as string[] | null) ?? []
  const owned = new Set(ownedArr)
  // Pool = non-legendary (group ≠ 4) skins not yet owned.
  const pool = CREW_SKINS.filter(s => groupForSlug(s.slug) !== 4 && !owned.has(s.id))
  if (pool.length === 0) return { error: 'You already own every non-legendary skin.' }

  const skin = pool[Math.floor(Math.random() * pool.length)]

  // Guarded deduction + grant in one write (gte stops an overdraw double-tap).
  const { data: updated } = await admin
    .from('profiles')
    .update({ blood_gems: bloodGems - BLOOD_SKIN_GAMBLE_COST, owned_crew_skins: [...ownedArr, skin.id] })
    .eq('id', user.id)
    .gte('blood_gems', BLOOD_SKIN_GAMBLE_COST)
    .select('blood_gems')
    .single()
  if (!updated) return { error: 'Not enough Blood Gems' }

  // Crimson Fortune badge — hook-granted the first time the blood gamble pays
  // out a skin (can't be derived from stored state; mirrors catfish_jackpot).
  const badges = ((prof as any).unlocked_badges as string[] | null) ?? []
  if (!badges.includes('crimson_fortune')) {
    await admin.from('profiles').update({ unlocked_badges: [...badges, 'crimson_fortune'] }).eq('id', user.id)
  }

  const state = await getCrewState()
  if (!state) return { error: 'Failed to load crew' }
  return { skinId: skin.id, state }
}

// ── Recruit a candidate (free, capacity-gated) ──────────────────────────────

export async function recruitCrew(recruitId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: prof } = await admin.from('profiles').select('expedition_xp').eq('id', user.id).single()
  const capacity = crewCapacity(getLevelFromXP((prof as any)?.expedition_xp ?? 0))
  // Capacity check counts LIVE roster only — fallen crew don't take
  // up a roster slot (graveyard is unlimited memorial space).
  const { count } = await admin
    .from('user_crew')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('died_at', null)
  if ((count ?? 0) >= capacity) return { error: 'Roster full' }

  const { data: rec } = await admin
    .from('daily_recruits')
    .select('id, card_id, rarity, power, dodge, fortune, effects, recruited, start_xp')
    .eq('id', recruitId)
    .eq('user_id', user.id)
    .single()
  if (!rec) return { error: 'Recruit not found' }
  if ((rec as any).recruited) return { error: 'Already recruited' }

  await admin.from('user_crew').insert({
    user_id: user.id,
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
  await admin.from('daily_recruits').update({ recruited: true }).eq('id', recruitId).eq('user_id', user.id)
  // Lifetime recruit counter (cumulative; user_crew only holds the live roster).
  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'lifetime_recruits', n: 1 })

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Upgrade the Crew Hall (doubloon-guarded tier bump) ───────────────────────

export async function upgradeCrewHall(): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: prof } = await admin
    .from('profiles')
    .select('doubloons, crew_hall_tier, expedition_xp')
    .eq('id', user.id)
    .single()
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
  const { data: updated } = await admin
    .from('profiles')
    .update({ doubloons: doubloons - next.cost, crew_hall_tier: next.tier })
    .eq('id', user.id)
    .eq('crew_hall_tier', current)
    .gte('doubloons', next.cost)
    .select('doubloons')
    .single()
  if (!updated) return { error: 'Not enough doubloons' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Dismiss a crew member (free up roster space) ─────────────────────────────

export async function dismissCrew(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  // Locked crew (at sea on a voyage / out on a trawl) can't be dismissed in any
  // way — same guard as reassignment, server-side backstop for the UI gating.
  const guard = await assertCanReassign(admin, user.id, crewId)
  if ('error' in guard) return { error: guard.error }

  // Dismiss only applies to live crew. Fallen crew live in the
  // graveyard permanently — no "dismiss" affordance there.
  await admin.from('user_crew').delete().eq('id', crewId).eq('user_id', user.id).is('died_at', null)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Assignment: voyage / raid / bench ────────────────────────────────────────
// Each crew can live on EXACTLY ONE track at a time — the DB CHECK constraint
// `user_crew_one_track_only` enforces this so concurrent server-action races
// can't double-book a crew. The track-aware actions below also handle:
//   - in-progress voyage lock (a crew currently at sea can't be reassigned)
//   - one-card-per-track (you can't deploy two copies of the same fish on
//     the same voyage/raid simultaneously)
//   - slot collision (assigning to a taken slot benches the previous holder)

type AssignTrack = 'voyage' | 'raid'

/** Common assignment guard: ownership, not-fallen, no in-progress voyage.
 *  Returns the crew row (id + card_id) or an error envelope to forward up. */
async function assertCanReassign(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  crewId: number,
): Promise<{ ok: true; crew: { id: number; card_id: number; voyage_slot: number | null } } | { error: string }> {
  const { data: crew } = await admin
    .from('user_crew')
    .select('id, card_id, voyage_slot')
    .eq('id', crewId).eq('user_id', userId).is('died_at', null)
    .single()
  if (!crew) return { error: 'Crew not found' }

  // In-progress voyage lock — if this crew is in a pending voyage's
  // crew_variant_ids, they're at sea right now and can't be reassigned
  // until the voyage reveals.
  if ((crew as any).voyage_slot != null) {
    const { data: pending } = await admin
      .from('daily_voyages')
      .select('crew_variant_ids')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .maybeSingle()
    const onActive = pending && Array.isArray((pending as any).crew_variant_ids) && (pending as any).crew_variant_ids.includes(crewId)
    if (onActive) return { error: 'This crew is at sea right now. Wait for their voyage to return.' }
  }

  // Trawl lock — a crew out on a trawl is hard-locked at sea for the hour.
  const { data: onTrawl } = await admin
    .from('trawls').select('id').eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (onTrawl) return { error: 'This crew is out on a trawl. Collect it first to free them up.' }

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
  const { data: onBunk } = await admin
    .from('crew_hall_bunks').select('since, cap_hours').eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (onBunk) {
    // The length AGREED when they went in, not the current Stores tier. Reading
    // the live tier would let a Stores purchase extend a hand's sentence after
    // the fact, or cut it short.
    let cap = (onBunk as any).cap_hours as number | null
    if (cap == null) {
      const { data: prof } = await admin.from('profiles').select('crew_stores_level').eq('id', userId).single()
      cap = storesCapHours((prof as any)?.crew_stores_level ?? 1)
    }
    return stintDone((onBunk as any).since, Date.now(), cap)
      ? { error: 'This crew finished their training. Collect it in the hall to free them up.' }
      : { error: 'This crew is training in the hall. Their stint has to finish first.' }
  }

  return { ok: true, crew: crew as any }
}

async function applyAssignment(
  userId: string,
  crewId: number,
  target: AssignTrack | null,
  slot: number | null,
): Promise<CrewActionResult> {
  const admin = createAdminClient()
  const guard = await assertCanReassign(admin, userId, crewId)
  if ('error' in guard) return { error: guard.error }
  const { crew } = guard

  if (target === null || slot === null) {
    // Bench — clear both columns. A bunk is kept deliberately: benched IS the
    // state a bunked crew lives in, so benching them changes nothing.
    await admin.from('user_crew').update({ voyage_slot: null, raid_slot: null })
      .eq('id', crewId).eq('user_id', userId)
  } else {

    const { data: prof } = await admin.from('profiles').select('ship_tier, ship_classes, has_sixth_berth').eq('id', userId).single()
    const tier = (prof as any)?.ship_tier ?? 0
    // Hull berths + the Ch4 Expanded Quarters augment.
    const crewSlots = (EXPEDITION_SHIP_STATS[tier]?.crewSlots ?? 1)
      + classSlotBonuses((prof as any)?.ship_classes as Record<string, string> | null).crewSlots
      + ((prof as any)?.has_sixth_berth === true ? 1 : 0)
    if (slot < 0 || slot >= crewSlots) return { error: 'Invalid slot' }

    const slotCol  = target === 'voyage' ? 'voyage_slot' : 'raid_slot'
    const otherCol = target === 'voyage' ? 'raid_slot'   : 'voyage_slot'

    // 1) Bench whoever currently holds this exact target slot.
    await admin.from('user_crew').update({ [slotCol]: null })
      .eq('user_id', userId).eq(slotCol, slot)
    // 2) Bench any other copy of the same card already on the same track
    //    (one of each fish per track to stop "stack three swordfish for ult").
    await admin.from('user_crew').update({ [slotCol]: null })
      .eq('user_id', userId).eq('card_id', crew.card_id).neq('id', crewId)
    // 3) Clear THIS crew's other-track slot first — CHECK constraint requires
    //    one of {voyage_slot, raid_slot} to be null before writing.
    await admin.from('user_crew').update({ [otherCol]: null })
      .eq('id', crewId).eq('user_id', userId)
    // 4) Finally place them on the target slot.
    await admin.from('user_crew').update({ [slotCol]: slot })
      .eq('id', crewId).eq('user_id', userId)
  }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Assign a crew to a voyage slot. Pass `null` to bench the crew. */
export async function assignToVoyage(crewId: number, slot: number | null): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  return applyAssignment(user.id, crewId, slot === null ? null : 'voyage', slot)
}

/** Assign a crew to a raid loadout slot. Pass `null` to bench the crew. */
export async function assignToRaid(crewId: number, slot: number | null): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  return applyAssignment(user.id, crewId, slot === null ? null : 'raid', slot)
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
export async function clearParty(track: AssignTrack): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()
  const slotCol = track === 'voyage' ? 'voyage_slot' : 'raid_slot'

  if (track === 'voyage') {
    const { data: pending } = await admin.from('daily_voyages')
      .select('id').eq('user_id', user.id).eq('status', 'pending').maybeSingle()
    if (pending) return { error: 'Your crew is at sea. Wait for the voyage to return.' }
  } else {
    // `gauntlet_run_open` alone covers active AND paused: pausing flips
    // gauntlet_run_paused and deliberately leaves the run open, so a paused
    // run is still an open one holding this exact party.
    const { data: prof } = await admin.from('profiles')
      .select('gauntlet_run_open').eq('id', user.id).single()
    if ((prof as { gauntlet_run_open?: boolean } | null)?.gauntlet_run_open) {
      return { error: 'A gauntlet run is still going. Finish or cash out first.' }
    }
  }

  // Everyone in the party leaves. There is no per-crew skip list because a
  // seated hand cannot also be trawling or bunked: starting a trawl benches
  // them outright, bunking refuses a seated crew, and a bunk is now held until
  // the XP is claimed — so the three states are mutually exclusive by
  // construction rather than by a filter that would drift out of step.
  await admin.from('user_crew').update({ [slotCol]: null })
    .eq('user_id', user.id).not(slotCol, 'is', null)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Bench a crew (clear both voyage_slot and raid_slot). */
export async function benchCrew(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  return applyAssignment(user.id, crewId, null, null)
}

/** One-shot crew rename. Sets `nickname` if it's still null; rejects every
 *  attempt after that so a name lands once and lives forever (same shape as
 *  the username rename flow). Trims whitespace, length-clamps to 1-30 chars,
 *  rejects empty strings. */
export async function renameCrew(crewId: number, nickname: string): Promise<CrewActionResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const clean = nickname.trim()
  if (clean.length < 1) return { error: 'Pick a name first.' }
  if (clean.length > 30) return { error: 'Name must be 30 characters or fewer.' }

  const admin = createAdminClient()
  const { data: crew } = await admin
    .from('user_crew')
    .select('id, nickname')
    .eq('id', crewId).eq('user_id', user.id).is('died_at', null)
    .single()
  if (!crew) return { error: 'Crew not found' }
  if ((crew as any).nickname != null) return { error: 'This crew has already been named.' }

  const { error } = await admin.from('user_crew')
    .update({ nickname: clean })
    .eq('id', crewId).eq('user_id', user.id)
  if (error) return { error: 'Could not save the name. Try again.' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Promote an already-assigned crew to captain (slot 0) on whichever track
 *  they're on. Swaps slot indices with the current slot-0 holder if one
 *  exists; if slot 0 is empty, the crew just moves to it. No-op if the
 *  crew is benched or already the captain. */
export async function promoteToCaptain(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()
  const guard = await assertCanReassign(admin, user.id, crewId)
  if ('error' in guard) return { error: guard.error }

  const { data: target } = await admin
    .from('user_crew')
    .select('id, voyage_slot, raid_slot')
    .eq('id', crewId).eq('user_id', user.id).is('died_at', null)
    .single()
  if (!target) return { error: 'Crew not found' }

  const t = target as any
  const track: 'voyage' | 'raid' | null =
    t.voyage_slot !== null ? 'voyage' :
    t.raid_slot   !== null ? 'raid'   :
                              null
  if (!track) return { error: 'Bench a crew first to deploy them on a track before promoting.' }

  const slotCol = track === 'voyage' ? 'voyage_slot' : 'raid_slot'
  const targetOldSlot: number = t[slotCol]
  if (targetOldSlot === 0) return { state: (await getCrewState())! }  // already captain

  // Find current captain on the same track (slot 0) — null if no one's there.
  const { data: captain } = await admin
    .from('user_crew')
    .select('id')
    .eq('user_id', user.id).is('died_at', null)
    .eq(slotCol, 0)
    .maybeSingle()

  if (captain) {
    // Swap. There's no unique-slot constraint, so a brief "both at slot 0"
    // intermediate state is technically allowed by the DB; doing it in two
    // sequential UPDATEs anyway for clarity.
    await admin.from('user_crew').update({ [slotCol]: targetOldSlot })
      .eq('id', (captain as any).id).eq('user_id', user.id)
  }
  await admin.from('user_crew').update({ [slotCol]: 0 })
    .eq('id', crewId).eq('user_id', user.id)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Crew skins: buy (gems) + equip (per legendary species) ──────────────────

/** Buy a legendary crew skin with gems. Gated: the skin must exist, the player
 *  must OWN that legendary (a live user_crew of its species), and not already
 *  own the skin. Guarded gem deduction prevents a double-spend race. */
export async function buyCrewSkin(skinId: string): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const skin = getCrewSkin(skinId)
  if (!skin) return { error: 'Unknown skin' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('gems, owned_crew_skins, equipped_crew_skins')
    .eq('id', user.id)
    .single()
  if (!prof) return { error: 'Profile not found' }
  const owned = ((prof as any).owned_crew_skins as string[] | null) ?? []
  if (owned.includes(skinId)) return { error: 'Already owned' }
  const gems = (prof as any).gems ?? 0
  if (gems < skin.gemCost) return { error: 'Not enough gems' }

  // Must own the crew this skin is for (a live crew of that species).
  const { data: card } = await admin.from('cards').select('id').ilike('slug', skin.slug).single()
  if (!card) return { error: 'Crew not found' }
  const { count } = await admin
    .from('user_crew')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id).eq('card_id', (card as any).id).is('died_at', null)
  if ((count ?? 0) === 0) return { error: 'Recruit this crew before buying its skins.' }

  // A first-time skin auto-equips — nearly everyone wants to wear what they
  // just bought. (They can still switch back to Original or another owned skin
  // from the Skins tab.)
  const equipped = { ...(((prof as any).equipped_crew_skins as EquippedCrewSkins | null) ?? {}) }
  equipped[skin.slug.toLowerCase()] = skinId

  // Guarded deduction — only lands if gems still cover the cost.
  const { data: updated } = await admin
    .from('profiles')
    .update({ gems: gems - skin.gemCost, owned_crew_skins: [...owned, skinId], equipped_crew_skins: equipped })
    .eq('id', user.id)
    .gte('gems', skin.gemCost)
    .select('gems')
    .single()
  if (!updated) return { error: 'Not enough gems' }

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

/** Equip a crew skin for its species (or pass null to revert to the base art).
 *  Must own the skin. Equipped state is a { slug: skinId } map on the profile. */
export async function equipCrewSkin(slug: string, skinId: string | null): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const key = slug.toLowerCase()

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('owned_crew_skins, equipped_crew_skins')
    .eq('id', user.id)
    .single()
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
  await admin.from('profiles').update({ equipped_crew_skins: equipped }).eq('id', user.id)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
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
export async function getCrewGraveyard(): Promise<FallenCrew[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = createAdminClient()
  const { meta } = await loadCards(admin)
  const { data: rows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, xp, nickname, died_at, died_on_voyage_id, died_hardcore_depth, voyage:daily_voyages!died_on_voyage_id(route)')
    .eq('user_id', user.id)
    .not('died_at', 'is', null)
    .order('died_at', { ascending: false })
  return ((rows ?? []) as any[]).map(r => {
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
export async function crewTheDeck(pullFromVoyages = false): Promise<
  { assigned: number; stillEmpty: number; onVoyages: number; state: CrewState } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('ship_tier, has_sixth_berth')
    .eq('id', user.id)
    .single()

  const slots = EXPEDITION_SHIP_STATS[(prof?.ship_tier as number | null) ?? 0].crewSlots
    + ((prof as any)?.has_sixth_berth === true ? 1 : 0)

  const roster = await getCrewRoster()
  const alive = roster.filter(c => c.raidSlot != null || c.voyageSlot != null || true)

  // Who is already aboard, and which slots are empty.
  const taken = new Set(alive.filter(c => c.raidSlot != null).map(c => c.raidSlot as number))
  const empty: number[] = []
  for (let i = 0; i < slots; i++) if (!taken.has(i)) empty.push(i)
  if (empty.length === 0) {
    const s = await getCrewState()
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
  const [{ data: pendingVoyage }, { data: trawlRows }] = await Promise.all([
    admin.from('daily_voyages').select('crew_variant_ids').eq('user_id', user.id).eq('status', 'pending').maybeSingle(),
    admin.from('trawls').select('crew_id').eq('user_id', user.id),
  ])
  const atSea = new Set<number>(
    Array.isArray((pendingVoyage as any)?.crew_variant_ids) ? (pendingVoyage as any).crew_variant_ids as number[] : [],
  )
  const onTrawl = new Set<number>(
    ((trawlRows ?? []) as { crew_id: number | null }[]).map(t => t.crew_id).filter((v): v is number => v != null),
  )

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
  await Promise.all(placements.map(p =>
    admin.from('user_crew').update({ voyage_slot: null, raid_slot: p.slot }).eq('id', p.crewId).eq('user_id', user.id),
  ))
  const assigned = placements.length

  const state = await getCrewState()
  if (!state) return { error: 'Failed to load crew' }
  return { assigned, stillEmpty: empty.length - assigned, onVoyages, state }
}

/** Mark the first-time Crew Hall guide as seen (tour-persistence convention). */
export async function markCrewGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_crew_guide: true }).eq('id', user.id)
}
