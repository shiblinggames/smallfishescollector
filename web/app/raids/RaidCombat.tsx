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
import { motion, AnimatePresence } from 'framer-motion'
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
  const [pHitsplat, setPHitsplat]     = useState<{ key: number; text: string; color: string } | null>(null)
  const [eHitsplat, setEHitsplat]     = useState<{ key: number; text: string; color: string } | null>(null)

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
    if (subPhase !== 'aiming') return
    const res = getShotResult(firePosRef.current, zonePosRef.current)
    setAimResult(res)
    advanceToReveal(playerAction!)
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

    // After a brief reveal pause, resolve in order
    setTimeout(() => {
      resolveTurn(pAction, eAction, first, pSpeedRoll, eSpeedRoll)
    }, 900)
  }

  function resolveTurn(pAction: EnemyAction, eAction: EnemyAction, first: Actor, pSpeedRoll: number, eSpeedRoll: number) {
    setSubPhase('resolving')
    const log: string[] = [`Speed: you ${pSpeedRoll} vs enemy ${eSpeedRoll} → ${first} first`]

    const order: Actor[] = first === 'player' ? ['player', 'enemy'] : ['enemy', 'player']

    // Track state through the turn locally so kill-mid-turn skips the second actor.
    let pHp = playerHpRef.current
    let eHp = enemyHpRef.current
    let pCharges = playerCharges
    let eCharges = enemyCharges

    for (const who of order) {
      if (pHp <= 0 || eHp <= 0) break
      const action = who === 'player' ? pAction : eAction
      if (action === 'reload') {
        if (who === 'player') { pCharges = Math.min(MAX_CHARGES, pCharges + 1); log.push(`You reload (+1 → ${pCharges})`) }
        else                  { eCharges = Math.min(MAX_CHARGES, eCharges + 1); log.push(`Enemy reloads (+1 → ${eCharges})`) }
      } else if (action === 'dodge') {
        log.push(`${who === 'player' ? 'You brace' : 'Enemy braces'} for evasion`)
      } else if (action === 'fire' || action === 'volley') {
        // Charge cost (the attacker's charges drop in this resolution)
        if (who === 'player') {
          pCharges -= (action === 'volley' ? MAX_CHARGES : 1)
        } else {
          eCharges -= (action === 'volley' ? MAX_CHARGES : 1)
        }
        // Damage roll
        const isAttackerPlayer = who === 'player'
        const attackerSpeed = isAttackerPlayer ? shipSpeed       : enemy.shipSpeed
        const defenderAction = isAttackerPlayer ? eAction         : pAction
        const defenderSpeed  = isAttackerPlayer ? enemy.shipSpeed : shipSpeed
        const defenderNav    = isAttackerPlayer ? 0               : totalNavigation

        // Compute base damage
        let dmg: number
        if (isAttackerPlayer) {
          const bossMult = isBoss
            ? getActiveEffects(equippedRaidItems).filter(e => e.type === 'boss_damage_mult').reduce((a, e) => a * e.value, 1)
            : 1
          const mult = (action === 'volley' ? 2 : 1) * bossMult
          dmg = Math.floor(rollShotDamage(aimResult ?? 'miss', shipMinDamage, totalPower) * mult)
        } else {
          // Enemy damage roll (no aim mechanic): random within enemy.min/max, ×2 for volley
          const base = Math.floor(Math.random() * (enemy.maxDmg - enemy.minDmg + 1)) + enemy.minDmg
          dmg = base * (action === 'volley' ? 2 : 1)
        }

        // Defender dodge if they chose Dodge
        if (defenderAction === 'dodge') {
          const def = rollDodge(defenderSpeed, defenderNav)
          const atk = rollAttackerVsDodge(attackerSpeed)
          if (def >= atk) {
            log.push(`${isAttackerPlayer ? 'Enemy dodges' : 'You dodge'}! ${def} vs ${atk}`)
            // Show dodge hitsplat as 0
            if (isAttackerPlayer) setEHitsplat({ key: Date.now(), text: 'Dodged', color: '#38bdf8' })
            else                  setPHitsplat({ key: Date.now(), text: 'Dodged', color: '#38bdf8' })
            continue
          } else {
            log.push(`${isAttackerPlayer ? 'Enemy fails dodge' : 'You fail dodge'} ${def} vs ${atk}`)
          }
        }

        // Apply damage
        if (isAttackerPlayer) {
          eHp = Math.max(0, eHp - dmg)
          log.push(`You ${action === 'volley' ? 'volley' : 'fire'} for ${dmg} (${aimResult})`)
          setEHitsplat({ key: Date.now(), text: `-${dmg}`, color: aimResult === 'critical' ? '#fbbf24' : '#ef4444' })
        } else {
          pHp = Math.max(0, pHp - dmg)
          log.push(`Enemy ${action === 'volley' ? 'volleys' : 'fires'} for ${dmg}`)
          setPHitsplat({ key: Date.now(), text: `-${dmg}`, color: '#ef4444' })
        }
      }
    }

    // Commit state
    setPlayerHp(pHp); setEnemyHp(eHp); setPlayerCharges(pCharges); setEnemyCharges(eCharges)
    setResolveLog(log)

    // Outcome check after a brief animation pause
    setTimeout(() => {
      if (pHp <= 0) {
        setSubPhase('done')
        onPlayerDefeated()
        return
      }
      if (eHp <= 0) {
        setSubPhase('done')
        onEnemyDefeated(pHp)
        return
      }
      // Next turn
      turnRef.current++; setTurn(turnRef.current)
      setPlayerAction(null); setEnemyAction(null); setAimResult(null); setFirstActor(null)
      setSubPhase('await_input')
    }, 1400)
  }

  // ─── Render — Pokemon-style battle stage ──────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      background: '#04080e',
      border: '2px solid #2a3548',
      borderRadius: 18,
      overflow: 'hidden',
      maxWidth: 480, margin: '0 auto',
    }}>
      {/* Battle stage — ocean scene with ships and HP boxes */}
      <div style={{
        position: 'relative',
        aspectRatio: '4 / 3',
        background: 'linear-gradient(180deg, #1e3a5f 0%, #234567 45%, #2a5274 55%, #0a1c2e 100%)',
        overflow: 'hidden',
      }}>
        {/* Sky gradient already on parent. Add a horizon line + subtle wave hint */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '52%', height: 1,
          background: 'rgba(255,255,255,0.12)', boxShadow: '0 0 24px rgba(140,180,210,0.18)',
        }} />
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '52%', bottom: 0,
          background: 'linear-gradient(180deg, rgba(20,40,60,0.4) 0%, rgba(8,16,28,0.85) 100%)',
        }} />

        {/* Enemy HP box — top-left */}
        <div style={{
          position: 'absolute', top: 10, left: 10, zIndex: 4,
          padding: '0.45rem 0.65rem',
          background: 'rgba(6,12,20,0.9)',
          border: `1px solid ${isBoss ? '#fbbf24' : '#2a3548'}`,
          borderRadius: 10, minWidth: 150,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
            <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#ffffff', lineHeight: 1, flex: 1 }}>
              {enemy.name}
            </p>
            {isBoss && (
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.45rem', color: '#fbbf24', letterSpacing: '0.1em' }}>BOSS</span>
            )}
          </div>
          <HPBar current={enemyHp} max={enemy.hpBase} accent={ENEMY_COLOR} compact />
          <ChargesRow charges={enemyCharges} max={MAX_CHARGES} small />
        </div>

        {/* Enemy ship — upper right area */}
        <motion.div
          key={`enemy-${enemy.id}`}
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'absolute', right: '8%', top: '14%', zIndex: 2,
            width: '38%', maxWidth: 180,
          }}
        >
          <motion.img
            src={enemy.portrait || enemy.image}
            alt={enemy.name}
            animate={{ y: [0, -4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '100%', display: 'block',
              transform: 'scaleX(-1)',  // face the player
              filter: 'drop-shadow(0 8px 20px rgba(239,68,68,0.35))',
            }}
          />
          <AnimatePresence>
            {eHitsplat && <HitsplatOverlay key={eHitsplat.key} text={eHitsplat.text} color={eHitsplat.color} />}
          </AnimatePresence>
        </motion.div>

        {/* Player ship — lower left area, larger ("closer") */}
        <motion.div
          initial={{ x: -60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
          style={{
            position: 'absolute', left: '4%', bottom: '6%', zIndex: 3,
            width: '52%', maxWidth: 240,
          }}
        >
          <motion.img
            src={shipImageUrl}
            alt={shipName}
            animate={{ y: [0, -3, 0] }}
            transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '100%', display: 'block',
              filter: 'drop-shadow(0 10px 22px rgba(74,222,128,0.3))',
            }}
          />
          <AnimatePresence>
            {pHitsplat && <HitsplatOverlay key={pHitsplat.key} text={pHitsplat.text} color={pHitsplat.color} />}
          </AnimatePresence>
        </motion.div>

        {/* Player HP box — bottom-right */}
        <div style={{
          position: 'absolute', bottom: 10, right: 10, zIndex: 4,
          padding: '0.45rem 0.65rem',
          background: 'rgba(6,12,20,0.9)',
          border: '1px solid #2a3548',
          borderRadius: 10, minWidth: 150,
        }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#ffffff', lineHeight: 1, marginBottom: 4 }}>
            {shipName}
          </p>
          <HPBar current={playerHp} max={playerHpMax} accent={PLAYER_COLOR} compact />
          <ChargesRow charges={playerCharges} max={MAX_CHARGES} small />
        </div>

        {/* First-strike indicator overlay */}
        <AnimatePresence>
          {subPhase === 'revealing' && firstActor && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.32 }}
              style={{
                position: 'absolute', top: '46%', left: '50%', transform: 'translate(-50%, -50%)',
                zIndex: 5,
                padding: '0.55rem 1.1rem',
                background: firstActor === 'player' ? 'rgba(74,222,128,0.95)' : 'rgba(239,68,68,0.95)',
                color: '#0a1422', borderRadius: 999,
                fontFamily: 'var(--font-cinzel)', fontSize: '0.85rem', fontWeight: 700,
                letterSpacing: '0.12em',
                boxShadow: `0 4px 18px ${firstActor === 'player' ? 'rgba(74,222,128,0.55)' : 'rgba(239,68,68,0.55)'}`,
              }}
            >
              {firstActor === 'player' ? 'YOU STRIKE FIRST' : 'ENEMY STRIKES FIRST'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom panel — action menu / aim bar / log */}
      <div style={{
        background: '#060c14',
        borderTop: '2px solid #2a3548',
        padding: '0.85rem 0.9rem 1rem',
        minHeight: 175,
      }}>
        {subPhase === 'await_input' && (
          <ActionMenu canFire={canFire} canVolley={canVolley} onSelect={selectAction} turn={turn} />
        )}
        {subPhase === 'aiming' && (
          <AimPanel
            indicatorRef={indicatorRef} zoneRef={zoneRef}
            onLock={lockShot}
            actionLabel={playerAction === 'volley' ? 'VOLLEY' : 'FIRE'}
          />
        )}
        {(subPhase === 'revealing' || subPhase === 'resolving') && (
          <RevealPanel
            playerAction={playerAction}
            enemyAction={enemyAction}
            aimResult={aimResult}
            firstActor={firstActor}
            log={resolveLog}
          />
        )}
        {subPhase === 'done' && (
          <p className="font-karla" style={{ color: '#a8b8d0', textAlign: 'center', padding: '2rem 0' }}>Combat ended.</p>
        )}
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function HPBar({ current, max, accent, compact }: { current: number; max: number; accent: string; compact?: boolean }) {
  const pct = max > 0 ? Math.max(0, (current / max) * 100) : 0
  const h = compact ? 5 : 7
  return (
    <div>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
          <p className="font-karla" style={{ fontSize: '0.52rem', color: '#7a8aa0' }}>HP</p>
          <p className="font-karla font-700" style={{ fontSize: '0.6rem', color: accent }}>{current}/{max}</p>
        </div>
      )}
      <div style={{ height: h, background: 'rgba(0,0,0,0.6)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
      {compact && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
          <p className="font-karla font-700" style={{ fontSize: '0.52rem', color: accent }}>{current}/{max}</p>
        </div>
      )}
    </div>
  )
}

function ChargesRow({ charges, max, small }: { charges: number; max: number; small?: boolean }) {
  const dotSize = small ? 9 : 14
  return (
    <div style={{ display: 'flex', gap: small ? 3 : 4, marginTop: small ? 4 : 6 }}>
      {Array.from({ length: max }).map((_, i) => (
        <div key={i} style={{
          width: dotSize, height: dotSize, borderRadius: '50%',
          background: i < charges ? '#fbbf24' : '#1c2540',
          border: `1px solid ${i < charges ? '#fbbf24' : '#3a4560'}`,
          boxShadow: i < charges ? `0 0 ${small ? 4 : 6}px rgba(251,191,36,0.55)` : 'none',
        }} />
      ))}
    </div>
  )
}

function HitsplatOverlay({ text, color }: { text: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 0, scale: 0.6 }}
      animate={{ opacity: 1, y: -32, scale: 1.05 }}
      exit={{ opacity: 0, y: -48, scale: 1 }}
      transition={{ duration: 0.95, ease: [0.34, 1.56, 0.64, 1] }}
      style={{
        position: 'absolute', left: '50%', top: '40%', transform: 'translateX(-50%)',
        pointerEvents: 'none', zIndex: 10,
        background: color, color: '#ffffff',
        padding: '0.3rem 0.7rem', borderRadius: 12,
        fontFamily: 'var(--font-cinzel)', fontWeight: 700, fontSize: '0.95rem',
        boxShadow: `0 4px 18px ${color}aa, 0 0 10px ${color}66`,
        textShadow: '0 1px 4px rgba(0,0,0,0.6)',
      }}
    >
      {text}
    </motion.div>
  )
}

function ActionMenu({ canFire, canVolley, onSelect, turn }: {
  canFire: boolean
  canVolley: boolean
  onSelect: (a: EnemyAction) => void
  turn: number
}) {
  const btn = (action: EnemyAction, label: string, sub: string, enabled: boolean, color: string) => (
    <motion.button
      whileTap={enabled ? { scale: 0.94 } : {}}
      disabled={!enabled}
      onClick={() => onSelect(action)}
      style={{
        padding: '0.85rem 0.6rem',
        background: enabled ? '#1c2540' : '#0a1422',
        border: `2px solid ${enabled ? color : '#2a3548'}`,
        borderRadius: 14,
        cursor: enabled ? 'pointer' : 'not-allowed',
        opacity: enabled ? 1 : 0.45,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
      }}
    >
      <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: enabled ? '#ffffff' : '#5a6478' }}>{label}</span>
      <span className="font-karla" style={{ fontSize: '0.56rem', color: enabled ? color : '#4a5468', textAlign: 'center', lineHeight: 1.25 }}>{sub}</span>
    </motion.button>
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#7a8aa0', textAlign: 'center' }}>
        Turn {turn} · Pick Your Action
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {btn('fire',    'FIRE',    'Spend 1 ◆',         canFire,   '#4ade80')}
        {btn('volley',  'VOLLEY',  'Spend 3 ◆ · ×2',    canVolley, '#fbbf24')}
        {btn('reload',  'RELOAD',  '+1 ◆ (vulnerable)', true,      '#a8b8d0')}
        {btn('dodge',   'DODGE',   'Evade incoming',    true,      '#38bdf8')}
      </div>
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
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: '#fbbf24', textAlign: 'center' }}>
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

function RevealPanel({ playerAction, enemyAction, aimResult, firstActor, log }: {
  playerAction: EnemyAction | null
  enemyAction: EnemyAction | null
  aimResult: ShotResult | null
  firstActor: Actor | null
  log: string[]
}) {
  const labelFor = (a: EnemyAction | null) =>
    a === 'fire' ? 'Fire' : a === 'volley' ? 'Volley' : a === 'reload' ? 'Reload' : a === 'dodge' ? 'Dodge' : '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <ActionTile label="YOU" action={labelFor(playerAction)} aim={aimResult} first={firstActor === 'player'} color="#4ade80" />
        <ActionTile label="ENEMY" action={labelFor(enemyAction)} first={firstActor === 'enemy'} color="#ef4444" />
      </div>
      {log.length > 0 && (
        <div style={{ padding: '0.6rem 0.75rem', background: '#04080e', border: '1px solid #1f2e42', borderRadius: 10 }}>
          {log.map((line, i) => (
            <p key={i} className="font-karla" style={{ fontSize: '0.62rem', color: '#a8b8d0', lineHeight: 1.55 }}>{line}</p>
          ))}
        </div>
      )}
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
        position: 'absolute', top: -8, left: '50%', transform: 'translateX(-50%)',
        fontSize: '0.5rem', background: color, color: '#0a1422', padding: '2px 8px',
        borderRadius: 999, fontFamily: 'var(--font-karla)', fontWeight: 700, letterSpacing: '0.1em',
      }}>FIRST</span>}
      <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#7a8aa0' }}>{label}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#ffffff', lineHeight: 1.1 }}>{action}</p>
      {aim && <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: aim === 'critical' ? '#fbbf24' : aim === 'hit' ? '#4ade80' : aim === 'graze' ? '#94a3b8' : '#6b7280', marginTop: 2 }}>{aim.toUpperCase()}</p>}
    </div>
  )
}

