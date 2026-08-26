// WHAT THE WATER ITSELF IS DOING, band by band.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and all of this is pure.
//
// ── WHY THIS IS KEYED TO THE BANDS ──────────────────────────────────────────
//
// An earlier pass at this invented ANGULAR SECTORS — a longitude axis, on the
// reasoning that the east of the Deep looks exactly like the west of it. True,
// but it was solving the wrong problem: nothing in this game depends on which
// way you are. Levels, fish tables and sell prices all key off the BAND. The
// sectors were a second set of names to learn that earned nothing, laid over a
// system that already meant something and carried no texture at all.
//
// So the texture goes where the meaning already is. Five surfaces, one per
// band, and no new names anywhere: the water simply looks like the thing the
// banner is already calling it.
//
// ── THE PROBLEM THIS ACTUALLY FIXES ─────────────────────────────────────────
//
// Measured across the five band palettes, the average per-channel distance from
// one band to the next runs 9.6, 16.7, 21.2 and 7.6. That last number is the
// Abyss to the Ancient Deep, and it is the weakest step on the chart: the two
// deepest waters are both nearly black and nearly the same nearly black. The
// place that should feel most unlike anywhere else felt least. Colour cannot
// fix it, because both of them are supposed to be dark.
//
// Texture can. The Abyss is thick with silt and the Ancient Deep is glass
// still, and those read as different water at any brightness.
//
// ── WHY FORM AND NOT COLOUR ─────────────────────────────────────────────────
//
// Hue is spoken for twice already. The band picks the water's palette (`seaAt`
// blends all five) and the 48 minute day/night cycle tints the whole frame. A
// third system reaching for hue would fight both and would look like a
// different place at dawn than at midnight, which is the opposite of a
// landmark. A surface is a TEXTURE and a DRIFT RATE instead, and those read the
// same at every hour.
//
// The one concession to the clock is INK — see `inkStrength`, which is the only
// place these two systems touch.

export type SurfaceInk = 'light' | 'dark'

export type Surface = {
  /** The band this is the water of. */
  band: string
  ink: SurfaceInk
  tile: {
    size: number
    count: number
    rgb: string
    rMin: number
    rMax: number
    alpha: number
    seed: number
    /** How flat the marks are. 1 is round, 0.1 is a streak. */
    squash: number
    /** A FIXED heading for every mark, or undefined for random per mark. Fixed
     *  is what turns a scatter of blobs into a current running one way. */
    tilt?: number
  }
  /** World px per second. Part of the identity: the Deep moves, the Ancient
   *  Deep barely does. Shallow water is busy, old water is not. */
  drift: { x: number; y: number }
}

/**
 * ORDERED SHALLOW TO DEEP, and the progression is the point: busy and green,
 * then broken, then running, then thick, then dead still. Sailing out should
 * feel like the water is settling and then stopping.
 */
export const SURFACES: Surface[] = [
  {
    // THE SHALLOWS — weed. Kelp grows where the light reaches the bottom, so
    // this is the one band it belongs in. Dark ink, so it still reads at night,
    // which matters because it is the most recognisable of the five.
    band: 'shallows',
    ink: 'dark',
    tile: { size: 620, count: 24, rgb: '18,44,34', rMin: 74, rMax: 158, alpha: 0.19, seed: 0x2b9d, squash: 0.3 },
    drift: { x: -1.5, y: 1.2 },
  },
  {
    // OPEN WATERS — chop. Many small near-round marks: a surface being knocked
    // about rather than something drifting on it. Nothing shelters this water.
    band: 'open_waters',
    ink: 'light',
    tile: { size: 480, count: 170, rgb: '214,238,248', rMin: 12, rMax: 32, alpha: 0.085, seed: 0x77c1, squash: 0.88 },
    drift: { x: 7.5, y: 5.5 },
  },
  {
    // THE DEEP — current. Long streaks at a FIXED tilt, all lying the same way.
    // That is the whole trick: a current is not texture, it is texture that
    // agrees with itself. The fastest drift of the five.
    band: 'deep',
    ink: 'light',
    tile: { size: 640, count: 30, rgb: '212,236,246', rMin: 96, rMax: 200, alpha: 0.075, seed: 0x51e7, squash: 0.11, tilt: -0.42 },
    drift: { x: -11, y: 7 },
  },
  {
    // THE ABYSS — silt. Soft dark clouds with no edge anywhere, so the water
    // looks like it is HOLDING something rather than carrying it.
    //
    // Dark ink on dark water needs more alpha than light ink does to register
    // at all; at 0.05 on a test plate this was invisible.
    band: 'abyss',
    ink: 'dark',
    tile: { size: 560, count: 112, rgb: '26,34,40', rMin: 52, rMax: 116, alpha: 0.095, seed: 0x9f42, squash: 0.62 },
    drift: { x: 1.2, y: -1.6 },
  },
  {
    // THE ANCIENT DEEP — glass. Broad, nearly level sheens, soft enough to have
    // no edge, drifting almost not at all. Read against the Deep's raked
    // streaks two bands in, this is the current stopping.
    //
    // This is the band the whole file exists for: it is the same near-black as
    // the Abyss and could not be told apart from it by colour. Water this still
    // is unnerving in a way darkness on its own is not.
    band: 'ancient_deep',
    ink: 'light',
    tile: { size: 700, count: 16, rgb: '224,242,250', rMin: 170, rMax: 340, alpha: 0.10, seed: 0x3ca8, squash: 0.24, tilt: 0.07 },
    drift: { x: -0.8, y: 0.6 },
  },
]

export const SURFACE_BY_BAND: Record<string, Surface> = Object.fromEntries(SURFACES.map(s => [s.band, s]))

/**
 * Band radii, copied deliberately rather than imported.
 *
 * This runs every frame and `PLACES` would mean a filter and a find per call.
 * Kept in the same shallow-to-deep order as SURFACES so the two cannot drift
 * apart, and asserted against the chart in `scripts/check-copy.mts`.
 */
const OUTERS = [3800, 6900, 10900, 16000, 22600]

/**
 * WHICH SURFACE A POINT SITS ON.
 *
 * By radius, because the bands are concentric rings around the Mainland: one
 * distance answers all five. Coastal water inside the Shallows and the harbour
 * approaches north of the coast both get the Shallows' surface, which is
 * correct rather than a fallback — that IS the water they are continuous with.
 */
export function surfaceAt(x: number, y: number): Surface {
  const r = Math.hypot(x, y)
  for (let i = 0; i < OUTERS.length; i++) {
    if (r < OUTERS[i]) return SURFACES[i]
  }
  return SURFACES[SURFACES.length - 1]
}

/**
 * HOW STRONGLY A SURFACE SHOWS, given how lit the water is.
 *
 * THE ONLY PLACE THIS AND THE DAY/NIGHT CYCLE MEET.
 *
 * Light ink is light ON the water and follows the rule the pale wash already
 * follows: no light, no highlight. Dark ink is something IN the water and does
 * not leave when the sun does; it softens, because everything does, but it
 * keeps most of itself. Without the split the kelp would vanish at midnight and
 * the chop would glow.
 */
export function inkStrength(s: Surface, lum: number): number {
  return s.ink === 'light' ? 0.22 + lum * 0.78 : 0.6 + lum * 0.4
}
