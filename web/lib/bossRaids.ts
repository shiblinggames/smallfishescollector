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

/** Pre-fight dialogue line. Shown in an RPG-style modal before the boss
 *  battle begins. `narrator` lines render without a portrait; `boss` and
 *  `player` lines render with the speaker's portrait/avatar. */
export interface BossDialogueLine {
  speaker: 'boss' | 'player' | 'narrator'
  text: string
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
  /** Optional dialogue sequence shown right before the boss fight starts.
   *  Tap to advance each line; the last line's button is "Engage" which
   *  closes the modal and mounts the combat. */
  preFightDialogue?: BossDialogueLine[]
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
    // Patterns punish a reload-fire-reload-fire autopilot (player fires on
    // even turns, reloads on odd). Difficulty rises with enemy tier; the
    // punishment lands in the FIRST few turns of each cycle so it still
    // matters in short mob fights.
    brute: {
      id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
      shipSpeed: 4, actionMs: 4500,
      // 4-turn loop. Pure trade — no surprises, no punishment turns.
      // Brutes are the cannon fodder of the raid; the player can mash
      // reload-fire and win. Difficulty starts at the next enemy.
      // Charges: 0→1→0→1→0
      pattern: ['reload', 'fire', 'reload', 'fire'],
      critChance: 0.025,
      image: '/enemytier1.png',
      portrait: ENEMY_IMG_BASE + 'reefraider.png',
    },
    sniper: {
      id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
      shipSpeed: 3, actionMs: 5500,
      // 7-turn loop with TWO early punish turns:
      //   T2 dodge   → wastes the player's first charged shot
      //   T3 fire    → enemy hits while player reloads (free damage)
      // Then 3 reloads telegraph the closer volley on T7.
      // Charges: 0→1→1→0→1→2→3→0
      pattern: ['reload', 'dodge', 'fire', 'reload', 'reload', 'reload', 'volley'],
      critChance: 0.10,
      image: '/enemytier1scout.png',
      portrait: ENEMY_IMG_BASE + 'crowsnestmarksman.png',
    },
    corsair: {
      id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
      shipSpeed: 7, actionMs: 3500,
      // 9-turn loop. Punishes start at T4:
      //   T2 mutual fire trade (corsair is the only mob that opens with one)
      //   T4 dodge → wastes player's 2nd fire
      //   T7 volley while player reloads → big free hit
      //   T9 fire while player reloads → free hit
      // Fastest ship in the raid (speed 7) — wins speed rolls more often
      // so its dodges + volleys land before the player's reply.
      // Charges: 0→1→0→1→1→2→3→0→1→0
      pattern: ['reload', 'fire', 'reload', 'dodge', 'reload', 'reload', 'volley', 'reload', 'fire'],
      critChance: 0.05,
      image: '/enemytier1elite.png',
      portrait: ENEMY_IMG_BASE + 'saltwatercorsair.png',
    },
    pete: {
      id: 'pete', name: 'Barnacle Pete', hpBase: 55, minDmg: 8, maxDmg: 15,
      shipSpeed: 6, actionMs: 4500,
      // 13-turn loop, boss-grade threat. Brutal opener: three reload-dodge
      // pairs in a row (T2, T4, T6) all land on the player's autopilot
      // fire turns — three wasted shots if the player doesn't break
      // rhythm. Then a volley T7 while player reloads (free 2× hit).
      // Second half: another fire T9 while reloading, then a closing
      // volley T13.
      //   T2 dodge → wasted shot
      //   T4 dodge → wasted shot
      //   T6 dodge → wasted shot
      //   T7 VOLLEY → free 2× hit
      //   T9 fire   → free hit
      //   T13 VOLLEY → free 2× hit
      // Six punish turns per cycle. 8–15 × 2 × 1.5 crit = up to 45-dmg
      // single shots; the only safe play is reading the pattern and
      // defending (or breaking rhythm with extra reloads).
      // Charges: 0→1→1→2→2→3→3→0→1→0→1→2→3→0
      pattern: ['reload', 'dodge', 'reload', 'dodge', 'reload', 'dodge', 'volley', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley'],
      critChance: 0.075,
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
  preFightDialogue: [
    { speaker: 'narrator', text: "A weathered galleon emerges from the fog — barnacle-crusted hull, patched sails, cannons already trained on your ship." },
    { speaker: 'boss', text: "So another pup thinks they can take old Barnacle Pete. Many've tried, captain. None've sailed home." },
    { speaker: 'boss', text: "I've been raiding these waters since before your grandfather wet his trousers in his first storm. Your crew, your ship, your name — they'll all join the others at the bottom." },
    { speaker: 'player', text: "Save your breath, Pete. I'm not here to talk. I'm here for the plunder." },
    { speaker: 'boss', text: "Plunder?! Hah! The only thing you'll take from me is a swift trip to Davy Jones." },
    { speaker: 'boss', text: "Ready your guns. This is where your story ends." },
  ],
}
