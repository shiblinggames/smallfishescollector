'use client'

// Turn-based raid combat — standalone module for one encounter.
//
// Lifecycle:
//   await_input (player picks action) →
//   (if Fire/Volley) aiming (aim bar runs, player taps to lock) →
//   revealing (show both actions + speed roll) →
//   resolving (animate first actor, then second) →
//   await_input (next turn) | victory | defeat
//
// Mechanics:
//   - Speed roll:   1d20 + ship_speed + floor(navigation/10)   ties → player first
//   - Dodge roll:   1d20 + ship_speed + total_navigation  vs  1d20 + attacker_ship_speed
//   - Volley costs 3 charges (requires 3), 2× damage
//   - Fire costs 1 charge
//   - Reload +1 charge (cap 3)
//   - Dodge (no damage dealt, defensive)
//
// Per-enemy AI follows BroadsideEnemy.pattern cycle.
//
// ── MODIFIER PIPELINE (where every buff source lands) ────────────────────────
// KEY FACT: Gauntlet BOONS are NOT a separate layer. They're compiled into the
// SAME bucket as Tides — GauntletGame passes tideEffects={[...tides, ...boons]},
// and the `tide` useMemo below aggregates them together. A boon and a tide of
// the same kind STACK (multiplicatively for damage mults, additively for crit/
// dodge CHANCES). And because the damage stack is pure multiplication, the order
// of the factors does NOT change the result.
//
// Two phases:
//   Phase 1 — STAT AGGREGATION (upstream, before this component): ship + crew +
//     ship-class picks + stat-type items are summed into the props passed in:
//     totalPower, shipMinDamage, shipSpeed, totalNavigation, totalFortune,
//     classDamageMult, and `mods` (crew raid-damage %). This is the "base".
//
//   Phase 2 — PER-SHOT MATH (here, in resolveTurn/resolveRound):
//     1. Aim result decided first (miss/graze/hit/crit). A green HIT can upgrade
//        to a crit via crewCritPct + tide.critBonus (Dead-Eye etc.) — ADDITIVE.
//     2. Base damage ROLL from ship stats + crew dmg% (raidDamageProfile),
//        ranged by the aim result.
//     3. MULTIPLIER STACK on top, all multiplicative (commutative):
//          base × volley(×2) × itemBoss × itemNonboss × itemRamp
//               × itemCritOrNoncrit × classDamageMult
//               × tide.dmgMult × tide.fire/volleyMult × tide.bossMult × tide.critDmgMult
//        (items = getActiveEffects(equippedRaidItems); tide.* = tides AND boons.)
//     4. Enemy-side MITIGATION: carapace (damageReduction), Ironclad affix, phase-2 soak.
//     5. DODGE resolves last (full = 0, partial = ½) — unless the defender is frozen.
//     6. EXECUTE (Executioner boon) sinks the enemy if now ≤ threshold; LIFESTEAL
//        (Leviathan's Hunger boon) heals you off the damage dealt.
//
// Separate sub-systems, each its own stack (boons fold in alongside tides on all):
//   crit CHANCE (additive) · crit ZONE width (critZoneScale, mult) · turn order
//   (shipSpeed + speedDelta) · dodge (rollDodge vs attacker) · incoming-damage
//   mitigation (incomingDmgMult). Nothing "overrides"; it's one big multiply.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DialAimBonus } from '@/lib/dialAim'
import { installSpaceAction, typingInField, uncoveredCenter } from '@/lib/spaceAction'
import { compact } from '@/lib/almanac'
import { createPortal } from 'react-dom'
import { DialSVG, CX, CY, OUTER_R, INNER_R } from '@/components/FishingDial'
import AimBarFx, { type AimBarFxHandle } from './AimBarFx'
import type { ZoneDef } from '@/app/(app)/fishing/depths'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { BroadsideEnemy, EnemyAction, RARITY_COLOR, type AimAttackId, type BossMechanicCheck, type MechanicResponse } from '@/lib/bossRaids'
import { raidDamageProfile, fortuneLootMult, type RaidMods } from '@/lib/expeditions'
import type { CrateItemChance } from '@/lib/raidLoot'
import { MEGA_CHARGE_COST, RAILGUN_GRAZE_PCT, type ShipAugment } from '@/lib/shipAugments'
import { getCheckTutorialSeen, markCheckTutorialSeen } from './checkTutorialActions'
import { GUIDES } from '@/lib/onboardingScenes'
import type { ContractFightFacts } from '@/lib/gauntletContracts'
import { applyStatus, statusMods, tickStatuses, cleanseStatuses, STATUS_DEFS, type ActiveStatus, type StatusId } from '@/lib/statuses'
import { CannonShotBurst, ImpactBurst, RailgunBeam, NukeMissile, NukeBlast } from './megaFx'
import { getActiveEffects, getRaidItem, getActivatableItem } from '@/lib/raidItems'
import ItemEffectLines from '@/components/ItemEffectLines'
import { describeEffect, effectTone, type TideEffect } from '@/lib/tides'
import { getRepairKit, rollRepairKitHeal, repairKitRange } from '@/lib/repairKits'
import { classForSlug, CLASSES, currentMilestone, type AnyClassDef } from '@/lib/crewClasses'
import { getCrewSkinByFilename } from '@/lib/crewSkins'
import { ChaseSkinFx } from '@/components/ChaseSkinFx'
import { TempestStrikeFx, LeviathanStrikeFx, RequiemMarkFx, GalaxySurgeFx, FossilWardFx, KrakenOracleFx } from '@/components/ChaseStrikeFx'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { type AffixDef } from '@/lib/raidAffixes'
import { getShipClass, aggregateShipClasses } from '@/lib/shipClasses'
import { vibrate } from '@/lib/haptics'
import CharacterAvatar from '@/components/CharacterAvatar'
import { IconShield, IconFog, IconSwords, IconBurst, IconAnchor, IconCrate, IconSkull, IconBolt, IconFlame, IconStar } from '@/components/GameIcons'

type ShotResult = 'miss' | 'graze' | 'hit' | 'critical'
type SubPhase   = 'await_input' | 'aiming' | 'revealing' | 'resolving' | 'flares' | 'done'
type Actor      = 'player' | 'enemy'

// Cannonball cap. MAX_CHARGES is the DEFAULT enemy cap AND the volley cost (a
// volley spends VOLLEY_COST cannonballs for a double-shot). The PLAYER's cap
// can be raised by the Locker Upgrade "Extra Cannonball Rack" (bonusChargeSlots
// prop); Chapter-4 ENEMIES can raise theirs via enemy.magazineSize (a buffer
// ball — volley cost never changes, the deeper clip just makes their cadence
// meaner and their reload-at-max window later).
const MAX_CHARGES = 3
const VOLLEY_COST = MAX_CHARGES
// Odds the enemy FEINTS instead of firing when a reload lands on a full
// magazine (see pickEnemyAction) — holds the shot and braces, so "enemy at MAX
// charges" stops being a guaranteed incoming fire the player can pre-dodge.
const FEINT_CHANCE = 0.3
// The RACKS (Chain-Shot Rack, Langrage Rack) — the proc's fixed payload. The item's
// `value` carries only the CHANCE; the magnitudes and durations are tuned here.
//
// A rack holds different rounds, so a proc fires a SPREAD: ONE roll lands every
// status the equipped rack carries. That keeps a proc a real event you can read in
// the log, rather than three separate coin flips, and it makes the legendary an
// artillery piece instead of a slot machine.
//
// CORRODE is the interesting one. It amplifies damage to the enemy's BARRIER, and
// Chapter 4 is the chapter that put a barrier on every enemy in the game. The rack
// drops from the raid where barriers debut, so the raid that teaches you the wall
// also hands you the thing that eats it.
const CHAIN_SHOT_WEAKEN_PCT = 0.20
const CHAIN_SHOT_CORRODE_PCT = 0.30
const CHAIN_SHOT_FEEBLE_PCT = 0.20
const CHAIN_SHOT_WEAKEN_TURNS = 2
// Confluence guard-rails: Reaper's Tithe heal per kill is capped to this slice
// of the PLAYER's max HP (so a big boss doesn't near-full-heal you); Hull
// Render's per-fight volley ramp bonus caps here (so a long fight can't runaway).
const REAPER_HEAL_CAP_PCT = 0.15
const DAMAGE_RAMP_CAP = 1.0   // +100% ceiling on any per-turn/per-volley damage ramp (Heavy/Grand/Siege cannon + Hull Render), so a long fight can't spiral
// Total lifesteal ceiling across ALL sources (Leviathan's Hunger boon + Feeding
// Frenzy confluence + Davy's Blood Cannon item). Uncapped, the full sustain
// stack reached ~57% of damage-dealt healed — enough to out-heal the deep and
// gut the Gauntlet's attrition tension. 35% keeps the dedicated build very
// strong without letting it become unkillable.
const LIFESTEAL_CAP = 0.35
// LIFESTEAL_CAP bounds the RATIO. The HEAL is bounded separately, against your
// hull, so deep-run damage can't turn sustain into a full-heal-every-hit
// immortality switch.
//
// THE CAP IS TWICE YOUR RATE, as a share of max HP. One rule, one number a
// player can hold in their head: 10% lifesteal heals up to 20% of your hull a
// hit, 15% up to 30%, and every extra source raises both halves together.
//
// It replaces a curve that was correct and unreadable. That version priced the
// ceiling off damage so it kept scaling deep, but nothing on screen could state
// it, and a cap nobody can predict is one players assume is broken — which is
// how this started, with a depth-96 run realising 3.3% against an advertised
// 15%. Tying the cap to the rate keeps the property that actually mattered
// (every point of lifesteal buys more heal AND more ceiling, so a bigger stack
// always pays) while being one sentence on a card.
//
// Tier 1 lands on 20% of hull, exactly the flat cap this replaces, so nothing
// any player already held got worse. The ratio cap keeps the top honest: at the
// 35% ceiling the most a single hit can return is 70% of the bar, and only the
// full dedicated sustain stack gets there.
const LIFESTEAL_CAP_PER_RATE = 2

/** The most one damage instance may heal, for the rate that produced it. */
function lifestealHealCap(maxHp: number, rate: number): number {
  return maxHp * Math.min(rate, LIFESTEAL_CAP) * LIFESTEAL_CAP_PER_RATE
}
const PLAYER_COLOR = '#4ade80'
const ENEMY_COLOR  = '#ef4444'

// Incendiary Cannonball: a burn proc lasts this many enemy turns and ticks for
// this fraction of the hit that lit it (locked at application, "constant fixed
// damage scaled to your damage").
const BURN_TURNS = 2
/** How many turns Laz's vengeance ward stays lit after it is armed. The whole point
 *  of the class is the READ, so the ward has to be able to run out: arm it on the
 *  turns you believe will kill you, or waste your legendary. */
const VENGEANCE_WARD_TURNS = 3
/**
 * How much of your BUILD's damage scaling a crew ability inherits (Doby's leviathan
 * salvo, Mako's blitz barrage). 1 = the full ride a manual cannon shot gets.
 *
 * It is 0.7 because these abilities are FREE: a guaranteed crit that costs no turn
 * and cannot whiff. Letting a free shot compound at 100% with items, boons, classes
 * and Renown meant that the better your build got, the more the correct play was to
 * hold the ability and delete the boss with it. Giving them zero scaling was worse
 * (they fell off a cliff late — the bug we just fixed). 70% keeps them scaling into
 * the endgame while making a turn-costing, aimed cannon shot the better multiplier.
 *
 * Applied to the EXCESS above 1x, not the whole multiplier — see abilityDamageMult.
 * Scaling the whole thing would quietly nerf a bare build's abilities by 30% for no
 * reason, which punishes exactly the players who have no build to scale with.
 */
const ABILITY_BUILD_SCALING = 0.7
// Burn tick = this fraction of the hit that lit it. 10% base; Wildfire heats it
// up to a hard 20% ceiling (BURN_TICK_MAX). Uncapped vs target HP — it just
// scales with your damage.
const BURN_TICK_PCT = 0.10
const BURN_TICK_MAX = 0.20
// Wildfire "Backdraft" (tier III): each burn tick can flare for a bonus burst.
const BACKDRAFT_FLARE_CHANCE = 0.35
const BACKDRAFT_FLARE_MULT   = 0.7
// Drowned Whispers (confuse curse) — action words for the "you called for X but
// did Y" log line + the on-screen flash.
const ACTION_NOUN: Record<EnemyAction, string> = { fire: 'a Shot', volley: 'a Volley', mega: 'a Mega', reload: 'a Reload', dodge: 'a Dodge', repair: 'a Repair', special: 'a Special', ultimate: 'an Ultimate' }
const ACTION_PAST: Record<EnemyAction, string> = { fire: 'opened fire', volley: 'loosed a volley', mega: 'unleashed a Mega', reload: 'reloaded', dodge: 'dodged', repair: 'patched the hull', special: 'worked something strange', ultimate: 'emptied the full battery' }
// Mechanic checks are answered by CREW ABILITIES. The cue names the KIND of
// answer (category-vague on purpose — working out which crew ability is still
// the player's job) but is explicit that a crew ability is what clears it.
const RESPONSE_CATEGORY: Record<MechanicResponse, string> = {
  brace:  'a defensive one',
  shield: 'a defensive one',
  snare:  'a disrupting one',
  heal:   'a recovery one',
  burst:  'a heavy-hitting one',
}
function crewCounterCue(responses: MechanicResponse[]): string {
  const cats = [...new Set(responses.map(r => RESPONSE_CATEGORY[r]))]
  // A check that accepts every category (the Don's phases) — the answer is
  // simply "act with your crew", so say so plainly instead of listing all four.
  if (cats.length >= 4) return 'Fire ANY crew ability to answer him — but someone has to act.'
  return `Fire a crew ability to counter it — ${cats.join(' or ')}.`
}
// HP-relative per-tick cap. Now only guards the player from INCOMING burns
// (Scorching affix) — outgoing Incendiary / Wildfire / Fallout are uncapped and
// just scale with the hit. Keeps a deep-run enemy crit from burning you for an
// unbounded chunk of your hull.
const BURN_CAP_PCT = 0.10
const BURN_COLOR = '#fb923c'
const FREEZE_COLOR = '#7dd3fc'
// Elemental builds — the TOTAL on-hit proc chance (item cannonball + matching
// boon) is capped here so a specialist gets deadlier procs, not runaway ones.
const FREEZE_PROC_CAP = 0.20
const BURN_PROC_CAP   = 0.20

// ─── Math helpers ──────────────────────────────────────────────────────────────

const d20 = () => Math.floor(Math.random() * 20) + 1

// BEHAVIORAL TELL for the enemy stats popup. Fuzzy about TIMING (reading the
// rhythm is the puzzle the player solves in combat) but honest about WHAT the
// enemy actually does, which the old ratio thresholds were not: Snapjaw
// (reload x3 -> volley -> fire x2) fell through every branch and read as
// "trades shot for shot" despite being a volley-builder, and specials +
// ultimates were ignored outright even though nothing else in the popup
// surfaces them. Rules are derived from the real patterns in lib/bossRaids.ts
// and verified against every enemy; keep them counted, not ratio-guessed.
function enemyBehaviorHint(enemy: BroadsideEnemy): string {
  const pattern = enemy.pattern
  const n = pattern.length || 1
  const c = { reload: 0, fire: 0, volley: 0, dodge: 0, repair: 0, mega: 0, special: 0, ultimate: 0 }
  for (const a of pattern) c[a]++
  const shots  = c.fire + c.volley
  const dodgeR = c.dodge / n
  const parts: string[] = []

  // Tempo — how it actually spends its guns. A volley is the headline threat
  // (double damage), so any volley in the cycle leads, however it's built.
  if (c.volley >= 2) {
    parts.push('Volley-happy. Lands more than one heavy volley a cycle.')
  } else if (c.volley === 1) {
    parts.push(c.reload >= 2
      ? 'Patient. Stacks charges, then lands a heavy volley.'
      : 'Works a heavy volley in among its shots.')
    if (c.fire >= 3) parts.push('Trades shots freely in between.')
  } else if (shots > c.reload) {
    parts.push('Aggressive. Trades shots constantly.')
  } else if (c.reload > shots) {
    parts.push('Methodical. Long reloads between strikes.')
  } else {
    parts.push('Steady rhythm. Trades shot for shot.')
  }

  // Evasion. Either a high dodge share or simply a lot of dodges (Pete camps
  // three of them early in a long cycle and would miss a ratio-only test).
  if (dodgeR >= 0.25 || c.dodge >= 3) parts.push('Slippery, and weaves aside often.')

  // NOTE: special + ultimate are NOT summarized here anymore — they each get
  // their own spelled-out ability card in the popup (enemySpecialDesc /
  // enemyUltimateDesc below), so a vague sentence here would just double them.

  return parts.join(' ')
}

/** Plain-English description of an enemy SPECIAL for the stats popup. Raid-8
 *  aim-bar attacks (aimAttack set) describe the aim interference; everything
 *  else reads its status/magnitude/turns into a sentence. Falls back to the
 *  enemy's own flavor line for any status we don't have copy for. */
function enemySpecialDesc(s: NonNullable<BroadsideEnemy['special']>): string {
  const turns  = s.turns ?? 2
  const passes = s.aimPasses ?? 2
  const pct = (m: number) => Math.round((m ?? 0) * 100)
  if (s.aimAttack === 'decoys')   return `Throws false gold across your aim bar for your next ${passes} shots. Lock a decoy band and the shot misfires — only the true mark scores.`
  if (s.aimAttack === 'hardened') return `Plates your aim lock for your next ${passes} shots, so it takes two taps to lock a shot instead of one.`
  if (s.aimAttack === 'squall')   return `Gusts your aim needle mid-sweep for your next ${passes} shots, dragging the mark off line as you aim.`
  const mag = s.magnitude ?? 0
  switch (s.status) {
    case 'fortify': return `Braces behind its own plating, taking ${pct(mag)}% less damage for ${turns} turns. Wait out the braced window, or burst straight through it.`
    case 'slowed':  return `Fouls your rudder: -${mag} speed for ${turns} turns, so you lose turn-order rolls and slip fewer shots.`
    case 'weaken':  return `Files down your guns: your shots deal ${pct(mag)}% less damage for ${turns} turns.`
    case 'feeble':  return `Splits your seams: you take ${pct(mag)}% more damage for ${turns} turns.`
    case 'regen':   return `Closes its own wounds, healing ${mag} HP a turn for ${turns} turns. Punish it with fast, heavy hits, not a slow trade.`
    case 'silence': return `Silences your crew, locking their abilities for ${turns} turns.`
    default:        return s.line
  }
}

// Player-facing description of an active AIM affliction (the Raid-8 aim-bar
// attacks — Iron Etiquette's "hardened", plus decoys / squall). Surfaced in the
// stats-popup conditions + the HP-bar chip row when one is on you.
function aimAfflictionDesc(kind: AimAttackId, passes: number): string {
  const n = `${passes} shot${passes === 1 ? '' : 's'}`
  if (kind === 'decoys')   return `False gold blooms across your aim bar for your next ${n}. Lock a decoy band and the shot misfires — only the true mark scores.`
  if (kind === 'hardened') return `Your aim lock is plated for your next ${n} — the first tap only cracks it, so it takes two taps to land a shot instead of one.`
  return `Your aim needle is gusted mid-sweep for your next ${n}, dragging the mark off line as you aim.`
}
const AIM_AFFLICTION_COLOR = '#a78bfa'

/** Plain-English description of an enemy ULTIMATE (raid-8). It spends a full
 *  magazine for one authored, non-crit blow scaled by `mult`. */
function enemyUltimateDesc(u: NonNullable<BroadsideEnemy['ultimate']>): string {
  return `At a full magazine it spends every cannonball at once for one massive blow, about ${u.mult}x a normal shot. The pips glow full as the tell — burn its charges down, brace, or shield before it fires.`
}

function rollShotDamage(res: ShotResult, shipMinDamage: number, totalPower: number, damagePct = 0): number {
  if (res === 'miss') return 0
  // Single source of truth (lib/expeditions.raidDamageProfile) so combat, the
  // rating and the ledger never drift. damagePct = crew raid-damage effects.
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage, damagePct)
  if (res === 'critical') {
    const min = shipMinDamage * 2
    return Math.floor(Math.random() * (critMax - min + 1)) + min
  }
  if (res === 'hit') {
    return Math.floor(Math.random() * (powerMax - hitMin + 1)) + hitMin
  }
  // graze
  const grazeMax = Math.max(1, Math.ceil(powerMax * 0.4))
  return Math.floor(Math.random() * grazeMax) + 1
}

function rollInitiative(initiative: number) {
  // Turn order (post-split): 1d20 + INITIATIVE (hull speed + speed boons), and
  // nothing else. Navigation no longer feeds turn order — it's the Evasion stat
  // now (dodge + aim). The 1d20 spread is tuned so a few points of Initiative,
  // or a +2/+4/+7 speed boon, meaningfully move who fires first without making
  // it fully deterministic (roughly: +2 edge ~57%, +5 ~68%, +9 ~85%). The
  // Navigator's Compass stays the one opt-in exception: as a VISIBLE equipped
  // item it still folds a slice of Navigation into the player's roll (call site).
  return (Math.floor(Math.random() * 20) + 1) + initiative
}
function rollDodge(shipSpeed: number, navigation: number) {
  return d20() + shipSpeed + navigation
}
function rollAttackerVsDodge(attackerSpeed: number, accuracy = 0) {
  return d20() + attackerSpeed + accuracy
}

// Lock-moment feel helpers — mirror the existing real-time raid.
function snapIndicator(el: HTMLDivElement | null) {
  if (!el) return
  el.style.transition = 'transform 0s'
  el.style.transform = 'scaleY(3.0)'
  requestAnimationFrame(() => {
    if (!el) return
    el.style.transition = 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)'
    el.style.transform = 'scaleY(1)'
  })
}
function flashBar(el: HTMLDivElement | null, color: string, peak = 0.55) {
  if (!el) return
  el.style.background = color
  el.style.opacity = String(peak)
  let start: number | null = null
  function fade(t: number) {
    if (!el) return
    if (start === null) start = t
    const p = (t - start) / 320
    el.style.opacity = String(Math.max(0, peak * (1 - p)))
    if (p < 1) requestAnimationFrame(fade)
  }
  requestAnimationFrame(fade)
}

// ─── Aim-bar zone helpers (kept from existing RaidGame) ───────────────────────

const GRAZE_W = 0.038
const HIT_W = 0.06
const CRIT_W = 0.012
// False Colors curse — decoy bands. Smaller hit window than the real target
// (HIT_W) so they're a tighter, trickier read, and they only show on a random
// fraction of fires so the player never settles into expecting them.
const DECOY_HALF = HIT_W * 0.62
const DECOY_FIRE_CHANCE = 0.45
// Needle speed (~0.6% of the bar per 60fps frame). The target zone
// drifts too, driven by enemy ship speed and slowed by the player's
// Navigation (see the RAF effect).
const INDICATOR_SPEED = 0.006
// Lock-in judgment is RAW WYSIWYG: lockShot reads the needle and zone
// refs exactly as painted on the tap frame, judges that geometry, and
// freezes the picture AT it (critFreezeRef flips synchronously, so the
// RAF can't run another tick first). No rewinds, no projections — five
// schemes that adjusted the sample (fixed rewind, measured-latency
// rewind, best-of-window lookback, dual-body forward projection,
// static-zone restructure) all read wrong or changed the game. The
// frozen frame IS the judgment; if it shows gold, the badge says gold.

function getShotResult(pos: number, zoneCenter: number, critW: number = CRIT_W, hitW: number = HIT_W, grazeW: number = GRAZE_W): ShotResult {
  // Distance from the band's centre. Measured LINEARLY along the sweep, on the
  // dial as well as the bar: both the needle AND the band now turn back at the
  // marked line, so neither ever crosses it and 0..1 is a straight path in both
  // instruments. (If the band is ever allowed to wrap through the line again,
  // this must become a shortest-way-round measure, or a shot on one side of the
  // line will score against a band on the other.)
  const a = Math.abs(pos - zoneCenter)
  if (a <= critW)          return 'critical'
  if (a <= hitW)           return 'hit'
  if (a <= hitW + grazeW)  return 'graze'
  return 'miss'
}

// ─── Public props ──────────────────────────────────────────────────────────────

/** Incremental combat telemetry — the host (Gauntlet) folds these deltas into a
 *  run-total for the summary + deepest-dive recap. Fields mirror GauntletRunStats. */
export interface CombatStatDelta {
  shots?: number; volleys?: number; megas?: number; crits?: number; dmgDealt?: number; highestHit?: number
  dmgTaken?: number; dmgHealed?: number; dmgAbsorbed?: number; dodgesWon?: number; dodgesLost?: number
}

/**
 * WHERE A HULL IS ON SCREEN, in viewport px. `w` is how wide the ship reads at
 * the current zoom, so an effect hung on it stays the right size relative to
 * the ship rather than to the window.
 */
export type ShipAnchor = { x: number; y: number; w: number }

/**
 * WHAT A HULL IS DOING, for a renderer that is not this one.
 *
 * Offsets in px at the anchor's scale, rotation in degrees, `sink` 0 to 1.
 * Deliberately a flat bag of numbers: the chart applies these to a DOM
 * transform or to Pixi's `skipper()` (which already takes heel and an offset)
 * without knowing anything about the fight that produced them.
 */
export type ShipFx = { x: number; y: number; rot: number; sink: number }

/**
 * SOMETHING HAPPENED, and the sea should know about it.
 *
 * Deliberately SEMANTIC, not spatial. The fight knows a shot was fired and that
 * it crit; it does not know where either hull is in the world, and it should
 * not have to — the chart already does, and it is the chart that decides what
 * the water does about it. That split is also what lets the whole effects layer
 * be absent (the DOM chart, `?gpu=0`) without a single branch in here.
 */
export type FightFx = {
  kind: 'fire' | 'hit' | 'crit' | 'miss'
  /** Whose hull the event belongs to: who fired, or who was struck. */
  side: 'player' | 'enemy'
}

export interface RaidCombatProps {
  enemy: BroadsideEnemy
  /** Challenge-mode elite affix for this encounter. When set, the enemy
   *  arrives with the affix's behavior wired into the combat hooks
   *  (damage reduction, lifesteal, reflect, on-death burn, etc.) and the
   *  nameplate paints with the elite treatment. */
  affix?: AffixDef
  /** True for any encounter where `affix` is set. Used purely for visual
   *  treatment (elite border + badge); the combat math reads from
   *  `affix` directly so the two never disagree. */
  isElite?: boolean
  /**
   * THIS IS THE CHALLENGE RUN, and the fight said so nowhere.
   *
   * Every difference a challenge makes is real and felt — scaled enemies,
   * elite affixes rolled onto ordinary slots, a richer crate — but all of it
   * arrives as things that are individually explicable as bad luck. A hard
   * mob reads as a hard mob. Purely a label; the combat math reads
   * `isChallengeRaidId(config.raidId)` for itself and always has, so the two
   * cannot disagree about which run you are on.
   */
  challenge?: boolean
  isBoss: boolean
  shipImageUrl: string
  /** Optional CSS filter to recolor the ship sprite when a skin is equipped.
   *  e.g. `'hue-rotate(180deg) brightness(0.7)'` for Corsair Black. */
  shipFilter?: string
  /** Optional CSS filter layered onto the ENEMY sprite. The Gauntlet uses it
   *  for the "drowned" look so reused raid enemies read as Locker creatures. */
  enemyArtFilter?: string
  /** Extra PLAYER cannonball capacity from the "Extra Cannonball Rack" Locker
   *  Upgrade. The player can hold MAX_CHARGES + this; volley cost is unchanged. */
  bonusChargeSlots?: number
  shipName: string
  /** What to show on the player nameplate (and in the Captain's Ledger
   *  popup header). Defaults to shipName when not provided. Used to
   *  surface the player's username during a raid instead of the boat
   *  name they've set. */
  playerLabel?: string
  /** Character color id for the player's avatar portrait next to their
   *  nameplate, mirroring how the enemy nameplate shows enemy.portrait. */
  playerCharacterColor?: string | null
  /** Equipped bandana for the player's avatar portrait. */
  playerEquippedHat?: string | null
  /** Saved avatar background / border colors. Fall back to the
   *  CharacterAvatar defaults when null. */
  playerAvatarBg?: string | null
  playerAvatarBorder?: string | null
  playerHpMax: number
  playerHp: number          // current at start of this encounter
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalNavigation: number   // formerly "dodge"
  /** Loot-luck stat. Doesn't affect combat math but shown in the
   *  player-stats breakdown popup (tap the player nameplate). */
  totalFortune?: number
  /** What the boss crate can still drop, with Fortune applied. Computed in
   *  RaidGame and passed through, so combat never has to know a loot table. */
  crateOdds?: CrateItemChance[]
  equippedRaidItems: string[]
  /** Aggregated ship-class damage multiplier (Master Gunner, Ironside,
   *  Buccaneer all touch this — Master Gunner +15%, Ironside -10%,
   *  Buccaneer +5%, all multiplying together across chapters).
   *  Multiplied onto every shot the player lands; same chain as raid
   *  items. Default 1 = no class picks yet. */
  classDamageMult?: number
  /** Raw chapter -> classId picks. Shown on the Captain's Ledger
   *  popup so the player can see which classes are buffing them
   *  during the fight. */
  shipClasses?: Record<string, string>
  /** Player's equipped repair kit id (e.g. 'basic_repair_kit'). Drives the
   *  Special action: once per battle, takes a turn, heals using the kit's
   *  range + Fortune scaling. Omitted/unknown id => Special stays disabled. */
  equippedRepairKit?: string
  /** Gold + XP awarded for killing this enemy; streamed into the log on kill
   *  Pokemon-style so the parent doesn't need a separate "Round Clear" overlay. */
  killReward?: { gold: number; xp: number }
  /** leftoverCharges = unfired cannonballs at the kill, for the Powder Hoard
   *  boon (the Gauntlet host carries them into the next fight). Optional, so
   *  hosts that don't carry charges just ignore it. */
  onEnemyDefeated: (remainingPlayerHp: number, leftoverCharges?: number) => void
  onPlayerDefeated: () => void
  /** Cannonballs to start this fight already loaded (Powder Hoard carryover).
   *  Folded on top of any Primer / start-charge tide, capped to the magazine. */
  initialCharges?: number
  /** Gauntlet momentum boons: the live run tally the damage boons read.
   *  `runKills` = enemies sunk so far this run (Rising Tide, retroactive);
   *  `runDepth` = current descent depth (Abyssal Bounty). Constant for the
   *  fight (RaidCombat remounts per depth), so no mid-fight resync needed.
   *  Omitted outside the Gauntlet → the boons simply never appear. */
  runKills?: number
  runDepth?: number
  /** Don's jobs cleared this run + the bonus each paid — surfaced in the battle
   *  profile (Gauntlet only; omitted elsewhere). */
  contractsWon?: { name: string; reward: string }[]
  /** Which instrument this raid is aimed on (BossRaidConfig.aimStyle).
   *  'dial' swaps the linear aim bar for the fishing dial: same needle, same
   *  0..1 drivers, same judgment, wrapped onto a circle, with the enemy ship
   *  orbiting as the band. Only the Finn finale uses it. */
  aimStyle?: 'bar' | 'dial'
  /** Crit-streak ramp baked into the raid (BossRaidConfig.critStreak). Runs
   *  through the same path as the Cannonade boon. */
  critStreakCfg?: { perStack: number; maxStacks: number; label?: string; pierceAt?: number }
  /** Bespoke defeat beat for this boss (BossRaidConfig.defeatSequence). */
  defeatSequence?: { lines: string[] }
  /** Callout shown when the BOSS goes down ("Barnacle Pete Defeated"). Every
   *  boss authored one and it rendered nowhere: it was being handed to the
   *  PRE-fight dialogue modal, which never used it. */
  bossDefeatedText?: string
  /** The player's FISHING gear, widening the dial's hit + crit bands by the
   *  same degrees it widens the fishing dial. Ignored unless aimStyle 'dial'. */
  dialAim?: DialAimBonus
  /** Fires when the active phase backdrop changes (BossPhase.bgImage). Raids
   *  paint their backdrop as a FIXED full-screen layer in the PARENT and pass
   *  transparentBackdrop, so RaidCombat cannot paint a phase backdrop itself:
   *  it hands it up and the owner swaps it. */
  onPhaseBg?: (src: string | null) => void
  /** Gauntlet boons / curses held (with art) for the battle profile's Effects
   *  tab. Omitted outside the Gauntlet. */
  runBoons?: { id: string; name: string; tier: number; image?: string | null; desc: string; color: string }[]
  runCurses?: { id: string; name: string; tier: number; image?: string | null; desc: string; color: string }[]
  /** Fires with each damage value the player lands, so the parent can track
   *  the biggest hit of the run (career stat). */
  onPlayerHit?: (dmg: number) => void
  /** Incremental combat telemetry for the run summary (Gauntlet). Optional. */
  onStat?: (d: CombatStatDelta) => void
  /** Achievement telemetry, aggregated across the raid by RaidGame:
   *  onDamageTaken — the ship lost HP (any source); onShotResolved — a player
   *  shot was locked in (isCrit = it landed critical); onNoShotKill — the enemy
   *  was sunk this fight without the player ever firing a shot. */
  onDamageTaken?: () => void
  onShotResolved?: (isCrit: boolean) => void
  onNoShotKill?: () => void
  /** Don's Gauntlet Contracts: the per-fight facts a contract is judged against,
   *  fired ONCE at a win (before onEnemyDefeated). Only the gauntlet passes it. */
  onContractFacts?: (f: ContractFightFacts) => void
  /** Quartermaster's Anchor: when true, the next killing blow leaves the
   *  player at 1 HP instead of sinking (raids only — wired by RaidGame,
   *  never PracticeRaidGame). `onAnchorSave` fires once when consumed so
   *  the parent can spend the per-run charge. */
  anchorSaveAvailable?: boolean
  onAnchorSave?: () => void
  /** Net crew raid effects (Berserker, Bulwark, Keen Cutlass, First Strike, …).
   *  Omitted in the practice skirmish, which uses no real crew. */
  raidMods?: RaidMods
  /** When provided, renders a small ← icon in the top-right of the battle
   *  stage so the player can back out without a dedicated row above the
   *  game screen. Parent wires the destination (e.g. /expeditions). */
  onLeave?: () => void
  /** When true (real raids), the ← button is a *flee attempt*: it confirms,
   *  then rolls — a failed escape lets the enemy land a parting shot. When
   *  false/omitted (practice + preview sandboxes), ← leaves instantly. */
  riskyFlee?: boolean
  /** Bridge from RaidGame's mid-battle exit guard: when fleeSignal changes,
   *  open the flee prompt. fleeNav is where to go on a clean getaway (the tab
   *  the player tried to open). */
  fleeSignal?: number
  fleeNav?: (() => void) | null
  /** Active tide effects for this run (see lib/tides). Read-only from
   *  the combat layer; RaidGame manages lifecycle (filters out
   *  per-fight scope on advance). RaidCombat applies the effects as
   *  multipliers / bonuses into the existing roll formulas. */
  tideEffects?: TideEffect[]
  /** Battle-stage atmosphere palette. Comes from the parent raid config
   *  (BossRaidConfig.atmosphere) so every fight in the same raid shares
   *  the same look. Default ('dusk' / undefined) keeps the original
   *  warm seascape — used by the practice skirmish and any legacy
   *  caller that doesn't set the field. */
  atmosphere?: 'dusk' | 'sunset' | 'overcast' | 'fog' | 'harbor' | 'vault' | 'brackwater'
  /** Fishing-zone battle background image URL (resolved from the raid config's
   *  `zone` via RAID_ZONE_BG). When set, the stage paints this image + a scrim
   *  and SKIPS the procedural `atmosphere` scene entirely. Undefined = keep the
   *  procedural look (practice skirmish, Gauntlet). */
  zoneBg?: string
  /** Optional CSS filter applied to the zone backdrop image only (not the ships
   *  or UI). Lets a caller retint the shared art without a new asset — e.g. the
   *  Gauntlet runs the abyss backdrop through a deeper, drowned-teal filter to set
   *  it apart from the campaign's abyss raids. Hardcore leaves it unset so its
   *  red vignette reads clean. */
  zoneFilter?: string
  /** The CALLER paints a full-screen backdrop behind the combat (e.g. a raid's
   *  zone photo, spanning the whole screen from RaidGame). When true, RaidCombat
   *  renders its own container fully TRANSPARENT — no boxed zone image, no
   *  stage gradient, no procedural atmosphere — so that single backdrop shows
   *  through behind the ships AND the control deck. The ships/HP/log keep their
   *  own translucent backings for legibility. */
  transparentBackdrop?: boolean
  /**
   * ── THE FIGHT HAPPENS ON HULLS THAT ARE ALREADY THERE ────────────────────
   *
   * Set when this is mounted over the sea chart (RaidSheet). The chart is
   * already drawing your man-o-war and the enemy's flagship, in the water, at
   * an honest scale against each other. Drawing them a SECOND time on a
   * painted horizon is the thing this mode exists to stop.
   *
   * WHAT ACTUALLY CHANGES IS SMALL, and deliberately so. The stage is one
   * coordinate space with two ship anchors in it, and every effect in this
   * file — hitsplats, cannon shots, auras, ability casts, the railgun, the
   * nuke arc — is placed relative to those anchors or to the stage they sit
   * in. So the anchors MOVE to where the real hulls are on screen and the two
   * <img> sprites are hidden. Forty effects follow their anchors for free;
   * none of them had to be rewritten, and none of them can drift out of sync
   * with the fight, because they are still the same elements.
   *
   * `anchors` is in VIEWPORT px and converted to stage-local here, so the
   * stage keeps whatever box the layout gives it.
   */
  overSea?: boolean
  /**
   * Where the chart's two hulls are right now, in viewport px: the centre of
   * each, and how wide it reads at the current zoom so effects scale with the
   * ship rather than with the window.
   *
   * A LIVE HANDLE, NOT A VALUE, and that is the whole reason it is shaped like
   * this. Both hulls move every frame — the sea heaves, the camera breathes,
   * the boat bobs — and a prop that changes every frame would re-render this
   * entire file at 60fps to slide two anchors a few pixels. The chart writes
   * into the handle, this reads it on its own frame and moves the anchors with
   * direct style writes. Nothing re-renders.
   */
  anchors?: { current: { player: ShipAnchor; enemy: ShipAnchor } | null }
  /**
   * THE MOTIONS THAT CANNOT FOLLOW AN ANCHOR, sent back to the chart.
   *
   * Recoil, shake, list and sinking animate the ship ELEMENT, and in this mode
   * that element is invisible — the real hull is a chart sprite (a DOM mark for
   * the enemy, and for the player either a DOM boat or a Pixi one, depending on
   * the mount). Those are published here as plain numbers for the chart to
   * apply to whichever it is drawing. Fires on a frame, only while something is
   * actually moving.
   */
  onShipFx?: (fx: { player: ShipFx; enemy: ShipFx }) => void
  /** Moments the sea answers: a broadside, a shot landing. See FightFx. */
  onFightFx?: (e: FightFx) => void
  /** Crew abilities pipeline. crewMembers carries id/slug/xp/name/portrait
   *  so RaidCombat can derive each crew's class + current milestone via
   *  lib/crewClasses. usedAbilityIds is the per-raid cooldown owned by
   *  RaidGame (clears at the rest stop). onAbilityFired signals back when
   *  a crew's ability lands so RaidGame can mark it used.
   *  All optional so practice raid (which uses no crew) still works. */
  crewMembers?: import('./actions').RaidCrewMember[]
  usedAbilityIds?: Set<number>
  /** When true, this fight OPENS with crew abilities freshly restored — drives a
   *  prominent one-shot "Crew Abilities Restored" banner so the refresh is
   *  obvious (Gauntlet: a boss kill or a Beat to Quarters reprieve). */
  abilitiesRefreshed?: boolean
  onAbilityFired?: (crewId: number) => void
  /** Activatable raid item (War Drum / Thunder Drum). usedRaidItemIds is the
   *  per-raid use set owned by the parent (survives the per-fight remount, like
   *  usedAbilityIds). onRaidItemUsed marks the item spent; onRefreshAbility asks
   *  the parent to clear one crew id from usedAbilityIds (the actual refresh).
   *  All optional so practice / hosts without the plumbing simply hide it. */
  usedRaidItemIds?: Set<string>
  onRaidItemUsed?: (itemId: string) => void
  onRefreshAbility?: (crewId: number) => void
  /** Sub-text shown on a USED crew-ability card. Defaults to the campaign's
   *  'Already used this raid.'; the Gauntlet overrides it (rounds cooldown). */
  usedAbilitySub?: string
  /** One extra line seeded into THIS fight's opening combat log (e.g. the
   *  Gauntlet's 'Crew abilities refreshed.' on a refresh round). */
  openingNote?: string
  /** Man-o-War volley augment (Phase 2). When set AND the player can stockpile
   *  MEGA_CHARGE_COST charges (the Gauntlet Rack), a "Mega" attack opens up. */
  megaAugment?: ShipAugment | null
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RaidCombat({
  enemy, affix, isElite = false, challenge = false,
  isBoss, shipImageUrl, shipFilter, enemyArtFilter = '', bonusChargeSlots = 0, shipName, playerLabel,
  playerCharacterColor, playerEquippedHat,
  playerAvatarBg, playerAvatarBorder,
  playerHpMax, playerHp: initialPlayerHp,
  shipMinDamage, shipSpeed, totalPower, totalNavigation,
  totalFortune = 0,
  crateOdds = [],
  equippedRaidItems,
  classDamageMult = 1,
  shipClasses = {},
  equippedRepairKit,
  killReward,
  onEnemyDefeated, onPlayerDefeated, onLeave, onPlayerHit, onStat,
  onDamageTaken, onShotResolved, onNoShotKill, onContractFacts,
  initialCharges = 0,
  runKills = 0, runDepth = 0,
  contractsWon = [],
  aimStyle = 'bar',
  dialAim,
  overSea = false, anchors, onShipFx, onFightFx,
  onPhaseBg,
  critStreakCfg,
  defeatSequence,
  bossDefeatedText,
  runBoons, runCurses,
  anchorSaveAvailable = false, onAnchorSave,
  raidMods, riskyFlee = false, fleeSignal, fleeNav,
  tideEffects = [],
  atmosphere = 'dusk',
  zoneBg,
  zoneFilter,
  transparentBackdrop = false,
  crewMembers = [], usedAbilityIds, abilitiesRefreshed = false, onAbilityFired,
  usedRaidItemIds, onRaidItemUsed, onRefreshAbility,
  usedAbilitySub = 'Already used this raid.', openingNote,
  megaAugment = null,
}: RaidCombatProps) {
  // Net crew raid effects; no-op default so the practice skirmish is unaffected.
  const mods: RaidMods = raidMods ?? { damagePct: 0, damageTakenPct: 0, critPct: 0, firstStrike: false }

  // ── Tide effects — compile run-active boons/debuffs into a flat
  //    multiplier/bonus context. Filtered by scope so a "next fight"
  //    HP delta from a previous fight doesn't refire here. Used below
  //    in the damage math, crit roll, charge init, etc. */
  const tide = useMemo(() => {
    let dmgMult       = 1
    let fireDmgMult   = 1
    let volleyDmgMult = 1
    let megaDmgMult   = 1   // Don's "Man-o-War's Wrath" boon — Mega only
    let overkillHealPct = 0 // Don's overkill-heal boon
    let volleyCostCut = 0   // Don's volley cost synergy (charges shaved off VOLLEY_COST)
    let megaCostCut   = 0   // Don's mega cost synergy (charges shaved off MEGA_CHARGE_COST)
    let bossDmgMult   = 1
    let bossVolMult   = 1
    let critBonus     = 0
    let critZoneMult  = 1
    let inDmgMult     = 1
    let inCritReduce  = 0
    let dodgeBonus    = 0
    let speedDelta    = 0
    let chargesStart  = 0
    let hpStartDelta  = 0
    let hpStartPct    = 0   // startHpPctDelta — fraction of max HP entering the fight
    let reloadProc    = { chance: 0, bonus: 0 }
    let everyFightHeal = 0
    let everyFightHealPct = 0
    let guaranteedDodgeBank = 0
    // Per-enemy one-shots applied at mount only.
    let enemyHpScaleMult = 1
    let enemyChargesDelta = 0
    // Aim-bar disruptors (Gauntlet curses): fog density + needle/zone speed +
    // random blackout intensity.
    let aimFog        = 0
    let playerStatusDuration = 1
    let noCleanse     = false
    let aimSpeedMult  = 1
    let zoneSpeedMult = 1
    let aimBlackout   = 0
    let aimDecoys     = 0   // False Colors curse: N decoy bands on random fires
    let confuseChance = 0   // Drowned Whispers curse: chance to scramble your action
    let hideEnemyHpChance = 0       // Shrouded Hull curse: chance the enemy HP is hidden
    let hideEnemyChargesChance = 0  // Shuttered Ports curse: chance enemy charges hidden
    // Elemental boons — Permafrost (ice) + Wildfire (fire). The proc chances fold
    // into the item burn/freeze math (capped in combat); the rest are multipliers
    // / flags read where burn + freeze resolve.
    let freezeChanceBoon = 0
    let frozenDmgMult    = 1
    let deepFreeze       = false
    let brittle          = false
    let burnChanceBoon   = 0
    let burnTurnsBonus   = 0
    let burnTickMult     = 1
    let reignite         = false
    let backdraft        = false
    // Confluence "Thermal Shock": burst mult when the hull is frozen AND burning.
    let thermalShockMult = 0
    // Confluence "Coup de Grâce": crit-gated execute pct. "Hull Render": per-volley
    // damage ramp (stacks per volley fired this fight).
    let critExecutePct = 0
    let volleyRampPct  = 0
    // More confluences: Reaper's Tithe (heal on sinking a hull), Feed the Fire
    // (burn ticks heal you), Iron Tempest (reflected damage multiplier). The
    // dodgeRefund plumbing below is idle since Weather Gauge (was Untouchable)
    // moved off dodge — kept wired for reuse.
    let executeHealPct    = 0
    let burnTickHealPct   = 0
    let dodgeRefundCharges = 0
    let retaliateBoostMult = 1
    // Weather Gauge / Hobble confluences: chance to seize the opening (auto-win
    // turn order) + chance to strike twice when you go first.
    let firstStrikeChance = 0
    let doubleStrikeChance = 0
    // All-or-Nothing curse: damage mult on non-crit shots (hit + graze).
    let noncritDmgMult = 1
    let healMult = 1
    // Gauntlet boons: crit-damage mult, execute threshold (sink at <= % HP),
    // lifesteal (heal % of damage dealt).
    let critDmgMult     = 1
    let executeThreshold = 0
    let lifestealPct    = 0
    // Spiteful Wake (thorns, additive), Wounded Fury (low-HP damage, take the
    // highest tier), Powder Hoard (charge carryover cap), Stormward (fight
    // shield as a fraction of max HP, take the highest).
    let retaliatePct    = 0
    let lowHpDamage     = 0
    let chargeCarryover = 0
    let fightShieldPct  = 0
    let enemyShieldPct  = 0
    // Field Repairs / Engorge (overheal past max, shed at fight end) + Field
    // Repairs repair-kit heal boost. Max HP itself is host-owned, so the
    // maxHp* effects are no-ops here (see the switch).
    let overhealPct     = 0
    let repairHealMult  = 1
    // Momentum boons: Cannonade (crit-streak ramp — the live streak is a ref,
    // this just carries the per-stack/cap tuning), Counter-Battery (chance to
    // negate an enemy shot you fire into). Rising Tide / Abyssal Bounty resolve
    // straight into dmgMult below using the live run tally.
    // A raid can BAKE the ramp in (Finn) rather than it arriving as a drafted
    // boon. Folded in here so every downstream consumer works unchanged: the
    // damage multiplier, the commit-on-landed-shot, the log line, the hull rim.
    let critStreakPerStack  = critStreakCfg?.perStack  ?? 0
    let critStreakMaxStacks = critStreakCfg?.maxStacks ?? 0
    let counterFireChance   = 0
    // Confluences on the momentum boons: Broadside Duel (counters fire more +
    // feed the streak + refund), Return to Sender (counter reflects their shell),
    // Feeding Frenzy (lifesteal scales with kills — folded into lifestealPct).
    let counterBonusRefund = 0
    let counterBonusStack = 0
    let counterBonusChance = 0
    let counterReflectPct = 0
    // Spiteful Wake: chip the enemy for this fraction of a shot you DODGE.
    let retaliateDodgePct = 0
    // Momentum (Rising Tide / Abyssal Bounty + the Deep Wake confluence) is
    // SUMMED per axis and applied ONCE — Deep Wake's per-kill/per-depth ADD into
    // its component's rate under a shared (summed) cap, instead of stacking a
    // separate multiplier. That's what stops the momentum axis compounding into
    // a runaway ×4+ multiplier while keeping its kill/depth-damage identity.
    let killDmgPerKill = 0,  killDmgCap = 0
    let depthDmgPerDepth = 0, depthDmgCap = 0
    const statusOnHitList: { status: string; chance: number; magnitude: number; turns: number }[] = []
    const playerStartStatusList: { status: string; magnitude: number; turns: number }[] = []
    let shieldPierceFrac = 0        // Armor-Piercing: fraction of enemy barrier ignored
    let stunOnHitChance = 0, stunOnHitTurns = 1   // legacy chance-stun (Deep Terror)
    // Kraken's Grip — deterministic. Strongest source wins on each axis rather
    // than summing, so two sources can't trivialise the counter.
    let gripHits = 0, gripTurns = 1, gripCrushPerStack = 0
    let guaranteedCritEvery = 0     // Loaded for Bear: 0 = off; else every Nth shot crits
    let stealChargeChance = 0       // Press-Gang
    let parryChance = 0, parryReflectPct = 0      // Cutlass Guard
    let aimClarity = 0              // Steady Sights: 0-1 fog/blackout reduction
    let randomFightBuff = 0        // The Don's Favor: magnitude of the per-fight blessing
    let abilityRefundChance = 0    // Second Calling: chance a fired ability isn't spent
    let enemyUltDmgMult = 1, enemyUltChargeChance = 0   // The Verdict
    let enemyChargeSteal = 0       // Cutpurse Tide
    let enemyParryChance = 0       // Thornmail
    let enemyLifesteal = 0         // The Tithe
    let randomFightDebuff = 0      // The Undertow / Bloodscent
    let flareFuseMult = 1, flareDmgMult = 1   // Flare Storm
    let barrierRegrow = 0          // Barrier Regrowth
    for (const e of tideEffects) {
      switch (e.kind) {
        case 'damageMult':            dmgMult *= e.mult; break
        case 'fireDmgMult':           fireDmgMult *= e.mult; break
        case 'volleyDmgMult':         volleyDmgMult *= e.mult; break
        case 'megaDmgMult':           megaDmgMult *= e.mult; break
        case 'overkillHealPct':       overkillHealPct += e.pct; break
        case 'volleyCostReduction':   volleyCostCut += e.n; break
        case 'megaCostReduction':     megaCostCut += e.n; break
        case 'bossDamageMult':        bossDmgMult *= e.mult; break
        case 'bossVolleyDmgMult':     bossVolMult *= e.mult; break
        case 'critChanceBonus':       critBonus += e.chance; break
        case 'critZoneScale':         critZoneMult *= e.mult; break
        case 'critDmgMult':           critDmgMult *= e.mult; break
        case 'executeThreshold':      executeThreshold = Math.max(executeThreshold, e.pct); break
        case 'lifestealPct':          lifestealPct += e.pct; break
        case 'retaliatePct':          retaliatePct += e.pct; retaliateDodgePct += (e.dodgePct ?? 0); break
        case 'lowHpDamage':           lowHpDamage = Math.max(lowHpDamage, e.maxBonus); break
        case 'chargeCarryover':       chargeCarryover = Math.max(chargeCarryover, e.cap); break
        case 'fightShield':           fightShieldPct += e.pctMax; break   // sources STACK (Stormward + Deep Fortress + Last Bastion), per their copy
        case 'enemyShield':           enemyShieldPct = Math.max(enemyShieldPct, e.pctMax); break
        case 'incomingDmgMult':       inDmgMult *= e.mult; break
        case 'overhealPct':           overhealPct = Math.max(overhealPct, e.pct); break
        case 'repairHealMult':        repairHealMult *= e.mult; break
        // Max HP is resolved by the Gauntlet host into playerHpMax, not here.
        case 'maxHpMult': case 'maxHpPerDepth': case 'maxHpPerKill': break
        case 'incomingCritReduction': inCritReduce += e.chance; break
        case 'dodgeBonus':            dodgeBonus += e.chance; break
        case 'speedDelta':            speedDelta += e.n; break
        case 'firstStrikeChance':     firstStrikeChance = Math.max(firstStrikeChance, e.chance); break
        case 'doubleStrikeOnFirst':   doubleStrikeChance = Math.max(doubleStrikeChance, e.chance); break
        case 'startCharges':          chargesStart += e.n; break
        case 'startHpDelta':
          // Apply nextFight scope at every mount; boss scope only on boss.
          if (e.scope === 'nextFight') hpStartDelta += e.n
          else if (e.scope === 'boss' && isBoss) hpStartDelta += e.n
          break
        case 'startHpPctDelta':
          // Same scoping, but a fraction of max HP (resolved against playerHpMax
          // below) so a wound still bites at high level.
          if (e.scope === 'nextFight') hpStartPct += e.pct
          else if (e.scope === 'boss' && isBoss) hpStartPct += e.pct
          break
        case 'startOfFightHeal':      everyFightHeal += e.n; break
        case 'startOfFightHealPct':   everyFightHealPct += e.pctMax; break
        case 'reloadProc':
          // Procs stack additively on chance + bonus (simple model;
          // future tier 4 tides could replace with a more nuanced curve).
          reloadProc = { chance: Math.min(1, reloadProc.chance + e.chance), bonus: reloadProc.bonus + e.bonusCharges }
          break
        case 'guaranteedDodge':       guaranteedDodgeBank += e.n; break
        case 'enemyHpScale':          enemyHpScaleMult *= e.mult; break
        case 'enemyStartChargesDelta':enemyChargesDelta += e.n; break
        case 'aimFog':                aimFog = Math.min(0.92, aimFog + e.density); break
        case 'playerStatusDuration':  playerStatusDuration *= e.mult; break
        case 'noCleanse':             noCleanse = true; break
        case 'aimSpeedMult':          aimSpeedMult *= e.mult; break
        case 'zoneSpeedMult':         zoneSpeedMult *= e.mult; break
        case 'aimBlackout':           aimBlackout = Math.min(0.95, Math.max(aimBlackout, e.intensity)); break
        case 'aimDecoys':             aimDecoys = Math.max(aimDecoys, e.n); break
        case 'confuse':               confuseChance = Math.max(confuseChance, e.chance); break
        case 'hideEnemyHp':           hideEnemyHpChance = Math.max(hideEnemyHpChance, e.chance); break
        case 'hideEnemyCharges':      hideEnemyChargesChance = Math.max(hideEnemyChargesChance, e.chance); break
        case 'iceAffinity':
          freezeChanceBoon = Math.max(freezeChanceBoon, e.freezeChance)
          frozenDmgMult    = Math.max(frozenDmgMult, e.frozenDmgMult)
          if (e.brittle)    brittle = true
          if (e.deepFreeze) deepFreeze = true
          break
        case 'fireAffinity':
          burnChanceBoon = Math.max(burnChanceBoon, e.burnChance)
          burnTurnsBonus = Math.max(burnTurnsBonus, e.burnTurnsBonus)
          burnTickMult   = Math.max(burnTickMult, e.burnTickMult)
          if (e.reignite)  reignite = true
          if (e.backdraft) backdraft = true
          break
        case 'thermalShock':          thermalShockMult = Math.max(thermalShockMult, e.burstMult); break
        case 'critExecute':           critExecutePct = Math.max(critExecutePct, e.pct); break
        case 'volleyRamp':            volleyRampPct = Math.max(volleyRampPct, e.perVolley); break
        case 'executeHeal':           executeHealPct = Math.max(executeHealPct, e.pctMaxHp); break
        case 'burnTickHeal':          burnTickHealPct = Math.max(burnTickHealPct, e.pctTick); break
        case 'dodgeRefund':           dodgeRefundCharges = Math.max(dodgeRefundCharges, e.charges); break
        case 'retaliateBoost':        retaliateBoostMult = Math.max(retaliateBoostMult, e.mult); break
        case 'noncritDmgMult':        noncritDmgMult *= e.mult; break
        case 'healMult':              healMult *= e.mult; break
        // Rising Tide / Abyssal Bounty (+ Deep Wake): accumulate the per-axis
        // rate + cap; resolved into ONE multiplier per axis after the loop so
        // Deep Wake reinforces its component instead of compounding.
        case 'killStackDamage':       killDmgPerKill  += e.perKill;  killDmgCap  += e.maxBonus; break
        case 'depthScaleDamage':      depthDmgPerDepth += e.perDepth; depthDmgCap += e.maxBonus; break
        // Cannonade / Counter-Battery: take the highest tier held.
        case 'critStreakDamage':
          if (e.perStack > critStreakPerStack) { critStreakPerStack = e.perStack; critStreakMaxStacks = e.maxStacks }
          break
        case 'counterFireChance':     counterFireChance = Math.max(counterFireChance, e.chance); break
        case 'counterBonus':
          counterBonusRefund = Math.max(counterBonusRefund, e.refund)
          counterBonusStack = Math.max(counterBonusStack, e.bonusStack)
          counterBonusChance = Math.max(counterBonusChance, e.chanceBonus)
          break
        case 'counterReflect':        counterReflectPct = Math.max(counterReflectPct, e.pct); break
        case 'lifestealKillScale':    lifestealPct += Math.min(e.max, e.perKill * Math.max(0, runKills)); break
        case 'depthScaleMitigation':  inDmgMult *= (1 - Math.min(e.max, e.perDepth * Math.max(0, runDepth))); break
        case 'statusOnHit':           statusOnHitList.push({ status: e.status, chance: e.chance, magnitude: e.magnitude, turns: e.turns }); break
        case 'playerStartStatus':     playerStartStatusList.push({ status: e.status, magnitude: e.magnitude, turns: e.turns }); break
        case 'shieldPierce':          shieldPierceFrac = Math.max(shieldPierceFrac, e.pct); break
        case 'stunOnHit':             if (e.chance > stunOnHitChance) { stunOnHitChance = e.chance; stunOnHitTurns = e.turns } break
        case 'gripStacks':            if (gripHits === 0 || e.hits < gripHits) gripHits = e.hits
                                      gripTurns = Math.max(gripTurns, e.turns)
                                      gripCrushPerStack = Math.max(gripCrushPerStack, e.crushPerStack); break
        case 'guaranteedCritEvery':   if (e.n > 0 && (guaranteedCritEvery === 0 || e.n < guaranteedCritEvery)) guaranteedCritEvery = e.n; break
        case 'stealCharge':           stealChargeChance = Math.max(stealChargeChance, e.chance); break
        case 'parryChance':           if (e.chance > parryChance) { parryChance = e.chance; parryReflectPct = e.reflectPct } break
        case 'aimClarity':            aimClarity = Math.max(aimClarity, e.reduce); break
        case 'randomFightBuff':       randomFightBuff = Math.max(randomFightBuff, e.magnitude); break
        case 'abilityRefundChance':   abilityRefundChance = Math.max(abilityRefundChance, e.chance); break
        case 'enemyUltimateBoost':    enemyUltDmgMult *= e.dmgMult; enemyUltChargeChance = Math.max(enemyUltChargeChance, e.chargeChance); break
        case 'enemyChargeSteal':      enemyChargeSteal = Math.max(enemyChargeSteal, e.bonus); break
        case 'enemyParry':            enemyParryChance = Math.max(enemyParryChance, e.chance); break
        case 'enemyLifesteal':        enemyLifesteal = Math.max(enemyLifesteal, e.pct); break
        case 'randomFightDebuff':     randomFightDebuff = Math.max(randomFightDebuff, e.magnitude); break
        case 'flareStorm':            flareFuseMult *= e.fuseMult; flareDmgMult *= e.dmgMult; break
        case 'barrierRegrow':         barrierRegrow = Math.max(barrierRegrow, e.pctMax); break
        case 'instantHeal': case 'instantHealPct': case 'fullHeal': case 'doubloonsAtRaidEnd': break // handled at pick-time
      }
    }
    // Momentum axes resolved ONCE each (summed rate, capped at summed cap), so
    // Rising Tide + Deep Wake (and Abyssal Bounty + Deep Wake) add rather than
    // multiply. The kill axis and the depth axis still multiply each other.
    if (killDmgPerKill  > 0) dmgMult *= 1 + Math.min(killDmgCap,  killDmgPerKill  * Math.max(0, runKills))
    if (depthDmgPerDepth > 0) dmgMult *= 1 + Math.min(depthDmgCap, depthDmgPerDepth * Math.max(0, runDepth))
    return {
      dmgMult, fireDmgMult, volleyDmgMult, megaDmgMult, overkillHealPct, volleyCostCut, megaCostCut, bossDmgMult, bossVolMult,
      critBonus, critZoneMult, inDmgMult, inCritReduce,
      dodgeBonus, speedDelta, firstStrikeChance, doubleStrikeChance,
      chargesStart, hpStartDelta, hpStartPct, everyFightHeal, everyFightHealPct,
      reloadProc, guaranteedDodgeBank,
      enemyHpScaleMult, enemyChargesDelta,
      aimFog, playerStatusDuration, noCleanse, aimSpeedMult, zoneSpeedMult, aimBlackout, aimDecoys, confuseChance, hideEnemyHpChance, hideEnemyChargesChance, noncritDmgMult, healMult,
      freezeChanceBoon, frozenDmgMult, deepFreeze, brittle,
      burnChanceBoon, burnTurnsBonus, burnTickMult, reignite, backdraft, thermalShockMult,
      critExecutePct, volleyRampPct,
      executeHealPct, burnTickHealPct, dodgeRefundCharges, retaliateBoostMult,
      critDmgMult, executeThreshold, lifestealPct,
      retaliatePct, retaliateDodgePct, lowHpDamage, chargeCarryover, fightShieldPct, enemyShieldPct,
      overhealPct, repairHealMult,
      critStreakPerStack, critStreakMaxStacks, counterFireChance,
      counterBonusRefund, counterBonusStack, counterBonusChance, counterReflectPct,
      statusOnHitList, playerStartStatusList,
      shieldPierceFrac, stunOnHitChance, stunOnHitTurns, gripHits, gripTurns, gripCrushPerStack, guaranteedCritEvery, stealChargeChance,
      parryChance, parryReflectPct, aimClarity, randomFightBuff, abilityRefundChance,
      enemyUltDmgMult, enemyUltChargeChance, enemyChargeSteal, enemyParryChance, enemyLifesteal, randomFightDebuff,
      flareFuseMult, flareDmgMult, barrierRegrow,
    }
  }, [tideEffects, isBoss, runKills, runDepth])
  // Shrouded Hull / Shuttered Ports curses — rolled ONCE per fight (RaidCombat
  // remounts per Gauntlet enemy). Purely visual: the enemy AI still reads its
  // real HP + charges; only the player's readout is fogged over.
  const [enemyHpHidden] = useState(() => Math.random() < tide.hideEnemyHpChance)
  const [enemyChargesHidden] = useState(() => Math.random() < tide.hideEnemyChargesChance)
  // Field Repairs / Engorge overheal ceiling: heals may fill to this instead of
  // playerHpMax. The excess is temporary — the Gauntlet host clamps carried HP
  // back to max at the next fight, so overheal never persists.
  const healCap = Math.round(playerHpMax * (1 + tide.overhealPct))

  // ── Statuses (Ch4 pipeline, lib/statuses) ──────────────────────────────────
  // Timed buffs/debuffs on EITHER side. Refs are the combat-read source of
  // truth (appliers can fire mid-resolution); state mirrors drive the badge
  // row. Per-fight: reset alongside the enemy in the reset effect below.
  // Dormant until something calls the appliers — no existing fight applies one.
  const [playerStatuses, setPlayerStatuses] = useState<ActiveStatus[]>([])
  const [enemyStatuses, setEnemyStatuses] = useState<ActiveStatus[]>([])
  const playerStatusesRef = useRef<ActiveStatus[]>([])
  const enemyStatusesRef = useRef<ActiveStatus[]>([])
  const applyPlayerStatus = (id: StatusId, magnitude: number, turns: number) => {
    // Bad Blood stretches whatever lands on you. Rounded up, so a 1-turn status
    // at 2x is 2 rather than disappearing into a floor.
    const t = Math.ceil(turns * tide.playerStatusDuration)
    playerStatusesRef.current = applyStatus(playerStatusesRef.current, id, magnitude, t)
    setPlayerStatuses(playerStatusesRef.current)
  }
  const applyEnemyStatus = (id: StatusId, magnitude: number, turns: number) => {
    enemyStatusesRef.current = applyStatus(enemyStatusesRef.current, id, magnitude, turns)
    setEnemyStatuses(enemyStatusesRef.current)
  }
  // Cleanse (Mender / Abyssal Tide / Laz's ward): strip every player DEBUFF
  // status, keep buffs. Logs what lifted so the cleanse is felt.
  const cleansePlayerStatuses = () => {
    // Bad Blood tier 2: nothing lifts. Silent rather than logged, because the
    // term already told you, and a "your cleanse did nothing" line every time a
    // Mender fires would be noise on a run you signed up for.
    if (tide.noCleanse) return
    const { next, removed } = cleanseStatuses(playerStatusesRef.current)
    if (removed.length === 0) return
    playerStatusesRef.current = next
    setPlayerStatuses(next)
    setResolveLog(prev => [...prev, `Cleansed: ${removed.map(s => STATUS_DEFS[s.id].name).join(', ')} lifted.`])
  }
  // Aggregated numbers for the CURRENT render (badges, button gating). Combat
  // resolution re-aggregates from the refs at read time.
  const playerStatusMods = useMemo(() => statusMods(playerStatuses), [playerStatuses])
  // Mirror the per-enemy tide one-shots (next-fight HP scale + enemy start
  // charges) so the enemy-RESET effect below — which has intentionally tight
  // deps so it doesn't refire mid-fight — reads the CURRENT values. Without
  // this the reset reverts the enemy to full hpBase, silently dropping a
  // "next enemy starts at half HP" tide. Updated during render so the value
  // is committed before the post-commit reset effect runs.
  const enemyHpScaleMultRef = useRef(tide.enemyHpScaleMult)
  enemyHpScaleMultRef.current = tide.enemyHpScaleMult
  const enemyChargesDeltaRef = useRef(tide.enemyChargesDelta)
  enemyChargesDeltaRef.current = tide.enemyChargesDelta
  // PLAYER start-charge tide (startCharges: netting +2, NO_CHARGES = start at 0,
  // -1 ones). Mirror it so the tight-deps reset effect can fold it into the
  // player's opening cannonballs — otherwise the reset clobbers the useState
  // seed and the tide silently does nothing.
  const chargesStartRef = useRef(tide.chargesStart)
  chargesStartRef.current = tide.chargesStart
  // Stormward boon: shield worth a % of max HP, reformed each fight. Mirror the
  // computed amount so the tight-deps reset effect can seed it (it feeds the
  // same soak pool the Abyssal Tide ability uses). Only seeded when > 0, so
  // regular raids without boons are untouched.
  const fightShieldMaxRef = useRef(Math.round(tide.fightShieldPct * playerHpMax))
  fightShieldMaxRef.current = Math.round(tide.fightShieldPct * playerHpMax)
  // THE WARD (Don's Palisade). A player barrier off an ITEM rather than a boon,
  // so it exists in raids where Stormward never has. It soaks from the same pool
  // as every other shield, so it shows in the one combined chip on the HP bar.
  //
  // ward_pct SUMS across sources (a fusion carrying its parent's ward should add
  // up), while ward_refill_pct takes the BEST, since two different brace rates
  // on one reload has no sensible reading.
  const wardFx = getActiveEffects(equippedRaidItems)
  const wardMaxRef = useRef(0)
  wardMaxRef.current = Math.round(wardFx.filter(e => e.type === 'ward_pct').reduce((a, e) => a + e.value, 0) * playerHpMax)
  const wardRefillRef = useRef(0)
  wardRefillRef.current = Math.round(wardMaxRef.current * wardFx.filter(e => e.type === 'ward_refill_pct').reduce((a, e) => Math.max(a, e.value), 0))
  // The pool's opening size, so a Reload brace can top it back up without ever
  // pushing it past what the fight started with.
  const shieldOpenMaxRef = useRef(0)
  // Guaranteed-dodge tide (one-shot "next fight" token). Mirror the bank size
  // so the tight-deps reset effect can refill it per fight, and track how many
  // are LEFT this fight in a separate ref the dodge resolver decrements.
  const guaranteedDodgeBankRef = useRef(tide.guaranteedDodgeBank)
  guaranteedDodgeBankRef.current = tide.guaranteedDodgeBank
  const guaranteedDodgeLeftRef = useRef(tide.guaranteedDodgeBank)
  // Anchor save can fire at most once per RaidCombat mount (the parent
  // tracks the per-run charge across encounter remounts via onAnchorSave).
  const anchorUsedRef = useRef(false)
  // Repair kit: resolve the equipped kit once, then track per-battle use.
  // Special action stays disabled when the kit is missing, used, or the
  // player is at full HP (can't waste a heal accidentally).
  const repairKit = getRepairKit(equippedRepairKit)
  const [kitUsed, setKitUsed] = useState(false)

  // ── Crew class abilities (in-fight state) ─────────────────────────────────
  // Per-raid cooldown lives in RaidGame (usedAbilityIds prop). Per-turn lock
  // lives here and resets whenever the player starts a new turn — the chooser
  // grays out ALL crew ability cards (including the repair kit) once any one
  // of them fires this turn, so the player can't burst all four in a row.
  const [oneAbilityUsedThisTurn, setOneAbilityUsedThisTurn] = useState(false)
  // Sharpshot — next N shots have a wider crit zone. Consumed by a shot
  // landing (any of miss/graze/hit/critical — the buff applies *to* the roll).
  const [sharpshotBuff, setSharpshotBuff] = useState<{ multiplier: number; shotsLeft: number } | null>(null)
  // Fishing gear widening the hit band, dial only (see lib/dialAim).
  const dialHitBonus = aimStyle === 'dial' ? (dialAim?.hitBonus ?? 0) : 0
  // BAND WIDTHS ON THE DIAL. A width that reads fine as a slice of a straight
  // bar looks enormous as a slice of a full circle, so the dial scales its
  // bands, and it scales HIT and CRIT SEPARATELY on purpose.
  //
  // The hit band is deliberately TIGHT: this is the last fight, and a shot
  // that only clips him should feel like a near miss. The crit band is",
  // deliberately NOT tightened with it. One shared scale (0.42) had squeezed
  // the gold to 3.6 degrees, under HALF the bar's relative crit and 40%
  // narrower than a fishing perfect, while the needle orbits continuously
  // rather than bouncing in a bounded lane. That was unlandable, not hard.
  //
  // Result: gold 7.8 deg, green shoulder ~3.5 deg either side, grey graze out
  // to 24 deg. Precision is rewarded and a sloppy lock barely scratches him.
  // Applied to PAINT and JUDGMENT alike, so the picture cannot disagree.
  // How much of the reel's fishing slowdown carries into the finale. The reel
  // halves the needle speed when fishing (1.00 -> 0.50); carrying that whole
  // range over would drop a maxed angler to a 7.7s sweep, which is not a final
  // boss. Compressed to ~0.32 so the SPREAD is meaningful without the top end
  // going slack: a bad reel sweeps in 2.8s and a maxed one in 3.3s.
  const DIAL_REEL_RELIEF = 0.32
  const DIAL_HIT_SCALE  = 0.34
  const DIAL_CRIT_SCALE = 0.90
  const hitScale  = aimStyle === 'dial' ? DIAL_HIT_SCALE  : 1
  const critScale = aimStyle === 'dial' ? DIAL_CRIT_SCALE : 1
  const liveCritW = CRIT_W * tide.critZoneMult * (sharpshotBuff ? 1 + sharpshotBuff.multiplier : 1) * critScale
  // The hit + graze half-widths this fight actually uses. Bar fights get the
  // untouched constants; only the dial scales.
  const aimHitW   = (HIT_W + dialHitBonus) * hitScale
  const aimGrazeW = GRAZE_W * hitScale
  const aimHitWRef   = useRef(aimHitW)
  const aimGrazeWRef = useRef(aimGrazeW)
  // Desktop keyboard: Space presses the aim bar's Lock button while it is
  // mounted (data-space-action above). Installed once per combat; the
  // dispatcher no-ops whenever no tagged button is on screen, and its
  // occlusion check keeps Space dead under any overlay (tides, loot, pause).
  useEffect(() => installSpaceAction(), [])

  useEffect(() => { aimHitWRef.current = aimHitW;   }, [aimHitW])
  useEffect(() => { aimGrazeWRef.current = aimGrazeW }, [aimGrazeW])
  const liveCritWRef = useRef(liveCritW)
  useEffect(() => { liveCritWRef.current = liveCritW }, [liveCritW])
  // Width the shot was JUDGED at, captured in lockShot. The drawn band uses
  // this during the freeze — consuming Sharpshot at lock would otherwise
  // shrink the gold band mid-freeze and the picture would lie about the
  // window the shot was scored against.
  const lockedCritWRef = useRef(liveCritW)
  // Snare — enemy can't dodge for N player turns. -1 = rest of fight.
  // Decremented at the start of each player turn while > 0; rest-of-fight
  // sticks until the encounter ends (component remounts next fight).
  const [snareDodgeTurns, setSnareDodgeTurns] = useState<number>(0)
  // Mirror into a ref so the pickEnemyAction callback (tight deps) reads
  // the current value without listing it as a dep.
  const snareDodgeTurnsRef = useRef(0)
  useEffect(() => { snareDodgeTurnsRef.current = snareDodgeTurns }, [snareDodgeTurns])
  // Snare's per-attempt JAM chance while active (0-1). The snare no longer hard-
  // locks dodge — each enemy dodge attempt in the window is jammed at this odds.
  const snareJamChanceRef = useRef(0)
  // Set by pickEnemyAction when the snare actually substitutes an enemy dodge
  // this turn; resolveTurn reads it to surface a "jammed!" log so the player
  // SEES the snare working (otherwise the swap is invisible).
  const snareBlockedRef = useRef(false)
  // Per-turn ability lock + Snare countdown — the useEffect that reacts to
  // turn changes is defined further down where the `turn` state is in
  // scope (search for "ability per-turn reset effect").
  // Anchor — next incoming hit's damage is reduced by this fraction (0-1).
  // Read + consumed at hit-resolve time inside resolveTurn (which builds the
  // turn synchronously), so the live value lives in a ref the resolver reads
  // and decrements; the state mirror drives the brace glint on the hull.
  const [anchorReductionPct, setAnchorReductionPct] = useState<number | null>(null)
  const anchorReductionRef = useRef<number | null>(null)
  const anchorAbsorbsCritsRef = useRef(false)   // Lv 100 anchor cuts crits too
  // Abyssal Tide (Catfish-only legendary) — damage-absorbing shield buffer
  // granted on top of HP. Drains BEFORE HP on incoming hits and carries over
  // across turns/phases until consumed. Same ref-for-resolver + state-for-glint
  // split as the anchor.
  const [abyssalShieldHp, setAbyssalShieldHp] = useState(0)
  const abyssalShieldRef = useRef(0)
  // ONE POOL, ONE READOUT. There used to be a typed breakdown mirrored beside
  // this — an amber "opening boon" layer and a cyan "crew ability" layer — and
  // the bar drew a coloured segment and its own icon for each. It was only ever
  // a display split: every one of them soaks from abyssalShieldRef, so a player
  // reading two shield numbers had to add them to know what they actually had,
  // and the colours implied a distinction the damage maths has never made.
  // Shield soak flare + the PLAYBACK-time shield value it's diffed against (the
  // refs above are already fully depleted by the resolve pass, so playback needs
  // its own tracker to spot the drop as it paints).
  const [shieldSoakFx, setShieldSoakFx] = useState<{ key: number } | null>(null)
  const playedShieldRef = useRef<number | null>(null)
  useEffect(() => {
    if (!shieldSoakFx) return
    const t = setTimeout(() => setShieldSoakFx(null), 520)
    return () => clearTimeout(t)
  }, [shieldSoakFx])
  // Vengeance (Laz the Coelacanth-only legendary) — an ARMED ward, current-fight
  // only. When the ability fires we capture that crew's heal% + damage-buff% and
  // arm the ward. If a killing blow would land THIS fight while armed, we negate
  // it: heal from the captured %, then apply the damage buff to outgoing shots
  // for the rest of the fight. All reset when the enemy changes (per-fight scope).
  const vengeanceWardRef = useRef(false)
  const vengeanceHealPctRef = useRef(0)   // captured at arm time
  const vengeanceBuffPctRef = useRef(0)   // captured at arm time
  const vengeanceCleanseRef = useRef(false)
  const vengeanceDmgBuffRef = useRef(0)   // applied buff, live for rest of fight
  const [vengeanceEruptFx, setVengeanceEruptFx] = useState(0)   // bump → crimson burst
  // Requiem (Mira) Lv100 — rounds the enemy's shield is IGNORED while her mark
  // burns. Set at cast, decremented each round tick, gates the shield pierce in
  // both the cannon path (`piercing`) and the crew-ability soak. Independent of
  // the `marked` status so a raid-item feeble can't accidentally pierce.
  const markPierceTurnsRef = useRef(0)
  // THE WARD BURNS DOWN. It used to hold for the whole fight, which made Laz a
  // "press it whenever" ability: arm it early, forget it, and it either caught a
  // death for free or quietly did nothing. A 3-turn fuse turns him into what the
  // class is actually named for — a READ. You arm it because you think the next
  // few turns are the ones that kill you, and if you misjudge, it gutters out and
  // you spent your legendary on nothing.
  //
  // Mirrored into STATE (not just a ref) because the chip under your hull has to
  // count down where you can see it. An invisible fuse is not a decision, it is a
  // trap, and this ability had NO on-screen presence at all before now.
  const vengeanceWardTurnsRef = useRef(0)
  const [vengeanceWardTurns, setVengeanceWardTurns] = useState(0)
  const setWardTurns = (n: number) => { vengeanceWardTurnsRef.current = n; setVengeanceWardTurns(n) }
  // Laz's Vengeance ward is the FIRST line against death — it runs BEFORE any
  // item save (Quartermaster's Anchor) at every lethal gate, so the anchor is
  // never spent while Laz can catch the blow. When armed and a would-be-lethal
  // hit lands (from ANY source: a shot, a burn tick, a failed mechanic check),
  // this consumes the ward, revives to a % of max HP, and lights the rage buff
  // for the rest of the fight (Lv 100 also cleanses debuffs). Returns the revive
  // HP + buff for the caller to apply + log, or null when the ward isn't up.
  function tryVengeanceRevive(): { hp: number; buffPct: number } | null {
    if (!vengeanceWardRef.current || vengeanceWardTurnsRef.current <= 0) return null
    const reviveHp = Math.max(1, Math.round(playerHpMax * vengeanceHealPctRef.current * tide.healMult))
    const buffPct = vengeanceBuffPctRef.current
    vengeanceDmgBuffRef.current = buffPct
    vengeanceWardRef.current = false
    setWardTurns(0)
    setVengeanceEruptFx(k => k + 1)
    vibrate([0, 55, 45, 95])
    if (vengeanceCleanseRef.current) {
      playerBurnRef.current = { turns: 0, dmg: 0 }
      playerFrozenRef.current = false
      playerFreezePendingRef.current = false
      setPlayerBurning(false)
      setPlayerFrozen(false)
      cleansePlayerStatuses() // Ch4 statuses lift with the ward too
    }
    onCheatedDeath()
    return { hp: reviveHp, buffPct }
  }

  // ── ABYSSAL TWISTS — the per-fight state the tier-3 fusions hang off ────────
  // Each Abyssal carries one conditional its two parents cannot produce between
  // them (see the effect-type block in lib/raidItems). All of it is CURRENT-FIGHT
  // only and cleared in the fresh-enemy reset below, same as the vengeance ward.
  //
  /** Drowned Crown: a killing blow has been cheated this fight, so the crown's
   *  bite vs elites is live for the rest of it. */
  const avengeArmedRef = useRef(false)
  /** Leviathan's Cannon: extra turns of damage ramp bought by landed crits. Added
   *  to the turn clock, so the ramp runs ahead of the fight. */
  const critRampBonusRef = useRef(0)
  /** Warlord's Reckoning: the shot count at the start of the current boss phase.
   *  The opener is "the next shot after this", so a phase change re-arms it. */
  const shotsAtPhaseStartRef = useRef(0)
  /** Aegis of the Deep: enemy attacks that have landed on you this fight. The
   *  first-blow brace only looks at 0. */
  const enemyAttacksThisFightRef = useRef(0)

  /** Every rider that fires when a killing blow is CHEATED, from any source — an
   *  item lethal save or Laz's vengeance ward. Two Abyssals hang off this moment
   *  and both should read it the same way, so it lives in one place rather than
   *  being copy-pasted across the (currently four) lethal gates. */
  function onCheatedDeath(): void {
    const fx = getActiveEffects(equippedRaidItems.filter(id => id !== repossessedItemRef.current))
    // Drowned Crown — arm the avenging bite.
    if (fx.some(e => e.type === 'avenge_elite_mult')) avengeArmedRef.current = true
    // The Standing Wall — the barrier comes straight back up. Restored to the
    // pool's OPENING size, never past it, exactly like the Reload brace.
    if (
      fx.some(e => e.type === 'ward_refill_on_save')
      && shieldOpenMaxRef.current > 0
      && abyssalShieldRef.current < shieldOpenMaxRef.current
    ) {
      abyssalShieldRef.current = shieldOpenMaxRef.current
      setAbyssalShieldHp(shieldOpenMaxRef.current)
      setResolveLog(prev => [...prev, 'The Standing Wall goes straight back up.'])
    }
  }

  // Hull Render confluence: how many Volleys the player has fired THIS fight, so
  // each one ramps harder than the last. Reset on every fight start.
  const volleyCountRef = useRef(0)
  // Cannonade boon: consecutive player CRITS this fight. Each crit bumps it,
  // any non-crit shot resets it to 0. Fresh per fight (RaidCombat remounts per
  // enemy), so no manual reset needed.
  const critStreakRef = useRef(0)
  // What the streak is CALLED in the log. Cannonade when it is the drafted
  // Gauntlet boon; a raid that bakes the ramp in names its own (Finn calls it
  // Perfect Streak, borrowing the fishing language on purpose).
  const streakLabel = critStreakCfg?.label ?? 'Cannonade'
  // Cleanse Mender flag — Lv 100 Mender heals AND strips one enemy debuff
  // from the player. There's no in-fight debuff system yet, so this is a
  // hook for future expansion; for now it's tracked but does nothing.
  const [, setCleanseDebuffPending] = useState(false)
  // The label shown in-fight + on the ledger popup. Defaults to the boat
  // name when the parent didn't pass a player-specific name through.
  const nameplate = playerLabel ?? shipName
  // Stats-breakdown popup, opened by tapping the player nameplate
  const [showStats, setShowStats]     = useState(false)
  // Tappable enemy nameplate → an analog of the Captain's Ledger for the
  // current enemy: HP / damage range / volley / crit / speed, the themed
  // ability if any (Carapace etc.), and the enemy's full behavior pattern as
  // a visible cycle so players can study what punches come when.
  const [showEnemyStats, setShowEnemyStats] = useState(false)
  // Flee confirmation (real raids only). The UI is deliberately one number:
  // the die face needed to escape. fleeRoll is the in-flight tumble (die
  // cycling faces before it settles), fleeResult is the settled outcome,
  // fleeFace is whatever the die is showing this tick.
  const [fleeOpen, setFleeOpen]       = useState(false)
  const [fleeRoll, setFleeRoll]       = useState<{ natural: number; success: boolean } | null>(null)
  const [fleeFace, setFleeFace]       = useState(1)
  const [fleeResult, setFleeResult]   = useState<{
    natural: number; success: boolean
    dmg?: number; defeated?: boolean
  } | null>(null)
  // Initial state — tide effects fold into the seed values. Player HP
  // applies hpStartDelta + everyFightHeal at fight start (heal can
  // push above max? no — clamped to max). Enemy HP scales. Player +
  // enemy starting charges include the tide deltas (clamped 0–MAX).
  // Player cannonball cap — MAX_CHARGES plus any "Extra Cannonball Rack" Locker
  // Upgrade slots. Enemy cap = their magazineSize (Ch4 4-slot clips), default 3.
  const playerMaxCharges = MAX_CHARGES + Math.max(0, bonusChargeSlots)
  const enemyMagazine = Math.max(VOLLEY_COST, enemy.magazineSize ?? MAX_CHARGES)
  const [playerHp, setPlayerHp]       = useState(() =>
    Math.max(0, Math.min(healCap, initialPlayerHp + tide.hpStartDelta + Math.round(tide.hpStartPct * playerHpMax) + Math.round((tide.everyFightHeal + tide.everyFightHealPct * playerHpMax) * tide.healMult)))
  )
  // ── Achievement telemetry ──────────────────────────────────────────────
  // Shots the player has locked in THIS fight + whether any crew ability fired
  // this fight (both reset naturally per remount — each fight is its own
  // RaidCombat mount). Drive "Not a Shot Fired": sink a BOSS having neither
  // fired a shot NOR used an ability (a pure riposte / DoT kill).
  const shotsThisFightRef = useRef(0)
  const abilityUsedThisFightRef = useRef(false)
  // Don's Contract facts — per-fight tallies (reset per mount like the above).
  // fires is DERIVED at hand-off (shots - volleys - megas) so a mis-typed shot
  // can't land in two buckets.
  const contractFactsRef = useRef({ shots: 0, crits: 0, volleys: 0, megas: 0, crewAbilities: 0, dodges: 0, nonSpecialHitsTaken: 0 })
  // Don's Gauntlet CONTRACTS: hand the per-fight facts to the parent the instant
  // this hull sinks, once per mount (RaidCombat mounts fresh per gauntlet fight,
  // so the ref is already scoped to this fight). Only the gauntlet passes the
  // callback; campaign raids leave it undefined and this is a no-op. Fired at
  // BOTH win dispatch points, guarded so a double-path can't double-report.
  const contractFactsSentRef = useRef(false)
  const emitContractFacts = () => {
    if (contractFactsSentRef.current || !onContractFacts) return
    contractFactsSentRef.current = true
    const cf = contractFactsRef.current
    onContractFacts({
      won: true,
      turns: turnRef.current,
      shots: cf.shots,
      crits: cf.crits,
      fires: Math.max(0, cf.shots - cf.volleys - cf.megas),
      volleys: cf.volleys,
      megas: cf.megas,
      crewAbilities: cf.crewAbilities,
      dodges: cf.dodges,
      nonSpecialHitsTaken: cf.nonSpecialHitsTaken,
    })
  }
  // "Iron Ruse" needs to know if the ship ever lost HP. Rather than tag every
  // damage site (many, and fragile), watch the HP state for any drop — this
  // catches every source (turn hits, mechanic checks, flares, DoT) in one spot
  // and can't affect combat math. Start-of-fight tide debuffs sit in the
  // initial value, so they're not counted as damage.
  const prevHpRef = useRef(playerHp)
  useEffect(() => {
    if (playerHp < prevHpRef.current) onDamageTaken?.()
    prevHpRef.current = playerHp
  }, [playerHp, onDamageTaken])

  // Preload + decode every deployed crew's art on mount so a summon's fade-in
  // never hitches on the image decoding mid-animation (the main fade-in stutter).
  useEffect(() => {
    for (const c of crewMembers) {
      if (!c.imageUrl) continue
      const img = new Image()
      img.src = c.imageUrl
      img.decode?.().catch(() => {})
    }
  }, [crewMembers])
  const [enemyHp, setEnemyHp]         = useState(() => Math.max(1, Math.round(enemy.hpBase * tide.enemyHpScaleMult)))
  // The enemy's ACTUAL max HP this fight = base × any enemyHpScale (Barnacled
  // Hull curse, half-HP tides). Drives the HP bar denominator + stat sheet so
  // they don't read against the raw base while enemyHp is the scaled value.
  const enemyHpMax = Math.max(1, Math.round(enemy.hpBase * tide.enemyHpScaleMult))
  // Enemy barrier (Warded elite affix / The Warding Gauntlet curse) — an absorb
  // buffer worth a % of the enemy's max HP that soaks the player's DIRECT hits
  // (shots/volleys/abilities, not burn/DoT) before the hull. The Railgun's
  // piercing Mega ignores it. Reforms fresh each fight (per remount).
  const enemyShieldMax = Math.round(enemyHpMax * Math.max(enemy.shieldPct ?? 0, tide.enemyShieldPct, affix?.shieldPctMaxHp ?? 0))
  const [enemyShieldHp, setEnemyShieldHp] = useState(enemyShieldMax)
  const enemyShieldRef = useRef(enemyShieldMax)
  const [playerCharges, setPlayerCharges] = useState(() =>
    Math.max(0, Math.min(playerMaxCharges, tide.chargesStart + initialCharges))
  )
  // Mirror for the kill callback, which reports leftover charges to the host
  // (Powder Hoard carryover) from a setTimeout closure.
  const playerChargesRef = useRef(playerCharges)
  playerChargesRef.current = playerCharges
  const [enemyCharges, setEnemyCharges]   = useState(() =>
    Math.max(0, Math.min(enemyMagazine, (enemy.startCharges ?? 0) + tide.enemyChargesDelta))
  )
  // Live mirror so the (delayed) Foresight prediction reads the CURRENT charge
  // count — a curse's pre-loaded magazine, an accumulated charge, etc.
  const enemyChargesRef = useRef(enemyCharges)
  enemyChargesRef.current = enemyCharges
  const [subPhase, setSubPhase]       = useState<SubPhase>('await_input')
  const [playerAction, setPlayerAction] = useState<EnemyAction | null>(null)
  const [enemyAction, setEnemyAction]   = useState<EnemyAction | null>(null)
  // Last action the player committed to (set when the turn fully resolves).
  // Used to block back-to-back dodges so dodge-camping isn't viable.
  const [lastPlayerAction, setLastPlayerAction] = useState<EnemyAction | null>(null)
  // Oracle (Foresight) — the enemy's revealed upcoming moves. First element is
  // the enemy's NEXT action. Rather than shift a stale snapshot, the reveal is
  // RE-PREDICTED from live state each turn (so it tracks charges as the enemy
  // acts) and expires after this many more enemy actions.
  const [foreseenMoves, setForeseenMoves] = useState<EnemyAction[] | null>(null)
  const foresightMovesLeftRef = useRef(0)
  const [aimResult, setAimResult]     = useState<ShotResult | null>(null)
  const [firstActor, setFirstActor]   = useState<Actor | null>(null)
  // Nameplate one-shot effects — combine speed-roll-win and
  // successful-dodge into a single state so both flavors animate
  // cleanly on the same nameplate. Each kind has its own animation
  // values; the latest wins.
  //   'speed-win' — initiative roll winner, fires during 'revealing'
  //                 phase so the 380ms beat reads as drama not lag.
  //   'dodge'     — defender successfully dodged an attack; mirrors
  //                 the existing enemy-shake hit-feedback vocabulary
  //                 in reverse (cyan instead of red, evasive flick
  //                 instead of forward lunge).
  //
  // We fire via useAnimation() controllers instead of the key-bump
  // remount trick — bumping a key on the button reloads the avatar
  // image inside, which the player perceived as a flash. Controls let
  // us re-run the keyframes without unmounting any child.
  type NameplateFx = { kind: 'speed-win' | 'dodge'; actor: Actor }
  const [nameplateFx, setNameplateFx] = useState<NameplateFx | null>(null)
  const [nameplateFxKey, setNameplateFxKey] = useState(0)
  const playerNameplateAnim = useAnimation()
  const enemyNameplateAnim  = useAnimation()
  useEffect(() => {
    if (!nameplateFx) return
    const t = setTimeout(() => setNameplateFx(null), 360)
    return () => clearTimeout(t)
  }, [nameplateFx, nameplateFxKey])

  // Drive the nameplate animation via controls (not animate prop) so a
  // re-fire doesn't require remounting the button. Each kind/actor pair
  // has its own keyframe set; the rest border color is recomputed off
  // the live enemy state so the snap-back lands on the right color
  // (boss-gold / elite-violet / phase-2-crimson) instead of the
  // gray default.
  useEffect(() => {
    if (!nameplateFx || nameplateFxKey === 0) return
    const enemyRestBorder =
      enemyPhase >= 2 ? '#ef4444'
      : isBoss ? '#fbbf24'
      : isElite ? '#a78bfa'
      : '#2a3548'
    if (nameplateFx.actor === 'player') {
      if (nameplateFx.kind === 'dodge') {
        playerNameplateAnim.start({
          x: [0, 5, 0], y: [0, 2, 0], rotate: [0, 3, 0],
          borderColor: ['#2a3548', '#38bdf8', '#2a3548'],
          boxShadow: ['0 0 0 0 rgba(56,189,248,0)', '0 0 20px rgba(56,189,248,0.6)', '0 0 0 0 rgba(56,189,248,0)'],
          transition: { duration: 0.22, times: [0, 0.45, 1], ease: 'easeOut' },
        })
      } else {
        playerNameplateAnim.start({
          x: [0, -4, 0], y: [0, -2, 0], rotate: [0, -2, 0],
          borderColor: ['#2a3548', '#38bdf8', '#2a3548'],
          boxShadow: ['0 0 0 0 rgba(56,189,248,0)', '0 0 16px rgba(56,189,248,0.45)', '0 0 0 0 rgba(56,189,248,0)'],
          transition: { duration: 0.28, times: [0, 0.45, 1], ease: 'easeOut' },
        })
      }
    } else {
      if (nameplateFx.kind === 'dodge') {
        enemyNameplateAnim.start({
          x: [0, -5, 0], y: [0, -2, 0], rotate: [0, -3, 0],
          borderColor: [enemyRestBorder, '#38bdf8', enemyRestBorder],
          boxShadow: ['0 0 0 0 rgba(56,189,248,0)', '0 0 20px rgba(56,189,248,0.6)', '0 0 0 0 rgba(56,189,248,0)'],
          transition: { duration: 0.22, times: [0, 0.45, 1], ease: 'easeOut' },
        })
      } else {
        enemyNameplateAnim.start({
          x: [0, 4, 0], y: [0, 2, 0], rotate: [0, 2, 0],
          borderColor: [enemyRestBorder, '#ef4444', enemyRestBorder],
          boxShadow: ['0 0 0 0 rgba(239,68,68,0)', '0 0 16px rgba(239,68,68,0.55)', '0 0 0 0 rgba(239,68,68,0)'],
          transition: { duration: 0.28, times: [0, 0.45, 1], ease: 'easeOut' },
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nameplateFxKey])
  const [resolveLog, setResolveLog] = useState<string[]>([])
  const [pHitsplat, setPHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean; volley?: boolean } | null>(null)
  const [eHitsplat, setEHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean; volley?: boolean } | null>(null)
  // Per-shot floating numbers for the Frenzy barrage — each shot gets its own,
  // scattered across the hull, so the whole volley's numbers rack up (the single
  // eHitsplat can only show one at a time).
  const [barrageSplats, setBarrageSplats] = useState<{ key: number; text: string; dx: number; crit?: boolean; color?: string }[]>([])
  // Bespoke chase-skin ability-effect FX over the enemy hull (e.g. Mako's Tempest
  // lightning storm during Blitz). Mounted for the ability's duration, then null.
  const [enemyStrikeFx, setEnemyStrikeFx] = useState<{ key: number; kind: 'tempest' | 'leviathan' | 'requiem' | 'oracle'; color: string; shots?: number; interval?: number } | null>(null)
  // Bespoke chase-skin ability FX over the PLAYER hull (heal/shield/ward abilities).
  const [playerStrikeFx, setPlayerStrikeFx] = useState<{ key: number; kind: 'galaxy' | 'ward'; color: string } | null>(null)
  const [critFlash, setCritFlash]     = useState(false)
  // Brief red wash when the boss flips to phase 2 (challenge-mode Pete).
  // Same shape as critFlash — fixed full-screen radial gradient, ~400ms.
  const [phaseFlash, setPhaseFlash]   = useState(false)
  // Center-screen callout label for the current phase transition ('Phase 3' or a
  // custom badge like 'Reserve Deck'). Set the instant the transition step plays.
  const [phaseCallout, setPhaseCallout] = useState('Phase 2')
  const [critFreeze, setCritFreeze]   = useState(false)   // briefly freezes the aim bar at the lock moment
  // KAN-3. Finn's dial overlay is portalled to <body> and was centred in the
  // VIEWPORT, while the Lock Shot button lives in the 580px combat column in
  // normal flow. On a phone the column fills the screen and the button sits low,
  // so a viewport-centred dial clears it. On a desktop window the column is only
  // as tall as its content while the viewport keeps growing, so the button
  // creeps UP toward the middle and the dial lands on top of it. Reported on
  // browser, not mobile, which is exactly that shape.
  //
  // Measured rather than guessed at with a vh fraction: the answer is "wherever
  // the action panel actually starts", and that moves with the log, the crew row
  // and the window.
  const actionPanelRef = useRef<HTMLDivElement | null>(null)
  const [dialFloorPx, setDialFloorPx] = useState(0)

  // Enemy sink — set true the moment the kill step plays. Switches the
  // enemy ship sprite from its looping bob to a one-shot fall-and-fade
  // (~1.3s) so the sink lands during the kill-log + onEnemyDefeated
  // delay window. Previously the @keyframes existed in RaidGame.tsx
  // but nothing referenced them (legacy from the ripped voyage page).
  const [enemySinking, setEnemySinking] = useState(false)
  const [enemyShakeKey, setEnemyShakeKey] = useState(0)
  const [enemyShakeKind, setEnemyShakeKind] = useState<'hit' | 'volley' | 'crit'>('hit')
  const [playerShakeKey, setPlayerShakeKey] = useState(0)
  const [playerRecoilKey, setPlayerRecoilKey] = useState(0)
  const [cannonShot, setCannonShot]   = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)
  const [enemyImpact, setEnemyImpact] = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)
  // Man-o-War Mega FX (Phase 3): Railgun beam, Barrage's 4 splats, Nuke blast.
  // The beam carries computed geometry (start px + length + angle) measured from
  // the real ship positions so it always runs muzzle -> enemy regardless of layout.
  const [railBeam,  setRailBeam]  = useState<{ key: number; color: string; x1: number; y1: number; len: number; angle: number } | null>(null)
  const stageRef      = useRef<HTMLDivElement>(null)
  const playerShipRef = useRef<HTMLDivElement>(null)
  const enemyShipRef  = useRef<HTMLDivElement>(null)
  const [nukeBlast, setNukeBlast] = useState<{ key: number; color: string } | null>(null)
  // Nuke "silo launch" — a missile that arcs from the player's deck to the
  // enemy before the detonation. Geometry measured from the real ship boxes.
  const [nukeMissile, setNukeMissile] = useState<{ key: number; color: string; x1: number; y1: number; x2: number; y2: number; dur: number } | null>(null)
  // (Barrage's old one-blob MegaSplats renderer removed 2026-07-11 — its four
  // sub-hits now play sequentially through barrageSplats, Mako-style.)
  // Crew-ability cast cue — themed portrait banner + ring that pops over the
  // stage so firing ANY ability has an unmistakable "you did something" tell.
  const [abilityCast, setAbilityCast] = useState<{ key: number; label: string; name: string; color: string; image?: string | null; emoji?: string } | null>(null)
  // FF-style crew summon splash (big fade-in/hold/fade-out of the crew art when
  // an active ability fires). Separate from abilityCast (the small pill, kept for
  // the raid-item drum).
  const [abilitySummon, setAbilitySummon] = useState<{ key: number; label: string; name: string; color: string; image: string | null; chase: boolean; skinId: string | null } | null>(null)
  // Plain (non-animated) tap-blocker that outlives the animated summon: it keeps
  // eating taps from the moment a crew ability fires until its deferred effect
  // has resolved, so the animated summon can UNMOUNT the instant it's faded (no
  // lingering framer tree for a rapid effect like Mako's Frenzy to re-render and
  // pop back in).
  const [summonGuard, setSummonGuard] = useState(false)
  // On-demand "Crew Abilities Restored" banner trigger (War/Thunder Drum). A
  // bumping counter keys the banner so each activation remounts + replays the
  // one-shot animation, separate from the fight-open `abilitiesRefreshed` prop.
  const [restorePulse, setRestorePulse] = useState(0)
  // Enemy status aura — a themed glow over the enemy hull while a tide/raid-item
  // status (burn, freeze) procs on it, so those effects read on the ship itself.
  const [enemyAura, setEnemyAura] = useState<{ key: number; kind: 'burn' | 'freeze' | 'snared' | 'foresee' | 'marked' | 'stunned' | 'stolen'; color?: string } | null>(null)
  // Thermal Shock confluence detonation — an ice+fire shatter burst over the hull.
  const [thermalShockFx, setThermalShockFx] = useState<{ key: number } | null>(null)
  // Persistent status — the enemy keeps a low ember glow while burning and a
  // frost tint while iced, between the activation flare and the tick/skip.
  const [enemyBurning, setEnemyBurning] = useState(false)
  const [enemyFrozen, setEnemyFrozen]   = useState(false)
  // Player-side burn/freeze, set by elite Scorching/Glacial affixes (mirrors of
  // the player's Incendiary/Frozen cannonballs).
  const [playerBurning, setPlayerBurning] = useState(false)
  const [playerFrozen, setPlayerFrozen]   = useState(false)
  // Lethal-save (Quartermaster's Anchor item) burst — fires the moment the
  // anchor catches a killing blow.
  const [anchorSaveFx, setAnchorSaveFx] = useState(0)
  // Enemy firing back: muzzle flash on the enemy hull + impact spray on the
  // player hull (the receiving end now gets the same treatment the enemy does).
  const [enemyMuzzle, setEnemyMuzzle] = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)
  // Carapace deflect — steely plate-flex + spark scatter when a non-volley hit
  // gets shrugged off (Krust). Keyed counter; re-fires on each soak.
  const [enemyDeflect, setEnemyDeflect] = useState(0)
  const [playerImpact, setPlayerImpact] = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)
  // Heal sparkle on the player hull (Mender / Abyssal Tide / repair kit).
  const [playerAura, setPlayerAura] = useState<{ key: number; kind?: 'heal' | 'tide' | 'aim' | 'charge' | 'brace' | 'parry'; color?: string } | null>(null)
  // Dodge whoosh — afterimage + speed lines on whichever ship slips a shot.
  const [dodgeFx, setDodgeFx] = useState<{ key: number; actor: Actor } | null>(null)

  // Aim bar state — RAF driven during 'aiming' subphase
  const firePosRef  = useRef(0)
  const fireDirRef  = useRef(1)
  const zonePosRef  = useRef(0.5)
  const zoneDirRef  = useRef(1)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const zoneRef      = useRef<HTMLDivElement>(null)
  // ── THE ONE PLACE LINEAR BECOMES POLAR ──────────────────────────────────────
  // The aim mechanic is identical on the dial: the RAF, the 0..1 drivers
  // (firePosRef / zonePosRef), the judgment in lockShot and the WYSIWYG freeze
  // are all untouched. The ONLY difference is how those same numbers get
  // painted, so every paint site goes through these two helpers. A position of
  // 0..1 becomes 0..360 degrees; the band becomes an arc rotated to the same
  // spot. That keeps the dial from ever disagreeing with the judgment, which is
  // the whole point of the lock-in protocol.
  const onDial = aimStyle === 'dial'

  useEffect(() => {
    if (!(onDial && subPhase === 'aiming')) return
    const measure = () => {
      const r = actionPanelRef.current?.getBoundingClientRect()
      // Distance from the viewport bottom up to where the panel begins. Clamped
      // to half the viewport so a mis-measure can never squeeze the dial to
      // nothing -- a slightly low dial is recoverable, an invisible one is not.
      setDialFloorPx(r ? Math.min(window.innerHeight / 2, Math.max(0, window.innerHeight - r.top)) : 0)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [onDial, subPhase])
  // On the dial the ZONES are an SVG group inside DialSVG, rotated by its
  // transform ATTRIBUTE (same as the fishing drift mechanic), and the ship
  // marker orbits on its own layer at the same bearing.
  const dialZonesRef = useRef<SVGGElement | null>(null)
  /**
   * ── THE NEEDLE MOVES ON A TRANSFORM, NOT ON `left` ────────────────────────
   *
   * It was `left: calc(pos% - 2px)`, written every frame. `left` is a LAYOUT
   * property: each write invalidates the geometry of the bar and everything in
   * it, and the browser has to lay it out again before it can paint. Sixty
   * times a second, on a phone, inside a deck that also holds the log and four
   * buttons — and the needle is the one thing on screen you are tracking with
   * your eye, so it is where the cost shows up.
   *
   * A transform is composited: no layout, no paint, the layer just moves. The
   * catch is that translateX percentages are relative to the ELEMENT, not its
   * parent, so this needs the bar's width in px — cached, because reading it is
   * itself a layout, and re-measured only when the window changes.
   */
  const needleTrackRef = useRef<HTMLDivElement | null>(null)
  const zoneTrackRef = useRef<HTMLDivElement | null>(null)
  /**
   * ── THE NEEDLE RUNS ON THE COMPOSITOR ─────────────────────────────────────
   *
   * Painting it from the RAF meant its cadence was the main thread's cadence.
   * Every hitch anywhere — a React commit, a layout, a frame of GC — landed in
   * the one moving thing the player is tracking with their eye, which is why it
   * read as running at half rate while a sea full of motion beside it did not.
   * The sea is on the GPU. This was not.
   *
   * The fishing dial solved this already and says so: its needle is spun by a
   * WAAPI animation on the compositor thread precisely "because that is what
   * makes main-thread jank unable to make it skip". Same instrument, same
   * problem, same answer.
   *
   * WYSIWYG SURVIVES IT, which is the part that has to be right. The sweep is a
   * triangle wave with a known start and a known period, so where the needle IS
   * can be computed from the clock rather than read off the element — and it is
   * the SAME clock the compositor is animating against. Judgment stays exact;
   * it just stops being a side effect of having painted.
   */
  const needleAnimRef = useRef<Animation | null>(null)
  const needleT0Ref = useRef(0)
  const needlePeriodRef = useRef(0)
  /** Where the sweep is, from the clock. 0 to 1 and back, forever. */
  const needleAt = useCallback((t: number) => {
    const period = needlePeriodRef.current
    if (!period) return firePosRef.current
    const phase = (((t - needleT0Ref.current) / period) % 1 + 1) % 1
    return phase < 0.5 ? phase * 2 : 2 - phase * 2
  }, [])
  const paintNeedle = useCallback((el: HTMLDivElement | null, pos: number) => {
    if (onDial) { if (el) el.style.transform = `rotate(${pos * 360}deg)`; return }
    // The TRACK moves, not the needle. See the note where it is rendered: it is
    // exactly as wide as the bar, so a percentage translate on it is a
    // percentage of the bar — no width to measure, nothing to cache, and
    // nothing that can be measured at the wrong moment and go stale. That was
    // the bug in the cached-pixels version: a width read before the bar had
    // been laid out left the needle sweeping a stub near the left edge.
    const t = needleTrackRef.current
    if (t) t.style.transform = `translate3d(${pos * 100}%, 0, 0)`
  }, [onDial])
  // Needle COLOUR. The bar tints a block; the dial's needle is an SVG stroke, so
  // it is drawn with currentColor and tinted by setting the CSS color on the same
  // layer. Either way it stays imperative (no re-render per frame).
  const lastNeedleColor = useRef('')
  const paintNeedleColor = useCallback((el: HTMLDivElement | null, c: string) => {
    if (!el) return
    // ONLY WHEN IT CHANGES. The needle crosses a band a handful of times a
    // sweep, but this was setting the colour on every one of sixty frames a
    // second — and a colour write dirties paint whether or not the value is
    // new.
    if (lastNeedleColor.current === c) return
    lastNeedleColor.current = c
    if (onDial) el.style.color = c
    else el.style.background = c
  }, [onDial])
  const paintZone = useCallback((el: HTMLDivElement | null, center: number) => {
    if (onDial) {
      // Bands are built centred on 180 degrees so no arc wraps past 0/360; the
      // whole group just rotates onto the enemy's current bearing.
      const deg = center * 360 - 180
      dialZonesRef.current?.setAttribute('transform', `rotate(${deg}, ${CX}, ${CY})`)
      return
    }
    // Same track, same reason. The band's width is a constant now written in
    // its own style rather than re-applied every frame.
    const t = zoneTrackRef.current
    if (t) t.style.transform = `translate3d(${(center - HIT_W - GRAZE_W) * 100}%, 0, 0)`
  }, [onDial])
  /**
   * THE EFFECTS LAYER'S HANDLE AND ITS WINDOW ONTO THE FIGHT.
   *
   * A function rather than props, and that is the whole design: the needle, the
   * target and the seam all move every frame, and a prop that changes every
   * frame re-renders this entire file to move a spark. The canvas reads what it
   * needs on its own frame and nothing here re-renders at all.
   */
  const aimFxRef = useRef<AimBarFxHandle | null>(null)
  const aimFxRead = useCallback(() => ({
    pos: firePosRef.current,
    zone: zonePosRef.current,
    // The seam, when Rolling Plate is drifting it inside the band — the glow
    // should answer the thing that actually crits, not the middle of the zone.
    critW: liveCritWRef.current,
    band: aimHitWRef.current + aimGrazeWRef.current,
  }), [])
  const barFlashRef  = useRef<HTMLDivElement>(null)
  const rafRef       = useRef(0)
  // False Colors curse — drifting DECOY bands the player must NOT lock onto.
  // Decided fresh each aiming session (a random fraction of fires). The RAF
  // drifts them + paints via decoyElRefs; lockShot reads decoyRunRef to detect a
  // bad lock; decoyFumbleRef tells resolveTurn the shot was a dud.
  const decoyRunRef = useRef<{ pos: number; dir: number; speed: number }[]>([])
  const decoyElRefs = useRef<(HTMLDivElement | null)[]>([])
  const decoyFumbleRef = useRef(false)
  // Rolling Plate (Raid 7) — the gold CRIT seam drifts WITHIN the target zone.
  // Offset is in bar units relative to the zone center, clamped inside the
  // green hit band; the RAF paints the band imperatively (critBandElRef) and
  // lockShot samples the offset at tap (WYSIWYG, same as needle + zone).
  const critSeamOffsetRef = useRef(0)
  const critSeamDirRef = useRef(1)
  const critBandElRef = useRef<HTMLDivElement | null>(null)
  const [activeDecoys, setActiveDecoys] = useState(0)
  // Raid-8 aim-bar attacks — enemy specials that strike YOUR aim, not your
  // hull. One affliction at a time; `passes` = player aim sessions remaining:
  //   decoys   — forces False-Colors decoy bands on every afflicted pass
  //   hardened — the lock is plated: first tap CRACKS it (bar keeps sweeping,
  //              no judgment), the second tap lands the real lock
  //   squall   — the needle gusts (sweep speed surges and dies mid-pass)
  // Consumed at aim-session start; the banner chip clears once spent.
  const aimAfflictionRef = useRef<{ kind: AimAttackId; name: string; passes: number } | null>(null)
  const [aimAffliction, setAimAffliction] = useState<{ kind: AimAttackId; name: string } | null>(null)
  const hardenedArmedRef = useRef(false)
  const [hardenedArmed, setHardenedArmed] = useState(false)
  const squallPhaseRef = useRef(0)
  // Drowned Whispers (confuse curse) — when an order is scrambled, the swap is
  // stashed here so resolveTurn can explain it in the action log, and flashed
  // on screen so the player notices the moment it happens.
  const confusionRef = useRef<{ from: EnemyAction; to: EnemyAction } | null>(null)
  const [confusedFx, setConfusedFx] = useState<{ key: number; from: EnemyAction; to: EnemyAction } | null>(null)

  // Chain-driving timeouts from resolveTurn's playStep cascade. The
  // recursion (`setTimeout(() => playStep(i + 1), gapMs)`) has no other
  // owner, so without this an unmount mid-resolution (fight ends, flee,
  // next enemy mounts) leaves the old chain firing into the void —
  // queued work and Date.now()-keyed state pushes against a dead fight.
  // Only the chain links register here; the cosmetic inner timeouts
  // (splat clears, impact clears) die harmlessly once the chain stops.
  const playStepChainRef = useRef<ReturnType<typeof setTimeout>[]>([])
  useEffect(() => () => { playStepChainRef.current.forEach(clearTimeout) }, [])

  const enemyPatternIdxRef = useRef(0)
  // ── FINN'S OWN CREW ABILITIES ────────────────────────────────────────────
  // He calls on the giants he absorbed the way a player calls on their crew:
  // OFF-TURN, alongside his action rather than instead of it. One ability
  // belongs to one phase (see BossAbility), so each phase plays differently.
  // DIAL LOCK FEEDBACK. DialSVG already ships the fishing reel-in feel: a hub
  // pop + ripple on snapKey, and an arc flash + expanding ring + needle flare on
  // perfectBurstKey. It is the same confirmed-good feedback the player knows
  // from Reel In, so the finale uses it rather than inventing a second language.
  const [dialSnapKey, setDialSnapKey] = useState(0)
  const [dialBurstKey, setDialBurstKey] = useState(0)
  const bossAbilityTurnRef = useRef(0)        // enemy turns taken this phase
  const bossAbilityUsedRef = useRef(false)    // spent it for this phase?
  const bossAbilityOnRef   = useRef(0)        // which turn of the phase he casts
  const bossForesightRef   = useRef(0)        // turns he slips your shots
  const bossWardRef        = useRef(0)        // turns he refuses a killing blow
  const bossWardSavedRef   = useRef(false)    // it just caught a killing blow
  const bossWardBuffRef    = useRef(0)        // and he hits harder for it, rest of phase
  // Did the enemy ADVANCE its pattern slot this turn? pickEnemyAction leaves the
  // index put when it can't perform the slotted move (fire with no charges →
  // substitute reload, retry the SAME slot next turn). Foresight's revealed-move
  // pill must only drop its imminent entry once the slot is actually spent —
  // otherwise a no-charge stall makes the prediction read one cycle early and the
  // pill falls off before the enemy performs the move. Defaults true (a turn with
  // no foresight active is a harmless no-op).
  const enemyAdvancedThisTurnRef = useRef(true)
  // Consecutive reload-at-max FEINTS (see pickEnemyAction). Capped so a full
  // magazine can't become a guaranteed incoming fire OR an endless bluff.
  const enemyFeintStreakRef = useRef(0)
  // Did the enemy DODGE on its previous turn (from the pattern OR a feint)?
  // The feint guard above only knew about feints, so a slotted dodge sitting
  // next to a reload-at-MAX slot could produce two dodges back to back.
  const enemyDodgedLastTurnRef = useRef(false)
  // Boss phase tracking. The ref drives combat reads (pickEnemyAction,
  // damage rolls, mitigation checks) without re-renders; the state
  // mirror drives the persistent visual treatment (crimson nameplate +
  // PHASE 2 badge + red ship halo) so the player can never lose track
  // of which phase they're in. Phase 1 enemies never flip — both stay
  // at 1 for the whole fight.
  const enemyPhaseRef      = useRef<number>(1)
  const [enemyPhase, setEnemyPhase] = useState<number>(1)
  // Normalized boss phase transitions (phases[] supersedes phase2). phaseList[0]
  // = phase 2, [1] = phase 3, ... Total phases = phaseList.length + 1; the config
  // governing the CURRENT phase p (p >= 2) is phaseList[p - 2]. A single-phase or
  // classic phase2 boss just yields [] or [phase2], so all existing raids behave
  // exactly as before.
  const phaseList = useMemo(() => enemy.phases ?? (enemy.phase2 ? [enemy.phase2] : []), [enemy.phases, enemy.phase2])
  // PER-PHASE BACKDROP. A boss whose sea never changes across six phases
  // reads as one long fight; swapping the backdrop is what makes a transition
  // feel like the ground moving. Derived from enemyPhase STATE (not the ref)
  // so the swap actually re-renders, and it falls straight back to the
  // raid-wide zone art for every boss that does not author one.
  const phaseBg = enemyPhase >= 2
    ? (phaseList[enemyPhase - 2]?.bgImage ?? enemy.phaseBgImage)
    : enemy.phaseBgImage
  const liveBg = phaseBg ?? zoneBg
  // Hand the phase backdrop to whoever owns the full-screen layer.
  useEffect(() => { onPhaseBg?.(phaseBg ?? null) }, [phaseBg, onPhaseBg])
  // ── The Last Wall (aegis — Sal Brackwater, phase 3) ──────────────────────────────
  // A phase can open behind a wall that drinks EVERY player blow whole. A Mega
  // shatters it outright (the discovery the fight wants the player to make);
  // anything else chips its endurance (volley counts double) until it collapses
  // under sheer battering — the slow lane, so a no-Mega build isn't locked out.
  // Sim truth lives in the ref (resolveTurn mutates it at compute time); the
  // visuals (chip + hull ring + popup card) follow step playback via aegisVis.
  const aegisRef = useRef<{ name: string; hitsLeft: number } | null>(null)
  const aegisHitsRef = useRef(0)   // blows wasted on the wall — escalates the hint lines
  const [aegisVis, setAegisVis] = useState<{ name: string } | null>(null)
  // ── Mechanic checks (telegraphed boss moves you must answer) ────────────────
  // A phase's `check` arms the instant that phase begins: `pendingCheckRef` holds
  // the config, `checkTurnsLeftRef` counts down each player turn, and
  // `checkFlagsRef` records the transient answers the player produced during the
  // window (persistent answers — brace/shield/snare — are read live at resolve).
  // The state mirror drives the warning banner + countdown. See [[raid-mechanic-checks]].
  const pendingCheckRef  = useRef<BossMechanicCheck | null>(null)
  const checkTurnsLeftRef = useRef(0)
  // True for the phase-transition turn the check armed on, so that turn's own
  // turn-advance doesn't burn a countdown tick (the window starts NEXT turn).
  const checkArmedThisTurnRef = useRef(false)
  // Every ability answer PRODUCED during the check window is flagged here, so it
  // counts even if the defense is consumed before the check resolves (a shield
  // eaten by the boss's own attacks still answered the check). brace/shield/snare
  // ALSO fall back to their live refs (a defense that was already up counts too).
  const checkFlagsRef    = useRef<Record<'heal' | 'burst' | 'brace' | 'shield' | 'snare', boolean>>({ heal: false, burst: false, brace: false, shield: false, snare: false })
  const [pendingCheck, setPendingCheck] = useState<{ name: string; telegraph: string; turnsLeft: number; responses: MechanicResponse[] } | null>(null)
  // Center-screen result callout the instant a check resolves — green "Countered!"
  // or red "<name> hits!" so success/failure is unmistakable.
  const [checkResultFlash, setCheckResultFlash] = useState<{ ok: boolean; label: string; key: number } | null>(null)
  // Center-screen ARM callout the instant a check arms — a loud "answer with a
  // crew ability" so the telegraph (incl. Don's phase-1 opening) is impossible
  // to miss, even for players past the one-time tutorial.
  const [checkArmFlash, setCheckArmFlash] = useState<{ label: string; key: number } | null>(null)
  const checkArmKeyRef = useRef(0)
  const checkArmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (checkArmTimerRef.current) clearTimeout(checkArmTimerRef.current) }, [])

  // Hit-stop: a white impact-flash over the whole stage on a heavy landing (crit
  // / Mega / kill). Punctuates the ~70ms still-hold already baked into the crit
  // shake so the blow reads with real weight.
  const [impactFlash, setImpactFlash] = useState<{ key: number; strong: boolean } | null>(null)
  const impactFlashKeyRef = useRef(0)
  const impactFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fireImpactFlash = useCallback((strong: boolean) => {
    impactFlashKeyRef.current += 1
    setImpactFlash({ key: impactFlashKeyRef.current, strong })
    if (impactFlashTimerRef.current) clearTimeout(impactFlashTimerRef.current)
    impactFlashTimerRef.current = setTimeout(() => setImpactFlash(null), strong ? 220 : 150)
  }, [])
  useEffect(() => () => { if (impactFlashTimerRef.current) clearTimeout(impactFlashTimerRef.current) }, [])
  // Center-screen callout for a boon PROC (Counter-Battery). Same lane as the
  // check flash but themed to the boon's color.
  const [boonFlash, setBoonFlash] = useState<{ label: string; sub?: string; color: string; key: number } | null>(null)
  // Cannonade (boon): the live crit streak, mirrored to state (off the step,
  // in playStep) so the heat rim + badge on the player hull track it.
  const [cannonadeStacks, setCannonadeStacks] = useState(0)
  // Ref mirror for the death ward, so his hull can show it. The ref is the
  // source of truth (the resolver reads it); this only drives the chip.
  const [wardUp, setWardUp] = useState(false)
  const [finaleDefeat, setFinaleDefeat] = useState<string[] | null>(null)
  const finaleDoneRef = useRef<null | (() => void)>(null)
  // Same for his Foresight. Invisible, it reads as the player being unlucky
  // twice in a row rather than as him reading them.
  const [foreseeUp, setForeseeUp] = useState(false)

  // ── First-time mechanic-check tutorial ─────────────────────────────────
  // The first telegraphed boss check blindsided players — especially Don's
  // opening volley, which arms at fight start and resolves before anyone knew
  // a crew ability answers it. A one-shot blocking explainer fires on the first
  // check a player ever faces, then never again (has_seen_check_tutorial).
  // Combat is turn-based, so the armed check just waits behind the modal.
  const [checkTutorialSeen, setCheckTutorialSeen] = useState<boolean | null>(null)
  const [showCheckTutorial, setShowCheckTutorial] = useState(false)
  const checkTutorialFiredRef = useRef(false)
  useEffect(() => {
    if (!isBoss) { setCheckTutorialSeen(true); return }   // only bosses carry checks
    let alive = true
    getCheckTutorialSeen()
      .then(v => { if (alive) setCheckTutorialSeen(v) })
      .catch(() => { if (alive) setCheckTutorialSeen(true) })
    return () => { alive = false }
  }, [isBoss])
  useEffect(() => {
    if (pendingCheck && checkTutorialSeen === false && !checkTutorialFiredRef.current) {
      checkTutorialFiredRef.current = true
      setShowCheckTutorial(true)
    }
  }, [pendingCheck, checkTutorialSeen])
  function dismissCheckTutorial() {
    setShowCheckTutorial(false)
    setCheckTutorialSeen(true)
    void markCheckTutorialSeen().catch(() => {})
  }

  // Arm the check that opens a phase (called from both revival paths).
  function armMechanicCheck(check: BossMechanicCheck | undefined) {
    if (!check) return
    pendingCheckRef.current = check
    checkTurnsLeftRef.current = check.chargeTurns
    checkArmedThisTurnRef.current = true
    checkFlagsRef.current = { heal: false, burst: false, brace: false, shield: false, snare: false }
    // Telegraph into the action log so the fight NARRATES what's coming (vague on
    // purpose — the player figures out the answer by trial and error).
    setResolveLog(prev => [...prev, `⚠ ${check.telegraph}`])
    setPendingCheck({ name: check.name, telegraph: check.telegraph, turnsLeft: check.chargeTurns, responses: check.responses })
    // Loud center callout so the incoming check reads instantly — the top banner
    // is easy to miss mid-fight, especially the phase-1 opening.
    checkArmKeyRef.current += 1
    setCheckArmFlash({ label: check.name, key: checkArmKeyRef.current })
    if (checkArmTimerRef.current) clearTimeout(checkArmTimerRef.current)
    checkArmTimerRef.current = setTimeout(() => setCheckArmFlash(null), 1900)
  }
  // Flag an ability answer if a check is live. brace/shield/snare are flagged
  // HERE (produced during the window) as well as read live at resolve, so a
  // defense that's consumed before the check fires still counts. Only real
  // ability plays call this; plain Dodge / normal crits deliberately don't.
  function noteCheckResponse(r: 'heal' | 'burst' | 'brace' | 'shield' | 'snare') {
    if (pendingCheckRef.current) checkFlagsRef.current[r] = true
  }
  // A CREW HEAL ability (Mender / Tidecaller) douses an active hull burn — the
  // Quartermaster's Fire Sale, or a Scorching-affix burn. Called only from the
  // crew-heal sites, NOT from a repair kit (an item is not a crew heal).
  function dousePlayerBurnFromHeal() {
    if (playerBurnRef.current.turns > 0) {
      playerBurnRef.current = { turns: 0, dmg: 0 }
      setPlayerBurning(false)
      setResolveLog(prev => [...prev, 'The heal washes over the deck and douses the flames.'])
    }
  }
  // Is the armed check already satisfied by the player's answers so far?
  // Persistent answers (brace/shield/snare) are read live off their refs;
  // transient ones (heal/burst) off the flags recorded during the window.
  function isCheckSatisfied(chk: BossMechanicCheck): boolean {
    const f = checkFlagsRef.current
    const has = (r: MechanicResponse) =>
      r === 'brace'  ? (f.brace  || (anchorReductionRef.current ?? 0) > 0)
      : r === 'shield' ? (f.shield || (abyssalShieldRef.current ?? 0) > 0)
      : r === 'snare'  ? (f.snare  || (snareDodgeTurnsRef.current ?? 0) !== 0)
      : r === 'heal'   ? f.heal
      : r === 'burst'  ? f.burst
      : false
    return chk.responses.some(has)
  }
  // The player answered correctly — cancel the phase's threat. `early` fires the
  // MOMENT the right move is made (not at countdown end), so the callout is
  // extra clear they nailed it.
  function counterMechanicCheck(chk: BossMechanicCheck, early: boolean) {
    pendingCheckRef.current = null
    setPendingCheck(null)
    setResolveLog(prev => [...prev, early
      ? `✓ ${chk.name} COUNTERED — you made the right move! ${chk.counteredLine}`
      : `${chk.name} — countered! ${chk.counteredLine}`])
    setCheckResultFlash({ ok: true, label: early ? 'Right move!' : 'Countered!', key: Date.now() })
    setTimeout(() => setCheckResultFlash(cf => (cf && cf.ok ? null : cf)), 1400)
    vibrate([0, 25, 30, 25])
  }
  // Resolve the pending check at countdown end: satisfied → countered; else the consequence.
  function resolveMechanicCheck() {
    const chk = pendingCheckRef.current
    if (!chk) return
    if (isCheckSatisfied(chk)) { counterMechanicCheck(chk, false); return }
    pendingCheckRef.current = null
    setPendingCheck(null)
    // Failed the check — the consequence lands, and the log/flash is LOUD about it.
    setResolveLog(prev => [...prev, `${chk.name} lands — no one answered the ${enemy.name}. ${chk.failLine}`])
    setCheckResultFlash({ ok: false, label: `${chk.name} hits!`, key: Date.now() })
    setTimeout(() => setCheckResultFlash(cf => (cf && !cf.ok ? null : cf)), 1700)
    // Status fail — a lingering Ch4 debuff on the player (+ an optional damage
    // chip, which falls through to the shared wipe/revive path below).
    let statusChipDmg = 0
    if (chk.consequence.kind === 'status') {
      const c = chk.consequence
      applyPlayerStatus(c.status, c.magnitude, c.turns)
      setResolveLog(prev => [...prev, `${STATUS_DEFS[c.status].name} takes hold — your ship ${STATUS_DEFS[c.status].describe(c.magnitude)} for ${c.turns} turns.`])
      if (!c.dmgPct) return
      statusChipDmg = Math.max(1, Math.round(playerHpMax * c.dmgPct))
    }
    if (chk.consequence.kind === 'enemyHealPctMaxHp') {
      const heal = Math.max(1, Math.round(enemyHpMaxRef.current * chk.consequence.value))
      const nHp = Math.min(enemyHpMaxRef.current, enemyHpRef.current + heal)
      enemyHpRef.current = nHp; setEnemyHp(nHp)
      setResolveLog(prev => [...prev, `${enemy.name} collects — heals ${heal}.`])
      return
    }
    if (chk.consequence.kind === 'burnDot') {
      // Ablaze — a DoT instead of an instant hit. Reuses the Scorching-burn
      // system: it ticks at the top of each turn during resolution (visible
      // splat, handles death via the normal check, no instant defeat), and a
      // crew heal clears it (noteCheckResponse).
      const turns = chk.consequence.turns
      const perTurn = Math.max(1, Math.round(playerHpMax * chk.consequence.pctPerTurn))
      playerBurnRef.current = { turns, dmg: perTurn }
      setPlayerBurning(true)
      setResolveLog(prev => [...prev, `Your hull catches — it burns for ${turns} turns unless a crew heal puts the fire out.`])
      return
    }
    // damagePctMaxHp (or a status's damage chip) — a hit that can wipe.
    const dmg = chk.consequence.kind === 'status' ? statusChipDmg : Math.max(1, Math.round(playerHpMax * chk.consequence.value))
    const newHp = playerHpRef.current - dmg
    setPlayerShakeKey(k => k + 1)
    setPlayerImpact({ key: Date.now(), kind: 'volley' })
    setTimeout(() => setPlayerImpact(null), 700)
    vibrate([0, 60, 40, 90])
    if (newHp > 0) {
      playerHpRef.current = newHp; setPlayerHp(newHp)
      setResolveLog(prev => [...prev, `It rakes you for ${dmg}.`])
    } else {
      const vRevive = tryVengeanceRevive()
      if (vRevive) {
        // Laz FIRST — the vengeance ward catches even a one-shot wipe.
        playerHpRef.current = vRevive.hp; setPlayerHp(vRevive.hp)
        setResolveLog(prev => [...prev, `It should have sunk you — the vengeance ward erupts, and you surge back to ${vRevive.hp} HP (+${Math.round(vRevive.buffPct * 100)}% damage).`])
      } else if (anchorSaveAvailable && !anchorUsedRef.current) {
        // Quartermaster's Anchor catches a would-be wipe, once per run.
        anchorUsedRef.current = true; onAnchorSave?.()
        playerHpRef.current = 1; setPlayerHp(1)
        setAnchorSaveFx(k => k + 1)
        onCheatedDeath()
        setResolveLog(prev => [...prev, `It should have sunk you — the anchor holds at 1 HP.`])
      } else {
        playerHpRef.current = 0; setPlayerHp(0)
        setResolveLog(prev => [...prev, `It rakes you for ${dmg} — your hull gives way.`])
        setSubPhase('done'); onPlayerDefeated()
      }
    }
  }
  const turnRef            = useRef(1)
  const [turn, setTurn]    = useState(1)
  // Davy's Heavy Cannon ramp — the per-fight +damage stack. Mirrors the
  // resolver's `rampPerTurn * (turn - 1)` so the hull heat badge shows the
  // exact live bonus. Resets to 0 each new enemy (turn resets to 1).
  const rampPerTurn = useMemo(
    () => getActiveEffects(equippedRaidItems).filter(e => e.type === 'ramp_damage_per_turn').reduce((a, e) => a + e.value, 0),
    [equippedRaidItems],
  )
  const rampBonusPct = Math.round(Math.min(DAMAGE_RAMP_CAP, rampPerTurn * Math.max(0, turn - 1)) * 100)
  const critFreezeRef      = useRef(false)
  useEffect(() => {
    critFreezeRef.current = critFreeze
    // Rolling Plate: re-assert the frozen seam position after the freeze
    // render commits — if the band width changed at lock (Sharpshot spent),
    // React recenters `left` and the frozen picture would lie.
    if (critFreeze && (enemy.critDrift ?? 0) > 0 && critBandElRef.current) {
      const w = lockedCritWRef.current
      const critBandPct = (w / (HIT_W + GRAZE_W)) * 100
      critBandElRef.current.style.left = `${((HIT_W + GRAZE_W + critSeamOffsetRef.current) / ((HIT_W + GRAZE_W) * 2)) * 100 - critBandPct / 2}%`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [critFreeze])
  // Ability per-turn reset effect — every new player turn clears the
  // one-ability-per-turn lock and ticks Snare's finite duration down.
  // Skips the initial mount (turn=1 doesn't need a reset).
  const turnInitRef = useRef(true)
  useEffect(() => {
    if (turnInitRef.current) { turnInitRef.current = false; return }
    setOneAbilityUsedThisTurn(false)
    setSnareDodgeTurns(prev => (prev > 0 ? prev - 1 : prev))
    // Foresight upkeep: RE-PREDICT from the enemy's live state each turn so the
    // reveal never drifts (charges change as the enemy acts, a curse pre-loads
    // the magazine, etc.). Burn one move from the budget only when the enemy
    // actually SPENT a pattern slot — a no-charge reload retry (or a frozen skip)
    // leaves the slotted move still coming, so re-predict but keep the budget.
    if (foresightMovesLeftRef.current > 0) {
      if (enemyAdvancedThisTurnRef.current) foresightMovesLeftRef.current -= 1
      if (foresightMovesLeftRef.current <= 0) setForeseenMoves(null)
      else setForeseenMoves(predictEnemyMoves(foresightMovesLeftRef.current))
    }
    // Status upkeep (Ch4 pipeline): the round just resolved, so every timed
    // status ticks down (expiring at 0, with a log line so the player sees the
    // window close), and Regen pays out its round-end heal.
    {
      const lines: string[] = []
      const pRegen = statusMods(playerStatusesRef.current).regenPerRound
      if (pRegen > 0 && playerHpRef.current > 0) {
        const healed = Math.round(Math.min(healCap - playerHpRef.current, pRegen) * tide.healMult)
        if (healed > 0) {
          playerHpRef.current += healed
          setPlayerHp(playerHpRef.current)
          lines.push(`Mending knits the hull — +${healed} HP.`)
          onStat?.({ dmgHealed: healed })
        }
      }
      const eRegen = statusMods(enemyStatusesRef.current).regenPerRound
      if (eRegen > 0 && enemyHpRef.current > 0) {
        const healed = Math.min(enemyHpMaxRef.current - enemyHpRef.current, eRegen)
        if (healed > 0) {
          enemyHpRef.current += healed
          setEnemyHp(enemyHpRef.current)
          lines.push(`The ${enemy.name} mends itself — ${healed} HP restored.`)
        }
      }
      const pTick = tickStatuses(playerStatusesRef.current)
      playerStatusesRef.current = pTick.next
      setPlayerStatuses(pTick.next)
      for (const s of pTick.expired) lines.push(`${STATUS_DEFS[s.id].name} wears off you.`)
      const eTick = tickStatuses(enemyStatusesRef.current)
      enemyStatusesRef.current = eTick.next
      setEnemyStatuses(eTick.next)
      for (const s of eTick.expired) lines.push(`${STATUS_DEFS[s.id].name} wears off the ${enemy.name}.`)
      // Mira's shield pierce runs on the same clock as her mark — one round per tick.
      if (markPierceTurnsRef.current > 0) markPierceTurnsRef.current -= 1
      if (lines.length > 0) setResolveLog(prev => [...prev, ...lines])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn])

  // Clear stale foreseen moves whenever the enemy or its phase changes: the
  // pattern and pattern-index both reset at those points, so a prior Foresight
  // reading no longer lines up. The next cast re-reads the fresh pattern.
  useEffect(() => { foresightMovesLeftRef.current = 0; setForeseenMoves(null) }, [enemy.id, enemyPhase])

  // Ship shake / recoil controls — match the existing real-time raid keyframes
  const enemyShakeCtrl  = useAnimation()
  const playerShakeCtrl = useAnimation()
  const playerRecoilCtrl = useAnimation()

  // ── WHAT THE HULLS ARE DOING, FOR A RENDERER THAT IS NOT THIS ONE ─────────
  //
  // Over the sea the ship sprites here are hidden and the real hulls are the
  // chart's. An anchor carries WHERE, so every effect follows it; these carry
  // HOW IT IS MOVING, which an anchor cannot.
  //
  // Each animated wrapper reports into its own slot rather than one shared
  // number, because they compose: an outer list, a shake on top of it and a
  // recoil on top of that are three separate things happening at once, and
  // summing them at the end is the only way to get what the eye would have
  // seen. Written to a ref and drained on a frame — a setState per wrapper per
  // frame would re-render the whole fight to move a boat three pixels.
  const shipFxRef = useRef({
    p: { ox: 0, orot: 0, sx: 0, sy: 0, srot: 0, rx: 0, ry: 0 },
    e: { ox: 0, orot: 0, sx: 0, sy: 0, srot: 0 },
  })
  // The two nameplates. Over the sea they leave the stage corners and ride
  // above their own hull, so whose health you are reading is answered by where
  // it is rather than by which side of the screen it went to.
  const enemyPlateRef = useRef<HTMLButtonElement | null>(null)
  const playerPlateRef = useRef<HTMLButtonElement | null>(null)
  const onShipFxRef = useRef(onShipFx)
  useEffect(() => { onShipFxRef.current = onShipFx }, [onShipFx])
  const onFightFxRef = useRef(onFightFx)
  useEffect(() => { onFightFxRef.current = onFightFx }, [onFightFx])
  /** Tell the sea. Through a ref, because these fire from inside timeouts and
   *  playback chains that closed over their props a beat ago. */
  const bang = useCallback((kind: FightFx['kind'], side: FightFx['side']) => {
    onFightFxRef.current?.({ kind, side })
  }, [])

  // Sinking is state rather than an animation, so it has to be mirrored for the
  // frame loop below to see it (the loop closes over its first render).
  const sinkingRef = useRef(false)
  useEffect(() => { sinkingRef.current = enemySinking }, [enemySinking])

  // ── ONE FRAME, BOTH DIRECTIONS ────────────────────────────────────────────
  //
  // Out: the two anchors are moved onto the chart's hulls, so every effect in
  // this file lands on the water. In: what those hulls are doing goes back to
  // the chart, which is drawing them.
  //
  // The stage's own rect is measured on a resize rather than per frame. It is
  // the frame of reference the anchors are converted into, it only moves when
  // the window does, and reading it every frame would force a layout sixty
  // times a second for a number that almost never changes.
  useEffect(() => {
    if (!overSea) return
    const stage = stageRef.current
    if (!stage) return

    let box = stage.getBoundingClientRect()
    // ── EVERY MEASUREMENT IN HERE IS CACHED, AND THAT IS THE POINT ─────────
    //
    // Reading a rect or an offsetWidth forces the browser to lay the page out
    // THERE AND THEN, before it can answer. Do it inside a frame that is also
    // writing styles and you get read-write-read-write — a full layout per
    // read, sixty times a second, on top of the chart's own loop and the aim
    // bar's. That is felt on a phone immediately, and it is felt as the aim
    // bar stuttering, because the aim bar is the thing you are watching.
    //
    // So: measure on the events that can actually change a measurement, and
    // let the frame do nothing but write.
    const ro = new ResizeObserver(() => {
      box = stage.getBoundingClientRect()
      measurePlates()
    })
    ro.observe(stage)
    const onResize = () => { box = stage.getBoundingClientRect(); measurePlates() }
    window.addEventListener('resize', onResize)

    /** Put one anchor on one hull. Left/top and width only: the transform is
     *  framer-motion's, and every animation in this file rides it. */
    const place = (el: HTMLElement | null, a: ShipAnchor | undefined) => {
      if (!el || !a) return
      el.style.left = `${a.x - box.left - a.w / 2}px`
      el.style.top = `${a.y - box.top - a.w / 2}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
      el.style.width = `${a.w}px`
      el.style.maxWidth = 'none'
    }

    /**
     * A NAMEPLATE RIDES ITS OWN SHIP. In the corners you had to work out which
     * bar belonged to whom; above the hull it is not a question. Centred on the
     * ship and lifted clear of the mast, clamped to the window so a plate never
     * walks off the edge with the hull it belongs to.
     */
    // The plates' own sizes, and the deck's height. These change when a status
    // chip appears or a name gets longer — not on a frame — so they are read
    // when something might have changed and cached in between.
    const dim = { ew: 160, eh: 48, pw: 160, ph: 48, deckTop: window.innerHeight }
    const measurePlates = () => {
      const e = enemyPlateRef.current
      const p = playerPlateRef.current
      if (e) { dim.ew = e.offsetWidth || dim.ew; dim.eh = e.offsetHeight || dim.eh }
      if (p) { dim.pw = p.offsetWidth || dim.pw; dim.ph = p.offsetHeight || dim.ph }
      // WHERE THE DECK'S TOP EDGE IS, not how tall it is. Over the sea the deck
      // no longer sits on the bottom of the window — on a phone it stops above
      // the tab bar — so measuring up from the window put the card inside it.
      dim.deckTop = actionPanelRef.current?.getBoundingClientRect().top ?? dim.deckTop
    }
    measurePlates()
    // Twice a second is far more often than a nameplate changes shape and far
    // less often than a frame. Nobody can see a plate settle 200ms late; the
    // whole screen stuttering to measure it every frame was plainly visible.
    const remeasure = setInterval(measurePlates, 500)

    /**
     * THE ENEMY'S CARD HOLDS THE TOP LEFT.
     *
     * It rode above its own hull for a while, on the reasoning that the card
     * should say which ship it belongs to. In a duel that question does not
     * arise — there are two ships and one of them is yours — and a card that
     * moves is a card you have to find again every time you look up. Pinned, it
     * is somewhere you learn once.
     *
     * BELOW THE SITE HEADER, which is the whole reason this is not just `top:
     * 10`. The chart's own surface begins at 44 on a phone and 60 on a desktop
     * and hangs its HUD 18 into that; a fixed card measured from the viewport
     * lands on the nav instead. Same two numbers, so the fight's furniture
     * lines up with the chart's.
     */
    const dockEnemyPlate = () => {
      const el = enemyPlateRef.current
      if (!el) return
      // UNDER THE LEVEL BAR, sharing its left edge. The bar holds the HUD line
      // (44/60 for the header, plus the chart's own 18) and stands about 34
      // tall; this sits a gap below it, so the top-left corner reads as one
      // stack rather than two things fighting for the same spot.
      const line = (window.innerWidth >= 640 ? 60 : 44) + 18
      el.style.left = `${12 - box.left}px`
      el.style.top = `${line + 42 - box.top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }

    /**
     * YOUR OWN CARD DOES NOT FLOAT. It docks on the right of the deck, just
     * above the log — where it has always been, and where you already look for
     * it. The enemy's is the one that has to be found, because which ship it
     * belongs to is the question; yours never moves and never needs asking.
     */
    const dockPlayerPlate = () => {
      const el = playerPlateRef.current
      if (!el) return
      // Right edge of the deck's capped column, so the card lines up with the
      // panel under it rather than with the window.
      const colW = Math.min(580, window.innerWidth - 22)
      const right = window.innerWidth / 2 + colW / 2
      el.style.left = `${right - dim.pw - box.left}px`
      el.style.top = `${dim.deckTop - dim.ph - 10 - box.top}px`
      el.style.right = 'auto'
      el.style.bottom = 'auto'
    }

    let raf = 0
    // The last pose published and the last anchors written, as plain numbers
    // in fixed arrays. Reused every frame; never reallocated.
    const was = [0, 0, 0, 0, 0, 0, 0]
    const prev = [0, 0, 0, 0, 0, 0]
    let sent = false
    const tick = () => {
      raf = requestAnimationFrame(tick)

      const at = anchors?.current
      // NOTHING MOVED, NOTHING WRITTEN. The hulls are still between frames far
      // more often than not — she holds station in a duel — and a style write
      // that changes nothing still dirties the element and costs a layout.
      //
      // COMPARED AS NUMBERS, not as a joined string. This runs every frame for
      // as long as a fight lasts, and building a string to find out that
      // nothing has changed hands the collector sixty short-lived objects a
      // second to say "no".
      let moved = false
      if (at) {
        const p = at.player, e = at.enemy
        moved = (p.x | 0) !== prev[0] || (p.y | 0) !== prev[1] || (p.w | 0) !== prev[2]
          || (e.x | 0) !== prev[3] || (e.y | 0) !== prev[4] || (e.w | 0) !== prev[5]
        if (moved) {
          prev[0] = p.x | 0; prev[1] = p.y | 0; prev[2] = p.w | 0
          prev[3] = e.x | 0; prev[4] = e.y | 0; prev[5] = e.w | 0
        }
      }
      if (at && moved) {
        place(playerShipRef.current, at.player)
        place(enemyShipRef.current, at.enemy)
        dockEnemyPlate()
        dockPlayerPlate()
      }

      const { p, e } = shipFxRef.current
      const fx = {
        player: {
          x: p.ox + p.sx + p.rx,
          y: p.sy + p.ry,
          rot: p.orot + p.srot,
          sink: 0,
        },
        enemy: {
          x: e.ox + e.sx,
          y: e.sy,
          rot: e.orot + e.srot,
          // A hull going down is the one motion here that is not an animation
          // to sum: it is a state the chart holds until the wreck is gone.
          sink: sinkingRef.current ? 1 : 0,
        },
      }
      // Rounded before comparing, or floating-point noise in a settling spring
      // counts as movement forever and the loop never goes quiet. Numbers
      // again, for the same reason as the anchors above — rotation to a tenth
      // of a degree, which is finer than anything the eye reads off a hull.
      const n = [
        fx.player.x | 0, fx.player.y | 0, Math.round(fx.player.rot * 10),
        fx.enemy.x | 0, fx.enemy.y | 0, Math.round(fx.enemy.rot * 10),
        fx.enemy.sink,
      ]
      let changed = !sent
      for (let i = 0; i < n.length; i++) if (n[i] !== was[i]) { changed = true; break }
      if (!changed) return
      for (let i = 0; i < n.length; i++) was[i] = n[i]
      sent = true
      onShipFxRef.current?.(fx)
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      clearInterval(remeasure)
      window.removeEventListener('resize', onResize)
    }
  }, [overSea, anchors])

  // Camera shake — jolts the whole battle SCENE (not the action menu / log) on
  // big impacts. Crit also starts with a brief "hold then erupt" (a hit-stop
  // beat) + a tiny scale punch; volley is a smaller pure shake. Only crit /
  // volley fire it, per the juice rule (nothing screen-wide on normal hits).
  const stageShakeCtrl = useAnimation()
  const cameraShake = useCallback((kind: 'crit' | 'volley' | 'nuke' | 'hit') => {
    if (kind === 'nuke') {
      // Heaviest shake — the silo impact. Bigger throw, longer settle, a real heave.
      fireImpactFlash(true)
      stageShakeCtrl.start({
        x:     [0, 0, -13, 12, -10, 8, -6, 4, -2, 0],
        y:     [0, 0, 6, -5, 4, -3, 2, -1, 0, 0],
        scale: [1, 1.06, 1.055, 0.992, 1.03, 0.996, 1.015, 1, 1, 1],
        transition: { duration: 0.72, times: [0, 0.14, 0.28, 0.4, 0.52, 0.64, 0.76, 0.86, 0.94, 1], ease: 'easeOut' },
      })
      return
    }
    if (kind === 'crit') {
      // A real hit-stop: punch in and HOLD the frozen zoom for ~90ms (the flash
      // lands on it) before the jolt shakes it off.
      fireImpactFlash(false)
      stageShakeCtrl.start({
        x:     [0, 0, -7, 6, -5, 3, -2, 0],
        y:     [0, 0, 3, -2, 2, -1, 0, 0],
        scale: [1, 1.045, 1.045, 0.997, 1.012, 1, 1, 1],
        // First two keyframes hold the punched-in zoom (the hit-stop) before the jolt.
        transition: { duration: 0.44, times: [0, 0.2, 0.42, 0.54, 0.66, 0.8, 0.9, 1], ease: 'easeOut' },
      })
    } else if (kind === 'hit') {
      // NORMAL hits used to get NO camera response at all — only crits and
      // volleys did, which is why the most common attack in the game felt
      // weightless. This is a hit-STOP, not a shake: a fast punch-in that HOLDS
      // for ~70ms (the freeze frame that reads as "thunk"), then releases with a
      // whisper of jolt. Deliberately tiny — it must stay invisible-but-felt on
      // an action you take every turn (see the juice-subtlety rule).
      stageShakeCtrl.start({
        x:     [0, 0, -1.6, 1.2, 0],
        y:     [0, 0, 0.8, -0.5, 0],
        scale: [1, 1.016, 1.016, 1.004, 1],
        transition: { duration: 0.3, times: [0, 0.14, 0.38, 0.7, 1], ease: 'easeOut' },
      })
    } else {
      stageShakeCtrl.start({
        x: [0, -3.5, 3, -2.5, 1.5, 0],
        y: [0, 1.5, -1, 1, 0, 0],
        transition: { duration: 0.26, ease: 'easeOut' },
      })
    }
  }, [stageShakeCtrl, fireImpactFlash])
  useEffect(() => {
    if (enemyShakeKey === 0) return
    if (enemyShakeKind === 'crit') {
      // crit-shake (0.6s, bigger)
      enemyShakeCtrl.start({
        x:      [0, -10, 10, -8, 8, -4, 4, -2, 0],
        rotate: [0, -1.5, 1.5, -1, 1, -0.5, 0.3, 0, 0],
        transition: { duration: 0.6 },
      })
    } else if (enemyShakeKind === 'volley') {
      // volley-shake — a stuttering 3-hit rattle between hit and crit, so the
      // triple cannonball burst lands heavier than a single shot.
      enemyShakeCtrl.start({
        x:      [0, -8, 7, -8, 7, -6, 5, -3, 2, 0],
        rotate: [0, -1.2, 1.1, -1.1, 1, -0.7, 0.5, -0.3, 0, 0],
        transition: { duration: 0.55 },
      })
    } else {
      // hit-shake (0.45s) — leads with a KNOCKBACK. The old curve oscillated
      // symmetrically, which reads as "vibrating in place"; a real blow shoves
      // the hull away from the shooter first (the player is to the left, so the
      // enemy is driven right/+x), then it rocks back and settles. Asymmetry is
      // what makes it read as taking the hit rather than buzzing.
      enemyShakeCtrl.start({
        x:      [0, 9, 7, -3, 2, -1, 0],
        rotate: [0, 1.4, 1, -0.6, 0.3, 0, 0],
        transition: { duration: 0.45, times: [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1], ease: 'easeOut' },
      })
    }
  }, [enemyShakeKey, enemyShakeKind, enemyShakeCtrl])
  useEffect(() => {
    if (playerShakeKey === 0) return
    // player-hit (0.5s) — same knockback read, mirrored: the enemy is to the
    // right, so an incoming blow drives your hull left (-x) before it settles.
    playerShakeCtrl.start({
      x:      [0, -10, -7, 4, -2, 1, 0],
      rotate: [0, -1.5, -1, 0.7, -0.3, 0, 0],
      transition: { duration: 0.5, times: [0, 0.12, 0.3, 0.5, 0.7, 0.86, 1], ease: 'easeOut' },
    })
  }, [playerShakeKey, playerShakeCtrl])
  useEffect(() => {
    if (playerRecoilKey === 0) return
    // player-recoil (0.4s)
    playerRecoilCtrl.start({
      x:      [0, -14, 5, -2, 0],
      rotate: [0, -2, 0.6, 0, 0],
      transition: { duration: 0.4 },
    })
  }, [playerRecoilKey, playerRecoilCtrl])

  const playerHpRef = useRef(initialPlayerHp)
  const enemyHpRef  = useRef(enemy.hpBase)
  // Enemy max HP for THIS fight (post-scale) — set in the encounter reset; used
  // by the Executioner boon's % threshold.
  const enemyHpMaxRef = useRef(enemy.hpBase)
  // Status effects on the CURRENT enemy (Incendiary / Frozen cannonballs).
  // Refs (not state) so the precomputed turn loop reads them synchronously;
  // both reset when the fight moves to a new enemy.
  const enemyBurnRef = useRef<{ turns: number; dmg: number }>({ turns: 0, dmg: 0 })
  // Freeze is a two-stage flag so it NEVER affects the round it procs on,
  // regardless of who acts first: a hit sets *Pending*, which promotes to the
  // active *Frozen* flag at the top of the NEXT round, and that round's turn is
  // the one skipped. Clear-cut: "your hit freezes their next turn."
  // Frozen turns REMAINING on the enemy (Deep Freeze can make this 2). Pending =
  // turns to apply next round (a freeze procced this round skips the NEXT turn).
  const enemyFrozenRef = useRef(0)
  const enemyFreezePendingRef = useRef(0)
  /** Kraken's Grip stacks. PER FIGHT: the coils are around THIS hull, so a fresh
   *  enemy starts clean rather than inheriting a nearly-full counter. */
  const gripStacksRef = useRef(0)
  const playerBurnRef = useRef<{ turns: number; dmg: number }>({ turns: 0, dmg: 0 })
  const playerFrozenRef = useRef(false)
  const playerFreezePendingRef = useRef(false)
  // Carapace teaching line is logged only on the FIRST soak per enemy — the
  // deflect visual + reduced numbers carry every subsequent soak. Reset per enemy.
  const carapaceLoggedRef = useRef(false)
  useEffect(() => { playerHpRef.current = playerHp }, [playerHp])

  // ── Flee — leaving a real raid is a gamble, not a free exit ───────────────
  // Escaping is a visible d20 roll against a DC set by the enemy's speed, so
  // prep is legible: faster ships and higher crew Nav raise your bonus, faster
  // enemies (and bosses) raise the bar. Natural 20 always escapes, natural 1
  // always fails — never a free exit, never hopeless. A failed escape lets the
  // enemy land a parting shot (Bulwark still mitigates). The same prompt
  // handles BOTH the ← button and any attempt to navigate away mid-battle
  // (RaidGame intercepts those and signals via fleeSignal). pendingFleeNavRef
  // holds where to go on a clean getaway so success honors where the player
  // was trying to head.
  // Fleeing is INITIATIVE (hull speed + speed boons), matching the turn-order
  // roll — Navigation no longer helps you run (that's Evasion: dodge + aim).
  // tide speedDelta folds into effective speed same as the turn-order roll.
  // Tune DC base / boss penalty here.
  const fleeSpeed    = Math.max(1, shipSpeed + tide.speedDelta)
  const fleeBonus    = fleeSpeed
  const fleeDC       = 10 + enemy.shipSpeed + (isBoss ? 3 : 0)
  // The one number the player sees: the die face they need. Clamped 2–20
  // because a natural 1 always fails and a natural 20 always escapes.
  const fleeNeed     = Math.max(2, Math.min(20, fleeDC - fleeBonus))
  const pendingFleeNavRef = useRef<(() => void) | null>(null)
  function promptFlee(nav: () => void) {
    pendingFleeNavRef.current = nav
    setFleeRoll(null)
    setFleeResult(null)
    setFleeOpen(true)
  }
  function attemptFlee() {
    const natural = d20()
    const success = natural === 20 || (natural > 1 && natural + fleeBonus >= fleeDC)
    setFleeRoll({ natural, success })
  }
  // Tumble the die for ~1s, then settle on the real face and apply the
  // outcome. The parting shot lands AT the settle so the hit reads as a
  // consequence of the number, not before it.
  useEffect(() => {
    if (!fleeRoll) return
    const iv = setInterval(() => setFleeFace(1 + Math.floor(Math.random() * 20)), 75)
    const settle = setTimeout(() => {
      clearInterval(iv)
      const { natural, success } = fleeRoll
      setFleeFace(natural)
      if (success) {
        // Show the winning face — leaving happens on "Sail Away".
        setFleeResult({ natural, success: true })
      } else {
        const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
        // damageTakenPct convention (see crewEffects bulwark/soft_shell): positive
        // = MORE damage, so the incoming-damage multiplier is 1 + pct/100 — same
        // as the other hit paths. This was inverted here (1 - pct/100); harmless
        // while the value is 0, wrong the moment anything sets it.
        const dmg = Math.max(1, Math.round(base * (1 + (mods.damageTakenPct ?? 0) / 100)))
        let next = Math.max(0, playerHpRef.current - dmg)
        // Laz FIRST — a lethal parting shot is still a killing blow the ward catches.
        let revived = false
        if (next <= 0) {
          const vRevive = tryVengeanceRevive()
          if (vRevive) { next = vRevive.hp; revived = true }
        }
        playerHpRef.current = next
        setPlayerHp(next)
        bang('hit', 'player')
        setPHitsplat({ key: Date.now(), text: `-${dmg}`, color: '#ef4444' })
        setPlayerShakeKey(k => k + 1)
        // Clear the splat after the standard hold (matches the in-combat
        // SPLAT_HOLD_MS in resolveTurn). The flee path used to forget this
        // cleanup, leaving the "-N" number stuck on the ship until the next
        // turn's splat clobbered it.
        setTimeout(() => setPHitsplat(null), 480)
        setResolveLog(prev => [...prev, revived
          ? `${enemy.name} runs you down — but the vengeance ward erupts and drags you back at ${next} HP!`
          : next <= 0
          ? `You break for it, but ${enemy.name} runs you down for ${dmg}!`
          : `You try to flee, but ${enemy.name} lands a parting shot for ${dmg}.`])
        setFleeResult({ natural, success: false, dmg, defeated: next <= 0 })
      }
      setFleeRoll(null)
    }, 1000)
    return () => { clearInterval(iv); clearTimeout(settle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleeRoll])
  function dismissFleeResult() {
    const res = fleeResult
    setFleeResult(null)
    setFleeOpen(false)
    if (res?.success) { (pendingFleeNavRef.current ?? (() => onLeave?.()))(); return }
    if (res?.defeated) { setSubPhase('done'); onPlayerDefeated() }
  }
  // Bridge: RaidGame bumps fleeSignal when it intercepts a navigation away
  // mid-battle. lastFleeSignalRef avoids a spurious prompt on mount/remount.
  const lastFleeSignalRef = useRef(fleeSignal ?? 0)
  useEffect(() => {
    if (fleeSignal == null || fleeSignal === lastFleeSignalRef.current) return
    lastFleeSignalRef.current = fleeSignal
    promptFlee(fleeNav ?? (() => onLeave?.()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fleeSignal])
  useEffect(() => { enemyHpRef.current = enemyHp }, [enemyHp])

  // Reset when enemy changes (parent unmounts/remounts on encounter switch).
  // The log is seeded with an intro line + the prompt so each fight opens
  // with flavor instead of a generic "What will you do?". Lines are
  // staggered (~600ms apart) so the player reads the intro, then the prompt
  // appears below — same rhythm as the in-fight action log.
  // "Repossession" (The Coffers) — the raid item the crooked Quartermaster has
  // reclaimed for the CURRENT fight (its combat effects don't apply). Set at
  // fight start; null for every enemy without the trait. A ref so the per-shot
  // effect reads see it without having to re-create resolveTurn.
  const repossessedItemRef = useRef<string | null>(null)

  useEffect(() => {
    // Apply the next-fight tide HP scale here too — NOT just in the useState
    // initializer — since this reset runs on every encounter switch and the
    // enemyHpScale tide always targets a LATER enemy.
    const scaledHp = Math.max(1, Math.round(enemy.hpBase * enemyHpScaleMultRef.current))
    setEnemyHp(scaledHp); enemyHpRef.current = scaledHp; enemyHpMaxRef.current = scaledHp
    // Enemy barrier reforms fresh each fight, sized off the ACTUAL scaled max HP.
    // Baseline Ch4 shields (enemy.shieldPct) combine with the Warded affix /
    // Warding curse by MAX — the strongest single source sets the pool.
    const eShieldPct = Math.max(enemy.shieldPct ?? 0, tide.enemyShieldPct, affix?.shieldPctMaxHp ?? 0)
    const eShield = Math.round(scaledHp * eShieldPct)
    enemyShieldRef.current = eShield; setEnemyShieldHp(eShield)
    enemyBurnRef.current = { turns: 0, dmg: 0 }; enemyFrozenRef.current = 0; enemyFreezePendingRef.current = 0; snareBlockedRef.current = false; carapaceLoggedRef.current = false
    gripStacksRef.current = 0
    playerBurnRef.current = { turns: 0, dmg: 0 }; playerFrozenRef.current = false; playerFreezePendingRef.current = false
    // "First Cut": enemies in the Tollmaster raid open LOADED (enemy.startCharges
    // ≥ 1) so their fire-first patterns shoot on turn 1. The player mirrors it
    // via Spet's drops — a CHANCE to open each fight with one chambered (Spet's
    // Primer 50%, Tollmaster's Primer 100%). Roll the best chance among equipped
    // items; on a proc, start with 1. Every other raid opens both sides cold.
    const startChargeChance = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'start_charge_chance')
      .reduce((a, e) => Math.max(a, e.value), 0)
    // The Primeval Maw's opener is deliberately NOT a start_charge_chance: that
    // pool takes the best-of, so the Maw would be swallowed whole by a primer
    // (Tollmaster's is 100%) and do nothing. Its own type gets its own roll and
    // ADDS, so running a primer AND the Maw can open you on two.
    const extraStartChance = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'extra_start_charge_chance')
      .reduce((a, e) => Math.max(a, e.value), 0)
    const playerStartCharges = (startChargeChance > 0 && Math.random() < startChargeChance ? 1 : 0)
      + (extraStartChance > 0 && Math.random() < extraStartChance ? 1 : 0)
    // Fold in the start-charge TIDE (e.g. "+2 cannonballs next fight"). The
    // NO_CHARGES sentinel (-99) drives the total below 0 → clamps to 0 ("start
    // with 0"). Without this the reset wiped the tide's opening cannonballs.
    // Powder Hoard carryover (initialCharges) folds in on top of any Primer
    // proc + start-charge tide, capped to the magazine.
    setPlayerCharges(Math.max(0, Math.min(playerMaxCharges, playerStartCharges + chargesStartRef.current + initialCharges)))
    setEnemyCharges(Math.max(0, Math.min(enemyMagazine, (enemy.startCharges ?? 0) + enemyChargesDeltaRef.current)))
    guaranteedDodgeLeftRef.current = guaranteedDodgeBankRef.current
    // Stormward: reform the fight shield into the soak pool. Only when active,
    // so non-boon raids never touch the Abyssal Tide pool here.
    shieldOpenMaxRef.current = fightShieldMaxRef.current + wardMaxRef.current
    if (shieldOpenMaxRef.current > 0) {
      abyssalShieldRef.current = shieldOpenMaxRef.current
      setAbyssalShieldHp(shieldOpenMaxRef.current)
      // Reforms the opening boon layer each fight (overwrites the total), so the
      // crew layer resets to 0 to keep boon + crew == the total.
      // Opening Bulwark — the opening-shield synergies (Stormward / Last Bastion /
      // Deep Fortress / Iron Tempest) reform your soak pool each fight. A gold
      // bulwark ring snaps out as the fight opens so the defense is felt, not just
      // silently present in the bar.
      const bulwarkKey = Date.now()
      setTimeout(() => {
        setPlayerAura({ key: bulwarkKey, kind: 'tide', color: '#f5b94a' })
        setTimeout(() => setPlayerAura(a => (a && a.key === bulwarkKey ? null : a)), 900)
      }, 380)
    }
    setSubPhase('await_input')
    setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
    setLastPlayerAction(null); setForeseenMoves(null)
    // Statuses are per-FIGHT: both sides start every encounter clean.
    playerStatusesRef.current = []; setPlayerStatuses([])
    enemyStatusesRef.current = []; setEnemyStatuses([])
    // Don's Gauntlet — playerStartStatus curses (The Mark): open each fight already afflicted.
    for (const s of tide.playerStartStatusList) applyPlayerStatus(s.status as StatusId, s.magnitude, s.turns)
    markPierceTurnsRef.current = 0   // Mira's shield pierce is per-fight, like the mark
    const intro = isBoss
      ? `${enemy.name} heaves into view!`
      : `A ${enemy.name} draws alongside!`
    // Themed-ability tell: one-time note so the player knows why hits land
    // soft / why the bar fogs over. Each ability gets its own line so an
    // enemy carrying both reads cleanly in the log.
    const introLines = [intro]
    // The Don's Favor (boon): open each fight with ONE random blessing rolled
    // from a small pool — enrage (offense), fortify (defense), or regen (heal),
    // applied for the whole fight via the shared status pipeline.
    if (tide.randomFightBuff > 0) {
      const roll = Math.random()
      if (roll < 0.34) {
        applyPlayerStatus('enrage', tide.randomFightBuff, 99)
        introLines.push(`The Don's Favor — you open ENRAGED (+${Math.round(tide.randomFightBuff * 100)}% damage).`)
      } else if (roll < 0.67) {
        applyPlayerStatus('fortify', tide.randomFightBuff, 99)
        introLines.push(`The Don's Favor — you open FORTIFIED (−${Math.round(tide.randomFightBuff * 100)}% damage taken).`)
      } else {
        const perRound = Math.max(3, Math.round(playerHpMax * (0.03 + tide.randomFightBuff * 0.06)))
        applyPlayerStatus('regen', perRound, 99)
        introLines.push(`The Don's Favor — you open MENDING (+${perRound} HP each round).`)
      }
    }
    // The Undertow (curse): open each fight under ONE random debuff (weaken /
    // feeble / slowed), the dark mirror of The Don's Favor.
    if (tide.randomFightDebuff > 0) {
      const roll = Math.random()
      if (roll < 0.34) {
        applyPlayerStatus('weaken', tide.randomFightDebuff, 99)
        introLines.push(`The Undertow — you open WEAKENED (−${Math.round(tide.randomFightDebuff * 100)}% damage dealt).`)
      } else if (roll < 0.67) {
        applyPlayerStatus('feeble', tide.randomFightDebuff, 99)
        introLines.push(`The Undertow — you open FEEBLE (+${Math.round(tide.randomFightDebuff * 100)}% damage taken).`)
      } else {
        applyPlayerStatus('slowed', Math.max(1, Math.round(tide.randomFightDebuff * 10)), 99)
        introLines.push(`The Undertow — you open SLOWED.`)
      }
    }
    // Host-supplied opener (Gauntlet: 'Crew abilities refreshed.' on a refresh round).
    if (openingNote) introLines.push(openingNote)
    // Momentum boons are passive damage mults with no per-shot trigger, so
    // capture their LIVE contribution once here at fight start — accurate,
    // no per-shot log spam.
    // Sum each axis (Rising Tide/Abyssal Bounty + the Deep Wake confluence) so
    // ONE line reflects the true combined bonus — matching the single applied
    // multiplier per axis rather than printing a duplicate line per effect.
    {
      let kPerKill = 0, kCap = 0, dPerDepth = 0, dCap = 0
      for (const e of tideEffects) {
        if (e.kind === 'killStackDamage') { kPerKill += e.perKill; kCap += e.maxBonus }
        else if (e.kind === 'depthScaleDamage') { dPerDepth += e.perDepth; dCap += e.maxBonus }
      }
      const kBonus = Math.min(kCap, kPerKill * Math.max(0, runKills))
      if (kBonus > 0) introLines.push(`Rising Tide: +${Math.round(kBonus * 100)}% damage — ${runKills} hull${runKills === 1 ? '' : 's'} in your wake.`)
      const dBonus = Math.min(dCap, dPerDepth * Math.max(0, runDepth))
      if (dBonus > 0) introLines.push(`Abyssal Bounty: +${Math.round(dBonus * 100)}% damage at depth ${runDepth}.`)
    }
    if ((enemy.damageReduction ?? 0) > 0) {
      introLines.push(`Its ${(enemy.abilityName ?? 'armor').toLowerCase()} soaks fire and graze. Volleys break through.`)
    }
    if ((enemy.aimFogDensity ?? 0) > 0) {
      introLines.push(`A ${(enemy.aimFogName ?? 'mist').toLowerCase()} drifts over your aim bar. Lock by rhythm, not by sight.`)
    }
    if ((enemy.critDrift ?? 0) > 0) {
      introLines.push('Its plating rolls. The gold seam wanders the whole target, even the gray fringe: chase it there and a near miss only grazes.')
    }
    // "Repossession": the crooked Quartermaster reclaims one raid item he sold
    // you for THIS fight. Prefer an item with an offensive (per-shot/proc)
    // effect so the theft always bites; fall back to any equipped item.
    if (enemy.repossess && equippedRaidItems.length > 0) {
      const OFFENSIVE = new Set(['boss_damage_mult', 'crit_damage_mult', 'noncrit_damage_mult', 'nonboss_damage_mult', 'ramp_damage_per_turn', 'burn_chance', 'freeze_chance', 'parry_chance', 'parry_reflect_pct'])
      const withEdge = equippedRaidItems.filter(id => getActiveEffects([id]).some(e => OFFENSIVE.has(e.type)))
      const pool = withEdge.length > 0 ? withEdge : equippedRaidItems
      const taken = pool[Math.floor(Math.random() * pool.length)]
      repossessedItemRef.current = taken
      const takenName = getRaidItem(taken)?.name ?? 'gear'
      introLines.push(`${enemy.repossessName ?? 'Repossession'}: ${enemy.name} reclaims your ${takenName} for this fight.`)
    } else {
      repossessedItemRef.current = null
    }
    setResolveLog(introLines)
    const promptTimer = setTimeout(() => {
      // Only append if the player hasn't acted yet — once a turn resolves,
      // resolveLog gets replaced wholesale and we don't want to clobber it.
      setResolveLog(prev => (prev.length === introLines.length && prev[0] === intro ? [...introLines, 'What will you do?'] : prev))
    }, 600)
    setPHitsplat(null); setEHitsplat(null); setBarrageSplats([]); setAbilityCast(null); setAbilitySummon(null); setEnemyAura(null); setThermalShockFx(null); setEnemyStrikeFx(null); setPlayerStrikeFx(null)
    setEnemyMuzzle(null); setPlayerImpact(null); setPlayerAura(null); setDodgeFx(null)
    setEnemyBurning(false); setEnemyFrozen(false); setEnemyDeflect(0)
    setPlayerBurning(false); setPlayerFrozen(false)
    enemyPatternIdxRef.current = 0; bossAbilityTurnRef.current = 0; bossAbilityUsedRef.current = false; bossAbilityOnRef.current = 0
    enemyFeintStreakRef.current = 0
    enemyDodgedLastTurnRef.current = false
    volleyCountRef.current = 0
    // Aim afflictions are per-fight — a fresh enemy clears any live one.
    aimAfflictionRef.current = null
    setAimAffliction(null)
    hardenedArmedRef.current = false
    setHardenedArmed(false)
    // Vengeance is CURRENT-FIGHT only — a fresh enemy clears the ward and any
    // active rage buff (arm it again if you need it this fight).
    vengeanceWardRef.current = false
    setWardTurns(0)
    vengeanceHealPctRef.current = 0
    vengeanceBuffPctRef.current = 0
    vengeanceCleanseRef.current = false
    vengeanceDmgBuffRef.current = 0
    // Abyssal twists are per-fight too — a fresh hull clears the avenging bite,
    // the crit-bought ramp, the phase ambush and the first-blow brace.
    avengeArmedRef.current = false
    critRampBonusRef.current = 0
    shotsAtPhaseStartRef.current = 0
    enemyAttacksThisFightRef.current = 0
    enemyPhaseRef.current = 1
    setEnemyPhase(1)
    aegisRef.current = null; aegisHitsRef.current = 0
    setAegisVis(null)
    setEnemySinking(false)  // fresh enemy — clear any leftover sink from a prior fight
    turnRef.current = 1; setTurn(1)
    // Fresh enemy clears any stale mechanic check, then arms this boss's
    // OPENING check (phase 1) if it carries one — the Don demands a crew
    // answer from the first turn. Delayed past the intro so the telegraph
    // reads as the fight opening.
    pendingCheckRef.current = null
    checkTurnsLeftRef.current = 0
    setPendingCheck(null)
    let openingTimer: ReturnType<typeof setTimeout> | undefined
    const oc = enemy.openingCheck
    if (isBoss && oc) openingTimer = setTimeout(() => armMechanicCheck(oc), 850)
    return () => { clearTimeout(promptTimer); if (openingTimer) clearTimeout(openingTimer) }
  }, [enemy.id, enemy.name, enemy.hpBase, isBoss])

  // ─── Aim bar RAF (only during 'aiming') ────────────────────────────────────

  useEffect(() => {
    if (subPhase !== 'aiming') return
    let last = performance.now()

    // Zone drift: enemy ship speed sets the pace, player Navigation slows it
    // back down. Gauntlet curses (tide), a per-enemy multiplier, and the Yawing
    // elite affix all lurch it — these are how an evasive target denies clean
    // crits (a faster TARGET rather than a faster needle, which is the fair way
    // to pressure aim; see the Racing Tide retune).
    // CAP THE STACK. These three multiply, and nothing bounded the product:
    // a 2.6 tide on a 3.0 hull wearing Yawing came out at 13x the base pace,
    // against 3.0 for the hardest unmodified enemy in the game. That is not
    // hard, it is unreadable. 4.0 leaves every intended combination alone
    // (the toughest hull alone is 3.0, and a normal hull plus Yawing is ~3.2)
    // and only bites where three sources pile onto the same fight.
    const ZONE_STACK_CAP = 4
    const zoneStack = Math.min(ZONE_STACK_CAP, tide.zoneSpeedMult * (enemy.zoneSpeedMult ?? 1) * (affix?.zoneSpeedMult ?? 1))
    const ZONE_SPEED = enemy.shipSpeed * 0.0008 * (1 / (1 + totalNavigation * 0.015)) * zoneStack
    // Needle sweep, with the curse multiplier (Racing Tide etc.) AND any
    // per-enemy needle multiplier (rarely used — prefer zoneSpeedMult).
    // NEEDLE SPEED. On the dial the same normalised speed reads far faster than
    // on the bar, because 0..1 is a whole revolution and the eye tracks ANGLE:
    // at the bare global constant it sweeps ~129 deg/sec. Turn up with a bad
    // REEL and you get exactly that, which is punishing on purpose; the reel is
    // the stat that slows the needle when fishing, so it is the stat that buys
    // you room here. Deliberately NO baseline slowdown: a poor reel should be
    // fast. Every other fight is untouched (dialSpeedScale is 1 off the dial).
    const dialSpeedScale = aimStyle === 'dial'
      ? 1 - (1 - (dialAim?.needleSpeedMult ?? 1)) * DIAL_REEL_RELIEF
      : 1
    const NEEDLE_SPEED = INDICATOR_SPEED * tide.aimSpeedMult * (enemy.aimSpeedMult ?? 1) * dialSpeedScale

    // Raid-8 aim affliction — read the live one for THIS pass, then burn a
    // pass. The banner chip stays up through the final afflicted pass and
    // clears the moment a clean session starts.
    let affliction = aimAfflictionRef.current
    if (affliction && affliction.passes <= 0) {
      aimAfflictionRef.current = null
      affliction = null
      setAimAffliction(null)
    }
    if (affliction) affliction.passes -= 1
    hardenedArmedRef.current = affliction?.kind === 'hardened'
    setHardenedArmed(hardenedArmedRef.current)
    squallPhaseRef.current = Math.random() * Math.PI * 2
    const squallActive = affliction?.kind === 'squall'

    // Rolling Plate: seam drift for THIS pass (0 = still, like every other
    // raid). The seam opens at a RANDOM spot in its range each pass (a
    // centered start read as "not moving"), and the speed is sized against
    // the needle: at drift 1.0 the seam sweeps its full range in ~1.3s —
    // clearly alive, still trackable. (0.0009 was ~6s: imperceptible.)
    const seamDrift = enemy.critDrift ?? 0
    const seamMaxOff0 = Math.max(0, HIT_W + GRAZE_W - liveCritWRef.current)
    critSeamOffsetRef.current = seamDrift > 0 ? (Math.random() * 2 - 1) * seamMaxOff0 * 0.8 : 0
    critSeamDirRef.current = Math.random() < 0.5 ? 1 : -1
    const SEAM_SPEED = 0.0022 * seamDrift

    // False Colors: on a RANDOM fraction of fires, spawn N drifting decoy bands.
    // Decided once per aiming session so the player can't predict it. The
    // raid-8 'decoys' affliction forces them on EVERY afflicted pass instead.
    const dLo = HIT_W + GRAZE_W, dHi = 1 - HIT_W - GRAZE_W
    const forcedDecoys = affliction?.kind === 'decoys' ? 2 : 0
    // Steady Sights (boon) at full clarity clears decoys entirely (native + tide).
    const nDecoys = tide.aimClarity >= 1
      ? 0
      : forcedDecoys > 0
      ? forcedDecoys
      : tide.aimDecoys > 0 && Math.random() < DECOY_FIRE_CHANCE ? tide.aimDecoys : 0
    // False Court (raid-8 'decoys' affliction) was reading as too strong: its
    // fake bands drifted as fast as tide decoys on top of The Render's 2.5x
    // zone speed, leaving no time to read the true lane. Drift the FORCED
    // (False Court) bands far slower so the fake gold is trackable — the
    // milder, occasional tide-decoy version keeps its original pace.
    const decoySpeedMult = forcedDecoys > 0 ? 0.38 : 1
    decoyRunRef.current = Array.from({ length: nDecoys }, (_, k) => ({
      pos: dLo + (dHi - dLo) * (nDecoys === 1 ? 0.32 + Math.random() * 0.36 : k / (nDecoys - 1)),
      dir: k % 2 === 0 ? 1 : -1,
      speed: (1.25 + (k % 2) * 0.55) * decoySpeedMult,
    }))
    decoyFumbleRef.current = false
    setActiveDecoys(nDecoys)

    // ── HAND IT TO THE COMPOSITOR, unless something is modulating the speed.
    //
    // A squall's gust rides a sine through the sweep, which a fixed-duration
    // animation cannot express — changing playbackRate every frame would put
    // the work straight back on the main thread and lose the whole point. So a
    // gusting bar keeps the RAF paint it has always had. It is one affliction
    // on one raid, and it is MEANT to be hard to read.
    const compositor = !onDial && !squallActive
    if (compositor) {
      const el = needleTrackRef.current
      // Frames to cross, and back again: the same NEEDLE_SPEED the maths below
      // uses, so the picture and the judgment cannot describe different sweeps.
      needlePeriodRef.current = (2 / NEEDLE_SPEED) * (1000 / 60)
      if (el && typeof el.animate === 'function') {
        try {
          const anim = el.animate(
            [
              { transform: 'translate3d(0%, 0, 0)' },
              { transform: 'translate3d(100%, 0, 0)' },
              { transform: 'translate3d(0%, 0, 0)' },
            ],
            { duration: needlePeriodRef.current, iterations: Infinity, easing: 'linear' },
          )
          // PINNED SYNCHRONOUSLY, or it starts "when ready" — up to a frame
          // later — and the clock this file reads and the needle the player
          // sees disagree by however long that took. That gap is a miss.
          const t0 = document.timeline?.currentTime
          needleT0Ref.current = typeof t0 === 'number' ? t0 : performance.now()
          if (typeof t0 === 'number') anim.startTime = t0
          needleAnimRef.current = anim
        } catch {
          needleAnimRef.current = null
          needlePeriodRef.current = 0
        }
      } else {
        needlePeriodRef.current = 0
      }
    }

    function tick(now: number) {
      const dt = Math.min(now - last, 50)
      last = now
      // Freeze the needle + target zone the moment the player locks a shot so
      // they can clearly see where the indicator landed. Reads from a ref so
      // the freeze takes effect on the next frame (the state closure here is
      // stale once subPhase stays 'aiming').
      if (critFreezeRef.current) { rafRef.current = requestAnimationFrame(tick); return }
      // ── BACK OFF THE FREEZE ─────────────────────────────────────────────
      //
      // The lock pauses the compositor's sweep. Usually the phase moves on and
      // the effect's cleanup cancels it, but a re-aim can lift the freeze
      // without ever leaving 'aiming' — and a paused animation nobody restarts
      // is a needle that stops for good. Resuming re-pins the epoch off the
      // animation's own clock, so `needleAt` keeps describing the needle that
      // is actually on the glass rather than the one that would have been there
      // had it never stopped.
      {
        const anim = needleAnimRef.current
        if (anim && anim.playState === 'paused') {
          const at = typeof anim.currentTime === 'number' ? anim.currentTime : 0
          const tl = document.timeline?.currentTime
          needleT0Ref.current = (typeof tl === 'number' ? tl : now) - at
          anim.play()
        }
      }
      const frames = dt / 16.67

      // Squall (raid-8 affliction, Kingmaker's Gale): the needle's sweep speed
      // surges and dies on a slow sine, so timing by rhythm alone fails — you
      // have to watch the needle itself. Judgment is untouched (position
      // sampled at tap). Eased from ±0.55 @ 340ms to a gentler, slower swing so
      // the gusts read as trackable rather than a whip (was landing too hard on
      // top of The Gorge's 2.6x zone speed).
      const gust = squallActive ? 1 + 0.38 * Math.sin(now / 440 + squallPhaseRef.current) : 1
      firePosRef.current += NEEDLE_SPEED * gust * frames * fireDirRef.current
      // BOUNCE, on the dial too. The needle sweeps a full revolution and then
      // REVERSES, mirroring the aim bar hitting its end, and 0/1 are the same
      // point on a circle so both ends land on one line at 12 o'clock. That
      // line is drawn on the face (see turnMark) so the reversal is a read the
      // player can make, not a surprise.
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current = 1 }

      zonePosRef.current += ZONE_SPEED * frames * zoneDirRef.current
      // THE BAND BOUNCES TOO, off the same marked line the needle turns on,
      // exactly as the aim bar's target bounces off its two ends. Clamped by
      // the band's OWN half-width so its outer edge just kisses the line
      // instead of half the band disappearing past it.
      //
      // One clamp for both instruments: off the dial aimHitW/aimGrazeW ARE
      // HIT_W/GRAZE_W (scale 1, no gear bonus), so the bar is unchanged.
      {
        const edge = aimHitWRef.current + aimGrazeWRef.current
        if (zonePosRef.current >= 1 - edge) { zonePosRef.current = 1 - edge; zoneDirRef.current = -1 }
        if (zonePosRef.current <= edge)     { zonePosRef.current = edge;     zoneDirRef.current = 1 }
      }

      // Rolling Plate: walk the seam inside the hit band, bouncing at the
      // edges, and paint the gold band at its live position.
      if (seamDrift > 0) {
        // The seam roams the WHOLE zone, graze fringe included — chasing it
        // out there is a wager: hit the seam and it still crits, but a near
        // miss lands in the gray, not the green.
        const maxOff = Math.max(0, HIT_W + GRAZE_W - liveCritWRef.current)
        let o = critSeamOffsetRef.current + SEAM_SPEED * frames * critSeamDirRef.current
        if (o >= maxOff) { o = maxOff; critSeamDirRef.current = -1 }
        if (o <= -maxOff) { o = -maxOff; critSeamDirRef.current = 1 }
        critSeamOffsetRef.current = o
        const bandEl = critBandElRef.current
        if (bandEl) {
          const critBandPct = (liveCritWRef.current / (HIT_W + GRAZE_W)) * 100
          bandEl.style.left = `${((HIT_W + GRAZE_W + o) / ((HIT_W + GRAZE_W) * 2)) * 100 - critBandPct / 2}%`
        }
      }

      // Drift each decoy band; flag when the needle is sitting on a fake.
      let onDecoy = false
      for (let k = 0; k < decoyRunRef.current.length; k++) {
        const d = decoyRunRef.current[k]
        d.pos += ZONE_SPEED * d.speed * frames * d.dir
        if (d.pos >= dHi) { d.pos = dHi; d.dir = -1 }
        if (d.pos <= dLo) { d.pos = dLo; d.dir = 1 }
        const el = decoyElRefs.current[k]
        if (el) el.style.left = `${(d.pos - DECOY_HALF) * 100}%`
        if (Math.abs(firePosRef.current - d.pos) <= DECOY_HALF) onDecoy = true
      }

      if (indicatorRef.current) {
        paintNeedle(indicatorRef.current, firePosRef.current)
        let zone = getShotResult(firePosRef.current, zonePosRef.current, liveCritWRef.current, aimHitWRef.current, aimGrazeWRef.current)
        // Rolling Plate: the gold tell tracks the SEAM, not the zone center.
        if (seamDrift > 0) {
          const seamC = zonePosRef.current + critSeamOffsetRef.current
          if (Math.abs(firePosRef.current - seamC) <= liveCritWRef.current) zone = 'critical'
          else if (zone === 'critical') zone = 'hit'
        }
        const bg = onDecoy            ? '#ef4444'   // on a decoy — locking duds the shot
                 : zone === 'critical' ? '#fbbf24'
                 : zone === 'hit'      ? '#4ade80'
                 : zone === 'graze'    ? '#94a3b8'
                 : 'rgba(255,255,255,0.4)'
        paintNeedleColor(indicatorRef.current, bg)
      }
      if (onDial || zoneRef.current) {
        paintZone(zoneRef.current, zonePosRef.current)
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [subPhase, enemy.shipSpeed, enemy.aimSpeedMult, enemy.zoneSpeedMult, totalNavigation, tide.aimSpeedMult, tide.zoneSpeedMult, affix?.zoneSpeedMult])

  // LAZ'S WARD, his side of it. While it holds he cannot be put below 1 HP, so
  // a killing blow becomes a survived one. Mirrors the player's Vengeance ward.
  // LAZ'S WARD, his side of it, and it works the way the player's does: it is
  // a WINDOW, not a guarantee. He arms it and it lapses; if no killing blow
  // lands inside it, it was wasted, exactly as a mistimed Vengeance is.
  //
  // But when it DOES catch one he comes BACK, because Laz is about returning,
  // not about clinging on at 1 HP. He surges to a fifth of the bar and hits
  // harder for the rest of the phase, and it is spent on the save.
  const WARD_SURGE_PCT = 0.20
  const WARD_BUFF = 0.25
  const wardFloor = useCallback((hp: number): number => {
    if (hp > 0) return Math.max(0, hp)
    if (bossWardRef.current > 0) {
      bossWardRef.current = 0
      bossWardSavedRef.current = true
      setWardUp(false)
      bossWardBuffRef.current = WARD_BUFF
      return Math.max(1, Math.round(enemyHpMaxRef.current * WARD_SURGE_PCT))
    }
    return 0
  }, [])

  // ─── Enemy AI: pick next action from pattern ───────────────────────────────

  const pickEnemyAction = useCallback((): EnemyAction => {
    // Phase 2 swaps the boss's whole behavior cycle for the alternate
    // pattern in phase2.pattern (more aggressive for Pete). Falls back to
    // the base pattern for phase-1 enemies and any boss without phase2.
    const activePhase = enemyPhaseRef.current >= 2 ? phaseList[enemyPhaseRef.current - 2] : undefined
    const pattern = activePhase ? activePhase.pattern : enemy.pattern
    let action = pattern[enemyPatternIdxRef.current % pattern.length]
    // Sanity guards. Two failure modes:
    //
    //  1) Impossible action — fire with no charges / volley below MAX:
    //     substitute reload, DON'T advance the pattern, so the original
    //     action is re-attempted next turn (now with a charge in hand).
    //
    //  2) Reload at MAX charges — would no-op and burn the turn. Affects
    //     no-volley enemies (Krust + his crew) whose patterns carry more
    //     reloads than fires per cycle: charges accumulate cycle over
    //     cycle until a reload overshoots MAX. Normally substitute fire (they
    //     have ammo by definition) and DO advance — the wasted reload becomes
    //     the extra shot the cadence was already building toward.
    //
    //     But a guaranteed fire at full charges is a free read: the player
    //     just pre-dodges every time the counter shows MAX. So sometimes FEINT
    //     instead — hold the shot and brace (dodge) — baiting that wasted
    //     dodge. Capped to one feint in a row so a full magazine can't stall
    //     forever; the next max-reload then fires for sure.
    if (action === 'special' && !enemy.special) {
      // Pattern slots a special the enemy doesn't carry (authoring slip /
      // scaled variant without one) — degrade to a reload and advance.
      action = 'reload'
      enemyPatternIdxRef.current++
    } else if (action === 'ultimate' && !enemy.ultimate) {
      // Ultimate slot without an authored ultimate — same degrade as special.
      action = 'reload'
      enemyPatternIdxRef.current++
    } else if (action === 'ultimate' && enemyCharges < enemyMagazine) {
      // Ultimate needs a FULL magazine. Keep loading and DON'T advance — the
      // slot re-attempts every turn until the clip fills, so the player
      // watches it build (the glowing pips are the tell) and can answer.
      action = 'reload'
    } else if ((action === 'fire'   && enemyCharges < 1) ||
        (action === 'volley' && enemyCharges < VOLLEY_COST)) {
      action = 'reload'
    } else if (action === 'reload' && enemyCharges >= enemyMagazine) {
      enemyPatternIdxRef.current++
      // A feint may NEVER produce back-to-back dodges. The old guard only
      // blocked feint-after-feint, so an enemy whose reloads outnumber its
      // fires (Krust and his crew — they sit at MAX by design) could dodge
      // twice running: once from a slotted dodge, once from the feint that
      // landed beside it. Refuse the feint if we dodged last turn, and refuse
      // it if the slot we just advanced INTO is itself a dodge.
      const nextSlot = pattern[enemyPatternIdxRef.current % pattern.length]
      const feintOk = enemyFeintStreakRef.current < 1
        && !enemyDodgedLastTurnRef.current
        && nextSlot !== 'dodge'
      if (feintOk && Math.random() < FEINT_CHANCE) {
        action = 'dodge'
        enemyFeintStreakRef.current++
      } else {
        action = 'fire'
        enemyFeintStreakRef.current = 0
      }
    } else {
      enemyPatternIdxRef.current++
    }
    // Snare ability — while active, each enemy dodge attempt is JAMMED at the
    // snare's jam chance (not a hard lock; they slip through sometimes). A jam
    // substitutes their highest-value alternative (fire if charged, else reload)
    // so they still act but lose that defensive turn.
    if (action === 'dodge' && snareDodgeTurnsRef.current > 0 && Math.random() < snareJamChanceRef.current) {
      action = enemyCharges >= 1 ? 'fire' : 'reload'
      snareBlockedRef.current = true
    }
    // BACKSTOP — the same hard rule the player lives under (see `canDodge`):
    // nobody dodges twice in a row. The feint guard above already closes the
    // only path that could produce it today, and no authored pattern stacks two
    // dodges (base, boss-phase, and challenge-phase cycles all checked). This
    // makes the invariant structural rather than a convention, so a future
    // pattern or a future substitution can't quietly bring it back.
    if (action === 'dodge' && enemyDodgedLastTurnRef.current) {
      action = enemyCharges >= 1 ? 'fire' : 'reload'
    }
    // Remember the RESOLVED action (a jammed dodge never happened), so next
    // turn's feint check knows whether it would be doubling up.
    enemyDodgedLastTurnRef.current = action === 'dodge'
    return action
  }, [enemy.pattern, phaseList, enemyCharges])

  // Foresight prediction — the enemy's next N moves as they'll ACTUALLY resolve,
  // by simulating pickEnemyAction's substitutions forward from the CURRENT charge
  // count + pattern slot (tracking a simulated magazine as each predicted action
  // spends/loads charges). This is the fix for the old raw-pattern read, which
  // showed the slotted move and lied whenever a substitution fired — e.g. a curse
  // pre-loads the enemy, so a slotted reload it no longer needs becomes a shot.
  // Two knowingly-approximate cases (foresight shows INTENT, not a guarantee):
  // the random reload-at-MAX feint is shown as its Fire intent, and the random
  // snare-jam is ignored.
  const predictEnemyMoves = useCallback((count: number): EnemyAction[] => {
    const activePhase = enemyPhaseRef.current >= 2 ? phaseList[enemyPhaseRef.current - 2] : undefined
    const pattern = activePhase ? activePhase.pattern : enemy.pattern
    if (pattern.length === 0) return []
    let idx = enemyPatternIdxRef.current
    let charges = enemyChargesRef.current
    const out: EnemyAction[] = []
    for (let k = 0; k < Math.max(1, count); k++) {
      const raw = pattern[idx % pattern.length]
      let action: EnemyAction = raw
      if (raw === 'special' && !enemy.special) {
        action = 'reload'; idx++    // mirrors pickEnemyAction's degrade
      } else if (raw === 'ultimate' && !enemy.ultimate) {
        action = 'reload'; idx++    // authoring slip — degrade + advance
      } else if (raw === 'ultimate' && charges < enemyMagazine) {
        action = 'reload'            // building to full — slot re-attempted (no advance)
      } else if ((raw === 'fire' && charges < 1) || (raw === 'volley' && charges < VOLLEY_COST)) {
        action = 'reload'            // impossible action → reload, slot re-attempted (no advance)
      } else if (raw === 'reload' && charges >= enemyMagazine) {
        action = 'fire'; idx++       // wasted reload → fire (or a feint we can't foresee)
      } else {
        idx++
      }
      // Fold the predicted action's charge change in so later steps read right.
      if (action === 'reload') charges = Math.min(enemyMagazine, charges + 1)
      else if (action === 'fire') charges = Math.max(0, charges - 1)
      else if (action === 'volley') charges = Math.max(0, charges - VOLLEY_COST)
      else if (action === 'ultimate') charges = 0   // spends the whole magazine
      out.push(action)
    }
    return out
  }, [enemy.pattern, phaseList])

  // ─── The Quartermaster raid — "Flare Barrage" (per-tier ladder) ────────────
  // Every FLARE_EVERY turns the keeper throws up false flares the player must
  // swat (reactive whack-a-mole) before they can act. Flares spawn
  // arrhythmically (clusters/pauses) so you can't autopilot a rhythm; each
  // penalty (a real flare missed OR a feint tapped) chips you. `decoyCount` is
  // the per-enemy ladder tier (1-3) — dormant on every other enemy.
  const flareTier   = enemy.decoyCount ?? 0
  const flareCount  = flareTier > 0 ? 3 + flareTier * 2 : 0           // 5 / 7 / 9
  // Every 3 turns at every tier — the boss already carries Repossession + phase
  // 2, so the barrage stays a periodic beat, not a relentless every-other-turn.
  const FLARE_EVERY = 3
  // Boss-only "feints" — red live-shell flares you must NOT tap (the rule flips).
  // Kept sparse so it's a sharp twist, not a minefield.
  const flareFeintChance   = flareTier >= 3 ? 0.22 : 0
  // Heavier clustering from tier 2 up; fuses tighten as the tier climbs.
  const flareClusterChance = flareTier >= 2 ? 0.34 : 0.2
  // Challenge mode can tighten the fuse (flareFuseMult < 1 = faster) and hit
  // harder (flareDmgMult > 1) so the barrage is a real step up, not just stats.
  // Flare Storm curse folds in on top of the per-enemy tuning: a tighter fuse
  // (tide.flareFuseMult < 1) and hotter chip (tide.flareDmgMult > 1).
  // Base fuse per tier — 2026 speed nerf (was 0.82 / 0.95 / 1.15): flares were a
  // touch too fast at the fast end, so every tier gets a bit more time to tap.
  const flareFuseScale     = (flareTier >= 3 ? 0.9 : flareTier === 2 ? 1.02 : 1.18) * (enemy.flareFuseMult ?? 1) * tide.flareFuseMult
  const flarePerMiss = Math.round(Math.max(Math.round(enemy.minDmg * 0.7), Math.round(playerHpMax * 0.032)) * (enemy.flareDmgMult ?? 1) * tide.flareDmgMult)
  // Tapping a live-shell feint hurts MORE than letting a flare through — the
  // whole point of the "don't tap the red" test is that grabbing one bites.
  const flarePerFeint = Math.round(flarePerMiss * 1.4)
  // Apply the barrage outcome, then hand control to the player's turn. A bad
  // enough wave (flares let through + live shells tapped) CAN now sink you.
  // Feint-taps and misses are called out apart so the mistake is legible.
  function onFlareBarrageDone(missed: number, feintsTapped: number) {
    const dmg = missed * flarePerMiss + feintsTapped * flarePerFeint
    if (dmg <= 0) {
      setResolveLog(prev => [...prev, `Screen read clean — every flare called right.`])
      setSubPhase('await_input')
      return
    }
    setPlayerShakeKey(k => k + 1)
    setPlayerImpact({ key: Date.now(), kind: 'volley' })
    setTimeout(() => setPlayerImpact(null), 700)
    vibrate([0, 40, 30, 60])
    // Build the "what went wrong" clause from the two failure types.
    const parts: string[] = []
    if (feintsTapped > 0) parts.push(`tapped ${feintsTapped} live shell${feintsTapped > 1 ? 's' : ''}`)
    if (missed > 0)       parts.push(`let ${missed} flare${missed > 1 ? 's' : ''} through`)
    const what = parts.join(' and ')
    const newHp = playerHpRef.current - dmg
    if (newHp > 0) {
      playerHpRef.current = newHp; setPlayerHp(newHp)
      setResolveLog(prev => [...prev, `You ${what} — the barrage rakes you for ${dmg}.`])
      setSubPhase('await_input')
    } else {
      const vRevive = tryVengeanceRevive()
      if (vRevive) {
        // Laz FIRST — the vengeance ward catches even a failed-mechanic wipe.
        playerHpRef.current = vRevive.hp; setPlayerHp(vRevive.hp)
        setResolveLog(prev => [...prev, `You ${what} — it should have sunk you, but the vengeance ward erupts, and you surge back to ${vRevive.hp} HP (+${Math.round(vRevive.buffPct * 100)}% damage).`])
        setSubPhase('await_input')
      } else if (anchorSaveAvailable && !anchorUsedRef.current) {
        anchorUsedRef.current = true; onAnchorSave?.()
        playerHpRef.current = 1; setPlayerHp(1)
        setAnchorSaveFx(k => k + 1)
        onCheatedDeath()
        setResolveLog(prev => [...prev, `You ${what} — it should have sunk you, but the anchor holds at 1 HP.`])
        setSubPhase('await_input')
      } else {
        playerHpRef.current = 0; setPlayerHp(0)
        setResolveLog(prev => [...prev, `You ${what} — the barrage rakes you for ${dmg} and your hull gives way.`])
        setSubPhase('done'); onPlayerDefeated()
      }
    }
  }

  // ─── Player action handlers ────────────────────────────────────────────────

  // Effective charge costs, after Don's cost-cut synergies shave one off. Floored
  // (volley never below 2, mega never below 3) so they can't collapse to a free
  // shot. RaidCombat remounts per fight, so these stay fresh as boons stack.
  const effVolleyCost = Math.max(2, VOLLEY_COST - tide.volleyCostCut)
  const effMegaCost   = Math.max(3, MEGA_CHARGE_COST - tide.megaCostCut)
  const canFire   = playerCharges >= 1
  const canVolley = playerCharges >= effVolleyCost
  // Mega (Man-o-War augment): a full magazine of MEGA_CHARGE_COST (4). Reaching
  // 4 requires the Gauntlet Rack, so the augment is naturally gated behind it.
  const canMega   = !!megaAugment && playerCharges >= effMegaCost
  // Dodge has a 1-turn cooldown so it can't be spammed defensively.
  const canDodge  = lastPlayerAction !== 'dodge'
  // Reload no-ops at full magazine — the +1 (and any tide proc bonus)
  // clamps to MAX_CHARGES on the resolve side, so a reload at 3/3
  // would burn the turn for zero gain. Disable + relabel the slot
  // ("Full") so the player understands why instead of fishing for a
  // missing button.
  const canReload = playerCharges < playerMaxCharges

  // Fire a crew class ability. Doesn't consume the player's turn — the
  // chooser closes, the effect applies, and the action menu stays open so
  // the player can still fire/reload/dodge. Per-turn lock + per-raid used
  // set are bumped together; the parent gets the onAbilityFired callback
  // so the cooldown survives the per-fight RaidCombat remount.
  function fireCrewAbility(
    crew: { id: number; name: string; imageUrl?: string | null },
    def: AnyClassDef,
    m: AnyClassDef['milestones'][number] | null,
  ): void {
    if (!m) return
    if (subPhase !== 'await_input') return
    if (oneAbilityUsedThisTurn) return
    if (usedAbilityIds?.has(crew.id)) return
    // Silenced (Ch4 status) — abilities are locked while it lasts (the chooser
    // card is already disabled; this is the belt-and-braces guard).
    if (statusMods(playerStatusesRef.current).silenced) return

    // Lock the ability the instant it's chosen — BEFORE the summon plays — so
    // nothing double-fires while the crew is being called on.
    setOneAbilityUsedThisTurn(true)
    abilityUsedThisFightRef.current = true
    contractFactsRef.current.crewAbilities++
    onAbilityFired?.(crew.id)
    vibrate(18)
    // Second Calling (boon): a chance the ability isn't spent — the effect still
    // fires, but the parent immediately clears it back off usedAbilityIds so it's
    // usable again (next turn; one ability per turn still holds). Same restore
    // pulse + log cue the War Drum uses.
    if (tide.abilityRefundChance > 0 && Math.random() < tide.abilityRefundChance) {
      onRefreshAbility?.(crew.id)
      setRestorePulse(k => k + 1)
      setResolveLog(prev => [...prev, `Second Calling — the deep answers, and ${crew.name} keeps their station. Ability unspent.`])
    }

    // FINAL-FANTASY-STYLE SUMMON. Instead of a small portrait pill, a big image
    // of the crew fades in over the whole battle screen, holds a beat, then fades
    // out — and the EFFECT follows (deferred below by SUMMON_LEAD_MS), so it reads
    // as calling on that crew in the moment. The overlay eats taps while it plays,
    // so the deferred effect can't race a turn action. See AbilitySummonFx.
    // The summon's CONTENT holds, then ALL fades out together over ~0.25s, fully
    // gone by ~1.9s (matched fade times below). The animated summon then UNMOUNTS
    // at SUMMON_TOTAL_MS, so there's no framer tree left for the deferred effect
    // to re-render (that was making Mako's Frenzy pop the art back in). The effect
    // fires only after that (SUMMON_LEAD_MS) on a clear stage, and a plain
    // tap-guard keeps blocking input across the whole window until it resolves.
    // SUMMON_TOTAL_MS is module-level now (playStep plays enemy summons too).
    const SUMMON_LEAD_MS  = 2140   // effect begins after the summon is fully gone
    const GUARD_MS        = 2320   // plain tap-blocker lifetime (covers the effect)
    setSummonGuard(true)
    setTimeout(() => setSummonGuard(false), GUARD_MS)
    const castKey = Date.now()
    // Glow color follows the EQUIPPED SKIN if there is one (so each legendary
    // skin themes its whole summon in its own color), else the class color.
    const summonSkin = getCrewSkinByFilename(crew.imageUrl)
    const summonColor = summonSkin?.color ?? def.color
    // If an equipped CHASE skin is on this crew, its accent color themes the
    // ability's whole payoff — damage/heal numbers, auras — so the effect reads
    // as the skin (Tempest's shots strike lightning-blue, Hunter's Bane's blow
    // lands blood-red, Galaxy's heal glows cosmic, etc.). null for base/regular.
    const chaseColor: string | null = summonSkin?.chase ? summonSkin.color : null
    // Chase-skin id drives BESPOKE ability-effect FX (the upgraded thing that
    // happens to the enemy), e.g. Mako's Tempest turns Blitz into a lightning storm.
    const chaseSkinId: string | null = summonSkin?.chase ? summonSkin.id : null
    setAbilitySummon({ key: castKey, label: ABILITY_CAST_LABEL[def.id] ?? def.name, name: crew.name, color: summonColor, image: crew.imageUrl ?? null, chase: !!summonSkin?.chase, skinId: summonSkin?.id ?? null })
    setTimeout(() => setAbilitySummon(s => (s && s.key === castKey ? null : s)), SUMMON_TOTAL_MS)

    // Per-ability signature stage FX alongside the banner, so every ability
    // has its own satisfying "it landed" beat (not just a log line). Player-hull
    // auras for self-buffs, enemy-hull auras for the ones that act ON the enemy.
    // Leviathan / Blitz drive their own attack animations in the switch below.
    const ak = castKey + 1
    const themePlayer = (kind: 'heal' | 'tide' | 'aim' | 'charge' | 'brace', color?: string | null) => {
      setPlayerAura({ key: ak, kind, color: color ?? undefined })
      setTimeout(() => setPlayerAura(a => (a && a.key === ak ? null : a)), 950)
    }
    const themeEnemy = (kind: 'snared' | 'foresee' | 'marked', color?: string | null) => {
      setEnemyAura({ key: ak, kind, color: color ?? undefined })
      setTimeout(() => setEnemyAura(a => (a && a.key === ak ? null : a)), 950)
    }
    // Defer the EFFECT so it lands as the summon fades — you call the crew, THEN
    // their power hits. Input stays blocked by the summon overlay meanwhile.
    setTimeout(() => {
    if      (def.id === 'mender')       themePlayer('heal')
    else if (def.id === 'abyssal_tide') themePlayer('tide', chaseColor)
    else if (def.id === 'sharpshot')    themePlayer('aim')
    else if (def.id === 'navigator')    themePlayer('charge')
    else if (def.id === 'anchor')       themePlayer('brace')
    else if (def.id === 'snare')        themeEnemy('snared')
    else if (def.id === 'foresight')    themeEnemy('foresee', chaseColor)
    else if (def.id === 'vengeance')    themePlayer('brace', chaseColor)
    else if (def.id === 'requiem')      themeEnemy('marked', chaseColor)

    // Dispatch on class id — TS narrows the milestone shape from the
    // per-class table.
    switch (def.id) {
      case 'mender': {
        const mm = m as import('@/lib/crewClasses').MenderMilestone
        const heal = Math.round(playerHpMax * mm.pctMaxHp * tide.healMult)
        onStat?.({ dmgHealed: Math.max(0, Math.min(heal, playerHpMax - playerHpRef.current)) })
        setPlayerHp(prev => Math.min(healCap, prev + heal))
        playerHpRef.current = Math.min(healCap, playerHpRef.current + heal)
        if (mm.cleanseDebuff) { setCleanseDebuffPending(true); cleansePlayerStatuses() }
        noteCheckResponse('heal'); dousePlayerBurnFromHeal()
        setPHitsplat({ key: ak + 1, text: `+${heal}`, color: '#4ade80', big: true })
        setTimeout(() => setPHitsplat(null), 900)
        setResolveLog(prev => [...prev, `${crew.name} patches the hull. +${heal} HP${mm.cleanseDebuff ? ', debuffs cleared' : ''}.`])
        break
      }
      case 'sharpshot': {
        const sm = m as import('@/lib/crewClasses').SharpshotMilestone
        setSharpshotBuff({ multiplier: sm.critZoneMultiplier, shotsLeft: sm.shotsBuffed })
        setResolveLog(prev => [...prev, `${crew.name} steadies your aim — a wider crit window on your next ${sm.shotsBuffed} shot${sm.shotsBuffed === 1 ? '' : 's'}.`])
        break
      }
      case 'snare': {
        const sn = m as import('@/lib/crewClasses').SnareMilestone
        setSnareDodgeTurns(sn.disableDodgeTurns)
        snareDodgeTurnsRef.current = sn.disableDodgeTurns
        noteCheckResponse('snare')
        snareJamChanceRef.current = sn.jamChance
        const pct = Math.round(sn.jamChance * 100)
        const snDur = `${sn.disableDodgeTurns} turn${sn.disableDodgeTurns === 1 ? '' : 's'}`
        setResolveLog(prev => [...prev, `${crew.name} jams the ${enemy.name}'s helm — ${pct}% to foul each dodge for ${snDur}.`])
        break
      }
      case 'anchor': {
        const an = m as import('@/lib/crewClasses').AnchorMilestone
        setAnchorReductionPct(an.pctReduction)
        anchorReductionRef.current = an.pctReduction
        noteCheckResponse('brace')
        anchorAbsorbsCritsRef.current = !!an.absorbsCrits
        setResolveLog(prev => [...prev, `${crew.name} drops the sea anchor — the next hit you take is cut ${Math.round(an.pctReduction * 100)}%${an.absorbsCrits ? ', crits and all' : ''}.`])
        break
      }
      case 'navigator': {
        const nm = m as import('@/lib/crewClasses').NavigatorMilestone
        // Roll +2 first; if it lands, override the +1 roll.
        const two  = nm.twoChargeChance > 0 && Math.random() < nm.twoChargeChance
        const one  = !two && (nm.oneChargeChance >= 1 || Math.random() < nm.oneChargeChance)
        const add  = two ? 2 : (one ? 1 : 0)
        if (add > 0) {
          setPlayerCharges(prev => Math.min(playerMaxCharges, prev + add))
          setPHitsplat({ key: ak + 1, text: `+${add} ●`, color: '#f5c542', big: add > 1 })
          setTimeout(() => setPHitsplat(null), 900)
        }
        setResolveLog(prev => [...prev, add > 0
          ? `${crew.name} runs the powder up — +${add} cannonball${add === 1 ? '' : 's'} loaded.`
          : `${crew.name} works the powder but comes up empty this time.`])
        break
      }
      // ── Legendary signature abilities ────────────────────────────────
      case 'abyssal_tide': {
        const at = m as import('@/lib/crewClasses').AbyssalTideMilestone
        const heal = Math.round(playerHpMax * at.pctMaxHp * tide.healMult)
        setPlayerHp(prev => Math.min(healCap, prev + heal))
        playerHpRef.current = Math.min(healCap, playerHpRef.current + heal)
        // Shield buffer — soaks incoming damage before HP (resolver reads the
        // ref + decrements; state mirror drives the hull glint).
        const shield = Math.round(playerHpMax * at.shieldPctMaxHp)
        setAbyssalShieldHp(prev => prev + shield)
        abyssalShieldRef.current += shield
        if (at.cleanseDebuff) { setCleanseDebuffPending(true); cleansePlayerStatuses() }
        noteCheckResponse('heal'); noteCheckResponse('shield'); noteCheckResponse('brace'); dousePlayerBurnFromHeal()   // legendary breadth: the abyss answers heal, shield AND brace checks
        // Galaxy (Catfish's chase skin): a cosmic surge blooms over your hull as
        // the tide heals + shields — nebula, a galactic shield-dome, rising motes.
        if (chaseSkinId === 'catfish_galaxy') {
          const gk = Date.now()
          setPlayerStrikeFx({ key: gk, kind: 'galaxy', color: chaseColor ?? '#8b7bf0' })
          playStepChainRef.current.push(setTimeout(() => setPlayerStrikeFx(s => (s && s.key === gk ? null : s)), 1750))
        }
        setPHitsplat({ key: ak + 1, text: `+${heal}`, color: chaseColor ?? '#5eead4', big: true })
        setTimeout(() => setPHitsplat(null), 900)
        setResolveLog(prev => [...prev, `${crew.name} calls the abyss: +${heal} HP, ${shield} HP shield.`])
        break
      }
      case 'leviathan': {
        const lv = m as import('@/lib/crewClasses').LeviathanMilestone
        // ONE big shell — a GUARANTEED crit that ALWAYS lands the full crit
        // amount. We take the deterministic crit ceiling from the shared damage
        // profile instead of ROLLING the crit range: that range's floor is
        // minDmg×2 (tiny vs powerMax on a Power-stacked build), so a rolled
        // "guaranteed crit" often compressed toward a normal hit and let Blitz's
        // barrage out-damage it. A fixed crit amount keeps Leviathan the
        // reliable heavy hitter it's meant to be. × the milestone's dmgMult.
        // mods.damagePct folds in here too — the salvo used to miss it entirely.
        const { critMax } = raidDamageProfile(totalPower, shipMinDamage, mods.damagePct)
        let dmg = Math.floor(critMax * lv.dmgMult)
        // Made for BIG prey: a bonus vs bosses/elites, a HEAVY penalty vs a
        // regular hull. The anti-big-target identity (Blitz is the swarm).
        const bigGame = isBoss || isElite
        if (bigGame && (lv.bossBonusPct ?? 0) > 0)        dmg = Math.floor(dmg * (1 + lv.bossBonusPct!))
        else if (!bigGame && (lv.mobPenaltyPct ?? 0) > 0) dmg = Math.floor(dmg * (1 - lv.mobPenaltyPct!))
        // ...and then everything the build actually is.
        dmg = Math.max(1, Math.floor(dmg * abilityDamageMult(bigGame)))
        noteCheckResponse('burst'); noteCheckResponse('snare')   // legendary breadth: a blow this heavy also staggers him out of an action (disrupt check)
        // Big-knock FX: a heavy muzzle flash, a beat as the shell crosses, then
        // a massive hull impact + full screen heave landing WITH the damage.
        const lk = Date.now()
        // Hunter's Bane (Doby's chase skin): the salvo becomes an apex killing
        // blow — a reticle lock, then a devastating detonation on the hull. The
        // bespoke strike carries the visual, so skip the cannon shell + generic
        // impact burst and keep the heavy shake, haptic and damage.
        const huntersBane = chaseSkinId === 'doby_huntersbane'
        if (huntersBane) {
          setEnemyStrikeFx({ key: lk, kind: 'leviathan', color: chaseColor ?? '#dc2626' })
          vibrate([0, 18, 55, 28])   // rising charge rumble as the strike winds up
          playStepChainRef.current.push(setTimeout(() => setEnemyStrikeFx(s => (s && s.key === lk ? null : s)), 1400))
        } else {
          setCannonShot({ key: lk, kind: 'crit' })
          playStepChainRef.current.push(setTimeout(() => setCannonShot(null), 240))
        }
        // Hunter's Bane lands its damage + heave at the DETONATION (after the
        // charge), not immediately — so the big blast and the number hit together.
        const hitDelay = huntersBane ? 580 : 210
        playStepChainRef.current.push(setTimeout(() => {
          if (!huntersBane) setEnemyImpact({ key: lk + 1, kind: 'crit' })
          cameraShake('crit')
          vibrate(huntersBane ? [0, 90, 40, 130] : chaseColor ? [0, 70, 45, 110] : [0, 55, 40, 90])
          applyAbilityDamage(dmg, `${crew.name} lands a leviathan salvo for ${dmg}${bigGame ? ' — big-game strike!' : '!'}`, 'crit', false, chaseColor ?? undefined)
          if (!huntersBane) playStepChainRef.current.push(setTimeout(() => setEnemyImpact(null), 700))
          // A second delayed thud for any OTHER (future) chase skin on Doby;
          // Hunter's Bane's bespoke strike already carries the weight.
          if (chaseColor && !huntersBane) {
            playStepChainRef.current.push(setTimeout(() => {
              setEnemyImpact({ key: lk + 2, kind: 'crit' })
              cameraShake('crit')
              playStepChainRef.current.push(setTimeout(() => setEnemyImpact(null), 500))
            }, 150))
          }
        }, hitDelay))
        break
      }
      case 'blitz': {
        const bz = m as import('@/lib/crewClasses').BlitzMilestone
        // Barrage — a GUARANTEED number of light shots (no RNG chain), so it
        // never whiffs. MANY SMALL hits: each shot is only shotDmgMult of a
        // normal cannon shot (Sharpshot / damagePct still compound). Lv 100
        // crits every shot.
        const shotResult: ShotResult = bz.autoCrit ? 'critical' : 'hit'
        const shots = bz.shots
        // Feeding frenzy — each shot scales up as the target weakens. Simulate
        // the HP dropping across the volley (nothing else hits the enemy mid-
        // barrage) so the frenzy ACCELERATES and rewards using it as a finisher.
        // ~0 bonus on a fresh boss keeps Leviathan the boss-killer.
        const frMaxHp = Math.max(1, enemyHpMaxRef.current)
        let frSimHp = enemyHpRef.current
        const shotDmgs: number[] = []
        const bzBuild = abilityDamageMult(isBoss || isElite)   // the build, applied per shot
        for (let s = 0; s < shots; s++) {
          const hpFrac = Math.max(0, Math.min(1, frSimHp / frMaxHp))
          const frenzyMult = 1 + bz.frenzyMaxPct * (1 - hpFrac)
          const dmg = Math.max(1, Math.floor(rollShotDamage(shotResult, shipMinDamage, totalPower, mods.damagePct) * bz.shotDmgMult * frenzyMult * bzBuild))
          shotDmgs.push(dmg)
          frSimHp = Math.max(0, frSimHp - dmg)
        }
        const total = shotDmgs.reduce((a, b) => a + b, 0)
        const isCrit = !!bz.autoCrit
        noteCheckResponse('burst'); noteCheckResponse('snare')   // legendary breadth: the barrage pins him down (disrupt check) as well as a burst
        // Find the shot that lands the kill (running total vs current HP) so the
        // chain STOPS there and that shot runs the outro. Nothing else damages
        // the enemy mid-burst (turn resolution), so this is stable.
        const curHp = enemyHpRef.current
        let cum = 0, killIdx = -1
        for (let k = 0; k < shots; k++) { cum += shotDmgs[k]; if (cum >= curHp) { killIdx = k; break } }
        const lastIdx = killIdx >= 0 ? killIdx : shots - 1
        // Rat-a-tat: EACH shot pops a muzzle flash + a hull impact + its OWN
        // damage number, so the frenzy visibly chains the hits instead of one
        // lump landing at the end. Paced so each hit reads as its own blow.
        const INTERVAL = 200
        // Tempest (Mako's chase skin): the barrage isn't cannon fire — it's a
        // lightning STORM. Mount the bespoke strike FX over the enemy for the
        // whole barrage; each shot below then skips the muzzle flash + generic
        // impact burst (the descending bolts + hull flashes carry the visuals),
        // keeping the damage, floating numbers, haptics and camera heave.
        const tempest = chaseSkinId === 'mako_tempest'
        if (tempest) {
          const stormKey = Date.now()
          setEnemyStrikeFx({ key: stormKey, kind: 'tempest', color: chaseColor ?? '#38bdf8', shots: lastIdx + 1, interval: INTERVAL })
          playStepChainRef.current.push(setTimeout(() => setEnemyStrikeFx(s => (s && s.key === stormKey ? null : s)), (lastIdx + 1) * INTERVAL + 900))
        }
        for (let k = 0; k <= lastIdx; k++) {
          playStepChainRef.current.push(setTimeout(() => {
            const bk = Date.now() + k
            if (!tempest) {
              setCannonShot({ key: bk, kind: isCrit ? 'crit' : 'normal' })
              playStepChainRef.current.push(setTimeout(() => setCannonShot(null), 85))
              setEnemyImpact({ key: bk + 300, kind: isCrit ? 'crit' : 'normal' })
              playStepChainRef.current.push(setTimeout(() => setEnemyImpact(null), 150))
            }
            vibrate(isCrit ? 16 : 9)
            // Each shot floats its OWN damage number, scattered across the hull so
            // the whole barrage's numbers read (not just the first). skipSplat on
            // the damage helpers suppresses the single eHitsplat for these.
            const dx = (k - lastIdx / 2) * 16 + (k % 2 ? 7 : -7)
            const sk = bk + 900
            setBarrageSplats(s => [...s, { key: sk, text: `-${shotDmgs[k]}`, dx, crit: isCrit, color: chaseColor ?? undefined }])
            playStepChainRef.current.push(setTimeout(() => setBarrageSplats(s => s.filter(x => x.key !== sk)), 680))
            if (k === lastIdx) {
              cameraShake('volley')
              applyAbilityDamage(shotDmgs[k], `${crew.name} unloads ${shots} shot${shots === 1 ? '' : 's'} for ${total}!`, isCrit ? 'crit' : 'hit', true)
            } else {
              applyChainHit(shotDmgs[k], isCrit ? 'crit' : 'hit', true)
            }
          }, k * INTERVAL))
        }
        break
      }
      case 'foresight': {
        const fm = m as import('@/lib/crewClasses').ForesightMilestone
        // Predict the enemy's ACTUAL upcoming moves — simulate the substitution
        // rules forward from the live charge count, not the raw pattern slot, so
        // a pre-loaded magazine (curse), an accumulated charge, etc. don't make
        // the reveal lie. Feints/snare-jams can still surprise (intent, not a
        // guarantee), but the common "you drafted a curse and it's all wrong now"
        // case is fixed.
        foresightMovesLeftRef.current = Math.max(1, fm.revealMoves)
        const moves = predictEnemyMoves(fm.revealMoves)
        setForeseenMoves(moves)
        // Kraken Hunter (Dole's chase skin): an abyssal scry reads the enemy — a
        // teal eye opens over the target and sonar rings scan it as the moves surface.
        if (chaseSkinId === 'dole_krakenhunter') {
          const ok = Date.now()
          setEnemyStrikeFx({ key: ok, kind: 'oracle', color: chaseColor ?? '#2dd4bf' })
          playStepChainRef.current.push(setTimeout(() => setEnemyStrikeFx(s => (s && s.key === ok ? null : s)), 1500))
        }
        // Dodge refresh — clear the one-turn dodge cooldown so a player who
        // dodged last turn can slip the shot they just foresaw.
        let refreshed = false
        if (fm.dodgeRefreshChance > 0 && lastPlayerAction === 'dodge' && Math.random() < fm.dodgeRefreshChance) {
          setLastPlayerAction(null)
          refreshed = true
        }
        // Legendary breadth (Don Finleone checks): foreseeing the enemy's whole
        // hand means you're ready for ANY of it — the Oracle answers every check
        // category (brace / shield / heal / snare / burst).
        noteCheckResponse('brace'); noteCheckResponse('shield'); noteCheckResponse('heal'); noteCheckResponse('snare'); noteCheckResponse('burst')
        const nice = (a: EnemyAction) => a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'reload' ? 'Reload' : a === 'mega' ? 'Mega' : a === 'repair' ? 'Repair' : a === 'special' ? (enemy.special?.name ?? 'Special') : a === 'ultimate' ? (enemy.ultimate?.name ?? 'Ultimate') : 'Dodge'
        setResolveLog(prev => [...prev, `${crew.name} reads the tide — the enemy will ${moves.map(nice).join(', then ')}.${refreshed ? ' Your dodge is ready again.' : ''}`])
        break
      }
      case 'vengeance': {
        const vg = m as import('@/lib/crewClasses').VengeanceMilestone
        // Arm the ward for THIS fight and capture its numbers now. If a killing
        // blow lands this fight, the resolver reads these to cheat death, heal,
        // and light the rage buff. Skill-timed: if no lethal hit comes, it just
        // sits there (a spent ability) — arm it when you read the danger.
        vengeanceWardRef.current = true
        setWardTurns(VENGEANCE_WARD_TURNS)
        vengeanceHealPctRef.current = vg.healPctMaxHp
        vengeanceBuffPctRef.current = vg.dmgBuffPct
        vengeanceCleanseRef.current = !!vg.cleanseDebuff
        noteCheckResponse('brace'); noteCheckResponse('shield')   // legendary breadth: a ward that cheats a killing blow answers both brace AND shield checks
        // Fossil (Laz's chase skin): an ancient stone-and-amber ward seals around
        // your hull as it's armed — counter-rotating glyph rings locking in.
        if (chaseSkinId === 'coelacanth_fossil') {
          const wk = Date.now()
          setPlayerStrikeFx({ key: wk, kind: 'ward', color: chaseColor ?? '#c8a45c' })
          playStepChainRef.current.push(setTimeout(() => setPlayerStrikeFx(s => (s && s.key === wk ? null : s)), 2100))
        }
        setResolveLog(prev => [...prev, `${crew.name} girds your ship with a vengeance ward. Fall within ${VENGEANCE_WARD_TURNS} turns and it strikes back.`])
        break
      }
      case 'requiem': {
        const rq = m as import('@/lib/crewClasses').RequiemMilestone
        // Pure force-multiplier — NO damage. Paint the enemy with a `marked`
        // debuff: while it burns, that target takes +markMag damage from every
        // source (the player's aim shots AND every crew ability, both of which
        // already fold in enemy dmgTakenMult). Lv100 also arms the shield pierce.
        applyEnemyStatus('marked', rq.markMag, rq.markTurns)
        if (rq.pierceShield) markPierceTurnsRef.current = rq.markTurns
        noteCheckResponse('snare'); noteCheckResponse('burst')   // legendary breadth: marking him for the kill answers a disrupt AND a "hit hard" check
        // The Idol (Mira's chase skin): brand a bespoke death-mark sigil onto the
        // enemy hull as it's marked — the lasting `marked` aura carries on after.
        if (chaseSkinId === 'moorish_idol_idol') {
          const rk = Date.now()
          setEnemyStrikeFx({ key: rk, kind: 'requiem', color: chaseColor ?? '#ff4d7d' })
          playStepChainRef.current.push(setTimeout(() => setEnemyStrikeFx(s => (s && s.key === rk ? null : s)), 1400))
        }
        setEHitsplat({ key: ak + 1, text: 'MARKED', color: chaseColor ?? '#f43f5e', big: true })
        setTimeout(() => setEHitsplat(null), 900)
        const dur = `${rq.markTurns} turn${rq.markTurns === 1 ? '' : 's'}`
        setResolveLog(prev => [...prev, `${crew.name} marks the ${enemy.name} for death — +${Math.round(rq.markMag * 100)}% damage from the whole crew for ${dur}${rq.pierceShield ? ', and its shield is laid open' : ''}.`])
        break
      }
    }
    }, SUMMON_LEAD_MS)
  }

  // Activatable raid item — War Drum (60% chance) / Thunder Drum (guaranteed).
  // NET-NEW mechanic: fires from the Special menu, ONCE per raid, does NOT cost
  // the turn or the per-turn ability lock. On success it restores a random SPENT
  // crew ability (parent clears its id from usedAbilityIds via onRefreshAbility).
  // A fizzle still spends the item — that's the epic's gamble.
  function activateRaidItem(item: import('@/lib/raidItems').RaidItemDef): void {
    if (!item.activated) return
    if (subPhase !== 'await_input') return
    if (usedRaidItemIds?.has(item.id)) return
    const spent = crewMembers.filter(c => usedAbilityIds?.has(c.id))
    if (spent.length === 0) return

    // Spend the use up front (a fizzle still counts) + a themed drum-beat cue.
    onRaidItemUsed?.(item.id)
    const castKey = Date.now()
    setAbilityCast({ key: castKey, label: 'Beat to Quarters', name: item.name, color: '#e0a44a', image: item.image, emoji: item.emoji })
    setTimeout(() => setAbilityCast(c => (c && c.key === castKey ? null : c)), 1150)
    vibrate([0, 30, 40, 30])

    const success = Math.random() < item.activated.chance
    if (success) {
      const pick = spent[Math.floor(Math.random() * spent.length)]
      onRefreshAbility?.(pick.id)
      setRestorePulse(k => k + 1)
      setResolveLog(prev => [...prev, `The ${item.name} thunders across the deck — ${pick.name} is back to their station, ability restored.`])
    } else {
      setResolveLog(prev => [...prev, `The ${item.name} beats, but the call goes unanswered — no ability restored.`])
    }
  }

  // Shared damage applicator for legendary direct-damage abilities
  // (Leviathan, Blitz). Handles the hitsplat + shake + log line + victory
  // detection / sink animation / onEnemyDefeated dispatch, mirroring the
  // step-playback path inside resolveTurn so kills landed via an ability
  // run the same outro as kills landed via cannon fire.
  // ── ABILITY DAMAGE MUST SCALE WITH THE BUILD ────────────────────────────────
  // Crew ability damage used to be applied RAW: computed straight off totalPower and
  // shipMinDamage, then handed to applyAbilityDamage, skipping the entire multiplier
  // chain a normal shot takes. A normal crit grew with every boon, item, class pick,
  // Renown point and enemy status. Doby's salvo and Mako's barrage did not. They were
  // FROZEN at base stats.
  //
  // Measured against a normal crit for an endgame captain, Doby's legendary boss salvo
  // went 2.22x -> 1.11x -> 0.74x -> 0.55x as boons stacked. Deep in a Gauntlet run, the
  // boss-killer legendary did HALF of what simply firing the cannon would have done.
  // Their milestone numbers were never wrong; they were being applied to a base that
  // never moved.
  //
  // This is the same chain as a normal HIT, minus everything ACTION-specific. An
  // ability is neither a fire nor a volley, so volley/fire mults, the volley ramp and
  // the crit-streak chain have no business here.
  function abilityDamageMult(againstBig: boolean): number {
    // The same live item set a shot sees: everything equipped MINUS whatever the boss
    // repossessed at fight start (the Quartermaster switches a piece of your kit off).
    const items = getActiveEffects(equippedRaidItems.filter(id => id !== repossessedItemRef.current))
    const mul = (t: string) => items.filter(e => e.type === t).reduce((a, e) => a * e.value, 1)

    const bossMult    = againstBig ? mul('boss_damage_mult') : 1
    const nonbossMult = againstBig ? 1 : mul('nonboss_damage_mult')
    const rampPerTurn = items.filter(e => e.type === 'ramp_damage_per_turn').reduce((a, e) => a + e.value, 0)
    const rampMult    = 1 + Math.min(DAMAGE_RAMP_CAP, rampPerTurn * Math.max(0, turnRef.current - 1))
    const tideBossMult = againstBig ? tide.bossDmgMult : 1
    const lowHpMult   = tide.lowHpDamage > 0
      ? 1 + tide.lowHpDamage * Math.max(0, 1 - playerHpRef.current / playerHpMax)
      : 1
    const frozenMult  = enemyFrozenRef.current > 0 && tide.frozenDmgMult > 1 ? tide.frozenDmgMult : 1
    const vengeanceMult = vengeanceDmgBuffRef.current > 0 ? 1 + vengeanceDmgBuffRef.current : 1
    // What YOU deal (weaken/enrage) x what the ENEMY takes (feeble/fortify).
    const statusOutMult = statusMods(playerStatusesRef.current).dmgDealtMult
                        * statusMods(enemyStatusesRef.current).dmgTakenMult

    const raw = bossMult * nonbossMult * rampMult * classDamageMult
              * tide.dmgMult * tideBossMult * lowHpMult * frozenMult * vengeanceMult * statusOutMult

    // Abilities take ABILITY_BUILD_SCALING of the build's scaling, not all of it. The
    // damping is on the EXCESS above 1x: a captain with no items and no boons has
    // raw = 1 and is completely unaffected, while a stacked build's free crit no
    // longer compounds as hard as the aimed shot it costs nothing to replace.
    return 1 + (raw - 1) * ABILITY_BUILD_SCALING
  }

  function applyAbilityDamage(rawDmg: number, logLine: string, hitKind: 'hit' | 'crit', skipSplat = false, splatColor?: string) {
    // The Last Wall (aegis) drinks crew direct damage whole too — but the blow
    // still chips the wall's endurance, so a spent ability isn't a total waste.
    // This is a UI-time path, so the visual updates land right here.
    if (aegisRef.current && rawDmg > 0) {
      aegisRef.current.hitsLeft -= 1
      aegisHitsRef.current += 1
      const broke = aegisRef.current.hitsLeft <= 0
      if (broke) { aegisRef.current = null; setAegisVis(null) }
      setEHitsplat({ key: Date.now(), text: 'Walled', color: '#e8d8a8', big: false })
      setTimeout(() => setEHitsplat(null), 480)
      setEnemyShakeKind('hit')
      setEnemyShakeKey(k => k + 1)
      setResolveLog(prev => [...prev, logLine,
        'The wall drinks the blow whole. Not a scratch on it.',
        ...(broke ? ['The wall groans, buckles, and finally comes apart under sheer battering!'] : []),
      ])
      return
    }
    // Crew abilities are direct player damage — they route through the enemy's
    // barrier (Warded / The Warding) before its hull, same as cannon fire.
    // ...unless Mira's mark has laid the shield open (Lv100 pierce), in which
    // case the blow skips the barrier entirely.
    let toHull = rawDmg
    if (enemyShieldRef.current > 0 && rawDmg > 0 && markPierceTurnsRef.current <= 0) {
      const absorbed = Math.min(enemyShieldRef.current, rawDmg)
      enemyShieldRef.current -= absorbed
      setEnemyShieldHp(enemyShieldRef.current)
      toHull = rawDmg - absorbed
    }
    const newHp = Math.max(0, enemyHpRef.current - toHull)
    setEnemyHp(newHp)
    enemyHpRef.current = newHp
    if (!skipSplat) {
      // THE SEA TAKES IT TOO. One call, at the one place every shot that lands
      // on her passes through, so no attack can be added later that hits a hull
      // without the water noticing.
      bang(hitKind === 'crit' ? 'crit' : 'hit', 'enemy')
      setEHitsplat({ key: Date.now(), text: String(rawDmg), color: splatColor ?? (hitKind === 'crit' ? '#fbbf24' : '#f87171'), big: true })
      setTimeout(() => setEHitsplat(null), 480)
    }
    setEnemyShakeKind(hitKind === 'crit' ? 'crit' : 'hit')
    setEnemyShakeKey(k => k + 1)
    setResolveLog(prev => [...prev, logLine])
    if (newHp <= 0) {
      // Multi-phase boss: an ability killing blow revives him into the next
      // phase (mirrors the resolveTurn revival) instead of ending the fight.
      if (enemyPhaseRef.current <= phaseList.length) {
        const nextCfg = phaseList[enemyPhaseRef.current - 1]
        enemyPhaseRef.current += 1
        enemyPatternIdxRef.current = 0; bossAbilityTurnRef.current = 0; bossAbilityUsedRef.current = false; bossAbilityOnRef.current = 0
        enemyFeintStreakRef.current = 0
        const revivedHp = Math.max(1, Math.floor(enemyHpMaxRef.current * nextCfg.revivePct))
        setEnemyHp(revivedHp)
        enemyHpRef.current = revivedHp
        // ARMOUR ON A REVIVE IS OPT-IN, per phase.
        //
        // This used to fall back to the enemy's flat shieldPct, which was added
        // to give Challenge Finn escalating plate across a six-phase fight. It
        // worked for him, and then leaked: this is the shared revive path, so
        // EVERY phased boss started re-walling at full strength on every phase.
        // Davy's Gauntlet felt it worst, since it inherits phase2 from challenge
        // configs past depth 20 and hands you the same hull repeatedly with
        // whatever boons the run happened to offer — a fresh 20-30% barrier per
        // phase is a very different tax there than in a raid you loadout for.
        //
        // A phase that WANTS plate names it (Challenge Finn does, via
        // FINN_CHALLENGE_PLATE in raidChallenge). A phase that does not opens
        // bare, which is what every boss did before that change.
        bossWardBuffRef.current = 0
        bossWardRef.current = 0; setWardUp(false)
        bossForesightRef.current = 0; setForeseeUp(false)
        // Per-phase plate: a phase names its own shieldPct to carry armour into
        // that phase, so it can ESCALATE across a fight. Unset means no plate,
        // NOT the enemy's opening pool, which is applied once at mount.
        const phaseShield = nextCfg.shieldPct != null
          ? Math.round(enemyHpMaxRef.current * nextCfg.shieldPct)
          : 0
        enemyShieldRef.current = phaseShield
        setEnemyShieldHp(phaseShield)
        const n = enemyPhaseRef.current
        setEnemyPhase(n)
        // Warlord's Reckoning: a phase change is the fight resetting its stance,
        // so the NEXT shot counts as an opening shot again.
        shotsAtPhaseStartRef.current = shotsThisFightRef.current
        setPhaseCallout(nextCfg.badge ?? `Phase ${n}`)
        setPhaseFlash(true)
        setTimeout(() => setPhaseFlash(false), 2400)
        setTimeout(() => setResolveLog(prev => [...prev, `${enemy.name}: "${nextCfg.dialogueLine}"`]), 300)
        armMechanicCheck(nextCfg.check)
        if (nextCfg.aegis) {
          aegisRef.current = { name: nextCfg.aegis.name, hitsLeft: nextCfg.aegis.hitsToBreak }
          aegisHitsRef.current = 0
          setAegisVis({ name: nextCfg.aegis.name })
        }
        vibrate([0, 50, 40, 80])
        return
      }
      // Victory beat — mirrors the eHp<=0 branch in resolveTurn so loot /
      // XP messages and the kill callback fire on the same schedule the
      // cannon-fire path uses.
      setSubPhase('done')
      // No white kill-flash — the explosion burst + sink animation carry the
      // kill on their own (the flash read as a jarring whiteout on the sink).
      setEnemySinking(true)
      setTimeout(() => setResolveLog(prev => [...prev, `You sank the ${enemy.name}!`]), 200)
      let cbDelay = 1000
      if (killReward?.gold) {
        setTimeout(() => setResolveLog(prev => [...prev, `Plunder: +${killReward.gold} ⟡`]), 500)
        cbDelay = 1300
      }
      if (killReward?.xp) {
        setTimeout(() => setResolveLog(prev => [...prev, `Nav XP: +${killReward.xp}`]), 800)
        cbDelay = 1600
      }
      // Sank a BOSS with no shot fired AND no crew ability used — a pure
      // riposte / DoT kill. (Non-boss mobs + ability kills don't qualify.)
      if (isBoss && shotsThisFightRef.current === 0 && !abilityUsedThisFightRef.current) onNoShotKill?.()
      emitContractFacts()
      setTimeout(() => onEnemyDefeated(playerHpRef.current, playerChargesRef.current), cbDelay)
    }
  }

  // One link of the Blitz frenzy chain — shaves a small shot off the enemy with
  // its OWN damage number + shake, no log/kill. The FINAL shot in the chain runs
  // applyAbilityDamage instead (that one owns the summary line + kill outro).
  function applyChainHit(rawDmg: number, hitKind: 'hit' | 'crit', skipSplat = false) {
    let toHull = rawDmg
    if (enemyShieldRef.current > 0 && rawDmg > 0 && markPierceTurnsRef.current <= 0) {
      const absorbed = Math.min(enemyShieldRef.current, rawDmg)
      enemyShieldRef.current -= absorbed
      setEnemyShieldHp(enemyShieldRef.current)
      toHull = rawDmg - absorbed
    }
    const newHp = Math.max(0, enemyHpRef.current - toHull)
    setEnemyHp(newHp)
    enemyHpRef.current = newHp
    if (!skipSplat) {
      setEHitsplat({ key: Date.now(), text: String(rawDmg), color: hitKind === 'crit' ? '#fbbf24' : '#f87171', big: false })
      setTimeout(() => setEHitsplat(null), 200)
    }
    setEnemyShakeKind('hit')
    setEnemyShakeKey(k => k + 1)
  }

  function selectAction(action: EnemyAction) {
    if (subPhase !== 'await_input') return
    if (action === 'fire'   && !canFire)   return
    if (action === 'volley' && !canVolley) return
    if (action === 'mega'   && !canMega)   return
    if (action === 'dodge'  && !canDodge)  return
    if (action === 'repair') {
      if (!repairKit || kitUsed || playerHp >= playerHpMax) return
      // Mark consumed at selection — no take-backs once the kit is cracked.
      setKitUsed(true)
    }

    // Drowned Whispers: a chance the chosen order comes out scrambled into a
    // DIFFERENT valid action. Repair is spared (the kit is too precious to waste).
    // Stash the swap for the action-log line + flash it on screen.
    confusionRef.current = null
    if (tide.confuseChance > 0 && action !== 'repair' && Math.random() < tide.confuseChance) {
      const pool: EnemyAction[] = []
      if (action !== 'fire'   && canFire)   pool.push('fire')
      if (action !== 'volley' && canVolley) pool.push('volley')
      if (action !== 'mega'   && canMega)   pool.push('mega')
      if (action !== 'reload' && canReload) pool.push('reload')
      if (action !== 'dodge'  && canDodge)  pool.push('dodge')
      if (pool.length > 0) {
        const swapped = pool[Math.floor(Math.random() * pool.length)]
        confusionRef.current = { from: action, to: swapped }
        // Clear by a STABLE key, not `from` — `action` is reassigned to `swapped`
        // below, so a `c.from === action` guard would never match and the flash
        // would stick on screen forever.
        const fxKey = Date.now()
        setConfusedFx({ key: fxKey, from: action, to: swapped })
        setTimeout(() => setConfusedFx(c => (c && c.key === fxKey ? null : c)), 1400)
        vibrate([0, 25, 35, 25])
        action = swapped
      }
    }

    setPlayerAction(action)
    // Contract facts: the Dodge action taken (the FINAL action, post-confusion).
    if (action === 'dodge') contractFactsRef.current.dodges++
    if (action === 'fire' || action === 'volley' || action === 'mega') {
      // Reset aim positions and indicator styling, then begin aiming
      firePosRef.current = 0; fireDirRef.current = 1
      zonePosRef.current = 0.3 + Math.random() * 0.4
      zoneDirRef.current = Math.random() < 0.5 ? -1 : 1
      if (indicatorRef.current && !onDial) {
        indicatorRef.current.style.width = '4px'
        indicatorRef.current.style.marginLeft = '-2px'
        indicatorRef.current.style.boxShadow = '0 0 8px rgba(255,255,255,0.6)'
        indicatorRef.current.style.transform = 'scaleY(1)'
      }
      setSubPhase('aiming')
    } else {
      // Reload/Dodge: skip aim, advance to reveal
      setAimResult(null)
      advanceToReveal(action)
    }
  }

  function lockShot() {
    // critFreezeRef in the guard too: it flips synchronously below, so a
    // double-tap in the same frame can't run the lock twice while the
    // critFreeze state commit is still pending.
    if (subPhase !== 'aiming' || critFreeze || critFreezeRef.current) return
    // Hardened Lock (raid-8 affliction): the first tap only CRACKS the
    // plating — no freeze, no judgment, the bar keeps sweeping — and the
    // second tap lands the real lock. Deliberately BEFORE the freeze flip so
    // the WYSIWYG protocol is untouched for the tap that actually judges.
    if (hardenedArmedRef.current) {
      hardenedArmedRef.current = false
      setHardenedArmed(false)
      vibrate([0, 12, 26, 8])
      flashBar(barFlashRef.current, '#9fb2c8', 0.55)
      if (!onDial) snapIndicator(indicatorRef.current)
      return
    }
    // Freeze the RAF synchronously. The critFreezeRef mirror effect only
    // commits after this render, which let the tick run 1–2 more frames and
    // drift the painted needle past the spot being judged.
    critFreezeRef.current = true
    // AND THE COMPOSITOR STOPS TOO. Freezing the RAF stops the maths, but the
    // sweep is not being drawn by the RAF any more — pausing the animation is
    // what actually stops the needle on the glass, and without it the frozen
    // badge would sit beside a needle that had sailed on past the spot it is
    // describing. Paused rather than cancelled: the picture has to HOLD.
    needleAnimRef.current?.pause()
    // The lock ITSELF gets a tick, synchronous with the freeze — the single
    // most important input in combat should be felt the instant it lands,
    // distinct from the bigger result haptics that follow the judgment.
    vibrate(6)
    // False Colors: locked onto a drifting decoy → the shot's a dud. Flag the
    // fumble (resolveTurn turns the player's turn into chip damage + no shot),
    // flash the bar red, and skip the normal aim judgment entirely.
    if (decoyRunRef.current.some(d => Math.abs(firePosRef.current - d.pos) <= DECOY_HALF)) {
      decoyFumbleRef.current = true
      // A locked shot, even a dud — counts as firing, and it's not a crit.
      shotsThisFightRef.current++
      // Contract facts: a fired shot (dud → never a crit). Counted at the fire
      // point, not the damage site, so a miss/graze still counts the shot.
      { const cf = contractFactsRef.current; cf.shots++; if (playerAction === 'volley') cf.volleys++; else if (playerAction === 'mega') cf.megas++ }
      onShotResolved?.(false)
      if (indicatorRef.current) {
        paintNeedle(indicatorRef.current, firePosRef.current)
        paintNeedleColor(indicatorRef.current, '#ef4444')
      }
      setAimResult('miss')
      setCritFreeze(true)
      if (!onDial) snapIndicator(indicatorRef.current)
      flashBar(barFlashRef.current, '#ef4444', 0.5)
      vibrate([0, 50, 40, 70])
      setTimeout(() => { setCritFreeze(false); advanceToReveal(playerAction!, 'miss') }, 360)
      return
    }
    // Tide critZoneScale widens the gold critical band. Sharpshot ability
    // also widens it for the next N shots. Both multiply onto CRIT_W (via
    // liveCritW); a wider zone = same aim, more crits. Sharpshot buff is
    // consumed by the shot landing regardless of result (miss/graze/hit/
    // critical all count).
    const tideCritW = liveCritWRef.current
    lockedCritWRef.current = tideCritW
    // RAW WYSIWYG judgment (see the module note): read both refs exactly
    // as painted this frame, no rewind and no projection. The freeze
    // below repaints needle + zone at this same geometry with the result
    // color, so the frozen picture can never disagree with the badge.
    // READ AT THE TAP, from the clock the compositor is drawing against, so the
    // judgment is where the needle is at the instant of the press rather than
    // where the last frame left it. Falls back to the painted value on the
    // gusting bar, which is still integrated by the RAF.
    const pos = needlePeriodRef.current
      ? needleAt(typeof document.timeline?.currentTime === 'number'
        ? document.timeline.currentTime as number
        : performance.now())
      : firePosRef.current
    firePosRef.current = pos
    const zoneCenter = zonePosRef.current
    // THE BURST GOES OFF AT THE TAP, not after the judgment resolves. The
    // colour is decided a few lines down; this is fired there. What matters
    // here is that the POSITION is the one just read, so the sparks land on the
    // needle rather than wherever it would have drifted to by then.
    // Rolling Plate: the crit judges against the SEAM (zone center + drift
    // offset); hit/graze still judge the zone itself. Offset is 0 on every
    // enemy without critDrift, so this is the old ladder everywhere else.
    const seamCenter = zoneCenter + ((enemy.critDrift ?? 0) > 0 ? critSeamOffsetRef.current : 0)
    let res: ShotResult =
      pos >= seamCenter - tideCritW && pos <= seamCenter + tideCritW ? 'critical'
      : pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W ? 'hit'
      : pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W ? 'graze'
      : 'miss'
    // Repaint the frozen needle + zone at the judged geometry and color
    // the needle by the judged result — the freeze IS the judgment, so
    // the picture the player studies always matches the badge.
    if (indicatorRef.current) {
      paintNeedle(indicatorRef.current, pos)
      paintNeedleColor(indicatorRef.current,
        res === 'critical' ? '#fbbf24' :
        res === 'hit'      ? '#4ade80' :
        res === 'graze'    ? '#94a3b8' :
                             'rgba(255,255,255,0.4)')
    }
    if (onDial || zoneRef.current) {
      paintZone(zoneRef.current, zoneCenter)
    }

    // Consume one Sharpshot buff "shot left" regardless of outcome.
    if (sharpshotBuff) {
      const remaining = sharpshotBuff.shotsLeft - 1
      setSharpshotBuff(remaining > 0 ? { multiplier: sharpshotBuff.multiplier, shotsLeft: remaining } : null)
    }
    // Keen Cutlass + tide critChanceBonus + Crow's-Nest Rigging (item): a clean
    // hit has a flat chance to upgrade to a crit. All stack ADDITIVELY. The item
    // read drops any repossessed piece so the Quartermaster's theft still bites.
    const critUpgradeItem = getActiveEffects(equippedRaidItems.filter(id => id !== repossessedItemRef.current))
      .filter(e => e.type === 'crit_upgrade_chance').reduce((a, e) => a + e.value, 0)
    const critUpgradeChance = (mods.critPct / 100) + tide.critBonus + critUpgradeItem
    if (res === 'hit' && critUpgradeChance > 0 && Math.random() < critUpgradeChance) res = 'critical'
    // Loaded for Bear (boon): every Nth landed shot is a guaranteed crit. Counts
    // all resolved shots this fight; a whiff on the Nth just doesn't upgrade.
    if (res === 'hit' && tide.guaranteedCritEvery > 0 && (shotsThisFightRef.current + 1) % tide.guaranteedCritEvery === 0) res = 'critical'
    // Telemetry: a locked shot (post crit-upgrade). "Dead Reckoning" wants every
    // shot to be a crit; "Not a Shot Fired" wants zero shots taken all fight.
    shotsThisFightRef.current++
    // Contract facts: every fired shot + its weapon + whether it crit. Counted
    // here (the fire point), so a miss/graze counts toward shots but not crits —
    // Dead-Eye needs a miss to fail it, weapon-only jobs need every shot seen.
    { const cf = contractFactsRef.current; cf.shots++; if (playerAction === 'volley') cf.volleys++; else if (playerAction === 'mega') cf.megas++; if (res === 'critical') cf.crits++ }
    onShotResolved?.(res === 'critical')
    setAimResult(res)
    // On the dial the bar's snap/fatten pokes are off (they clobber the needle's
    // rotation), so a lock would land with NO feedback at all. Hand it to
    // DialSVG instead: snap on EVERY lock so the tap always answers, plus the
    // full burst on a crit, which is the reel-in perfect the player knows.
    if (onDial) {
      setDialSnapKey(k => k + 1)
      if (res === 'critical') setDialBurstKey(k => k + 1)
    }
    setCritFreeze(true)  // freezes the aim bar at the lock position regardless of result

    // Punch the lock moment so it FEELS like a connection.
    // - Snap the indicator vertically (scaleY 2.8 → 1 with springy ease)
    // - Flash the whole bar background in the result color
    const flashColor =
      res === 'critical' ? '#fbbf24' :
      res === 'hit'      ? '#4ade80' :
      res === 'graze'    ? '#94a3b8' :
                           '#6b7280'
    if (!onDial) snapIndicator(indicatorRef.current)
    flashBar(barFlashRef.current, flashColor, res === 'critical' ? 0.7 : res === 'hit' ? 0.55 : 0.35)
    // AND THE SPARKS, in the result's colour, at the judged spot. Fired here
    // because this is where `res` exists — a crit should look like a crit
    // before the number has finished arriving, and a miss should be visibly a
    // miss rather than an absence of celebration.
    if (!onDial) aimFxRef.current?.burst(pos, res)

    // Indicator glow boost for hit/crit. Re-center the WIDENED needle on the
    // judged pos: it's anchored by `left` for a 4px needle (pos% − 2px), so
    // just growing `width` would balloon it to the RIGHT and shift its visual
    // center ~(w−4)/2 px right of the real hit point — which read as the crit
    // zone being offset right of the gold band. Offset left by half the new
    // width so the fat needle stays centered on `pos`.
    if (indicatorRef.current && !onDial && (res === 'hit' || res === 'critical')) {
      const w = res === 'critical' ? 10 : 7
      const glow = res === 'critical' ? '#fbbf24' : '#4ade80'
      indicatorRef.current.style.width = `${w}px`
      // Half its own width back, so a fattened needle stays centred on the
      // position instead of growing to the right of it.
      indicatorRef.current.style.marginLeft = `${-w / 2}px`
      // On the bar the fattened needle has to be nudged left by half its new
      // width to stay centered on `pos`. On the dial it rotates about its own
      // pivot, so the rotation alone still points at the judged bearing.
      // One place decides where a needle sits, on the bar as on the dial:
      // paintNeedle already centres it on `pos` using the width just set.
      paintNeedle(indicatorRef.current, pos)
      indicatorRef.current.style.boxShadow = `0 0 18px ${glow}, 0 0 36px ${glow}, 0 0 60px ${glow}66`
    }

    // LOCK MOMENT = aim quality feedback only.
    // No cannon shot, no damage splat — those fire together at resolution time
    // so cannon-fire and impact read as one tight beat. The cancel-on-kill
    // mechanic (faster ship's killing blow cancels the slower's shot) stays
    // intact.
    //
    // Feedback that matches a fishing-perfect / current-raid-crit:
    //   - aim bar freezes with the locked indicator pulsing
    //   - center-screen aim-result badge ("CRITICAL!", "HIT!", etc.)
    //   - on crit: full-screen gold flash + haptic burst
    //   - on hit: short haptic
    const dur =
      res === 'critical' ? 720 :
      res === 'hit'      ? 460 :
      res === 'graze'    ? 320 :
                           220

    if (res === 'critical') {
      setCritFlash(true)
      setTimeout(() => setCritFlash(false), 380)
      vibrate([40, 60, 80])
    } else if (res === 'hit') {
      vibrate([30])
    }

    setTimeout(() => { setCritFreeze(false); advanceToReveal(playerAction!, res) }, dur)
  }

  function advanceToReveal(pAction: EnemyAction, res: ShotResult | null = null) {
    // pickEnemyAction advances enemyPatternIdxRef only when it actually spends
    // the slotted move. Snapshot before/after so the foreseen-move consume
    // (in the [turn] effect) can tell a real move from a stalled retry.
    const idxBefore = enemyPatternIdxRef.current
    const eAction = pickEnemyAction()
    enemyAdvancedThisTurnRef.current = enemyPatternIdxRef.current !== idxBefore
    setEnemyAction(eAction)

    // Speed roll for turn order. Navigator's Compass adds a fraction of
    // Navigation on top (the turn-order roll only).
    const compassNavPct = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'speed_roll_nav_pct')
      .reduce((a, e) => a + e.value, 0)
    // Tide speedDelta + the Slowed status fold straight into the player's
    // effective ship speed for the turn-order roll. Floored at 1 so a drop
    // can't make the player un-act-able. (Statuses read from the refs — this
    // runs at action-pick time, outside resolveTurn's snapshot.)
    const tideAdjustedSpeed = Math.max(1, shipSpeed + tide.speedDelta + statusMods(playerStatusesRef.current).speedDelta)
    const pSpeedRoll = rollInitiative(tideAdjustedSpeed) + Math.floor(totalNavigation * compassNavPct)
    // Fleet affix on the enemy: flat bonus to its speed roll. Not a
    // guarantee like before — just much better odds of going first.
    // Slowed on the enemy drags its roll the same way.
    const eSpeedRoll = rollInitiative(Math.max(1, enemy.shipSpeed + statusMods(enemyStatusesRef.current).speedDelta)) + (affix?.speedBonus ?? 0)
    // First Strike crew effect always wins (player effect overrides any enemy
    // speed bonus, no matter how high). Failing that, the Weather Gauge
    // confluence gets a flat chance to seize the opening outright, over and
    // above the Initiative roll.
    const seizedOpening = !mods.firstStrike && tide.firstStrikeChance > 0 && Math.random() < tide.firstStrikeChance
    const first: Actor = (mods.firstStrike || seizedOpening)
      ? 'player'
      : (pSpeedRoll >= eSpeedRoll ? 'player' : 'enemy')
    setFirstActor(first)
    setSubPhase('revealing')

    // Fire the speed-roll feedback so the 380ms resolution beat reads
    // as drama, not dead air. The matching nameplate flashes its border
    // (cyan for player win, red for enemy) and briefly lunges toward
    // the other side, mirroring the existing hit-feedback vocabulary.
    setNameplateFx({ kind: 'speed-win', actor: first })
    setNameplateFxKey(k => k + 1)

    // Short beat to register both actions visually, then resolve
    setTimeout(() => {
      resolveTurn(pAction, eAction, first, pSpeedRoll, eSpeedRoll, res)
    }, 380)
  }

  function resolveTurn(pAction: EnemyAction, eAction: EnemyAction, first: Actor, pSpeedRoll: number, eSpeedRoll: number, lockedAimResult: ShotResult | null) {
    setSubPhase('resolving')
    // Defensive-buff consumption is tracked on refs during the synchronous
    // build, then committed to state once (after) so the hull glints clear.
    let anchorConsumed = false
    let shieldChanged = false
    let eShieldChanged = false
    // Speed-roll line shows immediately. Per-step lines are appended as each
    // step starts animating (see playStep) so the log feels alive instead of
    // dumping the whole turn at once.
    // Speed roll determines turn order regardless of chosen action — keep
    // the line action-agnostic ("act first" not "fire first") since a faster
    // ship might reload or dodge first.
    // Drowned Whispers: if the player's order was scrambled this turn, lead the
    // log with what happened so the wrong action never looks like a misfire.
    const confused = confusionRef.current
    confusionRef.current = null
    setResolveLog([
      ...(confused ? [`Drowned Whispers! You called for ${ACTION_NOUN[confused.from]}, but your crew ${ACTION_PAST[confused.to]} instead.`] : []),
      first === 'player'
        ? `You're faster — you act first.`
        : `Enemy is faster — they act first.`,
    ])

    const order: Actor[] = first === 'player' ? ['player', 'enemy'] : ['enemy', 'player']

    // Counter-Battery (boon): you and the enemy both loose a shot this beat and
    // your aim landed (not a whiff, not a decoy dud) — roll to smash their shot
    // out of the air. Rolled once here; consumed when the enemy's attack step
    // comes up in the order loop, which skips it (even if the enemy is faster,
    // so a high-tier proc can eat a lethal blow). Order-independent by design.
    const playerFiresThisTurn = pAction === 'fire' || pAction === 'volley' || pAction === 'mega'
    const enemyFiresThisTurn  = eAction === 'fire' || eAction === 'volley'
    const playerShotLands = lockedAimResult != null && lockedAimResult !== 'miss' && !decoyFumbleRef.current
    // Broadside Duel confluence adds its chance bonus additively on top of the
    // Counter-Battery boon (the base counterFireChance is max-aggregated, so the
    // bonus needs its own lane).
    let counterEnemyShot = tide.counterFireChance > 0
      && playerFiresThisTurn && enemyFiresThisTurn && playerShotLands
      && Math.random() < (tide.counterFireChance + tide.counterBonusChance)
    // Stable snapshot of "a counter procs this turn" — the skip below consumes
    // `counterEnemyShot`, but the player-shot calc (Broadside Duel's bonus
    // Cannonade stack) reads this whether the player fires before or after the
    // enemy in the order.
    const counterProc = counterEnemyShot

    // Pre-compute the full sequence of state snapshots so we can animate them in order
    type Step = {
      who: Actor
      action: EnemyAction
      pHp: number; eHp: number
      pCharges: number; eCharges: number
      splatTarget: Actor | null  // which side gets the hitsplat
      splatText: string
      splatColor: string
      big?: boolean
      logLines: string[]         // log lines to reveal when this step starts
      // True when this step is the one that pushed the boss across its
      // phase-2 HP threshold. Triggers a red full-screen flash so the
      // transition reads as a beat, not a silent shift in pattern.
      phaseTransition?: boolean
      // The phase being ENTERED (2, 3, 4…) + an optional custom callout label
      // ('RESERVE DECK'); drive the nameplate badge + center-screen callout.
      phaseNumber?: number
      phaseBadge?: string
      // The mechanic check that arms as this phase begins (armed when the
      // transition step plays), if the phase carries one.
      phaseCheck?: BossMechanicCheck
      // The Last Wall: raised as this transition step plays (visual only —
      // the sim ref armed back in resolveTurn when the revive resolved).
      phaseAegis?: { name: string }
      // The wall came down on this step — 'shatter' (Mega) or 'collapse'
      // (battered down the slow way). Clears the visual at play time.
      aegisDown?: 'shatter' | 'collapse'
      // Set when this hit lit an Incendiary / froze a Frozen cannonball, so the
      // enemy hull flares with the matching status aura the instant it lands.
      procStatus?: 'burn' | 'freeze' | 'stun'
      /** An enemy special that CALLS ON something, played back through the
       *  same splash the player crew abilities use. */
      summon?: { name: string; label: string; color: string; image: string }
      /** A flurry, broken into its individual hits so playback can stagger
       *  them. One lump number does not read as "four fast hits". */
      blitzHits?: number[]
      /** A single heavy ability strike (his Primeval Maw). Plays the enemy
       *  cannon + a crit impact, so an ability that hits for 149 does not
       *  land in silence with only the summon splash to show for it. */
      heavyStrike?: boolean
      /** Press-Gang ripped a loaded shot off the enemy onto your rack. */
      stoleCharge?: boolean
      /** Cutlass Guard turned an incoming blow aside (0 damage taken). */
      parriedHit?: boolean
      // Burn turns remaining AFTER this tick (drives the persistent ember glow).
      burnTurnsLeft?: number
      // This step is the frozen-skip — the ice breaks after it (clears the tint).
      freezeEnds?: boolean
      // Astrolabe riposte: damage reflected into the enemy on a dodge.
      reflectDmg?: number
      // Riposte affix: damage the enemy reflected into the PLAYER on its dodge.
      riposteDmg?: number
      // Vampiric affix: HP the enemy drank back off the hit it landed.
      enemyHeal?: number
      // Leviathan's Hunger (boon): HP you drank back off the hit you landed.
      lifestealHeal?: number
      // Krust's Carapace soaked this (non-volley) hit — drives a deflect cue.
      carapaceSoak?: boolean
      // Thermal Shock confluence: the shatter burst dealt on top of this hit —
      // drives the ice+fire detonation FX + its own splat.
      thermalShock?: number
      // Counter-Battery (boon): this step is the negated enemy shot — fires the
      // center "COUNTER-BATTERY" flash + a clash spark on the enemy.
      countered?: boolean
      // Executioner / Coup de Grâce: this hit SANK the hull outright — fires the
      // gold finishing-blow flash. 'coup' is the crit-execute (grander line).
      executed?: 'execute' | 'coup'
      // Reaper's Tithe: HP tithed back to you for the kill — a gold heal splat.
      titheHeal?: number
      // Rattling Shot / Chainshot / the rack landed a debuff — fires an enemy
      // status flare so a control build reads its hex/snare landing.
      debuffApplied?: 'snared' | 'marked'
      // Cannonade (boon): the crit streak AFTER this landed player shot (0 = the
      // chain just broke). Drives the persistent heat rim + streak badge.
      cannonade?: number
      // Shield-pool snapshots AT this step (player absorb buffer + enemy
      // barrier). Synced to the display alongside HP during playback so the
      // bars deplete in lockstep with the animation, not the instant the turn
      // resolves (which spoiled the incoming hit before it landed).
      pShield?: number
      eShield?: number
    }

    // Hull plating: equipped damage-reduction items cut INCOMING enemy
    // damage only (raids + skirmishes). Never touches rollShotDamage —
    // the player's outgoing formula is duplicated across files and must
    // not drift. Applied per hit below, floored, min 1 so a shot stings.
    const incomingDmgMult = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'incoming_damage_mult')
      .reduce((a, e) => a * e.value, 1)

    let pHp = playerHpRef.current
    let eHp = enemyHpRef.current
    let pCharges = playerCharges
    let eCharges = enemyCharges
    const steps: Step[] = []

    // Statuses (Ch4 pipeline) — aggregate each side's timed buffs/debuffs once
    // for this round. Read from the refs so mid-resolution appliers (future
    // enemy specials) land next round, not half-way through this one.
    const pStatus = statusMods(playerStatusesRef.current)
    const eStatus = statusMods(enemyStatusesRef.current)

    // Enemy barrier (Warded affix / The Warding curse): route DIRECT player
    // damage through the enemy's shield pool before its hull. Burn/DoT ticks
    // bypass it (they hit eHp directly). The Railgun's piercing Mega passes
    // `pierce` and ignores it. Returns the damage that reached the hull.
    // Corrode (status): the shield takes AMPLIFIED damage — the pool loses
    // more than the hit carried, so the same shot strips plating faster
    // (the hull never takes more than the hit; corrode only eats shield).
    const soakEnemyShield = (amount: number, pierce = false, pierceFrac = 0): number => {
      // The Last Wall (aegis) drinks EVERYTHING that isn't a Mega — reflects,
      // thorns, spite, thermal bursts. The main attack path zeroes dmg and
      // chips the wall before calling this; stray damage sources die here.
      if (aegisRef.current) return 0
      if (amount <= 0 || pierce || enemyShieldRef.current <= 0) return amount
      // Armor-Piercing (boon): a fraction of the shot skips the barrier and hits
      // the hull directly; only the remainder is ever offered to the shield.
      const bypass = pierceFrac > 0 ? Math.round(amount * Math.min(1, pierceFrac)) : 0
      const soakable = amount - bypass
      const mult = eStatus.shieldDmgTakenMult
      const bite = Math.round(soakable * mult)         // what the shield stands to lose
      const absorbed = Math.min(enemyShieldRef.current, bite)
      enemyShieldRef.current -= absorbed
      eShieldChanged = true
      // The raw damage the soak consumed (amplified soak eats the shield faster
      // per point of hit); the remainder of the RAW hit + the bypass reach the hull.
      const rawConsumed = Math.ceil(absorbed / mult)
      return Math.max(0, soakable - rawConsumed) + bypass
    }
    // Snapshot both shield pools onto every step as it's pushed, so the display
    // can deplete them in lockstep with the animation (see syncPHp/syncEHp)
    // instead of the whole turn's soak landing the instant it resolves.
    const pushStep = (s: Step) => { steps.push({ ...s, pShield: abyssalShieldRef.current, eShield: enemyShieldRef.current }) }
    /**
     * THE FINISHING CHECK, and the only copy of it.
     *
     * Executioner promises "the instant ANY hit drops an enemy to 5% of its
     * health or lower", and Reaper's Tithe promises "every enemy you sink heals
     * you". Both used to be written inline in the player's own attack path, so
     * neither fired for the nine OTHER ways an enemy loses HP: burn ticks,
     * thorns, both parries, the Aegis, Kraken's crush, the counter-shot and a
     * Thermal Shock burst. A build could reflect a hull down to 3% and still owe
     * it a shot, which is exactly backwards for a boon whose whole promise is
     * not having to chip out the last sliver.
     *
     * Every route that lowers enemy HP calls this straight afterwards. It takes
     * and returns the two locals it can move, so a caller cannot apply damage
     * and silently skip the consequence.
     *
     * `crit` is passed only by the attack path, because Coup de Grâce is
     * crit-gated by design and a crit does not exist anywhere else. The base
     * execute is tested FIRST so a crit landing under both marks still reads as
     * the plain Executioner it always has, rather than being relabelled.
     */
    const finishCheck = (
      hp: number, php: number, lines: string[], crit = false,
    ): { eHp: number; pHp: number; executed?: 'execute' | 'coup'; tithed: number } => {
      let executed: 'execute' | 'coup' | undefined
      // Both marks route the kill through wardFloor rather than zeroing eHp.
      // Setting it to 0 directly walked straight through a boss's "cannot be
      // killed for N turns" ward: chip damage could never reach the 0 that
      // triggers the save, so the ward was dead weight against any Executioner.
      if (hp > 0 && tide.executeThreshold > 0 && hp <= Math.ceil(enemyHpMaxRef.current * tide.executeThreshold)) {
        hp = wardFloor(0)
        if (hp === 0) { executed = 'execute'; lines.push(`Executioner! The ${enemy.name} drops past saving and is dragged under.`) }
      }
      if (!executed && crit && hp > 0 && tide.critExecutePct > 0 && hp <= Math.ceil(enemyHpMaxRef.current * tide.critExecutePct)) {
        hp = wardFloor(0)
        if (hp === 0) { executed = 'coup'; lines.push(`Coup de Grâce! The crit finds the killing mark and the ${enemy.name} is gone.`) }
      }
      // Reaper's Tithe pays for the hull being SUNK, however it went down, so it
      // reads hp === 0 rather than asking whether an execute is what did it.
      // Skips a phase-1 boss "kill" that is about to revive: it is not really
      // sunk yet, and the real phase-2 death pays out instead.
      let tithed = 0
      if (hp === 0 && tide.executeHealPct > 0 && php > 0 && !(enemyPhaseRef.current <= phaseList.length)) {
        const heal = Math.min(
          playerHpMax - php,
          Math.round(enemyHpMaxRef.current * tide.executeHealPct),
          Math.round(playerHpMax * REAPER_HEAL_CAP_PCT),
        )
        if (heal > 0) { php += heal; tithed = heal; lines.push(`Reaper's Tithe! The deep tithes you ${heal} HP for the kill.`) }
      }
      return { eHp: hp, pHp: php, executed, tithed }
    }
    // Barrier Regrowth curse: the enemy barrier reknits a slice of its full value
    // at the top of each round, BEFORE the player's shot lands — so a slow chip
    // never breaks through and the hull only takes damage once you burst the wall
    // open in one turn. Only the ref is bumped here; the next pushStep's eShield
    // snapshot carries it to the bar. Inert when the enemy has no barrier.
    if (tide.barrierRegrow > 0 && enemyShieldMax > 0 && eHp > 0 && enemyShieldRef.current < enemyShieldMax) {
      enemyShieldRef.current = Math.min(enemyShieldMax, enemyShieldRef.current + Math.round(enemyShieldMax * tide.barrierRegrow))
    }
    // HP appliers that ALSO settle the matching shield bar to this step's
    // snapshot. Used everywhere a step's HP is committed during playback.
    const syncPHp = (step: Step) => {
      setPlayerHp(step.pHp)
      if (step.pShield != null) {
        // Every on-screen application of player damage funnels through here, so
        // it's the one place that reliably sees the shield DROP — fire the soak
        // flare whenever it does, whatever soaked it.
        if (playedShieldRef.current != null && step.pShield < playedShieldRef.current) {
          setShieldSoakFx({ key: Date.now() + Math.random() })
        }
        playedShieldRef.current = step.pShield
        setAbyssalShieldHp(step.pShield)
      }
    }
    const syncEHp = (step: Step) => { setEnemyHp(step.eHp); if (step.eShield != null) setEnemyShieldHp(step.eShield) }
    // ── Player shield soak, one place ────────────────────────────────────────
    // Drain the player shield pool (Stormward boon / Abyssal Tide) BEFORE damage
    // reaches HP, and return what's left. Every source of incoming player damage
    // routes through here so the buffer behaves consistently — a normal hit, a
    // riposte/parry counter, a reflected slice, and a Frenzied bonus shot are all
    // soaked the same way instead of some slipping straight past it. Each step's
    // pushStep snapshots the ref, so the shield segment of the HP bar tracks it.
    const soakPlayerShield = (amount: number, lines: string[]): number => {
      if (abyssalShieldRef.current > 0 && amount > 0) {
        const soaked = Math.min(abyssalShieldRef.current, amount)
        abyssalShieldRef.current -= soaked
        onStat?.({ dmgAbsorbed: soaked })
        lines.push(abyssalShieldRef.current > 0 ? `Your shield soaks ${soaked}.` : `Your shield soaks ${soaked} and shatters.`)
        return amount - soaked
      }
      return amount
    }

    // Promote any freeze armed LAST round into the active skip for THIS round.
    // A freeze procced during this round only set the pending flag, so it can't
    // affect the round it landed on — it always skips the actor's next turn.
    if (enemyFreezePendingRef.current > 0) { enemyFrozenRef.current = Math.max(enemyFrozenRef.current, enemyFreezePendingRef.current); enemyFreezePendingRef.current = 0 }
    if (playerFreezePendingRef.current) { playerFrozenRef.current = true; playerFreezePendingRef.current = false }
    // Round-scoped freeze flags. The per-actor ref above gets CONSUMED when that
    // actor's turn is skipped, which (with a faster opponent) happens before the
    // other side fires — so we snapshot "frozen this round" here and use it to
    // also suppress the frozen side's DODGE (reactive, resolved on the attacker's
    // shot). A frozen ship can't weave aside no matter the turn order.
    const enemyFrozenThisRound  = enemyFrozenRef.current > 0
    const playerFrozenThisRound = playerFrozenRef.current

    // Incendiary burn ticks at the top of the turn. It reads the burn set on a
    // PRIOR turn (a burn lit this turn ticks next turn, not now), and a tick
    // that drops the enemy to 0 ends the fight via the final-step death check.
    // While The Last Wall stands, fire can't reach the hull either — the tick
    // is held (turns don't burn down) so the DoT resumes once the wall falls.
    if (enemyBurnRef.current.turns > 0 && eHp > 0 && !aegisRef.current) {
      const tick = enemyBurnRef.current.dmg
      // Wildfire "Backdraft": while it burns, the flames can flare on any tick for
      // a bonus burst. Sustained burning (Reignite) = more flares — the two feed
      // each other instead of canceling out (an expiry burst never fired while
      // Reignite kept refreshing the duration).
      const flare = tide.backdraft && Math.random() < BACKDRAFT_FLARE_CHANCE ? Math.round(tick * BACKDRAFT_FLARE_MULT) : 0
      const total = tick + flare
      eHp = wardFloor(eHp - total)
      enemyBurnRef.current = { turns: enemyBurnRef.current.turns - 1, dmg: enemyBurnRef.current.dmg }
      // Feed the Fire confluence: the burn ticks also heal you a slice of itself.
      // Same per-tick MAX-HP cap as lifesteal — burn heal scales off damage the
      // same way, so a Wildfire+Leviathan's build can't over-sustain via DoT.
      let feedHeal = 0
      if (tide.burnTickHealPct > 0 && pHp > 0) {
        feedHeal = Math.min(Math.round(lifestealHealCap(playerHpMax, tide.burnTickHealPct)), healCap - pHp, Math.round(total * tide.burnTickHealPct))
        if (feedHeal > 0) { pHp += feedHeal; onStat?.({ dmgHealed: feedHeal }) }
      }
      // The tick gets the same finishing check a shot does, so fire can carry a
      // hull past the mark on its own instead of leaving it there for you.
      const burnLines: string[] = [`${flare > 0 ? `The ${enemy.name} burns for ${tick}, then the flames backdraft for ${flare} more.` : `The ${enemy.name} is ablaze, burning for ${tick}.`}${feedHeal > 0 ? ` The fire feeds you ${feedHeal}.` : ''}`]
      const burnFin = finishCheck(eHp, pHp, burnLines)
      eHp = burnFin.eHp; pHp = burnFin.pHp
      pushStep({ who: 'player', action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'enemy', splatText: `-${total}`, splatColor: BURN_COLOR, logLines: burnLines, burnTurnsLeft: enemyBurnRef.current.turns, lifestealHeal: feedHeal || undefined, executed: burnFin.executed, titheHeal: burnFin.tithed || undefined })
    }

    // The vengeance ward's fuse burns at the same boundary the burn decays at, so
    // "a turn" means exactly what it already means everywhere else on this screen.
    // Ticked BEFORE the round resolves, so a ward armed with 1 turn left still
    // catches a death that lands this round, and only then gutters out.
    if (vengeanceWardRef.current && vengeanceWardTurnsRef.current > 0) {
      const left = vengeanceWardTurnsRef.current - 1
      if (left <= 0) {
        vengeanceWardRef.current = false
        setWardTurns(0)
        pushStep({ who: 'enemy', action: 'reload', pHp, eHp, pCharges, eCharges,
          splatTarget: null, splatText: '', splatColor: '#d1495b',
          logLines: ['The vengeance ward gutters out. Whatever Laz was waiting for, it never came.'] })
      } else {
        setWardTurns(left)
      }
    }

    // Scorching burn (elite affix) ticks the PLAYER's hull at the top of the turn
    // — the mirror of the enemy burn above. A tick that drops you to 0 ends the
    // fight via the final death check (anchor save still applies).
    if (playerBurnRef.current.turns > 0 && pHp > 0) {
      const tick = playerBurnRef.current.dmg
      onStat?.({ dmgTaken: tick })
      pHp = Math.max(0, pHp - tick)
      playerBurnRef.current = { turns: playerBurnRef.current.turns - 1, dmg: playerBurnRef.current.dmg }
      pushStep({ who: 'enemy', action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'player', splatText: `-${tick}`, splatColor: BURN_COLOR, logLines: [`Your ship is ablaze, burning for ${tick}.`], burnTurnsLeft: playerBurnRef.current.turns })
    }

    // The enemy's move is locked in at reveal time, when it still had the
    // cannonballs to pay for it. A crit strip (The Don's Signet / The Court's
    // Fang) or a Press-Gang steal can empty its rack in the SAME round, before
    // it acts — so the committed move has to be re-priced when its turn comes
    // up rather than fired off an empty deck.
    let eActionNow = eAction
    for (const who of order) {
      if (pHp <= 0 || eHp <= 0) break
      // ── HIS LASTING EFFECTS LAPSE HERE, at the very top of his turn and
      // ABOVE every early-return below (frozen, countered). Their durations are
      // counted in HIS turns, and a turn he loses to ice is still a turn: with
      // the tick further down, freezing him skipped the decrement and EXTENDED
      // his evasion and his death ward, so a freeze was quietly a reward FOR HIM.
      if (who === 'enemy') {
        if (bossForesightRef.current > 0) bossForesightRef.current--
        setForeseeUp(bossForesightRef.current > 0)
        if (bossWardRef.current > 0) bossWardRef.current--
        setWardUp(bossWardRef.current > 0)
      }
      // ── HIS CREW ABILITY. Fires BEFORE his action and does not replace it,
      // which is the whole point: a player fires an ability and still takes
      // their shot, and now so does he. Cadence is per phase.
      if (who === 'enemy' && !enemyFrozenRef.current) {
        const ab = enemyPhaseRef.current >= 2
          ? phaseList[enemyPhaseRef.current - 2]?.ability
          : enemy.phaseAbility
        if (ab) {
          const bossPhaseDmgMult = enemyPhaseRef.current >= 2 && phaseList[enemyPhaseRef.current - 2]
            ? phaseList[enemyPhaseRef.current - 2].damageMult : 1
          bossAbilityTurnRef.current++
          // ONCE PER PHASE, exactly like the player gets one use of a crew
          // ability per fight. The turn is rolled from 2..4 the first time the
          // phase ticks, so it never lands on turn 1 (the phase-change callout
          // would collide with it) and is never quite predictable.
          if (!bossAbilityOnRef.current) bossAbilityOnRef.current = 2 + Math.floor(Math.random() * 3)
          if (!bossAbilityUsedRef.current && bossAbilityTurnRef.current >= bossAbilityOnRef.current) {
            bossAbilityUsedRef.current = true
            const lines: string[] = []
            let aSplatTarget: Actor | null = null
            let aSplatText = ''
            let blitzOut: number[] | undefined
            let heavyOut = false
            const aColor = ab.summonColor ?? '#c084fc'
            if (ab.kind === 'leviathan') {
              // DOBY: one heavy shot that always lands a full crit.
              const dmg = Math.max(1, Math.round(enemy.maxDmg * 1.5 * (ab.value ?? 1) * bossPhaseDmgMult))
              // Through the shield pool like every other source of incoming
              // damage. Bypassing it meant the player's own Stormward / Tidecaller
              // buffer did nothing against his two biggest abilities.
              const dmgLeft = soakPlayerShield(dmg, lines)
              heavyOut = true
              onStat?.({ dmgTaken: dmgLeft })
              pHp = Math.max(0, pHp - dmgLeft)
              aSplatTarget = 'player'; aSplatText = `-${dmg}`
              lines.push(`${ab.name}: guaranteed crit, ${dmg} damage.`)
            } else if (ab.kind === 'blitz') {
              // MAKO: a barrage that bites harder the more wounded you are.
              const shots = ab.shots ?? 4
              // Frenzy reads your CURRENT hull, before the flurry lands, so the
              // whole volley is priced at the health you brought into it.
              const frenzy = 1 + (1 - pHp / Math.max(1, playerHpMax)) * (ab.value ?? 0.3)
              const per: number[] = []
              let total = 0
              for (let k = 0; k < shots; k++) {
                const one = Math.max(1, Math.round(enemy.minDmg * 0.42 * frenzy * bossPhaseDmgMult))
                per.push(one)
                total += one
              }
              const blitzLeft = soakPlayerShield(total, lines)
              onStat?.({ dmgTaken: blitzLeft })
              pHp = Math.max(0, pHp - blitzLeft)
              aSplatTarget = 'player'; aSplatText = `-${total}`
              blitzOut = per
              lines.push(`${ab.name}: ${shots} fast hits, ${total} damage.`)
            } else if (ab.kind === 'abyssal_tide') {
              // CATFISH: he heals and puts plate up.
              const heal = Math.max(1, Math.round(enemyHpMaxRef.current * (ab.value ?? 0.14)))
              eHp = Math.min(enemyHpMaxRef.current, eHp + heal)
              const shield = Math.max(1, Math.round(enemyHpMaxRef.current * (ab.shieldValue ?? 0.08)))
              enemyShieldRef.current += shield
              setEnemyShieldHp(enemyShieldRef.current)
              aSplatTarget = 'enemy'; aSplatText = `+${heal}`
              lines.push(`${ab.name}: heals ${heal}, gains ${shield} shield.`)
            } else if (ab.kind === 'foresight') {
              // DOLE: he reads you, and slips what is coming.
              bossForesightRef.current = ab.turns ?? 2
              setForeseeUp(true)
              lines.push(`${ab.name}: he dodges everything you fire for ${bossForesightRef.current} turns.`)
            } else if (ab.kind === 'vengeance') {
              // LAZ: he will not die to the next killing blow.
              bossWardRef.current = ab.turns ?? 4
              setWardUp(true)
              lines.push(`${ab.name}: cannot be killed for ${bossWardRef.current} turns.`)
            } else if (ab.kind === 'requiem') {
              // MIRA: marked for death. Uses the REAL `marked` status rather than
              // a private ref, which is what the player's own Requiem applies. That
              // buys the chip on your hull, the tooltip, the aura and the "wears
              // off you" line for free, and it means the mark raises damage from
              // ALL sources the way hers does, not just his own guns.
              const mTurns = ab.turns ?? 3
              const mMag = ab.value ?? 0.3
              applyPlayerStatus('marked', mMag, mTurns)
              aSplatTarget = 'player'; aSplatText = 'Marked'
              lines.push(`${ab.name}: you are marked. +${Math.round(mMag * 100)}% damage taken from everything for ${mTurns} turns.`)
            }
            pushStep({
              who, action: 'reload', pHp, eHp, pCharges, eCharges,
              splatTarget: aSplatTarget, splatText: aSplatText, splatColor: aColor,
              summon: { name: ab.name, label: 'He calls on it', color: aColor, image: ab.summonImage },
              blitzHits: blitzOut,
              heavyStrike: heavyOut,
              logLines: lines,
            })
            if (pHp <= 0 || eHp <= 0) break
          }
        }
      }
      // RE-PRICE THE COMMITTED SHOT. Stripping a round used to change nothing:
      // the enemy fired anyway, dealing full damage off a rack the UI was
      // showing as empty. Degrade exactly the way pickEnemyAction degrades an
      // impossible action — fall back to a reload and hand the pattern slot
      // back, so the shot it was owed is re-attempted next turn with a ball in
      // hand. Never a soft-lock, just lost tempo, which is what the strip is
      // meant to buy.
      let rackStripped = false
      if (who === 'enemy') {
        const cost = eActionNow === 'ultimate' ? enemyMagazine
          : eActionNow === 'volley' ? VOLLEY_COST
          : eActionNow === 'fire' ? 1 : 0
        if (cost > 0 && eCharges < cost) {
          eActionNow = 'reload'
          rackStripped = true
          // An ultimate re-attempts until the clip fills and never advanced the
          // slot, so only rewind what was actually spent — and tell foresight
          // the slotted move never happened, or its countdown burns a turn on a
          // move the enemy never made.
          if (enemyAdvancedThisTurnRef.current) {
            enemyPatternIdxRef.current = Math.max(0, enemyPatternIdxRef.current - 1)
            enemyAdvancedThisTurnRef.current = false
          }
        }
      }
      // Frozen Cannonball: the enemy loses this whole turn (skips before its
      // turn-start heal + action). This is the turn AFTER the proc; one turn,
      // then the ice breaks.
      if (who === 'enemy' && enemyFrozenRef.current > 0) {
        enemyFrozenRef.current -= 1
        const ends = enemyFrozenRef.current === 0
        pushStep({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'enemy', splatText: 'Frozen', splatColor: FREEZE_COLOR, logLines: [ends ? `The ${enemy.name} is frozen solid — its turn is skipped.` : `The ${enemy.name} is locked in deep ice — another turn frozen.`], freezeEnds: ends })
        continue
      }
      // Counter-Battery: you fired into the enemy's shot this beat and smashed
      // it from the air. It still spends the cannonball(s) — the shot simply
      // never lands. Skip its attack step (like a frozen turn); your own fire
      // resolves in its own step. Rendered as a neutral 'reload' so no enemy
      // cannon animation loosens toward you.
      if (who === 'enemy' && counterEnemyShot && !rackStripped) {
        counterEnemyShot = false
        eCharges = Math.max(0, eCharges - (eActionNow === 'volley' ? VOLLEY_COST : 1))
        const cLines = [`Counter-Battery! You fire into the ${enemy.name}'s broadside — its shot is smashed clean out of the air.`]
        // Broadside Duel: you loaded while they didn't.
        if (tide.counterBonusRefund > 0) {
          const before = pCharges
          pCharges = Math.min(playerMaxCharges, pCharges + tide.counterBonusRefund)
          if (pCharges > before) cLines.push(`Broadside Duel — you loaded while they didn't (+${pCharges - before} cannonball${pCharges - before === 1 ? '' : 's'}).`)
        }
        // Return to Sender: fling their would-be shell right back at them.
        let reflectOut = 0
        let counterFin: ReturnType<typeof finishCheck> | null = null
        if (tide.counterReflectPct > 0) {
          const eBase = (Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg) * (eActionNow === 'volley' ? 2 : 1)
          const pm = enemyPhaseRef.current >= 2 && phaseList[enemyPhaseRef.current - 2] ? phaseList[enemyPhaseRef.current - 2].damageMult : 1
          reflectOut = Math.max(1, Math.floor(eBase * pm * tide.counterReflectPct))
          eHp = Math.max(0, eHp - reflectOut)
          cLines.push(`Return to Sender — their own shell, flung back for ${reflectOut}.`)
          counterFin = finishCheck(eHp, pHp, cLines)
          eHp = counterFin.eHp; pHp = counterFin.pHp
        }
        pushStep({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'enemy', splatText: reflectOut > 0 ? `-${reflectOut}` : 'Countered', splatColor: '#7dd3fc', logLines: cLines, countered: true, executed: counterFin?.executed, titheHeal: counterFin?.tithed || undefined })
        continue
      }
      // Glacial (elite affix): the PLAYER is frozen and loses this turn — the
      // mirror of the Frozen Cannonball. Your chosen action is forfeit.
      if (who === 'player' && playerFrozenRef.current) {
        playerFrozenRef.current = false
        pushStep({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'player', splatText: 'Frozen', splatColor: FREEZE_COLOR, logLines: ['Your ship is frozen solid — your turn is skipped.'], freezeEnds: true })
        continue
      }
      const action = who === 'player' ? pAction : eActionNow
      // False Colors fumble — the player locked onto a decoy band. The shot is a
      // dud: no cannon fires, but the loaded charge(s) are spent (you committed to
      // the shot), the player takes chip damage, and the turn is over (the enemy
      // still acts its half of the round). Modeled on the reload branch so nothing
      // is loosed at the enemy.
      if (who === 'player' && decoyFumbleRef.current && (action === 'fire' || action === 'volley' || action === 'mega')) {
        decoyFumbleRef.current = false
        const cost = action === 'mega' ? effMegaCost : action === 'volley' ? effVolleyCost : 1
        pCharges = Math.max(0, pCharges - cost)
        const chip = Math.max(enemy.minDmg, Math.round(playerHpMax * 0.06))
        pHp = Math.max(1, pHp - chip)
        pushStep({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'player', splatText: `-${chip}`, splatColor: '#ef4444', logLines: [`False Colors! You locked onto a phantom. The shot is a dud: the loaded shot is wasted and you take ${chip} chip damage for the mistake.`] })
        continue
      }
      let splatTarget: Actor | null = null
      let splatText = ''
      let splatColor = '#ef4444'
      let enemyCrit = false
      let playerCritShot = false   // this step is a player CRITICAL (for crit_strip_charge items)
      // Oracle's Eye: this shot rolled as a CRITICAL instead, banked while the
      // damage multipliers were in scope and swapped in only if the pierce fires.
      let pierceCritDmg: number | null = null
      let procStatus: 'burn' | 'freeze' | 'stun' | undefined
      let stoleChargeOut = false
      let parriedHitOut = false
      let reflectDmgOut: number | undefined
      let riposteDmgOut: number | undefined
      let enemyHealOut: number | undefined
      let lifestealHealedOut = 0
      let lifestealLabel = ''   // which source drank the wound (boon vs Blood Cannon)
      let overkillHealedOut = 0 // Don's overkill-heal boon, this shot
      let thermalBurstOut = 0    // Thermal Shock confluence: shatter burst this hit
      let executeKind: 'execute' | 'coup' | undefined   // Executioner / Coup de Grâce sank the hull this step
      let titheHealedOut = 0     // Reaper's Tithe: HP tithed back for the kill this step
      let debuffApplied: 'snared' | 'marked' | undefined   // Rattling/Chainshot/the rack landed a debuff this hit
      let shieldAbsorbedOut = 0  // Enemy barrier soak on the player's shot this step
      let carapaceSoaked = false
      let aegisDownOut: 'shatter' | 'collapse' | undefined   // The Last Wall fell this step
      const stepLines: string[] = []
      // Name the strip before the reload line lands, so "it had one round and
      // fired anyway" becomes "you took its last round, so it had to load".
      // Suppressed under Shuttered Ports, which hides the magazine on purpose.
      if (rackStripped && !enemyChargesHidden) {
        stepLines.push(`The ${enemy.name} goes to fire on an empty rack. You took its last cannonball — it has to load instead.`)
      }

      // Snare made good — the enemy tried to slip aside but its helm is jammed,
      // so its dodge got swapped for a fire/reload. Surface it so the player
      // sees the crew ability doing its job.
      if (who === 'enemy' && snareBlockedRef.current) {
        stepLines.push(`Jammed! The ${enemy.name} can't dodge.`)
        snareBlockedRef.current = false
      }

      // Resilient affix: 33% chance to regen at the top of each enemy
      // turn. Heals max(base, % of maxHP) so small ships get a flat 5
      // minimum and bigger ones scale up via the percentage. Skipped at
      // 0 HP (dead enemies don't regen) and at full HP (no point).
      if (
        who === 'enemy'
        && (affix?.turnStartHealBase || affix?.turnStartHealMaxPct)
        && eHp > 0 && eHp < enemyHpMaxRef.current
        && Math.random() < (affix.turnStartHealChance ?? 1)
      ) {
        const flat = affix.turnStartHealBase ?? 0
        const pct  = affix.turnStartHealMaxPct ? Math.round(enemyHpMaxRef.current * affix.turnStartHealMaxPct) : 0
        const healAmount = Math.max(1, flat, pct)
        const healed = Math.min(healAmount, enemyHpMaxRef.current - eHp)
        if (healed > 0) {
          eHp += healed
          stepLines.push(`${enemy.name} patches up ${healed} HP.`)
        }
      }

      if (action === 'reload') {
        if (who === 'player') {
          // Tide reload proc: roll for the bonus extra charges on top
          // of the base +1. Procs feel best when surfaced — push a
          // dedicated log line on success so the player sees the
          // tide doing work, not just a bigger number.
          const baseGain = 1
          const tideProc = tide.reloadProc.chance > 0 && Math.random() < tide.reloadProc.chance
            ? tide.reloadProc.bonus : 0
          // Trade-Wind Sails (reload_charge_chance item): a chance to catch the
          // wind and load a SECOND ball, stacked on top of any tide proc.
          const sailChance = getActiveEffects(equippedRaidItems).filter(e => e.type === 'reload_charge_chance').reduce((a, e) => Math.max(a, e.value), 0)
          const sailProc = sailChance > 0 && Math.random() < sailChance ? 1 : 0
          const procGain = tideProc + sailProc
          pCharges = Math.min(playerMaxCharges, pCharges + baseGain + procGain)
          if (procGain > 0) {
            // Credit whatever actually fired. When BOTH land on the same reload
            // the old label hid the sails behind the Powder Keg and mislabelled
            // the +2 as all Powder Keg — name both.
            const label = tideProc > 0 && sailProc > 0
              ? 'Powder Keg fires and the trade wind fills your sails'
              : tideProc > 0
                ? 'Powder Keg proc'
                : 'The trade wind fills your sails'
            stepLines.push(`${label}! +${procGain} extra cannonball${procGain === 1 ? '' : 's'}. (${pCharges}/${playerMaxCharges})`)
          } else {
            stepLines.push(`You load a cannonball. (${pCharges}/${playerMaxCharges})`)
          }
          // THE PALISADE BRACES. The turn you are not shooting buys something
          // back, which is the whole point of putting the refill on Reload
          // rather than on a timer: it makes the defensive beat a decision.
          // Capped to the pool's opening size so repeated reloads top up rather
          // than stack a bigger and bigger wall.
          if (wardRefillRef.current > 0 && abyssalShieldRef.current < shieldOpenMaxRef.current) {
            const braced = Math.min(wardRefillRef.current, shieldOpenMaxRef.current - abyssalShieldRef.current)
            abyssalShieldRef.current += braced
            stepLines.push(`The Palisade braces. +${braced} shield.`)
          }
        }
        else                  {
          // The Verdict curse: a reload can load an EXTRA charge, priming the
          // enemy's ultimate faster.
          const extraCharge = tide.enemyUltChargeChance > 0 && Math.random() < tide.enemyUltChargeChance ? 1 : 0
          eCharges = Math.min(enemyMagazine, eCharges + 1 + extraCharge)
          // Shuttered Ports curse: the reload count is hidden, so don't leak it
          // in the log either (or the player could just tally reloads to rebuild
          // the magazine). Obscure the action entirely.
          stepLines.push(enemyChargesHidden
            ? `The ${enemy.name} works something behind its shuttered gunports — you can't make it out.`
            : `Enemy loads a cannonball. (${eCharges}/${enemyMagazine})`)
          // Ultimate telegraph — the moment the magazine tops out on an
          // ultimate-carrying enemy, say so (the glowing pips are the visual
          // tell; this is the narrated one). Suppressed under Shuttered Ports.
          if (enemy.ultimate && eCharges >= enemyMagazine && !enemyChargesHidden) {
            stepLines.push(`⚠ The ${enemy.name}'s full battery gleams — ${enemy.ultimate.name} is primed.`)
          }
        }
      } else if (action === 'repair') {
        // Player-only consumable: heal the hull, lose the offensive
        // half of this turn. Roll uses the kit's [min, max+Fortune*scale].
        // Enemy actions never include 'repair' so the else branch is dead.
        if (who === 'player' && repairKit) {
          // Seasoned Timbers (Gauntlet upgrade) + Field Repairs (confluence) both
          // boost repair heals; the latter also lets them overfill past max.
          const roll = Math.round(rollRepairKitHeal(repairKit, totalFortune) * (mods.repairHealMult ?? 1) * tide.repairHealMult * tide.healMult)
          const before = pHp
          pHp = Math.min(healCap, pHp + roll)
          const healed = pHp - before
          if (healed > 0) onStat?.({ dmgHealed: healed })
          // A repair kit does NOT answer boss mechanic checks — only crew
          // abilities pass checks (and only a crew heal douses a burn).
          stepLines.push(`You crack open the ${repairKit.name}.`)
          stepLines.push(`The hull patches up for ${healed} HP.`)
          splatTarget = 'player'
          splatText = `+${healed}`
          splatColor = '#4ade80'
        }
      } else if (action === 'special' && who === 'enemy' && enemy.special) {
        const sp = enemy.special
        if (sp.aimAttack) {
          // Raid-8 AIM-BAR attack — afflicts the player's next N lock-ins
          // (decoys / hardened / squall) instead of touching hull or stats.
          // Recasting refreshes the pass count; the aim-session effect
          // consumes one pass per lock-in and clears the chip when spent.
          const passes = sp.aimPasses ?? 2
          aimAfflictionRef.current = { kind: sp.aimAttack, name: sp.name, passes }
          setAimAffliction({ kind: sp.aimAttack, name: sp.name })
          const what =
            sp.aimAttack === 'decoys'   ? 'False targets bloom across your aim bar — do NOT lock a crimson band.'
            : sp.aimAttack === 'hardened' ? 'Your lock is plated over — the first tap only cracks it; tap TWICE to land a shot.'
            :                               'A squall grips your aim — the needle will gust fast and slow mid-sweep.'
          pushStep({
            who, action, pHp, eHp, pCharges, eCharges,
            splatTarget: 'player',
            splatText: sp.name,
            splatColor: sp.summonColor ?? '#c084fc',
            summon: sp.summonImage
              ? { name: sp.name, label: sp.summonLabel ?? '', color: sp.summonColor ?? '#c084fc', image: sp.summonImage }
              : undefined,
            logLines: [
              `${sp.name}! ${sp.line}`,
              `${what} (next ${passes} shot${passes === 1 ? '' : 's'}.)`,
            ],
          })
        } else if (sp.status) {
          // Ch4 status special — the crew-ability analog. Applies its authored
          // status (shared pipeline, lib/statuses) to the player or to itself.
          // Reapplying refreshes duration / keeps the stronger magnitude, per
          // the pipeline's no-stacking rule.
          const sid = sp.status as StatusId
          const def = STATUS_DEFS[sid]
          const magnitude = sp.magnitude ?? 0
          const turns = sp.turns ?? 1
          if (sp.target === 'player') applyPlayerStatus(sid, magnitude, turns)
          else applyEnemyStatus(sid, magnitude, turns)
          const targetWord = sp.target === 'player' ? 'You are' : `The ${enemy.name} is`
          pushStep({
            who, action, pHp, eHp, pCharges, eCharges,
            splatTarget: sp.target === 'player' ? 'player' : 'enemy',
            splatText: def?.name ?? sp.name,
            splatColor: def?.color ?? '#c084fc',
            summon: sp.summonImage
              ? { name: sp.name, label: sp.summonLabel ?? '', color: sp.summonColor ?? (def?.color ?? '#c084fc'), image: sp.summonImage }
              : undefined,
            logLines: [
              `${sp.name}! ${sp.line}`,
              `${targetWord} ${def?.name ?? sp.status}${def ? ` — ${def.describe(magnitude)}` : ''} (${turns} turn${turns === 1 ? '' : 's'}).`,
            ],
          })
        }
      } else if (action === 'dodge') {
        // Skip the brace line when the dodger went SECOND in the order and
        // the other actor is firing this turn — the dodge outcome is
        // already narrated inside the attacker's fire step ("you weave
        // aside — dodged!"). Without this gate the log reads backwards:
        // outcome first ("dodged!") then setup ("brace, ready to dodge").
        const otherAction = who === 'player' ? eAction : pAction
        const otherIsAttacking = otherAction === 'fire' || otherAction === 'volley'
        const dodgerWentSecond = first !== who
        if (!(otherIsAttacking && dodgerWentSecond)) {
          stepLines.push(who === 'player' ? `You brace, ready to dodge.` : `Enemy braces, ready to dodge.`)
        }
      } else if (action === 'fire' || action === 'volley' || action === 'mega' || action === 'ultimate') {
        // THE PRIMEVAL MAW, tier 6: a CRITICAL has a chance to cost nothing. It
        // refunds whatever this action was about to spend, so it is worth the
        // most on the shots that cost the most (a volley, or the Mega). Read off
        // lockedAimResult, which already carries any crit upgrade.
        let critRefunded = false
        if (who === 'player') {
          const cost = action === 'mega' ? effMegaCost : action === 'volley' ? effVolleyCost : 1
          const refundChance = getActiveEffects(equippedRaidItems.filter(id => id !== repossessedItemRef.current))
            .filter(e => e.type === 'crit_charge_refund_chance')
            .reduce((a, e) => Math.max(a, e.value), 0)
          critRefunded = lockedAimResult === 'critical' && refundChance > 0 && Math.random() < refundChance
          if (!critRefunded) pCharges -= cost
        }
        else                  eCharges = Math.max(0, eCharges - (action === 'ultimate' ? enemyMagazine : action === 'volley' ? VOLLEY_COST : 1))

        const isAttackerPlayer = who === 'player'
        // Mega (player-only): the augment whose damage + on-hit behavior drives
        // this shot. megaMult replaces the volley's flat ×2.
        const isMega  = action === 'mega'
        const megaAug = isMega ? megaAugment : null
        // Symmetric dodge contest — hull is Initiative-only for BOTH sides now, so
        // each ship brings ONE agility number: the player's is EVASION (Navigation),
        // the enemy's is its gunnery ACCURACY (which folds its hull in at generation
        // — see scaleToCurve / buildDonApex / the raid accuracy stamp). Whoever
        // shoots rolls d20 + their number against the dodger's d20 + theirs, both
        // directions. Slow/haste (speedDelta) no longer touch this — Initiative only.
        const playerDodgeStat = totalNavigation
        const enemyDodgeStat  = Math.max(0, enemy.accuracy ?? 0)
        const attackerSpeed  = isAttackerPlayer ? playerDodgeStat : enemyDodgeStat
        const defenderAction = isAttackerPlayer ? eAction         : pAction
        const defenderSpeed  = isAttackerPlayer ? enemyDodgeStat  : playerDodgeStat
        const defenderNav    = 0
        // Repossession: drop the reclaimed item from the per-shot effect reads
        // for this fight (null ref = unchanged list, so every other raid is
        // untouched). Fight-start stats above keep the full list intentionally.
        const liveItems = equippedRaidItems.filter(id => id !== repossessedItemRef.current)

        let dmg: number
        if (isAttackerPlayer) {
          const bossMult = isBoss
            ? getActiveEffects(liveItems).filter(e => e.type === 'boss_damage_mult').reduce((a, e) => a * e.value, 1)
            : 1
          // Crit / non-crit damage mults from raid items (Gunner's Sight).
          // Only ONE branch applies per shot — crit shots multiply by the
          // crit mult; hit + graze multiply by the non-crit mult. Skipped
          // entirely on a miss (rollShotDamage already returns 0).
          const isCritShot = lockedAimResult === 'critical'
          playerCritShot = isCritShot
          const aimItemMult = isCritShot
            ? getActiveEffects(liveItems).filter(e => e.type === 'crit_damage_mult').reduce((a, e) => a * e.value, 1)
            : getActiveEffects(liveItems).filter(e => e.type === 'noncrit_damage_mult').reduce((a, e) => a * e.value, 1)
          // classDamageMult: aggregated ship-class effect (Master Gunner
          // +15%, Ironside -10%, Buccaneer +5%, stacks across chapters).
          // Stacks multiplicatively with raid items + volley + crit, same
          // chain as the rest of the damage mults.
          // Tide layer: dmgMult (broad), plus action-specific fire/volley
          // mults, plus boss-only mults stacked on top when isBoss.
          const isVolley = action === 'volley'
          // The Mega is a heavy shot, so it rides the same Volley boss layers.
          const isVolleyLike = isVolley || isMega
          // Per-action damage lane: Mega gets its OWN multiplier (Man-o-War's
          // Wrath boon) so a volley-damage boon doesn't leak onto it and its own
          // boon doesn't leak onto volleys. Volley uses volleyDmgMult, fire fire.
          const tideActionMult = isMega ? tide.megaDmgMult : isVolley ? tide.volleyDmgMult : tide.fireDmgMult
          // The ITEM-side mirror of the same three lanes (The Primeval Maw).
          // Same split, so a volley bonus never leaks onto a single shot.
          const itemLaneType = isMega ? 'mega_damage_mult' : isVolley ? 'volley_damage_mult' : 'fire_damage_mult'
          const itemActionMult = getActiveEffects(liveItems)
            .filter(e => e.type === itemLaneType).reduce((a, e) => a * e.value, 1)
          const tideBossMult = isBoss
            ? tide.bossDmgMult * (isVolleyLike ? tide.bossVolMult : 1)
            : 1
          // Davy's Hand Cannon: +% damage vs NON-boss enemies (mobs / elites).
          const nonbossMult = isBoss
            ? 1
            : getActiveEffects(liveItems).filter(e => e.type === 'nonboss_damage_mult').reduce((a, e) => a * e.value, 1)
          // Davy's Heavy Cannon: damage ramps +value each turn this fight
          // (turn 1 = base; resets per enemy via turnRef reset in the encounter
          // effect). Sums if multiple ramp items are somehow equipped.
          const rampPerTurn = getActiveEffects(liveItems).filter(e => e.type === 'ramp_damage_per_turn').reduce((a, e) => a + e.value, 0)
          // Leviathan's Cannon: landed crits have bought extra turns of ramp, so
          // the climb runs ahead of the clock. Same DAMAGE_RAMP_CAP ceiling — this
          // reaches it sooner, it does not raise it.
          const rampTurns = Math.max(0, turnRef.current - 1) + critRampBonusRef.current
          const rampMult = 1 + Math.min(DAMAGE_RAMP_CAP, rampPerTurn * rampTurns)
          // Cold Fury (boon): crit hits hit harder. Only on a crit shot.
          const critTideMult = isCritShot ? tide.critDmgMult : 1
          // Wounded Fury (boon): bonus damage scaling with MISSING HP — 0 at full
          // hull, up to lowHpDamage at the brink. Reads the player's HP at the
          // moment of the shot (pHp), so it climbs as the fight wears you down.
          const lowHpMult = tide.lowHpDamage > 0
            ? 1 + tide.lowHpDamage * Math.max(0, 1 - pHp / playerHpMax)
            : 1
          // All-or-Nothing curse: anything short of a gold crit hits soft.
          const noncritTideMult = isCritShot ? 1 : tide.noncritDmgMult
          // Permafrost: bonus damage to a FROZEN enemy (you shatter the brittle
          // hull). Brittle doubles the bonus on a critical hit.
          const frozenMult = enemyFrozenThisRound && tide.frozenDmgMult > 1
            ? (isCritShot && tide.brittle ? 1 + (tide.frozenDmgMult - 1) * 2 : tide.frozenDmgMult)
            : 1
          // Hull Render confluence: each Volley this fight ramps. Reads the count
          // BEFORE this volley (so the first is +0), then it's bumped below.
          const volleyRampMult = isVolley && tide.volleyRampPct > 0 ? 1 + Math.min(tide.volleyRampPct * volleyCountRef.current, DAMAGE_RAMP_CAP) : 1
          // Cannonade (boon): consecutive crits ramp damage. The bonus for THIS
          // shot is the streak it WILL reach if it lands (first crit = 1 stack).
          // Read-only here — the streak is only COMMITTED once the shot lands
          // (past the dodge check, just before the step is pushed), so a dodged
          // crit doesn't advance the chain.
          const critStreakMult = (tide.critStreakPerStack > 0 && isCritShot)
            ? 1 + tide.critStreakPerStack * Math.min(tide.critStreakMaxStacks, critStreakRef.current + 1)
            : 1
          const actionBaseMult = isMega ? (megaAug?.megaMult ?? 2.6) : isVolley ? 2 : 1
          // Vengeance rage — after Laz's ward cheats a killing blow, every shot
          // for the rest of the fight hits harder (capped +35% at the def level).
          const vengeanceMult = vengeanceDmgBuffRef.current > 0 ? 1 + vengeanceDmgBuffRef.current : 1
          // Drowned Crown — the avenging bite. Live only once a killing blow has
          // been cheated this fight, and only against ELITE hulls: the tier-5
          // enemy in a raid sequence, or any non-boss wearing a challenge affix
          // (both read as "the dangerous one in the room"). Its own factor in the
          // chain, so when Laz's ward is what saved you, his rage and the crown's
          // bite both apply rather than one swallowing the other.
          const isEliteEnemy = enemy.id === 'elite' || !!affix
          const avengeMult = avengeArmedRef.current && isEliteEnemy
            ? getActiveEffects(liveItems).filter(e => e.type === 'avenge_elite_mult').reduce((a, e) => a * e.value, 1)
            : 1
          // Statuses: what YOU deal (weaken ↓ / enrage ↑) × what the ENEMY
          // takes (feeble ↑ / fortify ↓) — the Ch4 pipeline's damage hooks.
          const statusOutMult = pStatus.dmgDealtMult * eStatus.dmgTakenMult
          // Vanguard Battery (item, id opening_statement): the FIRST shot of the fight lands harder.
          // shotsThisFightRef was already bumped for this shot at aim-lock, so the
          // opener reads as === 1. Every later shot is untouched.
          //
          // Warlord's Reckoning widens that window: with ambush_each_phase equipped
          // the FIRST shot of every boss phase counts as an opener too, since
          // shotsAtPhaseStartRef is stamped at each phase change. Without the
          // effect the condition is unchanged (=== 1), so Ambush Signet and every
          // other first_shot_mult item behave exactly as before.
          const phaseAmbush = getActiveEffects(liveItems).some(e => e.type === 'ambush_each_phase')
          const isOpeningShot = shotsThisFightRef.current === 1
            || (phaseAmbush && shotsThisFightRef.current === shotsAtPhaseStartRef.current + 1)
          const firstShotMult = isOpeningShot
            ? getActiveEffects(liveItems).filter(e => e.type === 'first_shot_mult').reduce((a, e) => a * e.value, 1)
            : 1
          if (isOpeningShot && phaseAmbush && shotsThisFightRef.current > 1 && firstShotMult > 1) {
            stepLines.push(`The Reckoning re-arms — a new phase is a new opening.`)
          }
          // Carrion Sight (item, id the_shakedown): +% vs an enemy that ALREADY carries any status —
          // a Ch4 status (weaken/feeble/corrode/slowed/marked), a burn, or a
          // freeze. This hit's own on-hit proc lands later, so a fresh affliction
          // only pays off from the next hit on.
          const enemyAfflicted = enemyStatusesRef.current.length > 0 || enemyBurnRef.current.turns > 0 || enemyFrozenRef.current > 0
          const afflictedMult = enemyAfflicted
            ? getActiveEffects(liveItems).filter(e => e.type === 'afflicted_damage_mult').reduce((a, e) => a * e.value, 1)
            : 1
          // Weather Gauge / Hobble confluences: your OPENING shot only (first shot
          // of the fight, === 1 like firstShotMult) — if you seized the opening
          // (first === 'player') and it lands, a chance it strikes twice. Excludes
          // the Mega and whiffs. A full second helping, folded into the mult.
          const doubleStruck = shotsThisFightRef.current === 1 && first === 'player' && !isMega
            && (lockedAimResult ?? 'miss') !== 'miss'
            && tide.doubleStrikeChance > 0 && Math.random() < tide.doubleStrikeChance
          const doubleStrikeMult = doubleStruck ? 2 : 1
          const mult = actionBaseMult * bossMult * nonbossMult * rampMult * aimItemMult * classDamageMult
                       * tide.dmgMult * tideActionMult * itemActionMult * tideBossMult * critTideMult * lowHpMult * noncritTideMult * frozenMult * volleyRampMult * critStreakMult * vengeanceMult * avengeMult * statusOutMult * firstShotMult * afflictedMult * doubleStrikeMult
          if (doubleStruck) stepLines.push(`Weather Gauge! You take the opening and the shot lands twice.`)
          // Say it out loud, or a refunded volley just looks like a bookkeeping bug.
          if (critRefunded) stepLines.push(`The Primeval Maw bites for free. That shot cost you nothing. (${pCharges}/${playerMaxCharges})`)
          dmg = Math.floor(rollShotDamage(lockedAimResult ?? 'miss', shipMinDamage, totalPower, mods.damagePct) * mult)
          // ── Oracle's Eye: bank the CRITICAL version of this shot ────────────
          // The pierce roll lives in the dodge resolver further down, but the dodge
          // is only resolved AFTER damage is rolled, by which point every
          // multiplier above is out of scope. So roll the critical here, while it
          // still is, and the pierce swaps it in if it fires.
          //
          // The swap covers the two layers a player would notice: the item
          // crit/non-crit mults and the matching tide ones. It deliberately does
          // NOT retro-apply the crit-only boons (Cannonade's streak, Permafrost's
          // brittle bonus) — those are rewards for a crit you AIMED, and a pierced
          // shot did not roll gold on the bar. Dividing the two layers back out is
          // safe: both default to 1 and neither is ever 0.
          if (
            (lockedAimResult ?? 'miss') !== 'miss' && !isCritShot
            && getActiveEffects(liveItems).some(e => e.type === 'pierce_crit')
          ) {
            const critItemMult = getActiveEffects(liveItems).filter(e => e.type === 'crit_damage_mult').reduce((a, e) => a * e.value, 1)
            const swapped = mult / (aimItemMult || 1) / (noncritTideMult || 1) * critItemMult * tide.critDmgMult
            pierceCritDmg = Math.floor(rollShotDamage('critical', shipMinDamage, totalPower, mods.damagePct) * swapped)
          }
          if (isVolley) volleyCountRef.current += 1   // this volley is now "fired" — the next ramps further
          // Enemy themed defense: crustacean carapace soaks a flat % off every
          // hit the player lands (Krust's crew). Applied to the rolled damage so
          // the hitsplat + log show the real number that gets through.
          // VOLLEY BYPASS: a 3-charge volley is the concentrated burst that
          // punches the plate open — the whole Krust raid is designed around
          // this answer (no enemy in that raid ever volleys themselves; the
          // player's volley is the response). Fire/graze still gets soaked.
          const dr = enemy.damageReduction ?? 0
          if (dr > 0 && dmg > 0 && action !== 'volley' && action !== 'mega') {
            const before = dmg
            dmg = Math.max(1, Math.round(dmg * (1 - dr)))
            carapaceSoaked = true
            // Log the teaching line only once per enemy — the deflect cue +
            // reduced numbers carry every soak after that, keeping the log clean.
            if (!carapaceLoggedRef.current) {
              carapaceLoggedRef.current = true
              stepLines.push(`${enemy.abilityName ?? 'Carapace'}! The plate shrugs off your fire (${before} → ${dmg}). Volley to crack it.`)
            }
          }
          // Ironclad affix: 50% chance to soak 30% off the hit on top of
          // any themed defense. Stacks multiplicatively, never floors
          // below 1. Push a log line when it triggers so the player
          // sees the mitigation roll, not just a smaller-looking number.
          if (
            affix?.damageTakenMult
            && dmg > 0
            && Math.random() < (affix.damageTakenChance ?? 1)
          ) {
            const before = dmg
            dmg = Math.max(1, Math.round(dmg * affix.damageTakenMult))
            stepLines.push(`Ironclad! ${enemy.name}'s plating soaks the blow (${before} → ${dmg}).`)
          }
          // Phase 2 chance-gated mitigation — challenge-mode Krust hunkers
          // behind his plate at 50% HP. Same shape as Ironclad: chance roll
          // succeeds → multiply dmg by `damageTakenMult` and surface a log
          // line. `damageTakenVolleyBypass` skips the roll on volley shots
          // so the player always has a clean path through plate (the
          // dialogue line is the in-fiction hint).
          const mitPhase = enemyPhaseRef.current >= 2 ? phaseList[enemyPhaseRef.current - 2] : undefined
          if (
            mitPhase?.damageTakenMult
            && dmg > 0
            && !(mitPhase.damageTakenVolleyBypass && action === 'volley')
            && Math.random() < (mitPhase.damageTakenChance ?? 1)
          ) {
            const before = dmg
            dmg = Math.max(1, Math.round(dmg * mitPhase.damageTakenMult))
            stepLines.push(`Carapace! ${enemy.name}'s plate soaks the blow (${before} → ${dmg}).`)
          }
        } else {
          const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
          // Ultimate: the whole magazine in one authored blow (× its mult,
          // floored). Volley stays the flat ×2.
          dmg = action === 'ultimate'
            ? Math.max(1, Math.floor(base * (enemy.ultimate?.mult ?? 2.6) * tide.enemyUltDmgMult))  // The Verdict curse
            : base * (action === 'volley' ? 2 : 1)
          // Statuses on the ENEMY's output: weaken ↓ / enrage ↑ (Ch4 pipeline).
          if (eStatus.dmgDealtMult !== 1) dmg = Math.max(1, Math.floor(dmg * eStatus.dmgDealtMult))
          // Phase 2 boss damage bump (challenge-mode Pete) — multiplies the
          // raw rolled damage before crit + dodge math so a phase-2 volley
          // hits the player's hull math at the new, scarier rate. No-op for
          // phase-1 enemies (mult stays 1).
          if (enemyPhaseRef.current >= 2 && phaseList[enemyPhaseRef.current - 2]) {
            dmg = Math.max(1, Math.floor(dmg * phaseList[enemyPhaseRef.current - 2].damageMult))
          }
          // MARKED (his Mira ability). While it holds, everything he throws
          // lands harder. Applied after the phase bump so it reads as a clean
          // extra multiplier on an already-scaled shot.
          // Post-ward surge: he hits harder for the rest of the phase.
          if (who === 'enemy' && bossWardBuffRef.current > 0) {
            dmg = Math.max(1, Math.floor(dmg * (1 + bossWardBuffRef.current)))
          }
          // Enemy crit — flat chance per enemy, applied after the volley
          // multiplier. Players crit through aim-bar skill; enemies don't
          // have that, so the same outcome happens via RNG.
          // Marksman affix multiplies the crit chance.
          const baseCrit = enemy.critChance ?? 0
          let effCrit    = affix?.critMult ? Math.min(1, baseCrit * affix.critMult) : baseCrit
          // Tide: incomingCritReduction lowers the enemy's crit chance vs you.
          // Positive = Ghostward boon (enemies crit less); negative = Sharpshooters
          // curse (enemies crit MORE). Clamped to a valid 0-1 chance.
          if (tide.inCritReduce !== 0) effCrit = Math.max(0, Math.min(1, effCrit - tide.inCritReduce))
          // Ultimates never crit — the number is authored, not swingy.
          if (action === 'ultimate') effCrit = 0
          if (Math.random() < effCrit) {
            enemyCrit = true
            dmg = Math.floor(dmg * 1.5)
          }
        }

        splatTarget = isAttackerPlayer ? 'enemy' : 'player'

        // Dodge outcomes: success = 0 dmg, failure = "partial dodge" at 30% of
        // the hit (70% reduction). No more "fully ate the shot" — the dodge
        // button always pays for itself, and a failed dodge now still shrugs off
        // most of the blow. Symmetric: applies to both player and enemy dodges.
        let partialDodge = false
        let railgunGraze = false   // railgun beam grazed a dodging enemy (reduced, not avoided)
        // A frozen defender can't weave aside — its dodge stance is forfeit this
        // round (mirrors its skipped turn), so the shot lands clean.
        const defenderFrozen = isAttackerPlayer ? enemyFrozenThisRound : playerFrozenThisRound
        if (defenderAction === 'dodge' && isAttackerPlayer && aegisRef.current) {
          // The Last Wall: while it stands, the enemy doesn't bother weaving —
          // the wall is doing the work. Every player blow "lands" (into the
          // wall, or the shattering Mega). Without this, a feint-dodge could
          // full-dodge the Mega — wasting the exact answer the fight asks for.
          stepLines.push(`The ${enemy.name} doesn't so much as flinch behind the wall.`)
        } else if (defenderAction === 'dodge' && defenderFrozen) {
          stepLines.push(isAttackerPlayer
            ? `The ${enemy.name} is frozen solid — it can't weave aside.`
            : `Your ship is frozen solid — you can't weave aside.`)
        } else if (defenderAction === 'dodge' && isAttackerPlayer && isMega && megaAug?.pierce) {
          // Railgun: can't be FULLY dodged, but a clean dodge now GRAZES it to
          // RAILGUN_GRAZE_PCT of the hit instead of landing full (was: always
          // full, no roll). A failed dodge still eats the whole beam. Player is
          // the attacker here, so accuracy is 0 (the fair ~50/50 contest).
          const def = rollDodge(defenderSpeed, defenderNav)
          const atk = rollAttackerVsDodge(attackerSpeed, 0)
          if (def >= atk) {
            railgunGraze = true
            dmg = Math.max(1, Math.floor(dmg * RAILGUN_GRAZE_PCT))
          }
          // else: full damage lands — the standard hit line fires downstream.
        } else if (defenderAction === 'dodge') {
          // Tide dodge effects only help the PLAYER (when the player is the
          // one defending = the enemy is attacking = !isAttackerPlayer).
          const playerDefending = !isAttackerPlayer
          let dodged: boolean
          // DOLE'S READ, his side of it. While Foresight holds he has already seen
          // the shot coming, so he slips it outright. Only against the PLAYER's
          // attack, so it never turns into free evasion on his own shots.
          if (isAttackerPlayer && bossForesightRef.current > 0) {
            dodged = true
          } else if (playerDefending && guaranteedDodgeLeftRef.current > 0) {
            // guaranteedDodge token: auto-succeed, no roll, spend one.
            guaranteedDodgeLeftRef.current -= 1
            dodged = true
          } else {
            // Symmetric contest: each side already carries its full agility in
            // attackerSpeed / defenderSpeed (player = Navigation, enemy = accuracy
            // with hull folded in), so the extra accuracy arg is 0 both ways. This
            // is now the SAME roll whether the enemy fires at a dodging player or
            // the player fires at a dodging enemy — no side-specific bonus.
            const def = rollDodge(defenderSpeed, defenderNav)
            const atk = rollAttackerVsDodge(attackerSpeed, 0)
            dodged = def >= atk
            // See-through-the-feint (Tell-Tale Glass / Admiral's Eye): when the
            // ENEMY would dodge the player's shot, anti-evasion items get ONE
            // roll to land it anyway. Gated to the player's attack on a would-be
            // dodge, so it never helps the enemy and only fires on dodge turns.
            if (isAttackerPlayer && dodged) {
              const pierce = getActiveEffects(liveItems)
                .filter(e => e.type === 'dodge_pierce_chance')
                .reduce((a, e) => Math.max(a, e.value), 0)
              if (pierce > 0 && Math.random() < pierce) {
                dodged = false
                // Oracle's Eye: reading the weave IS the perfect shot, so the
                // pierced hit arrives as a critical (banked up at the damage roll).
                if (pierceCritDmg != null) {
                  dmg = pierceCritDmg
                  playerCritShot = true
                  stepLines.push(`You read the feint — the shot slips through the dodge and lands clean as a critical.`)
                } else {
                  stepLines.push(`You read the feint — the shot slips through the dodge.`)
                }
              }
            }
            // dodgeBonus: flat % shift on the player's dodge outcome.
            // Positive saves a would-be miss; negative spoils a would-be dodge.
            if (playerDefending && tide.dodgeBonus !== 0) {
              if (!dodged && tide.dodgeBonus > 0 && Math.random() < tide.dodgeBonus) dodged = true
              else if (dodged && tide.dodgeBonus < 0 && Math.random() < -tide.dodgeBonus) dodged = false
            }
          }
          if (dodged) {
            // A shot slipped by Foresight must not read as ordinary bad luck, or the
            // ability is indistinguishable from losing the dodge roll twice.
            stepLines.push(
              isAttackerPlayer && bossForesightRef.current > 0
                ? `He read that one before you fired it. Slipped.`
                : isAttackerPlayer ? `Enemy weaves aside — dodged!` : `You weave aside — dodged!`)
            splatText = 'Dodged'
            splatColor = '#38bdf8'
            // Telemetry: enemy dodged YOUR shot (still a shot fired) vs YOU
            // slipped the enemy's shot (a won dodge).
            if (isAttackerPlayer) onStat?.({ shots: 1, volleys: action === 'volley' ? 1 : 0, crits: lockedAimResult === 'critical' ? 1 : 0 })
            else onStat?.({ dodgesWon: 1 })
            // dodgeRefund (currently no producer): slipping an enemy shot hands you back a
            // cannonball (only when it's the PLAYER who dodged).
            if (!isAttackerPlayer && tide.dodgeRefundCharges > 0) {
              const refund = Math.min(playerMaxCharges - pCharges, tide.dodgeRefundCharges)
              if (refund > 0) { pCharges += refund; stepLines.push(`Untouchable! The wind hands you back ${refund} cannonball${refund === 1 ? '' : 's'}.`) }
            }
            // Spiteful Wake — the "good play pays too" half: slipping an enemy
            // shot still lashes the wake back for a slice of the damage it WOULD
            // have dealt, so the boon rewards dodging, not just eating hits.
            if (!isAttackerPlayer && tide.retaliateDodgePct > 0 && dmg > 0 && eHp > 0) {
              const spite = Math.max(1, Math.round(dmg * tide.retaliateDodgePct))
              eHp = wardFloor(eHp - soakEnemyShield(spite))
              reflectDmgOut = (reflectDmgOut ?? 0) + spite
              stepLines.push(`Spiteful Wake — you slip the shot and the wake lashes back for ${spite}.`)
              const fin = finishCheck(eHp, pHp, stepLines)
              eHp = fin.eHp; pHp = fin.pHp
              if (fin.executed) executeKind = fin.executed
              titheHealedOut += fin.tithed
            }

            // ── Parry layer on top of the dodge result ───────────────────
            // Two mirror mechanics, only one fires per dodge depending on
            // which side dodged:
            //
            //   ENEMY parry (The Cartographer's Riposte) — when the enemy
            //   dodges a player attack and carries parryChance/parryDamagePct,
            //   roll for a fresh counter-shot. Uses a fresh damage roll
            //   (his own minDmg..maxDmg) × parryDamagePct, applied through
            //   the same incoming-mitigation chain as a regular enemy fire
            //   so raid items + tides still mitigate it.
            //
            //   PLAYER parry (Astrolabe items) — when the player dodges
            //   an enemy attack and equipped raid items grant parry_chance
            //   + parry_reflect_pct, roll to reflect a slice of the SHOT'S
            //   own damage (the `dmg` already computed for this fire/volley
            //   step) back into the enemy. Different sourcing (counter-roll
            //   vs deflection) is intentional — boss is striking back, the
            //   player is turning his blade away.
            if (isAttackerPlayer && enemy.parryChance && enemy.parryDamagePct && Math.random() < enemy.parryChance) {
              const parryBase = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
              let parryDmg = Math.max(1, Math.floor(parryBase * enemy.parryDamagePct))
              const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult * pStatus.dmgTakenMult
              if (takenMult !== 1) parryDmg = Math.max(1, Math.floor(parryDmg * takenMult))
              stepLines.push(`${enemy.parryName ?? 'Riposte'}! ${enemy.name} counters your strike for ${parryDmg}.`)
              pHp = Math.max(0, pHp - soakPlayerShield(parryDmg, stepLines))
            } else if (isAttackerPlayer && affix?.riposteReflectPct && dmg > 0) {
              // Riposte affix — reflect a slice of the shot you WOULD have landed
              // (so it scales with the player's own damage and punishes heavy
              // hitters), through the same incoming-mitigation chain as a hit.
              let riposteDmg = Math.max(1, Math.round(dmg * affix.riposteReflectPct))
              const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult * pStatus.dmgTakenMult
              if (takenMult !== 1) riposteDmg = Math.max(1, Math.floor(riposteDmg * takenMult))
              stepLines.push(`Riposte! ${enemy.name} turns your own ${dmg}-damage strike back for ${riposteDmg}.`)
              pHp = Math.max(0, pHp - soakPlayerShield(riposteDmg, stepLines))
              riposteDmgOut = riposteDmg
            } else if (!isAttackerPlayer) {
              const parryEffects = getActiveEffects(liveItems)
              const parryChance      = parryEffects.filter(e => e.type === 'parry_chance').reduce((a, e) => Math.max(a, e.value), 0)
              const parryReflectPct  = parryEffects.filter(e => e.type === 'parry_reflect_pct').reduce((a, e) => Math.max(a, e.value), 0)
              if (parryChance > 0 && parryReflectPct > 0 && dmg > 0 && Math.random() < parryChance) {
                const reflectDmg = Math.max(1, Math.floor(dmg * parryReflectPct))
                eHp = wardFloor(eHp - soakEnemyShield(reflectDmg))
                reflectDmgOut = reflectDmg
                stepLines.push(`Riposte! You turn the shot back, slicing ${reflectDmg} into ${enemy.name}.`)
                const fin = finishCheck(eHp, pHp, stepLines)
                eHp = fin.eHp; pHp = fin.pHp
                if (fin.executed) executeKind = fin.executed
                titheHealedOut += fin.tithed
              }
            }

            // This branch CONTINUES, so it is the end of the road for a dodge
            // step: anything the reflect above set has to ride out on this step
            // or it never reaches the screen at all.
            pushStep({ who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor, logLines: stepLines, reflectDmg: reflectDmgOut, riposteDmg: riposteDmgOut, executed: executeKind, titheHeal: titheHealedOut || undefined })
            continue
          } else {
            // A player dodge that failed — you took the hit anyway.
            if (!isAttackerPlayer) onStat?.({ dodgesLost: 1 })
            partialDodge = true
            dmg = Math.max(1, Math.floor(dmg * 0.3))
          }
        }

        if (isAttackerPlayer) {
          // ── THE LAST WALL (aegis) ────────────────────────────────────────
          // The wall stands between your guns and his hull. A Mega takes it
          // apart in one blow and the damage flows through; everything else
          // is drunk whole (dmg → 0, all on-hit riders skip) and chips the
          // wall's endurance — fire 1, volley 2 — until it collapses.
          let aegisWalled = false
          if (aegisRef.current && dmg > 0) {
            if (isMega) {
              aegisRef.current = null
              aegisDownOut = 'shatter'
              stepLines.push('The wall takes the full weight of your ultimate and comes apart in one blow!')
            } else {
              aegisWalled = true
              aegisRef.current.hitsLeft -= action === 'volley' ? 2 : 1
              aegisHitsRef.current += 1
              if (aegisRef.current.hitsLeft <= 0) {
                aegisRef.current = null
                aegisDownOut = 'collapse'
              }
              dmg = 0
            }
          }
          // Thornmail curse: the enemy can parry your shot outright — it deals
          // nothing (zeroing dmg also skips the on-hit procs, all gated dmg>0).
          if (tide.enemyParryChance > 0 && dmg > 0 && !isMega && Math.random() < tide.enemyParryChance) {
            dmg = 0
            stepLines.push(`The ${enemy.name} turns your shot aside — parried.`)
          }
          // STREAK PIERCE. Hold the chain to the raid's pierceAt and your shots
          // stop caring about his plate. Read from the streak BEFORE this shot
          // commits, so the shot that takes you to 5 is not itself piercing:
          // you earn it first, then you spend it.
          const streakPiercing = !!critStreakCfg?.pierceAt
            && critStreakRef.current >= critStreakCfg.pierceAt
          const piercing = (isMega && !!megaAug?.pierce) || markPierceTurnsRef.current > 0 || streakPiercing
          const preShield = enemyShieldRef.current
          const toHull = soakEnemyShield(dmg, piercing, tide.shieldPierceFrac)
          // The one moment this ability exists for. Without a line here his HP
          // simply stops at a fifth and the player is never told why.
          if (bossWardSavedRef.current) {
            bossWardSavedRef.current = false
            stepLines.push(`It should have finished him. ${enemy.name} comes back up, and hits ${Math.round(WARD_BUFF * 100)}% harder for the rest of the phase.`)
          }
          // Only say it when there was actually plate to ignore, or every shot
          // in a shieldless phase would claim to be piercing something.
          if (streakPiercing && preShield > 0 && dmg > 0) {
            stepLines.push(`${streakLabel} x${critStreakRef.current}. The chain goes straight through his plate.`)
          }
          shieldAbsorbedOut = preShield - enemyShieldRef.current
          // Overkill = the slice of this hull-hit that lands PAST the enemy's
          // remaining HP (wasted damage). Don's overkill-heal boon reclaims some
          // of it (applied in the heal block below). Captured before eHp clamps.
          const overkillDmg = Math.max(0, toHull - eHp)
          eHp = wardFloor(eHp - toHull)
          if (dmg > 0) onPlayerHit?.(dmg)
          // ── CRIT STRIP (The Court's Fang / The Don's Signet) ──────────────
          // The raid-8 mirror of the sharks' bite, aimed the other way: a landed
          // player CRITICAL can tear a loaded cannonball off the enemy's rack,
          // delaying its next fire/volley/ULTIMATE. pickEnemyAction degrades a
          // now-unaffordable shot to a reload + re-attempt, so this never
          // soft-locks the enemy — it just loses tempo.
          if (playerCritShot && dmg > 0 && eHp > 0 && eCharges > 0) {
            const stripChance = getActiveEffects(liveItems)
              .filter(e => e.type === 'crit_strip_charge')
              .reduce((a, e) => Math.max(a, e.value), 0)
            if (stripChance > 0 && Math.random() < stripChance) {
              eCharges = Math.max(0, eCharges - 1)
              stepLines.push(`Your critical shot rips a loaded cannonball off the ${enemy.name}'s deck.`)
            }
          }
          // Press-Gang (boon): ANY landed hit can rip a loaded cannonball off the
          // enemy AND ram it into your own rack (steal, not just strip).
          if (tide.stealChargeChance > 0 && dmg > 0 && eHp > 0 && eCharges > 0 && Math.random() < tide.stealChargeChance) {
            eCharges = Math.max(0, eCharges - 1)
            const grabbed = pCharges < playerMaxCharges
            if (grabbed) pCharges += 1
            stepLines.push(grabbed
              ? `Press-Gang! You rip a cannonball off the ${enemy.name} and ram it into your own rack.`
              : `Press-Gang! You rip a loaded cannonball off the ${enemy.name} — your rack is already full.`)
            stoleChargeOut = true
          }
          // Telemetry: a landed player shot (fire/volley/mega). dmg is the blow
          // the hitsplat shows; highestHit takes the max host-side.
          onStat?.({ shots: 1, volleys: action === 'volley' ? 1 : 0, megas: isMega ? 1 : 0, crits: lockedAimResult === 'critical' ? 1 : 0, dmgDealt: dmg, highestHit: dmg })
          // Lifesteal — heal a slice of the damage you deal. Two additive
          // sources: the Leviathan's Hunger boon (tide.lifestealPct) and Davy's
          // Blood Cannon raid item (lifesteal_pct effect). The step carries the
          // new pHp so the HP bar climbs + a +HP splat on your hull; the log line
          // is pushed AFTER the "you fire" line below so it reads in order.
          const itemLifesteal = getActiveEffects(liveItems).filter(e => e.type === 'lifesteal_pct').reduce((a, e) => a + e.value, 0)
          const totalLifesteal = Math.min(LIFESTEAL_CAP, tide.lifestealPct + itemLifesteal)
          if (dmg > 0 && totalLifesteal > 0 && pHp > 0) {
            // Per-hit heal capped by lifestealHealCap: the flat hull share at
            // normal damage, a share of the damage itself once your hits dwarf
            // your hull. A huge hit still can't refill the whole bar.
            const healed = Math.round(Math.min(Math.round(lifestealHealCap(playerHpMax, totalLifesteal)), Math.max(1, Math.round(dmg * totalLifesteal))) * tide.healMult)
            const before = pHp
            pHp = Math.min(healCap, pHp + healed)
            lifestealHealedOut = pHp - before
            if (lifestealHealedOut > 0) {
              onStat?.({ dmgHealed: lifestealHealedOut })
              // Attribute the heal to its ACTUAL source(s). Lifesteal comes from
              // the Leviathan's Hunger boon (tide.lifestealPct) AND/OR Davy's Blood
              // Cannon lineage (lifesteal_pct item) — the log used to always credit
              // the boon, so the Blood Cannon read as "Leviathan's Hunger".
              const fromBoon = tide.lifestealPct > 0
              if (fromBoon && itemLifesteal > 0) lifestealLabel = 'The wound drinks back'
              else if (fromBoon) lifestealLabel = "Leviathan's Hunger drinks the wound"
              else {
                const lsId = liveItems.find(id => getActiveEffects([id]).some(e => e.type === 'lifesteal_pct'))
                lifestealLabel = `${(lsId && getRaidItem(lsId)?.name) || "Davy's Blood Cannon"} drinks the wound`
              }
            }
          }
          // Overkill heal (Don's boon): reclaim a slice of the damage that
          // landed past the sunk hull's HP. Same per-hit cap as lifesteal so a
          // massive Mega overkill can't refill the whole bar in one shot.
          if (overkillDmg > 0 && tide.overkillHealPct > 0 && pHp > 0) {
            const raw = Math.max(1, Math.round(overkillDmg * tide.overkillHealPct))
            const healed = Math.round(Math.min(Math.round(lifestealHealCap(playerHpMax, tide.overkillHealPct)), raw) * tide.healMult)
            const before = pHp
            pHp = Math.min(healCap, pHp + healed)
            overkillHealedOut = pHp - before
            if (overkillHealedOut > 0) onStat?.({ dmgHealed: overkillHealedOut })
          }
          // Executioner / Coup de Grâce / Reaper's Tithe — see finishCheck. Still
          // gated on dmg > 0: the mark is for a hit that DROVE the hull under it,
          // not for finding it already there, or a shot that missed would sink an
          // enemy the previous turn had left in the window.
          if (dmg > 0) {
            const fin = finishCheck(eHp, pHp, stepLines, lockedAimResult === 'critical')
            eHp = fin.eHp; pHp = fin.pHp
            if (fin.executed) executeKind = fin.executed
            titheHealedOut += fin.tithed
          }
          // Incendiary / Frozen cannonball — 15% on-hit procs, only when the
          // shot actually landed and didn't already sink them. Burn refreshes
          // to a fresh 2 turns; freeze flags the enemy's next turn to skip.
          if (dmg > 0 && eHp > 0) {
            const onHitEffects = getActiveEffects(liveItems)
            // Item cannonball chance + matching elemental boon chance, capped so a
            // specialist (item + boon) gets deadlier procs, not runaway frequency.
            const itemBurn   = onHitEffects.filter(e => e.type === 'burn_chance').reduce((a, e) => Math.max(a, e.value), 0)
            const itemFreeze = onHitEffects.filter(e => e.type === 'freeze_chance').reduce((a, e) => Math.max(a, e.value), 0)
            const burnChance   = Math.min(BURN_PROC_CAP,   itemBurn   + tide.burnChanceBoon)
            const freezeChance = Math.min(FREEZE_PROC_CAP, itemFreeze + tide.freezeChanceBoon)
            // Wildfire "Reignite": landing on an already-burning hull refreshes the
            // burn back to full duration (keep the fire alive without re-proccing).
            if (tide.reignite && enemyBurnRef.current.turns > 0) {
              enemyBurnRef.current = { turns: BURN_TURNS + tide.burnTurnsBonus, dmg: enemyBurnRef.current.dmg }
            }
            // Barrage: each of its sub-hits gets a proc roll — the first at full
            // chance, the rest at procFalloff. Collapsed to one effective-chance
            // roll (same odds, less noise). Other shots = a single roll.
            const megaHits = isMega ? megaAug?.hits : undefined
            const procRoll = (c: number) => {
              if (c <= 0) return false
              if (megaHits && megaHits.length > 1) {
                const falloff = megaAug?.procFalloff ?? 0.3
                const pNone = (1 - c) * Math.pow(1 - c * falloff, megaHits.length - 1)
                return Math.random() < (1 - pNone)
              }
              return Math.random() < c
            }
            if (burnChance > 0 && procRoll(burnChance)) {
              // Wildfire lengthens (turnsBonus) + heats (tickMult) every burn.
              const turns = BURN_TURNS + tide.burnTurnsBonus
              // 10% of the hit, heated by Wildfire up to the 20% ceiling.
              const tickPct = Math.min(BURN_TICK_MAX, BURN_TICK_PCT * tide.burnTickMult)
              const tickDmg = Math.max(1, Math.round(dmg * tickPct))
              enemyBurnRef.current = { turns, dmg: Math.max(tickDmg, tide.reignite ? enemyBurnRef.current.dmg : 0) }
              stepLines.push(`Incendiary hit! The ${enemy.name} catches fire (${enemyBurnRef.current.dmg}/turn, ${turns} turns).`)
              procStatus = 'burn'
            }
            if (freezeChance > 0 && procRoll(freezeChance)) {
              // Permafrost "Deep Freeze": 2 skipped turns instead of 1.
              enemyFreezePendingRef.current = tide.deepFreeze ? 2 : 1
              stepLines.push(tide.deepFreeze ? `Frozen shot! The ${enemy.name} locks in deep ice — its next two turns are frozen.` : `Frozen shot! The ${enemy.name} ices over — its next turn is frozen.`)
              procStatus = 'freeze'
            }
            // Don's Gauntlet — statusOnHit boons (Rattling Shot / Chainshot): a
            // landed hit rolls each to apply a timed status to the enemy.
            for (const s of tide.statusOnHitList) {
              if (procRoll(s.chance)) {
                applyEnemyStatus(s.status as StatusId, s.magnitude, s.turns)
                debuffApplied = s.status === 'slowed' ? 'snared' : 'marked'
                stepLines.push(`Your shot leaves the ${enemy.name} ${s.status === 'slowed' ? 'snared' : s.status}.`)
              }
            }
            // Kraken's Grip (boon): a landed hit can seize the enemy, making it
            // skip its next turn(s) — reuses the freeze skip machinery.
            if (tide.stunOnHitChance > 0 && procRoll(tide.stunOnHitChance)) {
              enemyFreezePendingRef.current = Math.max(enemyFreezePendingRef.current, tide.stunOnHitTurns)
              stepLines.push(tide.stunOnHitTurns > 1
                ? `Kraken's Grip! The deep seizes the ${enemy.name} — it's held for its next two turns.`
                : `Kraken's Grip! The deep seizes the ${enemy.name} — it loses its next turn.`)
              // Its own concussive look — a stun skips a turn like a freeze, but
              // it is a SEIZING, not an icing, and borrowing the frost visual
              // made the two effects indistinguishable on screen.
              procStatus = 'stun'
            }
            // Kraken's Grip (boon) — DETERMINISTIC. Stacks build on every landed
            // hit and never decay; the n-th drags the hull under. Crush is a
            // share of the ENEMY's max HP, so it keeps pace with the depth curve
            // instead of going stale the way a flat number would, and it is the
            // one damage source on the board that ignores your own guns.
            if (tide.gripHits > 0 && eHp > 0) {
              const coils = (gripStacksRef.current += 1)
              // Odds ramp as (coils/hits)^2 — squared rather than linear so an
              // early close stays a rare thrill instead of a coin flip that
              // makes the build-up decorative. At the last coil this is exactly
              // 1, so the deep ALWAYS closes by then and the boon can never
              // whiff a fight the way a flat chance could.
              const closes = coils >= tide.gripHits || Math.random() < Math.pow(coils / tide.gripHits, 2)
              if (closes) {
                gripStacksRef.current = 0
                enemyFreezePendingRef.current = Math.max(enemyFreezePendingRef.current, tide.gripTurns)
                // Paid per COIL SPENT, so a late close hits harder than an early
                // one and expected crush per hit is the per-coil value however
                // the rolls land. The roll moves the rhythm, not the damage.
                const crush = Math.max(1, Math.round(enemyHpMaxRef.current * tide.gripCrushPerStack * coils))
                eHp = Math.max(0, eHp - crush)
                stepLines.push(tide.gripTurns > 1
                  ? `Kraken's Grip! ${coils} coils close on the ${enemy.name} — held for its next two turns and crushed for ${crush}.`
                  : `Kraken's Grip! ${coils} coils close on the ${enemy.name} — it loses its next turn and takes ${crush}.`)
                onStat?.({ dmgDealt: crush })
                procStatus = 'stun'
                const fin = finishCheck(eHp, pHp, stepLines)
                eHp = fin.eHp; pHp = fin.pHp
                if (fin.executed) executeKind = fin.executed
                titheHealedOut += fin.tithed
              } else {
                stepLines.push(`The deep coils tighter around the ${enemy.name}. (${coils}/${tide.gripHits})`)
              }
            }
            // THE RACK — a landed hit fires a SPREAD. One roll, and every round the
            // equipped rack carries lands together through the shared status pipeline.
            // (Reapplying refreshes rather than stacking, per the status rules.)
            const rackWeaken  = onHitEffects.filter(e => e.type === 'weaken_on_hit').reduce((a, e) => Math.max(a, e.value), 0)
            const rackCorrode = onHitEffects.filter(e => e.type === 'corrode_on_hit').reduce((a, e) => Math.max(a, e.value), 0)
            const rackFeeble  = onHitEffects.filter(e => e.type === 'feeble_on_hit').reduce((a, e) => Math.max(a, e.value), 0)
            const rackChance  = Math.max(rackWeaken, rackCorrode, rackFeeble)
            // Plague Cannon: a landed CRITICAL gets its own shot at the spread,
            // rolled after the rack's own roll misses, so the two are independent
            // chances at the same payload rather than one replacing the other.
            const critSpread = playerCritShot
              ? onHitEffects.filter(e => e.type === 'crit_spread_chance').reduce((a, e) => Math.max(a, e.value), 0)
              : 0
            const spreadFired = (rackChance > 0 && procRoll(rackChance))
              || (rackChance > 0 && critSpread > 0 && Math.random() < critSpread)
            if (spreadFired) {
              const landed: string[] = []
              if (rackWeaken > 0) {
                applyEnemyStatus('weaken', CHAIN_SHOT_WEAKEN_PCT, CHAIN_SHOT_WEAKEN_TURNS)
                landed.push(`Weakened (−${Math.round(CHAIN_SHOT_WEAKEN_PCT * 100)}% damage)`)
              }
              if (rackCorrode > 0) {
                applyEnemyStatus('corrode', CHAIN_SHOT_CORRODE_PCT, CHAIN_SHOT_WEAKEN_TURNS)
                landed.push(`Corroded (barrier takes +${Math.round(CHAIN_SHOT_CORRODE_PCT * 100)}%)`)
              }
              if (rackFeeble > 0) {
                applyEnemyStatus('feeble', CHAIN_SHOT_FEEBLE_PCT, CHAIN_SHOT_WEAKEN_TURNS)
                landed.push(`Feeble (+${Math.round(CHAIN_SHOT_FEEBLE_PCT * 100)}% damage taken)`)
              }
              debuffApplied = 'marked'
              stepLines.push(`The rack fires! Scrap iron rips through the ${enemy.name} — ${landed.join(', ')}, ${CHAIN_SHOT_WEAKEN_TURNS} rounds.`)
            }
            // Leviathan's Cannon: a LANDED crit stokes the siege, advancing the
            // damage ramp by an extra turn. Counted here, past the dodge, so a
            // crit that got weaved aside buys nothing.
            if (playerCritShot) {
              const rampTurnsPerCrit = onHitEffects.filter(e => e.type === 'crit_ramp_turns').reduce((a, e) => Math.max(a, e.value), 0)
              if (rampTurnsPerCrit > 0) {
                critRampBonusRef.current += rampTurnsPerCrit
                stepLines.push(`The Leviathan stokes — that crit advances the siege a turn.`)
              }
            }
          }
          // Confluence "Thermal Shock" (Permafrost + Wildfire) — placed AFTER the
          // burn/freeze procs so it fires the instant the pair COMPLETES: with fire
          // already on the hull, the freeze you just landed shatters it on the same
          // shot (and vice-versa), instead of waiting for a later hit. Reads a
          // freeze active THIS round OR just applied (pending), plus any burn.
          // Consumes the freeze, so it's one detonation per freeze.
          if (
            dmg > 0 && eHp > 0 && tide.thermalShockMult > 0
            && (enemyFrozenThisRound || enemyFreezePendingRef.current > 0)
            && enemyBurnRef.current.turns > 0
          ) {
            const burst = Math.max(1, Math.round(dmg * tide.thermalShockMult))
            eHp = wardFloor(eHp - soakEnemyShield(burst))
            enemyFrozenRef.current = 0
            enemyFreezePendingRef.current = 0
            thermalBurstOut = burst
            onPlayerHit?.(dmg + burst)   // the shatter counts toward Biggest Hit
            stepLines.push(`Thermal Shock! Ice meets fire and the frozen hull shatters apart for ${burst}.`)
            // The base checks ran before the procs, so the shatter gets its own.
            // It used to re-check the Tithe alone, which meant a burst that drove
            // the hull into the execute window sat there instead of sinking.
            const fin = finishCheck(eHp, pHp, stepLines)
            eHp = fin.eHp; pHp = fin.pHp
            if (fin.executed) executeKind = fin.executed
            titheHealedOut += fin.tithed
          }
          // Nuke Fallout: the blast always leaves the wreck burning (overwrites a
          // weaker Incendiary proc with the stronger DoT). Capped per tick like
          // any burn so it can't snowball out of hand.
          if (isMega && megaAug?.fallout && dmg > 0 && eHp > 0) {
            const f = megaAug.fallout
            const tick = Math.max(1, Math.round(dmg * f.pct))   // uncapped (outgoing burn)
            enemyBurnRef.current = { turns: f.turns, dmg: tick }
            stepLines.push(`Fallout! The ${enemy.name} burns in the blast (${tick}/turn, ${f.turns} turns).`)
            procStatus = 'burn'
          }
          // Reflective affix: 50% chance to bounce a slice of the damage
          // back to the player on landing. Fires only when actual damage
          // landed (partial-dodge included; missed shots aren't reflected).
          if (
            affix?.reflectPct
            && dmg > 0
            && Math.random() < (affix.reflectChance ?? 1)
          ) {
            const reflected = Math.max(1, Math.round(dmg * affix.reflectPct))
            stepLines.push(`${enemy.name}'s plating reflects ${reflected} back at you.`)
            pHp = Math.max(0, pHp - soakPlayerShield(reflected, stepLines))
          }
          // Volatile affix: if this shot just killed the enemy, the wreck
          // explodes for 10% of the PLAYER'S REMAINING HP. Scales to how
          // healthy you are (more dangerous when full, less when low) and
          // is clamped so it can never sink you — leaves at least 1 HP.
          if (eHp === 0 && affix?.deathBurnRemainingPct && pHp > 1) {
            const raw  = Math.max(1, Math.round(pHp * affix.deathBurnRemainingPct))
            const burn = Math.min(raw, pHp - 1)
            if (burn > 0) {
              pHp = Math.max(1, pHp - burn)
              stepLines.push(`The wreck goes up in flame, scorching you for ${burn}.`)
            }
          }
          if (aegisWalled) {
            const n = aegisHitsRef.current
            stepLines.push(
              action === 'volley'
                ? 'Your volley hammers the wall. The wall does not care.'
                : n <= 1
                  ? 'The wall drinks your shot whole. Not a scratch on it.'
                  : n === 2
                    ? 'Another blow wasted on the wall. Piece by piece will not open it.'
                    : 'The wall wants everything you have in one blow. Nothing less.',
            )
            if (aegisDownOut === 'collapse') {
              stepLines.push('The wall groans, buckles, and finally comes apart under sheer battering!')
            }
            splatText = 'Walled'
            splatColor = '#e8d8a8'
          } else if (railgunGraze) {
            stepLines.push(`The ${enemy.name} twists aside, but the beam still grazes clean through for ${dmg}.`)
            splatText = `-${dmg}`
            splatColor = '#5fd0ff'
          } else if (partialDodge) {
            stepLines.push(action === 'volley'
              ? `Enemy partially dodges your volley — grazed for ${dmg}.`
              : `Enemy partially dodges — grazed for ${dmg}.`)
            splatText = `-${dmg}`
            splatColor = '#94a3b8'
          } else if (lockedAimResult === 'critical') {
            stepLines.push(action === 'volley'
              ? `Critical volley! Blasts them for ${dmg} damage.`
              : `Critical hit! You blast them for ${dmg} damage.`)
            splatText = `-${dmg}`
            splatColor = '#fbbf24'
          } else {
            stepLines.push(action === 'volley'
              ? `You unleash a volley for ${dmg} damage.`
              : `You fire for ${dmg} damage.`)
            splatText = `-${dmg}`
            splatColor = '#ef4444'
          }
          // Enemy barrier — surface the soak so the player sees why the hull
          // barely moved, and correct the splat (full soak reads "Blocked").
          // Skipped on a Railgun pierce (shieldAbsorbedOut stays 0 there).
          if (shieldAbsorbedOut > 0) {
            const hullDmg = Math.max(0, dmg - shieldAbsorbedOut)
            stepLines.push(enemyShieldRef.current > 0
              ? `Its barrier soaks ${shieldAbsorbedOut} of the shot.`
              : `Its barrier soaks ${shieldAbsorbedOut} and shatters.`)
            splatText = hullDmg > 0 ? `-${hullDmg}` : 'Blocked'
            if (hullDmg <= 0) splatColor = '#8fb7ff'
          }
          // Leviathan's Hunger heal line — pushed here so it follows the shot
          // it fed on, not before it.
          if (lifestealHealedOut > 0) stepLines.push(`${lifestealLabel || "Leviathan's Hunger drinks the wound"} — +${lifestealHealedOut} HP.`)
          if (overkillHealedOut > 0) stepLines.push(`The kill spills over — you reclaim +${overkillHealedOut} HP from the overkill.`)
        } else {
          // The enemy's INTENDED hit, captured before ANY of the player's
          // mitigation/anchor/shield reduces it — Spiteful Wake reflects off
          // this (see below) so defense doesn't starve the thorns.
          const rawIncoming = dmg
          // Cutlass Guard (boon): a chance to PARRY a landing blow outright —
          // take nothing, and (higher tiers) lash a slice of the intended hit
          // back. A parry counts as an avoided hit, so it suppresses the on-hit
          // effects below (shark's bite gates on dmg>0; Spiteful Wake on !parried).
          let parried = false
          if (tide.parryChance > 0 && rawIncoming > 0 && Math.random() < tide.parryChance) {
            parried = true
            parriedHitOut = true
            dmg = 0
            if (tide.parryReflectPct > 0 && eHp > 0) {
              const reflect = Math.max(1, Math.round(rawIncoming * tide.parryReflectPct))
              eHp = wardFloor(eHp - soakEnemyShield(reflect))
              stepLines.push(`Cutlass Guard! You turn the ${enemy.name}'s blow and lash back for ${reflect}.`)
              const fin = finishCheck(eHp, pHp, stepLines)
              eHp = fin.eHp; pHp = fin.pHp
              if (fin.executed) executeKind = fin.executed
              titheHealedOut += fin.tithed
            } else {
              stepLines.push(`Cutlass Guard! You turn the ${enemy.name}'s blow clean aside.`)
            }
          }
          // Aegis of the Deep: the FIRST enemy blow to reach you each fight has a
          // chance to be braced outright, with no dodge involved — the one thing
          // ordinary parry_chance cannot do, since it only ever fires on a dodge
          // you already won. A blow the player DODGED never gets here (that branch
          // continues above), so this is genuinely "the first one that connects".
          // Skipped when Cutlass Guard already turned it: one parry per blow.
          if (rawIncoming > 0) enemyAttacksThisFightRef.current += 1
          if (!parried && rawIncoming > 0 && enemyAttacksThisFightRef.current === 1) {
            const firstBlowChance = getActiveEffects(liveItems)
              .filter(e => e.type === 'first_blow_parry_chance').reduce((a, e) => Math.max(a, e.value), 0)
            if (firstBlowChance > 0 && Math.random() < firstBlowChance) {
              parried = true
              parriedHitOut = true
              dmg = 0
              const reflectPct = getActiveEffects(liveItems)
                .filter(e => e.type === 'parry_reflect_pct').reduce((a, e) => Math.max(a, e.value), 0)
              if (reflectPct > 0 && eHp > 0) {
                const reflect = Math.max(1, Math.round(rawIncoming * reflectPct))
                eHp = wardFloor(eHp - soakEnemyShield(reflect))
                stepLines.push(`The Aegis braces for the opening blow and throws ${reflect} straight back.`)
                const fin = finishCheck(eHp, pHp, stepLines)
                eHp = fin.eHp; pHp = fin.pHp
                if (fin.executed) executeKind = fin.executed
                titheHealedOut += fin.tithed
              } else {
                stepLines.push(`The Aegis braces — the opening blow glances clean off the hull.`)
              }
            }
          }
          // Hull plating (raid items) + crew survivability effects (Bulwark
          // cuts, Soft Shell adds) both scale incoming damage here.
          // Tide layer: tide.inDmgMult folds in incomingDmgMult tide
          // effects (Drop sea anchor: ×0.85 next fight, etc.).
          // Status layer: feeble ↑ / fortify ↓ on the player (Ch4 pipeline).
          const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult * pStatus.dmgTakenMult
          if (takenMult !== 1 && dmg > 0) dmg = Math.max(1, Math.floor(dmg * takenMult))
          // Quartermaster's Anchor — cut the next incoming hit. Crits punch
          // through unless the milestone absorbs them. Consumed only when it
          // actually mitigates (a crit it can't touch leaves it set for later).
          if (anchorReductionRef.current != null && dmg > 0 && (!enemyCrit || anchorAbsorbsCritsRef.current)) {
            const before = dmg
            dmg = Math.max(1, Math.round(dmg * (1 - anchorReductionRef.current)))
            stepLines.push(`The sea anchor holds — the blow is cut (${before} → ${dmg}).`)
            anchorReductionRef.current = null
            anchorConsumed = true
          } else if (anchorReductionRef.current != null && dmg > 0 && enemyCrit && !anchorAbsorbsCritsRef.current) {
            // A crit punches through the base anchor (only the Lv100 anchor cuts
            // crits). The brace is NOT spent — it's saved for the next blow — so
            // say so out loud, or a full-damage crit with the Braced chip still
            // showing reads as a broken ability.
            stepLines.push(`A critical hit punches clean through the sea anchor. The brace holds for the next blow.`)
          }
          // Dampener Plate (item, id made_man): a single hit exceeding max_hit_pct of your MAX HP has
          // a max_hit_chance shot at being knocked down to that ceiling. Rolled
          // after mitigation, before the shield soaks it, so a burst / ultimate
          // gets defanged HALF the time while chip damage is left alone. Multiple
          // caps take the tightest (lowest); the chance defaults to always (1).
          const madeManItems = getActiveEffects(liveItems)
          const hitCapPct = madeManItems.filter(e => e.type === 'max_hit_pct').reduce((a, e) => Math.min(a, e.value), 1)
          if (hitCapPct < 1 && dmg > 0) {
            const ceil = Math.max(1, Math.round(playerHpMax * hitCapPct))
            const capChance = madeManItems.filter(e => e.type === 'max_hit_chance').reduce((a, e) => Math.max(a, e.value), 0) || 1
            if (dmg > ceil && Math.random() < capChance) {
              const before = dmg
              dmg = ceil
              stepLines.push(`Dampener Plate holds — the blow is blunted (${before} → ${dmg}).`)
            }
          }
          // Shield pool — soaks from the pool before HP. Seeded by the Stormward
          // boon at fight start and/or topped up by the Abyssal Tide ability;
          // carries across turns until drained. (Same helper every other incoming
          // source uses, so a normal hit and a riposte drain it identically.)
          dmg = soakPlayerShield(dmg, stepLines)
          shieldChanged = true
          if (dmg > 0) onStat?.({ dmgTaken: dmg })
          pHp = Math.max(0, pHp - dmg)
          // Warden of the Deep: a hit that gets through to the hull can rattle a
          // cannonball loose into the breech. Rolled on damage that reached HP
          // (not on a blow the ward or shield ate whole), so the warden is paid
          // for what he actually absorbs. Silent when the magazine is already full.
          if (dmg > 0) {
            const chargeOnHit = getActiveEffects(liveItems)
              .filter(e => e.type === 'charge_on_hit_chance').reduce((a, e) => Math.max(a, e.value), 0)
            if (chargeOnHit > 0 && pCharges < playerMaxCharges && Math.random() < chargeOnHit) {
              pCharges += 1
              stepLines.push(`The Warden answers the blow — a cannonball rolls into the breech. (${pCharges}/${playerMaxCharges})`)
            }
          }
          // Contract facts (Not a Scratch): only a NORMAL offensive shot that
          // lands damage counts — telegraphed specials/ultimates are excepted.
          if (dmg > 0 && (action === 'fire' || action === 'volley' || action === 'mega')) {
            contractFactsRef.current.nonSpecialHitsTaken++
          }
          // ── SHARK'S BITE (Raid 8 shared mechanic) ─────────────────────────
          // Don Finleone's court doesn't just hurt you, it disarms you: a shot
          // that actually connects (dmg > 0 — a dodge/brace or a full shield
          // spares your rack) has a per-shark chance to tear a loaded cannonball
          // off your magazine. Reload recovers it. Only real offensive shots
          // bite (fire / volley / ultimate), never a reload/dodge/repair step.
          // Cutpurse Tide curse: grants/raises the bite chance on EVERY enemy.
          const biteChance = Math.min(1, (enemy.chargeBiteChance ?? 0) + tide.enemyChargeSteal)
          if (
            dmg > 0 && pCharges > 0
            && biteChance > 0
            && (action === 'fire' || action === 'volley' || action === 'ultimate')
            && Math.random() < biteChance
          ) {
            pCharges = Math.max(0, pCharges - 1)
            stepLines.push(`The ${enemy.name} rips a loaded cannonball clean off your rack.`)
          }
          // Spiteful Wake (boon): the attacker takes a slice of what it SWUNG
          // for straight back — read off the PRE-mitigation intended hit
          // (rawIncoming), so Ironhide, fight-shields and heavy plating don't
          // starve the thorns (a fully-soaked hit still bites back). Never
          // reflects onto an already-sunk enemy.
          if (tide.retaliatePct > 0 && rawIncoming > 0 && eHp > 0 && !parried) {
            // Iron Tempest confluence multiplies the reflected damage.
            const thorns = Math.max(1, Math.round(rawIncoming * tide.retaliatePct * tide.retaliateBoostMult))
            eHp = wardFloor(eHp - soakEnemyShield(thorns))
            stepLines.push(tide.retaliateBoostMult > 1 ? `Iron Tempest! The blow is flung back for ${thorns}.` : `Spiteful Wake bites back for ${thorns}.`)
            const fin = finishCheck(eHp, pHp, stepLines)
            eHp = fin.eHp; pHp = fin.pHp
            if (fin.executed) executeKind = fin.executed
            titheHealedOut += fin.tithed
          }
          // Scorching / Glacial affixes: the elite's landed hit has a chance to
          // set the player ablaze (DoT scaled to this hit, like the player's
          // Incendiary) or freeze them (lose next turn, like Frozen Cannonball).
          // Only on a hit that actually connected, and not on the killing blow.
          if (dmg > 0 && pHp > 0) {
            if (affix?.burnChance && Math.random() < affix.burnChance) {
              const tickDmg = Math.max(1, Math.min(Math.round(dmg * BURN_TICK_PCT), Math.round(playerHpMax * BURN_CAP_PCT)))
              playerBurnRef.current = { turns: BURN_TURNS, dmg: tickDmg }
              procStatus = 'burn'
              stepLines.push(`Scorching hit! Your ship catches fire (${tickDmg}/turn, ${BURN_TURNS} turns).`)
            } else if (affix?.freezeChance && Math.random() < affix.freezeChance) {
              playerFreezePendingRef.current = true
              procStatus = 'freeze'
              stepLines.push('Glacial hit! Your ship ices over — your next turn is frozen.')
            }
          }
          // Vampiric affix: 50% chance to heal a fraction of dealt
          // damage. Capped at its maxHP. Fires after the damage lands so
          // the heal feels like a follow-up, not a pre-emptive negation.
          if (
            (affix?.lifestealPct || tide.enemyLifesteal > 0)   // The Tithe curse grants it to any enemy
            && dmg > 0
            && eHp > 0 && eHp < enemyHpMaxRef.current
            && Math.random() < (affix?.lifestealChance ?? 1)
          ) {
            const stealPct = Math.max(affix?.lifestealPct ?? 0, tide.enemyLifesteal)
            const stolen = Math.min(enemyHpMaxRef.current - eHp, Math.max(1, Math.round(dmg * stealPct)))
            if (stolen > 0) {
              eHp += stolen
              enemyHealOut = stolen
              stepLines.push(`${enemy.name} drinks back ${stolen} HP from the hit.`)
            }
          }
          if (dmg === 0) {
            // The shield ate the whole shot — show the block, not a "-0".
            splatText = 'Shielded'
            splatColor = '#7dd3fc'
          } else if (partialDodge) {
            stepLines.push(action === 'ultimate'
              ? `You partially dodge ${enemy.ultimate?.name ?? 'the ultimate'} — grazed for ${dmg}.`
              : action === 'volley'
              ? `You partially dodge the volley — grazed for ${dmg}.`
              : `You partially dodge — grazed for ${dmg}.`)
            splatText = `-${dmg}`
            splatColor = '#94a3b8'
          } else if (action === 'ultimate') {
            if (enemy.ultimate?.line) stepLines.push(`${enemy.ultimate.name}! ${enemy.ultimate.line}`)
            stepLines.push(`The full battery empties into you for ${dmg} damage.`)
            splatText = `-${dmg}`
            splatColor = '#ff4d6d'
          } else if (enemyCrit) {
            stepLines.push(action === 'volley'
              ? `Critical volley! Enemy blasts you for ${dmg} damage.`
              : `Critical hit! Enemy lands a heavy shot for ${dmg} damage.`)
            splatText = `-${dmg}`
            splatColor = '#fbbf24'
          } else {
            stepLines.push(action === 'volley'
              ? `Enemy unleashes a volley for ${dmg} damage.`
              : `Enemy fires for ${dmg} damage.`)
            splatText = `-${dmg}`
            splatColor = '#ef4444'
          }
        }
      }

      // Cannonade streak COMMIT — only now that the shot has landed (a dodged
      // shot never reaches here; it continues at the dodge branch). Bake the
      // resulting streak into the step so the badge + log fire in lockstep with
      // the animation, and add the build / break log line.
      let cannonadeStep: number | undefined
      if (who === 'player' && (action === 'fire' || action === 'volley' || action === 'mega') && tide.critStreakPerStack > 0) {
        const prior = critStreakRef.current
        if (lockedAimResult === 'critical') {
          // Broadside Duel: a counter also stacks the streak harder.
          const inc = 1 + (counterProc ? tide.counterBonusStack : 0)
          critStreakRef.current = Math.min(tide.critStreakMaxStacks, prior + inc)
          if (critStreakRef.current >= 2) stepLines.push(`${streakLabel} x${critStreakRef.current}. +${Math.round(tide.critStreakPerStack * critStreakRef.current * 100)}% damage while you hold it.`)
        } else if (counterProc && tide.counterBonusStack > 0) {
          // Broadside Duel: winning the exchange holds your rhythm even on a
          // non-crit — the chain doesn't break, and the win still stacks it.
          critStreakRef.current = Math.min(tide.critStreakMaxStacks, prior + tide.counterBonusStack)
          stepLines.push(`Broadside Duel — you win the exchange and the guns keep their rhythm (${critStreakRef.current} stack${critStreakRef.current === 1 ? '' : 's'}).`)
        } else {
          if (prior >= 2) stepLines.push(`${streakLabel} broken. Back to zero.`)
          critStreakRef.current = 0
        }
        cannonadeStep = critStreakRef.current
      }

      pushStep({
        who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor,
        big: (who === 'player' && lockedAimResult === 'critical') || (who === 'enemy' && enemyCrit),
        logLines: stepLines,
        procStatus,
        stoleCharge: stoleChargeOut || undefined,
        parriedHit: parriedHitOut || undefined,
        enemyHeal: enemyHealOut,
        lifestealHeal: lifestealHealedOut || undefined,
        carapaceSoak: carapaceSoaked,
        thermalShock: thermalBurstOut || undefined,
        executed: executeKind,
        titheHeal: titheHealedOut || undefined,
        debuffApplied,
        cannonade: cannonadeStep,
        aegisDown: aegisDownOut,
      })

      // Phase 2 revival — when the player's killing blow drops the boss
      // to 0 AND they carry a phase2 config, push a synthetic revival
      // step right after the kill step. The kill step shows the lethal
      // hit landing + HP bar going to 0 (the player thinks it's over);
      // the revival step then surfaces the dialogue line, the screen
      // flash, the big PHASE 2 callout, and refills HP to revivePct of
      // max. We break the loop after — neither side acts again this
      // turn; phase 2 begins fresh next turn. Guard with
      // enemyPhaseRef.current === 1 so phase 2 deaths trigger the real
      // end of fight (no infinite resurrection).
      if (
        eHp <= 0
        && who === 'player'
        && (action === 'fire' || action === 'volley' || action === 'mega')
        && enemyPhaseRef.current <= phaseList.length
      ) {
        const nextCfg = phaseList[enemyPhaseRef.current - 1]   // the phase we rise into
        enemyPhaseRef.current += 1
        enemyPatternIdxRef.current = 0; bossAbilityTurnRef.current = 0; bossAbilityUsedRef.current = false; bossAbilityOnRef.current = 0
        enemyFeintStreakRef.current = 0
        // The Last Wall arms at SIM time (next resolveTurn must see it); the
        // visual raises when the transition step PLAYS, via step.phaseAegis.
        if (nextCfg.aegis) {
          aegisRef.current = { name: nextCfg.aegis.name, hitsLeft: nextCfg.aegis.hitsToBreak }
          aegisHitsRef.current = 0
        }
        const revivedHp = Math.max(1, Math.floor(enemyHpMaxRef.current * nextCfg.revivePct))
        eHp = revivedHp
        pushStep({
          who: 'enemy',
          // Reload as the "stays in place" cosmetic action — no projectile,
          // no splat. playStep's catch-all branch syncs HP for these steps,
          // which is exactly what we need (HP refills from 0 to revivePct).
          action: 'reload',
          pHp, eHp, pCharges, eCharges,
          splatTarget: null,
          splatText: '',
          splatColor: '#ef4444',
          logLines: [`${enemy.name}: "${nextCfg.dialogueLine}"`],
          phaseTransition: true,
          phaseNumber: enemyPhaseRef.current,
          phaseBadge: nextCfg.badge,
          phaseCheck: nextCfg.check,
          phaseAegis: nextCfg.aegis ? { name: nextCfg.aegis.name } : undefined,
        })
        break
      }

      // Frenzied affix: when this enemy fires or volleys, it has a chance
      // to fire AGAIN on the same turn. Implemented as an extra step
      // appended right after the original so the animation reads as one
      // beat → a second beat. Only fires if the enemy is still alive and
      // the player is still alive (no kicking corpses).
      if (
        who === 'enemy'
        && affix?.doubleFireChance
        && (action === 'fire' || action === 'volley')
        && pHp > 0 && eHp > 0
        && Math.random() < affix.doubleFireChance
      ) {
        const base2 = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
        let dmg2 = base2 // frenzy follow-up is always a single shot (not volley)
        // Statuses mirror the primary fire branch (weaken/enrage on the enemy).
        if (eStatus.dmgDealtMult !== 1) dmg2 = Math.max(1, Math.floor(dmg2 * eStatus.dmgDealtMult))
        // Phase 2 boss damage bump also covers the Frenzied bonus shot,
        // mirroring the primary fire branch above. Otherwise the headline
        // attack scales but the affix follow-up under-hits in phase 2.
        if (enemyPhaseRef.current >= 2 && phaseList[enemyPhaseRef.current - 2]) {
          dmg2 = Math.max(1, Math.floor(dmg2 * phaseList[enemyPhaseRef.current - 2].damageMult))
        }
        const baseCrit2 = enemy.critChance ?? 0
        const effCrit2  = affix?.critMult ? Math.min(1, baseCrit2 * affix.critMult) : baseCrit2
        let frenziedCrit = false
        if (Math.random() < effCrit2) { frenziedCrit = true; dmg2 = Math.floor(dmg2 * 1.5) }
        const takenMult2 = incomingDmgMult * (1 + mods.damageTakenPct / 100) * pStatus.dmgTakenMult
        if (takenMult2 !== 1 && dmg2 > 0) dmg2 = Math.max(1, Math.floor(dmg2 * takenMult2))
        // The bonus shot is a real enemy fire, so it soaks the player shield just
        // like the primary one (it used to slip straight past the buffer).
        const frenzyLines = [`Frenzied! ${enemy.name} fires again for ${dmg2}${frenziedCrit ? ' (critical!)' : ''}.`]
        const dmg2Net = soakPlayerShield(dmg2, frenzyLines)
        pHp = Math.max(0, pHp - dmg2Net)
        // Vampiric carry-through on the Frenzied second shot — same chance
        // gate as the primary fire so an enemy with Frenzied + Vampiric
        // can occasionally lifesteal from the bonus shot too. Reads dmg2 (what
        // it fired), same as the primary shot's vampiric.
        if (
          dmg2 > 0
          && eHp > 0 && eHp < enemyHpMaxRef.current
          && affix.lifestealPct
          && Math.random() < (affix.lifestealChance ?? 1)
        ) {
          const stolen2 = Math.min(enemyHpMaxRef.current - eHp, Math.max(1, Math.round(dmg2 * affix.lifestealPct)))
          eHp += stolen2
        }
        pushStep({
          who: 'enemy', action: 'fire',
          pHp, eHp, pCharges, eCharges,
          splatTarget: 'player',
          splatText: dmg2Net > 0 ? `-${dmg2Net}` : 'Shielded',
          splatColor: dmg2Net > 0 ? (frenziedCrit ? '#fbbf24' : '#ef4444') : '#7dd3fc',
          big: frenziedCrit && dmg2Net > 0,
          logLines: frenzyLines,
        })
      }
    }

    // Animate the pre-computed steps sequentially. Each step:
    //   1. Update HP/charges
    //   2. Show hitsplat (if applicable)
    //   3. Clear hitsplat after ~600ms so it exits cleanly
    //   4. Wait ~800ms total before next step (so the second hitsplat starts ~200ms after the first clears)
    // Tight timing: cannon shot + splat fire as one beat. Step gap is sized
    // to fit (cannon flight 220ms + splat hold 480ms + small buffer 200ms).
    const PROJECTILE_FLIGHT_MS = 220
    const SPLAT_HOLD_MS        = 480
    const STEP_GAP_MS          = 980
    // Pause after the speed-roll line lands so the player reads who's
    // acting first before the action lines start streaming in.
    const SPEED_LINE_HOLD_MS   = 750

    function playStep(i: number) {
      if (i >= steps.length) {
        setTimeout(() => {
          if (pHp <= 0) {
            const vRevive = tryVengeanceRevive()
            if (vRevive) {
              // Laz FIRST — cheat the killing blow before the anchor is ever spent.
              pHp = vRevive.hp
              setPlayerHp(vRevive.hp)
              setResolveLog(prev => [...prev, `The vengeance ward erupts! You cheat the Locker, surge back to ${vRevive.hp} HP, and hit +${Math.round(vRevive.buffPct * 100)}% for the rest of the fight.`])
              // fall through to the normal next-turn continuation below
            } else if (anchorSaveAvailable && !anchorUsedRef.current) {
              // Quartermaster's Anchor: cling on at 1 HP instead of
              // sinking. Once per mount; parent spends the run charge.
              anchorUsedRef.current = true
              onAnchorSave?.()
              onCheatedDeath()
              pHp = 1
              setPlayerHp(1)
              setAnchorSaveFx(k => k + 1)
              vibrate([0, 60, 40, 90])
              setResolveLog(prev => [...prev, 'The anchor holds. You cling on at 1 HP.'])
              // fall through to the normal next-turn continuation below
            } else {
              setSubPhase('done'); onPlayerDefeated(); return
            }
          }
          if (eHp <= 0 && enemyPhaseRef.current <= phaseList.length) {
            // Multi-phase SAFETY NET: a non-attack killing blow (a burn tick, a
            // reflected hit, etc.) that reaches here with phases remaining revives
            // the boss instead of ending it. The fire/volley/mega + ability paths
            // pre-revive, so they never arrive here with eHp<=0. Falls through to
            // the normal turn continuation below (no return).
            const nextCfg = phaseList[enemyPhaseRef.current - 1]
            enemyPhaseRef.current += 1
            enemyPatternIdxRef.current = 0; bossAbilityTurnRef.current = 0; bossAbilityUsedRef.current = false; bossAbilityOnRef.current = 0
            enemyFeintStreakRef.current = 0
            const revivedHp = Math.max(1, Math.floor(enemyHpMaxRef.current * nextCfg.revivePct))
            eHp = revivedHp; enemyHpRef.current = revivedHp; setEnemyHp(revivedHp)
            // HIS PLATE COMES BACK WITH HIM. enemy.shieldPct was applied ONCE at
            // mount, so across a six-phase boss he got one shield for the whole
            // fight and every later phase opened bare. Restoring it per phase is
            // what makes armour a running theme he can then reinforce (Old Armour).
            bossWardBuffRef.current = 0
            bossWardRef.current = 0; setWardUp(false)
            bossForesightRef.current = 0; setForeseeUp(false)
            // Per-phase plate: a phase can name its own shieldPct so armour
            // ESCALATES across the fight instead of every phase reopening at
            // the same wall. Unset falls back to the enemy's flat pool.
            const phaseShield = nextCfg.shieldPct != null
              ? Math.round(enemyHpMaxRef.current * nextCfg.shieldPct)
              : enemyShieldMax
            enemyShieldRef.current = phaseShield
            setEnemyShieldHp(phaseShield)
            const n = enemyPhaseRef.current
            setEnemyPhase(n)
            shotsAtPhaseStartRef.current = shotsThisFightRef.current
            setPhaseCallout(nextCfg.badge ?? `Phase ${n}`)
            setPhaseFlash(true); setTimeout(() => setPhaseFlash(false), 2400)
            setTimeout(() => setResolveLog(prev => [...prev, `${enemy.name}: "${nextCfg.dialogueLine}"`]), 300)
            armMechanicCheck(nextCfg.check)
            vibrate([0, 50, 40, 80])
          } else if (eHp <= 0) {
            // Pokemon-style victory beat: stream the kill into the log,
            // then hand control back to the parent. The parent uses this
            // delay to either advance to the next enemy in-place or roll
            // into a loot screen (boss only).
            setSubPhase('done')
            // Sink animation: ~1.3s fall + fade, lined up with the kill
            // log + onEnemyDefeated cbDelay below so the ship is gone
            // by the time the loot/next-enemy beat fires.
            // No white kill-flash — the explosion burst + sink animation
            // carry the kill (the flash read as a jarring whiteout on the sink).
            setEnemySinking(true)
            // THE DEFEAT CALLOUT, reusing the phase-change banner. Skipped when
            // this boss has a bespoke defeat sequence, since that carries the
            // moment itself and a banner on top of it would just collide.
            if (isBoss && bossDefeatedText && !defeatSequence?.lines?.length) {
              setPhaseCallout(bossDefeatedText)
              setPhaseFlash(true)
              setTimeout(() => setPhaseFlash(false), 2200)
            }
            // THE FINALE gets its own ending. The ordinary sink still plays
            // underneath (his hull still goes down), but the hand-off to loot
            // waits for the beat, and the overlay carries the moment.
            if (defeatSequence?.lines?.length) {
              setFinaleDefeat(defeatSequence.lines)
              cameraShake('nuke')
              vibrate([0, 80, 60, 140])
            }
            setTimeout(() => setResolveLog(prev => [...prev, `You sank the ${enemy.name}!`]), 200)
            let cbDelay = 1000
            if (killReward?.gold) {
              setTimeout(() => setResolveLog(prev => [...prev, `Plunder: +${killReward.gold} ⟡`]), 500)
              cbDelay = 1300
            }
            if (killReward?.xp) {
              setTimeout(() => setResolveLog(prev => [...prev, `Nav XP: +${killReward.xp}`]), 800)
              cbDelay = 1600
            }
            // Sank without firing a shot this fight (riposte / crew ability / DoT).
            if (shotsThisFightRef.current === 0) onNoShotKill?.()
            emitContractFacts()
            // The finale overlay runs ~3s + 1s per line and calls back when it
            // is done, so the loot screen never lands on top of his last words.
            if (defeatSequence?.lines?.length) {
              finaleDoneRef.current = () => onEnemyDefeated(pHp, pCharges)
            } else {
              setTimeout(() => onEnemyDefeated(pHp, pCharges), cbDelay)
            }
            return
          }
          turnRef.current++; setTurn(turnRef.current)
          setLastPlayerAction(pAction)
          // Mechanic-check countdown: the turn it armed on doesn't tick (window
          // opens next turn); after that, each resolved turn burns one, and when
          // it hits zero the check resolves (countered or the consequence lands).
          if (pendingCheckRef.current) {
            if (checkArmedThisTurnRef.current) {
              checkArmedThisTurnRef.current = false
            } else if (isCheckSatisfied(pendingCheckRef.current)) {
              // Right move already made — cancel the phase NOW instead of making
              // the player wait out the countdown wondering if it worked.
              counterMechanicCheck(pendingCheckRef.current, true)
            } else {
              checkTurnsLeftRef.current -= 1
              if (checkTurnsLeftRef.current <= 0) resolveMechanicCheck()
              else setPendingCheck(pc => (pc ? { ...pc, turnsLeft: checkTurnsLeftRef.current } : pc))
            }
          }
          setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
          // Flare Barrage interrupt — every few turns the admiral screens itself
          // with false flares the player must swat before acting.
          if (flareCount > 0 && turnRef.current % FLARE_EVERY === 0) {
            setSubPhase('flares')
          } else {
            setSubPhase('await_input')
          }
        }, 400)
        return
      }

      const step = steps[i]
      // THE SUMMON. Unconditional and FIRST, because an ability step is shaped
      // like a reload (no splat target, no attack FX) and so never reaches the
      // attack-FX branches further down. Any step carrying a summon plays it.
      // A FLURRY LANDS AS A FLURRY. The blitz resolves as one damage number,
      // but four fast hits shown as a single splat reads as one heavy shot, so
      // the per-shot list is replayed as staggered splats on the player hull.
      // Purely presentational: the hull total already moved with the step.
      // A HEAVY ABILITY STRIKE. His guns actually fire and the hull actually
      // takes it: without this the Primeval Maw hit for 149 with nothing on
      // screen but the summon splash and a number.
      if (step.heavyStrike) {
        setEnemyMuzzle({ key: Date.now(), kind: 'crit' })
        playStepChainRef.current.push(setTimeout(() => setEnemyMuzzle(null), 700))
        playStepChainRef.current.push(setTimeout(() => {
          setPlayerImpact({ key: Date.now() + 3, kind: 'crit' })
          cameraShake('crit')
          vibrate([0, 30, 24, 60])
          playStepChainRef.current.push(setTimeout(() => setPlayerImpact(null), 700))
        }, 180))
      }
      if (step.blitzHits && step.blitzHits.length) {
        step.blitzHits.forEach((h, k) => {
          playStepChainRef.current.push(setTimeout(() => {
            setPHitsplat({ key: Date.now() + k, text: `-${h}`, color: '#fb923c' })
            setEnemyMuzzle({ key: Date.now() + k + 700, kind: 'normal' })
            playStepChainRef.current.push(setTimeout(() => setEnemyMuzzle(null), 200))
            setPlayerImpact({ key: Date.now() + k + 900, kind: 'normal' })
            playStepChainRef.current.push(setTimeout(() => setPlayerImpact(null), 260))
            vibrate(8)
            if (k === 0) cameraShake('hit')
          }, k * 110))
        })
        playStepChainRef.current.push(setTimeout(() => setPHitsplat(null), step.blitzHits.length * 110 + 420))
      }
      if (step.summon) {
        setAbilitySummon({
          key: Date.now(), label: step.summon.label, name: step.summon.name,
          color: step.summon.color, image: step.summon.image, chase: false, skinId: null,
        })
        playStepChainRef.current.push(setTimeout(() => setAbilitySummon(s => (s && s.image === step.summon?.image ? null : s)), SUMMON_TOTAL_MS))
      }
      const isAttack  = step.action === 'fire' || step.action === 'volley' || step.action === 'mega' || step.action === 'ultimate'
      const isDodged  = isAttack && step.splatText === 'Dodged'

      // Phase 2 transition — this is the dramatic revival beat. The ref
      // is already flipped (in resolveTurn) so combat reads phase 2 on
      // the next turn; here we flip the visual state so the nameplate,
      // PHASE 2 badge, and ship halo all paint immediately. The screen
      // flash + center-screen PHASE 2 overlay carry the moment, held
      // for ~1.1s so the player has time to read "PHASE 2" before the
      // action menu re-enables. Paired with a longer step gap below.
      if (step.phaseTransition) {
        const n = step.phaseNumber ?? 2
        setEnemyPhase(n)
        setPhaseCallout(step.phaseBadge ?? `Phase ${n}`)
        setPhaseFlash(true)
        setTimeout(() => setPhaseFlash(false), 2400)
        // Arm this phase's mechanic check (if any) as the phase begins.
        armMechanicCheck(step.phaseCheck)
        // Raise The Last Wall's visual as the transition step plays (chip +
        // hull ring + popup card all key off aegisVis).
        if (step.phaseAegis) setAegisVis({ name: step.phaseAegis.name })
      }
      // The wall came down on this step — Mega shatter gets the heavy haptic;
      // a battered collapse just clears quietly (the log line carries it).
      if (step.aegisDown) {
        setAegisVis(null)
        if (step.aegisDown === 'shatter') vibrate([0, 60, 40, 90])
      }

      // Stream this step's log lines into the visible log as the step plays.
      // Multi-line steps (e.g. "Enemy fails dodge" + "You fire for X") cascade
      // with a small stagger so each line is felt individually.
      step.logLines.forEach((line, j) => {
        setTimeout(() => {
          setResolveLog(prev => [...prev, line])
        }, j * 220)
      })

      // Counter-Battery proc — a center "COUNTER-BATTERY" flash + a cyan clash
      // spark bursting on the enemy hull as its shot is knocked down.
      if (step.countered) {
        const bk = Date.now() + i + 31
        setBoonFlash({ label: 'COUNTER-BATTERY', sub: 'Their broadside — smashed from the air', color: '#7dd3fc', key: bk })
        playStepChainRef.current.push(setTimeout(() => setBoonFlash(bf => (bf && bf.key === bk ? null : bf)), 1500))
        setEnemyImpact({ key: bk + 1, kind: 'normal' })
        setEnemyShakeKind('hit'); setEnemyShakeKey(k => k + 1)
        playStepChainRef.current.push(setTimeout(() => setEnemyImpact(null), 520))
        vibrate([0, 35, 25, 55])
      }
      // Executioner / Coup de Grâce — the finishing blow. A beat after the step
      // opens: a gold center flash + hard impact, so a synergy kill reads as an
      // earned execution rather than a hull quietly hitting zero.
      //
      // Lives at the TOP of the step, not inside the enemy-splat branch it used
      // to sit in. Now that thorns, both parries, a burn tick and the counter
      // shot can all execute, the finish has to fire on steps that splat on the
      // PLAYER (a dodge that reflected) or nowhere at all — and in that branch
      // the old placement was simply never reached.
      if (step.executed) {
        const xk = Date.now() + i + 23
        const coup = step.executed === 'coup'
        playStepChainRef.current.push(setTimeout(() => {
          setBoonFlash({ label: coup ? 'COUP DE GRÂCE' : 'EXECUTIONER', sub: coup ? 'The crit finds the killing mark' : 'Dropped past saving', color: '#f5c542', key: xk })
          setCritFlash(true)
          setEnemyImpact({ key: xk + 1, kind: 'crit' })
          setEnemyShakeKind('crit'); setEnemyShakeKey(k => k + 1)
          cameraShake('crit')
          vibrate([0, 60, 40, 90])
          playStepChainRef.current.push(setTimeout(() => { setCritFlash(false); setBoonFlash(bf => (bf && bf.key === xk ? null : bf)) }, 1400))
        }, 260))
      }
      // Reaper's Tithe paid by something OTHER than your own shot: thorns, a
      // parry, a burn tick, the counter shell. The attack path pays its own gold
      // splat once the shell has landed, so it is excluded here rather than
      // hoisted, which would have pulled that one forward into the flight.
      if (step.titheHeal && step.titheHeal > 0 && !(isAttack && step.who === 'player')) {
        const rk = Date.now() + i + 47
        const tithed = step.titheHeal
        playStepChainRef.current.push(setTimeout(() => {
          setPHitsplat({ key: rk, text: `+${tithed}`, color: '#f5c542', big: true })
          setPlayerAura({ key: rk + 1, kind: 'heal', color: '#f5c542' })
          vibrate([0, 30])
          playStepChainRef.current.push(setTimeout(() => { setPHitsplat(null); setPlayerAura(a => (a && a.key === rk + 1 ? null : a)) }, SPLAT_HOLD_MS))
        }, 340))
      }
      // Cannonade — sync the heat rim + streak badge on the player hull to the
      // committed streak (0 = the chain just broke, badge clears).
      if (step.cannonade !== undefined) setCannonadeStacks(step.cannonade)

      // Charges always update at the start of the step (reloads visible right
      // away; spending charges visible the moment the cannon fires).
      setPlayerCharges(step.pCharges); setEnemyCharges(step.eCharges)

      // Dodge feedback — when an attack is evaded, the defender's
      // nameplate gets a cyan flash + sideways flick. Mirrors the
      // existing enemy-shake hit vocabulary (red + recoil) in
      // reverse, so successful evasion finally reads as a *win*
      // instead of a buried log line. Fired ahead of the projectile
      // delay so the player sees the dodge before the "missed" splat.
      if (isDodged && step.splatTarget) {
        const dodger = step.splatTarget
        setTimeout(() => {
          setNameplateFx({ kind: 'dodge', actor: dodger })
          setNameplateFxKey(k => k + 1)
          // Whoosh + afterimage on the ship that slipped the shot.
          const dk = Date.now() + i + 6
          setDodgeFx({ key: dk, actor: dodger })
          setTimeout(() => setDodgeFx(d => (d && d.key === dk ? null : d)), 460)
          // Astrolabe riposte — the dodged shot is turned back into the enemy.
          // Lands a beat after the dodge reads, with its own number + impact.
          if (step.reflectDmg) {
            setTimeout(() => {
              syncEHp(step)
              setEHitsplat({ key: Date.now() + i + 8, text: `-${step.reflectDmg}`, color: '#38bdf8' })
              setEnemyShakeKind('hit'); setEnemyShakeKey(k => k + 1)
              setEnemyImpact({ key: Date.now() + i + 9, kind: 'normal' })
              setTimeout(() => setEnemyImpact(null), 700)
              setTimeout(() => setEHitsplat(null), SPLAT_HOLD_MS)
            }, 240)
          }
          // Riposte affix — the enemy turns your dodged shot back onto YOU.
          // Mirror of the Astrolabe reflect: a red -N + shake + impact on the
          // player hull, a beat after the dodge reads.
          if (step.riposteDmg) {
            setTimeout(() => {
              syncPHp(step)
              setPHitsplat({ key: Date.now() + i + 8, text: `-${step.riposteDmg}`, color: '#ef4444' })
              setPlayerShakeKey(k => k + 1)
              setPlayerImpact({ key: Date.now() + i + 9, kind: 'normal' })
              setTimeout(() => setPlayerImpact(null), 700)
              setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
              vibrate([0, 30, 30, 45])
            }, 240)
          }
        }, PROJECTILE_FLIGHT_MS - 80)
      }

      if (isAttack && step.who === 'player') {
        // Player firing: cannon shot + recoil immediately, projectile flies,
        // then splat + shake + HP update + crit flash all together.
        // The Mega rides the Volley salvo FX as a base; each augment layers its
        // own signature on top (beam / 4-splat / blast) below.
        const megaId    = step.action === 'mega' ? (megaAugment?.id ?? null) : null
        const megaColor = megaAugment?.color ?? '#ffffff'
        const isVolleyShot = (step.action === 'volley' || step.action === 'mega') && !step.big
        // The Nuke is a silo launch — a missile arcs across, so it flies longer.
        const flightMs = megaId === 'nuke' ? PROJECTILE_FLIGHT_MS + 560 : PROJECTILE_FLIGHT_MS
        const cannonKind: 'normal' | 'volley' | 'crit' =
          step.big ? 'crit' : isVolleyShot ? 'volley' : 'normal'
        // Railgun — a beam lances out the instant you fire (no cannonball arc).
        if (megaId === 'railgun') {
          setPlayerRecoilKey(k => k + 1)
          vibrate([0, 45, 28, 75])
          // Measure the real ship boxes so the beam runs from the player's bow to
          // the enemy hull no matter the layout.
          const stg = stageRef.current?.getBoundingClientRect()
          const ps  = playerShipRef.current?.getBoundingClientRect()
          const es  = enemyShipRef.current?.getBoundingClientRect()
          // Muzzle -> enemy hull. Measure the real ship boxes when we can; fall
          // back to stage-relative proportions so the beam ALWAYS fires.
          let x1: number, y1: number, x2: number, y2: number
          if (stg && ps && es) {
            x1 = ps.left  - stg.left + ps.width * 0.56   // back from the bow, closer to the ship
            y1 = ps.top   - stg.top  + ps.height * 0.32  // upper deck
            x2 = es.left  - stg.left + es.width * 0.52   // enemy center
            y2 = es.top   - stg.top  + es.height * 0.46
          } else {
            const W = stg?.width ?? 360, H = stg?.height ?? 400
            x1 = W * 0.42; y1 = H * 0.60
            x2 = W * 0.78; y2 = H * 0.50
          }
          const dx = x2 - x1, dy = y2 - y1
          // Slight overshoot so the lance punches into the hull, not short of it.
          const len = Math.max(60, Math.hypot(dx, dy) * 1.06)
          const angle = Math.atan2(dy, dx) * 180 / Math.PI
          setRailBeam({ key: Date.now() + i, color: megaColor, x1, y1, len, angle })
          playStepChainRef.current.push(setTimeout(() => setRailBeam(null), 920))
        } else if (megaId === 'nuke') {
          // Silo launch — a missile blasts off the deck, arcs up and over, then
          // comes down on the enemy where it detonates. Geometry from real boxes.
          setPlayerRecoilKey(k => k + 1)
          const stg = stageRef.current?.getBoundingClientRect()
          const ps  = playerShipRef.current?.getBoundingClientRect()
          const es  = enemyShipRef.current?.getBoundingClientRect()
          let mx1: number, my1: number, mx2: number, my2: number
          if (stg && ps && es) {
            mx1 = ps.left - stg.left + ps.width * 0.50   // launches off the deck center
            my1 = ps.top  - stg.top  + ps.height * 0.20
            mx2 = es.left - stg.left + es.width * 0.50   // comes down on the enemy
            my2 = es.top  - stg.top  + es.height * 0.42
          } else {
            const W = stg?.width ?? 360, H = stg?.height ?? 400
            mx1 = W * 0.34; my1 = H * 0.55
            mx2 = W * 0.78; my2 = H * 0.50
          }
          setNukeMissile({ key: Date.now() + i, color: megaColor, x1: mx1, y1: my1, x2: mx2, y2: my2, dur: flightMs })
          playStepChainRef.current.push(setTimeout(() => setNukeMissile(null), flightMs))
          cameraShake('volley')           // lift-off rumble (the boom comes on impact)
          vibrate([0, 45, 60, 25])
        } else if (megaId === 'barrage') {
          // Barrage — FOUR muzzle pops on a tight cadence (quicker than Mako's
          // 200ms rat-a-tat), one per sub-hit; the impacts land in the same
          // rhythm below so the whole thing reads as four distinct blows.
          ;[0, 120, 240, 360].forEach((off, k) => {
            playStepChainRef.current.push(setTimeout(() => {
              setPlayerRecoilKey(kk => kk + 1)
              setCannonShot({ key: Date.now() + i + k * 101, kind: 'volley' })
              playStepChainRef.current.push(setTimeout(() => setCannonShot(null), 300))
            }, off))
          })
        } else if (isVolleyShot) {
          // Rat-a-tat — three muzzle pops + recoil kicks for the 3-cannonball
          // burst, so a volley fires visibly as a salvo, not one shot.
          ;[0, 95, 190].forEach((off, k) => {
            playStepChainRef.current.push(setTimeout(() => {
              setPlayerRecoilKey(kk => kk + 1)
              setCannonShot({ key: Date.now() + i + k * 101, kind: 'volley' })
              playStepChainRef.current.push(setTimeout(() => setCannonShot(null), 480))
            }, off))
          })
        } else {
          setPlayerRecoilKey(k => k + 1)
          // HER GUNS GO OFF ON THE WATER. Paired with the recoil rather than
          // with the damage, because the flash belongs to the moment she fires
          // and the ring belongs to the moment it arrives.
          if (step.splatTarget === 'enemy') bang('fire', 'player')
          else if (step.splatTarget === 'player') bang('fire', 'enemy')
          setCannonShot({ key: Date.now() + i, kind: cannonKind })
          setTimeout(() => setCannonShot(null), 700)
        }

        // Barrage plays its impacts as a SEQUENTIAL rat-a-tat (Mako-style, but
        // tighter): each sub-hit gets its own impact burst, shake, haptic and
        // damage number, and the HP bar ticks down per blow — the step's true
        // snapshot (incl. shields / reflect) syncs on the FINAL hit. Everything
        // else keeps the single-splat path.
        const seqBarrage = megaId === 'barrage' && !isDodged && step.splatTarget === 'enemy'
        setTimeout(() => {
          if (!seqBarrage) {
            syncEHp(step)
            // ALSO push the player HP — Reflective and Volatile affix damage
            // lives in step.pHp on a player-attacks step. Without this sync,
            // the log says "reflects N back" / "wreck scorches for N" but
            // the actual HP bar never moves until the next enemy-fires step
            // catches up.
            syncPHp(step)
          }
          if (step.splatTarget === 'enemy') {
            if (seqBarrage) {
              const preHp = enemyHpRef.current
              const total = Math.max(0, parseInt(step.splatText.replace(/[^0-9]/g, ''), 10) || 0)
              const fr = [0.40, 0.25, 0.18, 0.17]
              let used = 0
              const parts = fr.map((f, k) => {
                const v = k === fr.length - 1 ? total - used : Math.round(total * f)
                used += v
                return v
              })
              const SUB = 120  // quicker than Mako's 200ms
              let cum = 0
              parts.forEach((v, k) => {
                playStepChainRef.current.push(setTimeout(() => {
                  cum += v
                  const bk = Date.now() + i * 40 + k
                  setEnemyImpact({ key: bk + 300, kind: k === 0 ? 'crit' : 'normal' })
                  playStepChainRef.current.push(setTimeout(() => setEnemyImpact(null), 140))
                  setEnemyShakeKind(k === 0 ? 'crit' : 'hit')
                  setEnemyShakeKey(kk => kk + 1)
                  vibrate(k === 0 ? 20 : 10)
                  // Each blow floats its OWN number, scattered like Mako's frenzy.
                  const dx = (k - 1.5) * 17 + (k % 2 ? 7 : -7)
                  const sk = bk + 900
                  setBarrageSplats(s => [...s, { key: sk, text: `-${v}`, dx, crit: k === 0, color: megaColor }])
                  playStepChainRef.current.push(setTimeout(() => setBarrageSplats(s => s.filter(x => x.key !== sk)), 640))
                  if (k === parts.length - 1) {
                    // Final blow: settle to the step's true snapshot + the big kick.
                    syncEHp(step); syncPHp(step)
                    cameraShake('crit')
                  } else {
                    // Visual mid-chain tick — never below the step's real result.
                    setEnemyHp(Math.max(step.eHp, preHp - cum))
                  }
                }, k * SUB))
              })
            } else {
              setEHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: megaId ? megaColor : step.splatColor, big: step.big || megaId === 'nuke' || megaId === 'railgun', volley: isVolleyShot })
            }
            if (!isDodged && !seqBarrage) {
              const heavy = step.big || megaId === 'nuke' || megaId === 'railgun'
              setEnemyShakeKind(heavy ? 'crit' : isVolleyShot ? 'volley' : 'hit')
              setEnemyShakeKey(k => k + 1)
              if (heavy) cameraShake(megaId === 'nuke' ? 'nuke' : 'crit')
              else if (isVolleyShot) { cameraShake('volley'); vibrate([0, 22, 26, 30]) }
              // A plain hit used to get NO camera beat — now it gets the tiny
              // hit-stop so every landed shot has weight, not just crits.
              else cameraShake('hit')
            }
            if (!isDodged && !seqBarrage) {
              if (step.carapaceSoak) {
                // Carapace shrugged it off — a steely deflect (plate flex +
                // sparks bouncing away) instead of the penetrating debris burst,
                // so a soaked single shot reads as blocked, not clean.
                setEnemyDeflect(Date.now() + i + 11)
              } else {
                // Impact burst exploding on the enemy ship (crit cascade is huge)
                const impactKind: 'normal' | 'volley' | 'crit' =
                  step.big || megaId === 'nuke' || megaId === 'railgun' ? 'crit' : isVolleyShot ? 'volley' : 'normal'
                setEnemyImpact({ key: Date.now() + i + 2, kind: impactKind })
                setTimeout(() => setEnemyImpact(null), 700)
                // Nuke — a big expanding shockwave on top of the impact.
                if (megaId === 'nuke') {
                  setNukeBlast({ key: Date.now() + i + 13, color: megaColor })
                  playStepChainRef.current.push(setTimeout(() => setNukeBlast(null), 1150))
                  vibrate([0, 70, 50, 130])
                }
              }
            }
            if (step.procStatus) {
              const ak = Date.now() + i + 7
              setEnemyAura({ key: ak, kind: step.procStatus === 'stun' ? 'stunned' : step.procStatus })
              setTimeout(() => setEnemyAura(a => (a && a.key === ak ? null : a)), 950)
              if (step.procStatus === 'burn') setEnemyBurning(true)
              // A stun rides the freeze SKIP mechanically (same pending ref) but
              // must not paint the ice shell — the aura above carries it.
              else if (step.procStatus === 'freeze') setEnemyFrozen(true)
              else { setEnemyShakeKind('crit'); setEnemyShakeKey(k => k + 1); vibrate([0, 40, 30, 55]) }
            }
            // Press-Gang — the shot is ripped off their rack and rammed into
            // yours: a snatch-arc on them, a charge flare on you.
            if (step.stoleCharge) {
              const sk = Date.now() + i + 21
              setEnemyAura({ key: sk, kind: 'stolen' })
              setTimeout(() => setEnemyAura(a => (a && a.key === sk ? null : a)), 900)
              setTimeout(() => {
                const pk = Date.now() + i + 22
                setPlayerAura({ key: pk, kind: 'charge' })
                setTimeout(() => setPlayerAura(a => (a && a.key === pk ? null : a)), 850)
                vibrate([0, 18, 24, 30])
              }, 220)
            }
            // Thermal Shock confluence detonation — a beat AFTER the main hit so it
            // reads as a one-two: the shot lands, then the frozen hull shatters in
            // the fire. Ice+fire burst over the hull, its own splat, a hard shake.
            if (step.thermalShock && !isDodged) {
              const tk = Date.now() + i + 19
              const burst = step.thermalShock
              playStepChainRef.current.push(setTimeout(() => {
                setThermalShockFx({ key: tk })
                setEnemyImpact({ key: tk + 1, kind: 'crit' })
                setEHitsplat({ key: tk + 2, text: `-${burst}`, color: '#fdba74', big: true })
                setEnemyShakeKind('crit'); setEnemyShakeKey(k => k + 1)
                cameraShake('crit')
                vibrate([0, 45, 28, 70])
                playStepChainRef.current.push(setTimeout(() => { setThermalShockFx(null); setEHitsplat(null) }, 760))
              }, 200))
            }
            // Rattling Shot / Chainshot / the rack — a debuff-landed flare on the
            // enemy hull so a control build sees its hex/snare take hold.
            if (step.debuffApplied) {
              const dk = Date.now() + i + 27
              const kind = step.debuffApplied
              playStepChainRef.current.push(setTimeout(() => {
                setEnemyAura({ key: dk, kind })
                playStepChainRef.current.push(setTimeout(() => setEnemyAura(a => (a && a.key === dk ? null : a)), 900))
              }, 220))
            }
            if (step.big || megaId === 'nuke' || megaId === 'railgun') {
              setCritFlash(true)
              setTimeout(() => setCritFlash(false), megaId === 'nuke' ? 640 : 380)
              // Retrigger the player's recoil with the impact so the kickback
              // lines up with the big enemy explosion, not just the cannon fire
              setPlayerRecoilKey(k => k + 1)
            }
            setTimeout(() => setEHitsplat(null), SPLAT_HOLD_MS)
          }
          // Leviathan's Hunger — a green +HP splat pops on YOUR hull as the
          // shot lands, so the heal is felt, not just read in the log.
          if (step.lifestealHeal && step.lifestealHeal > 0) {
            setPHitsplat({ key: Date.now() + i + 5, text: `+${step.lifestealHeal}`, color: '#34d399' })
            setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
          }
          // Reaper's Tithe — a gold +HP splat on YOUR hull as the kill pays out,
          // set apart from the green lifesteal drip so the tithe reads as its own.
          if (step.titheHeal && step.titheHeal > 0) {
            const rk = Date.now() + i + 6
            const tithed = step.titheHeal
            playStepChainRef.current.push(setTimeout(() => {
              setPHitsplat({ key: rk, text: `+${tithed}`, color: '#f5c542', big: true })
              setPlayerAura({ key: rk + 1, kind: 'heal', color: '#f5c542' })
              vibrate([0, 30])
              playStepChainRef.current.push(setTimeout(() => { setPHitsplat(null); setPlayerAura(a => (a && a.key === rk + 1 ? null : a)) }, SPLAT_HOLD_MS))
            }, 340))
          }
        }, flightMs)
      } else if (isAttack && step.who === 'enemy') {
        // Enemy firing at player — muzzle flash off the enemy gun deck now,
        // projectile flies, then splat + shake + impact spray on the player hull.
        const eIsUltimate = step.action === 'ultimate'
        const eIsVolley = (step.action === 'volley' && !step.big) || eIsUltimate
        const eCannonKind: 'normal' | 'volley' | 'crit' =
          step.big || eIsUltimate ? 'crit' : eIsVolley ? 'volley' : 'normal'
        if (eIsVolley) {
          // Mirror the player's salvo — three muzzle pops off the enemy deck
          // (an ultimate empties the whole 4-ball magazine, quicker cadence).
          ;(eIsUltimate ? [0, 80, 160, 240] : [0, 95, 190]).forEach((off, k) => {
            playStepChainRef.current.push(setTimeout(() => {
              setEnemyMuzzle({ key: Date.now() + i + k * 103, kind: 'volley' })
              playStepChainRef.current.push(setTimeout(() => setEnemyMuzzle(null), 480))
            }, off))
          })
        } else {
          setEnemyMuzzle({ key: Date.now() + i, kind: eCannonKind })
          setTimeout(() => setEnemyMuzzle(null), 700)
        }
        setTimeout(() => {
          syncPHp(step)
          // ALSO sync enemy HP — Vampiric lifesteal lands in step.eHp on
          // an enemy-attacks step, so the heal needs a separate push.
          syncEHp(step)
          // Cutlass Guard — the blow is TURNED. Fire the steel-parry flare in
          // place of the usual impact; a hit you take zero from should read as
          // a win, not as silence.
          if (step.parriedHit) {
            const qk = Date.now() + i + 23
            setPlayerAura({ key: qk, kind: 'parry' })
            setTimeout(() => setPlayerAura(a => (a && a.key === qk ? null : a)), 850)
            vibrate([0, 26, 20, 40])
          }
          if (step.splatTarget === 'player') {
            setPHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: step.big, volley: eIsVolley })
            if (!isDodged) {
              setPlayerShakeKey(k => k + 1)
              setPlayerImpact({ key: Date.now() + i + 3, kind: eCannonKind })
              setTimeout(() => setPlayerImpact(null), 700)
              if (step.big) cameraShake('crit')
              else if (eIsVolley) { cameraShake('volley'); vibrate([0, 22, 26, 30]) }
              else cameraShake('hit')   // taking a plain hit gets the same weight
            }
            setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
          }
          // Scorching lit / Glacial iced — flare the player hull aura + switch on
          // the persistent burn glow / frost tint (mirror of the enemy procs).
          if (step.procStatus) {
            const ak = Date.now() + i + 9
            setPlayerAura({ key: ak })
            setTimeout(() => setPlayerAura(a => (a && a.key === ak ? null : a)), 950)
            if (step.procStatus === 'burn') setPlayerBurning(true)
            else setPlayerFrozen(true)
          }
          // Vampiric drink-back — a green +N rises off the enemy hull a beat
          // after its hit lands, so the lifesteal reads instead of the HP bar
          // quietly creeping back up.
          if (step.enemyHeal) {
            setTimeout(() => {
              setEHitsplat({ key: Date.now() + i + 5, text: `+${step.enemyHeal}`, color: '#4ade80' })
              setTimeout(() => setEHitsplat(null), SPLAT_HOLD_MS)
            }, 360)
          }
        }, PROJECTILE_FLIGHT_MS)
      } else if (step.action === 'repair' && step.who === 'player') {
        // Repair kit — brief beat so the "crack open" log line lands first,
        // then bump the HP bar and float a green +HP splat. No shake (no
        // hit), no projectile, just the patch landing.
        setTimeout(() => {
          syncPHp(step)
          if (step.splatTarget === 'player') {
            setPHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: false })
            setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
            const ak = Date.now() + i + 4
            setPlayerAura({ key: ak })
            setTimeout(() => setPlayerAura(a => (a && a.key === ak ? null : a)), 900)
          }
        }, PROJECTILE_FLIGHT_MS)
      } else {
        // Reload / dodge step. No splat or projectile, but a Resilient
        // affix can heal the enemy at the start of its turn — that HP
        // change lives in step.eHp and needs a sync, else the log says
        // "patches up N HP" while the bar stays flat. Same beat as the
        // log line being streamed in, so the heal feels concurrent with
        // its narration.
        setTimeout(() => {
          syncPHp(step)
          syncEHp(step)
          // Burn tick / freeze steps ride the reload branch but carry an enemy
          // splat (a "-N" flame or a "Frozen" tag). Float it so the status reads.
          if (step.splatTarget === 'enemy' && step.splatText) {
            setEHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: false })
            setTimeout(() => setEHitsplat(null), SPLAT_HOLD_MS)
            // Themed hull aura for the recurring status procs (burn / freeze).
            const auraKind = step.splatColor === BURN_COLOR ? 'burn' : step.splatColor === FREEZE_COLOR ? 'freeze' : null
            if (auraKind) {
              const ak = Date.now() + i + 5
              setEnemyAura({ key: ak, kind: auraKind })
              setTimeout(() => setEnemyAura(a => (a && a.key === ak ? null : a)), 900)
            }
            // Persistent glow/tint: burn lingers until its last tick, frost
            // until the ice breaks (this skip step).
            if (auraKind === 'burn') setEnemyBurning((step.burnTurnsLeft ?? 0) > 0)
            if (step.freezeEnds) setEnemyFrozen(false)
          }
          // Mirror of the above for the PLAYER's burn tick / frozen-skip steps.
          if (step.splatTarget === 'player' && step.splatText) {
            setPHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: false })
            setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
            const auraKind = step.splatColor === BURN_COLOR ? 'burn' : step.splatColor === FREEZE_COLOR ? 'freeze' : null
            if (auraKind) {
              const ak = Date.now() + i + 6
              setPlayerAura({ key: ak })
              setTimeout(() => setPlayerAura(a => (a && a.key === ak ? null : a)), 900)
            }
            if (auraKind === 'burn') setPlayerBurning((step.burnTurnsLeft ?? 0) > 0)
            if (step.freezeEnds) setPlayerFrozen(false)
          }
        }, PROJECTILE_FLIGHT_MS)
      }

      // Phase-2 revival deserves a longer beat — the player needs time
      // to read "PHASE 2", see the HP refill, and absorb that the fight
      // isn't over. Bumps the gap from the standard ~1s to ~1.6s.
      // Hit-stop: a big blow gets a beat of stillness before the fight resumes,
      // so a crit/volley lands with weight (pairs with the camera shake's held
      // opening frame + the crit flash). Normal hits keep the standard pace.
      // The Nuke lands later (slow lob) and its blast lingers, so it needs a
      // longer beat before the next step or the explosion gets cut off.
      const isNukeStep = step.action === 'mega' && megaAugment?.id === 'nuke'
      const hitStop = step.big ? 110 : isNukeStep ? 800 : (step.action === 'volley' || step.action === 'mega' ? 55 : 0)
      const gapMs = (step.phaseTransition ? 1600 : STEP_GAP_MS) + hitStop
      playStepChainRef.current.push(setTimeout(() => playStep(i + 1), gapMs))
    }

    // Commit defensive-buff consumption so the hull glints reflect what's left.
    if (anchorConsumed) setAnchorReductionPct(null)
    // NOTE: shield-pool displays are NO LONGER committed here. They settle
    // per-step during playback (syncPHp/syncEHp) so a bar depletes WITH the hit
    // that drained it, not the instant the turn resolves (which spoiled the
    // incoming damage). The refs stay authoritative for next-turn soak math.
    void shieldChanged; void eShieldChanged

    playStepChainRef.current = []
    playStepChainRef.current.push(setTimeout(() => playStep(0), SPEED_LINE_HOLD_MS))
  }

  // ─── Render — Pokemon-style battle stage ──────────────────────────────────

  // Outer card is content-sized (was flex:1 + minHeight:0). The old
  // shrink-to-fit let the parent squeeze the battle stage down to its
  // 320px floor and push the action panel behind the MobileTabBar with
  // no way to scroll to it on short viewports. Sizing to content + the
  // parent being an internal scroll region (see RaidGame phase wrappers)
  // means the buttons are always reachable; on tall phones the battle
  // stage still reads fine at its natural size.

  // Ship damage states: smoke/fire scale with HP%, and a hull starts to LIST
  // (tilt from the waterline) below 35%. Enemy keeps its sink animation in
  // charge of the tilt while sinking.
  const enemyHpPctLive  = Math.max(0, Math.min(100, (enemyHp / enemyHpMax) * 100))
  const playerHpPctLive = Math.max(0, Math.min(100, (playerHp / playerHpMax) * 100))
  const enemyTilt  = (enemySinking || enemyHpPctLive >= 35) ? 0 : Math.min(6, ((35 - enemyHpPctLive) / 35) * 6)
  const playerTilt = playerHpPctLive >= 35 ? 0 : -Math.min(6, ((35 - playerHpPctLive) / 35) * 6)

  // Per-raid sky/sea gradient, hoisted so it can back BOTH the stage and the
  // (translucent) control deck as one continuous scene — see the container +
  // control-deck backgrounds below.
  const stageGradient =
    atmosphere === 'fog'      ? 'linear-gradient(180deg, #4a5566 0%, #58687a 30%, #6a7888 40%, #18222e 100%)' :
    atmosphere === 'sunset'   ? 'linear-gradient(180deg, #2a1838 0%, #6e2840 16%, #c84a28 34%, #d96a38 44%, #1a0a12 100%)' :
    atmosphere === 'overcast' ? 'linear-gradient(180deg, #38485a 0%, #485868 30%, #546675 40%, #0a121a 100%)' :
    atmosphere === 'harbor'   ? 'linear-gradient(180deg, #2b3f39 0%, #35514a 28%, #3d5e54 40%, #071310 100%)' :
    atmosphere === 'vault'    ? 'linear-gradient(180deg, #0e1330 0%, #171d42 30%, #1e234e 40%, #04050e 100%)' :
    atmosphere === 'brackwater' ? 'linear-gradient(180deg, #2b2a1e 0%, #454029 26%, #5c5133 40%, #100f08 100%)' :
                                'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)'

  return (
    <div className={overSea ? 'raid-oversea-stage' : undefined} style={{
      display: 'flex', flexDirection: 'column',
      // OVER THE SEA THIS IS THE FIGHT'S BOX, and it is the one positioned
      // thing in here. `.raid-oversea-stage` gives it the chart's own insets,
      // so on a phone it stops where the MobileTabBar starts.
      position: overSea ? undefined : 'relative',
      ...(overSea ? { zIndex: 1 } : null),
      // Frameless + ONE continuous backdrop: the per-raid gradient (and a zone
      // image, if set) live on the CONTAINER so they span the stage AND the
      // translucent control deck below — one scene, no boxed-in frame. When the
      // caller paints a full-screen backdrop (transparentBackdrop), the container
      // goes fully transparent so that single scene shows through instead.
      background: transparentBackdrop ? 'transparent' : stageGradient,
      // Same reason as the stage below: over the sea the ships are placed on
      // the chart's hulls, which are not inside this container's box.
      overflow: overSea ? 'visible' : 'hidden',
      /**
       * ── FULL BLEED, LIKE THE SEA IT CAME FROM ──────────────────────────
       *
       * This whole fight was a 580px column centred on a full-screen backdrop:
       * a phone layout on a desk, with the battle happening in a strip down
       * the middle of its own sky. That was defensible while a raid was a page
       * you opened from a menu. It is not defensible now that you sail up to a
       * ship on open water and the sea does not narrow when you do.
       *
       * The cap moves DOWN to the control deck rather than being deleted. The
       * scene wants the screen — everything in it is placed in percentages, so
       * it scales rather than stretching — and the deck emphatically does not:
       * a button a metre wide is harder to hit than one you can see all of, and
       * a log line running the width of a monitor is a line nobody finishes.
       *
       * Scene full width, controls a readable column. Which is the same split
       * the chart makes: the sea is the whole window and the HUD is small and
       * in a corner.
       */
      width: '100%',
    }}>
      {/* Zone image backdrop (a fishing-zone photo, or the Gauntlet's abyss) — on
          the CONTAINER so it's the single background behind the ships AND the
          control deck, not a boxed layer inside the stage. Skipped when the caller
          owns a full-screen backdrop (raids paint the zone photo screen-wide). */}
      {!transparentBackdrop && liveBg && (
        <>
          <div aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 0,
            backgroundImage: `url(${liveBg})`,
            backgroundSize: 'cover', backgroundPosition: '50% 8%',
            filter: zoneFilter, pointerEvents: 'none',
          }} />
          <div aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 0,
            background: 'linear-gradient(180deg, rgba(4,8,14,0.16) 0%, rgba(4,8,14,0.16) 20%, rgba(4,8,14,0.26) 46%, rgba(4,8,14,0.42) 72%, rgba(3,5,10,0.72) 100%)',
            pointerEvents: 'none',
          }} />
        </>
      )}
      {/* Battle stage — ocean scene with ships and HP boxes.
          flex:1 lets it grow into available vertical space on tall phones.
          minHeight is the floor on short viewports — the single-row action
          panel frees enough vertical space that we can afford a taller floor
          so the enemy ship clears the player XP bar overlay. */}
      <motion.div ref={stageRef} animate={stageShakeCtrl} style={{
        position: 'relative',
        flex: 1,
        // NO FLOOR OVER THE SEA. The 400 is there so the scene keeps its shape
        // on a short viewport when the stage is what you are looking at; here
        // the scene is the chart behind, and a floor this tall on a phone
        // pushes the deck off the bottom of its own box.
        minHeight: overSea ? 0 : 400,
        transformOrigin: 'center center',
        willChange: 'transform',
        // Sky/sea gradient + inner backdrop elements switch on the raid's
        // atmosphere config (BossRaidConfig.atmosphere). Each raid gets
        // its own visual identity — Pete's coastal sunset, Krust's cold
        // overcast open ocean, the Cartographer's Sounding Fog — instead
        // of the same dusk seascape every fight. Default ('dusk') keeps
        // the original warm look for any caller that doesn't opt in
        // (e.g. the practice skirmish). The gradient + any zone image now live on
        // the CONTAINER (so they span the control deck too); the stage is
        // transparent and just holds the scene + ships over that shared backdrop.
        background: 'transparent',
        zIndex: 1,
        // OVER THE SEA THE ANCHORS LEAVE THE BOX. They are placed on hulls that
        // are wherever the chart put them, which is routinely outside whatever
        // rectangle the layout handed this stage — and a clipped hitsplat is a
        // hit that did not register.
        overflow: overSea ? 'visible' : 'hidden',
      }}>
        {/* Hit-stop impact flash — a quick white bloom over the stage on a heavy
            landing (crit / Mega / kill), lit via 'screen' so it brightens the
            scene rather than whiting it out. Sells the frozen beat of the hit. */}
        {impactFlash && (
          <motion.div key={`impact-${impactFlash.key}`} aria-hidden
            initial={{ opacity: impactFlash.strong ? 0.5 : 0.32 }}
            animate={{ opacity: 0 }}
            transition={{ duration: impactFlash.strong ? 0.24 : 0.15, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, zIndex: 9, pointerEvents: 'none', mixBlendMode: 'screen',
              background: impactFlash.strong
                ? 'radial-gradient(ellipse at center, rgba(255,255,255,0.92), rgba(255,214,150,0.5) 46%, transparent 78%)'
                : 'radial-gradient(ellipse at center, rgba(255,255,255,0.82), transparent 72%)' }} />
        )}
        {/* ── Atmospheric backdrop ─────────────────────────────────────────
            Sun/sky/clouds/water all swap based on `atmosphere`. Each
            variant is a self-contained fragment so the parts (sun
            color, cloud presence, sun reflection, fog bands) can
            differ per raid without ifs cluttering the shared layout.
            Order of branches: fog first, then sunset/overcast, then
            dusk as default fall-through. Skipped entirely when a zone
            image is set — that raid uses the fishing backdrop instead. */}

        {!transparentBackdrop && !liveBg && (atmosphere === 'fog' ? (
          <>
            {/* Sun behind the Sounding Fog — barely a disc, just a cool
                pale glow where the sun should be. No pulse — the fog
                eats any breathing the warm sun does in dusk mode. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: '8%', right: '15%',
                width: 64, height: 64, borderRadius: '50%',
                background: 'radial-gradient(circle at 50% 50%, rgba(220,228,238,0.45) 0%, rgba(200,210,225,0.22) 35%, rgba(180,195,215,0.08) 60%, transparent 90%)',
                filter: 'blur(4px)',
                pointerEvents: 'none',
              }}
            />

            {/* Three fog bands at staggered heights. Each is wider than
                the stage (180% width) so the keyframe sway never
                exposes a hard edge. Soft horizontal gradient + blur
                fakes thick mist drifting through the air. */}
            <div aria-hidden style={{ position: 'absolute', top: '12%', left: '-40%', width: '180%', height: 64, pointerEvents: 'none' }}>
              <div className="raid-fog-slow" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(210,220,232,0.20) 25%, rgba(225,232,240,0.28) 50%, rgba(210,220,232,0.20) 75%, transparent 100%)', filter: 'blur(8px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '22%', left: '-40%', width: '180%', height: 56, pointerEvents: 'none' }}>
              <div className="raid-fog-mid" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(200,212,226,0.22) 30%, rgba(220,228,238,0.30) 50%, rgba(200,212,226,0.22) 70%, transparent 100%)', filter: 'blur(7px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '30%', left: '-40%', width: '180%', height: 48, pointerEvents: 'none' }}>
              <div className="raid-fog-fast" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(190,205,222,0.18) 30%, rgba(212,222,234,0.26) 50%, rgba(190,205,222,0.18) 70%, transparent 100%)', filter: 'blur(6px)' }} />
            </div>

            {/* Horizon line + water tint — same vertical position as
                dusk, palette shifted cool. No bright line, just a
                whisper where sky meets fog meets sea. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(200,212,226,0.10)', boxShadow: '0 0 24px rgba(180,200,220,0.12)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(30,42,56,0.45) 0%, rgba(8,12,20,0.88) 100%)',
            }} />

            {/* Low fog band sitting on the water itself — drifts slowest,
                gives the seabase the sense of mist rolling along the
                surface. Replaces dusk's sun reflection. */}
            <div aria-hidden style={{ position: 'absolute', top: '42%', left: '-40%', width: '180%', height: 36, pointerEvents: 'none' }}>
              <div className="raid-fog-slow" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(195,208,222,0.16) 30%, rgba(215,225,236,0.22) 50%, rgba(195,208,222,0.16) 70%, transparent 100%)', filter: 'blur(5px)' }} />
            </div>
          </>
        ) : atmosphere === 'sunset' ? (
          <>
            {/* Pete's coastal sunset — bigger, lower, more saturated sun
                sits near the horizon line catching warm pink/orange. The
                breathing halo is the same .raid-sun pulse but with a
                shifted hue baked into the radial-gradient core. */}
            <div
              className="raid-sun"
              aria-hidden
              style={{
                position: 'absolute', top: '20%', right: '14%',
                width: 78, height: 78, borderRadius: '50%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,210,150,0.90) 0%, rgba(255,160,90,0.55) 30%, rgba(255,120,70,0.20) 58%, transparent 92%)',
                filter: 'blur(2px)',
                pointerEvents: 'none',
              }}
            />

            {/* Drifting clouds — warm-tinted undersides catching the
                sunset. Slightly slower than dusk so the sky feels
                more still as the day closes. */}
            <div aria-hidden style={{ position: 'absolute', top: '7%',  left: 0, right: 0, height: 36, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 130, height: 30, borderRadius: 15, background: 'radial-gradient(ellipse at 50% 65%, rgba(255,200,150,0.30) 0%, rgba(255,170,110,0.14) 50%, rgba(255,140,90,0) 75%)', filter: 'blur(1px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '15%', left: 0, right: 0, height: 28, pointerEvents: 'none' }}>
              <div className="raid-cloud-mid"  style={{ width: 96, height: 24, borderRadius: 12, background: 'radial-gradient(ellipse at 50% 65%, rgba(255,190,140,0.26) 0%, rgba(255,160,100,0.12) 50%, rgba(255,130,80,0) 75%)', filter: 'blur(0.8px)' }} />
            </div>

            {/* Horizon line — warm cream over the sunset reflection. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(255,220,180,0.18)', boxShadow: '0 0 28px rgba(255,180,120,0.24)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(60,30,40,0.45) 0%, rgba(8,8,16,0.90) 100%)',
            }} />

            {/* Sun reflection — bigger, more saturated than dusk because
                the sun sits much lower. Stretches further down into the
                water since the angle is shallower at sunset. */}
            <div
              aria-hidden
              style={{
                // No blend/blur: this glint persists all fight under drifting
                // clouds, and a standing blend+blur layer recomposites on every
                // cloud frame (Tidecaller-lag class). Gradient does the softness.
                position: 'absolute', top: '38%', right: '8%',
                width: 140, height: '40%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,180,110,0.34) 0%, rgba(255,150,90,0.14) 46%, transparent 80%)',
                pointerEvents: 'none',
              }}
            />
          </>
        ) : atmosphere === 'overcast' ? (
          <>
            {/* Krust's cold open ocean past the Bilge Strait — no sun
                disc at all, just a heavy cloud cover swallowing the
                upper sky. The "sun behind clouds" is implied by a
                faintly brighter band where the sun would be. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: '4%', right: '12%',
                width: 90, height: 60,
                background: 'radial-gradient(ellipse at 50% 50%, rgba(190,200,215,0.18) 0%, rgba(170,182,200,0.08) 45%, transparent 80%)',
                filter: 'blur(10px)',
                pointerEvents: 'none',
              }}
            />

            {/* Heavy overcast cap — a wide soft band across the top
                of the sky that reads as a continuous cloud cover. Sits
                under the drifting cloud patches below for layered depth. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '24%',
                background: 'linear-gradient(180deg, rgba(60,72,86,0.55) 0%, rgba(70,82,98,0.30) 60%, transparent 100%)',
                filter: 'blur(2px)',
                pointerEvents: 'none',
              }}
            />

            {/* Three slow drifting cloud patches — darker than dusk,
                lower in the sky so the overcast feels like it's pressing
                down on the water. */}
            <div aria-hidden style={{ position: 'absolute', top: '8%',  left: 0, right: 0, height: 36, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 150, height: 32, borderRadius: 16, background: 'radial-gradient(ellipse at 50% 55%, rgba(180,192,208,0.32) 0%, rgba(150,162,180,0.16) 50%, transparent 78%)', filter: 'blur(1.5px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '18%', left: 0, right: 0, height: 32, pointerEvents: 'none' }}>
              <div className="raid-cloud-mid"  style={{ width: 116, height: 28, borderRadius: 14, background: 'radial-gradient(ellipse at 50% 55%, rgba(160,172,188,0.30) 0%, rgba(130,144,162,0.14) 50%, transparent 78%)', filter: 'blur(1.2px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '28%', left: 0, right: 0, height: 26, pointerEvents: 'none' }}>
              <div className="raid-cloud-fast" style={{ width: 84, height: 22, borderRadius: 11, background: 'radial-gradient(ellipse at 50% 55%, rgba(150,162,180,0.26) 0%, rgba(120,134,152,0.12) 50%, transparent 78%)', filter: 'blur(1px)' }} />
            </div>

            {/* Horizon line — cold steel, very faint. No reflection
                because no sun is visible through the cloud cap. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(180,195,212,0.12)', boxShadow: '0 0 24px rgba(140,160,180,0.10)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(22,32,44,0.50) 0%, rgba(6,10,18,0.90) 100%)',
            }} />
          </>
        ) : atmosphere === 'harbor' ? (
          <>
            {/* The Coffers' drowned harbor — a grim black-market port under a
                sickly green overcast, the air thick with gun-smoke. No clean
                sun; just a bruised green glow where daylight fights through the
                smoke, and drifting powder-haze instead of clouds. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: '6%', right: '14%',
                width: 84, height: 58,
                background: 'radial-gradient(ellipse at 50% 50%, rgba(150,190,150,0.16) 0%, rgba(120,165,140,0.07) 45%, transparent 80%)',
                filter: 'blur(10px)',
                pointerEvents: 'none',
              }}
            />

            {/* Gun-smoke haze bands drifting across the harbor — warm-gray
                powder smoke tinted by the green sky. Reuses the fog sway. */}
            <div aria-hidden style={{ position: 'absolute', top: '11%', left: '-40%', width: '180%', height: 60, pointerEvents: 'none' }}>
              <div className="raid-fog-slow" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(120,128,120,0.20) 28%, rgba(140,148,136,0.26) 50%, rgba(120,128,120,0.20) 72%, transparent 100%)', filter: 'blur(8px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '21%', left: '-40%', width: '180%', height: 52, pointerEvents: 'none' }}>
              <div className="raid-fog-mid" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(108,120,110,0.20) 30%, rgba(132,142,128,0.26) 50%, rgba(108,120,110,0.20) 70%, transparent 100%)', filter: 'blur(7px)' }} />
            </div>

            {/* One heavy smoke bank up top — greener, denser than open cloud. */}
            <div aria-hidden style={{ position: 'absolute', top: '6%', left: 0, right: 0, height: 34, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 150, height: 30, borderRadius: 15, background: 'radial-gradient(ellipse at 50% 55%, rgba(120,140,124,0.30) 0%, rgba(96,116,104,0.15) 50%, transparent 78%)', filter: 'blur(1.5px)' }} />
            </div>

            {/* Horizon — faint green line over black harbor water. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(160,196,170,0.12)', boxShadow: '0 0 24px rgba(120,170,140,0.12)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(18,34,28,0.52) 0%, rgba(4,10,8,0.92) 100%)',
            }} />

            {/* Low smoke rolling along the water surface (replaces the sun glint). */}
            <div aria-hidden style={{ position: 'absolute', top: '42%', left: '-40%', width: '180%', height: 34, pointerEvents: 'none' }}>
              <div className="raid-fog-slow" style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(110,124,114,0.16) 30%, rgba(130,142,128,0.22) 50%, rgba(110,124,114,0.16) 70%, transparent 100%)', filter: 'blur(6px)' }} />
            </div>
          </>
        ) : atmosphere === 'brackwater' ? (
          <>
            {/* SAL BRACKWATER'S ESTUARY — where the salt meets the fresh. Tannin-brown
                water under a low bronze haze, silt hanging in the air, mangrove dark on
                the horizon.
                The one thing this palette is FOR: the water is dead flat. No chop, no
                glitter, no reflection worth the name. Every other raid's sea moves. This
                one does not, and that is his tell told in paint. */}

            {/* Silt haze pressing down. Heavier and lower than a storm cap: this is air
                you can taste. */}
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '30%',
              background: 'linear-gradient(180deg, rgba(38,34,20,0.62) 0%, rgba(66,58,32,0.30) 55%, transparent 100%)',
              filter: 'blur(3px)', pointerEvents: 'none',
            }} />

            {/* The sun, smothered. A copper coin behind the haze — you can look straight
                at it, which is never a good sign. */}
            <div className="raid-sun" aria-hidden style={{
              position: 'absolute', top: '20%', left: '18%',
              width: 76, height: 76, borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 50%, rgba(226,168,88,0.42) 0%, rgba(186,132,64,0.22) 38%, rgba(120,92,44,0.08) 66%, transparent 88%)',
              filter: 'blur(3px)', pointerEvents: 'none',
            }} />

            {/* Low brown cloud, dragging. */}
            <div aria-hidden style={{ position: 'absolute', top: '12%', left: 0, right: 0, height: 32, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 176, height: 30, borderRadius: 15, background: 'radial-gradient(ellipse at 50% 55%, rgba(74,64,38,0.40) 0%, rgba(52,46,28,0.20) 52%, transparent 80%)', filter: 'blur(2px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '22%', left: 0, right: 0, height: 26, pointerEvents: 'none' }}>
              <div className="raid-cloud" style={{ width: 140, height: 24, borderRadius: 12, background: 'radial-gradient(ellipse at 50% 55%, rgba(64,56,34,0.30) 0%, transparent 76%)', filter: 'blur(2px)' }} />
            </div>

            {/* MANGROVE LINE on the horizon — a low, ragged dark band. Sal's country.
                Not a silhouette anyone has to read; just a wrongness at the edge. */}
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: '36%', height: 10,
              background: 'repeating-linear-gradient(90deg, rgba(22,26,16,0.85) 0px, rgba(22,26,16,0.85) 7px, rgba(30,34,20,0.55) 7px, rgba(30,34,20,0.55) 13px, rgba(16,20,12,0.9) 13px, rgba(16,20,12,0.9) 22px)',
              filter: 'blur(1.2px)', pointerEvents: 'none',
            }} />

            {/* Horizon + the water itself. Opaque with silt, so nothing sits ON it and
                nothing shows THROUGH it. You cannot see what is under this. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(198,160,96,0.14)', boxShadow: '0 0 22px rgba(160,124,64,0.16)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(58,48,26,0.72) 0%, rgba(30,26,14,0.90) 40%, rgba(12,11,6,0.97) 100%)',
            }} />

            {/* The only thing on the water: a thin skin of mist lying on it, going nowhere.
                Deliberately NOT the drifting fog bands the fog palette uses — that fog
                travels. This just sits there, the way he does. */}
            <div aria-hidden style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: '9%',
              background: 'linear-gradient(180deg, rgba(180,160,110,0.13) 0%, rgba(150,132,88,0.05) 60%, transparent 100%)',
              filter: 'blur(4px)', pointerEvents: 'none',
            }} />
          </>
        ) : atmosphere === 'vault' ? (
          <>
            {/* The Quartermaster's Cache at night — a gun-deck vault lit only by
                lantern-gold against deep indigo storm-dark. Cold, close and
                oppressive: the finale's held breath. */}
            {/* Heavy storm cap pressing down from the top of the sky. */}
            <div
              aria-hidden
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '26%',
                background: 'linear-gradient(180deg, rgba(10,14,34,0.65) 0%, rgba(16,20,44,0.34) 60%, transparent 100%)',
                filter: 'blur(2px)',
                pointerEvents: 'none',
              }}
            />

            {/* Lantern glow low on the right — the Cache's hanging lamps, the
                only warm light, bleeding gold into the dark (breathes via .raid-sun). */}
            <div
              className="raid-sun"
              aria-hidden
              style={{
                position: 'absolute', top: '26%', right: '12%',
                width: 70, height: 70, borderRadius: '50%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,208,120,0.55) 0%, rgba(240,170,80,0.28) 34%, rgba(200,130,60,0.10) 62%, transparent 90%)',
                filter: 'blur(2px)',
                pointerEvents: 'none',
              }}
            />

            {/* Dark drifting storm clouds — indigo, low and heavy. */}
            <div aria-hidden style={{ position: 'absolute', top: '8%', left: 0, right: 0, height: 34, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 150, height: 32, borderRadius: 16, background: 'radial-gradient(ellipse at 50% 55%, rgba(40,48,86,0.42) 0%, rgba(28,34,66,0.20) 50%, transparent 78%)', filter: 'blur(1.5px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '18%', left: 0, right: 0, height: 30, pointerEvents: 'none' }}>
              <div className="raid-cloud-mid" style={{ width: 116, height: 26, borderRadius: 13, background: 'radial-gradient(ellipse at 50% 55%, rgba(34,42,78,0.38) 0%, rgba(24,30,60,0.18) 50%, transparent 78%)', filter: 'blur(1.2px)' }} />
            </div>

            {/* Horizon — faint gold lantern-line over near-black water. */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(255,206,140,0.16)', boxShadow: '0 0 26px rgba(240,180,110,0.20)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(12,14,32,0.55) 0%, rgba(3,4,10,0.94) 100%)',
            }} />

            {/* Lantern reflection on the black water, directly below the lamps. */}
            <div
              aria-hidden
              style={{
                // No blend/blur — persistent glint; see the sunset variant note.
                position: 'absolute', top: '38%', right: '9%',
                width: 120, height: '36%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,190,110,0.24) 0%, rgba(240,160,80,0.10) 48%, transparent 80%)',
                pointerEvents: 'none',
              }}
            />
          </>
        ) : (
          <>
            {/* Sun — diffuse atmospheric glow, not a 3D-looking sphere. The
                radial gradient softens the center alpha so it blends into the
                sky instead of reading as a hard disk; the .raid-sun pulse adds
                the breathing halo via colored drop-shadows. */}
            <div
              className="raid-sun"
              aria-hidden
              style={{
                position: 'absolute', top: '6%', right: '13%',
                width: 56, height: 56, borderRadius: '50%',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,250,225,0.70) 0%, rgba(255,230,170,0.40) 28%, rgba(255,210,140,0.15) 55%, transparent 90%)',
                filter: 'blur(1.5px)',
                pointerEvents: 'none',
              }}
            />

            {/* Drifting clouds — three layers at different sizes + speeds.
                Each cloud is a flat radial-gradient with soft edges; the
                wrapping div handles the slow translate. */}
            <div aria-hidden style={{ position: 'absolute', top: '6%',  left: 0, right: 0, height: 36, pointerEvents: 'none' }}>
              <div className="raid-cloud-slow" style={{ width: 120, height: 28, borderRadius: 14, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(1px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '15%', left: 0, right: 0, height: 28, pointerEvents: 'none' }}>
              <div className="raid-cloud-mid"  style={{ width: 88, height: 22, borderRadius: 11, background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(0.8px)' }} />
            </div>
            <div aria-hidden style={{ position: 'absolute', top: '22%', left: 0, right: 0, height: 22, pointerEvents: 'none' }}>
              <div className="raid-cloud-fast" style={{ width: 64, height: 18, borderRadius: 9,  background: 'radial-gradient(ellipse at 50% 60%, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0) 75%)', filter: 'blur(0.8px)' }} />
            </div>

            {/* Horizon line + water tint — sits higher so the ships have more water under them */}
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
              background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 24px rgba(140,180,210,0.18)',
            }} />
            <div style={{
              position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
              background: 'linear-gradient(180deg, rgba(20,40,60,0.4) 0%, rgba(8,16,28,0.85) 100%)',
            }} />

            {/* Static sun reflection — the sun is upper-right, so its glint
                on the water sits directly below it, fading down into the
                depths. No movement — water surface motion gets weird at this
                visual scale, so the reflection is a still soft glow. */}
            <div
              aria-hidden
              style={{
                // No blend/blur — persistent glint; see the sunset variant note.
                position: 'absolute', top: '38%', right: '8%',
                width: 110, height: '32%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,235,180,0.20) 0%, rgba(255,225,160,0.09) 46%, transparent 78%)',
                pointerEvents: 'none',
              }}
            />
          </>
        ))}

        {/* Leave button — small ← icon in the top-right of the battle stage.
            Replaces the dedicated Leave row above the XP bar so the game
            screen can use that vertical space and the XP bar sits right
            under the page header. */}
        {onLeave && (!riskyFlee || subPhase === 'await_input') && (
          <button
            type="button"
            onClick={riskyFlee ? () => promptFlee(() => onLeave?.()) : onLeave}
            aria-label={riskyFlee ? 'Flee raid' : 'Leave raid'}
            style={{
              // ON THE HUD LINE, AND MEASURED THE WAY THE CHART MEASURES IT.
              //
              // This is absolute inside the stage, and the stage now carries
              // the chart's own insets — it already BEGINS at the header. So
              // the offset here is 18, exactly what the chart hangs its own HUD
              // discs at, and the level bar's fixed 62/78 lands on the same
              // line. Adding the header height again (as `calc(44px + 18px)`
              // did) measured it twice and dropped the button a row.
              //
              // Bigger than the route's 32, because leaving should not be the
              // smallest target on the screen.
              position: 'absolute', zIndex: 5,
              ...(overSea
                ? { top: 18, right: 12, width: 38, height: 38 }
                : { top: 10, right: 10, width: 32, height: 32 }),
              borderRadius: '50%',
              background: 'rgba(6,12,20,0.78)',
              border: '1px solid rgba(122,138,160,0.4)',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: 0,
              touchAction: 'manipulation',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5"/>
              <path d="M12 19l-7-7 7-7"/>
            </svg>
          </button>
        )}

        {/* Flee confirmation — leaving a real raid is a gamble, not a free exit.
            Fixed overlay so it blocks the action panel too while it's open. */}
        {/* ── THE FLEE ROLL, ON THE VIEWPORT ──────────────────────────────
            Portalled to <body>, and that is load-bearing rather than tidy. It
            is `position: fixed`, but the stage above it is a motion.div that
            framer-motion keeps a transform on for the camera shake — and a
            transformed ancestor becomes the containing block for anything
            fixed inside it. So this centred itself inside the STAGE: over the
            sea, a band of scrim across the upper part of the screen with the
            dice sitting in it. See feedback_transform_breaks_fixed.

            No backdrop blur either: behind this the chart is still running,
            and a backdrop filter over a live canvas is a full-screen blur pass
            every frame. The scrim is 82% opaque and does the job alone. */}
        {fleeOpen && typeof document !== 'undefined' && createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(3,7,12,0.86)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
            <div style={{ width: '100%', maxWidth: 320, background: '#0a131f', border: '1px solid #2a3548', borderRadius: 16, padding: '1.1rem 1.1rem 1.2rem', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}>
              {fleeResult ? (
                <>
                  {/* Settled die — pops in on the rolled face. The only
                      numbers on screen: what you rolled vs what you needed. */}
                  <motion.div
                    initial={{ scale: 1.3 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 18 }}
                    style={{ width: 72, height: 72, margin: '0 auto 8px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: fleeResult.success ? 'rgba(24,48,36,0.9)' : 'rgba(54,22,22,0.9)', border: `2px solid ${fleeResult.success ? 'rgba(126,224,160,0.65)' : 'rgba(228,114,114,0.6)'}` }}
                  >
                    <span className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: fleeResult.success ? '#7ee0a0' : '#f0a0a0' }}>{fleeResult.natural}</span>
                  </motion.div>
                  <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#a8b8d0', marginBottom: 10 }}>
                    {fleeResult.natural === 20 ? 'Natural 20!'
                      : fleeResult.natural === 1 ? 'Natural 1. The sea said no.'
                      : `Needed ${fleeNeed}+`}
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: fleeResult.success ? '#7ee0a0' : fleeResult.defeated ? '#f0a890' : '#f0ede8', marginBottom: 6 }}>
                    {fleeResult.success ? 'Clean getaway!' : fleeResult.defeated ? 'Run down as you fled' : 'They caught you!'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
                    {fleeResult.success
                      ? `You slip ${enemy.name}'s reach and run for open water.`
                      : fleeResult.defeated
                      ? `${enemy.name} ran you down for ${fleeResult.dmg} and your ship went under.`
                      : `${enemy.name} landed a parting shot for ${fleeResult.dmg}. No escape this time.`}
                  </p>
                  <button type="button" onClick={dismissFleeResult} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ width: '100%', padding: '0.7rem', borderRadius: 10, border: `1px solid ${fleeResult.success ? 'rgba(126,224,160,0.5)' : 'rgba(122,138,160,0.5)'}`, background: fleeResult.success ? 'rgba(24,48,36,0.9)' : 'rgba(20,32,48,0.9)', color: fleeResult.success ? '#c8f0d8' : '#cfe2ff', fontSize: '0.8rem', cursor: 'pointer' }}>
                    {fleeResult.success ? 'Sail Away' : fleeResult.defeated ? 'Continue' : 'Fight On'}
                  </button>
                </>
              ) : fleeRoll ? (
                <>
                  {/* Tumbling die — faces cycle until the settle effect lands
                      the real number. No buttons; the roll is committed. */}
                  <motion.div
                    animate={{ rotate: [-7, 7, -7] }}
                    transition={{ repeat: Infinity, duration: 0.28, ease: 'easeInOut' }}
                    style={{ width: 72, height: 72, margin: '0 auto 8px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.06)', border: '2px solid rgba(122,138,160,0.5)' }}
                  >
                    <span className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: '#f0ede8' }}>{fleeFace}</span>
                  </motion.div>
                  <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#e4bc6c', marginBottom: 6 }}>
                    Need {fleeNeed}+
                  </p>
                </>
              ) : (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', marginBottom: 10 }}>Flee the raid?</p>
                  {/* One number, big: the die face the escape needs. The
                      breakdown behind it stays in the tuning block — casual
                      players just need "roll this or better". */}
                  <div style={{ width: 72, height: 72, margin: '0 auto 6px', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)', border: '2px solid rgba(228,188,108,0.45)' }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '1.6rem', color: '#e4bc6c' }}>{fleeNeed}+</span>
                  </div>
                  <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#e4bc6c', marginBottom: 10 }}>
                    needed to escape
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
                    A failed escape lets {enemy.name} land a parting shot.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setFleeOpen(false)} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#cfcabf', fontSize: '0.78rem', cursor: 'pointer' }}>
                      Hold Fast
                    </button>
                    <button type="button" onClick={attemptFlee} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(228,114,114,0.55)', background: 'rgba(212,84,84,0.22)', color: '#f8d2d2', fontSize: '0.78rem', cursor: 'pointer' }}>
                      Roll to Flee
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        , document.body)}

        {/* Enemy HP nameplate — top-left, with circular portrait badge.
            Elite encounters paint with a purple-violet accent (border,
            portrait ring, glow) so they read as "this one is different"
            from the moment they appear.

            motion.button + key={speedWinnerKey} fires a fresh lunge +
            red border flash each reveal beat when enemy wins
            initiative (toward player's bottom-right). The animation
            sweeps from the static border back to it; phase-2 / boss /
            elite static borders are preserved between beats. */}
        <motion.button
          type="button"
          onClick={() => setShowEnemyStats(true)}
          aria-label={`${enemy.name} — view stats`}
          className={enemyPhase >= 2 ? 'rc-phase2-pulse' : undefined}
          animate={enemyNameplateAnim}
          ref={enemyPlateRef}
          style={{
            // Over the sea the frame loop moves this onto the enemy's own hull;
            // the corner is where it sits on a /raids/* route, and where it
            // starts here before the first frame places it.
            position: 'absolute', top: 10, left: 10, zIndex: 4,
            padding: '0.45rem 0.6rem 0.5rem 0.45rem',
            background: 'rgba(6,12,20,0.9)',
            // Phase 2 overrides the normal boss-gold (or elite-violet)
            // accent with crimson — same intensity as elite, deeper red so
            // it reads as "wounded and dangerous" not just "boss".
            border: `1px solid ${
              enemyPhase >= 2 ? '#ef4444'
              : isBoss ? '#fbbf24'
              : isElite ? '#a78bfa'
              : '#2a3548'
            }`,
            borderRadius: 12,
            boxShadow:
              enemyPhase >= 2 ? '0 0 18px rgba(239,68,68,0.5)'
              : isElite ? '0 0 14px rgba(167,139,250,0.32)'
              : undefined,
            display: 'flex', alignItems: 'center', gap: 8,
            minWidth: 160,
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit', color: 'inherit',
          }}
        >
          {enemy.portrait && (
            <div style={{
              flexShrink: 0, width: 54, height: 54, borderRadius: '50%',
              border: `2px solid ${
                enemyPhase >= 2 ? '#ef4444'
                : isBoss ? '#fbbf24'
                : isElite ? '#a78bfa'
                : ENEMY_COLOR
              }`,
              overflow: 'hidden',
              boxShadow: `0 0 ${enemyPhase >= 2 ? 14 : 10}px ${
                enemyPhase >= 2 ? 'rgba(239,68,68,0.6)'
                : isBoss ? 'rgba(251,191,36,0.45)'
                : isElite ? 'rgba(167,139,250,0.55)'
                : 'rgba(239,68,68,0.4)'
              }`,
              background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, rgba(20,40,60,0.85) 70%)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enemy.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff', lineHeight: 1, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {enemy.name}
              </p>
              {/* Has-abilities tell — ONE inline glyph whenever the enemy carries
                  any themed ability (Carapace, Mist Veil, Rolling Plate, Shark's
                  Bite, a Special or an Ultimate). A single marker scales no matter
                  how many an enemy stacks; the full spelled-out breakdown lives in
                  the stats popup (tap the nameplate). aria-label names each one so
                  screen readers still get the specifics. */}
              {(() => {
                const tells: string[] = []
                if ((enemy.damageReduction ?? 0) > 0)  tells.push(enemy.abilityName ?? 'special defense')
                if ((enemy.aimFogDensity ?? 0) > 0)    tells.push(enemy.aimFogName ?? 'Mist Veil')
                if ((enemy.critDrift ?? 0) > 0)        tells.push(enemy.critDriftName ?? 'Rolling Plate')
                if ((enemy.chargeBiteChance ?? 0) > 0) tells.push("Shark's Bite")
                if (enemy.special)  tells.push(enemy.special.name)
                if (enemy.ultimate) tells.push(enemy.ultimate.name)
                if (tells.length === 0) return null
                return (
                  <span
                    aria-label={`Has ${tells.length > 1 ? 'abilities' : 'ability'}: ${tells.join(', ')}`}
                    style={{ lineHeight: 1, flexShrink: 0, color: '#f0c040', filter: 'drop-shadow(0 0 4px rgba(240,192,64,0.5))', display: 'flex' }}
                  >
                    <IconStar size={11} />
                  </span>
                )
              })()}
              {isBoss && enemyPhase !== 2 && (
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#fbbf24', letterSpacing: '0.1em' }}>BOSS</span>
              )}
              {isElite && !isBoss && (
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#c4b5fd', letterSpacing: '0.1em' }}>ELITE</span>
              )}
              {/* Phase 2 takes over the BOSS tag — same slot, crimson
                  accent, slightly larger letter-spacing so it reads as
                  the new defining label for this enemy. The fight has
                  visibly escalated; the badge says so. */}
              {enemyPhase >= 2 && (
                <span
                  className="font-karla font-700 uppercase rc-phase2-badge"
                  style={{ fontSize: '0.58rem', color: '#fca5a5', letterSpacing: '0.14em', textShadow: '0 0 6px rgba(239,68,68,0.7)' }}
                >
                  PHASE {enemyPhase}
                </span>
              )}
            </div>
            {/* Affix label sits under the name when elite — players see at
                a glance what twist this elite has, and can tap into the
                stats popup for the full description. */}
            {/* ── WHICH RUN THIS IS ──────────────────────────────────
                On the enemy's own card, because that is the one thing on
                screen for the whole fight and the challenge is a property of
                the ship you are taking on. In the campaign's own colour for a
                challenge branch, so a captain meets one hue for the idea
                wherever they run into it — the elite violet below is a
                different statement and keeps its own. */}
            {challenge && (
              <p className="font-karla font-700 uppercase" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                alignSelf: 'flex-start', marginBottom: 3,
                padding: '1px 6px', borderRadius: 999,
                fontSize: '0.46rem', letterSpacing: '0.16em',
                color: '#f0c3b8', background: 'rgba(224,138,122,0.18)',
                border: '1px solid rgba(224,138,122,0.55)',
              }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.6-6.3 4.6L7.9 13.8 2 9.4h7.6z" /></svg>
                Challenge
              </p>
            )}
            {affix && (
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', color: '#a78bfa', letterSpacing: '0.14em', marginBottom: 3 }}>
                {affix.name}
              </p>
            )}
            {/* Persistent snare tell — the enemy's helm is jammed, no dodging */}
            {snareDodgeTurns > 0 && (
              <span className="font-karla font-700 uppercase" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 3,
                padding: '1px 6px', borderRadius: 999, fontSize: '0.46rem', letterSpacing: '0.1em',
                color: '#f0d79a', background: 'rgba(217,176,102,0.16)', border: '1px solid rgba(217,176,102,0.5)',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                Dodge Jammed · {snareDodgeTurns}
              </span>
            )}
            {/* Foresight (Oracle) — the enemy's revealed upcoming moves. First is
                imminent (full opacity); later moves fade back. */}
            {foreseenMoves && foreseenMoves.length > 0 && (
              <span className="font-karla font-700 uppercase" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 3,
                padding: '1px 6px', borderRadius: 999, fontSize: '0.46rem', letterSpacing: '0.08em',
                color: '#cfc4ff', background: 'rgba(139,123,240,0.16)', border: '1px solid rgba(139,123,240,0.5)',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
                {foreseenMoves.map((a, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', opacity: i === 0 ? 1 : 0.5 }}>
                    {i > 0 && <span style={{ opacity: 0.6, margin: '0 2px' }}>→</span>}
                    {a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'reload' ? 'Reload' : a === 'mega' ? 'Mega' : a === 'repair' ? 'Repair' : a === 'special' ? 'Special' : a === 'ultimate' ? 'Ultimate' : 'Dodge'}
                  </span>
                ))}
              </span>
            )}
            {/* The "Plate N" pill that used to sit here is gone. It existed
                because the barrier only ever showed as a segment INSIDE the HP
                bar, drawn in the bar's empty hull space: while plate was doing
                its job the hull never dropped, so the empty space stayed zero
                and the segment rendered at zero width. The armour was invisible
                for exactly as long as it mattered.

                Folding every shield into one pool fixed that properly. HPBar's
                compact mode now draws a shield chip UNDER the bar carrying the
                same number, on the same rules, and it does not care what the
                hull is doing. Two marks for one number, three inches apart. */}
            {/* Enemy barrier (Warded affix / The Warding curse) folds into the
                HP bar as a violet segment so it reads as the enemy's, not your
                cyan shield. */}
            <HPBar current={enemyHp} max={enemyHpMax} accent={ENEMY_COLOR} compact shield={enemyShieldHp} shieldColor="#c084fc" shieldGradTo="#a855f7" hidden={enemyHpHidden} />
            <ChargesRow
              charges={enemyCharges} max={enemyMagazine} small hidden={enemyChargesHidden}
              // Ultimate tell — the full battery glows the same way the player's
              // Mega-ready pips do, in the danger red the ultimate hits in.
              readyGlow={enemy.ultimate && !enemyChargesHidden && enemyCharges >= enemyMagazine ? '#ff4d6d' : null}
            />
            {/* Ch4 statuses + bespoke effect chips (burn/freeze/snare) — one row. */}
            <StatusBadgesRow statuses={enemyStatuses} bespoke={[
              ...(aegisVis ? [{ key: 'aegis', color: '#e8d8a8', title: `${aegisVis.name} — a wall drinks every shot whole` }] : []),
              ...(enemyBurning ? [{ key: 'burn', color: '#fb923c', title: 'Ablaze — burning each turn' }] : []),
              ...(enemyFrozen ? [{ key: 'freeze', color: '#7dd3fc', title: 'Frozen — its turn is skipped' }] : []),
              // The ward has to be VISIBLE or the timing is one-sided: he reads
              // your burst, you never get to read his. Seeing it up is what lets
              // you hold the killing blow until it lapses.
              ...(wardUp ? [{ key: 'ward', color: '#d1495b', title: 'Death ward — the killing blow will not land while this holds' }] : []),
              ...(foreseeUp ? [{ key: 'foresee', color: '#8b7bf0', title: 'Reading you — he slips everything you fire while this holds' }] : []),
              ...(snareDodgeTurns > 0 ? [{ key: 'snare', color: '#d9b066', turns: snareDodgeTurns, title: 'Snared — dodges can be fouled' }] : []),
            ]} />
          </div>
        </motion.button>

        {/* Enemy boat — sits in the water (below the horizon), farther away than the player */}
        <motion.div
          key={`enemy-${enemy.id}`}
          ref={enemyShipRef}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1, rotate: enemyTilt }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          onUpdate={overSea ? (l) => {
            const e = shipFxRef.current.e
            e.ox = Number(l.x) || 0
            e.orot = Number(l.rotate) || 0
          } : undefined}
          style={{
            position: 'absolute', right: '7%', top: '42%', zIndex: 2,
            width: '38%', maxWidth: 185, transformOrigin: 'bottom center',
          }}
        >
          <motion.div animate={enemyShakeCtrl}
            onUpdate={overSea ? (l) => {
              const e = shipFxRef.current.e
              e.sx = Number(l.x) || 0
              e.sy = Number(l.y) || 0
              e.srot = Number(l.rotate) || 0
            } : undefined}
            style={{ position: 'relative' }}>
            <ShipDamageFX hpPct={enemyHpPctLive} />
            {/* Elite halo — STACKED drop-shadows on the ship sprite itself
                so the glow follows the PNG alpha silhouette rather than a
                rectangular container behind it. An earlier radial-gradient
                box read as a literal box-shaped backdrop ("not actually
                glowing around the ship"); dropping the radial and layering
                three drop-shadows produces a tight inner halo + a wider
                soft bloom that hugs the hull shape. Skipped on the boss
                (boss has its own gold treatment + Phase 3 multi-phase). */}
            <motion.img
              src={enemy.image}
              alt={enemy.name}
              animate={enemySinking
                // One-shot sink: drop + tilt + fade over ~1.3s. Anchored
                // to the same beat as the kill log so the ship is gone
                // by the time the loot / next-enemy beat lands.
                ? { y: [0, 5, 40, 90], rotate: [0, -3, -9, -13], opacity: [1, 0.9, 0.5, 0] }
                // NO IDLE BOB OVER THE SEA. This sprite is hidden there and the
                // chart's own hull is the one bobbing — but framer-motion does
                // not know that, and an infinite keyframe on an invisible
                // element is a transform written every frame for nobody.
                : overSea ? { y: 0 } : { y: [0, -4, 0] }}
              transition={enemySinking
                ? { duration: 1.3, times: [0, 0.15, 0.55, 1], ease: 'easeIn' }
                : overSea ? { duration: 0 }
                : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: '100%', display: 'block', position: 'relative', zIndex: 1,
                // See the player hull: the chart draws this one over the sea,
                // and the box stays so the effects keep their geometry.
                visibility: overSea ? 'hidden' : 'visible',
                transform: 'scaleX(-1)',  // face the player
                // Just a grounding drop-shadow now. The elite (violet) +
                // wounded-boss (crimson) halos, the boss/non-boss hue-rotate hull
                // tint, and the gauntlet drowned/ghost wash were all removed —
                // enemy art shows in its natural colour.
                filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
                pointerEvents: 'none',
              }}
            />
            {/* Persistent burn/freeze tell — lingers between activation + tick */}
            {(enemyBurning || enemyFrozen) && <ShipStatusAura burning={enemyBurning} frozen={enemyFrozen} />}
            {/* The Last Wall — pale rampart ring around the hull while the
                aegis stands; exit scales up + fades so the break reads as a
                shatter without any extra FX machinery. */}
            <AnimatePresence>
              {aegisVis && <AegisWallRing key="aegis-wall" />}
            </AnimatePresence>
            {/* Status aura — burning embers / freezing rime / snare jam over the hull */}
            <AnimatePresence>
              {enemyAura && <EnemyStatusAura key={`ea-${enemyAura.key}`} kind={enemyAura.kind} color={enemyAura.color} />}
            </AnimatePresence>
            {/* Muzzle flash when the enemy fires back (toward the player, left) */}
            {enemyMuzzle && (
              <CannonShotBurst key={`em-${enemyMuzzle.key}`} kind={enemyMuzzle.kind} dir="left" />
            )}
            {/* Dodge whoosh — enemy juts back-right out of the way */}
            <AnimatePresence>
              {dodgeFx?.actor === 'enemy' && (
                <DodgeWhoosh key={`dw-${dodgeFx.key}`} image={enemy.image} flip dir="right" />
              )}
            </AnimatePresence>
            {/* Explosion burst on impact — overlays the enemy hull */}
            {enemyImpact && (
              <ImpactBurst key={`ei-${enemyImpact.key}`} kind={enemyImpact.kind} />
            )}
            {/* Bespoke chase-skin ability strikes over the enemy hull. */}
            {enemyStrikeFx?.kind === 'tempest' && (
              <TempestStrikeFx key={`tsf-${enemyStrikeFx.key}`} color={enemyStrikeFx.color} shots={enemyStrikeFx.shots ?? 5} interval={enemyStrikeFx.interval ?? 200} />
            )}
            {enemyStrikeFx?.kind === 'leviathan' && (
              <LeviathanStrikeFx key={`lsf-${enemyStrikeFx.key}`} color={enemyStrikeFx.color} />
            )}
            {enemyStrikeFx?.kind === 'requiem' && (
              <RequiemMarkFx key={`rmf-${enemyStrikeFx.key}`} color={enemyStrikeFx.color} />
            )}
            {enemyStrikeFx?.kind === 'oracle' && (
              <KrakenOracleFx key={`kof-${enemyStrikeFx.key}`} color={enemyStrikeFx.color} />
            )}
            {/* Thermal Shock confluence — the ice+fire shatter detonation */}
            <AnimatePresence>
              {thermalShockFx && <ThermalShockBurst key={`ts-${thermalShockFx.key}`} />}
            </AnimatePresence>
            {/* Carapace deflect — the plate shrugs a soaked shot away */}
            {enemyDeflect > 0 && <CarapaceDeflect key={`cd-${enemyDeflect}`} />}
            {/* Man-o-War Mega FX (Railgun beam lives at stage level, below) */}
            {nukeBlast && <NukeBlast   key={`nb-${nukeBlast.key}`} color={nukeBlast.color} />}
            <AnimatePresence>
              {eHitsplat && <HitsplatOverlay key={eHitsplat.key} text={eHitsplat.text} color={eHitsplat.color} big={eHitsplat.big} volley={eHitsplat.volley} />}
            </AnimatePresence>
            {/* Frenzy barrage — each shot's own floating number, scattered. */}
            {barrageSplats.map(s => <BarrageSplat key={s.key} text={s.text} dx={s.dx} crit={s.crit} color={s.color} />)}
          </motion.div>
        </motion.div>

        {/* Player ship — lower left area, larger ("closer"). Outer mount, inner shake. */}
        <motion.div
          ref={playerShipRef}
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1, rotate: playerTilt }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          onUpdate={overSea ? (l) => {
            const p = shipFxRef.current.p
            p.ox = Number(l.x) || 0
            p.orot = Number(l.rotate) || 0
          } : undefined}
          style={{
            position: 'absolute', left: '0%', bottom: '4%', zIndex: 3,
            width: '68%', maxWidth: 340, transformOrigin: 'bottom center',
          }}
        >
          <motion.div animate={playerShakeCtrl}
            onUpdate={overSea ? (l) => {
              const p = shipFxRef.current.p
              p.sx = Number(l.x) || 0
              p.sy = Number(l.y) || 0
              p.srot = Number(l.rotate) || 0
            } : undefined}
            style={{ position: 'relative' }}>
            <motion.div animate={playerRecoilCtrl}
              onUpdate={overSea ? (l) => {
                const p = shipFxRef.current.p
                p.rx = Number(l.x) || 0
                p.ry = Number(l.y) || 0
              } : undefined}
              style={{ position: 'relative' }}>
              <ShipDamageFX hpPct={playerHpPctLive} flip />
              <motion.img
                src={shipImageUrl}
                alt={shipName}
                // Hidden over the sea, where the chart draws her instead — so
                // the idle bob is a per-frame transform on an invisible
                // element. See the enemy's.
                animate={overSea ? { y: 0 } : { y: [0, -3, 0] }}
                transition={overSea ? { duration: 0 } : { duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: '100%', display: 'block',
                  // OVER THE SEA THE CHART IS DRAWING THIS SHIP. Hidden rather
                  // than removed, on purpose: it still holds the anchor's box
                  // open, so every effect measuring this hull for a trajectory
                  // or an origin gets the same geometry it always did.
                  // `visibility`, not `opacity` — opacity is animated on these
                  // sprites and the two would fight.
                  visibility: overSea ? 'hidden' : 'visible',
                  // Combine the equipped-skin recolor with the standard
                  // drop-shadow so both apply. shipFilter is the bare
                  // recolor string from getShipSkin().filter; we prepend
                  // the drop-shadow so the skin's hue/brightness still
                  // works even when no skin is set.
                  filter: `drop-shadow(0 3px 6px rgba(0,0,0,0.35))${shipFilter && shipFilter !== 'none' ? ` ${shipFilter}` : ''}`,
                }}
              />
              {cannonShot && (
                <CannonShotBurst key={`cs-${cannonShot.key}`} kind={cannonShot.kind} />
              )}
              {/* Buff pulse — the player ship flares in the ability's class
                  color the instant a crew ability fires (pairs with the cast
                  banner so the activation lands on the ship itself too). */}
              <AnimatePresence>
                {abilityCast && (
                  <motion.div
                    key={`pcast-${abilityCast.key}`}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: [0, 0.9, 0], scale: 1.5 }}
                    transition={{ duration: 0.8, ease: 'easeOut', times: [0, 0.28, 1] }}
                    style={{
                      position: 'absolute', inset: '-8%', borderRadius: '50%',
                      pointerEvents: 'none', zIndex: 2, mixBlendMode: 'screen',
                      background: `radial-gradient(ellipse at center, ${abilityCast.color}cc 0%, ${abilityCast.color}55 40%, transparent 72%)`,
                    }}
                  />
                )}
              </AnimatePresence>
              {/* Heal sparkle — green motes rising off the patched hull */}
              <AnimatePresence>
                {playerAura && <PlayerStatusAura key={`pa-${playerAura.key}`} kind={playerAura.kind} color={playerAura.color} />}
              </AnimatePresence>
              {/* Persistent burn glow / frost tint from elite Scorching / Glacial */}
              {(playerBurning || playerFrozen) && <ShipStatusAura burning={playerBurning} frozen={playerFrozen} paused={subPhase === 'aiming'} />}
              {/* The ward, while it holds: a slow crimson pulse around your hull. It
                  quickens on the last turn, because a fuse you cannot hear run out is
                  not a decision. */}
              {vengeanceWardTurns > 0 && <VengeanceWardAura urgent={vengeanceWardTurns === 1} paused={subPhase === 'aiming'} />}
              {/* Wounded Fury (boon) — deliberately NO hull halo. The old crimson
                  rage rim (radial ring growing as HP dropped) read as a SHIELD
                  bubble — the same visual language as the absorb-shield glow —
                  which is the opposite of what the boon does. Same reasoning as
                  Cannonade's removed rim below; the ramp already shows in the
                  damage numbers + the Ledger. */}
              {/* Cannonade (boon) — a streak badge on the hull that brightens
                  with each consecutive crit (ember orange, gold at max). No hull
                  halo: a radial glow read as a "shield", which this isn't — the
                  labelled badge carries it cleanly on its own. */}
              {cannonadeStacks > 0 && (() => {
                const maxStk = tide.critStreakMaxStacks || 5
                const maxed = cannonadeStacks >= maxStk
                const col = maxed ? '251,191,36' : '251,146,60'
                return (
                  <motion.div key={`cn-${cannonadeStacks}`} aria-hidden
                    initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 20 }}
                    className="font-karla font-800 uppercase tracking-wide"
                    style={{
                      position: 'absolute', top: '-8%', right: '-3%', zIndex: 5, pointerEvents: 'none',
                      padding: '2px 7px', borderRadius: 999, fontSize: '0.6rem', lineHeight: 1,
                      color: '#1a1204', background: `rgba(${col},0.97)`, border: '1px solid rgba(255,255,255,0.55)',
                      boxShadow: `0 0 12px rgba(${col},0.85)`, whiteSpace: 'nowrap',
                    }}>
                    {maxed ? `${streakLabel} Max` : `${streakLabel} ×${cannonadeStacks}`}
                    {!!critStreakCfg?.pierceAt && cannonadeStacks >= critStreakCfg.pierceAt && (
                      <span style={{ marginLeft: 4, opacity: 0.9 }}>· PIERCING</span>
                    )}
                  </motion.div>
                )
              })()}
              {/* Impact spray when the enemy's shot lands on the player hull */}
              {playerImpact && (
                <ImpactBurst key={`pi-${playerImpact.key}`} kind={playerImpact.kind} />
              )}
              {/* Bespoke chase-skin ability FX over the player hull (Catfish's Galaxy surge) */}
              {playerStrikeFx?.kind === 'galaxy' && (
                <GalaxySurgeFx key={`gsf-${playerStrikeFx.key}`} color={playerStrikeFx.color} />
              )}
              {playerStrikeFx?.kind === 'ward' && (
                <FossilWardFx key={`fwf-${playerStrikeFx.key}`} color={playerStrikeFx.color} />
              )}
              {/* Lethal-save burst — Quartermaster's Anchor catches a killing blow */}
              {anchorSaveFx > 0 && <AnchorSaveBurst key={`asf-${anchorSaveFx}`} />}
              {/* Vengeance erupt — Laz's ward cheats a killing blow */}
              {vengeanceEruptFx > 0 && <VengeanceEruptBurst key={`vef-${vengeanceEruptFx}`} />}
              {/* Dodge whoosh — player juts back-left out of the way */}
              <AnimatePresence>
                {dodgeFx?.actor === 'player' && (
                  <DodgeWhoosh key={`dw-${dodgeFx.key}`} image={shipImageUrl} dir="left" />
                )}
              </AnimatePresence>
              {/* Defensive-cue overlays that differ by SILHOUETTE as well as
                  color. A shield HP POOL (Abyssal/crew) is a soft round CYAN
                  bubble; an Anchor BRACE (a one-hit damage cut, no pool) is a
                  STEEL angular bracket frame clamping the hull — so a reduction
                  reads as bracing, never as a shield pool. Both pulse OPACITY
                  ONLY (no mixBlendMode/blur — these persist many turns and a
                  blend layer re-composites the whole stage every pulse frame:
                  "everything lags after Abyssal Tide"). */}
              {abyssalShieldHp > 0 && (
                // A barrier is a SURFACE, not a glow: what sells it is a defined
                // rim + an energy lattice + a sheen travelling over it. The old
                // version was the same pulsing blob as burn/freeze in another
                // colour, so it read as backlight rather than protection.
                <div aria-hidden style={{ position: 'absolute', inset: '-7%', borderRadius: '50%', pointerEvents: 'none', zIndex: 2, overflow: 'hidden' }}>
                  <style>{`
                    @keyframes rc-shield-rim { 0%,100% { opacity: 0.55; } 50% { opacity: 0.82; } }
                  `}</style>
                  {/* Just the dome + its rim. The lattice and travelling sheen
                      were too busy for something that sits on screen the whole
                      fight — the defined EDGE alone is what reads as a barrier. */}
                  <div style={{
                    position: 'absolute', inset: 0, borderRadius: '50%',
                    background: 'radial-gradient(ellipse 72% 104% at 74% 50%, rgba(125,211,252,0.22) 0%, rgba(94,234,212,0.1) 54%, transparent 78%)',
                    border: '1.5px solid rgba(150,225,255,0.55)',
                    boxShadow: 'inset 0 0 20px rgba(125,211,252,0.26), 0 0 12px rgba(94,234,212,0.2)',
                    animation: subPhase === 'aiming' ? 'none' : 'rc-shield-rim 2.2s ease-in-out infinite',
                    opacity: subPhase === 'aiming' ? 0.7 : undefined,
                  }} />
                </div>
              )}
              {/* Soak reaction — the barrier FLARES when it eats a hit. The
                  quiet dome above is the resting state; this is the moment it
                  actually does its job, so it's the loud one. */}
              {shieldSoakFx && (
                <motion.div
                  key={shieldSoakFx.key}
                  aria-hidden
                  initial={{ opacity: 0.9, scale: 0.94 }}
                  animate={{ opacity: 0, scale: 1.16 }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  style={{
                    position: 'absolute', inset: '-7%', borderRadius: '50%', pointerEvents: 'none', zIndex: 3,
                    border: '2.5px solid rgba(186,240,255,0.95)',
                    boxShadow: '0 0 26px rgba(125,211,252,0.85), inset 0 0 34px rgba(150,225,255,0.6)',
                    background: 'radial-gradient(ellipse at 74% 50%, rgba(186,240,255,0.3) 0%, transparent 68%)',
                  }}
                />
              )}
              {abyssalShieldHp <= 0 && (anchorReductionPct ?? 0) > 0 && (
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0.4 }}
                  animate={subPhase === 'aiming' ? { opacity: 0.62 } : { opacity: [0.4, 0.72, 0.4] }}
                  transition={subPhase === 'aiming' ? { duration: 0.2 } : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }}
                >
                  {/* Steel iron-brace brackets — 4 corners clamping the hull. Sit
                      flush at the hull-box corners (inset 0), never outside it, so
                      the left pair can't overhang the stage edge and get clipped. */}
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTop: '3px solid rgba(158,176,205,0.92)', borderLeft: '3px solid rgba(158,176,205,0.92)', boxShadow: '0 0 9px rgba(158,176,205,0.6)' }} />
                  <div style={{ position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTop: '3px solid rgba(158,176,205,0.92)', borderRight: '3px solid rgba(158,176,205,0.92)', boxShadow: '0 0 9px rgba(158,176,205,0.6)' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottom: '3px solid rgba(158,176,205,0.92)', borderLeft: '3px solid rgba(158,176,205,0.92)', boxShadow: '0 0 9px rgba(158,176,205,0.6)' }} />
                  <div style={{ position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottom: '3px solid rgba(158,176,205,0.92)', borderRight: '3px solid rgba(158,176,205,0.92)', boxShadow: '0 0 9px rgba(158,176,205,0.6)' }} />
                </motion.div>
              )}
            </motion.div>
            <AnimatePresence>
              {pHitsplat && <HitsplatOverlay key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} big={pHitsplat.big} volley={pHitsplat.volley} />}
            </AnimatePresence>
          </motion.div>
          {/* Railgun — a hyper beam erupting across the stage from the player's
              guns into the enemy hull. Stage-level so it isn't clipped. */}
          {/* Davy's Heavy Cannon heat — a per-fight damage stack badge that runs
              hotter (orange → red) as the ramp builds, and re-pops each turn it
              climbs. Only shows once the ramp has actually accrued (turn 2+). */}
          {rampBonusPct > 0 && (() => {
            const heatColor = rampBonusPct >= 40 ? '#ef4444' : rampBonusPct >= 20 ? '#f97316' : '#fb923c'
            const heatGlow = Math.min(22, 7 + rampBonusPct * 0.32)
            return (
              <motion.div
                key={rampBonusPct}
                aria-hidden
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: [0.85, 1.06, 1], opacity: 0.82 }}
                transition={{ duration: 0.34, ease: 'easeOut' }}
                style={{
                  position: 'absolute', bottom: '2%', left: '3%', zIndex: 6, pointerEvents: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 2,
                  padding: '1px 5px 1px 4px', borderRadius: 999,
                  background: 'rgba(6,10,16,0.55)',
                  border: `1px solid ${heatColor}66`,
                  boxShadow: `0 0 ${heatGlow}px ${heatColor}33`,
                  opacity: 0.82,
                }}
              >
                <svg width="9" height="10" viewBox="0 0 24 24" fill={heatColor} stroke="none">
                  <path d="M12 2c1 3-1.5 4.5-1.5 7A4.5 4.5 0 0 0 17 13c.4 3-1.6 8-5 8a5 5 0 0 1-5-5c0-3.6 3.5-5 5-13z" />
                </svg>
                <span className="font-cinzel font-800" style={{ fontSize: '0.55rem', color: heatColor, lineHeight: 1 }}>+{rampBonusPct}%</span>
              </motion.div>
            )
          })()}
        </motion.div>

        {/* Railgun — a hyper beam from the player's bow into the enemy hull.
            Rendered as a DIRECT child of the stage so its measured px coords
            share the stage's coordinate space (not the tilted ship container). */}
        {railBeam && <RailgunBeam key={`rb-${railBeam.key}`} color={railBeam.color} x1={railBeam.x1} y1={railBeam.y1} len={railBeam.len} angle={railBeam.angle} />}

        {/* Nuke silo launch — the arcing missile flies stage-level so its measured
            path spans both ships; the detonation itself lands on the enemy hull. */}
        {nukeMissile && <NukeMissile key={`nm-${nukeMissile.key}`} color={nukeMissile.color} x1={nukeMissile.x1} y1={nukeMissile.y1} x2={nukeMissile.x2} y2={nukeMissile.y2} dur={nukeMissile.dur} />}

        {/* Coffers admiral — "Flare Barrage": a reactive whack-a-mole overlay.
            Swat the false flares before their fuses close; misses chip you. */}
        {subPhase === 'flares' && (
          <FlareBarrage
            key={`barrage-${turn}`}
            count={flareCount}
            color="#f59e0b"
            label={enemy.decoyName ?? 'Flare Barrage'}
            feintChance={flareFeintChance}
            clusterChance={flareClusterChance}
            fuseScale={flareFuseScale}
            onComplete={onFlareBarrageDone}
          />
        )}

        {/* Mechanic-check indicator — a pulsing banner at the top edge. Shows the
            move name + a live turn countdown, AND the telegraph line (what the
            boss is winding up) so a player can SEE what's happening for the whole
            window, not just catch it once as it scrolls past in the log. The
            "how to answer" hint lives on the enemy stats popup. */}
        {pendingCheck && (
          <div style={{ position: 'absolute', top: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 13, pointerEvents: 'none', width: 'min(340px, 92%)' }}>
            <div className="rc-check-banner" style={{ display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 12, padding: '0.34rem 0.6rem', background: 'linear-gradient(180deg, rgba(120,20,20,0.92), rgba(70,10,10,0.9))', border: '1px solid rgba(248,113,113,0.7)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fca5a5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                <span className="font-cinzel font-800 uppercase tracking-[0.08em]" style={{ fontSize: '0.64rem', color: '#ffe0e0', textShadow: '0 0 8px rgba(239,68,68,0.8)' }}>{pendingCheck.name}</span>
                <span className="font-karla font-800" style={{ fontSize: '0.58rem', color: '#2a0a0a', background: '#fca5a5', borderRadius: 999, minWidth: 15, textAlign: 'center', padding: '0 0.28rem' }}>{pendingCheck.turnsLeft}</span>
              </div>
              <p className="font-karla font-500" style={{ fontSize: '0.6rem', color: '#ffd7d7', lineHeight: 1.3, textAlign: 'center' }}>{pendingCheck.telegraph}</p>
              {/* Explicit "this is a crew-ability check" cue — the telegraph is
                  flavor; players need to know the ANSWER is a crew ability. */}
              <p className="font-karla font-700" style={{ fontSize: '0.56rem', color: '#ffe9b0', lineHeight: 1.3, textAlign: 'center', marginTop: 1 }}>{crewCounterCue(pendingCheck.responses)}</p>
            </div>
          </div>
        )}

        {/* ── THE DIAL OVERLAY ────────────────────────────────────────────
            Finn's fight is aimed on the fishing dial, presented the way the
            fishing screen presents it: centred and dominant, not tucked into
            the aim-bar slot. Portalled to <body> because an ancestor with a
            transform would break `fixed` (see the framer-motion/fixed rule).

            pointer-events: none THROUGHOUT, deliberately. The overlay is
            purely the instrument; the real Lock Shot button stays live in its
            own slot underneath, so the tap target the player already knows
            (and all its iOS hit-testing fixes) is untouched. */}
        {finaleDefeat && typeof document !== 'undefined' && createPortal(
          <FinnDefeatFx lines={finaleDefeat} onDone={() => { setFinaleDefeat(null); finaleDoneRef.current?.(); finaleDoneRef.current = null }} />,
          document.body)}
        {onDial && subPhase === 'aiming' && typeof document !== 'undefined' && createPortal(
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0,
            // Stops where the action panel starts, so the dial centres in the
            // space ABOVE the Lock Shot button at any window size instead of in
            // the viewport, which only agreed with the button on a phone.
            bottom: dialFloorPx,
            zIndex: 1200, pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {/* The scrim is TOP-ANCHORED and ends above the action row, so the
                Lock Shot button is never dimmed by it. A centred radial was
                still ~0.9 opaque past mid-screen and laid a shadow straight
                over the button, which is the one thing the player has to see
                and hit while the dial is up. Bottom third is left clean. */}
            <div aria-hidden style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: '68%',
              background: 'linear-gradient(180deg, rgba(2,5,10,0.88) 0%, rgba(2,5,10,0.86) 46%, rgba(2,5,10,0.55) 78%, rgba(2,5,10,0) 100%)',
            }} />
            <div style={{ position: 'relative', width: '86%', maxWidth: 300 }}>
              <DialAimInline
                indicatorRef={indicatorRef}
                zonesGroupRef={dialZonesRef}
                flashRef={barFlashRef}
                critW={critFreeze ? lockedCritWRef.current : liveCritW}
                hitW={aimHitW}
                grazeW={aimGrazeW}
                afflictionLabel={aimAffliction?.name ?? null}
                hardenedArmed={hardenedArmed}
                firePos={firePosRef.current}
                zoneCenter={zonePosRef.current}
                snapKey={dialSnapKey}
                perfectBurstKey={dialBurstKey}
                streakFire={cannonadeStacks >= 3 ? 2 : cannonadeStacks === 2 ? 1 : 0}
                streakCount={cannonadeStacks}
                streakLabel={streakLabel}
                streakPct={Math.round(tide.critStreakPerStack * cannonadeStacks * 100)}
                piercing={!!critStreakCfg?.pierceAt && cannonadeStacks >= critStreakCfg.pierceAt}
              />
            </div>
          </div>,
          document.body)}


        {/* First-time mechanic-check tutorial — a blocking explainer the first
            time a check arms (e.g. Don's opening). Teaches "telegraphed move →
            answer with a crew ability" so the first hit isn't a blind loss. */}
        {showCheckTutorial && pendingCheck && typeof document !== 'undefined' && createPortal(
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(6,3,3,0.82)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 26 }}
              style={{ width: '100%', maxWidth: 360, textAlign: 'center', borderRadius: 18, padding: '1.4rem 1.25rem 1.25rem', background: 'linear-gradient(180deg, #2a0e0e 0%, #140708 100%)', border: '1px solid rgba(248,113,113,0.55)', boxShadow: '0 20px 60px rgba(0,0,0,0.7), inset 0 1px 0 rgba(248,113,113,0.14)' }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', textAlign: 'left', marginBottom: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={GUIDES.doby.portrait} alt="" style={{ width: 52, height: 52, borderRadius: 12, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(248,113,113,0.55)', background: 'rgba(0,0,0,0.3)' }} />
                <div style={{ minWidth: 0 }}>
                  <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.16em', color: '#fca5a5' }}>Doby</p>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.15rem', color: '#ffe4e0', lineHeight: 1.14, marginTop: 2 }}>{enemy.name} is winding up a big attack.</p>
                </div>
              </div>
              <p className="font-karla" style={{ fontSize: '0.9rem', color: 'rgba(255,225,225,0.85)', lineHeight: 1.55, textAlign: 'left' }}>
                Fire a <strong style={{ color: '#ffe9b0' }}>crew ability</strong> before the timer at the top runs out to stop it. Miss the window and you take the hit.
              </p>
              <button type="button" onClick={dismissCheckTutorial}
                className="font-cinzel font-700 uppercase tracking-[0.08em] tap"
                style={{ width: '100%', marginTop: 18, padding: '0.85rem', borderRadius: 12, fontSize: '0.92rem', background: 'linear-gradient(180deg, rgba(248,113,113,0.32), rgba(180,40,40,0.18))', border: '1px solid rgba(248,113,113,0.7)', color: '#ffe0e0', cursor: 'pointer' }}>
                Got it
              </button>
            </motion.div>
          </motion.div>,
          document.body,
        )}

        {/* Mechanic-check ARM — a loud heads-up the instant a check arms, so the
            "answer this with a crew ability" beat can't be missed (phase 1 too). */}
        {checkArmFlash && (
          <motion.div key={`checkarm-${checkArmFlash.key}`} initial={{ opacity: 0, scale: 0.6, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, transform: 'translateY(-16%)', pointerEvents: 'none' }}>
            <p className="font-karla font-800 uppercase tracking-[0.24em]" style={{ fontSize: '0.6rem', color: '#fca5a5', textShadow: '0 0 12px rgba(239,68,68,0.85)' }}>Telegraphed Attack</p>
            <p className="font-cinzel font-800 uppercase tracking-[0.1em]" style={{ fontSize: '1.5rem', color: '#ffe0e0', textAlign: 'center', lineHeight: 1.05, textShadow: '0 0 18px rgba(239,68,68,0.9), 0 0 44px rgba(239,68,68,0.5)' }}>{checkArmFlash.label}</p>
            <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#ffe9b0', textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>Answer with a crew ability!</p>
          </motion.div>
        )}

        {/* Mechanic-check RESULT — unmistakable green "Countered!" or red
            "<name> hits!" the instant it resolves. */}
        {checkResultFlash && (
          <motion.div key={`checkres-${checkResultFlash.key}`} initial={{ opacity: 0, scale: 0.6, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.25, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <p className="font-cinzel font-800 uppercase tracking-[0.2em]" style={{
              fontSize: checkResultFlash.ok ? '1.5rem' : '1.7rem', textAlign: 'center', lineHeight: 1.05,
              color: checkResultFlash.ok ? '#86efac' : '#ffffff',
              textShadow: checkResultFlash.ok
                ? '0 0 18px rgba(74,222,128,0.9), 0 0 44px rgba(74,222,128,0.5)'
                : '0 0 18px #fff, 0 0 44px rgba(239,68,68,1), 0 0 90px rgba(239,68,68,0.6)',
            }}>{checkResultFlash.label}</p>
          </motion.div>
        )}

        {/* Boon proc callout — Counter-Battery's "smashed from the air" beat.
            Sits a touch above center so it never collides with the mechanic
            check flash, themed to the boon's color. */}
        {boonFlash && (
          <motion.div key={`boonflash-${boonFlash.key}`} initial={{ opacity: 0, scale: 0.55, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }}
            style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, transform: 'translateY(-14%)', pointerEvents: 'none' }}>
            <p className="font-cinzel font-800 uppercase tracking-[0.2em]" style={{
              fontSize: '1.5rem', textAlign: 'center', lineHeight: 1.05, color: boonFlash.color,
              textShadow: `0 0 18px ${boonFlash.color}, 0 0 46px ${boonFlash.color}88`,
            }}>{boonFlash.label}</p>
            {boonFlash.sub && (
              <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#cbd5e1', textAlign: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{boonFlash.sub}</p>
            )}
          </motion.div>
        )}

        {/* Low-hull danger — a red vignette breathes at the stage edges while
            the player's HP is critical, so the tension reads without a number. */}
        {playerHp > 0 && playerHp / playerHpMax < 0.25 && (
          <div className="rc-lowhp-vignette" aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6, borderRadius: 'inherit',
          }} />
        )}

        {/* Crew-ability cast cue — the small pill is kept for the raid-item drum;
            crew actives now use the big FF-style summon splash (portaled below). */}
        <AnimatePresence>
          {abilityCast && (
            <AbilityCastFx key={abilityCast.key} label={abilityCast.label} name={abilityCast.name} color={abilityCast.color} image={abilityCast.image} emoji={abilityCast.emoji} />
          )}
        </AnimatePresence>

        {/* FF-style crew summon — full-screen (portaled to body so no transformed
            ancestor clips it), eats taps while it plays so the deferred effect
            can't race a turn action. NO AnimatePresence: the summon fades its own
            content out via the inner wrapper before it unmounts, so it needs no
            exit animation — and AnimatePresence's exit RE-RENDER was restarting
            the wrapper's keyframes, flashing the crew image a faint second time. */}
        {typeof document !== 'undefined' && abilitySummon && createPortal(
          <AbilitySummonFx key={abilitySummon.key} label={abilitySummon.label} name={abilitySummon.name} color={abilitySummon.color} image={abilitySummon.image} chase={abilitySummon.chase} skinId={abilitySummon.skinId} />,
          document.body,
        )}
        {/* Plain, un-animated tap-guard — outlives the animated summon so input
            stays blocked until the deferred effect resolves, without keeping a
            framer tree mounted that a rapid effect could re-render. */}
        {summonGuard && typeof document !== 'undefined' && createPortal(
          <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 69, pointerEvents: 'auto' }} />,
          document.body,
        )}

        {/* Aim-result feedback during the lock freeze — critical gets the full fishing-perfect treatment */}
        {(() => {
        // The aim-result badges sit at zIndex 11 INSIDE the battle stage. The dial
        // is a body portal at 1200, so on the dial they were drawn UNDERNEATH it
        // and the CRITICAL callout never appeared at all.
        const badges = (
        <AnimatePresence>
          {aimResult === 'critical' && critFreeze && (
            <motion.div
              key="crit-burst"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 11,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
                background: 'radial-gradient(ellipse 90% 60% at 50% 50%, rgba(245,158,11,0.32) 0%, transparent 70%)',
              }}
            >
              {/* Expanding ring burst */}
              <motion.div
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 3.2, opacity: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: 140, height: 140, borderRadius: '50%',
                  border: '2px solid rgba(245,158,11,0.7)',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <motion.div
                initial={{ scale: 0.2, opacity: 0.6 }}
                animate={{ scale: 2.4, opacity: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
                style={{
                  position: 'absolute',
                  width: 140, height: 140, borderRadius: '50%',
                  border: '1px solid rgba(253,230,138,0.5)',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              {/* Floating sparks */}
              {([
                { x: -55, delay: 0.08 }, { x: 55, delay: 0.12 },
                { x: -28, delay: 0.18 }, { x: 32, delay: 0.05 },
              ] as { x: number; delay: number }[]).map((s, i) => (
                <motion.span key={i}
                  initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], y: -70 - i * 12, x: s.x * 1.3, scale: [0, 1.2, 0.6] }}
                  transition={{ duration: 1.0, delay: s.delay, ease: 'easeOut' }}
                  style={{ position: 'absolute', color: '#fde68a', fontSize: '0.85rem', pointerEvents: 'none' }}
                >✦</motion.span>
              ))}
              {/* Main text — single ease-out pop, no spring overshoot.
                  Underdamped spring (damping 18 / stiffness 500) made the
                  word "Critical!" visibly bounce past 1.0 and back, which
                  read as the text flashing twice. */}
              <motion.div
                initial={{ scale: 0.55, y: 8, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ duration: 0.22, ease: 'easeOut', delay: 0.04 }}
                style={{ textAlign: 'center', position: 'relative' }}
              >
                <p className="font-cinzel font-700 uppercase tracking-[0.28em]"
                  style={{
                    fontSize: '2.4rem', color: '#fff',
                    textShadow: '0 0 18px #fff, 0 0 40px rgba(245,158,11,1), 0 0 80px rgba(245,158,11,0.75), 0 0 140px rgba(245,158,11,0.35)',
                  }}>
                  Critical!
                </p>
              </motion.div>
            </motion.div>
          )}

          {/* PHASE 2 revival callout — the player just landed what they
              thought was the kill shot, the boss "dies"... then this
              fires. Big centered text + double red expanding ring +
              radial wash, mirroring the Critical! treatment but red and
              with bigger letter-spacing for "this is a different kind
              of moment" weight. Lasts the full phaseFlash window so
              the player has time to register it. */}
          {phaseFlash && (
            <motion.div
              key="phase2-burst"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
                background: 'radial-gradient(ellipse 90% 60% at 50% 50%, rgba(239,68,68,0.34) 0%, transparent 70%)',
              }}
            >
              <motion.div
                initial={{ scale: 0.2, opacity: 0.9 }}
                animate={{ scale: 3.6, opacity: 0 }}
                transition={{ duration: 0.85, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  width: 160, height: 160, borderRadius: '50%',
                  border: '2px solid rgba(239,68,68,0.7)',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <motion.div
                initial={{ scale: 0.2, opacity: 0.55 }}
                animate={{ scale: 2.8, opacity: 0 }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: 0.12 }}
                style={{
                  position: 'absolute',
                  width: 160, height: 160, borderRadius: '50%',
                  border: '1px solid rgba(252,165,165,0.55)',
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              />
              <motion.div
                initial={{ scale: 0.55, y: 10, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
                style={{ textAlign: 'center', position: 'relative' }}
              >
                <p className="font-cinzel font-700 uppercase tracking-[0.3em]"
                  style={{
                    fontSize: '2.1rem', color: '#fff',
                    textShadow: '0 0 18px #fff, 0 0 40px rgba(239,68,68,1), 0 0 80px rgba(239,68,68,0.75), 0 0 140px rgba(239,68,68,0.35)',
                  }}>
                  {phaseCallout}
                </p>
              </motion.div>
            </motion.div>
          )}

          {aimResult && aimResult !== 'critical' && critFreeze && (() => {
            // Hit / Graze treatment — same visual language as the "Critical!"
            // moment (centered text-only flash with a single expanding ring)
            // but toned down: smaller text, lower-glow color, one ring
            // instead of two, no full-screen radial gradient, no sparks.
            const accent = aimResult === 'hit' ? '#4ade80' : '#94a3b8'
            const label  = aimResult === 'hit' ? 'Hit!' : 'Graze'
            const isHit  = aimResult === 'hit'
            return (
              <motion.div
                key={`aim-text-${aimResult}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16 }}
                style={{
                  position: 'absolute', inset: 0, zIndex: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  pointerEvents: 'none',
                }}
              >
                {/* Single expanding ring — smaller and dimmer than crit */}
                <motion.div
                  initial={{ scale: 0.25, opacity: isHit ? 0.7 : 0.45 }}
                  animate={{ scale: isHit ? 2.4 : 1.8, opacity: 0 }}
                  transition={{ duration: isHit ? 0.55 : 0.45, ease: 'easeOut' }}
                  style={{
                    position: 'absolute',
                    width: 100, height: 100, borderRadius: '50%',
                    border: `1.5px solid ${accent}`,
                    left: '50%', top: '50%',
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                {/* Main text — glowy, smaller than the "Critical!" wordmark */}
                <motion.div
                  initial={{ scale: 0.65, y: 6, opacity: 0 }}
                  animate={{ scale: 1, y: 0, opacity: 1 }}
                  transition={{ duration: 0.18, ease: 'easeOut', delay: 0.02 }}
                  style={{ textAlign: 'center', position: 'relative' }}
                >
                  <p className="font-cinzel font-700 uppercase tracking-[0.22em]"
                    style={{
                      fontSize: isHit ? '1.55rem' : '1.3rem',
                      color: '#fff',
                      textShadow: isHit
                        ? `0 0 12px ${accent}, 0 0 28px ${accent}, 0 0 56px ${accent}55`
                        : `0 0 8px ${accent}, 0 0 18px ${accent}99`,
                    }}>
                    {label}
                  </p>
                </motion.div>
              </motion.div>
            )
          })()}
        </AnimatePresence>
        )
        // On the dial, lift them out of the stage and over the overlay so the
        // CRITICAL callout reads exactly as it does on the aim bar.
        return onDial && typeof document !== 'undefined'
          ? createPortal(<div style={{ position: 'fixed', inset: 0, zIndex: 1300, pointerEvents: 'none' }}>{badges}</div>, document.body)
          : badges
        })()}

        {/* Player HP box — bottom-right. Tap to open the Captain's Ledger
            (full stats + equipped raid items under "Special"). Kept minimal
            visually here; item details live inside the popup, not on the
            battle screen.

            motion.button + key={speedWinnerKey} so a fresh animation
            fires every reveal beat when the player wins initiative —
            border flashes cyan + brief lunge up-left (toward enemy
            nameplate). Idle uses the static border (#2a3548). */}
        <motion.button
          type="button"
          onClick={() => setShowStats(true)}
          aria-label={`${nameplate} — view stats`}
          animate={playerNameplateAnim}
          ref={playerPlateRef}
          style={{
            // See the enemy's: placed on her own hull over the sea.
            position: 'absolute', bottom: 10, right: 10, zIndex: 4,
            padding: '0.45rem 0.6rem 0.5rem 0.45rem',
            background: 'rgba(6,12,20,0.9)',
            border: '1px solid #2a3548',
            borderRadius: 12,
            minWidth: 160,
            textAlign: 'left',
            cursor: 'pointer',
            font: 'inherit', color: 'inherit',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          {/* Player portrait — mirrors the enemy's portrait badge. Uses the
              player's saved avatar bg/border colors (or the shared defaults
              when unset) so the in-fight portrait matches /profile and the
              leaderboard. */}
          {playerCharacterColor && (
            <div style={{
              flexShrink: 0,
              borderRadius: '50%',
              boxShadow: `0 0 10px rgba(96,165,250,0.4)`,
              overflow: 'hidden',
            }}>
              <CharacterAvatar
                characterColor={playerCharacterColor}
                equippedHat={playerEquippedHat ?? null}
                size={50}
                bgColor={playerAvatarBg ?? undefined}
                ringColor={playerAvatarBorder ?? undefined}
              />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff', lineHeight: 1, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nameplate}
            </p>
            {/* Absorb shield (Abyssal Tide / Stormward) folds into the HP bar
                as a cyan segment — one row, no stacked bar. */}
            <HPBar current={playerHp} max={playerHpMax} accent={PLAYER_COLOR} compact shield={abyssalShieldHp} />
            <ChargesRow charges={playerCharges} max={playerMaxCharges} small readyGlow={canMega ? (megaAugment?.color ?? null) : null} />
            {/* Ch4 statuses + bespoke effect chips on YOUR hull. */}
            <StatusBadgesRow statuses={playerStatuses} bespoke={[
              // Laz's ward, with its fuse showing. This ability had no on-screen
              // presence whatsoever before now: you spent your legendary and got
              // nothing back until it either saved you or died with the enemy.
              ...(vengeanceWardTurns > 0 ? [{ key: 'ward', color: '#d1495b', tone: 'buff' as const, turns: vengeanceWardTurns, title: `Vengeance Ward — a killing blow in the next ${vengeanceWardTurns} turn${vengeanceWardTurns === 1 ? '' : 's'} is cheated. Let it run out and it is wasted.` }] : []),
              // Anchor brace — a one-hit damage CUT (not a shield pool), so it
              // gets its OWN steel chip + iron-clamp icon, distinct from the
              // shield glyphs and the cyan/amber shield-pool bar segments.
              ...((anchorReductionPct ?? 0) > 0 ? [{ key: 'brace', color: '#9eb0cd', tone: 'buff' as const, title: `Braced — the next hit is cut ${Math.round((anchorReductionPct ?? 0) * 100)}% (one blow, softens not blocks; crits punch through)` }] : []),
              ...(playerBurning ? [{ key: 'burn', color: '#fb923c', title: 'Ablaze — burning each turn (a crew heal puts it out)' }] : []),
              ...(playerFrozen ? [{ key: 'freeze', color: '#7dd3fc', title: 'Frozen — your turn is skipped' }] : []),
              ...(aimAffliction ? [{ key: 'aim', color: AIM_AFFLICTION_COLOR, tone: 'debuff' as const, turns: aimAfflictionRef.current?.passes, title: `${aimAffliction.name} — ${aimAfflictionDesc(aimAffliction.kind, aimAfflictionRef.current?.passes ?? 0)}` }] : []),
            ]} />
          </div>
        </motion.button>

      </motion.div>

      {/* Bottom panel — persistent log + action UI. NO position/transform
          here: it's an ancestor of heavy framer-motion content, and a
          compositing ancestor breaks iOS PWA fixed Nav/MobileTabBar.
          See memory: feedback_pagetransition_ios_pwa.

          During the 'aiming' sub-phase the LogBox is swapped for the
          aim bar (same 130px slot) and the ActionMenu is swapped for
          a single Lock Shot button (same 72px slot). Both replacements
          match dimensions exactly so the battle stage above doesn't
          reflow — this was the constraint that originally pushed the
          aim minigame to a body portal; matching heights lets it sit
          inline where the player's eye already is. */}
      <div ref={actionPanelRef} style={{
        // ── OVER THE SEA THE DECK IS A HUD, NOT A BAND ────────────────────
        //
        // In flow it sat wherever the stage's height left it, which on a
        // desktop is the middle of the screen, on a wash spanning the window —
        // a control slab across the water you are fighting on. Pinned to the
        // foot instead, it covers nothing and reads the way the chart's own
        // HUD does: small, at an edge, over the sea rather than instead of it.
        //
        // THE `position` NOTE BELOW STILL STANDS EVERYWHERE ELSE. A compositing
        // ancestor here breaks the fixed Nav and MobileTabBar in the iOS PWA
        // (see feedback_pagetransition_ios_pwa), which is why this is relative
        // on a /raids/* route. Over the sea neither of those is on screen: the
        // fight is a full-viewport portal above both, so there is nothing left
        // for a compositing ancestor to break.
        // ── IN FLOW, AT THE FOOT OF THE BOX ──────────────────────────────
        //
        // This was `position: fixed; bottom: 0`, and on an iOS PWA that is the
        // exact combination this file already carries a warning about: a fixed
        // element beside framer-motion's compositing gets its viewport wrong,
        // and the deck's buttons were laid out below the visible window. I read
        // that warning, decided it did not apply because the nav and tab bar
        // are covered here, and missed that it is about the FIXED ELEMENT, not
        // about what it might overlap.
        //
        // No second fixed element now. The container above is the fight's box
        // and ends where the tab bar begins; `marginTop: auto` puts the deck on
        // its floor. Flow cannot be wrong about where the bottom is.
        position: 'relative',
        ...(overSea ? { marginTop: 'auto', zIndex: 6 } : null),
        // Translucent so the container backdrop (gradient + any zone image) reads
        // through — one continuous scene, no solid control slab, no divider frame.
        // NONE over the sea: the backing belongs to the panel, not the window.
        background: overSea ? 'none' : 'linear-gradient(180deg, rgba(4,8,14,0.42) 0%, rgba(3,6,12,0.72) 100%)',
        // OFF THE EDGE, NOT ON IT. Flush to the bottom the deck read as part of
        // the window frame rather than as something floating on the water, and
        // on a desktop there is plenty of sea to spare.
        // The box already stops above the tab bar, so this is breathing room
        // rather than clearance for something underneath.
        padding: overSea ? '0 0.7rem 0.7rem' : '0.7rem 0.85rem 0.95rem',
        pointerEvents: overSea ? 'none' : undefined,
      }}>
        {/* THE CONTROLS, IN A COLUMN. The wash above spans the whole width
            because the deck is a BAND across the foot of the scene, and a
            floating panel with sky either side of it would put back the frame
            that going full bleed just removed. What is capped is what is IN
            it: reading a log line and hitting a button are not helped by more
            room, and 580 is the width both were designed at.

            Over the sea that reasoning inverts: there is no frame to put back,
            because the scene behind is the actual chart. So the column becomes
            the panel — its own dark base, its own edge — and the water either
            side of it is the point rather than a gap. Opaque enough to read a
            log line over bright water; see the house rule on panels standing on
            painted art. */}
        <div style={{
          width: '100%', maxWidth: 580, marginLeft: 'auto', marginRight: 'auto',
          display: 'flex', flexDirection: 'column', gap: 8,
          pointerEvents: overSea ? 'auto' : undefined,
          ...(overSea ? {
            padding: '0.6rem 0.7rem 0.7rem',
            borderRadius: 16,
            background: 'linear-gradient(180deg, rgba(9,15,24,0.90) 0%, rgba(5,9,16,0.95) 100%)',
            border: '1px solid rgba(122,138,160,0.28)',
            boxShadow: '0 -6px 34px rgba(0,0,0,0.5)',
            // NO BACKDROP BLUR. It was here out of habit and it was costing a
            // full-screen blur pass every frame, composited over a live canvas,
            // for an effect nothing can see: this panel is already 90% opaque,
            // so there is almost no backdrop left to blur. On a phone that pass
            // is real money and the aim bar is what pays for it.
          } : null),
        }}>
        {subPhase === 'aiming' ? (
          /* THE FINN FINALE aims on the DIAL, which is presented the way the
             fishing screen presents it: overlaid, centred, front and centre.
             It is rendered in a portal further down, so this slot just keeps
             showing the log and the layout never reflows. */
          onDial ? (
            <LogBox lines={resolveLog} turn={turn} />
          ) : (
          <AimBarInline
            indicatorRef={indicatorRef} zoneRef={zoneRef} flashRef={barFlashRef}
            needleTrackRef={needleTrackRef} zoneTrackRef={zoneTrackRef}
            aimFxRef={aimFxRef} aimFxRead={aimFxRead}
            // Enemy Mist Veil + any Gauntlet fog curse stack into one band.
            // Steady Sights (boon) clears a fraction (all at full clarity).
            aimFogDensity={Math.min(0.95, (enemy.aimFogDensity ?? 0) + tide.aimFog) * (1 - tide.aimClarity)}
            // Inkfall curse: the bar randomly blacks out for a beat.
            aimBlackout={tide.aimBlackout * (1 - tide.aimClarity)}
            // During the freeze, show the width the shot was judged at —
            // Sharpshot is consumed at lock and the live width would
            // shrink the band mid-freeze, making the picture lie.
            critW={critFreeze ? lockedCritWRef.current : liveCritW}
            // Shimmer the gold band while the buff is live (band is already
            // widened via liveCritW; the pulse makes the boon unmistakable).
            sharpshotActive={!!sharpshotBuff && !critFreeze}
            // False Colors curse — decoy bands the RAF drifts via these refs.
            decoyCount={activeDecoys}
            decoyElRefs={decoyElRefs}
            // Raid-8 aim affliction — warning chip + (hardened) the tap-twice
            // state so the player knows the first tap is the crack, not a miss.
            afflictionLabel={aimAffliction?.name ?? null}
            hardenedArmed={hardenedArmed}
            // Rolling Plate — the RAF drives the gold band through this ref.
            critBandRef={critBandElRef}
          />
          )
        ) : (
          <LogBox lines={resolveLog} turn={turn} />
        )}

        {subPhase === 'aiming' ? (
          <InlineLockButton onLock={lockShot} />
        ) : (
          <ActionMenu
            canFire={canFire}
            canVolley={canVolley}
            canMega={canMega}
            megaAugment={megaAugment}
            volleyCost={effVolleyCost}
            megaCost={effMegaCost}
            canDodge={canDodge}
            canReload={canReload}
            onSelect={selectAction}
            disabled={subPhase !== 'await_input'}
            highlightedAction={subPhase === 'await_input' ? null : playerAction}
            specialItems={(() => {
              // Special chooser items: repair kit + one card per deployed
              // crew member's class ability. Per-entry `disabled` keeps an
              // item visible with its reason so the player understands why
              // the slot didn't fire ("Used this raid" / "Wait next turn"
              // / "Unlocks at Lv 10").
              const items: SpecialItem[] = []

              // Repair kit (existing, turn-consuming).
              if (repairKit) {
                const atFull = playerHp >= playerHpMax
                // Mirror the Seasoned Timbers heal boost in the preview range.
                const rawRange = repairKitRange(repairKit, totalFortune)
                const healMult = mods.repairHealMult ?? 1
                const range = { min: Math.round(rawRange.min * healMult), max: Math.round(rawRange.max * healMult) }
                items.push({
                  id: 'repair',
                  label: repairKit.name,
                  sub: kitUsed
                    ? 'Already used this battle.'
                    : atFull
                      ? 'Hull already at full HP.'
                      : `Heals ${range.min}-${range.max} HP. Costs your turn.`,
                  color: '#4ade80',
                  emoji: repairKit.emoji,
                  image: repairKit.image,
                  disabled: kitUsed || atFull,
                  onClick: () => selectAction('repair'),
                })
              }

              // Crew abilities — one card per deployed crew with a class.
              // Cards always render so the player sees their roster even
              // when abilities are locked (Lv < 10) or used. Doesn't
              // consume a turn.
              for (const crew of crewMembers) {
                const cls = classForSlug(crew.slug)
                if (!cls) continue
                const def = CLASSES[cls]
                const lv = crewLevelFromXP(crew.xp)
                const m = currentMilestone(def, lv)
                const usedRaid = usedAbilityIds?.has(crew.id) ?? false
                const locked = !m
                // Silenced (Ch4 status): every crew ability is locked while it lasts.
                const disabled = locked || usedRaid || oneAbilityUsedThisTurn || playerStatusMods.silenced
                const sub = locked
                  ? `Unlocks at Lv 10.`
                  : playerStatusMods.silenced
                    ? 'Silenced — abilities locked.'
                    : usedRaid
                      ? usedAbilitySub
                      : oneAbilityUsedThisTurn
                        ? 'Wait until next turn.'
                        : m.desc
                items.push({
                  id: `crew-${crew.id}`,
                  label: `${crew.name} · ${def.name}`,
                  sub,
                  color: def.color,
                  emoji: def.emoji,
                  image: crew.imageUrl,
                  disabled,
                  onClick: () => fireCrewAbility(crew, def, m),
                })
              }

              // Activatable item card (War Drum / Thunder Drum). One use per
              // raid, grays out with a reason when spent or when there's no
              // spent crew ability to bring back.
              const activatable = getActivatableItem(equippedRaidItems)
              if (activatable?.activated) {
                const itemUsed = usedRaidItemIds?.has(activatable.id) ?? false
                const spentCount = crewMembers.filter(c => usedAbilityIds?.has(c.id)).length
                const chancePct = Math.round(activatable.activated.chance * 100)
                const itemSub = itemUsed
                  ? 'Already used this raid.'
                  : spentCount === 0
                    ? 'No spent crew ability to restore.'
                    : activatable.activated.chance >= 1
                      ? 'Restores a random spent crew ability.'
                      : `${chancePct}% to restore a random spent crew ability.`
                items.push({
                  id: `item-${activatable.id}`,
                  label: activatable.name,
                  sub: itemSub,
                  color: '#e0a44a',
                  emoji: activatable.emoji,
                  image: activatable.image,
                  disabled: itemUsed || spentCount === 0,
                  onClick: () => activateRaidItem(activatable),
                })
              }
              return items
            })()}
          />
        )}
        </div>
      </div>

      {/* Crew abilities restored — a one-shot banner so the refresh is obvious
          (CSS animation runs once on mount; it ends invisible + click-through).
          Centered via a flex wrap so the keyframe's transform doesn't clobber it. */}
      {(abilitiesRefreshed || restorePulse > 0) && (
        <div key={`restore-${restorePulse}`} aria-hidden style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 70px)', left: 0, right: 0, zIndex: 95, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '0.55rem 1.05rem', borderRadius: 999,
            background: 'rgba(8,20,28,0.92)', border: '1px solid rgba(110,231,214,0.6)',
            boxShadow: '0 0 28px rgba(110,231,214,0.3), 0 8px 24px rgba(0,0,0,0.5)', whiteSpace: 'nowrap',
            animation: 'rc-ability-banner 2.6s ease forwards',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6ee7d6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v13" /><circle cx="12" cy="5" r="2.4" /><path d="M5 12a7 7 0 0 0 14 0" /></svg>
            <span className="font-cinzel font-700 uppercase" style={{ fontSize: '0.74rem', letterSpacing: '0.08em', color: '#aef5e8' }}>Crew Abilities Restored</span>
          </div>
        </div>
      )}

      {/* Full-screen crit flash — fixed, matches the existing raid */}
      {critFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90,
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.08) 60%, transparent 100%)',
          animation: 'rc-crit-flash 0.38s ease forwards',
        }} />
      )}

      {/* Drowned Whispers — a violet "Confused!" flash the moment an order is
          scrambled, so the wrong action reads as the curse, not a misfire. The
          action log carries the full explanation a beat later. */}
      <AnimatePresence>
        {confusedFx && (
          <motion.div key={confusedFx.key} aria-hidden
            initial={{ opacity: 0, y: -10, scale: 0.92, x: '-50%' }}
            animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
            exit={{ opacity: 0, scale: 0.95, x: '-50%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{ position: 'fixed', top: '24%', left: '50%', zIndex: 92, pointerEvents: 'none', textAlign: 'center', width: 'min(88%, 340px)' }}>
            <div style={{ padding: '0.55rem 1rem', borderRadius: 12, background: 'rgba(38,20,54,0.92)', border: '1px solid rgba(168,139,250,0.6)', boxShadow: '0 0 26px rgba(168,139,250,0.4)' }}>
              <p className="font-cinzel font-800 uppercase" style={{ fontSize: '0.92rem', letterSpacing: '0.1em', color: '#c4b5fd', textShadow: '0 0 14px rgba(168,139,250,0.6)' }}>Confused!</p>
              <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#d2c4ec', marginTop: 2, lineHeight: 1.35 }}>
                You called for {ACTION_NOUN[confusedFx.from]} — your crew {ACTION_PAST[confusedFx.to]} instead.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase-2 transition flash — red full-screen wash that holds for
          ~1s alongside the centered PHASE 2 callout (rendered inside the
          battle stage above). Sits one z-index above the crit flash so a
          crit landing on the killing hit can still play under it. */}
      {phaseFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 91,
          background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.45) 0%, rgba(239,68,68,0.14) 60%, transparent 100%)',
          animation: 'rc-phase-flash 1s ease forwards',
        }} />
      )}

      {/* Player stats breakdown — opened by tapping the player nameplate */}
      <AnimatePresence>
        {showStats && (
          <PlayerStatsPopup
            shipName={nameplate}
            shipImageUrl={shipImageUrl}
            shipFilter={shipFilter}
            playerHp={playerHp}
            playerHpMax={playerHpMax}
            shipMinDamage={shipMinDamage}
            shipSpeed={shipSpeed}
            totalPower={totalPower}
            totalNavigation={totalNavigation}
            totalFortune={totalFortune}
            crateOdds={crateOdds}
            isBoss={isBoss}
            equippedRaidItems={equippedRaidItems}
            shipClasses={shipClasses}
            damagePct={mods.damagePct}
            megaAugment={megaAugment}
            megaCost={effMegaCost}
            tideEffects={tideEffects}
            effectLabels={runDepth > 0 ? { good: 'Boons', bad: 'Curses' } : { good: 'Buffs', bad: 'Penalties' }}
            contractsWon={contractsWon}
            runBoons={runBoons}
            runCurses={runCurses}
            conditions={[
              ...statusConditions(playerStatuses),
              ...(playerBurning ? [{ key: 'burn', name: 'Ablaze', color: BURN_COLOR, turns: playerBurnRef.current.turns, desc: `Your ship is on fire — it loses ${playerBurnRef.current.dmg} HP at the end of each of your turns. Any crew heal douses the flames.` }] : []),
              ...(playerFrozen ? [{ key: 'freeze', name: 'Frozen', color: FREEZE_COLOR, desc: 'Your ship is iced over — your next turn is skipped, and you cannot weave aside from incoming shots while frozen.' }] : []),
              // Aim-bar afflictions (Iron Etiquette's hardened lock, decoys, squall).
              // Count is in "shots" not turns, so the desc carries it (no `turns`).
              ...(aimAffliction ? [{ key: 'aim', name: aimAffliction.name, color: AIM_AFFLICTION_COLOR, desc: aimAfflictionDesc(aimAffliction.kind, aimAfflictionRef.current?.passes ?? 0) }] : []),
              // Anchor brace — mirrors the status chip so the stats popup explains
              // it alongside burns/freezes. A one-hit damage cut, not a pool.
              ...((anchorReductionPct ?? 0) > 0 ? [{ key: 'brace', name: 'Braced', color: '#9eb0cd', desc: `The next hit against you is cut by ${Math.round((anchorReductionPct ?? 0) * 100)}%, then it is spent. It softens a blow rather than blocking it, so you still take reduced damage — and a critical hit punches straight through.` }] : []),
            ]}
            onClose={() => setShowStats(false)}
          />
        )}
      </AnimatePresence>

      {/* Enemy stats — opened by tapping the enemy nameplate. Mirrors the
          player's Ledger: portrait + name header, stat grid (HP / damage /
          volley / crit), the themed ability if any, and the full pattern
          cycle visualised as chips so players can study punch timing. */}
      <AnimatePresence>
        {showEnemyStats && (
          <EnemyStatsPopup
            enemy={enemy}
            currentHp={enemyHp}
            maxHp={enemyHpMax}
            isBoss={isBoss}
            isElite={isElite}
            affix={affix}
            conditions={[
              // The Last Wall — deliberately vague: "everything you have in one
              // blow" is the whole hint. Never names the Mega; the discovery is
              // the player's to make.
              ...(aegisVis ? [{ key: 'aegis', name: aegisVis.name, color: '#e8d8a8', desc: 'A wall of iron and will stands between your guns and his hull. Single shots glance off it whole. If anything can bring it down in one stroke, it is everything you have, all at once.' }] : []),
              ...statusConditions(enemyStatuses),
              ...(enemyBurning ? [{ key: 'burn', name: 'Ablaze', color: BURN_COLOR, turns: enemyBurnRef.current.turns, desc: `Its hull is on fire — it loses ${enemyBurnRef.current.dmg} HP at the end of each of its turns.` }] : []),
              ...(enemyFrozen ? [{ key: 'freeze', name: 'Frozen', color: FREEZE_COLOR, desc: 'Iced over — its next turn is skipped, and it cannot weave aside from your shots while frozen.' }] : []),
              ...(snareDodgeTurns > 0 ? [{ key: 'snare', name: 'Snared', color: '#d9b066', turns: snareDodgeTurns, desc: 'A snare fouls its rigging — each time it tries to dodge, there is a chance the dodge fails and it must act instead.' }] : []),
            ]}
            onClose={() => setShowEnemyStats(false)}
          />
        )}
      </AnimatePresence>

      {/* Keyframes (namespaced rc- so they don't collide with the existing raid's globals) */}
      <style>{`
        @keyframes rc-cannon-shot {
          0%   { opacity: 0; transform: translate(-20px, 6px) scale(0.2) rotate(-20deg); }
          30%  { opacity: 1; transform: translate(0) scale(1.2) rotate(5deg); }
          65%  { opacity: 0.7; transform: translate(4px, -5px) scale(0.9); }
          100% { opacity: 0; transform: translate(10px, -10px) scale(0.3); }
        }
        @keyframes rc-impact-pop {
          0%   { opacity: 0; transform: scale(0.2) rotate(-12deg); }
          25%  { opacity: 1; transform: scale(1.4) rotate(6deg); }
          55%  { opacity: 0.85; transform: scale(1.1) rotate(-2deg); }
          100% { opacity: 0; transform: scale(0.55) rotate(0); }
        }
        @keyframes rc-crit-flash {
          0%   { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes rc-ability-banner {
          0%   { opacity: 0; transform: translateY(-14px) scale(0.88); }
          12%  { opacity: 1; transform: translateY(0) scale(1); }
          82%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(-8px) scale(0.96); }
        }
        @keyframes rc-phase-flash {
          0%   { opacity: 0; }
          15%  { opacity: 1; }
          60%  { opacity: 0.75; }
          100% { opacity: 0; }
        }
        /* These glows pulse via OPACITY only (GPU-composited). Animating
           box-shadow/text-shadow instead forces a full main-thread repaint
           every frame — and since the phase-2 glow + badge run 'infinite' the
           whole time any boss is in a later phase, that paint load starved the
           aim-bar RAF (the "lag in all boss phase 2+" stutter). The shadow is
           held static; a pseudo-element (or the element itself) just fades. */
        @keyframes rc-glow-fade {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 1; }
        }
        .rc-phase2-pulse::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          pointer-events: none; z-index: -1;
          box-shadow: 0 0 26px rgba(239,68,68,0.85);
          animation: rc-glow-fade 1.8s ease-in-out infinite;
          will-change: opacity;
        }
        .rc-phase2-badge {
          text-shadow: 0 0 10px rgba(239,68,68,0.9);
          animation: rc-glow-fade 1.8s ease-in-out infinite;
          will-change: opacity;
        }
        .rc-check-banner { position: relative; }
        .rc-check-banner::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          pointer-events: none; z-index: -1;
          box-shadow: 0 0 28px rgba(239,68,68,0.7);
          animation: rc-glow-fade 1.1s ease-in-out infinite;
          will-change: opacity;
        }
        .rc-lowhp-vignette {
          box-shadow: inset 0 0 60px 12px rgba(239,68,68,0.5);
          animation: rc-glow-fade 1.25s ease-in-out infinite;
          will-change: opacity;
        }
        @keyframes rc-sharp-pulse {
          0%, 100% { opacity: 0.5; }
          50%      { opacity: 1; }
        }
        /* Pulses the sharpshot crit band via a pseudo-element's opacity — this
           sits INSIDE the aim bar, so the old box-shadow+filter animation was
           repainting the very surface the needle RAF needs. */
        .rc-sharp-band { position: absolute; }
        .rc-sharp-band::after {
          content: ''; position: absolute; inset: 0; border-radius: inherit;
          pointer-events: none;
          box-shadow: 0 0 13px rgba(251,191,36,0.95);
          animation: rc-sharp-pulse 1s ease-in-out infinite;
          will-change: opacity;
        }
        @keyframes rc-ember-rise {
          0%   { transform: translateY(0) scale(1);     opacity: 0; }
          22%  { opacity: 0.95; }
          100% { transform: translateY(-40px) scale(0.35); opacity: 0; }
        }
        .rc-ember {
          position: absolute; bottom: 16%; width: 4px; height: 4px; border-radius: 50%;
          box-shadow: 0 0 6px #fb923c; pointer-events: none;
          animation: rc-ember-rise 2.1s ease-out infinite;
        }
      `}</style>
    </div>
  )
}

function PlayerStatsPopup({
  shipName, shipImageUrl, shipFilter, playerHp, playerHpMax,
  shipMinDamage, shipSpeed, totalPower, totalNavigation, totalFortune,
  isBoss, equippedRaidItems, crateOdds = [], shipClasses = {}, damagePct = 0,
  megaAugment = null, megaCost = MEGA_CHARGE_COST,
  tideEffects = [],
  effectLabels = { good: 'Buffs', bad: 'Penalties' },
  contractsWon = [],
  runBoons,
  runCurses,
  conditions = [],
  onClose,
}: {
  shipName: string
  shipImageUrl: string
  shipFilter?: string
  playerHp: number
  playerHpMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalNavigation: number
  totalFortune: number
  isBoss: boolean
  equippedRaidItems: string[]
  /** Every unique this raid's crate can still pay, and how likely each is. */
  crateOdds?: CrateItemChance[]
  /** chapter -> classId picks. Surfaces under the stat grid so the
   *  player can see which classes are buffing them mid-fight. */
  shipClasses?: Record<string, string>
  damagePct?: number
  /** The player's Man-o-War ultimate (Mega), if built — surfaced as its own
   *  "Ultimate" section, the player-side twin of the enemy's Special/Ultimate. */
  megaAugment?: ShipAugment | null
  /** Effective Mega charge cost (after Don's cost-cut synergies). */
  megaCost?: number
  /** Mid-raid Tide effects currently in play. Listed in the Ledger
   *  as friendly one-liners (see lib/tides.describeEffect) so the
   *  player can see what their picks are doing. Hidden when empty. */
  tideEffects?: TideEffect[]
  /** Headings for the good/bad run-effect groups — "Boons"/"Curses" in the
   *  Gauntlet, "Buffs"/"Penalties" for raid Tides. */
  effectLabels?: { good: string; bad: string }
  /** Don's jobs cleared this run + the bonus each paid (Gauntlet only). */
  contractsWon?: { name: string; reward: string }[]
  /** Gauntlet boons / curses the player holds, WITH art — rendered as icon
   *  cards on the Effects tab (their presence marks a Gauntlet run). Omitted in
   *  ordinary raids, which fall back to the text Buffs/Penalties list. */
  runBoons?: { id: string; name: string; tier: number; image?: string | null; desc: string; color: string }[]
  runCurses?: { id: string; name: string; tier: number; image?: string | null; desc: string; color: string }[]
  /** Active statuses + bespoke effects (burn/freeze) on the player right now,
   *  with full descriptions — the popup-side twin of the HP-bar chip row. */
  conditions?: ConditionItem[]
  onClose: () => void
}) {
  // Tabbed layout — Stats / Effects / Gear — so the sheet isn't one long wall.
  const [tab, setTab] = useState<'stats' | 'effects' | 'gear'>('stats')
  // One scroll body is shared across tabs, so reset it to the top on every
  // switch — otherwise switching to a shorter tab while scrolled down leaves it
  // scrolled past its content (reads as blank).
  const bodyScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = 0 }, [tab])
  // Single source of truth — mirrors rollShotDamage, incl. crew damage effects.
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage, damagePct)
  const critMin   = shipMinDamage * 2
  // Split maneuver stats: INITIATIVE (hull speed + speed boons) decides turn
  // order, fleeing, and landing shots on a dodging enemy; EVASION (Navigation)
  // decides dodging incoming fire and steadier aim. Each has one job now — so a
  // speed boon and an enemy's speed both read clearly against yours.
  const rows: { label: string; value: string; hint: string; color: string }[] = [
    { label: 'Damage',      value: `${hitMin}–${powerMax}`,        hint: 'normal-hit damage range',             color: '#f87171' },
    { label: 'Crit Damage', value: `${critMin}–${critMax}`,        hint: 'damage on a critical lock',           color: '#fbbf24' },
    { label: 'Initiative',  value: String(shipSpeed),              hint: 'fire first · flee',                    color: '#60a5fa' },
    { label: 'Evasion',     value: String(totalNavigation),        hint: 'dodge · land on dodgers · steadier aim', color: '#5eead4' },
    // The MULTIPLIER, not just a promise. Fortune's whole problem was that its
    // effect was invisible: the panel claimed "better odds at rare loot" while
    // the stat did nothing for drops, and there was no number to check it
    // against. Printing the live figure means a captain can watch it move as
    // they build the party, which is the only way the stat reads as a build
    // choice rather than a stat that happens to exist.
    { label: 'Fortune',     value: String(totalFortune),           hint: `${fortuneLootMult(totalFortune).toFixed(2)}× drop odds · more doubloons · bigger repairs`, color: '#f0c040' },
  ]

  // Equipped Items — every raid item the player has on, surfaced as its own
  // card with name + description, so new items (any effect type) appear here
  // automatically as they're added.
  const equippedItems = equippedRaidItems
    .map(id => getRaidItem(id))
    .filter((i): i is NonNullable<ReturnType<typeof getRaidItem>> => !!i)

  // Run effects (tides + gauntlet boons + curses) all ride one flat list by the
  // time they reach here, which is exactly what made the old "Active Tides"
  // block confusing — a curse sat next to a boon under one heading. Split by
  // tone so good and bad read apart at a glance.
  const buffs: string[] = []
  const penalties: string[] = []
  for (const e of tideEffects) {
    const text = describeEffect(e)
    if (!text) continue // marker-only effects render no row
    if (effectTone(e) === 'bad') penalties.push(text)
    else buffs.push(text)
  }

  // Classes — chapter-end picks. Rather than a row per class (repetitive and
  // tall), sum every pick into one combined-effect line. `pct` turns a 1.18
  // multiplier into "+18%".
  const classAgg = aggregateShipClasses(shipClasses)
  const classNames = Object.values(shipClasses)
    .map(id => getShipClass(id))
    .filter((c): c is NonNullable<ReturnType<typeof getShipClass>> => !!c)
    .map(c => c.name)
  const pct = (m: number) => `${m > 1 ? '+' : ''}${Math.round((m - 1) * 100)}%`
  const classChips: { label: string; positive: boolean }[] = []
  if (classAgg.damageMult !== 1)   classChips.push({ label: `${pct(classAgg.damageMult)} Damage`,    positive: classAgg.damageMult > 1 })
  if (classAgg.hpMult !== 1)       classChips.push({ label: `${pct(classAgg.hpMult)} Max HP`,        positive: classAgg.hpMult > 1 })
  if (classAgg.speedFlat !== 0)    classChips.push({ label: `${classAgg.speedFlat > 0 ? '+' : ''}${classAgg.speedFlat} Speed`, positive: classAgg.speedFlat > 0 })
  if (classAgg.doubloonMult !== 1) classChips.push({ label: `${pct(classAgg.doubloonMult)} Doubloons`, positive: classAgg.doubloonMult > 1 })

  // A run-effects sub-list (Buffs / Penalties), shared shape for both groups.
  const effectGroup = (title: string, lines: string[], accent: string) => lines.length === 0 ? null : (
    <div>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: accent, letterSpacing: '0.14em', marginBottom: 5 }}>
        {title}
      </p>
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: '0.6rem 0.7rem',
        background: `${accent}12`,
        border: `1px solid ${accent}33`,
        borderRadius: 12,
      }}>
        {lines.map((label, i) => (
          <p key={i} className="font-karla" style={{ display: 'flex', gap: 6, fontSize: '0.78rem', color: 'rgba(240,237,232,0.82)', lineHeight: 1.4 }}>
            <span style={{ color: accent, flexShrink: 0 }}>•</span>
            <span>{label}</span>
          </p>
        ))}
      </div>
    </div>
  )

  const sectionHeading = (text: string, color: string) => (
    <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color, letterSpacing: '0.16em', marginBottom: 8 }}>{text}</p>
  )

  // ── Tabs ──────────────────────────────────────────────────────────────────
  // A Gauntlet run (runBoons/runCurses passed) shows boons + curses as ICON
  // cards; ordinary raids fall back to the text Buffs/Penalties list. Only tabs
  // with content show; Stats is always present.
  const isGauntlet = runBoons !== undefined || runCurses !== undefined
  const boonList = runBoons ?? []
  const curseList = runCurses ?? []
  const hasGear = !!megaAugment || equippedItems.length > 0
  const hasEffects = isGauntlet
    ? (boonList.length + curseList.length + contractsWon.length) > 0
    : (buffs.length + penalties.length + contractsWon.length) > 0
  const TABS = ([
    { key: 'stats' as const,   label: 'Stats',   show: true },
    { key: 'effects' as const, label: 'Effects', show: hasEffects },
    { key: 'gear' as const,    label: 'Gear',    show: hasGear },
  ]).filter(t => t.show)
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'stats'
  const ROMAN = ['', 'I', 'II', 'III']
  // One boon/curse as an icon card — art + name + effect, so the run reads at a
  // glance instead of as a wall of bullet text.
  const runEffectCard = (it: NonNullable<typeof runBoons>[number], bad: boolean) => (
    <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.55rem 0.65rem', borderRadius: 11, background: `${it.color}12`, border: `1px solid ${it.color}33` }}>
      <div style={{ width: 42, height: 42, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${it.color}1a`, border: `1px solid ${it.color}44`, borderRadius: 10 }}>
        {it.image
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={it.image} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
          : <span style={{ color: it.color, fontSize: '1.05rem', lineHeight: 1 }}>{bad ? '▼' : '◆'}</span>}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: bad ? '#f4bcbc' : '#eef6f4', lineHeight: 1.12 }}>{it.name}{it.tier > 1 ? ` ${ROMAN[Math.min(it.tier, 3)]}` : ''}</p>
        <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.7)', lineHeight: 1.32, marginTop: 2 }}>{it.desc}</p>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      // Scrim owns the scroll; the inner min-height wrapper centers the card
      // when it fits and lets it scroll from the top when it's taller than the
      // screen (the centered-flex-overflow fix). Portaled to <body> so the
      // fixed scrim escapes the transformed combat region — otherwise it
      // anchored to that box and the bottom got clipped + couldn't scroll.
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
      }}>
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 380,
          // Fixed size across tabs — the modal never jumps when you switch;
          // a taller tab scrolls its own content instead of growing the card.
          height: 'min(78vh, 560px)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)',
          border: '1px solid rgba(96,165,250,0.18)',
          borderRadius: 20,
          padding: '1.1rem 1rem 0',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Close — X top-right, replacing the old full-width bottom button. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '50%', color: 'rgba(240,237,232,0.7)', cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {/* Header — ship art + name. Right-padded so the name never runs under the X. */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, paddingRight: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shipImageUrl} alt="" style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 3px 8px rgba(0,0,0,0.5))${shipFilter && shipFilter !== 'none' ? ` ${shipFilter}` : ''}` }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.68rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 3 }}>Captain</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shipName}</p>
          </div>
        </div>

        {/* Tabs — group the sheet so it isn't one long scroll. */}
        {TABS.length > 1 && (
          <div style={{ flexShrink: 0, display: 'flex', gap: 4, padding: 3, marginBottom: 14, background: 'rgba(0,0,0,0.28)', borderRadius: 11, border: '1px solid rgba(255,255,255,0.07)' }}>
            {TABS.map(t => {
              const on = activeTab === t.key
              return (
                <button key={t.key} type="button" onClick={() => setTab(t.key)} className="font-karla font-800 uppercase tracking-[0.06em]"
                  style={{ flex: 1, padding: '0.46rem 0.2rem', borderRadius: 8, fontSize: '0.62rem', cursor: 'pointer', whiteSpace: 'nowrap',
                    border: `1px solid ${on ? 'rgba(96,165,250,0.5)' : 'transparent'}`,
                    background: on ? 'linear-gradient(180deg, rgba(96,165,250,0.24), rgba(96,165,250,0.06))' : 'transparent',
                    color: on ? '#cfe3ff' : '#8592a6' }}>
                  {t.label}
                </button>
              )
            })}
          </div>
        )}

        {/* Scrollable body — the header + tabs stay put, only the active tab's
            content scrolls, so the modal keeps one fixed size. */}
        <div ref={bodyScrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '1.1rem' }}>
        {activeTab === 'stats' && (<>
        {/* Stat cards — 2-column grid feels less list-y and more dashboard-y. */}
        {sectionHeading('Combat', '#8fb4e0')}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {rows.map(r => (
            <div key={r.label} style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '0.7rem 0.75rem',
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderLeft: `3px solid ${r.color}`,
              borderRadius: 12,
            }}>
              <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: r.color, letterSpacing: '0.04em' }}>{r.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f0ede8', lineHeight: 1.05 }}>{r.value}</p>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.35 }}>{r.hint}</p>
            </div>
          ))}
        </div>

        {/* Live conditions — what's on your hull RIGHT NOW (statuses + burn/
            freeze). Sits right under Combat, above the build sections, so the
            urgent transient reads come before the permanent loadout. */}
        {conditions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <ConditionsSection conditions={conditions} />
          </div>
        )}

        {/* Classes — one consolidated card: combined stat chips + which picks
            are stacked, instead of a tall row per class. */}
        {classChips.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {sectionHeading(classNames.length > 1 ? `Classes · ${classNames.length}` : 'Class', '#7dd3fc')}
            <div style={{
              padding: '0.7rem 0.75rem',
              background: 'rgba(125,211,252,0.07)',
              border: '1px solid rgba(125,211,252,0.22)',
              borderRadius: 12,
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {classChips.map((c, i) => (
                  <span key={i} className="font-karla font-700" style={{
                    fontSize: '0.72rem',
                    color: c.positive ? '#7adf9a' : '#f08a8a',
                    background: c.positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                    border: `1px solid ${c.positive ? 'rgba(74,222,128,0.32)' : 'rgba(248,113,113,0.32)'}`,
                    borderRadius: 7, padding: '0.22rem 0.5rem',
                  }}>{c.label}</span>
                ))}
              </div>
              {classNames.length > 0 && (
                <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(125,211,252,0.7)', marginTop: 8, lineHeight: 1.4 }}>
                  {classNames.join(' · ')}
                </p>
              )}
            </div>
          </div>
        )}
        </>)}

        {activeTab === 'gear' && (<>
        {/* Ultimate — the player's Man-o-War Mega, the signature move that
            mirrors the boss's own Special/Ultimate in the enemy Ledger. Only
            shown when one is built. Themed in the augment's own accent. */}
        {megaAugment && (
          <div style={{ marginTop: 16 }}>
            {sectionHeading('Ultimate', megaAugment.color)}
            <div style={{
              padding: '0.75rem 0.8rem',
              background: `${megaAugment.color}12`,
              border: `1px solid ${megaAugment.color}44`,
              borderRadius: 12,
              boxShadow: `0 0 16px ${megaAugment.color}18`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <p className="font-cinzel font-800" style={{ flex: 1, minWidth: 0, fontSize: '1rem', color: megaAugment.color, lineHeight: 1.1 }}>
                  {megaAugment.name} <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: 'rgba(240,237,232,0.5)' }}>Mega</span>
                </p>
                <span className="font-karla font-800" style={{ flexShrink: 0, fontSize: '0.72rem', color: megaAugment.color, background: `${megaAugment.color}1e`, border: `1px solid ${megaAugment.color}55`, borderRadius: 999, padding: '0.2rem 0.55rem' }}>
                  {megaCost} ◆ · {megaAugment.megaMult}× dmg
                </span>
              </div>
              <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.4, marginTop: 6 }}>
                {megaAugment.identity} {megaAugment.tagline}
              </p>
            </div>
          </div>
        )}

        {/* IN THE CRATE. Raids never stated a drop rate anywhere: the reveal
            said what you got and the pre-fight screen said nothing about what
            you were farming. Now that uniques roll independently those are real
            numbers, so they can simply be printed. Boosted figure leads, the
            pre-Fortune one is struck under it, matching the Gauntlet breather. */}
        {crateOdds.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {sectionHeading(isBoss ? 'In the Crate' : 'Boss Crate', '#f0c040')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {crateOdds.map(o => {
                const boosted = o.chance > o.chanceBeforeFortune
                const pct = (v: number) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`
                return (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '0.35rem 0.5rem', borderRadius: 9,
                    background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <span style={{ flexShrink: 0, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {o.image
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={o.image} alt="" loading="lazy" decoding="async" style={{ maxWidth: 22, maxHeight: 22, objectFit: 'contain' }} />
                        : <span style={{ fontSize: '0.8rem', color: '#f0c040' }}>◆</span>}
                    </span>
                    <span className="font-karla font-600 truncate" style={{ flex: 1, minWidth: 0, fontSize: '0.72rem', color: '#d8d2c6' }}>
                      {o.label}
                    </span>
                    {boosted && (
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#8f8a80', textDecoration: 'line-through', opacity: 0.8, fontVariantNumeric: 'tabular-nums' }}>
                        {pct(o.chanceBeforeFortune)}
                      </span>
                    )}
                    <span className="font-cinzel font-800" style={{ fontSize: '0.82rem', color: boosted ? '#f0c040' : '#e8e1d2', fontVariantNumeric: 'tabular-nums' }}>
                      {pct(o.chance)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Equipped Items — scales with however many raid items are on. */}
        {equippedItems.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {sectionHeading(equippedItems.length > 1 ? `Equipped Items · ${equippedItems.length}` : 'Equipped Item', '#fbbf24')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {equippedItems.map(item => {
                // Each item wears its own rarity colour (epic → violet, legendary
                // → gold, etc.), the same scheme as raid loot — so a forged or
                // abyssal legendary reads apart from a plain epic at a glance.
                const c = RARITY_COLOR[item.rarity] ?? '#fbbf24'
                return (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.65rem 0.75rem',
                  background: `${c}12`,
                  border: `1px solid ${c}38`,
                  borderRadius: 12,
                }}>
                  {/* Item glyph */}
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${c}1c`,
                    border: `1px solid ${c}4d`,
                    borderRadius: 9,
                  }}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '1.1rem', color: c, display: 'flex' }}><IconCrate size={18} /></span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                      <p className="font-karla font-700" style={{ minWidth: 0, fontSize: '0.85rem', color: c, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                      <span className="font-karla font-800 uppercase" style={{ flexShrink: 0, fontSize: '0.46rem', letterSpacing: '0.09em', color: c, opacity: 0.85 }}>{item.rarity}</span>
                    </div>
                    <ItemEffectLines def={item} size={0.7} color="rgba(240,237,232,0.68)" gap={3} showFlavor={false} />
                  </div>
                </div>
                )
              })}
            </div>
          </div>
        )}

        </>)}

        {activeTab === 'effects' && (<>
        {isGauntlet ? (
          <>
            {boonList.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {sectionHeading(boonList.length > 1 ? `Boons · ${boonList.length}` : 'Boon', '#5eead4')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {boonList.map(b => runEffectCard(b, false))}
                </div>
              </div>
            )}
            {curseList.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {sectionHeading(curseList.length > 1 ? `Curses · ${curseList.length}` : 'Curse', '#f08a8a')}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {curseList.map(c => runEffectCard(c, true))}
                </div>
              </div>
            )}
            {boonList.length === 0 && curseList.length === 0 && contractsWon.length === 0 && (
              <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.5)', textAlign: 'center', padding: '0.9rem 0' }}>No boons or curses yet — they surface between fights.</p>
            )}
          </>
        ) : (
          (buffs.length > 0 || penalties.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {effectGroup(buffs.length > 1 ? `${effectLabels.good} · ${buffs.length}` : effectLabels.good, buffs, '#5eead4')}
              {effectGroup(penalties.length > 1 ? `${effectLabels.bad} · ${penalties.length}` : effectLabels.bad, penalties, '#f08a8a')}
            </div>
          )
        )}

        {/* Don's Jobs cleared this run + the bonus each paid. */}
        {contractsWon.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <p className="font-karla font-800 uppercase tracking-[0.16em]" style={{ fontSize: '0.55rem', color: '#5fd39a', marginBottom: 8 }}>Don&apos;s Jobs Cleared · {contractsWon.length}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {contractsWon.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, padding: '0.42rem 0.62rem', borderRadius: 9, background: 'rgba(63,191,130,0.08)', border: '1px solid rgba(63,191,130,0.28)' }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#e6e1d6' }}>{c.name}</span>
                  <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: '0.74rem', color: '#8ff0bd' }}>▲ {c.reward}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </>)}
        </div>
      </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}

// ── Enemy stats popup ───────────────────────────────────────────────────────
// Mirrors PlayerStatsPopup for the current enemy. Shows what a player would
// want to know to read the fight: HP / damage range / volley / crit chance /
// speed, the themed ability if any, and the full behavior pattern as chips so
// the cycle is legible. Tapping the backdrop or Close dismisses.
function EnemyStatsPopup({
  enemy, currentHp, maxHp, isBoss, isElite, affix, conditions = [], onClose,
}: {
  enemy: BroadsideEnemy
  currentHp: number
  /** Actual max HP this fight (base × enemyHpScale), so the sheet matches the bar. */
  maxHp: number
  isBoss: boolean
  isElite?: boolean
  affix?: AffixDef
  /** Active statuses + bespoke effects (burn/freeze/snare) on this enemy right
   *  now, with full descriptions — the popup-side twin of the chip row. */
  conditions?: ConditionItem[]
  onClose: () => void
}) {
  const minVolley = enemy.minDmg * 2
  const maxVolley = enemy.maxDmg * 2
  const minCrit = Math.floor(enemy.minDmg * 1.5)
  const maxCrit = Math.floor(enemy.maxDmg * 1.5)
  const critPct = Math.round((enemy.critChance ?? 0) * 100)
  const dr = enemy.damageReduction ?? 0
  const drPct = Math.round(dr * 100)
  const abilityName = enemy.abilityName
  // Signal Flares / "False Colors" barrage — driven off decoyCount (the same
  // deception tier that seeds the aim-bar decoys). Every few turns the fleet
  // screens itself with false flares the player must swat; the boss tier (3)
  // mixes in red live-shell feints you must NOT tap. Count mirrors RaidCombat's
  // flareCount = 3 + tier * 2 (5 / 7 / 9).
  const flareTier      = enemy.decoyCount ?? 0
  const flareShots     = flareTier > 0 ? 3 + flareTier * 2 : 0
  const flareHasFeints = flareTier >= 3

  const rows: { label: string; value: string; hint: string; color: string }[] = [
    { label: 'HP',          value: `${currentHp} / ${maxHp}`,          hint: 'remaining / total hull',         color: '#86efac' },
    { label: 'Damage',      value: `${enemy.minDmg}–${enemy.maxDmg}`,  hint: 'per normal shot',                color: '#f87171' },
    { label: 'Volley',      value: `${minVolley}–${maxVolley}`,        hint: '3-charge heavy shot',            color: '#fb923c' },
    { label: 'Initiative',  value: String(enemy.shipSpeed),            hint: 'turn order',                     color: '#60a5fa' },
    { label: 'Crit Chance', value: `${critPct}%`,                      hint: `${minCrit}–${maxCrit} on crit`,  color: '#fbbf24' },
  ]

  // Behavioral HINT only — deliberately fuzzy. The full pattern cycle is intel
  // the player is meant to learn by playing; spelling it out trivialises the
  // "read the rhythm" puzzle. The hint nudges them toward what to watch for
  // (volleys, dodges, aggression) without giving away turn-by-turn timing.
  const behaviorHint = enemyBehaviorHint(enemy)

  // Multi-phase bosses (phases[] supersedes phase2). Surface each phase + its
  // telegraphed mechanic check here — the fights were too opaque with the answer
  // only findable by trial and error, so the popup now spells out what each
  // phase does and how to answer its check.
  const popupPhases = enemy.phases ?? (enemy.phase2 ? [enemy.phase2] : [])
  // Authored `hint` wins (it already names crew abilities as the answer);
  // otherwise fall back to the shared crew-ability cue — category-vague, but
  // explicit that a crew ability is what clears the check.
  const checkHint = (chk: BossMechanicCheck): string => chk.hint ?? crewCounterCue(chk.responses)
  const describeConsequence = (c: BossMechanicCheck['consequence']): string =>
    c.kind === 'damagePctMaxHp'
      ? `hits you for ${Math.round(c.value * 100)}% of your max hull`
      : c.kind === 'burnDot'
      ? `sets you ablaze — ${Math.round(c.pctPerTurn * 100)}% of your hull per turn for ${c.turns} turns unless a heal puts it out`
      : c.kind === 'status'
      ? `leaves you ${c.status === 'feeble' ? 'exposed (you take more damage)' : c.status === 'weaken' ? 'weakened (you deal less)' : 'slowed'} for ${c.turns} turns${c.dmgPct ? `, and clips you for ${Math.round(c.dmgPct * 100)}%` : ''}`
      : `the boss heals ${Math.round(c.value * 100)}% of its HP`

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      // Portaled to <body> + scrim-owns-scroll so the fixed overlay escapes the
      // transformed combat region (otherwise it anchored to that box, the bottom
      // clipped, and it couldn't scroll). Mirrors PlayerStatsPopup.
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      }}
    >
      <div style={{
        minHeight: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
        paddingTop: 'calc(1.25rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0px))',
      }}>
      <motion.div
        onClick={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, y: 4 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          width: '100%', maxWidth: 380,
          background: 'linear-gradient(180deg, #1a0c0c 0%, #0c0606 100%)',
          border: `1px solid ${isBoss ? 'rgba(251,191,36,0.34)' : 'rgba(239,68,68,0.22)'}`,
          borderRadius: 20,
          padding: '1.1rem 1rem 1.2rem',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Close — X top-right, matching PlayerStatsPopup. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute', top: 12, right: 12, zIndex: 2,
            width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '50%', color: 'rgba(240,237,232,0.7)', cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>

        {/* Header — portrait + name. Right-padded so the name clears the X. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingRight: 32 }}>
          {enemy.portrait && (
            <div style={{
              flexShrink: 0, width: 60, height: 60, borderRadius: '50%',
              border: `2px solid ${isBoss ? '#fbbf24' : ENEMY_COLOR}`,
              boxShadow: `0 0 10px ${isBoss ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.4)'}`,
              overflow: 'hidden',
              background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.08) 0%, rgba(20,40,60,0.85) 70%)',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enemy.portrait} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.68rem', color: isBoss ? '#fbbf24' : '#c4a96a', letterSpacing: '0.14em', marginBottom: 3 }}>
              {isBoss ? 'Boss' : 'Enemy'}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {enemy.name}
            </p>
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
          {rows.map(r => (
            <div key={r.label} style={{
              display: 'flex', flexDirection: 'column', gap: 4,
              padding: '0.65rem 0.7rem',
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderLeft: `3px solid ${r.color}`,
              borderRadius: 12,
            }}>
              <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: r.color, letterSpacing: '0.04em' }}>{r.label}</p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.05 }}>{r.value}</p>
              <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.35 }}>{r.hint}</p>
            </div>
          ))}
        </div>

        {/* Elite affix card — appears above the themed-ability card so the
            twist for THIS specific elite reads first. Uses the same shape
            as the ability card with a violet palette so the two feel
            sibling but distinct. */}
        {affix && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#a78bfa', letterSpacing: '0.16em', marginBottom: 6 }}>
              Elite Affix
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(167,139,250,0.07)',
              border: '1px solid rgba(167,139,250,0.32)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(167,139,250,0.12)',
                border: '1px solid rgba(167,139,250,0.4)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.05rem' }} aria-hidden>✦</span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#c4b5fd', lineHeight: 1.15, marginBottom: 2 }}>
                  {affix.name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  {affix.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Themed ability — Carapace / etc., if the enemy has one */}
        {dr > 0 && abilityName && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#7dd3fc', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(56,189,248,0.06)',
              border: '1px solid rgba(56,189,248,0.22)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(56,189,248,0.1)',
                border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#7dd3fc', display: 'flex' }} aria-hidden><IconShield size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#7dd3fc', lineHeight: 1.15, marginBottom: 2 }}>
                  {abilityName} −{drPct}%
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  Soaks {drPct}% off your fire and graze hits. Volleys punch through it for full damage.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mist Veil — The Cartographer's raid ability. Same layout as
            the Carapace card so the player learns one pattern for "this
            enemy has a themed thing." Accent shifts to the cool fog
            blue rather than Carapace's sky cyan so the two are
            visually distinguishable when a future enemy carries both. */}
        {(enemy.aimFogDensity ?? 0) > 0 && enemy.aimFogName && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#b0c4d8', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(176,196,216,0.06)',
              border: '1px solid rgba(176,196,216,0.22)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(176,196,216,0.1)',
                border: '1px solid rgba(176,196,216,0.3)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#b0c4d8', display: 'flex' }} aria-hidden><IconFog size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#b0c4d8', lineHeight: 1.15, marginBottom: 2 }}>
                  {enemy.aimFogName}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  Fog drifts across your aim bar, hiding the gold center. Lock through the mist by rhythm and timing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rolling Plate (Raid 7) — the gold crit seam drifts inside the
            target zone. Gold accent so it reads as an aim-skill trait. */}
        {(enemy.critDrift ?? 0) > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#f0c040', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(240,192,64,0.06)',
              border: '1px solid rgba(240,192,64,0.22)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(240,192,64,0.1)',
                border: '1px solid rgba(240,192,64,0.3)',
                borderRadius: 9,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f0c040" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M8 7l-5 5 5 5M16 7l5 5-5 5" />
                </svg>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0c040', lineHeight: 1.15, marginBottom: 2 }}>
                  {enemy.critDriftName ?? 'Rolling Plate'}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  Its armor plating rolls as it fights: the gold critical seam wanders the whole target zone, even out into the gray fringe. Hitting the seam always crits, but chasing it into the fringe is a wager: miss it by a hair out there and you only graze.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Riposte — The Cartographer's unique trait (layered on top of
            the crew-wide Mist Veil). Warm amber accent so it reads as
            "offensive defense" rather than the cool fog blue. Same card
            shape so abilities stack cleanly when an enemy carries both. */}
        {enemy.parryChance && enemy.parryDamagePct && enemy.parryName && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#f0c040', letterSpacing: '0.16em', marginBottom: 6 }}>
              Counter-Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(240,192,64,0.06)',
              border: '1px solid rgba(240,192,64,0.22)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(240,192,64,0.1)',
                border: '1px solid rgba(240,192,64,0.3)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#f0c040', display: 'flex' }} aria-hidden><IconSwords size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0c040', lineHeight: 1.15, marginBottom: 2 }}>
                  {enemy.parryName}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  Counters a dodged strike for {Math.round(enemy.parryDamagePct * 100)}% of his damage roll, {Math.round(enemy.parryChance * 100)}% of the time. Firing into his dodge is never safe.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Shark's Bite — Raid 8 signature (chargeBiteChance). An on-hit steal:
            a landed shot has a chance to tear a loaded cannonball off your rack.
            Crimson accent so this "it takes from you" trait reads apart from the
            gold counter and orange flares. */}
        {(enemy.chargeBiteChance ?? 0) > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#f0715e', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(240,113,94,0.06)',
              border: '1px solid rgba(240,113,94,0.24)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(240,113,94,0.1)',
                border: '1px solid rgba(240,113,94,0.32)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#f0715e', display: 'flex' }} aria-hidden><IconSkull size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0715e', lineHeight: 1.15, marginBottom: 2 }}>
                  Shark&apos;s Bite
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  When a shot lands on you, {Math.round((enemy.chargeBiteChance ?? 0) * 100)}% of the time it also tears a loaded cannonball off your rack. Dodging, bracing, or soaking it fully on shield spares the shot; a reload puts the cannonball back.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Special — the enemy's signature status / aim-bar move (enemy.special).
            Violet accent. Covers raid-7 status debuffs (fortify/slow/weaken/
            feeble/regen/silence) and raid-8 aim-bar attacks (decoys/hardened/
            squall), each spelled out by enemySpecialDesc. */}
        {enemy.special && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#a78bfa', letterSpacing: '0.16em', marginBottom: 6 }}>
              Special
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(167,139,250,0.06)',
              border: '1px solid rgba(167,139,250,0.24)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(167,139,250,0.1)',
                border: '1px solid rgba(167,139,250,0.32)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#a78bfa', display: 'flex' }} aria-hidden><IconBolt size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#a78bfa', lineHeight: 1.15, marginBottom: 2 }}>
                  {enemy.special.name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  {enemySpecialDesc(enemy.special)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Ultimate — raid-8 full-magazine blow (enemy.ultimate). Amber, tied to
            the "full glowing pips" charged-battery tell. */}
        {enemy.ultimate && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#fbbf24', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ultimate
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(251,191,36,0.06)',
              border: '1px solid rgba(251,191,36,0.24)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.32)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#fbbf24', display: 'flex' }} aria-hidden><IconFlame size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#fbbf24', lineHeight: 1.15, marginBottom: 2 }}>
                  {enemy.ultimate.name}
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  {enemyUltimateDesc(enemy.ultimate)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Signal Flares — the "False Colors" whack-a-mole interrupt carried by
            any decoy-fleet enemy (decoyCount > 0). Warm flare-orange accent so it
            reads apart from the cool decoy/fog abilities. Boss tier adds the
            live-shell feint warning. */}
        {flareShots > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#fb923c', letterSpacing: '0.16em', marginBottom: 6 }}>
              Ability
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.65rem 0.75rem',
              background: 'rgba(251,146,60,0.06)',
              border: '1px solid rgba(251,146,60,0.24)',
              borderRadius: 12,
            }}>
              <div style={{
                width: 36, height: 36, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(251,146,60,0.1)',
                border: '1px solid rgba(251,146,60,0.32)',
                borderRadius: 9,
              }}>
                <span style={{ fontSize: '1.1rem', color: '#fb923c', display: 'flex' }} aria-hidden><IconBurst size={18} /></span>
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#fb923c', lineHeight: 1.15, marginBottom: 2 }}>
                  Signal Flares
                </p>
                <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>
                  Every few turns a screen of {flareShots} false flares goes up. Swat each amber flare before its fuse burns out — every one you let through chips your hull.{flareHasFeints ? ' Some glow red: those are live shells, so let them fizzle. Tapping a red flare hurts worse than missing an amber one.' : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Phases — for multi-phase bosses (the Quartermaster etc.). Each phase
            revives the boss meaner; a phase with a telegraphed check spells out
            what it does + how to answer, so the fight is readable, not opaque. */}
        {popupPhases.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#f0a0a0', letterSpacing: '0.16em', marginBottom: 6 }}>
              Phases · {popupPhases.length + 1}
            </p>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.55)', lineHeight: 1.4, marginBottom: 8 }}>
              This boss falls, then rises again — meaner each time. Watch for a telegraphed move and answer it in time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {popupPhases.map((ph, i) => {
                const n = i + 2 // phaseList[0] = phase 2
                const chk = ph.check
                return (
                  <div key={i} style={{
                    padding: '0.65rem 0.75rem', borderRadius: 12,
                    background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.22)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                      <span className="font-karla font-800 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.1em', color: '#fca5a5' }}>Phase {n}</span>
                      {ph.badge && <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f3d6d6' }}>{ph.badge}</span>}
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(240,237,232,0.5)' }}>
                        revives ~{Math.round(ph.revivePct * 100)}% HP{ph.damageMult > 1 ? ` · +${Math.round((ph.damageMult - 1) * 100)}% damage` : ''}
                      </span>
                    </div>
                    {chk && (
                      <div style={{ marginTop: 6 }}>
                        <p className="font-karla font-700" style={{ fontSize: '0.74rem', color: '#f3c0c0', lineHeight: 1.35 }}>
                          Telegraphed: “{chk.name}” — {chk.telegraph}
                        </p>
                        <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.4, marginTop: 4 }}>
                          <span style={{ color: '#86efac', fontWeight: 700 }}>Hint:</span> {checkHint(chk)} You get {chk.chargeTurns} turn{chk.chargeTurns === 1 ? '' : 's'} to answer, or it {describeConsequence(chk.consequence)}.
                        </p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Live conditions — what's ON it right now (statuses + burn/freeze/
            snare), with the plain-English explanation the chips can't fit. */}
        {conditions.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <ConditionsSection conditions={conditions} />
          </div>
        )}

        {/* Behavior — a single fuzzy tell, not a turn-by-turn pattern reveal.
            Players still have to read the rhythm in combat; this just tips
            them off to what to watch for. */}
        <div style={{ marginBottom: 14 }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#9a9690', letterSpacing: '0.16em', marginBottom: 6 }}>
            Behavior
          </p>
          <p className="font-karla font-500 italic" style={{ fontSize: '0.82rem', color: '#cbd2da', lineHeight: 1.4 }}>
            {behaviorHint}
          </p>
        </div>

      </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}


// Carapace deflect — the read when Krust's plate shrugs off a non-volley shot:
// a steely plate-flex ring + a hard glint + sparks scattering sideways/down
// (deflected, not penetrating). Reads as "blocked — volley to crack it".
// ── The Quartermaster "Flare Barrage" — reactive whack-a-mole ────────────────
// `count` false flares spawn across the stage at ARRHYTHMIC intervals (clusters,
// pauses, sudden quick ones) so the player can't settle into a rhythm. Amber
// flares are SWAT targets — tap before the fuse shuts. Red FEINTS (boss tier)
// are live shells — the rule flips: tapping one is a penalty, you must let it
// fizzle. A penalty = a real flare missed OR a feint tapped. Calls
// onComplete(penalties) once every flare has resolved.
const FEINT_COLOR = '#ef4444'
function FlareBarrage({ count, color, label, feintChance = 0, clusterChance = 0.24, fuseScale = 1, onComplete }: {
  count: number
  color: string
  label: string
  feintChance?: number
  clusterChance?: number
  fuseScale?: number
  onComplete: (missed: number, feintsTapped: number) => void
}) {
  type Flare = { id: number; x: number; y: number; fuse: number; feint: boolean }
  const [flares, setFlares] = useState<Flare[]>([])
  const [pops, setPops] = useState<{ id: number; x: number; y: number; bad: boolean }[]>([])
  const [resolved, setResolved] = useState(0)
  const resolvedIds = useRef<Set<number>>(new Set())
  const missRef = useRef(0)       // real flares LET THROUGH (not tapped)
  const feintTapRef = useRef(0)   // live-shell feints TAPPED (the boss-tier mistake)
  const doneRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const rootRef = useRef<HTMLDivElement>(null)

  // A penalty is a real flare LET THROUGH (not tapped) or a feint TAPPED — the
  // rule flips on feints, which is the boss-tier discrimination test. The two
  // are tracked apart so the outcome can call out a live-shell tap for what it
  // is (and buzz a distinct "you blew it" haptic the instant it happens).
  function resolveFlare(f: { id: number; x: number; y: number; feint: boolean }, tapped: boolean) {
    if (resolvedIds.current.has(f.id)) return
    resolvedIds.current.add(f.id)
    const penalty = f.feint ? tapped : !tapped
    if (penalty) {
      if (f.feint) { feintTapRef.current++; vibrate([0, 55, 35, 75]) }  // tapped a live shell
      else           missRef.current++                                  // let a real flare through
    } else if (tapped) vibrate(13)   // clean swat
    setResolved(r => r + 1)
    setFlares(prev => prev.filter(p => p.id !== f.id))
    setPops(pp => [...pp, { id: f.id, x: f.x, y: f.y, bad: penalty }])
    timersRef.current.push(setTimeout(() => setPops(pp => pp.filter(p => p.id !== f.id)), 600))
    if (resolvedIds.current.size >= count && !doneRef.current) {
      doneRef.current = true
      timersRef.current.push(setTimeout(() => onComplete(missRef.current, feintTapRef.current), 340))
    }
  }

  // THE WAVE RUNS OFF ONE CLAMPED rAF CLOCK, NOT A FAN OF TIMERS.
  //
  // It used to be a setTimeout per spawn and a setTimeout per fuse. That breaks
  // the instant the phone locks: mobile engines SUSPEND timers on a
  // backgrounded tab, so on return every pending spawn and every pending fuse
  // fires in one burst -- the rest of the barrage appears and expires as
  // "missed" in the same frame, before a finger can move. And because
  // globals.css freezes CSS animations while hidden (.doc-hidden), whatever is
  // on screen renders stuck at its FIRST keyframe: rc-flare-in at scale(0.2),
  // and the red rc-flare-pop penalty burst pinned at full opacity instead of
  // fading. Small red dots with no ring, unresponsive, and a wave of free
  // damage -- exactly what was reported after a 4-minute lock.
  //
  // A single rAF loop with a CLAMPED per-frame delta fixes all of it. rAF does
  // not tick while hidden, and clamping the first frame back to one frame's
  // worth means the barrage simply PAUSES with the phone and resumes where it
  // stopped. It pauses in lockstep with the CSS animations, which the same
  // event freezes, so every fuse ring stays true to its own timer.
  //
  // Deliberately NOT "forgive the wave if the app was hidden": that would make
  // backgrounding the app a free skip on every barrage, which is worse than the
  // bug. Pausing is the honest fix -- you get back exactly the wave you left.
  const resolveRef = useRef(resolveFlare)
  resolveRef.current = resolveFlare

  useEffect(() => {
    if (count <= 0) { onComplete(0, 0); return }
    // Spacing: keep a new flare's center far enough from any flare still on
    // screen that its 66px tap target can't overlap a live one and steal its
    // tap. Convert the button size (+ buffer) to this stage's % per axis so it
    // holds at any stage height. `placed` tracks each flare's live window
    // [appear, appear+fuse]; a new flare only needs clearance from flares still
    // alive when it pops in.
    const rect = rootRef.current?.getBoundingClientRect()
    const W = rect?.width  || 360
    const H = rect?.height || 420
    const SEP_PX = 78
    const sepX = (SEP_PX / W) * 100
    const sepY = (SEP_PX / H) * 100
    const placed: { x: number; y: number; end: number }[] = []
    // The whole wave is planned up front as data — appear/expire offsets in ms
    // from the wave's own clock — so the driver below is a pure read of it.
    const schedule: { f: Flare; appearAt: number; expireAt: number }[] = []
    let t = 420
    for (let k = 0; k < count; k++) {
      const fuse = (Math.max(560, 960 - k * 34) + Math.random() * 150) * fuseScale   // tighten as it goes (higher floor after the 2026 speed nerf)
      // Rejection-sample a spot clear of every flare still live at spawn time.
      // If the field is too crowded to fully separate, keep the roomiest pick.
      const alive = placed.filter(p => p.end > t)
      let best = { x: 12 + Math.random() * 76, y: 24 + Math.random() * 50 }
      let bestClearance = -1
      for (let attempt = 0; attempt < 28; attempt++) {
        const cx = 12 + Math.random() * 76
        const cy = 24 + Math.random() * 50
        let minD = Infinity
        for (const p of alive) {
          const dx = (cx - p.x) / sepX, dy = (cy - p.y) / sepY
          minD = Math.min(minD, Math.hypot(dx, dy))
        }
        if (minD >= 1) { best = { x: cx, y: cy }; break }   // clear of all live flares
        if (minD > bestClearance) { bestClearance = minD; best = { x: cx, y: cy } }
      }
      const x = best.x, y = best.y
      // Never make the FIRST flare a feint (ease the player into the wave).
      const feint = k > 0 && Math.random() < feintChance
      const f = { id: k, x, y, fuse, feint }
      placed.push({ x, y, end: t + fuse })
      schedule.push({ f, appearAt: t, expireAt: t + fuse })
      // Arrhythmic gap to the next spawn — cluster, lull, or normal.
      const r = Math.random()
      const gap = r < clusterChance ? 205 + Math.random() * 110      // cluster (back-to-back, but spaced enough to tap — 2026 nerf, was 115+85)
                : r < clusterChance + 0.26 ? 770 + Math.random() * 280 // lull (a beat of calm)
                : 380 + Math.random() * 230                          // normal
      t += gap
    }

    // One frame's worth of catch-up, max. This single clamp is what makes the
    // wave immune to a lock screen: a 4-minute gap advances the wave by 100ms.
    const MAX_DT = 100
    const spawned = new Set<number>()
    let elapsed = 0
    let last = -1
    let raf = 0
    const tick = (now: number) => {
      if (last < 0) last = now
      elapsed += Math.min(now - last, MAX_DT)
      last = now
      for (const s of schedule) {
        if (!spawned.has(s.f.id) && elapsed >= s.appearAt) {
          spawned.add(s.f.id)
          setFlares(prev => prev.some(p => p.id === s.f.id) ? prev : [...prev, s.f])
        }
        // Fuse burned out with no tap. resolveFlare self-guards on
        // resolvedIds, so a tap that already landed is not double-counted.
        if (spawned.has(s.f.id) && elapsed >= s.expireAt) resolveRef.current(s.f, false)
      }
      if (resolvedIds.current.size < count) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); timersRef.current.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none' }}>
      {/* Tap shield — while the barrage is live, swallow every tap that ISN'T a
          flare so a stray swat can't hit the ship, your portrait, the action
          buttons, or anything else behind the stage and open something by
          accident. The flare buttons render AFTER this (so above it) and stay
          fully live; this only eats the misses. */}
      <div aria-hidden
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation() }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', touchAction: 'none', cursor: 'default', background: 'transparent' }} />
      <style>{`
        @keyframes rc-flare-in   { 0% { transform: scale(0.2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes rc-flare-fuse { 0% { transform: scale(2.6); opacity: 0.95; } 100% { transform: scale(1); opacity: 0.3; } }
        @keyframes rc-flare-pop  { 0% { transform: scale(0.7); opacity: 1; } 100% { transform: scale(2.7); opacity: 0; } }
        @keyframes rc-feint-warn { 0%,100% { transform: scale(1);    opacity: 0.9; } 50% { transform: scale(1.32); opacity: 0.25; } }
        @keyframes rc-feint-throb{ 0%,100% { box-shadow: 0 0 16px ${FEINT_COLOR}, 0 0 4px #fff inset; } 50% { box-shadow: 0 0 30px ${FEINT_COLOR}, 0 0 8px #fff inset; } }
      `}</style>
      {/* Banner + remaining tally */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', textAlign: 'center' }}>
        <div className="font-cinzel font-700 uppercase" style={{ fontSize: '0.82rem', letterSpacing: '0.12em', color, textShadow: `0 0 16px ${color}aa`, whiteSpace: 'nowrap' }}>
          {label} — intercept!
        </div>
        <div className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: feintChance > 0 ? FEINT_COLOR : '#c4b690', marginTop: 2, whiteSpace: 'nowrap' }}>
          {feintChance > 0 ? "swat amber · never tap the red ✕" : `${Math.max(0, count - resolved)} left`}
        </div>
      </div>
      {/* Active flares — amber = swat, red ✕ = feint (a LIVE shell, leave it). */}
      {flares.map(f => {
        const c = f.feint ? FEINT_COLOR : color
        return (
          <button key={f.id} type="button" aria-label={f.feint ? 'Live shell — do not tap' : 'Swat flare'}
            onPointerDown={(e) => { e.preventDefault(); resolveFlare(f, true) }}
            style={{
              position: 'absolute', left: `${f.x}%`, top: `${f.y}%`,
              width: 66, height: 66, marginLeft: -33, marginTop: -33,
              padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
              pointerEvents: 'auto', touchAction: 'manipulation',
              animation: 'rc-flare-in 0.13s ease-out',
            }}>
            {/* Feints get a constant pulsing HAZARD halo so a live shell is
                unmistakable from an amber swat-target under pressure. */}
            {f.feint && (
              <div aria-hidden style={{
                position: 'absolute', inset: -2, borderRadius: '50%',
                border: `2px dashed ${FEINT_COLOR}`,
                animation: 'rc-feint-warn 0.7s ease-in-out infinite',
              }} />
            )}
            {/* Closing fuse ring — shrinks onto the orb over the fuse window. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 5, borderRadius: '50%',
              border: `3px solid ${c}`, boxShadow: `0 0 14px ${c}`,
              animation: `rc-flare-fuse ${f.fuse}ms linear forwards`,
            }} />
            {/* Core orb — feints are a dark, throbbing red with a big ✕ so they
                read as "do NOT touch" at a glance; amber reads as "swat me". */}
            <div aria-hidden style={{
              position: 'absolute', inset: f.feint ? 18 : 21, borderRadius: '50%',
              background: f.feint
                ? `radial-gradient(circle at 35% 30%, #ff6b6b 0%, #b91c1c 55%, #450a0a 100%)`
                : `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color}aa 100%)`,
              boxShadow: `0 0 18px ${c}`,
              animation: f.feint ? 'rc-feint-throb 0.7s ease-in-out infinite' : undefined,
            }}>
              {f.feint && (
                <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 26, lineHeight: 1, textShadow: '0 0 6px #450a0a' }}>✕</div>
              )}
            </div>
          </button>
        )
      })}
      {/* Burst FX — clean swat (amber) vs penalty (red detonation). */}
      {pops.map(p => (
        <div key={`pop-${p.id}`} aria-hidden style={{
          position: 'absolute', left: `${p.x}%`, top: `${p.y}%`,
          width: 58, height: 58, marginLeft: -29, marginTop: -29, borderRadius: '50%',
          pointerEvents: 'none',
          background: p.bad
            ? 'radial-gradient(circle, #ef4444 0%, rgba(239,68,68,0.35) 48%, transparent 72%)'
            : `radial-gradient(circle, #ffffff 0%, ${color} 50%, transparent 72%)`,
          boxShadow: p.bad ? '0 0 24px #ef4444' : `0 0 24px ${color}`,
          animation: 'rc-flare-pop 0.5s ease-out forwards',
        }} />
      ))}
    </div>
  )
}

function CarapaceDeflect() {
  const STEEL = '#9fc4e0'
  const sparks = useMemo(() => Array.from({ length: 8 }, (_, n) => {
    const side = n % 2 === 0 ? -1 : 1
    const dist = 22 + Math.random() * 18
    const ang = 0.15 + Math.random() * 0.75               // mostly down-and-out
    return { x: side * Math.cos(ang) * dist, y: Math.abs(Math.sin(ang)) * dist + 4, size: 2.5 + Math.random() * 2, dur: 0.3 + Math.random() * 0.15 }
  }), [])
  return (
    <div style={{ position: 'absolute', left: '46%', top: '46%', width: 0, height: 0, pointerEvents: 'none', zIndex: 11 }}>
      {/* Plate flex ring */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0.95 }}
        animate={{ scale: 1.7, opacity: 0 }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        style={{ position: 'absolute', left: 0, top: 0, width: 56, height: 56, marginLeft: -28, marginTop: -28, borderRadius: '50%', border: `2.5px solid ${STEEL}`, boxShadow: `0 0 16px ${STEEL}aa` }}
      />
      {/* Hard steel glint */}
      <motion.div
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: 1, opacity: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        style={{ position: 'absolute', left: 0, top: 0, width: 32, height: 32, marginLeft: -16, marginTop: -16, borderRadius: '50%', background: `radial-gradient(circle, #fff 0%, ${STEEL}cc 48%, transparent 72%)` }}
      />
      {/* Deflected sparks */}
      {sparks.map((s, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: s.dur, ease: 'easeOut' }}
          style={{ position: 'absolute', left: 0, top: 0, width: s.size, height: s.size, marginLeft: -s.size / 2, marginTop: -s.size / 2, borderRadius: '50%', background: STEEL, boxShadow: `0 0 5px ${STEEL}` }}
        />
      ))}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

// HP bar with an OPTIONAL absorb-shield folded into the SAME row: the shield
// (player's Abyssal Tide / Stormward buffer, or an enemy Warded/Warding
// barrier) renders as a distinct-colored segment filling the gap just past
// the HP fill (reads as temporary bonus HP), plus a small inline chip on the
// number line. No separate stacked bar — keeps the nameplate to one row.
// One shield, one colour, one number. The multi-segment variant is gone with
// the typed player layers it existed for: both bars now carry a single pool,
// the player's in cyan and the enemy's barrier in purple.
function HPBar({ current, max, accent, compact, shield = 0, shieldColor = '#7dd3fc', shieldGradTo = '#5eead4', hidden = false }: { current: number; max: number; accent: string; compact?: boolean; shield?: number; shieldColor?: string; shieldGradTo?: string; hidden?: boolean }) {
  // OVERHEAL, split off the top. Field Repairs and Engorge let heals fill past
  // max, and the bar used to clamp the fill at 100% while the text printed the
  // raw pair — so a 223 hull healed to 256 read "256/223", which looks like a
  // bug, over a bar that had not moved since full. The buffer was invisible
  // until it silently ate a hit.
  //
  // It is a temporary pool sitting above your health that soaks damage and is
  // shed at fight end, which is exactly what the shield segments already model,
  // so it rides as one of them rather than as a new idea.
  const over = Math.max(0, current - max)
  const base = Math.min(current, max)
  // MEASURE AGAINST THE EXTENDED TOTAL when overhealed. Overheal only exists
  // while health is FULL, so against `max` the health fill takes the whole bar,
  // leaving zero room and scaling the overheal segment to nothing — invisible,
  // which is the very bug this is fixing. Widening the denominator lets health
  // and the buffer share the bar proportionally.
  const denom = Math.max(1, max + over)
  const pct = hidden ? 0 : Math.max(0, Math.min(100, (base / denom) * 100))
  // Shield can be a single pool (enemy barrier) OR typed segments (the player's
  // amber boon layer + cyan crew-ability layer), so each source reads distinctly.
  // Overheal leads the strip: it sits directly on top of the health it exceeds.
  const segs = [
    ...(over > 0 && !hidden ? [{ hp: over, color: '#8ee6a8', gradTo: '#4ade80' }] : []),
    ...(shield > 0 ? [{ hp: shield, color: shieldColor, gradTo: shieldGradTo }] : []),
  ]
  const totalShield = segs.reduce((s, x) => s + x.hp, 0)
  // Cap the whole shield strip to the empty hull space (scaling the segments
  // together) so the bar never overflows; the chips still show the true amounts.
  const availPct = Math.max(0, 100 - pct)
  const rawPct = (totalShield / denom) * 100
  const segScale = rawPct > availPct && rawPct > 0 ? availPct / rawPct : 1
  const h = compact ? 8 : 10
  let off = pct
  return (
    <div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#7a8aa0' }}>HP</p>
          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: hidden ? '#8a95aa' : accent }}>
            {/* OVERHEAL MARKS THE NUMBER, it does not add one. A trailing
                "+33" was a third element that appeared and vanished mid-fight,
                so the row changed width every time the buffer came and went.
                The pair keeps its shape and the current figure goes green and
                lit instead — same characters, same layout, and the colour
                matches its band on the bar so the two read as one thing. */}
            {hidden ? '???' : (
              <>
                <span style={over > 0 ? { color: '#8ee6a8', textShadow: '0 0 7px rgba(74,222,128,0.75)' } : undefined}>{current}</span>
                <span>/{max}</span>
              </>
            )}
          </p>
        </div>
      )}
      <div style={{ position: 'relative', height: h, background: 'rgba(0,0,0,0.6)', borderRadius: 4, overflow: 'hidden' }}>
        {hidden ? (
          // Shrouded Hull — a fogged bar, no fill, so the hull's state is unreadable.
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(45deg, rgba(110,120,140,0.32) 0 5px, rgba(56,66,86,0.32) 5px 10px)' }} />
        ) : (
          <>
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: accent, borderRadius: 4, transition: 'width 0.4s ease' }} />
            {segs.map((s, i) => {
              const w = (s.hp / denom) * 100 * segScale
              const left = off; off += w
              return <div key={i} style={{ position: 'absolute', top: 0, bottom: 0, left: `${left}%`, width: `${w}%`, background: `linear-gradient(90deg, ${s.color}, ${s.gradTo})`, boxShadow: `0 0 6px ${s.color}aa`, transition: 'width 0.35s ease, left 0.4s ease' }} />
            })}
          </>
        )}
      </div>
      {compact && (
        <div style={{ display: 'flex', justifyContent: segs.length > 0 ? 'space-between' : 'flex-end', alignItems: 'center', marginTop: 3 }}>
          {segs.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
              {segs.map((s, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill={s.color} aria-hidden style={{ filter: `drop-shadow(0 0 2px ${s.color})` }}>
                    <path d="M12 2 4 5v6c0 5 3.4 8.6 8 11 4.6-2.4 8-6 8-11V5z" />
                  </svg>
                  <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: s.color, lineHeight: 1 }}>{s.hp}</span>
                </span>
              ))}
            </span>
          )}
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: hidden ? '#8a95aa' : accent }}>{hidden ? '???' : `${current}/${max}`}</p>
        </div>
      )}
    </div>
  )
}

// ── Status icons ─────────────────────────────────────────────────────────────
// Drawn stroke icons for every status + bespoke effect. NO text glyphs/emoji:
// several of the old characters (⌛ ⚔ ❤ 🔥 ⚓ ❄) take emoji presentation on
// iOS and broke the no-emoji-icons rule. One component, keyed by the status
// id (or bespoke key), inheriting the chip's color via currentColor.
// ── The Last Wall ring (aegis) ───────────────────────────────────────────────
// Pale rampart aura hugging the enemy hull while the wall stands. Gradient +
// opacity/transform only — no blur/mixBlendMode (persistent-element perf rule).
// The AnimatePresence exit (scale up + fade) doubles as the shatter beat.
function AegisWallRing() {
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.35 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      style={{ position: 'absolute', inset: '-14% -9%', zIndex: 2, pointerEvents: 'none' }}
    >
      <motion.div
        animate={{ opacity: [0.55, 0.95, 0.55] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          border: '1px solid rgba(232,216,168,0.45)',
          background: 'radial-gradient(ellipse at center, rgba(232,216,168,0) 50%, rgba(232,216,168,0.10) 66%, rgba(232,216,168,0.30) 82%, rgba(232,216,168,0) 100%)',
        }}
      />
    </motion.div>
  )
}

function StatusGlyph({ icon, size = 10 }: { icon: string; size?: number }) {
  const P = (d: string, extra?: React.ReactNode) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d={d} />{extra}
    </svg>
  )
  switch (icon) {
    case 'weaken':  return P('M12 4v14M6 12l6 7 6-7')                                                    // arrow driven down
    case 'feeble':  return P('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z', <path d="M12 7.5l-2 3.2h4l-2 3.2" />)  // cracked shield
    case 'marked':  return P('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3', <circle cx="12" cy="12" r="6" />)  // target reticle (Requiem)
    case 'slowed':  return P('M7 3h10M7 21h10M8 3c0 4.2 3 5.4 4 6.6 1-1.2 4-2.4 4-6.6M8 21c0-4.2 3-5.4 4-6.6 1 1.2 4 2.4 4 6.6') // hourglass
    case 'silence': return P('M6.2 6.2l11.6 11.6', <circle cx="12" cy="12" r="8.5" />)                   // barred circle
    case 'corrode': return P('M12 4c3.2 4.2 5 6.6 5 9.2a5 5 0 0 1-10 0C7 10.6 8.8 8.2 12 4z')            // acid drop
    case 'fortify': return P('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z')                       // whole shield
    case 'enrage':  return P('M5 19L16.5 7.5M19 5l-2.5 2.5M16.5 7.5L13 6.5M16.5 7.5l1 3.5M7 15l2 2')     // striking blade
    case 'regen':   return P('M12 20s-7-4.4-9-8.8C1.8 8.4 3.6 5.2 6.8 5.2c2 0 3.5 1.2 5.2 3.3 1.7-2.1 3.2-3.3 5.2-3.3 3.2 0 5 3.2 3.8 6C19 15.6 12 20 12 20z') // heart
    case 'burn':    return P('M12 2.5c4 4 6 7 6 10.3A6 6 0 0 1 6 12.8C6 9.5 8 6.5 12 2.5z', <path d="M12 11.5c1.6 1.7 1.6 3.4 0 5.1-1.6-1.7-1.6-3.4 0-5.1z" />) // flame
    case 'freeze':  return P('M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17')                                     // snowflake
    case 'snare':   return P('M12 7.2v12.3M8.3 10h7.4M5 13.6c.5 3.7 3.3 5.9 7 5.9s6.5-2.2 7-5.9', <circle cx="12" cy="4.8" r="2" />) // anchor
    case 'aegis':   return P('M4 6.5h16v11H4z', <path d="M4 12h16M9 6.5V12M15 12v5.5" />)                // brick wall
    case 'ward':    return P('M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z', <path d="M12 8v6M9.2 10.4h5.6" />) // shield + cross (Laz's ward)
    case 'aim':     return P('M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4', <circle cx="12" cy="12" r="4.5" />) // crosshair (aim afflictions)
    case 'brace':   return P('M9 5H5V9M15 5H19V9M19 15V19H15M9 19H5V15')                                  // iron-clamp corner brackets (Anchor brace — a damage cut, not a shield)
    default:        return P('M12 5v14M5 12h14')
  }
}

// ── Conditions section (stats popups) ────────────────────────────────────────
// The chip row under each HP bar answers "what's on me"; this section in the
// player/enemy stats popups answers "what does it DO" — full name + plain
// description + turns left, for the Ch4 pipeline statuses AND the bespoke
// elemental effects (burn / freeze / snare), which players asked to see
// explained in the same place.
interface ConditionItem { key: string; name: string; color: string; turns?: number; desc: string }
function statusConditions(statuses: ActiveStatus[]): ConditionItem[] {
  return statuses.map(s => {
    const d = STATUS_DEFS[s.id]
    return { key: s.id, name: d.name, color: d.color, turns: s.turnsLeft, desc: d.describe(s.magnitude) }
  })
}
function ConditionsSection({ conditions }: { conditions: ConditionItem[] }) {
  if (conditions.length === 0) return null
  return (
    <div>
      <p className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', color: '#c084fc', letterSpacing: '0.14em', marginBottom: 5 }}>
        {conditions.length > 1 ? `Conditions · ${conditions.length}` : 'Condition'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {conditions.map(c => (
          <div key={c.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '0.55rem 0.65rem', background: `${c.color}10`, border: `1px solid ${c.color}44`, borderRadius: 10 }}>
            <span aria-hidden style={{ width: 22, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: `${c.color}1f`, border: `1px solid ${c.color}66`, color: c.color }}>
              <StatusGlyph icon={c.key} size={12} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: c.color, lineHeight: 1.2 }}>
                {c.name}{c.turns != null && <span style={{ color: 'rgba(240,237,232,0.55)' }}> · {c.turns} turn{c.turns === 1 ? '' : 's'} left</span>}
              </p>
              <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.72)', lineHeight: 1.4, marginTop: 2 }}>{c.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Status badges (Ch4 pipeline) ─────────────────────────────────────────────
// One tiny chip per active status: glyph + turns-left, green-family for buffs
// and red/purple-family for debuffs. Renders under each side's HP bar. The
// bespoke effects (burn / freeze / snare) pass in as extra chips so the player
// reads ONE coherent status row, even though their mechanics stay bespoke.
interface BespokeChip { key: string; color: string; turns?: number; title: string; tone?: 'buff' | 'debuff' }
function StatusBadgesRow({ statuses, bespoke = [] }: { statuses: ActiveStatus[]; bespoke?: BespokeChip[] }) {
  if (statuses.length === 0 && bespoke.length === 0) return null
  // Icons are drawn SVGs keyed by the status id / bespoke key — never text
  // glyphs (several took emoji presentation on iOS; see StatusGlyph).
  const chip = (key: string, color: string, tone: 'buff' | 'debuff', turns: number | undefined, title: string) => (
    <motion.span key={key} title={title}
      initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 22 }}
      className="font-karla font-800"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 2,
        padding: '0 5px', height: 16, borderRadius: 999, fontSize: '0.56rem', lineHeight: 1,
        color, background: `${color}1c`, border: `1px solid ${color}${tone === 'buff' ? '66' : '88'}`,
      }}>
      <StatusGlyph icon={key} size={9} />
      {turns != null && <span>{turns}</span>}
    </motion.span>
  )
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
      {statuses.map(s => {
        const def = STATUS_DEFS[s.id]
        return chip(s.id, def.color, def.tone, s.turnsLeft, `${def.name} — ${def.describe(s.magnitude)} (${s.turnsLeft} turn${s.turnsLeft === 1 ? '' : 's'})`)
      })}
      {bespoke.map(b => chip(b.key, b.color, b.tone ?? 'debuff', b.turns, b.title))}
    </div>
  )
}

function ChargesRow({ charges, max, small, hidden = false, readyGlow = null }: {
  charges: number; max: number; small?: boolean; hidden?: boolean
  /** When set (the Mega is charged), every filled pip recolors to this and
   *  pulses — the whole magazine reads as "the ultimate is READY". Scale-only
   *  animation on purpose: animating box-shadow repaints on the main thread
   *  and stutters the aim RAF (see the phase-2 aim-lag fix). */
  readyGlow?: string | null
}) {
  const dotSize = small ? 12 : 16
  // Track the prior count so a freshly-loaded cannonball "clicks in" — the new
  // pip pops from nothing with a brief overshoot. prevRef lags one render
  // (updated in the effect), so on the render where charges climbs, the added
  // pips read as just-filled.
  const prevRef = useRef(charges)
  const prev = prevRef.current
  useEffect(() => { prevRef.current = charges }, [charges])
  // Shuttered Ports — pips read as identical "?" markers so the loaded count
  // can't be told apart.
  if (hidden) {
    return (
      <div style={{ display: 'flex', gap: small ? 4 : 5, marginTop: small ? 5 : 7 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: '#1c2540', border: '1px dashed #4a5570', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="font-karla font-800" style={{ fontSize: dotSize * 0.6, color: '#6a7590', lineHeight: 1 }}>?</span>
          </div>
        ))}
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: small ? 4 : 5, marginTop: small ? 5 : 7 }}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < charges
        const justLoaded = filled && i >= prev
        const ready = filled && !!readyGlow
        return (
          <motion.div
            key={i}
            initial={false}
            // Ready state wins: a slow breathing pulse across the whole
            // magazine (staggered per pip so it reads as a wave). The
            // just-loaded pop only plays when not in the ready state — the
            // pulse taking over IS the arrival moment for the final pip.
            animate={ready
              ? { scale: [1, 1.22, 1] }
              : justLoaded ? { scale: [0.2, 1.35, 1] } : { scale: 1 }}
            transition={ready
              ? { duration: 1.1, repeat: Infinity, ease: 'easeInOut', delay: i * 0.09 }
              : justLoaded ? { duration: 0.4, ease: 'easeOut' } : { duration: 0 }}
            style={{
              width: dotSize, height: dotSize, borderRadius: '50%',
              background: ready ? readyGlow! : filled ? '#fbbf24' : '#1c2540',
              border: `1px solid ${ready ? '#ffffffaa' : filled ? '#fbbf24' : '#3a4560'}`,
              boxShadow: ready
                ? `0 0 ${small ? 9 : 12}px ${readyGlow}, 0 0 ${small ? 16 : 22}px ${readyGlow}88`
                : filled ? `0 0 ${small ? 5 : 7}px rgba(251,191,36,0.55)` : 'none',
            }}
          />
        )
      })}
    </div>
  )
}

function HitsplatOverlay({ text, color, big, volley }: { text: string; color: string; big?: boolean; volley?: boolean }) {
  // MMO-style floating numbers: bold, outlined, glowing text — NO background
  // bubble. The dark stroke keeps them legible over bright ship art, the glow
  // sells the hit, and magnitude drives the font so a chip and a haymaker read
  // very differently. Crit (big) is the gold italic haymaker; volley is the
  // heavier-than-normal 3-shot burst (bigger, a fiery edge, a punch-in).
  const dmgMatch = /^-?(\d+)$/.exec(text)
  const dmg = dmgMatch ? Number(dmgMatch[1]) : null
  const isVolley = !!volley && !big
  // WHERE THIS ONE IS THROWN, decided once. The component is keyed on the
  // splat, so it mounts fresh for every hit and a ref is a per-hit constant —
  // rolling it in render would re-throw the number on every frame it painted.
  const throwRef = useRef<number | null>(null)
  if (throwRef.current === null) throwRef.current = (Math.random() - 0.5) * 2
  // A FIVE-FIGURE HIT IS A LANDMARK, so it stops looking like a four-figure one.
  // Median raid damage in the live data is 42 and the best raid hit ever landed
  // is 3,500; five figures happens only deep in a Gauntlet run. Exactly one
  // captain has ever done it (14,808). Worth its own moment.
  const huge = dmg != null && dmg >= HUGE_HIT
  // The old curve was `min(1.7, dmg / 45)`, which pinned at its ceiling by 77
  // damage. Everything from there up rendered identically: a 100 and a 14,808
  // were the same number on screen, which is the actual reason big hits stopped
  // feeling big. Below that it is unchanged (most hits live there); above it a
  // log curve keeps breathing without running off the screen -- 760 reads 2.0,
  // 7,600 reads 2.3, and it tops out just past that.
  const mag = dmg == null ? 1
    : dmg <= 76 ? Math.max(0.9, dmg / 45)
    : Math.min(2.35, 1.7 + Math.log10(dmg / 76) * 0.3)
  const scaleMult = big ? mag * 1.22 : isVolley ? mag * 1.1 : mag
  // A HAYMAKER IS THROWN FURTHER. The lateral spread is what stops a rapid
  // exchange stacking into one column; the rise is the arc's peak, and a huge
  // hit deliberately rises LESS — it should read as heavy, not as lifting.
  const throwX = throwRef.current * (huge ? 26 : big ? 52 : isVolley ? 44 : 36)
  const rise = huge ? -24 : big ? -42 : -34
  const baseFontPx = big ? 32 : isVolley ? 27 : 23
  const fontPx     = Math.round(baseFontPx * scaleMult)
  // Outline via a tight 8-way dark shadow ring (smoother on serif glyphs than
  // WebkitTextStroke, which blobs on Cinzel's thin strokes), then a colored
  // glow + soft drop for depth.
  const o = huge ? 1.1 : big ? 0.9 : isVolley ? 0.8 : 0.7
  const ring = [
    `${o}px ${o}px 0 #0b0e14`, `-${o}px ${o}px 0 #0b0e14`,
    `${o}px -${o}px 0 #0b0e14`, `-${o}px -${o}px 0 #0b0e14`,
    `0 ${o}px 0 #0b0e14`, `0 -${o}px 0 #0b0e14`,
    `${o}px 0 0 #0b0e14`, `-${o}px 0 0 #0b0e14`,
  ].join(', ')
  const glow = huge
    // White-hot core under the damage colour, then two blooms. It reads as the
    // number being too bright to hold its own edges.
    ? `${ring}, 0 0 6px #fff, 0 2px 6px rgba(0,0,0,0.6), 0 0 18px ${color}, 0 0 44px ${color}cc`
    : big
    ? `${ring}, 0 2px 5px rgba(0,0,0,0.55), 0 0 13px ${color}, 0 0 28px ${color}bb`
    : isVolley
      // Fiery edge — a warm bloom layered under the damage color so a volley
      // reads hot, distinct from a plain single shot.
      ? `${ring}, 0 2px 5px rgba(0,0,0,0.55), 0 0 11px ${color}, 0 0 20px rgba(255,150,60,0.7)`
      : `${ring}, 0 1px 4px rgba(0,0,0,0.55), 0 0 9px ${color}99`
  return (
    <>
      {/* Crit haymaker gets an MMO-style burst behind it — a star pop, an
          expanding ring, and radiating sparks in the number's color. */}
      {big && <CritFlare color={color} />}
      {huge && <HugeHitRing color={color} />}
      {/* CENTRING LIVES OUT HERE NOW, on a plain wrapper, so the number inside
          is free to animate `x` in pixels. It used to hold `x: '-50%'` through
          every keyframe purely to stay centred, which meant the one axis a
          thrown thing most needs was spoken for. */}
      <div style={{ position: 'absolute', left: '50%', top: '38%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 10 }}>
      <motion.div
        // Crits + volleys punch IN (start oversized, settle to 1); normal hits
        // grow in. Monotonic scale = no overshoot bounce that reads as flicker.
        // Crits add a quick rotate-punch.
        // A huge hit lands HARDER and then HANGS. It punches in from further
        // out, barely drifts (weight, not lift), and leaves slowly, so the
        // number you waited a whole run for is legible long enough to read.
        //
        // ── AND IT IS THROWN, NOT RAISED ──────────────────────────────────
        //
        // It rose dead vertically, which is why a fast exchange looked like one
        // number blinking in place: every hit took the identical path off the
        // same point. Now each is thrown clear of the hull on its own heading
        // and arcs over — up fast, then easing into a fall — so two hits half a
        // second apart are visibly two hits. The heading is per-splat and
        // random, and the arc's peak scales with the blow: a haymaker is thrown
        // further than a chip.
        initial={{ opacity: 0, x: 0, y: 2, scale: huge ? 2.1 : big ? 1.62 : isVolley ? 1.3 : 0.55, rotate: huge ? -4 : big ? -7 : 0 }}
        animate={{
          opacity: 1,
          x: throwX,
          // Up, over, and starting down. The last value is the top of the fall
          // rather than the bottom: `exit` carries it the rest of the way, so
          // the number never hangs at the top of its arc looking weightless.
          y: [2, rise, rise + 7],
          scale: 1,
          rotate: 0,
        }}
        exit={{ opacity: 0, x: throwX * 1.5, y: rise + 26, scale: huge ? 1.16 : big ? 1.1 : 0.92 }}
        transition={{
          opacity: { duration: huge ? 0.1 : 0.14 },
          x:       { duration: huge ? 0.7 : 0.5, ease: [0.16, 0.9, 0.3, 1] },
          y:       { duration: huge ? 0.62 : 0.42, times: [0, 0.62, 1], ease: [0.22, 1, 0.36, 1] },
          scale:   { duration: huge ? 0.3 : big ? 0.2 : isVolley ? 0.22 : 0.26, ease: [0.2, 1.1, 0.4, 1] },
          rotate:  { duration: 0.28, ease: [0.2, 1.15, 0.4, 1] },
        }}
        style={{
          pointerEvents: 'none',
          color,
          fontFamily: 'var(--font-cinzel)', fontWeight: 800,
          fontStyle: big ? 'italic' : 'normal',
          fontSize: `${fontPx}px`, lineHeight: 1, letterSpacing: isVolley ? '0.02em' : '0.01em',
          textShadow: glow,
          whiteSpace: 'nowrap',
        }}
      >
        {/* THE HOUSE ABBREVIATION, not a new one. compact() gives four figures
            separators (3,500), five figures a k (14.8k) and seven an M (1.24M),
            and the Gauntlet's pot readout sitting directly above this combat
            already uses it at exactly those thresholds. A splat reading 14,808
            beside a pot reading 14.8k was the inconsistency. The k is also
            shorter, so the number can carry the bigger type without crowding,
            and the suffix is itself a badge of magnitude. The exact figure is
            not lost: gauntlet_max_hit and highest_raid_damage still record it
            to the digit, and the records screens print it in full. */}
        {text.replace(/\d{4,}/g, n => compact(Number(n)))}
      </motion.div>
      </div>
    </>
  )
}

/** Five figures and up. See HUGE_HIT. */
const HUGE_HIT = 10_000

// A five-figure hit gets a shockwave the crit burst does not: one hard ring
// thrown outward and a slower second behind it. Localized to the number's
// anchor and nowhere near the screen edges, per the house rule that juice stays
// small and local -- no screen shake, however big the number is.
function HugeHitRing({ color }: { color: string }) {
  return (
    <div aria-hidden style={{ position: 'absolute', left: '50%', top: '38%', zIndex: 8, pointerEvents: 'none' }}>
      {[0, 1].map(i => (
        <motion.div key={i}
          initial={{ opacity: 0.85, scale: 0.2 }}
          animate={{ opacity: 0, scale: i === 0 ? 3.4 : 4.6 }}
          transition={{ duration: i === 0 ? 0.5 : 0.72, delay: i * 0.09, ease: [0.16, 1, 0.3, 1] }}
          style={{
            position: 'absolute', left: -34, top: -34, width: 68, height: 68,
            borderRadius: '50%', border: `2px solid ${color}`,
            boxShadow: `0 0 14px ${color}aa, inset 0 0 10px ${color}66`,
          }} />
      ))}
    </div>
  )
}

// Crit burst — a star flash, an expanding ring, and radiating sparks centered on
// the number's anchor. Purely decorative; unmounts with its parent hitsplat.
function CritFlare({ color }: { color: string }) {
  const sparks = useMemo(() => Array.from({ length: 10 }, (_, i) => {
    const ang = (Math.PI * 2 * i) / 10 + (i % 2) * 0.32
    const dist = 30 + (i % 3) * 13
    return { x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, size: 3 + (i % 2) * 2, dur: 0.42 + (i % 3) * 0.09 }
  }), [])
  return (
    <div aria-hidden style={{ position: 'absolute', left: '50%', top: '38%', zIndex: 9, pointerEvents: 'none' }}>
      {/* expanding shock ring */}
      <motion.span initial={{ scale: 0.4, opacity: 0.85 }} animate={{ scale: 2.5, opacity: 0 }} transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{ position: 'absolute', left: -26, top: -26, width: 52, height: 52, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}` }} />
      {/* white core star */}
      <motion.span initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.5, opacity: 0 }} transition={{ duration: 0.32, ease: 'easeOut' }}
        style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: `0 0 10px #fff, 0 0 20px ${color}` }} />
      {sparks.map((s, i) => (
        <motion.span key={i} initial={{ x: 0, y: 0, opacity: 1, scale: 1 }} animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.3 }} transition={{ duration: s.dur, ease: 'easeOut' }}
          style={{ position: 'absolute', left: 0, top: 0, width: s.size, height: s.size, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }} />
      ))}
    </div>
  )
}

// One floating number for a single Frenzy barrage shot. Lighter than the full
// HitsplatOverlay (many can be on screen at once); each drifts up + fades and is
// removed by its own timer, and dx scatters them across the hull.
function BarrageSplat({ text, dx, crit, color: colorProp }: { text: string; dx: number; crit?: boolean; color?: string }) {
  const color = colorProp ?? (crit ? '#fbbf24' : '#f87171')
  return (
    <motion.div
      initial={{ opacity: 0, x: '-50%', y: 4, scale: 0.55 }}
      animate={{ opacity: [0, 1, 1, 0], x: '-50%', y: -32, scale: 1 }}
      transition={{ duration: 0.62, ease: [0.22, 1, 0.36, 1], opacity: { duration: 0.62, times: [0, 0.16, 0.68, 1] } }}
      style={{
        position: 'absolute', left: `calc(50% + ${dx}px)`, top: '40%',
        pointerEvents: 'none', zIndex: 10, color,
        fontFamily: 'var(--font-cinzel)', fontWeight: 800, fontSize: '19px', lineHeight: 1,
        textShadow: `1px 1px 0 #0b0e14, -1px 1px 0 #0b0e14, 1px -1px 0 #0b0e14, -1px -1px 0 #0b0e14, 0 0 8px ${color}99`,
        whiteSpace: 'nowrap',
      }}
    >{text}</motion.div>
  )
}

// Enemy status aura — a brief themed glow + drifting motes over the hull when
// a burn or freeze status ticks. Burn = embers rising; freeze = cold rime
// settling. Localized to the enemy ship, fades on its own.
function EnemyStatusAura({ kind, color: colorOverride }: { kind: 'burn' | 'freeze' | 'snared' | 'foresee' | 'marked' | 'stunned' | 'stolen'; color?: string }) {
  const burn = kind === 'burn'
  const snared = kind === 'snared'
  const foresee = kind === 'foresee'
  const marked = kind === 'marked'
  const stunned = kind === 'stunned'   // Kraken's Grip — a SEIZING, not an icing
  const stolen  = kind === 'stolen'    // Press-Gang — shot ripped off its rack
  const color = colorOverride ?? (burn ? '#fb923c' : snared ? '#d9b066' : foresee ? '#8b7bf0' : marked ? '#f43f5e' : stunned ? '#c9b6ff' : stolen ? '#f5c542' : '#7dd3fc')
  const moteColor = colorOverride ?? (burn ? '#ffd27a' : snared ? '#f0d79a' : foresee ? '#cfc4ff' : marked ? '#ffa8b8' : stunned ? '#efe6ff' : stolen ? '#ffe9a8' : '#e0f4ff')
  const motes = useMemo(() => Array.from({ length: snared ? 8 : stolen ? 7 : 6 }, (_, n) => ({
    // snare = motes clamp INWARD (a tightening net); burn rises, rime drifts down.
    // stolen = they stream LEFT, off the enemy toward your rack.
    x: stolen ? -(26 + Math.random() * 40) : snared ? (Math.random() - 0.5) * 52 : (Math.random() - 0.5) * 46,
    y: stolen ? (Math.random() - 0.5) * 22 : snared ? (Math.random() - 0.5) * 40 : (burn ? -1 : 1) * (12 + Math.random() * 26),
    size: 3 + Math.random() * 3,
    delay: Math.random() * 0.12,
    dur: 0.6 + Math.random() * 0.3,
    inward: snared,
  }) ), [burn, snared, stolen])
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.85, times: [0, 0.2, 0.7, 1] }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
    >
      {/* Hull wash */}
      <div style={{
        position: 'absolute', inset: '-6%', borderRadius: '46%', mixBlendMode: 'screen',
        background: `radial-gradient(ellipse at center, ${color}aa 0%, ${color}44 42%, transparent 70%)`,
      }} />
      {/* Stunned — a hard concussive shock: one fast shockwave punching out,
          then dazed sparks wheeling over the hull. Nothing icy about it, so a
          stun can never be mistaken for a freeze. */}
      {stunned && (
        <>
          <motion.div
            initial={{ scale: 0.25, opacity: 0.95 }} animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 0.42, ease: 'easeOut' }}
            style={{ position: 'absolute', left: '50%', top: '48%', width: 62, height: 62, marginLeft: -31, marginTop: -31, borderRadius: '50%', border: `3px solid ${color}`, boxShadow: `0 0 22px ${color}` }}
          />
          {[0, 1, 2].map(n => (
            <motion.span key={`st${n}`} aria-hidden
              initial={{ rotate: n * 120, opacity: 0 }}
              animate={{ rotate: n * 120 + 300, opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.85, times: [0, 0.2, 0.7, 1], ease: 'linear' }}
              style={{ position: 'absolute', left: '50%', top: '26%', width: 34, height: 34, marginLeft: -17, transformOrigin: '50% 120%' }}>
              <span style={{ position: 'absolute', left: 0, top: 0, width: 7, height: 7, borderRadius: '50%', background: moteColor, boxShadow: `0 0 10px ${color}` }} />
            </motion.span>
          ))}
        </>
      )}
      {/* Stolen — the rack is robbed: a snatch-arc whipping off toward your
          side, with the shot motes streaming after it. */}
      {stolen && (
        <motion.div
          initial={{ x: 6, opacity: 0 }} animate={{ x: -30, opacity: [0, 1, 0] }}
          transition={{ duration: 0.6, times: [0, 0.3, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', left: '38%', top: '44%', width: 30, height: 12, borderRadius: '50%', border: `2px solid ${color}`, borderRightColor: 'transparent', borderTopColor: 'transparent', boxShadow: `0 0 14px ${color}aa` }}
        />
      )}
      {/* Foresee — concentric scan rings sweeping the enemy hull, like an eye
          opening to read its next move (Oracle). */}
      {foresee && [0, 1].map(n => (
        <motion.div key={`fr${n}`}
          initial={{ scale: 0.3, opacity: 0.85 }} animate={{ scale: 2.4, opacity: 0 }}
          transition={{ duration: 0.8, delay: n * 0.16, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '46%', top: '50%', width: 56, height: 56,
            marginLeft: -28, marginTop: -28, borderRadius: '50%',
            border: `2px solid ${color}`, boxShadow: `0 0 16px ${color}aa`,
          }}
        />
      ))}
      {/* Marked (Requiem) — reticle rings CONVERGE onto the hull, like a
          crosshair locking a bounty, then a crimson crosshair snaps in. */}
      {marked && [0, 1].map(n => (
        <motion.div key={`mk${n}`}
          initial={{ scale: 2.2, opacity: 0 }} animate={{ scale: 0.6, opacity: [0, 0.9, 0] }}
          transition={{ duration: 0.7, delay: n * 0.14, ease: 'easeIn' }}
          style={{
            position: 'absolute', left: '46%', top: '50%', width: 60, height: 60,
            marginLeft: -30, marginTop: -30, borderRadius: '50%',
            border: `2px solid ${color}`, boxShadow: `0 0 16px ${color}aa`,
          }}
        />
      ))}
      {marked && (
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: [0, 1, 0] }}
          transition={{ duration: 0.85, times: [0, 0.4, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', left: '46%', top: '50%', width: 34, height: 34, marginLeft: -17, marginTop: -17 }}
        >
          <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 5px ${color})` }}>
            <circle cx="12" cy="12" r="7" /><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
          </svg>
        </motion.div>
      )}
      {/* Drifting motes — snare clamps inward, burn/freeze/foresee drift outward */}
      {motes.map((m, n) => (
        <motion.div
          key={n}
          initial={{ x: m.inward ? m.x : 0, y: m.inward ? m.y : 0, opacity: 0 }}
          animate={{ x: m.inward ? 0 : m.x, y: m.inward ? 0 : m.y, opacity: [0, 1, 0] }}
          transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '46%', top: '52%', width: m.size, height: m.size,
            marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%',
            background: moteColor, boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </motion.div>
  )
}

// Thermal Shock confluence detonation — the signature ice+fire moment. A white
// core flash, an expanding shockwave ring, a warm fire bloom, and a spray of
// cyan ice shards flung outward as the frozen hull cracks apart in the heat.
// One-shot, ~0.75s, localized to the enemy hull. Transform/opacity only.
function ThermalShockBurst() {
  const ICE = '#a5f3fc'
  const FIRE = '#fb923c'
  const shards = useMemo(() => Array.from({ length: 11 }, (_, n) => {
    const ang = (Math.PI * 2 * n) / 11 + (n % 2) * 0.4
    const dist = 40 + (n % 4) * 16
    return { id: n, x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, rot: (n * 57) % 360, dur: 0.5 + (n % 3) * 0.12, delay: (n % 4) * 0.018, len: 7 + (n % 3) * 4 }
  }), [])
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6, overflow: 'visible' }}>
      {/* White-hot core flash */}
      <motion.div initial={{ scale: 0.3, opacity: 0.95 }} animate={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.32, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '46%', top: '50%', width: 96, height: 96, marginLeft: -48, marginTop: -48, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${FIRE}cc 36%, ${ICE}66 60%, transparent 74%)`, mixBlendMode: 'screen' }} />
      {/* Shockwave ring — ice rim, fire glow */}
      <motion.div initial={{ scale: 0.3, opacity: 0.9 }} animate={{ scale: 2.6, opacity: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '46%', top: '50%', width: 70, height: 70, marginLeft: -35, marginTop: -35, borderRadius: '50%', border: `2.5px solid ${ICE}`, boxShadow: `0 0 18px ${ICE}, inset 0 0 14px ${FIRE}aa` }} />
      {/* Fire bloom lingering in the center */}
      <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: [0.5, 1.3, 1], opacity: [0, 0.85, 0] }} transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '46%', top: '50%', width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: '50%', background: `radial-gradient(circle, ${FIRE}cc 0%, ${FIRE}44 44%, transparent 70%)`, mixBlendMode: 'screen' }} />
      {/* Ice shards flung outward */}
      {shards.map(s => (
        <motion.div key={s.id}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
          animate={{ x: s.x, y: s.y, opacity: [0, 1, 0], scale: 1 }}
          transition={{ duration: s.dur, delay: s.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '46%', top: '50%', width: 2.5, height: s.len, marginLeft: -1.25, marginTop: -s.len / 2, borderRadius: 2, background: `linear-gradient(${ICE}, #ffffff)`, boxShadow: `0 0 6px ${ICE}`, transform: `rotate(${s.rot}deg)` }}
        />
      ))}
    </div>
  )
}

// Persistent battle-damage tell on a ship, scaled by HP. Below 60% a wisp of
// smoke starts; it thickens and darkens as the hull fails. Transform/opacity-
// only CSS (no filters on the per-frame-bobbing ship) for iOS PWA headroom.
// `flip` mirrors the smoke drift to match which way the ship faces.
function ShipDamageFX({ hpPct, flip = false }: { hpPct: number; flip?: boolean }) {
  if (hpPct >= 60) return null
  const d = Math.max(0, Math.min(1, (60 - hpPct) / 60)) // 0 at 60% HP → 1 at 0%
  const heavy = hpPct < 22
  const sign = flip ? -1 : 1
  const k = flip ? 'l' : 'r'
  // 2nd/3rd smoke columns fade in as the damage deepens, so it's a smooth slide.
  const puffs = [
    { left: '44%', size: 26, dur: 2.6, delay: 0,   base: 0.34, vis: 1 },
    { left: '54%', size: 32, dur: 3.1, delay: 0.9, base: 0.40, vis: Math.max(0, (d - 0.3) / 0.7) },
    { left: '48%', size: 22, dur: 2.9, delay: 1.7, base: 0.30, vis: Math.max(0, (d - 0.55) / 0.45) },
  ]
  return (
    <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}>
      <style>{`
        @keyframes ship-smoke-${k} { 0% { transform: translate(0,0) scale(0.5); opacity: 0; } 18% { opacity: 1; } 100% { transform: translate(${sign * 26}px, -54px) scale(1.8); opacity: 0; } }
      `}</style>
      {puffs.map((p, i) => p.vis <= 0 ? null : (
        <div key={i} style={{
          position: 'absolute', left: p.left, top: '32%', width: p.size, height: p.size, marginLeft: -p.size / 2, borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${heavy ? '46,43,48' : '66,66,72'},${(p.base * (0.5 + 0.5 * d) * p.vis).toFixed(2)}) 0%, transparent 68%)`,
          animation: `ship-smoke-${k} ${p.dur}s ease-out ${p.delay}s infinite`,
        }} />
      ))}
    </div>
  )
}

// Persistent enemy status — a low ambient tell that lingers between the
// activation flare and the tick/skip. Burning: a base ember glow + slow rising
// embers. Frozen: a cyan frost tint over the hull.
function ShipStatusAura({ burning, frozen, paused }: { burning: boolean; frozen: boolean; paused?: boolean }) {
  // `paused` freezes the mixBlend opacity pulses to a static value during the
  // aim minigame — a blended layer re-composites every opacity frame, which on
  // the main thread starves the aim RAF (the needle stutters). Frozen = one
  // composite, not per-frame. The aura still shows, it just stops breathing.
  return (
    <>
      {/* Fire and ice are OPPOSITE materials and must not share a look. Fire is
          chaotic, rising and irregular; ice is solid, crystalline and almost
          perfectly still (frozen = stopped). Both were the same pulsing colour
          blob before, which is what made them read as placeholder art.
          Transform/opacity only, no blend modes (see the aim-RAF note above). */}
      <style>{`
        /* Flame tongues: prime-ish durations so the licks never re-sync — that
           irregularity is what separates fire from a pulsing light. */
        @keyframes rc-flame-a { 0%,100% { transform: scaleY(0.82) scaleX(1.04); opacity: 0.5; } 38% { transform: scaleY(1.22) scaleX(0.9); opacity: 0.92; } 61% { transform: scaleY(0.98) scaleX(1.08); opacity: 0.68; } }
        @keyframes rc-flame-b { 0%,100% { transform: scaleY(1.12) scaleX(0.94); opacity: 0.78; } 45% { transform: scaleY(0.8) scaleX(1.1); opacity: 0.42; } 72% { transform: scaleY(1.18) scaleX(0.96); opacity: 0.85; } }
        @keyframes rc-flame-c { 0%,100% { transform: scaleY(0.94) scaleX(1.0); opacity: 0.62; } 29% { transform: scaleY(1.3) scaleX(0.88); opacity: 0.95; } 66% { transform: scaleY(0.86) scaleX(1.06); opacity: 0.5; } }
        /* Heat shimmer over the hull — the ship should look LIT, not just backed. */
        @keyframes rc-heat     { 0%,100% { opacity: 0.16; } 50% { opacity: 0.34; } }
        /* Ice: a single slow glint sliding across the frozen shell. The shell
           itself does NOT pulse — stillness is the whole point. */
        /* Phase backdrop swap: the new sea fades up over the old one. Slow
           enough to feel like weather turning, not a cut. */
        @keyframes rc-bg-in { from { opacity: 0 } to { opacity: 1 } }
        .rc-bg-fade { animation: rc-bg-in 1.1s ease-out both; }
        @keyframes rc-ice-glint{ 0% { transform: translateX(-130%) skewX(-18deg); opacity: 0; } 18% { opacity: 0.75; } 52% { opacity: 0.75; } 100% { transform: translateX(190%) skewX(-18deg); opacity: 0; } }
      `}</style>

      {burning && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          {/* Base heat pool at the waterline */}
          <div aria-hidden style={{ position: 'absolute', inset: '-8% -4% -2%', borderRadius: '46%', background: 'radial-gradient(ellipse at 50% 84%, rgba(255,140,40,0.62) 0%, rgba(220,70,20,0.26) 44%, transparent 70%)', animation: paused ? 'none' : 'rc-heat 1.9s ease-in-out infinite', opacity: paused ? 0.3 : undefined }} />
          {/* Three flame tongues along the hull, each on its own rhythm and
              anchored at the base so they rise and taper like real licks. */}
          {[
            { left: '26%', w: 26, h: 46, anim: 'rc-flame-a', dur: '0.83s', hue: 'rgba(255,190,90,0.95)' },
            { left: '47%', w: 32, h: 60, anim: 'rc-flame-b', dur: '1.07s', hue: 'rgba(255,150,50,0.95)' },
            { left: '68%', w: 24, h: 40, anim: 'rc-flame-c', dur: '0.71s', hue: 'rgba(255,215,130,0.9)' },
          ].map((f, n) => (
            <span key={n} aria-hidden style={{
              position: 'absolute', left: f.left, bottom: '6%', width: f.w, height: f.h,
              marginLeft: -f.w / 2, transformOrigin: '50% 100%',
              borderRadius: '50% 50% 46% 46% / 62% 62% 38% 38%',
              background: `radial-gradient(ellipse at 50% 88%, ${f.hue} 0%, rgba(255,110,30,0.55) 42%, transparent 74%)`,
              animation: paused ? 'none' : `${f.anim} ${f.dur} ease-in-out infinite`,
              opacity: paused ? 0.6 : undefined,
            }} />
          ))}
          {/* Embers — more of them, scattered and staggered. */}
          {[0, 1, 2, 3, 4].map(n => (
            <span key={n} className="rc-ember" style={{ left: `${22 + n * 14}%`, animationDelay: `${n * 0.42}s`, background: n % 2 ? '#ffd27a' : '#ff9d4d' }} />
          ))}
        </div>
      )}

      {frozen && (
        <div style={{ position: 'absolute', inset: '-6%', zIndex: 3, pointerEvents: 'none', overflow: 'hidden' }}>
          {/* NO encasing shell. Ice reads better as the CRYSTALS alone: a
              filled bubble over the hull hid the ship and looked like a
              coloured blob, which is the thing the fire/ice pass set out to
              get away from. The shards do the work. */}
          {/* Crystal facets — angular shards over the hull. Angular geometry is
              the read; a blob has no crystal in it. */}
          {[
            { left: '18%', top: '30%', w: 15, h: 34, rot: -22 },
            { left: '38%', top: '16%', w: 11, h: 26, rot: 14 },
            { left: '58%', top: '34%', w: 17, h: 40, rot: -9 },
            { left: '74%', top: '20%', w: 10, h: 24, rot: 26 },
            { left: '48%', top: '56%', w: 13, h: 28, rot: -33 },
          ].map((s, n) => (
            <span key={n} aria-hidden style={{
              position: 'absolute', left: s.left, top: s.top, width: s.w, height: s.h,
              transform: `rotate(${s.rot}deg)`,
              clipPath: 'polygon(50% 0%, 100% 34%, 78% 100%, 22% 100%, 0% 34%)',
              background: 'linear-gradient(150deg, rgba(233,250,255,0.8) 0%, rgba(147,220,255,0.45) 48%, rgba(56,189,248,0.24) 100%)',
              boxShadow: '0 0 8px rgba(186,230,253,0.55)',
            }} />
          ))}
          {/* One slow glint sliding across the ice — the only movement. */}
          {!paused && (
            <span aria-hidden style={{
              position: 'absolute', top: 0, bottom: 0, left: 0, width: '38%',
              background: 'linear-gradient(100deg, transparent, rgba(255,255,255,0.5), transparent)',
              animation: 'rc-ice-glint 3.4s ease-in-out infinite',
            }} />
          )}
        </div>
      )}
    </>
  )
}

// Lethal-save burst (Quartermaster's Anchor item) — a cyan shield ring + flash
// + a held "ANCHOR HELD" beat on the player hull when a killing blow is caught.
/** THE END OF THE SUNKEN HAND.
 *
 *  Every other kill in the game is a 1.3s sink: the hull drops, tilts and
 *  fades. That is right for a mob and wrong for the last thing in a four
 *  chapter campaign, where the PHASE TRANSITIONS were louder than the death.
 *
 *  So the finale gets its own beat, and it is built to mirror the reveal
 *  cutscene in reverse. There, the morning went dark from him outward. Here it
 *  comes back the same way:
 *
 *    0.0s  the blow lands and time stops. White, held, silent.
 *    0.5s  he goes up rather than quietly under: a bloom and two rings.
 *    1.3s  his last words, one line at a time.
 *    3.0s  the dark lifts. The overlay warms through dawn and clears.
 *    4.4s  hand back to the loot beat.
 *
 *  Config-gated (BossRaidConfig.defeatSequence), so no other boss is touched.
 */
function FinnDefeatFx({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [beat, setBeat] = useState(0)
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = []
    lines.forEach((_, i) => t.push(setTimeout(() => setBeat(i + 1), 1300 + i * 1000)))
    t.push(setTimeout(onDone, 3000 + lines.length * 1000))
    return () => t.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 1400, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* THE BLOW. A white hold, then it bleeds off into gold: the hit-stop the
          rest of the fight gets on a crit, stretched to the size of the moment. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0.92, 0.55, 0.3, 0] }}
        transition={{ duration: 4.2, times: [0, 0.03, 0.12, 0.35, 0.62, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 50% 44%, #ffffff 0%, #ffe9b5 22%, rgba(255,190,90,0.55) 46%, rgba(6,10,18,0.86) 78%)',
        }} />

      {/* HE GOES UP. Two rings out of where he was standing, not a quiet sink. */}
      {[0, 1].map(n => (
        <motion.div key={n}
          initial={{ opacity: 0, scale: 0.05 }}
          animate={{ opacity: [0, 0.85, 0], scale: [0.05, 1.7 + n * 0.9, 2.4 + n * 1.2] }}
          transition={{ duration: 1.5 + n * 0.5, delay: 0.35 + n * 0.22, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '44%', width: '58vw', maxWidth: 520,
            aspectRatio: '1', transform: 'translate(-50%, -50%)', borderRadius: '50%',
            border: `${n ? 2 : 4}px solid rgba(255,224,160,0.9)`,
          }} />
      ))}

      {/* HIS LAST WORDS, ON THEIR OWN PLATE.
          KAN-10. The lines used to be painted straight onto the flash: near-black
          with a white shadow, which reads beautifully on gold and not at all on
          anything else. But the flash animates to opacity 0 at 4.2s while the
          lines stay until onDone at 3000 + 1000 per line, so a three-line ending
          spent its last two seconds as dark text sitting directly on the combat
          log. The reported illegibility is that gap, not the position.
          
          A dark plate that fades in with the first line and holds for the whole
          sequence fixes both halves: the text now has one background it is
          styled for, whatever the flash is doing behind it. Light-on-dark reads
          against gold and against the log equally. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: beat > 0 ? 1 : 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: '50%', top: '52%', transform: 'translateX(-50%)',
          width: 'min(520px, calc(100% - 2rem))',
          padding: '0.9rem 1.1rem', borderRadius: 14,
          background: 'rgba(6,10,18,0.86)',
          border: '1px solid rgba(255,224,160,0.28)',
          boxShadow: '0 10px 40px rgba(0,0,0,0.55)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
        }}>
        {lines.map((l, i) => (
          <motion.p key={i} className="font-cinzel font-700"
            initial={{ opacity: 0, y: 8 }}
            animate={beat > i ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              margin: 0, textAlign: 'center', maxWidth: 460,
              fontSize: i === lines.length - 1 ? '0.86rem' : '1.05rem',
              lineHeight: 1.45,
              color: i === lines.length - 1 ? '#cbd5e1' : '#ffe9b5',
              fontStyle: i === lines.length - 1 ? 'italic' : 'normal',
            }}>
            {l}
          </motion.p>
        ))}
      </motion.div>
    </div>
  )
}


function AnchorSaveBurst() {
  return (
    <>
      <motion.div
        aria-hidden
        initial={{ opacity: 0.85, scale: 0.4 }}
        animate={{ opacity: 0, scale: 2.4 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '-10%', borderRadius: '50%', border: '2.5px solid rgba(125,211,252,0.9)', boxShadow: '0 0 30px rgba(125,211,252,0.7)', pointerEvents: 'none', zIndex: 4 }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.7 }}
        animate={{ opacity: [0, 1, 1, 0], y: -16, scale: 1 }}
        transition={{ duration: 1.3, times: [0, 0.18, 0.7, 1], ease: 'easeOut' }}
        className="font-cinzel font-800 uppercase tracking-[0.1em]"
        style={{ position: 'absolute', left: '50%', top: '8%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#7dd3fc', fontSize: '0.78rem', textShadow: '0 0 10px rgba(125,211,252,0.9), 0 1px 3px rgba(0,0,0,0.7)', pointerEvents: 'none', zIndex: 5 }}
      >
        Anchor Held
      </motion.div>
    </>
  )
}

// Vengeance erupt — Laz's ward catches a killing blow. A crimson shockwave +
// "Vengeance!" over the hull, redder and harder than the anchor's calm hold.
// The ward, while it holds. A slow crimson breath around your hull that QUICKENS on
// its last turn — the ability's only tell that the fuse is nearly out, short of
// reading the number on the chip.
function VengeanceWardAura({ urgent, paused }: { urgent: boolean; paused?: boolean }) {
  const C = '#d1495b'
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      <motion.div
        aria-hidden
        animate={paused ? { opacity: 0.34 } : { opacity: urgent ? [0.3, 0.66, 0.3] : [0.16, 0.38, 0.16] }}
        transition={paused ? { duration: 0.2 } : { duration: urgent ? 0.62 : 2.1, repeat: Infinity, ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: '-8% -4% -2%', borderRadius: '46%',
          background: `radial-gradient(ellipse at 50% 62%, ${C}77 0%, ${C}26 48%, transparent 74%)` }}
      />
    </div>
  )
}

function VengeanceEruptBurst() {
  return (
    <>
      <motion.div
        aria-hidden
        initial={{ opacity: 0.9, scale: 0.35 }}
        animate={{ opacity: 0, scale: 2.7 }}
        transition={{ duration: 0.75, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '-12%', borderRadius: '50%', border: '3px solid rgba(209,73,91,0.95)', boxShadow: '0 0 36px rgba(209,73,91,0.8)', pointerEvents: 'none', zIndex: 4 }}
      />
      <motion.div
        aria-hidden
        initial={{ opacity: 0.55, scale: 0.5 }}
        animate={{ opacity: 0, scale: 2.0 }}
        transition={{ duration: 0.6, ease: 'easeOut', delay: 0.08 }}
        style={{ position: 'absolute', inset: '-4%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(209,73,91,0.4) 0%, transparent 65%)', pointerEvents: 'none', zIndex: 4 }}
      />
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.65 }}
        animate={{ opacity: [0, 1, 1, 0], y: -18, scale: 1.05 }}
        transition={{ duration: 1.35, times: [0, 0.16, 0.7, 1], ease: 'easeOut' }}
        className="font-cinzel font-800 uppercase tracking-[0.12em]"
        style={{ position: 'absolute', left: '50%', top: '6%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', color: '#f0556b', fontSize: '0.86rem', textShadow: '0 0 12px rgba(209,73,91,0.95), 0 1px 3px rgba(0,0,0,0.75)', pointerEvents: 'none', zIndex: 5 }}
      >
        Vengeance!
      </motion.div>
    </>
  )
}

// Heal sparkle over the player hull — a soft green wash plus a few motes
// rising off the deck, for Mender / Abyssal Tide / repair-kit patches.
// Player self-buff aura — one cohesive shell, themed per ability so each crew
// ability has its OWN satisfying signature on the hull (not a shared green
// glow). All transform/opacity, ~0.85s, localized to the player ship box.
//   heal   — green restorative bloom + rising sparks (Mender)
//   tide   — teal wave-wash + a shield RING snapping shut (Tidecaller)
//   aim    — an amber reticle that locks onto the guns (Sharpshot)
//   charge — a gold flash + fast-rising powder sparks (Navigator)
//   brace  — a steel bulwark ring + shimmer settling over the hull (Anchor)
function PlayerStatusAura({ kind = 'heal', color: colorOverride }: { kind?: 'heal' | 'tide' | 'aim' | 'charge' | 'brace' | 'parry'; color?: string }) {
  const CFG = {
    heal:   { color: '#4ade80', mote: '#bbf7d0' },
    tide:   { color: '#5eead4', mote: '#a7f3e8' },
    aim:    { color: '#fbbf24', mote: '#fde68a' },
    charge: { color: '#f5c542', mote: '#ffe9a8' },
    brace:  { color: '#9eb0cd', mote: '#d6deec' },   // steel/iron — a damage-CUT brace, distinct from the cyan shield POOLS
    parry:  { color: '#e8eefc', mote: '#ffffff' },   // a bright steel TURN — the blow is deflected, not soaked
  } as const
  const color = colorOverride ?? CFG[kind].color
  const mote = colorOverride ?? CFG[kind].mote
  const rise    = kind === 'heal' || kind === 'tide' || kind === 'charge'
  const fast    = kind === 'charge'
  const ring    = kind === 'tide' || kind === 'brace'   // a shield / bulwark forming
  const reticle = kind === 'aim'
  const parry   = kind === 'parry'   // steel turning the blow aside
  const moteCount = fast ? 8 : reticle ? 4 : 6
  const motes = useMemo(() => Array.from({ length: moteCount }, () => ({
    x: (Math.random() - 0.5) * (reticle ? 34 : 50),
    y: rise ? -(14 + Math.random() * 30) : (Math.random() - 0.5) * 30,
    size: 3 + Math.random() * 3,
    delay: Math.random() * (fast ? 0.08 : 0.14),
    dur: (fast ? 0.42 : 0.65) + Math.random() * 0.3,
  })), [moteCount, rise, fast, reticle])
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.85, times: [0, 0.2, 0.7, 1] }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
    >
      {/* Hull wash — dimmer for the aim reticle so the crosshair reads. */}
      <div style={{
        position: 'absolute', inset: '-6%', borderRadius: '46%', mixBlendMode: 'screen',
        background: `radial-gradient(ellipse at center, ${color}${reticle ? '55' : '99'} 0%, ${color}3a 44%, transparent 72%)`,
      }} />
      {/* Parry — a hard steel slash across the hull with a spark flare at the
          point of contact. A DEFLECTION, so it's a struck angle, not the round
          bubble a shield uses or the soft whoosh a dodge uses. */}
      {parry && (
        <>
          <motion.div
            initial={{ scaleX: 0.2, opacity: 0 }} animate={{ scaleX: 1, opacity: [0, 1, 0] }}
            transition={{ duration: 0.42, times: [0, 0.25, 1], ease: 'easeOut' }}
            style={{ position: 'absolute', left: '18%', right: '18%', top: '46%', height: 3, borderRadius: 2, transform: 'rotate(-28deg)', background: `linear-gradient(90deg, transparent, ${mote}, transparent)`, boxShadow: `0 0 16px ${color}` }}
          />
          <motion.div
            initial={{ scale: 0.3, opacity: 1 }} animate={{ scale: 1.9, opacity: 0 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            style={{ position: 'absolute', left: '58%', top: '42%', width: 26, height: 26, marginLeft: -13, marginTop: -13, borderRadius: '50%', background: `radial-gradient(circle, ${mote} 0%, ${color}88 40%, transparent 72%)` }}
          />
        </>
      )}
      {/* A round bulwark ring snaps OUT for a shield pool (tide). The brace
          instead clamps steel corner brackets INWARD (an iron clamp), so a
          damage-cut reads as bracing by SHAPE, not as a shield bubble. */}
      {ring && kind !== 'brace' && (
        <motion.div
          initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 1.45, opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          style={{
            position: 'absolute', inset: '8%', borderRadius: '50%',
            border: `2.5px solid ${color}`, boxShadow: `0 0 18px ${color}aa, inset 0 0 12px ${color}66`,
          }}
        />
      )}
      {kind === 'brace' && (
        <motion.div
          initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: [0, 1, 1, 0] }}
          transition={{ duration: 0.8, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', inset: '9%', pointerEvents: 'none' }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0, width: 17, height: 17, borderTop: `3px solid ${color}`, borderLeft: `3px solid ${color}`, boxShadow: `0 0 12px ${color}aa` }} />
          <div style={{ position: 'absolute', top: 0, right: 0, width: 17, height: 17, borderTop: `3px solid ${color}`, borderRight: `3px solid ${color}`, boxShadow: `0 0 12px ${color}aa` }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, width: 17, height: 17, borderBottom: `3px solid ${color}`, borderLeft: `3px solid ${color}`, boxShadow: `0 0 12px ${color}aa` }} />
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 17, height: 17, borderBottom: `3px solid ${color}`, borderRight: `3px solid ${color}`, boxShadow: `0 0 12px ${color}aa` }} />
        </motion.div>
      )}
      {/* Aim reticle — a crosshair that snaps down onto the guns. */}
      {reticle && (
        <motion.div
          initial={{ scale: 1.5, opacity: 0, rotate: -18 }} animate={{ scale: 1, opacity: [0, 1, 1, 0], rotate: 0 }}
          transition={{ duration: 0.75, times: [0, 0.25, 0.7, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 52, height: 52, marginLeft: -26, marginTop: -26 }}
        >
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 10px ${color}aa` }} />
          {[0, 90, 180, 270].map(a => (
            <div key={a} style={{
              position: 'absolute', left: '50%', top: '50%', width: 2, height: 11,
              marginLeft: -1, marginTop: -5.5, background: color, boxShadow: `0 0 6px ${color}`,
              transform: `rotate(${a}deg) translateY(-19px)`,
            }} />
          ))}
        </motion.div>
      )}
      {/* Sparks — rise (heal/tide/charge) or drift (aim/brace). */}
      {motes.map((m, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: m.x, y: m.y, opacity: [0, 1, 0] }}
          transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '56%', width: m.size, height: m.size,
            marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%',
            background: mote, boxShadow: `0 0 6px ${color}`,
          }}
        />
      ))}
    </motion.div>
  )
}

// Dodge whoosh — a bright afterimage of the ship sprite slides in the retreat
// direction and fades, with a couple of speed lines, so a dodge reads as the
// ship physically slipping the shot (not just a "Dodged" tag).
function DodgeWhoosh({ image, flip, dir }: { image: string; flip?: boolean; dir: 'left' | 'right' }) {
  const sign = dir === 'left' ? -1 : 1
  const sx = flip ? -1 : 1
  return (
    <>
      <motion.img
        src={image} alt="" aria-hidden
        // scaleX kept constant in the animation so FM's transform doesn't drop
        // the enemy sprite's facing flip while it animates x.
        initial={{ opacity: 0.5, x: 0, scaleX: sx }}
        animate={{ opacity: 0, x: sign * 26, scaleX: sx }}
        transition={{ duration: 0.42, ease: 'easeOut' }}
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
          filter: 'brightness(1.7) saturate(0.35) drop-shadow(0 0 8px rgba(190,225,255,0.7))',
          pointerEvents: 'none', zIndex: 1,
        }}
      />
      {[0, 1, 2].map(n => (
        <motion.div
          key={n}
          initial={{ opacity: 0.75, x: sign * -2 }}
          animate={{ opacity: 0, x: sign * -32 }}
          transition={{ duration: 0.34, delay: n * 0.03, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '46%', top: `${36 + n * 13}%`, width: 24, height: 2,
            borderRadius: 2, background: 'rgba(220,240,255,0.85)', boxShadow: '0 0 6px rgba(200,230,255,0.7)',
            pointerEvents: 'none', zIndex: 5,
          }}
        />
      ))}
    </>
  )
}

// Short punchy verb shown on the cast cue per class id. Falls back to the
// class name for anything unmapped.
const ABILITY_CAST_LABEL: Record<string, string> = {
  mender:       'Hull Patched',
  sharpshot:    'Aim Steadied',
  snare:        'Helm Jammed',
  anchor:       'Sea Anchor Set',
  navigator:    'Powder Run',
  abyssal_tide: 'The Abyss Calls',
  leviathan:    'Heavy Salvo',
  blitz:        'Frenzy',
  foresight:    'Foresight',
  vengeance:    'Vengeance Ward',
  requiem:      'Marked for Death',
}

// Crew-ability cast cue. A themed pill (crew portrait + ability name) pops up
// over the stage with an expanding ring behind the portrait, so firing an
// ability — even a pure buff — reads as a real, deliberate beat.
// FF-style crew summon splash. When a crew active fires, a big image of the crew
// fades in over the whole battle screen, holds a beat, and fades out — then the
// effect follows. Full-viewport (portaled to body), pointer-events auto so it
// eats taps while it plays. All keyframed in one ~0.98s pass to match the
// SUMMON_TOTAL_MS lifetime in fireCrewAbility.
// memo: the summon's props are stable for its whole lifetime, so once it's up
// nothing should re-render it. Without this, a rapid burst of parent setState
// during the deferred effect (e.g. Mako's Frenzy chain) re-renders this and
// restarts its keyframe animations — the crew art visibly fades then pops back.
// How long a summon splash lives, player-cast or enemy-cast.
const SUMMON_TOTAL_MS = 1960

const AbilitySummonFx = memo(function AbilitySummonFx({ label, name, color, image, chase, skinId }: { label: string; name: string; color: string; image: string | null; chase?: boolean; skinId?: string | null }) {
  // One ~1.45s pass: fast fade-in, a long hold, then fade-out (matches
  // SUMMON_TOTAL_MS). The crew is CONJURED — a rune ring + light rays sweep in
  // behind a smaller portrait, a white impact flash lands on arrival, and the
  // ABILITY NAME slams up huge underneath so it reads as an RPG summon.
  const HOLD: number[] = [0, 0.09, 0.78, 0.9]   // transform-settle timing (opacity is driven by the wrapper below)
  return (
    <motion.div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 70,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'auto',   // block taps while the summon plays
        overflow: 'hidden',
      }}
    >
      {/* SINGLE opacity driver: the whole summon fades IN and OUT on one curve
          here. Every held piece below keeps a STATIC opacity and animates only
          TRANSFORMS (scale / rotate / slide) — so nothing fades in or out on its
          own timing, which is what read as janky. Only the transient arrival
          FLASHES (impact / chase) animate their own opacity, by design. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2.1, times: [0, 0.045, 0.8, 0.92], ease: 'easeInOut' }}
        style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
      >
      {/* Near-opaque dark + color-wash backdrop so the summon takes over. */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.92, background: `radial-gradient(ellipse 75% 65% at 50% 46%, ${color}30 0%, rgba(1,3,8,0.96) 60%)` }} />

      {/* Rotating light rays fanning out behind the crew (conic gradient). */}
      <motion.div
        initial={{ scale: 0.4, rotate: -30 }}
        animate={{ scale: [0.4, 1.1, 1.15, 1.2], rotate: [-30, 20, 40, 55] }}
        transition={{ duration: 2.1, times: HOLD, ease: 'easeOut' }}
        style={{
          position: 'absolute', top: '43%', width: 460, height: 460, borderRadius: '50%', opacity: 0.36,
          background: `repeating-conic-gradient(from 0deg, ${color}00 0deg, ${color}3a 9deg, ${color}00 20deg)`,
          willChange: 'transform', pointerEvents: 'none',
        }}
      />

      {/* Summoning rune ring — two counter-rotating rings that snap in. */}
      {[{ d: 300, dir: 1, dash: '14 12', w: 2 }, { d: 240, dir: -1, dash: '4 16', w: 3 }].map((r, i) => (
        <motion.div key={`ring-${i}`}
          initial={{ scale: 0.3, rotate: 0 }}
          animate={{ scale: [0.3, 1, 1, 1.08], rotate: r.dir * 90 }}
          transition={{ duration: 2.1, times: HOLD, ease: 'easeOut' }}
          style={{
            position: 'absolute', top: '43%', width: r.d, height: r.d, marginTop: -r.d / 2, borderRadius: '50%', opacity: 0.6,
            border: `${r.w}px dashed ${color}`, boxShadow: `0 0 24px ${color}55`, willChange: 'transform', pointerEvents: 'none',
          }}
        />
      ))}

      {/* White impact flash on the crew's arrival. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.4, 1.6, 2] }}
        transition={{ duration: 0.45, delay: 0.1, ease: 'easeOut' }}
        style={{ position: 'absolute', top: '43%', width: 260, height: 260, marginTop: -130, borderRadius: '50%', background: `radial-gradient(circle, #ffffffcc 0%, ${color}55 40%, transparent 70%)`, pointerEvents: 'none' }}
      />

      {/* Chase arrival pop — a big gold-white flare so a top-tier skin lands
          with extra weight. The skin's signature motion (below, over the art)
          carries the identity. */}
      {chase && (
        <motion.div
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.3, 2, 2.6] }}
          transition={{ duration: 0.7, delay: 0.14, ease: 'easeOut' }}
          style={{ position: 'absolute', top: '43%', width: 320, height: 320, marginTop: -160, borderRadius: '50%', background: `radial-gradient(circle, #fffbe8ee 0%, ${color}77 34%, transparent 68%)`, pointerEvents: 'none' }}
        />
      )}

      {/* The crew — JUST the art, no card frame. A colored glow (drop-shadow)
          instead of a border/background so it reads as summoning the character,
          not flashing a card. Overshoot scale-in for impact. A chase skin's
          signature FX (lightning, tentacles, spectrum, reticle) plays right
          over the character. */}
      <motion.div
        initial={{ scale: 1.34, y: 10 }}
        animate={{ scale: [1.34, 1, 1, 1], y: [10, 0, 0, 0] }}
        transition={{ duration: 2.1, times: [0, 0.09, 0.78, 0.9], ease: [0.18, 0.9, 0.3, 1] }}
        style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'center' }}
      >
        {image ? (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            {/* Chase FX sits BEHIND the character (img is z-lifted above it), so a
                bright flash backlights the hero instead of washing over it — a
                white wash on top read as the art vanishing then reappearing. */}
            {chase && skinId && <ChaseSkinFx skinId={skinId} color={color} variant="summon" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={name} decoding="async" loading="eager" style={{ position: 'relative', zIndex: 1, height: 'min(50vh, 300px)', width: 'auto', maxWidth: '82vw', display: 'block', willChange: 'transform', filter: chase
              ? `drop-shadow(0 0 34px ${color}) drop-shadow(0 0 80px ${color}) drop-shadow(0 0 130px ${color}66) drop-shadow(0 12px 32px rgba(0,0,0,0.7))`
              : `drop-shadow(0 0 28px ${color}) drop-shadow(0 0 66px ${color}88) drop-shadow(0 12px 32px rgba(0,0,0,0.65))` }} />
          </div>
        ) : (
          <div style={{ fontSize: '3.4rem', color, filter: `drop-shadow(0 0 22px ${color})`, display: 'flex' }}><IconAnchor size={54} /></div>
        )}
      </motion.div>

      {/* Small crew name, then the BIG ability name slamming up underneath. */}
      <motion.div
        initial={{ y: 14 }}
        animate={{ y: [14, 0, 0, 0] }}
        transition={{ duration: 2.1, times: [0, 0.14, 0.78, 0.9], ease: 'easeOut' }}
        style={{ textAlign: 'center', marginTop: 16, position: 'relative', zIndex: 2, padding: '0 1rem' }}
      >
        <p className="font-karla font-700 uppercase tracking-[0.32em]" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{name}</p>
        <motion.p
          className="font-cinzel font-800 uppercase"
          initial={{ scale: 1.35, letterSpacing: '0.3em' }}
          animate={{ scale: 1, letterSpacing: '0.06em' }}
          transition={{ delay: 0.14, duration: 0.34, ease: [0.2, 1, 0.3, 1] }}
          style={{ fontSize: '2.15rem', lineHeight: 1.05, color: '#fff', marginTop: 4, textShadow: `0 0 22px ${color}, 0 0 54px ${color}aa, 0 3px 8px rgba(0,0,0,0.85)` }}
        >
          {label}
        </motion.p>
      </motion.div>
      </motion.div>{/* end synchronized-fade wrapper */}
    </motion.div>
  )
})

function AbilityCastFx({ label, name, color, image, emoji }: { label: string; name: string; color: string; image?: string | null; emoji?: string }) {
  return (
    <motion.div
      // x:'-50%' carries the horizontal center through the scale/y animation
      // (a static translateX would be clobbered by FM's transform).
      initial={{ opacity: 0, x: '-50%', y: 16, scale: 0.82 }}
      animate={{ opacity: 1, x: '-50%', y: 0, scale: 1 }}
      exit={{ opacity: 0, x: '-50%', y: -12, scale: 0.96 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      style={{
        position: 'absolute', left: '50%', bottom: '15%', zIndex: 8,
        pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 9,
        padding: '0.32rem 0.78rem 0.32rem 0.34rem', borderRadius: 999,
        background: 'rgba(7,11,18,0.74)', border: `1px solid ${color}77`,
        boxShadow: `0 0 22px ${color}55, 0 6px 18px rgba(0,0,0,0.5)`,
        backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      }}
    >
      {/* Portrait + expanding ring */}
      <div style={{ position: 'relative', flexShrink: 0, width: 40, height: 40 }}>
        <motion.div
          initial={{ opacity: 0.55, scale: 0.5 }}
          animate={{ opacity: 0, scale: 2.4 }}
          transition={{ duration: 0.72, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 16px ${color}` }}
        />
        {/* Second ring, trailing — reads as a real "activation" pop, not a static glow. */}
        <motion.div
          initial={{ opacity: 0.4, scale: 0.5 }}
          animate={{ opacity: 0, scale: 3.1 }}
          transition={{ duration: 0.82, delay: 0.12, ease: 'easeOut' }}
          style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `1.5px solid ${color}aa` }}
        />
        <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${color}`, boxShadow: `0 0 14px ${color}aa`, background: '#0a121e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1.2rem', color, display: 'flex' }}><IconCrate size={19} /></span>}
        </div>
      </div>
      {/* Label + crew line */}
      <div style={{ minWidth: 0 }}>
        <p className="font-cinzel font-800" style={{ fontSize: '0.92rem', color, lineHeight: 1.05, textShadow: `0 0 10px ${color}88, 0 1px 3px rgba(0,0,0,0.6)`, whiteSpace: 'nowrap' }}>{label}</p>
        <p className="font-karla font-600 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.1em', color: '#b8b2a6', marginTop: 1, whiteSpace: 'nowrap' }}>{name}</p>
      </div>
    </motion.div>
  )
}

// SVG glyphs for the circular action buttons (stroke = currentColor).
// ── Action icons ─────────────────────────────────────────────────────────────
// Combat icons. These are read in a fraction of a second under turn pressure,
// so legibility beats cleverness: SOLID silhouettes at 30px inside the 58px
// button (the old set was 2px strokes at 22px — barely a third of the button,
// and thin strokes mush together at that size). Each one is a filled mass with
// at most a couple of stroked accents. Still inline SVG on `currentColor` so
// the per-state tinting (enabled / disabled / highlighted) keeps working.
//
// Two of the old drawings failed outright at size: DODGE was a serpentine wake
// that read as a squiggle, and SPECIAL was a bosun's whistle that read as a
// magnifying glass. Those are redrawn around what the action DOES.
const ACTION_ICON: Record<'dodge' | 'special' | 'reload' | 'fire' | 'volley', React.ReactNode> = {
  // Slipping the shot — a heavy arc sweeping up and away over the incoming
  // ball. The dimmed ball is what you're evading, so the verb is in the frame.
  dodge: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
      <circle cx="12.6" cy="19" r="2.7" fill="currentColor" opacity="0.4" />
      <path d="M3.4 19.4c0-6.6 4.3-10.4 10-10.4" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M11.4 4.4l5 4.6-5 4.6z" fill="currentColor" />
    </svg>
  ),
  // Special — a solid burst. Generic on purpose: this slot holds crew
  // abilities, repair kits and items, so a literal drawing of any one of them
  // misleads. A star is the one shape every player already reads as "ability".
  special: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 1.4l2.6 6.6 6.6 2.6-6.6 2.6L12 19.8l-2.6-6.6L2.8 10.6l6.6-2.6z" />
      <circle cx="19.8" cy="4.2" r="1.8" opacity="0.75" />
      <circle cx="4.6" cy="18.2" r="1.4" opacity="0.5" />
    </svg>
  ),
  // Shot pyramid on the deck — a stack of cannonballs. Unmistakably "ammo",
  // and filled it reads as weight rather than three empty rings.
  reload: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="6.4" r="3.2" />
      <circle cx="7.2" cy="13.4" r="3.2" />
      <circle cx="16.8" cy="13.4" r="3.2" />
      <rect x="2.4" y="18.2" width="19.2" height="2.8" rx="1.4" />
    </svg>
  ),
  // Cannon firing — solid barrel, muzzle band, carriage wheel, and the blast
  // leaving it. The ACT of discharging, not a flame (Ablaze already owns fire).
  fire: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <rect x="2.2" y="9.6" width="11.4" height="4.8" rx="1.6" />
      <rect x="13" y="8.6" width="2.6" height="6.8" rx="1" />
      <circle cx="5.8" cy="18.4" r="2.9" />
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M17.8 12h3.8" />
        <path d="M17.4 8.6l3-2" />
        <path d="M17.4 15.4l3 2" />
      </g>
    </svg>
  ),
  // Volley — three shot away at once, speed trails behind. Same cannonball
  // mass as Reload so the two read as the same ammunition.
  volley: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="17.6" cy="5.6" r="2.9" />
      <circle cx="17.6" cy="12" r="2.9" />
      <circle cx="17.6" cy="18.4" r="2.9" />
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M2.6 5.6h8" />
        <path d="M5.2 12h5.4" />
        <path d="M2.6 18.4h8" />
      </g>
    </svg>
  ),
}

function CircleBtn({ icon, label, color, enabled, highlighted, onClick, readyPulse, keyHint }: {
  icon: React.ReactNode
  label: string
  color: string
  enabled: boolean
  highlighted: boolean
  onClick: () => void
  /** When true, render a pulsing colored dot in the top-right corner —
   *  passive "something's ready to fire" indicator. Currently used only
   *  by the Special slot to flag a crew ability is off cooldown. */
  readyPulse?: boolean
  /** Desktop keyboard binding, shown as a tiny chip beside the label —
   *  .key-hint renders only where the primary pointer is a mouse. */
  keyHint?: string
}) {
  const lit = enabled || highlighted
  const borderColor = highlighted ? color : enabled ? `${color}cc` : '#2a3548'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
      <div style={{ position: 'relative' }}>
        <motion.button
          whileTap={enabled ? { scale: 0.84 } : {}}
          transition={{ type: 'spring', stiffness: 600, damping: 18 }}
          disabled={!enabled}
          // "Input registered" tick the instant the finger lands — combat is
          // split-second decisions, and the buzz kills tap-uncertainty before
          // the resolution animation takes over.
          onPointerDown={enabled ? () => vibrate(6) : undefined}
          onClick={onClick}
          aria-label={label}
          style={{
            width: 58, height: 58, borderRadius: '50%',
            background: highlighted ? `${color}26` : enabled ? '#1c2540' : '#0c1422',
            border: `2px solid ${borderColor}`,
            color: lit ? color : '#3f4a5e',
            cursor: enabled ? 'pointer' : 'not-allowed',
            opacity: enabled ? 1 : highlighted ? 0.9 : 0.5,
            boxShadow: highlighted ? `0 0 14px ${color}66, inset 0 0 10px ${color}33` : enabled ? `0 2px 8px rgba(0,0,0,0.4)` : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            touchAction: 'manipulation',
          }}
        >
          {icon}
        </motion.button>
        {readyPulse && enabled && (
          <motion.div
            aria-hidden
            animate={{ scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: -3, right: -3,
              width: 14, height: 14, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, #fff, ${color} 65%, ${color}aa 100%)`,
              border: '2px solid #0a1422',
              boxShadow: `0 0 8px ${color}cc, 0 0 14px ${color}77`,
              pointerEvents: 'none',
            }}
          />
        )}
      </div>
      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{
        fontSize: '0.62rem', color: lit ? color : '#4a5468',
      }}>
        {label}{keyHint && <span className="key-hint" style={{ marginLeft: 5 }}>{keyHint}</span>}
      </span>
    </div>
  )
}

/** One entry in the Special chooser popover. The parent owns the list so
 *  future special items (potions, abilities, etc.) drop in without
 *  touching ActionMenu. */
export interface SpecialItem {
  id: string
  label: string
  /** Short line under the label — the effect, or why it can't be used. */
  sub: string
  /** Accent color for the card border + label. */
  color: string
  /** Grays the card and blocks clicks. Use for "already used", "at full HP", etc. */
  disabled?: boolean
  emoji?: string
  image?: string | null
  onClick: () => void
}

function ActionMenu({ canFire, canVolley, canMega = false, megaAugment = null, volleyCost = VOLLEY_COST, megaCost = MEGA_CHARGE_COST, canDodge, canReload, onSelect, disabled = false, highlightedAction = null, specialItems = [] }: {
  canFire: boolean
  canVolley: boolean
  /** Man-o-War Mega is available (augment owned + a full 4-charge magazine). */
  canMega?: boolean
  megaAugment?: ShipAugment | null
  /** Effective charge costs after Don's cost-cut synergies (default the base). */
  volleyCost?: number
  megaCost?: number
  canDodge: boolean
  /** False when the magazine's already full — reload would be a wasted
   *  turn (any extra charge clamps off). Drives a "Full" label so the
   *  slot stays where it is but reads as unavailable. */
  canReload: boolean
  onSelect: (a: EnemyAction) => void
  /** When true, no buttons are clickable (we're in reveal / resolve phase). */
  disabled?: boolean
  /** When set, the matching button keeps its accent border. Volley highlights Fire. */
  highlightedAction?: EnemyAction | null
  /** Special items the player can choose from. Empty list = Special slot
   *  grays out. Tapping Special opens a chooser; tapping an entry fires
   *  its onClick. Per-entry `disabled` keeps the entry visible (so the
   *  player still sees the item exists) but blocks the action. */
  specialItems?: SpecialItem[]
}) {
  const [fireMenu, setFireMenu] = useState(false)
  const [specialMenu, setSpecialMenu] = useState(false)

  const fireHighlighted = highlightedAction === 'fire' || highlightedAction === 'volley'
  const reloadHighlighted = highlightedAction === 'reload'
  const dodgeHighlighted = highlightedAction === 'dodge'
  const hasSpecial = specialItems.length > 0
  // Crew-ability readiness pulse — only flags actual class abilities
  // (id prefix 'crew-'), not the repair kit; the player's asking "is one
  // of my crew's specials off cooldown right now?" not "do I have any
  // special option at all?". Filter is permissive: any non-disabled
  // crew item counts (covers the player's first turn before anything's
  // been used, or post-rest-stop when usedAbilityIds clears).
  const crewAbilityReady = specialItems.some(i => i.id.startsWith('crew-') && !i.disabled)

  function tapFire() {
    if (disabled || !canFire) return
    if (canVolley || canMega) setFireMenu(true)   // enough charges → let the player pick
    else onSelect('fire')
  }
  function tapSpecial() {
    if (disabled || !hasSpecial) return
    setSpecialMenu(true)
  }
  function pick(a: EnemyAction) { setFireMenu(false); onSelect(a) }
  function pickSpecial(item: SpecialItem) {
    if (item.disabled) return
    setSpecialMenu(false)
    item.onClick()
  }

  // ── Desktop keyboard ──────────────────────────────────────────────────────
  // One key per slot, matching the icons left to right: D dodge · S special ·
  // R reload · F fire — plus V volley and M mega, which skip the fire chooser
  // outright (the chooser exists because ONE thumb needs to reach three
  // options; a keyboard has a key per option, so F is always the single shot
  // and V/M spend the charges directly). Escape closes either chooser.
  //
  // Guards mirror the buttons exactly: same enabled conditions, dead while
  // `disabled` (reveal/resolve), dead behind any overlay (uncoveredCenter on
  // the menu root — tides, loot, pause all cover it), and dead while the
  // special chooser is up so a stray F cannot fire behind it. During aiming
  // this whole component is unmounted, so the keys go dead there for free.
  const menuRootRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if (typingInField(e.target)) return
      const root = menuRootRef.current
      if (!root || !uncoveredCenter(root)) return

      const k = e.key.toLowerCase()
      if (k === 'escape') {
        if (fireMenu || specialMenu) { e.preventDefault(); setFireMenu(false); setSpecialMenu(false) }
        return
      }
      if (specialMenu) {
        // Chooser is up: S toggles it away, everything else stays inert.
        if (k === 's') { e.preventDefault(); setSpecialMenu(false) }
        return
      }
      if (disabled) return
      if (k === 'd' && canDodge)                 { e.preventDefault(); setFireMenu(false); onSelect('dodge') }
      else if (k === 'r' && canReload)           { e.preventDefault(); setFireMenu(false); onSelect('reload') }
      else if (k === 'f' && canFire)             { e.preventDefault(); setFireMenu(false); onSelect('fire') }
      else if (k === 'v' && canVolley)           { e.preventDefault(); setFireMenu(false); onSelect('volley') }
      else if (k === 'm' && canMega)             { e.preventDefault(); setFireMenu(false); onSelect('mega') }
      else if (k === 's' && hasSpecial)          { e.preventDefault(); setSpecialMenu(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canDodge, canReload, canFire, canVolley, canMega, hasSpecial, disabled, fireMenu, specialMenu, onSelect])

  return (
    <div ref={menuRootRef} style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <CircleBtn
          icon={ACTION_ICON.dodge} label="Dodge" color="#38bdf8" keyHint="D"
          enabled={canDodge && !disabled} highlighted={dodgeHighlighted}
          onClick={() => { if (canDodge && !disabled) onSelect('dodge') }}
        />
        <CircleBtn
          icon={ACTION_ICON.special} label="Special" color="#c084fc" keyHint="S"
          enabled={hasSpecial && !disabled} highlighted={false}
          readyPulse={crewAbilityReady}
          onClick={tapSpecial}
        />
        <CircleBtn
          icon={ACTION_ICON.reload} label={canReload ? 'Reload' : 'Full'} color="#a8b8d0" keyHint="R"
          enabled={canReload && !disabled} highlighted={reloadHighlighted}
          onClick={() => { if (canReload && !disabled) onSelect('reload') }}
        />
        <CircleBtn
          icon={ACTION_ICON.fire} label="Fire" color="#4ade80" keyHint="F"
          enabled={canFire && !disabled} highlighted={fireHighlighted}
          onClick={tapFire}
        />
      </div>

      {/* Special chooser — vertical stack so it scales as more items
          arrive. Per-entry disabled state surfaces "why not" inline. */}
      {specialMenu && (
        <>
          <div
            onClick={() => setSpecialMenu(false)}
            style={{ position: 'absolute', inset: '-200px 0 -8px 0', zIndex: 9 }}
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 10px)', zIndex: 10,
              display: 'flex', flexDirection: 'column', gap: 6,
              background: '#0a1422', border: '1px solid #2a3548',
              borderRadius: 14, padding: 8,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}
          >
            {specialItems.map(item => (
              <motion.button
                key={item.id}
                whileTap={item.disabled ? undefined : { scale: 0.97 }}
                onClick={() => pickSpecial(item)}
                disabled={item.disabled}
                style={{
                  padding: '0.6rem 0.7rem', borderRadius: 10,
                  background: item.disabled ? 'rgba(255,255,255,0.04)' : `${item.color}14`,
                  border: `2px solid ${item.disabled ? 'rgba(255,255,255,0.12)' : item.color}`,
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                }}
              >
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${item.color}22`, fontSize: '1.1rem', lineHeight: 1, overflow: 'hidden',
                }}>
                  {item.image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    : <span style={{ color: item.color, display: 'flex' }}><IconCrate size={18} /></span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.84rem', color: item.disabled ? '#7a7674' : '#ffffff', lineHeight: 1.15 }}>{item.label}</p>
                  <p className="font-karla" style={{ fontSize: '0.66rem', color: item.disabled ? '#6a6460' : `${item.color}cc`, marginTop: 2, lineHeight: 1.3 }}>{item.sub}</p>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </>
      )}

      {/* Fire / Volley chooser — only when you have enough for a volley.
          Anchored over the row so it doesn't shift the layout. */}
      {fireMenu && (
        <>
          <div
            onClick={() => setFireMenu(false)}
            style={{ position: 'absolute', inset: '-200px 0 -8px 0', zIndex: 9 }}
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.14 }}
            style={{
              position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 10px)', zIndex: 10,
              display: 'flex', gap: 8,
              background: '#0a1422', border: '1px solid #2a3548',
              borderRadius: 14, padding: 8,
              boxShadow: '0 8px 28px rgba(0,0,0,0.6)',
            }}
          >
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => pick('fire')}
              style={{
                flex: 1, padding: '0.7rem 0.5rem', borderRadius: 10,
                background: '#16241a', border: '2px solid #4ade80', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff' }}>Fire</span>
              <span className="font-karla" style={{ fontSize: '0.62rem', color: '#4ade80' }}>1 ◆ · single <span className="key-hint">F</span></span>
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => pick('volley')}
              style={{
                flex: 1, padding: '0.7rem 0.5rem', borderRadius: 10,
                background: '#241f10', border: '2px solid #fbbf24', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff' }}>Volley</span>
              <span className="font-karla" style={{ fontSize: '0.62rem', color: '#fbbf24' }}>{volleyCost} ◆ · 2× dmg <span className="key-hint">V</span></span>
            </motion.button>
            {canMega && megaAugment && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => pick('mega')}
                style={{
                  flex: 1, padding: '0.7rem 0.5rem', borderRadius: 10,
                  background: `${megaAugment.color}1e`, border: `2px solid ${megaAugment.color}`, cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  boxShadow: `0 0 16px ${megaAugment.color}3a`,
                }}
              >
                <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff' }}>{megaAugment.name}</span>
                <span className="font-karla" style={{ fontSize: '0.62rem', color: megaAugment.color }}>{megaCost} ◆ · Mega <span className="key-hint">M</span></span>
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </div>
  )
}

function LogBox({ lines, turn }: { lines: string[]; turn: number }) {
  // Pokemon-style "battle text" box. Always visible, just current turn's
  // events. Height is LOCKED at 130px so the action buttons below never get
  // shoved off-screen during the post-kill XP/doubloons cascade.
  //
  // The lines area is SCROLLABLE: a busy turn (a counter + a crew ability + a
  // burn tick + the kill) can stream more lines than the 130px window holds,
  // so instead of clipping the earlier ones we keep them all and let the
  // player scroll back through what happened this turn. Lines still pile
  // against the BOTTOM when few (marginTop:auto on the inner wrap — the robust
  // cross-browser stand-in for justify-content:flex-end that doesn't break
  // scroll-to-top), and the view auto-sticks to the newest line as they stream
  // in, unless the player has scrolled up to read.
  const isEmpty = lines.length === 0
  const visible = isEmpty ? ['What will you do?'] : lines
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)
  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [lines])
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    // "Stuck to bottom" if within a line's slack of the end — new streaming
    // lines keep following; scroll up past that and we stop yanking you down.
    stickRef.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 10
  }
  return (
    <div style={{
      background: '#04080e',
      border: '1px solid #1f2e42',
      borderRadius: 12,
      padding: '0.65rem 0.85rem',
      minHeight: 130,
      maxHeight: 130,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4, flexShrink: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#5a7a9a' }}>
          Turn {turn}
        </p>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rc-log-scroll"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div style={{ marginTop: 'auto' }}>
          {visible.map((line, i) => (
            <motion.p
              // Key on index + content only — DON'T include `turn`. When a turn
              // ends, `turn` increments but the log still shows the last turn's
              // lines until the next resolveTurn() clears it. Including `turn` in
              // the key re-mounted every existing line on turn-over, causing the
              // whole log to flicker fade-in at the start of every player input.
              // Line content is unique enough within a turn (and across turns the
              // log is replaced wholesale by setResolveLog([speedLine]) anyway).
              key={`${i}-${line}`}
              initial={isEmpty ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="font-karla"
              style={{ fontSize: '0.86rem', color: '#c8d4e0', lineHeight: 1.5 }}
            >
              {line}
            </motion.p>
          ))}
        </div>
      </div>
      <style>{`
        .rc-log-scroll { scrollbar-width: thin; scrollbar-color: #2a3f57 transparent; }
        .rc-log-scroll::-webkit-scrollbar { width: 5px; }
        .rc-log-scroll::-webkit-scrollbar-thumb { background: #2a3f57; border-radius: 3px; }
        .rc-log-scroll::-webkit-scrollbar-track { background: transparent; }
      `}</style>
    </div>
  )
}

// Body-portaled fixed overlay anchored just above the MobileTabBar. It
// is NOT a descendant of the framer-motion-heavy RaidCombat tree, so it
// can't pull the body's fixed Nav/MobileTabBar into a compositing layer
// (the regression — see memory feedback_pagetransition_ios_pwa). The
// layout never shifts (ActionMenu stays mounted) and the Lock button
// lands at the bottom where the thumb already is.
// In-place aim bar — sits in the LogBox's slot during aiming, sized
// to match LogBox's locked 130px height so the bottom panel doesn't
// shift. The actual aim bar is 44px; the surrounding chrome (Turn-
// style header + centering + helper hint) fills the rest of the slot.
// Pairs with InlineLockButton below.
// ── THE DIAL ─────────────────────────────────────────────────────────────────
// The Finn finale's aiming instrument, and the mechanical half of the whole
// cross-game convergence.
//
// It is THE FISHING DIAL. Not a lookalike: `DialSVG` is the very component the
// fishing screen renders, lifted into components/FishingDial.tsx and mounted
// here unchanged, so it is the same size, the same face, the same needle the
// player has spent the whole game reading. That recognition IS the moment.
//
// What differs is only what feeds it. Fishing hands it zones from
// buildFishZones; here it gets the RAID's own bands (graze / hit / crit) built
// from the same HIT_W / GRAZE_W / critW the aim bar uses, so the fight underneath
// is still raid combat: same RAF, same 0..1 drivers, same judgment in lockShot,
// same WYSIWYG freeze. `paintNeedle` / `paintZone` in the parent turn those same
// numbers into rotations, which is why the frozen picture can never disagree
// with the badge.
//
// The band is not an abstract marker either: FINN'S SHIP rides it, orbiting the
// dial, so the player is tracking him around the face and firing when they have
// him. And the bands widen with the player's equipped rod and hook exactly as
// they do when fishing, so every hour on the fishing side is a wider shot here.

/** The raid's bands as fishing ZoneDefs. Built CENTRED ON 180° so no arc has to
 *  wrap past 0/360; paintZone then rotates the whole group onto Finn's bearing,
 *  exactly the way fishing's drift mechanic rotates its zones. */
function buildDialZones(critW: number, hitW: number, grazeW: number): ZoneDef[] {
  // ONLY the band. The rest of the circle is deliberately left undrawn: the
  // whole zones group rotates to track Finn, so filling the remainder with
  // 'miss' arcs meant the ENTIRE ring spun and it read as the dial turning
  // rather than a target moving along a fixed track. The bar has a static
  // background with a band sliding over it, and this now matches.
  // A normalised half-width is a fraction of the whole dial.
  const graze = (hitW + grazeW) * 360
  const hit   = hitW * 360
  const crit  = Math.min(critW, hitW) * 360
  const C = 180
  return [
    { from: C - graze,   to: C - hit,    type: 'penalty', label: 'Graze',    color: '#94a3b8' },
    { from: C - hit,     to: C - crit,   type: 'catch',   label: 'Hit',      color: '#4ade80' },
    { from: C - crit,    to: C + crit,   type: 'perfect', label: 'Critical', color: '#fbbf24' },
    { from: C + crit,    to: C + hit,    type: 'catch',   label: 'Hit',      color: '#4ade80' },
    { from: C + hit,     to: C + graze,  type: 'penalty', label: 'Graze',    color: '#94a3b8' },
  ]
}

// Steady opacity per band. Fishing dims whichever zone the needle is not in;
// here the bands are the target itself, so they stay lit and readable.
const DIAL_ZONE_OPACITY = (z: ZoneDef) =>
  z.type === 'perfect' ? 0.95 : z.type === 'catch' ? 0.8 : z.type === 'penalty' ? 0.45 : 0

function DialAimInline({
  indicatorRef, zonesGroupRef, flashRef, critW,
  afflictionLabel, hardenedArmed, hitW, grazeW, firePos, zoneCenter, snapKey, perfectBurstKey, streakFire, streakCount, streakLabel, streakPct, piercing,
}: {
  indicatorRef:  React.RefObject<HTMLDivElement | null>
  zonesGroupRef: React.RefObject<SVGGElement | null>
  flashRef:      React.RefObject<HTMLDivElement | null>
  critW: number
  afflictionLabel?: string | null
  hardenedArmed?: boolean
  /** The band half-widths this fight judges at (gear bonus + dial scale
   *  already applied). Drawing from the same numbers is what keeps the frozen
   *  picture honest. */
  hitW: number
  grazeW: number
  /** Live ref reads, so any unrelated re-render paints the CURRENT position
   *  rather than snapping the needle or the band back to a stale one. */
  firePos: number
  zoneCenter: number
  /** Reel-in feel, straight from the fishing dial: snap on every lock, full
   *  burst on a crit. */
  snapKey: number
  perfectBurstKey: number
  /** The dial CATCHES FIRE on a crit streak: the same halos and rings the
   *  fishing dial lights with on a perfect streak, at the same thresholds. */
  streakFire: 0 | 1 | 2
  /** Live streak readout. The hull badge that normally carries this sits
   *  BEHIND the dial scrim while aiming, which is the one moment the player
   *  is actually deciding whether to protect the chain, so the dial carries
   *  its own copy. */
  streakCount: number
  streakLabel: string
  streakPct: number
  /** The streak is high enough to ignore his shield. Called out separately
   *  because it is a THRESHOLD, not a gradient: the number alone does not
   *  tell you that you crossed it. */
  piercing: boolean
}) {
  const zones = useMemo(() => buildDialZones(critW, hitW, grazeW), [critW, hitW, grazeW])
  // Finn orbits at the middle of the band's radius.

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto' }}>
      {streakCount >= 1 && (
        <div className="font-cinzel font-700 uppercase" style={{
          position: 'absolute', top: -34, left: 0, right: 0, textAlign: 'center',
          pointerEvents: 'none', letterSpacing: '0.06em', whiteSpace: 'nowrap',
          fontSize: streakCount >= 3 ? '0.92rem' : '0.78rem',
          color: streakCount >= 3 ? '#fbbf24' : '#fb923c',
          textShadow: streakCount >= 3
            ? '0 0 16px rgba(251,191,36,0.85), 0 0 34px rgba(249,115,22,0.5)'
            : '0 0 10px rgba(251,146,60,0.7)',
          transition: 'font-size 0.2s ease-out, color 0.2s ease-out',
        }}>
          {streakLabel} ×{streakCount}
          <span style={{ opacity: 0.85, marginLeft: 8, fontSize: '0.72em' }}>+{streakPct}%</span>
          {piercing && (
            <div style={{
              marginTop: 2, fontSize: '0.6rem', letterSpacing: '0.16em',
              color: '#e9d5ff', textShadow: '0 0 12px rgba(192,132,252,0.9)',
            }}>
              Through the plate
            </div>
          )}
        </div>
      )}
      {/* result flash, same element the bar uses */}
      <div ref={flashRef} aria-hidden style={{
        position: 'absolute', inset: '3.6%', borderRadius: '50%', opacity: 0,
        pointerEvents: 'none', transition: 'opacity 0.18s', zIndex: 3,
      }} />

      <DialSVG
        zones={zones}
        angle={firePos * 360}
        rotation={zoneCenter * 360 - 180}
        needleRef={indicatorRef}
        zonesGroupRef={zonesGroupRef}
        // The needle is tinted imperatively by paintNeedleColor setting `color`
        // on the very layer this ref points at, so it never costs a re-render.
        needleColor="currentColor"
        zoneOpacityFn={DIAL_ZONE_OPACITY}
        needleStyle="marker"
        turnMark
        fireLevel={streakFire}
        snapKey={snapKey}
        perfectBurstKey={perfectBurstKey}
      />


      {afflictionLabel && (
        <div className="font-karla font-800 uppercase" style={{
          position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)',
          fontSize: '0.55rem', letterSpacing: '0.14em', color: '#f0a0a0', whiteSpace: 'nowrap',
        }}>
          {afflictionLabel}
        </div>
      )}
      {hardenedArmed && (
        <div className="font-karla font-800 uppercase" style={{
          position: 'absolute', bottom: -18, left: '50%', transform: 'translateX(-50%)',
          fontSize: '0.55rem', letterSpacing: '0.14em', color: '#9fb2c8', whiteSpace: 'nowrap',
        }}>
          Tap twice
        </div>
      )}
    </div>
  )
}


function AimBarInline({ indicatorRef, zoneRef, needleTrackRef, zoneTrackRef, aimFxRef, aimFxRead, flashRef, aimFogDensity, aimBlackout, critW, sharpshotActive, decoyCount, decoyElRefs, afflictionLabel, hardenedArmed, critBandRef }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  /** The full-width rails the needle and the band ride. These are what actually
   *  move each frame; see the note where they are rendered. */
  needleTrackRef: React.RefObject<HTMLDivElement | null>
  zoneTrackRef:   React.RefObject<HTMLDivElement | null>
  /** The effects layer's handle, for firing a burst when a shot is judged. */
  aimFxRef: React.MutableRefObject<AimBarFxHandle | null>
  /** Where the needle and the target are, read on the FX layer's own frame —
   *  not passed as props, because all four change every frame. */
  aimFxRead: () => { pos: number; zone: number; critW: number; band: number }
  flashRef:     React.RefObject<HTMLDivElement | null>
  /** False Colors curse — N drifting decoy bands the player must NOT lock onto.
   *  The RAF positions each via decoyElRefs. 0 = none this fire. */
  decoyCount?: number
  decoyElRefs?: React.MutableRefObject<(HTMLDivElement | null)[]>
  /** Inkfall curse — 0-1 intensity of a random blackout that briefly swallows
   *  the whole bar (needle + zone), like the abyss reel going dark. */
  aimBlackout?: number
  /** The Cartographer's "Mist Veil" — 0–1 opacity of a drifting fog
   *  band overlaid on the aim bar. Undefined / 0 = no fog (every other
   *  raid). ~0.4 thin (his crew tier), ~0.7 deep (the boss himself).
   *  Themed: he runs these waters because the fog hides his charts. */
  aimFogDensity?: number
  /** Live crit half-width (CRIT_W × tide/Sharpshot wideners). The gold
   *  band is drawn at its TRUE width — it was a 2px hairline while the
   *  real window was ~4× wider, so honest crits read as lucky breaks
   *  and the practice bar (which draws the real band) didn't match. */
  critW: number
  /** Sharpshot buff live — pulse the gold crit band so the widened window
   *  reads as an active boon, not just a quietly bigger target. */
  sharpshotActive?: boolean
  /** Raid-8 aim affliction (decoys / hardened / squall) — the special's name,
   *  shown as a warning chip in the header while the affliction is live. */
  afflictionLabel?: string | null
  /** Hardened Lock: true while the plate is still intact THIS pass — the
   *  header flips to "tap twice" so the crack-tap doesn't read as a bug. */
  hardenedArmed?: boolean
  /** Rolling Plate: the aim RAF repositions the gold band through this ref
   *  when the enemy's crit seam drifts. Undefined-safe (band stays centered). */
  critBandRef?: React.MutableRefObject<HTMLDivElement | null>
}) {
  const fogOpacity = Math.max(0, Math.min(1, aimFogDensity ?? 0))
  const hasFog = fogOpacity > 0
  // Inkfall: peak darkness of the blackout, scaled by intensity. The keyframe
  // is mostly clear with two short, unevenly-spaced dark beats so it reads as
  // random rather than a metronome.
  const inkOpacity = Math.max(0, Math.min(0.95, aimBlackout ?? 0))
  const hasInk = inkOpacity > 0
  // The zone div spans ±(HIT_W + GRAZE_W) around its center, so the crit
  // band's share of it is critW / (HIT_W + GRAZE_W), centered.
  const critBandPct = (critW / (HIT_W + GRAZE_W)) * 100
  return (
    <div style={{
      background: '#04080e',
      border: '1px solid #1f2e42',
      borderRadius: 12,
      padding: '0.65rem 0.85rem',
      minHeight: 130, maxHeight: 130,
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
    }}>
      {/* Inline keyframes for the drifting fog band. Local to the
          component because the rest of RaidCombat sets animations
          via inline strings already; no global stylesheet for it.
          translateX % is relative to the BAND's own width (38% of the
          bar), so the range has to be wide enough that the band's dense
          CENTER sweeps the full bar: -55% puts the center just off the
          left edge, 218% puts it just off the right (was -45% → 145%,
          which left the right ~quarter of the bar permanently clear). */}
      {hasFog && (
        <style>{`
          @keyframes mist-veil-drift {
            0%   { transform: translateX(-55%); }
            50%  { transform: translateX(218%); }
            100% { transform: translateX(-55%); }
          }
        `}</style>
      )}
      {/* Inkfall blackout — two short, unevenly-spaced dark beats per cycle so
          the bar drops dark "randomly" rather than on a steady pulse. */}
      {hasInk && (
        <style>{`
          @keyframes rc-inkfall {
            0%, 20%   { opacity: 0; }
            25%, 31%  { opacity: ${inkOpacity}; }
            36%, 67%  { opacity: 0; }
            72%, 77%  { opacity: ${inkOpacity}; }
            82%, 100% { opacity: 0; }
          }
        `}</style>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexShrink: 0 }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: hardenedArmed ? '#9fb2c8' : '#fbbf24' }}>
          {hardenedArmed ? 'Plated — Tap Twice' : 'Lock Your Shot'}
        </p>
        {afflictionLabel ? (
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#c084fc', textShadow: '0 0 8px rgba(192,132,252,0.5)' }}>
            ⚠ {afflictionLabel}
          </p>
        ) : (
          <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#5a7a9a' }}>
            Gold = Crit
          </p>
        )}
      </div>

      {/* The bar itself — same DOM as the old AimPanel so the
          existing indicator/zone/flash animation hooks keep working
          without any ref reshuffling. */}
      {/* ── WHY THE NEEDLE IS NOT INSIDE THE BAR ──────────────────────────
          The bar clips its contents with `overflow: hidden` AND has rounded
          corners, and that combination is poison for a thing that moves every
          frame. A rounded clip cannot be applied by the compositor, so a
          promoted layer underneath one gets re-rasterised on every frame
          instead of simply being moved — which looks exactly like that one
          element running at half the frame rate while everything around it is
          fine. Nothing else in the bar moves fast enough to show it.

          So the needle lives OUTSIDE the clip, in a wrapper that draws nothing,
          laid over the bar at the same size. It never needed clipping anyway:
          it travels 0 to 100% of the bar's own width and stops there. Everything
          that DOES need clipping — the fog band, the flash, the decoys, the
          target zone — stays inside. */}
      <div style={{ position: 'relative' }}>
      <div style={{
        position: 'relative', height: 44, borderRadius: 10, overflow: 'hidden',
        // ── DEPTH, INSTEAD OF A FLAT BOX ────────────────────────────────
        //
        // It was one flat fill with a hairline round it, which read as a
        // placeholder beside the instrument it governs. A gradient base, a lit
        // top edge and an inset shadow give it the same "cut into the deck"
        // read the rest of the fight's furniture has — and the FX layer above
        // it has something to sit IN rather than on.
        background: 'linear-gradient(180deg, rgba(3,7,13,0.86) 0%, rgba(8,14,22,0.7) 46%, rgba(2,5,10,0.9) 100%)',
        border: '1px solid rgba(255,255,255,0.16)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -8px 16px rgba(0,0,0,0.5)',
      }}>
        <div ref={flashRef} style={{
          position: 'absolute', inset: 0, opacity: 0, background: 'transparent',
          // zIndex 5 sits above the Mist Veil fog (zIndex 4) so the
          // punch-on-lock flash always reads cleanly, even when the
          // fog is at its densest. Was 3; bumped 2026-05-29 when fog
          // landed.
          pointerEvents: 'none', zIndex: 5,
        }} />
        {/* Same track trick for the target band: it drifts every frame on most
            raids, and its width is built out of constants and never changes. */}
        <div ref={zoneTrackRef} aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '100%', pointerEvents: 'none', zIndex: 1, willChange: 'transform' }}>
        <div ref={zoneRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(HIT_W + GRAZE_W) * 2 * 100}%` }}>
          <div style={{ position: 'absolute', inset: '3px 0', background: 'rgba(148,163,184,0.15)', borderRadius: 4 }} />
          <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${(GRAZE_W / (HIT_W + GRAZE_W)) * 50}%`, width: `${(HIT_W / (HIT_W + GRAZE_W)) * 100}%`, background: 'rgba(74,222,128,0.22)' }} />
          {/* Gold crit band at its real width (matches the practice bar),
              with the hairline kept on top as the aim focus. Pulses while
              Sharpshot is live. */}
          <div ref={critBandRef} className={sharpshotActive ? 'rc-sharp-band' : undefined} style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${50 - critBandPct / 2}%`, width: `${critBandPct}%`, background: sharpshotActive ? 'rgba(251,191,36,0.62)' : 'rgba(251,191,36,0.45)', borderRadius: 2 }}>
            {/* Aim hairline lives INSIDE the band so it rides the seam when
                Rolling Plate drifts it (and sits dead center otherwise). */}
            <div style={{ position: 'absolute', top: '14%', bottom: '14%', left: 'calc(50% - 1px)', width: 2, background: '#fbbf24' }} />
          </div>
        </div>
        </div>
        {/* False Colors — drifting DECOY bands (narrower than the real target,
            crimson/danger). The RAF positions each via decoyElRefs; locking on
            one duds the shot. Hidden until the RAF places it. */}
        {Array.from({ length: Math.max(0, Math.min(2, decoyCount ?? 0)) }).map((_, i) => (
          <div key={`decoy-${i}`} aria-hidden
            ref={el => { if (decoyElRefs) decoyElRefs.current[i] = el }}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${DECOY_HALF * 2 * 100}%`, zIndex: 1, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '4px 0', background: 'rgba(239,68,68,0.2)', borderRadius: 4 }} />
            <div style={{ position: 'absolute', top: '4px', bottom: '4px', left: '24%', width: '52%', background: 'rgba(239,68,68,0.5)', borderRadius: 2 }} />
            <div style={{ position: 'absolute', top: '22%', bottom: '22%', left: 'calc(50% - 1px)', width: 2, background: '#fca5a5' }} />
          </div>
        ))}
        {/* Mist Veil overlay — The Cartographer's raid ability. A semi-opaque
            fog band drifts back-and-forth across the bar, briefly
            covering the gold critical center. Sits above the zone
            and indicator (zIndex 4) but BELOW the lock-flash (zIndex
            3 → bumped to 5 below so the punch-on-lock isn't muted
            by the fog). pointerEvents:none keeps taps falling through
            to the parent panel. */}
        {hasFog && (
          <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none', overflow: 'hidden' }}>
            <div style={{
              position: 'absolute', top: -2, bottom: -2,
              width: '38%',
              background: `linear-gradient(90deg,
                rgba(220,232,242,0) 0%,
                rgba(220,232,242,${0.18 * fogOpacity}) 15%,
                rgba(220,232,242,${0.92 * fogOpacity}) 50%,
                rgba(220,232,242,${0.18 * fogOpacity}) 85%,
                rgba(220,232,242,0) 100%
              )`,
              // No blur on a layer that TRANSLATES every frame — it would
              // re-rasterize per frame ON THE AIM BAR, the most RAF-sensitive
              // surface in the game. The gradient's own soft edges carry the
              // fog read; the drift + density (the mechanic) are untouched.
              animation: 'mist-veil-drift 1.6s ease-in-out infinite',
            }} />
          </div>
        )}
        {/* Inkfall blackout — a full-bar dark veil at zIndex 4 (over the zone +
            needle, under the lock-flash at 5) that pulses dark on the keyframe. */}
        {hasInk && (
          <div aria-hidden style={{
            position: 'absolute', inset: 0, zIndex: 4, pointerEvents: 'none',
            borderRadius: 10, background: '#02060c',
            animation: 'rc-inkfall 3.4s ease-in-out infinite',
          }} />
        )}
      </div>
      {/* THE JUICE. In the wrapper rather than the bar, so a lock burst falls
          off the edges instead of being cut off square by the rounded clip —
          and so it is never an ancestor of, or clipped with, the needle. */}
      <AimBarFx
        active
        handleRef={aimFxRef}
        read={aimFxRead}
      />
      {/* THE NEEDLE, over the bar and outside its clip. Same insets as the
          contents it used to sit among, so nothing about where it appears has
          changed — only what has to happen to move it.

          The track is exactly as wide as the bar, which is what lets a
          PERCENTAGE transform mean a percentage of the bar: 50% of a full-width
          track is half the bar, so there is no width to measure and nothing to
          cache or go stale. The needle hangs at its left edge, pulled back half
          its own width so it is centred on the position rather than starting
          at it. */}
      <div ref={needleTrackRef} aria-hidden style={{ position: 'absolute', top: 2, bottom: 2, left: 0, width: '100%', pointerEvents: 'none', zIndex: 6, willChange: 'transform' }}>
        <div ref={indicatorRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, marginLeft: -2, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)' }} />
      </div>
      </div>

      {/* Footer hint — when the fog's up, swap to a fog-specific cue
          so the player understands why the bar is blurring out. */}
      <p className="font-karla" style={{ fontSize: '0.6rem', color: hasFog || hasInk ? '#7a9ab5' : '#5a7a9a', textAlign: 'center', flexShrink: 0 }}>
        {hasFog
          ? 'Lock through the mist. The gold center won\'t stay visible.'
          : hasInk
          ? 'The dark keeps swallowing the bar. Lock by rhythm.'
          : 'Tap LOCK when the marker hits the gold center.'}
      </p>
    </div>
  )
}

// Single full-width Lock button that occupies the ActionMenu's slot
// during aiming. Mirrors ActionMenu's CircleBtn column structure EXACTLY
// — flex column with the same 58px button slot, same 5px gap, same
// 0.62rem caption span below — so the browser computes the same
// natural height across devices. A hardcoded `height: 72` was close on
// most devices but off by a few pixels wherever default line-height
// differs from 1.2; flex: 1 on the battle stage then ate or surrendered
// the delta and the UI visibly shifted as the row swapped in. The
// caption text is transparent — it's only there to reserve the same
// vertical space CircleBtn's "Dodge"/"Fire" labels would have.
function InlineLockButton({ onLock }: { onLock: () => void }) {
  return (
    // zIndex + own compositing layer: the button sits directly under the heavy
    // framer-motion battle stage (+ the RAF-animated aim bar). On iOS WebKit
    // that composited neighbour offsets hit-testing near the boundary, so taps
    // on the TOP of the button miss and land "slightly below" instead. Lifting
    // the button onto its own layer (willChange:transform) + above the bleed
    // (zIndex) aligns the tap target with the visual. It's a leaf, not an
    // ancestor of the fixed Nav/TabBar, so it doesn't trip the iOS PWA
    // fixed-positioning regression.
    <div style={{ position: 'relative', zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
            // Desktop keyboard: Space locks too (lib/spaceAction dispatcher,
            // installed for the combat's lifetime below RaidCombat's state).
            data-space-action
            // pointerdown, not click — iOS synthesizes click ~100-200 ms
            // after the finger lands, which on a precision timing tap
            // reads as the aim bar "robbing" the player. Mirrors the
            // fishing Reel In / Cast buttons.
            onPointerDown={(e) => { e.preventDefault(); onLock() }}
            className="font-cinzel font-700 uppercase tracking-[0.14em]"
            style={{
              width: '100%', height: 58,
              borderRadius: 14,
              background: '#4ade80', color: '#0a1422',
              border: 'none', fontSize: '0.95rem', cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(74,222,128,0.35), inset 0 -3px 0 rgba(0,0,0,0.15)',
              touchAction: 'manipulation',
              // Own compositing layer so iOS hit-tests the button where it's drawn.
              willChange: 'transform', position: 'relative', zIndex: 20,
            }}
          >
            Lock Shot <span className="key-hint" style={{ verticalAlign: 2 }}>SPACE</span>
          </motion.button>
          {/* Invisible caption — matches CircleBtn's label slot so the
              column's natural height equals an ActionMenu column's. */}
          <span aria-hidden className="font-karla font-700 uppercase tracking-[0.06em]" style={{
            fontSize: '0.62rem', color: 'transparent', userSelect: 'none',
          }}>
            Lock
          </span>
        </div>
      </div>
    </div>
  )
}

function ActionTilesRow({ playerAction, enemyAction, aimResult, firstActor }: {
  playerAction: EnemyAction | null
  enemyAction: EnemyAction | null
  aimResult: ShotResult | null
  firstActor: Actor | null
}) {
  const labelFor = (a: EnemyAction | null) =>
    a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'mega' ? 'Mega' : a === 'reload' ? 'Reload' : a === 'dodge' ? 'Dodge' : a === 'special' ? 'Special' : a === 'ultimate' ? 'Ultimate' : '—'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
      <ActionTile label="YOU" action={labelFor(playerAction)} aim={aimResult} first={firstActor === 'player'} color="#4ade80" />
      <ActionTile label="ENEMY" action={labelFor(enemyAction)} first={firstActor === 'enemy'} color="#ef4444" />
    </div>
  )
}

function ActionTile({ label, action, aim, first, color }: {
  label: string; action: string; aim?: ShotResult | null; first?: boolean; color: string
}) {
  return (
    <div style={{
      padding: '0.75rem 0.6rem', borderRadius: 12,
      background: '#0a1422', border: `2px solid ${first ? color : '#1f2e42'}`,
      textAlign: 'center', position: 'relative',
    }}>
      {first && <span style={{
        position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.62rem', background: color, color: '#0a1422', padding: '2px 9px',
        borderRadius: 999, fontFamily: 'var(--font-karla)', fontWeight: 700, letterSpacing: '0.1em',
      }}>FIRST</span>}
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.62rem', color: '#7a8aa0' }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: '#ffffff', lineHeight: 1.1 }}>{action}</p>
      {aim && <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: aim === 'critical' ? '#fbbf24' : aim === 'hit' ? '#4ade80' : aim === 'graze' ? '#94a3b8' : '#6b7280', marginTop: 3 }}>{aim.toUpperCase()}</p>}
    </div>
  )
}

