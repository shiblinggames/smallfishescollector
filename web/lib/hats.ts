// Hat (bandana) cosmetics. Each hat ships as a 2-up PNG sheet (see slice-hat.mjs)
// that's split horizontally — the left half becomes the rest/wait sprite, the
// right half becomes the cast sprite. Position is configured per fishing frame
// because the character's head shifts across rest, wait, and cast.

export type HatFrame = 'rest' | 'wait' | 'cast'
export type HatPos = { top: number; left: number; width: number; rotate: number }

export interface HatDef {
  id: string
  name: string
  /** Swatch color shown in the picker (matches the bandana hue) */
  color: string
  /** Doubloon cost in the gear-slot shop */
  cost: number
  /** /public path to the rest+wait sprite */
  restImageUrl: string
  /** /public path to the cast sprite */
  castImageUrl: string
  /** Per-frame placement of the overlay on the character container */
  positions: Record<HatFrame, HatPos>
}

// All bandanas share the same per-frame anchor — sprites are sliced from
// matching 2-up sheets so the trim bounds (and therefore the on-character
// offsets) line up across colors.
const SHARED_POSITIONS: Record<HatFrame, HatPos> = {
  rest: { top: 53,   left: 57.1, width: 21.8, rotate: 0 },
  wait: { top: 49.1, left: 64.6, width: 21.6, rotate: 0 },
  cast: { top: 53,   left: 63.8, width: 21.5, rotate: 0 },
}

export const HATS: HatDef[] = [
  {
    id: 'blue',
    name: 'Blue',
    color: '#1d4ed8',
    cost: 2000,
    restImageUrl: '/hatblue_rest.png',
    castImageUrl: '/hatblue_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'black',
    name: 'Black',
    color: '#1f1f1f',
    cost: 2000,
    restImageUrl: '/hat_black_rest.png',
    castImageUrl: '/hat_black_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'brown',
    name: 'Brown',
    color: '#8a4a26',
    cost: 2000,
    restImageUrl: '/hat_brown_rest.png',
    castImageUrl: '/hat_brown_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'gray',
    name: 'Gray',
    color: '#7a7a7a',
    cost: 2000,
    restImageUrl: '/hat_gray_rest.png',
    castImageUrl: '/hat_gray_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'green',
    name: 'Green',
    color: '#1d7d3a',
    cost: 2000,
    restImageUrl: '/hat_green_rest.png',
    castImageUrl: '/hat_green_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'purple',
    name: 'Purple',
    color: '#7c2db5',
    cost: 2000,
    restImageUrl: '/hat_purple_rest.png',
    castImageUrl: '/hat_purple_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'yellow',
    name: 'Yellow',
    color: '#d4a01a',
    cost: 2000,
    restImageUrl: '/hat_yellow_rest.png',
    castImageUrl: '/hat_yellow_cast.png',
    positions: SHARED_POSITIONS,
  },
]

export const HAT_MAP: Record<string, HatDef> = Object.fromEntries(HATS.map(h => [h.id, h]))

export function getHat(id: string | null | undefined): HatDef | null {
  if (!id) return null
  return HAT_MAP[id] ?? null
}
