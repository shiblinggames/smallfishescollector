import type { AffixId } from './raidAffixes'

export const ENEMY_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/enemy-arts/'

// 'repair' is a player-only action (consumes a turn to use a repair kit).
// Enemy `pattern` arrays never include it and `pickEnemyAction` never
// returns it. It lives in this union only so the same action type
// flows through resolveTurn for both sides.
// 'mega' is a PLAYER-only Man-o-War augment attack (a 4-charge super-volley).
// Enemy patterns / pickEnemyAction never produce it; it lives in the union so
// the same resolveTurn handles it for the player.
// 'special' (Ch4): the enemy casts its authored special ability this turn
// (BroadsideEnemy.special). The crew-ability analog, applying a STATUS from
// the shared pipeline (lib/statuses) to the player or to itself, OR (raid 8)
// an AIM-BAR ATTACK that strikes the player's lock-in minigame instead of
// their hull. Slot it into the pattern like any other action; enemies without
// a `special` config treat the slot as a reload (see pickEnemyAction).
// 'ultimate' (raid 8): the enemy spends its ENTIRE full magazine on its
// authored signature attack (BroadsideEnemy.ultimate). The enemy-side mirror
// of the player's Mega. The slot only fires at a FULL magazine (the pips glow
// as the tell); short of that it degrades to a reload and re-attempts, so the
// player can always see it building and answer it (burn the charges down,
// shield, or brace to dodge).
export type EnemyAction = 'reload' | 'fire' | 'volley' | 'dodge' | 'repair' | 'mega' | 'special' | 'ultimate'

/** Raid-8 aim-bar attacks. Enemy specials that strike the PLAYER'S AIM BAR
 *  rather than their hull, for the player's next `aimPasses` lock-ins:
 *    decoys  . False-Colors decoy bands appear on every afflicted pass
 *               (locking a crimson fake duds the shot).
 *    hardened. The lock is PLATED: the first tap only cracks it (the bar
 *               keeps sweeping), the second tap lands the real judgment.
 *    squall  . The needle gusts: its sweep speed surges and dies mid-pass,
 *               so timing by rhythm alone fails. */
export type AimAttackId = 'decoys' | 'hardened' | 'squall'

/** Ch4 enemy special. One authored cast per enemy, slotted into its pattern.
 *  TWO shapes, exactly one per special:
 *   - STATUS cast: `status` (a lib/statuses id) + magnitude/turns/target, *     'player' = a debuff thrown at you, 'self' = a buff it gives itself.
 *   - AIM-BAR attack (raid 8): `aimAttack` + optional `aimPasses` (default 2)
 *    . Afflicts the player's next N lock-ins instead of touching hull/stats.
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
  /** SUMMON ART. When set, firing this special plays the same full-screen
   *  splash a PLAYER crew ability plays, with this image. Built for Finn: he
   *  absorbed the six giants, so he calls on them exactly the way you call on
   *  your crew, and the player reads the grammar instantly because it is
   *  their own. summonLabel is the small line above the name. */
  summonImage?: string
  summonLabel?: string
  /** Accent for the splash. Defaults to the enemy-special purple. */
  summonColor?: string
}

/** Raid-8 enemy ULTIMATE. The signature attack an enemy unleashes by spending
 *  its ENTIRE full magazine (see the 'ultimate' action). `mult` scales a normal
 *  minDmg..maxDmg roll (a volley is ×2 for 3 balls; size ultimates ~×2.4–3 for
 *  4). Never crits. The number is authored, not swingy. Dodge rules match a
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
/** ── A BOSS'S OWN CREW ABILITY ──────────────────────────────────────────────
 *  Finn absorbed the six giants, so he fights the way the PLAYER fights: he
 *  calls on them. Deliberately modelled one-to-one on the six legendary crew
 *  classes, because the player already knows exactly what each of those does,
 *  and having them turned around is the whole point of the fight.
 *
 *    leviathan     Doby      one heavy shot that ALWAYS lands a full crit
 *    blitz         Mako      a barrage of light shots, harder as you weaken
 *    abyssal_tide  Catfish   heals himself and raises a shield
 *    foresight     Dole      reads you, and slips the next shot
 *    vengeance     Laz       will not die to the next killing blow
 *    requiem       Mira      marks you: everything hits harder until it lapses
 *
 *  It is OFF-TURN. It fires alongside his action, never instead of it, exactly
 *  like a player firing a crew ability and still taking their shot. One ability
 *  belongs to one phase and never appears again, so each phase is a distinct
 *  fight and the megalodon lands LAST, mirroring it being the player's final
 *  catch of the six. */
export type BossAbilityKind =
  | 'leviathan' | 'blitz' | 'abyssal_tide' | 'foresight' | 'vengeance' | 'requiem'

export interface BossAbility {
  kind: BossAbilityKind
  name: string
  /** The giant he is calling on. Plays through the same full-screen splash a
   *  player's crew ability uses. */
  summonImage: string
  summonColor?: string
  /** Kind-specific magnitude. leviathan/blitz: damage multiplier.
   *  abyssal_tide: fraction of max HP healed. requiem: bonus damage taken. */
  value?: number
  /** blitz only: how many light shots. */
  shots?: number
  /** abyssal_tide only: shield granted, as a fraction of his max HP. The heal
   *  lives in `value`. Defaults to 0.08. */
  shieldValue?: number
  /** How many turns the effect lasts, where the kind is a lasting one
   *  (foresight / vengeance / requiem). Default 3. */
  turns?: number
}

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
  /** Plate this phase revives behind, as a fraction of the boss's max HP.
   *  Overrides the enemy's flat `shieldPct` for THIS phase only, so armour can
   *  escalate across a fight instead of every phase reopening at the same wall.
   *  Unset = the enemy's own shieldPct, i.e. exactly the old behaviour. */
  shieldPct?: number
  /** Optional telegraphed mechanic check that ARMS the instant this phase
   *  begins (answer it with the right crew play or eat the consequence). */
  check?: BossMechanicCheck
  /** The one crew-style ability this phase owns (see BossAbility). Off-turn. */
  ability?: BossAbility
  /** Backdrop for this phase. When set, the battle stage cross-fades to it on
   *  the transition, so the sea escalates with him instead of one backdrop
   *  holding for the whole fight. Falls back to the raid-wide zone art. */
  bgImage?: string
  /** AEGIS (Sal Brackwater, phase 3): the phase opens behind a wall that drinks
   *  EVERY shot whole (zero damage) until it breaks. A player Mega shatters
   *  it instantly (the intended discovery. Hints stay oblique); without one
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
 *  roster isn't hard-locked by one class. See [[raid-mechanic-checks]].
 *
 *  Each `MechanicResponse` maps to a deliberate CREW-ABILITY play RaidCombat can
 *  read. Never an incidental action (a plain Dodge or a normal crit do NOT
 *  count, so answering a check is a real decision, found by trial and error):
 *    brace . An Anchor brace is active (anchorReductionRef > 0)
 *    shield. A Tidecaller shield is up (abyssalShieldRef > 0)
 *    snare . The enemy's dodge is jammed by a Snare (snareDodgeTurnsRef !== 0)
 *    heal  . A heal ABILITY fired in the window (Mender / Tidecaller / repair kit)
 *    burst . A legendary big-shot ABILITY fired in the window (Leviathan / Apex) */
export type MechanicResponse = 'brace' | 'shield' | 'snare' | 'heal' | 'burst'

export interface BossMechanicCheck {
  id: string
  name: string          // banner label, e.g. 'The Big Gun'
  telegraph: string     // warning line the moment the wind-up begins
  /** A NUDGE toward the KIND of answer (defend / disrupt / survive / hit hard),
   *  shown on the enemy stats popup. Deliberately does NOT name the exact crew
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
    // Ch4 status pipeline: a lingering PLAYER debuff (feeble = +dmg taken, weaken =
    // −dmg dealt, slowed = −turn-order/fleeing), with an optional instant chip of
    // damage. A less instantly-lethal, more TEXTURED fail than a flat one-shot;
    // a Mender cleanse can lift it. Magnitude follows the status: feeble/weaken =
    // fraction (0.3 = 30%), slowed = flat speed points.
    | { kind: 'status'; status: 'weaken' | 'feeble' | 'slowed'; magnitude: number; turns: number; dmgPct?: number }
}

export interface BroadsideEnemy {
  id: string
  name: string
  hpBase: number
  minDmg: number
  maxDmg: number
  /** Ship speed (enemy Initiative): turn-order roll + aim-bar target speed. The
   *  enemy's DODGE contest is driven by its `accuracy`, not this — hull is
   *  Initiative-only, mirroring the player (Navigation is the player's dodge). */
  shipSpeed: number
  /** Gunnery accuracy — this enemy's SOLE number in the dodge contest (hull is
   *  Initiative-only now and folded in here at generation). It is rolled BOTH
   *  ways: `d20 + accuracy` when the enemy fires at a dodging player, AND
   *  `d20 + accuracy` when the enemy itself dodges the player's shot — each
   *  against the player's `d20 + Navigation`. Size it to the nav a player has by
   *  this enemy: accuracy ≈ (their nav) − ~6 lands a clean dodge ~77% of the
   *  time, the rest grazing for 50%. Higher = harder to dodge / better dodger.
   *  Default 0 = dodge ≈ free. */
  accuracy?: number
  /** Chapter-4 magazine: how many cannonballs this enemy can BANK (default 3).
   *  Volley cost stays 3 everywhere. A 4-slot enemy carries a buffer ball, so
   *  it can volley and still hold a shot, fire longer strings, and its
   *  reload-at-max feint window moves to the bigger cap. Deeper clip = meaner,
   *  less predictable cadence; nothing special triggers at full (enemy
   *  ULTIMATES at full magazine are a raid-8 layer on top of this). */
  magazineSize?: number
  /** Chapter-4 baseline shield: fraction of max HP this enemy starts EVERY
   *  fight shielded for (the Warded-affix machinery, made a first-class stat).
   *  Combines with the Warded affix / Warding curse by MAX, not sum. */
  shieldPct?: number
  /** Raid-8 SHARK'S BITE. The shared signature of Don Finleone's court. When
   *  one of these sharks lands a shot on you (a real hit; a dodge/brace/full
   *  shield spares your rack), this is the chance (0–1) it also tears one loaded
   *  cannonball off your magazine. Reload recovers it. Default 0 (no bite). */
  chargeBiteChance?: number
  /** Chapter-4 special ability, cast when the pattern hits a 'special' slot. */
  special?: EnemySpecial
  /** PHASE 1's crew-style ability (BossPhase.ability covers phases 2+, since
   *  the phases array starts at phase 2). Off-turn, same as those. */
  phaseAbility?: BossAbility
  /** PHASE 1's backdrop, same reasoning as phaseAbility. */
  phaseBgImage?: string
  /** Raid-8 ultimate, unleashed when the pattern hits an 'ultimate' slot AT A
   *  FULL MAGAZINE (short of full it degrades to reload and re-attempts). The
   *  full pips glow as the tell. The enemy-side mirror of the player's Mega. */
  ultimate?: EnemyUltimate
  /** Legacy: real-time action interval. Kept for backwards-compat readouts; no longer drives combat. */
  actionMs: number
  /** Scripted action loop. Cycles in order every turn. */
  pattern: EnemyAction[]
  /** Flat crit chance (0–1) on each fire. Players crit via the skill-based
   *  aim bar; enemies don't have that, so this stat gives them the same
   *  outcome via RNG. On crit, damage is multiplied by 1.5×. */
  critChance: number
  /** Cannonballs already chambered when this enemy becomes the active target, *  the raid-wide "First Cut" trait (Tollmaster Spet's barracuda crew open
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
  /** BAKED elite affix. Permanently attaches one of the challenge-mode elite
   *  affixes (raidAffixes) to THIS specific enemy, in normal AND challenge play
   *  (RaidGame reads it and passes it as the affix prop). Unlike a random
   *  challenge-elite roll it does NOT apply the ×1.5/×1.25 elite stat bump. The
   *  enemy's own stats stand, then challenge scaling multiplies them as usual.
   *  Used for named enforcers whose signature IS an affix (e.g. The Leech's
   *  Vampiric lifesteal, The Breaker's Ironclad plating). */
  affix?: AffixId
  /** The Cartographer's raid. "Mist Veil." A drifting fog band
   *  overlaid on the player's aim bar during lock-in, partially
   *  obscuring the gold Critical center. `aimFogDensity` is the band's
   *  opacity (0 = none, ~0.4 = thin/scout-tier, ~0.7 = deep/boss-tier).
   *  `aimFogName` labels it on the enemy nameplate (mirrors
   *  `abilityName`). The fog is always-on while this enemy is the
   *  active target. Symmetrical with Krust's Carapace cadence (every
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
   *  a clean Critical. The enemy reads as a fast, evasive ship you can't get a
   *  steady bead on. The zone's base pace already scales with shipSpeed, so a
   *  slow brute stays easier to crit even with a mult. Undefined = 1. */
  zoneSpeedMult?: number
  /** The Blockade (Ch4, Raid 7). "Rolling Plate." The gold CRIT
   *  band drifts WITHIN the moving target zone (a target inside the target):
   *  the crew rolls its armor plating, so the seam never sits still. Value is
   *  the seam's drift speed (0.5 gentle, 1.2 fast). The seam roams the WHOLE
   *  zone including the graze fringe. Hitting the seam always crits, but
   *  chasing it into the fringe is a wager (a near miss out there only
   *  grazes). Hit/graze still judge off the zone center. Undefined = the seam
   *  sits centered like every other raid (zero engine cost elsewhere). */
  critDrift?: number
  /** Nameplate/stats-popup label for the rolling seam (mirrors aimFogName). */
  critDriftName?: string
  /** The Cartographer's raid. "Riposte." When this enemy executes a
   *  `dodge` action and the player's same-turn action was offensive
   *  (`fire` or `volley`), `parryChance` (0-1) rolls. On success, the
   *  enemy rolls its damage normally (minDmg..maxDmg, no crit), then
   *  multiplies by `parryDamagePct` (0-1) and deals that to the
   *  player. `parryName` labels it on the enemy nameplate (mirrors
   *  `abilityName` / `aimFogName`). Unlike a normal enemy fire, the
   *  parry counter does not consume a charge. It's a free reflection
   *  off the dodge. All three fields undefined on every non-Cartographer
   *  enemy means zero rendering + zero engine cost. */
  parryChance?: number
  parryDamagePct?: number
  parryName?: string
  /** The Quartermaster raid (Chapter 3, Raid 6). "Flare Barrage." Every few
   *  turns the keeper throws up false flares the player must swat (reactive
   *  whack-a-mole) before they can act. `decoyCount` is the per-ENEMY ladder
   *  tier (1-3), so the mechanic escalates up the raid (a barrage every 3 turns):
   *    1. Gentle warmup: ~5 flares, generous fuses.
   *    2. Pressure: ~7 flares, tighter fuses, heavy clustering.
   *    3. The boss: ~9 flares, tightest fuses, PLUS (sparse) FEINTS, *        red "live shell" flares you must NOT tap (tapping one chips you; the
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
  /** The Coffers (Chapter 3). "Repossession." At the START of this fight the
   *  crooked Quartermaster reclaims ONE of the player's equipped raid items for
   *  the whole fight: its COMBAT effects (the per-shot damage mults + on-hit
   *  procs + parry) don't apply. Prefers an item with an offensive effect so
   *  the theft always bites. One-time at fight start, no per-turn timer.
   *  `repossessName` labels it on the nameplate / intro line. Fight-start stats
   *  (HP, speed, starting cannonballs) stay baked. He takes your guns' edge,
   *  not your hull. Undefined on every other enemy = no effect. */
  repossess?: boolean
  repossessName?: string
  /** Optional two-phase boss config. The phase 2 trigger is a "false
   *  defeat". The boss appears to sink, then rises back at `revivePct`
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
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ancient' | 'cosmetic'
  weight: number
  shipSkinId?: string  // if set, render player's ship with this skin applied
}

/** Pre-fight dialogue line. Shown in an RPG-style modal before the boss
 *  battle begins. `narrator` lines render without a portrait; `boss` and
 *  `player` lines render with the speaker's portrait/avatar. */
export interface BossDialogueLine {
  speaker: 'boss' | 'player' | 'narrator' | 'crew'
  /** For `crew` lines. The legendary answering back on your side of the stage
   *  (name + card-art portrait). Spread a CREW_SPEAKER entry in. */
  crew?: { name: string; portrait: string }
  /** Wrap a word or phrase in *asterisks* to hit it in the scene accent. */
  text: string
  /** A held silence, in ms, BEFORE this line types. The difference between a threat
   *  and a sentence. */
  pause?: number
  /** A hit on this line. 'shake' rocks the frame, 'flash' blows it out. */
  fx?: 'shake' | 'flash'
}

/** The legendary crew as pre-fight SPEAKERS. They hold your side of the boss
 *  stage and trade barbs with the villain. Portrait = card art (same as the
 *  story-node GUIDE map). Use as `{ speaker: 'crew', ...CREW_SPEAKER.mako, text }`.
 *  Which crew are aboard for a given fight follows the campaign: Doby + Kat from
 *  the start, then one legendary per chapter (see [[cutscene-living-crew]]). */
const CREW_ART_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/card-arts/`
export const CREW_SPEAKER = {
  doby: { crew: { name: 'Doby', portrait: `${CREW_ART_BASE}Doby_Mick_v2.png` } },
  kat:  { crew: { name: 'Kat',  portrait: `${CREW_ART_BASE}Catfish.png` } },
  mako: { crew: { name: 'Mako', portrait: `${CREW_ART_BASE}Mako_Shark.png` } },
  dole: { crew: { name: 'Dole', portrait: `${CREW_ART_BASE}Dole.png` } },
  laz:  { crew: { name: 'Laz',  portrait: `${CREW_ART_BASE}Coelacanth.png` } },
  mira: { crew: { name: 'Mira', portrait: `${CREW_ART_BASE}Mira.png` } },
} as const

/** Is this loot row currency, or a real item? Mirrors lootCategory in raidChallenge:
 *  a `doubloons_*`, `gems_*` or `pack*` id is currency, anything else is a unique. */
export function isUniqueLoot(l: RaidLootItem): boolean {
  return !(l.id.startsWith('doubloons_') || l.id.startsWith('gems_') || l.id.startsWith('pack'))
}

export interface BossRaidConfig {
  raidId: string
  /** A FIXED share of the crate reserved for uniques you do not yet own, regardless of
   *  how many are left.
   *
   *  Without it, the crate is one weighted roll and owned uniques are simply REMOVED
   *  from the pool. Which quietly shrinks the uniques' share as you complete a set.
   *  The Quartermaster's Ghost showed how bad that gets: his six Cache items start at
   *  50% of the crate and decay to 14% for the LAST one, so the item you specifically
   *  need is by far the hardest to get, and everyone hits that wall. That is an
   *  artifact of the roll, not a decision anyone made.
   *
   *  Set it and the roll becomes two-stage: `uniqueShare` of the time you get one of
   *  the uniques you are missing (picked among them by weight), otherwise currency. The
   *  odds no longer care how far through the set you are. */
  uniqueShare?: number
  /** Challenge-mode extra: every intro enemy that carries a BAKED signature
   *  affix ALSO gets one random second affix, merged, rolled fresh each run
   *  (guaranteed elite, different every attempt). Keeps the enforcer's identity
   *  and stacks a surprise on top. Only meaningful on a challenge config. */
  mergeRandomAffix?: boolean
  raidTitle: string
  bossDefeatedText: string
  /** WHICH AIMING INSTRUMENT THIS WHOLE RAID IS FOUGHT ON.
   *
   *  'bar'  (default) = the linear raid aim bar. Every raid in the game.
   *  'dial' = the FISHING dial, borrowed whole from the fishing game. The
   *           mechanic is identical to the bar (a needle sweeps, you lock it
   *           inside the band) but wrapped onto a circle, and the band is not an
   *           abstract marker: it is the ENEMY SHIP, orbiting the dial. You are
   *           tracking him around the compass and firing when you have him.
   *
   *  Only the Finn finale uses this. It is the mechanical half of the
   *  convergence: he made the player his angler for the entire campaign, so the
   *  last fight is fought on the angler's own instrument, and the player's
   *  EQUIPPED ROD/HOOK/LINE widen the bands exactly as they do when fishing.
   *  Every fishing hour the player has put in shows up here as a wider shot. */
  aimStyle?: 'bar' | 'dial'
  /** A bespoke DEFEAT beat for this boss, instead of the ordinary 1.3s sink.
   *  Only worth it where the kill is the end of something: the sink that reads
   *  fine on a mob is the weakest moment in a six-phase finale. Lines are shown
   *  one at a time; the LAST one is styled as narration, not speech. */
  defeatSequence?: { lines: string[] }
  /** A crit STREAK ramp baked into the raid itself, rather than drafted as a
   *  Gauntlet boon. Same machinery as Cannonade: consecutive landed CRITS ramp
   *  your damage, any landed non-crit resets it. The streak is per-ENEMY, and
   *  a phased boss is one enemy, so it runs the WHOLE fight across every phase.
   *  Built for the finale: hold your rhythm all the way through and you are
   *  paid for it, which is the fishing perfect-streak feel brought into combat. */
  critStreak?: {
    perStack: number
    maxStacks: number
    label?: string
    /** At this streak or higher, the player's shots IGNORE the enemy shield
     *  entirely. Turns a long chain into the answer to an armoured boss: the
     *  plate stops mattering as long as you keep the rhythm, and breaking the
     *  chain hands it straight back to him. */
    pierceAt?: number
  }
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
   *    - vault    : The Quartermaster's lantern-lit gun-deck (deep indigo storm-dark, warm gold lamp glow)
   *    - brackwater: Sal Brackwater's estuary, where the salt meets the fresh. Tannin-brown
   *                 water under a low bronze haze, silt in the air, mangrove dark on the
   *                 horizon. The water is DEAD FLAT and nothing moves on it, because that
   *                 is the whole tell: when the chop goes out of the water, he is already
   *                 deciding. No sun-glitter, no chop, no reflection to speak of. */
  atmosphere?: 'dusk' | 'sunset' | 'overcast' | 'fog' | 'harbor' | 'vault' | 'brackwater'
  /** Fishing-zone battle backdrop, chosen by chapter feel. When set, RaidCombat
   *  drops the procedural sky/cloud/fog scene entirely and renders the matching
   *  fishing background image (RAID_ZONE_BG) plus a readability scrim. Chapter I
   *  → shallows, II → open_waters, III → deep, IV → abyss (Throne → ancient_deep).
   *  Undefined keeps the procedural `atmosphere` scene (practice skirmish, Gauntlet). */
  zone?: 'shallows' | 'open_waters' | 'deep' | 'abyss' | 'ancient_deep'
  /** Optional dialogue sequence shown right before the boss fight starts.
   *  Tap to advance each line; the last line's button is "Engage" which
   *  closes the modal and mounts the combat. */
  preFightDialogue?: BossDialogueLine[]
  /** The pre-fight scene's color temperature. Gold when unset. */
  dialogueAccent?: string
  /** Optional mid-raid Tide events (see lib/tides.ts). `slots` lists
   *  the encounter indices AFTER which a tide fires (e.g. [3, 6] fires
   *  one tide after the 3rd kill and another after the 6th).
   *  `maxTier` caps the eligible pool. The Cartographer's raid is
   *  the first with `maxTier: 1`; later, longer raids bump this to
   *  unlock stronger effects from the same pool. Undefined = no tides
   *  for this raid (Pete + Krust stay untouched). */
  tides?: {
    slots: number[]
    maxTier: 1 | 2 | 3 | 4
  }
  /** When true, a guaranteed one-time "reprieve" choice fires right before the
   *  boss fight (heal / +damage / refresh a crew ability). A catch-your-breath
   *  beat for a hard finale. Used by the Throne (Don Finleone). */
  preBossReprieve?: boolean
  /** Baseline gunnery accuracy for EVERY enemy in this raid (see
   *  BroadsideEnemy.accuracy). Set once per raid, sized to the navigation a
   *  player has by the time they reach it, so dodge stays a strong read
   *  (~75-80% clean) instead of a free 0. Within the raid, faster ships stay
   *  naturally harder to dodge — each enemy's shipSpeed is folded into its
   *  accuracy at generation, so one number still gives a built-in spread. An
   *  individual enemy can override with its own `accuracy`. Undefined = 0
   *  (dodge ≈ free, pre-2026-06 behavior). */
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
  // ANCIENT sits ABOVE legendary and belongs to Finn's two spoils alone. The
  // ladder already spends grey, green, blue, violet and gold, and the forge
  // treatments own salmon and lavender, so crimson is the one register left,
  // and it reads as older and angrier than gold.
  ancient:   '#e0455a',
  // COSMETIC is not a rung on the ladder, it is a different KIND of drop: a
  // hull skin changes nothing about how you fight. Reading them as epic put
  // them in the same purple as real power, so they get their own register.
  cosmetic:  '#2dd4bf',
}

/** Zone → fishing-background JPG (files live in /public, shared with the fishing
 *  game's ZONE_BG). A raid config's `zone` resolves through this to the image
 *  RaidCombat paints behind the fight. */
export const RAID_ZONE_BG: Record<NonNullable<BossRaidConfig['zone']>, string> = {
  shallows:     '/shallows.jpg',
  open_waters:  '/openwaters.jpg',
  deep:         '/deep.jpg',
  abyss:        '/abyss.jpg',
  ancient_deep: '/ancient.jpg',
}

// Per-raid campaign battle backdrop, keyed to each boss's story LOCATION, so
// every campaign raid reads as its own place (Pete's sunset cove, the Tollmaster's
// strait, Ruse's black-market harbor, the Don's abyssal throne, etc.) instead of
// the five shared zone photos above. Used for the raid's MOB fights. RaidGame
// prefers this by raidId and falls back to RAID_ZONE_BG for anything not listed
// (challenge/side variants like the Quartermaster's Ghost, the practice skirmish).
export const RAID_LOCATION_BG: Record<string, string> = {
  corsairs_reckoning: '/raid-corsairs-reckoning.jpg', // Barnacle Pete — sunset Shallows cove
  captain_krust:      '/raid-krust.jpg',              // Captain Krust — overcast shipping shoals
  cartographer:       '/raid-cartographer.jpg',       // The Cartographer — the Sounding Fog
  tollmasters_cut:    '/raid-tollmaster.jpg',         // Tollmaster Spet — the toll-chain strait
  coffers_fleet:      '/raid-harbor-fleet.jpg',       // Admiral Ruse — the black-market harbor
  the_quartermaster:  '/raid-quartermaster.jpg',      // The Quartermaster — storm fortress-vault
  the_blockade:       '/raid-blockade.jpg',           // Sal Brackwater — the brackish estuary
  the_throne:         '/raid-throne.jpg',             // Don Finleone — the Ancient Deep throne
  the_sunken_hand:    '/finn_bg1.jpg',                  // Finn — the ring of drowned giants at a wrong dawn
}

// The BOSS-fight variant of each location — the same place escalated for the
// final showdown: dramatic weather + the boss threat looming (Pete's flagship in
// a burning-sunset storm, the Quartermaster's fortress up close, Sal rising from
// the swamp, the Finleone megalodon over the throne). RaidGame uses this on the
// boss round only, falling through to RAID_LOCATION_BG for a raid without one.
export const RAID_BOSS_BG: Record<string, string> = {
  corsairs_reckoning: '/raid-corsairs-reckoning-boss.jpg',
  captain_krust:      '/raid-krust-boss.jpg',
  cartographer:       '/raid-cartographer-boss.jpg',
  tollmasters_cut:    '/raid-tollmaster-boss.jpg',
  coffers_fleet:      '/raid-harbor-fleet-boss.jpg',
  the_quartermaster:  '/raid-quartermaster-boss.jpg',
  the_blockade:       '/raid-blockade-boss.jpg',
  the_throne:         '/raid-throne-boss.jpg',
  // bg2 (the drowned armour cathedral), not bg6 (his throne). The card shows a
  // 230px CENTRE SLICE at partial opacity, and bg6's middle is the dark inside
  // of the jaws: it measured luma 50 and rendered as a black smear. bg2 is 75
  // through the middle with hard structure, so it actually reads at card size.
  the_sunken_hand:    '/finn_bg2.jpg',
}

export const CORSAIRS_RECKONING: BossRaidConfig = {
  raidId: 'corsairs_reckoning',
  enemyAccuracy: 4,
  raidTitle: "The Corsair's Reckoning",
  bossDefeatedText: 'Barnacle Pete Defeated',
  atmosphere: 'sunset',
  zone: 'shallows',       // Chapter I. The Shallows
  enemies: {
    // Patterns punish a reload-fire-reload-fire autopilot (player fires on
    // even turns, reloads on odd). Difficulty rises with enemy tier; the
    // punishment lands in the FIRST few turns of each cycle so it still
    // matters in short mob fights.
    brute: {
      id: 'brute', name: 'Reef Raider', hpBase: 20, minDmg: 2, maxDmg: 5,
      shipSpeed: 4, actionMs: 4500,
      // 4-turn loop. Pure trade. No surprises, no punishment turns.
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
      // Fastest ship in the raid (speed 7). Wins speed rolls more often
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
      // fire turns. Three wasted shots if the player doesn't break
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
    { id: 'finndicate_hull',      label: 'Finndicate Hull',         image: null,                     emoji: '🚢',       rarity: 'cosmetic',      weight: 3,  shipSkinId: 'finndicate_hull' },
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
    { speaker: 'boss', text: "So another pup thinks they can take old Barnacle Pete. Many've tried, captain. *None've sailed home.*" },
    { speaker: 'boss', text: "I've been raiding these waters since before your grandfather wet his trousers in his first storm. Your crew, your ship, your name, they'll all join the others at the bottom." },
    { speaker: 'crew', ...CREW_SPEAKER.doby, text: "I have swum this coast longer than you have drawn breath, Pete, and I never once heard your name. There is a lesson in that, if you live to learn it." },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "Save your breath, Pete. We're not here to talk. We're here for the plunder." },
    { speaker: 'boss', text: "Plunder?! Hah! The only thing you'll take from me is a swift trip to Davy Jones." },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "He does love the sound of himself. Put a ball through his mainmast, captain, and let us all get on with our day." },
    { speaker: 'boss', text: "Ready your guns. *This is where your story ends.*", pause: 600, fx: 'shake' },
  ],
}

export const CAPTAIN_KRUST: BossRaidConfig = {
  raidId: 'captain_krust',
  enemyAccuracy: 9,
  raidTitle: "Krust's Consignment",
  bossDefeatedText: 'Captain Krust Defeated',
  atmosphere: 'overcast',
  zone: 'shallows',       // Chapter I. The Shallows
  enemies: {
    // Tier-2 roster. Stiffer than Pete's reef: a Finndicate shipping
    // crew that runs cargo on a schedule and does not like being late.
    // 8-fight gauntlet (2 of each) escalating into Krust himself.
    //
    // RAID-WIDE RULE: NO ONE IN THIS RAID EVER VOLLEYS. They plate up
    // behind the Carapace, take a methodical reload-and-trade rhythm,
    // and just keep firing. The player's volley is the answer (it
    // punches through Carapace. See the volley bypass in RaidCombat),
    // so the whole raid is "stack 3 charges, blow open the plate."
    // Per-enemy patterns vary the cadence + dodge density so each
    // tier still has its own read.
    scout: {
      id: 'scout', name: 'Bilge Runner', hpBase: 40, minDmg: 4, maxDmg: 8,
      shipSpeed: 5, actionMs: 4200,
      // Cannon fodder of the consignment crew. Pure trade, no tricks, // the player can mash reload-fire and win. Difficulty starts next.
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
      // Tanky and slow. Defensive wall. Leads with a dodge to absorb
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
      // Pressure comes from the rotation. High fire rate + the
      // Carapace soak. Not from raw speed-roll dominance. Was speed
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
      // trade. Never volleys (the whole crew doesn't. See raid-wide
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
    { id: 'doubloons_600',     label: '+600 ⟡',                image: '/smallpile.png',          emoji: '🪙',       rarity: 'common',    weight: 32 },
    { id: 'doubloons_1200',    label: '+1,200 ⟡',              image: '/dailybonus.png',         emoji: '💰',       rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',           label: '50 Gems',                image: null,                      emoji: GEM_GLYPH,  rarity: 'rare',      weight: 15 },
    { id: 'pack_2',            label: '200 Gems',               image: null,                      emoji: GEM_GLYPH,  rarity: 'epic',      weight: 5  },
    // Special drops. Signature epic (Krust's Carapace) sits at the standard
    // 20% every campaign raid uses, with the Legendary chase (Captain's
    // Carapace) at 5%. Finndicate Hull is the shared chapter-1 trophy skin at
    // 3%. The 4 weight points freed by normalizing the carapace from 24% went
    // back into currency so the table still totals 100. Challenge variant
    // doubles the special rates in raidChallenge.ts.
    { id: 'finndicate_hull',   label: 'Finndicate Hull',        image: null,                      emoji: '🚢',       rarity: 'cosmetic',      weight: 3,  shipSkinId: 'finndicate_hull' },
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
  dialogueAccent: '#7dd3fc',
  preFightDialogue: [
    { speaker: 'narrator', text: "Past the Bilge Strait the water turns cold and the fog thins to a hard gray line. A long iron-sided carrack waits there, riding low under more cargo than any honest captain could explain. The wax on Pete's letter and the seal on her hull match." },
    { speaker: 'boss', text: "C.K. So you're the little hook that's been snagging my freight. I wondered who kept making my couriers late." },
    { speaker: 'crew', ...CREW_SPEAKER.doby, text: "Captain Krust. Pete kept your letters but not his life. You run the Finndicate's cargo." },
    { speaker: 'boss', text: "I move what I'm told to move and I don't ask whose name is on the manifest. That's why I've lasted, and that's why captains like Pete are fodder and captains like me aren't." },
    { speaker: 'crew', ...CREW_SPEAKER.mako, text: "A hauler who is proud he never looks in his own crates. I have eaten braver fish than you for breakfast, Krust." },
    { speaker: 'boss', text: "But you've cost the Finndicate a season's haul, captain, and someone above me will want that back out of you. *I'll just take it out first.*", pause: 500 },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "Someone above you. There is always someone above. This whole sea is just fish too frightened to look up, captain. Let us give this one a reason to." },
    { speaker: 'boss', text: "Strike your colors or strike your guns. Either way this consignment sails on without you." },
  ],
}

export const THE_CARTOGRAPHER: BossRaidConfig = {
  raidId: 'cartographer',
  enemyAccuracy: 14,
  raidTitle: "The Cartographer's Survey",
  bossDefeatedText: 'The Cartographer Defeated',
  atmosphere: 'fog',
  zone: 'open_waters',    // Chapter II. The Open Waters
  enemies: {
    // Tier-3 roster. The Cartographer's chart line sails the Sounding
    // Fog for cover. The deep gray band on the Finndicate's own maps.
    // 8-fight gauntlet (2 of each) escalating into the boss himself.
    //
    // RAID-WIDE RULE: every enemy in this raid carries MIST VEIL. A
    // drifting fog band drawn over the player's aim bar during lock-in,
    // partially hiding the Critical center. Density climbs through the
    // tiers (0.35 scout → 0.70 boss) so the gauntlet visibly thickens.
    // Krust's crew identity was no-volleys + Carapace plating; this
    // crew is the inverse. No plating, but they volley readily, and
    // the fog makes every player aim a real read instead of a flick.
    // The Cartographer himself layers a unique Riposte on top. A
    // chance to counter-hit off any of his dodges.
    // Tides also debut in this raid (slots [3, 6]), adding the
    // between-fight boon/debuff choice that future longer raids will
    // lean into harder.
    scout: {
      id: 'scout', name: 'Drift Scout', hpBase: 48, minDmg: 5, maxDmg: 10,
      shipSpeed: 7, actionMs: 4000,
      // Light cutter ranging ahead of the chart line. Pure trade. No
      // tricks, no dodges. So the player's first taste of Mist Veil
      // lands without other variables in the way. Faster than Krust's
      // scout (5 → 7) so even a clean read still risks losing the
      // speed roll on the first turn. Fog density 0.40 here is the
      // floor for this raid. Every fight reads the fog.
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
      // FIRST introduction to the guaranteed-hit mechanic. Fires a
      // single shot on T4, then volleys on T5 while the player is
      // dodge-gated from the T4 defense (one-dodge-at-a-time rule in
      // RaidCombat). The fire-volley shape is distinct from the
      // Surveyor/Cartographer fire-fire shape later. Same lesson, two
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
      // 0.55 here too, half a tier above the rest of the crew, so
      // the "real test before the boss" is a triple-threat of speed,
      // cadence, and a meaningfully harder aim read. He is also the
      // FIRST enemy in the game to fire on consecutive turns: the
      // T3-T4 double-tap forces a guaranteed hit. Player can dodge T3
      // OR T4 but not both (RaidCombat's one-dodge-at-a-time rule, // `canDodge = lastPlayerAction !== 'dodge'`), so one shot in the
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
      // (6) leaves Mist Veil (0.70. The deep band) as his soft edge,
      // and the back-to-back T4-T5 fires as his hard one. Player sees
      // three reloads stack and knows the punch is coming, but the
      // one-dodge-at-a-time rule guarantees one of T4/T5 lands no
      // matter how they play it. Add the T7 volley off a 2-reload
      // tell and the loop puts 3 guaranteed-bite turns into every 8.
      //
      // Layered on top: RIPOSTE. When the T8 dodge lands against a
      // player attack (fire or volley), 30% chance to counter for
      // 25% of his damage roll. Means even his defensive turn carries
      // threat. The player can't safely fire into his dodge.
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
  // Interleaved sequence. No back-to-back duplicates, every type met
  // by fight 5, low-tier scouts seeded between heavier fights as
  // breathers. Reads as a chartmaker's planned interception rather
  // than the standard 2-of-each block escalation:
  //   1 scout  → recon vanguard
  //   2 reg    → line scout makes contact
  //   3 scout  → second vanguard (recon phase closes here. Tide 1)
  //   4 brute  → heavy hull crashes the line
  //   5 elite  → Surveyor darts in to verify the kill
  //   6 reg    → workhorse closes the net behind him (tide 2)
  //   7 brute  → second heavy as the net tightens
  //   8 elite  → final test, the Cartographer's right hand
  //   9 boss   → The Cartographer
  sequence: ['scout', 'reg', 'scout', 'brute', 'elite', 'reg', 'brute', 'elite'],
  bossId: 'cartographer',
  // Tides fire after the 3rd and 6th kills. One at the close of the
  // recon phase (the 2 scouts + 1 reg "feeler" group), one mid-way
  // through the closing net (after the Surveyor's first appearance
  // and the second workhorse goes down). maxTier 1 keeps the eligible
  // pool to the foundational eight effects in lib/tides.ts. Future
  // longer raids bump this cap to unlock the stronger tier-2+ effects.
  tides: { slots: [3, 6], maxTier: 1 },
  // Same 70/30 currency/special split as Pete + Krust. The Astrolabe
  // pair are the chase items. Mirror the Carapace pair from Krust
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
    { id: 'chartmaker_hull',         label: 'Chartmaker Hull',          image: null,                          emoji: '🚢',       rarity: 'cosmetic',      weight: 5,  shipSkinId: 'chartmaker_hull' },
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
  dialogueAccent: '#9aaecc',
  preFightDialogue: [
    { speaker: 'narrator', text: "The fog thickens until sea and sky blur into one gray wall. Out of it a slow-built galleon glides up, decks stacked with rolled charts and brass-bound sextants. No flags fly. No name painted on the hull." },
    { speaker: 'boss', text: "I heard a young captain was reading my routes. I came up the line to see what kind of eyes were behind it." },
    { speaker: 'crew', ...CREW_SPEAKER.dole, text: "You're the Cartographer. The Finndicate's chartmaker. Krust said his couriers followed your lines." },
    { speaker: 'boss', text: "Names belong to ships. I draw seas. Krust ran cargo, and you put him at the bottom of one of my channels. Now you're on a page of mine too." },
    { speaker: 'boss', text: "Every water you've crossed since Driftwood is marked in the cabin behind me. I knew the shape of your wake *before you knew the shape of your hold*.", pause: 700 },
    { speaker: 'crew', ...CREW_SPEAKER.dole, text: "You drew where I have already been, chartmaker. I read where a captain is going. Only one of those wins a fight, and it is not the man holding the older map." },
    { speaker: 'boss', text: "Lock your gunports if you've any sense. Or don't, and let this fog have you the way it had the others.", pause: 400 },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "Charts and threats, and so proud of both. Let us show him a sea he did not draw, captain." },
  ],
}

export const THE_TOLLMASTER: BossRaidConfig = {
  raidId: 'tollmasters_cut',
  enemyAccuracy: 19,
  raidTitle: "The Tollmaster's Cut",
  bossDefeatedText: 'Tollmaster Spet Defeated',
  atmosphere: 'overcast',
  zone: 'open_waters',    // Chapter II. The Open Waters
  enemies: {
    // Tier-4 roster, Chapter II's second raid (Nav 35). The Gullet's toll crew
    // are barracudas: fast, toothy, and ambush-built.
    //
    // SIGNATURE: "First Cut". The QUICK hulls (scout, elite, boss) open LOADED
    // (startCharges ≥ 1) with fire-leading patterns, so they shoot on the
    // opening bell and steal the first exchange. The slower crew (reg, brute)
    // open cold like a normal raid, giving the player turns to fire first. On
    // top, this raid's patterns run harder than the Cartographer's: more volleys
    // and mid-loop double-taps (consecutive fires the player can only half-
    // dodge, since you can't dodge twice in a row), so the cadence punishes. No
    // plating, no fog, no parry. The threat is raw aggression + the First Cut
    // tempo. The player answers with Spet's own drop (Spet's Primer = 50% /
    // Tollmaster's Primer = 100% chance to open a fight loaded yourself). Caps
    // at the Brigantine art tier. Galleon + Man-o-War held for later chapters.
    scout: {
      id: 'scout', name: 'Silverdart', hpBase: 60, minDmg: 6, maxDmg: 12,
      shipSpeed: 8, actionMs: 3600,
      // Fast young barracuda. FIRST CUT (opens loaded, fires turn 1). Light but
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
      // Spet's chief enforcer. FIRST CUT + the fastest hull in the raid (speed
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
      // The collector himself. FIRST CUT, DOUBLED. Opens with two chambered and
      // double-fires turns 1-2 before the player can reply, then a volley and
      // ANOTHER fire, closing on a single dodge. Five damage turns in eight, the
      // heaviest cadence in the game. No second signature mechanic. The doubled
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
  // skin) rides here at the realistic chase rate now. Higher than the
  // Cartographer's reserve weight, since this is the chapter's second raid.
  loot: [
    // ~70% currency
    { id: 'doubloons_600',         label: '+600 ⟡',     image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',    weight: 30 },
    { id: 'doubloons_1200',        label: '+1,200 ⟡',   image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon',  weight: 20 },
    { id: 'gems_50',               label: '50 Gems',    image: null,              emoji: GEM_GLYPH, rarity: 'rare',      weight: 15 },
    { id: 'pack_2',                label: '200 Gems',   image: null,              emoji: GEM_GLYPH, rarity: 'epic',      weight: 5  },
    // ~30% special drops
    { id: 'chartmaker_hull',       label: 'Chartmaker Hull',       image: null, emoji: '🚢',  rarity: 'cosmetic',      weight: 9,  shipSkinId: 'chartmaker_hull' },
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
  dialogueAccent: '#8fa76b',
  preFightDialogue: [
    { speaker: 'narrator', text: "The fog peels back and the Gullet opens its throat. Ranks of low barracuda hulls sit waiting, guns already run out, hot and loaded." },
    { speaker: 'boss', text: "You came a long way down my channel, captain. Everything that swims this deep pays the toll. Coin, cargo, hull, crew. *I take my cut of all of it*.", pause: 500 },
    { speaker: 'crew', ...CREW_SPEAKER.dole, text: "Tollmaster Spet. You're the one the whole Finndicate funnels its plunder to." },
    { speaker: 'boss', text: "I'm the one who counts it. Krust shipped it, the Cartographer charted it, and it all comes down my throat to be weighed. You sank two of mine. That's a debt." },
    { speaker: 'crew', ...CREW_SPEAKER.doby, text: "Everything down here pays the toll. I have heard that from bigger things than you, collector, and I am still in the water. They are not." },
    { speaker: 'boss', text: "And out here, captain, I always collect first." },
    { speaker: 'boss', text: "Run out your guns if you've got the nerve. Mine already are. *We fire on the bell.*", pause: 600 },
    { speaker: 'crew', ...CREW_SPEAKER.mako, text: "Fire on the bell. How patient. Give the word, captain, and I will show him what fires *before* it." },
  ],
}

// ── CHAPTER III, Raid 5. The Harbor Fleet (The Coffers) ────────────────────
// ADMIN-ONLY (the map node is adminOnly + the route page guards is_admin). The
// Coffers' escort fleet + its admiral. GALLEON-tier hulls. The player's first
// capital-ship fight. SIGNATURE: TBD. The Flare Barrage that used to live here
// moved to Raid 6 (The Quartermaster) so each Coffers raid keeps a distinct
// identity; pick a fresh fleet gimmick in step 4. The admiral runs a PHASE 2
// (normal-boss two-phase starts this chapter). Tier-2 tides. NAMES + ART ARE
// PLACEHOLDERS (working names; Ch2 hull art reused as stand-ins) until step 4.
// Caps at Galleon. Man-o-War held for Chapter IV.
export const THE_COFFERS_FLEET: BossRaidConfig = {
  raidId: 'coffers_fleet',
  enemyAccuracy: 24,
  raidTitle: 'The Harbor Fleet',
  bossDefeatedText: 'Admiral Ruse Defeated',
  atmosphere: 'harbor',  // the Coffers' drowned black-market port, gun-smoke haze
  zone: 'deep',          // Chapter III. The Deep
  enemies: {
    // Ch3 hulls. SIGNATURE = DECOYS: false aim bands scaling 1 → 3 toward the
    // flagship. Admiral Ruse's deception fleet. The showy lionfish crew whose
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
      decoyCount: 2, decoyName: 'False Colors',   // tier 2. Bigger spread
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
      decoyCount: 3, decoyName: 'False Colors',   // tier 3. The whole line lies
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
  tides: { slots: [3, 6], maxTier: 2 },  // tier-2 tides. Chapter III's bigger swings
  // Chapter-III trophy skin (Coffers Hull) drops from BOTH Ch3 raids, lower rate
  // here than the finale. Rest is currency (signature special drops TBD in step 4).
  loot: [
    { id: 'coffers_hull',   label: 'Coffers Hull', image: null,          emoji: '🚢',      rarity: 'cosmetic',     weight: 5,  shipSkinId: 'coffers_hull' },
    // Signature deception-fleet drops. The anti-evasion Tell-Tale Glass (epic)
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
  dialogueAccent: '#dca494',
  preFightDialogue: [
    { speaker: 'narrator', text: "Past the harbor wall the Coffers open up: a drowned market ringed by guns, and a line of Galleons already coming about to meet you." },
    { speaker: 'boss', text: "Far enough, captain. Nobody sails into the Coffers uninvited and lives to count the take." },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "You're a long way from the docks for a harbormaster." },
    { speaker: 'boss', text: "Admiral, to you. I keep this wall, and my gunners fly whatever colors the market needs. You'll never know which gun is the live one until it's already in you." },
    { speaker: 'crew', ...CREW_SPEAKER.dole, text: "A fleet that lies about which gun is loaded. How quaint. I have already told the captain which of yours are bluffing, admiral. Do keep pretending." },
    { speaker: 'boss', text: "Run out your guns. *Mine are already lying to you.*", pause: 700 },
    { speaker: 'crew', ...CREW_SPEAKER.laz, text: "Everything in this drowned market lies. I came back from its floor to say so, admiral. Your painted colors do not frighten a dead man." },
  ],
}

// ── CHAPTER III, Raid 6. The Quartermaster (The Coffers finale) ─────────────
// ADMIN-ONLY (map node adminOnly + route page guards is_admin). The keeper of
// the Cache and his hired guns, behind the counter of the market he runs.
// GALLEON-tier. SIGNATURE: REPOSSESSION. At fight start the keeper reclaims one
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
  // A flat 50% for a Cache item, no matter how many you still need. Under the normal
  // weighted roll his six items start at 50% of the crate and rot to 14% for the last
  // one, so the single item you are actually farming for is the rarest thing he has.
  // Everybody would hit that wall, and it is the worst-feeling part of the whole loop.
  uniqueShare: 0.5,
  enemyAccuracy: 30,
  raidTitle: "The Quartermaster's Ghost",
  bossDefeatedText: 'The Ghost Dispersed',
  atmosphere: 'vault',   // his own lantern-lit gun-deck, and he never left it
  zone: 'abyss',         // Chapter IV. The Abyss
  enemies: {
    ghost: {
      id: 'ghost', name: "The Quartermaster's Ghost", hpBase: 1050, minDmg: 26, maxDmg: 44,
      shipSpeed: 9, actionMs: 3600,
      pattern: ['reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'fire', 'dodge', 'reload', 'volley'],
      critChance: 0.16,
      // SIGNATURE: The Ledger. He fights with the six Cache items he is holding, // your fire, your ice, your sights, your plating, your bearings. All turned
      // on you at once. See AFFIXES.ledger.
      affix: 'ledger',
      // Nothing steals your kit here. Repossession is what he did in LIFE, and it
      // has no place on a boss you are meant to run twenty times: a farm that opens
      // by switching off your build is a farm nobody farms.
      repossess: false,

      // ── FOUR BARS, AND EACH ONE IS A GRIP TO BREAK ────────────────────────────
      // He is a GHOST. You cannot sink him, because there is nothing left to sink.
      // What you can do is prise his fingers off the things he is holding, one at a
      // time, and each bar is one of them: the plating, the powder, the glass. That
      // is why he comes back three times without a single revive needing to be
      // explained away, and it is why the loot and the fight are the same object.
      //
      // HP, sized against the rest of the late game rather than guessed. Effective
      // hull is hpBase x (1 + the revives) + the barrier, which reforms once per
      // fight (not per phase):
      //
      //     1050 x (1 + 0.60 + 0.48 + 0.38) + 158  =  ~2,740
      //
      // For scale, the boss BARS around him: the Quartermaster 1,807, Sal Brackwater
      // 1,575, Don Finleone 3,150. He was built at 997, which was less than half the
      // Ch3 finale and far too little for captains who now hit for 300-480 a shot. He
      // sits above both mid bosses and below the don, which is where a post-Sal Brackwater
      // farm boss belongs. He carries no adds, so this IS the whole encounter: 2,740
      // against the Quartermaster's full raid at 2,387 and the Blockade's at 4,350.
      // Long enough to be a fight, short enough to run again.
      //
      // Each phase arms one telegraphed check, and the three of them deliberately
      // demand THREE DIFFERENT crew plays, so no single roster answers the whole
      // fight: disrupt him, then sustain through him, then stand and take it.
      phases: [
        // ── BAR 2: THE PLATING (Reinforced Hull) ────────────────────────────────
        // He hauls up the plating you never claimed and starts bolting it onto his
        // own hull. Let him and he heals a third of himself back.
        // ANSWER: disrupt. Jam the crane (Snare) or blow it off him (a big shot).
        { revivePct: 0.60, damageMult: 1.0, badge: 'The Plating',
          pattern: ['reload', 'fire', 'dodge', 'volley', 'reload', 'fire', 'dodge', 'fire'],
          dialogueLine: 'Sink me? Lad, I have been at the bottom for years. Try taking something off me instead.',
          check: {
            id: 'the_salvage', name: 'The Salvage',
            telegraph: 'He swings a crane over the rail and hauls up the reinforced plating you never came back for. He means to wear it.',
            hint: 'Disrupt him. He cannot bolt it on if he cannot work.',
            chargeTurns: 2,
            responses: ['snare', 'burst'],
            counteredLine: 'The crane fouls and the plating goes back over the side. He does not take that well.',
            failLine: 'He bolts your plating over his own ribs and the holes close up.',
            consequence: { kind: 'enemyHealPctMaxHp', value: 0.30 },
          } },

        // ── BAR 3: THE POWDER (Incendiary Cannonball) ───────────────────────────
        // He packs the incendiary and holds the match. Ignore it and you cook.
        // ANSWER: survive it. A barrier to eat the shot, or a heal to smother the
        // fire (the burn consequence is cleared by any crew heal, so a roster with
        // sustain has a real out even after it lands).
        { revivePct: 0.48, damageMult: 1.12, badge: 'The Powder',
          pattern: ['fire', 'reload', 'volley', 'fire', 'dodge', 'reload', 'fire', 'volley'],
          dialogueLine: 'You left the fire-shot on my counter. I have had a long time to think about where to put it.',
          check: {
            id: 'the_long_burn', name: 'The Long Burn',
            telegraph: 'He packs the incendiary you passed over and stands there holding a lit match, in no hurry at all.',
            hint: 'Survive it. Get a barrier up, or be ready to put the fire out.',
            chargeTurns: 2,
            responses: ['shield', 'heal'],
            counteredLine: 'The shot bursts against the barrier and burns itself out on open water.',
            failLine: 'Your own fire-shot goes through the deck and the ship starts to cook.',
            consequence: { kind: 'burnDot', pctPerTurn: 0.08, turns: 4 },
          } },

        // ── BAR 4: THE GLASS (Gunner's Sight + Navigator's Compass) ─────────────
        // The last thing he has, and the one that ends captains. He sights down
        // your own glass, takes the bearing, and calls the shot.
        // ANSWER: stand and take it. A brace or a shield. Nothing else gets between
        // you and a shot that is already aimed.
        { revivePct: 0.38, damageMult: 1.2, badge: 'The Glass',
          pattern: ['reload', 'reload', 'fire', 'volley', 'fire', 'dodge', 'reload', 'volley'],
          dialogueLine: 'Every captain I ever armed, I watched sink. I always did keep the good glass back.',
          check: {
            id: 'the_called_shot', name: 'The Called Shot',
            telegraph: "He raises your Gunner's Sight to a dead eye, takes the bearing off your own compass, and holds it. He does not need to hurry.",
            hint: 'Defend. Put something between you and a shot that is already aimed.',
            chargeTurns: 2,
            responses: ['brace', 'shield'],
            counteredLine: 'The shot lands where your hull was and finds a braced wall instead. He mutters something about waste.',
            failLine: 'He fires down your own sights. The shot goes exactly where he meant it to.',
            consequence: { kind: 'damagePctMaxHp', value: 0.45 },
          } },
      ],
      image: '/enemychapter4galleon.png',
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
    // CURRENCY. He is ONE fight with no mobs and no cooldown, so his gem slots are
    // deliberately thin: a crate is a single roll no matter how long a raid is, which
    // made him pay the same crate as an 8-fight raid for an eighth of the time. He
    // was the best gem farm in the game by 3.4x, and worse, his rate DOUBLED once you
    // owned all six Cache items (the unique pool empties and rollLootIndex falls
    // through to 100% currency), so the boss you had finished with quietly became an
    // infinite gem printer. He pays doubloons and the Cache now. Gems are earned by
    // raids you actually have to fight through.
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 48 },
    { id: 'gems_25',        label: '25 Gems',  image: null,             emoji: GEM_GLYPH, rarity: 'rare',     weight: 12 },
  ],
  killRewards: {
    ghost: { gold: 900, xp: 1000 },
  },
  // No tides. The Ledger is the whole fight; a random tide on top would just muddy
  // a boss the player is meant to learn cold and beat on muscle memory.
  dialogueAccent: '#c9a7ff',
  preFightDialogue: [
    { speaker: 'narrator', text: 'The gun-deck is exactly as you left it, down to the lantern oil. The counter is still stocked. The keeper is still behind it, and you can see the shutters through him.', pause: 700 },
    { speaker: 'boss', text: "Dead men keep better books than living ones. Everything you left on my counter, everything you melted down since. I have it all, and I have *all the time there is*.", pause: 600 },
    { speaker: 'crew', ...CREW_SPEAKER.mako, text: "Then you'll not mind us taking it back off you. Twice, if it comes to that." },
    { speaker: 'boss', text: '*They always come back.* That is the one thing I could ever count on.', pause: 800 },
  ],
}

export const THE_QUARTERMASTER: BossRaidConfig = {
  raidId: 'the_quartermaster',
  enemyAccuracy: 28,
  raidTitle: 'The Quartermaster',
  bossDefeatedText: 'The Quartermaster Defeated',
  atmosphere: 'vault',  // the Cache's lantern-lit gun-deck vault, storm-dark finale
  zone: 'deep',          // Chapter III. The Deep
  enemies: {
    // A "FINAL BOSS" duel (Chapter III finale): a SHORT 2-ship intro of two
    // DISTINCT, strong enforcers. The Leech (sneaky glass-cannon) then The
    // Breaker (slow tank). Then the keeper himself as a 4-PHASE epic (no long
    // gauntlet). He carries Repossession (fight start) + escalation via `phases[]`.
    scout: {
      // Sinister + SNEAKY (a lamprey): fast, evasive, and spikes hard on a crit
      //. A glass-cannon assassin that punishes a careless opener. Vampiric: it
      // repairs off the blood it draws, so a slow kill lets it claw back.
      id: 'scout', name: 'The Leech', hpBase: 180, minDmg: 12, maxDmg: 22,
      shipSpeed: 10, actionMs: 3000,
      pattern: ['fire', 'dodge', 'reload', 'fire', 'dodge', 'reload', 'dodge', 'fire', 'reload'],
      critChance: 0.20,
      affix: 'vampiric',
      // A darting lamprey. The crit zone RACES, so landing a clean Critical on
      // it is genuinely hard (you have to catch a fast, narrow window). Already a
      // fast ship (10); a big mult on top of the shipSpeed base makes the zone fly.
      zoneSpeedMult: 2.7,
      image: '/enemychapter3schooner.png',
      portrait: '/raid6_theleech.png',
    },
    reg: {
      // BRUTE (a goliath grouper): slow and TANKY, but every shot is a wrecking
      // blow. Heavy volleys you have to weather or out-pace. Ironclad: his hull
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
      // The keeper himself, a 4-PHASE final-boss fight. SIGNATURE: Repossession, // at fight start he reclaims one of your equipped raid items for the whole
      // fight (the merchant who sold you your edge switches it off). Then he burns
      // through 4 escalating phases (false defeat -> rise again, harder), each a
      // fresh bar + meaner pattern + more damage + a quoted line.
      pattern: ['reload', 'reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'fire', 'reload'],
      critChance: 0.12,
      repossess: true, repossessName: 'Repossession',
      phases: [
        // Phase 2. The debt called in. Faster cadence + a MITIGATION check.
        { revivePct: 0.85, damageMult: 1.15, badge: 'Called In',
          pattern: ['reload', 'fire', 'volley', 'dodge', 'reload', 'fire', 'dodge', 'fire', 'reload'],
          dialogueLine: "You cracked the ledger. You have not cleared the debt.",
          check: {
            id: 'big_gun', name: 'The Big Gun', chargeTurns: 2,
            telegraph: 'The Quartermaster hauls the reserve cannon onto the rail and swings the muzzle toward you.',
            hint: 'A shot this heavy has to be met with a crew ability. A defensive one that gets something between you and the muzzle before it fires. Your own brace/dodge won’t turn it aside.',
            responses: ['brace', 'shield'],
            counteredLine: 'The big shot slams into your cover and glances wide.',
            failLine: 'The reserve cannon speaks, and nothing turned it aside.',
            consequence: { kind: 'damagePctMaxHp', value: 0.75 },
          } },
        // Phase 3. The reserve deck. Volley-heavy + a DISRUPT ("dodge cancel") check.
        { revivePct: 0.72, damageMult: 1.30, badge: 'Reserve Deck',
          pattern: ['reload', 'reload', 'volley', 'dodge', 'fire', 'volley', 'dodge', 'fire', 'reload'],
          dialogueLine: "You think the shelves are bare? I keep a reserve deck for captains like you.",
          check: {
            id: 'cooking_books', name: 'Cooking the Books', chargeTurns: 2,
            telegraph: 'The Quartermaster ducks low behind the counter and starts working the ledger, fast.',
            hint: "Don't let him finish the tally. Fire a crew ability to break it. Something disrupting to foul his concentration, or a heavy-hitting one to overpower him before the count closes, or he balances the ledger in his favour.",
            responses: ['snare', 'burst'],
            counteredLine: 'You break his tally before it can close.',
            failLine: 'The ledger balances in his favour.',
            consequence: { kind: 'enemyHealPctMaxHp', value: 0.30 },
          } },
        // Phase 4. Nothing left to sell. Desperation + a HEAL check.
        { revivePct: 0.60, damageMult: 1.50, badge: 'Empty Shelves',
          pattern: ['fire', 'volley', 'dodge', 'reload', 'fire', 'fire', 'volley', 'fire'],
          dialogueLine: "Nothing left to sell. Then I sink you and take the lot back myself.",
          check: {
            id: 'fire_sale', name: 'Fire Sale', chargeTurns: 2,
            telegraph: 'The Quartermaster touches a torch to the stock and the whole Cache goes up in flame.',
            hint: 'The whole stock goes up at once and sets your hull ablaze. Fire a crew ability before it catches, a recovery one or a defensive one, and if it does catch, only a crew heal puts the fire out.',
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
  // No tides. A clean, escalating duel (the phases carry the swings).
  // Chapter-III trophy skin (Coffers Hull) drops here at the higher finale rate.
  // Rest is currency (signature finale special drops TBD in step 4).
  loot: [
    { id: 'coffers_hull',   label: 'Coffers Hull', image: null,          emoji: '🚢',      rarity: 'cosmetic',     weight: 8,  shipSkinId: 'coffers_hull' },
    // Signature finale drops. The activatable War Drum (epic) + guaranteed
    // Thunder Drum (legendary chase). Challenge variant lifts the legendary rate.
    { id: 'war_drum',       label: 'War Drum',     image: '/wardrum.png',     emoji: '🥁',      rarity: 'epic',      weight: 20 },
    { id: 'thunder_drum',   label: 'Thunder Drum', image: '/thunderdrum.png', emoji: '🥁',      rarity: 'legendary', weight: 5  },
    // CURRENCY. Only 3 fights, and farmable on no cooldown, so it was the second-best
    // gem faucet in the game. The 200-gem slot survives as a genuine jackpot but at a
    // fraction of the rate. It was carrying most of the EV at 12/80.
    { id: 'doubloons_600',  label: '+600 ⟡',   image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 33 },
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 28 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 16 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 3  },
  ],
  killRewards: {
    // Two genuinely strong enforcers, then the epic boss (which carries the XP
    // the old mob gauntlet used to. 4 phases = the fight).
    scout:         { gold: 130,  xp: 140  },   // The Leech
    reg:           { gold: 180,  xp: 200  },   // The Breaker
    quartermaster: { gold: 1400, xp: 1600 },
  },
  dialogueAccent: '#dc2626',
  preFightDialogue: [
    { speaker: 'narrator', text: "The Cache's shutters roll up into a gun-deck, and the keeper stands behind a counter of run-out cannon, smiling like he's already counted your coin." },
    { speaker: 'boss', text: "Every captain who ever beat me bought the means to do it off my own shelf. *You included.*", pause: 600 },
    { speaker: 'crew', ...CREW_SPEAKER.mako, text: "Then I will beat you with the one thing I never bought off your shelf, keeper. My teeth." },
    { speaker: 'crew', ...CREW_SPEAKER.laz, text: "Then we'll sink you with your own goods. Hold still." },
    { speaker: 'boss', text: "Your goods? Everything you carry was a loan, captain. *And I am calling one back.*", pause: 500, fx: 'shake' },
    { speaker: 'boss', text: "Let's see how bold you sail once I reach across the counter and take back the piece you leaned on most.", pause: 400 },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "Take your trinkets back, keeper. The one thing you never sold this captain is the crew standing on her deck. Good luck reaching across the counter for us." },
  ],
}

// ─── Raid 7. "The Blockade" (Chapter IV: The Last Fathom) ───────────────────
// Don Finleone's escort armada, run by his chief enforcer THE HAMMERHEAD.
// This raid INTRODUCES the whole Ch4 suite:
//   · baseline SHIELDS on every enemy (shieldPct, scaling 15%→25% up the roster)
//   · 4-cannonball MAGAZINES (deeper clips. Meaner, less predictable cadences;
//     volley still costs 3, so they can volley and keep a shot in hand)
//   · enemy SPECIALS via the shared status pipeline (lib/statuses): each crew
//     member throws ONE debuff at you; the boss buffs HIMSELF.
// Audience: post-Ch3, Nav ~55-70. Art = Ch3 hulls as placeholders (bespoke Ch4
// hulls + portraits land at the polish pass, per the Ch3 playbook).
// ── THE BLOCKADE (Raid 7) ────────────────────────────────────────────────────
// Named for the RAID, not the boss. The boss used to be a hammerhead shark, which
// stole the shark identity one raid early: Don Finleone is a MEGALODON and his six
// phase checks are already The Maw, Blood in the Water and The Last Bite. Naming a
// raid config after its current boss is how you end up renaming 111 references the
// next time the fiction moves, so this one is called what the raid is called.
export const THE_BLOCKADE: BossRaidConfig = {
  raidId: 'the_blockade',
  enemyAccuracy: 34,
  raidTitle: 'The Blockade',
  bossDefeatedText: 'Sal Brackwater Defeated',
  atmosphere: 'brackwater',   // Sal's estuary: flat brown water, bronze haze, nothing moving
  zone: 'abyss',         // Chapter IV. The Abyss
  enemies: {
    picket: {
      // THE SCUTE. The shield TEACHER. A scute is the bone plate grown into a
      // crocodile's hide, so the name IS the mechanic: he is nothing but barrier,
      // light and fast, with no trick behind it. Break the plating, then the hull.
      // Burn bleeds through it; volleys chew it fastest.
      id: 'picket', name: 'The Scute', hpBase: 275, minDmg: 20, maxDmg: 34,
      shipSpeed: 9, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.10,
      critDrift: 0.4, critDriftName: 'Rolling Plate',
      pattern: ['fire', 'reload', 'dodge', 'fire', 'reload', 'fire', 'dodge', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.2,
      image: '/enemychapter4brigantine.png',
      portrait: '/raid7_thescute.png',
    },
    bosun: {
      // THE BANK. FORTIFY debut (self-buff). He digs into the mud and takes less
      // damage for a spell: learn to wait out the braced window, or burst through it.
      // A riverbank is where a saltie hauls out, and it is also the thing you cannot
      // get through.
      id: 'bosun', name: 'The Bank', hpBase: 305, minDmg: 21, maxDmg: 35,
      shipSpeed: 6, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.11,
      critDrift: 0.5, critDriftName: 'Rolling Plate',
      special: { name: 'Dig In', status: 'fortify', magnitude: 0.25, turns: 2, target: 'self', line: 'The Bank drops his weight into the silt and settles, and the shot just thumps into mud.' },
      pattern: ['reload', 'fire', 'special', 'reload', 'volley', 'reload', 'fire', 'dodge'],
      critChance: 0.11,
      zoneSpeedMult: 2.3,
      image: '/enemychapter4brigantine.png',
      portrait: '/raid7_thebank.png',
    },
    netter: {
      // THE MANGROVE. SLOWED debut. Roots fouled through your rigging and rudder cut
      // your Initiative, so you lose turn-order rolls and are harder-pressed to flee
      // while it lasts (your dodge and aim ride on Evasion, untouched).
      // The estuary's own net, and it does not need throwing.
      id: 'netter', name: 'The Mangrove', hpBase: 330, minDmg: 22, maxDmg: 36,
      shipSpeed: 6, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.13,
      special: { name: 'Deadwood', status: 'slowed', magnitude: 3, turns: 2, target: 'player', line: 'Root and deadwood come up under the hull and wrap the rudder, and the wheel goes dead in your hands.' },
      critDrift: 0.55, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'volley', 'dodge', 'reload', 'fire'],
      critChance: 0.10,
      zoneSpeedMult: 2.4,
      image: '/enemychapter4brigantine.png',
      portrait: '/raid7_themangrove.png',
    },
    chainman: {
      // THE RASP. WEAKEN debut. Chain-shot files your powder line down and your shots
      // hit soft while it lasts. Drops the Chain-Shot Rack so you can turn it around.
      // Paired with The Wedge: the same brute doing the same job with a different tool.
      // They share a build and a face, and differ by a mirror and the color of the coat.
      id: 'chainman', name: 'The Rasp', hpBase: 350, minDmg: 24, maxDmg: 38,
      shipSpeed: 7, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.15,
      special: { name: 'Chain-Shot', status: 'weaken', magnitude: 0.20, turns: 2, target: 'player', line: 'Chain-shot screams through your powder line and your guns cough where they roared.' },
      critDrift: 0.7, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'fire', 'special', 'reload', 'fire', 'volley', 'dodge', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.5,
      image: '/enemychapter4galleon.png',
      portrait: '/raid7_therasp.png',
    },
    cracksman: {
      // THE WEDGE. FEEBLE debut. A cracker round splits your seams and everything
      // that lands after finds the gap. The kill-window status, used ON you.
      // The Rasp's opposite number (see above): same build, mirrored, different coat.
      id: 'cracksman', name: 'The Wedge', hpBase: 370, minDmg: 24, maxDmg: 40,
      shipSpeed: 5, actionMs: 4200,
      magazineSize: 4, shieldPct: 0.15,
      special: { name: 'Hull-Cracker', status: 'feeble', magnitude: 0.22, turns: 2, target: 'player', line: 'A cracker round splits your seams wide open, and every blow after it will find the gap.' },
      critDrift: 0.7, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'reload', 'special', 'volley', 'reload', 'fire', 'volley', 'dodge'],
      critChance: 0.10,
      zoneSpeedMult: 2.6,
      image: '/enemychapter4galleon.png',
      portrait: '/raid7_thewedge.png',
    },
    purser: {
      // OLD SCAR. REGEN debut (self-buff). The bar creeps back up while you watch: a
      // sponge that punishes slow, polite damage. He is nothing but healed-over wounds,
      // which is the most crocodile thing about him. Nothing down here has killed him
      // yet and he has stopped expecting it.
      id: 'purser', name: 'Old Scar', hpBase: 380, minDmg: 25, maxDmg: 39,
      shipSpeed: 7, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.17,
      critDrift: 0.8, critDriftName: 'Rolling Plate',
      special: { name: 'Old Wounds', status: 'regen', magnitude: 16, turns: 3, target: 'self', line: 'Old Scar takes the hit the way he has taken every other one, and the hole closes while you watch.' },
      pattern: ['special', 'reload', 'fire', 'reload', 'fire', 'volley', 'reload', 'dodge'],
      critChance: 0.12,
      zoneSpeedMult: 2.6,
      image: '/enemychapter4galleon.png',
      portrait: '/raid7_oldscar.png',
    },
    muzzle: {
      // THE MUZZLE. SILENCE debut. Your crew abilities lock for two rounds: the
      // enforcer who makes sure nobody talks. The name is kept from the old roster
      // because it is ALREADY a crocodile's snout and the word for shutting a thing up,
      // and a double meaning that good does not come along twice.
      id: 'muzzle', name: 'The Muzzle', hpBase: 385, minDmg: 26, maxDmg: 40,
      shipSpeed: 8, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.17,
      special: { name: 'Gag Order', status: 'silence', magnitude: 1, turns: 2, target: 'player', line: 'The gag order comes down, and your crew go quiet mid-shout.' },
      critDrift: 0.85, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'fire', 'volley', 'reload', 'dodge'],
      critChance: 0.14,
      zoneSpeedMult: 2.7,
      image: '/enemychapter4galleon.png',
      portrait: '/raid7_themuzzle.png',
    },
    saltie: {
      // SAL BRACKWATER. A saltwater crocodile, and Don's chief enforcer. The muscle
      // at the gate.
      //
      // He is a BITER, and Don is a shark, so the two are kept apart on purpose. A
      // shark is open water: it circles, it takes a piece, it comes back. A saltie is
      // the shallows: it lies still where the salt meets the fresh, it does not move
      // for hours, and then it has you and rolls until you stop. Don EATS you. Sal
      // DROWNS you. Nothing about them reads the same.
      //
      // His kit did not change one number, because it already described a crocodile
      // and I had it labelled as a hammer:
      //   shieldPct 0.20  -> osteoderms, the bone plates grown into his hide
      //   'Rolling Plate' -> the death roll, and the plates that survive it
      //   enrage           -> he goes STILL. The water goes flat. That is the tell.
      //   the 70% check    -> he takes your hull in his teeth and rolls
      //   the aegis        -> his back. Nothing you carry goes through it alone.
      id: 'saltie', name: 'Sal Brackwater', hpBase: 645, minDmg: 28, maxDmg: 46,
      shipSpeed: 8, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.20,
      special: { name: 'Still Water', status: 'enrage', magnitude: 0.25, turns: 2, target: 'self', line: 'Sal stops moving. The chop goes flat around him, and every gun on the line goes quiet.' },
      critDrift: 1.0, critDriftName: 'Rolling Plate',
      pattern: ['reload', 'special', 'fire', 'reload', 'volley', 'dodge', 'fire', 'reload', 'fire'],
      critChance: 0.14,
      phases: [
        { revivePct: 0.80, damageMult: 1.35, badge: 'The Death Roll',
          pattern: ['special', 'fire', 'reload', 'volley', 'fire', 'dodge', 'reload', 'volley'],
          dialogueLine: "The don said bring him your colors. He never said in one piece.",
          check: {
            id: 'death_roll', name: 'The Death Roll', chargeTurns: 2,
            telegraph: 'Sal takes your hull in his teeth, sets his feet against the swell, and starts to turn.',
            hint: 'He is going to roll, and he will not let go. Only a crew ability gets something between your hull and that grip. Your own brace or dodge does nothing here.',
            responses: ['brace', 'shield'],
            counteredLine: 'He rolls against braced timber, tears off a mouthful of nothing, and lets go spitting splinters.',
            failLine: 'He rolls, and he keeps rolling, and your hull comes apart along the grain.',
            consequence: { kind: 'damagePctMaxHp', value: 0.70 },
          } },
        // Phase 3. THE LAST WALL. He rises one final time behind an aegis
        // that drinks every shot whole. The discovery is the player's: only
        // an ultimate tears it down in one blow (dialogue + logs hint at
        // "everything at once" without naming the Mega). Fallback: 6 landed
        // hits batter it down, so a no-Mega build survives it the hard way.
        { revivePct: 0.45, damageMult: 1.5, badge: 'The Last Wall',
          pattern: ['reload', 'fire', 'special', 'reload', 'volley', 'fire', 'reload', 'fire'],
          dialogueLine: 'You want the don? Then come through my back. Nothing you carry goes through my back. Not one shot of it.',
          aegis: { name: 'The Last Wall', hitsToBreak: 6 } },
      ],
      zoneSpeedMult: 2.1,
      image: '/enemychapter4man-o-war.png',
      portrait: '/raid7_salbrackwater.png',
    },
  },
  sequence: ['picket', 'bosun', 'netter', 'chainman', 'cracksman', 'purser', 'muzzle'],   // the blockade crew: no species, and none needed
  bossId: 'saltie',
  tides: { slots: [3, 6], maxTier: 2 },
  loot: [
    { id: 'last_fathom_hull', label: 'Last Fathom Hull', image: null, emoji: '🚢', rarity: 'cosmetic', weight: 8, shipSkinId: 'last_fathom_hull' },
    // Signature: the Chain-Shot Rack, the first player-applied STATUS item, and
    // the Brackwater Rack as its legendary chase. Rare here; buildChallengeLoot lifts
    // every legendary to a flat 10% in the challenge table, so the challenge run is
    // where you actually farm it.
    { id: 'chain_shot',     label: 'Chain-Shot Rack', image: null, emoji: '⛓️', rarity: 'epic',      weight: 16 },
    { id: 'brackwater_rack',  label: 'Brackwater Rack',   image: null, emoji: '⛓️', rarity: 'legendary', weight: 5  },
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
    saltie: { gold: 1700, xp: 2000 },
  },
  dialogueAccent: '#a3833f',
  preFightDialogue: [
    { speaker: 'narrator', text: "The blockade line rides the swell ahead: the don's own escort armada, lanterns doused, gunports open. At the center of it, something long and low sits *so still in the water you take it for a spar*.", pause: 700 },
    { speaker: 'boss', text: "Far enough, captain. The don's water starts where your charts stop." },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: "Then we're exactly where we mean to be. Move your line." },
    { speaker: 'crew', ...CREW_SPEAKER.doby, text: "Move it, or be moved with it. I have shifted reefs that argued less than you, enforcer." },
    { speaker: 'boss', text: "The Quartermaster talked too much and kept too little. I do not talk, and *I do not let go*. Ask anyone who ever got this far.", pause: 500 },
    { speaker: 'boss', text: "You will not see me move. *You will only notice I have you.*", pause: 1100, fx: 'shake' },
    { speaker: 'crew', ...CREW_SPEAKER.mira, text: "I noticed you an hour ago, love. A thing that lies that still is a thing afraid to move first. Let us find out what it is afraid of." },
  ],
}

// ── Chapter IV, Raid 8. THE THRONE (Don Finleone) ──────────────────────────
// The fake-final boss. Debuts the raid-8 layer on top of the Ch4 suite:
// enemy ULTIMATES at a full 4-ball magazine (glowing pips = the tell) and
// AIM-BAR ATTACKS (decoys / hardened lock / squall). Specials that strike
// the player's lock-in minigame instead of their hull. Every mob teaches one
// piece before the don stacks them. Don Finleone is a MEGALODON under the
// don's colors. The mask drops in phase 2. ADMIN-ONLY until launch.
// Art: Ch3 hull placeholders. Bespoke Last-Fathom fleet art at polish.
export const THE_THRONE: BossRaidConfig = {
  raidId: 'the_throne',
  enemyAccuracy: 36,
  raidTitle: 'The Throne',
  bossDefeatedText: 'Don Finleone Defeated',
  atmosphere: 'vault',   // placeholder. Bespoke throne-water palette at polish
  zone: 'ancient_deep',  // Chapter IV finale. The Ancient Deep (Don Finleone's last fathom)
  enemies: {
    court_herald: {
      // The ULTIMATE teacher: light hull, no special. Just the new tell.
      // Watch the pips fill to four and glow, then answer it or eat it.
      id: 'court_herald', name: 'The Ripper', hpBase: 340, minDmg: 22, maxDmg: 36,
      shipSpeed: 8, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.15, chargeBiteChance: 0.35,
      ultimate: { name: 'Broadside Royale', mult: 2.4, line: 'Every gun on the deck speaks at once, in the don’s name.' },
      pattern: ['reload', 'fire', 'reload', 'reload', 'ultimate', 'dodge', 'reload', 'fire'],
      critChance: 0.12,
      zoneSpeedMult: 2.3,
      image: '/enemychapter4brigantine.png',
      portrait: '/raid8_theripper.png',
    },
    the_mirage: {
      // DECOYS debut. False Court paints fake gold across your aim bar.
      // Crimson bands dud the shot; find the real lane before you lock.
      id: 'the_mirage', name: 'The Render', hpBase: 380, minDmg: 24, maxDmg: 38,
      shipSpeed: 10, actionMs: 3400,
      magazineSize: 4, shieldPct: 0.18, chargeBiteChance: 0.35,
      special: { name: 'False Court', aimAttack: 'decoys', aimPasses: 2, line: 'Lantern-rigs bloom down his rail, a court of false colors with only one throne among them.' },
      pattern: ['reload', 'special', 'fire', 'reload', 'dodge', 'fire', 'special', 'reload'],
      critChance: 0.12,
      zoneSpeedMult: 2.5,
      image: '/enemychapter4brigantine.png',
      portrait: '/raid8_therender.png',
    },
    the_doorman: {
      // HARDENED LOCK debut. Iron Etiquette plates your lock: the first tap
      // only cracks it, the second lands. The heavy door you knock on twice.
      id: 'the_doorman', name: 'The Gnash', hpBase: 420, minDmg: 24, maxDmg: 40,
      shipSpeed: 5, actionMs: 4200,
      magazineSize: 4, shieldPct: 0.24, chargeBiteChance: 0.35,
      special: { name: 'Iron Etiquette', aimAttack: 'hardened', aimPasses: 2, line: 'Iron shutters slam over every line you’d take. Nobody reaches the don in one knock.' },
      pattern: ['reload', 'special', 'reload', 'fire', 'volley', 'reload', 'special', 'fire'],
      critChance: 0.10,
      zoneSpeedMult: 2.2,
      image: '/enemychapter4galleon.png',
      portrait: '/raid8_thegnash.png',
    },
    the_stormcaller: {
      // SQUALL debut. Kingmaker's Gale gusts your needle fast-slow mid-sweep.
      // Timing by rhythm fails; watch the needle itself.
      id: 'the_stormcaller', name: 'The Gorge', hpBase: 440, minDmg: 26, maxDmg: 40,
      shipSpeed: 9, actionMs: 3600,
      magazineSize: 4, shieldPct: 0.20, chargeBiteChance: 0.35,
      special: { name: 'Kingmaker’s Gale', aimAttack: 'squall', aimPasses: 2, line: 'He whistles a wind out of dead water, and your gun-deck pitches with it.' },
      pattern: ['reload', 'special', 'fire', 'reload', 'fire', 'volley', 'dodge', 'reload'],
      critChance: 0.14,
      zoneSpeedMult: 2.6,
      image: '/enemychapter4galleon.png',
      portrait: '/raid8_thegorge.png',
    },
    the_left_hand: {
      // The don's silencer, now with the ultimate stacked on top. Omertà
      // locks your crew out of the answer while the battery builds.
      id: 'the_left_hand', name: 'The Reaper', hpBase: 480, minDmg: 26, maxDmg: 42,
      shipSpeed: 8, actionMs: 3800,
      magazineSize: 4, shieldPct: 0.24, chargeBiteChance: 0.35,
      special: { name: 'Omertà', status: 'silence', magnitude: 1, turns: 2, target: 'player', line: 'The left hand draws a line across his throat, and your crew’s shouts die in the wind.' },
      ultimate: { name: 'The Quiet Word', mult: 2.5, line: 'What the don whispers, the guns repeat.' },
      pattern: ['reload', 'special', 'reload', 'reload', 'ultimate', 'fire', 'dodge', 'reload'],
      critChance: 0.14,
      zoneSpeedMult: 2.7,
      image: '/enemychapter4galleon.png',
      portrait: '/raid8_thereaper.png',
    },
    the_consigliere: {
      // The don's right hand and the last gate before the throne. A TWO-PHASE
      // mini-boss. Phase 1 marks you for the don (Feeble) and carries the biggest
      // mob ultimate in the raid; drop him and he rises to collect (phase 2).
      id: 'the_consigliere', name: 'The Closer', hpBase: 520, minDmg: 28, maxDmg: 44,
      shipSpeed: 7, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.26, chargeBiteChance: 0.35,
      special: { name: 'Marked for the Don', status: 'feeble', magnitude: 0.22, turns: 2, target: 'player', line: 'He reads your name off a short list, and every gun in the court knows where to aim.' },
      ultimate: { name: 'Final Counsel', mult: 2.6, line: 'His advice, delivered all at once.' },
      pattern: ['reload', 'special', 'reload', 'volley', 'reload', 'reload', 'ultimate', 'dodge'],
      critChance: 0.12,
      // False defeat: he goes down, then hauls himself back up at 55% to settle
      // the account. Opens on the Feeble mark and runs a tighter, harder cadence.
      phase2: {
        revivePct: 0.55,
        damageMult: 1.30,
        pattern: ['special', 'reload', 'reload', 'volley', 'reload', 'fire', 'reload', 'reload', 'ultimate', 'dodge'],
        dialogueLine: 'You do not close an account by sinking it once, captain. Let me show you the interest.',
        badge: 'The Reckoning',
      },
      zoneSpeedMult: 2.5,
      image: '/enemychapter4man-o-war.png',
      portrait: '/raid8_thecloser.png',
    },
    don_finleone: {
      // DON FINLEONE. The fake-final boss. Phase 1: the don at his table,
      // Court of Crowns decoys + The Deep Verdict ultimate. Phase 2 the mask
      // drops (MEGALODON) and The Maw check arms; phase 3 is the frenzy,
      // closed by The Sounding (blast or jam him out of the dive, or eat a
      // near-lethal breach). Kills reveal nothing. The margin does.
      // SIX-PHASE FINAL BOSS. The court steps aside and the don eats his way
      // through your whole crew: every phase (the opener included) arms a check.
      // Unlike the earlier raids, these do NOT take any ability. Each phase wants
      // a specific KIND of answer (defend / heal / disrupt / blast), themed to its
      // telegraph, and the answer sets vary so no single ability clears all six.
      // The two near-lethal checks (the opener and the Last Bite) take a third,
      // forgiving option so a thin crew can't get one-shot on a forced miss. It is a
      // COUNT gate (six firings, a full six-berth crew) AND a MATCH gate (the right
      // answer on the right phase). LEGENDARY abilities count for more than one kind
      // (see RaidCombat noteCheckResponse), so a legendary crew flexes across phases
      // a base-class roster has to plan around. Miss one and the consequence snowballs.
      id: 'don_finleone', name: 'Don Finleone', hpBase: 880, minDmg: 30, maxDmg: 50,
      shipSpeed: 9, actionMs: 4000,
      magazineSize: 4, shieldPct: 0.30, chargeBiteChance: 0.35, startCharges: 2,
      special: { name: 'Court of Crowns', aimAttack: 'decoys', aimPasses: 2, line: 'The court closes around the throne. A dozen crowns, and only one that bleeds.' },
      ultimate: { name: 'The Deep Verdict', mult: 2.8, line: 'The don passes sentence, and the water carries it out.' },
      pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'dodge', 'fire', 'reload'],
      critChance: 0.15,
      // Phase 1 opener check. The court itself. Answer him the moment guns are out.
      openingCheck: {
        id: 'the_court', name: 'The Don’s Court', chargeTurns: 2,
        telegraph: 'The whole drowned court trains its guns on your hull at once, waiting on the don’s nod.',
        hint: 'You cannot out-gun a whole court. Weather the opening volley. A brace, a shield, or a big heal will all ride it out.',
        responses: ['brace', 'shield', 'heal'],
        counteredLine: 'Your crew answers first, and the court’s opening volley scatters wide.',
        failLine: 'Nobody stands with you, and the whole court fires as one.',
        consequence: { kind: 'damagePctMaxHp', value: 0.55 },
      },
      phases: [
        { revivePct: 0.72, damageMult: 1.25, badge: 'The Maw',
          pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'volley', 'dodge', 'reload'],
          dialogueLine: 'You came for a don. The deep sent you something older. Look at the WIDTH of what you’ve been bargaining with.',
          check: {
            id: 'the_maw', name: 'The Maw', chargeTurns: 2,
            telegraph: 'The don’s hull ROLLS, and keeps rolling, a jaw the size of your broadside opening under the waterline.',
            hint: 'A bite that wide can’t be weaved. Harden the hull with a brace, or blast the jaw apart with a big shot before it shuts.',
            responses: ['brace', 'burst'],
            counteredLine: 'Your crew throws the maw off its line and it grinds iron instead of deck.',
            failLine: 'The maw closes on your hull and something structural gives. Every blow after this one finds the gap.',
            consequence: { kind: 'status', status: 'feeble', magnitude: 0.50, turns: 4, dmgPct: 0.35 },
          } },
        { revivePct: 0.60, damageMult: 1.35, badge: 'Blood in the Water',
          pattern: ['fire', 'special', 'reload', 'fire', 'reload', 'ultimate', 'volley', 'dodge'],
          dialogueLine: 'There it is. The blood. Now the whole ocean knows where you are.',
          check: {
            id: 'blood_water', name: 'Blood in the Water', chargeTurns: 2,
            telegraph: 'He rakes a long gash down your hull and circles wide, the sea reddening with every pass at the smell of it.',
            hint: 'The wound is what keeps drawing him. Close it with a heal, or snare him off the blood-trail before he circles back in.',
            responses: ['heal', 'snare'],
            counteredLine: 'Your crew answers the wound and the blood-trail goes cold; he loses the scent.',
            failLine: 'He follows the blood straight in, tears the gash wider, and the wound feeds him.',
            consequence: { kind: 'enemyHealPctMaxHp', value: 0.30 },
          } },
        { revivePct: 0.50, damageMult: 1.45, badge: 'The Sounding',
          pattern: ['special', 'fire', 'reload', 'reload', 'ultimate', 'fire', 'volley', 'dodge'],
          dialogueLine: 'Enough court. Enough colors. The Finndicate was never the family, captain. It was the FEEDING.',
          check: {
            id: 'the_sounding', name: 'The Sounding', chargeTurns: 2,
            telegraph: 'The megalodon SOUNDS. The whole sea dips as he goes deep, gathering water for a breach that will land on your deck.',
            hint: 'You can’t block a falling mountain. You have to break the dive itself. Snare him out of it, or blast him up early with a big shot.',
            responses: ['snare', 'burst'],
            counteredLine: 'The dive breaks. He breaches early, wide, and the wave takes the blow for you.',
            failLine: 'The sea goes still. Then it goes UP, and the breach leaves your ship reeling and slow to answer.',
            consequence: { kind: 'status', status: 'slowed', magnitude: 12, turns: 4, dmgPct: 0.40 },
          } },
        { revivePct: 0.42, damageMult: 1.55, badge: 'The Undertow',
          pattern: ['special', 'fire', 'fire', 'reload', 'reload', 'ultimate', 'volley', 'reload'],
          dialogueLine: 'Down here, captain, EVERYTHING feeds the family. Even you.',
          check: {
            id: 'the_undertow', name: 'The Undertow', chargeTurns: 2,
            telegraph: 'He circles fast and low and the whole drowned court fires down the whirlpool at once, a wall of iron closing on your hull.',
            hint: 'No brace holds against a wall this wide. Raise a shield to break it, or out-heal what gets through.',
            responses: ['shield', 'heal'],
            counteredLine: 'The barrage breaks on your crew’s answer in a wall of spray.',
            failLine: 'The undertow drags your broadside off true, and the court’s iron rakes you while your guns swing wild.',
            consequence: { kind: 'status', status: 'weaken', magnitude: 0.45, turns: 4, dmgPct: 0.35 },
          } },
        { revivePct: 0.34, damageMult: 1.70, badge: 'The Last Bite',
          pattern: ['fire', 'special', 'reload', 'ultimate', 'fire', 'reload', 'volley', 'dodge'],
          dialogueLine: 'You crossed the WHOLE family to get here. Let me show you what the family is FOR.',
          check: {
            id: 'the_last_bite', name: 'The Last Bite', chargeTurns: 2,
            telegraph: 'The megalodon rears his whole bulk from the water for one final lunge. And for one breath his throat hangs open above your deck.',
            hint: 'The throat hangs open for one breath. Fire everything down it with a big shot, or throw up a brace or shield and ride out the lunge.',
            responses: ['burst', 'brace', 'shield'],
            counteredLine: 'Your crew fires straight down his throat and the last bite dies in the water.',
            failLine: 'The last bite comes down, and the deep finally closes over you.',
            consequence: { kind: 'damagePctMaxHp', value: 0.90 },
          } },
      ],
      zoneSpeedMult: 2.4,
      image: '/enemychapter4man-o-war.png',
      portrait: '/raid8_donfinleone.png',
    },
  },
  sequence: ['court_herald', 'the_mirage', 'the_doorman', 'the_stormcaller', 'the_left_hand', 'the_consigliere'],
  bossId: 'don_finleone',
  tides: { slots: [2, 5], maxTier: 2 },
  preBossReprieve: true,   // one breath before the Don: heal / +damage / refresh a crew ability
  loot: [
    { id: 'last_fathom_hull', label: 'Last Fathom Hull', image: null, emoji: '🚢', rarity: 'cosmetic', weight: 8, shipSkinId: 'last_fathom_hull' },
    // The court's own bite, turned back: a CRIT strips an enemy cannonball (epic
    // 20% chance / legendary 50%). Same 'court_bite' family. They don't stack.
    { id: 'court_fang',     label: "The Court's Fang", image: '/thecourtsfang.png', emoji: '🦈', rarity: 'epic',      weight: 20 },
    { id: 'dons_signet',    label: 'The Don’s Signet', image: '/thedonssignet.png', emoji: '💍', rarity: 'legendary', weight: 5  },
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
    { speaker: 'narrator', text: 'Past the thrown gates the water goes still and black, and the don’s flagship sits at anchor in the middle of it. Lit like a feast, silent like a courtroom.' },
    { speaker: 'boss', text: 'Sit down, captain. You’ve crossed my whole family to reach this table. The least I can do is hear your last request.', pause: 500 },
    { speaker: 'crew', ...CREW_SPEAKER.mira, text: 'We read your books, Finleone. Every coin accounted for. Almost every coin.' },
    { speaker: 'boss', text: '...So. *You found the margin.*', pause: 1200 },
    { speaker: 'crew', ...CREW_SPEAKER.dole, text: 'We found it, don. The account your whole empire was really paying into. You were never the top of this, and you know it. Does that frighten you as much as it frightens your books?' },
    { speaker: 'boss', text: 'Then you know why *nobody* leaves this water. Guns out, captain. The court is in session.', pause: 600, fx: 'shake' },
    { speaker: 'crew', ...CREW_SPEAKER.mira, text: 'Look at him, captain. The biggest name in the whole sea, and he is afraid of a single letter. That is the only thing in this room worth knowing.' },
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

// ── THE SUNKEN HAND — the true final boss ─────────────────────────────────────
// Finn, wearing the power of all six Ancient Deep giants.
//
// THE CONVERGENCE: the whole fight is played on the FISHING DIAL (`aimStyle:
// 'dial'`), the only raid in the game that is. The mechanic is not a fishing
// minigame bolted on: it is raid combat, wrapped onto a circle. The needle
// sweeps the dial the way it sweeps the aim bar, the hit and crit bands are the
// same bands, and the thing you are trying to land the needle on is FINN'S SHIP
// itself, orbiting the compass. You track him around and fire when you have him.
//
// The player's EQUIPPED ROD, HOOK AND LINE widen those bands exactly as they do
// when fishing, so every hour spent on the fishing side of the game shows up
// here as a wider shot at the final boss. He made the player his angler for the
// entire campaign; the last fight happens on the angler's own instrument.
//
// THE SEQUENCE is the six husks he drained in The Hand That Sharpens It. They
// came down on the water "grey and light and wrong", and he walks them at you
// one at a time. Each keeps the shape of the giant it was and none of its mind,
// so they are big, slow and awful rather than clever. Art is placeholder (the
// fish catalogue images); bespoke husk art is pending.
export const THE_SUNKEN_HAND: BossRaidConfig = {
  raidId: 'the_sunken_hand',
  enemyAccuracy: 40,
  raidTitle: 'The Sunken Hand',
  bossDefeatedText: 'Finn Defeated',
  // THE convergence: the entire fight is fought on the fishing dial.
  aimStyle: 'dial',
  // His own ending. "Heh" is the sound he makes at the reveal, so he goes out
  // on it. The patience line answers his ultimate ("all that patience, paid out
  // at once") and his whole reason for using the player. The closer mirrors the
  // cutscene exactly: there, the morning went dark from him outward.
  defeatSequence: {
    lines: [
      'Heh.',
      'All that patience. And it was you at the end of the line.',
      'The dark goes out of the water. The morning comes back the way it left, from him outward.',
    ],
  },
  // THE STREAK. +7% damage per consecutive crit, up to 14 (so +98% at a perfect
  // run). Deliberately generous at the top: it has to survive six phases of a
  // boss with a full health bar each, so a player holding the rhythm the whole
  // way should feel the fight bend under them.
  // At 5+ the chain starts going THROUGH his armour, which is the answer to
  // a boss who re-plates every phase: hold the rhythm and the plate is a
  // formality, drop it and he is behind 194 again.
  critStreak: { perStack: 0.07, maxStacks: 14, label: 'Perfect Streak', pierceAt: 5 },
  atmosphere: 'vault',
  zone: 'ancient_deep',
  enemies: {
    finn: {
      // ONE OPPONENT, SIX PHASES. No mob rounds in front of him and no
      // tap-to-continue: a single unbroken fight that changes character six
      // times, once per stolen giant.
      //
      // AND NO BOSS SPECIAL. He carried 'Set the Hook' (a hardened aim attack
      // that forced two taps to lock) only because the first draft of this
      // config had one. It is not part of how he works. His kit is the six crew
      // abilities and his passives, nothing else. Same reasoning as the checks.
      //
      // DELIBERATELY NOT A CHECK BOSS. Don Finleone and the Cartographer are
      // built on telegraphed moves you CANCEL with the right crew ability. Finn
      // is the opposite idea and must not borrow that grammar: he simply USES
      // crew abilities, the way the player does, off-turn and unprompted. There
      // is nothing to answer and nothing to counter. You just have to out-fight
      // someone holding your own toolkit. So: no openingCheck, no phase checks.
      //
      //   phase 1  From the Wrong Water  plesiosaurus  <- Dole,    foresight
      //   phase 2  Old Armour            dunkleosteus  <- Catfish, abyssal_tide
      //   phase 3  Wake of the Drowned   mosasaurus    <- Mako,    blitz
      //   phase 4  Still Going           basilosaurus  <- Laz,     vengeance
      //   phase 5  All That Tonnage      shastasaurus  <- Mira,    requiem
      //   phase 6  The Primeval Maw      megalodon     <- Doby,    leviathan
      //
      // Megalodon lands LAST on purpose: it is the player's final catch of the
      // six, so it is also the last thing he throws.
      //
      // HP is EVEN, not a ramp. Each phase revives at a full bar of hpBase, so
      // no phase is a formality and none is a wall.
      id: 'finn', name: 'Finn', hpBase: 880, minDmg: 30, maxDmg: 50,
      shipSpeed: 11, actionMs: 4000,
      // No chargeBiteChance: Shark's Bite is the shared signature of Don
      // Finleone's court, and Finn is not one of them. He was only carrying it
      // because this config started life on the Don chassis.
      magazineSize: 4, shieldPct: 0.22, startCharges: 2,
      ultimate: { name: 'The Long Line', mult: 2.8, line: 'All that patience, paid out at once.' },
      pattern: ['fire', 'reload', 'reload', 'fire', 'reload', 'dodge', 'fire'],
      critChance: 0.15,
      image: '/enemy_finnship.png',
      portrait: '/finn_final.png',
      // PHASE 1's ability. DOLE: he reads you, and slips what is coming.
      phaseBgImage: '/finn_bg1.jpg',
      phaseAbility: {
        kind: 'foresight', name: 'From the Wrong Water',
        summonImage: '/fish/plesiosaurus.png', summonColor: '#a78bfa',
        turns: 2,
      },
      phases: [
        // ── PHASE 2 — CATFISH. He patches himself and puts the plate up. ─────
        { revivePct: 1.0, damageMult: 1.08, badge: 'Old Armour',
          bgImage: '/finn_bg2.jpg',
          pattern: ['reload', 'fire', 'reload', 'fire', 'reload', 'fire', 'reload', 'fire'],
          dialogueLine: 'Plate that outlived its own bones. Do you know how long I waited to wear this?',
          ability: {
            kind: 'abyssal_tide', name: 'Old Armour',
            summonImage: '/fish/dunkleosteus.png', summonColor: '#9fb2c8',
            // ARMOUR-led, not heal-led. The dunkleosteus is the plated giant
            // and the ability is named for its plate, so the shield is the
            // bigger half: 20% of his bar in plate, 10% in closed holes.
            // Uncapped on purpose, so it goes BEYOND his baseline armour.
            value: 0.10, shieldValue: 0.20,
          } },
        // ── PHASE 3 — MAKO. The frenzy. Many small teeth. ────────────────────
        { revivePct: 1.0, damageMult: 1.16, badge: 'Wake of the Drowned',
          bgImage: '/finn_bg3.jpg',
          pattern: ['fire', 'reload', 'reload', 'fire', 'reload', 'fire', 'reload', 'fire'],
          dialogueLine: 'You have never once been fast enough. Let me show you what fast is.',
          ability: {
            kind: 'blitz', name: 'Wake of the Drowned',
            summonImage: '/fish/mosasaurus.png', summonColor: '#67e8f9',
            // Base damage stays where it is (player HP does not scale, so 60 on
            // a fresh hull is already the right size). The RAMP is what changes:
            // value is the frenzy, and at 1.0 the flurry DOUBLES as you die.
            // Mako's own Lv100 caps at +60%; his is steeper because he is the
            // last thing in the game and this is his execute.
            shots: 4, value: 1.0,
          } },
        // ── PHASE 4 — LAZ. He simply refuses to go down. ─────────────────────
        { revivePct: 1.0, damageMult: 1.24, badge: 'Still Going',
          bgImage: '/finn_bg4.jpg',
          pattern: ['fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley', 'reload', 'fire', 'reload', 'reload', 'fire'],
          dialogueLine: 'You have put more iron through me than most captains see in a lifetime. Look at me.',
          ability: {
            kind: 'vengeance', name: 'Still Going',
            summonImage: '/fish/basilosaurus.png', summonColor: '#94a3b8',
            turns: 3,
          } },
        // ── PHASE 5 — MIRA. He marks you, and everything lands harder. ───────
        { revivePct: 1.0, damageMult: 1.32, badge: 'All That Tonnage',
          bgImage: '/finn_bg5.jpg',
          pattern: ['fire', 'reload', 'fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'volley', 'reload', 'reload', 'fire'],
          dialogueLine: 'I have been reading you since your first cast. There is nothing left of you I have not written down.',
          ability: {
            kind: 'requiem', name: 'All That Tonnage',
            summonImage: '/fish/shastasaurus.png', summonColor: '#7dd3fc',
            turns: 3, value: 0.3,
          } },
        // ── PHASE 6 — DOBY. The jaw. The last thing he has, and the biggest. ─
        { revivePct: 1.0, damageMult: 1.42, badge: 'The Primeval Maw',
          bgImage: '/finn_bg6.jpg',
          pattern: ['fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'ultimate', 'reload', 'fire', 'reload', 'fire', 'reload', 'reload', 'reload', 'fire'],
          dialogueLine: 'One last ride, captain. You landed this one yourself. Let us see you do it twice.',
          ability: {
            kind: 'leviathan', name: 'The Primeval Maw',
            summonImage: '/fish/megalodon.png', summonColor: '#f87171',
            // The biggest single ABILITY in the fight, but sized against the
            // PLAYER, not against his own ultimate. An endgame hull is roughly
            // 260 (Man-o-War 125 + nav 100, times hull mults), so 2.4 landed at
            // 256: a near one-shot from a move with no telegraph. 1.4 puts it at
            // ~149, about 57% of hull. Still the hardest thing he throws that is
            // not his telegraphed ultimate, and survivable from full.
            value: 1.4,
          } },
      ],
    },
  },
  // NO mob sequence. It is him from the first shot to the last.
  sequence: [],
  bossId: 'finn',
  // HIS SPOILS ARE DELIBERATELY NOT A NORMAL TABLE. Exactly TWO real items, one
  // for each half of the game, and each is the ONLY thing its new slot accepts:
  //   The Primeval Eye -> the second fishing special slot
  //   The Primeval Maw      -> the extra raid mount
  // Everything else he drops is cosmetic, so the fight cannot be farmed for
  // power. See the 'spoils_of_the_hand' node for how the slots are opened.
  // WEIGHTS ARE PERCENTAGES here: the table sums to exactly 100, so 2.5 means a
  // true 2.5% and the odds printed on his card are the odds. His two spoils are
  // the rarest thing in the game, and without the currency rows below a kill
  // ALWAYS handed one over. Challenge does NOT derive from these: its rates are
  // pinned in SUNKEN_HAND_CHALLENGE_LOOT (lib/raidChallenge), because the normal
  // rates no longer sit at a clean multiple of them.
  loot: [
    { id: 'anglers_patience', label: "The Primeval Eye", image: '/primevileye.png', emoji: '🎣', rarity: 'ancient', weight: 2.5 },
    { id: 'borrowed_jaw',     label: 'The Primeval Maw',      image: '/primevilmaw.png', emoji: '🦈', rarity: 'ancient', weight: 2.5 },
    { id: 'sunken_hand_hull',   label: 'Sunken Hand Hull',   image: null, emoji: '🚢', rarity: 'cosmetic', weight: 3, shipSkinId: 'sunken_hand_hull' },
    { id: 'drowned_giant_hull', label: 'Tundra Hull',        image: null, emoji: '🚢', rarity: 'cosmetic', weight: 2, shipSkinId: 'drowned_giant_hull' },
    { id: 'last_cast_hull',     label: 'Volcanic Hull',      image: null, emoji: '🚢', rarity: 'cosmetic', weight: 2, shipSkinId: 'last_cast_hull' },
    { id: 'doubloons_1500', label: '+1,500 ⟡', image: '/dailybonus.png', emoji: '💰',      rarity: 'uncommon', weight: 28 },
    { id: 'doubloons_1200', label: '+1,200 ⟡', image: '/smallpile.png',  emoji: '🪙',      rarity: 'common',   weight: 24 },
    { id: 'gems_50',        label: '50 Gems',  image: null,              emoji: GEM_GLYPH, rarity: 'rare',     weight: 20 },
    { id: 'pack_2',         label: '200 Gems', image: null,              emoji: GEM_GLYPH, rarity: 'epic',     weight: 16 },
  ],
  killRewards: {
    finn: { gold: 12000, xp: 12000 },
  },
  preFightDialogue: [
    { speaker: 'narrator', text: 'The water ahead is flat and wrong, and the ship sitting on it is flying his colours.' },
    { speaker: 'boss', text: 'You came. *Of course* you came.' },
    { speaker: 'boss', text: 'Six of them in your hold and you still brought the ship. That is the thing about you, captain. You have never once done the sensible thing.' },
    { speaker: 'crew', ...CREW_SPEAKER.doby, text: 'He has every one of them in him now. Whatever he throws at us, captain, we taught it to him.' },
    { speaker: 'crew', ...CREW_SPEAKER.kat, text: 'Then we know exactly what is coming.' },
    { speaker: 'boss', text: 'Let us find out what all that practice was for.', pause: 600, fx: 'shake' },
  ],
}
