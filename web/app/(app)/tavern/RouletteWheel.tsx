'use client'

// Fish Roulette wheel — full European single-zero layout, 37 pockets
// arranged in the canonical wheel order (0, 32, 15, 19, 4, 21, ...).
// Spin animation has two phases:
//
//   1. Wind-up — the moment the player taps Spin, the wheel does a few
//      fast linear turns while the server's RNG resolves. Looks like
//      the croupier's throw. Cheap, hides server latency.
//   2. Deceleration — once the server returns the winning number, the
//      wheel decelerates with an ease-out-quint curve over ~3.2s and
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

// Ball track + pocket radii. During the spin the ball rides the wooden
// rim groove (BALL_TRACK_R), then falls inward and settles in the
// pocket ring (BALL_REST_R) with a couple of radial bounces — the
// classic "ball rattles into the pocket" moment.
const BALL_TRACK_R = 96
const BALL_REST_R  = 78

/** Ball radius over normalized decel time t (0..1): ride the track for
 *  60%, fall into the pocket ring, one kick back off the pocket wall,
 *  settle. Piecewise quad ease per segment. */
function ballRadiusAt(t: number): number {
  const seg = (t0: number, t1: number, r0: number, r1: number, ease: (x: number) => number) => {
    const x = (t - t0) / (t1 - t0)
    return r0 + (r1 - r0) * ease(x)
  }
  if (t < 0.6)  return BALL_TRACK_R
  if (t < 0.72) return seg(0.6, 0.72, BALL_TRACK_R, 72, x => x * x)
  if (t < 0.82) return seg(0.72, 0.82, 72, 86, x => 1 - (1 - x) * (1 - x))
  if (t < 0.92) return seg(0.82, 0.92, 86, 76, x => x * x)
  return seg(0.92, 1, 76, BALL_REST_R, x => 1 - (1 - x) * (1 - x))
}

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
  })

  function paintBall(angle: number, radius: number) {
    const rad = angle * Math.PI / 180
    const x = radius * Math.sin(rad)
    const y = -radius * Math.cos(rad)
    ballRef.current?.setAttribute('cx', String(x))
    ballRef.current?.setAttribute('cy', String(y))
    ballHlRef.current?.setAttribute('cx', String(x - 0.9))
    ballHlRef.current?.setAttribute('cy', String(y - 1))
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
      // we get at least 4 more full turns regardless of where the
      // wind-up was.
      const wIdx = EUROPEAN_WHEEL_ORDER.indexOf(winner)
      const winnerAngle = -wIdx * POCKET_ANGLE
      setRotation(r => {
        const base = Math.ceil(r / 360) * 360 + 360 * 4
        return base + winnerAngle
      })
      setTransition({ duration: 3.2, ease: [0.16, 1, 0.3, 1] })   // ease-out-quint
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
          paintBall(a.angle, a.radius)
        } else if (a.mode === 'decel') {
          // Ease-out-cubic on the orbit (gentler than the wheel's
          // quint, so the ball is visibly still creeping when it
          // leaves the track) + piecewise radial drop-bounce-settle.
          const t = Math.min(1, (now - a.t0) / 3200)
          a.angle = a.angle0 + (a.angleEnd - a.angle0) * (1 - (1 - t) ** 3)
          a.radius = ballRadiusAt(t)
          paintBall(a.angle, a.radius)
          if (t >= 1) {
            a.mode = 'rest'
            a.angle = 0
            a.radius = BALL_REST_R
            paintBall(0, BALL_REST_R)
            return
          }
        } else {
          return
        }
        a.raf = requestAnimationFrame(loop)
      }
      a.raf = requestAnimationFrame(loop)
    } else if (phase === 'spinning' && winner !== null && a.mode === 'windup') {
      // Hand off to decel: finish at angle ≡ 0 (top) after at least 3
      // more CCW turns, timed to bottom out with the wheel at 3.2s.
      a.mode = 'decel'
      a.t0 = performance.now()
      a.angle0 = a.angle
      const norm = ((a.angle % 360) + 360) % 360
      a.angleEnd = a.angle - norm - 1080
      a.radius0 = a.radius
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
          <circle
            ref={ballRef}
            cx="0"
            cy={-BALL_REST_R}
            r="3.4"
            fill="#fff"
            stroke="#1a0a04"
            strokeWidth="0.6"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))' }}
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
