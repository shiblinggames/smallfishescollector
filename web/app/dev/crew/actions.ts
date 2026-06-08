'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { crewCapacity } from '@/lib/crewCapacity'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import {
  groupForSlug, rollRarity, rollCrew, crewDisplayName,
  FREE_WEIGHTS, GEM_WEIGHTS, type CrewRarity,
} from '@/lib/crewGen'

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
}

export type CrewMember = {
  id: number
  cardId: number
  name: string
  filename: string
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
   *  Crew Hall UI greys these cards out and disables the assignment
   *  toggle — players can't pull a crew off an in-progress voyage. */
  lockedCrewIds: number[]
}

export type CrewActionResult = { state: CrewState } | { error: string }

/* eslint-disable @typescript-eslint/no-explicit-any */

type CardMeta = { name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }

function utcDate(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD in UTC
}

/** Catalog → portrait pool by group + a lookup for name/filename. */
async function loadCards(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from('cards').select('id, name, filename, slug, power, dodge, fortune')
  const byGroup: Record<CrewRarity, number[]> = { 1: [], 2: [], 3: [], 4: [] }
  const meta = new Map<number, CardMeta>()
  for (const c of ((data ?? []) as { id: number; name: string; filename: string; slug: string; power: number; dodge: number; fortune: number }[])) {
    meta.set(c.id, { name: c.name, filename: c.filename, slug: c.slug, power: c.power, dodge: c.dodge, fortune: c.fortune })
    const g = groupForSlug(c.slug)
    if (g) byGroup[g].push(c.id)
  }
  return { byGroup, meta }
}

/** Roll N candidate rows ready for insert into daily_recruits. */
function generateBoardRows(
  userId: string,
  size: number,
  source: 'free' | 'gem',
  weights: readonly [number, number, number, number],
  byGroup: Record<CrewRarity, number[]>,
  meta: Map<number, CardMeta>,
) {
  const rows: any[] = []
  for (let slot = 0; slot < size; slot++) {
    let rarity = rollRarity(weights)
    // Fall back to a populated group if the rolled one is empty (defensive).
    while (byGroup[rarity].length === 0 && rarity > 1) rarity = (rarity - 1) as CrewRarity
    const pool = byGroup[rarity]
    if (pool.length === 0) continue
    const cardId = pool[Math.floor(Math.random() * pool.length)]
    const m = meta.get(cardId)
    const profile = { power: m?.power ?? 1, dodge: m?.dodge ?? 1, fortune: m?.fortune ?? 1 }
    const c = rollCrew(cardId, rarity, profile)
    rows.push({
      user_id: userId, slot, source,
      card_id: c.cardId, rarity: c.rarity,
      power: c.power, dodge: c.dodge, fortune: c.fortune, effects: c.effects,
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
  }
}

function toMember(r: any, meta: Map<number, CardMeta>): CrewMember {
  const m = meta.get(r.card_id)
  return {
    id: r.id, cardId: r.card_id,
    name: m ? crewDisplayName(m.slug, m.name) : 'Unknown',
    filename: m?.filename ?? '',
    slug: (m?.slug ?? '').toLowerCase(),
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
    .select('gems, is_premium, premium_expires_at, expedition_xp, last_free_recruit_date, ship_tier')
    .eq('id', user.id)
    .single()
  if (!prof) return null

  const premium = isPremiumActive(prof as any)
  const navLevel = getLevelFromXP((prof as any).expedition_xp ?? 0)
  const capacity = crewCapacity(navLevel)
  const gems = (prof as any).gems ?? 0
  const shipTier = (prof as any).ship_tier ?? 0
  const shipCrewSlots = EXPEDITION_SHIP_STATS[shipTier]?.crewSlots ?? 1

  const { byGroup, meta } = await loadCards(admin)
  const today = utcDate()

  // Free board fills once per UTC day; gem rerolls (which set the date too)
  // won't be clobbered by this.
  if ((prof as any).last_free_recruit_date !== today) {
    await admin.from('daily_recruits').delete().eq('user_id', user.id)
    const rows = generateBoardRows(user.id, premium ? 3 : 2, 'free', FREE_WEIGHTS, byGroup, meta)
    if (rows.length) await admin.from('daily_recruits').insert(rows)
    await admin.from('profiles').update({ last_free_recruit_date: today }).eq('id', user.id)
  }

  const { data: boardRows } = await admin
    .from('daily_recruits')
    .select('id, slot, source, card_id, rarity, power, dodge, fortune, effects, recruited')
    .eq('user_id', user.id)
    .order('slot')
  // Live roster only — fallen crew (died_at IS NOT NULL) live in the
  // Crew Hall Graveyard tab, not the active roster.
  const { data: rosterRows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, voyage_slot, raid_slot, xp')
    .eq('user_id', user.id)
    .is('died_at', null)
    .order('recruited_at', { ascending: false })

  // Pending voyage lock: any crew currently in a 'pending' daily_voyages
  // crew_variant_ids list can't be reassigned until the voyage reveals.
  // Surface those ids so the UI can grey out + disable the toggle.
  const { data: pendingVoyage } = await admin
    .from('daily_voyages')
    .select('crew_variant_ids')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()
  const lockedCrewIds: number[] = (pendingVoyage as any)?.crew_variant_ids ?? []

  return {
    board: ((boardRows ?? []) as any[]).map(r => toCandidate(r, meta)),
    roster: ((rosterRows ?? []) as any[]).map(r => toMember(r, meta)),
    capacity, navLevel, gems, isPremium: premium, rerollCost: REROLL_COST,
    shipCrewSlots, lockedCrewIds,
  }
}

/** Just the owned LIVE roster (no recruit board, no graveyard), for the
 *  expeditions crew screen. */
export async function getCrewRoster(): Promise<CrewMember[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = createAdminClient()
  const { meta } = await loadCards(admin)
  const { data: rosterRows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, voyage_slot, raid_slot, xp')
    .eq('user_id', user.id)
    .is('died_at', null)
    .order('recruited_at', { ascending: false })
  return ((rosterRows ?? []) as any[]).map(r => toMember(r, meta))
}

// ── Reroll the board for 100 gems (always 3 new, boosted odds) ──────────────

export async function rerollBoard(): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  const { data: prof } = await admin.from('profiles').select('gems').eq('id', user.id).single()
  const gems = (prof as any)?.gems ?? 0
  if (gems < REROLL_COST) return { error: 'Not enough gems' }

  // Guarded deduction: gte() stops concurrent rerolls from overdrawing. Also
  // stamp today's date so getCrewState() won't regenerate a free board over
  // this gem roll.
  const { data: updated } = await admin
    .from('profiles')
    .update({ gems: gems - REROLL_COST, last_free_recruit_date: utcDate() })
    .eq('id', user.id)
    .gte('gems', REROLL_COST)
    .select('gems')
    .single()
  if (!updated) return { error: 'Not enough gems' }

  const { byGroup, meta } = await loadCards(admin)
  await admin.from('daily_recruits').delete().eq('user_id', user.id)
  const rows = generateBoardRows(user.id, 3, 'gem', GEM_WEIGHTS, byGroup, meta)
  if (rows.length) await admin.from('daily_recruits').insert(rows)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
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
    .select('id, card_id, rarity, power, dodge, fortune, effects, recruited')
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
  })
  await admin.from('daily_recruits').update({ recruited: true }).eq('id', recruitId).eq('user_id', user.id)
  // Lifetime recruit counter (cumulative; user_crew only holds the live roster).
  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'lifetime_recruits', n: 1 })

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Dismiss a crew member (free up roster space) ─────────────────────────────

export async function dismissCrew(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

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
    // Bench — clear both columns.
    await admin.from('user_crew').update({ voyage_slot: null, raid_slot: null })
      .eq('id', crewId).eq('user_id', userId)
  } else {
    const { data: prof } = await admin.from('profiles').select('ship_tier').eq('id', userId).single()
    const tier = (prof as any)?.ship_tier ?? 0
    const crewSlots = EXPEDITION_SHIP_STATS[tier]?.crewSlots ?? 1
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

/** Bench a crew (clear both voyage_slot and raid_slot). */
export async function benchCrew(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  return applyAssignment(user.id, crewId, null, null)
}

// ── Graveyard: fallen crew with the voyage they died on ──────────────────────

export type FallenCrew = CrewMember & {
  diedAt: string                              // ISO timestamp
  diedOnRoute: string | null                  // voyage route slug (coastal/open/deep), null if voyage row missing
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
    .select('id, card_id, rarity, power, dodge, fortune, effects, xp, died_at, died_on_voyage_id, voyage:daily_voyages!died_on_voyage_id(route)')
    .eq('user_id', user.id)
    .not('died_at', 'is', null)
    .order('died_at', { ascending: false })
  return ((rows ?? []) as any[]).map(r => {
    const m = meta.get(r.card_id)
    // voyage is a single object via the explicit FK join, but PostgREST
    // typings sometimes default it to an array — handle both shapes.
    const voyage = Array.isArray(r.voyage) ? r.voyage[0] : r.voyage
    return {
      id: r.id, cardId: r.card_id,
      name: m ? crewDisplayName(m.slug, m.name) : 'Unknown',
      filename: m?.filename ?? '',
      slug: (m?.slug ?? '').toLowerCase(),
      rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
      effects: (r.effects ?? []) as string[],
      voyageSlot: null, raidSlot: null,
      xp: (r.xp as number | null) ?? 0,
      diedAt: r.died_at as string,
      diedOnRoute: (voyage?.route as string | undefined) ?? null,
    }
  })
}
