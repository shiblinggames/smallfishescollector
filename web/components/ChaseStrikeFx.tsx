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

// Deterministic pseudo-random 0..1 from a seed (no Math.random, so a bolt's
// shape is stable across re-renders).
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1) * 43758.5453
  return x - Math.floor(x)
}

// Organic lightning channel in the overlay's 0..100 box — many short segments
// with irregular horizontal jitter (largest mid-channel, tapering to the ends)
// so it reads as a real bolt rather than a zigzag. `amp` = jitter amplitude,
// `seed` varies the shape per bolt.
function boltPath(x1: number, y1: number, x2: number, y2: number, amp: number, seed: number): string {
  const segs = 9
  let d = `M${x1.toFixed(1)},${y1.toFixed(1)}`
  for (let i = 1; i < segs; i++) {
    const t = i / segs
    const bx = x1 + (x2 - x1) * t
    const by = y1 + (y2 - y1) * t
    const taper = Math.max(0.2, 1 - Math.abs(t - 0.45) * 1.1)
    const jx = (rand(seed + i * 1.7) * 2 - 1) * amp * taper
    d += ` L${(bx + jx).toFixed(1)},${by.toFixed(1)}`
  }
  return `${d} L${x2.toFixed(1)},${y2.toFixed(1)}`
}

// One or two branches forking off the main channel — each a shorter, thinner
// offshoot starting partway down.
function forkPaths(x1: number, y1: number, x2: number, y2: number, amp: number, seed: number): string[] {
  const forks: string[] = []
  for (let f = 0; f < 2; f++) {
    const t = 0.38 + rand(seed + f * 5) * 0.34
    const sx = x1 + (x2 - x1) * t
    const sy = y1 + (y2 - y1) * t
    const dir = rand(seed + f * 9) > 0.5 ? 1 : -1
    const ex = sx + dir * (5 + rand(seed + f * 3) * 9)
    const ey = sy + (5 + rand(seed + f * 2) * 9)
    forks.push(boltPath(sx, sy, ex, ey, amp * 0.55, seed + f * 13))
  }
  return forks
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
        style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '42%',
          background: `radial-gradient(ellipse 76% 82% at 50% 0%, ${color}3a 0%, rgba(10,16,32,0.4) 34%, transparent 68%)` }}
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
          const amp = s.big ? 9 : 6
          const paths = [boltPath(s.cx, 4, s.hx, s.hy, amp, s.k + 1), ...forkPaths(s.cx, 4, s.hx, s.hy, amp, s.k + 1)]
          const glowW = s.big ? 15 : 9
          const coreW = s.big ? 3 : 1.8
          const strikeDur = s.big ? 0.5 : 0.34
          const draw = { duration: 0.07, delay: s.delay, ease: 'easeIn' as const }
          return (
            <motion.g key={s.k}
              initial={{ opacity: 0 }}
              animate={{ opacity: s.big ? [0, 1, 0.4, 1, 0.5, 0] : [0, 1, 0.25, 0.85, 0] }}
              transition={{ duration: strikeDur, delay: s.delay, times: s.big ? [0, 0.12, 0.28, 0.42, 0.6, 1] : [0, 0.14, 0.34, 0.5, 1], ease: 'easeOut' }}
            >
              {paths.map((d, i) => {
                const fork = i > 0
                // Three stacked strokes per channel: a wide soft colour halo, a
                // brighter colour mid, and a thin white-hot core — reads as a
                // glowing bolt with an incandescent filament, not a flat line.
                return (
                  <g key={i}>
                    <motion.path d={d} fill="none" stroke={color} strokeWidth={fork ? glowW * 0.5 : glowW} opacity={0.2}
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
                    <motion.path d={d} fill="none" stroke={color} strokeWidth={fork ? glowW * 0.24 : glowW * 0.42} opacity={0.85}
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
                    <motion.path d={d} fill="none" stroke="#ffffff" strokeWidth={fork ? coreW * 0.6 : coreW}
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={draw} />
                  </g>
                )
              })}
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

/** Fossil (Laz) — an ancient ward sealing around YOUR ship. Vengeance arms a
 *  revive ward, so this is a slow, deliberate seal: two counter-rotating rings of
 *  runic glyphs (his stone astrolabe-relic) converge and LOCK around the hull, a
 *  sepia-amber aureole tightens, primordial motes rise, and the ward flashes as
 *  it locks in. Rendered over the player ship. */
export function FossilWardFx({ color }: { color: string }) {
  const CREAM = '#ead6a6'
  const LOCK = 0.62   // moment the ward seals (s)
  return (
    <div aria-hidden style={{ position: 'absolute', inset: '-35% -25%', pointerEvents: 'none', zIndex: 6, overflow: 'visible' }}>
      {/* Sepia/amber haze rising with the seal. */}
      {[{ c: color, l: 46, t: 54, s: 74, d: 0 }, { c: CREAM, l: 56, t: 60, s: 58, d: 0.15 }].map((h, i) => (
        <motion.div key={`hz-${i}`}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: [0, 0.5, 0.4, 0], scale: [0.6, 1, 1.05, 1.12] }}
          transition={{ duration: 1.95, delay: h.d, times: [0, 0.26, 0.84, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${h.l}%`, top: `${h.t}%`, width: `${h.s}%`, height: `${h.s}%`, marginLeft: `-${h.s / 2}%`, marginTop: `-${h.s / 2}%`, borderRadius: '50%', background: `radial-gradient(circle, ${h.c}55 0%, ${h.c}1e 44%, transparent 72%)` }}
        />
      ))}

      {/* Counter-rotating glyph rings converging + locking around the hull. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: '13%', top: '50%', width: '74%', height: '56%' }}>
        <motion.g
          initial={{ opacity: 0, scale: 1.5, rotate: -40 }}
          animate={{ opacity: [0, 0.9, 0.85, 0], scale: [1.5, 1, 1, 1.05], rotate: [-40, 0, 3, 10] }}
          transition={{ duration: 1.95, times: [0, 0.28, 0.84, 1], ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%' }}
        >
          <circle cx="50" cy="50" r="40" fill="none" stroke={CREAM} strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: 12 }).map((_, k) => (
            <line key={k} x1="50" y1="8" x2="50" y2={k % 2 ? 14 : 11} stroke={k % 2 ? color : CREAM} strokeWidth="1.4" vectorEffect="non-scaling-stroke" transform={`rotate(${k * 30} 50 50)`} />
          ))}
        </motion.g>
        <motion.g
          initial={{ opacity: 0, scale: 1.7, rotate: 40 }}
          animate={{ opacity: [0, 0.9, 0.8, 0], scale: [1.7, 1, 1, 1.05], rotate: [40, 0, -3, -8] }}
          transition={{ duration: 1.95, times: [0, 0.3, 0.84, 1], ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%' }}
        >
          <circle cx="50" cy="50" r="29" fill="none" stroke={color} strokeWidth="1.4" strokeDasharray="1 6" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: 8 }).map((_, k) => (
            <line key={k} x1="50" y1="21" x2="50" y2="26" stroke={k % 2 ? CREAM : color} strokeWidth="1.2" vectorEffect="non-scaling-stroke" transform={`rotate(${k * 45} 50 50)`} />
          ))}
        </motion.g>
      </svg>

      {/* Amber aureole tightening as the ward takes hold. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.6, rotate: -20 }}
        animate={{ opacity: [0, 0.35, 0.28, 0], scale: [1.6, 1, 1, 1.08], rotate: [-20, 6, 8, 14] }}
        transition={{ duration: 1.5, times: [0, 0.4, 0.72, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '58%', width: 320, height: 320, marginLeft: -160, marginTop: -160, borderRadius: '50%', background: `repeating-conic-gradient(from 0deg, ${color}00 0deg, ${color}2a 8deg, ${color}00 18deg)` }}
      />

      {/* Seal flash + lock ring when the ward snaps shut. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.3, 1.9, 2.4] }}
        transition={{ duration: 0.6, delay: LOCK, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '58%', width: 190, height: 190, marginLeft: -95, marginTop: -95, borderRadius: '50%', background: `radial-gradient(circle, #fff6e0 0%, ${color}aa 32%, transparent 66%)` }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.6, 1.7, 2.1] }}
        transition={{ duration: 0.6, delay: LOCK + 0.02, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '58%', width: 160, height: 160, marginLeft: -80, marginTop: -80, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 16px ${color}` }}
      />

      {/* Primordial motes rising through the seal. */}
      {Array.from({ length: 12 }).map((_, i) => {
        const left = 12 + ((i * 71) / 12) % 76
        const c = i % 2 ? CREAM : color
        return (
          <motion.div key={`mote-${i}`}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: [0, 0.9, 0], y: [30, -44] }}
            transition={{ duration: 1.2 + (i % 4) * 0.2, delay: 0.2 + (i % 6) * 0.1, ease: 'easeOut' }}
            style={{ position: 'absolute', left: `${left}%`, top: '78%', width: 3 + (i % 3), height: 3 + (i % 3), borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }}
          />
        )
      })}
    </div>
  )
}

/** Galaxy (Catfish) — a cosmic surge over YOUR ship. Tidecaller heals + shields,
 *  so this is restorative, not violent: a nebula blooms over the hull, a starfield
 *  kindles, a translucent galactic shield-dome forms around the ship, and healing
 *  motes rise through it. Rendered over the player ship. */
export function GalaxySurgeFx({ color }: { color: string }) {
  const CYAN = '#4dc9ff'
  const MAG = '#c56bff'
  const stars: [number, number, number][] = [
    [24, 26, 1], [70, 22, 1.2], [44, 40, 0.8], [80, 54, 1], [18, 56, 1.1], [58, 66, 0.9], [36, 78, 1.2], [86, 38, 0.8],
    [14, 40, 1], [64, 84, 1], [50, 30, 0.7], [30, 62, 0.9], [76, 70, 1.1], [40, 20, 0.8], [90, 60, 0.9], [22, 74, 1],
  ]
  const shooters = [{ top: 24, delay: 0.35, dur: 0.9 }, { top: 50, delay: 0.62, dur: 1.05 }, { top: 70, delay: 0.98, dur: 1.0 }]
  return (
    <div aria-hidden style={{ position: 'absolute', inset: '-42% -30%', pointerEvents: 'none', zIndex: 6, overflow: 'visible' }}>
      {/* Big swirling multi-hue nebula blooming up over the hull. */}
      {[{ c: color, l: 42, t: 48, s: 98, d: 0 }, { c: CYAN, l: 60, t: 56, s: 80, d: 0.1 }, { c: MAG, l: 46, t: 64, s: 74, d: 0.18 }, { c: color, l: 54, t: 42, s: 64, d: 0.26 }].map((n, i) => (
        <motion.div key={`neb-${i}`}
          initial={{ opacity: 0, scale: 0.5, rotate: -20 }}
          animate={{ opacity: [0, 0.7, 0.55, 0], scale: [0.5, 1, 1.12, 1.22], rotate: [-20, 8, 16, 24] }}
          transition={{ duration: 1.6, delay: n.d, times: [0, 0.3, 0.7, 1], ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${n.l}%`, top: `${n.t}%`, width: `${n.s}%`, height: `${n.s}%`, marginLeft: `-${n.s / 2}%`, marginTop: `-${n.s / 2}%`, borderRadius: '50%',
            background: `radial-gradient(circle, ${n.c}80 0%, ${n.c}30 42%, transparent 70%)` }}
        />
      ))}

      {/* Spiral galaxy disc — a tilted, slow-turning arm-swirl (the galactic
          centrepiece). Outer holds the disc tilt, inner turns the arms. */}
      <div style={{ position: 'absolute', left: '50%', top: '56%', width: '90%', height: '90%', marginLeft: '-45%', marginTop: '-45%', transformOrigin: '50% 50%', transform: 'perspective(620px) rotateX(58deg)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.4, rotate: -70 }}
          animate={{ opacity: [0, 0.62, 0.5, 0], scale: [0.4, 1.05, 1.18, 1.3], rotate: [-70, 30, 60, 84] }}
          transition={{ duration: 1.6, times: [0, 0.32, 0.72, 1], ease: 'easeOut' }}
          style={{ width: '100%', height: '100%', borderRadius: '50%',
            background: `conic-gradient(from 0deg, ${color}00, ${color}66 12%, ${CYAN}3a 26%, ${color}00 42%, ${MAG}66 60%, ${color}00 78%, ${CYAN}4a 92%, ${color}00)`,
            WebkitMaskImage: 'radial-gradient(circle, #000 0%, #000 32%, transparent 72%)', maskImage: 'radial-gradient(circle, #000 0%, #000 32%, transparent 72%)' }}
        />
      </div>

      {/* Bright galactic core. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 0.7, 0], scale: [0.3, 1, 1.12, 1.3] }}
        transition={{ duration: 1.5, times: [0, 0.24, 0.7, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '56%', width: 96, height: 96, marginLeft: -48, marginTop: -48, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${color}cc 32%, ${MAG}55 60%, transparent 78%)`, boxShadow: `0 0 44px ${color}` }}
      />

      {/* Galactic shield-dome forming around the ship — the shield it grants. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.55 }}
        animate={{ opacity: [0, 0.9, 0.7, 0], scale: [0.55, 1.04, 1, 1.05] }}
        transition={{ duration: 1.6, times: [0, 0.3, 0.72, 1], ease: [0.2, 0.9, 0.3, 1] }}
        style={{ position: 'absolute', left: '50%', top: '58%', width: '76%', height: '64%', marginLeft: '-38%', marginTop: '-32%', borderRadius: '50%',
          border: `2px solid ${CYAN}`, boxShadow: `0 0 24px ${color}88, inset 0 0 34px ${color}55`,
          background: `radial-gradient(ellipse at 50% 45%, ${color}1c 0%, ${CYAN}10 55%, transparent 78%)` }}
      />

      {/* Surge flash. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.3, 2, 2.6] }}
        transition={{ duration: 0.6, delay: 0.26, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '56%', width: 220, height: 220, marginLeft: -110, marginTop: -110, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${color}88 34%, transparent 68%)` }}
      />

      {/* Dense twinkling starfield. */}
      {stars.map(([l, t, sm], i) => (
        <motion.div key={`star-${i}`}
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 1, 0.4, 0], scale: [0.3, 1, 1, 0.7] }}
          transition={{ duration: 1.35, delay: 0.15 + (i % 6) * 0.1, ease: 'easeInOut' }}
          style={{ position: 'absolute', left: `${l}%`, top: `${t}%`, width: 5 * sm, height: 5 * sm, marginLeft: -2.5 * sm, marginTop: -2.5 * sm, background: '#ffffff', borderRadius: 1, boxShadow: `0 0 4px #fff, 0 0 9px ${color}` }}
        />
      ))}

      {/* Shooting stars streaking across. */}
      {shooters.map((s, i) => (
        <motion.div key={`shoot-${i}`}
          initial={{ opacity: 0, x: '-12%' }}
          animate={{ opacity: [0, 1, 0], x: ['-12%', '92%'] }}
          transition={{ duration: s.dur, delay: s.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: 0, top: `${s.top}%`, width: '44%', height: 2.5, borderRadius: 2, background: `linear-gradient(90deg, transparent, ${CYAN}cc, #ffffff)`, boxShadow: `0 0 8px ${color}` }}
        />
      ))}

      {/* Healing motes rising through the surge. */}
      {Array.from({ length: 14 }).map((_, i) => {
        const left = 10 + ((i * 71) / 14) % 80
        const c = i % 3 === 0 ? MAG : i % 2 ? CYAN : color
        return (
          <motion.div key={`mote-${i}`}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: [0, 0.9, 0], y: [32, -50] }}
            transition={{ duration: 1.2 + (i % 4) * 0.2, delay: 0.15 + (i % 6) * 0.1, ease: 'easeOut' }}
            style={{ position: 'absolute', left: `${left}%`, top: '80%', width: 3 + (i % 3), height: 3 + (i % 3), borderRadius: '50%', background: c, boxShadow: `0 0 5px ${c}` }}
          />
        )
      })}
    </div>
  )
}

/** The Idol (Mira) — a death-mark. Requiem deals no damage; it BRANDS the enemy.
 *  A gilded gaze-beam falls onto the target, an aureole of rays tightens, and a
 *  sacred rose-and-gold sigil seals onto the hull with a searing flash, an eye
 *  opening at its heart. The lasting `marked` aura carries on after this seals. */
export function RequiemMarkFx({ color }: { color: string }) {
  const GOLD = '#f5c542'
  const SEAL = 0.5   // moment the sigil locks + sears (s)
  return (
    <div aria-hidden style={{ position: 'absolute', inset: '-55% -28% -20% -28%', pointerEvents: 'none', zIndex: 6 }}>
      {/* Gilded gaze-beam falling onto the mark from above. */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0.4 }}
        animate={{ opacity: [0, 0.7, 0.55, 0], scaleY: [0.4, 1, 1, 1] }}
        transition={{ duration: 1.35, times: [0, 0.35, 0.75, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: 0, width: '20%', height: '78%', marginLeft: '-10%', transformOrigin: '50% 0%',
          background: `linear-gradient(180deg, ${GOLD}00 0%, ${GOLD}55 20%, ${color}44 70%, transparent 100%)` }}
      />

      {/* Aureole of rays tightening onto the target as the seal forms. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.7, rotate: -24 }}
        animate={{ opacity: [0, 0.4, 0.3, 0], scale: [1.7, 1, 1, 1.1], rotate: [-24, 6, 10, 18] }}
        transition={{ duration: 1.35, times: [0, 0.4, 0.75, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '62%', width: 340, height: 340, marginLeft: -170, marginTop: -170, borderRadius: '50%',
          background: `repeating-conic-gradient(from 0deg, ${GOLD}00 0deg, ${GOLD}30 7deg, ${GOLD}00 17deg)` }}
      />

      {/* The sacred sigil sealing onto the hull — converges in + slow-turns, an
          eye opening at its heart. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: '10%', top: '46%', width: '80%', height: '52%' }}>
        <motion.g
          initial={{ opacity: 0, scale: 1.55, rotate: -35 }}
          animate={{ opacity: [0, 1, 0.95, 0.85, 0], scale: [1.55, 1, 1, 1, 1.06], rotate: [-35, 0, 2, 4, 12] }}
          transition={{ duration: 1.35, times: [0, 0.38, 0.6, 0.85, 1], ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%' }}
        >
          <circle cx="50" cy="50" r="40" fill="none" stroke={GOLD} strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
          <circle cx="50" cy="50" r="30" fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: 12 }).map((_, k) => (
            <line key={k} x1="50" y1="8" x2="50" y2={k % 2 ? 15 : 12} stroke={k % 2 ? color : GOLD} strokeWidth="1.4" vectorEffect="non-scaling-stroke" transform={`rotate(${k * 30} 50 50)`} />
          ))}
          {/* Six-point star bounding the eye. */}
          {[0, 60, 120].map(a => (
            <line key={a} x1="50" y1="30" x2="50" y2="70" stroke={GOLD} strokeWidth="1.2" vectorEffect="non-scaling-stroke" transform={`rotate(${a} 50 50)`} opacity={0.8} />
          ))}
          {/* The eye at the heart — a rose lens with a bright pupil. */}
          <ellipse cx="50" cy="50" rx="12" ry="6.5" fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
          <circle cx="50" cy="50" r="3" fill={color} />
        </motion.g>
      </svg>

      {/* Searing flash as the mark locks in. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 1, 0], scale: [0.3, 2, 2.7] }}
        transition={{ duration: 0.55, delay: SEAL, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '72%', width: 190, height: 190, marginLeft: -95, marginTop: -95, borderRadius: '50%',
          background: `radial-gradient(circle, #ffffff 0%, ${GOLD}bb 28%, ${color}66 48%, transparent 70%)` }}
      />
      {/* Shield-crack ring — the mark lays the hull open (pierce at cap). */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1.8, 2.3] }}
        transition={{ duration: 0.6, delay: SEAL + 0.02, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '72%', width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 16px ${color}` }}
      />
    </div>
  )
}

/** Kraken Hunter (Dole) — an abyssal scry over the enemy. Oracle reveals the
 *  enemy's next moves, so this reads as reading them from the deep: a teal
 *  scrying eye opens over the target, sonar rings pulse out scanning it, a runic
 *  ring turns, and bubbles + caustic light rise from the abyss. Over the enemy. */
export function KrakenOracleFx({ color }: { color: string }) {
  const OPEN = 0.4   // moment the eye opens + the read lands (s)
  return (
    <div aria-hidden style={{ position: 'absolute', inset: '-35% -25%', pointerEvents: 'none', zIndex: 6, overflow: 'visible' }}>
      {/* Abyssal caustic haze drifting over the target. */}
      {[{ l: 48, t: 54, s: 76, d: 0 }, { l: 60, t: 60, s: 56, d: 0.2 }].map((h, i) => (
        <motion.div key={`hz-${i}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0.4, 0] }}
          transition={{ duration: 1.4, delay: h.d, times: [0, 0.3, 0.7, 1], ease: 'easeInOut' }}
          style={{ position: 'absolute', left: `${h.l}%`, top: `${h.t}%`, width: `${h.s}%`, height: `${h.s}%`, marginLeft: `-${h.s / 2}%`, marginTop: `-${h.s / 2}%`, borderRadius: '50%', background: `radial-gradient(circle, ${color}55 0%, ${color}1e 44%, transparent 72%)` }}
        />
      ))}

      {/* Sonar rings pulsing outward — scanning the enemy. */}
      {[0, 0.18, 0.36, 0.54].map((d, i) => (
        <motion.div key={`son-${i}`}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 0.7, 0], scale: [0.2, 2.6, 3.2] }}
          transition={{ duration: 1, delay: 0.15 + d, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '56%', width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: '50%', border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}` }}
        />
      ))}

      {/* Slow-turning scrying rune ring. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', left: '18%', top: '50%', width: '64%', height: '52%' }}>
        <motion.g
          initial={{ opacity: 0, scale: 1.5, rotate: -30 }}
          animate={{ opacity: [0, 0.9, 0.85, 0], scale: [1.5, 1, 1, 1.06], rotate: [-30, 10, 14, 24] }}
          transition={{ duration: 1.4, times: [0, 0.35, 0.72, 1], ease: 'easeOut' }}
          style={{ transformOrigin: '50% 50%' }}
        >
          <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="1" strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
          {Array.from({ length: 8 }).map((_, k) => (
            <line key={k} x1="50" y1="10" x2="50" y2="16" stroke={color} strokeWidth="1.3" vectorEffect="non-scaling-stroke" transform={`rotate(${k * 45} 50 50)`} />
          ))}
        </motion.g>
      </svg>

      {/* The abyssal eye opening — a teal lens with a dark pupil that reads the mark. */}
      <motion.div
        initial={{ opacity: 0, scaleY: 0.08 }}
        animate={{ opacity: [0, 1, 0.9, 0], scaleY: [0.08, 1, 1, 1] }}
        transition={{ duration: 1.4, delay: OPEN, times: [0, 0.2, 0.7, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '56%', width: 74, height: 40, marginLeft: -37, marginTop: -20, borderRadius: '50%', border: `2px solid ${color}`, background: `radial-gradient(ellipse at 50% 50%, #ffffff 0%, ${color}aa 30%, ${color}33 55%, transparent 76%)`, boxShadow: `0 0 20px ${color}` }}
      >
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 11, height: 11, marginLeft: -5.5, marginTop: -5.5, borderRadius: '50%', background: '#04121a', boxShadow: `0 0 8px ${color}` }} />
      </motion.div>

      {/* Reveal flash as the read lands. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0.3, 1.8, 2.3] }}
        transition={{ duration: 0.55, delay: OPEN, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '56%', width: 180, height: 180, marginLeft: -90, marginTop: -90, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${color}88 32%, transparent 66%)` }}
      />

      {/* Bubbles rising from the abyss. */}
      {Array.from({ length: 12 }).map((_, i) => {
        const left = 12 + ((i * 71) / 12) % 76
        return (
          <motion.div key={`b-${i}`}
            initial={{ opacity: 0, y: 34 }}
            animate={{ opacity: [0, 0.8, 0], y: [34, -46] }}
            transition={{ duration: 1.2 + (i % 4) * 0.2, delay: 0.1 + (i % 6) * 0.1, ease: 'easeOut' }}
            style={{ position: 'absolute', left: `${left}%`, top: '80%', width: 3 + (i % 3), height: 3 + (i % 3), borderRadius: '50%', border: `1px solid ${color}bb`, background: `${color}22`, boxShadow: `0 0 4px ${color}99` }}
          />
        )
      })}
    </div>
  )
}

/** Hunter's Bane (Doby) — the apex predator's killing blow. A reticle snaps a
 *  lock onto the enemy while a blood-red charge GATHERS and tightens to a hot
 *  point (a dramatic wind-up), then ONE massive strike detonates on the hull: a
 *  huge white-to-red blast, shock rings, and a wide ring of fangs. One heavy
 *  hit — no aftershock. */
export function LeviathanStrikeFx({ color }: { color: string }) {
  const STRIKE = 0.58   // the single devastating hit (s) — lands after a long charge
  const corners: React.CSSProperties[] = [
    { top: 0, left: 0, borderTop: `3px solid ${color}`, borderLeft: `3px solid ${color}` },
    { top: 0, right: 0, borderTop: `3px solid ${color}`, borderRight: `3px solid ${color}` },
    { bottom: 0, left: 0, borderBottom: `3px solid ${color}`, borderLeft: `3px solid ${color}` },
    { bottom: 0, right: 0, borderBottom: `3px solid ${color}`, borderRight: `3px solid ${color}` },
  ]
  const fangs = Array.from({ length: 14 }, (_, i) => Math.round((i * 360) / 14))
  // Energy motes pulled in from a ring as the strike charges.
  const motes = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2
    return { ox: Math.round(Math.cos(a) * 135), oy: Math.round(Math.sin(a) * 135), d: (i % 5) * 0.04 }
  })
  return (
    <div aria-hidden style={{ position: 'absolute', inset: '-42% -30%', pointerEvents: 'none', zIndex: 6 }}>
      {/* Reticle lock — snaps on, HOLDS locked through the charge, snaps out on the blow. */}
      <motion.div
        initial={{ opacity: 0, scale: 1.6, rotate: -14 }}
        animate={{ opacity: [0, 0.95, 0.95, 0.95, 0], scale: [1.6, 0.98, 0.93, 0.9, 0.8], rotate: [-14, 0, 0, 0, 8] }}
        transition={{ duration: STRIKE + 0.06, times: [0, 0.28, 0.62, 0.94, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: '52%', height: '52%', marginLeft: '-26%', marginTop: '-26%' }}
      >
        {corners.map((c, i) => (
          <div key={i} style={{ position: 'absolute', width: '28%', height: '28%', ...c }} />
        ))}
      </motion.div>

      {/* Converging energy motes — pulled inward as the strike charges. */}
      {motes.map((mt, i) => (
        <motion.div key={`mote-${i}`}
          initial={{ opacity: 0, x: mt.ox, y: mt.oy }}
          animate={{ opacity: [0, 0.9, 0.9, 0], x: [mt.ox, mt.ox * 0.5, 0, 0], y: [mt.oy, mt.oy * 0.5, 0, 0] }}
          transition={{ duration: STRIKE, delay: 0.1 + mt.d, times: [0, 0.35, 0.88, 1], ease: 'easeIn' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 6, height: 6, marginLeft: -3, marginTop: -3, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}, 0 0 14px ${color}` }}
        />
      ))}

      {/* Charging telegraph ring contracting inward onto the mark. */}
      <motion.div
        initial={{ opacity: 0, scale: 2.6 }}
        animate={{ opacity: [0, 0.6, 0.85, 0], scale: [2.6, 1.4, 0.55, 0.3] }}
        transition={{ duration: STRIKE, times: [0, 0.3, 0.9, 1], ease: 'easeIn' }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 150, height: 150, marginLeft: -75, marginTop: -75, borderRadius: '50%', border: `2px dashed ${color}`, boxShadow: `0 0 14px ${color}` }}
      />

      {/* Blood-red charge core — gathers + intensifies, then tightens to a hot
          point the instant before it detonates (the wind-up). */}
      <motion.div
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.4, 0.8, 1, 0], scale: [0.3, 1.2, 0.85, 0.35, 0.15] }}
        transition={{ duration: STRIKE, times: [0, 0.4, 0.72, 0.93, 1], ease: 'easeIn' }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 160, height: 160, marginLeft: -80, marginTop: -80, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${color}ee 34%, ${color}44 60%, transparent 76%)` }}
      />

      {/* THE detonation — one massive white-to-red blast. No aftershock. */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 1, 0], scale: [0.2, 3.6, 4.6] }}
        transition={{ duration: 0.62, delay: STRIKE, ease: 'easeOut' }}
        style={{ position: 'absolute', left: '50%', top: '50%', width: 340, height: 340, marginLeft: -170, marginTop: -170, borderRadius: '50%', background: `radial-gradient(circle, #ffffff 0%, ${color}cc 32%, transparent 66%)` }}
      />

      {/* Shock rings — one big wave. */}
      {[0, 0.08, 0.16].map((d, i) => (
        <motion.div key={`ring-${i}`}
          initial={{ opacity: 0, scale: 0.2 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.2, 3.8, 4.8] }}
          transition={{ duration: 0.72, delay: STRIKE + d, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 200, height: 200, marginLeft: -100, marginTop: -100, borderRadius: '50%', border: `3px solid ${color}`, boxShadow: `0 0 20px ${color}` }}
        />
      ))}

      {/* One wide ring of fangs radiating from the blow. */}
      {fangs.map((ang, i) => (
        <motion.div key={`fang-${i}`}
          initial={{ opacity: 0, scaleY: 0.15 }}
          animate={{ opacity: [0, 1, 0], scaleY: [0.15, 1, 0.5] }}
          transition={{ duration: 0.5, delay: STRIKE + 0.02, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: '38%', marginLeft: -4, transformOrigin: '50% 0%', transform: `rotate(${ang}deg)`, background: `linear-gradient(${color}, ${color}00)`, borderRadius: 4, boxShadow: `0 0 7px ${color}` }}
        />
      ))}
    </div>
  )
}
