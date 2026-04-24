export type AchievementCategory = 'packs' | 'collection' | 'fotd' | 'fishing' | 'expedition' | 'tavern' | 'bonus' | 'doubloons' | 'membership'
export type AchievementIcon = 'pack' | 'fish' | 'star' | 'anchor' | 'coin' | 'crown' | 'scroll' | 'trophy' | 'hook' | 'ship'

export interface Achievement {
  key: string
  name: string
  description: string
  category: AchievementCategory
  icon: AchievementIcon
}

export const ACHIEVEMENTS: Achievement[] = [
  // Packs
  { key: 'first_pack',  name: 'First Cast',           description: 'Open your first pack',          category: 'packs', icon: 'pack'   },
  { key: 'packs_10',    name: 'Getting Your Sea Legs', description: 'Open 10 packs',                 category: 'packs', icon: 'pack'   },
  { key: 'packs_50',    name: 'Seasoned Fisher',       description: 'Open 50 packs',                 category: 'packs', icon: 'pack'   },
  { key: 'packs_100',   name: 'Deep Waters',           description: 'Open 100 packs',                category: 'packs', icon: 'pack'   },
  { key: 'packs_500',   name: 'Legendary Angler',      description: 'Open 500 packs',                category: 'packs', icon: 'trophy' },

  // Collection
  { key: 'first_epic',      name: 'Epic Catch',       description: 'Pull your first Epic variant',      category: 'collection', icon: 'star'   },
  { key: 'first_legendary', name: 'Legendary Haul',   description: 'Pull your first Legendary variant', category: 'collection', icon: 'star'   },
  { key: 'first_mythic',    name: 'From the Depths',  description: 'Pull your first Mythic variant',    category: 'collection', icon: 'trophy' },
  { key: 'fish_10',         name: 'Small Net',         description: 'Discover 10 different fish',        category: 'collection', icon: 'fish'   },
  { key: 'fish_25',         name: 'Expanding Waters',  description: 'Discover 25 different fish',        category: 'collection', icon: 'fish'   },
  { key: 'fish_all',        name: 'Complete Haul',     description: 'Discover every fish in the sea',    category: 'collection', icon: 'trophy' },

  // Fish of the Day
  { key: 'fotd_first',     name: 'Daily Fisher',     description: 'Complete your first Fish of the Day',              category: 'fotd', icon: 'scroll' },
  { key: 'fotd_perfect',   name: 'Sharp Eye',        description: 'Identify the Fish of the Day on the first guess', category: 'fotd', icon: 'scroll' },
  { key: 'fotd_streak_3',  name: 'On a Roll',        description: 'Reach a 3-day Fish of the Day streak',            category: 'fotd', icon: 'scroll' },
  { key: 'fotd_streak_7',  name: 'Weekly Captain',   description: 'Reach a 7-day Fish of the Day streak',            category: 'fotd', icon: 'scroll' },
  { key: 'fotd_streak_30', name: 'Master Navigator', description: 'Reach a 30-day Fish of the Day streak',           category: 'fotd', icon: 'trophy' },

  // Drop a Line
  { key: 'fishing_first_catch',   name: 'Hooked',          description: 'Land your first catch while fishing',             category: 'fishing', icon: 'hook'   },
  { key: 'fishing_perfect',       name: 'Dead Center',     description: 'Hit your first Perfect zone',                     category: 'fishing', icon: 'hook'   },
  { key: 'fishing_abyss',         name: 'Into the Abyss',  description: 'Land a catch in the Abyss',                      category: 'fishing', icon: 'hook'   },
  { key: 'fishing_abyss_streak',  name: 'Abyss Perfector', description: 'Hit 5 Perfect catches in a row in the Abyss',    category: 'fishing', icon: 'trophy' },

  // Expedition
  { key: 'expedition_first',       name: 'Set Sail',            description: 'Complete your first expedition',            category: 'expedition', icon: 'ship'   },
  { key: 'expedition_coral_run',   name: 'Coral Navigator',     description: 'Complete the Coral Run',                    category: 'expedition', icon: 'ship'   },
  { key: 'expedition_bertuna',     name: 'Bertuna Drifter',     description: 'Navigate the Bertuna Triangle',             category: 'expedition', icon: 'ship'   },
  { key: 'expedition_sunken',      name: 'Sunken Reach Diver',  description: 'Brave the Sunken Reach',                    category: 'expedition', icon: 'ship'   },
  { key: 'expedition_davy_jones',  name: "Davy Jones' Victor",  description: "Survive Davy Jones' Locker",                category: 'expedition', icon: 'trophy' },

  // Tavern
  { key: 'crown_first',   name: 'Roll the Dice', description: 'Play Crown & Anchor for the first time',           category: 'tavern', icon: 'anchor' },
  { key: 'crown_triple',  name: 'Triple Match',  description: 'Roll three matching symbols in Crown & Anchor',    category: 'tavern', icon: 'crown'  },
  { key: 'crown_all_in',  name: 'All In',        description: 'Win a 3× payout on the maximum wager',            category: 'tavern', icon: 'crown'  },

  // Daily bonus
  { key: 'bonus_first', name: 'Pocket Change',  description: 'Claim your first daily bonus', category: 'bonus', icon: 'coin' },
  { key: 'bonus_7',     name: 'Weekly Regular', description: 'Claim 7 daily bonuses',        category: 'bonus', icon: 'coin' },

  // Doubloons
  { key: 'doubloons_1k',   name: 'Coin Purse',    description: 'Earn 1,000 doubloons in total',   category: 'doubloons', icon: 'coin'   },
  { key: 'doubloons_5k',   name: 'Treasure Chest', description: 'Earn 5,000 doubloons in total',  category: 'doubloons', icon: 'coin'   },
  { key: 'doubloons_25k',  name: 'Sunken Hoard',   description: 'Earn 25,000 doubloons in total', category: 'doubloons', icon: 'coin'   },
  { key: 'doubloons_100k', name: 'Pirate King',    description: 'Earn 100,000 doubloons in total', category: 'doubloons', icon: 'trophy' },

  // Membership
  { key: 'member', name: 'Crew Member', description: 'Become a Small Fishes Member', category: 'membership', icon: 'crown' },
]

export const ACHIEVEMENT_MAP: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map(a => [a.key, a])
)
