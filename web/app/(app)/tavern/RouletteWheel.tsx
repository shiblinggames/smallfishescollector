'use client'

// Fish Roulette wheel — full European single-zero layout, 37 pockets
// arranged in the canonical wheel order (0, 32, 15, 19, 4, 21, ...).
// Spin animation has two phases:
//
//   1. Wind-up — the moment the player taps Spin, the wheel does a few
//      fast linear turns while the server's RNG resolves. Looks like
//      the croupier's throw. Cheap, hides server latency.
//   2. Deceleration — once the server returns the winning number, the
//      wheel decelerates with an ease-out-quint curve over DECEL_MS and
//      lands with the winning pocket pinned under the top pointer.
//      The ball, which rode the rim groove during wind-up, slows on a
//      gentler curve, falls inward off the track, bounces off the
//      pocket ring, and settles into the winning pocket as the wheel
//      bottoms out.
//
// Math notes:
// - Each pocket spans 360/37 ≈ 9.73°. Pocket i (in wheel order) is
//   centered at -90° + i*9.73° (–90° because 0° in SVG = 3 o'clock and
//   we want pocket 0 at 12 o'clock).
// - Rotation R is applied to the whole wheel group; positive R rotates
//   clockwise. To land a pocket under the pointer at top (-90°), we
//   need rotation = -wIdx * 9.73° (plus any whole-turn multiples).
//
// The wheel is purely cosmetic — the WINNING number comes from the
// server. This component never decides outcomes, only animates them.

import { useEffect, useRef, useState, useMemo } from 'react'
import { motion, type Transition } from 'framer-motion'
import { colorOf, POCKETS } from '@/lib/roulette'

// Canonical European single-zero pocket order, clockwise starting from
// 0 at the top of the wheel.
const EUROPEAN_WHEEL_ORDER: readonly number[] = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23,
  10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
]
const POCKET_COUNT = EUROPEAN_WHEEL_ORDER.length            // 37
const POCKET_ANGLE = 360 / POCKET_COUNT                     // 9.7297…

// SVG geometry — viewBox is -100..100 on each axis so the wheel fits
// in a 200-unit square centered on the origin.
const RIM_OUTER     = 100
const POCKET_OUTER  = 92
const POCKET_INNER  = 38
const HUB_OUTER     = 34
const HUB_INNER     = 14
const LABEL_RADIUS  = 65    // where pocket numbers sit
const POINTER_TIP_Y = -94   // where the indicator tip points

const RED_POCKET   = '#c2402e'
const BLACK_POCKET = '#1a1a1a'
const GREEN_POCKET = '#0a7a3a'
const RIM_OUTER_COLOR = '#3a200a'
const RIM_INNER_COLOR = '#1a0a04'
const HUB_COLOR    = '#2a1a08'
const HUB_HIGHLIGHT = '#5a3a18'

function angleToXY(deg: number, r: number): [number, number] {
  const rad = deg * Math.PI / 180
  return [r * Math.cos(rad), r * Math.sin(rad)]
}

/** Build a donut-arc path for one pocket. Goes inner → outer → arc →
 *  inner → arc back. Each pocket is small enough that large-arc-flag
 *  stays 0. */
function pocketPath(i: number): string {
  const center = -90 + i * POCKET_ANGLE
  const a1 = center - POCKET_ANGLE / 2
  const a2 = center + POCKET_ANGLE / 2
  const [x1o, y1o] = angleToXY(a1, POCKET_OUTER)
  const [x2o, y2o] = angleToXY(a2, POCKET_OUTER)
  const [x1i, y1i] = angleToXY(a1, POCKET_INNER)
  const [x2i, y2i] = angleToXY(a2, POCKET_INNER)
  return `M ${x1i},${y1i} L ${x1o},${y1o} A ${POCKET_OUTER},${POCKET_OUTER} 0 0,1 ${x2o},${y2o} L ${x2i},${y2i} A ${POCKET_INNER},${POCKET_INNER} 0 0,0 ${x1i},${y1i} Z`
}

function pocketColor(n: number): string {
  if (n === 0) return GREEN_POCKET
  return colorOf(n) === 'red' ? RED_POCKET : BLACK_POCKET
}

export type WheelPhase = 'idle' | 'spinning' | 'landed'

// Deceleration length, shared with RouletteClient so the reveal panel
// waits exactly as long as the animation runs. 5.2s gives the ball a
// long visible die-down on the rim before it drops — the suspense
// stretch of a real wheel — instead of the original 3.2s which read
// as "spin, plop, done".
export const DECEL_MS = 5200

// Ball track + pocket radii. During the spin the ball rides the wooden
// rim groove (BALL_TRACK_R), then falls inward and settles in the
// pocket ring (BALL_REST_R) with a couple of radial bounces — the
// classic "ball rattles into the pocket" moment.
const BALL_TRACK_R = 96
const BALL_REST_R  = 78

// Ball tuning. The ball rides the rim for BALL_DROP_T of the decel, then
// releases and settles. DECEL_EASE_P is the angular ease-out exponent (lower
// = gentler, longer glide). ENTRY_V is the target hand-off orbit speed, kept
// just under the wind-up's 770°/s so the ball never SPEEDS UP at the hand-off
// (the old code jumped 770→830, which read as a hitch). RATTLE_C/RATTLE_W are
// the damping + frequency of the drop's damped oscillation.
const BALL_DROP_T   = 0.62
const DECEL_EASE_P  = 2.6
const ENTRY_V       = 730
const RATTLE_C      = 4.2
const RATTLE_W      = 8.6

/** Ball radius over normalized decel time t (0..1). Rides the track, then
 *  releases as a DAMPED OSCILLATOR that settles from the rim to the pocket
 *  ring: it leaves the track with zero radial velocity (smooth release, not a
 *  snap), overshoots inward a couple of times — the rattle — and eases to rest
 *  at BALL_REST_R. g(0)=1, g'(0)=0 by construction, so the drop onset is
 *  velocity-continuous with the constant-radius ride. */
function ballRadiusAt(t: number): number {
  if (t < BALL_DROP_T) return BALL_TRACK_R
  const u = (t - BALL_DROP_T) / (1 - BALL_DROP_T)
  const g = Math.exp(-RATTLE_C * u) * (Math.cos(RATTLE_W * u) + (RATTLE_C / RATTLE_W) * Math.sin(RATTLE_W * u))
  return BALL_REST_R + (BALL_TRACK_R - BALL_REST_R) * g
}

/** A small angular rattle that rides along with the radial bounces (the ball
 *  clipping frets as it drops), decaying to zero so the landing angle stays
 *  exact. Same decay/frequency as the radial oscillator so they read as one
 *  event, not two. */
function ballAngleWobble(t: number, amp: number): number {
  if (t < BALL_DROP_T) return 0
  const u = (t - BALL_DROP_T) / (1 - BALL_DROP_T)
  return amp * Math.exp(-RATTLE_C * u) * Math.sin(RATTLE_W * u)
}

// Number of ghost dots in the motion trail behind the ball.
const TRAIL_LEN = 4

export default function RouletteWheel({ phase, winner, size = 340 }: {
  /** 'idle' = at rest, 'spinning' = wind-up + decel motion, 'landed' =
   *  highlighting the winning pocket. */
  phase: WheelPhase
  /** Winning number, set by the parent once the server returns. Null
   *  during wind-up; once set, the wheel decelerates to land here. */
  winner: number | null
  /** Max rendered width — the wheel fills its container up to this cap
   *  (responsive: on narrow phones it shrinks to the viewport). */
  size?: number
}) {
  // Cumulative rotation — never resets. New spins add deltas so the
  // wheel keeps spinning from wherever it left off (no snap-back).
  const [rotation, setRotation] = useState(0)
  const [transition, setTransition] = useState<Transition>(
    { duration: 0, ease: 'linear' }
  )
  // Ball is driven imperatively — cx/cy set via setAttribute in a
  // single RAF loop, zero framer involvement. (Two framer attempts at
  // the ball's radial motion silently no-opped on SVG, leaving the
  // ball pinned at the wheel center; setAttribute is unambiguous and
  // matches the needle/aim-bar pattern used elsewhere in the game.)
  // Angle 0 = top (under the pointer), decreasing = counter-clockwise,
  // so the ball counter-spins against the wheel and always settles at
  // the top where the winning pocket lands.
  const ballRef = useRef<SVGCircleElement>(null)
  const ballHlRef = useRef<SVGCircleElement>(null)
  const shadowRef = useRef<SVGCircleElement>(null)
  const trailRefs = useRef<(SVGCircleElement | null)[]>([])
  const ballAnim = useRef({
    mode: 'rest' as 'rest' | 'windup' | 'decel',
    raf: 0,
    last: 0,
    angle: 0,            // degrees; 0 = top
    radius: BALL_REST_R,
    t0: 0,               // mode start timestamp
    angle0: 0,           // angle at decel start
    angleEnd: 0,         // decel target (≡ 0 mod 360)
    radius0: BALL_REST_R,
    wob: 0,              // angular rattle amplitude (deg, set per spin)
    hist: [] as [number, number][],   // recent painted positions (trail)
  })

  /** Paint the ball + its juice layers (shadow, trail) for one frame.
   *  speed = |deg/s| of the orbit — drives trail opacity so the comet
   *  fades out naturally as the ball slows. */
  function paintBall(angle: number, radius: number, speed = 0) {
    const a = ballAnim.current
    const rad = angle * Math.PI / 180
    const x = radius * Math.sin(rad)
    const y = -radius * Math.cos(rad)
    ballRef.current?.setAttribute('cx', String(x))
    ballRef.current?.setAttribute('cy', String(y))
    ballHlRef.current?.setAttribute('cx', String(x - 0.9))
    ballHlRef.current?.setAttribute('cy', String(y - 1))

    // Shadow — separates from the ball while it rides the high outer
    // track, merges back under it as it drops to pocket level. Cheap
    // height illusion: offset + size + softness all scale with h.
    const h = Math.min(1, Math.max(0, (radius - BALL_REST_R) / (BALL_TRACK_R - BALL_REST_R)))
    const sh = shadowRef.current
    if (sh) {
      sh.setAttribute('cx', String(x))
      sh.setAttribute('cy', String(y + 0.8 + 2.4 * h))
      sh.setAttribute('r', String(3.0 + 1.4 * h))
      sh.setAttribute('opacity', String(0.32 - 0.16 * h))
    }

    // Trail — ghost dots at the last few painted positions, so the
    // comet bends with the orbit. Invisible below ~120°/s; at full
    // wind-up speed (~770°/s) it reads as a proper motion blur.
    a.hist.push([x, y])
    if (a.hist.length > TRAIL_LEN + 1) a.hist.shift()
    const base = Math.min(1, Math.max(0, (speed - 120) / 650)) * 0.5
    for (let i = 0; i < TRAIL_LEN; i++) {
      const el = trailRefs.current[i]
      if (!el) continue
      const p = a.hist[a.hist.length - 2 - i]
      if (!p || base <= 0) { el.setAttribute('opacity', '0'); continue }
      el.setAttribute('cx', String(p[0]))
      el.setAttribute('cy', String(p[1]))
      el.setAttribute('r', String(2.8 - i * 0.45))
      el.setAttribute('opacity', String(base * (1 - i / TRAIL_LEN)))
    }
  }

  useEffect(() => {
    if (phase === 'spinning' && winner === null) {
      // Wind-up — wheel does fast linear CW turns while the server
      // resolves. (Wheel rotation stays on framer: group rotation has
      // always rendered fine.)
      setRotation(r => r + 1080)                  // 3 turns clockwise
      setTransition({ duration: 1.4, ease: 'linear' })
    } else if (phase === 'spinning' && winner !== null) {
      // Decelerate to the winning pocket. Snap the wheel's base to a
      // clean multiple of 360 ahead of the current visual position so
      // we get at least 5 more full turns regardless of where the
      // wind-up was. (5 turns over the longer DECEL_MS keeps the
      // handoff speed close to the wind-up so there's no visible
      // hitch when the ease takes over.)
      const wIdx = EUROPEAN_WHEEL_ORDER.indexOf(winner)
      const winnerAngle = -wIdx * POCKET_ANGLE
      setRotation(r => {
        const base = Math.ceil(r / 360) * 360 + 360 * 5
        return base + winnerAngle
      })
      setTransition({ duration: DECEL_MS / 1000, ease: [0.16, 1, 0.3, 1] })   // ease-out-quint
    }
    // 'landed' / 'idle' just leave the wheel where it is — no snap-back.
  }, [phase, winner])

  // Ball RAF loop. Started on wind-up; the same loop carries through
  // the decel handoff (mode is read fresh every frame) and stops when
  // the ball comes to rest in the winning pocket.
  useEffect(() => {
    const a = ballAnim.current
    if (phase === 'spinning' && winner === null) {
      a.mode = 'windup'
      a.t0 = performance.now()
      a.last = a.t0
      a.radius0 = a.radius
      cancelAnimationFrame(a.raf)
      const loop = (now: number) => {
        const dt = Math.min(64, now - a.last) / 1000
        a.last = now
        if (a.mode === 'windup') {
          // Constant CCW orbit; fling outward onto the rim track over
          // the first 250ms.
          a.angle -= 770 * dt
          const t = Math.min(1, (now - a.t0) / 250)
          a.radius = a.radius0 + (BALL_TRACK_R - a.radius0) * (1 - (1 - t) * (1 - t))
          paintBall(a.angle, a.radius, 770)
        } else if (a.mode === 'decel') {
          // Orbit eases out with exponent DECEL_EASE_P (gentler than the
          // wheel's quint, so the ball is visibly still creeping when it
          // leaves the track), starting at ~the wind-up speed so there's no
          // hitch. Radius follows the damped-oscillator drop, and a small
          // decaying angular wobble rides the same rattle — all relaxing to
          // zero so the landing angle stays exact.
          const prevAngle = a.angle
          const t = Math.min(1, (now - a.t0) / DECEL_MS)
          a.angle = a.angle0 + (a.angleEnd - a.angle0) * (1 - (1 - t) ** DECEL_EASE_P)
            + ballAngleWobble(t, a.wob)
          a.radius = ballRadiusAt(t)
          const speed = dt > 0 ? Math.abs(a.angle - prevAngle) / dt : 0
          paintBall(a.angle, a.radius, speed)
          if (t >= 1) {
            a.mode = 'rest'
            a.angle = 0
            a.radius = BALL_REST_R
            a.hist = []
            paintBall(0, BALL_REST_R, 0)
            return
          }
        } else {
          return
        }
        a.raf = requestAnimationFrame(loop)
      }
      a.raf = requestAnimationFrame(loop)
    } else if (phase === 'spinning' && winner !== null && a.mode === 'windup') {
      // Hand off to decel. Travel is derived from the target ENTRY_V so the
      // ease starts at ~the wind-up speed (no speed-up hitch) regardless of
      // where the wind-up happened to end; the target is then snapped to a
      // TOP position (angle ≡ 0 mod 360) so the winning pocket meets the
      // pointer. The ball then glides down and rattles into the pocket.
      a.mode = 'decel'
      a.t0 = performance.now()
      a.angle0 = a.angle
      a.radius0 = a.radius
      const idealTravel = ENTRY_V * (DECEL_MS / 1000) / DECEL_EASE_P
      a.angleEnd = Math.round((a.angle - idealTravel) / 360) * 360
      // Per-spin rattle amplitude (deg), varied off the winner so consecutive
      // spins don't replay an identical bounce.
      a.wob = 2.0 + (winner % 5) * 0.6
    }
  }, [phase, winner])

  // Stop the loop if the component unmounts mid-spin.
  useEffect(() => {
    const a = ballAnim.current
    return () => cancelAnimationFrame(a.raf)
  }, [])

  // Pre-compute pocket paths + label positions once.
  const pockets = useMemo(() => {
    return EUROPEAN_WHEEL_ORDER.map((num, i) => {
      const center = -90 + i * POCKET_ANGLE
      const [lx, ly] = angleToXY(center, LABEL_RADIUS)
      return {
        num,
        path: pocketPath(i),
        color: pocketColor(num),
        labelX: lx,
        labelY: ly,
        labelRotation: center + 90,    // bottom-of-text faces center
      }
    })
  }, [])

  const winnerPocket = winner != null ? POCKETS[winner] : null
  const fishFile = winnerPocket?.fishId
    ? '/fish/' + winnerPocket.name.toLowerCase().replace(/\s+/g, '-') + '.png'
    : null

  return (
    <div style={{
      position: 'relative',
      width: '100%', maxWidth: size,
      aspectRatio: '1',
      margin: '0 auto',
    }}>
      <svg
        viewBox="-100 -100 200 200"
        width="100%"
        height="100%"
        style={{ display: 'block', filter: 'drop-shadow(0 8px 18px rgba(0,0,0,0.55))' }}
      >
        {/* Outer rim — dark wood, with a milled groove the ball rides
            during the spin. */}
        <circle cx="0" cy="0" r={RIM_OUTER} fill={RIM_OUTER_COLOR} stroke="#0a0402" strokeWidth="0.6" />
        <circle cx="0" cy="0" r={BALL_TRACK_R} fill="none" stroke="#241204" strokeWidth="4.5" opacity="0.6" />
        <circle cx="0" cy="0" r={POCKET_OUTER + 1.5} fill={RIM_INNER_COLOR} />

        {/* Rotating group — all pockets + numbers + inner hub plate.
            Hub face stays in this group so the brass inlay rotates with
            the wheel (looks like a single milled piece). The CENTER hub
            ornament sits outside (in the static group) and reads as a
            fixed spindle. */}
        <motion.g
          animate={{ rotate: rotation }}
          transition={transition}
          style={{ transformOrigin: '0px 0px' }}
        >
          {pockets.map((p, i) => {
            const isWinner = phase === 'landed' && winner === p.num
            return (
              <g key={i}>
                <path
                  d={p.path}
                  fill={p.color}
                  stroke={isWinner ? '#f0c040' : '#0a0402'}
                  strokeWidth={isWinner ? 1.2 : 0.4}
                />
                <text
                  x={p.labelX}
                  y={p.labelY}
                  transform={`rotate(${p.labelRotation}, ${p.labelX}, ${p.labelY})`}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#fff"
                  fontSize="6.6"
                  fontWeight="700"
                  fontFamily="Cinzel, serif"
                  style={{ pointerEvents: 'none', textShadow: '0 1px 1px rgba(0,0,0,0.6)' }}
                >
                  {p.num}
                </text>
              </g>
            )
          })}
          {/* Brass-tone inner band that rotates with the pockets */}
          <circle cx="0" cy="0" r={HUB_OUTER + 0.5} fill="#1a0e04" />
          <circle cx="0" cy="0" r={HUB_OUTER} fill="none" stroke={HUB_HIGHLIGHT} strokeWidth="0.5" opacity="0.6" />
        </motion.g>

        {/* Static center spindle */}
        <circle cx="0" cy="0" r={HUB_OUTER - 4} fill={HUB_COLOR} stroke="#0a0402" strokeWidth="0.5" />
        <circle cx="0" cy="0" r={HUB_INNER + 2} fill={HUB_HIGHLIGHT} opacity="0.8" />
        <circle cx="0" cy="0" r={HUB_INNER} fill="#1a0a04" />
        <circle cx="-3" cy="-3" r="1.4" fill="#5a3a18" opacity="0.7" />

        {/* Orbiting ball — positioned imperatively (cx/cy written by
            the RAF loop above). Rides the rim groove during wind-up,
            falls inward and bounces into the winning pocket during
            decel, rests in the pocket under the pointer otherwise.
            Initial attrs = the rest position so SSR/first paint shows
            the ball before any JS runs. */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Cast shadow — drawn first so the ball sits on top. Offset
              + size are repainted per frame: separated while the ball
              flies the high track, tucked under it at pocket level. */}
          <circle
            ref={shadowRef}
            cx="0"
            cy={-BALL_REST_R + 0.8}
            r="3"
            fill="#000"
            opacity="0.32"
          />
          {/* Motion trail — ghost dots at recent ball positions,
              opacity driven by orbit speed (invisible at rest). */}
          {Array.from({ length: TRAIL_LEN }, (_, i) => (
            <circle
              key={i}
              ref={el => { trailRefs.current[i] = el }}
              cx="0"
              cy="0"
              r="2.8"
              fill="#fff"
              opacity="0"
            />
          ))}
          {/* No CSS drop-shadow here: the cast-shadow circle above does
              the job, and filters on per-frame-updated elements are a
              mobile perf trap. */}
          <circle
            ref={ballRef}
            cx="0"
            cy={-BALL_REST_R}
            r="3.4"
            fill="#fff"
            stroke="#1a0a04"
            strokeWidth="0.6"
          />
          {/* Specular highlight on the ball */}
          <circle
            ref={ballHlRef}
            cx="-0.9"
            cy={-BALL_REST_R - 1}
            r="0.9"
            fill="rgba(255,255,255,0.85)"
          />
        </g>

        {/* Static pointer at top — gold arrow pointing into the wheel.
            Sits ABOVE the ball's rest position so when the ball comes
            home it tucks just under the pointer tip. */}
        <g style={{ pointerEvents: 'none' }}>
          {/* Mounting base */}
          <rect x="-7" y={POINTER_TIP_Y - 8} width="14" height="6" rx="1.5" fill="#1a0a04" />
          <polygon
            points={`-6,${POINTER_TIP_Y - 2} 6,${POINTER_TIP_Y - 2} 0,${POINTER_TIP_Y + 8}`}
            fill="#f0c040"
            stroke="#1a0a04"
            strokeWidth="0.8"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))' }}
          />
        </g>
      </svg>

      {/* Winning pocket flash — sits over the wheel center on 'landed'.
          Shows the fish name + a glowing ring around the wheel rim. */}
      {phase === 'landed' && winnerPocket && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
          <div style={{
            background: 'rgba(8,4,2,0.92)',
            border: `1px solid ${pocketColor(winnerPocket.number)}aa`,
            borderRadius: 8,
            padding: '0.32rem 0.65rem 0.3rem',
            display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: '0 4px 14px rgba(0,0,0,0.7)',
            marginBottom: -8,
          }}>
            {fishFile && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fishFile} alt="" style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0 }} />
            )}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.48rem', letterSpacing: '0.16em', color: pocketColor(winnerPocket.number) === GREEN_POCKET ? '#7ad3a0' : pocketColor(winnerPocket.number) === RED_POCKET ? '#e07c7c' : '#c8c8c8' }}>
                {winnerPocket.number}
              </span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0e8d0', lineHeight: 1 }}>
                {winnerPocket.name}
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}
