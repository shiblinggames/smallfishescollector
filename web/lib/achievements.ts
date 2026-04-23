export type AchievementCategory = 'packs' | 'collection' | 'fotd' | 'tavern' | 'bonus' | 'doubloons' | 'membership'
export type AchievementIcon = 'pack' | 'fish' | 'star' | 'anchor' | 'coin' | 'crown' | 'scroll' | 'trophy'

export interface Achievement {
  key: string
  name: string
  description: string
  category: AchievementCategory
  icon: AchievementIcon
}

export const ACHIEVEMENTS: Achievement[] = [
  // Packs
  { key: 'first_pack',  name: 'First Cast',          description: 'Open your first pack',          category: 'packs', icon: 'pack'   },
  { key: 'packs_10',    name: 'Getting Your Sea Legs',description: 'Open 10 packs',                 category: 'packs', icon: 'pack'   },
  { key: 'packs_50',    name: 'Seasoned Fisher',      description: 'Open 50 packs',                 category: 'packs', icon: 'pack'   },
  { key: 'packs_100',   name: 'Deep Waters',          description: 'Open 100 packs',                category: 'packs', icon: 'pack'   },
  { key: 'packs_500',   name: 'Legendary Angler',     description: 'Open 500 packs',                category: 'packs', icon: 'trophy' },

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

  // Tavern
  { key: 'crown_first',  name: 'Roll the Dice', description: 'Play Crown & Anchor for the first time',       category: 'tavern', icon: 'anchor' },
  { key: 'crown_triple', name: 'Triple Match',  description: 'Roll three matching symbols in Crown & Anchor', category: 'tavern', icon: 'crown'  },

  // Daily bonus
  { key: 'bonus_first', name: 'Pocket Change',   description: 'Claim your first daily bonus', category: 'bonus', icon: 'coin' },
  { key: 'bonus_7',     name: 'Weekly Regular',  description: 'Claim 7 daily bonuses',        category: 'bonus', icon: 'coin' },

  // Doubloons
  { key: 'doubloons_1k',   name: 'Coin Purse',    description: 'Earn 1,000 doubloons in total',    category: 'doubloons', icon: 'coin' },
  { key: 'doubloons_5k',   name: 'Treasure Chest', description: 'Earn 5,000 doubloons in total',    category: 'doubloons', icon: 'coin' },
  { key: 'doubloons_25k',  name: 'Sunken Hoard',   description: 'Earn 25,000 doubloons in total',   category: 'doubloons', icon: 'coin' },
  { key: 'doubloons_100k', name: 'Pirate King',    description: 'Earn 100,000 doubloons in total',  category: 'doubloons', icon: 'trophy' },

  // Membership
  { key: 'member', name: 'Crew Member', description: 'Become a Small Fishes Member', category: 'membership', icon: 'crown' },
]

export const ACHIEVEMENT_MAP: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map(a => [a.key, a])
)
