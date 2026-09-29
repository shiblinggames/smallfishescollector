// Server-side helpers for granting crew XP at end-of-encounter (raid kill,
// voyage completion, practice kill). Wraps the two atomic Postgres RPCs
// (grant_crew_xp_to_assigned / grant_crew_xp_to_ids) and resolves crew
// display names so the end-of-mission UI can render a per-crew XP line +
// level-up flash without another round-trip.
//
// Both helpers are safe to call with grantXP=0 (no-op, returns []) so action
// callsites can fire them unconditionally.

import type { createAdminClient } from './supabase/admin'
import { crewData, type CrewData } from './data/crewData'
import { crewLevelFromXP } from './crewLevel'
import { crewDisplayName } from './crewGen'

type Admin = ReturnType<typeof createAdminClient>

export interface CrewXPGrant {
  id: number
  name: string
  oldXP: number
  newXP: number
  oldLevel: number
  newLevel: number
}

/* eslint-disable @typescript-eslint/no-explicit-any */

async function resolveNames(db: CrewData, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const out = new Map<number, string>()
  for (const row of await db.crewByIds(ids, 'id, nickname, cards(name, slug)')) {
    const nickname = (row.nickname as string | null) ?? null
    out.set(row.id, nickname ?? crewDisplayName(row.cards?.slug ?? '', row.cards?.name ?? 'Crew'))
  }
  return out
}

function shape(rows: any[], names: Map<number, string>): CrewXPGrant[] {
  return rows.map(r => {
    const id = Number(r.id)
    const oldXP = r.old_xp ?? 0
    const newXP = r.new_xp ?? 0
    return {
      id,
      name: names.get(id) ?? 'Crew',
      oldXP, newXP,
      oldLevel: crewLevelFromXP(oldXP),
      newLevel: crewLevelFromXP(newXP),
    }
  })
}

/** Grant `xp` to every alive crew member currently in a ship slot. Used by
 *  raids + practice: every deployed crew gets the same kill XP the player
 *  earned. Returns one row per crew member with old/new level for the UI. */
export async function grantXPToAssignedCrew(admin: Admin, userId: string, xp: number): Promise<CrewXPGrant[]> {
  return grantXPToSeatedVia(crewData(admin), userId, xp)
}
/** grantXPToAssignedCrew against any crew store (the web's, or the offline save). */
export async function grantXPToSeatedVia(db: CrewData, userId: string, xp: number): Promise<CrewXPGrant[]> {
  if (xp <= 0) return []
  const rows = await db.grantXpToSeated(userId, xp) as any[]
  if (rows.length === 0) return []
  const names = await resolveNames(db, rows.map(r => Number(r.id)))
  return shape(rows, names)
}

/** Grant `xp` to a specific set of crew ids. Used by voyage resolution to
 *  award the full voyage XP payout to survivors (crew_variant_ids minus
 *  crew_lost). */
export async function grantXPToCrewIds(admin: Admin, userId: string, crewIds: number[], xp: number): Promise<CrewXPGrant[]> {
  return grantXPToIdsVia(crewData(admin), userId, crewIds, xp)
}
/** grantXPToCrewIds against any crew store. */
export async function grantXPToIdsVia(db: CrewData, userId: string, crewIds: number[], xp: number): Promise<CrewXPGrant[]> {
  if (xp <= 0 || crewIds.length === 0) return []
  const rows = await db.grantXpToIds(userId, crewIds, xp) as any[]
  if (rows.length === 0) return []
  const names = await resolveNames(db, rows.map(r => Number(r.id)))
  return shape(rows, names)
}

/** Grant a DIFFERENT amount to each crew. The two helpers above both apply one
 *  flat amount to a whole set, which is right for a raid (the party shares the
 *  kill) but wrong for the hall's bunks: every bunk has its own `since`, so a
 *  single claim owes each crew a different number. */
export async function grantXPPairs(
  db: CrewData,
  userId: string,
  pairs: { id: number; xp: number }[],
): Promise<CrewXPGrant[]> {
  const live = pairs.filter(p => p.xp > 0)
  if (live.length === 0) return []
  const rows = await db.grantXpPairs(userId, live) as any[]
  if (rows.length === 0) return []
  const names = await resolveNames(db, rows.map(r => Number(r.id)))
  return shape(rows, names)
}
