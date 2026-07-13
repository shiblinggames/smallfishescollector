import type { AffixId } from './raidAffixes'

export const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

// 'repair' is a player-only action (consumes a turn to use a repair kit).
// Enemy `pattern` arrays never include it and `pickEnemyAction` never
// returns it — it lives in this union only so the same action type
// flows through resolveTurn for both sides.
// 'mega' is a PLAYER-only Man-o-War augment attack (a 4-charge super-volley).
// Enemy patterns / pickEnemyAction never produce it; it lives in the union so
// the same resolveTurn handles it for the player.
// 'special' (Ch4): the enemy casts its authored special ability this turn
// (BroadsideEnemy.special) — the crew-ability analog, applying a STATUS from
// the shared pipeline (lib/statuses) to the player or to itself, OR (raid 8)
// an AIM-BAR ATTACK that strikes the player's lock-in minigame instead of
// their hull. Slot it into the pattern like any other action; enemies without
// a `special` config treat the slot as a reload (see pickEnemyAction).
// 'ultimate' (raid 8): the enemy spends its ENTIRE full magazine on its
// authored signature attack (BroadsideEnemy.ultimate) — the enemy-side mirror
// of the player's Mega. The slot only fires at a FULL magazine (the pips glow
// as the tell); short of that it degrades to a reload and re-attempts, so the
// player can always see it building and answer it (burn the charges down,
// shield, or brace to dodge).
export type EnemyAction = 'reload' | 'fire' | 'volley' | 'dodge' | 'repair' | 'mega' | 'special' | 'ultimate'

/** Raid-8 aim-bar attacks — enemy specials that strike the PLAYER'S AIM BAR
 *  rather than their hull, for the player's next `aimPasses` lock-ins:
 *    decoys   — False-Colors decoy bands appear on every afflicted pass
 *               (locking a crimson fake duds the shot).
 *    hardened — the lock is PLATED: the first tap only cracks it (the bar
 *               keeps sweeping), the second tap lands the real judgment.
 *    squall   — the needle gusts: its sweep speed surges and dies mid-pass,
 *               so timing by rhythm alone fails. */
export type AimAttackId = 'decoys' | 'hardened' | 'squall'

/** Ch4 enemy special — one authored cast per enemy, slotted into its pattern.
 *  TWO shapes, exactly one per special:
 *   - STATUS cast: `status` (a lib/statuses id) + magnitude/turns/target —
 *     'player' = a debuff thrown at you, 'self' = a buff it gives itself.
 *   - AIM-BAR attack (raid 8): `aimAttack` + optional `aimPasses` (default 2)
 *     — afflicts the player's next N lock-ins instead of touching hull/stats.
 *  `line` is the log/telegraph sentence either way. */
export interface EnemySpecial {
  name: string
  status?: string
  magnitude?: number
  turns?: number
  target?: 'player' | 'self'
  /** Raid-8 aim-bar attack (see AimAttackId). When set, the status fields are ignored. */
  aimAttack?: AimAttackId
  /** How many of the player's aim passes the attack afflicts. Default 2. */
  aimPasses?: number
  line: string
}

/** Raid-8 enemy ULTIMATE — the signature attack an enemy unleashes by spending
 *  its ENTIRE full magazine (see the 'ultimate' action). `mult` scales a normal
 *  minDmg..maxDmg roll (a volley is ×2 for 3 balls; size ultimates ~×2.4–3 for
 *  4). Never crits — the number is authored, not swingy. Dodge rules match a
 *  normal shot, so brace-and-weave stays a real answer. */
export interface EnemyUltimate {
  name: string
  mult: number
  line: string
}

/** One boss phase transition (a "false defeat" → rise-again beat). Used by both
 *  `phase2` (single transition) and `phases[]` (multi-phase / final-boss style).
 *  The boss appears to sink, then rises at `revivePct` of max HP with the new
 *  pattern + damage mult + a quoted dialogue line, a red screen wash, and a big
 *  center-screen callout. In any phase past 1 the nameplate + hull paint crimson
 *  so the player can't lose track of the phase. */
export interface BossPhase {
  /** Fraction of max HP the boss returns with after the false defeat
   *  (e.g. 0.5 = comes back at 50% of `hpBase`). Floored to at least 1. */
  revivePct: number
  damageMult: number        // 1.25 = +25% damage on enemy fire/volley rolls this phase
  pattern: EnemyAction[]    // behavior cycle used while in this phase
  dialogueLine: string      // shown in the action log on transition, as a quoted boss line
  /** Optional center-screen callout label for the transition (e.g. 'RESERVE
   *  DECK'). Falls back to "PHASE N" when unset. */
  badge?: string
  /** Optional telegraphed mechanic check that ARMS the instant this phase
   *  begins (answer it with the right crew play or eat the consequence). */
  check?: BossMechanicCheck
  /** AEGIS (Hammerhead phase 3): the phase opens behind a wall that drinks
   *  EVERY shot whole (zero damage) until it breaks. A player Mega shatters
   *  it instantly (the intended discovery — hints stay oblique); without one
   *  it collapses after `hitsToBreak` landed hits (volleys count double), so
   *  no build is soft-locked, just slow-walked while the boss pounds away.
   *  Burn does NOT tick through it (the puzzle stays pure). */
  aegis?: { name: string; hitsToBreak: number }
  // Optional chance-gated incoming-damage mitigation while in this phase.
  // Mirrors the Ironclad affix shape: when the chance roll succeeds, dmg is
  // multiplied by `damageTakenMult` (e.g. 0.7 for -30%) and a log line surfaces.
  // `damageTakenVolleyBypass` skips the roll on volley shots so the player always
  // has a clean answer to a hunkered boss.
  damageTakenChance?: number
  damageTakenMult?: number
  damageTakenVolleyBypass?: boolean
}

/** ── Mechanic checks (MMO-raid style) ───────────────────────────────────────
 *  A telegraphed boss move the player must ANSWER with the right kind of crew
 *  play, or eat a big consequence. Attach one to a `BossPhase.check`; it arms
 *  the instant that phase begins: a warning banner + a `chargeTurns` countdown
 *  appears, and the player has that window to produce ANY ONE of the broad
 *  `responses`. At resolution: satisfied -> COUNTERED (chip + a line); unmet ->
 *  the `consequence` lands. Deliberately BROAD (several answers per check) so a
 *  roster isn't hard-locked by one class — see [[raid-mechanic-checks]].
 *
 *  Each `MechanicResponse` maps to a deliberate CREW-ABILITY play RaidCombat can
 *  read — never an incidental action (a plain Dodge or a normal crit do NOT
 *  count, so answering a check is a real decision, found by trial and error):
 *    brace  — an Anchor brace is active (anchorReductionRef > 0)
 *    shield — a Tidecaller shield is up (abyssalShieldRef > 0)
 *    snare  — the enemy's dodge is jammed by a Snare (snareDodgeTurnsRef !== 0)
 *    heal   — a heal ABILITY fired in the window (Mender / Tidecaller / repair kit)
 *    burst  — a legendary big-shot ABILITY fired in the window (Leviathan / Apex) */
export type MechanicResponse = 'brace' | 'shield' | 'snare' | 'heal' | 'burst'

export interface BossMechanicCheck {
  id: string
  name: string          // banner label, e.g. 'The Big Gun'
  telegraph: string     // warning line the moment the wind-up begins
  /** A NUDGE toward the KIND of answer (defend / disrupt / survive / hit hard),
   *  shown on the enemy stats popup — deliberately does NOT name the exact crew
   *  ability, so working out the play is still on the player. Falls back to a
   *  generic category hint derived from `responses` when unset. */
  hint?: string
  chargeTurns: number   // player turns to answer before it resolves (1-2)
  responses: MechanicResponse[]   // ANY ONE clears it (kept broad on purpose)
  counteredLine: string // action-log line on a successful counter
  failLine: string      // action-log line on failure (before the consequence)
  consequence:
    | { kind: 'damagePctMaxHp';    value: number }   // hit for value × player max HP (can wipe)
    | { kind: 'enemyHealPctMaxHp'; value: number }   // boss heals value × its own max HP
    | { kind: 'burnDot'; pctPerTurn: number; turns: number }  // sets you ablaze: pctPerTurn × maxHP per turn for `turns`; any crew heal clears it (can wipe if ignored)
}

export interface BroadsideEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  /** Ship speed: used in the speed roll for turn order, dodge roll, and aim-bar target speed. */
  shipSpeed: number
  /** Gunnery accuracy — a flat bonus added to this enemy's roll to land a shot
   *  through the PLAYER's dodge. The player's dodge roll adds their FULL nav
   *  (15-40+), so without this a single-digit ship speed could never punch
   *  through dodge and every dodge was a free 0. Size it to the navigation a
   *  player realistically has by the time they reach this enemy: accuracy ≈
   *  (their nav) − ~6 lands a clean dodge ~77% of the time, with the rest
   *  grazing for 50%. Higher = harder to dodge, lower = easier. Default 0 =
   *  no help (old behavior, dodge ≈ free). Only matters on the turns the enemy
   *  fires at a dodging player; ignored everywhere else. */
  accuracy?: number
  /** Chapter-4 magazine: how many cannonballs this enemy can BANK (default 3).
   *  Volley cost stays 3 everywhere — a 4-slot enemy carries a buffer ball, so
   *  it can volley and still hold a shot, fire longer strings, and its
   *  reload-at-max feint window moves to the bigger cap. Deeper clip = meaner,
   *  less predictable cadence; nothing special triggers at full (enemy
   *  ULTIMATES at full magazine are a raid-8 layer on top of this). */
  magazineSize?: number
  /** Chapter-4 baseline shield: fraction of max HP this enemy starts EVERY
   *  fight shielded for (the Warded-affix machinery, made a first-class stat).
   *  Combines with the Warded affix / Warding curse by MAX, not sum. */
  shieldPct?: number
  /** Chapter-4 special ability, cast when the pattern hits a 'special' slot. */
  special?: EnemySpecial
  /** Raid-8 ultimate, unleashed when the pattern hits an 'ultimate' slot AT A
   *  FULL MAGAZINE (short of full it degrades to reload and re-attempts). The
   *  full pips glow as the tell — the enemy-side mirror of the player's Mega. */
  ultimate?: EnemyUltimate
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
  /** BAKED elite affix — permanently attaches one of the challenge-mode elite
   *  affixes (raidAffixes) to THIS specific enemy, in normal AND challenge play
   *  (RaidGame reads it and passes it as the affix prop). Unlike a random
   *  challenge-elite roll it does NOT apply the ×1.5/×1.25 elite stat bump — the
   *  enemy's own stats stand, then challenge scaling multiplies them as usual.
   *  Used for named enforcers whose signature IS an affix (e.g. The Leech's
   *  Vampiric lifesteal, The Breaker's Ironclad plating). */
  affix?: AffixId
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
  /** Per-enemy aim-needle speed multiplier (1 = normal). Above 1 makes the
   *  NEEDLE sweep faster. Generally prefer `zoneSpeedMult` (a faster TARGET
   *  reads as the enemy being evasive; a faster needle just feels twitchy).
   *  Folds on top of any tide aimSpeedMult. Undefined = 1. */
  aimSpeedMult?: number
  /** Per-enemy TARGET (crit-zone) drift-speed multiplier (1 = normal). Above 1
   *  makes the gold zone slide across the bar faster, so it's harder to line up
   *  a clean Critical — the enemy reads as a fast, evasive ship you can't get a
   *  steady bead on. The zone's base pace already scales with shipSpeed, so a
   *  slow brute stays easier to crit even with a mult. Undefined = 1. */
  zoneSpeedMult?: number
  /** The Hammerhead's raid (Ch4, Raid 7) — "Rolling Plate." The gold CRIT
   *  band drifts WITHIN the moving target zone (a target inside the target):
   *  the crew rolls its armor plating, so the seam never sits still. Value is
   *  the seam's drift speed (0.5 gentle, 1.2 fast). The seam roams the WHOLE
   *  zone including the graze fringe — hitting the seam always crits, but
   *  chasing it into the fringe is a wager (a near miss out there only
   *  grazes). Hit/graze still judge off the zone center. Undefined = the seam
   *  sits centered like every other raid (zero engine cost elsewhere). */
  critDrift?: number
  /** Nameplate/stats-popup label for the rolling seam (mirrors aimFogName). */
  critDriftName?: string
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
  /** The Quartermaster raid (Chapter 3, Raid 6) — "Flare Barrage." Every few
   *  turns the keeper throws up false flares the player must swat (reactive
   *  whack-a-mole) before they can act. `decoyCount` is the per-ENEMY ladder
   *  tier (1-3), so the mechanic escalates up the raid (a barrage every 3 turns):
   *    1 — gentle warmup: ~5 flares, generous fuses.
   *    2 — pressure: ~7 flares, tighter fuses, heavy clustering.
   *    3 — the boss: ~9 flares, tightest fuses, PLUS (sparse) FEINTS —
   *        red "live shell" flares you must NOT tap (tapping one chips you; the
   *        rule flips), so the climax is discriminate-and-react, not just swat.
   *  Flares spawn ARRHYTHMICALLY (clusters / lulls) so you can't autopilot a
   *  rhythm; each penalty (a real flare missed OR a feint tapped) chips the
   *  player (softens them for the real shot, never kills). Logic: FlareBarrage
   *  component + the 'flares' subPhase in RaidCombat. `decoyName` labels the
   *  banner. Undefined elsewhere = dormant. */
  decoyCount?: number
  decoyName?: string
  /** Challenge-mode flare tuning (set by the Coffers Fleet challenge build so
   *  the barrage is a real step up, not just scaled stats). `flareDmgMult`
   *  scales the per-flare-penalty damage; `flareFuseMult` scales the fuse window
   *  (lower = the flares close faster / harder to swat). Default 1 = normal. */
  flareDmgMult?: number
  flareFuseMult?: number
  /** The Coffers (Chapter 3) — "Repossession." At the START of this fight the
   *  crooked Quartermaster reclaims ONE of the player's equipped raid items for
   *  the whole fight: its COMBAT effects (the per-shot damage mults + on-hit
   *  procs + parry) don't apply. Prefers an item with an offensive effect so
   *  the theft always bites. One-time at fight start, no per-turn timer.
   *  `repossessName` labels it on the nameplate / intro line. Fight-start stats
   *  (HP, speed, starting cannonballs) stay baked — he takes your guns' edge,
   *  not your hull. Undefined on every other enemy = no effect. */
  repossess?: boolean
  repossessName?: string
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
  phase2?: BossPhase
  /** Multi-phase boss (a taste of a "final boss"): an ORDERED list of phase
   *  transitions beyond phase 1. Each killing blow while a next phase remains
   *  revives the boss into it, escalating pattern / damage / dialogue. phases[0]
   *  = phase 2, phases[1] = phase 3, and so on. Supersedes `phase2` when set.
   *  Bosses with neither fight as a single phase. */
  phases?: BossPhase[]
  /** A mechanic check that ARMS the instant the fight begins (phase 1), before
   *  any revive. Same shape + answering as a phase check; lets a 6-phase boss
   *  demand a crew ability in every phase including the opener. Boss-only. */
  openingCheck?: BossMechanicCheck
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
  /** Challenge-mode extra: every intro enemy that carries a BAKED signature
   *  affix ALSO gets one random second affix, merged, rolled fresh each run
   *  (guaranteed elite, different every attempt). Keeps the enforcer's identity
   *  and stacks a surprise on top. Only meaningful on a challenge config. */
  mergeRandomAffix?: boolean
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
   *    - overcast : Krust's open ocean past the Bilge Strait (cold steel-gray, thick clouds, no sun)
   *    - fog      : The Cartographer's Sounding Fog (washed-out gray, dim sun, drifting mist bands)
   *    - harbor   : The Coffers' drowned black-market port (sickly green overcast, gun-smoke haze, black water)
   *    - vault    : The Quartermaster's lantern-lit gun-deck (deep indigo storm-dark, warm gold lamp glow) */
  atmosphere?: 'dusk' | 'sunset' | 'overcast' | 'fog' | 'harbor' | 'vault'
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
  /** Baseline gunnery accuracy for EVERY enemy in this raid (see
   *  BroadsideEnemy.accuracy). Set once per raid, sized to the navigation a
   *  player has by the time they reach it, so dodge stays a strong read
   *  (~75-80% clean) instead of a free 0. Within the raid, faster ships are
   *  naturally harder to dodge (their shipSpeed is also in the roll), so one
   *  number gives a built-in spread. An individual enemy can still override
   *  with its own `accuracy`. Undefined = 0 (dodge ≈ free, pre-2026-06 behavior). */
  enemyAccuracy?: number
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
  enemyAccuracy: 4,
  raidTitle: "The Corsair's Reckoning",
  bossDefeatedText: 'Barnacle Pete Defeated',
  atmosphere: 'sunset',
  enemies: {
    // Patterns punish a reload-fire-reload-fire autopilot (player fires on
    // even turns, reloads on odd). Difficulty rises with enemy tier; the
    // punishment lands in the FIRST few turns of each cycle so it still
    // matters in short mob fights.
    brute: {
      id: 'brute', name: 'Reef Raider', hpBase: 20, minDmg: 2, maxDmg: 5,
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
      id: 'sniper', name: "Crow's Nest Marksman", hpBase: 25, minDmg: 2, maxDmg: 8,
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
      id: 'corsair', name: 'Saltwater Corsair', hpBase: 32, minDmg: 5, maxDmg: 8,
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
      id: 'pete', name: 'Barnacle Pete', hpBase: 46, minDmg: 7, maxDmg: 12,
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
      // Six punish turns per cycle. Eased 2026-06-20 (entry-raid pacing):
      // 7–12 × 2 × 1.5 crit = up to ~36-dmg single shots (was 45); the only
      // safe play is still reading the pattern and defending (or breaking
      // rhythm with extra reloads).
      // Charges: 0→1→1→2→2→3→3→0→1→0→1→2→3→0
      pattern: ['reload', 'dodge', 'reload', 'dodge', 'reload', 'dodge', 'volley', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley'],
      critChance: 0.075,
      image: '/enemychapter1schooner_v2.png',
      portrait: ENEMY_IMG_BASE + 'barnacle_pete.png',
    },
  },
  // Eased to 4 mobs (was 6: dropped a sniper + a corsair) so the very first
  // raid players ever fight isn't a 7-fight war of attrition with a Rowboat.
  // Still ramps brute → sniper → corsair → boss.
  sequence: ['brute', 'brute', 'sniper', 'corsair'],
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
  enemyAccuracy: 9,
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
  // Trimmed to 6 mobs (was 8: dropped a Hull Breaker + an Overseer) so the run
  // isn't a marathon. Still ramps scout → reg → brute → elite → boss. The
  // Challenge variant pins itself back to the original 8 for hard mode.
  sequence: ['scout', 'scout', 'reg', 'reg', 'brute', 'elite'],
  bossId: 'krust',
  // Mirror Pete's two-tier structure. Krust's Carapace is the
  // standard plate (Epic, -10%); Captain's Carapace is Krust's own
  // full-grade armor (Legendary, -15%). Same 30% special-drop /
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
    { speaker: 'narrator', text: "Past the Bilge Strait the water turns cold and the fog thins to a hard gray line. A long iron-sided carrack waits there, riding low under more cargo than any honest captain could explain. The wax on Pete's letter and the seal on her hull match." },
    { speaker: 'boss', text: "C.K. So you're the little hook that's been snagging my freight. I wondered who kept making my couriers late." },
    { speaker: 'player', text: "Captain Krust. Pete kept your letters but not his life. You run the Finndicate's cargo." },
    { speaker: 'boss', text: "I move what I'm told to move and I don't ask whose name is on the manifest. That's why I've lasted, and that's why captains like Pete are fodder and captains like me aren't." },
    { speaker: 'boss', text: "But you've cost the Finndicate a season's haul, captain, and someone above me will want that back out of you. I'll just take it out first." },
    { speaker: 'boss', text: "Strike your colors or strike your guns. Either way this consignment sails on without you." },
  ],
}

export const THE_CARTOGRAPHER: BossRaidConfig = {
  raidId: 'cartographer',
  enemyAccuracy: 14,
  raidTitle: "The Cartographer's Survey",
  bossDefeatedText: 'The Cartographer Defeated',
  atmosphere: 'fog',
  enemies: {
    // Tier-3 roster. The Cartographer's chart line sails the Sounding
    // Fog for cover — the deep gray band on the Finndicate's own maps.
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
    { speaker: 'narrator', text: "The fog thickens until sea and sky blur into one gray wall. Out of it a slow-built galleon glides up, decks stacked with rolled charts and brass-bound sextants. No flags fly. No name painted on the hull." },
    { speaker: 'boss', text: "I heard a young captain was reading my routes. I came up the line to see what kind of eyes were behind it." },
    { speaker: 'player', text: "You're the Cartographer. The Finndicate's chartmaker. Krust said his couriers followed your lines." },
    { speaker: 'boss', text: "Names belong to ships. I draw seas. Krust ran cargo, and you put him at the bottom of one of my channels. Now you're on a page of mine too." },
    { speaker: 'boss', text: "Every water you've crossed since Driftwood is marked in the cabin behind me. I knew the shape of your wake before you knew the shape of your hold." },
    { speaker: 'boss', text: "Lock your gunports if you've any sense. Or don't, and let this fog have you the way it had the others." },
  ],
}

export const THE_TOLLMASTER: BossRaidConfig = {
  raidId: 'tollmasters_cut',
  enemyAccuracy: 19,
  raidTitle: "The Tollmaster's Cut",
  bossDefeatedText: 'Tollmaster Spet Defeated',
  atmosphere: 'overcast',
  enemies: {
    // Tier-4 roster, Chapter II's second raid (Nav 35). The Gullet's toll crew
    // are barracudas: fast, toothy, and ambush-built.
    //
    // SIGNATURE: "First Cut" — the QUICK hulls (scout, elite, boss) open LOADED
    // (startCharges ≥ 1) with fire-leading patterns, so they shoot on the
    // opening bell and steal the first exchange. The slower crew (reg, brute)
    // open cold like a normal raid, giving the player turns to fire first. On
    // top, this raid's patterns run harder than the Cartographer's: more volleys
    // and mid-loop double-taps (consecutive fires the player can only half-
    // dodge, since you can't dodge twice in a row), so the cadence punishes. No
    // plating, no fog, no parry — the threat is raw aggression + the First Cut
    // tempo. The player answers with Spet's own drop (Spet's Primer = 50% /
    // Tollmaster's Primer = 100% chance to open a fight loaded yourself). Caps
    // at the Brigantine art tier — Galleon + Man-o-War held for later chapters.
    scout: {
      id: 'scout', name: 'Silverdart', hpBase: 60, minDmg: 6, maxDmg: 12,
      shipSpeed: 8, actionMs: 3600,
      // Fast young barracuda — FIRST CUT (opens loaded, fires turn 1). Light but
      // mean: the opener, then a mid-loop double-tap (T4-T5) the player can only
      // half-dodge. Charges: 1→0→1→2→1→0
      pattern: ['fire', 'reload', 'reload', 'fire', 'fire', 'dodge'],
      critChance: 0.06,
      startCharges: 1,
      image: '/enemychapter2sloop_v2.png',
      portrait: '/raid4_silverdart.png',
    },
    reg: {
      id: 'reg', name: 'Snapjaw', hpBase: 84, minDmg: 8, maxDmg: 15,
      shipSpeed: 6, actionMs: 4400,
      // Workhorse of the toll line. Opens COLD (no First Cut), but punishing:
      // stacks to a volley, then a double-tap before it braces. Charges:
      // 0→1→2→3→volley(0)→fire/fire (self-correct as charges allow)→dodge
      pattern: ['reload', 'reload', 'reload', 'volley', 'fire', 'fire', 'dodge'],
      critChance: 0.08,
      image: '/enemychapter2schooner_v2.png',
      portrait: '/raid4_snapjaw.png',
    },
    brute: {
      id: 'brute', name: 'Gulletmaw', hpBase: 122, minDmg: 11, maxDmg: 19,
      shipSpeed: 3, actionMs: 5400,
      // Big, slow old barracuda. Opens COLD, but hits like a hammer: TWIN
      // volleys per loop with a single dodge between. Speed 3 means it shoots
      // late, so the threat is the size of the volleys, not the timing.
      // Charges: 0→1→2→3→volley(0)→dodge→1→2→volley(self-corrects to 3)
      pattern: ['reload', 'reload', 'reload', 'volley', 'dodge', 'reload', 'reload', 'volley'],
      critChance: 0.06,
      image: '/enemychapter2brigantine_v2.png',
      portrait: '/raid4_gulletmaw.png',
    },
    elite: {
      id: 'elite', name: 'The Exactor', hpBase: 106, minDmg: 10, maxDmg: 18,
      shipSpeed: 9, actionMs: 3200,
      // Spet's chief enforcer — FIRST CUT + the fastest hull in the raid (speed
      // 9), so it almost always lands the opener, then a mid-loop double-tap
      // (T4-T5, guaranteed one hits) and a closing volley. The real test before
      // the boss. Charges: 1→0→1→2→1→0→volley(self-corrects)→dodge
      pattern: ['fire', 'reload', 'reload', 'fire', 'fire', 'reload', 'volley', 'dodge'],
      critChance: 0.12,
      startCharges: 1,
      image: '/enemychapter2brigantine_v2.png',
      portrait: '/raid4_theexactor.png',
    },
    spet: {
      id: 'spet', name: 'Tollmaster Spet', hpBase: 215, minDmg: 18, maxDmg: 32,
      shipSpeed: 7, actionMs: 4200,
      // The collector himself. FIRST CUT, DOUBLED — opens with two chambered and
      // double-fires turns 1-2 before the player can reply, then a volley and
      // ANOTHER fire, closing on a single dodge. Five damage turns in eight, the
      // heaviest cadence in the game. No second signature mechanic — the doubled
      // opener + the highest stats in the chapter are the fight.
      // Charges: 2→fire1→fire0→reload1→reload2→reload3→volley0→fire(sub)→dodge
      pattern: ['fire', 'fire', 'reload', 'reload', 'reload', 'volley', 'fire', 'dodge'],
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
    { id: 'spets_primer',        label: "Spet's Primer",      image: '/spetsprimer.png',       emoji: '🧨',  rarity: 'epic',      weight: 20 },
    { id: 'tollmasters_primer',  label: "Tollmaster's Primer", image: '/tollmastersprimer.png', emoji: '🧨',  rarity: 'legendary', weight: 5  },
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

// ── CHAPTER III, Raid 5 — The Harbor Fleet (The Coffers) ────────────────────
// ADMIN-ONLY (the map node is adminOnly + the route page guards is_admin). The
// Coffers' escort fleet + its admiral. GALLEON-tier hulls — the player's first
// capital-ship fight. SIGNATURE: TBD — the Flare Barrage that used to live here
// moved to Raid 6 (The Quartermaster) so each Coffers raid keeps a distinct
// identity; pick a fresh fleet gimmick in step 4. The admiral runs a PHASE 2
// (normal-boss two-phase starts this chapter). Tier-2 tides. NAMES + ART ARE
// PLACEHOLDERS (working names; Ch2 hull art reused as stand-ins) until step 4.
// Caps at Galleon — Man-o-War held for Chapter IV.
export const THE_COFFERS_FLEET: BossRaidConfig = {
  raidId: 'coffers_fleet',
  enemyAccuracy: 24,
  raidTitle: 'The Harbor Fleet',
  bossDefeatedText: 'Admiral Ruse Defeated',
  atmosphere: 'harbor',  // the Coffers' drowned black-market port, gun-smoke haze
  enemies: {
    // Ch3 hulls. SIGNATURE = DECOYS: false aim bands scaling 1 → 3 toward the
    // flagship. Admiral Ruse's deception fleet — the showy lionfish crew whose
    // fanned fins are all display over a hidden sting (the "False Colors").
    scout: {
      id: 'scout', name: 'Plume', hpBase: 110, minDmg: 8, maxDmg: 15,
      shipSpeed: 8, actionMs: 3500,
      pattern: ['reload', 'fire', 'dodge', 'reload', 'fire', 'reload', 'fire', 'dodge'],
      critChance: 0.07,
      decoyCount: 1, decoyName: 'False Colors',   // deception ladder tier 1
      // Endgame difficulty lives in the TARGET, not the needle (2026-07-04): the
      // crit zone drifts faster across Ch3 so clean crits are earned, not
      // automatic. The zone's base pace scales with shipSpeed, so slow brutes
      // need a bigger mult to reach a comparable challenge.
      zoneSpeedMult: 1.6,
      image: '/enemychapter3schooner.png',
      portrait: '/raid5_feint.png',
    },
    reg: {
      id: 'reg', name: 'Fantail', hpBase: 145, minDmg: 10, maxDmg: 18,
      shipSpeed: 6, actionMs: 4400,
      pattern: ['reload', 'reload', 'volley', 'dodge', 'fire', 'reload', 'dodge', 'reload', 'fire'],
      critChance: 0.08,
      decoyCount: 1, decoyName: 'False Colors',   // tier 1
      zoneSpeedMult: 1.9,
      image: '/enemychapter3brigantine.png',
      portrait: '/raid5_sham.png',
    },
    brute: {
      id: 'brute', name: 'Bristle', hpBase: 212, minDmg: 14, maxDmg: 24,
      shipSpeed: 3, actionMs: 5400,
      pattern: ['reload', 'reload', 'reload', 'volley', 'dodge', 'reload', 'reload', 'dodge', 'volley', 'fire'],
      critChance: 0.06,
      decoyCount: 2, decoyName: 'False Colors',   // tier 2 — bigger spread
      zoneSpeedMult: 2.6,
      image: '/enemychapter3galleon.png',
      portrait: '/raid5_bulwark.png',
    },
    elite: {
      id: 'elite', name: 'Barb', hpBase: 185, minDmg: 13, maxDmg: 22,
      shipSpeed: 9, actionMs: 3300,
      pattern: ['fire', 'dodge', 'reload', 'reload', 'volley', 'dodge', 'fire', 'reload', 'dodge', 'fire'],
      critChance: 0.13,
      decoyCount: 2, decoyName: 'False Colors',   // tier 2
      zoneSpeedMult: 1.6,
      image: '/enemychapter3galleon.png',
      portrait: '/raid5_mirage.png',
    },
    admiral: {
      id: 'admiral', name: 'Admiral Ruse', hpBase: 670, minDmg: 20, maxDmg: 36,
      shipSpeed: 7, actionMs: 4200,
      // Flagship, peak of the deception ladder (3 bands). Phase 2: at half HP he
      // drops the act and fights for real, faster and meaner.
      pattern: ['reload', 'fire', 'dodge', 'reload', 'reload', 'volley', 'dodge', 'fire', 'reload', 'fire', 'dodge'],
      critChance: 0.12,
      decoyCount: 3, decoyName: 'False Colors',   // tier 3 — the whole line lies
      phase2: {
        revivePct: 0.5,
        damageMult: 1.2,
        pattern: ['fire', 'reload', 'volley', 'dodge', 'fire', 'reload', 'fire', 'dodge', 'fire'],
        dialogueLine: "Enough games. Run out the real guns.",
      },
      zoneSpeedMult: 1.9,
      image: '/enemychapter3galleon.png',
      portrait: '/raid5_admiralruse.png',
    },
  },
  sequence: ['scout', 'reg', 'scout', 'brute', 'elite', 'reg', 'brute', 'elite'],
  bossId: 'admiral',
  tides: { slots: [3, 6], maxTier: 2 },  // tier-2 tides — Chapter III's bigger swings
  // Chapter-III trophy skin (Coffers Hull) drops from BOTH Ch3 raids, lower rate
  // here than the finale. Rest is currency (signature special drops TBD in step 4).
  loot: [
    { id: 'coffers_hull',   label: 'Coffers Hull', image: null,          emoji: '🚢',      rarity: 'epic',     weight: 5,  shipSkinId: 'coffers_hull' },
    // Signature deception-fleet drops — the anti-evasion Tell-Tale Glass (epic)
    // + Admiral's Eye (legendary chase). Challenge variant lifts the rare rate.
    { id: 'tell_tale_glass', label: 'Tell-Tale Glass', image: '/telltaleglass.png', emoji: '🔭',  rarity: 'epic',      weight: 20 },
    { id: 'admirals_eye',    label: "Admiral's Eye",   image: '/admiralseye.png',   emoji: '👁️', rarity: 'legendary', weight: 5  },
    { id: 'doubloons_600',  label: '+600 ⟡',   image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 28 },
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 18 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 16 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 8  },
  ],
  killRewards: {
    scout:   { gold: 75,  xp: 75  },
    reg:     { gold: 100, xp: 110 },
    brute:   { gold: 135, xp: 150 },
    elite:   { gold: 165, xp: 180 },
    admiral: { gold: 600, xp: 600 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: "Past the harbor wall the Coffers open up: a drowned market ringed by guns, and a line of Galleons already coming about to meet you." },
    { speaker: 'boss', text: "Far enough, captain. Nobody sails into the Coffers uninvited and lives to count the take." },
    { speaker: 'player', text: "You're a long way from the docks for a harbormaster." },
    { speaker: 'boss', text: "Admiral, to you. I keep this wall, and my gunners fly whatever colors the market needs. You'll never know which gun is the live one until it's already in you." },
    { speaker: 'boss', text: "Run out your guns. Mine are already lying to you." },
  ],
}

// ── CHAPTER III, Raid 6 — The Quartermaster (The Coffers finale) ─────────────
// ADMIN-ONLY (map node adminOnly + route page guards is_admin). The keeper of
// the Cache and his hired guns, behind the counter of the market he runs.
// GALLEON-tier. SIGNATURE: REPOSSESSION — at fight start the keeper reclaims one
// of the player's equipped raid items for the whole fight (prefers an offensive
// per-shot/proc item so the theft bites). THE perfect betrayal-boss mechanic:
// the merchant who sold you your edge switches it off. PLUS a phase 2 (the
// chapter's two-phase finale): at half HP he opens the reserve deck. Tier-2
// tides. (Decoys were moved to Raid 5's Admiral Ruse so each Ch3 boss has ONE
// clean, distinct signature.) NAMES ARE PLACEHOLDERS until step 4. Caps at Galleon.
// ── THE QUARTERMASTER'S GHOST (Chapter IV) ───────────────────────────────────
// The FARM node. He still holds every either/or Cache item you left behind, and
// now every one you spent: the forge is destructive, so a component you fused
// away is genuinely gone from raid_items, which makes it eligible to roll off him
// again. That is the whole point of him. Without this, a player who forged their
// Gunner's Sight into a Warlord's Cannon could never build a Deadeye Bulwark,
// because the Cache only ever let them choose once.
//
// Repeatable by construction: raid nodes are re-runnable (that is how cannons get
// refarmed), so "grind him" needs no new machinery. rollLootIndex already drops
// uniques you CURRENTLY own out of the pool, and it reads raw raid_items, so he
// only ever offers what you do not have.
//
// A one-bar duel on purpose. He is meant to be run over and over.
export const THE_QUARTERMASTERS_GHOST: BossRaidConfig = {
  raidId: 'the_quartermasters_ghost',
  enemyAccuracy: 30,
  raidTitle: "The Quartermaster's Ghost",
  bossDefeatedText: 'The Ghost Dispersed',
  atmosphere: 'vault',   // his own lantern-lit gun-deck, and he never left it
  enemies: {
    ghost: {
      id: 'ghost', name: "The Quartermaster's Ghost", hpBase: 620, minDmg: 26, maxDmg: 44,
      shipSpeed: 9, actionMs: 3600,
      pattern: ['reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'fire', 'dodge', 'reload', 'volley'],
      critChance: 0.16,
      // SIGNATURE: The Ledger. He fights with the six Cache items he is holding —
      // your fire, your ice, your sights, your plating, your bearings — all turned
      // on you. See AFFIXES.ledger. The hull is DELIBERATELY light (620, under the
      // Hammerhead's 700) because the barrier and the phase below already add a
      // third again on top: he is a farm boss and has to stay brisk.
      affix: 'ledger',
      // The sixth item. The Quartermaster's Anchor lets YOU survive one killing
      // blow, so of course it lets him. He takes the shot, refuses to sink, and
      // comes back up. One phase only: any more and the grind stops being one.
      phases: [
        { revivePct: 0.18, damageMult: 1.1, badge: 'The Anchor',
          pattern: ['fire', 'volley', 'dodge', 'reload', 'fire', 'fire', 'reload', 'volley'],
          dialogueLine: 'You did not think I would sell the last anchor, did you?' },
      ],
      image: '/enemychapter3galleon.png',
      portrait: '/quartermasterghost.png',
    },
  },
  sequence: [],          // BOSS ONLY. Round 0 is him.
  bossId: 'ghost',
  // Everything he ever made you choose between. rollLootIndex removes whatever is
  // already in your raid_items, so the pool narrows to exactly what you are still
  // missing: miss all six and roughly a third of clears pay a component; down to
  // your last one it is about 1 in 7. The currency slots keep a clear from ever
  // feeling wasted.
  loot: [
    { id: 'quartermasters_anchor', label: "Quartermaster's Anchor", image: '/quartermastersanchor.png', emoji: '⚓', rarity: 'epic', weight: 10 },
    { id: 'navigators_compass',    label: "Navigator's Compass",    image: '/navigatorscompass.png',    emoji: '🧭', rarity: 'epic', weight: 10 },
    { id: 'gunners_sight',         label: "Gunner's Sight",         image: '/gunnerssight.png',         emoji: '🎯', rarity: 'epic', weight: 10 },
    { id: 'reinforced_hull',       label: 'Reinforced Hull',        image: '/reinforcedhull.png',       emoji: '🛠️', rarity: 'epic', weight: 10 },
    { id: 'incendiary_cannonball', label: 'Incendiary Cannonball',  image: '/incendiarycannonball.png', emoji: '🔥', rarity: 'epic', weight: 10 },
    { id: 'frozen_cannonball',     label: 'Frozen Cannonball',      image: '/frozencannonball.png',     emoji: '❄️', rarity: 'epic', weight: 10 },
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 30 },
    { id: 'gems_50',        label: '50 Gems',  image: null,             emoji: GEM_GLYPH, rarity: 'rare',     weight: 20 },
    { id: 'pack_2',         label: '200 Gems', image: null,             emoji: GEM_GLYPH, rarity: 'epic',     weight: 10 },
  ],
  killRewards: {
    ghost: { gold: 900, xp: 1000 },
  },
  // No tides. The Ledger is the whole fight; a random tide on top would just muddy
  // a boss the player is meant to learn cold and beat on muscle memory.
  preFightDialogue: [
    { speaker: 'narrator', text: 'The gun-deck is exactly as you left it, down to the lantern oil. The counter is still stocked. The keeper is still behind it, and you can see the shutters through him.' },
    { speaker: 'boss', text: "Dead men keep better books than living ones. Everything you left on my counter, everything you melted down since. I have it all, and I have all the time there is." },
    { speaker: 'player', text: "Then you'll not mind me taking it back off you. Twice, if it comes to that." },
    { speaker: 'boss', text: 'They always come back. That is the one thing I could ever count on.' },
  ],
}

export const THE_QUARTERMASTER: BossRaidConfig = {
  raidId: 'the_quartermaster',
  enemyAccuracy: 28,
  raidTitle: 'The Quartermaster',
  bossDefeatedText: 'The Quartermaster Defeated',
  atmosphere: 'vault',  // the Cache's lantern-lit gun-deck vault, storm-dark finale
  enemies: {
    // A "FINAL BOSS" duel (Chapter III finale): a SHORT 2-ship intro of two
    // DISTINCT, strong enforcers — The Leech (sneaky glass-cannon) then The
    // Breaker (slow tank) — then the keeper himself as a 4-PHASE epic (no long
    // gauntlet). He carries Repossession (fight start) + escalation via `phases[]`.
    scout: {
      // Sinister + SNEAKY (a lamprey): fast, evasive, and spikes hard on a crit
      // — a glass-cannon assassin that punishes a careless opener. Vampiric: it
      // repairs off the blood it draws, so a slow kill lets it claw back.
      id: 'scout', name: 'The Leech', hpBase: 180, minDmg: 12, maxDmg: 22,
      shipSpeed: 10, actionMs: 3000,
      pattern: ['fire', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'dodge', 'fire', 'reload'],
      critChance: 0.20,
      affix: 'vampiric',
      // A darting lamprey — the crit zone RACES, so landing a clean Critical on
      // it is genuinely hard (you have to catch a fast, narrow window). Already a
      // fast ship (10); a big mult on top of the shipSpeed base makes the zone fly.
      zoneSpeedMult: 2.7,
      image: '/enemychapter3schooner.png',
      portrait: '/raid6_theleech.png',
    },
    reg: {
      // BRUTE (a goliath grouper): slow and TANKY, but every shot is a wrecking
      // blow — heavy volleys you have to weather or out-pace. Ironclad: his hull
      // plating has a real chance to shrug non-volley fire, so crack him open
      // with volleys.
      id: 'reg', name: 'The Breaker', hpBase: 400, minDmg: 18, maxDmg: 32,
      shipSpeed: 2, actionMs: 5200,
      pattern: ['reload', 'reload', 'volley', 'dodge', 'reload', 'reload', 'volley', 'dodge', 'reload'],
      critChance: 0.06,
      affix: 'ironclad',
      zoneSpeedMult: 3.0,
      image: '/enemychapter3brigantine.png',
      portrait: '/raid6_thebreaker.png',
    },
    quartermaster: {
      id: 'quartermaster', name: 'The Quartermaster', hpBase: 570, minDmg: 22, maxDmg: 38,
      shipSpeed: 7, actionMs: 4200,
      // The keeper himself, a 4-PHASE final-boss fight. SIGNATURE: Repossession —
      // at fight start he reclaims one of your equipped raid items for the whole
      // fight (the merchant who sold you your edge switches it off). Then he burns
      // through 4 escalating phases (false defeat -> rise again, harder), each a
      // fresh bar + meaner pattern + more damage + a quoted line.
      pattern: ['reload', 'reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'fire', 'reload'],
      critChance: 0.12,
      repossess: true, repossessName: 'Repossession',
      phases: [
        // Phase 2 — the debt called in. Faster cadence + a MITIGATION check.
        { revivePct: 0.85, damageMult: 1.15, badge: 'Called In',
          pattern: ['reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'fire', 'reload'],
          dialogueLine: "You cracked the ledger. You have not cleared the debt.",
          check: {
            id: 'big_gun', name: 'The Big Gun', chargeTurns: 2,
            telegraph: 'The Quartermaster hauls the reserve cannon onto the rail and swings the muzzle toward you.',
            hint: 'A shot this heavy has to be met with a crew ability — a defensive one that gets something between you and the muzzle before it fires. Your own brace/dodge won’t turn it aside.',
            responses: ['brace', 'shield'],
            counteredLine: 'The big shot slams into your cover and glances wide.',
            failLine: 'The reserve cannon speaks, and nothing turned it aside.',
            consequence: { kind: 'damagePctMaxHp', value: 0.75 },
          } },
        // Phase 3 — the reserve deck. Volley-heavy + a DISRUPT ("dodge cancel") check.
        { revivePct: 0.72, damageMult: 1.30, badge: 'Reserve Deck',
          pattern: ['reload', 'reload', 'volley', 'dodge', 'fire', 'volley', 'dodge', 'fire', 'reload'],
          dialogueLine: "You think the shelves are bare? I keep a reserve deck for captains like you.",
          check: {
            id: 'cooking_books', name: 'Cooking the Books', chargeTurns: 2,
            telegraph: 'The Quartermaster ducks low behind the counter and starts working the ledger, fast.',
            hint: "Don't let him finish the tally — fire a crew ability to break it. Something disrupting to foul his concentration, or a heavy-hitting one to overpower him before the count closes, or he balances the ledger in his favour.",
            responses: ['snare', 'burst'],
            counteredLine: 'You break his tally before it can close.',
            failLine: 'The ledger balances in his favour.',
            consequence: { kind: 'enemyHealPctMaxHp', value: 0.30 },
          } },
        // Phase 4 — nothing left to sell. Desperation + a HEAL check.
        { revivePct: 0.60, damageMult: 1.50, badge: 'Empty Shelves',
          pattern: ['fire', 'volley', 'dodge', 'reload', 'fire', 'fire', 'volley', 'fire'],
          dialogueLine: "Nothing left to sell. Then I sink you and take the lot back myself.",
          check: {
            id: 'fire_sale', name: 'Fire Sale', chargeTurns: 2,
            telegraph: 'The Quartermaster touches a torch to the stock and the whole Cache goes up in flame.',
            hint: 'The whole stock goes up at once and sets your hull ablaze. Fire a crew ability before it catches — a recovery one or a defensive one — and if it does catch, only a crew heal puts the fire out.',
            responses: ['heal', 'shield'],
            counteredLine: 'You smother the blaze before it can spread.',
            failLine: 'The fire sale catches, and your hull goes up in flame.',
            consequence: { kind: 'burnDot', pctPerTurn: 0.18, turns: 3 },
          } },
      ],
      zoneSpeedMult: 2.0,
      image: '/enemychapter3galleon.png',
      portrait: '/raid6_thequartermaster.png',
    },
  },
  sequence: ['scout', 'reg'],   // short 2-ship intro, then the 4-phase duel
  bossId: 'quartermaster',
  // No tides — a clean, escalating duel (the phases carry the swings).
  // Chapter-III trophy skin (Coffers Hull) drops here at the higher finale rate.
  // Rest is currency (signature finale special drops TBD in step 4).
  loot: [
    { id: 'coffers_hull',   label: 'Coffers Hull', image: null,          emoji: '🚢',      rarity: 'epic',     weight: 8,  shipSkinId: 'coffers_hull' },
    // Signature finale drops — the activatable War Drum (epic) + guaranteed
    // Thunder Drum (legendary chase). Challenge variant lifts the legendary rate.
    { id: 'war_drum',       label: 'War Drum',     image: '/wardrum.png',     emoji: '🥁',      rarity: 'epic',      weight: 20 },
    { id: 'thunder_drum',   label: 'Thunder Drum', image: '/thunderdrum.png', emoji: '🥁',      rarity: 'legendary', weight: 5  },
    { id: 'doubloons_600',  label: '+600 ⟡',   image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 26 },
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 20 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 22 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 12 },
  ],
  killRewards: {
    // Two genuinely strong enforcers, then the epic boss (which carries the XP
    // the old mob gauntlet used to — 4 phases = the fight).
    scout:         { gold: 130,  xp: 140  },   // The Leech
    reg:           { gold: 180,  xp: 200  },   // The Breaker
    quartermaster: { gold: 1400, xp: 1600 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: "The Cache's shutters roll up into a gun-deck, and the keeper stands behind a counter of run-out cannon, smiling like he's already counted your coin." },
    { speaker: 'boss', text: "Every captain who ever beat me bought the means to do it off my own shelf. You included." },
    { speaker: 'player', text: "Then I'll sink you with your own goods. Hold still." },
    { speaker: 'boss', text: "Your goods? Everything you carry was a loan, captain. And I am calling one back." },
    { speaker: 'boss', text: "Let's see how bold you sail once I reach across the counter and take back the piece you leaned on most." },
  ],
}

// ─── Raid 7 — "The Blockade" (Chapter IV: The Last Fathom) ───────────────────
// Don Finleone's escort armada, run by his chief enforcer THE HAMMERHEAD.
// This raid INTRODUCES the whole Ch4 suite:
//   · baseline SHIELDS on every enemy (shieldPct, scaling 15%→25% up the roster)
//   · 4-cannonball MAGAZINES (deeper clips — meaner, less predictable cadences;
//     volley still costs 3, so they can volley and keep a shot in hand)
//   · enemy SPECIALS via the shared status pipeline (lib/statuses): each crew
//     member throws ONE debuff at you; the boss buffs HIMSELF.
// Audience: post-Ch3, Nav ~55-70. Art = Ch3 hulls as placeholders (bespoke Ch4
// hulls + portraits land at the polish pass, per the Ch3 playbook).
export const THE_HAMMERHEAD: BossRaidConfig = {
  raidId: 'the_hammerhead',
  enemyAccuracy: 34,
  raidTitle: 'The Blockade',
  bossDefeatedText: 'The Hammerhead Defeated',
  atmosphere: 'overcast',   // placeholder — bespoke Last-Fathom palette at polish
  enemies: {
    picket: {
      // The shield TEACHER: light and fast, nothing but the new barrier to
      // learn on. Break the plating, then the hull — burn bleeds through,
      // volleys chew it fastest.
      id: 'picket', name: 'The Picket', hpBase: 300, minDmg: 20, maxDmg: 34,
      shipSpeed: 9, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.15,
      critDrift: 0.4, critDriftName: 'Rolling Plate',
      pattern: ['fire', 'reload', 'dodge', 'fire', 'reload', 'fire', 'dodge', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.2,
      image: '/enemychapter3brigantine.png',
      portrait: '/enemychapter3brigantine.png',
    },
    bosun: {
      // FORTIFY debut (self-buff) — he closes ranks and takes less damage for
      // a spell; learn to wait out (or burst through) a braced window.
      id: 'bosun', name: 'The Bosun', hpBase: 330, minDmg: 21, maxDmg: 35,
      shipSpeed: 6, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.16,
      critDrift: 0.5, critDriftName: 'Rolling Plate',
      special: { name: 'Close Ranks', status: 'fortify', magnitude: 0.25, turns: 2, target: 'self', line: 'The Bosun bellows and the line locks shields, iron to iron.' },
      pattern: ['reload', 'fire', 'special', 'reload', 'volley', 'reload', 'fire', 'dodge'],
      critChance: 0.11,
      zoneSpeedMult: 2.3,
      image: '/enemychapter3brigantine.png',
      portrait: '/enemychapter3brigantine.png',
    },
    netter: {
      // SLOWED debut — weighted nets across your rigging cut your speed, so
      // you lose turn-order rolls and slip fewer shots while it lasts.
      id: 'netter', name: 'The Netter', hpBase: 360, minDmg: 22, maxDmg: 36,
      shipSpeed: 6, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.18,
      special: { name: 'Weighted Nets', status: 'slowed', magnitude: 3, turns: 2, target: 'player', line: 'Weighted nets whip across your rigging and drag the wheel dead.' },
      critDrift: 0.55, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'volley', 'dodge', 'reload', 'fire'],
      critChance: 0.10,
      zoneSpeedMult: 2.4,
      image: '/enemychapter3brigantine.png',
      portrait: '/enemychapter3brigantine.png',
    },
    chainman: {
      // WEAKEN debut — chain-shot rips your powder line; your shots hit soft
      // while it lasts. Drops the Chain-Shot Rack so you can turn it around.
      id: 'chainman', name: 'The Chainman', hpBase: 380, minDmg: 24, maxDmg: 38,
      shipSpeed: 7, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.20,
      special: { name: 'Chain-Shot', status: 'weaken', magnitude: 0.20, turns: 2, target: 'player', line: 'Chain-shot screams through your powder line and your guns cough where they roared.' },
      critDrift: 0.7, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'fire', 'special', 'reload', 'fire', 'volley', 'dodge', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.5,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    cracksman: {
      // FEEBLE debut — a hull-cracker round springs your seams; everything
      // hits you harder while it lasts. The kill-window status, used ON you.
      id: 'cracksman', name: 'The Cracksman', hpBase: 400, minDmg: 24, maxDmg: 40,
      shipSpeed: 5, actionMs: 4200,
      magazineSize: 4, shieldPct: 0.20,
      special: { name: 'Hull-Cracker', status: 'feeble', magnitude: 0.22, turns: 2, target: 'player', line: 'A cracker round springs your seams wide — every blow will find them.' },
      critDrift: 0.7, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'reload', 'special', 'volley', 'reload', 'fire', 'volley', 'dodge'],
      critChance: 0.10,
      zoneSpeedMult: 2.6,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    purser: {
      // REGEN debut (self-buff) — he patches his crews mid-fight and the bar
      // creeps back up; a sponge that punishes slow, polite damage.
      id: 'purser', name: 'The Purser', hpBase: 410, minDmg: 25, maxDmg: 39,
      shipSpeed: 7, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.22,
      critDrift: 0.8, critDriftName: 'Rolling Plate',
      special: { name: 'Patch Crews', status: 'regen', magnitude: 16, turns: 3, target: 'self', line: 'The Purser pays his carpenters in advance, and the hull knits while you watch.' },
      pattern: ['special', 'reload', 'fire', 'reload', 'fire', 'volley', 'reload', 'dodge'],
      critChance: 0.12,
      zoneSpeedMult: 2.6,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    muzzle: {
      // SILENCE debut — the don's gag order. Your crew abilities lock for two
      // rounds: the enforcer who makes sure nobody talks.
      id: 'muzzle', name: 'The Muzzle', hpBase: 420, minDmg: 26, maxDmg: 40,
      shipSpeed: 8, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.22,
      special: { name: 'Gag Order', status: 'silence', magnitude: 1, turns: 2, target: 'player', line: 'The gag order comes down, and your crew go quiet mid-shout.' },
      critDrift: 0.85, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'fire', 'volley', 'reload', 'dodge'],
      critChance: 0.14,
      zoneSpeedMult: 2.7,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    hammerhead: {
      // THE HAMMERHEAD — Don's chief enforcer, the muscle at the gate. Fully
      // shielded, deep clip, and he ENRAGES himself before his heavy swings.
      // Phase 2 brings the Full Swing mechanic check (answer with a crew
      // ability or eat 70% of your hull).
      id: 'hammerhead', name: 'The Hammerhead', hpBase: 700, minDmg: 28, maxDmg: 46,
      shipSpeed: 8, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.25,
      special: { name: 'The Hammer Rises', status: 'enrage', magnitude: 0.25, turns: 2, target: 'self', line: 'The Hammerhead rears back, and the whole line holds its breath.' },
      critDrift: 1.0, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'volley', 'dodge', 'fire', 'reload', 'fire'],
      critChance: 0.14,
      phases: [
        { revivePct: 0.80, damageMult: 1.35, badge: 'The Hammer Falls',
          pattern: ['special', 'fire', 'reload', 'volley', 'fire', 'dodge', 'reload', 'volley'],
          dialogueLine: "The don said bring him your colors. He never said in one piece.",
          check: {
            id: 'full_swing', name: 'The Full Swing', chargeTurns: 2,
            telegraph: 'The Hammerhead heaves the great maul off his deck and swings it high over your hull.',
            hint: 'A blow this heavy has to be met with a crew ability — a defensive one that gets something between you and the maul. Your own brace/dodge won’t stop it.',
            responses: ['brace', 'shield'],
            counteredLine: 'The maul comes down on your cover and the shock goes wide.',
            failLine: 'The maul falls true, and your deck folds under it.',
            consequence: { kind: 'damagePctMaxHp', value: 0.70 },
          } },
        // Phase 3 — THE LAST WALL. He rises one final time behind an aegis
        // that drinks every shot whole. The discovery is the player's: only
        // an ultimate tears it down in one blow (dialogue + logs hint at
        // "everything at once" without naming the Mega). Fallback: 6 landed
        // hits batter it down, so a no-Mega build survives it the hard way.
        { revivePct: 0.45, damageMult: 1.5, badge: 'The Last Wall',
          pattern: ['reload', 'fire', 'special', 'reload', 'volley', 'fire', 'reload', 'fire'],
          dialogueLine: 'You want the don? Then break what cannot be broken. No single shot you carry is heavy enough. Not one of them.',
          aegis: { name: 'The Last Wall', hitsToBreak: 6 } },
      ],
      zoneSpeedMult: 2.1,
      image: '/enemychapter3man-o-war.png',
      portrait: '/enemychapter3man-o-war.png',
    },
  },
  sequence: ['picket', 'bosun', 'netter', 'chainman', 'cracksman', 'purser', 'muzzle'],
  bossId: 'hammerhead',
  tides: { slots: [3, 6], maxTier: 2 },
  loot: [
    // Signature: the Chain-Shot Rack — the first player-applied STATUS item.
    { id: 'chain_shot',     label: 'Chain-Shot Rack', image: null, emoji: '⛓️', rarity: 'epic', weight: 16 },
    { id: 'doubloons_800',  label: '+800 ⟡',   image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 30 },
    { id: 'doubloons_1500', label: '+1,500 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 22 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 20 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 12 },
  ],
  killRewards: {
    picket:     { gold: 170,  xp: 190  },
    bosun:      { gold: 180,  xp: 200  },
    netter:     { gold: 190,  xp: 210  },
    chainman:   { gold: 210,  xp: 230  },
    cracksman:  { gold: 230,  xp: 250  },
    purser:     { gold: 245,  xp: 265  },
    muzzle:     { gold: 260,  xp: 280  },
    hammerhead: { gold: 1700, xp: 2000 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: "The blockade line rides the swell ahead — the don's own escort armada, lanterns doused, gunports open. At its center, a silhouette with a head like a smith's anvil." },
    { speaker: 'boss', text: "Far enough, captain. The don's water starts where your charts stop." },
    { speaker: 'player', text: "Then I'm exactly where I mean to be. Move your line." },
    { speaker: 'boss', text: "The Quartermaster talked too much and kept too little. I keep everything. Including you, when this is done." },
    { speaker: 'boss', text: "They call me the Hammerhead. You'll work out why the hard way." },
  ],
}

// ── Chapter IV, Raid 8 — THE THRONE (Don Finleone) ──────────────────────────
// The fake-final boss. Debuts the raid-8 layer on top of the Ch4 suite:
// enemy ULTIMATES at a full 4-ball magazine (glowing pips = the tell) and
// AIM-BAR ATTACKS (decoys / hardened lock / squall) — specials that strike
// the player's lock-in minigame instead of their hull. Every mob teaches one
// piece before the don stacks them. Don Finleone is a MEGALODON under the
// don's colors — the mask drops in phase 2. ADMIN-ONLY until launch.
// Art: Ch3 hull placeholders — bespoke Last-Fathom fleet art at polish.
export const THE_THRONE: BossRaidConfig = {
  raidId: 'the_throne',
  enemyAccuracy: 36,
  raidTitle: 'The Throne',
  bossDefeatedText: 'Don Finleone Defeated',
  atmosphere: 'vault',   // placeholder — bespoke throne-water palette at polish
  enemies: {
    court_herald: {
      // The ULTIMATE teacher: light hull, no special — just the new tell.
      // Watch the pips fill to four and glow, then answer it or eat it.
      id: 'court_herald', name: 'The Court Herald', hpBase: 340, minDmg: 22, maxDmg: 36,
      shipSpeed: 8, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.15,
      ultimate: { name: 'Broadside Royale', mult: 2.4, line: 'Every gun on the deck speaks at once, in the don’s name.' },
      pattern: ['reload', 'fire', 'reload', 'reload', 'ultimate', 'dodge', 'reload', 'fire'],
      critChance: 0.12,
      zoneSpeedMult: 2.3,
      image: '/enemychapter3brigantine.png',
      portrait: '/enemychapter3brigantine.png',
    },
    the_mirage: {
      // DECOYS debut — False Court paints fake gold across your aim bar.
      // Crimson bands dud the shot; find the real lane before you lock.
      id: 'the_mirage', name: 'The Mirage', hpBase: 380, minDmg: 24, maxDmg: 38,
      shipSpeed: 10, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.18,
      special: { name: 'False Court', aimAttack: 'decoys', aimPasses: 2, line: 'Lantern-rigs bloom down her rail — a court of false colors, and only one throne among them.' },
      pattern: ['reload', 'special', 'fire', 'reload', 'dodge', 'fire', 'special', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.5,
      image: '/enemychapter3brigantine.png',
      portrait: '/enemychapter3brigantine.png',
    },
    the_doorman: {
      // HARDENED LOCK debut — Iron Etiquette plates your lock: the first tap
      // only cracks it, the second lands. The heavy door you knock on twice.
      id: 'the_doorman', name: 'The Doorman', hpBase: 420, minDmg: 24, maxDmg: 40,
      shipSpeed: 5, actionMs: 4200,
      magazineSize: 4, shieldPct: 0.24,
      special: { name: 'Iron Etiquette', aimAttack: 'hardened', aimPasses: 2, line: 'Iron shutters slam over every line you’d take — nobody reaches the don in one knock.' },
      pattern: ['reload', 'special', 'reload', 'fire', 'volley', 'reload', 'special', 'fire'],
      critChance: 0.10,
      zoneSpeedMult: 2.2,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    the_stormcaller: {
      // SQUALL debut — Kingmaker's Gale gusts your needle fast-slow mid-sweep.
      // Timing by rhythm fails; watch the needle itself.
      id: 'the_stormcaller', name: 'The Stormcaller', hpBase: 440, minDmg: 26, maxDmg: 40,
      shipSpeed: 9, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.20,
      special: { name: 'Kingmaker’s Gale', aimAttack: 'squall', aimPasses: 2, line: 'She whistles a wind out of dead water, and your gun-deck pitches with it.' },
      pattern: ['reload', 'special', 'fire', 'reload', 'fire', 'volley', 'dodge', 'reload'],
      critChance: 0.14,
      zoneSpeedMult: 2.6,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    the_left_hand: {
      // The don's silencer, now with the ultimate stacked on top — Omertà
      // locks your crew out of the answer while the battery builds.
      id: 'the_left_hand', name: 'The Left Hand', hpBase: 480, minDmg: 26, maxDmg: 42,
      shipSpeed: 8, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.24,
      special: { name: 'Omertà', status: 'silence', magnitude: 1, turns: 2, target: 'player', line: 'The left hand draws a line across his throat, and your crew’s shouts die in the wind.' },
      ultimate: { name: 'The Quiet Word', mult: 2.5, line: 'What the don whispers, the guns repeat.' },
      pattern: ['reload', 'special', 'reload', 'reload', 'ultimate', 'fire', 'dodge', 'reload'],
      critChance: 0.14,
      zoneSpeedMult: 2.7,
      image: '/enemychapter3galleon.png',
      portrait: '/enemychapter3galleon.png',
    },
    the_consigliere: {
      // The last counsel before the throne — marks you for the don (Feeble)
      // and carries the biggest mob ultimate in the raid.
      id: 'the_consigliere', name: 'The Consigliere', hpBase: 520, minDmg: 28, maxDmg: 44,
      shipSpeed: 7, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.26,
      special: { name: 'Marked for the Don', status: 'feeble', magnitude: 0.22, turns: 2, target: 'player', line: 'He reads your name off a short list, and every gun in the court knows where to aim.' },
      ultimate: { name: 'Final Counsel', mult: 2.6, line: 'His advice, delivered all at once.' },
      pattern: ['reload', 'special', 'reload', 'volley', 'reload', 'reload', 'ultimate', 'dodge'],
      critChance: 0.12,
      zoneSpeedMult: 2.5,
      image: '/enemychapter3man-o-war.png',
      portrait: '/enemychapter3man-o-war.png',
    },
    don_finleone: {
      // DON FINLEONE — the fake-final boss. Phase 1: the don at his table,
      // False Court decoys + The Deep Verdict ultimate. Phase 2 the mask
      // drops (MEGALODON) and The Maw check arms; phase 3 is the frenzy,
      // closed by The Sounding (blast or jam him out of the dive, or eat a
      // near-lethal breach). Kills reveal nothing — the margin does.
      // SIX-PHASE FINAL BOSS. The court steps aside and the don eats his way
      // through your whole crew: every phase (the opener included) arms a check
      // that ANY crew ability answers, so the gate is COUNT — six phases, six
      // firings, a full six-berth crew. Miss one and the consequence snowballs.
      id: 'don_finleone', name: 'Don Finleone', hpBase: 880, minDmg: 30, maxDmg: 50,
      shipSpeed: 9, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.30, startCharges: 2,
      special: { name: 'The Don’s Court', aimAttack: 'decoys', aimPasses: 2, line: 'The court closes around the throne — a dozen crowns, and only one that bleeds.' },
      ultimate: { name: 'The Deep Verdict', mult: 2.8, line: 'The don passes sentence, and the water carries it out.' },
      pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'dodge', 'fire', 'reload'],
      critChance: 0.15,
      // Phase 1 opener check — the court itself. Answer him the moment guns are out.
      openingCheck: {
        id: 'the_court', name: 'The Don’s Court', chargeTurns: 2,
        telegraph: 'The whole drowned court trains its guns on your hull at once, waiting on the don’s nod.',
        hint: 'You do not answer a court alone. Call a crew ability — ANY of them — and let your people answer for you.',
        responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
        counteredLine: 'Your crew answers first, and the court’s opening volley scatters wide.',
        failLine: 'Nobody stands with you, and the whole court fires as one.',
        consequence: { kind: 'damagePctMaxHp', value: 0.45 },
      },
      phases: [
        { revivePct: 0.72, damageMult: 1.25, badge: 'The Mask Drops',
          pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'volley', 'dodge', 'reload'],
          dialogueLine: 'You came for a don. The deep sent you something older. Look at the WIDTH of what you’ve been bargaining with.',
          check: {
            id: 'the_maw', name: 'The Maw', chargeTurns: 2,
            telegraph: 'The don’s hull ROLLS — and keeps rolling — a jaw the size of your broadside opening under the waterline.',
            hint: 'A bite that wide can’t be weaved. Call another of your crew — ANY ability answers, so long as someone acts.',
            responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
            counteredLine: 'Your crew throws the maw off its line and it grinds iron instead of deck.',
            failLine: 'The maw takes your ship the way a purse takes a coin.',
            consequence: { kind: 'damagePctMaxHp', value: 0.52 },
          } },
        { revivePct: 0.60, damageMult: 1.35, badge: 'Blood in the Water',
          pattern: ['fire', 'special', 'reload', 'fire', 'reload', 'ultimate', 'volley', 'dodge'],
          dialogueLine: 'There it is. The blood. Now the whole ocean knows where you are.',
          check: {
            id: 'blood_water', name: 'Blood in the Water', chargeTurns: 2,
            telegraph: 'He rakes a long gash down your hull and circles wide — the sea reddening with every pass at the smell of it.',
            hint: 'A wound this loud only draws him back. Put a crew ability on it — ANY one — before he follows the trail in.',
            responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
            counteredLine: 'Your crew answers the wound and the blood-trail goes cold; he loses the scent.',
            failLine: 'He follows the blood straight in and takes the gash wider.',
            consequence: { kind: 'damagePctMaxHp', value: 0.55 },
          } },
        { revivePct: 0.50, damageMult: 1.45, badge: 'The Sounding',
          pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'fire', 'volley', 'dodge'],
          dialogueLine: 'Enough court. Enough colors. The Finndicate was never the family, captain — it was the FEEDING.',
          check: {
            id: 'the_sounding', name: 'The Sounding', chargeTurns: 2,
            telegraph: 'The megalodon SOUNDS — the whole sea dips as he goes deep, gathering water for a breach that will land on your deck.',
            hint: 'You can’t block a falling mountain. A crew ability has to break the dive itself — ANY of them, but someone has to act NOW.',
            responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
            counteredLine: 'The dive breaks — he breaches early, wide, and the wave takes the blow for you.',
            failLine: 'The sea goes still. Then it goes UP.',
            consequence: { kind: 'damagePctMaxHp', value: 0.60 },
          } },
        { revivePct: 0.42, damageMult: 1.55, badge: 'The Undertow',
          pattern: ['special', 'fire', 'fire', 'reload', 'reload', 'ultimate', 'volley', 'reload'],
          dialogueLine: 'Down here, captain, EVERYTHING feeds the family. Even you.',
          check: {
            id: 'the_undertow', name: 'The Undertow', chargeTurns: 2,
            telegraph: 'He circles fast and low and the whole drowned court fires down the whirlpool at once, a wall of iron closing on your hull.',
            hint: 'No single cover holds against a barrage this wide. Call another crew ability — ANY one — before the wall lands.',
            responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
            counteredLine: 'The barrage breaks on your crew’s answer in a wall of spray.',
            failLine: 'The court empties every gun into you at once.',
            consequence: { kind: 'damagePctMaxHp', value: 0.62 },
          } },
        { revivePct: 0.34, damageMult: 1.70, badge: 'The Last Bite',
          pattern: ['fire', 'special', 'reload', 'ultimate', 'fire', 'reload', 'volley', 'dodge'],
          dialogueLine: 'You crossed the WHOLE family to get here. Let me show you what the family is FOR.',
          check: {
            id: 'the_last_bite', name: 'The Last Bite', chargeTurns: 2,
            telegraph: 'The megalodon rears his whole bulk from the water for one final lunge — and for one breath his throat hangs open above your deck.',
            hint: 'A window this brief opens once. Your LAST crew ability, right now, straight down the gullet — any of them — or the lunge lands.',
            responses: ['brace', 'shield', 'snare', 'heal', 'burst'],
            counteredLine: 'Your crew fires straight down his throat and the last bite dies in the water.',
            failLine: 'The last bite comes down, and the deep finally closes over you.',
            consequence: { kind: 'damagePctMaxHp', value: 0.78 },
          } },
      ],
      zoneSpeedMult: 2.4,
      image: '/enemychapter3man-o-war.png',
      portrait: '/enemychapter3man-o-war.png',
    },
  },
  sequence: ['court_herald', 'the_mirage', 'the_doorman', 'the_stormcaller', 'the_left_hand', 'the_consigliere'],
  bossId: 'don_finleone',
  tides: { slots: [2, 5], maxTier: 2 },
  loot: [
    // Signature: the don's own ring — boss-killer legendary.
    { id: 'dons_signet',    label: 'The Don’s Signet', image: null, emoji: '💍', rarity: 'legendary', weight: 10 },
    { id: 'doubloons_800',  label: '+800 ⟡',   image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 28 },
    { id: 'doubloons_1500', label: '+1,500 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 24 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 22 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 16 },
  ],
  killRewards: {
    court_herald:    { gold: 200,  xp: 220  },
    the_mirage:      { gold: 220,  xp: 240  },
    the_doorman:     { gold: 240,  xp: 260  },
    the_stormcaller: { gold: 260,  xp: 280  },
    the_left_hand:   { gold: 290,  xp: 310  },
    the_consigliere: { gold: 320,  xp: 340  },
    don_finleone:    { gold: 2500, xp: 3000 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: 'Past the thrown gates the water goes still and black, and the don’s flagship sits at anchor in the middle of it — lit like a feast, silent like a courtroom.' },
    { speaker: 'boss', text: 'Sit down, captain. You’ve crossed my whole family to reach this table — the least I can do is hear your last request.' },
    { speaker: 'player', text: 'I read your books, Finleone. Every coin accounted for. Almost every coin.' },
    { speaker: 'boss', text: '...So. You found the margin.' },
    { speaker: 'boss', text: 'Then you know why NOBODY leaves this water. Guns out, captain. The court is in session.' },
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
