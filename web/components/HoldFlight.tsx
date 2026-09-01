'use client'

// ── THE CATCH GOING INTO THE HOLD ───────────────────────────────────────────
//
// ── IT STARTS IN THE WATER NOW, NOT ON THE CARD ─────────────────────────────
//
// There were two animations telling the same beat and disagreeing about how it
// ended. seaSplash arced a dark shape out of the water and dropped it BACK IN
// with a second splash — which is what a jumping fish does and the exact wrong
// story for one you just caught — and then this flew a second fish off the
// result card a beat later.
//
// One motion now. The water bursts where the line was, the fish comes out of
// that burst, and it carries across into the Hold, where the number ticks. The
// splash keeps the water; this keeps the fish.
//
// ── AND IT IS A SILHOUETTE ──────────────────────────────────────────────────
//
// Not the species plate, for the two reasons seaSplash already wrote down: the
// plates are 140KB and the name does not arrive until `reelIn` answers, so
// drawing the real fish here would be a fetch and a race in the one moment that
// must not stutter. A dark shape is also what you SEE when a fish clears the
// water — the card is where it gets identified, and doing that twice takes the
// reveal off the card without giving it anywhere else.
//
// A fish was landed, a card appeared, and somewhere off in the corner a number
// silently became one bigger. Those three facts were never joined up, so the
// hold read as a counter that happened to be near the fishing rather than as
// the place the fish you just caught actually went. People filled it without
// ever watching it fill.
//
// So the fish makes the trip. It leaves the card, arcs down to the hold chip,
// and the count only moves when it ARRIVES — which is the whole point. A
// counter that ticks the instant the server answers is reporting; a counter
// that ticks when something lands in it is showing you where your fish went.
//
// ── IT IS MEASURED, NOT POSITIONED ──────────────────────────────────────────
//
// Both ends are real elements that move: the card is centred in a column whose
// height depends on what was caught, and the chip sits in a row that shifts with
// the safe-area inset. So both are read with getBoundingClientRect at the moment
// of flight and the token is `position: fixed` in viewport space between them.
// Anything hard-coded here would be right on one phone.
//
// ── AND IT ARCS ─────────────────────────────────────────────────────────────
//
// Straight-line tweens between two points read as a UI element being moved by a
// program. A fish thrown into a barrel goes up a little first and then falls,
// so the path is a two-keyframe y with an eased x — cheap, and the difference
// between "an asset slid across the screen" and "somebody chucked that in".

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

export type Flight = {
  /** Bumped per catch, so two fish in a row each get their own trip. */
  key: number
  qty: number
  /** A golden catches the light on the way over. The only thing about the fish
   *  this knows, and the only one worth knowing before the card says the rest. */
  shiny: boolean
  from: { x: number; y: number }
  to: { x: number; y: number }
}

/** How long the trip takes. Long enough to follow, short enough that the next
 *  cast is never waiting on it — the auto-caster recasts on its own clock and
 *  this must never be the thing holding that up. */
export const FLIGHT_MS = 620

export default function HoldFlight({ flight, onArrive }: {
  flight: Flight | null
  /** Fired when the fish lands. The hold's number moves HERE and not before. */
  onArrive: () => void
}) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!flight) return
    const t = setTimeout(onArrive, FLIGHT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight?.key])

  if (!mounted) return null

  return createPortal(
    // PORTALLED TO THE BODY, like every other fixed thing on this chart. The
    // map's root carries `touch-action: none` and a fixed box inside it still
    // inherits that from its DOM ancestors — see GoldenChoice for the full
    // version of this trap.
    <AnimatePresence>
      {flight && (
        <motion.div key={flight.key} aria-hidden
          initial={{ x: flight.from.x, y: flight.from.y, scale: 1, opacity: 0 }}
          animate={{
            x: flight.to.x,
            // UP, THEN DOWN. The midpoint is above both ends, so the fish is
            // thrown rather than slid.
            y: [flight.from.y, Math.min(flight.from.y, flight.to.y) - 54, flight.to.y],
            scale: [1, 0.92, 0.34],
            opacity: [0, 1, 1],
          }}
          exit={{ opacity: 0, scale: 0.2, transition: { duration: 0.12 } }}
          transition={{
            duration: FLIGHT_MS / 1000,
            ease: 'easeInOut',
            // The vertical is its own curve: quick off the card, slowing into
            // the barrel, which is what selling the arc depends on.
            y: { duration: FLIGHT_MS / 1000, ease: [0.3, 0, 0.5, 1], times: [0, 0.42, 1] },
            opacity: { duration: 0.14 },
          }}
          style={{
            position: 'fixed', top: 0, left: 0, zIndex: 9400,
            width: 64, height: 64, marginLeft: -32, marginTop: -32,
            pointerEvents: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {/* THE SAME SHAPE THE WATER THREW UP. Drawn rather than fetched, so
              it is on screen on the frame the burst happens — a sprite that
              arrives one network round trip late would miss its own splash. */}
          <svg viewBox="0 0 64 40" width="100%" height="100%" aria-hidden
            style={{ filter: flight.shiny
              ? 'drop-shadow(0 0 10px rgba(240,192,64,0.9))'
              : 'drop-shadow(0 3px 8px rgba(0,0,0,0.55))' }}>
            <path d="M2 20c10-13 26-17 38-13 7 2 12 7 15 13-3 6-8 11-15 13-12 4-28 0-38-13z"
              fill={flight.shiny ? '#f0c040' : '#0d1a24'} />
            <path d="M52 8 62 2v36l-10-6z" fill={flight.shiny ? '#d9a52c' : '#0a141c'} />
          </svg>
          {/* A HAUL SAYS SO. One sprite for eight fish would undercount the
              moment; a number on it is cheaper than eight sprites and reads
              faster than eight sprites would. */}
          {flight.qty > 1 && (
            <span className="font-cinzel font-800" style={{
              position: 'absolute', right: -2, bottom: -2,
              fontSize: '0.86rem', color: '#f0c040',
              textShadow: '0 1px 3px rgba(0,0,0,0.95)',
            }}>×{flight.qty}</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
