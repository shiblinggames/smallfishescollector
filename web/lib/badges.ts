export interface Badge {
  id: string
  name: string
  description: string
  imageUrl: string
}

export const BADGES: Badge[] = [
  {
    id: 'prestige_i',
    name: 'Prestige I',
    description: 'Reach Prestige in any fishing zone',
    imageUrl: '/badges/prestige_i.png',
  },
]

export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(
  BADGES.map(b => [b.id, b])
)

export const MAX_EQUIPPED_BADGES = 3

// Per-slot, per-frame overlay positions (% relative to character container).
// Tune these via /fishing-test.
export type BadgeFrame = 'rest' | 'wait' | 'cast'
export type BadgePos = { top: number; left: number; width: number; rotate: number }

export const BADGE_SLOT_POSITIONS: Record<number, Record<BadgeFrame, BadgePos>> = {
  0: {
    rest: { top: 72, left: 18, width: 18, rotate: 0 },
    wait: { top: 72, left: 18, width: 18, rotate: 0 },
    cast: { top: 72, left: 18, width: 18, rotate: 0 },
  },
  1: {
    rest: { top: 72, left: 38, width: 18, rotate: 0 },
    wait: { top: 72, left: 38, width: 18, rotate: 0 },
    cast: { top: 72, left: 38, width: 18, rotate: 0 },
  },
  2: {
    rest: { top: 72, left: 58, width: 18, rotate: 0 },
    wait: { top: 72, left: 58, width: 18, rotate: 0 },
    cast: { top: 72, left: 58, width: 18, rotate: 0 },
  },
}
