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
import { accruedXP, bunkCount, bunkRatePerHour, hallBunksOpen, canBunk, storesCapHours } from './crewBunks'

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
 * Bank what these bunks have earned and reset their clocks.
 *
 * Concurrency: each row is reset with a compare-and-swap on the exact `since`
 * we read (`.eq('since', row.since)`), and XP is granted ONLY for rows the
 * update actually matched. Two simultaneous claims cannot both pay out — the
 * loser matches zero rows and grants nothing. `collectTrawl` does
 * read-check-then-delete without inspecting the rowcount and can double-grant;
 * this deliberately does not copy it.
 */
export async function settleBunks(
  admin: Admin,
  userId: string,
  rows: BunkRow[],
  rate: number,
  capHours: number,
): Promise<CrewXPGrant[]> {
  if (rows.length === 0) return []
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()

  // A maxed crew earns nothing, so leave their clock alone rather than quietly
  // resetting it — they may be swapped for someone who can still learn.
  const { data: xpRows } = await admin
    .from('user_crew').select('id, xp').in('id', rows.map(r => r.crew_id))
  const xpById = new Map<number, number>(((xpRows ?? []) as any[]).map(r => [Number(r.id), r.xp ?? 0]))

  const claimable = rows
    .map(r => ({ row: r, xp: canBunk(xpById.get(r.crew_id) ?? 0) ? accruedXP(r.since, nowMs, rate, capHours) : 0 }))
    .filter(c => c.xp > 0)
  if (claimable.length === 0) return []

  const won = await Promise.all(claimable.map(async c => {
    const { data } = await admin
      .from('crew_hall_bunks')
      .update({ since: nowIso })
      .eq('id', c.row.id)
      .eq('since', c.row.since)
      .select('id')
    return (data ?? []).length > 0 ? c : null
  }))

  const pairs = won.filter((c): c is NonNullable<typeof c> => c !== null)
    .map(c => ({ id: c.row.crew_id, xp: c.xp }))
  return grantXPPairs(admin, userId, pairs)
}

/**
 * Bank everything owed and free this crew's bunk. Called when they are
 * unbunked by hand, assigned to a party, or dismissed — so XP can never be
 * lost by leaving a bunk through any door.
 */
export async function releaseBunk(admin: Admin, userId: string, crewId: number): Promise<CrewXPGrant[]> {
  const { data } = await admin
    .from('crew_hall_bunks').select('id, crew_id, since')
    .eq('user_id', userId).eq('crew_id', crewId).maybeSingle()
  if (!data) return []
  const ctx = await bunkContext(admin, userId)
  const grants = await settleBunks(admin, userId, [data as unknown as BunkRow], ctx.rate, ctx.capHours)
  await admin.from('crew_hall_bunks').delete().eq('id', (data as any).id).eq('user_id', userId)
  return grants
}
