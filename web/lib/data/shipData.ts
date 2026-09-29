// ── THE SHIP'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// The ship screen (the Forge, the Abyssal Accelerator, the ultimate, the Sixth
// Berth, the Expanded Armory, hull skins) and the Shipyard's refits. Nearly all
// of it is the raid store's: the profile, the purse, the clears. The Shipyard
// adds one read, the rods this captain carries.
//
// The one-shot guards are the contract: every purchase spends first and then
// writes its flag with updateProfileIf, so a double tap pays once.

import type { Db } from './common'
import { raidData, type RaidData } from './raidData'

export interface ShipData extends RaidData {
  /** Every rod tier this captain owns. */
  rodTiers(uid: string): Promise<number[]>
}

/** ShipData over Supabase. */
export function shipData(admin: Db): ShipData {
  return {
    ...raidData(admin),
    async rodTiers(uid) {
      const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid)
      return ((data ?? []) as { rod_tier: number }[]).map(r => r.rod_tier)
    },
  }
}
