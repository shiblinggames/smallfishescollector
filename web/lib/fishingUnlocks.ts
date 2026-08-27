// WHAT A FISHING LEVEL ACTUALLY GIVES YOU.
//
// Extracted from FishingGame so the chart can say the same things. They were
// local functions there, which meant the level-up moment could only ever be
// told on the screen that redirects everybody away from it.
//
// Gear unlocks already lived in lib/gearUnlocks; these are the other two.

import { ZONE_MIN_LEVEL } from '@/app/(app)/fishing/zoneData'
import { HABITAT_LABEL } from '@/app/(app)/fishing/constants'

/** The two stats every level moves, for the level-up readout. */
export function fishingLevelPerks(level: number) {
  return {
    catchZone: Math.floor(level * 0.2),                       // degrees
    biteSpeed: Math.round(((level - 1) / 99) * 33 * 10) / 10,  // percent
  }
}

/** The zones that open between two levels. A crossing, not a state: this is
 *  what to ANNOUNCE, and the zones themselves gate on level independently. */
export function zonesUnlockedBetween(from: number, to: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  for (const [zone, min] of Object.entries(ZONE_MIN_LEVEL)) {
    if (min > from && min <= to) out.push({ key: zone, label: HABITAT_LABEL[zone] ?? zone })
  }
  return out
}
