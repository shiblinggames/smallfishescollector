'use client'

// Tavern-wide coin shower. Fires once on a big win — currently triggered
// by RouletteClient when any straight bet hits (35:1 is rare and worth a
// celebration). Generates N coin elements at random horizontal positions
// with staggered start delays + per-coin fall durations + rotation, then
// auto-removes after the longest coin animation completes.
//
// Pure decoration, pointer-events: none, behind the result panel — so
// it never blocks a click.

import { motion } from 'framer-motion'

const COIN_COLORS = [
  ['#ffd966', '#b58820'],   // bright gold
  ['#f0c040', '#9c6b1a'],   // standard gold
  ['#ffe089', '#c89020'],   // pale gold
] as const

// Deterministic-ish but varied params per coin. Using Math.random is
// fine here — it's purely cosmetic client-side, never seeds game logic.
function buildCoin(i: number) {
  const x = Math.random() * 100               // vh-relative left start
  const delay = Math.random() * 0.5           // up to 500ms stagger
  const duration = 1.4 + Math.random() * 1.2  // 1.4–2.6s fall
  const rotation = Math.random() * 540 - 270  // -270 to +270 deg
  const size = 14 + Math.random() * 8         // 14–22 px
  const sway = (Math.random() - 0.5) * 30     // -15 to +15 vw drift
  const palette = COIN_COLORS[i % COIN_COLORS.length]
  return { x, delay, duration, rotation, size, sway, palette }
}

export default function CoinShower({ count = 32 }: { count?: number }) {
  const coins = Array.from({ length: count }, (_, i) => buildCoin(i))
  return (
    <div aria-hidden style={{
      position: 'fixed', inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
      zIndex: 200,
    }}>
      {coins.map((c, i) => (
        <motion.div
          key={i}
          initial={{ left: `${c.x}vw`, top: -40, opacity: 0, rotate: 0, x: 0 }}
          animate={{
            top: '108vh',
            opacity: [0, 1, 1, 0.7, 0],
            rotate: c.rotation,
            x: [0, `${c.sway / 2}vw`, `${c.sway}vw`],
          }}
          transition={{
            duration: c.duration,
            delay: c.delay,
            ease: 'easeIn',
            times: [0, 0.1, 0.8, 0.92, 1],
          }}
          style={{
            position: 'absolute',
            width: c.size, height: c.size,
            borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, ${c.palette[0]} 0%, ${c.palette[1]} 70%, #5a3a08 100%)`,
            boxShadow: `0 2px 5px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4)`,
            border: '1px solid rgba(120,84,16,0.7)',
          }}
        />
      ))}
    </div>
  )
}
