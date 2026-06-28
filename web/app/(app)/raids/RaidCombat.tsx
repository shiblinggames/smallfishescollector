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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { BroadsideEnemy, EnemyAction } from '@/lib/bossRaids'
import { raidDamageProfile, type RaidMods } from '@/lib/expeditions'
import { MEGA_CHARGE_COST, type ShipAugment } from '@/lib/shipAugments'
import { getActiveEffects, getRaidItem } from '@/lib/raidItems'
import { describeEffect, effectTone, type TideEffect } from '@/lib/tides'
import { getRepairKit, rollRepairKitHeal, repairKitRange } from '@/lib/repairKits'
import { classForSlug, CLASSES, currentMilestone, type AnyClassDef } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { type AffixDef } from '@/lib/raidAffixes'
import { getShipClass, aggregateShipClasses } from '@/lib/shipClasses'
import { vibrate } from '@/lib/haptics'
import CharacterAvatar from '@/components/CharacterAvatar'

type ShotResult = 'miss' | 'graze' | 'hit' | 'critical'
type SubPhase   = 'await_input' | 'aiming' | 'revealing' | 'resolving' | 'flares' | 'done'
type Actor      = 'player' | 'enemy'

// Cannonball cap. MAX_CHARGES is the enemy's cap AND the volley cost (a volley
// spends VOLLEY_COST cannonballs for a double-shot). The PLAYER's cap can be
// raised by the Locker Upgrade "Extra Cannonball Rack" (bonusChargeSlots prop):
// they stockpile more, but the volley still costs VOLLEY_COST — the extra is
// reserve.
const MAX_CHARGES = 3
const VOLLEY_COST = MAX_CHARGES
const PLAYER_COLOR = '#4ade80'
const ENEMY_COLOR  = '#ef4444'

// Incendiary Cannonball: a burn proc lasts this many enemy turns and ticks for
// this fraction of the hit that lit it (locked at application, "constant fixed
// damage scaled to your damage").
const BURN_TURNS = 2
const BURN_TICK_PCT = 0.30
// Per-tick burn is capped at this fraction of the TARGET's max HP, so a huge
// crit/volley doesn't also burn for an unbounded chunk (the DoT scaled 1:1 with
// hit damage before, which ran away on high-damage builds). Normal hits stay
// at the 30% of the hit; only hits above ~1/3 of the target's HP get clamped.
const BURN_CAP_PCT = 0.10
const BURN_COLOR = '#fb923c'
const FREEZE_COLOR = '#7dd3fc'

// ─── Math helpers ──────────────────────────────────────────────────────────────

const d20 = () => Math.floor(Math.random() * 20) + 1

// One-line BEHAVIORAL HINT for the enemy stats popup. Deliberately fuzzy: it
// nudges the player toward what to watch for (volley-prone, slippery,
// aggressive, etc.) without spelling out the per-turn pattern, which is the
// "read the rhythm" puzzle they're supposed to discover in combat. Tuned by
// looking at the actual enemy patterns in lib/bossRaids.ts; reorder the
// branches if a new pattern shape needs its own tell.
function enemyBehaviorHint(pattern: EnemyAction[]): string {
  const n = pattern.length || 1
  const c = { reload: 0, fire: 0, volley: 0, dodge: 0, repair: 0, mega: 0 }
  for (const a of pattern) c[a]++
  const aggR    = (c.fire + c.volley) / n
  const dodgeR  = c.dodge / n
  const reloadR = c.reload / n

  if (c.volley >= 2)                          return 'Loves a heavy volley. More than one per cycle.'
  if (c.volley === 1 && reloadR >= 0.5)       return 'Patient. Winds up long, then lands a heavy volley.'
  if (dodgeR >= 0.25 && c.volley >= 1)        return 'Slippery and dangerous. Tends to dodge, then strike heavy.'
  if (dodgeR >= 0.25)                         return 'Slippery. Tends to dodge your shots.'
  if (aggR >= 0.55)                           return 'Aggressive. Trades shots constantly.'
  if (reloadR >= 0.6)                         return 'Methodical. Long reloads before each strike.'
  return 'Steady rhythm. Trades shot for shot.'
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

function rollSpeed(shipSpeed: number, navigation: number) {
  // Speed roll uses 1d30 (not d20 like dodge) — deliberately more random
  // than dodge so even a high-Compass build can't fully eliminate
  // turn-order swing. A +10 advantage that won 94% of the time on d20
  // now wins ~77% on d30; a +5 advantage drops from 81% to 64%. Tuned
  // 2026-05-29 alongside the Compass nerf (0.25 → 0.20) to flatten
  // late-game determinism without invalidating speed-built captains.
  return (Math.floor(Math.random() * 30) + 1) + shipSpeed + Math.floor(navigation / 10)
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

function getShotResult(pos: number, zoneCenter: number, critW: number = CRIT_W): ShotResult {
  const grazeL = zoneCenter - HIT_W - GRAZE_W
  const grazeR = zoneCenter + HIT_W + GRAZE_W
  const hitL   = zoneCenter - HIT_W
  const hitR   = zoneCenter + HIT_W
  const critL  = zoneCenter - critW
  const critR  = zoneCenter + critW
  if (pos >= critL && pos <= critR)   return 'critical'
  if (pos >= hitL  && pos <= hitR)    return 'hit'
  if (pos >= grazeL && pos <= grazeR) return 'graze'
  return 'miss'
}

// ─── Public props ──────────────────────────────────────────────────────────────

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
  /** Fires with each damage value the player lands, so the parent can track
   *  the biggest hit of the run (career stat). */
  onPlayerHit?: (dmg: number) => void
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
  atmosphere?: 'dusk' | 'sunset' | 'overcast' | 'fog'
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
  enemy, affix, isElite = false,
  isBoss, shipImageUrl, shipFilter, enemyArtFilter = '', bonusChargeSlots = 0, shipName, playerLabel,
  playerCharacterColor, playerEquippedHat,
  playerAvatarBg, playerAvatarBorder,
  playerHpMax, playerHp: initialPlayerHp,
  shipMinDamage, shipSpeed, totalPower, totalNavigation,
  totalFortune = 0,
  equippedRaidItems,
  classDamageMult = 1,
  shipClasses = {},
  equippedRepairKit,
  killReward,
  onEnemyDefeated, onPlayerDefeated, onLeave, onPlayerHit,
  initialCharges = 0,
  anchorSaveAvailable = false, onAnchorSave,
  raidMods, riskyFlee = false, fleeSignal, fleeNav,
  tideEffects = [],
  atmosphere = 'dusk',
  crewMembers = [], usedAbilityIds, abilitiesRefreshed = false, onAbilityFired,
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
    let aimSpeedMult  = 1
    let zoneSpeedMult = 1
    let aimBlackout   = 0
    // All-or-Nothing curse: damage mult on non-crit shots (hit + graze).
    let noncritDmgMult = 1
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
    for (const e of tideEffects) {
      switch (e.kind) {
        case 'damageMult':            dmgMult *= e.mult; break
        case 'fireDmgMult':           fireDmgMult *= e.mult; break
        case 'volleyDmgMult':         volleyDmgMult *= e.mult; break
        case 'bossDamageMult':        bossDmgMult *= e.mult; break
        case 'bossVolleyDmgMult':     bossVolMult *= e.mult; break
        case 'critChanceBonus':       critBonus += e.chance; break
        case 'critZoneScale':         critZoneMult *= e.mult; break
        case 'critDmgMult':           critDmgMult *= e.mult; break
        case 'executeThreshold':      executeThreshold = Math.max(executeThreshold, e.pct); break
        case 'lifestealPct':          lifestealPct += e.pct; break
        case 'retaliatePct':          retaliatePct += e.pct; break
        case 'lowHpDamage':           lowHpDamage = Math.max(lowHpDamage, e.maxBonus); break
        case 'chargeCarryover':       chargeCarryover = Math.max(chargeCarryover, e.cap); break
        case 'fightShield':           fightShieldPct = Math.max(fightShieldPct, e.pctMax); break
        case 'incomingDmgMult':       inDmgMult *= e.mult; break
        case 'incomingCritReduction': inCritReduce += e.chance; break
        case 'dodgeBonus':            dodgeBonus += e.chance; break
        case 'speedDelta':            speedDelta += e.n; break
        case 'startCharges':          chargesStart += e.n; break
        case 'startHpDelta':
          // Apply nextFight scope at every mount; boss scope only on boss.
          if (e.scope === 'nextFight') hpStartDelta += e.n
          else if (e.scope === 'boss' && isBoss) hpStartDelta += e.n
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
        case 'aimSpeedMult':          aimSpeedMult *= e.mult; break
        case 'zoneSpeedMult':         zoneSpeedMult *= e.mult; break
        case 'aimBlackout':           aimBlackout = Math.min(0.95, Math.max(aimBlackout, e.intensity)); break
        case 'noncritDmgMult':        noncritDmgMult *= e.mult; break
        case 'instantHeal': case 'fullHeal': case 'doubloonsAtRaidEnd': break // handled elsewhere
      }
    }
    return {
      dmgMult, fireDmgMult, volleyDmgMult, bossDmgMult, bossVolMult,
      critBonus, critZoneMult, inDmgMult, inCritReduce,
      dodgeBonus, speedDelta,
      chargesStart, hpStartDelta, everyFightHeal, everyFightHealPct,
      reloadProc, guaranteedDodgeBank,
      enemyHpScaleMult, enemyChargesDelta,
      aimFog, aimSpeedMult, zoneSpeedMult, aimBlackout, noncritDmgMult,
      critDmgMult, executeThreshold, lifestealPct,
      retaliatePct, lowHpDamage, chargeCarryover, fightShieldPct,
    }
  }, [tideEffects, isBoss])
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
  // greys out ALL crew ability cards (including the repair kit) once any one
  // of them fires this turn, so the player can't burst all four in a row.
  const [oneAbilityUsedThisTurn, setOneAbilityUsedThisTurn] = useState(false)
  // Sharpshot — next N shots have a wider crit zone. Consumed by a shot
  // landing (any of miss/graze/hit/critical — the buff applies *to* the roll).
  const [sharpshotBuff, setSharpshotBuff] = useState<{ multiplier: number; shotsLeft: number } | null>(null)
  // Live crit half-width: CRIT_W scaled by tide critZoneScale and an active
  // Sharpshot buff. ONE source of truth for the RAF tick's needle color,
  // lockShot's judgment, and the gold band AimBarInline draws — previously
  // the tick colored against base CRIT_W while lockShot judged the widened
  // band, so the needle could glow green at the lock moment yet resolve
  // critical. Ref mirror lets the RAF read it without restarting the tick.
  const liveCritW = CRIT_W * tide.critZoneMult * (sharpshotBuff ? 1 + sharpshotBuff.multiplier : 1)
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
  // Upgrade slots. Enemies always cap at MAX_CHARGES.
  const playerMaxCharges = MAX_CHARGES + Math.max(0, bonusChargeSlots)
  const [playerHp, setPlayerHp]       = useState(() =>
    Math.max(0, Math.min(playerHpMax, initialPlayerHp + tide.hpStartDelta + tide.everyFightHeal + Math.round(tide.everyFightHealPct * playerHpMax)))
  )
  const [enemyHp, setEnemyHp]         = useState(() => Math.max(1, Math.round(enemy.hpBase * tide.enemyHpScaleMult)))
  // The enemy's ACTUAL max HP this fight = base × any enemyHpScale (Barnacled
  // Hull curse, half-HP tides). Drives the HP bar denominator + stat sheet so
  // they don't read against the raw base while enemyHp is the scaled value.
  const enemyHpMax = Math.max(1, Math.round(enemy.hpBase * tide.enemyHpScaleMult))
  const [playerCharges, setPlayerCharges] = useState(() =>
    Math.max(0, Math.min(playerMaxCharges, tide.chargesStart + initialCharges))
  )
  // Mirror for the kill callback, which reports leftover charges to the host
  // (Powder Hoard carryover) from a setTimeout closure.
  const playerChargesRef = useRef(playerCharges)
  playerChargesRef.current = playerCharges
  const [enemyCharges, setEnemyCharges]   = useState(() =>
    Math.max(0, Math.min(MAX_CHARGES, (enemy.startCharges ?? 0) + tide.enemyChargesDelta))
  )
  const [subPhase, setSubPhase]       = useState<SubPhase>('await_input')
  const [playerAction, setPlayerAction] = useState<EnemyAction | null>(null)
  const [enemyAction, setEnemyAction]   = useState<EnemyAction | null>(null)
  // Last action the player committed to (set when the turn fully resolves).
  // Used to block back-to-back dodges so dodge-camping isn't viable.
  const [lastPlayerAction, setLastPlayerAction] = useState<EnemyAction | null>(null)
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
  // grey default.
  useEffect(() => {
    if (!nameplateFx || nameplateFxKey === 0) return
    const enemyRestBorder =
      enemyPhase === 2 ? '#ef4444'
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
  const [critFlash, setCritFlash]     = useState(false)
  // Brief red wash when the boss flips to phase 2 (challenge-mode Pete).
  // Same shape as critFlash — fixed full-screen radial gradient, ~400ms.
  const [phaseFlash, setPhaseFlash]   = useState(false)
  const [critFreeze, setCritFreeze]   = useState(false)   // briefly freezes the aim bar at the lock moment
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
  const [megaSplats, setMegaSplats] = useState<{ key: number; color: string; items: { id: number; text: string; size: number; dx: number; dy: number; delay: number }[] } | null>(null)
  // Crew-ability cast cue — themed portrait banner + ring that pops over the
  // stage so firing ANY ability has an unmistakable "you did something" tell.
  const [abilityCast, setAbilityCast] = useState<{ key: number; label: string; name: string; color: string; image?: string | null; emoji?: string } | null>(null)
  // Enemy status aura — a themed glow over the enemy hull while a tide/raid-item
  // status (burn, freeze) procs on it, so those effects read on the ship itself.
  const [enemyAura, setEnemyAura] = useState<{ key: number; kind: 'burn' | 'freeze' | 'snared' } | null>(null)
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
  const [playerAura, setPlayerAura] = useState<{ key: number } | null>(null)
  // Dodge whoosh — afterimage + speed lines on whichever ship slips a shot.
  const [dodgeFx, setDodgeFx] = useState<{ key: number; actor: Actor } | null>(null)

  // Aim bar state — RAF driven during 'aiming' subphase
  const firePosRef  = useRef(0)
  const fireDirRef  = useRef(1)
  const zonePosRef  = useRef(0.5)
  const zoneDirRef  = useRef(1)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const zoneRef      = useRef<HTMLDivElement>(null)
  const barFlashRef  = useRef<HTMLDivElement>(null)
  const rafRef       = useRef(0)

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
  // Boss phase tracking. The ref drives combat reads (pickEnemyAction,
  // damage rolls, mitigation checks) without re-renders; the state
  // mirror drives the persistent visual treatment (crimson nameplate +
  // PHASE 2 badge + red ship halo) so the player can never lose track
  // of which phase they're in. Phase 1 enemies never flip — both stay
  // at 1 for the whole fight.
  const enemyPhaseRef      = useRef<1 | 2>(1)
  const [enemyPhase, setEnemyPhase] = useState<1 | 2>(1)
  const turnRef            = useRef(1)
  const [turn, setTurn]    = useState(1)
  // Davy's Heavy Cannon ramp — the per-fight +damage stack. Mirrors the
  // resolver's `rampPerTurn * (turn - 1)` so the hull heat badge shows the
  // exact live bonus. Resets to 0 each new enemy (turn resets to 1).
  const rampPerTurn = useMemo(
    () => getActiveEffects(equippedRaidItems).filter(e => e.type === 'ramp_damage_per_turn').reduce((a, e) => a + e.value, 0),
    [equippedRaidItems],
  )
  const rampBonusPct = Math.round(rampPerTurn * Math.max(0, turn - 1) * 100)
  const critFreezeRef      = useRef(false)
  useEffect(() => { critFreezeRef.current = critFreeze }, [critFreeze])
  // Ability per-turn reset effect — every new player turn clears the
  // one-ability-per-turn lock and ticks Snare's finite duration down.
  // -1 (rest_of_fight) sticks regardless. Skips the initial mount
  // (turn=1 doesn't need a reset).
  const turnInitRef = useRef(true)
  useEffect(() => {
    if (turnInitRef.current) { turnInitRef.current = false; return }
    setOneAbilityUsedThisTurn(false)
    setSnareDodgeTurns(prev => (prev > 0 ? prev - 1 : prev))
  }, [turn])

  // Ship shake / recoil controls — match the existing real-time raid keyframes
  const enemyShakeCtrl  = useAnimation()
  const playerShakeCtrl = useAnimation()
  const playerRecoilCtrl = useAnimation()
  // Camera shake — jolts the whole battle SCENE (not the action menu / log) on
  // big impacts. Crit also starts with a brief "hold then erupt" (a hit-stop
  // beat) + a tiny scale punch; volley is a smaller pure shake. Only crit /
  // volley fire it, per the juice rule (nothing screen-wide on normal hits).
  const stageShakeCtrl = useAnimation()
  const cameraShake = useCallback((kind: 'crit' | 'volley' | 'nuke') => {
    if (kind === 'nuke') {
      // Heaviest shake — the silo impact. Bigger throw, longer settle, a real heave.
      stageShakeCtrl.start({
        x:     [0, 0, -13, 12, -10, 8, -6, 4, -2, 0],
        y:     [0, 0, 6, -5, 4, -3, 2, -1, 0, 0],
        scale: [1, 1, 1.055, 0.992, 1.03, 0.996, 1.015, 1, 1, 1],
        transition: { duration: 0.72, times: [0, 0.12, 0.26, 0.4, 0.52, 0.64, 0.76, 0.86, 0.94, 1], ease: 'easeOut' },
      })
      return
    }
    if (kind === 'crit') {
      stageShakeCtrl.start({
        x:     [0, 0, -7, 6, -5, 3, -2, 0],
        y:     [0, 0, 3, -2, 2, -1, 0, 0],
        scale: [1, 1, 1.03, 0.997, 1.012, 1, 1, 1],
        // The first two keyframes sit still (the hit-stop hold) before the jolt.
        transition: { duration: 0.4, times: [0, 0.18, 0.32, 0.46, 0.6, 0.74, 0.88, 1], ease: 'easeOut' },
      })
    } else {
      stageShakeCtrl.start({
        x: [0, -3.5, 3, -2.5, 1.5, 0],
        y: [0, 1.5, -1, 1, 0, 0],
        transition: { duration: 0.26, ease: 'easeOut' },
      })
    }
  }, [stageShakeCtrl])
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
      // hit-shake (0.45s)
      enemyShakeCtrl.start({
        x:      [0, -6, 6, -4, 3, -1, 0],
        rotate: [0, -1, 0.8, -0.5, 0.3, 0, 0],
        transition: { duration: 0.45 },
      })
    }
  }, [enemyShakeKey, enemyShakeKind, enemyShakeCtrl])
  useEffect(() => {
    if (playerShakeKey === 0) return
    // player-hit (0.5s)
    playerShakeCtrl.start({
      x:      [0, 9, -9, 6, -4, 2, 0],
      rotate: [0, 1.2, -1.2, 0.8, -0.5, 0.2, 0],
      transition: { duration: 0.5 },
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
  const enemyFrozenRef = useRef(false)
  const enemyFreezePendingRef = useRef(false)
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
  // holds where to go on a clean getaway so success honours where the player
  // was trying to head.
  // Nav divisor mirrors rollSpeed's nav/10 (tight d20 numbers, no late-game
  // determinism); tide speedDelta folds into effective speed same as the
  // turn-order roll. Tune DC base / boss penalty here.
  const fleeSpeed    = Math.max(1, shipSpeed + tide.speedDelta)
  const fleeNavBonus = Math.floor(totalNavigation / 10)
  const fleeBonus    = fleeSpeed + fleeNavBonus
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
        const next = Math.max(0, playerHpRef.current - dmg)
        setPlayerHp(next)
        setPHitsplat({ key: Date.now(), text: `-${dmg}`, color: '#ef4444' })
        setPlayerShakeKey(k => k + 1)
        // Clear the splat after the standard hold (matches the in-combat
        // SPLAT_HOLD_MS in resolveTurn). The flee path used to forget this
        // cleanup, leaving the "-N" number stuck on the ship until the next
        // turn's splat clobbered it.
        setTimeout(() => setPHitsplat(null), 480)
        setResolveLog(prev => [...prev, next <= 0
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
    enemyBurnRef.current = { turns: 0, dmg: 0 }; enemyFrozenRef.current = false; enemyFreezePendingRef.current = false; snareBlockedRef.current = false; carapaceLoggedRef.current = false
    playerBurnRef.current = { turns: 0, dmg: 0 }; playerFrozenRef.current = false; playerFreezePendingRef.current = false
    // "First Cut": enemies in the Tollmaster raid open LOADED (enemy.startCharges
    // ≥ 1) so their fire-first patterns shoot on turn 1. The player mirrors it
    // via Spet's drops — a CHANCE to open each fight with one chambered (Spet's
    // Primer 50%, Tollmaster's Primer 100%). Roll the best chance among equipped
    // items; on a proc, start with 1. Every other raid opens both sides cold.
    const startChargeChance = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'start_charge_chance')
      .reduce((a, e) => Math.max(a, e.value), 0)
    const playerStartCharges = startChargeChance > 0 && Math.random() < startChargeChance ? 1 : 0
    // Fold in the start-charge TIDE (e.g. "+2 cannonballs next fight"). The
    // NO_CHARGES sentinel (-99) drives the total below 0 → clamps to 0 ("start
    // with 0"). Without this the reset wiped the tide's opening cannonballs.
    // Powder Hoard carryover (initialCharges) folds in on top of any Primer
    // proc + start-charge tide, capped to the magazine.
    setPlayerCharges(Math.max(0, Math.min(playerMaxCharges, playerStartCharges + chargesStartRef.current + initialCharges)))
    setEnemyCharges(Math.max(0, Math.min(MAX_CHARGES, (enemy.startCharges ?? 0) + enemyChargesDeltaRef.current)))
    guaranteedDodgeLeftRef.current = guaranteedDodgeBankRef.current
    // Stormward: reform the fight shield into the soak pool. Only when active,
    // so non-boon raids never touch the Abyssal Tide pool here.
    if (fightShieldMaxRef.current > 0) {
      abyssalShieldRef.current = fightShieldMaxRef.current
      setAbyssalShieldHp(fightShieldMaxRef.current)
    }
    setSubPhase('await_input')
    setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
    setLastPlayerAction(null)
    const intro = isBoss
      ? `${enemy.name} heaves into view!`
      : `A ${enemy.name} draws alongside!`
    // Themed-ability tell: one-time note so the player knows why hits land
    // soft / why the bar fogs over. Each ability gets its own line so an
    // enemy carrying both reads cleanly in the log.
    const introLines = [intro]
    // Host-supplied opener (Gauntlet: 'Crew abilities refreshed.' on a refresh round).
    if (openingNote) introLines.push(openingNote)
    if ((enemy.damageReduction ?? 0) > 0) {
      introLines.push(`Its ${(enemy.abilityName ?? 'armour').toLowerCase()} soaks fire and graze. Volleys break through.`)
    }
    if ((enemy.aimFogDensity ?? 0) > 0) {
      introLines.push(`A ${(enemy.aimFogName ?? 'mist').toLowerCase()} drifts over your aim bar. Lock by rhythm, not by sight.`)
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
    setPHitsplat(null); setEHitsplat(null); setAbilityCast(null); setEnemyAura(null)
    setEnemyMuzzle(null); setPlayerImpact(null); setPlayerAura(null); setDodgeFx(null)
    setEnemyBurning(false); setEnemyFrozen(false); setEnemyDeflect(0)
    setPlayerBurning(false); setPlayerFrozen(false)
    enemyPatternIdxRef.current = 0
    enemyPhaseRef.current = 1
    setEnemyPhase(1)
    setEnemySinking(false)  // fresh enemy — clear any leftover sink from a prior fight
    turnRef.current = 1; setTurn(1)
    return () => clearTimeout(promptTimer)
  }, [enemy.id, enemy.name, enemy.hpBase, isBoss])

  // ─── Aim bar RAF (only during 'aiming') ────────────────────────────────────

  useEffect(() => {
    if (subPhase !== 'aiming') return
    let last = performance.now()

    // Zone drift: enemy ship speed sets the pace, player Navigation
    // slows it back down. Gauntlet curses can lurch it (zoneSpeedMult).
    const ZONE_SPEED = enemy.shipSpeed * 0.0008 * (1 / (1 + totalNavigation * 0.015)) * tide.zoneSpeedMult
    // Needle sweep, with the curse multiplier (Racing Tide etc.).
    const NEEDLE_SPEED = INDICATOR_SPEED * tide.aimSpeedMult

    function tick(now: number) {
      const dt = Math.min(now - last, 50)
      last = now
      // Freeze the needle + target zone the moment the player locks a shot so
      // they can clearly see where the indicator landed. Reads from a ref so
      // the freeze takes effect on the next frame (the state closure here is
      // stale once subPhase stays 'aiming').
      if (critFreezeRef.current) { rafRef.current = requestAnimationFrame(tick); return }
      const frames = dt / 16.67

      firePosRef.current += NEEDLE_SPEED * frames * fireDirRef.current
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current = 1 }

      zonePosRef.current += ZONE_SPEED * frames * zoneDirRef.current
      if (zonePosRef.current >= 1 - HIT_W - GRAZE_W) { zonePosRef.current = 1 - HIT_W - GRAZE_W; zoneDirRef.current = -1 }
      if (zonePosRef.current <= HIT_W + GRAZE_W)     { zonePosRef.current = HIT_W + GRAZE_W;     zoneDirRef.current = 1 }

      if (indicatorRef.current) {
        indicatorRef.current.style.left = `calc(${firePosRef.current * 100}% - 2px)`
        const zone = getShotResult(firePosRef.current, zonePosRef.current, liveCritWRef.current)
        const bg = zone === 'critical' ? '#fbbf24'
                 : zone === 'hit'      ? '#4ade80'
                 : zone === 'graze'    ? '#94a3b8'
                 : 'rgba(255,255,255,0.4)'
        indicatorRef.current.style.background = bg
      }
      if (zoneRef.current) {
        zoneRef.current.style.left = `${(zonePosRef.current - HIT_W - GRAZE_W) * 100}%`
        zoneRef.current.style.width = `${(HIT_W + GRAZE_W) * 2 * 100}%`
      }

      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [subPhase, enemy.shipSpeed, totalNavigation, tide.aimSpeedMult, tide.zoneSpeedMult])

  // ─── Enemy AI: pick next action from pattern ───────────────────────────────

  const pickEnemyAction = useCallback((): EnemyAction => {
    // Phase 2 swaps the boss's whole behavior cycle for the alternate
    // pattern in phase2.pattern (more aggressive for Pete). Falls back to
    // the base pattern for phase-1 enemies and any boss without phase2.
    const pattern = enemyPhaseRef.current === 2 && enemy.phase2
      ? enemy.phase2.pattern
      : enemy.pattern
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
    //     cycle until a reload overshoots MAX. Substitute fire (they
    //     have ammo by definition) and DO advance — the wasted reload
    //     becomes the extra shot the cadence was already building toward.
    if ((action === 'fire'   && enemyCharges < 1) ||
        (action === 'volley' && enemyCharges < MAX_CHARGES)) {
      action = 'reload'
    } else if (action === 'reload' && enemyCharges >= MAX_CHARGES) {
      action = 'fire'
      enemyPatternIdxRef.current++
    } else {
      enemyPatternIdxRef.current++
    }
    // Snare ability — enemy can't dodge while the snare is active. Substitute
    // dodge with their highest-value alternative (fire if charged, else
    // reload) so they still have a turn but lose their defensive option.
    if (action === 'dodge' && snareDodgeTurnsRef.current !== 0) {
      action = enemyCharges >= 1 ? 'fire' : 'reload'
      snareBlockedRef.current = true
    }
    return action
  }, [enemy.pattern, enemy.phase2, enemyCharges])

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
  const flareClusterChance = flareTier >= 2 ? 0.42 : 0.24
  const flareFuseScale     = flareTier >= 3 ? 0.82 : flareTier === 2 ? 0.95 : 1.15
  const flarePerMiss = Math.max(enemy.minDmg, Math.round(playerHpMax * 0.045))
  // Apply the barrage outcome, then hand control to the player's turn. Misses
  // chip but never kill outright (floored at 1) — they set up the admiral's
  // follow-up rather than landing the killing blow themselves.
  function onFlareBarrageDone(missed: number) {
    if (missed > 0) {
      const dmg = missed * flarePerMiss
      setPlayerHp(hp => {
        const n = Math.max(1, hp - dmg)
        return n
      })
      setPlayerShakeKey(k => k + 1)
      setPlayerImpact({ key: Date.now(), kind: 'volley' })
      setTimeout(() => setPlayerImpact(null), 700)
      vibrate([0, 40, 30, 60])
      setResolveLog(prev => [...prev, `${missed} flare${missed > 1 ? 's' : ''} caught you out — the screen rakes you for ${dmg}.`])
    } else {
      setResolveLog(prev => [...prev, `Screen read clean — every flare called right.`])
    }
    setSubPhase('await_input')
  }

  // ─── Player action handlers ────────────────────────────────────────────────

  const canFire   = playerCharges >= 1
  const canVolley = playerCharges >= VOLLEY_COST
  // Mega (Man-o-War augment): a full magazine of MEGA_CHARGE_COST (4). Reaching
  // 4 requires the Gauntlet Rack, so the augment is naturally gated behind it.
  const canMega   = !!megaAugment && playerCharges >= MEGA_CHARGE_COST
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

    // Themed cast cue — fires for every ability the instant it lands, so the
    // player gets an immediate "activated something" beat even for the
    // buff/utility abilities that otherwise only write a log line.
    const castKey = Date.now()
    setAbilityCast({ key: castKey, label: ABILITY_CAST_LABEL[def.id] ?? def.name, name: `${crew.name} · ${def.name}`, color: def.color, image: crew.imageUrl, emoji: def.emoji })
    setTimeout(() => setAbilityCast(c => (c && c.key === castKey ? null : c)), 1150)
    vibrate(18)

    // Per-class hull FX alongside the banner: heals sparkle the player hull,
    // a snare claps a jamming shimmer on the enemy (its dodge is locked).
    if (def.id === 'mender' || def.id === 'abyssal_tide') {
      const hk = castKey + 1
      setPlayerAura({ key: hk })
      setTimeout(() => setPlayerAura(a => (a && a.key === hk ? null : a)), 900)
    } else if (def.id === 'snare') {
      const sk = castKey + 2
      setEnemyAura({ key: sk, kind: 'snared' })
      setTimeout(() => setEnemyAura(a => (a && a.key === sk ? null : a)), 900)
    }

    // Dispatch on class id — TS narrows the milestone shape from the
    // per-class table.
    switch (def.id) {
      case 'mender': {
        const mm = m as import('@/lib/crewClasses').MenderMilestone
        const heal = Math.round(playerHpMax * mm.pctMaxHp)
        setPlayerHp(prev => Math.min(playerHpMax, prev + heal))
        playerHpRef.current = Math.min(playerHpMax, playerHpRef.current + heal)
        if (mm.cleanseDebuff) setCleanseDebuffPending(true)
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
        if (sn.disableDodgeTurns === 'rest_of_fight') {
          setSnareDodgeTurns(-1)
          snareDodgeTurnsRef.current = -1
        } else {
          setSnareDodgeTurns(sn.disableDodgeTurns)
          snareDodgeTurnsRef.current = sn.disableDodgeTurns
        }
        const snDur = sn.disableDodgeTurns === 'rest_of_fight'
          ? 'the rest of the fight'
          : `${sn.disableDodgeTurns} turn${sn.disableDodgeTurns === 1 ? '' : 's'}`
        setResolveLog(prev => [...prev, `${crew.name} jams the ${enemy.name}'s helm. No dodging for ${snDur}.`])
        break
      }
      case 'anchor': {
        const an = m as import('@/lib/crewClasses').AnchorMilestone
        setAnchorReductionPct(an.pctReduction)
        anchorReductionRef.current = an.pctReduction
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
        }
        setResolveLog(prev => [...prev, add > 0
          ? `${crew.name} runs the powder up — +${add} cannonball${add === 1 ? '' : 's'} loaded.`
          : `${crew.name} works the powder but comes up empty this time.`])
        break
      }
      // ── Legendary signature abilities ────────────────────────────────
      case 'abyssal_tide': {
        const at = m as import('@/lib/crewClasses').AbyssalTideMilestone
        const heal = Math.round(playerHpMax * at.pctMaxHp)
        setPlayerHp(prev => Math.min(playerHpMax, prev + heal))
        playerHpRef.current = Math.min(playerHpMax, playerHpRef.current + heal)
        // Shield buffer — soaks incoming damage before HP (resolver reads the
        // ref + decrements; state mirror drives the hull glint).
        const shield = Math.round(playerHpMax * at.shieldPctMaxHp)
        setAbyssalShieldHp(prev => prev + shield)
        abyssalShieldRef.current += shield
        if (at.cleanseDebuff) setCleanseDebuffPending(true)
        setResolveLog(prev => [...prev, `${crew.name} calls the abyss: +${heal} HP, ${shield} HP shield.`])
        break
      }
      case 'leviathan': {
        const lv = m as import('@/lib/crewClasses').LeviathanMilestone
        // Single heavy extra shot. Rolls through the standard damage
        // profile so Sharpshot crit-zone buffs / damagePct mods all
        // compound naturally, then multiplied by the milestone's dmgMult.
        // Lv 100 forces the shot to crit.
        const shotResult: ShotResult = lv.autoCrit ? 'critical' : 'hit'
        const dmg = Math.max(1, Math.floor(rollShotDamage(shotResult, shipMinDamage, totalPower) * lv.dmgMult))
        applyAbilityDamage(dmg, `${crew.name} fires a heavy salvo for ${dmg}!`, lv.autoCrit ? 'crit' : 'hit')
        break
      }
      case 'blitz': {
        const bz = m as import('@/lib/crewClasses').BlitzMilestone
        // Frenzy chain — first shot is guaranteed, then roll chainChance
        // after each hit to continue. Hard-cap at 10 shots so an 80%
        // chain can't tail off to 30+ shots in a degenerate run. Each
        // shot rolls through the shared damage profile so Sharpshot /
        // damagePct mods stack normally; Lv 100 forces every shot to crit.
        const shotResult: ShotResult = bz.autoCrit ? 'critical' : 'hit'
        let total = 0
        let shots = 0
        const CHAIN_CAP = 10
        while (shots < CHAIN_CAP) {
          total += Math.floor(rollShotDamage(shotResult, shipMinDamage, totalPower))
          shots++
          if (Math.random() >= bz.chainChance) break
        }
        total = Math.max(1, total)
        applyAbilityDamage(total, `${crew.name} chains ${shots} shot${shots === 1 ? '' : 's'} for ${total}!`, bz.autoCrit ? 'crit' : 'hit')
        break
      }
    }

    setOneAbilityUsedThisTurn(true)
    onAbilityFired?.(crew.id)
  }

  // Shared damage applicator for legendary direct-damage abilities
  // (Leviathan, Blitz). Handles the hitsplat + shake + log line + victory
  // detection / sink animation / onEnemyDefeated dispatch, mirroring the
  // step-playback path inside resolveTurn so kills landed via an ability
  // run the same outro as kills landed via cannon fire.
  function applyAbilityDamage(rawDmg: number, logLine: string, hitKind: 'hit' | 'crit') {
    const newHp = Math.max(0, enemyHpRef.current - rawDmg)
    setEnemyHp(newHp)
    enemyHpRef.current = newHp
    setEHitsplat({ key: Date.now(), text: String(rawDmg), color: hitKind === 'crit' ? '#fbbf24' : '#f87171', big: hitKind === 'crit' })
    setEnemyShakeKind(hitKind === 'crit' ? 'crit' : 'hit')
    setEnemyShakeKey(k => k + 1)
    setTimeout(() => setEHitsplat(null), 480)
    setResolveLog(prev => [...prev, logLine])
    if (newHp <= 0) {
      // Victory beat — mirrors the eHp<=0 branch in resolveTurn so loot /
      // XP messages and the kill callback fire on the same schedule the
      // cannon-fire path uses.
      setSubPhase('done')
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
      setTimeout(() => onEnemyDefeated(playerHpRef.current, playerChargesRef.current), cbDelay)
    }
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

    setPlayerAction(action)
    if (action === 'fire' || action === 'volley' || action === 'mega') {
      // Reset aim positions and indicator styling, then begin aiming
      firePosRef.current = 0; fireDirRef.current = 1
      zonePosRef.current = 0.3 + Math.random() * 0.4
      zoneDirRef.current = Math.random() < 0.5 ? -1 : 1
      if (indicatorRef.current) {
        indicatorRef.current.style.width = '4px'
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
    // Freeze the RAF synchronously. The critFreezeRef mirror effect only
    // commits after this render, which let the tick run 1–2 more frames and
    // drift the painted needle past the spot being judged.
    critFreezeRef.current = true
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
    const pos = firePosRef.current
    const zoneCenter = zonePosRef.current
    let res: ShotResult =
      pos >= zoneCenter - tideCritW && pos <= zoneCenter + tideCritW ? 'critical'
      : pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W ? 'hit'
      : pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W ? 'graze'
      : 'miss'
    // Repaint the frozen needle + zone at the judged geometry and color
    // the needle by the judged result — the freeze IS the judgment, so
    // the picture the player studies always matches the badge.
    if (indicatorRef.current) {
      indicatorRef.current.style.left = `calc(${pos * 100}% - 2px)`
      indicatorRef.current.style.background =
        res === 'critical' ? '#fbbf24' :
        res === 'hit'      ? '#4ade80' :
        res === 'graze'    ? '#94a3b8' :
                             'rgba(255,255,255,0.4)'
    }
    if (zoneRef.current) {
      zoneRef.current.style.left = `${(zoneCenter - HIT_W - GRAZE_W) * 100}%`
    }

    // Consume one Sharpshot buff "shot left" regardless of outcome.
    if (sharpshotBuff) {
      const remaining = sharpshotBuff.shotsLeft - 1
      setSharpshotBuff(remaining > 0 ? { multiplier: sharpshotBuff.multiplier, shotsLeft: remaining } : null)
    }
    // Keen Cutlass + tide critChanceBonus: a clean hit has a flat chance
    // to upgrade to a crit. Tide bonus stacks ADDITIVELY with crew crit.
    const critUpgradeChance = (mods.critPct / 100) + tide.critBonus
    if (res === 'hit' && critUpgradeChance > 0 && Math.random() < critUpgradeChance) res = 'critical'
    setAimResult(res)
    setCritFreeze(true)  // freezes the aim bar at the lock position regardless of result

    // Punch the lock moment so it FEELS like a connection.
    // - Snap the indicator vertically (scaleY 2.8 → 1 with springy ease)
    // - Flash the whole bar background in the result color
    const flashColor =
      res === 'critical' ? '#fbbf24' :
      res === 'hit'      ? '#4ade80' :
      res === 'graze'    ? '#94a3b8' :
                           '#6b7280'
    snapIndicator(indicatorRef.current)
    flashBar(barFlashRef.current, flashColor, res === 'critical' ? 0.7 : res === 'hit' ? 0.55 : 0.35)
    // Indicator glow boost for hit/crit
    if (indicatorRef.current && (res === 'hit' || res === 'critical')) {
      const w = res === 'critical' ? 10 : 7
      const glow = res === 'critical' ? '#fbbf24' : '#4ade80'
      indicatorRef.current.style.width = `${w}px`
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
    const eAction = pickEnemyAction()
    setEnemyAction(eAction)

    // Speed roll for turn order. Navigator's Compass adds a fraction of
    // Navigation on top (the turn-order roll only).
    const compassNavPct = getActiveEffects(equippedRaidItems)
      .filter(e => e.type === 'speed_roll_nav_pct')
      .reduce((a, e) => a + e.value, 0)
    // Tide speedDelta folds straight into the player's effective ship
    // speed for the turn-order roll. Floored at 1 so a tide drop can't
    // make the player un-act-able.
    const tideAdjustedSpeed = Math.max(1, shipSpeed + tide.speedDelta)
    const pSpeedRoll = rollSpeed(tideAdjustedSpeed, totalNavigation) + Math.floor(totalNavigation * compassNavPct)
    // Fleet affix on the enemy: flat bonus to its speed roll. Not a
    // guarantee like before — just much better odds of going first.
    const eSpeedRoll = rollSpeed(enemy.shipSpeed, 0) + (affix?.speedBonus ?? 0)
    // First Strike crew effect always wins (player effect overrides any
    // enemy speed bonus, no matter how high).
    const first: Actor = mods.firstStrike
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
    // Speed-roll line shows immediately. Per-step lines are appended as each
    // step starts animating (see playStep) so the log feels alive instead of
    // dumping the whole turn at once.
    // Speed roll determines turn order regardless of chosen action — keep
    // the line action-agnostic ("act first" not "fire first") since a faster
    // ship might reload or dodge first.
    setResolveLog([
      first === 'player'
        ? `You're faster — you act first.`
        : `Enemy is faster — they act first.`,
    ])

    const order: Actor[] = first === 'player' ? ['player', 'enemy'] : ['enemy', 'player']

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
      // Set when this hit lit an Incendiary / froze a Frozen cannonball, so the
      // enemy hull flares with the matching status aura the instant it lands.
      procStatus?: 'burn' | 'freeze'
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

    // Promote any freeze armed LAST round into the active skip for THIS round.
    // A freeze procced during this round only set the pending flag, so it can't
    // affect the round it landed on — it always skips the actor's next turn.
    if (enemyFreezePendingRef.current) { enemyFrozenRef.current = true; enemyFreezePendingRef.current = false }
    if (playerFreezePendingRef.current) { playerFrozenRef.current = true; playerFreezePendingRef.current = false }
    // Round-scoped freeze flags. The per-actor ref above gets CONSUMED when that
    // actor's turn is skipped, which (with a faster opponent) happens before the
    // other side fires — so we snapshot "frozen this round" here and use it to
    // also suppress the frozen side's DODGE (reactive, resolved on the attacker's
    // shot). A frozen ship can't weave aside no matter the turn order.
    const enemyFrozenThisRound  = enemyFrozenRef.current
    const playerFrozenThisRound = playerFrozenRef.current

    // Incendiary burn ticks at the top of the turn. It reads the burn set on a
    // PRIOR turn (a burn lit this turn ticks next turn, not now), and a tick
    // that drops the enemy to 0 ends the fight via the final-step death check.
    if (enemyBurnRef.current.turns > 0 && eHp > 0) {
      const tick = enemyBurnRef.current.dmg
      eHp = Math.max(0, eHp - tick)
      enemyBurnRef.current = { turns: enemyBurnRef.current.turns - 1, dmg: enemyBurnRef.current.dmg }
      steps.push({ who: 'player', action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'enemy', splatText: `-${tick}`, splatColor: BURN_COLOR, logLines: [`The ${enemy.name} is ablaze, burning for ${tick}.`], burnTurnsLeft: enemyBurnRef.current.turns })
    }

    // Scorching burn (elite affix) ticks the PLAYER's hull at the top of the turn
    // — the mirror of the enemy burn above. A tick that drops you to 0 ends the
    // fight via the final death check (anchor save still applies).
    if (playerBurnRef.current.turns > 0 && pHp > 0) {
      const tick = playerBurnRef.current.dmg
      pHp = Math.max(0, pHp - tick)
      playerBurnRef.current = { turns: playerBurnRef.current.turns - 1, dmg: playerBurnRef.current.dmg }
      steps.push({ who: 'enemy', action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'player', splatText: `-${tick}`, splatColor: BURN_COLOR, logLines: [`Your ship is ablaze, burning for ${tick}.`], burnTurnsLeft: playerBurnRef.current.turns })
    }

    for (const who of order) {
      if (pHp <= 0 || eHp <= 0) break
      // Frozen Cannonball: the enemy loses this whole turn (skips before its
      // turn-start heal + action). This is the turn AFTER the proc; one turn,
      // then the ice breaks.
      if (who === 'enemy' && enemyFrozenRef.current) {
        enemyFrozenRef.current = false
        steps.push({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'enemy', splatText: 'Frozen', splatColor: FREEZE_COLOR, logLines: [`The ${enemy.name} is frozen solid — its turn is skipped.`], freezeEnds: true })
        continue
      }
      // Glacial (elite affix): the PLAYER is frozen and loses this turn — the
      // mirror of the Frozen Cannonball. Your chosen action is forfeit.
      if (who === 'player' && playerFrozenRef.current) {
        playerFrozenRef.current = false
        steps.push({ who, action: 'reload', pHp, eHp, pCharges, eCharges, splatTarget: 'player', splatText: 'Frozen', splatColor: FREEZE_COLOR, logLines: ['Your ship is frozen solid — your turn is skipped.'], freezeEnds: true })
        continue
      }
      const action = who === 'player' ? pAction : eAction
      let splatTarget: Actor | null = null
      let splatText = ''
      let splatColor = '#ef4444'
      let enemyCrit = false
      let procStatus: 'burn' | 'freeze' | undefined
      let reflectDmgOut: number | undefined
      let riposteDmgOut: number | undefined
      let enemyHealOut: number | undefined
      let lifestealHealedOut = 0
      let carapaceSoaked = false
      const stepLines: string[] = []

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
          const procGain = tide.reloadProc.chance > 0 && Math.random() < tide.reloadProc.chance
            ? tide.reloadProc.bonus : 0
          pCharges = Math.min(playerMaxCharges, pCharges + baseGain + procGain)
          if (procGain > 0) {
            stepLines.push(`Powder Keg proc! +${procGain} extra cannonball${procGain === 1 ? '' : 's'}. (${pCharges}/${playerMaxCharges})`)
          } else {
            stepLines.push(`You load a cannonball. (${pCharges}/${playerMaxCharges})`)
          }
        }
        else                  { eCharges = Math.min(MAX_CHARGES, eCharges + 1); stepLines.push(`Enemy loads a cannonball. (${eCharges}/${MAX_CHARGES})`) }
      } else if (action === 'repair') {
        // Player-only consumable: heal the hull, lose the offensive
        // half of this turn. Roll uses the kit's [min, max+Fortune*scale].
        // Enemy actions never include 'repair' so the else branch is dead.
        if (who === 'player' && repairKit) {
          // Seasoned Timbers (Gauntlet upgrade) boosts every repair heal.
          const roll = Math.round(rollRepairKitHeal(repairKit, totalFortune) * (mods.repairHealMult ?? 1))
          const before = pHp
          pHp = Math.min(playerHpMax, pHp + roll)
          const healed = pHp - before
          stepLines.push(`You crack open the ${repairKit.name}.`)
          stepLines.push(`The hull patches up for ${healed} HP.`)
          splatTarget = 'player'
          splatText = `+${healed}`
          splatColor = '#4ade80'
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
      } else if (action === 'fire' || action === 'volley' || action === 'mega') {
        if (who === 'player') pCharges -= (action === 'mega' ? MEGA_CHARGE_COST : action === 'volley' ? VOLLEY_COST : 1)
        else                  eCharges -= (action === 'volley' ? MAX_CHARGES : 1)

        const isAttackerPlayer = who === 'player'
        // Mega (player-only): the augment whose damage + on-hit behaviour drives
        // this shot. megaMult replaces the volley's flat ×2.
        const isMega  = action === 'mega'
        const megaAug = isMega ? megaAugment : null
        // The player's effective ship speed folds in tide.speedDelta (Following
        // Sea boon, Becalmed curse, etc.) so a speed boost makes you nimbler in
        // the dodge contest too — slipping more shots when you defend and
        // landing more when you attack — not just winning turn order. Floored at
        // 1 so a heavy speed drop can't invert the roll. Enemy speed is raw.
        const playerDodgeSpeed = Math.max(1, shipSpeed + tide.speedDelta)
        const attackerSpeed  = isAttackerPlayer ? playerDodgeSpeed : enemy.shipSpeed
        const defenderAction = isAttackerPlayer ? eAction          : pAction
        const defenderSpeed  = isAttackerPlayer ? enemy.shipSpeed  : playerDodgeSpeed
        const defenderNav    = isAttackerPlayer ? 0                : totalNavigation
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
          // The Mega is a heavy shot, so it rides the same Volley tide layers.
          const isVolleyLike = isVolley || isMega
          const tideActionMult = isVolleyLike ? tide.volleyDmgMult : tide.fireDmgMult
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
          const rampMult = 1 + rampPerTurn * Math.max(0, turnRef.current - 1)
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
          const actionBaseMult = isMega ? (megaAug?.megaMult ?? 2.6) : isVolley ? 2 : 1
          const mult = actionBaseMult * bossMult * nonbossMult * rampMult * aimItemMult * classDamageMult
                       * tide.dmgMult * tideActionMult * tideBossMult * critTideMult * lowHpMult * noncritTideMult
          dmg = Math.floor(rollShotDamage(lockedAimResult ?? 'miss', shipMinDamage, totalPower, mods.damagePct) * mult)
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
          if (
            enemyPhaseRef.current === 2
            && enemy.phase2?.damageTakenMult
            && dmg > 0
            && !(enemy.phase2.damageTakenVolleyBypass && action === 'volley')
            && Math.random() < (enemy.phase2.damageTakenChance ?? 1)
          ) {
            const before = dmg
            dmg = Math.max(1, Math.round(dmg * enemy.phase2.damageTakenMult))
            stepLines.push(`Carapace! ${enemy.name}'s plate soaks the blow (${before} → ${dmg}).`)
          }
        } else {
          const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
          dmg = base * (action === 'volley' ? 2 : 1)
          // Phase 2 boss damage bump (challenge-mode Pete) — multiplies the
          // raw rolled damage before crit + dodge math so a phase-2 volley
          // hits the player's hull math at the new, scarier rate. No-op for
          // phase-1 enemies (mult stays 1).
          if (enemyPhaseRef.current === 2 && enemy.phase2) {
            dmg = Math.max(1, Math.floor(dmg * enemy.phase2.damageMult))
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
        // A frozen defender can't weave aside — its dodge stance is forfeit this
        // round (mirrors its skipped turn), so the shot lands clean.
        const defenderFrozen = isAttackerPlayer ? enemyFrozenThisRound : playerFrozenThisRound
        if (defenderAction === 'dodge' && defenderFrozen) {
          stepLines.push(isAttackerPlayer
            ? `The ${enemy.name} is frozen solid — it can't weave aside.`
            : `Your ship is frozen solid — you can't weave aside.`)
        } else if (defenderAction === 'dodge' && isAttackerPlayer && isMega && megaAug?.pierce) {
          // Railgun: the beam can't be dodged. The shot lands clean (no roll).
          stepLines.push(`The beam pierces straight through — no slipping it.`)
        } else if (defenderAction === 'dodge') {
          // Tide dodge effects only help the PLAYER (when the player is the
          // one defending = the enemy is attacking = !isAttackerPlayer).
          const playerDefending = !isAttackerPlayer
          let dodged: boolean
          if (playerDefending && guaranteedDodgeLeftRef.current > 0) {
            // guaranteedDodge token: auto-succeed, no roll, spend one.
            guaranteedDodgeLeftRef.current -= 1
            dodged = true
          } else {
            // Enemy accuracy closes the dodge gap. The player's dodge roll adds
            // their FULL navigation (15-40+), so without this a single-digit
            // enemy speed could never land a shot through dodge — it was a free
            // 0. `enemy.accuracy` is the gunnery rating authored per enemy (sized
            // to the nav a player has by that raid), added only when the ENEMY
            // fires at a dodging player. The reverse contest (player attacking a
            // dodging enemy) keeps accuracy 0 — already a fair ~50/50.
            const attackerAccuracy = playerDefending ? (enemy.accuracy ?? 0) : 0
            const def = rollDodge(defenderSpeed, defenderNav)
            const atk = rollAttackerVsDodge(attackerSpeed, attackerAccuracy)
            dodged = def >= atk
            // dodgeBonus: flat % shift on the player's dodge outcome.
            // Positive saves a would-be miss; negative spoils a would-be dodge.
            if (playerDefending && tide.dodgeBonus !== 0) {
              if (!dodged && tide.dodgeBonus > 0 && Math.random() < tide.dodgeBonus) dodged = true
              else if (dodged && tide.dodgeBonus < 0 && Math.random() < -tide.dodgeBonus) dodged = false
            }
          }
          if (dodged) {
            stepLines.push(isAttackerPlayer ? `Enemy weaves aside — dodged!` : `You weave aside — dodged!`)
            splatText = 'Dodged'
            splatColor = '#38bdf8'

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
              const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult
              if (takenMult !== 1) parryDmg = Math.max(1, Math.floor(parryDmg * takenMult))
              pHp = Math.max(0, pHp - parryDmg)
              stepLines.push(`${enemy.parryName ?? 'Riposte'}! ${enemy.name} counters your strike for ${parryDmg}.`)
            } else if (isAttackerPlayer && affix?.riposteReflectPct && dmg > 0) {
              // Riposte affix — reflect a slice of the shot you WOULD have landed
              // (so it scales with the player's own damage and punishes heavy
              // hitters), through the same incoming-mitigation chain as a hit.
              let riposteDmg = Math.max(1, Math.round(dmg * affix.riposteReflectPct))
              const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult
              if (takenMult !== 1) riposteDmg = Math.max(1, Math.floor(riposteDmg * takenMult))
              pHp = Math.max(0, pHp - riposteDmg)
              riposteDmgOut = riposteDmg
              stepLines.push(`Riposte! ${enemy.name} turns your own ${dmg}-damage strike back for ${riposteDmg}.`)
            } else if (!isAttackerPlayer) {
              const parryEffects = getActiveEffects(liveItems)
              const parryChance      = parryEffects.filter(e => e.type === 'parry_chance').reduce((a, e) => Math.max(a, e.value), 0)
              const parryReflectPct  = parryEffects.filter(e => e.type === 'parry_reflect_pct').reduce((a, e) => Math.max(a, e.value), 0)
              if (parryChance > 0 && parryReflectPct > 0 && dmg > 0 && Math.random() < parryChance) {
                const reflectDmg = Math.max(1, Math.floor(dmg * parryReflectPct))
                eHp = Math.max(0, eHp - reflectDmg)
                reflectDmgOut = reflectDmg
                stepLines.push(`Riposte! You turn the shot back, slicing ${reflectDmg} into ${enemy.name}.`)
              }
            }

            steps.push({ who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor, logLines: stepLines, reflectDmg: reflectDmgOut, riposteDmg: riposteDmgOut })
            continue
          } else {
            partialDodge = true
            dmg = Math.max(1, Math.floor(dmg * 0.3))
          }
        }

        if (isAttackerPlayer) {
          eHp = Math.max(0, eHp - dmg)
          if (dmg > 0) onPlayerHit?.(dmg)
          // Leviathan's Hunger (boon): heal a slice of the damage you deal. The
          // step carries the new pHp so the HP bar climbs + a +HP splat on your
          // hull; the log line is pushed AFTER the "you fire" line below so it
          // reads in order (the hit lands, then the wound is drunk).
          if (dmg > 0 && tide.lifestealPct > 0 && pHp > 0) {
            const healed = Math.max(1, Math.round(dmg * tide.lifestealPct))
            const before = pHp
            pHp = Math.min(playerHpMax, pHp + healed)
            lifestealHealedOut = pHp - before
          }
          // Executioner (boon): the moment a hit drops the enemy to <= X% HP,
          // it's sunk outright (only when it actually landed + isn't already dead).
          if (dmg > 0 && eHp > 0 && tide.executeThreshold > 0 && eHp <= Math.ceil(enemyHpMaxRef.current * tide.executeThreshold)) {
            eHp = 0
            stepLines.push(`Executioner! The ${enemy.name} drops past saving and is dragged under.`)
          }
          // Incendiary / Frozen cannonball — 15% on-hit procs, only when the
          // shot actually landed and didn't already sink them. Burn refreshes
          // to a fresh 2 turns; freeze flags the enemy's next turn to skip.
          if (dmg > 0 && eHp > 0) {
            const onHitEffects = getActiveEffects(liveItems)
            const burnChance = onHitEffects.filter(e => e.type === 'burn_chance').reduce((a, e) => Math.max(a, e.value), 0)
            const freezeChance = onHitEffects.filter(e => e.type === 'freeze_chance').reduce((a, e) => Math.max(a, e.value), 0)
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
              const tickDmg = Math.max(1, Math.min(Math.round(dmg * BURN_TICK_PCT), Math.round(enemyHpMaxRef.current * BURN_CAP_PCT)))
              enemyBurnRef.current = { turns: BURN_TURNS, dmg: tickDmg }
              stepLines.push(`Incendiary hit! The ${enemy.name} catches fire (${tickDmg}/turn, ${BURN_TURNS} turns).`)
              procStatus = 'burn'
            }
            if (freezeChance > 0 && procRoll(freezeChance)) {
              enemyFreezePendingRef.current = true
              stepLines.push(`Frozen shot! The ${enemy.name} ices over — its next turn is frozen.`)
              procStatus = 'freeze'
            }
          }
          // Nuke Fallout: the blast always leaves the wreck burning (overwrites a
          // weaker Incendiary proc with the stronger DoT). Capped per tick like
          // any burn so it can't snowball out of hand.
          if (isMega && megaAug?.fallout && dmg > 0 && eHp > 0) {
            const f = megaAug.fallout
            const tick = Math.max(1, Math.min(Math.round(dmg * f.pct), Math.round(enemyHpMaxRef.current * BURN_CAP_PCT)))
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
            pHp = Math.max(0, pHp - reflected)
            stepLines.push(`${enemy.name}'s plating reflects ${reflected} back at you.`)
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
          if (partialDodge) {
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
          // Leviathan's Hunger heal line — pushed here so it follows the shot
          // it fed on, not before it.
          if (lifestealHealedOut > 0) stepLines.push(`Leviathan's Hunger drinks the wound — +${lifestealHealedOut} HP.`)
        } else {
          // Hull plating (raid items) + crew survivability effects (Bulwark
          // cuts, Soft Shell adds) both scale incoming damage here.
          // Tide layer: tide.inDmgMult folds in incomingDmgMult tide
          // effects (Drop sea anchor: ×0.85 next fight, etc.).
          const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult
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
          }
          // Shield pool — soaks from the pool before HP. Seeded by the Stormward
          // boon at fight start and/or topped up by the Abyssal Tide ability;
          // carries across turns until drained.
          if (abyssalShieldRef.current > 0 && dmg > 0) {
            const soaked = Math.min(abyssalShieldRef.current, dmg)
            abyssalShieldRef.current -= soaked
            dmg -= soaked
            shieldChanged = true
            stepLines.push(abyssalShieldRef.current > 0
              ? `Your shield soaks ${soaked}.`
              : `Your shield soaks ${soaked} and shatters.`)
          }
          pHp = Math.max(0, pHp - dmg)
          // Spiteful Wake (boon): the attacker takes a slice of what it dealt
          // straight back. Reads the post-shield, post-mitigation damage (what
          // actually hit the hull); never reflects onto an already-sunk enemy.
          if (tide.retaliatePct > 0 && dmg > 0 && eHp > 0) {
            const thorns = Math.max(1, Math.round(dmg * tide.retaliatePct))
            eHp = Math.max(0, eHp - thorns)
            stepLines.push(`Spiteful Wake bites back for ${thorns}.`)
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
            affix?.lifestealPct
            && dmg > 0
            && eHp > 0 && eHp < enemyHpMaxRef.current
            && Math.random() < (affix.lifestealChance ?? 1)
          ) {
            const stolen = Math.min(enemyHpMaxRef.current - eHp, Math.max(1, Math.round(dmg * affix.lifestealPct)))
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
            stepLines.push(action === 'volley'
              ? `You partially dodge the volley — grazed for ${dmg}.`
              : `You partially dodge — grazed for ${dmg}.`)
            splatText = `-${dmg}`
            splatColor = '#94a3b8'
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

      steps.push({
        who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor,
        big: (who === 'player' && lockedAimResult === 'critical') || (who === 'enemy' && enemyCrit),
        logLines: stepLines,
        procStatus,
        enemyHeal: enemyHealOut,
        lifestealHeal: lifestealHealedOut || undefined,
        carapaceSoak: carapaceSoaked,
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
        && (action === 'fire' || action === 'volley')
        && enemy.phase2
        && enemyPhaseRef.current === 1
      ) {
        enemyPhaseRef.current = 2
        enemyPatternIdxRef.current = 0
        const revivedHp = Math.max(1, Math.floor(enemyHpMaxRef.current * enemy.phase2.revivePct))
        eHp = revivedHp
        steps.push({
          who: 'enemy',
          // Reload as the "stays in place" cosmetic action — no projectile,
          // no splat. playStep's catch-all branch syncs HP for these steps,
          // which is exactly what we need (HP refills from 0 to revivePct).
          action: 'reload',
          pHp, eHp, pCharges, eCharges,
          splatTarget: null,
          splatText: '',
          splatColor: '#ef4444',
          logLines: [`${enemy.name}: "${enemy.phase2.dialogueLine}"`],
          phaseTransition: true,
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
        // Phase 2 boss damage bump also covers the Frenzied bonus shot,
        // mirroring the primary fire branch above. Otherwise the headline
        // attack scales but the affix follow-up under-hits in phase 2.
        if (enemyPhaseRef.current === 2 && enemy.phase2) {
          dmg2 = Math.max(1, Math.floor(dmg2 * enemy.phase2.damageMult))
        }
        const baseCrit2 = enemy.critChance ?? 0
        const effCrit2  = affix?.critMult ? Math.min(1, baseCrit2 * affix.critMult) : baseCrit2
        let frenziedCrit = false
        if (Math.random() < effCrit2) { frenziedCrit = true; dmg2 = Math.floor(dmg2 * 1.5) }
        const takenMult2 = incomingDmgMult * (1 + mods.damageTakenPct / 100)
        if (takenMult2 !== 1 && dmg2 > 0) dmg2 = Math.max(1, Math.floor(dmg2 * takenMult2))
        pHp = Math.max(0, pHp - dmg2)
        // Vampiric carry-through on the Frenzied second shot — same chance
        // gate as the primary fire so an enemy with Frenzied + Vampiric
        // can occasionally lifesteal from the bonus shot too.
        if (
          dmg2 > 0
          && eHp > 0 && eHp < enemyHpMaxRef.current
          && affix.lifestealPct
          && Math.random() < (affix.lifestealChance ?? 1)
        ) {
          const stolen2 = Math.min(enemyHpMaxRef.current - eHp, Math.max(1, Math.round(dmg2 * affix.lifestealPct)))
          eHp += stolen2
        }
        steps.push({
          who: 'enemy', action: 'fire',
          pHp, eHp, pCharges, eCharges,
          splatTarget: 'player',
          splatText: `-${dmg2}`,
          splatColor: frenziedCrit ? '#fbbf24' : '#ef4444',
          big: frenziedCrit,
          logLines: [`Frenzied! ${enemy.name} fires again for ${dmg2}${frenziedCrit ? ' (critical!)' : ''}.`],
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
            if (anchorSaveAvailable && !anchorUsedRef.current) {
              // Quartermaster's Anchor: cling on at 1 HP instead of
              // sinking. Once per mount; parent spends the run charge.
              anchorUsedRef.current = true
              onAnchorSave?.()
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
          if (eHp <= 0) {
            // Pokemon-style victory beat: stream the kill into the log,
            // then hand control back to the parent. The parent uses this
            // delay to either advance to the next enemy in-place or roll
            // into a loot screen (boss only).
            setSubPhase('done')
            // Sink animation: ~1.3s fall + fade, lined up with the kill
            // log + onEnemyDefeated cbDelay below so the ship is gone
            // by the time the loot/next-enemy beat fires.
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
            setTimeout(() => onEnemyDefeated(pHp, pCharges), cbDelay)
            return
          }
          turnRef.current++; setTurn(turnRef.current)
          setLastPlayerAction(pAction)
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
      const isAttack  = step.action === 'fire' || step.action === 'volley' || step.action === 'mega'
      const isDodged  = isAttack && step.splatText === 'Dodged'

      // Phase 2 transition — this is the dramatic revival beat. The ref
      // is already flipped (in resolveTurn) so combat reads phase 2 on
      // the next turn; here we flip the visual state so the nameplate,
      // PHASE 2 badge, and ship halo all paint immediately. The screen
      // flash + center-screen PHASE 2 overlay carry the moment, held
      // for ~1.1s so the player has time to read "PHASE 2" before the
      // action menu re-enables. Paired with a longer step gap below.
      if (step.phaseTransition) {
        setEnemyPhase(2)
        setPhaseFlash(true)
        setTimeout(() => setPhaseFlash(false), 1100)
      }

      // Stream this step's log lines into the visible log as the step plays.
      // Multi-line steps (e.g. "Enemy fails dodge" + "You fire for X") cascade
      // with a small stagger so each line is felt individually.
      step.logLines.forEach((line, j) => {
        setTimeout(() => {
          setResolveLog(prev => [...prev, line])
        }, j * 220)
      })

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
              setEnemyHp(step.eHp)
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
              setPlayerHp(step.pHp)
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
            x2 = es.left  - stg.left + es.width * 0.52   // enemy centre
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
            mx1 = ps.left - stg.left + ps.width * 0.50   // launches off the deck centre
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
          setCannonShot({ key: Date.now() + i, kind: cannonKind })
          setTimeout(() => setCannonShot(null), 700)
        }

        setTimeout(() => {
          setEnemyHp(step.eHp)
          // ALSO push the player HP — Reflective and Volatile affix damage
          // lives in step.pHp on a player-attacks step. Without this sync,
          // the log says "reflects N back" / "wreck scorches for N" but
          // the actual HP bar never moves until the next enemy-fires step
          // catches up.
          setPlayerHp(step.pHp)
          if (step.splatTarget === 'enemy') {
            // Barrage: split the total into 4 falling splats (first biggest), so
            // the broadside reads as four hammer-blows. Others: one splat.
            if (megaId === 'barrage' && !isDodged) {
              const total = Math.max(0, parseInt(step.splatText.replace(/[^0-9]/g, ''), 10) || 0)
              const fr = [0.40, 0.25, 0.18, 0.17]
              let used = 0
              const items = fr.map((f, k) => {
                const v = k === fr.length - 1 ? total - used : Math.round(total * f)
                used += v
                return { id: k, text: `-${v}`, size: 1.5 - k * 0.22, dx: (k - 1.5) * 18, dy: -k * 6, delay: k * 0.07 }
              })
              setMegaSplats({ key: Date.now() + i + 1, color: megaColor, items })
              setTimeout(() => setMegaSplats(null), SPLAT_HOLD_MS + 240)
            } else {
              setEHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: megaId ? megaColor : step.splatColor, big: step.big || megaId === 'nuke' || megaId === 'railgun', volley: isVolleyShot })
            }
            if (!isDodged) {
              const heavy = step.big || megaId === 'nuke' || megaId === 'railgun'
              setEnemyShakeKind(heavy ? 'crit' : isVolleyShot ? 'volley' : 'hit')
              setEnemyShakeKey(k => k + 1)
              if (heavy) cameraShake(megaId === 'nuke' ? 'nuke' : 'crit')
              else if (isVolleyShot) { cameraShake('volley'); vibrate([0, 22, 26, 30]) }
            }
            if (!isDodged) {
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
            // Incendiary lit / Frozen iced — flare the matching hull aura the
            // instant the proc'd shot connects, and switch on the persistent
            // glow/tint that lingers until the burn ticks out / ice breaks.
            if (step.procStatus) {
              const ak = Date.now() + i + 7
              setEnemyAura({ key: ak, kind: step.procStatus })
              setTimeout(() => setEnemyAura(a => (a && a.key === ak ? null : a)), 950)
              if (step.procStatus === 'burn') setEnemyBurning(true)
              else setEnemyFrozen(true)
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
        }, flightMs)
      } else if (isAttack && step.who === 'enemy') {
        // Enemy firing at player — muzzle flash off the enemy gun deck now,
        // projectile flies, then splat + shake + impact spray on the player hull.
        const eIsVolley = step.action === 'volley' && !step.big
        const eCannonKind: 'normal' | 'volley' | 'crit' =
          step.big ? 'crit' : eIsVolley ? 'volley' : 'normal'
        if (eIsVolley) {
          // Mirror the player's salvo — three muzzle pops off the enemy deck.
          ;[0, 95, 190].forEach((off, k) => {
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
          setPlayerHp(step.pHp)
          // ALSO sync enemy HP — Vampiric lifesteal lands in step.eHp on
          // an enemy-attacks step, so the heal needs a separate push.
          setEnemyHp(step.eHp)
          if (step.splatTarget === 'player') {
            setPHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: step.big, volley: eIsVolley })
            if (!isDodged) {
              setPlayerShakeKey(k => k + 1)
              setPlayerImpact({ key: Date.now() + i + 3, kind: eCannonKind })
              setTimeout(() => setPlayerImpact(null), 700)
              if (step.big) cameraShake('crit')
              else if (eIsVolley) { cameraShake('volley'); vibrate([0, 22, 26, 30]) }
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
          setPlayerHp(step.pHp)
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
          setPlayerHp(step.pHp)
          setEnemyHp(step.eHp)
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
    if (shieldChanged) setAbyssalShieldHp(abyssalShieldRef.current)

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

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#04080e',
      border: '2px solid #2a3548',
      borderRadius: 18,
      overflow: 'hidden',
      maxWidth: 580, margin: '0 auto',
      width: '100%',
    }}>
      {/* Battle stage — ocean scene with ships and HP boxes.
          flex:1 lets it grow into available vertical space on tall phones.
          minHeight is the floor on short viewports — the single-row action
          panel frees enough vertical space that we can afford a taller floor
          so the enemy ship clears the player XP bar overlay. */}
      <motion.div ref={stageRef} animate={stageShakeCtrl} style={{
        position: 'relative',
        flex: 1,
        minHeight: 400,
        transformOrigin: 'center center',
        willChange: 'transform',
        // Sky/sea gradient + inner backdrop elements switch on the raid's
        // atmosphere config (BossRaidConfig.atmosphere). Each raid gets
        // its own visual identity — Pete's coastal sunset, Krust's cold
        // overcast open ocean, the Cartographer's Sounding Fog — instead
        // of the same dusk seascape every fight. Default ('dusk') keeps
        // the original warm look for any caller that doesn't opt in
        // (e.g. the practice skirmish).
        background:
          atmosphere === 'fog'      ? 'linear-gradient(180deg, #4a5566 0%, #58687a 30%, #6a7888 40%, #18222e 100%)' :
          atmosphere === 'sunset'   ? 'linear-gradient(180deg, #2a1838 0%, #6e2840 16%, #c84a28 34%, #d96a38 44%, #1a0a12 100%)' :
          atmosphere === 'overcast' ? 'linear-gradient(180deg, #38485a 0%, #485868 30%, #546675 40%, #0a121a 100%)' :
                                      'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* ── Atmospheric backdrop ─────────────────────────────────────────
            Sun/sky/clouds/water all swap based on `atmosphere`. Each
            variant is a self-contained fragment so the parts (sun
            colour, cloud presence, sun reflection, fog bands) can
            differ per raid without ifs cluttering the shared layout.
            Order of branches: fog first, then sunset/overcast, then
            dusk as default fall-through. */}

        {atmosphere === 'fog' ? (
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
                position: 'absolute', top: '38%', right: '8%',
                width: 140, height: '40%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,180,110,0.38) 0%, rgba(255,150,90,0.18) 40%, transparent 78%)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                filter: 'blur(3px)',
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
                position: 'absolute', top: '38%', right: '8%',
                width: 110, height: '32%',
                background: 'radial-gradient(ellipse at 50% 0%, rgba(255,235,180,0.22) 0%, rgba(255,225,160,0.10) 40%, transparent 75%)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                filter: 'blur(3px)',
              }}
            />
          </>
        )}

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
              position: 'absolute', top: 10, right: 10, zIndex: 5,
              width: 32, height: 32, borderRadius: '50%',
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
        {fleeOpen && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(3,7,12,0.82)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}>
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
        )}

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
          className={enemyPhase === 2 ? 'rc-phase2-pulse' : undefined}
          animate={enemyNameplateAnim}
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 4,
            padding: '0.45rem 0.6rem 0.5rem 0.45rem',
            background: 'rgba(6,12,20,0.9)',
            // Phase 2 overrides the normal boss-gold (or elite-violet)
            // accent with crimson — same intensity as elite, deeper red so
            // it reads as "wounded and dangerous" not just "boss".
            border: `1px solid ${
              enemyPhase === 2 ? '#ef4444'
              : isBoss ? '#fbbf24'
              : isElite ? '#a78bfa'
              : '#2a3548'
            }`,
            borderRadius: 12,
            boxShadow:
              enemyPhase === 2 ? '0 0 18px rgba(239,68,68,0.5)'
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
                enemyPhase === 2 ? '#ef4444'
                : isBoss ? '#fbbf24'
                : isElite ? '#a78bfa'
                : ENEMY_COLOR
              }`,
              overflow: 'hidden',
              boxShadow: `0 0 ${enemyPhase === 2 ? 14 : 10}px ${
                enemyPhase === 2 ? 'rgba(239,68,68,0.6)'
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
              {/* Has-ability tell — small inline indicator instead of a full
                  row pill. The full ability details live in the enemy stats
                  popup (tap the nameplate to open it). Each themed ability
                  shows its own glyph: shield for Carapace-style mitigation,
                  fog cloud for Mist Veil. Both can coexist if a future
                  enemy carries multiple traits. */}
              {(enemy.damageReduction ?? 0) > 0 && (
                <span
                  aria-label={`Has ability: ${enemy.abilityName ?? 'special defense'}`}
                  style={{ fontSize: '0.72rem', lineHeight: 1, flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(125,211,252,0.55))' }}
                >
                  🛡️
                </span>
              )}
              {(enemy.aimFogDensity ?? 0) > 0 && (
                <span
                  aria-label={`Has ability: ${enemy.aimFogName ?? 'Mist Veil'}`}
                  style={{ fontSize: '0.72rem', lineHeight: 1, flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(180,200,220,0.55))' }}
                >
                  🌫️
                </span>
              )}
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
              {enemyPhase === 2 && (
                <span
                  className="font-karla font-700 uppercase rc-phase2-badge"
                  style={{ fontSize: '0.58rem', color: '#fca5a5', letterSpacing: '0.14em', textShadow: '0 0 6px rgba(239,68,68,0.7)' }}
                >
                  PHASE 2
                </span>
              )}
            </div>
            {/* Affix label sits under the name when elite — players see at
                a glance what twist this elite has, and can tap into the
                stats popup for the full description. */}
            {isElite && affix && (
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', color: '#a78bfa', letterSpacing: '0.14em', marginBottom: 3 }}>
                {affix.name}
              </p>
            )}
            {/* Persistent snare tell — the enemy's helm is jammed, no dodging */}
            {snareDodgeTurns !== 0 && (
              <span className="font-karla font-700 uppercase" style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 3,
                padding: '1px 6px', borderRadius: 999, fontSize: '0.46rem', letterSpacing: '0.1em',
                color: '#f0d79a', background: 'rgba(217,176,102,0.16)', border: '1px solid rgba(217,176,102,0.5)',
              }}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                Dodge Locked{snareDodgeTurns > 0 ? ` · ${snareDodgeTurns}` : ''}
              </span>
            )}
            <HPBar current={enemyHp} max={enemyHpMax} accent={ENEMY_COLOR} compact />
            <ChargesRow charges={enemyCharges} max={MAX_CHARGES} small />
          </div>
        </motion.button>

        {/* Enemy boat — sits in the water (below the horizon), farther away than the player */}
        <motion.div
          key={`enemy-${enemy.id}`}
          ref={enemyShipRef}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1, rotate: enemyTilt }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', right: '7%', top: '42%', zIndex: 2,
            width: '38%', maxWidth: 185, transformOrigin: 'bottom center',
          }}
        >
          <motion.div animate={enemyShakeCtrl} style={{ position: 'relative' }}>
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
                // Normal idle bob.
                : { y: [0, -4, 0] }}
              transition={enemySinking
                ? { duration: 1.3, times: [0, 0.15, 0.55, 1], ease: 'easeIn' }
                : { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: '100%', display: 'block', position: 'relative', zIndex: 1,
                transform: 'scaleX(-1)',  // face the player
                filter: [
                  'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
                  // Three-layer violet halo for elites: a punchy inner
                  // glow at the hull edge, a mid-radius bloom, and a soft
                  // outer wash. Each drop-shadow respects the PNG alpha
                  // so the whole stack reads as light coming OFF the ship.
                  ...(isElite && !isBoss ? [
                    'drop-shadow(0 0 6px rgba(167,139,250,1))',
                    'drop-shadow(0 0 16px rgba(167,139,250,0.75))',
                    'drop-shadow(0 0 32px rgba(167,139,250,0.4))',
                  ] : []),
                  // Same three-layer treatment in crimson for phase-2
                  // bosses — the persistent "wounded and dangerous"
                  // halo. Overrides the boss's normal warm tint below
                  // because the red is the new headline visual.
                  ...(enemyPhase === 2 ? [
                    'drop-shadow(0 0 7px rgba(239,68,68,1))',
                    'drop-shadow(0 0 18px rgba(239,68,68,0.8))',
                    'drop-shadow(0 0 36px rgba(239,68,68,0.45))',
                  ] : []),
                  isBoss ? 'hue-rotate(20deg) brightness(0.95)' : 'hue-rotate(180deg) brightness(0.85)',
                  // Gauntlet "drowned" wash — layered last so reused raid
                  // enemies read as cold, spectral Locker creatures.
                  ...(enemyArtFilter ? [enemyArtFilter] : []),
                ].join(' '),
                pointerEvents: 'none',
              }}
            />
            {/* Persistent burn/freeze tell — lingers between activation + tick */}
            {(enemyBurning || enemyFrozen) && <ShipStatusAura burning={enemyBurning} frozen={enemyFrozen} />}
            {/* Status aura — burning embers / freezing rime / snare jam over the hull */}
            <AnimatePresence>
              {enemyAura && <EnemyStatusAura key={`ea-${enemyAura.key}`} kind={enemyAura.kind} />}
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
            {/* Carapace deflect — the plate shrugs a soaked shot away */}
            {enemyDeflect > 0 && <CarapaceDeflect key={`cd-${enemyDeflect}`} />}
            {/* Man-o-War Mega FX (Railgun beam lives at stage level, below) */}
            {nukeBlast && <NukeBlast   key={`nb-${nukeBlast.key}`} color={nukeBlast.color} />}
            {megaSplats && <MegaSplats key={`ms-${megaSplats.key}`} color={megaSplats.color} items={megaSplats.items} />}
            <AnimatePresence>
              {eHitsplat && <HitsplatOverlay key={eHitsplat.key} text={eHitsplat.text} color={eHitsplat.color} big={eHitsplat.big} volley={eHitsplat.volley} />}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* Player ship — lower left area, larger ("closer"). Outer mount, inner shake. */}
        <motion.div
          ref={playerShipRef}
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1, rotate: playerTilt }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{
            position: 'absolute', left: '0%', bottom: '4%', zIndex: 3,
            width: '68%', maxWidth: 340, transformOrigin: 'bottom center',
          }}
        >
          <motion.div animate={playerShakeCtrl} style={{ position: 'relative' }}>
            <motion.div animate={playerRecoilCtrl} style={{ position: 'relative' }}>
              <ShipDamageFX hpPct={playerHpPctLive} flip />
              <motion.img
                src={shipImageUrl}
                alt={shipName}
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  width: '100%', display: 'block',
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
                {playerAura && <PlayerStatusAura key={`pa-${playerAura.key}`} />}
              </AnimatePresence>
              {/* Persistent burn glow / frost tint from elite Scorching / Glacial */}
              {(playerBurning || playerFrozen) && <ShipStatusAura burning={playerBurning} frozen={playerFrozen} />}
              {/* Wounded Fury (boon) — a crimson rage rim around the hull that
                  grows as HP drops, mirroring the boon's "harder the lower you
                  get" damage. Its own ambient lane (an edge halo, not rising
                  embers like burn) so it composites cleanly with status auras.
                  Transparent center = the ship reads through it untouched. */}
              {tide.lowHpDamage > 0 && (() => {
                const ragePct = Math.max(0, 1 - playerHp / playerHpMax)
                if (ragePct < 0.12) return null // only once a real chunk is gone
                const peak = Math.min(0.8, 0.22 + ragePct * 0.72)
                return (
                  <motion.div aria-hidden
                    animate={{ opacity: [peak * 0.6, peak, peak * 0.6] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                    style={{
                      position: 'absolute', inset: '-7%', borderRadius: '50%',
                      pointerEvents: 'none', zIndex: 1, mixBlendMode: 'screen',
                      background: 'radial-gradient(ellipse at center, transparent 46%, rgba(220,38,38,0.85) 64%, transparent 82%)',
                    }}
                  />
                )
              })()}
              {/* Impact spray when the enemy's shot lands on the player hull */}
              {playerImpact && (
                <ImpactBurst key={`pi-${playerImpact.key}`} kind={playerImpact.kind} />
              )}
              {/* Lethal-save burst — Quartermaster's Anchor catches a killing blow */}
              {anchorSaveFx > 0 && <AnchorSaveBurst key={`asf-${anchorSaveFx}`} />}
              {/* Dodge whoosh — player juts back-left out of the way */}
              <AnimatePresence>
                {dodgeFx?.actor === 'player' && (
                  <DodgeWhoosh key={`dw-${dodgeFx.key}`} image={shipImageUrl} dir="left" />
                )}
              </AnimatePresence>
              {/* Brace glint — a cyan shield dome breathes over the hull while
                  an Anchor cut or Abyssal shield is queued, and clears when the
                  resolver consumes it. */}
              {((anchorReductionPct ?? 0) > 0 || abyssalShieldHp > 0) && (
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0.32 }}
                  animate={{ opacity: [0.32, 0.62, 0.32] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    position: 'absolute', inset: '-7%', borderRadius: '50%',
                    pointerEvents: 'none', zIndex: 2, mixBlendMode: 'screen',
                    background: 'radial-gradient(ellipse 72% 104% at 74% 50%, rgba(125,211,252,0.55) 0%, rgba(94,234,212,0.22) 46%, transparent 72%)',
                  }}
                />
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
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: [0.6, 1.2, 1], opacity: 1 }}
                transition={{ duration: 0.34, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: '2%', right: '8%', zIndex: 6, pointerEvents: 'none',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px 2px 5px', borderRadius: 999,
                  background: `linear-gradient(180deg, ${heatColor}33, ${heatColor}14)`,
                  border: `1px solid ${heatColor}`,
                  boxShadow: `0 0 ${heatGlow}px ${heatColor}aa`,
                }}
              >
                <svg width="11" height="12" viewBox="0 0 24 24" fill={heatColor} stroke="none">
                  <path d="M12 2c1 3-1.5 4.5-1.5 7A4.5 4.5 0 0 0 17 13c.4 3-1.6 8-5 8a5 5 0 0 1-5-5c0-3.6 3.5-5 5-13z" />
                </svg>
                <span className="font-cinzel font-800" style={{ fontSize: '0.62rem', color: heatColor, lineHeight: 1 }}>+{rampBonusPct}%</span>
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

        {/* Low-hull danger — a red vignette breathes at the stage edges while
            the player's HP is critical, so the tension reads without a number. */}
        {playerHp > 0 && playerHp / playerHpMax < 0.25 && (
          <div className="rc-lowhp-vignette" aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6, borderRadius: 'inherit',
          }} />
        )}

        {/* Crew-ability cast cue — stage-anchored so it reads as a deliberate beat */}
        <AnimatePresence>
          {abilityCast && (
            <AbilityCastFx key={abilityCast.key} label={abilityCast.label} name={abilityCast.name} color={abilityCast.color} image={abilityCast.image} emoji={abilityCast.emoji} />
          )}
        </AnimatePresence>

        {/* Aim-result feedback during the lock freeze — critical gets the full fishing-perfect treatment */}
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
                  Phase 2
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
          style={{
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
            <HPBar current={playerHp} max={playerHpMax} accent={PLAYER_COLOR} compact />
            <ChargesRow charges={playerCharges} max={playerMaxCharges} small />
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
      <div style={{
        background: '#060c14',
        borderTop: '2px solid #2a3548',
        padding: '0.7rem 0.85rem 0.95rem',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {subPhase === 'aiming' ? (
          <AimBarInline
            indicatorRef={indicatorRef} zoneRef={zoneRef} flashRef={barFlashRef}
            // Enemy Mist Veil + any Gauntlet fog curse stack into one band.
            aimFogDensity={Math.min(0.95, (enemy.aimFogDensity ?? 0) + tide.aimFog)}
            // Inkfall curse: the bar randomly blacks out for a beat.
            aimBlackout={tide.aimBlackout}
            // During the freeze, show the width the shot was judged at —
            // Sharpshot is consumed at lock and the live width would
            // shrink the band mid-freeze, making the picture lie.
            critW={critFreeze ? lockedCritWRef.current : liveCritW}
            // Shimmer the gold band while the buff is live (band is already
            // widened via liveCritW; the pulse makes the boon unmistakable).
            sharpshotActive={!!sharpshotBuff && !critFreeze}
          />
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
                const disabled = locked || usedRaid || oneAbilityUsedThisTurn
                const sub = locked
                  ? `Unlocks at Lv 10.`
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
              return items
            })()}
          />
        )}
      </div>

      {/* Crew abilities restored — a one-shot banner so the refresh is obvious
          (CSS animation runs once on mount; it ends invisible + click-through).
          Centered via a flex wrap so the keyframe's transform doesn't clobber it. */}
      {abilitiesRefreshed && (
        <div aria-hidden style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 70px)', left: 0, right: 0, zIndex: 95, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
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
            isBoss={isBoss}
            equippedRaidItems={equippedRaidItems}
            shipClasses={shipClasses}
            damagePct={mods.damagePct}
            tideEffects={tideEffects}
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
        @keyframes rc-phase2-pulse {
          0%, 100% { box-shadow: 0 0 18px rgba(239,68,68,0.45); }
          50%      { box-shadow: 0 0 28px rgba(239,68,68,0.85); }
        }
        .rc-phase2-pulse {
          animation: rc-phase2-pulse 1.8s ease-in-out infinite;
        }
        @keyframes rc-phase2-badge-pulse {
          0%, 100% { text-shadow: 0 0 6px rgba(239,68,68,0.7);  opacity: 1; }
          50%      { text-shadow: 0 0 12px rgba(239,68,68,1);   opacity: 0.88; }
        }
        .rc-phase2-badge {
          animation: rc-phase2-badge-pulse 1.8s ease-in-out infinite;
        }
        @keyframes rc-lowhp-pulse {
          0%, 100% { box-shadow: inset 0 0 36px 6px rgba(239,68,68,0.28); }
          50%      { box-shadow: inset 0 0 64px 14px rgba(239,68,68,0.52); }
        }
        .rc-lowhp-vignette {
          animation: rc-lowhp-pulse 1.25s ease-in-out infinite;
        }
        @keyframes rc-sharp-pulse {
          0%, 100% { box-shadow: 0 0 4px rgba(251,191,36,0.5);  filter: brightness(1); }
          50%      { box-shadow: 0 0 13px rgba(251,191,36,0.95); filter: brightness(1.55); }
        }
        .rc-sharp-band {
          animation: rc-sharp-pulse 1s ease-in-out infinite;
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
  isBoss, equippedRaidItems, shipClasses = {}, damagePct = 0,
  tideEffects = [],
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
  /** chapter -> classId picks. Surfaces under the stat grid so the
   *  player can see which classes are buffing them mid-fight. */
  shipClasses?: Record<string, string>
  damagePct?: number
  /** Mid-raid Tide effects currently in play. Listed in the Ledger
   *  as friendly one-liners (see lib/tides.describeEffect) so the
   *  player can see what their picks are doing. Hidden when empty. */
  tideEffects?: TideEffect[]
  onClose: () => void
}) {
  // Single source of truth — mirrors rollShotDamage, incl. crew damage effects.
  const { hitMin, powerMax, critMax } = raidDamageProfile(totalPower, shipMinDamage, damagePct)
  const critMin   = shipMinDamage * 2
  // Combined "maneuver" stat — Ship Speed and Navigation both feed into how
  // nimble the ship is in fights, so they're summed into one Speed score.
  const speed   = shipSpeed + totalNavigation

  const rows: { label: string; value: string; hint: string; color: string }[] = [
    { label: 'Damage',      value: `${hitMin}–${powerMax}`,        hint: 'normal-hit damage range',         color: '#f87171' },
    { label: 'Crit Damage', value: `${critMin}–${critMax}`,        hint: 'damage on a critical lock',       color: '#fbbf24' },
    { label: 'Speed',       value: String(speed),                  hint: 'turn order, dodge, evasion',      color: '#60a5fa' },
    { label: 'Fortune',     value: String(totalFortune),           hint: 'better odds at rare loot',        color: '#f0c040' },
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
          width: '100%', maxWidth: 380,
          background: 'linear-gradient(180deg, #0c1626 0%, #06101c 100%)',
          border: '1px solid rgba(96,165,250,0.18)',
          borderRadius: 20,
          padding: '1.1rem 1rem 1rem',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Header — ship art + name. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shipImageUrl} alt="" style={{ width: 60, height: 60, objectFit: 'contain', flexShrink: 0, filter: `drop-shadow(0 3px 8px rgba(0,0,0,0.5))${shipFilter && shipFilter !== 'none' ? ` ${shipFilter}` : ''}` }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.68rem', color: '#7a9bc4', letterSpacing: '0.14em', marginBottom: 3 }}>Captain</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.3rem', color: '#f0ede8', lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shipName}</p>
          </div>
        </div>

        {/* Stat cards — 2-column grid feels less list-y and more dashboard-y. */}
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

        {/* Run effects — split by tone so boons/positive picks (Buffs) read
            apart from curses/costs (Penalties). */}
        {(buffs.length > 0 || penalties.length > 0) && (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {effectGroup('Buffs', buffs, '#5eead4')}
            {effectGroup('Penalties', penalties, '#f08a8a')}
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

        {/* Equipped Items — scales with however many raid items are on. */}
        {equippedItems.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {sectionHeading('Equipped Items', '#fbbf24')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {equippedItems.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.65rem 0.75rem',
                  background: 'rgba(251,191,36,0.06)',
                  border: '1px solid rgba(251,191,36,0.22)',
                  borderRadius: 12,
                }}>
                  {/* Item glyph */}
                  <div style={{
                    width: 36, height: 36, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'rgba(251,191,36,0.1)',
                    border: '1px solid rgba(251,191,36,0.3)',
                    borderRadius: 9,
                  }}>
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} />
                    ) : (
                      <span style={{ fontSize: '1.1rem' }}>{item.emoji}</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#fbbf24', lineHeight: 1.15, marginBottom: 2 }}>{item.name}</p>
                    <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.68)', lineHeight: 1.35 }}>{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onClose}
          className="font-karla font-700"
          style={{
            width: '100%', padding: '0.85rem', marginTop: 16,
            background: 'rgba(96,165,250,0.14)',
            border: '1px solid rgba(96,165,250,0.45)',
            color: '#90c0ff', borderRadius: 12,
            fontSize: '0.85rem', letterSpacing: '0.04em', cursor: 'pointer',
          }}
        >
          Close
        </button>
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
  enemy, currentHp, maxHp, isBoss, isElite, affix, onClose,
}: {
  enemy: BroadsideEnemy
  currentHp: number
  /** Actual max HP this fight (base × enemyHpScale), so the sheet matches the bar. */
  maxHp: number
  isBoss: boolean
  isElite?: boolean
  affix?: AffixDef
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

  const rows: { label: string; value: string; hint: string; color: string }[] = [
    { label: 'HP',          value: `${currentHp} / ${maxHp}`,          hint: 'remaining / total hull',         color: '#86efac' },
    { label: 'Damage',      value: `${enemy.minDmg}–${enemy.maxDmg}`,  hint: 'per normal shot',                color: '#f87171' },
    { label: 'Volley',      value: `${minVolley}–${maxVolley}`,        hint: '3-charge heavy shot',            color: '#fb923c' },
    { label: 'Speed',       value: String(enemy.shipSpeed),            hint: 'turn order',                     color: '#60a5fa' },
    { label: 'Crit Chance', value: `${critPct}%`,                      hint: `${minCrit}–${maxCrit} on crit`,  color: '#fbbf24' },
  ]

  // Behavioral HINT only — deliberately fuzzy. The full pattern cycle is intel
  // the player is meant to learn by playing; spelling it out trivialises the
  // "read the rhythm" puzzle. The hint nudges them toward what to watch for
  // (volleys, dodges, aggression) without giving away turn-by-turn timing.
  const behaviorHint = enemyBehaviorHint(enemy.pattern)

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
          width: '100%', maxWidth: 380,
          background: 'linear-gradient(180deg, #1a0c0c 0%, #0c0606 100%)',
          border: `1px solid ${isBoss ? 'rgba(251,191,36,0.34)' : 'rgba(239,68,68,0.22)'}`,
          borderRadius: 20,
          padding: '1.1rem 1rem 1rem',
          boxShadow: '0 18px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04) inset',
        }}
      >
        {/* Header — portrait + name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
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
        {isElite && affix && (
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
                <span style={{ fontSize: '1.1rem' }} aria-hidden>🛡️</span>
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
                <span style={{ fontSize: '1.1rem' }} aria-hidden>🌫️</span>
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
                <span style={{ fontSize: '1.1rem' }} aria-hidden>⚔️</span>
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

        <button
          type="button"
          onClick={onClose}
          className="font-karla font-700"
          style={{
            width: '100%', padding: '0.85rem',
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#fca5a5', borderRadius: 12,
            fontSize: '0.85rem', letterSpacing: '0.04em', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </motion.div>
      </div>
    </motion.div>,
    document.body,
  )
}

function CannonShotBurst({ kind, dir = 'right' }: { kind: 'normal' | 'volley' | 'crit'; dir?: 'left' | 'right' }) {
  // Muzzle flash off the gun deck: a hot bloom + a cone of sparks/smoke fired
  // in the shot direction (right = player firing at the enemy, left = enemy
  // firing back). No emoji — matches the particle impact on the receiving hull.
  const big = kind === 'crit'
  const volley = kind === 'volley'
  const sign = dir === 'right' ? 1 : -1
  const count = big ? 13 : volley ? 9 : 6
  const reach = big ? 44 : volley ? 34 : 26
  const sparks = useMemo(() => Array.from({ length: count }, (_, n) => {
    const ang = (Math.random() - 0.5) * 0.95          // forward cone
    const dist = reach * (0.55 + Math.random() * 0.75)
    return {
      x: sign * Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 3,
      size: (big ? 4.5 : 3.6) * (0.6 + Math.random() * 0.7),
      color: Math.random() < 0.5 ? '#ffd27a' : '#ff9a3c',
      dur: 0.32 + Math.random() * 0.2,
    }
  }), [count, reach, sign])
  // Muzzle sits at the firing edge of the hull.
  const left = dir === 'right' ? '82%' : '18%'
  return (
    <div style={{ position: 'absolute', left, top: '42%', width: 0, height: 0, pointerEvents: 'none', zIndex: 10 }}>
      <motion.div
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: big ? 1.5 : 1.1, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: big ? 40 : 28, height: big ? 40 : 28,
          marginLeft: big ? -20 : -14, marginTop: big ? -20 : -14, borderRadius: '50%',
          background: 'radial-gradient(circle, #fff 0%, rgba(255,200,120,0.9) 40%, transparent 72%)',
        }}
      />
      {sparks.map((s, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: s.dur, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, top: 0, width: s.size, height: s.size,
            marginLeft: -s.size / 2, marginTop: -s.size / 2, borderRadius: '50%',
            background: s.color, boxShadow: `0 0 5px ${s.color}`,
          }}
        />
      ))}
    </div>
  )
}

function ImpactBurst({ kind }: { kind: 'normal' | 'volley' | 'crit' }) {
  // Cannonball striking the hull: a hot flash, an expanding shockwave ring,
  // and a spray of debris/splinter particles thrown outward — no emoji. Scales
  // up for volley, erupts for crit (more + faster particles, gold shockwave).
  const big = kind === 'crit'
  const volley = kind === 'volley'
  const count = big ? 16 : volley ? 11 : 7
  const spread = big ? 40 : volley ? 30 : 22
  // Deterministic-per-mount spray (component remounts on each impact key).
  const bits = useMemo(() => Array.from({ length: count }, (_, n) => {
    const ang = (Math.PI * 2 * n) / count + (Math.random() - 0.5) * 0.7
    const dist = spread * (0.55 + Math.random() * 0.8)
    const warm = Math.random() < 0.6
    return {
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 5,                   // bias upward (kicked-up debris)
      size: (big ? 5.5 : 4.5) * (0.55 + Math.random() * 0.7),
      color: warm ? (Math.random() < 0.5 ? '#ffd27a' : '#ff9a3c') : '#cbb591',
      dur: 0.42 + Math.random() * 0.22,
    }
  }), [count, spread, big])
  const flashColor = big ? 'rgba(251,191,36,0.9)' : 'rgba(255,210,140,0.85)'
  return (
    <div style={{ position: 'absolute', left: '46%', top: '46%', width: 0, height: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* Hot core flash */}
      <motion.div
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: big ? 1.6 : 1.1, opacity: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: big ? 52 : 38, height: big ? 52 : 38,
          marginLeft: big ? -26 : -19, marginTop: big ? -26 : -19, borderRadius: '50%',
          background: `radial-gradient(circle, #fff 0%, ${flashColor} 40%, transparent 72%)`,
        }}
      />
      {/* Shockwave ring */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0.85 }}
        animate={{ scale: big ? 2.8 : volley ? 2.1 : 1.7, opacity: 0 }}
        transition={{ duration: big ? 0.55 : 0.45, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: 60, height: 60, marginLeft: -30, marginTop: -30,
          borderRadius: '50%',
          border: `${big ? 3 : 2}px solid ${big ? 'rgba(251,191,36,0.85)' : 'rgba(255,200,130,0.7)'}`,
          boxShadow: big ? '0 0 26px rgba(251,191,36,0.6)' : '0 0 14px rgba(255,190,120,0.4)',
        }}
      />
      {/* Smoke puff (dust) */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0.4 }}
        animate={{ scale: big ? 2.2 : 1.6, opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: 50, height: 50, marginLeft: -25, marginTop: -25,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(120,120,128,0.5) 0%, rgba(90,90,100,0.2) 50%, transparent 72%)',
        }}
      />
      {/* Debris spray */}
      {bits.map((b, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.35 }}
          transition={{ duration: b.dur, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, top: 0, width: b.size, height: b.size,
            marginLeft: -b.size / 2, marginTop: -b.size / 2, borderRadius: '50%',
            background: b.color, boxShadow: `0 0 5px ${b.color}`,
          }}
        />
      ))}
    </div>
  )
}

// Carapace deflect — the read when Krust's plate shrugs off a non-volley shot:
// a steely plate-flex ring + a hard glint + sparks scattering sideways/down
// (deflected, not penetrating). Reads as "blocked — volley to crack it".
// ── Man-o-War Mega FX ─────────────────────────────────────────────────────────
// Railgun: a Pokémon-style HYPER BEAM — a charge orb at the player's guns, then a
// thick white-hot beam erupts UP AND TO THE RIGHT into the enemy hull (the player
// sits lower-left, the enemy upper-right), held, then fades.
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
  onComplete: (penalties: number) => void
}) {
  type Flare = { id: number; x: number; y: number; fuse: number; feint: boolean }
  const [flares, setFlares] = useState<Flare[]>([])
  const [pops, setPops] = useState<{ id: number; x: number; y: number; bad: boolean }[]>([])
  const [resolved, setResolved] = useState(0)
  const resolvedIds = useRef<Set<number>>(new Set())
  const penaltyRef = useRef(0)
  const doneRef = useRef(false)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // A penalty is a real flare LET THROUGH (not tapped) or a feint TAPPED — the
  // rule flips on feints, which is the boss-tier discrimination test.
  function resolveFlare(f: { id: number; x: number; y: number; feint: boolean }, tapped: boolean) {
    if (resolvedIds.current.has(f.id)) return
    resolvedIds.current.add(f.id)
    const penalty = f.feint ? tapped : !tapped
    if (penalty) penaltyRef.current++
    else if (tapped) vibrate(13)   // clean swat
    setResolved(r => r + 1)
    setFlares(prev => prev.filter(p => p.id !== f.id))
    setPops(pp => [...pp, { id: f.id, x: f.x, y: f.y, bad: penalty }])
    timersRef.current.push(setTimeout(() => setPops(pp => pp.filter(p => p.id !== f.id)), 600))
    if (resolvedIds.current.size >= count && !doneRef.current) {
      doneRef.current = true
      timersRef.current.push(setTimeout(() => onComplete(penaltyRef.current), 340))
    }
  }

  useEffect(() => {
    if (count <= 0) { onComplete(0); return }
    let t = 420
    for (let k = 0; k < count; k++) {
      const x = 12 + Math.random() * 76
      const y = 24 + Math.random() * 50
      const fuse = (Math.max(460, 880 - k * 40) + Math.random() * 150) * fuseScale   // tighten as it goes
      // Never make the FIRST flare a feint (ease the player into the wave).
      const feint = k > 0 && Math.random() < feintChance
      const f = { id: k, x, y, fuse, feint }
      timersRef.current.push(setTimeout(() => {
        setFlares(prev => [...prev, f])
        timersRef.current.push(setTimeout(() => resolveFlare(f, false), fuse))
      }, t))
      // Arrhythmic gap to the next spawn — cluster, lull, or normal.
      const r = Math.random()
      const gap = r < clusterChance ? 115 + Math.random() * 85       // cluster (rapid back-to-back)
                : r < clusterChance + 0.26 ? 770 + Math.random() * 280 // lull (a beat of calm)
                : 350 + Math.random() * 230                          // normal
      t += gap
    }
    return () => { timersRef.current.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 14, pointerEvents: 'none' }}>
      <style>{`
        @keyframes rc-flare-in   { 0% { transform: scale(0.2); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
        @keyframes rc-flare-fuse { 0% { transform: scale(2.6); opacity: 0.95; } 100% { transform: scale(1); opacity: 0.3; } }
        @keyframes rc-flare-pop  { 0% { transform: scale(0.7); opacity: 1; } 100% { transform: scale(2.7); opacity: 0; } }
      `}</style>
      {/* Banner + remaining tally */}
      <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none', textAlign: 'center' }}>
        <div className="font-cinzel font-700 uppercase" style={{ fontSize: '0.82rem', letterSpacing: '0.12em', color, textShadow: `0 0 16px ${color}aa`, whiteSpace: 'nowrap' }}>
          {label} — intercept!
        </div>
        <div className="font-karla font-600 uppercase tracking-[0.16em]" style={{ fontSize: '0.56rem', color: feintChance > 0 ? FEINT_COLOR : '#c4b690', marginTop: 2 }}>
          {feintChance > 0 ? "don't tap the red" : `${Math.max(0, count - resolved)} left`}
        </div>
      </div>
      {/* Active flares — amber = swat, red = feint (leave it). */}
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
            {/* Closing fuse ring — shrinks onto the orb over the fuse window. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 5, borderRadius: '50%',
              border: `3px solid ${c}`, boxShadow: `0 0 14px ${c}`,
              animation: `rc-flare-fuse ${f.fuse}ms linear forwards`,
            }} />
            {/* Core orb — feints are darker/menacing with a cross-bar so they
                read as "don't touch" under pressure. */}
            <div aria-hidden style={{
              position: 'absolute', inset: 21, borderRadius: '50%',
              background: f.feint
                ? `radial-gradient(circle at 35% 30%, ${FEINT_COLOR} 0%, #7f1d1d 70%, #450a0a 100%)`
                : `radial-gradient(circle at 35% 30%, #ffffff 0%, ${color} 55%, ${color}aa 100%)`,
              boxShadow: `0 0 18px ${c}`,
            }}>
              {f.feint && (
                <div aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900, fontSize: 16, lineHeight: 1 }}>✕</div>
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
function RailgunBeam({ color, x1, y1, len, angle }: { color: string; x1: number; y1: number; len: number; angle: number }) {
  // Geometry is measured from the real ship boxes (muzzle -> enemy hull) and
  // passed in as pixels + degrees, so the beam always connects the two ships.
  // The rotate lives in `style` and composes with framer's scaleX eruption.
  // Far end (where the beam strikes the hull) — for the impact flare + ring.
  const rad = angle * Math.PI / 180
  const ex = x1 + Math.cos(rad) * len
  const ey = y1 + Math.sin(rad) * len
  return (
    <>
      {/* Muzzle spark — a small, soft flare as the lance leaves the gun. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1.2, 0.6] }}
        transition={{ duration: 0.5, times: [0, 0.3, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: '50%', zIndex: 21, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 50%, transparent 74%)`, boxShadow: `0 0 18px 5px ${color}` }} />
      {/* Outer glow — a thin halo hugging the lance. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 0.7, 0.6, 0], scaleX: [0, 1, 1, 1] }}
        transition={{ duration: 0.7, times: [0, 0.12, 0.6, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 9, width: len, height: 18, transformOrigin: 'left center', rotate: angle, borderRadius: 10, zIndex: 19, pointerEvents: 'none', background: `${color}66`, filter: 'blur(5px)' }} />
      {/* Core lance — slim, white-hot, crisp. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 1, 1, 0.95, 0], scaleX: [0, 1, 1, 1, 1] }}
        transition={{ duration: 0.7, times: [0, 0.1, 0.55, 0.8, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', left: x1, top: y1 - 5, width: len, height: 10,
          transformOrigin: 'left center', rotate: angle, borderRadius: 6, zIndex: 20, pointerEvents: 'none',
          background: `linear-gradient(90deg, ${color} 0%, #ffffff 28%, #ffffff 86%, ${color} 100%)`,
          boxShadow: `0 0 12px 2px ${color}, 0 0 30px 6px ${color}aa`,
        }} />
      {/* Inner spine — a bright hairline down the centre. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 1] }}
        transition={{ duration: 0.66, times: [0, 0.1, 0.62, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 2, width: len, height: 4, transformOrigin: 'left center', rotate: angle, borderRadius: 3, zIndex: 21, pointerEvents: 'none', background: '#ffffff', boxShadow: '0 0 10px 2px #ffffff' }} />
      {/* Impact glow at the hull — a soft burn where the lance lands. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.3, 0.8] }}
        transition={{ duration: 0.6, delay: 0.06, times: [0, 0.35, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: ex, top: ey, width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: '50%', zIndex: 21, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 48%, transparent 72%)`, boxShadow: `0 0 24px 7px ${color}` }} />
    </>
  )
}
// Nuke silo launch — a missile blasts off the player's deck, arcs up and over,
// then accelerates down onto the enemy. Launch plume stays at the deck; the
// missile + exhaust ride a moving wrapper along a parabola to the target.
function NukeMissile({ color, x1, y1, x2, y2, dur }: { color: string; x1: number; y1: number; x2: number; y2: number; dur: number }) {
  const dx = x2 - x1, dy = y2 - y1
  // Apex well above both ends so it reads as a true lob, not a straight shot.
  const apexY = Math.min(0, dy) - 120
  const d = dur / 1000
  return (
    <>
      {/* Launch plume — fire + smoke blasting off the deck as it lifts. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.95, 0.5, 0], scale: [0.4, 1.5, 2.1, 2.6] }}
        transition={{ duration: 0.7, times: [0, 0.2, 0.6, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 + 6, width: 60, height: 60, marginLeft: -30, marginTop: -22, borderRadius: '50%', zIndex: 17, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 38%, rgba(60,40,30,0.45) 66%, transparent 80%)`, filter: 'blur(2px)' }} />
      {/* Lift-off smoke column rising off the launch point. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleY: 0.3 }}
        animate={{ opacity: [0, 0.5, 0], scaleY: [0.3, 1, 1.2] }}
        transition={{ duration: 0.9, times: [0, 0.3, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 26, width: 22, height: 56, marginLeft: -11, borderRadius: 12, transformOrigin: 'bottom center', zIndex: 16, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(70,50,40,0.55), rgba(120,120,120,0.25) 60%, transparent)', filter: 'blur(3px)' }} />
      {/* Ignition flash — a hard white pop at the instant of lift-off. */}
      <motion.div aria-hidden
        initial={{ opacity: 0.95, scale: 0.3 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1, width: 46, height: 46, marginLeft: -23, marginTop: -23, borderRadius: '50%', zIndex: 18, pointerEvents: 'none', background: 'radial-gradient(circle, #ffffff 0%, #ffe6b0 55%, transparent 78%)' }} />
      {/* Missile + trail — moving wrapper. Horizontal speed is constant and the
          vertical rides a gravity curve, so there's no hitch at the apex. */}
      <motion.div aria-hidden
        initial={{ x: 0, y: 0, rotate: -50, opacity: 0 }}
        animate={{ x: [0, dx], y: [0, apexY, dy], rotate: [-50, 2, 54], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: d,
          x: { ease: 'linear' },
          y: { ease: ['easeOut', 'easeIn'], times: [0, 0.42, 1] },
          rotate: { ease: 'easeInOut', times: [0, 0.42, 1] },
          // Fade out over the last sliver of flight so the shell vanishes INTO
          // the blast instead of freezing on the hull.
          opacity: { times: [0, 0.08, 0.9, 1], ease: 'linear' },
        }}
        style={{ position: 'absolute', left: x1, top: y1, zIndex: 18, pointerEvents: 'none' }}
      >
        {/* Fiery trail — a tapering flame streak behind the cannonball. */}
        <motion.div aria-hidden
          animate={{ opacity: [0.6, 1, 0.8], scaleX: [0.88, 1, 0.9] }}
          transition={{ duration: 0.16, repeat: Infinity, repeatType: 'mirror' }}
          style={{ position: 'absolute', left: -52, top: -5, width: 46, height: 10, transformOrigin: 'right center', borderRadius: 6, background: `linear-gradient(90deg, transparent 0%, ${color}77 42%, ${color} 76%, #ffe6b0 100%)`, filter: 'blur(2.5px)' }} />
        {/* Cannonball — a heavy iron sphere, hot-rimmed from the launch. */}
        <div style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: '50%', background: 'radial-gradient(circle at 34% 28%, #8b96a3 0%, #49525f 36%, #232a31 68%, #0d1014 100%)', boxShadow: `0 0 12px 2px ${color}, inset -2px -2px 5px rgba(0,0,0,0.65)` }} />
      </motion.div>
    </>
  )
}
// Nuke: a big, slow detonation — white flash, blooming fireball, staggered
// shock rings, flung embers, and lingering smoke. Heavier and slower than a crit.
function NukeBlast({ color }: { color: string }) {
  // Deterministic ember spray (no RNG) so it's stable across renders.
  const embers = useMemo(() => Array.from({ length: 11 }, (_, n) => {
    const ang = (n / 11) * Math.PI * 2 + (n % 2 ? 0.35 : 0)
    const dist = 54 + (n % 4) * 24
    return {
      id: n,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 8,           // bias upward, like flung debris
      size: 3 + (n % 3) * 2,
      dur: 0.66 + (n % 4) * 0.12,
      delay: 0.05 + (n % 3) * 0.05,
    }
  }), [])
  return (
    <>
      {/* White flash core — a hard, snappy punch at the instant of detonation. */}
      <motion.div aria-hidden initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: [0.2, 1.4, 2.9], opacity: [1, 1, 0] }} transition={{ duration: 0.3, times: [0, 0.4, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '2%', borderRadius: '50%', pointerEvents: 'none', zIndex: 8, background: 'radial-gradient(circle, #ffffff 0%, #fff4d6 52%, transparent 74%)' }} />
      {/* Fireball — blooms big and slow, white-hot fading to the augment colour. */}
      <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 2.4, 3.6], opacity: [0, 1, 0] }} transition={{ duration: 0.95, times: [0, 0.35, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '-6%', borderRadius: '50%', pointerEvents: 'none', zIndex: 7, background: `radial-gradient(circle, #ffffff 0%, #ffd27a 30%, ${color} 58%, transparent 74%)` }} />
      {/* First shock ring. */}
      <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0.95 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 0.7, delay: 0.04, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '20%', borderRadius: '50%', border: `4px solid ${color}`, boxShadow: `0 0 34px ${color}`, pointerEvents: 'none', zIndex: 7 }} />
      {/* Second shock ring — wider, slower, trails the first. */}
      <motion.div aria-hidden initial={{ scale: 0.4, opacity: 0.7 }} animate={{ scale: 4.4, opacity: 0 }} transition={{ duration: 0.98, delay: 0.14, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '24%', borderRadius: '50%', border: `2px solid ${color}aa`, pointerEvents: 'none', zIndex: 7 }} />
      {/* Flung embers. */}
      {embers.map(e => (
        <motion.div key={e.id} aria-hidden
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: e.x, y: e.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: e.dur, delay: e.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '46%', width: e.size, height: e.size, marginLeft: -e.size / 2, marginTop: -e.size / 2, borderRadius: '50%', background: '#ffd27a', boxShadow: `0 0 8px 2px ${color}`, pointerEvents: 'none', zIndex: 8 }} />
      ))}
      {/* Lingering smoke — dark billow that swells and fades last. */}
      <motion.div aria-hidden initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 2.0, 2.8], opacity: [0, 0.5, 0] }} transition={{ duration: 1.15, times: [0, 0.4, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '6%', borderRadius: '50%', pointerEvents: 'none', zIndex: 6, background: 'radial-gradient(circle, rgba(40,20,15,0.7) 0%, rgba(30,15,12,0.4) 45%, transparent 72%)' }} />
    </>
  )
}
// Barrage: four falling damage numbers, first biggest, staggered.
function MegaSplats({ color, items }: { color: string; items: { id: number; text: string; size: number; dx: number; dy: number; delay: number }[] }) {
  return (
    <>
      {items.map(it => (
        // Outer wrapper owns the static horizontal centering so the inner
        // motion transform (y/scale) doesn't clobber it.
        <div key={it.id} aria-hidden style={{ position: 'absolute', left: `calc(50% + ${it.dx}px)`, top: '34%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 8 }}>
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [6, -8 + it.dy, -22 + it.dy], scale: [0.6, it.size, it.size] }}
            transition={{ duration: 0.72, delay: it.delay, times: [0, 0.25, 0.72, 1], ease: 'easeOut' }}
            className="font-cinzel font-800"
            style={{ fontSize: `${0.9 * it.size}rem`, color, textShadow: `0 0 10px ${color}, 0 1px 3px rgba(0,0,0,0.85)`, lineHeight: 1, whiteSpace: 'nowrap' }}
          >
            {it.text}
          </motion.div>
        </div>
      ))}
    </>
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

function HPBar({ current, max, accent, compact }: { current: number; max: number; accent: string; compact?: boolean }) {
  const pct = max > 0 ? Math.max(0, (current / max) * 100) : 0
  const h = compact ? 8 : 10
  return (
    <div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <p className="font-karla" style={{ fontSize: '0.72rem', color: '#7a8aa0' }}>HP</p>
          <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: accent }}>{current}/{max}</p>
        </div>
      )}
      <div style={{ height: h, background: 'rgba(0,0,0,0.6)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      {compact && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 3 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.8rem', color: accent }}>{current}/{max}</p>
        </div>
      )}
    </div>
  )
}

function ChargesRow({ charges, max, small }: { charges: number; max: number; small?: boolean }) {
  const dotSize = small ? 12 : 16
  // Track the prior count so a freshly-loaded cannonball "clicks in" — the new
  // pip pops from nothing with a brief overshoot. prevRef lags one render
  // (updated in the effect), so on the render where charges climbs, the added
  // pips read as just-filled.
  const prevRef = useRef(charges)
  const prev = prevRef.current
  useEffect(() => { prevRef.current = charges }, [charges])
  return (
    <div style={{ display: 'flex', gap: small ? 4 : 5, marginTop: small ? 5 : 7 }}>
      {Array.from({ length: max }).map((_, i) => {
        const filled = i < charges
        const justLoaded = filled && i >= prev
        return (
          <motion.div
            key={i}
            initial={false}
            animate={justLoaded ? { scale: [0.2, 1.35, 1] } : { scale: 1 }}
            transition={justLoaded ? { duration: 0.4, ease: 'easeOut' } : { duration: 0 }}
            style={{
              width: dotSize, height: dotSize, borderRadius: '50%',
              background: filled ? '#fbbf24' : '#1c2540',
              border: `1px solid ${filled ? '#fbbf24' : '#3a4560'}`,
              boxShadow: filled ? `0 0 ${small ? 5 : 7}px rgba(251,191,36,0.55)` : 'none',
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
  // Map damage into a 0.9x..1.7x scale, then a crit/volley bump on top.
  const mag = dmg != null ? Math.max(0.9, Math.min(1.7, dmg / 45)) : 1
  const scaleMult = big ? mag * 1.22 : isVolley ? mag * 1.1 : mag
  const baseFontPx = big ? 32 : isVolley ? 27 : 23
  const fontPx     = Math.round(baseFontPx * scaleMult)
  // Outline via a tight 8-way dark shadow ring (smoother on serif glyphs than
  // WebkitTextStroke, which blobs on Cinzel's thin strokes), then a colored
  // glow + soft drop for depth.
  const o = big ? 1.3 : isVolley ? 1.15 : 1
  const ring = [
    `${o}px ${o}px 0 #0b0e14`, `-${o}px ${o}px 0 #0b0e14`,
    `${o}px -${o}px 0 #0b0e14`, `-${o}px -${o}px 0 #0b0e14`,
    `0 ${o}px 0 #0b0e14`, `0 -${o}px 0 #0b0e14`,
    `${o}px 0 0 #0b0e14`, `-${o}px 0 0 #0b0e14`,
  ].join(', ')
  const glow = big
    ? `${ring}, 0 2px 5px rgba(0,0,0,0.55), 0 0 13px ${color}, 0 0 28px ${color}bb`
    : isVolley
      // Fiery edge — a warm bloom layered under the damage color so a volley
      // reads hot, distinct from a plain single shot.
      ? `${ring}, 0 2px 5px rgba(0,0,0,0.55), 0 0 11px ${color}, 0 0 20px rgba(255,150,60,0.7)`
      : `${ring}, 0 1px 4px rgba(0,0,0,0.55), 0 0 9px ${color}99`
  return (
    <motion.div
      // Crits + volleys punch IN (start oversized, settle to 1); normal hits
      // grow in. Monotonic scale = no overshoot bounce that reads as flicker.
      // x:'-50%' is the centering offset (NOT a static `transform`, which FM
      // would clobber once it animates scale/y).
      initial={{ opacity: 0, x: '-50%', y: 2, scale: big ? 1.55 : isVolley ? 1.3 : 0.55 }}
      animate={{ opacity: 1, x: '-50%', y: big ? -38 : -30, scale: 1 }}
      exit={{ opacity: 0, x: '-50%', y: big ? -60 : -48, scale: big ? 1.1 : 0.92 }}
      transition={{
        opacity: { duration: 0.14 },
        y:       { duration: 0.34, ease: [0.22, 1, 0.36, 1] },
        scale:   { duration: big ? 0.2 : isVolley ? 0.22 : 0.26, ease: [0.2, 1.1, 0.4, 1] },
      }}
      style={{
        position: 'absolute', left: '50%', top: '38%',
        pointerEvents: 'none', zIndex: 10,
        color,
        fontFamily: 'var(--font-cinzel)', fontWeight: 800,
        fontStyle: big ? 'italic' : 'normal',
        fontSize: `${fontPx}px`, lineHeight: 1, letterSpacing: isVolley ? '0.02em' : '0.01em',
        textShadow: glow,
        whiteSpace: 'nowrap',
      }}
    >
      {text}
    </motion.div>
  )
}

// Enemy status aura — a brief themed glow + drifting motes over the hull when
// a burn or freeze status ticks. Burn = embers rising; freeze = cold rime
// settling. Localized to the enemy ship, fades on its own.
function EnemyStatusAura({ kind }: { kind: 'burn' | 'freeze' | 'snared' }) {
  const burn = kind === 'burn'
  const snared = kind === 'snared'
  const color = burn ? '#fb923c' : snared ? '#d9b066' : '#7dd3fc'
  const moteColor = burn ? '#ffd27a' : snared ? '#f0d79a' : '#e0f4ff'
  const motes = useMemo(() => Array.from({ length: snared ? 8 : 6 }, (_, n) => ({
    // snare = motes clamp INWARD (a tightening net); burn rises, rime drifts down.
    x: snared ? (Math.random() - 0.5) * 52 : (Math.random() - 0.5) * 46,
    y: snared ? (Math.random() - 0.5) * 40 : (burn ? -1 : 1) * (12 + Math.random() * 26),
    size: 3 + Math.random() * 3,
    delay: Math.random() * 0.12,
    dur: 0.6 + Math.random() * 0.3,
    inward: snared,
  }) ), [burn, snared])
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
      {/* Drifting motes — snare clamps inward, burn/freeze drift outward */}
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
function ShipStatusAura({ burning, frozen }: { burning: boolean; frozen: boolean }) {
  return (
    <>
      {burning && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <motion.div
            aria-hidden
            animate={{ opacity: [0.22, 0.46, 0.22] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: '-10% -4% -2%', borderRadius: '46%', mixBlendMode: 'screen', background: 'radial-gradient(ellipse at 50% 82%, rgba(251,146,60,0.6) 0%, rgba(251,146,60,0.2) 46%, transparent 72%)' }}
          />
          {[0, 1, 2].map(n => (
            <span key={n} className="rc-ember" style={{ left: `${36 + n * 13}%`, animationDelay: `${n * 0.55}s`, background: '#ffd27a' }} />
          ))}
        </div>
      )}
      {frozen && (
        <motion.div
          aria-hidden
          animate={{ opacity: [0.4, 0.62, 0.4] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{ position: 'absolute', inset: '-6%', borderRadius: '46%', mixBlendMode: 'screen', zIndex: 3, pointerEvents: 'none', background: 'radial-gradient(ellipse at center, rgba(125,211,252,0.5) 0%, rgba(186,230,253,0.22) 45%, transparent 72%)' }}
        />
      )}
    </>
  )
}

// Lethal-save burst (Quartermaster's Anchor item) — a cyan shield ring + flash
// + a held "ANCHOR HELD" beat on the player hull when a killing blow is caught.
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

// Heal sparkle over the player hull — a soft green wash plus a few motes
// rising off the deck, for Mender / Abyssal Tide / repair-kit patches.
function PlayerStatusAura() {
  const color = '#4ade80'
  const motes = useMemo(() => Array.from({ length: 6 }, () => ({
    x: (Math.random() - 0.5) * 50,
    y: -(14 + Math.random() * 30),                    // rise off the deck
    size: 3 + Math.random() * 3,
    delay: Math.random() * 0.14,
    dur: 0.65 + Math.random() * 0.3,
  })), [])
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.85, times: [0, 0.2, 0.7, 1] }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
    >
      <div style={{
        position: 'absolute', inset: '-6%', borderRadius: '46%', mixBlendMode: 'screen',
        background: `radial-gradient(ellipse at center, ${color}99 0%, ${color}3a 44%, transparent 72%)`,
      }} />
      {motes.map((m, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: m.x, y: m.y, opacity: [0, 1, 0] }}
          transition={{ duration: m.dur, delay: m.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '56%', width: m.size, height: m.size,
            marginLeft: -m.size / 2, marginTop: -m.size / 2, borderRadius: '50%',
            background: '#bbf7d0', boxShadow: `0 0 6px ${color}`,
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
}

// Crew-ability cast cue. A themed pill (crew portrait + ability name) pops up
// over the stage with an expanding ring behind the portrait, so firing an
// ability — even a pure buff — reads as a real, deliberate beat.
function AbilityCastFx({ label, name, color, image, emoji }: { label: string; name: string; color: string; image?: string | null; emoji?: string }) {
  return (
    <motion.div
      // x:'-50%' carries the horizontal centre through the scale/y animation
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
        <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `2px solid ${color}`, boxShadow: `0 0 14px ${color}aa`, background: '#0a121e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {image
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: '1.2rem' }}>{emoji}</span>}
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
const ACTION_ICON: Record<'dodge' | 'special' | 'reload' | 'fire' | 'volley', React.ReactNode> = {
  dodge: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l7 3v6c0 4.2-2.9 7.4-7 9-4.1-1.6-7-4.8-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8L15 9.8"/></svg>,
  special: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.1 5.5L20 10l-5 3.6L16.5 20 12 16.4 7.5 20 9 13.6 4 10l5.9-1.5z"/></svg>,
  reload: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>,
  fire: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3c1 3-1.5 4.5-1.5 7A4.5 4.5 0 0 0 17 13c.4 3-1.6 8-5 8a5 5 0 0 1-5-5c0-3.6 3.5-5 5-13z"/></svg>,
  volley: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="9" r="2.4"/><circle cx="16" cy="7" r="2.4"/><circle cx="13" cy="16" r="2.4"/></svg>,
}

function CircleBtn({ icon, label, color, enabled, highlighted, onClick, readyPulse }: {
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
        fontSize: '0.56rem', color: lit ? color : '#4a5468',
      }}>
        {label}
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
  /** Greys the card and blocks clicks. Use for "already used", "at full HP", etc. */
  disabled?: boolean
  emoji?: string
  image?: string | null
  onClick: () => void
}

function ActionMenu({ canFire, canVolley, canMega = false, megaAugment = null, canDodge, canReload, onSelect, disabled = false, highlightedAction = null, specialItems = [] }: {
  canFire: boolean
  canVolley: boolean
  /** Man-o-War Mega is available (augment owned + a full 4-charge magazine). */
  canMega?: boolean
  megaAugment?: ShipAugment | null
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
   *  greys out. Tapping Special opens a chooser; tapping an entry fires
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

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <CircleBtn
          icon={ACTION_ICON.dodge} label="Dodge" color="#38bdf8"
          enabled={canDodge && !disabled} highlighted={dodgeHighlighted}
          onClick={() => { if (canDodge && !disabled) onSelect('dodge') }}
        />
        <CircleBtn
          icon={ACTION_ICON.special} label="Special" color="#c084fc"
          enabled={hasSpecial && !disabled} highlighted={false}
          readyPulse={crewAbilityReady}
          onClick={tapSpecial}
        />
        <CircleBtn
          icon={ACTION_ICON.reload} label={canReload ? 'Reload' : 'Full'} color="#a8b8d0"
          enabled={canReload && !disabled} highlighted={reloadHighlighted}
          onClick={() => { if (canReload && !disabled) onSelect('reload') }}
        />
        <CircleBtn
          icon={ACTION_ICON.fire} label="Fire" color="#4ade80"
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
                    : <span>{item.emoji ?? '✦'}</span>}
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
              <span className="font-karla" style={{ fontSize: '0.62rem', color: '#4ade80' }}>1 ◆ · single</span>
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
              <span className="font-karla" style={{ fontSize: '0.62rem', color: '#fbbf24' }}>3 ◆ · 2× dmg</span>
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
                <span className="font-karla" style={{ fontSize: '0.62rem', color: megaAugment.color }}>{MEGA_CHARGE_COST} ◆ · Mega</span>
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
  // Older lines fall off the TOP, not the bottom: the lines area uses a
  // flex column with `justify-content: flex-end` + `overflow: hidden`, so
  // entries pile against the bottom and any overflow (a long wrapping
  // line, or all four entries) gets clipped from the TOP. That preserves
  // the newest, most actionable info — the original slice(-4) cap kept 4
  // entries, but a wrapping line could blow the height budget and the
  // bottom (= newest, with the damage numbers) was getting cut off.
  const isEmpty = lines.length === 0
  const visible = isEmpty ? ['What will you do?'] : lines.slice(-4)
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
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}>
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
            style={{ fontSize: '0.86rem', color: '#c8d4e0', lineHeight: 1.5, flexShrink: 0 }}
          >
            {line}
          </motion.p>
        ))}
      </div>
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
function AimBarInline({ indicatorRef, zoneRef, flashRef, aimFogDensity, aimBlackout, critW, sharpshotActive }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
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
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#fbbf24' }}>
          Lock Your Shot
        </p>
        <p className="font-karla font-600 uppercase tracking-[0.12em]" style={{ fontSize: '0.55rem', color: '#5a7a9a' }}>
          Gold = Crit
        </p>
      </div>

      {/* The bar itself — same DOM as the old AimPanel so the
          existing indicator/zone/flash animation hooks keep working
          without any ref reshuffling. */}
      <div style={{ position: 'relative', height: 44, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, overflow: 'hidden' }}>
        <div ref={flashRef} style={{
          position: 'absolute', inset: 0, opacity: 0, background: 'transparent',
          // zIndex 5 sits above the Mist Veil fog (zIndex 4) so the
          // punch-on-lock flash always reads cleanly, even when the
          // fog is at its densest. Was 3; bumped 2026-05-29 when fog
          // landed.
          pointerEvents: 'none', zIndex: 5,
        }} />
        <div ref={zoneRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0, zIndex: 1 }}>
          <div style={{ position: 'absolute', inset: '3px 0', background: 'rgba(148,163,184,0.15)', borderRadius: 4 }} />
          <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${(GRAZE_W / (HIT_W + GRAZE_W)) * 50}%`, width: `${(HIT_W / (HIT_W + GRAZE_W)) * 100}%`, background: 'rgba(74,222,128,0.22)' }} />
          {/* Gold crit band at its real width (matches the practice bar),
              with the hairline kept on top as the aim focus. Pulses while
              Sharpshot is live. */}
          <div className={sharpshotActive ? 'rc-sharp-band' : undefined} style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${50 - critBandPct / 2}%`, width: `${critBandPct}%`, background: sharpshotActive ? 'rgba(251,191,36,0.62)' : 'rgba(251,191,36,0.45)', borderRadius: 2 }} />
          <div style={{ position: 'absolute', top: '20%', bottom: '20%', left: 'calc(50% - 1px)', width: 2, background: '#fbbf24' }} />
        </div>
        <div ref={indicatorRef} style={{ position: 'absolute', top: 2, bottom: 2, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)', zIndex: 2 }} />
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
              filter: 'blur(1.5px)',
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
// 0.56rem caption span below — so the browser computes the same
// natural height across devices. A hardcoded `height: 72` was close on
// most devices but off by a few pixels wherever default line-height
// differs from 1.2; flex: 1 on the battle stage then ate or surrendered
// the delta and the UI visibly shifted as the row swapped in. The
// caption text is transparent — it's only there to reserve the same
// vertical space CircleBtn's "Dodge"/"Fire" labels would have.
function InlineLockButton({ onLock }: { onLock: () => void }) {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <motion.button
            whileTap={{ scale: 0.96 }}
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
            }}
          >
            Lock Shot
          </motion.button>
          {/* Invisible caption — matches CircleBtn's label slot so the
              column's natural height equals an ActionMenu column's. */}
          <span aria-hidden className="font-karla font-700 uppercase tracking-[0.06em]" style={{
            fontSize: '0.56rem', color: 'transparent', userSelect: 'none',
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
    a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'mega' ? 'Mega' : a === 'reload' ? 'Reload' : a === 'dodge' ? 'Dodge' : '—'
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

