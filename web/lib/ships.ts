// Ship metadata for the expedition fleet. Stats that matter in combat
// (durability, speed, crew slots, min damage) live separately in
// EXPEDITION_SHIP_STATS in lib/expeditions.ts. Fish hold is its OWN upgrade
// ladder (lib/fishHold.ts) and is no longer tied to ships at all.
export interface ShipDef {
  tier: number
  name: string
  cost: number
  description: string
  color: string
  imageUrl?: string
  /**
   * The hull as it appears ON THE WATER, past the sortie.
   *
   * A separate field rather than a name-to-filename rule. The ship screen
   * already derives its art that way and carries a guard comment about the 404
   * it causes; a display name is copy and copy gets rewritten, and the day
   * somebody renames the Man-o-War the boat should not vanish out from under
   * the captain sailing it.
   *
   * All five are drawn on one 1024 canvas at TRUE RELATIVE SCALE, so they are
   * rendered at a single width and the size difference between them is the
   * artist's, not a table here. See Warship in the sea map.
   */
  seaImageUrl?: string
  /**
   * HOW BIG SHE DRAWS, as a fraction of the sprite's square canvas.
   *
   * MEASURED off the art, not judged. All five are drawn on one canvas at true
   * relative scale, so this single number is the whole size ladder: a Sloop
   * covers just over half the square, a Man-o-War nearly all of it. The sea map
   * renders them at one width and gets the difference between hulls for free,
   * and the wake reads this to know how much water a hull is pushing.
   */
  seaBeam?: number
  /**
   * WHERE THE KEEL SITS, as a fraction of the sprite's height.
   *
   * The waterline: the row where hull stops and water starts. Also measured,
   * and per-hull because it genuinely varies — a Sloop's keel is at 68% of its
   * square and a Man-o-War's at 91%. Guessing one number for all five would lay
   * the wake amidships on the big hulls, which is where a boat is, not where it
   * leaves foam.
   *
   * Found by scanning up from the bottom for the first row with a solid run
   * across at least 15% of the canvas, so a trailing rope or a bowsprit is not
   * mistaken for the keel.
   */
  seaKeel?: number
  /**
   * THE CUTWATER — where this hull parts the water, and so where its wake
   * starts. Both numbers are fractions of the sprite's square canvas, x across
   * and y down, which makes them independent of the size it happens to be drawn
   * at and directly draggable on /sea/calibrate.
   *
   * This used to be one formula for all five: a fixed reach forward, multiplied
   * by the hull's scale, which put every ship's origin at exactly 80% of the
   * way to its own prow. That is a reasonable guess and it is wrong in a
   * different direction on every hull — these are drawn in three-quarter view
   * with bowsprits of very different lengths, and where the stem actually meets
   * water is not something the bounding box knows.
   *
   * Defaults below are the old formula's output, so nothing moved until it was
   * placed by eye.
   */
  seaBow?: { x: number; y: number }
}

// ── WHY THE LADDER STARTS AT TIER 2 ───────────────────────────────────────
// The Rowboat and the Dinghy were removed (2026-08). They were four hulls of
// runway before crew slots moved at all — Rowboat through Schooner took a
// captain from 1 seat to 2 — and the live numbers said nobody walked it: 55 of
// 81 captains had never bought a ship, and 3 more had stopped at the Dinghy.
// Two hulls that bought durability and nothing that changed how a fight is
// fought, sitting between a new captain and the first upgrade that does.
//
// THE TIER NUMBERS DID NOT SHIFT. `profiles.ship_tier` is stored per player and
// read as a threshold in a dozen places that have nothing to do with this file
// — the Man-o-War gate on the ultimate build, `ship_of_the_line`, ship skins,
// voyage routes, repair fees. Renumbering would mean subtracting two from every
// one of them, and a missed one fails silently in the direction of giving
// things away. So the Sloop keeps tier 2 and the ladder simply has no bottom
// two rungs. Index and tier are NO LONGER THE SAME NUMBER: look hulls up by
// `.tier` through the helpers below, never by `SHIPS[n]`.
export const MIN_SHIP_TIER = 2
export const MAX_SHIP_TIER = 6

export const SHIPS: ShipDef[] = [
  {
    // Free, because it is where everyone starts now. Its stats are unchanged
    // from when it was a 1,500 purchase, so a new captain begins sturdier than
    // the old Rowboat left them.
    tier: 2, name: 'Sloop', cost: 0,
    description: 'A single-masted workhorse of the seas. Yours from the off.',
    color: '#60a5fa', imageUrl: '/models/sloop_v2.png',
    seaImageUrl: '/ship-hero/sloop_v3.png',
    seaBow: { x: 0.711, y: 0.683 },
    seaBeam: 0.53, seaKeel: 0.683,
  },
  {
    tier: 3, name: 'Schooner', cost: 5000,
    description: 'Twin masts and a steady hull. Earning starts here.',
    color: '#4ade80', imageUrl: '/models/schooner_v2.png',
    seaImageUrl: '/ship-hero/schooner_v3.png',
    seaBow: { x: 0.747, y: 0.728 },
    seaBeam: 0.62, seaKeel: 0.728,
  },
  {
    tier: 4, name: 'Brigantine', cost: 22000,
    description: 'Fast and capable. A privateer\'s best friend.',
    color: '#f0c040', imageUrl: '/models/brigantine_v2.png',
    seaImageUrl: '/ship-hero/brigantine_v3.png',
    seaBow: { x: 0.787, y: 0.748 },
    seaBeam: 0.72, seaKeel: 0.748,
  },
  {
    tier: 5, name: 'Galleon', cost: 80000,
    description: 'A grand vessel. The sea respects your presence.',
    color: '#a78bfa', imageUrl: '/models/galleon_v2.png',
    seaImageUrl: '/ship-hero/galleon_v3.png',
    seaBow: { x: 0.846, y: 0.855 },
    seaBeam: 0.87, seaKeel: 0.855,
  },
  {
    tier: 6, name: 'Man-o-War', cost: 200000,
    description: 'The most feared ship on the water.',
    color: '#ff6b35', imageUrl: '/models/man-o-war_v2.png',
    seaImageUrl: '/ship-hero/man-o-war_v3.png',
    seaBow: { x: 0.886, y: 0.913 },
    seaBeam: 0.97, seaKeel: 0.913,
  },
]

/** The hull at a tier. Anything below the floor reads as the Sloop, which is
 *  what a legacy `ship_tier` of 0 or 1 now means. */
export function getShip(tier: number): ShipDef {
  const t = Math.min(Math.max(tier, MIN_SHIP_TIER), MAX_SHIP_TIER)
  return SHIPS.find(s => s.tier === t) ?? SHIPS[0]
}

/** The next rung up, or null at the top. */
export function nextShip(tier: number): ShipDef | null {
  const t = Math.max(tier, MIN_SHIP_TIER)
  return t >= MAX_SHIP_TIER ? null : (SHIPS.find(s => s.tier === t + 1) ?? null)
}

/** A hull's tier from its name. The ship screen only ever holds the display
 *  stats, so this is how it finds its way back to a number — and it must be the
 *  `.tier`, not the array position, which stopped agreeing with it when the
 *  bottom two rungs came off. */
export function shipTierByName(name: string): number {
  return SHIPS.find(s => s.name === name)?.tier ?? MIN_SHIP_TIER
}
