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
import { bunkCount, bunkRatePerHour, hallBunksOpen, canBunk, stintDone, stintXP, storesCapHours } from './crewBunks'

type Admin = ReturnType<typeof createAdminClient>

export type BunkRow = { id: number; crew_id: number; since: string }

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
    navLevel,
    drillLevel,
    storesLevel,
    capHours: storesCapHours(storesLevel),
    doubloons: (prof as any)?.doubloons ?? 0,
    slots: bunkCount(clampHallTier((prof as any)?.crew_hall_tier)),
    rate: bunkRatePerHour(navLevel, drillLevel),
  }
}

/** Every bunk this player holds. */
export async function loadBunks(admin: Admin, userId: string): Promise<BunkRow[]> {
  const { data } = await admin
    .from('crew_hall_bunks').select('id, crew_id, since').eq('user_id', userId)
  return ((data ?? []) as any[]).map(r => ({ id: r.id, crew_id: r.crew_id, since: r.since }))
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
export async function settleBunks(
  admin: Admin,
  userId: string,
  rows: BunkRow[],
  rate: number,
  capHours: number,
): Promise<CrewXPGrant[]> {
  if (rows.length === 0) return []
  const nowMs = Date.now()

  const done = rows.filter(r => stintDone(r.since, nowMs, capHours))
  if (done.length === 0) return []

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

  const pairs = won
    .filter((r): r is BunkRow => r !== null)
    .filter(r => canBunk(xpById.get(r.crew_id) ?? 0))
    .map(r => ({ id: r.crew_id, xp: stintXP(rate, capHours) }))
  return grantXPPairs(admin, userId, pairs)
}

/**
 * Collect ONE crew's finished stint. Does nothing while the stint is still
 * running — there is no early exit, so this can never yank a hand out and is
 * safe to call speculatively.
 */
export async function releaseBunk(admin: Admin, userId: string, crewId: number): Promise<CrewXPGrant[]> {
  const { data } = await admin
    .from('crew_hall_bunks').select('id, crew_id, since')
    .eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (!data) return []
  const ctx = await bunkContext(admin, userId)
  return settleBunks(admin, userId, [data as unknown as BunkRow], ctx.rate, ctx.capHours)
}

/** Crew ids whose stint is STILL RUNNING. Hard-locked: no reassigning, no
 *  dismissing, no pulling them out early. */
export async function lockedBunkCrewIds(admin: Admin, userId: string, capHours: number): Promise<number[]> {
  const nowMs = Date.now()
  const rows = await loadBunks(admin, userId)
  return rows.filter(r => !stintDone(r.since, nowMs, capHours)).map(r => r.crew_id)
}
