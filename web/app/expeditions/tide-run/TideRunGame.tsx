'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { commitTideRun } from './actions'

// ── Tunable constants ────────────────────────────────────────────────────────
const SHIP_X_RATIO    = 0.22
const SHIP_HEIGHT_PCT = 0.095  // small Canabalt-style sprite (~9.5% of canvas height)
const SHIP_ASPECT     = 1031 / 672   // trimmed boatrun.png

// Ship physics — Canabalt feel. Boat rides the wave surface; press-and-hold
// to jump (longer hold → higher jump). No automatic launches off crests.
const GRAVITY                  = 2800  // px/s² full gravity (in-air, after hold release)
const JUMP_IMPULSE             = 590   // px/s upward kick when press starts a jump
const JUMP_HOLD_GRAVITY_MULT   = 0.30  // gravity multiplier while hold is active (sustained jump)
const JUMP_MAX_HOLD_SEC        = 0.40  // hold beyond this no longer extends the jump
const BASE_SPEED               = 290   // px/s horizontal scroll (Canabalt rolls)
const SPEED_RAMP               = 7     // px/s² — gentle, unbounded climb (Canabalt-style)
const MAX_SPEED                = 1500  // soft safety cap; reached only after ~3 min of perfect play

// Sea surface — gentle long-period swells so the boat "runs" along the wave
const SEA_BASE_Y_PCT      = 0.78
const WAVE_PRIMARY_PERIOD = 560
const WAVE_PRIMARY_AMP    = 18
const WAVE_SECONDARY_PERIOD = 940
const WAVE_SECONDARY_AMP  = 7
const WAVE_AMP_RAMP_DISTANCE = 8000
const WAVE_AMP_RAMP_MAX   = 1.25

// Surface hazards — rocks/spikes poking out of the water. Boat clears them
// by being airborne when crossing. Size per spawn picks from three tiers
// with distance-based unlocks so early runs aren't punishingly hard.
const HAZARD_SPAWN_SPACING = 360   // base world px between hazard centers
const HAZARD_WARMUP        = 1200  // world px before the first hazard spawns
const TIER_SMALL_ONLY_M    = 25    // first ~25m: only small rocks (tap-clearable)
const TIER_NO_LARGE_M      = 90    // 25–90m: small + medium; no large rocks yet
const APPROACH_BUFFER_MED  = 80    // extra world px of approach before a medium rock
const APPROACH_BUFFER_LRG  = 240   // extra world px before a large rock (real reaction time)

// Time-based floors so high speeds don't outpace human reaction. Spacing and
// tier buffers scale with current speed once these times become more
// constraining than the world-px constants above.
const MIN_REACTION_TIME_SEC = 0.55  // floor on time between consecutive hazards
const MED_EXTRA_TIME_SEC    = 0.10  // extra reaction time for medium rocks
const LRG_EXTRA_TIME_SEC    = 0.30  // extra reaction time for large rocks

// Shoals — deadly horizontal zones on the wave. Boat dies if grounded
// inside one. Player must hold-jump long enough to clear the zone's width.
// Width auto-scales with current speed so the game can never spawn an
// un-clearable shoal.
const SHOAL_CHANCE             = 0.20  // probability a spawn slot becomes a shoal
const SHOAL_WARMUP_M           = 50    // no shoals in the first 50m (rocks first)
const SHOAL_MIN_WIDTH          = 80    // narrowest shoal, always tap-clearable
const SHOAL_CLEARANCE_FRACTION = 0.70  // % of full-hold distance used as max width
const SHOAL_AFTER_ROCK_TIME_SEC = 1.15 // min time from previous rock to shoal

// Shoal clusters — multiple shoals in sequence with narrow safe gaps between
// them. The safe gaps are the "rooftops" the player has to land on. This is
// the precision-jump mechanic: under-jump → die in shoal, over-jump → die in
// the next shoal, perfect hold → land on the safe strip.
const SHOAL_CLUSTER_CHANCE         = 0.35   // % of shoal spawns that become clusters (else single)
const SHOAL_CLUSTER_WARMUP_M       = 140    // clusters only appear past 140m
const SHOAL_CLUSTER_MIN_COUNT      = 2      // shoals in a cluster (inclusive)
const SHOAL_CLUSTER_MAX_COUNT      = 3      // capped at 3 (was 4) so chains stay readable
const SHOAL_CLUSTER_MEMBER_MIN_PX  = 80     // each cluster shoal's min width
const SHOAL_CLUSTER_MEMBER_MAX_PX  = 120    // each cluster shoal's max width
const SHOAL_CLUSTER_SAFE_GAP_MIN_PX = 165   // safe-landing strip between shoals — min width
const SHOAL_CLUSTER_SAFE_GAP_MAX_PX = 235   // safe-landing strip — max width

// Beacons — disguised detection devices that look like rocks. Smash through
// grounded to disable the beacon and stay hidden; jumping over it lets the
// signal go off and your ship is spotted. Subtle visual cues: faint rust on
// the cracks, a thin antenna, a pulsing amber signal light. Tricks the
// "see rock → jump" reflex. On airborne contact, the game pauses for
// BEACON_DETECT_FLASH_SEC while a beam of light fires upward, then wreck.
const BEACON_CHANCE              = 0.15  // probability a spawn becomes a beacon
const BEACON_WARMUP_M            = 80    // beacons only after 80m (player learns rocks first)
const BEACON_AFTER_ROCK_TIME_SEC = 1.05  // need to land from a previous jump before reaching one
const BEACON_DETECT_FLASH_SEC    = 0.55  // duration the detection beam plays before wrecked screen

// Wave surface modulation — long-period alternation between calm and rolling
// sections so the run doesn't feel monotonous.
const WAVE_FLATNESS_PERIOD = 2200  // world px per calm/rolling cycle

// Currents — slow-zones on the surface. Ride through to slow down (more
// reaction time); jump over to skip the slowdown. Spawned in the gap
// between hazards so they never overlap a rock.
const CURRENT_CHANCE       = 0.22  // probability of a current spawning after each hazard
const CURRENT_WIDTH_MIN    = 0.18  // % of canvas width
const CURRENT_WIDTH_MAX    = 0.32  // % of canvas width
const CURRENT_SPEED_MULT   = 0.55  // effective scroll speed when grounded inside a current
const CURRENT_WARMUP_M     = 35    // currents don't appear until 35m into the run
const CURRENT_ENTER_RATE   = 5.0   // 1/s — how fast the boat slows entering a current
const CURRENT_EXIT_RATE    = 1.6   // 1/s — how slow the boat re-accelerates leaving one

// Hitbox inset on the trimmed sprite
const HITBOX_INSET = { top: 0.35, right: 0.12, bottom: 0.08, left: 0.08 }

const METERS_PER_PIXEL = 1 / 60
const HIGH_SCORE_KEY = 'tide-run-best'

// ── Types ────────────────────────────────────────────────────────────────────
type GameState = 'ready' | 'playing' | 'dead'

interface Hazard {
  x: number          // world x (left edge of hazard)
  width: number
  height: number     // sticks up above the surface by this many px
}

interface Current {
  x: number          // world x (left edge of current zone)
  width: number      // width of slow-zone
}

interface Shoal {
  x: number          // world x (left edge of shoal)
  width: number      // width of deadly zone
}

interface Beacon {
  x: number          // world x (left edge)
  width: number
  height: number     // cosmetic rock height
  shatteredAt: number // performance.now() when smashed, 0 = intact
}

// ── Sea surface helper ───────────────────────────────────────────────────────
// Multi-sine wave is multiplied by a long-period "flatness" modulator so the
// sea alternates between calm stretches and rolling stretches.
function seaSurfaceY(worldX: number, ch: number, distanceScrolled: number): number {
  const ramp = 1 + Math.min(distanceScrolled / WAVE_AMP_RAMP_DISTANCE, 1) * (WAVE_AMP_RAMP_MAX - 1)
  const TAU = Math.PI * 2
  const w1 = Math.sin(worldX / WAVE_PRIMARY_PERIOD * TAU) * WAVE_PRIMARY_AMP
  const w2 = Math.sin(worldX / WAVE_SECONDARY_PERIOD * TAU + 1.1) * WAVE_SECONDARY_AMP
  // 0 = perfectly flat sea, 1 = full wave amplitude. Slow cosine modulation.
  const flatness = (Math.cos(worldX / WAVE_FLATNESS_PERIOD * TAU) + 1) / 2
  return ch * SEA_BASE_Y_PCT - (w1 + w2) * ramp * flatness
}

// ── Game ─────────────────────────────────────────────────────────────────────
interface TideRunGameProps {
  initialCommittedToday?: boolean
}

export default function TideRunGame({ initialCommittedToday = false }: TideRunGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number>(0)
  const shipImgRef = useRef<HTMLImageElement | null>(null)

  // All mutable game state lives in a single ref. React state is only for UI.
  const gRef = useRef({
    state: 'ready' as GameState,
    cw: 0,
    ch: 0,
    shipH: 0,
    shipW: 0,
    shipY: 0,
    shipVy: 0,
    airborne: false,
    scrollX: 0,
    speed: BASE_SPEED,
    elapsed: 0,
    hazards: [] as Hazard[],
    currents: [] as Current[],
    shoals: [] as Shoal[],
    beacons: [] as Beacon[],
    lastSpawnType: null as 'rock' | 'shoal' | 'beacon' | null,
    detectingUntil: 0,        // performance.now() timestamp; while > now() the detection beam is playing
    detectingBeaconX: 0,      // world x center of the beacon that triggered detection
    nextSpawnAt: 0,
    distance: 0,
    deathFlashUntil: 0,
    lastScoreUpdate: 0,
    holding: false,         // is the player currently holding to extend a jump?
    jumpHoldStart: 0,       // performance.now() of current jump's start
    lastHazardTier: null as 'small' | 'medium' | 'large' | null,
    speedMult: 1,           // smoothed effective scroll multiplier (current slowdown eases in/out)
  })

  const [uiState, setUiState] = useState<GameState>('ready')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [committedToday, setCommittedToday] = useState(initialCommittedToday)
  const [committing, setCommitting] = useState(false)
  const [commitReward, setCommitReward] = useState<{ doubloons: number; xp: number } | null>(null)
  const [commitError, setCommitError] = useState<string | null>(null)

  // Reset commit reward feedback when a new run starts
  useEffect(() => {
    if (uiState === 'playing') {
      setCommitReward(null)
      setCommitError(null)
    }
  }, [uiState])

  const handleCommit = useCallback(async () => {
    if (committing || committedToday) return
    if (score < 1) return
    setCommitting(true)
    setCommitError(null)
    const distance = score
    const result = await commitTideRun(distance)
    setCommitting(false)
    if ('ok' in result) {
      setCommittedToday(true)
      setCommitReward({ doubloons: result.doubloons, xp: result.xp })
      // Tell the nav to refresh the doubloon count
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('doubloons-changed'))
      }
    } else {
      setCommitError(result.error)
      // If the server says "already committed", lock the UI to match
      if (result.error.includes('Already')) setCommittedToday(true)
    }
  }, [committing, committedToday, score])

  // ── Load sprite + best score ───────────────────────────────────────────────
  useEffect(() => {
    const img = new Image()
    img.src = '/boatrun.png'
    img.onload = () => { shipImgRef.current = img }
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(HIGH_SCORE_KEY) : null
    if (stored) setHighScore(parseInt(stored, 10) || 0)
  }, [])

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  const resize = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapperRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(rect.width * dpr)
    canvas.height = Math.floor(rect.height * dpr)
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const g = gRef.current
    g.cw = rect.width
    g.ch = rect.height
    g.shipH = rect.height * SHIP_HEIGHT_PCT
    g.shipW = g.shipH * SHIP_ASPECT
    if (g.state === 'ready') {
      // Park the ship sitting on the sea surface at its screen x
      const cx = rect.width * SHIP_X_RATIO + g.shipW / 2
      const wy = seaSurfaceY(cx + g.scrollX, rect.height, 0)
      g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
      g.airborne = false
    }
  }, [])

  useEffect(() => {
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [resize])

  // ── Reset game ─────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    const g = gRef.current
    g.scrollX = 0
    g.speed = BASE_SPEED
    g.elapsed = 0
    g.hazards = []
    g.currents = []
    g.shoals = []
    g.beacons = []
    g.lastSpawnType = null
    g.detectingUntil = 0
    g.detectingBeaconX = 0
    g.nextSpawnAt = HAZARD_WARMUP
    g.distance = 0
    g.deathFlashUntil = 0
    g.lastScoreUpdate = 0
    g.shipVy = 0
    g.airborne = false
    g.holding = false
    g.jumpHoldStart = 0
    g.lastHazardTier = null
    g.speedMult = 1
    // Land ship on the sea at its screen x
    const cx = g.cw * SHIP_X_RATIO + g.shipW / 2
    const wy = seaSurfaceY(cx + g.scrollX, g.ch, 0)
    g.shipY = wy - g.shipH * (1 - HITBOX_INSET.bottom)
  }, [])

  // ── Press / release handlers ───────────────────────────────────────────────
  const onPress = useCallback(() => {
    const g = gRef.current
    if (g.state === 'ready') {
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      return
    }
    if (g.state === 'dead') {
      if (performance.now() < g.deathFlashUntil + 350) return
      reset()
      g.state = 'playing'
      setUiState('playing')
      setScore(0)
      return
    }
    if (g.state === 'playing' && !g.airborne) {
      // Start a jump — initial impulse + open the hold window
      g.shipVy = -JUMP_IMPULSE
      g.airborne = true
      g.holding = true
      g.jumpHoldStart = performance.now()
    }
  }, [reset])

  const onRelease = useCallback(() => {
    const g = gRef.current
    g.holding = false
  }, [])

  // ── Spawn one surface hazard ──────────────────────────────────────────────
  // Each spawn slot picks either a rock (with tier) or a shoal. Tier is
  // gated by distance so early game is forgiving. Shoal widths auto-scale
  // with current speed so the game can never spawn an unclearable one.
  const spawnHazard = useCallback(() => {
    const g = gRef.current
    const distance = g.distance

    // Base spacing scaled by speed (time-based floor for fairness)
    const baseSpacing = Math.max(HAZARD_SPAWN_SPACING, g.speed * MIN_REACTION_TIME_SEC)

    // ── Maybe spawn a beacon (looks like a rock, kills you if you jump) ──
    const canBeacon = distance > BEACON_WARMUP_M && g.lastSpawnType !== 'beacon'
    if (canBeacon && Math.random() < BEACON_CHANCE) {
      // Small or medium size only (large ones would be too obvious as traps)
      const isSmall = Math.random() < 0.55
      const height = isSmall ? g.ch * 0.035 : g.ch * 0.075
      const width = isSmall ? g.cw * 0.06 : g.cw * 0.085
      // After-rock buffer — player must be able to land before reaching it
      if (g.lastSpawnType === 'rock') {
        const minBuffer = g.speed * BEACON_AFTER_ROCK_TIME_SEC
        if (baseSpacing < minBuffer) g.nextSpawnAt += (minBuffer - baseSpacing)
      }
      g.beacons.push({ x: g.nextSpawnAt, width, height, shatteredAt: 0 })
      g.nextSpawnAt += baseSpacing
      g.lastSpawnType = 'beacon'
      return
    }

    // ── Maybe spawn a shoal (or cluster of shoals) instead of a rock ──
    const canShoal = distance > SHOAL_WARMUP_M && g.lastSpawnType !== 'shoal'
    if (canShoal && Math.random() < SHOAL_CHANCE) {
      // Full-hold airtime ≈ 0.85s; shoal width is a fraction of that distance.
      const fullHoldDistance = g.speed * 0.85
      const maxClearableWidth = Math.min(fullHoldDistance * SHOAL_CLEARANCE_FRACTION, g.cw * 0.55)
      if (maxClearableWidth > SHOAL_MIN_WIDTH) {
        // After a rock, the player needs time to land + react before they can
        // jump again to clear the shoal.
        if (g.lastSpawnType === 'rock') {
          const minBuffer = g.speed * SHOAL_AFTER_ROCK_TIME_SEC
          if (baseSpacing < minBuffer) g.nextSpawnAt += (minBuffer - baseSpacing)
        }

        // Cluster vs single: clusters introduce the "narrow rooftop" precision
        // mechanic — multiple shoals with safe-landing strips between them.
        const wantCluster = distance > SHOAL_CLUSTER_WARMUP_M && Math.random() < SHOAL_CLUSTER_CHANCE
        if (wantCluster) {
          const count = SHOAL_CLUSTER_MIN_COUNT +
            Math.floor(Math.random() * (SHOAL_CLUSTER_MAX_COUNT - SHOAL_CLUSTER_MIN_COUNT + 1))
          // Cap member width to leave headroom for the safe-gap landings
          const memberMax = Math.min(SHOAL_CLUSTER_MEMBER_MAX_PX, maxClearableWidth * 0.6)
          let curX = g.nextSpawnAt
          for (let i = 0; i < count; i++) {
            const w = SHOAL_CLUSTER_MEMBER_MIN_PX +
              Math.random() * Math.max(0, memberMax - SHOAL_CLUSTER_MEMBER_MIN_PX)
            g.shoals.push({ x: curX, width: w })
            curX += w
            if (i < count - 1) {
              const gap = SHOAL_CLUSTER_SAFE_GAP_MIN_PX +
                Math.random() * (SHOAL_CLUSTER_SAFE_GAP_MAX_PX - SHOAL_CLUSTER_SAFE_GAP_MIN_PX)
              curX += gap
            }
          }
          g.nextSpawnAt = curX + baseSpacing
        } else {
          // Single shoal
          const wpWidth = SHOAL_MIN_WIDTH + Math.random() * (maxClearableWidth - SHOAL_MIN_WIDTH)
          g.shoals.push({ x: g.nextSpawnAt, width: wpWidth })
          g.nextSpawnAt += wpWidth + baseSpacing
        }

        g.lastSpawnType = 'shoal'
        return
      }
      // else: too slow to clear even the min — fall through and spawn a rock
    }

    const r = Math.random()

    let tier: 'small' | 'medium' | 'large'
    if (distance < TIER_SMALL_ONLY_M) {
      tier = 'small'
    } else if (distance < TIER_NO_LARGE_M) {
      tier = r < 0.55 ? 'small' : 'medium'
    } else {
      if (r < 0.40) tier = 'small'
      else if (r < 0.75) tier = 'medium'
      else tier = 'large'
    }

    // Never spawn two large rocks in a row — the gap can be unclearable at
    // mid speeds (boat lands a hair before the second rock arrives but can't
    // reach 80px of clearance in time). Demote to medium when this would happen.
    if (tier === 'large' && g.lastHazardTier === 'large') {
      tier = 'medium'
    }

    // Large rocks on a wave crest are unfair: the boat launches from a lower
    // surface point and has to clear (waveDiff + rockHeight), eating most of
    // the jump margin. Only allow large rocks where the local wave is at or
    // below sea level (troughs and down-slopes). Crest-side spawns → medium.
    if (tier === 'large') {
      const probableX = g.nextSpawnAt + APPROACH_BUFFER_LRG + g.cw * 0.105 / 2
      const surfaceAtRock = seaSurfaceY(probableX, g.ch, g.scrollX)
      const baseY = g.ch * SEA_BASE_Y_PCT
      if (surfaceAtRock < baseY - g.ch * 0.015) {
        tier = 'medium'
      }
    }
    g.lastHazardTier = tier

    let height: number, width: number
    if (tier === 'small') {
      height = g.ch * 0.035
      width = g.cw * 0.06
    } else if (tier === 'medium') {
      height = g.ch * 0.075
      width = g.cw * 0.085
    } else {
      height = g.ch * 0.115
      width = g.cw * 0.105
    }

    // Spacing scales with current speed past a threshold so the time between
    // hazards never drops below MIN_REACTION_TIME_SEC.
    const medBuffer = Math.max(APPROACH_BUFFER_MED, g.speed * MED_EXTRA_TIME_SEC)
    const lrgBuffer = Math.max(APPROACH_BUFFER_LRG, g.speed * LRG_EXTRA_TIME_SEC)

    // Push this hazard further out if it's a hard one — gives reaction time
    if (tier === 'medium') g.nextSpawnAt += medBuffer
    else if (tier === 'large') g.nextSpawnAt += lrgBuffer

    const hazardX = g.nextSpawnAt
    g.hazards.push({ x: hazardX, width, height })
    g.nextSpawnAt += baseSpacing
    g.lastSpawnType = 'rock'

    // Maybe drop a current in the gap before the NEXT hazard.
    // Place it well clear of both this hazard and the next so it never overlaps.
    if (distance > CURRENT_WARMUP_M && Math.random() < CURRENT_CHANCE) {
      const cw = g.cw * (CURRENT_WIDTH_MIN + Math.random() * (CURRENT_WIDTH_MAX - CURRENT_WIDTH_MIN))
      const gapStart = hazardX + width + g.cw * 0.05         // 5% of cw past this hazard
      const gapEnd = g.nextSpawnAt - g.cw * 0.05              // 5% of cw before next hazard
      if (gapEnd - gapStart > cw) {
        const cx = gapStart + Math.random() * (gapEnd - gapStart - cw)
        g.currents.push({ x: cx, width: cw })
      }
    }
  }, [])

  // ── Surface hazard collision ──────────────────────────────────────────────
  // The drawn rock has a wider base (the anchor flare) and a much narrower
  // spike above the surface. Use only the visible spike's x-range for
  // collision so grazing past the visual edges doesn't trigger a death.
  const ROCK_COLLISION_LEFT_PCT  = 0.22  // % of width before collision starts
  const ROCK_COLLISION_RIGHT_PCT = 0.18  // % of width past which no collision

  const collidesWithHazard = useCallback((shipScreenX: number) => {
    const g = gRef.current
    const hx = shipScreenX + g.shipW * HITBOX_INSET.left
    const hy = g.shipY + g.shipH * HITBOX_INSET.top
    const hw = g.shipW * (1 - HITBOX_INSET.left - HITBOX_INSET.right)
    const hbot = hy + g.shipH * (1 - HITBOX_INSET.bottom - HITBOX_INSET.top)

    for (const obs of g.hazards) {
      const colLeft = obs.x + obs.width * ROCK_COLLISION_LEFT_PCT
      const colRight = obs.x + obs.width * (1 - ROCK_COLLISION_RIGHT_PCT)
      const ox = colLeft - g.scrollX
      const cw = colRight - colLeft
      if (ox + cw < hx) continue
      if (ox > hx + hw) break
      const hazardSurfaceY = seaSurfaceY(obs.x + obs.width / 2, g.ch, g.scrollX)
      const hazardTop = hazardSurfaceY - obs.height
      // Collide if boat's hitbox bottom is below hazard's top
      if (hbot > hazardTop) return true
    }
    return false
  }, [])

  // ── Step ──────────────────────────────────────────────────────────────────
  const step = useCallback((dt: number) => {
    const g = gRef.current

    // Detection flash in progress: freeze gameplay, wait it out, then wreck.
    if (g.detectingUntil > 0) {
      if (performance.now() >= g.detectingUntil) {
        g.detectingUntil = 0
        g.state = 'dead'
        g.deathFlashUntil = performance.now() + 250
        setUiState('dead')
        const finalMeters = Math.floor(g.distance)
        if (finalMeters > highScore) {
          setHighScore(finalMeters)
          if (typeof window !== 'undefined') window.localStorage.setItem(HIGH_SCORE_KEY, String(finalMeters))
        }
      }
      return
    }

    if (g.state !== 'playing') return

    g.elapsed += dt
    g.speed = Math.min(BASE_SPEED + SPEED_RAMP * g.elapsed, MAX_SPEED)

    const shipScreenX = g.cw * SHIP_X_RATIO
    const cx = shipScreenX + g.shipW / 2

    // Effective scroll speed eases in/out of currents — asymmetric so the boat
    // gets grabbed fast but re-accelerates gradually (water resistance).
    let targetMult = 1
    if (!g.airborne) {
      const boatWorldX = shipScreenX + g.scrollX
      for (const c of g.currents) {
        if (boatWorldX >= c.x && boatWorldX <= c.x + c.width) {
          targetMult = CURRENT_SPEED_MULT
          break
        }
      }
    }
    const rate = targetMult < g.speedMult ? CURRENT_ENTER_RATE : CURRENT_EXIT_RATE
    const k = 1 - Math.exp(-rate * dt)
    g.speedMult += (targetMult - g.speedMult) * k
    g.scrollX += g.speed * g.speedMult * dt
    g.distance = g.scrollX * METERS_PER_PIXEL

    const surfaceY = seaSurfaceY(cx + g.scrollX, g.ch, g.scrollX)

    if (g.airborne) {
      // Variable-height jump: reduced gravity while the player is holding,
      // up to JUMP_MAX_HOLD_SEC and only while still rising.
      let gravityNow = GRAVITY
      if (g.holding && g.shipVy < 0) {
        const heldFor = (performance.now() - g.jumpHoldStart) / 1000
        if (heldFor < JUMP_MAX_HOLD_SEC) {
          gravityNow = GRAVITY * JUMP_HOLD_GRAVITY_MULT
        } else {
          g.holding = false
        }
      }
      g.shipVy += gravityNow * dt
      g.shipY += g.shipVy * dt

      // Land when falling onto surface
      if (g.shipVy >= 0) {
        const hitboxBottom = g.shipY + g.shipH * (1 - HITBOX_INSET.bottom)
        if (hitboxBottom >= surfaceY) {
          g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
          g.shipVy = 0
          g.airborne = false
          // Holding through a landing doesn't auto-jump; require a release+press
          g.holding = false
        }
      }
    } else {
      // Grounded — locked to wave surface (Canabalt-style auto-run)
      g.shipY = surfaceY - g.shipH * (1 - HITBOX_INSET.bottom)
      g.shipVy = 0
    }

    // Hazard spawn + prune
    while (g.nextSpawnAt < g.scrollX + g.cw * 1.05) spawnHazard()
    while (g.hazards.length > 0 && g.hazards[0].x + g.hazards[0].width < g.scrollX) {
      g.hazards.shift()
    }
    while (g.currents.length > 0 && g.currents[0].x + g.currents[0].width < g.scrollX) {
      g.currents.shift()
    }
    while (g.shoals.length > 0 && g.shoals[0].x + g.shoals[0].width < g.scrollX) {
      g.shoals.shift()
    }
    while (g.beacons.length > 0 && g.beacons[0].x + g.beacons[0].width < g.scrollX) {
      g.beacons.shift()
    }

    // Death checks
    let dead = false
    const boatWorldX = shipScreenX + g.scrollX

    if (collidesWithHazard(shipScreenX)) {
      dead = true
    } else if (!g.airborne) {
      // Grounded inside a shoal = die
      for (const wp of g.shoals) {
        if (boatWorldX >= wp.x && boatWorldX <= wp.x + wp.width) {
          dead = true
          break
        }
      }
    }

    // Beacons: airborne over an intact beacon = detected → die (after the
    // detection beam plays). Grounded = smash through, mark shatteredAt for
    // the satisfying break-apart animation.
    if (!dead) {
      for (const cr of g.beacons) {
        if (cr.shatteredAt > 0) continue
        if (boatWorldX < cr.x || boatWorldX > cr.x + cr.width) continue
        if (g.airborne) {
          // Start detection flash — gameplay freezes, beam plays, then death
          g.detectingUntil = performance.now() + BEACON_DETECT_FLASH_SEC * 1000
          g.detectingBeaconX = cr.x + cr.width / 2
          // Lock in the final score now (distance is frozen during flash)
          setScore(Math.floor(g.distance))
          break
        } else {
          cr.shatteredAt = performance.now()
        }
      }
    }

    if (dead) {
      g.state = 'dead'
      g.deathFlashUntil = performance.now() + 250
      const finalMeters = Math.floor(g.distance)
      setScore(finalMeters)
      setUiState('dead')
      if (finalMeters > highScore) {
        setHighScore(finalMeters)
        if (typeof window !== 'undefined') window.localStorage.setItem(HIGH_SCORE_KEY, String(finalMeters))
      }
    } else {
      const now = performance.now()
      if (now - g.lastScoreUpdate > 180) {
        g.lastScoreUpdate = now
        setScore(Math.floor(g.distance))
      }
    }
  }, [spawnHazard, collidesWithHazard, highScore])

  // ── Render ─────────────────────────────────────────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const g = gRef.current
    const { cw, ch } = g
    if (cw === 0 || ch === 0) return

    // ── Sky (full canvas — sea path will overpaint below the surface) ──
    const sky = ctx.createLinearGradient(0, 0, 0, ch)
    sky.addColorStop(0, '#5da7d4')
    sky.addColorStop(0.7, '#a8d4ec')
    sky.addColorStop(1, '#a8d4ec')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, cw, ch)

    // ── Parallax: distant clouds (40% scroll speed) ──
    drawClouds(ctx, cw, ch, g.scrollX * 0.40)
    // ── Parallax: distant islands at the horizon (15% scroll speed) ──
    drawDistantIslands(ctx, cw, ch, g.scrollX * 0.15)

    // ── Dynamic sea surface ──
    ctx.beginPath()
    ctx.moveTo(0, ch)
    for (let x = 0; x <= cw; x += 4) {
      ctx.lineTo(x, seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }
    ctx.lineTo(cw, ch)
    ctx.closePath()
    const sea = ctx.createLinearGradient(0, ch * SEA_BASE_Y_PCT - 30, 0, ch)
    sea.addColorStop(0, '#1f5b80')
    sea.addColorStop(0.5, '#0e3a5c')
    sea.addColorStop(1, '#03182a')
    ctx.fillStyle = sea
    ctx.fill()

    // ── Foam crest ──
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.7)'
    ctx.lineWidth = 2
    ctx.beginPath()
    for (let x = 0; x <= cw; x += 4) {
      const y = seaSurfaceY(x + g.scrollX, ch, g.scrollX)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // ── Current zones (foam patches on the surface) ──
    for (const c of g.currents) {
      const ox = c.x - g.scrollX
      if (ox + c.width < 0 || ox > cw) continue
      drawCurrent(ctx, ox, c.width, g.scrollX, (x) => seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }

    // ── Shoals (deadly shallow water — dark patch with submerged rocks) ──
    for (const wp of g.shoals) {
      const ox = wp.x - g.scrollX
      if (ox + wp.width < 0 || ox > cw) continue
      drawShoal(ctx, ox, wp.width, g.scrollX, (x) => seaSurfaceY(x + g.scrollX, ch, g.scrollX))
    }

    // ── Surface hazards (rocks bobbing on the wave) ──
    for (const obs of g.hazards) {
      const ox = obs.x - g.scrollX
      if (ox + obs.width < 0 || ox > cw) continue
      const surfaceAtHazard = seaSurfaceY(obs.x + obs.width / 2, ch, g.scrollX)
      drawHazard(ctx, ox, surfaceAtHazard, obs.width, obs.height)
    }

    // ── Beacons (look like rocks, but you must run through them) ──
    for (const cr of g.beacons) {
      const ox = cr.x - g.scrollX
      if (ox + cr.width < 0 || ox > cw) continue
      const surfaceAtCr = seaSurfaceY(cr.x + cr.width / 2, ch, g.scrollX)
      drawBeacon(ctx, ox, surfaceAtCr, cr.width, cr.height, cr.shatteredAt, g.scrollX)
    }

    // ── Detection beam (active while beacon detection flash plays) ──
    if (g.detectingUntil > 0) {
      const remaining = g.detectingUntil - performance.now()
      if (remaining > 0) {
        const totalMs = BEACON_DETECT_FLASH_SEC * 1000
        const t = 1 - remaining / totalMs            // 0 → 1 over flash duration
        const beamX = g.detectingBeaconX - g.scrollX
        const surfaceAtBeam = seaSurfaceY(g.detectingBeaconX, ch, g.scrollX)

        // A few flicker pulses across the duration for "Whoop! Whoop!" detection feel
        const flick = 0.7 + 0.3 * Math.sin(t * Math.PI * 6)
        const beamW = 38 * flick

        ctx.save()
        // Wide soft halo
        const halo = ctx.createLinearGradient(beamX, 0, beamX, surfaceAtBeam)
        halo.addColorStop(0, 'rgba(255, 220, 130, 0)')
        halo.addColorStop(0.4, `rgba(255, 220, 130, ${0.55 * flick})`)
        halo.addColorStop(1, `rgba(255, 200, 90, ${0.85 * flick})`)
        ctx.fillStyle = halo
        ctx.fillRect(beamX - beamW / 2, 0, beamW, surfaceAtBeam + 4)

        // Sharp white core
        ctx.strokeStyle = `rgba(255, 252, 230, ${0.95 * flick})`
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(beamX, 0)
        ctx.lineTo(beamX, surfaceAtBeam + 4)
        ctx.stroke()
        ctx.restore()
      }
    }

    // ── Ship ──
    const img = shipImgRef.current
    if (img && img.complete) {
      const shipX = cw * SHIP_X_RATIO
      let pitch = 0
      if (g.airborne) {
        // Asymmetric: rise tilts up more than fall tilts down (less aggressive nose-dive)
        const raw = g.shipVy * 0.00055
        pitch = Math.max(-0.40, Math.min(0.28, raw))
      } else {
        // Pitch to wave slope at ship center
        const cx = shipX + g.shipW / 2 + g.scrollX
        const dx = 10
        const dy = seaSurfaceY(cx + dx, ch, g.scrollX) - seaSurfaceY(cx - dx, ch, g.scrollX)
        pitch = Math.atan2(dy, dx * 2)
      }
      ctx.save()
      ctx.translate(shipX + g.shipW / 2, g.shipY + g.shipH / 2)
      ctx.rotate(pitch)
      ctx.drawImage(img, -g.shipW / 2, -g.shipH / 2, g.shipW, g.shipH)
      ctx.restore()
    }

    // ── Collision flash ──
    if (g.state === 'dead' && performance.now() < g.deathFlashUntil) {
      ctx.fillStyle = 'rgba(255, 240, 220, 0.6)'
      ctx.fillRect(0, 0, cw, ch)
    }
  }, [])

  // ── Animation loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    const loop = (ts: number) => {
      const last = lastTsRef.current
      const dt = last === 0 ? 0 : Math.min((ts - last) / 1000, 0.05)
      lastTsRef.current = ts
      step(dt)
      render()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [step, render])

  // ── Pause on tab hide ──────────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) lastTsRef.current = 0
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // ── Render UI ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Link href="/expeditions" className="font-karla font-700 text-sm" style={{ color: '#bda05a' }}>
          ← Expeditions
        </Link>
        <p className="font-cinzel font-700 text-base" style={{ color: '#f0ede8' }}>Tide Run</p>
        <div style={{ width: 84 }} />
      </div>

      <div
        ref={wrapperRef}
        onPointerDown={(e) => { e.preventDefault(); onPress() }}
        onPointerUp={onRelease}
        onPointerCancel={onRelease}
        onPointerLeave={onRelease}
        className="relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '9 / 14',
          background: '#062840',
          border: '1px solid rgba(255,255,255,0.10)',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

        {uiState === 'playing' && (
          <>
            <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none">
              <p className="font-cinzel font-700" style={{
                fontSize: '2.2rem',
                color: '#ffffff',
                textShadow: '0 2px 8px rgba(0,0,0,0.55)',
                letterSpacing: '0.02em',
              }}>
                {score}<span style={{ fontSize: '1rem', marginLeft: 4, opacity: 0.75 }}>m</span>
              </p>
            </div>
            {highScore > 0 && (
              <div className="absolute top-3 right-3 pointer-events-none text-right">
                <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{
                  fontSize: '0.55rem',
                  color: 'rgba(255,255,255,0.65)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1,
                }}>
                  Best
                </p>
                <p className="font-cinzel font-700" style={{
                  fontSize: '0.95rem',
                  color: score > highScore ? '#ffd56b' : 'rgba(255,255,255,0.85)',
                  textShadow: '0 1px 4px rgba(0,0,0,0.55)',
                  lineHeight: 1.1,
                  marginTop: 2,
                }}>
                  {Math.max(score, highScore)}<span style={{ fontSize: '0.6rem', marginLeft: 2, opacity: 0.7 }}>m</span>
                </p>
              </div>
            )}
          </>
        )}

        {uiState === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <p className="font-cinzel font-700 mb-2" style={{ fontSize: '1.6rem', color: '#ffffff', textShadow: '0 2px 8px rgba(0,0,0,0.55)' }}>
              Tide Run
            </p>
            <p className="font-karla font-300 mb-5" style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.85)', maxWidth: 260 }}>
              Hold to jump. The longer you hold, the higher you go. Time it for the rock ahead.
            </p>
            <div className="font-karla font-700 uppercase tracking-[0.18em]" style={{
              fontSize: '0.72rem',
              color: '#bda05a',
              padding: '10px 18px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(189,160,90,0.55)',
            }}>
              Tap to start
            </div>
            {highScore > 0 && (
              <p className="font-karla font-700 mt-5" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.75)' }}>
                Best: {highScore}m
              </p>
            )}
          </div>
        )}

        {uiState === 'dead' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
            <div style={{
              padding: '18px 26px',
              borderRadius: 16,
              background: 'rgba(6, 18, 34, 0.86)',
              border: '1px solid rgba(189,160,90,0.5)',
              backdropFilter: 'blur(6px)',
              maxWidth: 320,
            }}>
              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.65rem', color: '#bda05a', marginBottom: 6 }}>
                Wrecked
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#ffffff', lineHeight: 1 }}>
                {score}<span style={{ fontSize: '1rem', marginLeft: 4, opacity: 0.75 }}>m</span>
              </p>
              <p className="font-karla font-300 mt-2" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.7)' }}>
                {score === highScore && score > 0 ? 'New best!' : `Best ${highScore}m`}
              </p>

              {/* ── Commit run for daily reward ── */}
              {commitReward ? (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(189,160,90,0.18)', border: '1px solid rgba(189,160,90,0.55)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: '#bda05a', marginBottom: 4 }}>
                    Run Committed
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#ffd56b' }}>
                    +{commitReward.doubloons} ⟡ &nbsp; +{commitReward.xp} XP
                  </p>
                  <p className="font-karla font-300 mt-1" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>
                    Next commit resets at midnight UTC.
                  </p>
                </div>
              ) : committedToday ? (
                <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)' }}>
                    Already Committed Today
                  </p>
                  <p className="font-karla font-300 mt-1" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.5)' }}>
                    Keep practicing — resets at midnight UTC.
                  </p>
                </div>
              ) : score >= 1 ? (
                <button
                  onPointerDown={(e) => { e.stopPropagation() }}
                  onClick={(e) => { e.stopPropagation(); handleCommit() }}
                  disabled={committing}
                  style={{
                    pointerEvents: 'auto',
                    marginTop: 14,
                    padding: '11px 22px 12px',
                    borderRadius: 12,
                    background: 'linear-gradient(180deg, rgba(189,160,90,0.95), rgba(150,120,55,0.95))',
                    border: '1px solid rgba(220,190,120,0.85)',
                    color: '#1a0f02',
                    boxShadow: '0 4px 12px rgba(189,160,90,0.4)',
                    cursor: committing ? 'wait' : 'pointer',
                    opacity: committing ? 0.7 : 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                  }}
                >
                  <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', letterSpacing: '0.06em' }}>
                    {committing ? 'Saving…' : 'Save Run'}
                  </span>
                  {!committing && (
                    <span className="font-karla font-700" style={{ fontSize: '0.7rem', opacity: 0.82 }}>
                      {score} ⟡ &nbsp; {Math.floor(score / 2)} XP
                    </span>
                  )}
                </button>
              ) : null}

              {commitError && !commitReward && (
                <p className="font-karla font-700 mt-2" style={{ fontSize: '0.66rem', color: '#f08a8a' }}>
                  {commitError}
                </p>
              )}

              <p className="font-karla font-700 uppercase tracking-[0.18em] mt-4" style={{ fontSize: '0.7rem', color: '#bda05a' }}>
                Tap to try again
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Drawing helpers ──────────────────────────────────────────────────────────
// Hazard: jagged rock sticking up out of the water surface.
// `surfaceY` is the water line at the hazard's x; `h` is how far above the water.
function drawHazard(ctx: CanvasRenderingContext2D, x: number, surfaceY: number, w: number, h: number) {
  const top = surfaceY - h
  const g = ctx.createLinearGradient(x, top, x, surfaceY)
  g.addColorStop(0, '#54453a')
  g.addColorStop(0.55, '#33271f')
  g.addColorStop(1, '#1a1410')
  ctx.fillStyle = g
  ctx.beginPath()
  // Anchor below the surface so the rock looks rooted in the water
  ctx.moveTo(x, surfaceY + h * 0.3)
  ctx.lineTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.lineTo(x + w * 0.74, top + h * 0.05)
  ctx.lineTo(x + w * 0.9,  top + h * 0.30)
  ctx.lineTo(x + w,        surfaceY + h * 0.3)
  ctx.closePath()
  ctx.fill()
  // Edge highlight on the lit side
  ctx.strokeStyle = 'rgba(255, 235, 200, 0.25)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.stroke()
  // Tiny foam ring where rock meets water
  ctx.strokeStyle = 'rgba(230, 245, 255, 0.6)'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - w * 0.05, surfaceY)
  ctx.bezierCurveTo(x + w * 0.3, surfaceY - 1.5, x + w * 0.7, surfaceY - 1.5, x + w * 1.05, surfaceY)
  ctx.stroke()
}

// Beacon: a detection device disguised as a rock. The rock body matches
// real rocks (cracks, pebbles, same silhouette) so reflexive jumpers eat
// it. Subtle cues: a thin antenna emerging from the top, a pulsing amber
// signal light, faint rust hue on the cracks. Smash through grounded to
// disable it; jumping triggers detection (handled by the calling render).
function drawBeacon(
  ctx: CanvasRenderingContext2D,
  x: number, surfaceY: number,
  w: number, h: number,
  shatteredAt: number,
  scrollX: number,
) {
  // Smashed: fragments fly outward with gravity + expanding shockwave ring.
  // Makes the "boat smashes a beacon" moment feel like an impact.
  if (shatteredAt > 0) {
    const elapsed = (performance.now() - shatteredAt) / 1000
    if (elapsed > 0.9) return                          // fully faded
    const fadeT = Math.max(0, 1 - elapsed / 0.9)
    const cx = x + w / 2

    ctx.save()

    // Shockwave ring — pops in the first 0.25s
    if (elapsed < 0.28) {
      const ringT = elapsed / 0.28
      const ringR = 8 + ringT * 60
      ctx.globalAlpha = (1 - ringT) * 0.75
      ctx.strokeStyle = '#ffeaa8'
      ctx.lineWidth = 2.4 * (1 - ringT * 0.6)
      ctx.beginPath()
      ctx.ellipse(cx, surfaceY - 4, ringR, ringR * 0.45, 0, 0, Math.PI * 2)
      ctx.stroke()
    }

    // Flying fragments (8 stones) with outward velocity + gravity
    ctx.fillStyle = '#2a2018'
    for (let i = 0; i < 8; i++) {
      const seed = ((i * 211 + Math.floor(x * 11)) % 1000) / 1000
      // Upward-biased outward angle
      const angle = (i / 8) * Math.PI - Math.PI / 2 + (seed - 0.5) * 0.6
      const speed = 110 + seed * 70
      const dx = Math.cos(angle) * speed * elapsed
      const dy = Math.sin(angle) * speed * elapsed + 0.5 * 600 * elapsed * elapsed
      const px = cx + dx
      const py = (surfaceY - 6) + dy
      ctx.globalAlpha = fadeT
      ctx.beginPath()
      ctx.arc(px, py, 2 + seed * 1.4, 0, Math.PI * 2)
      ctx.fill()
    }

    // A small fading amber spark at the original light position — the beacon
    // going dark.
    ctx.globalAlpha = Math.max(0, 1 - elapsed / 0.35) * 0.9
    ctx.fillStyle = '#ffd070'
    ctx.beginPath()
    ctx.arc(cx, surfaceY - h - 12, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.restore()
    return
  }

  const top = surfaceY - h

  // Same rock body geometry as drawHazard
  const grad = ctx.createLinearGradient(x, top, x, surfaceY)
  grad.addColorStop(0, '#54453a')
  grad.addColorStop(0.55, '#33271f')
  grad.addColorStop(1, '#1a1410')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(x, surfaceY + h * 0.3)
  ctx.lineTo(x + w * 0.18, top + h * 0.22)
  ctx.lineTo(x + w * 0.35, top)
  ctx.lineTo(x + w * 0.55, top + h * 0.12)
  ctx.lineTo(x + w * 0.74, top + h * 0.05)
  ctx.lineTo(x + w * 0.9,  top + h * 0.30)
  ctx.lineTo(x + w,        surfaceY + h * 0.3)
  ctx.closePath()
  ctx.fill()

  // Cracks / weathered seams — subtle "this isn't natural rock" cue.
  // Tinted slightly warm (rust-like) for the beacon-disguised-as-rock feel.
  ctx.strokeStyle = 'rgba(210, 165, 110, 0.50)'
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(x + w * 0.20, top + h * 0.30)
  ctx.lineTo(x + w * 0.45, top + h * 0.55)
  ctx.lineTo(x + w * 0.60, top + h * 0.40)
  ctx.moveTo(x + w * 0.55, top + h * 0.15)
  ctx.lineTo(x + w * 0.78, top + h * 0.50)
  ctx.moveTo(x + w * 0.30, top + h * 0.65)
  ctx.lineTo(x + w * 0.70, top + h * 0.85)
  ctx.stroke()

  // A few loose pebbles at the base (already crumbling)
  ctx.fillStyle = '#2a2018'
  for (let i = 0; i < 4; i++) {
    const seed = ((i * 137 + Math.floor(x * 13)) % 1000) / 1000
    const px = x + w * (0.08 + 0.22 * i) + (seed - 0.5) * 3
    const py = surfaceY + 2 + (i % 2)
    ctx.beginPath()
    ctx.arc(px, py, 1.4 + seed * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }

  // Thin dark antenna emerging from the top of the rock — the structural
  // cue that this isn't just a rock. Subtle but visible on close look.
  const cx = x + w / 2
  const glintY = top - 16
  ctx.strokeStyle = '#1a1410'
  ctx.lineWidth = 1.2
  ctx.beginPath()
  ctx.moveTo(cx, top - 1)
  ctx.lineTo(cx, glintY + 2)
  ctx.stroke()

  // Pulsing amber signal light at the antenna tip — the "live" cue
  const pulse = 0.5 + 0.5 * Math.sin(scrollX * 0.05 + cx * 0.03)
  const glintAlpha = 0.50 + pulse * 0.45
  ctx.save()
  ctx.globalAlpha = glintAlpha
  ctx.fillStyle = '#ffb84d'
  // 4-point star
  ctx.beginPath()
  ctx.moveTo(cx,     glintY - 4)
  ctx.lineTo(cx + 1, glintY - 1)
  ctx.lineTo(cx + 4, glintY)
  ctx.lineTo(cx + 1, glintY + 1)
  ctx.lineTo(cx,     glintY + 4)
  ctx.lineTo(cx - 1, glintY + 1)
  ctx.lineTo(cx - 4, glintY)
  ctx.lineTo(cx - 1, glintY - 1)
  ctx.closePath()
  ctx.fill()
  // Soft outer glow
  ctx.globalAlpha = glintAlpha * 0.35
  ctx.beginPath()
  ctx.arc(cx, glintY, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// Current: a flat patch of foamy/churning water on the surface. Boat slows
// down while grounded inside it; jump over to skip.
function drawCurrent(
  ctx: CanvasRenderingContext2D,
  x: number, width: number,
  scrollX: number,
  surfaceAt: (screenX: number) => number,
) {
  // Lighter water tint to read as a distinct zone
  ctx.save()
  ctx.fillStyle = 'rgba(180, 220, 240, 0.20)'
  ctx.beginPath()
  for (let dx = 0; dx <= width; dx += 4) {
    const sx = x + dx
    const sy = surfaceAt(sx)
    if (dx === 0) ctx.moveTo(sx, sy)
    else ctx.lineTo(sx, sy)
  }
  for (let dx = width; dx >= 0; dx -= 4) {
    const sx = x + dx
    ctx.lineTo(sx, surfaceAt(sx) + 9)
  }
  ctx.closePath()
  ctx.fill()

  // Animated foam streaks (use scrollX as phase so foam appears to swirl)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'
  ctx.lineWidth = 1.4
  const streakCount = Math.max(3, Math.floor(width / 26))
  for (let i = 0; i < streakCount; i++) {
    const baseX = x + (i + 0.5) * (width / streakCount)
    const phase = (scrollX * 0.6 + i * 80) * 0.025
    const yOff = Math.sin(phase) * 2.5
    const sy = surfaceAt(baseX)
    ctx.beginPath()
    ctx.moveTo(baseX - 6, sy + yOff + 1)
    ctx.quadraticCurveTo(baseX, sy + yOff - 2, baseX + 6, sy + yOff + 1)
    ctx.stroke()
  }

  // Edge chevrons signalling the slow-zone direction
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
  ctx.lineWidth = 1.2
  const drawChevron = (cx: number) => {
    const sy = surfaceAt(cx) - 4
    ctx.beginPath()
    ctx.moveTo(cx - 4, sy)
    ctx.lineTo(cx, sy + 4)
    ctx.lineTo(cx + 4, sy)
    ctx.stroke()
  }
  drawChevron(x + 8)
  drawChevron(x + width - 8)
  ctx.restore()
}

// Distant islands silhouetted at the horizon, parallax-scrolled slow.
function drawDistantIslands(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number) {
  ctx.fillStyle = 'rgba(70, 100, 140, 0.32)'
  const period = cw * 1.4
  const offset = ((scrollOffset % period) + period) % period
  const horizon = ch * 0.66
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    // Two soft hills per period
    ctx.beginPath()
    ctx.moveTo(ix, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.15, horizon - 18, ix + period * 0.35, horizon - 22, ix + period * 0.5, horizon + 4)
    ctx.lineTo(ix + period * 0.5, horizon + 4)
    ctx.bezierCurveTo(ix + period * 0.6, horizon - 10, ix + period * 0.85, horizon - 14, ix + period, horizon + 4)
    ctx.closePath()
    ctx.fill()
  }
}

// Wispy clouds drifting at mid speed.
function drawClouds(ctx: CanvasRenderingContext2D, cw: number, ch: number, scrollOffset: number) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.42)'
  const period = cw * 1.1
  const offset = ((scrollOffset % period) + period) % period
  const cloudYs = [ch * 0.10, ch * 0.18, ch * 0.28]
  const cloudXs = [0.15, 0.45, 0.78]
  for (let i = -1; i <= 2; i++) {
    const ix = i * period - offset
    for (let j = 0; j < cloudXs.length; j++) {
      const cx = ix + cloudXs[j] * period
      const cy = cloudYs[j]
      const r = (j === 1 ? 14 : 11)
      ctx.beginPath()
      ctx.ellipse(cx,       cy,       r * 1.6, r * 0.55, 0, 0, Math.PI * 2)
      ctx.ellipse(cx - r,   cy + 2,   r * 1.1, r * 0.45, 0, 0, Math.PI * 2)
      ctx.ellipse(cx + r,   cy + 2,   r * 1.0, r * 0.42, 0, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// Shoal: deadly shallow water — a dark patch with submerged rocklets just
// breaking the surface. Static (no animation). Reads as "hull-tearing
// shallows". Visually distinct from currents (pale foam) and rocks (jagged
// shapes above water).
function drawShoal(
  ctx: CanvasRenderingContext2D,
  x: number, width: number,
  _scrollX: number,
  surfaceAt: (screenX: number) => number,
) {
  ctx.save()

  // Dark water patch following the wave curve
  ctx.fillStyle = 'rgba(2, 8, 18, 0.55)'
  ctx.beginPath()
  for (let dx = 0; dx <= width; dx += 4) {
    const sx = x + dx
    const sy = surfaceAt(sx)
    if (dx === 0) ctx.moveTo(sx, sy - 1)
    else ctx.lineTo(sx, sy - 1)
  }
  for (let dx = width; dx >= 0; dx -= 4) {
    const sx = x + dx
    ctx.lineTo(sx, surfaceAt(sx) + 16)
  }
  ctx.closePath()
  ctx.fill()

  // Submerged rocklets — deterministic positions (no jitter frame-to-frame)
  const rocklets = Math.max(3, Math.floor(width / 34))
  for (let i = 0; i < rocklets; i++) {
    // Deterministic pseudo-random from index + width (stable per shoal)
    const seed = ((i * 311 + Math.floor(width * 7)) % 1000) / 1000
    const t = (i + 0.5) / rocklets
    const rx = x + width * (0.08 + t * 0.84) + (seed - 0.5) * 4
    const sy = surfaceAt(rx)
    const w = 5 + seed * 3
    const h = 3 + seed * 1.5

    // Foam ripple around the rocklet (drawn first, behind stone)
    ctx.strokeStyle = 'rgba(220, 240, 255, 0.55)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.ellipse(rx, sy + 0.5, w * 1.45, h * 1.1, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Stone body — sits with top just at/below the surface
    ctx.fillStyle = '#2a2018'
    ctx.beginPath()
    ctx.ellipse(rx, sy + 1, w, h, 0, 0, Math.PI * 2)
    ctx.fill()

    // Tiny highlight on the lit side of the stone
    ctx.fillStyle = 'rgba(120, 90, 70, 0.55)'
    ctx.beginPath()
    ctx.ellipse(rx - 1.2, sy - 0.5, w * 0.45, h * 0.4, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.restore()
}
