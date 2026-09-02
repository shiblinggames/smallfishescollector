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
import { clearOfSolids, BOAT_CLEAR } from './seaSolid'

/**
 * Where the well lies. OFF THE HOMESTEAD'S OWN BEACH, which is what it is for.
 *
 * It sat 1,487px out, far enough that it read as a thing in open water that
 * happened to be nearest your island rather than as YOURS. 1,224px now, on the
 * same bearing: close enough to see the two together, and still 114px clear of
 * the homestead's mooring prompt, which ends 880 from the island's centre. Any
 * nearer and docking and warping start competing for the same water.
 *
 * The old note said 1,900,-250 and 1,097 out. Both were stale.
 */
export const PORTAL = { x: 2650, y: -620, r: 230 }

export type PortalTier = {
  /** 1-based; profiles.portal_tier holds the highest owned. */
  tier: number
  band: string
  name: string
  /** ⟡ to buy this tier. 0 for the base tier everyone has. */
  cost: number
  /** Cache chests that must have been opened (cumulative spend, see actions). */
  components: number
  /** The FALLBACK landing: due south in the band's middle water, verified
   *  clear of everything. Real warps roll a spot — see warpPoint — and this
   *  is what a run of unlucky rolls falls back to. */
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

/**
 * THE EYE — the small centre that actually activates.
 *
 * The whole mouth used to: brushing the rim popped the sheet, which made the
 * ring a tripwire you had to steer around. Activation now wants the boat
 * CENTRED — sailed deliberately into the middle, the way you thread a mark —
 * and the rest of the ring is just water with paint on it. 80 against the
 * boat's 210 length means "in the middle" by eye is enough; nobody is being
 * asked to park on a pixel.
 */
export const PORTAL_CORE = 80

/**
 * AND YOU HAVE TO STAY THERE. Seconds held inside the eye before it takes you.
 *
 * Reaching the centre used to be the whole gesture: the frame you crossed into
 * the eye, the boat stopped dead and the flourish began. At speed that is a
 * tripwire one radius smaller than the old one — you sail across the middle on
 * your way somewhere and the sea grabs you.
 *
 * A hold fixes it without a prompt or a button, and it is the more honest
 * gesture anyway: you are not pressing something, you are holding station over
 * a hole in the water until it notices. Crossing the eye at speed now costs you
 * nothing, which means the ring can sit in open water without being an obstacle.
 *
 * Drifting out of the eye resets it to nothing. There is no partial credit for
 * circling.
 */
export const PORTAL_DWELL = 1

/** Inside the small activating centre? */
export function inPortalEye(x: number, y: number): boolean {
  return Math.hypot(x - PORTAL.x, y - PORTAL.y) < PORTAL_CORE
}

/** Inside the ring's full mouth? The hysteresis boundary: you must leave the
 *  WHOLE ring before the eye will take you again. */
export function inPortal(x: number, y: number): boolean {
  return Math.hypot(x - PORTAL.x, y - PORTAL.y) < PORTAL.r
}

/**
 * WHERE A WARP ACTUALLY LANDS: rolled, southern, and clear.
 *
 * A fixed point taught well but wore thin — the same wave every time. Fully
 * random within the ring occasionally dumped you half a sea from anything,
 * because a band is a RING and its northern arc can be a long sail from the
 * southern water the fixed point trained everyone to expect.
 *
 * So the roll is biased to the SOUTHERN ARC: an angle within ±55° of due
 * south, a radius padded inside the band so a landing never straddles a
 * border. Surprising enough that the sea stays a sea, never so surprising
 * that the portal reads as a prank.
 *
 * Rejection-sampled against the same solids list the traders use to not moor
 * inside islands. Even the Shallows is a third clear water and the deep bands
 * run 60-85%, so a dozen tries effectively never miss — and when they do, the
 * band's verified fixed point is the answer, not an unclear roll.
 */
export function warpPoint(tier: PortalTier): { x: number; y: number } {
  const band = PLACES.find(p => p.id === tier.band)
  if (!band || band.inner == null || band.outer == null) return tier.to
  const pad = 300
  for (let i = 0; i < 12; i++) {
    // ±55° around due south (screen-down is +y, so due south is +90° in
    // standard atan2 terms; sampled directly as an offset from it).
    const theta = (Math.PI / 2) + (Math.random() * 2 - 1) * (55 * Math.PI / 180)
    const r = band.inner + pad + Math.random() * (band.outer - band.inner - pad * 2)
    const x = Math.cos(theta) * r
    const y = Math.sin(theta) * r
    if (y < 400) continue // never the harbour approaches
    if (!clearOfSolids(x, y, BOAT_CLEAR + 120)) continue
    return { x: Math.round(x), y: Math.round(y) }
  }
  return tier.to
}

// The compiler holds the band ids honest against the chart: a renamed band
// would otherwise leave a warp pointing at water that no longer answers to it.
const BAND_IDS = new Set(PLACES.filter(p => p.kind === 'water').map(p => p.id))
for (const t of PORTAL_TIERS) {
  if (!BAND_IDS.has(t.band)) throw new Error(`Portal tier points at unknown band '${t.band}'`)
}
