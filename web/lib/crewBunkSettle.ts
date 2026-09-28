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
import { bunkCount, bunkRatePerHour, hallBunksOpen, stintDone, storesCapHours } from './crewBunks'
import { clockNow } from './clock'
import { crewData } from './data/crewData'
import { finishedStints, stintPayouts, leviathanOffer, leviathanBunk, type BunkRow, type TraitUpgrade } from './crewRules'

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
// TraitUpgrade, NEUTRAL_OFFER, BunkRow and bunkTerms live in lib/crewRules
// (Phase B); re-exported so existing imports keep working.
export { NEUTRAL_OFFER, bunkTerms } from './crewRules'
export type { TraitUpgrade, BunkRow } from './crewRules'

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Training rate and bunk capacity for this player, read once. */
export async function bunkContext(admin: Admin, userId: string) {
  const prof = await crewData(admin).profile(userId, 'expedition_xp, crew_hall_tier, crew_drill_level, crew_stores_level, doubloons, is_admin')
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
  return (await crewData(admin).bunks(userId)).map(r => ({
    id: r.id, crew_id: r.crew_id, since: r.since,
    rate: r.rate_per_hour ?? null, cap: r.cap_hours ?? null, slot: r.slot ?? null,
  }))
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
  const nowMs = clockNow()

  // Each row on its own terms, not the hall's current ones (lib/crewRules).
  const done = finishedStints(rows, rate, capHours, nowMs)
  if (done.length === 0) return EMPTY

  // A hand who hit the level ceiling mid-stint still gets their bunk back; they
  // just have nothing left to learn, so the grant is skipped for them.
  const db = crewData(admin)
  const xpRows = await db.crewByIds(done.map(r => r.crew_id), 'id, xp')
  const xpById = new Map<number, number>((xpRows as any[]).map(r => [Number(r.id), r.xp ?? 0]))

  // The removal IS the claim, at the `since` that was read.
  const won = await Promise.all(done.map(async r => ((await db.claimBunk(r.id, r.since)) ? r : null)))

  const claimed = won.filter((r): r is BunkRow => r !== null)
  const pairs = stintPayouts(claimed, xpById, rate, capHours)
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
  const eligible = claimed.filter(leviathanBunk)
  if (eligible.length === 0) return []

  const db = crewData(admin)
  const crew = await db.crewByIds(eligible.map(r => r.crew_id), 'id, rarity, effects, pending_trait')

  const out: TraitUpgrade[] = []
  for (const c of (crew as any[])) {
    // The roll and the reveal are lib/crewRules leviathanOffer (null when an
    // unanswered offer is already open: it is not replaced).
    const offer = leviathanOffer(c)
    if (!offer) continue
    if (!(await db.parkTrait(userId, c.id, offer.parked))) continue
    out.push(offer.upgrade)
  }
  return out
}

/**
 * Collect ONE crew's finished stint. Does nothing while the stint is still
 * running — there is no early exit, so this can never yank a hand out and is
 * safe to call speculatively.
 */
export async function releaseBunk(admin: Admin, userId: string, crewId: number): Promise<BunkSettlement> {
  const data = await crewData(admin).bunkOf(userId, crewId)
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
  const nowMs = clockNow()
  const rows = await loadBunks(admin, userId)
  return rows
    .filter(r => !stintDone(r.since, nowMs, r.cap ?? liveCap))
    .map(r => r.crew_id)
}
