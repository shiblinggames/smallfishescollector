// ── THE SHIP OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// ShipData over one captain's save: the raid store's (the profile, the purse,
// the clears) plus the rods the captain carries. Every purchase's one-shot is
// the shared updateProfileIf, so a guard that does not hold writes nothing and
// the core hands the coin back, as on the web.

import type { ShipData } from '../shipData'
import { localRaidData } from './raidLocal'
import type { LocalSave } from './save'

/** ShipData over one captain's local save. */
export function localShipData(save: LocalSave): ShipData {
  return {
    ...localRaidData(save),
  }
}
