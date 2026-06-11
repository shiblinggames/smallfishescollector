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

import { useEffect, useState, useMemo } from 'react'
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
  // Ball orbital angle. Lives independent of the wheel so it can spin
  // the opposite direction (CCW while wheel spins CW), then decelerate
  // to land at the pointer (0°) — visually reading as the ball settling
  // into the winning pocket. Same wind-up / decel timing as the wheel
  // so they finish together.
  const [ballRotation, setBallRotation] = useState(0)
  const [ballTransition, setBallTransition] = useState<Transition>(
    { duration: 0, ease: 'linear' }
  )
  // Ball radial position — animated as the circle's cy ATTRIBUTE
  // (negative = up = toward the rim), not a nested group transform:
  // framer-motion's `y` on an SVG <g> is unreliable (can be treated as
  // the nonexistent y attribute and silently no-op, leaving the ball
  // pinned at the wheel center). Rest in a pocket at idle; flung out to
  // the rim track on wind-up; drop-bounce-settle keyframes during decel.
  const [ballY, setBallY] = useState<number | number[]>(-BALL_REST_R)
  const [ballYTransition, setBallYTransition] = useState<Transition>(
    { duration: 0 }
  )
  // Specular highlight tracks the ball 1 unit above its center.
  const highlightY = Array.isArray(ballY) ? ballY.map(v => v - 1) : ballY - 1

  useEffect(() => {
    if (phase === 'spinning' && winner === null) {
      // Wind-up — fast linear turns while waiting for server. Wheel
      // goes CW, ball goes CCW for the classic counter-spin look. The
      // ball is flung outward onto the rim track as the spin starts.
      setRotation(r => r + 1080)                  // 3 turns clockwise
      setTransition({ duration: 1.4, ease: 'linear' })
      setBallRotation(b => b - 1080)              // 3 turns counter-clockwise
      setBallTransition({ duration: 1.4, ease: 'linear' })
      setBallY(-BALL_TRACK_R)
      setBallYTransition({ duration: 0.25, ease: 'easeOut' })
    } else if (phase === 'spinning' && winner !== null) {
      // Decelerate to the winning pocket. Snap the wheel's base to a
      // clean multiple of 360 ahead of the current visual position so
      // we get at least 4 more full turns regardless of where the
      // wind-up was. Ball lands at angle 0 (pointer/top), so its decel
      // target is just the next clean multiple of -360 minus a few more
      // turns. Both bottom out together at 3.2s.
      const wIdx = EUROPEAN_WHEEL_ORDER.indexOf(winner)
      const winnerAngle = -wIdx * POCKET_ANGLE
      setRotation(r => {
        const base = Math.ceil(r / 360) * 360 + 360 * 4
        return base + winnerAngle
      })
      setTransition({ duration: 3.2, ease: [0.16, 1, 0.3, 1] })   // ease-out-quint
      // Ball rotation: settle to 0 (modulo 360), reached after a few
      // more CCW turns. Ease-out-cubic (gentler than the wheel's quint)
      // so the ball is visibly still creeping when it leaves the track
      // — it should look like it falls while moving, not after parking.
      setBallRotation(b => {
        const base = Math.floor(b / -360) * -360 - 360 * 3
        return base
      })
      setBallTransition({ duration: 3.2, ease: [0.33, 1, 0.68, 1] })  // ease-out-cubic
      // Radial drop: ride the track for ~60% of the decel, then fall
      // into the pocket ring, kick back out once, and settle. The
      // bounce overlaps the last slow degrees of orbit so it reads as
      // the ball rattling across pocket walls before coming to rest.
      setBallY([-BALL_TRACK_R, -BALL_TRACK_R, -72, -86, -76, -BALL_REST_R])
      setBallYTransition({
        duration: 3.2,
        times: [0, 0.6, 0.72, 0.82, 0.92, 1],
        ease: ['linear', 'easeIn', 'easeOut', 'easeIn', 'easeOut'],
      })
    }
    // 'landed' / 'idle' just leave both where they are — no snap-back.
  }, [phase, winner])

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

        {/* Orbiting ball — outer group owns the orbital angle (CCW
            counter-spin), inner group owns the radial position. During
            wind-up the ball rides the rim groove; during decel it falls
            inward, bounces off the pocket ring, and settles at angle 0
            (top) so it visually drops into the winning pocket under the
            pointer. */}
        <motion.g
          animate={{ rotate: ballRotation }}
          transition={ballTransition}
          style={{ transformOrigin: '0px 0px' }}
        >
          <motion.circle
            cx="0"
            r="3"
            fill="#fff"
            stroke="#1a0a04"
            strokeWidth="0.6"
            initial={false}
            animate={{ cy: ballY }}
            transition={ballYTransition}
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.55))' }}
          />
          {/* Specular highlight on the ball */}
          <motion.circle
            cx="-0.9"
            r="0.9"
            fill="rgba(255,255,255,0.85)"
            initial={false}
            animate={{ cy: highlightY }}
            transition={ballYTransition}
            pointerEvents="none"
          />
        </motion.g>

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
