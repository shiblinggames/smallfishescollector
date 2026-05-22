'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getLevelFromXP } from '@/lib/expeditionLevel'
import { crewCapacity } from '@/lib/crewCapacity'
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
  rarity: number
  power: number
  dodge: number
  fortune: number
  effects: string[]
  assignedSlot: number | null
}

export type CrewState = {
  board: BoardCandidate[]
  roster: CrewMember[]
  capacity: number
  navLevel: number
  gems: number
  isPremium: boolean
  rerollCost: number
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
    name: m ? crewDisplayName(m.slug, m.name) : 'Unknown', filename: m?.filename ?? '',
    rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
    effects: (r.effects ?? []) as string[], recruited: r.recruited,
  }
}

function toMember(r: any, meta: Map<number, CardMeta>): CrewMember {
  const m = meta.get(r.card_id)
  return {
    id: r.id, cardId: r.card_id,
    name: m ? crewDisplayName(m.slug, m.name) : 'Unknown', filename: m?.filename ?? '',
    rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune,
    effects: (r.effects ?? []) as string[], assignedSlot: r.assigned_slot,
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
    .select('gems, is_premium, premium_expires_at, expedition_xp, last_free_recruit_date')
    .eq('id', user.id)
    .single()
  if (!prof) return null

  const premium = isPremiumActive(prof as any)
  const navLevel = getLevelFromXP((prof as any).expedition_xp ?? 0)
  const capacity = crewCapacity(navLevel)
  const gems = (prof as any).gems ?? 0

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
  const { data: rosterRows } = await admin
    .from('user_crew')
    .select('id, card_id, rarity, power, dodge, fortune, effects, assigned_slot')
    .eq('user_id', user.id)
    .order('recruited_at', { ascending: false })

  return {
    board: ((boardRows ?? []) as any[]).map(r => toCandidate(r, meta)),
    roster: ((rosterRows ?? []) as any[]).map(r => toMember(r, meta)),
    capacity, navLevel, gems, isPremium: premium, rerollCost: REROLL_COST,
  }
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
  const { count } = await admin
    .from('user_crew')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
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
    assigned_slot: null,
  })
  await admin.from('daily_recruits').update({ recruited: true }).eq('id', recruitId).eq('user_id', user.id)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}

// ── Dismiss a crew member (free up roster space) ─────────────────────────────

export async function dismissCrew(crewId: number): Promise<CrewActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in' }
  const admin = createAdminClient()

  await admin.from('user_crew').delete().eq('id', crewId).eq('user_id', user.id)

  const state = await getCrewState()
  return state ? { state } : { error: 'Failed to load crew' }
}
