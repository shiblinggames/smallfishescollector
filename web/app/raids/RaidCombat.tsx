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
import { motion, AnimatePresence, useAnimation } from 'framer-motion'
import { BroadsideEnemy, EnemyAction } from '@/lib/bossRaids'
import { getActiveEffects } from '@/lib/raidItems'

type ShotResult = 'miss' | 'graze' | 'hit' | 'critical'
type SubPhase   = 'await_input' | 'aiming' | 'revealing' | 'resolving' | 'done'
type Actor      = 'player' | 'enemy'

const MAX_CHARGES = 3
const PLAYER_COLOR = '#4ade80'
const ENEMY_COLOR  = '#ef4444'

// ─── Math helpers ──────────────────────────────────────────────────────────────

const d20 = () => Math.floor(Math.random() * 20) + 1

function rollShotDamage(res: ShotResult, shipMinDamage: number, totalPower: number): number {
  if (res === 'miss') return 0
  const powerMax = shipMinDamage + Math.floor(totalPower / 4)
  if (res === 'critical') {
    const min = shipMinDamage * 2
    const max = Math.round(powerMax * 1.5)
    return Math.floor(Math.random() * (max - min + 1)) + min
  }
  if (res === 'hit') {
    return Math.floor(Math.random() * (powerMax - shipMinDamage + 1)) + shipMinDamage
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
  shipName: string
  playerHpMax: number
  playerHp: number          // current at start of this encounter
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalNavigation: number   // formerly "dodge"
  equippedRaidItems: string[]
  onEnemyDefeated: (remainingPlayerHp: number) => void
  onPlayerDefeated: () => void
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function RaidCombat({
  enemy, isBoss, shipImageUrl, shipName,
  playerHpMax, playerHp: initialPlayerHp,
  shipMinDamage, shipSpeed, totalPower, totalNavigation,
  equippedRaidItems,
  onEnemyDefeated, onPlayerDefeated,
}: RaidCombatProps) {
  const [playerHp, setPlayerHp]       = useState(initialPlayerHp)
  const [enemyHp, setEnemyHp]         = useState(enemy.hpBase)
  const [playerCharges, setPlayerCharges] = useState(0)
  const [enemyCharges, setEnemyCharges]   = useState(0)
  const [subPhase, setSubPhase]       = useState<SubPhase>('await_input')
  const [playerAction, setPlayerAction] = useState<EnemyAction | null>(null)
  const [enemyAction, setEnemyAction]   = useState<EnemyAction | null>(null)
  const [aimResult, setAimResult]     = useState<ShotResult | null>(null)
  const [firstActor, setFirstActor]   = useState<Actor | null>(null)
  const [resolveLog, setResolveLog]   = useState<string[]>([])  // human-readable resolution lines
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
  useEffect(() => { enemyHpRef.current = enemyHp }, [enemyHp])

  // Reset when enemy changes (parent unmounts/remounts on encounter switch)
  useEffect(() => {
    setEnemyHp(enemy.hpBase); enemyHpRef.current = enemy.hpBase
    setPlayerCharges(0); setEnemyCharges(0)
    setSubPhase('await_input')
    setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
    setResolveLog([]); setPHitsplat(null); setEHitsplat(null)
    enemyPatternIdxRef.current = 0
    turnRef.current = 1; setTurn(1)
  }, [enemy.id])

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
      // Freeze frame on a critical lock: bar holds at the lock moment so the impact reads
      if (critFreeze) { rafRef.current = requestAnimationFrame(tick); return }
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

  function selectAction(action: EnemyAction) {
    if (subPhase !== 'await_input') return
    if (action === 'fire'   && !canFire)   return
    if (action === 'volley' && !canVolley) return

    setPlayerAction(action)
    if (action === 'fire' || action === 'volley') {
      // Reset aim positions and begin aiming
      firePosRef.current = 0; fireDirRef.current = 1
      zonePosRef.current = 0.3 + Math.random() * 0.4
      zoneDirRef.current = Math.random() < 0.5 ? 1 : -1
      setSubPhase('aiming')
    } else {
      // Reload/Dodge: skip aim, advance to reveal
      setAimResult(null)
      advanceToReveal(action)
    }
  }

  function lockShot() {
    if (subPhase !== 'aiming' || critFreeze) return
    const res = getShotResult(firePosRef.current, zonePosRef.current)
    setAimResult(res)
    setCritFreeze(true)  // freezes the aim bar at the lock position regardless of result

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

    setTimeout(() => { setCritFreeze(false); advanceToReveal(playerAction!) }, dur)
  }

  function advanceToReveal(pAction: EnemyAction) {
    const eAction = pickEnemyAction()
    setEnemyAction(eAction)

    // Speed roll for turn order
    const pSpeedRoll = rollSpeed(shipSpeed, totalNavigation)
    const eSpeedRoll = rollSpeed(enemy.shipSpeed, 0)
    const first: Actor = pSpeedRoll >= eSpeedRoll ? 'player' : 'enemy'
    setFirstActor(first)
    setSubPhase('revealing')

    // Short beat to register both actions visually, then resolve
    setTimeout(() => {
      resolveTurn(pAction, eAction, first, pSpeedRoll, eSpeedRoll)
    }, 380)
  }

  function resolveTurn(pAction: EnemyAction, eAction: EnemyAction, first: Actor, pSpeedRoll: number, eSpeedRoll: number) {
    setSubPhase('resolving')
    const log: string[] = [`Speed: you ${pSpeedRoll} vs enemy ${eSpeedRoll} → ${first} first`]

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
    }

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

      if (action === 'reload') {
        if (who === 'player') { pCharges = Math.min(MAX_CHARGES, pCharges + 1); log.push(`You reload (+1 → ${pCharges})`) }
        else                  { eCharges = Math.min(MAX_CHARGES, eCharges + 1); log.push(`Enemy reloads (+1 → ${eCharges})`) }
      } else if (action === 'dodge') {
        log.push(`${who === 'player' ? 'You brace' : 'Enemy braces'} for evasion`)
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
          dmg = Math.floor(rollShotDamage(aimResult ?? 'miss', shipMinDamage, totalPower) * mult)
        } else {
          const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
          dmg = base * (action === 'volley' ? 2 : 1)
        }

        splatTarget = isAttackerPlayer ? 'enemy' : 'player'

        if (defenderAction === 'dodge') {
          const def = rollDodge(defenderSpeed, defenderNav)
          const atk = rollAttackerVsDodge(attackerSpeed)
          if (def >= atk) {
            log.push(`${isAttackerPlayer ? 'Enemy dodges' : 'You dodge'} ${def} vs ${atk}`)
            splatText = 'Dodged'
            splatColor = '#38bdf8'
            steps.push({ who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor })
            continue
          } else {
            log.push(`${isAttackerPlayer ? 'Enemy fails dodge' : 'You fail dodge'} ${def} vs ${atk}`)
          }
        }

        if (isAttackerPlayer) {
          eHp = Math.max(0, eHp - dmg)
          log.push(`You ${action === 'volley' ? 'volley' : 'fire'}${aimResult === 'critical' ? ' — CRITICAL!' : ''} for ${dmg}`)
          splatText = `-${dmg}`
          splatColor = aimResult === 'critical' ? '#fbbf24' : '#ef4444'
        } else {
          pHp = Math.max(0, pHp - dmg)
          log.push(`Enemy ${action === 'volley' ? 'volleys' : 'fires'} for ${dmg}`)
          splatText = `-${dmg}`
          splatColor = '#ef4444'
        }
      }

      steps.push({ who, action, pHp, eHp, pCharges, eCharges, splatTarget, splatText, splatColor, big: who === 'player' && aimResult === 'critical' })
    }

    setResolveLog(log)

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

    function playStep(i: number) {
      if (i >= steps.length) {
        setTimeout(() => {
          if (pHp <= 0)      { setSubPhase('done'); onPlayerDefeated(); return }
          if (eHp <= 0)      { setSubPhase('done'); onEnemyDefeated(pHp); return }
          turnRef.current++; setTurn(turnRef.current)
          setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
          setSubPhase('await_input')
        }, 400)
        return
      }

      const step = steps[i]
      const isAttack  = step.action === 'fire' || step.action === 'volley'
      const isDodged  = isAttack && step.splatText === 'Dodged'

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
      }
      // reload / dodge: state already updated via charges above. No splat.

      setTimeout(() => playStep(i + 1), STEP_GAP_MS)
    }

    playStep(0)
  }

  // ─── Render — Pokemon-style battle stage ──────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#04080e',
      border: '2px solid #2a3548',
      borderRadius: 18,
      overflow: 'hidden',
      maxWidth: 580, margin: '0 auto',
    }}>
      {/* Battle stage — ocean scene with ships and HP boxes */}
      <div style={{
        position: 'relative',
        aspectRatio: '5 / 4',
        background: 'linear-gradient(180deg, #1e3a5f 0%, #234567 30%, #2a5274 40%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* Horizon line + water tint — sits higher so the ships have more water under them */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '38%', height: 1,
          background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 24px rgba(140,180,210,0.18)',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '38%', bottom: 0,
          background: 'linear-gradient(180deg, rgba(20,40,60,0.4) 0%, rgba(8,16,28,0.85) 100%)',
        }} />

        {/* Enemy HP nameplate — top-left, with circular portrait badge */}
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 4,
          padding: '0.45rem 0.6rem 0.5rem 0.45rem',
          background: 'rgba(6,12,20,0.9)',
          border: `1px solid ${isBoss ? '#fbbf24' : '#2a3548'}`,
          borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 8,
          minWidth: 160,
        }}>
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
            <HPBar current={enemyHp} max={enemy.hpBase} accent={ENEMY_COLOR} compact />
            <ChargesRow charges={enemyCharges} max={MAX_CHARGES} small />
          </div>
        </div>

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
                  filter: 'drop-shadow(0 3px 6px rgba(0,0,0,0.35))',
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
              {/* Main text */}
              <motion.div
                initial={{ scale: 0.45, y: 12, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.04 }}
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

          {aimResult && aimResult !== 'critical' && critFreeze && (
            <motion.div
              key={`aim-badge-${aimResult}`}
              initial={{ scale: 0.4, opacity: 0, rotate: -8 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 480, damping: 16 }}
              style={{
                position: 'absolute', top: '38%', left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 11, pointerEvents: 'none',
                padding: '0.4rem 0.95rem',
                borderRadius: 999,
                background:
                  aimResult === 'hit'   ? '#4ade80' :
                  aimResult === 'graze' ? '#94a3b8' :
                                          '#6b7280',
                color: '#0a1422',
                fontFamily: 'var(--font-cinzel)', fontWeight: 700,
                fontSize: '1.05rem',
                letterSpacing: '0.06em',
                boxShadow:
                  aimResult === 'hit'
                    ? '0 4px 18px rgba(74,222,128,0.5)'
                    : '0 2px 10px rgba(0,0,0,0.4)',
                whiteSpace: 'nowrap',
              }}
            >
              {aimResult.toUpperCase()}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Player HP box — bottom-right */}
        <div style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 4,
          padding: '0.45rem 0.65rem',
          background: 'rgba(6,12,20,0.9)',
          border: '1px solid #2a3548',
          borderRadius: 10, minWidth: 150,
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: '#ffffff', lineHeight: 1, marginBottom: 4 }}>
            {shipName}
          </p>
          <HPBar current={playerHp} max={playerHpMax} accent={PLAYER_COLOR} compact />
          <ChargesRow charges={playerCharges} max={MAX_CHARGES} small />
        </div>

      </div>

      {/* Bottom panel — persistent log + action UI */}
      <div style={{
        background: '#060c14',
        borderTop: '2px solid #2a3548',
        padding: '0.7rem 0.85rem 0.95rem',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Action log — shows this turn's events (cleared at start of each resolve) */}
        <LogBox lines={resolveLog} turn={turn} />

        {subPhase === 'await_input' && (
          <ActionMenu canFire={canFire} canVolley={canVolley} onSelect={selectAction} />
        )}
        {subPhase === 'aiming' && (
          <AimPanel
            indicatorRef={indicatorRef} zoneRef={zoneRef}
            onLock={lockShot}
            actionLabel={playerAction === 'volley' ? 'VOLLEY' : 'FIRE'}
          />
        )}
        {(subPhase === 'revealing' || subPhase === 'resolving') && (
          <ActionTilesRow
            playerAction={playerAction}
            enemyAction={enemyAction}
            aimResult={aimResult}
            firstActor={firstActor}
          />
        )}
        {subPhase === 'done' && (
          <p className="font-karla" style={{ color: '#a8b8d0', textAlign: 'center', padding: '1.5rem 0' }}>Combat ended.</p>
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
      initial={{ opacity: 0, y: 4, scale: big ? 0.5 : 0.6 }}
      animate={{ opacity: 1, y: big ? -36 : -28, scale: big ? 1.25 : 1 }}
      exit={{ opacity: 0, y: big ? -48 : -38, scale: big ? 1.3 : 1 }}
      transition={{
        opacity: { duration: 0.18 },
        y:       { duration: 0.32, ease: [0.34, 1.56, 0.64, 1] },
        scale:   { duration: 0.32, ease: [0.34, 1.56, 0.64, 1] },
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

function ActionMenu({ canFire, canVolley, onSelect }: {
  canFire: boolean
  canVolley: boolean
  onSelect: (a: EnemyAction) => void
}) {
  const btn = (action: EnemyAction, label: string, sub: string, enabled: boolean, color: string) => (
    <motion.button
      whileTap={enabled ? { scale: 0.94 } : {}}
      disabled={!enabled}
      onClick={() => onSelect(action)}
      style={{
        padding: '0.85rem 0.55rem',
        background: enabled ? '#1c2540' : '#0a1422',
        border: `2px solid ${enabled ? color : '#2a3548'}`,
        borderRadius: 12,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.45,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}
    >
      <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: enabled ? '#ffffff' : '#5a6478' }}>{label}</span>
      <span className="font-karla" style={{ fontSize: '0.68rem', color: enabled ? color : '#4a5468', textAlign: 'center', lineHeight: 1.25 }}>{sub}</span>
    </motion.button>
  )
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
      {btn('fire',    'FIRE',    'Spend 1 ◆',         canFire,   '#4ade80')}
      {btn('volley',  'VOLLEY',  'Spend 3 ◆ · ×2',    canVolley, '#fbbf24')}
      {btn('reload',  'RELOAD',  '+1 ◆ · vulnerable', true,      '#a8b8d0')}
      {btn('dodge',   'DODGE',   'Evade incoming',    true,      '#38bdf8')}
    </div>
  )
}

function LogBox({ lines, turn }: { lines: string[]; turn: number }) {
  // Pokemon-style "battle text" box. Always visible, just current turn's events.
  const visible = lines.length > 0 ? lines : ['What will you do?']
  return (
    <div style={{
      background: '#04080e',
      border: '1px solid #1f2e42',
      borderRadius: 12,
      padding: '0.65rem 0.85rem',
      minHeight: 72,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: '#5a7a9a' }}>
          Turn {turn}
        </p>
      </div>
      {visible.map((line, i) => (
        <p key={i} className="font-karla" style={{ fontSize: '0.86rem', color: '#c8d4e0', lineHeight: 1.55 }}>{line}</p>
      ))}
    </div>
  )
}

function AimPanel({ indicatorRef, zoneRef, onLock, actionLabel }: {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  zoneRef:      React.RefObject<HTMLDivElement | null>
  onLock: () => void
  actionLabel: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.72rem', color: '#fbbf24', textAlign: 'center' }}>
        Lock your shot · {actionLabel}
      </p>
      <div style={{ position: 'relative', height: 44, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 10, overflow: 'hidden' }}>
        {/* Moving target zone */}
        <div ref={zoneRef} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: 0 }}>
          <div style={{ position: 'absolute', inset: '3px 0', background: 'rgba(148,163,184,0.15)', borderRadius: 4 }} />
          <div style={{ position: 'absolute', top: '3px', bottom: '3px', left: `${(GRAZE_W / (HIT_W + GRAZE_W)) * 50}%`, width: `${(HIT_W / (HIT_W + GRAZE_W)) * 100}%`, background: 'rgba(74,222,128,0.22)' }} />
          <div style={{ position: 'absolute', top: '20%', bottom: '20%', left: 'calc(50% - 1px)', width: 2, background: '#fbbf24' }} />
        </div>
        {/* Indicator */}
        <div ref={indicatorRef} style={{ position: 'absolute', top: 2, bottom: 2, width: 4, borderRadius: 2, background: '#fff', boxShadow: '0 0 8px rgba(255,255,255,0.6)' }} />
      </div>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={onLock}
        className="font-cinzel font-700"
        style={{
          padding: '0.85rem', borderRadius: 14, background: '#4ade80', color: '#0a1422',
          border: 'none', fontSize: '0.95rem', cursor: 'pointer',
        }}
      >
        Lock Shot
      </motion.button>
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

