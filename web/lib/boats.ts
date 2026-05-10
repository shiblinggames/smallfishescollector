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
}

/** Default "Driftwood" — no overlay; uses the base sprite's boat. */
export const DEFAULT_BOAT_COLOR = '#a07858'

export const BOATS: BoatDef[] = [
  {
    id: 'oak',
    name: 'Oak',
    color: '#bda05a',
    cost: 1000,
    restImageUrl: '/boat_oak_rest.png',
    castImageUrl: '/boat_oak_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
  {
    id: 'cherry',
    name: 'Cherry',
    color: '#c84a3a',
    cost: 2000,
    restImageUrl: '/boat_cherry_rest.png',
    castImageUrl: '/boat_cherry_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
  {
    id: 'desert',
    name: 'Desert',
    color: '#c8b378',
    cost: 5000,
    restImageUrl: '/boat_desert_rest.png',
    castImageUrl: '/boat_desert_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
  {
    id: 'mahogany',
    name: 'Mahogany',
    color: '#b5582f',
    cost: 5000,
    restImageUrl: '/boat_mahogany_rest.png',
    castImageUrl: '/boat_mahogany_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
  {
    id: 'pistachio',
    name: 'Pistachio',
    color: '#7d9170',
    cost: 5000,
    restImageUrl: '/boat_pistachio_rest.png',
    castImageUrl: '/boat_pistachio_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
  {
    id: 'taupe',
    name: 'Taupe',
    color: '#9a8a7e',
    cost: 5000,
    restImageUrl: '/boat_taupe_rest.png',
    castImageUrl: '/boat_taupe_cast.png',
    positions: {
      rest: { top: 77, left: 31, width: 55, rotate: 0 },
      wait: { top: 72, left: 38, width: 55, rotate: 0 },
      cast: { top: 77, left: 37, width: 55, rotate: 0 },
    },
  },
]

export const BOAT_MAP: Record<string, BoatDef> = Object.fromEntries(BOATS.map(b => [b.id, b]))

export function getBoat(id: string | null | undefined): BoatDef | null {
  if (!id) return null
  return BOAT_MAP[id] ?? null
}
