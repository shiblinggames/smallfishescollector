// Skill tiers (not rarity) — how hard a badge is to earn, low → high.
export type BadgeDifficulty = 'rookie' | 'seasoned' | 'veteran' | 'master'

export interface Badge {
  id: string
  name: string
  description: string
  imageUrl: string
  difficulty: BadgeDifficulty
}

// Doubloons granted when a badge's reward is claimed (kept small + tunable —
// the badge itself is the real prize, this is a little bonus). Tops out at
// 10,000 for a Master-tier feat.
export const BADGE_REWARD: Record<BadgeDifficulty, number> = {
  rookie:   250,
  seasoned: 1_000,
  veteran:  5_000,
  master:   10_000,
}

// Achievement points per tier (1–4) — a skill score summed over earned badges.
export const BADGE_POINTS: Record<BadgeDifficulty, number> = {
  rookie:   1,
  seasoned: 2,
  veteran:  3,
  master:   4,
}

// Display meta for each tier (pill label + accent colour, a low→high progression).
export const DIFFICULTY_META: Record<BadgeDifficulty, { label: string; color: string }> = {
  rookie:   { label: 'Rookie',   color: '#7fae8f' },
  seasoned: { label: 'Seasoned', color: '#5ea0e8' },
  veteran:  { label: 'Veteran',  color: '#b06ff2' },
  master:   { label: 'Master',   color: '#f0c040' },
}

export const BADGES: Badge[] = [
  // ── Fishing mastery ──────────────────────────────────────────────────────
  { id: 'prestige_i',     name: 'Prestige I',        description: 'Reach Prestige in any fishing zone',              imageUrl: '/badges/prestige_i.png',     difficulty: 'rookie'   },
  { id: 'trophy_catch',   name: 'Trophy Catch',       description: 'Land a Trophy-tier fish',                         imageUrl: '/badges/trophy_catch.png',   difficulty: 'veteran'  },
  { id: 'unbroken',       name: 'Unbroken',           description: 'Land 10 perfect catches in a row',                imageUrl: '/badges/unbroken.png',       difficulty: 'seasoned' },
  { id: 'relentless',     name: 'Relentless',         description: 'Land 15 perfect catches in a row',                imageUrl: '/badges/relentless.png',     difficulty: 'veteran'  },
  { id: 'untouchable',    name: 'Untouchable',        description: 'Land 20 perfect catches in a row',                imageUrl: '/badges/untouchable.png',    difficulty: 'master'   },
  { id: 'dead_eye',       name: 'Dead-Eye',           description: 'Land 1,000 perfect catches all-time',            imageUrl: '/badges/dead_eye.png',       difficulty: 'veteran'  },
  { id: 'master_angler',  name: 'Master Angler',      description: 'Reach Fishing Level 100',                         imageUrl: '/badges/master_angler.png',  difficulty: 'master'   },
  { id: 'zone_legend',    name: 'Zone Legend',        description: 'Reach Prestige in all 4 fishing zones',           imageUrl: '/badges/zone_legend.png',    difficulty: 'veteran'  },
  { id: 'prestige_stars', name: 'Prestige Stars',     description: 'Earn all 20 prestige stars (5 per zone)',         imageUrl: '/badges/prestige_stars.png', difficulty: 'master'   },

  // ── Fishing feats ────────────────────────────────────────────────────────
  { id: 'two_for_the_pot', name: 'Two for the Pot',   description: 'Reel in a double catch',                          imageUrl: '/badges/two_for_the_pot.png', difficulty: 'rookie'   },
  { id: 'saltlung',       name: 'Saltlung',           description: 'Cast your line 1,000 times',                      imageUrl: '/badges/saltlung.png',       difficulty: 'seasoned' },
  { id: 'crate_digger',   name: 'Crate Digger',       description: 'Open 50 supply crates',                           imageUrl: '/badges/crate_digger.png',   difficulty: 'seasoned' },

  // ── The collection ───────────────────────────────────────────────────────
  { id: 'half_the_sea',   name: 'Half the Sea',       description: 'Catch 50 fish species',                           imageUrl: '/badges/half_the_sea.png',   difficulty: 'rookie'   },
  { id: 'ancient_ones',   name: 'Ancient Ones',       description: 'Catch all 6 Ancient Deep trophies',               imageUrl: '/badges/ancient_ones.png',   difficulty: 'master'   },
  { id: 'full_collection',name: 'Full Collection',    description: 'Catch every fish species in the game',             imageUrl: '/badges/full_collection.png', difficulty: 'master'  },

  // ── Crew ─────────────────────────────────────────────────────────────────
  { id: 'growing_crew',     name: 'Growing Crew',      description: 'Recruit 25 crew',                                imageUrl: '/badges/growing_crew.png',     difficulty: 'rookie'   },
  { id: 'theres_a_grave',   name: "There's a Grave?",  description: 'Lose a crew member for the first time',          imageUrl: '/badges/theres_a_grave.png',   difficulty: 'rookie'   },
  { id: 'crewmaster',       name: 'Crewmaster',        description: 'Reach the top Crew Hall tier',                   imageUrl: '/badges/crewmaster.png',       difficulty: 'veteran'  },
  { id: 'full_muster',      name: 'Full Muster',       description: 'Recruit 100 crew',                               imageUrl: '/badges/full_muster.png',      difficulty: 'veteran'  },
  { id: 'legendary_recruit', name: 'Legendary Recruit', description: 'Recruit a legendary crew',                      imageUrl: '/badges/legendary_recruit.png', difficulty: 'seasoned' },
  { id: 'old_salt',         name: 'Old Salt',          description: 'Level a crew to 100',                            imageUrl: '/badges/old_salt.png',         difficulty: 'master'   },

  // ── Expeditions & combat ─────────────────────────────────────────────────
  // 'navigator' id kept stable so existing unlocks survive; the label moved
  // to "Wayfinder" to free the name from the Navigator crew class.
  { id: 'navigator',        name: 'Wayfinder',         description: 'Reach Navigation Level 50',                      imageUrl: '/badges/navigator.png',        difficulty: 'seasoned' },
  { id: 'fleet_admiral',    name: 'Fleet Admiral',     description: 'Complete 100 voyages',                           imageUrl: '/badges/fleet_admiral.png',    difficulty: 'seasoned' },
  { id: 'master_navigator', name: 'Master Navigator',  description: 'Reach Navigation Level 100',                     imageUrl: '/badges/master_navigator.png', difficulty: 'master'   },
  // Challenge-mode boss clears only (normal campaign clears are story, not
  // achievements). All four entry-challenge clears are Seasoned.
  { id: 'corsairs_bane',  name: "Corsair's Bane",     description: 'Defeat Barnacle Pete in challenge mode',          imageUrl: '/badges/corsairs_bane.png',  difficulty: 'seasoned' },
  { id: 'ghost_ship',     name: "Krust's Crutch",     description: 'Defeat Captain Krust in challenge mode',          imageUrl: '/badges/ghost_ship.png',     difficulty: 'seasoned' },
  { id: 'cartographers_fall', name: "The Cartographer's Fall", description: 'Defeat the Cartographer in challenge mode', imageUrl: '/badges/cartographers_fall.png', difficulty: 'seasoned' },
  { id: 'toll_paid',      name: 'Toll Paid',          description: 'Defeat Tollmaster Spet in challenge mode',        imageUrl: '/badges/toll_paid.png',      difficulty: 'seasoned' },
  { id: 'swift_reckoning', name: 'Swift Reckoning',   description: "Clear Corsair's Reckoning in under 1:30",         imageUrl: '/badges/swift_reckoning.png', difficulty: 'veteran' },
  { id: 'opening_salvo',  name: 'Opening Salvo',      description: 'Land a single raid hit for 50 or more',           imageUrl: '/badges/opening_salvo.png',  difficulty: 'rookie'   },
  { id: 'hard_hitter',    name: 'Hard Hitter',        description: 'Land a single raid hit for 100 or more',          imageUrl: '/badges/hard_hitter.png',    difficulty: 'seasoned' },
  { id: 'heavy_broadside', name: 'Heavy Broadside',   description: 'Land a single raid hit for 250 or more',          imageUrl: '/badges/heavy_broadside.png', difficulty: 'veteran'  },
  { id: 'finndicates_bane', name: "Finndicate's Bane", description: 'Clear all four raids in challenge mode',         imageUrl: '/badges/finndicates_bane.png', difficulty: 'veteran' },

  // ── The Gauntlet ─────────────────────────────────────────────────────────
  { id: 'into_the_deep',  name: 'Into the Deep',      description: 'Descend to depth 5 in the Gauntlet',              imageUrl: '/badges/into_the_deep.png',  difficulty: 'seasoned' },
  { id: 'fathomless',     name: 'Fathomless',         description: 'Bank 500 Fathoms all-time',                       imageUrl: '/badges/fathomless.png',     difficulty: 'veteran'  },
  // Repointed from the retired "Davy Jones' Victor" (old Locker raid).
  { id: 'davy_jones',     name: "Davy Jones' Locker", description: 'Descend to depth 10 in the Gauntlet',             imageUrl: '/badges/davy_jones.png',     difficulty: 'veteran'  },

  // ── Broadsides (PvP) ─────────────────────────────────────────────────────
  { id: 'first_blood',    name: 'First Blood',        description: 'Win a ship duel',                                 imageUrl: '/badges/first_blood.png',    difficulty: 'rookie'   },
  { id: 'brawler',        name: 'Broadside Brawler',  description: 'Win 10 ship duels',                               imageUrl: '/badges/brawler.png',        difficulty: 'seasoned' },
  { id: 'duelist',        name: 'Duelist',            description: 'Win 25 ship duels',                               imageUrl: '/badges/duelist.png',        difficulty: 'veteran'  },

  // ── The Chart Room ───────────────────────────────────────────────────────
  { id: 'quartermaster',  name: 'Quartermaster',      description: 'Bank 40 charting points',                         imageUrl: '/badges/quartermaster.png',  difficulty: 'rookie'   },
  { id: 'den_magnate',    name: 'Den Magnate',        description: 'Bank enough charting points to top the Den purse', imageUrl: '/badges/den_magnate.png',   difficulty: 'seasoned' },

  // ── The Den & records ────────────────────────────────────────────────────
  { id: 'catfish_jackpot', name: 'Catfish Jackpot',   description: 'Win the slots Catfish Jackpot',                   imageUrl: '/badges/catfish_jackpot.png', difficulty: 'seasoned' },
  { id: 'tide_runner',    name: 'Tide Runner',        description: 'Reach 300m in a single Tide Run',                 imageUrl: '/badges/tide_runner.png',    difficulty: 'rookie'   },
  { id: 'tide_champion',  name: 'Tide Champion',      description: 'Reach 500m in a single Tide Run',                 imageUrl: '/badges/tide_champion.png',  difficulty: 'veteran'  },
  { id: 'tide_master',    name: 'Tide Master',        description: 'Reach 750m in a single Tide Run',                 imageUrl: '/badges/tide_master.png',    difficulty: 'master'   },

  // ── Wealth ───────────────────────────────────────────────────────────────
  { id: 'baby_steps',     name: 'Baby Steps',         description: 'Hold 100,000 doubloons at once',                  imageUrl: '/badges/baby_steps.png',     difficulty: 'rookie'   },
  { id: 'deep_pockets',   name: 'Deep Pockets',       description: 'Hold 1,000,000 doubloons at once',                imageUrl: '/badges/deep_pockets.png',   difficulty: 'veteran'  },
  { id: 'bilge_baron',    name: 'Bilge Baron',        description: 'Hold 2,500,000 doubloons at once',                imageUrl: '/badges/bilge_baron.png',    difficulty: 'master'   },

  // ── 2026-06 expansion (batches 9–10) ─────────────────────────────────────
  { id: 'got_away',       name: 'The One That Got Away', description: 'Lose 50 fish to snapped lines',                imageUrl: '/badges/got_away.png',       difficulty: 'rookie'   },
  { id: 'reel_lucky',     name: 'Reel Lucky',         description: 'Hit a fishing jackpot',                           imageUrl: '/badges/reel_lucky.png',     difficulty: 'veteran'  },
  { id: 'two_fisted',     name: 'Two-Fisted',         description: 'Land 100 double catches',                         imageUrl: '/badges/two_fisted.png',     difficulty: 'seasoned' },
  { id: 'sure_shot',      name: 'Sure Shot',          description: 'Land 250 perfect catches all-time',              imageUrl: '/badges/sure_shot.png',      difficulty: 'seasoned' },
  { id: 'salted_through', name: 'Salted Through',     description: 'Cast your line 10,000 times',                     imageUrl: '/badges/salted_through.png', difficulty: 'master'   },
  { id: 'maiden_voyage',  name: 'Maiden Voyage',      description: 'Complete your first voyage',                      imageUrl: '/badges/maiden_voyage.png',  difficulty: 'rookie'   },
  { id: 'old_sea_dog',    name: 'Old Sea Dog',        description: 'Complete 50 voyages',                             imageUrl: '/badges/old_sea_dog.png',    difficulty: 'seasoned' },
  { id: 'hundred_fins',   name: 'A Hundred Fins',     description: 'Catch 100 fish species',                          imageUrl: '/badges/hundred_fins.png',   difficulty: 'veteran'  },
  { id: 'three_legends',  name: 'The Three Legends',  description: 'Own all three legendary crew at once',            imageUrl: '/badges/three_legends.png',  difficulty: 'master'   },
  { id: 'beacon_breaker', name: 'Beacon Breaker',     description: 'Smash 500 beacons across all Tide Runs',          imageUrl: '/badges/beacon_breaker.png', difficulty: 'seasoned' },
  { id: 'long_haul',      name: 'The Long Haul',      description: 'Swim 100,000m total across Tide Runs',            imageUrl: '/badges/long_haul.png',      difficulty: 'veteran'  },
  { id: 'captains_colors', name: "Captain's Colors",  description: 'Become a Captain',                                imageUrl: '/badges/captains_colors.png', difficulty: 'rookie'  },
]

export const BADGE_MAP: Record<string, Badge> = Object.fromEntries(
  BADGES.map(b => [b.id, b])
)

/** Doubloon reward for a badge id (0 if unknown). */
export function badgeReward(id: string): number {
  const b = BADGE_MAP[id]
  return b ? BADGE_REWARD[b.difficulty] : 0
}

/** Achievement points (1–4) for a badge id (0 if unknown). */
export function badgePoints(id: string): number {
  const b = BADGE_MAP[id]
  return b ? BADGE_POINTS[b.difficulty] : 0
}

// Longer "what it takes" blurb shown in the badge detail modal — a sentence or
// two of context/tips beyond the one-line description.
export const BADGE_DETAIL: Record<string, string> = {
  prestige_i:       'Prestige a zone by maxing its catalogue, then resetting it for a permanent sell bonus. Your first prestige proves you have fully worked a fishing ground.',
  trophy_catch:     'Every cast rolls a size, and roughly 1 in 30 lands in the top Trophy band. Keep fishing and one of the giants is yours.',
  unbroken:         'String together 10 perfect reel-ins with no misses between them. A single slip resets the count to zero.',
  relentless:       'Fifteen flawless catches back to back. The line never wavers.',
  untouchable:      'Twenty perfect reels in a row — a streak only the steadiest hands ever reach.',
  dead_eye:         'A lifetime tally of 1,000 perfect catches. It builds up cast by cast, no streak required.',
  master_angler:    'Reach Fishing Level 100, the cap. The mark of a true angler.',
  zone_legend:      'Reach Prestige at least once in all four main fishing zones, from the shallows to the abyss.',
  prestige_stars:   'Earn every prestige star: all five in each of the four zones, twenty in total. The fishing endgame.',
  two_for_the_pot:  'Pull up two fish on a single cast. It happens on its own from time to time, more often with the right gear running. Lucky, and a little greedy.',
  saltlung:         'Cast your line a thousand times across your whole career. Pure time on the water, one cast at a time.',
  crate_digger:     'Crack open 50 supply crates. They wash up from voyages, raids, and the daily haul, and you have hauled in fifty of them.',
  half_the_sea:     'Catch 50 different fish species. A solid start on filling out the logbook.',
  ancient_ones:     'Land all six Ancient Deep trophies — the rarest, oldest fish in the sea.',
  full_collection:  'Catch every single species in the game. The ultimate collector’s feat.',
  growing_crew:     'Recruit 25 crew over your career, living or lost.',
  theres_a_grave:   'Lose a crew member for the first time. The sea takes its due eventually — a sobering milestone.',
  legendary_recruit:'Add a legendary fish to your crew — Catfish, Doby Mick, or Mako. The rarest hands aboard.',
  crewmaster:       'Upgrade the Crew Hall all the way to its top tier, the Hall of Legends.',
  full_muster:      'Recruit 100 crew in total. A constant churn of fresh hands through the hall.',
  old_salt:         'Level a single crew member all the way to 100 — hundreds of raids of XP poured into one soul.',
  navigator:        'Reach Navigation Level 50, earned steadily on raids and voyages.',
  fleet_admiral:    'Complete 100 voyages. Pure patience and a fleet that keeps sailing.',
  opening_salvo:    'Land a single raid cannon hit for 50 or more damage. Your guns are finding their range.',
  hard_hitter:      'Land a single raid hit for 100 or more. Your build is starting to bite.',
  heavy_broadside:  'Land a single raid hit for 250 or more — a devastating broadside reserved for the top builds.',
  swift_reckoning:  'Clear the normal Corsair’s Reckoning raid in under a minute and a half. A clean, fast run start to finish.',
  corsairs_bane:    'Defeat Barnacle Pete in challenge mode — the harder, tuned-up version of the first raid.',
  ghost_ship:       'Defeat Captain Krust in challenge mode.',
  cartographers_fall:'Defeat the Cartographer in challenge mode. The normal clear is just the story — this is the real test.',
  toll_paid:        'Defeat Tollmaster Spet in challenge mode, the hard version of the Chapter II finale.',
  master_navigator: 'Reach Navigation Level 100, the navigation cap.',
  finndicates_bane: 'Clear all four raids in challenge mode. The complete hard-mode gauntlet.',
  into_the_deep:    'Descend to depth 5 in the Davy Jones Gauntlet on a single run.',
  fathomless:       'Bank 500 Fathoms across all your Gauntlet runs.',
  davy_jones:       'Reach depth 10 in the Gauntlet — about as deep as anyone has gone.',
  first_blood:      'Win your first ship duel against another captain.',
  brawler:          'Win 10 ship duels.',
  duelist:          'Win 25 ship duels — a feared name on the ladder.',
  quartermaster:    'Bank 40 charting points from the Chart Room puzzles.',
  den_magnate:      'Bank 80 charting points — enough to push the Den buy-in cap to its maximum.',
  catfish_jackpot:  'Hit the global Catfish Jackpot on the slots. Three catfish on one spin, and the whole pot is yours.',
  tide_runner:      'Reach 300m in a single Tide Run.',
  tide_champion:    'Reach 500m in a single Tide Run — contest-winning distance.',
  tide_master:      'Reach 750m in a single Tide Run, out past anyone’s record.',
  baby_steps:       'Hold 100,000 doubloons at once. Your first real nest egg.',
  deep_pockets:     'Hold 1,000,000 doubloons at once.',
  bilge_baron:      'Hold 2,500,000 doubloons at once. The hold is fit to burst.',
  got_away:         'Lose 50 fish to lines that snapped or slipped the hook. It happens to every angler who spends real time on the water.',
  reel_lucky:       'Land a fishing jackpot, the rare cast that pays out many times over. You cannot chase it, only ride it when it comes.',
  two_fisted:       'Pull up two fish on one cast 100 times over. The right gear makes it happen more often, but it always feels greedy.',
  sure_shot:        'Bank 250 perfect catches across your career. No streak required, it builds one clean reel at a time.',
  salted_through:   'Cast your line ten thousand times. A milestone only the most weathered hands ever reach.',
  maiden_voyage:    'Send your crew out on their very first voyage. Every fleet starts with one ship leaving port.',
  old_sea_dog:      'Complete 50 voyages. Patience, a steady fleet, and a lot of time at the wheel.',
  hundred_fins:     'Catch 100 different fish species. The logbook is starting to look serious.',
  three_legends:    'Have all three legendary crew aboard at once: Catfish, Doby Mick, and Mako. The rarest muster in the game.',
  beacon_breaker:   'Smash 500 beacons across all your Tide Runs. Every run chips away at the total.',
  long_haul:        'Cover 100,000 meters in total across every Tide Run you have ever made. The long, steady grind of the open channel.',
  captains_colors:  'Become a Captain and back the studio. The badge worn by those who keep the seas afloat.',
}

/** Detail blurb for a badge id (falls back to its short description). */
export function badgeDetail(id: string): string {
  return BADGE_DETAIL[id] ?? BADGE_MAP[id]?.description ?? ''
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
