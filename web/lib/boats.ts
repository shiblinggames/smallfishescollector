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
]

export const BOAT_MAP: Record<string, BoatDef> = Object.fromEntries(BOATS.map(b => [b.id, b]))

export function getBoat(id: string | null | undefined): BoatDef | null {
  if (!id) return null
  return BOAT_MAP[id] ?? null
}
