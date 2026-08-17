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
import { bunkCount, bunkRatePerHour, hallBunksOpen, canBunk, isLeviathanSlot, stintDone, stintXP, storesCapHours } from './crewBunks'
import { rollTrait, encodeTraitId, type CrewRarity } from './crewGen'
import { netTraitStats, traitLabel } from './crewEffects'

type Admin = ReturnType<typeof createAdminClient>

/**
 * What the deep did to a hand's trait, per stat, APPLIED.
 *
 * It used to be an offer the player accepted stat by stat. That was one
 * refactor too many: per-stat granularity was added so a Fortune-hungry voyage
 * hand and a raider would not be judged by one global "better", and it worked
 * so completely that it deleted the decision. Once stats are taken
 * individually, every increase is strictly good for every crew — nothing in the
 * game rewards a low stat — so the improving stats were always pre-ticked, the
 * default was always optimal, and the buttons were ceremony.
 *
 * The result is `max(current, rolled)` per stat, which can only go up or stay
 * put. The reveal reports it rather than asking about it.
 */
export type TraitUpgrade = {
  crewId: number
  before: { power: number; dodge: number; fortune: number }
  after: { power: number; dodge: number; fortune: number }
  beforeLabel: string
  afterLabel: string
  /** Which stats actually moved, for the reveal to highlight. */
  gained: { power: boolean; dodge: boolean; fortune: boolean }
  /** True once the roll is an OFFER awaiting an answer rather than something
   *  already written. Always true for Leviathan re-cuts now; the field exists
   *  so the reveal can say "keep or replace" instead of "here is your trait". */
  pending?: boolean
}

/** A drawn trait of 0/0/0 encodes to null, which is indistinguishable from "no
 *  offer". Park this sentinel instead so an offer of nothing is still an offer
 *  the captain has to answer. Decoded back to a neutral line on resolve. */
export const NEUTRAL_OFFER = 's:0,0,0'

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
    // Public (HALL_BUNKS_LIVE). Still checked on every action, not just the
    // panel — a hidden button is not a gate, and this is the switch back.
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
  /** Traits the Leviathan bunk improved on this collect. Already applied. */
  upgrades: TraitUpgrade[]
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
  const EMPTY: BunkSettlement = { grants: [], freed: [], upgrades: [] }
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
  const upgrades = await recutLeviathanTraits(admin, userId, claimed)
  return { grants, freed: claimed.map(r => r.crew_id), upgrades }
}

/**
 * THE LEVIATHAN RE-CUT — roll a trait and OFFER it.
 *
 * It used to merge per-stat with Math.max and write the result. That could only
 * ever raise a number, which sounds generous and quietly made Divine a
 * COUNTDOWN rather than a chase: nothing was ever lost, so every roll was
 * permanent progress and a Legendary arrived at a perfect line in about
 * fourteen rolls. It also meant there was no decision to make, which is why the
 * file's own docs promised "offers, not applies" while the code applied.
 *
 * The draw is flat now (lib/crewTraits), so a roll can be worse than what the
 * hand carries and the claim is a real choice. Nothing is written to `effects`
 * here. The roll is parked on `user_crew.pending_trait` and stays there until
 * the captain answers, which is what stops a refresh from re-rolling it - the
 * same reason castLine holds a pending_cast token.
 *
 * A hand with an offer already open is skipped rather than overwritten: two
 * stints cannot stack, and the older offer is the one that was earned first.
 */
async function recutLeviathanTraits(
  admin: Admin,
  userId: string,
  claimed: BunkRow[],
): Promise<TraitUpgrade[]> {
  const eligible = claimed.filter(r => isLeviathanSlot(r.slot))
  if (eligible.length === 0) return []

  const { data: crew } = await admin
    .from('user_crew').select('id, rarity, effects, pending_trait').in('id', eligible.map(r => r.crew_id))

  const out: TraitUpgrade[] = []
  for (const c of ((crew ?? []) as any[])) {
    if (c.pending_trait) continue          // an unanswered offer is not replaced
    const before = netTraitStats((c.effects ?? []) as string[])
    const rolled = rollTrait((c.rarity ?? 1) as CrewRarity, true)
    const id = encodeTraitId(rolled)

    // A neutral draw ('Unremarkable') encodes to null. Park the literal string
    // so an offer of "nothing" is still an offer the captain can refuse, rather
    // than a null that reads as "no offer outstanding".
    const parked = id ?? NEUTRAL_OFFER
    const { data: written } = await admin
      .from('user_crew').update({ pending_trait: parked })
      .eq('id', c.id).eq('user_id', userId).is('pending_trait', null).select('id')
    if (!(written ?? []).length) continue

    out.push({
      crewId: c.id, before, after: rolled,
      gained: {
        power:   rolled.power   > before.power,
        dodge:   rolled.dodge   > before.dodge,
        fortune: rolled.fortune > before.fortune,
      },
      beforeLabel: traitLabel(before) || 'No trait',
      afterLabel:  traitLabel(rolled) || 'No trait',
      pending: true,
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
  if (!data) return { grants: [], freed: [], upgrades: [] }
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
