'use client'

// Bespoke, per-chase-skin ABILITY-EFFECT FX — the dramatic thing that happens
// TO THE ENEMY when a legendary's ability lands, upgraded past the shared cannon
// hit. Rendered as an overlay inside the enemy-ship container (position:relative)
// so it sits over the hull; it extends ABOVE the ship so strikes fall from the
// sky. One-shot: the parent mounts it for the ability's duration, then unmounts.
//
// First: Tempest (Mako's Blitz) — instead of a rat-a-tat of recoloured cannon
// shots, a storm breaks over the enemy and a raking barrage of forked lightning
// bolts crashes down onto the hull, building to one heavy finishing strike.

import { motion } from 'framer-motion'

// Jagged bolt path in the overlay's 0..100 box. `jag` is the zigzag amplitude;
// segments alternate side to side so it reads as forked lightning, not a line.
function boltPath(x1: number, y1: number, x2: number, y2: number, jag: number): string {
  const segs = 4
  let d = `M${x1},${y1}`
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const x = x1 + (x2 - x1) * t + (i % 2 ? jag : -jag)
    const y = y1 + (y2 - y1) * t
    d += ` L${x.toFixed(1)},${y.toFixed(1)}`
  }
  return `${d} L${x2},${y2}`
}

/** Tempest (Mako) — a lightning storm raking the enemy hull. `shots` bolts fall
 *  staggered by `interval` ms (matched to the Blitz barrage cadence), the last a
 *  heavy finishing strike. Positioned over the enemy ship; bolts descend from a
 *  charged storm cloud above it. */
export function TempestStrikeFx({ color, shots, interval }: { color: string; shots: number; interval: number }) {
  const n = Math.max(3, Math.min(12, shots))
  const step = interval / 1000
  // Strike targets rake left→right across the hull (which sits low in this
  // extended overlay, ~y72-88, centred ~x50). The final strike lands dead centre.
  const strikes = Array.from({ length: n }, (_, k) => {
    const big = k === n - 1
    const t = n === 1 ? 0.5 : k / (n - 1)
    const hx = big ? 50 : 30 + t * 44 + (k % 2 ? 5 : -5)
    const hy = big ? 80 : 72 + (k % 3) * 6
    const cx = hx + (k % 2 ? -7 : 7)   // cloud origin, roughly above the target
    return { k, big, hx, hy, cx, delay: k * step }
  })
  const total = (n - 1) * step + 0.7

  return (
    <div aria-hidden style={{ position: 'absolute', left: '-25%', width: '150%', top: '-170%', height: '275%', pointerEvents: 'none', overflow: 'visible', zIndex: 6 }}>
      {/* Charged storm cloud massing above the ship — dark, with a blue electric
          underglow that flickers as the bolts build. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.75, 0.5, 0.8, 0.55, 0] }}
        transition={{ duration: total, times: [0, 0.08, 0.3, 0.6, 0.85, 1], ease: 'easeInOut' }}
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '32%',
          background: `radial-gradient(ellipse 70% 120% at 50% 0%, ${color}55 0%, rgba(3,8,20,0.85) 55%, transparent 100%)` }}
      />

      {/* Persistent electric charge on the hull for the whole storm — a blue glow
          that breathes so the ship reads as "lit up" between strikes. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0.3, 0.55, 0.35, 0] }}
        transition={{ duration: total, times: [0, 0.12, 0.35, 0.62, 0.82, 1], ease: 'easeInOut' }}
        style={{ position: 'absolute', left: '18%', width: '64%', top: '66%', height: '30%', borderRadius: '50%',
          background: `radial-gradient(ellipse at 50% 50%, ${color}66 0%, ${color}22 45%, transparent 72%)` }}
      />

      {/* The bolts. Each: a wide soft glow stroke under a bright white core, drawn
          cloud→hull in a fast crack, flashing a couple of times then gone. The
          final strike is thicker and forks. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        {strikes.map(s => {
          const main = boltPath(s.cx, 4, s.hx, s.hy, s.big ? 8 : 5)
          const fork = s.big ? boltPath(s.hx + 3, s.hy - 22, s.hx + 12, s.hy - 6, 4) : null
          const glowW = s.big ? 13 : 8
          const coreW = s.big ? 4.5 : 2.6
          const strikeDur = s.big ? 0.5 : 0.34
          return (
            <motion.g key={s.k}
              initial={{ opacity: 0 }}
              animate={{ opacity: s.big ? [0, 1, 0.4, 1, 0.5, 0] : [0, 1, 0.25, 0.85, 0] }}
              transition={{ duration: strikeDur, delay: s.delay, times: s.big ? [0, 0.12, 0.28, 0.42, 0.6, 1] : [0, 0.14, 0.34, 0.5, 1], ease: 'easeOut' }}
            >
              {[main, fork].filter(Boolean).map((d, i) => (
                <g key={i}>
                  <motion.path d={d as string} fill="none" stroke={color} strokeWidth={glowW} opacity={0.5}
                    strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.08, delay: s.delay, ease: 'easeIn' }} />
                  <motion.path d={d as string} fill="none" stroke="#ffffff" strokeWidth={coreW}
                    strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.08, delay: s.delay, ease: 'easeIn' }} />
                </g>
              ))}
            </motion.g>
          )
        })}
      </svg>

      {/* Impact burst at each strike point — a white core flashing to the storm
          colour, plus an expanding shock ring. The final strike detonates bigger. */}
      {strikes.map(s => (
        <div key={`imp-${s.k}`} style={{ position: 'absolute', left: `${s.hx}%`, top: `${s.hy}%`, transform: 'translate(-50%,-50%)' }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: [0, 0.95, 0], scale: [0.3, s.big ? 2.1 : 1.3, s.big ? 2.6 : 1.7] }}
            transition={{ duration: s.big ? 0.55 : 0.34, delay: s.delay + 0.06, ease: 'easeOut' }}
            style={{ width: s.big ? 160 : 90, height: s.big ? 160 : 90, marginLeft: s.big ? -80 : -45, marginTop: s.big ? -80 : -45, borderRadius: '50%',
              background: `radial-gradient(circle, #ffffff 0%, ${color}bb 32%, transparent 68%)` }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.2 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.2, s.big ? 2.4 : 1.5, s.big ? 3 : 2] }}
            transition={{ duration: s.big ? 0.6 : 0.4, delay: s.delay + 0.06, ease: 'easeOut' }}
            style={{ position: 'absolute', left: 0, top: 0, width: s.big ? 120 : 70, height: s.big ? 120 : 70, marginLeft: s.big ? -60 : -35, marginTop: s.big ? -60 : -35, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}` }}
          />
        </div>
      ))}
    </div>
  )
}
