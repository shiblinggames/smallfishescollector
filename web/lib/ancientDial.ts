// THE DIAL, REPAINTED FOR A GIANT.
//
// Extracted from FishingGame so the chart can use it too. It was a local
// function there, which meant the six ancients fought on the eldritch palette
// on one screen and an ordinary blue-and-gold dial on the other — the same
// fish, the same fight, dressed differently depending on which door you came
// through. Copying it across would have been two palettes drifting apart, which
// is the failure this repo keeps writing rules about.

import { VIGIL_DIAL } from '@/lib/ancientVigil'
import type { ZoneDef, ZoneType } from '@/app/(app)/fishing/depths'

/** The ancient palette as shipped. Rank 1, and any ancient caught outside the
 *  Vigil, fights on these. */
export const ANCIENT_ZONE_COLOR: Record<ZoneType, string> = {
  catch:   '#22d3ee', // cyan — the water that will land the giant
  perfect: '#fde68a', // gold stays the target (universal read)
  penalty: '#fb5f7a', // hot rose — danger, but hotter/pinker than the normal red
  miss:    '#4b3a63', // void-violet — dead water
}

/**
 * Repaint a dial for the rank being fought.
 *
 * Higher ranks take their own colours from VIGIL_DIAL, and the rules that
 * survive the repaint live there: perfect stays the brightest band on the dial,
 * and danger stays red. The needle inherits currentZone.color, so it adopts
 * whichever palette is live for free.
 */
export function applyAncientPalette(zones: ZoneDef[], rank?: number): ZoneDef[] {
  const pal = rank ? VIGIL_DIAL[rank] : undefined
  return zones.map(z => ({
    ...z,
    color: pal ? (pal[z.type] ?? ANCIENT_ZONE_COLOR[z.type] ?? z.color)
      : ANCIENT_ZONE_COLOR[z.type] ?? z.color,
  }))
}
