// THE HOMESTEAD PORTAL — a warp ring on the water beside the Homestead.
//
// Sailed THROUGH, not tapped: the ring sits on the water and driving the boat
// across it is what opens it. Each tier extends its reach one fishing band
// deeper, Shallows through the Ancient Deep, so the ladder is the map itself.
//
// The early tiers are doubloons. The last two also take COMPONENTS, and a
// component is not a drop table — it is a cache chest you have opened. The sea
// holds 19 cache isles; the ladder needs 9; the count is derived from
// sea_discoveries at read time, so every chest ever opened already counts and
// there is no second grant path for the isles to drift out of step with.

import { ISLES } from './seaIsles'
import { PLACES } from '@/app/(app)/sea/chart'

/** Where the ring floats. Beside the Homestead (1900,-250 r460), outside its
 *  mooring prompt (ends at 880 from centre; this is 1,097 out), south of the
 *  reef, in Shallows water a new captain can actually reach. */
export const PORTAL = { x: 2900, y: -700, r: 230 }

export type PortalTier = {
  /** 1-based; profiles.portal_tier holds the highest owned. */
  tier: number
  band: string
  name: string
  /** ⟡ to buy this tier. 0 for the base tier everyone has. */
  cost: number
  /** Cache chests that must have been opened (cumulative spend, see actions). */
  components: number
  /** Where the warp lands, in world px. Due south in the band's middle water,
   *  clear of every isle and landmark on that meridian. */
  to: { x: number; y: number }
  /** The ring's accent at this tier — the destination band's own palette, so
   *  the portal wears where it can take you. */
  accent: string
}

/** Band middles from chart.ts: shallows 1400-3800, open 3800-6900,
 *  deep 6900-10900, abyss 10900-16000, ancient 16000-22600. */
export const PORTAL_TIERS: PortalTier[] = [
  { tier: 1, band: 'shallows',     name: 'The Shallows',     cost: 0,       components: 0, to: { x: 0, y: 2600 },  accent: '#7fc8de' },
  { tier: 2, band: 'open_waters',  name: 'Open Waters',      cost: 8_000,   components: 0, to: { x: 0, y: 5350 },  accent: '#5aa8cc' },
  { tier: 3, band: 'deep',         name: 'The Deep',         cost: 40_000,  components: 0, to: { x: 0, y: 8900 },  accent: '#4a7fb8' },
  { tier: 4, band: 'abyss',        name: 'The Abyss',        cost: 120_000, components: 3, to: { x: 0, y: 13450 }, accent: '#6a5acd' },
  { tier: 5, band: 'ancient_deep', name: 'The Ancient Deep', cost: 300_000, components: 6, to: { x: 0, y: 19300 }, accent: '#8b4a8b' },
]

/** Every isle whose chest counts as a component. */
export const CACHE_ISLE_IDS: ReadonlySet<string> = new Set(
  ISLES.filter(i => i.kind === 'cache').map(i => i.id))

/** Chests opened minus components already spent on tiers. */
export function componentsAvailable(discoveredIsleIds: string[], spent: number): number {
  const opened = discoveredIsleIds.filter(id => CACHE_ISLE_IDS.has(id)).length
  return Math.max(0, opened - spent)
}

/** Is this point inside the ring's mouth? */
export function inPortal(x: number, y: number): boolean {
  return Math.hypot(x - PORTAL.x, y - PORTAL.y) < PORTAL.r
}

// The compiler holds the band ids honest against the chart: a renamed band
// would otherwise leave a warp pointing at water that no longer answers to it.
const BAND_IDS = new Set(PLACES.filter(p => p.kind === 'water').map(p => p.id))
for (const t of PORTAL_TIERS) {
  if (!BAND_IDS.has(t.band)) throw new Error(`Portal tier points at unknown band '${t.band}'`)
}
