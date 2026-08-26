// Boat cosmetics. Each boat ships as a 2-up PNG sheet (see slice-boat.mjs)
// that's split into a rest/wait variant and a slightly tilted cast variant.
// Position is configured per fishing frame because the character bobs/shifts
// across rest, wait, and cast — the boat needs to track that motion.

export type BoatFrame = 'rest' | 'wait' | 'cast'
export type BoatPos = { top: number; left: number; width: number; rotate: number }

export interface BoatDef {
  id: string
  name: string
  /** Swatch color shown in the picker (not the rendered overlay) */
  color: string
  /** Doubloon cost in the gear-slot shop */
  cost: number
  /** /public path to the rest+wait variant */
  restImageUrl: string
  /** /public path to the cast variant */
  castImageUrl: string
  /** Per-frame placement of the overlay on the character container */
  positions: Record<BoatFrame, BoatPos>
  /** Only obtainable from crates — hidden from the shop picker unless owned. */
  crateOnly?: boolean
  /** Applies the `.boat-glow` CSS animation to the overlay image (Ethereal:
   *  the bright divine shimmer). */
  glow?: boolean
  /** A distinct, subtler glow variant (much more restrained than `glow`).
   *  'ash'  = Charcoal's dark smoulder (also darkens the sprite).
   *  'gold' = Golden's warm aura — same subtle amount as ash, no darken. */
  glowType?: 'ash' | 'gold'
  /** Gem price in the shop (premium boats). Takes precedence over `cost`. */
  gemPrice?: number
  /** Earned (not bought) once the player reaches this Achievement Points total.
   *  Mirrors the achievement-gated character skins. */
  achievementPoints?: number
  /**
   * HOW SHE HANDLES, on the ocean hub. See TRIM below.
   *
   * A number from -1 (as nimble as they come, and slow with it) to +1 (all top
   * speed, turns like a barge). Absent means dead in the middle.
   *
   * This is the ONLY stat a boat carries and it is deliberately a trade-off
   * rather than a rating. A boat is still a thing you pick because you like
   * looking at it.
   */
  trim?: number
}

/**
 * TRIM — the boat stops being only a costume.
 *
 * A hull is the one cosmetic on the character that has an obvious business
 * being a stat: it is the thing doing the sailing. But a cosmetic set with a
 * BEST member is not a cosmetic set any more — everybody wears the winner and
 * the other sixteen become dead art. So this is a SIDEGRADE, not a ladder.
 *
 * One number, `trim`, splits a fixed budget two ways:
 *
 *   +1  all top speed, sluggish off the mark and slow to answer the helm
 *    0  balanced
 *   -1  quick to get going and quick to turn, lower top speed
 *
 * Both ends are genuinely useful and for different water. Top speed is the long
 * haul out to the Ancient Deep. Agility is everything you do once you are
 * there: pulling alongside a trader who is drifting, threading a wreck field,
 * getting back under way after a cast.
 *
 * ── WHAT KEEPS THIS OUT OF PAY-TO-WIN ────────────────────────────────────
 *
 * MONEY BUYS YOU NOTHING AT EITHER END.
 *
 * The fastest hull in the game and the nimblest are both 5,000-doubloon boats
 * (Desert and Pistachio) — pocket change, and available from the first hour.
 * The free hulls sit one step in at +/-0.08. The 500,000 and 1,000,000 boats,
 * and both achievement boats, top out at +/-0.10, which is LESS than the cheap
 * pair. They are prestige art with a good hull, not the correct answer.
 *
 * THE THREE GEM BOATS — Fire, Ice and Jet Black, via `gemPrice` — sit at
 * exactly 0 and must stay there. A gem-bought hull that sails better than a
 * free one would be bought precisely because it sails better, which is the one
 * thing this game does not do. There is no script enforcing it; it is a
 * decision made per boat, so make it deliberately when adding one.
 */
export const TRIM_RANGE = 0.12

/** Multiplier on TOP SPEED. Ranges 0.88 .. 1.12 across the fleet. */
export function boatSpeed(id: string | null | undefined): number {
  return 1 + (getBoat(id)?.trim ?? 0)
}

/** Multiplier on ACCELERATION and turn response. The mirror of boatSpeed, so a
 *  boat's two numbers always sum to 2 and no hull is strictly better. */
export function boatAgility(id: string | null | undefined): number {
  return 1 - (getBoat(id)?.trim ?? 0)
}

/** What to call it on a card. Plain, per the copy rule — the flavour is in the
 *  art, not in the readout. */
export function trimLabel(trim: number | undefined): string {
  const t = trim ?? 0
  if (t >= 0.08) return 'Long-haul'
  if (t >= 0.03) return 'Fast'
  if (t <= -0.08) return 'Nimble'
  if (t <= -0.03) return 'Quick'
  return 'Balanced'
}

/** Default "Driftwood" — no overlay; uses the base sprite's boat. */
export const DEFAULT_BOAT_COLOR = '#a07858'

// All boats share the same per-frame anchor relative to the character div.
// Sprites are normalized by web/normalize-fishing-sprites.mjs so every
// character color has the boat hull seat at the same Y on each frame.
const SHARED_POSITIONS: Record<BoatFrame, BoatPos> = {
  rest: { top: 77, left: 31, width: 55, rotate: 0 },
  wait: { top: 73, left: 38, width: 55, rotate: 0 },
  cast: { top: 77, left: 37, width: 55, rotate: 0 },
}

// Fire's flames make its trimmed sheet taller than a plain hull (191 vs ~146),
// so at the shared width it renders taller and sinks below the character. Nudge
// it up per frame by the extra rendered height so the hull re-seats. (Computed;
// fine-tune on /fishing-test if the flames still sit slightly off.)
const FIRE_POSITIONS: Record<BoatFrame, BoatPos> = {
  rest: { top: 73.5, left: 31, width: 55, rotate: 0 },
  wait: { top: 69.5, left: 38, width: 55, rotate: 0 },
  cast: { top: 72.8, left: 37, width: 55, rotate: 0 },
}

export const BOATS: BoatDef[] = [
  {
    id: 'oak',
    trim: 0.04,
    name: 'Oak',
    color: '#bda05a',
    cost: 1000,
    restImageUrl: '/boat_oak_rest.png',
    castImageUrl: '/boat_oak_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'cherry',
    trim: -0.06,
    name: 'Cherry',
    color: '#c84a3a',
    cost: 2000,
    restImageUrl: '/boat_cherry_rest.png',
    castImageUrl: '/boat_cherry_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'desert',
    trim: 0.12,
    name: 'Desert',
    color: '#c8b378',
    cost: 5000,
    restImageUrl: '/boat_desert_rest.png',
    castImageUrl: '/boat_desert_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'mahogany',
    trim: 0.02,
    name: 'Mahogany',
    color: '#b5582f',
    cost: 5000,
    restImageUrl: '/boat_mahogany_rest.png',
    castImageUrl: '/boat_mahogany_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'pistachio',
    trim: -0.12,
    name: 'Pistachio',
    color: '#7d9170',
    cost: 5000,
    restImageUrl: '/boat_pistachio_rest.png',
    castImageUrl: '/boat_pistachio_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'taupe',
    trim: 0.0,
    name: 'Taupe',
    color: '#9a8a7e',
    cost: 5000,
    restImageUrl: '/boat_taupe_rest.png',
    castImageUrl: '/boat_taupe_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'charcoal',
    trim: -0.08,
    name: 'Charcoal',
    color: '#3a3a40',
    cost: 0,
    restImageUrl: '/boat_charcoal_rest.png',
    castImageUrl: '/boat_charcoal_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
    glowType: 'ash',
  },
  {
    id: 'golden',
    trim: 0.06,
    name: 'Golden',
    color: '#f0c040',
    cost: 50000,
    restImageUrl: '/boat_golden_rest.png',
    castImageUrl: '/boat_golden_cast.png',
    positions: SHARED_POSITIONS,
    glowType: 'gold',
  },
  {
    id: 'offwhite',
    trim: 0.08,
    name: 'Offwhite',
    color: '#e8e2d0',
    cost: 0,
    restImageUrl: '/boat_offwhite_rest.png',
    castImageUrl: '/boat_offwhite_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
  {
    id: 'periwinkle',
    trim: -0.04,
    name: 'Periwinkle',
    color: '#8095c8',
    cost: 5000,
    restImageUrl: '/boat_periwinkle_rest.png',
    castImageUrl: '/boat_periwinkle_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'ethereal',
    trim: -0.1,
    name: 'Ethereal',
    color: '#dde8ff',
    cost: 500000,
    restImageUrl: '/boat_ethereal_rest.png',
    castImageUrl: '/boat_ethereal_cast.png',
    positions: SHARED_POSITIONS,
    glow: true,
  },
  {
    id: 'fire',
    trim: 0.0,
    name: 'Fire',
    color: '#ff7a1a',
    cost: 0,
    gemPrice: 750,
    restImageUrl: '/boat_fire_rest.png',
    castImageUrl: '/boat_fire_cast.png',
    positions: FIRE_POSITIONS,
  },
  {
    id: 'ice',
    trim: 0.0,
    name: 'Ice',
    color: '#a4dcf2',
    cost: 0,
    gemPrice: 750,
    restImageUrl: '/boat_ice_rest.png',
    castImageUrl: '/boat_ice_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'jetblack',
    trim: 0.0,
    name: 'Jet Black',
    color: '#1b1b20',
    cost: 0,
    gemPrice: 500,
    restImageUrl: '/boat_jetblack_rest.png',
    castImageUrl: '/boat_jetblack_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'chromium',
    trim: 0.1,
    name: 'Chromium',
    color: '#c4c8cc',
    cost: 1_000_000,
    restImageUrl: '/boat_chromium_rest.png',
    castImageUrl: '/boat_chromium_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'celestial',
    trim: -0.1,
    name: 'Celestial',
    color: '#b0a8e0',
    cost: 0,
    achievementPoints: 420,   // see lib/characters.ts for the pool-relative reasoning
    restImageUrl: '/boat_celestial_rest.png',
    castImageUrl: '/boat_celestial_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'abyssal',
    trim: 0.06,
    name: 'Abyssal',
    color: '#3a2f5a',
    cost: 0,
    achievementPoints: 350,   // see lib/characters.ts for the pool-relative reasoning
    restImageUrl: '/boat_abyssal_rest.png',
    castImageUrl: '/boat_abyssal_cast.png',
    positions: SHARED_POSITIONS,
  },
]

/** Achievement-gated boats the player has earned (>= threshold) but doesn't own
 *  yet. STATE-based + idempotent, mirroring the character-color helper. */
export function earnedAchievementBoats(achievementPoints: number, unlocked: string[] = []): string[] {
  return BOATS
    .filter(b => typeof b.achievementPoints === 'number')
    .filter(b => !unlocked.includes(b.id))
    .filter(b => achievementPoints >= (b.achievementPoints as number))
    .map(b => b.id)
}

/** Ids of the achievement-gated boats — lets callers cheaply check whether an
 *  achievement-points lookup is even needed before running one. */
export const ACHIEVEMENT_BOAT_IDS = new Set(
  BOATS.filter(b => typeof b.achievementPoints === 'number').map(b => b.id),
)

export const BOAT_MAP: Record<string, BoatDef> = Object.fromEntries(BOATS.map(b => [b.id, b]))

export function getBoat(id: string | null | undefined): BoatDef | null {
  if (!id) return null
  return BOAT_MAP[id] ?? null
}

/** Constant darken applied to the Charcoal ('ash') skin so it reads as
 *  deep charcoal, not plain gray. Where the ash glow animation runs, this
 *  is baked into the `.boat-glow-ash` keyframes (an animated `filter`
 *  replaces a static one). Use this string for renders that DON'T get the
 *  glow class (e.g. the small gear picker tile). Keep in sync with the
 *  brightness/contrast/saturate in `.boat-glow-ash` in globals.css. */
export const BOAT_ASH_DARKEN = 'brightness(0.58) contrast(1.1) saturate(0.85)'

/** Single source of truth for which glow CSS class a boat's overlay image
 *  gets. `glow` → Ethereal's bright shimmer; `glowType: 'ash'` → Charcoal's
 *  subtle dark smoulder. Use this everywhere the boat is rendered. */
export function boatGlowClass(boat: BoatDef | null | undefined): string | undefined {
  if (!boat) return undefined
  if (boat.glow) return 'boat-glow'
  if (boat.glowType === 'ash') return 'boat-glow-ash'
  if (boat.glowType === 'gold') return 'boat-glow-gold'
  return undefined
}
