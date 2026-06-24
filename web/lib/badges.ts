export type BadgeDifficulty = 'common' | 'rare' | 'epic' | 'legendary'

export interface Badge {
  id: string
  name: string
  description: string
  imageUrl: string
  difficulty: BadgeDifficulty
}

// Doubloons granted when a badge's reward is claimed (kept small + tunable —
// the badge itself is the real prize, this is a little bonus). Scales by tier.
export const BADGE_REWARD: Record<BadgeDifficulty, number> = {
  common:    250,
  rare:      1_000,
  epic:      5_000,
  legendary: 15_000,
}

// Display meta for each difficulty (pill label + accent colour, matching the
// game's rarity palette: grey / blue / purple / gold).
export const DIFFICULTY_META: Record<BadgeDifficulty, { label: string; color: string }> = {
  common:    { label: 'Common',    color: '#9aa3b2' },
  rare:      { label: 'Rare',      color: '#5ea0e8' },
  epic:      { label: 'Epic',      color: '#b06ff2' },
  legendary: { label: 'Legendary', color: '#f0c040' },
}

export const BADGES: Badge[] = [
  // ── Fishing mastery ──────────────────────────────────────────────────────
  { id: 'prestige_i',     name: 'Prestige I',        description: 'Reach Prestige in any fishing zone',              imageUrl: '/badges/prestige_i.png',     difficulty: 'common'    },
  { id: 'master_angler',  name: 'Master Angler',      description: 'Reach Fishing Level 100',                         imageUrl: '/badges/master_angler.png',  difficulty: 'epic'      },
  { id: 'unbroken',       name: 'Unbroken',           description: 'Land 10 consecutive perfect catches in a row',    imageUrl: '/badges/unbroken.png',       difficulty: 'rare'      },
  { id: 'zone_legend',    name: 'Zone Legend',        description: 'Reach Prestige in all 4 fishing zones',           imageUrl: '/badges/zone_legend.png',    difficulty: 'epic'      },
  { id: 'trophy_catch',   name: 'Trophy Catch',       description: 'Land a Trophy-tier fish',                         imageUrl: '/badges/trophy_catch.png',   difficulty: 'common'    },
  { id: 'dead_eye',       name: 'Dead-Eye',           description: 'Land 1,000 perfect catches all-time',            imageUrl: '/badges/dead_eye.png',       difficulty: 'epic'      },

  // ── The collection ───────────────────────────────────────────────────────
  { id: 'ancient_ones',   name: 'Ancient Ones',       description: 'Catch all 6 Ancient Deep trophies',               imageUrl: '/badges/ancient_ones.png',   difficulty: 'epic'      },
  { id: 'full_collection',name: 'Full Collection',    description: 'Catch every fish species in the game',             imageUrl: '/badges/full_collection.png', difficulty: 'legendary' },

  // ── Crew ─────────────────────────────────────────────────────────────────
  { id: 'crewmaster',     name: 'Crewmaster',         description: 'Reach the top Crew Hall tier',                    imageUrl: '/badges/crewmaster.png',     difficulty: 'epic'      },
  { id: 'full_muster',    name: 'Full Muster',        description: 'Recruit 100 crew',                                imageUrl: '/badges/full_muster.png',    difficulty: 'rare'      },
  { id: 'old_salt',       name: 'Old Salt',           description: 'Level a crew to 100',                             imageUrl: '/badges/old_salt.png',       difficulty: 'epic'      },

  // ── Expeditions & combat ─────────────────────────────────────────────────
  // 'navigator' id kept stable so existing unlocks survive; the label moved
  // to "Wayfinder" to free the name from the Navigator crew class.
  { id: 'navigator',      name: 'Wayfinder',          description: 'Reach Navigation Level 50',                       imageUrl: '/badges/navigator.png',      difficulty: 'rare'      },
  { id: 'fleet_admiral',  name: 'Fleet Admiral',      description: 'Complete 100 voyages',                            imageUrl: '/badges/fleet_admiral.png',  difficulty: 'epic'      },
  // Challenge-mode boss clears. Badge IDs stay stable (corsairs_bane,
  // ghost_ship) so existing DB unlocks aren't invalidated.
  { id: 'corsairs_bane',  name: "Corsair's Bane",     description: 'Defeat Barnacle Pete in challenge mode',          imageUrl: '/badges/corsairs_bane.png',  difficulty: 'rare'      },
  { id: 'ghost_ship',     name: "Krust's Crutch",     description: 'Defeat Captain Krust in challenge mode',          imageUrl: '/badges/ghost_ship.png',     difficulty: 'rare'      },
  { id: 'cartographers_fall', name: "The Cartographer's Fall", description: 'Defeat the Cartographer',                imageUrl: '/badges/cartographers_fall.png', difficulty: 'rare'   },
  { id: 'toll_paid',      name: 'Toll Paid',          description: 'Defeat Tollmaster Spet',                          imageUrl: '/badges/toll_paid.png',      difficulty: 'epic'      },
  { id: 'finndicates_bane', name: "Finndicate's Bane", description: 'Clear all four raids in challenge mode',         imageUrl: '/badges/finndicates_bane.png', difficulty: 'legendary' },
  { id: 'heavy_broadside', name: 'Heavy Broadside',   description: 'Land a single raid hit for 250 or more',          imageUrl: '/badges/heavy_broadside.png', difficulty: 'epic'     },

  // ── The Gauntlet ─────────────────────────────────────────────────────────
  // Repointed from the retired "Davy Jones' Victor" (old Locker raid) to the
  // Gauntlet, reusing the existing davy_jones art.
  { id: 'davy_jones',     name: "Davy Jones' Locker", description: 'Descend to depth 10 in the Gauntlet',             imageUrl: '/badges/davy_jones.png',     difficulty: 'epic'      },

  // ── Broadsides (PvP) ─────────────────────────────────────────────────────
  { id: 'first_blood',    name: 'First Blood',        description: 'Win a ship duel',                                 imageUrl: '/badges/first_blood.png',    difficulty: 'common'    },
  { id: 'duelist',        name: 'Duelist',            description: 'Win 25 ship duels',                               imageUrl: '/badges/duelist.png',        difficulty: 'epic'      },

  // ── The Chart Room ───────────────────────────────────────────────────────
  { id: 'den_magnate',    name: 'Den Magnate',        description: 'Bank enough charting points to top the Den purse', imageUrl: '/badges/den_magnate.png',   difficulty: 'epic'      },

  // ── The Den & records ────────────────────────────────────────────────────
  { id: 'catfish_jackpot', name: 'Catfish Jackpot',   description: 'Win the slots Catfish Jackpot',                   imageUrl: '/badges/catfish_jackpot.png', difficulty: 'rare'     },
  { id: 'tide_master',    name: 'Tide Master',        description: 'Reach 750m in a single Tide Run',                 imageUrl: '/badges/tide_master.png',    difficulty: 'rare'      },

  // ── Wealth ───────────────────────────────────────────────────────────────
  { id: 'deep_pockets',   name: 'Deep Pockets',       description: 'Hold 1,000,000 doubloons at once',                imageUrl: '/badges/deep_pockets.png',   difficulty: 'legendary' },
]

export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(
  BADGES.map(b => [b.id, b])
)

/** Doubloon reward for a badge id (0 if unknown). */
export function badgeReward(id: string): number {
  const b = BADGE_MAP[id]
  return b ? BADGE_REWARD[b.difficulty] : 0
}

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
