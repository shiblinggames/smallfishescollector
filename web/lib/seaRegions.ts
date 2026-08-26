// WHICH WAY YOU ARE, as opposed to how far out.
//
// Plain module, NOT 'use server' — that directive silently drops non-async
// exports and all of this is pure.
//
// ── THE MISSING AXIS ────────────────────────────────────────────────────────
//
// The bands answer ONE question: how far from the Mainland. That is latitude,
// and it is the only thing the chart has ever encoded. The consequence is that
// the east of the Deep looks exactly like the west of the Deep, so 870M px² of
// water has no landmarks of its own and nowhere is anywhere in particular. You
// cannot say "I am off in the kelp" because there is no kelp and no off.
//
// Regions are longitude. Angular sectors fanning out from the Mainland, so
// sailing OUT keeps you in one and sailing ACROSS takes you through them. Read
// together with the band, they give a position you can actually say out loud:
// "the Abyss, over in the Long Run".
//
// ── WHY FORM AND NOT COLOUR ─────────────────────────────────────────────────
//
// Colour on this chart is already spoken for twice. The band decides the water's
// palette (`seaAt` blends five of them), and the day/night cycle tints the whole
// frame on a 48 minute clock. A third system reaching for hue would be fighting
// both, and would look different at dawn than it does at midnight — which is the
// exact opposite of a landmark.
//
// So a region is a TEXTURE and a MOTION: what is floating in the water, how
// broken the surface is, which way and how fast it drifts. Those read the same
// at every hour, because they are shape rather than light.
//
// The one concession to the clock is INK. A region drawn in light marks is light
// ON water and has to dim when there is no light to catch, exactly as the pale
// wash already does. A region drawn in dark marks is a thing IN the water and
// stays put. `inkStrength` below is where that is decided, and it is the only
// place regions and the day/night cycle touch.

/** Where the coastal approach ends and the sectors begin. */
const SECTOR_FROM = 3800

export type RegionInk = 'light' | 'dark'

export type Region = {
  id: string
  name: string
  /** One line, for the banner. Says what the water is doing, not what it pays. */
  blurb: string
  ink: RegionInk
  /** Parameters for the tile this region paints. See makeRegionTile. */
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
    /** Fixed heading in radians, or undefined to let each mark tilt at random.
     *  A fixed one is what turns blobs into a current running one way. */
    tilt?: number
  }
  /** How fast the texture slides, in world px per second. Part of the region's
   *  identity: the Long Run moves, the Silts barely do. */
  drift: { x: number; y: number }
}

export const REGIONS: Region[] = [
  {
    id: 'approaches',
    name: 'The Approaches',
    blurb: 'Shallow, busy and close to home',
    ink: 'light',
    tile: { size: 520, count: 48, rgb: '206,232,238', rMin: 30, rMax: 74, alpha: 0.075, seed: 0x1a3f, squash: 0.5 },
    drift: { x: -2.5, y: 3.5 },
  },
  {
    id: 'scatters',
    name: 'The Scatters',
    blurb: 'Broken water over old reef',
    ink: 'light',
    // Many small round marks: chop, not pooling. The only region whose marks
    // are close to circular, which is what reads as a surface being knocked
    // about rather than something drifting on it.
    tile: { size: 480, count: 170, rgb: '214,238,248', rMin: 12, rMax: 32, alpha: 0.085, seed: 0x77c1, squash: 0.88 },
    drift: { x: 7.5, y: 5.5 },
  },
  {
    id: 'kelp_reach',
    name: 'The Kelp Reach',
    blurb: 'Weed on the surface, thick in places',
    ink: 'dark',
    // Few, large, heavily squashed and DARK: mats of weed lying on the water.
    // Dark ink is why this one still reads at night, which matters because it
    // is the most recognisable of the five.
    tile: { size: 620, count: 24, rgb: '18,44,34', rMin: 74, rMax: 158, alpha: 0.19, seed: 0x2b9d, squash: 0.3 },
    drift: { x: -1.5, y: 1.2 },
  },
  {
    id: 'long_run',
    name: 'The Long Run',
    blurb: 'Open water with the current behind it',
    ink: 'light',
    // Long streaks at a FIXED tilt, all lying the same way. That is the whole
    // trick: a current is not texture, it is texture that agrees with itself.
    tile: { size: 640, count: 30, rgb: '212,236,246', rMin: 96, rMax: 200, alpha: 0.075, seed: 0x51e7, squash: 0.11, tilt: -0.42 },
    drift: { x: -11, y: 7 },
  },
  {
    id: 'glassing',
    name: 'The Glassing',
    blurb: 'Flat water that holds the sky',
    ink: 'light',
    // Broad flat sheens rather than marks: wide, nearly level, and soft enough
    // to have no edge. Read against the Long Run next door, whose streaks are
    // narrow and steeply raked, this is the wind dropping.
    //
    // The first pass tried to make "less than its neighbours" the identity, at
    // twelve marks and 0.05 alpha. On a test plate beside the other four it was
    // indistinguishable from open water — a region you cannot see is not a
    // region. Fewer and bigger than the rest, but not fainter.
    tile: { size: 700, count: 16, rgb: '224,242,250', rMin: 170, rMax: 340, alpha: 0.10, seed: 0x3ca8, squash: 0.24, tilt: 0.07 },
    drift: { x: -0.8, y: 0.6 },
  },
  {
    id: 'silts',
    name: 'The Silts',
    blurb: 'Water thick with what the deep gives up',
    ink: 'dark',
    // Many soft dark clouds: a veil rather than objects. Nothing here has an
    // edge, which is what makes the water look like it is holding something
    // rather than carrying it.
    //
    // Also rebuilt after the test plate. Dark ink on dark water needs more
    // alpha than light ink on it to register at all, and at 0.05 this was the
    // faintest of the five by a distance.
    tile: { size: 560, count: 112, rgb: '26,34,40', rMin: 52, rMax: 116, alpha: 0.095, seed: 0x9f42, squash: 0.62 },
    drift: { x: 1.2, y: -1.6 },
  },
]

export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map(r => [r.id, r]))

/** The sectors, east to west. FIVE, and the count is not arbitrary. */
const SECTORS = ['scatters', 'kelp_reach', 'long_run', 'glassing', 'silts']

/**
 * WHICH REGION A POINT IS IN.
 *
 * ── WHY FIVE AND NOT FOUR ───────────────────────────────────────────────────
 *
 * With four sectors of 45 degrees the boundaries land at 45, 90 and 135 — and
 * 90 is DUE SOUTH, which is the single most travelled line on this chart:
 * everybody leaves the Mainland and heads straight out. That put the busiest
 * route in the game exactly on a seam, so a few pixels of drift either way
 * would flip the region, churn the cross-fade and flicker the banner.
 *
 * Five sectors of 36 put boundaries at 36, 72, 108 and 144, which leaves due
 * south sitting dead in the middle of The Long Run. Sail straight out and you
 * stay in one region the whole way, which is what you would expect of a course.
 *
 * Inside `SECTOR_FROM` the sectors converge on the Mainland and every heading
 * would cross all five in seconds, so the coastal water is one region instead.
 * At 3,800 out a sector is about 2,400px across; by the Ancient Deep it is
 * 14,200.
 *
 * North of the coast (y <= 0) is the harbour approach, which belongs to
 * expeditions and is not fishing water. It gets The Approaches too.
 */
export function regionAt(x: number, y: number): Region {
  if (y <= 0 || Math.hypot(x, y) < SECTOR_FROM) return REGION_BY_ID.approaches
  // atan2 on south-positive y: 0 is due east, PI is due west.
  const a = Math.atan2(y, x)
  const q = Math.min(SECTORS.length - 1, Math.max(0, Math.floor(a / (Math.PI / SECTORS.length))))
  return REGION_BY_ID[SECTORS[q]]
}

/**
 * HOW STRONGLY A REGION'S TEXTURE SHOWS, given how lit the water is.
 *
 * THE ONLY PLACE REGIONS AND THE DAY/NIGHT CYCLE MEET.
 *
 * Light ink is light ON the water and follows the same rule the pale wash
 * already follows — no light, no highlight. Dark ink is something IN the water
 * and does not go away when the sun does; it softens, because everything does,
 * but it keeps most of itself. Without the split, the kelp would vanish at
 * midnight and the chop would glow.
 */
export function inkStrength(r: Region, lum: number): number {
  return r.ink === 'light' ? 0.22 + lum * 0.78 : 0.6 + lum * 0.4
}

/** Where a region's name sits on the minimap: the middle of its sector. */
export function regionLabelAt(r: Region, outer: number): { x: number; y: number } {
  if (r.id === 'approaches') return { x: 0, y: SECTOR_FROM * 0.55 }
  const i = SECTORS.indexOf(r.id)
  const a = (i + 0.5) * (Math.PI / SECTORS.length)
  const rad = (SECTOR_FROM + outer) / 2
  return { x: Math.cos(a) * rad, y: Math.sin(a) * rad }
}
