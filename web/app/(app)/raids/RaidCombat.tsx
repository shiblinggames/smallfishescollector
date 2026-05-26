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

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { BroadsideEnemy, EnemyAction } from '@/lib/bossRaids'
import { raidDamageProfile, type RaidMods } from '@/lib/expeditions'
import { getActiveEffects, getRaidItem } from '@/lib/raidItems'
import { getRepairKit, rollRepairKitHeal, repairKitRange } from '@/lib/repairKits'
import CharacterAvatar from '@/components/CharacterAvatar'

type ShotResult = 'miss' | 'graze' | 'hit' | 'critical'
type SubPhase   = 'await_input' | 'aiming' | 'revealing' | 'resolving' | 'done'
type Actor      = 'player' | 'enemy'

const MAX_CHARGES = 3
const PLAYER_COLOR = '#4ade80'
const ENEMY_COLOR  = '#ef4444'

// ─── Math helpers ──────────────────────────────────────────────────────────────

const d20 = () => Math.floor(Math.random() * 20) + 1

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
  return d20() + shipSpeed + Math.floor(navigation / 10)
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
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RaidCombat({
  enemy, isBoss, shipImageUrl, shipFilter, shipName, playerLabel,
  playerCharacterColor, playerEquippedHat,
  playerAvatarBg, playerAvatarBorder,
  playerHpMax, playerHp: initialPlayerHp,
  shipMinDamage, shipSpeed, totalPower, totalNavigation,
  totalFortune = 0,
  equippedRaidItems,
  equippedRepairKit,
  killReward,
  onEnemyDefeated, onPlayerDefeated, onLeave, onPlayerHit,
  anchorSaveAvailable = false, onAnchorSave,
  raidMods, riskyFlee = false, fleeSignal, fleeNav,
}: RaidCombatProps) {
  // Net crew raid effects; no-op default so the practice skirmish is unaffected.
  const mods: RaidMods = raidMods ?? { damagePct: 0, damageTakenPct: 0, critPct: 0, firstStrike: false }
  // Anchor save can fire at most once per RaidCombat mount (the parent
  // tracks the per-run charge across encounter remounts via onAnchorSave).
  const anchorUsedRef = useRef(false)
  // Repair kit: resolve the equipped kit once, then track per-battle use.
  // Special action stays disabled when the kit is missing, used, or the
  // player is at full HP (can't waste a heal accidentally).
  const repairKit = getRepairKit(equippedRepairKit)
  const [kitUsed, setKitUsed] = useState(false)
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
  const [playerHp, setPlayerHp]       = useState(initialPlayerHp)
  const [enemyHp, setEnemyHp]         = useState(enemy.hpBase)
  const [playerCharges, setPlayerCharges] = useState(0)
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [subPhase, setSubPhase]       = useState<SubPhase>('await_input')
  const [playerAction, setPlayerAction] = useState<EnemyAction | null>(null)
  const [enemyAction, setEnemyAction]   = useState<EnemyAction | null>(null)
  // Last action the player committed to (set when the turn fully resolves).
  // Used to block back-to-back dodges so dodge-camping isn't viable.
  const [lastPlayerAction, setLastPlayerAction] = useState<EnemyAction | null>(null)
  const [aimResult, setAimResult]     = useState<ShotResult | null>(null)
  const [firstActor, setFirstActor]   = useState<Actor | null>(null)
  const [resolveLog, setResolveLog] = useState<string[]>([])
  const [pHitsplat, setPHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean } | null>(null)
  const [eHitsplat, setEHitsplat]     = useState<{ key: number; text: string; color: string; big?: boolean } | null>(null)
  const [critFlash, setCritFlash]     = useState(false)
  const [critFreeze, setCritFreeze]   = useState(false)   // briefly freezes the aim bar at the lock moment
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
  const turnRef            = useRef(1)
  const [turn, setTurn]    = useState(1)
  const critFreezeRef      = useRef(false)
  useEffect(() => { critFreezeRef.current = critFreeze }, [critFreeze])

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
    // Themed-ability tell: one-time note so the player knows why hits land soft.
    const introLines = (enemy.damageReduction ?? 0) > 0
      ? [intro, `Its ${(enemy.abilityName ?? 'armour').toLowerCase()} turns aside the worst of your shot.`]
      : [intro]
    setResolveLog(introLines)
    const promptTimer = setTimeout(() => {
      // Only append if the player hasn't acted yet — once a turn resolves,
      // resolveLog gets replaced wholesale and we don't want to clobber it.
      setResolveLog(prev => (prev.length === introLines.length && prev[0] === intro ? [...introLines, 'What will you do?'] : prev))
    }, 600)
    setPHitsplat(null); setEHitsplat(null)
    enemyPatternIdxRef.current = 0
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
    const pattern = enemy.pattern
    let action = pattern[enemyPatternIdxRef.current % pattern.length]
    // Sanity guard: if scripted action is impossible (e.g. fire with 0 charges), substitute reload
    if ((action === 'fire'   && enemyCharges < 1) ||
        (action === 'volley' && enemyCharges < MAX_CHARGES)) {
      action = 'reload'
    } else {
      enemyPatternIdxRef.current++
    }
    return action
  }, [enemy.pattern, enemyCharges])

  // ─── Player action handlers ────────────────────────────────────────────────

  const canFire   = playerCharges >= 1
  const canVolley = playerCharges >= MAX_CHARGES
  // Dodge has a 1-turn cooldown so it can't be spammed defensively.
  const canDodge  = lastPlayerAction !== 'dodge'

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
    let res = getShotResult(firePosRef.current, zonePosRef.current)
    // Keen Cutlass etc.: a clean hit has a flat chance to upgrade to a crit.
    if (res === 'hit' && mods.critPct > 0 && Math.random() < mods.critPct / 100) res = 'critical'
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
    const pSpeedRoll = rollSpeed(shipSpeed, totalNavigation) + Math.floor(totalNavigation * compassNavPct)
    const eSpeedRoll = rollSpeed(enemy.shipSpeed, 0)
    // First Strike crew effect: the player always acts first.
    const first: Actor = mods.firstStrike ? 'player' : (pSpeedRoll >= eSpeedRoll ? 'player' : 'enemy')
    setFirstActor(first)
    setSubPhase('revealing')

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

      if (action === 'reload') {
        if (who === 'player') { pCharges = Math.min(MAX_CHARGES, pCharges + 1); stepLines.push(`You load a cannonball. (${pCharges}/${MAX_CHARGES})`) }
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
        stepLines.push(who === 'player' ? `You brace, ready to dodge.` : `Enemy braces, ready to dodge.`)
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
          const mult = (action === 'volley' ? 2 : 1) * bossMult
          dmg = Math.floor(rollShotDamage(lockedAimResult ?? 'miss', shipMinDamage, totalPower, mods.damagePct) * mult)
          // Enemy themed defense: crustacean carapace soaks a flat % off every
          // hit the player lands (Krust's crew). Applied to the rolled damage so
          // the hitsplat + log show the real number that gets through.
          const dr = enemy.damageReduction ?? 0
          if (dr > 0 && dmg > 0) dmg = Math.max(1, Math.round(dmg * (1 - dr)))
        } else {
          const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
          dmg = base * (action === 'volley' ? 2 : 1)
          // Enemy crit — flat chance per enemy, applied after the volley
          // multiplier. Players crit through aim-bar skill; enemies don't
          // have that, so the same outcome happens via RNG.
          if (Math.random() < (enemy.critChance ?? 0)) {
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
          const takenMult = incomingDmgMult * (1 + mods.damageTakenPct / 100)
          if (takenMult !== 1 && dmg > 0) dmg = Math.max(1, Math.floor(dmg * takenMult))
          pHp = Math.max(0, pHp - dmg)
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
      }
      // reload / dodge: state already updated via charges above. No splat.

      setTimeout(() => playStep(i + 1), STEP_GAP_MS)
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
        background: 'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* ── Atmospheric backdrop ─────────────────────────────────────────
            Sun + drifting clouds + a soft water-surface shimmer. All pure
            CSS via keyframes in globals.css. Sits below the horizon line,
            ships, and HP boxes (z-index left implicit — they're rendered
            after these and have explicit z-index where it matters). */}

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

        {/* Enemy HP nameplate — top-left, with circular portrait badge */}
        <button
          type="button"
          onClick={() => setShowEnemyStats(true)}
          aria-label={`${enemy.name} — view stats`}
          style={{
            position: 'absolute', top: 10, left: 10, zIndex: 4,
            padding: '0.45rem 0.6rem 0.5rem 0.45rem',
            background: 'rgba(6,12,20,0.9)',
            border: `1px solid ${isBoss ? '#fbbf24' : '#2a3548'}`,
            borderRadius: 12,
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
              border: `2px solid ${isBoss ? '#fbbf24' : ENEMY_COLOR}`,
              overflow: 'hidden',
              boxShadow: `0 0 10px ${isBoss ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.4)'}`,
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
              {isBoss && (
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', color: '#fbbf24', letterSpacing: '0.1em' }}>BOSS</span>
              )}
            </div>
            {(enemy.damageReduction ?? 0) > 0 && (
              <div className="font-karla font-700 uppercase" style={{
                display: 'inline-flex', alignItems: 'center', gap: 3, marginBottom: 4,
                fontSize: '0.52rem', letterSpacing: '0.06em', color: '#7dd3fc',
                background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.3)',
                borderRadius: 6, padding: '1px 5px',
              }}>
                <span aria-hidden style={{ fontSize: '0.62rem' }}>🛡️</span>
                {enemy.abilityName ?? 'Armored'} −{Math.round((enemy.damageReduction ?? 0) * 100)}%
              </div>
            )}
            <HPBar current={enemyHp} max={enemy.hpBase} accent={ENEMY_COLOR} compact />
            <ChargesRow charges={enemyCharges} max={MAX_CHARGES} small />
          </div>
        </button>

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
            <motion.img
              src={enemy.image}
              alt={enemy.name}
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: '100%', display: 'block',
                transform: 'scaleX(-1)',  // face the player
                filter: `drop-shadow(0 3px 6px rgba(0,0,0,0.35)) ${isBoss ? 'hue-rotate(20deg) brightness(0.95)' : 'hue-rotate(180deg) brightness(0.85)'}`,
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
            battle screen. */}
        <button
          type="button"
          onClick={() => setShowStats(true)}
          aria-label={`${nameplate} — view stats`}
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
        </button>

      </div>

      {/* Bottom panel — persistent log + action UI. NO position/transform
          here: it's an ancestor of heavy framer-motion content, and a
          compositing ancestor breaks iOS PWA fixed Nav/MobileTabBar.
          See memory: feedback_pagetransition_ios_pwa. */}
      <div style={{
        background: '#060c14',
        borderTop: '2px solid #2a3548',
        padding: '0.7rem 0.85rem 0.95rem',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Action log — shows this turn's events (cleared at start of each resolve) */}
        <LogBox lines={resolveLog} turn={turn} />

        {/* ActionMenu is ALWAYS mounted so nothing shifts. The aim
            minigame is a body-portaled fixed overlay (rendered after
            this div) — it never becomes a layout/compositing ancestor
            here, which is what broke the fixed nav. */}
        <ActionMenu
          canFire={canFire}
          canVolley={canVolley}
          canDodge={canDodge}
          onSelect={selectAction}
          disabled={subPhase !== 'await_input'}
          highlightedAction={subPhase === 'await_input' ? null : playerAction}
          specialItems={(() => {
            // Special chooser items. Today this is just the repair kit;
            // future special abilities (potions, boat skills, etc.) drop
            // in here without engine churn. Per-entry `disabled` keeps
            // an item visible with its reason, so the player understands
            // why the slot didn't fire instead of seeing it just grey out.
            if (!repairKit) return []
            const atFull = playerHp >= playerHpMax
            const range = repairKitRange(repairKit, totalFortune)
            return [{
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
            }]
          })()}
        />
      </div>

      {subPhase === 'aiming' && (
        <AimPanel
          indicatorRef={indicatorRef} zoneRef={zoneRef} flashRef={barFlashRef}
          onLock={lockShot}
        />
      )}

      {/* Full-screen crit flash — fixed, matches the existing raid */}
      {critFlash && (
        <div style={{
          position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 90,
          background: 'radial-gradient(ellipse at center, rgba(251,191,36,0.35) 0%, rgba(251,191,36,0.08) 60%, transparent 100%)',
          animation: 'rc-crit-flash 0.38s ease forwards',
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
            damagePct={mods.damagePct}
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
      `}</style>
    </div>
  )
}

function PlayerStatsPopup({
  shipName, shipImageUrl, shipFilter, playerHp, playerHpMax,
  shipMinDamage, shipSpeed, totalPower, totalNavigation, totalFortune,
  isBoss, equippedRaidItems, damagePct = 0,
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
  damagePct?: number
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
  enemy, currentHp, isBoss, onClose,
}: {
  enemy: BroadsideEnemy
  currentHp: number
  isBoss: boolean
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

  const ACTION_META: Record<string, { label: string; color: string }> = {
    reload: { label: 'Reload', color: '#9aa4b2' },
    fire:   { label: 'Fire',   color: '#f87171' },
    volley: { label: 'Volley', color: '#fb923c' },
    dodge:  { label: 'Dodge',  color: '#7dd3fc' },
  }

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
                  Soaks {drPct}% off every hit you land.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action pattern — full cycle as chips so the rhythm is legible */}
        <div style={{ marginBottom: 14 }}>
          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.66rem', color: '#9a9690', letterSpacing: '0.16em', marginBottom: 6 }}>
            Pattern · {enemy.pattern.length}-turn cycle
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {enemy.pattern.map((act, i) => {
              const meta = ACTION_META[act] ?? { label: act, color: '#9a9690' }
              return (
                <span key={i} className="font-karla font-700 uppercase" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: '0.56rem', letterSpacing: '0.08em',
                  color: meta.color,
                  background: `${meta.color}1c`,
                  border: `1px solid ${meta.color}45`,
                  borderRadius: 5,
                  padding: '0.2rem 0.4rem',
                }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)', letterSpacing: 0 }}>{i + 1}</span>
                  {meta.label}
                </span>
              )
            })}
          </div>
          <p className="font-karla" style={{ fontSize: '0.66rem', color: 'rgba(240,237,232,0.45)', lineHeight: 1.4, marginTop: 7 }}>
            Repeats from turn 1 once the cycle ends. Read the rhythm to time your dodges and volleys.
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
        padding: big ? '0.4rem 0.85rem' : '0.25rem 0.6rem',
        borderRadius: big ? 14 : 10,
        fontFamily: 'var(--font-cinzel)', fontWeight: 700,
        fontSize: big ? '1.25rem' : '0.85rem',
        boxShadow: big
          ? `0 6px 26px ${color}cc, 0 0 14px ${color}aa`
          : `0 3px 14px ${color}99, 0 0 8px ${color}55`,
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

function CircleBtn({ icon, label, color, enabled, highlighted, onClick }: {
  icon: React.ReactNode
  label: string
  color: string
  enabled: boolean
  highlighted: boolean
  onClick: () => void
}) {
  const lit = enabled || highlighted
  const borderColor = highlighted ? color : enabled ? `${color}cc` : '#2a3548'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
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

function ActionMenu({ canFire, canVolley, canDodge, onSelect, disabled = false, highlightedAction = null, specialItems = [] }: {
  canFire: boolean
  canVolley: boolean
  canDodge: boolean
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
          onClick={tapSpecial}
        />
        <CircleBtn
          icon={ACTION_ICON.reload} label="Reload" color="#a8b8d0"
          enabled={!disabled} highlighted={reloadHighlighted}
          onClick={() => { if (!disabled) onSelect('reload') }}
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
  // Pokemon-style "battle text" box. Always visible, just current turn's events.
  // Reserved height fits ~5 lines (typical max for a turn) so appending a new
  // line doesn't grow the box and shift the rest of the layout — each line
  // just fades in, no container reflow.
  const isEmpty = lines.length === 0
  const visible = isEmpty ? ['What will you do?'] : lines
  return (
    <div style={{
      background: '#04080e',
      border: '1px solid #1f2e42',
      borderRadius: 12,
      padding: '0.65rem 0.85rem',
      minHeight: 138,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#5a7a9a' }}>
          Turn {turn}
        </p>
      </div>
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
          style={{ fontSize: '0.86rem', color: '#c8d4e0', lineHeight: 1.55 }}
        >
          {line}
        </motion.p>
      ))}
    </div>
  )
}

// Body-portaled fixed overlay anchored just above the MobileTabBar. It
// is NOT a descendant of the framer-motion-heavy RaidCombat tree, so it
// can't pull the body's fixed Nav/MobileTabBar into a compositing layer
// (the regression — see memory feedback_pagetransition_ios_pwa). The
// layout never shifts (ActionMenu stays mounted) and the Lock button
// lands at the bottom where the thumb already is.
function AimPanel({ indicatorRef, zoneRef, flashRef, onLock }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  flashRef:     React.RefObject<HTMLDivElement | null>
  onLock: () => void
}) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 55,
      display: 'flex', justifyContent: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        pointerEvents: 'auto',
        width: '100%', maxWidth: 580,
        background: '#060c14',
        borderTop: '2px solid #2a3548',
        // Bottom pad clears the fixed MobileTabBar (~64px) + safe area.
        padding: '0.85rem 0.85rem calc(env(safe-area-inset-bottom, 0px) + 72px)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ position: 'relative', height: 44, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, overflow: 'hidden' }}>
          {/* Bar-wide flash overlay — fires on lock to punch the result */}
          <div ref={flashRef} style={{
            position: 'absolute', inset: 0, opacity: 0, background: 'transparent',
            pointerEvents: 'none', zIndex: 3,
          }} />
          {/* Moving target zone */}
          <div ref={zoneRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0, zIndex: 1 }}>
            <div style={{ position: 'absolute', inset: '3px 0', background: 'rgba(148,163,184,0.15)', borderRadius: 4 }} />
            <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${(GRAZE_W / (HIT_W + GRAZE_W)) * 50}%`, width: `${(HIT_W / (HIT_W + GRAZE_W)) * 100}%`, background: 'rgba(74,222,128,0.22)' }} />
            <div style={{ position: 'absolute', top: '20%', bottom: '20%', left: 'calc(50% - 1px)', width: 2, background: '#fbbf24' }} />
          </div>
          {/* Indicator */}
          <div ref={indicatorRef} style={{ position: 'absolute', top: 2, bottom: 2, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)', zIndex: 2 }} />
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onLock}
          className="font-cinzel font-700"
          style={{
            width: '100%',
            padding: '0.95rem', borderRadius: 14, background: '#4ade80', color: '#0a1422',
            border: 'none', fontSize: '1rem', cursor: 'pointer',
          }}
        >
          Lock Shot
        </motion.button>
      </div>
    </div>,
    document.body,
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

