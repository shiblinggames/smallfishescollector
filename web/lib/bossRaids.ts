export const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

export type EnemyAction = 'reload' | 'fire' | 'volley' | 'dodge'

export interface BroadsideEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  /** Ship speed: used in the speed roll for turn order, dodge roll, and aim-bar target speed. */
  shipSpeed: number
  /** Legacy: real-time action interval. Kept for backwards-compat readouts; no longer drives combat. */
  actionMs: number
  /** Scripted action loop. Cycles in order every turn. */
  pattern: EnemyAction[]
  /** Flat crit chance (0–1) on each fire. Players crit via the skill-based
   *  aim bar; enemies don't have that, so this stat gives them the same
   *  outcome via RNG. On crit, damage is multiplied by 1.5×. */
  critChance: number
  image: string
  portrait?: string
}

export interface RaidLootItem {
  id: string
  label: string
  image: string | null
  emoji: string
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
  weight: number
  shipSkinId?: string  // if set, render player's ship with this skin applied
}

export interface BossRaidConfig {
  raidId: string
  raidTitle: string
  bossDefeatedText: string
  enemies: Record<string, BroadsideEnemy>
  sequence: string[]   // non-boss enemy IDs in order; boss fires every sequence.length+1 rounds
  bossId: string
  loot: RaidLootItem[]
  killRewards: Record<string, { gold: number; xp: number }>
}

export const RARITY_COLOR: Record<RaidLootItem['rarity'], string> = {
  common:    '#9ca3af',
  uncommon:  '#4ade80',
  rare:      '#60a5fa',
  epic:      '#a78bfa',
  legendary: '#f0c040',
}

export const CORSAIRS_RECKONING: BossRaidConfig = {
  raidId: 'corsairs_reckoning',
  raidTitle: "The Corsair's Reckoning",
  bossDefeatedText: 'Barnacle Pete Defeated',
  enemies: {
    brute: {
      id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
      shipSpeed: 4, actionMs: 4500,
      pattern: ['reload', 'fire', 'reload', 'fire'],
      critChance: 0.05,  // brutes are unsubtle — low crit
      image: '/enemytier1.png',
      portrait: ENEMY_IMG_BASE + 'reefraider.png',
    },
    sniper: {
      id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
      shipSpeed: 3, actionMs: 5500,
      pattern: ['reload', 'reload', 'dodge', 'reload', 'fire'],
      critChance: 0.20,  // marksman — high crit, slower cadence
      image: '/enemytier1scout.png',
      portrait: ENEMY_IMG_BASE + 'crowsnestmarksman.png',
    },
    corsair: {
      id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
      shipSpeed: 7, actionMs: 3500,
      pattern: ['reload', 'dodge', 'fire', 'reload', 'fire'],
      critChance: 0.10,
      image: '/enemytier1elite.png',
      portrait: ENEMY_IMG_BASE + 'saltwatercorsair.png',
    },
    pete: {
      id: 'pete', name: 'Barnacle Pete', hpBase: 55, minDmg: 8, maxDmg: 15,
      shipSpeed: 6, actionMs: 4500,
      pattern: ['reload', 'reload', 'dodge', 'fire', 'reload', 'fire'],
      critChance: 0.15,
      image: '/enemytier1boss.png',
      portrait: ENEMY_IMG_BASE + 'barnacle_pete.png',
    },
  },
  sequence: ['brute', 'brute', 'sniper', 'sniper', 'corsair', 'corsair'],
  bossId: 'pete',
  loot: [
    { id: 'doubloons_300',  label: '+300 ⟡',        image: '/smallpile.png',       emoji: '🪙', rarity: 'common',    weight: 50 },
    { id: 'doubloons_600',  label: '+600 ⟡',        image: '/dailybonus.png',      emoji: '💰', rarity: 'uncommon',  weight: 25 },
    { id: 'gems_25',        label: '25 Gems',        image: null,                   emoji: '💎', rarity: 'rare',      weight: 15 },
    { id: 'pack',           label: '1 Pack',         image: '/cardbacknew.png',     emoji: '📦', rarity: 'epic',      weight: 5  },
    { id: 'corsair_black',  label: 'Corsair Black',  image: null,                   emoji: '🚢', rarity: 'epic',      weight: 5,  shipSkinId: 'corsair_black' },
    { id: 'corsair_cannon', label: 'Corsair Cannon', image: '/corsaircannon.png',   emoji: '💣', rarity: 'legendary', weight: 3  },
  ],
  killRewards: {
    brute:   { gold: 20,  xp: 20  },
    sniper:  { gold: 25,  xp: 30  },
    corsair: { gold: 35,  xp: 45  },
    pete:    { gold: 180, xp: 180 },
  },
}
