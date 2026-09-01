'use client'

// ── WHICH WAY IS FINN, AND WHY YOU WOULD GO ─────────────────────────────────
//
// He is the fishing campaign's only delivery route and he is a single boat on a
// forty-five thousand pixel sea. Everything that pointed at him needed you to
// already be looking somewhere specific: a pin on the minimap you have to open,
// a sprite you have to be near enough to see, and a HUD disc that blinks when a
// job is done but does not say where he is. So the one thing the chart never
// answered was the one thing a captain actually asks, which is "which way".
//
// `FinnSeaState.at` has carried the comment "for the marker and the compass"
// since it was written. This is the compass.
//
// ── THE STATE IS THE POINT, NOT THE ARROW ───────────────────────────────────
//
// A bearing on its own is a map feature. What makes this worth a slot on the
// HUD is that it says what going there would GET you, and the three answers are
// genuinely different errands:
//
//   WAITING ON YOU — a job is finished and he is holding the reward. Gold, and
//   it breathes. This is the only one that is asking for something.
//   ON A JOB — you have work outstanding. The distance is useful and the man is
//   not; it stays quiet and shows how far along you are instead.
//   HAS SOMETHING — no job open, so there is a new one to take. Warm, steady.
//
// ── AND IT GOES AWAY WHEN YOU CAN SEE HIM ───────────────────────────────────
//
// An arrow pointing at something already on your screen is furniture. It hides
// inside hail range, where the action bar takes over and says his name.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { vibrate } from '@/lib/haptics'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'
/** His own red, the one the minimap already pins him with. */
const FINN_RED = '#e8564a'

export type FinnCompassState = 'ready' | 'working' | 'offering'

/** Distance, in the units a captain reads rather than world pixels.
 *
 *  The chart's own scale: 30 world px to the metre, the same constant the
 *  Shipyard prints speeds with. Under a kilometre it is metres; past that it is
 *  one decimal of a kilometre, because "1,240 m" is a number you have to parse
 *  and "1.2 km" is a distance you feel. */
function readableDistance(px: number): string {
  const m = px / 30
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`
}

export default function FinnCompass({ size, top, left, at, me, state, progress, onOpen }: {
  size: number
  top: number
  /** Its slot in the HUD's derived run. Handed in rather than counted here, so
   *  the row closes up around it when a neighbour disappears — see hudAt. */
  left: number
  /** Where he is, in world pixels. */
  at: { x: number; y: number }
  /** Where you are, in world pixels. Passed rather than read, because the chart
   *  owns the boat's position and this must not become a second copy of it. */
  me: { x: number; y: number }
  state: FinnCompassState
  /** How far through an open job, as `done/total`. Only shown while working —
   *  it is the reason the quiet state is worth reading at all. */
  progress: { done: number; total: number } | null
  /** Opens the Salt Road, where his whole ladder is. Tapping a thing that
   *  points at someone should take you to what it knows about them. */
  onOpen: () => void
}) {
  const { deg, dist } = useMemo(() => {
    const dx = at.x - me.x
    const dy = at.y - me.y
    return {
      // SCREEN degrees, clockwise from up, which is what a CSS rotation wants.
      // atan2 gives radians counter-clockwise from east, so this is the usual
      // quarter-turn correction rather than a fudge.
      deg: (Math.atan2(dy, dx) * 180) / Math.PI + 90,
      dist: Math.hypot(dx, dy),
    }
  }, [at.x, at.y, me.x, me.y])

  const accent = state === 'ready' ? GOLD : state === 'offering' ? FINN_RED : `${SEA},0.6)`
  const label = state === 'working' && progress
    ? `${progress.done}/${progress.total}`
    : readableDistance(dist)

  return (
    <div data-no-steer
      onPointerDown={e => e.stopPropagation()}
      style={{ position: 'absolute', top, left, zIndex: 40 }}>
      <button type="button"
        aria-label={state === 'ready' ? 'Finn is waiting on you' : 'Where Finn is'}
        title={state === 'ready' ? 'Finn is waiting on you' : 'Finn'}
        onClick={() => { vibrate(8); onOpen() }}
        style={{
          position: 'relative',
          width: size, height: size, borderRadius: '50%', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: state === 'ready' ? 'rgba(40,30,8,0.82)' : 'rgba(8,16,24,0.72)',
          border: `1px solid ${state === 'ready' ? `${GOLD}88` : `${SEA},0.22)`}`,
          color: accent,
          backdropFilter: 'blur(2px)',
        }}>
        {/* THE PULSE, and only when he is holding something. Same ring the
            daily haul uses, for the same reason and under the same limit: it is
            allowed to ask for attention because there is an answer waiting, and
            it stops the moment there is not. */}
        {state === 'ready' && (
          <motion.span aria-hidden
            animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.5, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -2, borderRadius: '50%',
              border: `1px solid ${GOLD}`, pointerEvents: 'none',
            }} />
        )}

        {/* THE NEEDLE. Rotated by a transform so it composites — this turns
            with every metre the boat moves and must never cost a layout. */}
        <span aria-hidden style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transform: `rotate(${deg}deg)`,
          transition: 'transform 0.18s linear',
        }}>
          <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)}
            viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            {/* A pointer, not a compass rose. One head and a short tail reads as
                a direction at 26px; a rose reads as a smudge. */}
            <path d="M12 3l5.5 15L12 14.4 6.5 18z" fill="currentColor" fillOpacity="0.22" />
          </svg>
        </span>
      </button>

      {/* THE NUMBER, under the disc rather than in it. At 26px there is no room
          for both, and the direction is the part you read at a glance while the
          distance is the part you read when deciding. */}
      <p className="font-karla font-700" style={{
        marginTop: 2, textAlign: 'center', width: size,
        fontSize: '0.5rem', letterSpacing: '0.04em',
        color: state === 'ready' ? GOLD : `${SEA},0.55)`,
        textShadow: '0 1px 4px rgba(0,0,0,0.9)',
        fontVariantNumeric: 'tabular-nums',
      }}>{label}</p>
    </div>
  )
}
