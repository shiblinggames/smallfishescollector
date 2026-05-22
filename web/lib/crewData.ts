// Server-side crew data access for the new user_crew roster. Used by the
// expedition actions (voyages + raids) to load the deployed party, and shared
// so voyages and raids resolve crew identically.

import type { createAdminClient } from './supabase/admin'
import type { DeployedCrew } from './crewResolve'
import { crewDisplayName } from './crewGen'

type Admin = ReturnType<typeof createAdminClient>

/** A deployed crew row: resolver input fields + display name/portrait. `name`
 *  is the nickname (shown to players); `catalogName` is the raw species name
 *  (for trait-flavor lookups). */
export type DeployedCrewRow = DeployedCrew & { name: string; catalogName: string; filename: string }

/** The deployed party: crew assigned to a ship slot, ordered by slot, capped to
 *  the ship's crew-slot count. Carries name/portrait for the UI and feeds
 *  resolveDeployedCrew() directly (extra fields are ignored by the resolver). */
export async function loadDeployedParty(admin: Admin, userId: string, crewSlots: number): Promise<DeployedCrewRow[]> {
  const { data } = await admin
    .from('user_crew')
    .select('id, assigned_slot, rarity, power, dodge, fortune, effects, cards(name, filename, slug)')
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
      name: crewDisplayName(r.cards?.slug ?? '', r.cards?.name ?? 'Crew'),
      catalogName: (r.cards?.name ?? 'Crew') as string,
      filename: (r.cards?.filename ?? '') as string,
    }))
}
