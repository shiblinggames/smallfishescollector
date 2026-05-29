export const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

// 'repair' is a player-only action (consumes a turn to use a repair kit).
// Enemy `pattern` arrays never include it and `pickEnemyAction` never
// returns it — it lives in this union only so the same action type
// flows through resolveTurn for both sides.
export type EnemyAction = 'reload' | 'fire' | 'volley' | 'dodge' | 'repair'

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
  /** Themed raid ability (optional). Each raid gives its crew one signature
   *  trait. `damageReduction` is flat mitigation (0–1) soaked off every
   *  incoming player hit; `abilityName` labels it on the enemy nameplate.
   *  Krust's crew = crustacean "Carapace" defense. */
  damageReduction?: number
  abilityName?: string
  /** Reckon's raid — "Mist Veil." A drifting fog band overlaid on the
   *  player's aim bar during lock-in, partially obscuring the gold
   *  Critical center. `aimFogDensity` is the band's opacity (0 = none,
   *  ~0.4 = thin/scout-tier, ~0.7 = deep/Reckon-tier). `aimFogName`
   *  labels it on the enemy nameplate (mirrors `abilityName`). The fog
   *  is always-on while this enemy is the active target — symmetrical
   *  with Krust's Carapace cadence (every player aim is affected).
   *  Render lives in RaidCombat's AimBarInline; both fields undefined
   *  on every non-Reckon-raid enemy means zero rendering cost. */
  aimFogDensity?: number
  aimFogName?: string
  /** Optional two-phase boss config. The phase 2 trigger is a "false
   *  defeat" — the boss appears to sink, then rises back at `revivePct`
   *  of their max HP with the alternate pattern, damage mult, and (if
   *  set) chance-gated mitigation. The transition lands a quoted
   *  dialogue line in the action log, a red screen wash, and a big
   *  center-screen "PHASE 2" callout so the moment reads as a real
   *  beat. While in phase 2 the nameplate + ship sprite paint with a
   *  persistent crimson treatment so the player can never lose track
   *  of which phase they're in. Bosses without phase2 set fight as a
   *  single phase. */
  phase2?: {
    /** Fraction of max HP the boss returns with after the false defeat
     *  (e.g. 0.5 = comes back at 50% of `hpBase`). Floored to at least 1. */
    revivePct: number
    damageMult: number        // 1.25 = +25% damage on enemy fire/volley rolls
    pattern: EnemyAction[]    // alternate behavior cycle used from phase 2 onward
    dialogueLine: string      // shown in the action log on transition, as a quoted boss line
    // Optional chance-gated incoming-damage mitigation while in phase 2.
    // Mirrors the Ironclad affix shape so the combat code can fold both
    // into the same check style: when the chance roll succeeds, dmg is
    // multiplied by `damageTakenMult` (e.g. 0.7 for -30%) and a log line
    // surfaces. `damageTakenVolleyBypass` skips the roll entirely on
    // volley shots so the player always has a clean answer to a
    // hunkered boss. Stacks on top of any flat `damageReduction`.
    damageTakenChance?: number
    damageTakenMult?: number
    damageTakenVolleyBypass?: boolean
  }
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
  /** Optional mid-raid Tide events (see lib/tides.ts). `slots` lists
   *  the encounter indices AFTER which a tide fires (e.g. [3, 6] fires
   *  one tide after the 3rd kill and another after the 6th).
   *  `maxTier` caps the eligible pool — Reckon's raid will likely be
   *  the first with `maxTier: 1`; later, longer raids bump this to
   *  unlock stronger effects from the same pool. Undefined = no tides
   *  for this raid (Pete + Krust stay untouched). */
  tides?: {
    slots: number[]
    maxTier: 1 | 2 | 3 | 4
  }
}

// The one true gem look: the purple ◆ glyph from the Nav currency display.
// Use these everywhere gems are shown (loot, drops, references) instead of a
// 💎 emoji so the gem icon never drifts. Doubloons stay the gold ⟡.
export const GEM_GLYPH = '◆'
export const GEM_COLOR = '#a78bfa'

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
  // Weights total 100 for clean percentage reads. Normal raid drops
  // both Corsair Cannons (the weak +10% Epic and the Prime +20%
  // Legendary), with the Legendary at the chase rate. Challenge
  // variant doubles every special-drop rate (overridden in
  // raidChallenge.ts), not auto-scaled, so the percentages land
  // exactly where designed instead of inflating denominator drift.
  loot: [
    // 70% currency
    { id: 'doubloons_300',        label: '+300 ⟡',                 image: '/smallpile.png',         emoji: '🪙',       rarity: 'common',    weight: 30 },
    { id: 'doubloons_600',        label: '+600 ⟡',                 image: '/dailybonus.png',        emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_25',              label: '25 Gems',                 image: null,                     emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack',                 label: '100 Gems',                image: null,                     emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // 30% special drops
    { id: 'corsair_black',        label: 'Corsair Black',           image: null,                     emoji: '🚢',       rarity: 'epic',      weight: 5,  shipSkinId: 'corsair_black' },
    { id: 'corsair_cannon',       label: 'Corsair Cannon',          image: '/corsaircannon-v2.png',     emoji: '💣',       rarity: 'epic',      weight: 20 },
    { id: 'corsair_prime_cannon', label: "Corsair's Prime Cannon",  image: '/corsairsprimecannon.png',emoji: '💣',       rarity: 'legendary', weight: 5  },
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

export const CAPTAIN_KRUST: BossRaidConfig = {
  raidId: 'captain_krust',
  raidTitle: "Krust's Consignment",
  bossDefeatedText: 'Captain Krust Defeated',
  enemies: {
    // Tier-2 roster. Stiffer than Pete's reef: a Finndicate shipping
    // crew that runs cargo on a schedule and does not like being late.
    // 8-fight gauntlet (2 of each) escalating into Krust himself.
    //
    // RAID-WIDE RULE: NO ONE IN THIS RAID EVER VOLLEYS. They plate up
    // behind the Carapace, take a methodical reload-and-trade rhythm,
    // and just keep firing. The player's volley is the answer (it
    // punches through Carapace — see the volley bypass in RaidCombat),
    // so the whole raid is "stack 3 charges, blow open the plate."
    // Per-enemy patterns vary the cadence + dodge density so each
    // tier still has its own read.
    scout: {
      id: 'scout', name: 'Bilge Runner', hpBase: 40, minDmg: 4, maxDmg: 8,
      shipSpeed: 5, actionMs: 4200,
      // Cannon fodder of the consignment crew. Pure trade, no tricks —
      // the player can mash reload-fire and win. Difficulty starts next.
      // Charges: 0→1→0→1→0
      pattern: ['reload', 'fire', 'reload', 'fire'],
      critChance: 0.03,
      image: '/enemytier2scout.png',
      portrait: '/krust_worker.jpeg',
      damageReduction: 0.15, abilityName: 'Carapace',
    },
    reg: {
      id: 'reg', name: 'Brine Deckhand', hpBase: 52, minDmg: 5, maxDmg: 11,
      shipSpeed: 5, actionMs: 4600,
      // 6-turn loop. Adds one mid-cycle dodge to the basic trade so the
      // player can't pure-autopilot anymore.
      //   T4 dodge → wastes the player's second charged shot
      // Charges: 0→1→0→1→1→2→1
      pattern: ['reload', 'fire', 'reload', 'dodge', 'reload', 'fire'],
      critChance: 0.06,
      image: '/enemytier2reg.png',
      portrait: '/krust_soldier.jpeg',
      damageReduction: 0.15, abilityName: 'Carapace',
    },
    brute: {
      id: 'brute', name: 'Hull Breaker', hpBase: 70, minDmg: 9, maxDmg: 14,
      shipSpeed: 4, actionMs: 5200,
      // Tanky and slow. Defensive wall — leads with a dodge to absorb
      // the opening shot, then steady fire with another dodge mid-loop.
      // Low speed loses most speed rolls; survives via plate + dodges.
      // Charges: 0→1→1→2→1→1→2→1
      pattern: ['reload', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'fire'],
      critChance: 0.05,
      image: '/enemytier2brute.png',
      portrait: '/krust_brute.jpeg',
      damageReduction: 0.15, abilityName: 'Carapace',
    },
    elite: {
      id: 'elite', name: 'Krust Overseer', hpBase: 64, minDmg: 6, maxDmg: 13,
      shipSpeed: 9, actionMs: 3400,
      // Fastest ship in the run (speed 9) — wins most speed rolls, so
      // its fires and dodges resolve before the player's reply. 8-turn
      // aggressive trader: three fires per loop, two dodges. The "real
      // test before the boss" pressure now comes from raw cadence, not
      // a big volley callback.
      // Charges: 0→1→0→1→0→0→1→0→0
      pattern: ['reload', 'fire', 'reload', 'fire', 'dodge', 'reload', 'fire', 'dodge'],
      critChance: 0.10,
      image: '/enemytier2elite.png',
      portrait: '/krust_overseer.jpeg',
      damageReduction: 0.15, abilityName: 'Carapace',
    },
    krust: {
      id: 'krust', name: 'Captain Krust', hpBase: 110, minDmg: 12, maxDmg: 22,
      shipSpeed: 7, actionMs: 4200,
      // 8-turn boss loop. Krust's signature: always saves up two
      // reloads, then either fires or dodges. Methodical, plate-and-
      // trade. Never volleys (the whole crew doesn't — see raid-wide
      // rule above), so his offense is one big-base shot every fourth
      // turn (12-22 × 1.5 crit tops near 33-damage singles).
      //   T1-T2 reload, T3 fire, T4 dodge, T5-T6 reload, T7 fire, T8 dodge
      // Charges: 0→1→2→1→1→2→3→2→2
      pattern: ['reload', 'reload', 'fire', 'dodge', 'reload', 'reload', 'fire', 'dodge'],
      critChance: 0.09,
      image: '/enemytier2boss.png',
      portrait: '/Captainkrust.jpeg',
      damageReduction: 0.20, abilityName: 'Carapace',
    },
  },
  sequence: ['scout', 'scout', 'reg', 'reg', 'brute', 'brute', 'elite', 'elite'],
  bossId: 'krust',
  // Mirror Pete's two-tier structure. Krust's Carapace is the
  // standard plate (Epic, -10%); Captain's Carapace is Krust's own
  // full-grade armour (Legendary, -15%). Same 30% special-drop /
  // 70% currency split as Pete; challenge variant overrides this
  // table with doubled special rates in raidChallenge.ts.
  loot: [
    // 70% currency
    { id: 'doubloons_600',     label: '+600 ⟡',                image: '/smallpile.png',          emoji: '🪙',       rarity: 'common',    weight: 30 },
    { id: 'doubloons_1200',    label: '+1,200 ⟡',              image: '/dailybonus.png',         emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',           label: '50 Gems',                image: null,                      emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack_2',            label: '200 Gems',               image: null,                      emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // 30% special drops
    { id: 'verdigris_hull',    label: 'Verdigris Hull',         image: null,                      emoji: '🚢',       rarity: 'epic',      weight: 5,  shipSkinId: 'verdigris_hull' },
    { id: 'krusts_carapace',   label: "Krust's Carapace",       image: '/captainshull.png',       emoji: '🛡️',      rarity: 'epic',      weight: 20 },
    { id: 'captains_carapace', label: "Captain's Carapace",     image: '/captainscarapace.png',   emoji: '🛡️',      rarity: 'legendary', weight: 5  },
  ],
  killRewards: {
    scout: { gold: 40,  xp: 40  },
    reg:   { gold: 55,  xp: 60  },
    brute: { gold: 75,  xp: 80  },
    elite: { gold: 90,  xp: 100 },
    krust: { gold: 350, xp: 350 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: "Past the Bilge Strait the water turns cold and the fog thins to a hard grey line. A long iron-sided carrack waits there, riding low under more cargo than any honest captain could explain. The wax on Pete's letter and the seal on her hull are the same." },
    { speaker: 'boss', text: "C.K. So you're the little hook that's been snagging my freight. I wondered who kept making my couriers late." },
    { speaker: 'player', text: "Captain Krust. Pete kept your letters but not his life. You run the Finndicate's cargo." },
    { speaker: 'boss', text: "I move what I'm told to move and I don't ask whose name is on the manifest. That's why I've lasted, and that's why men like Pete are fodder and men like me are not." },
    { speaker: 'boss', text: "But you've cost the Finndicate a season's haul, captain, and someone above me will want that back out of you. I'll just take it out first." },
    { speaker: 'boss', text: "Strike your colours or strike your guns. Either way this consignment sails on without you." },
  ],
}

// ── Raid completion bonus ────────────────────────────────────────────────────
// Clearing a full raid (every mob + the boss) pays a bonus on top of the
// per-kill Nav XP: 25% of the run's total kill XP. Granted once per clear in
// claimRaidLoot, and folded into the node sheet's headline XP so the preview
// matches what a full clear actually pays.
export const RAID_COMPLETION_XP_BONUS = 0.25

/** Sum of Nav XP from every kill in a full run (sequence mobs + boss). */
export function raidKillXpTotal(config: BossRaidConfig): number {
  let xp = 0
  for (const id of [...config.sequence, config.bossId]) xp += config.killRewards[id]?.xp ?? 0
  return xp
}

/** The full-clear bonus Nav XP (25% of the run's total kill XP). */
export function raidCompletionBonusXp(config: BossRaidConfig): number {
  return Math.round(raidKillXpTotal(config) * RAID_COMPLETION_XP_BONUS)
}
