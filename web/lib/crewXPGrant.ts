// Server-side helpers for granting crew XP at end-of-encounter (raid kill,
// voyage completion, practice kill). Wraps the two atomic Postgres RPCs
// (grant_crew_xp_to_assigned / grant_crew_xp_to_ids) and resolves crew
// display names so the end-of-mission UI can render a per-crew XP line +
// level-up flash without another round-trip.
//
// Both helpers are safe to call with grantXP=0 (no-op, returns []) so action
// callsites can fire them unconditionally.

import type { createAdminClient } from './supabase/admin'
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

async function resolveNames(admin: Admin, ids: number[]): Promise<Map<number, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await admin
    .from('user_crew')
    .select('id, nickname, cards(name, slug)')
    .in('id', ids)
  const out = new Map<number, string>()
  for (const row of ((data ?? []) as any[])) {
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
  if (xp <= 0) return []
  const { data } = await admin.rpc('grant_crew_xp_to_assigned', { uid: userId, grant_xp: xp })
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []
  const names = await resolveNames(admin, rows.map(r => Number(r.id)))
  return shape(rows, names)
}

/** Grant `xp` to a specific set of crew ids. Used by voyage resolution to
 *  award the full voyage XP payout to survivors (crew_variant_ids minus
 *  crew_lost). */
export async function grantXPToCrewIds(admin: Admin, userId: string, crewIds: number[], xp: number): Promise<CrewXPGrant[]> {
  if (xp <= 0 || crewIds.length === 0) return []
  const { data } = await admin.rpc('grant_crew_xp_to_ids', { uid: userId, crew_ids: crewIds, grant_xp: xp })
  const rows = (data ?? []) as any[]
  if (rows.length === 0) return []
  const names = await resolveNames(admin, rows.map(r => Number(r.id)))
  return shape(rows, names)
}
