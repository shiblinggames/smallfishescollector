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
    // Patterns explicitly punish a player on reload-fire-reload-fire
    // autopilot (firing on even turns, reloading on odd ones):
    //   - Enemy DODGE placed on a player-fire turn → player wastes a charged
    //     shot for nothing. The only way to avoid this is to skip a fire
    //     turn (reload twice, or defend instead).
    //   - Enemy FIRE / VOLLEY placed on a player-reload turn → player takes
    //     a hit they can't retaliate against. The only way to soak it
    //     without losing HP is to Defend on that turn.
    // Every cycle below has at least 2 punishment turns where autopilot
    // play has a direct cost.
    brute: {
      id: 'brute', name: 'Reef Raider', hpBase: 25, minDmg: 2, maxDmg: 5,
      shipSpeed: 4, actionMs: 4500,
      // 8-turn loop. Punishes turns 7 + 8: enemy volleys while player
      // reloads (can't retaliate), then dodges the next player fire.
      // Charges: 0→1→0→0→1→2→3→0→0
      pattern: ['reload', 'fire', 'dodge', 'reload', 'reload', 'reload', 'volley', 'dodge'],
      critChance: 0.025,
      image: '/enemytier1.png',
      portrait: ENEMY_IMG_BASE + 'reefraider.png',
    },
    sniper: {
      id: 'sniper', name: "Crow's Nest Marksman", hpBase: 30, minDmg: 2, maxDmg: 10,
      shipSpeed: 3, actionMs: 5500,
      // 10-turn loop. Three punish turns: T4 big volley while player fires
      // (mutual but enemy 2×), T7 enemy fires while player reloads (free
      // hit), T8 dodge while player fires (wasted shot).
      // Charges: 0→1→2→3→0→0→1→0→0→1→0
      pattern: ['reload', 'reload', 'reload', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'fire'],
      critChance: 0.10,
      image: '/enemytier1scout.png',
      portrait: ENEMY_IMG_BASE + 'crowsnestmarksman.png',
    },
    corsair: {
      id: 'corsair', name: 'Saltwater Corsair', hpBase: 38, minDmg: 6, maxDmg: 9,
      shipSpeed: 7, actionMs: 3500,
      // 10-turn loop. Three punish turns: T5 enemy fires while player
      // reloads, T6 dodges the player fire that follows, T10 closes with
      // a volley. Fastest ship in the raid (speed 7) so it wins speed
      // rolls more often, meaning dodges + volleys often land first.
      // Charges: 0→1→0→0→1→0→0→1→2→3→0
      pattern: ['reload', 'fire', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'reload', 'reload', 'volley'],
      critChance: 0.05,
      image: '/enemytier1elite.png',
      portrait: ENEMY_IMG_BASE + 'saltwatercorsair.png',
    },
    pete: {
      id: 'pete', name: 'Barnacle Pete', hpBase: 55, minDmg: 8, maxDmg: 15,
      shipSpeed: 6, actionMs: 4500,
      // 13-turn loop, boss-grade threat. FOUR punish turns: T4 + T12
      // double-volley, T7 free hit during player reload, T8 dodge wastes
      // player fire. 8–15 dmg × 2 (volley) × possible 1.5 crit = up to
      // 45-dmg single shots — a low-HP player not bracing is in real
      // trouble.
      // Charges: 0→1→2→3→0→0→1→0→0→1→2→3→0→0
      pattern: ['reload', 'reload', 'reload', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'reload', 'reload', 'volley', 'dodge'],
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
