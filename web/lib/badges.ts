export interface Badge {
  id: string
  name: string
  description: string
  imageUrl: string
}

export const BADGES: Badge[] = [
  // Fishing mastery
  { id: 'prestige_i',     name: 'Prestige I',        description: 'Reach Prestige in any fishing zone',              imageUrl: '/badges/prestige_i.png'     },
  { id: 'master_angler',  name: 'Master Angler',      description: 'Reach Fishing Level 100',                         imageUrl: '/badges/master_angler.png'  },
  { id: 'unbroken',       name: 'Unbroken',           description: 'Land 30 consecutive perfect catches in a session', imageUrl: '/badges/unbroken.png'       },
  { id: 'ancient_ones',   name: 'Ancient Ones',       description: 'Catch all 6 Ancient Deep trophies',               imageUrl: '/badges/ancient_ones.png'   },
  { id: 'full_collection',name: 'Full Collection',    description: 'Catch every fish species in the game',             imageUrl: '/badges/full_collection.png'},
  { id: 'zone_legend',    name: 'Zone Legend',        description: 'Reach Prestige in all 4 fishing zones',           imageUrl: '/badges/zone_legend.png'    },

  // Expedition & combat
  { id: 'davy_jones',     name: "Davy Jones' Victor", description: "Complete Davy Jones' Locker",                     imageUrl: '/badges/davy_jones.png'     },
  { id: 'corsairs_bane',  name: "Corsair's Bane",     description: 'Defeat Barnacle Pete in under 2 minutes',         imageUrl: '/badges/corsairs_bane.png'  },
  { id: 'ghost_ship',     name: 'Ghost Ship',         description: 'Complete a full expedition without taking damage', imageUrl: '/badges/ghost_ship.png'     },

  // Economy & navigation
  { id: 'fleet_admiral',  name: 'Fleet Admiral',      description: 'Own the Man-o-War',                               imageUrl: '/badges/fleet_admiral.png'  },
  { id: 'deep_pockets',   name: 'Deep Pockets',       description: 'Hold 1,000,000 doubloons at once',                imageUrl: '/badges/deep_pockets.png'   },
  { id: 'navigator',      name: 'Navigator',          description: 'Reach Navigation Level 50',                       imageUrl: '/badges/navigator.png'      },
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
    rest: { top: 83, left: 36, width: 6, rotate: 0 },
    wait: { top: 78, left: 43, width: 6, rotate: 0 },
    cast: { top: 83, left: 43, width: 6, rotate: 0 },
  },
  1: {
    rest: { top: 84, left: 42, width: 6, rotate: 0 },
    wait: { top: 79, left: 49, width: 6, rotate: 0 },
    cast: { top: 84, left: 49, width: 6, rotate: 0 },
  },
  2: {
    rest: { top: 84, left: 48, width: 6, rotate: 0 },
    wait: { top: 79, left: 55, width: 6, rotate: 0 },
    cast: { top: 84, left: 55, width: 6, rotate: 0 },
  },
}
