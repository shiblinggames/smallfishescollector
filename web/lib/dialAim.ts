import { getEffectiveRod } from './rods'

/** Widening the aim bands on the Finn dial from the player's FISHING gear.
 *
 *  The finale is the raid aim bar in polar coordinates, so the dial is a full
 *  360°. That is what makes this translation honest rather than invented: the
 *  fishing zone widths are already authored in DEGREES, so a bonus worth +8° on
 *  the fishing dial is worth exactly +8° here. No re-tuning, no fudge factor.
 *
 *  Mapping:
 *    catch zone   <- hook tier + rod.catchZoneBonus    -> the HIT band
 *
 *  The CRIT band is deliberately NOT gear-widened. Its fishing counterpart is
 *  the perfect zone, which no gear is allowed to touch (see RodDef), and the
 *  same reasoning holds here: gear should buy you more chances at the crit, not
 *  a bigger crit to aim at. Line penalty drives the SNAG zone, which raid
 *  combat has no analogue for, so it is ignored too.
 *
 *  Returned values are normalised HALF-widths, matching HIT_W / CRIT_W in
 *  RaidCombat (bands are drawn and judged as centre ± width).
 */
export interface DialAimBonus {
  hitBonus: number
}

export const NO_DIAL_AIM_BONUS: DialAimBonus = { hitBonus: 0 }

// Mirrors CATCH_BONUS_PER_TIER in app/(app)/fishing/depths.ts.
const CATCH_BONUS_PER_TIER = 3
// A zone authored as N degrees WIDE is a half-width of N/2 degrees, and a
// degree is 1/360 of the dial.
const degToHalfWidth = (deg: number) => deg / 2 / 360

// Ceiling so a maxed angler cannot turn the final fight into a formality. At
// the cap the hit band roughly doubles, which is a real, felt reward without
// removing the need to aim.
const MAX_HIT_BONUS = 0.055

export function dialAimBonus(
  rodTier: number,
  hookTier: number,
  completionistEffects: number[] | null | undefined,
): DialAimBonus {
  const rod = getEffectiveRod(rodTier ?? 0, completionistEffects)
  const catchDeg = Math.max(0, Math.min(8, hookTier ?? 0)) * CATCH_BONUS_PER_TIER + (rod.catchZoneBonus ?? 0)
  return { hitBonus: Math.min(MAX_HIT_BONUS, degToHalfWidth(catchDeg)) }
}
