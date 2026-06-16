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
  /** Cannonballs already chambered when this enemy becomes the active target —
   *  the raid-wide "First Cut" trait (Tollmaster Spet's barracuda crew open
   *  loaded, so they can fire on the opening bell). Default 0 (every other raid
   *  opens cold and must reload first). The boss opens with 2. */
  startCharges?: number
  image: string
  portrait?: string
  /** Themed raid ability (optional). Each raid gives its crew one signature
   *  trait. `damageReduction` is flat mitigation (0–1) soaked off every
   *  incoming player hit; `abilityName` labels it on the enemy nameplate.
   *  Krust's crew = crustacean "Carapace" defense. */
  damageReduction?: number
  abilityName?: string
  /** The Cartographer's raid — "Mist Veil." A drifting fog band
   *  overlaid on the player's aim bar during lock-in, partially
   *  obscuring the gold Critical center. `aimFogDensity` is the band's
   *  opacity (0 = none, ~0.4 = thin/scout-tier, ~0.7 = deep/boss-tier).
   *  `aimFogName` labels it on the enemy nameplate (mirrors
   *  `abilityName`). The fog is always-on while this enemy is the
   *  active target — symmetrical with Krust's Carapace cadence (every
   *  player aim is affected). Render lives in RaidCombat's
   *  AimBarInline; both fields undefined on every non-Cartographer-raid
   *  enemy means zero rendering cost. */
  aimFogDensity?: number
  aimFogName?: string
  /** The Cartographer's raid — "Riposte." When this enemy executes a
   *  `dodge` action and the player's same-turn action was offensive
   *  (`fire` or `volley`), `parryChance` (0-1) rolls. On success, the
   *  enemy rolls its damage normally (minDmg..maxDmg, no crit), then
   *  multiplies by `parryDamagePct` (0-1) and deals that to the
   *  player. `parryName` labels it on the enemy nameplate (mirrors
   *  `abilityName` / `aimFogName`). Unlike a normal enemy fire, the
   *  parry counter does not consume a charge — it's a free reflection
   *  off the dodge. All three fields undefined on every non-Cartographer
   *  enemy means zero rendering + zero engine cost. */
  parryChance?: number
  parryDamagePct?: number
  parryName?: string
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
  /** Battle-stage atmosphere. Each raid gets its own backdrop palette so
   *  fights read as different places, not the same dusk seascape repeated.
   *  Undefined falls back to 'dusk' (the original look) so any pre-existing
   *  raid stays visually unchanged unless it opts in.
   *    - dusk     : default warm seascape (cool blue sky, warm sun, drifting clouds)
   *    - sunset   : Pete's coastal reef at golden hour (saturated orange + purple)
   *    - overcast : Krust's open ocean past the Bilge Strait (cold steel-grey, thick clouds, no sun)
   *    - fog      : The Cartographer's Sounding Fog (washed-out grey, dim sun, drifting mist bands) */
  atmosphere?: 'dusk' | 'sunset' | 'overcast' | 'fog'
  /** Optional dialogue sequence shown right before the boss fight starts.
   *  Tap to advance each line; the last line's button is "Engage" which
   *  closes the modal and mounts the combat. */
  preFightDialogue?: BossDialogueLine[]
  /** Optional mid-raid Tide events (see lib/tides.ts). `slots` lists
   *  the encounter indices AFTER which a tide fires (e.g. [3, 6] fires
   *  one tide after the 3rd kill and another after the 6th).
   *  `maxTier` caps the eligible pool — The Cartographer's raid is
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
  atmosphere: 'sunset',
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
      image: '/enemychapter1rowboat_v2.png',
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
      image: '/enemychapter1dinghy_v2.png',
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
      image: '/enemychapter1sloop_v2.png',
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
      image: '/enemychapter1schooner_v2.png',
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
    { id: 'doubloons_300',        label: '+300 ⟡',                 image: '/smallpile.png',         emoji: '🪙',       rarity: 'common',    weight: 32 },
    { id: 'doubloons_600',        label: '+600 ⟡',                 image: '/dailybonus.png',        emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_25',              label: '25 Gems',                 image: null,                     emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack',                 label: '100 Gems',                image: null,                     emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // 30% special drops. Finndicate Hull is the chapter-1 shared trophy
    // skin (also drops from Krust at a higher rate).
    { id: 'finndicate_hull',      label: 'Finndicate Hull',         image: null,                     emoji: '🚢',       rarity: 'epic',      weight: 3,  shipSkinId: 'finndicate_hull' },
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
    { speaker: 'narrator', text: "A weathered galleon slides out of the fog. Barnacle-crusted hull, patched sails, cannons already trained on your ship." },
    { speaker: 'boss', text: "So another pup thinks they can take old Barnacle Pete. Many've tried, captain. None've sailed home." },
    { speaker: 'boss', text: "I've been raiding these waters since before your grandfather wet his trousers in his first storm. Your crew, your ship, your name, they'll all join the others at the bottom." },
    { speaker: 'player', text: "Save your breath, Pete. I'm not here to talk. I'm here for the plunder." },
    { speaker: 'boss', text: "Plunder?! Hah! The only thing you'll take from me is a swift trip to Davy Jones." },
    { speaker: 'boss', text: "Ready your guns. This is where your story ends." },
  ],
}

export const CAPTAIN_KRUST: BossRaidConfig = {
  raidId: 'captain_krust',
  raidTitle: "Krust's Consignment",
  bossDefeatedText: 'Captain Krust Defeated',
  atmosphere: 'overcast',
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
      image: '/enemychapter1sloop_v2.png',
      portrait: '/krust_worker.png',
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
      image: '/enemychapter1sloop_v2.png',
      portrait: '/krust_soldier.png',
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
      image: '/enemychapter1schooner_v2.png',
      portrait: '/krust_brute.png',
      damageReduction: 0.15, abilityName: 'Carapace',
    },
    elite: {
      id: 'elite', name: 'Krust Overseer', hpBase: 64, minDmg: 6, maxDmg: 13,
      shipSpeed: 6, actionMs: 3400,
      // 8-turn aggressive trader: three fires per loop, two dodges.
      // Pressure comes from the rotation — high fire rate + the
      // Carapace soak — not from raw speed-roll dominance. Was speed
      // 9 (fastest in the run) but that combined with d20 + the prior
      // 0.25 Compass coefficient meant the Overseer outpaced almost
      // every player; dropped to 6 (parity with Pete) so the test feels
      // like cadence-management, not first-strike denial.
      // Charges: 0→1→0→1→0→0→1→0→0
      pattern: ['reload', 'fire', 'reload', 'fire', 'dodge', 'reload', 'fire', 'dodge'],
      critChance: 0.10,
      image: '/enemychapter1schooner_v2.png',
      portrait: '/krust_overseer.png',
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
      image: '/enemychapter1brigantine_v2.png',
      portrait: '/Captainkrust.png',
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
    { id: 'doubloons_600',     label: '+600 ⟡',                image: '/smallpile.png',          emoji: '🪙',       rarity: 'common',    weight: 28 },
    { id: 'doubloons_1200',    label: '+1,200 ⟡',              image: '/dailybonus.png',         emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',           label: '50 Gems',                image: null,                      emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack_2',            label: '200 Gems',               image: null,                      emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // 30% special drops. Finndicate Hull is the shared chapter-1
    // trophy skin and stays at the same 3% as Pete drops it; the
    // 4 weight points freed up move into Krust's Carapace, which keeps
    // the 70/30 currency/special split intact. Challenge variant
    // doubles the hull rate to 6% in raidChallenge.ts.
    { id: 'finndicate_hull',   label: 'Finndicate Hull',        image: null,                      emoji: '🚢',       rarity: 'epic',      weight: 3,  shipSkinId: 'finndicate_hull' },
    { id: 'krusts_carapace',   label: "Krust's Carapace",       image: '/captainshull.png',       emoji: '🛡️',      rarity: 'epic',      weight: 24 },
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
    { speaker: 'narrator', text: "Past the Bilge Strait the water turns cold and the fog thins to a hard grey line. A long iron-sided carrack waits there, riding low under more cargo than any honest captain could explain. The wax on Pete's letter and the seal on her hull match." },
    { speaker: 'boss', text: "C.K. So you're the little hook that's been snagging my freight. I wondered who kept making my couriers late." },
    { speaker: 'player', text: "Captain Krust. Pete kept your letters but not his life. You run the Finndicate's cargo." },
    { speaker: 'boss', text: "I move what I'm told to move and I don't ask whose name is on the manifest. That's why I've lasted, and that's why captains like Pete are fodder and captains like me aren't." },
    { speaker: 'boss', text: "But you've cost the Finndicate a season's haul, captain, and someone above me will want that back out of you. I'll just take it out first." },
    { speaker: 'boss', text: "Strike your colours or strike your guns. Either way this consignment sails on without you." },
  ],
}

export const THE_CARTOGRAPHER: BossRaidConfig = {
  raidId: 'cartographer',
  raidTitle: "The Cartographer's Survey",
  bossDefeatedText: 'The Cartographer Defeated',
  atmosphere: 'fog',
  enemies: {
    // Tier-3 roster. The Cartographer's chart line sails the Sounding
    // Fog for cover — the deep grey band on the Finndicate's own maps.
    // 8-fight gauntlet (2 of each) escalating into the boss himself.
    //
    // RAID-WIDE RULE: every enemy in this raid carries MIST VEIL — a
    // drifting fog band drawn over the player's aim bar during lock-in,
    // partially hiding the Critical center. Density climbs through the
    // tiers (0.35 scout → 0.70 boss) so the gauntlet visibly thickens.
    // Krust's crew identity was no-volleys + Carapace plating; this
    // crew is the inverse — no plating, but they volley readily, and
    // the fog makes every player aim a real read instead of a flick.
    // The Cartographer himself layers a unique Riposte on top — a
    // chance to counter-hit off any of his dodges.
    // Tides also debut in this raid (slots [3, 6]), adding the
    // between-fight boon/debuff choice that future longer raids will
    // lean into harder.
    scout: {
      id: 'scout', name: 'Drift Scout', hpBase: 48, minDmg: 5, maxDmg: 10,
      shipSpeed: 7, actionMs: 4000,
      // Light cutter ranging ahead of the chart line. Pure trade — no
      // tricks, no dodges — so the player's first taste of Mist Veil
      // lands without other variables in the way. Faster than Krust's
      // scout (5 → 7) so even a clean read still risks losing the
      // speed roll on the first turn. Fog density 0.40 here is the
      // floor for this raid — every fight reads the fog.
      // Charges: 0→1→0→1→0
      pattern: ['reload', 'fire', 'reload', 'fire'],
      critChance: 0.05,
      image: '/enemychapter2sloop_v2.png',
      portrait: ENEMY_IMG_BASE + 'driftscout.png',
      aimFogDensity: 0.40, aimFogName: 'Mist Veil',
    },
    reg: {
      id: 'reg', name: 'Sounding Hand', hpBase: 66, minDmg: 7, maxDmg: 13,
      shipSpeed: 5, actionMs: 4600,
      // 6-turn loop. Workhorse of the chart line, and the player's
      // FIRST introduction to the guaranteed-hit mechanic — fires a
      // single shot on T4, then volleys on T5 while the player is
      // dodge-gated from the T4 defense (one-dodge-at-a-time rule in
      // RaidCombat). The fire-volley shape is distinct from the
      // Surveyor/Cartographer fire-fire shape later — same lesson, two
      // teaches, so the player learns variations of "you cannot
      // perfectly defend everything" without monotony.
      //   T1-T3 triple-reload telegraph (the punch is loaded)
      //   T4 fire   → dodge-able opening shot
      //   T5 VOLLEY → GUARANTEED 2× hit if T4 was dodged
      //   T6 dodge  → eats the player's reply
      // Charges: 0→1→2→3→2→0→0
      pattern: ['reload', 'reload', 'reload', 'fire', 'volley', 'dodge'],
      critChance: 0.07,
      image: '/enemychapter2schooner_v2.png',
      portrait: ENEMY_IMG_BASE + 'soundinghand.png',
      aimFogDensity: 0.45, aimFogName: 'Mist Veil',
    },
    brute: {
      id: 'brute', name: 'Wakebreaker', hpBase: 96, minDmg: 10, maxDmg: 17,
      shipSpeed: 3, actionMs: 5400,
      // 7-turn loop. Slowest hull in the raid (drags an iron chain
      // through its own wake so trailing ships can't read the line).
      // Front-loaded: opens with a charged volley off two reloads
      // before settling into a defensive trade.
      //   T3 VOLLEY → 2× hit straight off the opener
      //   T4 dodge  → wastes player's first reply
      //   T6 fire   → second hit
      //   T7 dodge  → wastes player's second reply
      // Speed 3 means it almost always shoots after the player; the
      // pressure is the cadence + Mist Veil at the lock, not first-strike.
      // Charges: 0→1→2→0→0→1→0→0
      pattern: ['reload', 'reload', 'volley', 'dodge', 'reload', 'fire', 'dodge'],
      critChance: 0.06,
      image: '/enemychapter2schooner_v2.png',
      portrait: ENEMY_IMG_BASE + 'wakebreaker.png',
      aimFogDensity: 0.45, aimFogName: 'Mist Veil',
    },
    elite: {
      id: 'elite', name: 'The Surveyor', hpBase: 84, minDmg: 8, maxDmg: 16,
      shipSpeed: 8, actionMs: 3400,
      // 8-turn aggressive trader. The fastest ship the player has met
      // in any raid (post-d30): wins first strike a clear majority of
      // turns and carries a charged volley mid-loop. The fog jumps to
      // 0.55 here too — half a tier above the rest of the crew — so
      // the "real test before the boss" is a triple-threat of speed,
      // cadence, and a meaningfully harder aim read. He is also the
      // FIRST enemy in the game to fire on consecutive turns: the
      // T3-T4 double-tap forces a guaranteed hit. Player can dodge T3
      // OR T4 but not both (RaidCombat's one-dodge-at-a-time rule —
      // `canDodge = lastPlayerAction !== 'dodge'`), so one shot in the
      // double-tap ALWAYS lands. Trade or take it; you can't fully avoid it.
      //   T3 fire   → opens with a charged shot off 2 reloads
      //   T4 fire   → IMMEDIATE second shot, guaranteed hit (dodge gated)
      //   T7 VOLLEY → 2× hit off a fresh 2-reload tell
      //   T8 dodge  → eats player's reply
      // Charges: 0→1→2→1→0→1→2→0→0
      pattern: ['reload', 'reload', 'fire', 'fire', 'reload', 'reload', 'volley', 'dodge'],
      critChance: 0.11,
      image: '/enemychapter2brigantine_v2.png',
      portrait: ENEMY_IMG_BASE + 'thesurveyor.png',
      aimFogDensity: 0.55, aimFogName: 'Mist Veil',
    },
    cartographer: {
      id: 'cartographer', name: 'The Cartographer', hpBase: 150, minDmg: 14, maxDmg: 26,
      shipSpeed: 6, actionMs: 4400,
      // 8-turn boss loop. Signature shape: triple-reload telegraph →
      // DOUBLE-TAP fires → reload → volley → dodge. Methodical speed
      // (6) leaves Mist Veil (0.70 — the deep band) as his soft edge,
      // and the back-to-back T4-T5 fires as his hard one. Player sees
      // three reloads stack and knows the punch is coming, but the
      // one-dodge-at-a-time rule guarantees one of T4/T5 lands no
      // matter how they play it. Add the T7 volley off a 2-reload
      // tell and the loop puts 3 guaranteed-bite turns into every 8.
      //
      // Layered on top: RIPOSTE. When the T8 dodge lands against a
      // player attack (fire or volley), 30% chance to counter for
      // 25% of his damage roll. Means even his defensive turn carries
      // threat — the player can't safely fire into his dodge.
      //   T1-T3 reload triple-stack telegraph
      //   T4 fire   → first of the double-tap (dodge-able)
      //   T5 fire   → second, GUARANTEED hit if T4 was dodged
      //   T7 VOLLEY → 2× hit off a follow-up 2-reload tell
      //   T8 dodge  → eats reply + 30% Riposte counter
      // Charges: 0→1→2→3→2→1→2→0→0
      pattern: ['reload', 'reload', 'reload', 'fire', 'fire', 'reload', 'volley', 'dodge'],
      critChance: 0.10,
      image: '/enemychapter2brigantine_v2.png',
      portrait: ENEMY_IMG_BASE + 'thecartographer.png',
      aimFogDensity: 0.70, aimFogName: 'Mist Veil',
      parryChance: 0.30, parryDamagePct: 0.25, parryName: 'Riposte',
    },
  },
  // Interleaved sequence — no back-to-back duplicates, every type met
  // by fight 5, low-tier scouts seeded between heavier fights as
  // breathers. Reads as a chartmaker's planned interception rather
  // than the standard 2-of-each block escalation:
  //   1 scout  → recon vanguard
  //   2 reg    → line scout makes contact
  //   3 scout  → second vanguard (recon phase closes here — tide 1)
  //   4 brute  → heavy hull crashes the line
  //   5 elite  → Surveyor darts in to verify the kill
  //   6 reg    → workhorse closes the net behind him (tide 2)
  //   7 brute  → second heavy as the net tightens
  //   8 elite  → final test, the Cartographer's right hand
  //   9 boss   → The Cartographer
  sequence: ['scout', 'reg', 'scout', 'brute', 'elite', 'reg', 'brute', 'elite'],
  bossId: 'cartographer',
  // Tides fire after the 3rd and 6th kills — one at the close of the
  // recon phase (the 2 scouts + 1 reg "feeler" group), one mid-way
  // through the closing net (after the Surveyor's first appearance
  // and the second workhorse goes down). maxTier 1 keeps the eligible
  // pool to the foundational eight effects in lib/tides.ts. Future
  // longer raids bump this cap to unlock the stronger tier-2+ effects.
  tides: { slots: [3, 6], maxTier: 1 },
  // Same 70/30 currency/special split as Pete + Krust. The Astrolabe
  // pair are the chase items — mirror the Carapace pair from Krust
  // (Epic at the standard rate, Legendary at the chase rate).
  // Chartmaker Hull is the chapter-2 shared trophy skin (lower rate
  // here; raid 4 will drop it at the realistic chase rate when it
  // lands), carved out of the slot the astrolabe held in reserve.
  loot: [
    // 70% currency
    { id: 'doubloons_600',          label: '+600 ⟡',                  image: '/smallpile.png',          emoji: '🪙',       rarity: 'common',    weight: 30 },
    { id: 'doubloons_1200',         label: '+1,200 ⟡',                image: '/dailybonus.png',         emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',                label: '50 Gems',                  image: null,                      emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack_2',                 label: '200 Gems',                 image: null,                      emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // 30% special drops
    { id: 'chartmaker_hull',         label: 'Chartmaker Hull',          image: null,                          emoji: '🚢',       rarity: 'epic',      weight: 5,  shipSkinId: 'chartmaker_hull' },
    { id: 'cartographers_astrolabe', label: "Cartographer's Astrolabe", image: '/cartographersastrolabe.png', emoji: '🧭',       rarity: 'epic',      weight: 20 },
    { id: 'captains_astrolabe',      label: 'Mastercraft Astrolabe',    image: '/mastercraftastrolabe.png',   emoji: '🧭',       rarity: 'legendary', weight: 5  },
  ],
  killRewards: {
    scout:        { gold: 50,  xp: 50  },
    reg:          { gold: 70,  xp: 75  },
    brute:        { gold: 95,  xp: 105 },
    elite:        { gold: 120, xp: 130 },
    cartographer: { gold: 450, xp: 450 },
  },
  // TODO: tune voice + length pass with the user. Six lines mirroring
  // Krust's structure: narrator scene-set → boss intro → player name him
  // → boss thesis line → boss "I've already mapped you" beat → engage.
  preFightDialogue: [
    { speaker: 'narrator', text: "The fog thickens until sea and sky blur into one grey wall. Out of it a slow-built galleon glides up, decks stacked with rolled charts and brass-bound sextants. No flags fly. No name painted on the hull." },
    { speaker: 'boss', text: "I heard a young captain was reading my routes. I came up the line to see what kind of eyes were behind it." },
    { speaker: 'player', text: "You're the Cartographer. The Finndicate's chartmaker. Krust said his couriers followed your lines." },
    { speaker: 'boss', text: "Names belong to ships. I draw seas. Krust ran cargo, and you put him at the bottom of one of my channels. Now you're on a page of mine too." },
    { speaker: 'boss', text: "Every water you've crossed since Driftwood is marked in the cabin behind me. I knew the shape of your wake before you knew the shape of your hold." },
    { speaker: 'boss', text: "Lock your gunports if you've any sense. Or don't, and let this fog have you the way it had the others." },
  ],
}

export const THE_TOLLMASTER: BossRaidConfig = {
  raidId: 'tollmasters_cut',
  raidTitle: "The Tollmaster's Cut",
  bossDefeatedText: 'Tollmaster Spet Defeated',
  atmosphere: 'overcast',
  enemies: {
    // Tier-4 roster, Chapter II's second raid (Nav 35). The Gullet's toll crew
    // are barracudas: fast, toothy, and ambush-built.
    //
    // RAID-WIDE RULE: "First Cut" — every hull OPENS LOADED (startCharges ≥ 1)
    // and its pattern leads with `fire`, so they shoot on the opening bell and
    // win the first exchange far more often than any prior raid (where everyone
    // opened cold and had to reload first). No plating, no fog, no parry — the
    // whole identity is "they hit you before you've loaded." The player answers
    // with Spet's own drop (Spet's Primer / Tollmaster's Hot Iron = start each
    // fight loaded yourself). Caps at the Brigantine art tier — Galleon +
    // Man-o-War are held for later chapters.
    scout: {
      id: 'scout', name: 'Silverdart', hpBase: 60, minDmg: 6, maxDmg: 12,
      shipSpeed: 8, actionMs: 3600,
      // Fast young barracuda. Opens loaded and fires turn 1, then trades
      // single shots. Pure first-strike skirmisher — no volley, no tricks.
      // Charges: 1→0→1→0
      pattern: ['fire', 'reload', 'fire', 'reload'],
      critChance: 0.06,
      startCharges: 1,
      image: '/enemychapter2sloop_v2.png',
      portrait: '/raid4_silverdart.png',
    },
    reg: {
      id: 'reg', name: 'Snapjaw', hpBase: 84, minDmg: 8, maxDmg: 15,
      shipSpeed: 6, actionMs: 4400,
      // Workhorse of the toll line. First Cut opener, then stacks to a real
      // volley. Charges: 1→0→1→2→3→volley(0)→dodge
      pattern: ['fire', 'reload', 'reload', 'reload', 'volley', 'dodge'],
      critChance: 0.08,
      startCharges: 1,
      image: '/enemychapter2schooner_v2.png',
      portrait: '/raid4_snapjaw.png',
    },
    brute: {
      id: 'brute', name: 'Gulletmaw', hpBase: 122, minDmg: 11, maxDmg: 19,
      shipSpeed: 3, actionMs: 5400,
      // Big, slow old barracuda that swallows hulls whole. Opens loaded, builds
      // to a heavy volley, trades from there. Speed 3 means it usually shoots
      // after the player despite First Cut — the opener is its one free hit.
      // Charges: 1→0→1→2→3→volley(0)→dodge→1→fire(0)
      pattern: ['fire', 'reload', 'reload', 'reload', 'volley', 'dodge', 'reload', 'fire'],
      critChance: 0.06,
      startCharges: 1,
      image: '/enemychapter2brigantine_v2.png',
      portrait: '/raid4_gulletmaw.png',
    },
    elite: {
      id: 'elite', name: 'The Exactor', hpBase: 106, minDmg: 10, maxDmg: 18,
      shipSpeed: 9, actionMs: 3200,
      // Spet's chief enforcer. The fastest hull in the raid: First Cut PLUS a
      // top speed roll means it opens with a near-guaranteed first hit, then
      // double-taps and closes with a volley. The real test before the boss.
      // Charges: 1→0→1→0→1→2→3→volley(0)→dodge (cycles)
      pattern: ['fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley', 'dodge'],
      critChance: 0.12,
      startCharges: 1,
      image: '/enemychapter2brigantine_v2.png',
      portrait: '/raid4_theexactor.png',
    },
    spet: {
      id: 'spet', name: 'Tollmaster Spet', hpBase: 185, minDmg: 15, maxDmg: 27,
      shipSpeed: 7, actionMs: 4200,
      // The collector himself. His First Cut is DOUBLED — opens with TWO
      // cannonballs chambered, so he fires on the bell AND again the next turn
      // before the player has loaded a reply. Then stacks to a volley and keeps
      // the pressure on. No second signature mechanic — the doubled opener +
      // the highest stats in the chapter are the fight.
      // Charges: 2→fire1→fire0→reload1→reload2→reload3→volley0→fire(reload-sub)
      pattern: ['fire', 'fire', 'reload', 'reload', 'reload', 'volley', 'reload', 'fire'],
      critChance: 0.11,
      startCharges: 2,
      image: '/enemychapter2brigantine_v2.png',
      portrait: '/raid4_tollmasterspet.png',
    },
  },
  // Same interleaved 8-fight gauntlet shape as the Cartographer (no back-to-back
  // duplicates, every type met by fight 5), into Spet at fight 9.
  sequence: ['scout', 'reg', 'scout', 'brute', 'elite', 'reg', 'brute', 'elite'],
  bossId: 'spet',
  // Tides after the 3rd + 6th kills, same as the Cartographer. maxTier 1 keeps
  // the foundational pool; bump later if the raid wants stronger swings.
  tides: { slots: [3, 6], maxTier: 1 },
  // 70/30 currency/special split, same as every prior raid. Spet's drop is the
  // First Cut pair (Spet's Primer epic at the standard rate, Tollmaster's Hot
  // Iron legendary at the chase rate). Chartmaker Hull (the chapter-2 trophy
  // skin) rides here at the realistic chase rate now — higher than the
  // Cartographer's reserve weight, since this is the chapter's second raid.
  loot: [
    // ~70% currency
    { id: 'doubloons_600',         label: '+600 ⟡',     image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',    weight: 30 },
    { id: 'doubloons_1200',        label: '+1,200 ⟡',   image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',               label: '50 Gems',    image: null,              emoji: GEM_GLYPH, rarity: 'rare',      weight: 15 },
    { id: 'pack_2',                label: '200 Gems',   image: null,              emoji: GEM_GLYPH, rarity: 'epic',      weight: 5  },
    // ~30% special drops
    { id: 'chartmaker_hull',       label: 'Chartmaker Hull',       image: null, emoji: '🚢',  rarity: 'epic',      weight: 9,  shipSkinId: 'chartmaker_hull' },
    { id: 'spets_primer',          label: "Spet's Primer",         image: null, emoji: '🧨',  rarity: 'epic',      weight: 20 },
    { id: 'tollmasters_hot_iron',  label: "Tollmaster's Hot Iron", image: null, emoji: '🧨',  rarity: 'legendary', weight: 5  },
  ],
  killRewards: {
    scout: { gold: 60,  xp: 60  },
    reg:   { gold: 85,  xp: 90  },
    brute: { gold: 115, xp: 125 },
    elite: { gold: 140, xp: 150 },
    spet:  { gold: 520, xp: 520 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: "The fog peels back and the Gullet opens its throat. Ranks of low barracuda hulls sit waiting, guns already run out, hot and loaded." },
    { speaker: 'boss', text: "You came a long way down my channel, captain. Everything that swims this deep pays the toll. Coin, cargo, hull, crew. I take my cut of all of it." },
    { speaker: 'player', text: "Tollmaster Spet. You're the one the whole Finndicate funnels its plunder to." },
    { speaker: 'boss', text: "I'm the one who counts it. Krust shipped it, the Cartographer charted it, and it all comes down my throat to be weighed. You sank two of mine. That's a debt." },
    { speaker: 'boss', text: "And out here, captain, I always collect first." },
    { speaker: 'boss', text: "Run out your guns if you've got the nerve. Mine already are. We fire on the bell." },
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
