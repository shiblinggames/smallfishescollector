// Server-side crew data access for the new user_crew roster. Used by the
// expedition actions (voyages + raids) to load the deployed party, and shared
// so voyages and raids resolve crew identically.

import type { createAdminClient } from './supabase/admin'
import type { DeployedCrew } from './crewResolve'

type Admin = ReturnType<typeof createAdminClient>

/** The deployed party: crew assigned to a ship slot, ordered by slot, capped to
 *  the ship's crew-slot count. Shape feeds resolveDeployedCrew() directly. */
export async function loadDeployedParty(admin: Admin, userId: string, crewSlots: number): Promise<DeployedCrew[]> {
  const { data } = await admin
    .from('user_crew')
    .select('id, assigned_slot, rarity, power, dodge, fortune, effects')
    .eq('user_id', userId)
    .not('assigned_slot', 'is', null)
    .order('assigned_slot')
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[])
    .filter(r => r.assigned_slot < crewSlots)
    .map(r => ({
      id: r.id,
      slot: r.assigned_slot as number,
      rarity: r.rarity as number,
      power: r.power as number,
      dodge: r.dodge as number,
      fortune: r.fortune as number,
      effects: (r.effects ?? []) as string[],
    }))
}
