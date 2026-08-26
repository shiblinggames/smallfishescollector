// HOTSPOTS — patches of water that are worth being in, and that move.
//
// The chart is 22,600 pixels deep and, once you had picked a band, every part
// of it was identical to every other part. You sailed to a depth and then
// stopped, because there was no reason to be anywhere in particular. Hotspots
// give the water inside a band a reason to be crossed: three of them at a time,
// somewhere new every ten minutes, each doing one obvious thing.
//
// ── DERIVED, NEVER STORED ───────────────────────────────────────────────────
//
// Same trick as the Salt Road's traders: a hash of (window index, slot) decides
// everything, so the client draws them and the server re-derives them from the
// same function and the two cannot disagree. No table, no cron, no rows to
// clean up, and a player who reloads sees the same three patches in the same
// places with the same time left on them.
//
// ── AND DELIBERATELY MODEST ─────────────────────────────────────────────────
//
// The server takes the player's WORD for where they are — the chart is
// client-side and `profiles.sea_x/sea_y` is documented as unvalidated — so a
// forged position can claim a hotspot it is not standing in. Every number here
// is sized on that basis: a hotspot is a nudge worth steering for, never a
// multiplier worth lying for. The biggest thing any of them does is roughly
// what a mid-tier rod already does, and none of them touch payouts.

import { PLACES } from '@/app/(app)/sea/chart'

/** How long a set of hotspots stands before they all move. */
export const HOTSPOT_WINDOW_MS = 10 * 60_000

/** How many are live at once, across the whole chart. */
export const HOTSPOT_COUNT = 3

export type HotspotKind = 'shoal' | 'trench' | 'flotsam'

/** 1 common, 2 uncommon, 3 rare. Strength climbs with it. */
export type HotspotTier = 1 | 2 | 3

/**
 * HOW OFTEN EACH TIER TURNS UP. Rolled per hotspot, so a window can hold three
 * ones or — rarely — a three alongside two ones.
 *
 * A tier 3 is a roughly one-in-eight patch, which across three live hotspots
 * means you see one about a third of the time you look. Rare enough that
 * finding one is worth breaking off what you were doing for, common enough
 * that a session usually contains one somewhere.
 */
export const TIER_WEIGHTS: Record<HotspotTier, number> = { 1: 0.6, 2: 0.28, 3: 0.12 }

export type TierDef = {
  /** The patch's own name at this strength. */
  name: string
  /** One line, literal, with the real number in it — this is a mechanic and
   *  the house rule is that mechanics are explained plainly. */
  effect: string
}

export type HotspotDef = {
  kind: HotspotKind
  /** One colour per KIND, so what a patch does is legible from across the
   *  chart before you are close enough to read anything. */
  color: string
  /** What it is, in one word, for the badge's eyebrow. */
  family: string
  tiers: Record<HotspotTier, TierDef>
}

export const HOTSPOT_DEFS: Record<HotspotKind, HotspotDef> = {
  shoal: {
    kind: 'shoal', color: '#5fd4a0', family: 'Faster bites',
    tiers: {
      1: { name: 'Scattered Shoal', effect: 'Fish bite about 12% faster here.' },
      2: { name: 'Running Shoal',   effect: 'Fish bite about 22% faster here.' },
      3: { name: 'Boiling Shoal',   effect: 'Fish bite about 35% faster here.' },
    },
  },
  trench: {
    kind: 'trench', color: '#a78bfa', family: 'Rarer fish',
    tiers: {
      1: { name: 'Cold Trench',  effect: 'Rare fish a little likelier — legendaries about 1.4x.' },
      2: { name: 'Deep Trench',  effect: 'Rare fish notably likelier — legendaries about 2x.' },
      3: { name: 'Black Trench', effect: 'Rare fish much likelier — legendaries nearly 3x.' },
    },
  },
  flotsam: {
    kind: 'flotsam', color: '#f0c040', family: 'More crates',
    tiers: {
      1: { name: 'Drifting Flotsam', effect: 'About 60% more sunken crates here.' },
      2: { name: 'Heavy Flotsam',    effect: 'Better than twice as many sunken crates here.' },
      3: { name: 'Wreck Field',      effect: 'Three times as many sunken crates here.' },
    },
  },
}

/**
 * HOW BRIGHT A PATCH BURNS, by tier.
 *
 * The colour says WHAT it is and the strength says HOW MUCH, so a Black Trench
 * and a Cold Trench are the same purple and one of them is plainly worth
 * crossing water for. Read at a distance, before any text is legible.
 *
 * `fill` and `rim` are alpha on the kind's colour; `spread` widens the bloom's
 * falloff so a tier 3 reads bigger than its radius as well as brighter.
 */
export const TIER_GLOW: Record<HotspotTier, { fill: number; rim: number; spread: number; pulse: string }> = {
  1: { fill: 0.16, rim: 0.16, spread: 0.40, pulse: 'sea-hotspot-1' },
  2: { fill: 0.26, rim: 0.30, spread: 0.55, pulse: 'sea-hotspot-2' },
  3: { fill: 0.40, rim: 0.52, spread: 0.70, pulse: 'sea-hotspot-3' },
}

export type Hotspot = {
  /** Stable for as long as this one stands. The client keys its art off it, and
   *  a changed key is how the map knows the patch has moved. */
  key: string
  kind: HotspotKind
  tier: HotspotTier
  x: number
  y: number
  /** World-pixel radius. Big enough to fish inside without station-keeping. */
  r: number
  /** Which band it landed in, so the map can say "in the Deep" without
   *  recomputing it. */
  zoneId: string
  /** Epoch ms when this set is replaced. */
  endsAt: number
}

// ── the hash ────────────────────────────────────────────────────────────────
// Same shape as seaTraders': small, good avalanche, so two adjacent windows do
// not produce three hotspots in nearly the same places.
function hash(a: number, b: number): number {
  let h = (a * 0x27d4eb2d) ^ (b * 0x165667b1) ^ 0x9e3779b9
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return (h ^ (h >>> 15)) >>> 0
}

function stream(seed: number): () => number {
  let s = seed || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}

const KINDS: HotspotKind[] = ['shoal', 'trench', 'flotsam']

/** The fishable bands, innermost first. */
function bands() {
  return PLACES.filter(p => p.kind === 'water' && p.inner != null && p.outer != null)
}

/**
 * THE THREE PATCHES THAT ARE LIVE RIGHT NOW.
 *
 * One per kind, always — three of the same sort would make a whole window
 * useless to anyone who did not want that one thing. Each lands in a different
 * band for the same reason: a window where all three sat in the Ancient Deep
 * would be no window at all for most of the roster.
 */
export function hotspotsAt(now: number = Date.now()): Hotspot[] {
  const win = Math.floor(now / HOTSPOT_WINDOW_MS)
  const endsAt = (win + 1) * HOTSPOT_WINDOW_MS
  const zones = bands()
  if (zones.length === 0) return []

  // Which bands this window uses, drawn without replacement so the three never
  // stack up in one stretch of water.
  const pickRnd = stream(hash(win, 0x5eed))
  const pool = zones.map((_, i) => i)
  const chosen: number[] = []
  for (let i = 0; i < HOTSPOT_COUNT && pool.length; i++) {
    chosen.push(pool.splice(Math.floor(pickRnd() * pool.length), 1)[0])
  }

  return chosen.map((zoneIdx, slot) => {
    const z = zones[zoneIdx]
    const rnd = stream(hash(win, slot + 1))
    const inner = z.inner as number
    const outer = z.outer as number

    // Anywhere in the band's southern arc, kept off both edges so the patch is
    // never half-outside the water it belongs to.
    const R = inner + (outer - inner) * (0.2 + rnd() * 0.6)
    const deg = 14 + rnd() * 152
    const th = (deg * Math.PI) / 180

    // Scaled to the band. A fixed radius that reads as generous in the Shallows
    // is a pinprick in the Ancient Deep, which is nearly three times as wide.
    const r = Math.round((outer - inner) * 0.16)

    // The tier, from the same stream so it is as fixed as the position.
    const roll = rnd()
    const tier: HotspotTier =
      roll < TIER_WEIGHTS[3] ? 3
        : roll < TIER_WEIGHTS[3] + TIER_WEIGHTS[2] ? 2
          : 1

    return {
      key: `${win}:${slot}`,
      kind: KINDS[slot % KINDS.length],
      tier,
      x: Math.round(Math.cos(th) * R),
      y: Math.round(Math.sin(th) * R),
      r,
      zoneId: z.id,
      endsAt,
    }
  })
}

/** Which hotspot, if any, covers this point. */
export function hotspotAt(x: number, y: number, now: number = Date.now()): Hotspot | null {
  for (const h of hotspotsAt(now)) {
    if (Math.hypot(x - h.x, y - h.y) <= h.r) return h
  }
  return null
}

/**
 * WHAT BEING IN ONE ACTUALLY DOES.
 *
 * Returned as multipliers the fishing maths already understands, so the effect
 * folds into the same arithmetic as a rod or a bait rather than becoming a
 * fourth special case in `castLine`.
 *
 * `waitMult` is on the same footing as bait; `rarityBonus` adds to the rod's
 * and is fed to the same tier-weighted pick; `crateChanceMult` multiplies the
 * zone's own crate rate.
 */
export type HotspotEffect = { waitMult: number; rarityBonus: number; crateChanceMult: number }

export const NO_HOTSPOT: HotspotEffect = { waitMult: 1, rarityBonus: 0, crateChanceMult: 1 }

/**
 * WHAT BEING IN ONE DOES, by kind and by strength.
 *
 * THE TIER 1s ARE THE POINT. They are deliberately small — a nudge worth
 * steering a few seconds for, never a reason to fish in only three places and
 * treat the other 22,600 pixels of chart as the wrong answer. The first pass
 * shipped what are now the tier 3 numbers as the ONLY numbers, and at that
 * strength a hotspot stops being a bonus and starts being the game.
 *
 * The tier 3s earn their size by being rare: roughly one patch in eight. That
 * is the trade — a big effect you have to go and find, rather than a big effect
 * that is always somewhere.
 *
 * They also stay bounded because the server takes the position on trust (see
 * the header). Even a tier 3 is worth less than the effort of forging a
 * position for, and none of them touch payouts.
 */
export function hotspotEffect(
  kind: HotspotKind | null | undefined,
  tier: HotspotTier = 1,
): HotspotEffect {
  switch (kind) {
    case 'shoal':
      return { waitMult: ({ 1: 0.88, 2: 0.78, 3: 0.65 } as const)[tier], rarityBonus: 0, crateChanceMult: 1 }
    // Fed through tierWeightedPick, which scales each tier by
    // (1 + bonus * (rarity - 1)) — so commons are never boosted, only diluted,
    // and the top of the table lifts hardest. That shape was always right; it
    // was only ever the magnitude that was wrong.
    case 'trench':
      return { waitMult: 1, rarityBonus: ({ 1: 0.15, 2: 0.45, 3: 1.1 } as const)[tier], crateChanceMult: 1 }
    case 'flotsam':
      return { waitMult: 1, rarityBonus: 0, crateChanceMult: ({ 1: 1.6, 2: 2.2, 3: 3 } as const)[tier] }
    default: return NO_HOTSPOT
  }
}
