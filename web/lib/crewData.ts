// Server-side crew data access for the new user_crew roster. Used by the
// expedition actions (voyages + raids) to load the deployed party. Voyages
// and raids now have INDEPENDENT assignment tracks — each crew row can be
// in voyage_slot OR raid_slot (mutually exclusive at the DB level), so the
// loader takes a `track` to know which slot column to read.

import type { createAdminClient } from './supabase/admin'
import type { DeployedCrew } from './crewResolve'
import { crewDisplayName } from './crewGen'
import { resolveCrewFilename, type EquippedCrewSkins } from './crewSkins'

type Admin = ReturnType<typeof createAdminClient>

export type AssignmentTrack = 'voyage' | 'raid'

/** A deployed crew row: resolver input fields + display name/portrait. `name`
 *  is the nickname (shown to players); `catalogName` is the raw species name
 *  (for trait-flavor lookups). */
export type DeployedCrewRow = DeployedCrew & { name: string; catalogName: string; filename: string }

/** The deployed party: crew assigned to the given track (voyage or raid),
 *  ordered by slot, capped to the ship's crew-slot count. Carries name/
 *  portrait for the UI and feeds resolveDeployedCrew() directly (extra
 *  fields are ignored by the resolver). */
export async function loadDeployedParty(
  admin: Admin,
  userId: string,
  crewSlots: number,
  track: AssignmentTrack,
): Promise<DeployedCrewRow[]> {
  const slotCol = track === 'voyage' ? 'voyage_slot' : 'raid_slot'
  // Live-roster only — fallen crew (died_at IS NOT NULL) are kept on
  // the row for the Crew Hall Graveyard tab but never deployed.
  // Crew currently "at sea" on a Trawl are reserved (hard-locked for the
  // hour) — filter them out so they can't also raid/voyage. See lib/trawls.
  const [{ data }, { data: atSeaRows }, { data: prof }] = await Promise.all([
    admin
      .from('user_crew')
      .select(`id, ${slotCol}, rarity, power, dodge, fortune, effects, xp, nickname, cards(name, filename, slug)`)
      .eq('user_id', userId)
      .is('died_at', null)
      .not(slotCol, 'is', null)
      .order(slotCol),
    admin.from('trawls').select('crew_id').eq('user_id', userId),
    admin.from('profiles').select('equipped_crew_skins').eq('id', userId).single(),
  ])
  const atSea = new Set(((atSeaRows ?? []) as { crew_id: number }[]).map(r => r.crew_id))
  // Equipped legendary skins swap the deployed crew's art (raid summon, nameplate, voyages).
  const equippedSkins = ((prof as { equipped_crew_skins?: EquippedCrewSkins } | null)?.equipped_crew_skins) ?? {}
  /* eslint-disable @typescript-eslint/no-explicit-any */
  return ((data ?? []) as any[])
    .filter(r => r[slotCol] < crewSlots && !atSea.has(r.id))
    .map(r => ({
      id: r.id,
      slot: r[slotCol] as number,
      rarity: r.rarity as number,
      power: r.power as number,
      dodge: r.dodge as number,
      fortune: r.fortune as number,
      effects: (r.effects ?? []) as string[],
      xp: (r.xp as number | null) ?? 0,
      slug: (r.cards?.slug as string | undefined)?.toLowerCase() ?? '',
      name: (r.nickname as string | null) ?? crewDisplayName(r.cards?.slug ?? '', r.cards?.name ?? 'Crew'),
      catalogName: (r.cards?.name ?? 'Crew') as string,
      filename: resolveCrewFilename((r.cards?.slug as string | undefined)?.toLowerCase() ?? '', (r.cards?.filename ?? '') as string, equippedSkins),
    }))
}
