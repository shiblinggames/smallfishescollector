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
  /** Only obtainable from crates — hidden from the shop picker unless owned. */
  crateOnly?: boolean
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
    cost: 0,
    restImageUrl: '/hat_black_rest.png',
    castImageUrl: '/hat_black_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
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
    cost: 0,
    restImageUrl: '/hat_gray_rest.png',
    castImageUrl: '/hat_gray_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
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
  // ── 2026-07 batch: 4 premium shop colors (20k) + 4 crate-only chases ──
  {
    id: 'midnight',
    name: 'Midnight',
    color: '#222a3d',
    cost: 20000,
    restImageUrl: '/hat_midnight_rest.png',
    castImageUrl: '/hat_midnight_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'olive',
    name: 'Olive',
    color: '#6f7a35',
    cost: 20000,
    restImageUrl: '/hat_olive_rest.png',
    castImageUrl: '/hat_olive_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'sky',
    name: 'Sky',
    color: '#7ec2ea',
    cost: 20000,
    restImageUrl: '/hat_sky_rest.png',
    castImageUrl: '/hat_sky_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'offwhite',
    name: 'Off-White',
    color: '#ece6d8',
    cost: 20000,
    restImageUrl: '/hat_offwhite_rest.png',
    castImageUrl: '/hat_offwhite_cast.png',
    positions: SHARED_POSITIONS,
  },
  {
    id: 'golden',
    name: 'Golden',
    color: '#e6b422',
    cost: 0,
    restImageUrl: '/hat_golden_rest.png',
    castImageUrl: '/hat_golden_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
  {
    id: 'cheetah',
    name: 'Cheetah',
    color: '#c79a5b',
    cost: 0,
    restImageUrl: '/hat_cheetah_rest.png',
    castImageUrl: '/hat_cheetah_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
  {
    id: 'fuego',
    name: 'Fuego',
    color: '#d63a1e',
    cost: 0,
    restImageUrl: '/hat_fuego_rest.png',
    castImageUrl: '/hat_fuego_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
  {
    id: 'spotted',
    name: 'Spotted',
    color: '#d3ccbb',
    cost: 0,
    restImageUrl: '/hat_spotted_rest.png',
    castImageUrl: '/hat_spotted_cast.png',
    positions: SHARED_POSITIONS,
    crateOnly: true,
  },
]

export const HAT_MAP: Record<string, HatDef> = Object.fromEntries(HATS.map(h => [h.id, h]))

export function getHat(id: string | null | undefined): HatDef | null {
  if (!id) return null
  return HAT_MAP[id] ?? null
}
