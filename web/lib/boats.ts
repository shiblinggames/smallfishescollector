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

export const BOATS: BoatDef[] = [
  {
    id: 'oak',
    name: 'Oak',
    color: '#bda05a',
    cost: 1000,
    restImageUrl: '/boat_oak_rest.png',
    castImageUrl: '/boat_oak_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'cherry',
    name: 'Cherry',
    color: '#c84a3a',
    cost: 2000,
    restImageUrl: '/boat_cherry_rest.png',
    castImageUrl: '/boat_cherry_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'desert',
    name: 'Desert',
    color: '#c8b378',
    cost: 5000,
    restImageUrl: '/boat_desert_rest.png',
    castImageUrl: '/boat_desert_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'mahogany',
    name: 'Mahogany',
    color: '#b5582f',
    cost: 5000,
    restImageUrl: '/boat_mahogany_rest.png',
    castImageUrl: '/boat_mahogany_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'pistachio',
    name: 'Pistachio',
    color: '#7d9170',
    cost: 5000,
    restImageUrl: '/boat_pistachio_rest.png',
    castImageUrl: '/boat_pistachio_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'taupe',
    name: 'Taupe',
    color: '#9a8a7e',
    cost: 5000,
    restImageUrl: '/boat_taupe_rest.png',
    castImageUrl: '/boat_taupe_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'charcoal',
    name: 'Charcoal',
    color: '#3a3a40',
    cost: 0,
    restImageUrl: '/boat_charcoal_rest.png',
    castImageUrl: '/boat_charcoal_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
  {
    id: 'golden',
    name: 'Golden',
    color: '#f0c040',
    cost: 50000,
    restImageUrl: '/boat_golden_rest.png',
    castImageUrl: '/boat_golden_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'offwhite',
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
    name: 'Periwinkle',
    color: '#8095c8',
    cost: 5000,
    restImageUrl: '/boat_periwinkle_rest.png',
    castImageUrl: '/boat_periwinkle_cast.png',
    positions: SHARED_POSITIONS,
  },
]

export const BOAT_MAP: Record<string, BoatDef> = Object.fromEntries(BOATS.map(b => [b.id, b]))

export function getBoat(id: string | null | undefined): BoatDef | null {
  if (!id) return null
  return BOAT_MAP[id] ?? null
}
