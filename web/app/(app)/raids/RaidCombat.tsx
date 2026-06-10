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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { BroadsideEnemy, EnemyAction } from '@/lib/bossRaids'
import { raidDamageProfile, type RaidMods } from '@/lib/expeditions'
import { getActiveEffects, getRaidItem } from '@/lib/raidItems'
import { describeEffect, type TideEffect } from '@/lib/tides'
import { getRepairKit, rollRepairKitHeal, repairKitRange } from '@/lib/repairKits'
import { classForSlug, CLASSES, currentMilestone, type AnyClassDef } from '@/lib/crewClasses'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { type AffixDef } from '@/lib/raidAffixes'
import { getShipClass } from '@/lib/shipClasses'
import CharacterAvatar from '@/components/CharacterAvatar'

type ShotResult = 'miss' | 'graze' | 'hit' | 'critical'
type SubPhase   = 'await_input' | 'aiming' | 'revealing' | 'resolving' | 'done'
type Actor      = 'player' | 'enemy'

const MAX_CHARGES = 3
const PLAYER_COLOR = '#4ade80'
const ENEMY_COLOR  = '#ef4444'

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
  const c = { reload: 0, fire: 0, volley: 0, dodge: 0, repair: 0 }
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
function rollAttackerVsDodge(attackerSpeed: number) {
  return d20() + attackerSpeed
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

function getShotResult(pos: number, zoneCenter: number): ShotResult {
  const grazeL = zoneCenter - HIT_W - GRAZE_W
  const grazeR = zoneCenter + HIT_W + GRAZE_W
  const hitL   = zoneCenter - HIT_W
  const hitR   = zoneCenter + HIT_W
  const critL  = zoneCenter - CRIT_W
  const critR  = zoneCenter + CRIT_W
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
  onEnemyDefeated: (remainingPlayerHp: number) => void
  onPlayerDefeated: () => void
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
  onAbilityFired?: (crewId: number) => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RaidCombat({
  enemy, affix, isElite = false,
  isBoss, shipImageUrl, shipFilter, shipName, playerLabel,
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
  anchorSaveAvailable = false, onAnchorSave,
  raidMods, riskyFlee = false, fleeSignal, fleeNav,
  tideEffects = [],
  atmosphere = 'dusk',
  crewMembers = [], usedAbilityIds, onAbilityFired,
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
    let guaranteedDodgeBank = 0
    // Per-enemy one-shots applied at mount only.
    let enemyHpScaleMult = 1
    let enemyChargesDelta = 0
    for (const e of tideEffects) {
      switch (e.kind) {
        case 'damageMult':            dmgMult *= e.mult; break
        case 'fireDmgMult':           fireDmgMult *= e.mult; break
        case 'volleyDmgMult':         volleyDmgMult *= e.mult; break
        case 'bossDamageMult':        bossDmgMult *= e.mult; break
        case 'bossVolleyDmgMult':     bossVolMult *= e.mult; break
        case 'critChanceBonus':       critBonus += e.chance; break
        case 'critZoneScale':         critZoneMult *= e.mult; break
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
        case 'reloadProc':
          // Procs stack additively on chance + bonus (simple model;
          // future tier 4 tides could replace with a more nuanced curve).
          reloadProc = { chance: reloadProc.chance + e.chance, bonus: reloadProc.bonus + e.bonusCharges }
          break
        case 'guaranteedDodge':       guaranteedDodgeBank += e.n; break
        case 'enemyHpScale':          enemyHpScaleMult *= e.mult; break
        case 'enemyStartChargesDelta':enemyChargesDelta += e.n; break
        case 'instantHeal': case 'fullHeal': case 'doubloonsAtRaidEnd': break // handled elsewhere
      }
    }
    return {
      dmgMult, fireDmgMult, volleyDmgMult, bossDmgMult, bossVolMult,
      critBonus, critZoneMult, inDmgMult, inCritReduce,
      dodgeBonus, speedDelta,
      chargesStart, hpStartDelta, everyFightHeal,
      reloadProc, guaranteedDodgeBank,
      enemyHpScaleMult, enemyChargesDelta,
    }
  }, [tideEffects, isBoss])
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
  // Snare — enemy can't dodge for N player turns. -1 = rest of fight.
  // Decremented at the start of each player turn while > 0; rest-of-fight
  // sticks until the encounter ends (component remounts next fight).
  const [snareDodgeTurns, setSnareDodgeTurns] = useState<number>(0)
  // Mirror into a ref so the pickEnemyAction callback (tight deps) reads
  // the current value without listing it as a dep.
  const snareDodgeTurnsRef = useRef(0)
  useEffect(() => { snareDodgeTurnsRef.current = snareDodgeTurns }, [snareDodgeTurns])
  // Per-turn ability lock + Snare countdown — the useEffect that reacts to
  // turn changes is defined further down where the `turn` state is in
  // scope (search for "ability per-turn reset effect").
  // Anchor — next incoming hit's damage is reduced by this fraction (0-1).
  // Read at hit-resolve time, then cleared.
  const [anchorReductionPct, setAnchorReductionPct] = useState<number | null>(null)
  // Abyssal Tide (Catfish-only legendary) — damage-absorbing shield buffer
  // granted on top of HP. Drains BEFORE HP on the next incoming hit; carry
  // over until consumed or the encounter ends. Anchor-style next-hit
  // resolution wiring is pending, so for now this is staged but only
  // visible via the chooser/log.
  const [, setAbyssalShieldHp] = useState(0)
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
  // Flee confirmation (real raids only). fleeResult holds the outcome of a
  // failed escape so the modal can show "caught!" before the player dismisses.
  const [fleeOpen, setFleeOpen]       = useState(false)
  const [fleeResult, setFleeResult]   = useState<{ dmg: number; defeated: boolean } | null>(null)
  // Initial state — tide effects fold into the seed values. Player HP
  // applies hpStartDelta + everyFightHeal at fight start (heal can
  // push above max? no — clamped to max). Enemy HP scales. Player +
  // enemy starting charges include the tide deltas (clamped 0–MAX).
  const [playerHp, setPlayerHp]       = useState(() =>
    Math.max(0, Math.min(playerHpMax, initialPlayerHp + tide.hpStartDelta + tide.everyFightHeal))
  )
  const [enemyHp, setEnemyHp]         = useState(() => Math.max(1, Math.round(enemy.hpBase * tide.enemyHpScaleMult)))
  const [playerCharges, setPlayerCharges] = useState(() =>
    Math.max(0, Math.min(MAX_CHARGES, tide.chargesStart))
  )
  const [enemyCharges, setEnemyCharges]   = useState(() =>
    Math.max(0, Math.min(MAX_CHARGES, tide.enemyChargesDelta))
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
  const [pHitsplat, setPHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean } | null>(null)
  const [eHitsplat, setEHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean } | null>(null)
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
  const [enemyShakeKind, setEnemyShakeKind] = useState<'hit' | 'crit'>('hit')
  const [playerShakeKey, setPlayerShakeKey] = useState(0)
  const [playerRecoilKey, setPlayerRecoilKey] = useState(0)
  const [cannonShot, setCannonShot]   = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)
  const [enemyImpact, setEnemyImpact] = useState<{ key: number; kind: 'normal' | 'volley' | 'crit' } | null>(null)

  // Aim bar state — RAF driven during 'aiming' subphase
  const firePosRef  = useRef(0)
  const fireDirRef  = useRef(1)
  const zonePosRef  = useRef(0.5)
  const zoneDirRef  = useRef(Math.random() < 0.5 ? 1 : -1)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const zoneRef      = useRef<HTMLDivElement>(null)
  const barFlashRef  = useRef<HTMLDivElement>(null)
  const rafRef       = useRef(0)

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
  useEffect(() => {
    if (enemyShakeKey === 0) return
    if (enemyShakeKind === 'crit') {
      // crit-shake (0.6s, bigger)
      enemyShakeCtrl.start({
        x:      [0, -10, 10, -8, 8, -4, 4, -2, 0],
        rotate: [0, -1.5, 1.5, -1, 1, -0.5, 0.3, 0, 0],
        transition: { duration: 0.6 },
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
  useEffect(() => { playerHpRef.current = playerHp }, [playerHp])

  // ── Flee — leaving a real raid is a gamble, not a free exit ───────────────
  // A failed escape lets the enemy land a parting shot (Bulwark still
  // mitigates); bosses are harder to slip. The same prompt handles BOTH the ←
  // button and any attempt to navigate away mid-battle (RaidGame intercepts
  // those and signals via fleeSignal). pendingFleeNavRef holds where to go on
  // a clean getaway so success honours where the player was trying to head.
  const FLEE_CHANCE = isBoss ? 0.45 : 0.65
  const pendingFleeNavRef = useRef<(() => void) | null>(null)
  function promptFlee(nav: () => void) {
    pendingFleeNavRef.current = nav
    setFleeResult(null)
    setFleeOpen(true)
  }
  function attemptFlee() {
    if (Math.random() < FLEE_CHANCE) {
      (pendingFleeNavRef.current ?? (() => onLeave?.()))()
      return
    }
    const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
    const dmg = Math.max(1, Math.round(base * (1 - (mods.damageTakenPct ?? 0) / 100)))
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
    setFleeResult({ dmg, defeated: next <= 0 })
  }
  function dismissFleeResult() {
    const defeated = fleeResult?.defeated
    setFleeResult(null)
    setFleeOpen(false)
    if (defeated) { setSubPhase('done'); onPlayerDefeated() }
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
  useEffect(() => {
    setEnemyHp(enemy.hpBase); enemyHpRef.current = enemy.hpBase
    setPlayerCharges(0); setEnemyCharges(0)
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
    if ((enemy.damageReduction ?? 0) > 0) {
      introLines.push(`Its ${(enemy.abilityName ?? 'armour').toLowerCase()} soaks fire and graze. Volleys break through.`)
    }
    if ((enemy.aimFogDensity ?? 0) > 0) {
      introLines.push(`A ${(enemy.aimFogName ?? 'mist').toLowerCase()} drifts over your aim bar. Lock by rhythm, not by sight.`)
    }
    setResolveLog(introLines)
    const promptTimer = setTimeout(() => {
      // Only append if the player hasn't acted yet — once a turn resolves,
      // resolveLog gets replaced wholesale and we don't want to clobber it.
      setResolveLog(prev => (prev.length === introLines.length && prev[0] === intro ? [...introLines, 'What will you do?'] : prev))
    }, 600)
    setPHitsplat(null); setEHitsplat(null)
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

    // Indicator slides at constant speed (~0.6% per frame at 60fps).
    const INDICATOR_SPEED = 0.006
    // Zone slides at speed driven by enemy.shipSpeed, slowed by player navigation.
    const baseZone   = enemy.shipSpeed * 0.0008
    const navSlow    = 1 / (1 + totalNavigation * 0.015)
    const ZONE_SPEED = baseZone * navSlow

    function tick(now: number) {
      const dt = Math.min(now - last, 50)
      last = now
      // Freeze the needle + target zone the moment the player locks a shot so
      // they can clearly see where the indicator landed. Reads from a ref so
      // the freeze takes effect on the next frame (the state closure here is
      // stale once subPhase stays 'aiming').
      if (critFreezeRef.current) { rafRef.current = requestAnimationFrame(tick); return }
      const frames = dt / 16.67

      firePosRef.current += INDICATOR_SPEED * frames * fireDirRef.current
      if (firePosRef.current >= 1) { firePosRef.current = 1; fireDirRef.current = -1 }
      if (firePosRef.current <= 0) { firePosRef.current = 0; fireDirRef.current = 1 }

      zonePosRef.current += ZONE_SPEED * frames * zoneDirRef.current
      const minZone = HIT_W + GRAZE_W
      const maxZone = 1 - HIT_W - GRAZE_W
      if (zonePosRef.current >= maxZone) { zonePosRef.current = maxZone; zoneDirRef.current = -1 }
      if (zonePosRef.current <= minZone) { zonePosRef.current = minZone; zoneDirRef.current = 1 }

      if (indicatorRef.current) {
        indicatorRef.current.style.left = `calc(${firePosRef.current * 100}% - 2px)`
        const zone = getShotResult(firePosRef.current, zonePosRef.current)
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
  }, [subPhase, enemy.shipSpeed, totalNavigation])

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
    }
    return action
  }, [enemy.pattern, enemy.phase2, enemyCharges])

  // ─── Player action handlers ────────────────────────────────────────────────

  const canFire   = playerCharges >= 1
  const canVolley = playerCharges >= MAX_CHARGES
  // Dodge has a 1-turn cooldown so it can't be spammed defensively.
  const canDodge  = lastPlayerAction !== 'dodge'
  // Reload no-ops at full magazine — the +1 (and any tide proc bonus)
  // clamps to MAX_CHARGES on the resolve side, so a reload at 3/3
  // would burn the turn for zero gain. Disable + relabel the slot
  // ("Full") so the player understands why instead of fishing for a
  // missing button.
  const canReload = playerCharges < MAX_CHARGES

  // Fire a crew class ability. Doesn't consume the player's turn — the
  // chooser closes, the effect applies, and the action menu stays open so
  // the player can still fire/reload/dodge. Per-turn lock + per-raid used
  // set are bumped together; the parent gets the onAbilityFired callback
  // so the cooldown survives the per-fight RaidCombat remount.
  function fireCrewAbility(
    crew: { id: number; name: string },
    def: AnyClassDef,
    m: AnyClassDef['milestones'][number] | null,
  ): void {
    if (!m) return
    if (subPhase !== 'await_input') return
    if (oneAbilityUsedThisTurn) return
    if (usedAbilityIds?.has(crew.id)) return

    // Dispatch on class id — TS narrows the milestone shape from the
    // per-class table.
    switch (def.id) {
      case 'mender': {
        const mm = m as import('@/lib/crewClasses').MenderMilestone
        const heal = Math.round(playerHpMax * mm.pctMaxHp)
        setPlayerHp(prev => Math.min(playerHpMax, prev + heal))
        playerHpRef.current = Math.min(playerHpMax, playerHpRef.current + heal)
        if (mm.cleanseDebuff) setCleanseDebuffPending(true)
        break
      }
      case 'sharpshot': {
        const sm = m as import('@/lib/crewClasses').SharpshotMilestone
        setSharpshotBuff({ multiplier: sm.critZoneMultiplier, shotsLeft: sm.shotsBuffed })
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
        break
      }
      case 'anchor': {
        const an = m as import('@/lib/crewClasses').AnchorMilestone
        setAnchorReductionPct(an.pctReduction)
        // absorbsCrits handling is deferred — applies on the next hit
        // resolve. Tracked in state for now; future polish wires it.
        break
      }
      case 'navigator': {
        const nm = m as import('@/lib/crewClasses').NavigatorMilestone
        // Roll +2 first; if it lands, override the +1 roll.
        const two  = nm.twoChargeChance > 0 && Math.random() < nm.twoChargeChance
        const one  = !two && (nm.oneChargeChance >= 1 || Math.random() < nm.oneChargeChance)
        const add  = two ? 2 : (one ? 1 : 0)
        if (add > 0) {
          setPlayerCharges(prev => Math.min(MAX_CHARGES, prev + add))
        }
        break
      }
      // ── Legendary signature abilities ────────────────────────────────
      case 'abyssal_tide': {
        const at = m as import('@/lib/crewClasses').AbyssalTideMilestone
        const heal = Math.round(playerHpMax * at.pctMaxHp)
        setPlayerHp(prev => Math.min(playerHpMax, prev + heal))
        playerHpRef.current = Math.min(playerHpMax, playerHpRef.current + heal)
        // Shield buffer — staged for the next incoming hit. Matches the
        // anchor pattern (state set here, resolver consumes later).
        const shield = Math.round(playerHpMax * at.shieldPctMaxHp)
        setAbyssalShieldHp(shield)
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
      setTimeout(() => onEnemyDefeated(playerHpRef.current), cbDelay)
    }
  }

  function selectAction(action: EnemyAction) {
    if (subPhase !== 'await_input') return
    if (action === 'fire'   && !canFire)   return
    if (action === 'volley' && !canVolley) return
    if (action === 'dodge'  && !canDodge)  return
    if (action === 'repair') {
      if (!repairKit || kitUsed || playerHp >= playerHpMax) return
      // Mark consumed at selection — no take-backs once the kit is cracked.
      setKitUsed(true)
    }

    setPlayerAction(action)
    if (action === 'fire' || action === 'volley') {
      // Reset aim positions and indicator styling, then begin aiming
      firePosRef.current = 0; fireDirRef.current = 1
      zonePosRef.current = 0.3 + Math.random() * 0.4
      zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
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
    if (subPhase !== 'aiming' || critFreeze) return
    // Tide critZoneScale widens the gold critical band. Sharpshot ability
    // also widens it for the next N shots. Both multiply onto CRIT_W; a
    // wider zone = same aim, more crits. Sharpshot buff is consumed by the
    // shot landing regardless of result (miss/graze/hit/critical all count).
    const sharpshotMult = sharpshotBuff ? (1 + sharpshotBuff.multiplier) : 1
    const tideCritW = CRIT_W * tide.critZoneMult * sharpshotMult
    const pos = firePosRef.current
    const zoneCenter = zonePosRef.current
    let res: ShotResult
    if (pos >= zoneCenter - tideCritW && pos <= zoneCenter + tideCritW) res = 'critical'
    else if (pos >= zoneCenter - HIT_W && pos <= zoneCenter + HIT_W) res = 'hit'
    else if (pos >= zoneCenter - HIT_W - GRAZE_W && pos <= zoneCenter + HIT_W + GRAZE_W) res = 'graze'
    else res = 'miss'

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
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([40, 60, 80]) } catch {}
      }
    } else if (res === 'hit') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        try { navigator.vibrate([30]) } catch {}
      }
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

    for (const who of order) {
      if (pHp <= 0 || eHp <= 0) break
      const action = who === 'player' ? pAction : eAction
      let splatTarget: Actor | null = null
      let splatText = ''
      let splatColor = '#ef4444'
      let enemyCrit = false
      const stepLines: string[] = []

      // Resilient affix: 33% chance to regen at the top of each enemy
      // turn. Heals max(base, % of maxHP) so small ships get a flat 5
      // minimum and bigger ones scale up via the percentage. Skipped at
      // 0 HP (dead enemies don't regen) and at full HP (no point).
      if (
        who === 'enemy'
        && (affix?.turnStartHealBase || affix?.turnStartHealMaxPct)
        && eHp > 0 && eHp < enemy.hpBase
        && Math.random() < (affix.turnStartHealChance ?? 1)
      ) {
        const flat = affix.turnStartHealBase ?? 0
        const pct  = affix.turnStartHealMaxPct ? Math.round(enemy.hpBase * affix.turnStartHealMaxPct) : 0
        const healAmount = Math.max(1, flat, pct)
        const healed = Math.min(healAmount, enemy.hpBase - eHp)
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
          pCharges = Math.min(MAX_CHARGES, pCharges + baseGain + procGain)
          if (procGain > 0) {
            stepLines.push(`Powder Keg proc! +${procGain} extra cannonball${procGain === 1 ? '' : 's'}. (${pCharges}/${MAX_CHARGES})`)
          } else {
            stepLines.push(`You load a cannonball. (${pCharges}/${MAX_CHARGES})`)
          }
        }
        else                  { eCharges = Math.min(MAX_CHARGES, eCharges + 1); stepLines.push(`Enemy loads a cannonball. (${eCharges}/${MAX_CHARGES})`) }
      } else if (action === 'repair') {
        // Player-only consumable: heal the hull, lose the offensive
        // half of this turn. Roll uses the kit's [min, max+Fortune*scale].
        // Enemy actions never include 'repair' so the else branch is dead.
        if (who === 'player' && repairKit) {
          const roll = rollRepairKitHeal(repairKit, totalFortune)
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
      } else if (action === 'fire' || action === 'volley') {
        if (who === 'player') pCharges -= (action === 'volley' ? MAX_CHARGES : 1)
        else                  eCharges -= (action === 'volley' ? MAX_CHARGES : 1)

        const isAttackerPlayer = who === 'player'
        const attackerSpeed  = isAttackerPlayer ? shipSpeed       : enemy.shipSpeed
        const defenderAction = isAttackerPlayer ? eAction         : pAction
        const defenderSpeed  = isAttackerPlayer ? enemy.shipSpeed : shipSpeed
        const defenderNav    = isAttackerPlayer ? 0               : totalNavigation

        let dmg: number
        if (isAttackerPlayer) {
          const bossMult = isBoss
            ? getActiveEffects(equippedRaidItems).filter(e => e.type === 'boss_damage_mult').reduce((a, e) => a * e.value, 1)
            : 1
          // Crit / non-crit damage mults from raid items (Gunner's Sight).
          // Only ONE branch applies per shot — crit shots multiply by the
          // crit mult; hit + graze multiply by the non-crit mult. Skipped
          // entirely on a miss (rollShotDamage already returns 0).
          const isCritShot = lockedAimResult === 'critical'
          const aimItemMult = isCritShot
            ? getActiveEffects(equippedRaidItems).filter(e => e.type === 'crit_damage_mult').reduce((a, e) => a * e.value, 1)
            : getActiveEffects(equippedRaidItems).filter(e => e.type === 'noncrit_damage_mult').reduce((a, e) => a * e.value, 1)
          // classDamageMult: aggregated ship-class effect (Master Gunner
          // +15%, Ironside -10%, Buccaneer +5%, stacks across chapters).
          // Stacks multiplicatively with raid items + volley + crit, same
          // chain as the rest of the damage mults.
          // Tide layer: dmgMult (broad), plus action-specific fire/volley
          // mults, plus boss-only mults stacked on top when isBoss.
          const isVolley = action === 'volley'
          const tideActionMult = isVolley ? tide.volleyDmgMult : tide.fireDmgMult
          const tideBossMult = isBoss
            ? tide.bossDmgMult * (isVolley ? tide.bossVolMult : 1)
            : 1
          const mult = (isVolley ? 2 : 1) * bossMult * aimItemMult * classDamageMult
                       * tide.dmgMult * tideActionMult * tideBossMult
          dmg = Math.floor(rollShotDamage(lockedAimResult ?? 'miss', shipMinDamage, totalPower, mods.damagePct) * mult)
          // Enemy themed defense: crustacean carapace soaks a flat % off every
          // hit the player lands (Krust's crew). Applied to the rolled damage so
          // the hitsplat + log show the real number that gets through.
          // VOLLEY BYPASS: a 3-charge volley is the concentrated burst that
          // punches the plate open — the whole Krust raid is designed around
          // this answer (no enemy in that raid ever volleys themselves; the
          // player's volley is the response). Fire/graze still gets soaked.
          const dr = enemy.damageReduction ?? 0
          if (dr > 0 && dmg > 0 && action !== 'volley') dmg = Math.max(1, Math.round(dmg * (1 - dr)))
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
          const effCrit  = affix?.critMult ? Math.min(1, baseCrit * affix.critMult) : baseCrit
          if (Math.random() < effCrit) {
            enemyCrit = true
            dmg = Math.floor(dmg * 1.5)
          }
        }

        splatTarget = isAttackerPlayer ? 'enemy' : 'player'

        // Dodge outcomes: success = 0 dmg, failure = "partial dodge" at 50%.
        // No more "fully ate the shot" — the dodge button always pays for
        // itself a little. Combined with the dodge cooldown above, this
        // turns dodge into a soft mitigation read instead of a binary.
        let partialDodge = false
        if (defenderAction === 'dodge') {
          const def = rollDodge(defenderSpeed, defenderNav)
          const atk = rollAttackerVsDodge(attackerSpeed)
          if (def >= atk) {
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
            } else if (!isAttackerPlayer) {
              const parryEffects = getActiveEffects(equippedRaidItems)
              const parryChance      = parryEffects.filter(e => e.type === 'parry_chance').reduce((a, e) => Math.max(a, e.value), 0)
              const parryReflectPct  = parryEffects.filter(e => e.type === 'parry_reflect_pct').reduce((a, e) => Math.max(a, e.value), 0)
              if (parryChance > 0 && parryReflectPct > 0 && dmg > 0 && Math.random() < parryChance) {
                const reflectDmg = Math.max(1, Math.floor(dmg * parryReflectPct))
                eHp = Math.max(0, eHp - reflectDmg)
                stepLines.push(`Riposte! You turn the shot back, slicing ${reflectDmg} into ${enemy.name}.`)
              }
            }

            steps.push({ who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor, logLines: stepLines })
            continue
          } else {
            partialDodge = true
            dmg = Math.max(1, Math.floor(dmg * 0.5))
          }
        }

        if (isAttackerPlayer) {
          eHp = Math.max(0, eHp - dmg)
          if (dmg > 0) onPlayerHit?.(dmg)
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
        } else {
          // Hull plating (raid items) + crew survivability effects (Bulwark
          // cuts, Soft Shell adds) both scale incoming damage here.
          // Tide layer: tide.inDmgMult folds in incomingDmgMult tide
          // effects (Drop sea anchor: ×0.85 next fight, etc.).
          const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100) * tide.inDmgMult
          if (takenMult !== 1 && dmg > 0) dmg = Math.max(1, Math.floor(dmg * takenMult))
          pHp = Math.max(0, pHp - dmg)
          // Vampiric affix: 50% chance to heal a fraction of dealt
          // damage. Capped at its maxHP. Fires after the damage lands so
          // the heal feels like a follow-up, not a pre-emptive negation.
          if (
            affix?.lifestealPct
            && dmg > 0
            && eHp > 0 && eHp < enemy.hpBase
            && Math.random() < (affix.lifestealChance ?? 1)
          ) {
            const stolen = Math.min(enemy.hpBase - eHp, Math.max(1, Math.round(dmg * affix.lifestealPct)))
            if (stolen > 0) {
              eHp += stolen
              stepLines.push(`${enemy.name} drinks back ${stolen} HP from the hit.`)
            }
          }
          if (partialDodge) {
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
        const revivedHp = Math.max(1, Math.floor(enemy.hpBase * enemy.phase2.revivePct))
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
          && eHp > 0 && eHp < enemy.hpBase
          && affix.lifestealPct
          && Math.random() < (affix.lifestealChance ?? 1)
        ) {
          const stolen2 = Math.min(enemy.hpBase - eHp, Math.max(1, Math.round(dmg2 * affix.lifestealPct)))
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
            setTimeout(() => onEnemyDefeated(pHp), cbDelay)
            return
          }
          turnRef.current++; setTurn(turnRef.current)
          setLastPlayerAction(pAction)
          setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
          setSubPhase('await_input')
        }, 400)
        return
      }

      const step = steps[i]
      const isAttack  = step.action === 'fire' || step.action === 'volley'
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
        }, PROJECTILE_FLIGHT_MS - 80)
      }

      if (isAttack && step.who === 'player') {
        // Player firing: cannon shot + recoil immediately, projectile flies,
        // then splat + shake + HP update + crit flash all together.
        setPlayerRecoilKey(k => k + 1)
        const cannonKind: 'normal' | 'volley' | 'crit' =
          step.big ? 'crit' : step.action === 'volley' ? 'volley' : 'normal'
        setCannonShot({ key: Date.now() + i, kind: cannonKind })
        setTimeout(() => setCannonShot(null), 700)

        setTimeout(() => {
          setEnemyHp(step.eHp)
          // ALSO push the player HP — Reflective and Volatile affix damage
          // lives in step.pHp on a player-attacks step. Without this sync,
          // the log says "reflects N back" / "wreck scorches for N" but
          // the actual HP bar never moves until the next enemy-fires step
          // catches up.
          setPlayerHp(step.pHp)
          if (step.splatTarget === 'enemy') {
            setEHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: step.big })
            if (!isDodged) {
              setEnemyShakeKind(step.big ? 'crit' : 'hit')
              setEnemyShakeKey(k => k + 1)
            }
            if (!isDodged) {
              // Show impact burst exploding on the enemy ship (crit cascade is huge)
              const impactKind: 'normal' | 'volley' | 'crit' =
                step.big ? 'crit' : step.action === 'volley' ? 'volley' : 'normal'
              setEnemyImpact({ key: Date.now() + i + 2, kind: impactKind })
              setTimeout(() => setEnemyImpact(null), 700)
            }
            if (step.big) {
              setCritFlash(true)
              setTimeout(() => setCritFlash(false), 380)
              // Retrigger the player's recoil with the impact so the kickback
              // lines up with the big enemy explosion, not just the cannon fire
              setPlayerRecoilKey(k => k + 1)
            }
            setTimeout(() => setEHitsplat(null), SPLAT_HOLD_MS)
          }
        }, PROJECTILE_FLIGHT_MS)
      } else if (isAttack && step.who === 'enemy') {
        // Enemy firing at player — brief beat, then splat + shake + HP update.
        setTimeout(() => {
          setPlayerHp(step.pHp)
          // ALSO sync enemy HP — Vampiric lifesteal lands in step.eHp on
          // an enemy-attacks step, so the heal needs a separate push.
          setEnemyHp(step.eHp)
          if (step.splatTarget === 'player') {
            setPHitsplat({ key: Date.now() + i + 1, text: step.splatText, color: step.splatColor, big: step.big })
            if (!isDodged) setPlayerShakeKey(k => k + 1)
            setTimeout(() => setPHitsplat(null), SPLAT_HOLD_MS)
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
        }, PROJECTILE_FLIGHT_MS)
      }

      // Phase-2 revival deserves a longer beat — the player needs time
      // to read "PHASE 2", see the HP refill, and absorb that the fight
      // isn't over. Bumps the gap from the standard ~1s to ~1.6s.
      const gapMs = step.phaseTransition ? 1600 : STEP_GAP_MS
      setTimeout(() => playStep(i + 1), gapMs)
    }

    setTimeout(() => playStep(0), SPEED_LINE_HOLD_MS)
  }

  // ─── Render — Pokemon-style battle stage ──────────────────────────────────

  // Outer card is content-sized (was flex:1 + minHeight:0). The old
  // shrink-to-fit let the parent squeeze the battle stage down to its
  // 320px floor and push the action panel behind the MobileTabBar with
  // no way to scroll to it on short viewports. Sizing to content + the
  // parent being an internal scroll region (see RaidGame phase wrappers)
  // means the buttons are always reachable; on tall phones the battle
  // stage still reads fine at its natural size.
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
      <div style={{
        position: 'relative',
        flex: 1,
        minHeight: 400,
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
                  <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: fleeResult.defeated ? '#f0a890' : '#f0ede8', marginBottom: 6 }}>
                    {fleeResult.defeated ? 'Run down as you fled' : 'They caught you!'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
                    {fleeResult.defeated
                      ? `${enemy.name} ran you down for ${fleeResult.dmg} and your ship went under.`
                      : `${enemy.name} landed a parting shot for ${fleeResult.dmg}. No escape this time.`}
                  </p>
                  <button type="button" onClick={dismissFleeResult} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ width: '100%', padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(122,138,160,0.5)', background: 'rgba(20,32,48,0.9)', color: '#cfe2ff', fontSize: '0.8rem', cursor: 'pointer' }}>
                    {fleeResult.defeated ? 'Continue' : 'Fight On'}
                  </button>
                </>
              ) : (
                <>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', marginBottom: 6 }}>Flee the raid?</p>
                  <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
                    You can try to break away, but you might not get clean. A failed escape lets {enemy.name} land a parting shot.
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" onClick={() => setFleeOpen(false)} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#cfcabf', fontSize: '0.78rem', cursor: 'pointer' }}>
                      Hold Fast
                    </button>
                    <button type="button" onClick={attemptFlee} className="font-karla font-700 uppercase tracking-[0.08em]" style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(228,114,114,0.55)', background: 'rgba(212,84,84,0.22)', color: '#f8d2d2', fontSize: '0.78rem', cursor: 'pointer' }}>
                      Try to Flee
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
            <HPBar current={enemyHp} max={enemy.hpBase} accent={ENEMY_COLOR} compact />
            <ChargesRow charges={enemyCharges} max={MAX_CHARGES} small />
          </div>
        </motion.button>

        {/* Enemy boat — sits in the water (below the horizon), farther away than the player */}
        <motion.div
          key={`enemy-${enemy.id}`}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', right: '7%', top: '42%', zIndex: 2,
            width: '38%', maxWidth: 185,
          }}
        >
          <motion.div animate={enemyShakeCtrl} style={{ position: 'relative' }}>
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
                ].join(' '),
                pointerEvents: 'none',
              }}
            />
            {/* Explosion burst on impact — overlays the enemy hull */}
            {enemyImpact && (
              <ImpactBurst key={`ei-${enemyImpact.key}`} kind={enemyImpact.kind} />
            )}
            <AnimatePresence>
              {eHitsplat && <HitsplatOverlay key={eHitsplat.key} text={eHitsplat.text} color={eHitsplat.color} big={eHitsplat.big} />}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* Player ship — lower left area, larger ("closer"). Outer mount, inner shake. */}
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{
            position: 'absolute', left: '0%', bottom: '4%', zIndex: 3,
            width: '68%', maxWidth: 340,
          }}
        >
          <motion.div animate={playerShakeCtrl} style={{ position: 'relative' }}>
            <motion.div animate={playerRecoilCtrl} style={{ position: 'relative' }}>
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
            </motion.div>
            <AnimatePresence>
              {pHitsplat && <HitsplatOverlay key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} big={pHitsplat.big} />}
            </AnimatePresence>
          </motion.div>
        </motion.div>

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
            <ChargesRow charges={playerCharges} max={MAX_CHARGES} small />
          </div>
        </motion.button>

      </div>

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
          <AimBarInline indicatorRef={indicatorRef} zoneRef={zoneRef} flashRef={barFlashRef} aimFogDensity={enemy.aimFogDensity} />
        ) : (
          <LogBox lines={resolveLog} turn={turn} />
        )}

        {subPhase === 'aiming' ? (
          <InlineLockButton onLock={lockShot} />
        ) : (
          <ActionMenu
            canFire={canFire}
            canVolley={canVolley}
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
                const range = repairKitRange(repairKit, totalFortune)
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
                    ? 'Already used this raid.'
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

  // Special — scalable bonus list pulled from every equipped raid item.
  // Each equipped item surfaces as its own card with name + description, so
  // new items (any effect type) automatically appear here as they're added.
  // The legacy Boss-Dmg multiplier is folded into the item's own description.
  const specialItems = equippedRaidItems
    .map(id => getRaidItem(id))
    .filter((i): i is NonNullable<ReturnType<typeof getRaidItem>> => !!i)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
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
          maxHeight: 'calc(100dvh - 4rem)',
          overflowY: 'auto',
        }}
      >
        {/* Header — ship art + name. No "Captain's Ledger" label; the popup
            speaks for itself, and the smaller label was the most antiquated
            part of the old design. */}
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
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: specialItems.length > 0 ? 16 : 12,
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

        {/* Active Tides — mid-raid event picks the player has banked
            this run. Each row shows the friendly description per
            effect from lib/tides.describeEffect, grouped under one
            "Active Tides" header. Hidden when no tides have fired. */}
        {(() => {
          // Skip marker effects whose describeEffect returns '' — they
          // shouldn't surface as a blank ledger row.
          const lines = tideEffects
            .map(e => describeEffect(e))
            .filter(s => s.length > 0)
          if (lines.length === 0) return null
          return (
            <div style={{ marginBottom: 14 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.7rem', color: '#bae6fd', letterSpacing: '0.16em', marginBottom: 6 }}>
                Active Tides
              </p>
              <div style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '0.65rem 0.75rem',
                background: 'rgba(125,211,252,0.06)',
                border: '1px solid rgba(125,211,252,0.22)',
                borderRadius: 12,
              }}>
                {lines.map((label, i) => (
                  <p key={i} className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(231,238,246,0.78)', lineHeight: 1.4 }}>
                    <span style={{ color: '#bae6fd' }}>•</span> {label}
                  </p>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Classes — chapter-end picks. Read-only summary so the
            player can confirm mid-fight which classes are scaling
            their numbers. Glyph + name + bullet pills, same shape
            as the loadout-drawer Class section. */}
        {(() => {
          const picks = Object.values(shipClasses)
            .map(id => getShipClass(id))
            .filter((c): c is NonNullable<ReturnType<typeof getShipClass>> => !!c)
          if (picks.length === 0) return null
          return (
            <div style={{ marginBottom: 14 }}>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.7rem', color: '#7dd3fc', letterSpacing: '0.16em', marginBottom: 6 }}>
                Classes
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {picks.map(cls => (
                  <div key={cls.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '0.6rem 0.7rem',
                    background: `${cls.color}10`,
                    border: `1px solid ${cls.color}33`,
                    borderRadius: 12,
                  }}>
                    <div style={{
                      width: 32, height: 32, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: `${cls.color}18`, border: `1px solid ${cls.color}45`,
                      borderRadius: 9, fontSize: '1.15rem', color: cls.color, lineHeight: 1,
                    }}>
                      {cls.emoji}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: '#f0ede8', lineHeight: 1.15 }}>{cls.name}</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
                        {cls.bullets.map((b, i) => (
                          <span key={i} className="font-karla font-700 uppercase tracking-[0.05em]" style={{
                            fontSize: '0.56rem',
                            color: b.positive ? '#7adf9a' : '#f08a8a',
                            background: b.positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                            border: `1px solid ${b.positive ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                            borderRadius: 4, padding: '0.15rem 0.38rem',
                          }}>{b.label}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Special — scales with however many raid items are equipped */}
        {specialItems.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <p className="font-karla font-700 uppercase" style={{ fontSize: '0.7rem', color: '#fbbf24', letterSpacing: '0.16em', marginBottom: 6 }}>
              Special
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {specialItems.map(item => (
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
            width: '100%', padding: '0.85rem',
            background: 'rgba(96,165,250,0.14)',
            border: '1px solid rgba(96,165,250,0.45)',
            color: '#90c0ff', borderRadius: 12,
            fontSize: '0.85rem', letterSpacing: '0.04em', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </motion.div>
    </motion.div>
  )
}

// ── Enemy stats popup ───────────────────────────────────────────────────────
// Mirrors PlayerStatsPopup for the current enemy. Shows what a player would
// want to know to read the fight: HP / damage range / volley / crit chance /
// speed, the themed ability if any, and the full behavior pattern as chips so
// the cycle is legible. Tapping the backdrop or Close dismisses.
function EnemyStatsPopup({
  enemy, currentHp, isBoss, isElite, affix, onClose,
}: {
  enemy: BroadsideEnemy
  currentHp: number
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
    { label: 'HP',          value: `${currentHp} / ${enemy.hpBase}`,   hint: 'remaining / total hull',         color: '#86efac' },
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

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1.25rem',
      }}
    >
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
          maxHeight: 'calc(100dvh - 4rem)',
          overflowY: 'auto',
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
    </motion.div>
  )
}

function CannonShotBurst({ kind }: { kind: 'normal' | 'volley' | 'crit' }) {
  // Burst of emoji projectiles flying off the cannon. Crit = big cascade with star + fire.
  const big = kind === 'crit'
  const volley = kind === 'volley'
  const baseFont = big ? '1.6rem' : volley ? '1.3rem' : '0.95rem'
  return (
    <>
      <span style={{
        position: 'absolute', left: '78%', top: '38%',
        fontSize: baseFont,
        animation: 'rc-cannon-shot 0.55s ease forwards',
        pointerEvents: 'none', zIndex: 10,
      }}>💥</span>
      {big && (
        <>
          <span style={{
            position: 'absolute', left: '92%', top: '20%', fontSize: '1.5rem',
            animation: 'rc-cannon-shot 0.5s 0.06s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>💥</span>
          <span style={{
            position: 'absolute', left: '85%', top: '55%', fontSize: '1.3rem',
            animation: 'rc-cannon-shot 0.55s 0.1s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>💥</span>
          <span style={{
            position: 'absolute', left: '108%', top: '42%', fontSize: '1.9rem',
            animation: 'rc-cannon-shot 0.65s 0.04s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>⭐</span>
          <span style={{
            position: 'absolute', left: '88%', top: '38%', fontSize: '1.5rem',
            animation: 'rc-cannon-shot 0.7s 0.12s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>🔥</span>
        </>
      )}
      {volley && !big && (
        <>
          <span style={{
            position: 'absolute', left: '90%', top: '55%', fontSize: '1.3rem',
            animation: 'rc-cannon-shot 0.5s 0.07s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>💥</span>
          <span style={{
            position: 'absolute', left: '95%', top: '20%', fontSize: '1.4rem',
            animation: 'rc-cannon-shot 0.6s 0.14s ease forwards',
            pointerEvents: 'none', zIndex: 10,
          }}>🔥</span>
        </>
      )}
    </>
  )
}

function ImpactBurst({ kind }: { kind: 'normal' | 'volley' | 'crit' }) {
  // Explosion centered on the target. Crit erupts with a cascade of emojis +
  // a brief expanding shockwave ring around the impact site.
  const big = kind === 'crit'
  const volley = kind === 'volley'
  return (
    <>
      {big && (
        <motion.div
          initial={{ scale: 0.3, opacity: 0.9 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 70, height: 70, borderRadius: '50%',
            border: '3px solid rgba(251,191,36,0.85)',
            boxShadow: '0 0 30px rgba(251,191,36,0.7)',
            pointerEvents: 'none', zIndex: 9,
          }}
        />
      )}
      <span style={{
        position: 'absolute', left: '38%', top: '32%',
        fontSize: big ? '2.4rem' : volley ? '1.7rem' : '1.3rem',
        animation: 'rc-impact-pop 0.55s ease forwards',
        pointerEvents: 'none', zIndex: 11, filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.6))',
      }}>💥</span>
      {big && (
        <>
          <span style={{
            position: 'absolute', left: '62%', top: '42%', fontSize: '1.9rem',
            animation: 'rc-impact-pop 0.55s 0.05s ease forwards',
            pointerEvents: 'none', zIndex: 11, filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.6))',
          }}>💥</span>
          <span style={{
            position: 'absolute', left: '48%', top: '18%', fontSize: '1.7rem',
            animation: 'rc-impact-pop 0.6s 0.1s ease forwards',
            pointerEvents: 'none', zIndex: 11, filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.6))',
          }}>⭐</span>
          <span style={{
            position: 'absolute', left: '32%', top: '55%', fontSize: '1.8rem',
            animation: 'rc-impact-pop 0.65s 0.07s ease forwards',
            pointerEvents: 'none', zIndex: 11, filter: 'drop-shadow(0 0 6px rgba(251,113,36,0.6))',
          }}>🔥</span>
          <span style={{
            position: 'absolute', left: '58%', top: '60%', fontSize: '1.6rem',
            animation: 'rc-impact-pop 0.7s 0.14s ease forwards',
            pointerEvents: 'none', zIndex: 11, filter: 'drop-shadow(0 0 6px rgba(251,113,36,0.6))',
          }}>🔥</span>
        </>
      )}
      {volley && !big && (
        <span style={{
          position: 'absolute', left: '55%', top: '50%', fontSize: '1.5rem',
          animation: 'rc-impact-pop 0.5s 0.08s ease forwards',
          pointerEvents: 'none', zIndex: 11,
        }}>💥</span>
      )}
    </>
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
  return (
    <div style={{ display: 'flex', gap: small ? 4 : 5, marginTop: small ? 5 : 7 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: dotSize, height: dotSize, borderRadius: '50%',
          background: i < charges ? '#fbbf24' : '#1c2540',
          border: `1px solid ${i < charges ? '#fbbf24' : '#3a4560'}`,
          boxShadow: i < charges ? `0 0 ${small ? 5 : 7}px rgba(251,191,36,0.55)` : 'none',
        }} />
      ))}
    </div>
  )
}

function HitsplatOverlay({ text, color, big }: { text: string; color: string; big?: boolean }) {
  // Magnitude scaling — a 12 damage graze and a 120 damage hit used to
  // render identically. Now the damage number controls font + glow so
  // big hits visibly *feel* heavier. Damage parsed from the leading
  // "-N" pattern; misses ("Dodged"), heals ("+5"), and non-numeric
  // splats fall through to the default size.
  const dmgMatch = /^-?(\d+)$/.exec(text)
  const dmg = dmgMatch ? Number(dmgMatch[1]) : null
  // Map damage into a 0.85x..1.5x scale, then 1.3x on top for crit (big).
  // Anchor: 15 dmg = small graze, 50 dmg = default, 100+ dmg = chunky.
  const mag = dmg != null ? Math.max(0.85, Math.min(1.5, dmg / 50)) : 1
  const scaleMult = big ? mag * 1.3 : mag
  const baseFontPx = big ? 20 : 13.6                              // 1.25rem / 0.85rem at 16px root
  const fontPx     = Math.round(baseFontPx * scaleMult)
  const padY       = big ? 0.4 : 0.25
  const padX       = big ? 0.85 : 0.6
  // Heavier glow on the bigger numbers — same color, more spread.
  const glowMult = Math.max(0.85, scaleMult)
  return (
    <motion.div
      // Smooth ease-out, no overshoot. The previous cubic-bezier
      // [0.34, 1.56, 0.64, 1] had a control-y of 1.56 — the scale and y
      // values shot past their target and bounced back, which on text
      // (damage numbers, "Dodged") reads as the word briefly repeating.
      initial={{ opacity: 0, y: 4, scale: big ? 0.6 : 0.7 }}
      animate={{ opacity: 1, y: big ? -36 : -28, scale: big ? 1.25 : 1 }}
      exit={{ opacity: 0, y: big ? -48 : -38, scale: big ? 1.3 : 1 }}
      transition={{
        opacity: { duration: 0.18 },
        y:       { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
        scale:   { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
      }}
      style={{
        position: 'absolute', left: '50%', top: '40%', transform: 'translateX(-50%)',
        pointerEvents: 'none', zIndex: 10,
        background: color, color: '#ffffff',
        padding: `${padY}rem ${padX}rem`,
        borderRadius: big ? 14 : 10,
        fontFamily: 'var(--font-cinzel)', fontWeight: 700,
        fontSize: `${fontPx}px`,
        boxShadow: big
          ? `0 ${6 * glowMult}px ${26 * glowMult}px ${color}cc, 0 0 ${14 * glowMult}px ${color}aa`
          : `0 ${3 * glowMult}px ${14 * glowMult}px ${color}99, 0 0 ${8 * glowMult}px ${color}55`,
        textShadow: '0 1px 4px rgba(0,0,0,0.65)',
        whiteSpace: 'nowrap',
      }}
    >
      {text}
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

function ActionMenu({ canFire, canVolley, canDodge, canReload, onSelect, disabled = false, highlightedAction = null, specialItems = [] }: {
  canFire: boolean
  canVolley: boolean
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
    if (canVolley) setFireMenu(true)   // enough charges → let the player pick
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
function AimBarInline({ indicatorRef, zoneRef, flashRef, aimFogDensity }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
  /** The Cartographer's "Mist Veil" — 0–1 opacity of a drifting fog
   *  band overlaid on the aim bar. Undefined / 0 = no fog (every other
   *  raid). ~0.4 thin (his crew tier), ~0.7 deep (the boss himself).
   *  Themed: he runs these waters because the fog hides his charts. */
  aimFogDensity?: number
}) {
  const fogOpacity = Math.max(0, Math.min(1, aimFogDensity ?? 0))
  const hasFog = fogOpacity > 0
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
          The band sits at -45% → 145% so the feathered edges sweep
          fully off-screen each cycle, never visibly snapping. */}
      {hasFog && (
        <style>{`
          @keyframes mist-veil-drift {
            0%   { transform: translateX(-45%); }
            50%  { transform: translateX(145%); }
            100% { transform: translateX(-45%); }
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
      </div>

      {/* Footer hint — when the fog's up, swap to a fog-specific cue
          so the player understands why the bar is blurring out. */}
      <p className="font-karla" style={{ fontSize: '0.6rem', color: hasFog ? '#7a9ab5' : '#5a7a9a', textAlign: 'center', flexShrink: 0 }}>
        {hasFog
          ? 'Lock through the mist. The gold center won\'t stay visible.'
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
            onClick={onLock}
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
    a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'reload' ? 'Reload' : a === 'dodge' ? 'Dodge' : '—'
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

