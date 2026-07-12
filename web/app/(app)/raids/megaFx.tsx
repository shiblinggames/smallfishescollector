'use client'

// Combat impact/weapon FX, shared between the live raid engine (RaidCombat) and
// the ultimate-weapon build previews (UltimatePreview). Extracted verbatim from
// RaidCombat so a preview shows the EXACT animation that plays in a real fight —
// change it here and both surfaces update together. All are pure presentational
// components: framer-motion overlays positioned absolutely over the battle stage,
// keyed to remount fresh on each shot.

import { useMemo } from 'react'
import { motion } from 'framer-motion'

export function CannonShotBurst({ kind, dir = 'right' }: { kind: 'normal' | 'volley' | 'crit'; dir?: 'left' | 'right' }) {
  // Muzzle flash off the gun deck: a hot bloom + a cone of sparks/smoke fired
  // in the shot direction (right = player firing at the enemy, left = enemy
  // firing back). No emoji — matches the particle impact on the receiving hull.
  const big = kind === 'crit'
  const volley = kind === 'volley'
  const sign = dir === 'right' ? 1 : -1
  const count = big ? 13 : volley ? 9 : 6
  const reach = big ? 44 : volley ? 34 : 26
  const sparks = useMemo(() => Array.from({ length: count }, (_, n) => {
    const ang = (Math.random() - 0.5) * 0.95          // forward cone
    const dist = reach * (0.55 + Math.random() * 0.75)
    return {
      x: sign * Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 3,
      size: (big ? 4.5 : 3.6) * (0.6 + Math.random() * 0.7),
      color: Math.random() < 0.5 ? '#ffd27a' : '#ff9a3c',
      dur: 0.32 + Math.random() * 0.2,
    }
  }), [count, reach, sign])
  // Muzzle sits at the firing edge of the hull.
  const left = dir === 'right' ? '82%' : '18%'
  return (
    <div style={{ position: 'absolute', left, top: '42%', width: 0, height: 0, pointerEvents: 'none', zIndex: 10 }}>
      <motion.div
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: big ? 1.5 : 1.1, opacity: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: big ? 40 : 28, height: big ? 40 : 28,
          marginLeft: big ? -20 : -14, marginTop: big ? -20 : -14, borderRadius: '50%',
          background: 'radial-gradient(circle, #fff 0%, rgba(255,200,120,0.9) 40%, transparent 72%)',
        }}
      />
      {sparks.map((s, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: s.x, y: s.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: s.dur, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, top: 0, width: s.size, height: s.size,
            marginLeft: -s.size / 2, marginTop: -s.size / 2, borderRadius: '50%',
            background: s.color, boxShadow: `0 0 5px ${s.color}`,
          }}
        />
      ))}
    </div>
  )
}

export function ImpactBurst({ kind }: { kind: 'normal' | 'volley' | 'crit' }) {
  // Cannonball striking the hull: a hot flash, an expanding shockwave ring,
  // and a spray of debris/splinter particles thrown outward — no emoji. Scales
  // up for volley, erupts for crit (more + faster particles, gold shockwave).
  const big = kind === 'crit'
  const volley = kind === 'volley'
  const count = big ? 16 : volley ? 11 : 7
  const spread = big ? 40 : volley ? 30 : 22
  // Deterministic-per-mount spray (component remounts on each impact key).
  const bits = useMemo(() => Array.from({ length: count }, (_, n) => {
    const ang = (Math.PI * 2 * n) / count + (Math.random() - 0.5) * 0.7
    const dist = spread * (0.55 + Math.random() * 0.8)
    const warm = Math.random() < 0.6
    return {
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 5,                   // bias upward (kicked-up debris)
      size: (big ? 5.5 : 4.5) * (0.55 + Math.random() * 0.7),
      color: warm ? (Math.random() < 0.5 ? '#ffd27a' : '#ff9a3c') : '#cbb591',
      dur: 0.42 + Math.random() * 0.22,
    }
  }), [count, spread, big])
  const flashColor = big ? 'rgba(251,191,36,0.9)' : 'rgba(255,210,140,0.85)'
  return (
    <div style={{ position: 'absolute', left: '46%', top: '46%', width: 0, height: 0, pointerEvents: 'none', zIndex: 10 }}>
      {/* Hot core flash */}
      <motion.div
        initial={{ scale: 0.3, opacity: 1 }}
        animate={{ scale: big ? 1.6 : 1.1, opacity: 0 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: big ? 52 : 38, height: big ? 52 : 38,
          marginLeft: big ? -26 : -19, marginTop: big ? -26 : -19, borderRadius: '50%',
          background: `radial-gradient(circle, #fff 0%, ${flashColor} 40%, transparent 72%)`,
        }}
      />
      {/* Shockwave ring */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0.85 }}
        animate={{ scale: big ? 2.8 : volley ? 2.1 : 1.7, opacity: 0 }}
        transition={{ duration: big ? 0.55 : 0.45, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: 60, height: 60, marginLeft: -30, marginTop: -30,
          borderRadius: '50%',
          border: `${big ? 3 : 2}px solid ${big ? 'rgba(251,191,36,0.85)' : 'rgba(255,200,130,0.7)'}`,
          boxShadow: big ? '0 0 26px rgba(251,191,36,0.6)' : '0 0 14px rgba(255,190,120,0.4)',
        }}
      />
      {/* Smoke puff (dust) */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0.4 }}
        animate={{ scale: big ? 2.2 : 1.6, opacity: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        style={{
          position: 'absolute', left: 0, top: 0, width: 50, height: 50, marginLeft: -25, marginTop: -25,
          borderRadius: '50%', background: 'radial-gradient(circle, rgba(120,120,128,0.5) 0%, rgba(90,90,100,0.2) 50%, transparent 72%)',
        }}
      />
      {/* Debris spray */}
      {bits.map((b, n) => (
        <motion.div
          key={n}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: b.x, y: b.y, opacity: 0, scale: 0.35 }}
          transition={{ duration: b.dur, ease: 'easeOut' }}
          style={{
            position: 'absolute', left: 0, top: 0, width: b.size, height: b.size,
            marginLeft: -b.size / 2, marginTop: -b.size / 2, borderRadius: '50%',
            background: b.color, boxShadow: `0 0 5px ${b.color}`,
          }}
        />
      ))}
    </div>
  )
}

// Railgun: a Pokémon-style HYPER BEAM — a charge orb at the player's guns, then a
// thick white-hot beam erupts into the enemy hull, held, then fades. Geometry is
// measured from the real ship boxes (muzzle -> enemy hull) and passed in as pixels
// + degrees, so the beam always connects the two ships.
export function RailgunBeam({ color, x1, y1, len, angle }: { color: string; x1: number; y1: number; len: number; angle: number }) {
  const rad = angle * Math.PI / 180
  const ex = x1 + Math.cos(rad) * len
  const ey = y1 + Math.sin(rad) * len
  return (
    <>
      {/* Muzzle spark — a small, soft flare as the lance leaves the gun. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1.2, 0.6] }}
        transition={{ duration: 0.5, times: [0, 0.3, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: '50%', zIndex: 21, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 50%, transparent 74%)`, boxShadow: `0 0 18px 5px ${color}` }} />
      {/* Outer glow — a thin halo hugging the lance. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 0.7, 0.6, 0], scaleX: [0, 1, 1, 1] }}
        transition={{ duration: 0.7, times: [0, 0.12, 0.6, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 9, width: len, height: 18, transformOrigin: 'left center', rotate: angle, borderRadius: 10, zIndex: 19, pointerEvents: 'none', background: `${color}66`, filter: 'blur(5px)' }} />
      {/* Core lance — slim, white-hot, crisp. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 1, 1, 0.95, 0], scaleX: [0, 1, 1, 1, 1] }}
        transition={{ duration: 0.7, times: [0, 0.1, 0.55, 0.8, 1], ease: 'easeOut' }}
        style={{
          position: 'absolute', left: x1, top: y1 - 5, width: len, height: 10,
          transformOrigin: 'left center', rotate: angle, borderRadius: 6, zIndex: 20, pointerEvents: 'none',
          background: `linear-gradient(90deg, ${color} 0%, #ffffff 28%, #ffffff 86%, ${color} 100%)`,
          boxShadow: `0 0 12px 2px ${color}, 0 0 30px 6px ${color}aa`,
        }} />
      {/* Inner spine — a bright hairline down the center. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: [0, 1, 1, 0], scaleX: [0, 1, 1, 1] }}
        transition={{ duration: 0.66, times: [0, 0.1, 0.62, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 2, width: len, height: 4, transformOrigin: 'left center', rotate: angle, borderRadius: 3, zIndex: 21, pointerEvents: 'none', background: '#ffffff', boxShadow: '0 0 10px 2px #ffffff' }} />
      {/* Impact glow at the hull — a soft burn where the lance lands. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.4, 1.3, 0.8] }}
        transition={{ duration: 0.6, delay: 0.06, times: [0, 0.35, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: ex, top: ey, width: 48, height: 48, marginLeft: -24, marginTop: -24, borderRadius: '50%', zIndex: 21, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 48%, transparent 72%)`, boxShadow: `0 0 24px 7px ${color}` }} />
    </>
  )
}

// Nuke silo launch — a missile blasts off the player's deck, arcs up and over,
// then accelerates down onto the enemy. Launch plume stays at the deck; the
// missile + exhaust ride a moving wrapper along a parabola to the target.
export function NukeMissile({ color, x1, y1, x2, y2, dur }: { color: string; x1: number; y1: number; x2: number; y2: number; dur: number }) {
  const dx = x2 - x1, dy = y2 - y1
  // Apex well above both ends so it reads as a true lob, not a straight shot.
  const apexY = Math.min(0, dy) - 120
  const d = dur / 1000
  return (
    <>
      {/* Launch plume — fire + smoke blasting off the deck as it lifts. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{ opacity: [0, 0.95, 0.5, 0], scale: [0.4, 1.5, 2.1, 2.6] }}
        transition={{ duration: 0.7, times: [0, 0.2, 0.6, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 + 6, width: 60, height: 60, marginLeft: -30, marginTop: -22, borderRadius: '50%', zIndex: 17, pointerEvents: 'none', background: `radial-gradient(circle, #ffffff 0%, ${color} 38%, rgba(60,40,30,0.45) 66%, transparent 80%)`, filter: 'blur(2px)' }} />
      {/* Lift-off smoke column rising off the launch point. */}
      <motion.div aria-hidden
        initial={{ opacity: 0, scaleY: 0.3 }}
        animate={{ opacity: [0, 0.5, 0], scaleY: [0.3, 1, 1.2] }}
        transition={{ duration: 0.9, times: [0, 0.3, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1 - 26, width: 22, height: 56, marginLeft: -11, borderRadius: 12, transformOrigin: 'bottom center', zIndex: 16, pointerEvents: 'none', background: 'linear-gradient(0deg, rgba(70,50,40,0.55), rgba(120,120,120,0.25) 60%, transparent)', filter: 'blur(3px)' }} />
      {/* Ignition flash — a hard white pop at the instant of lift-off. */}
      <motion.div aria-hidden
        initial={{ opacity: 0.95, scale: 0.3 }}
        animate={{ opacity: 0, scale: 1.9 }}
        transition={{ duration: 0.26, ease: 'easeOut' }}
        style={{ position: 'absolute', left: x1, top: y1, width: 46, height: 46, marginLeft: -23, marginTop: -23, borderRadius: '50%', zIndex: 18, pointerEvents: 'none', background: 'radial-gradient(circle, #ffffff 0%, #ffe6b0 55%, transparent 78%)' }} />
      {/* Missile + trail — moving wrapper. Horizontal speed is constant and the
          vertical rides a gravity curve, so there's no hitch at the apex. */}
      <motion.div aria-hidden
        initial={{ x: 0, y: 0, rotate: -50, opacity: 0 }}
        animate={{ x: [0, dx], y: [0, apexY, dy], rotate: [-50, 2, 54], opacity: [0, 1, 1, 0] }}
        transition={{
          duration: d,
          x: { ease: 'linear' },
          y: { ease: ['easeOut', 'easeIn'], times: [0, 0.42, 1] },
          rotate: { ease: 'easeInOut', times: [0, 0.42, 1] },
          opacity: { times: [0, 0.08, 0.9, 1], ease: 'linear' },
        }}
        style={{ position: 'absolute', left: x1, top: y1, zIndex: 18, pointerEvents: 'none' }}
      >
        {/* Fiery trail — a tapering flame streak behind the cannonball. */}
        <motion.div aria-hidden
          animate={{ opacity: [0.6, 1, 0.8], scaleX: [0.88, 1, 0.9] }}
          transition={{ duration: 0.16, repeat: Infinity, repeatType: 'mirror' }}
          style={{ position: 'absolute', left: -52, top: -5, width: 46, height: 10, transformOrigin: 'right center', borderRadius: 6, background: `linear-gradient(90deg, transparent 0%, ${color}77 42%, ${color} 76%, #ffe6b0 100%)`, filter: 'blur(2.5px)' }} />
        {/* Cannonball — a heavy iron sphere, hot-rimmed from the launch. */}
        <div style={{ position: 'absolute', left: -10, top: -10, width: 20, height: 20, borderRadius: '50%', background: 'radial-gradient(circle at 34% 28%, #8b96a3 0%, #49525f 36%, #232a31 68%, #0d1014 100%)', boxShadow: `0 0 12px 2px ${color}, inset -2px -2px 5px rgba(0,0,0,0.65)` }} />
      </motion.div>
    </>
  )
}

// Nuke: a big, slow detonation — white flash, blooming fireball, staggered
// shock rings, flung embers, and lingering smoke. Heavier and slower than a crit.
export function NukeBlast({ color }: { color: string }) {
  // Deterministic ember spray (no RNG) so it's stable across renders.
  const embers = useMemo(() => Array.from({ length: 11 }, (_, n) => {
    const ang = (n / 11) * Math.PI * 2 + (n % 2 ? 0.35 : 0)
    const dist = 54 + (n % 4) * 24
    return {
      id: n,
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist - 8,           // bias upward, like flung debris
      size: 3 + (n % 3) * 2,
      dur: 0.66 + (n % 4) * 0.12,
      delay: 0.05 + (n % 3) * 0.05,
    }
  }), [])
  return (
    <>
      {/* White flash core — a hard, snappy punch at the instant of detonation. */}
      <motion.div aria-hidden initial={{ scale: 0.2, opacity: 1 }} animate={{ scale: [0.2, 1.4, 2.9], opacity: [1, 1, 0] }} transition={{ duration: 0.3, times: [0, 0.4, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '2%', borderRadius: '50%', pointerEvents: 'none', zIndex: 8, background: 'radial-gradient(circle, #ffffff 0%, #fff4d6 52%, transparent 74%)' }} />
      {/* Fireball — blooms big and slow, white-hot fading to the augment color. */}
      <motion.div aria-hidden initial={{ scale: 0.2, opacity: 0 }} animate={{ scale: [0.2, 2.4, 3.6], opacity: [0, 1, 0] }} transition={{ duration: 0.95, times: [0, 0.35, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '-6%', borderRadius: '50%', pointerEvents: 'none', zIndex: 7, background: `radial-gradient(circle, #ffffff 0%, #ffd27a 30%, ${color} 58%, transparent 74%)` }} />
      {/* First shock ring. */}
      <motion.div aria-hidden initial={{ scale: 0.3, opacity: 0.95 }} animate={{ scale: 3.2, opacity: 0 }} transition={{ duration: 0.7, delay: 0.04, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '20%', borderRadius: '50%', border: `4px solid ${color}`, boxShadow: `0 0 34px ${color}`, pointerEvents: 'none', zIndex: 7 }} />
      {/* Second shock ring — wider, slower, trails the first. */}
      <motion.div aria-hidden initial={{ scale: 0.4, opacity: 0.7 }} animate={{ scale: 4.4, opacity: 0 }} transition={{ duration: 0.98, delay: 0.14, ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '24%', borderRadius: '50%', border: `2px solid ${color}aa`, pointerEvents: 'none', zIndex: 7 }} />
      {/* Flung embers. */}
      {embers.map(e => (
        <motion.div key={e.id} aria-hidden
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: e.x, y: e.y, opacity: 0, scale: 0.4 }}
          transition={{ duration: e.dur, delay: e.delay, ease: 'easeOut' }}
          style={{ position: 'absolute', left: '50%', top: '46%', width: e.size, height: e.size, marginLeft: -e.size / 2, marginTop: -e.size / 2, borderRadius: '50%', background: '#ffd27a', boxShadow: `0 0 8px 2px ${color}`, pointerEvents: 'none', zIndex: 8 }} />
      ))}
      {/* Lingering smoke — dark billow that swells and fades last. */}
      <motion.div aria-hidden initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: [0.6, 2.0, 2.8], opacity: [0, 0.5, 0] }} transition={{ duration: 1.15, times: [0, 0.4, 1], ease: 'easeOut' }}
        style={{ position: 'absolute', inset: '6%', borderRadius: '50%', pointerEvents: 'none', zIndex: 6, background: 'radial-gradient(circle, rgba(40,20,15,0.7) 0%, rgba(30,15,12,0.4) 45%, transparent 72%)' }} />
    </>
  )
}

// Barrage: four falling damage numbers, first biggest, staggered.
export function MegaSplats({ color, items }: { color: string; items: { id: number; text: string; size: number; dx: number; dy: number; delay: number }[] }) {
  return (
    <>
      {items.map(it => (
        // Outer wrapper owns the static horizontal centering so the inner
        // motion transform (y/scale) doesn't clobber it.
        <div key={it.id} aria-hidden style={{ position: 'absolute', left: `calc(50% + ${it.dx}px)`, top: '34%', transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 8 }}>
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.6 }}
            animate={{ opacity: [0, 1, 1, 0], y: [6, -8 + it.dy, -22 + it.dy], scale: [0.6, it.size, it.size] }}
            transition={{ duration: 0.72, delay: it.delay, times: [0, 0.25, 0.72, 1], ease: 'easeOut' }}
            className="font-cinzel font-800"
            style={{ fontSize: `${0.9 * it.size}rem`, color, textShadow: `0 0 10px ${color}, 0 1px 3px rgba(0,0,0,0.85)`, lineHeight: 1, whiteSpace: 'nowrap' }}
          >
            {it.text}
          </motion.div>
        </div>
      ))}
    </>
  )
}
