// Single source of truth for the duel aim-bar geometry, so the RAF, the lock
// judgment, and the drawn bands can never drift apart (they were copy-pasted
// from RaidCombat into the battle client). The combat resolver only consumes
// the RESULT, not the geometry — this is purely client-side skill input.

import type { ShotResult } from './resolver'

export const GRAZE_W = 0.038
export const HIT_W = 0.06
export const CRIT_W = 0.012
export const INDICATOR_SPEED = 0.006

// `critMult` widens the gold crit half-width (Sharpshot Special). 1 = base.
export function getShotResult(pos: number, zoneCenter: number, critMult = 1): ShotResult {
  const critW = CRIT_W * critMult
  if (pos >= zoneCenter - critW && pos <= zoneCenter + critW) return 'critical'
  if (pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W) return 'hit'
  if (pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W) return 'graze'
  return 'miss'
}
