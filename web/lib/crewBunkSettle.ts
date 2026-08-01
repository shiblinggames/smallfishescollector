// Bunk settlement — server-side helpers shared by the bunk actions AND by
// crew/actions.ts (which evicts a bunked crew when they are assigned to a party
// or dismissed).
//
// PLAIN MODULE on purpose. These take an admin client, so they must not live in
// a 'use server' file: every async export there becomes a client-callable
// endpoint, and an admin client cannot cross that boundary anyway.

import type { createAdminClient } from './supabase/admin'
import { getLevelFromXP } from './expeditionLevel'
import { clampHallTier } from './crewHall'
import { grantXPPairs, type CrewXPGrant } from './crewXPGrant'
import { bunkCount, bunkRatePerHour, hallBunksOpen, canBunk, isLeviathanSlot, stintDone, stintXP, storesCapHours, traitScore, LEVIATHAN_REROLL_CHANCE } from './crewBunks'
import { rollTrait, encodeTraitId, type CrewRarity } from './crewGen'
import { netTraitStats, traitLabel } from './crewEffects'

type Admin = ReturnType<typeof createAdminClient>

/**
 * A bunk carries the TERMS it was struck on: the XP/hour and the stint length
 * agreed when the hand went in. Later Drills or Stores upgrades do not touch a
 * running bunk. `rate`/`cap` are null only on rows that predate the columns,
 * which fall back to the live values.
 */
/** What a Leviathan bunk did to a hand's trait, for the reveal. */
export type TraitRecut = {
  crewId: number
  fromLabel: string
  toLabel: string
  from: { power: number; dodge: number; fortune: number }
  to: { power: number; dodge: number; fortune: number }
}

export type BunkRow = {
  id: number
  crew_id: number
  since: string
  rate: number | null
  cap: number | null
  /** 0-5. Slot 5 is the Leviathan bunk. */
  slot: number | null
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Training rate and bunk capacity for this player, read once. */
export async function bunkContext(admin: Admin, userId: string) {
  const { data: prof } = await admin
    .from('profiles')
    .select('expedition_xp, crew_hall_tier, crew_drill_level, crew_stores_level, doubloons, is_admin')
    .eq('id', userId)
    .single()
  const navLevel = getLevelFromXP((prof as any)?.expedition_xp ?? 0)
  const drillLevel = (prof as any)?.crew_drill_level ?? 1
  const storesLevel = (prof as any)?.crew_stores_level ?? 1
  return {
    // Admin-only for now (HALL_BUNKS_LIVE). Every action checks this, not just
    // the panel — a hidden button is not a gate.
    open: hallBunksOpen((prof as any)?.is_admin),
    /** Drives the hall gate on the two in-panel ladders. */
    hallTier: clampHallTier((prof as any)?.crew_hall_tier),
    navLevel,
    drillLevel,
    storesLevel,
    capHours: storesCapHours(storesLevel),
    doubloons: (prof as any)?.doubloons ?? 0,
    slots: bunkCount(clampHallTier((prof as any)?.crew_hall_tier)),
    rate: bunkRatePerHour(drillLevel),
  }
}

/** Every bunk this player holds. */
export async function loadBunks(admin: Admin, userId: string): Promise<BunkRow[]> {
  const { data } = await admin
    .from('crew_hall_bunks').select('id, crew_id, since, rate_per_hour, cap_hours, slot').eq('user_id', userId)
  return ((data ?? []) as any[]).map(r => ({
    id: r.id, crew_id: r.crew_id, since: r.since,
    rate: r.rate_per_hour ?? null, cap: r.cap_hours ?? null, slot: r.slot ?? null,
  }))
}

/** The terms this bunk actually runs on: what was agreed, or the live values
 *  for a row that predates the columns. One helper so display, locking and
 *  payout can never disagree about a given bunk. */
export function bunkTerms(row: BunkRow, liveRate: number, liveCap: number) {
  return { rate: row.rate ?? liveRate, cap: row.cap ?? liveCap }
}

/**
 * Pay out every FINISHED stint and free those bunks.
 *
 * Only finished ones: a hand is locked in for the whole stint, so there is no
 * partial payout and no early exit. Unfinished bunks are left exactly as they
 * are.
 *
 * The row is DELETED, not reset. Leaving them in would restart the clock and
 * lock the hand in again immediately, so they could never come out.
 *
 * Concurrency: the delete IS the claim. It is conditional on the exact `since`
 * that was read, and XP is granted only for rows the delete actually removed,
 * so two simultaneous claims cannot both pay - the loser removes nothing.
 * `collectTrawl` does read-check-then-delete without inspecting the rowcount
 * and can double-grant; this deliberately does not copy it.
 */
export type BunkSettlement = {
  grants: CrewXPGrant[]
  /** Traits the Leviathan bunk re-cut this collect. Never a downgrade. */
  recuts: TraitRecut[]
  /** Crew whose stint ended and who got their bunk back. A hand at the level
   *  ceiling appears HERE but not in `grants` — they are freed and paid
   *  nothing, and the UI has to be able to say so rather than fall silent. */
  freed: number[]
}

export async function settleBunks(
  admin: Admin,
  userId: string,
  rows: BunkRow[],
  rate: number,
  capHours: number,
): Promise<BunkSettlement> {
  const EMPTY: BunkSettlement = { grants: [], freed: [], recuts: [] }
  if (rows.length === 0) return EMPTY
  const nowMs = Date.now()

  // Each row on its own terms, not the hall's current ones.
  const done = rows.filter(r => {
    const t = bunkTerms(r, rate, capHours)
    return stintDone(r.since, nowMs, t.cap)
  })
  if (done.length === 0) return EMPTY

  // A hand who hit the level ceiling mid-stint still gets their bunk back; they
  // just have nothing left to learn, so the grant is skipped for them.
  const { data: xpRows } = await admin
    .from('user_crew').select('id, xp').in('id', done.map(r => r.crew_id))
  const xpById = new Map<number, number>(((xpRows ?? []) as any[]).map(r => [Number(r.id), r.xp ?? 0]))

  const won = await Promise.all(done.map(async r => {
    const { data } = await admin
      .from('crew_hall_bunks')
      .delete()
      .eq('id', r.id)
      .eq('since', r.since)
      .select('id')
    return (data ?? []).length > 0 ? r : null
  }))

  const claimed = won.filter((r): r is BunkRow => r !== null)
  const pairs = claimed
    .filter(r => canBunk(xpById.get(r.crew_id) ?? 0))
    .map(r => {
      const t = bunkTerms(r, rate, capHours)
      return { id: r.crew_id, xp: stintXP(t.rate, t.cap) }
    })
  const grants = await grantXPPairs(admin, userId, pairs)
  const recuts = await recutLeviathanTraits(admin, userId, claimed)
  return { grants, freed: claimed.map(r => r.crew_id), recuts }
}

/**
 * The Leviathan bunk's ability: a finished stint in slot 5 has a chance to
 * re-cut the hand's trait.
 *
 * Rolls on the crew's OWN rarity, exactly as a recruit rolls, so the top hall
 * does not quietly hand Commons legendary-grade traits. Keeps the new trait
 * only if it scores strictly higher, so a hand can never come out of the
 * special slot worse than they went in.
 */
async function recutLeviathanTraits(
  admin: Admin,
  userId: string,
  claimed: BunkRow[],
): Promise<TraitRecut[]> {
  const eligible = claimed.filter(r => isLeviathanSlot(r.slot) && Math.random() < LEVIATHAN_REROLL_CHANCE)
  if (eligible.length === 0) return []

  const { data: crew } = await admin
    .from('user_crew').select('id, rarity, effects').in('id', eligible.map(r => r.crew_id))

  const out: TraitRecut[] = []
  for (const c of ((crew ?? []) as any[])) {
    const effects = (c.effects ?? []) as string[]
    // Only re-cut modern stat traits. A legacy id can carry behavior that
    // decodeTraitStats cannot read (auras, raid-conditional, percent buffs),
    // so the comparison would not see it and the overwrite would silently
    // delete it. Those hands keep what they have.
    if (effects.some(id => !id.startsWith('s:'))) continue
    const current = netTraitStats(effects)
    const rolled = rollTrait((c.rarity ?? 1) as CrewRarity)
    // Strictly better, or nothing happens. A tie is not an upgrade.
    if (traitScore(rolled) <= traitScore(current)) continue
    const id = encodeTraitId(rolled)
    if (!id) continue
    const { data: updated } = await admin
      .from('user_crew').update({ effects: [id] })
      .eq('id', c.id).eq('user_id', userId).select('id')
    if (!(updated ?? []).length) continue
    out.push({
      crewId: c.id,
      fromLabel: traitLabel(current) || 'no trait',
      toLabel: traitLabel(rolled) || 'no trait',
      from: current,
      to: rolled,
    })
  }
  return out
}

/**
 * Collect ONE crew's finished stint. Does nothing while the stint is still
 * running — there is no early exit, so this can never yank a hand out and is
 * safe to call speculatively.
 */
export async function releaseBunk(admin: Admin, userId: string, crewId: number): Promise<BunkSettlement> {
  const { data } = await admin
    .from('crew_hall_bunks').select('id, crew_id, since, rate_per_hour, cap_hours, slot')
    .eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (!data) return { grants: [], freed: [], recuts: [] }
  const ctx = await bunkContext(admin, userId)
  const row: BunkRow = {
    id: (data as any).id, crew_id: (data as any).crew_id, since: (data as any).since,
    rate: (data as any).rate_per_hour ?? null, cap: (data as any).cap_hours ?? null,
    slot: (data as any).slot ?? null,
  }
  return settleBunks(admin, userId, [row], ctx.rate, ctx.capHours)
}

/** Crew ids whose stint is STILL RUNNING. Hard-locked: no reassigning, no
 *  dismissing, no pulling them out early. */
export async function lockedBunkCrewIds(admin: Admin, userId: string, liveCap: number): Promise<number[]> {
  const nowMs = Date.now()
  const rows = await loadBunks(admin, userId)
  return rows
    .filter(r => !stintDone(r.since, nowMs, r.cap ?? liveCap))
    .map(r => r.crew_id)
}
