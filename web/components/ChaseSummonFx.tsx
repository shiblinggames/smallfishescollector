'use client'

// Bespoke, per-chase-skin SUMMON choreography for the raid crew-ability summon.
// Where ChaseSkinFx is a decorative OVERLAY layered on the shared conjure, this
// owns the whole center stage for a chase skin: its own entrance for the crew
// art plus the signature FX that brings them in. AbilitySummonFx delegates the
// center block to <ChaseSummonStage> whenever hasChaseSummon(skinId) is true,
// and hides its shared rune-ring/light-ray conjure so each chase skin reads as a
// completely different attack — not the same summon in a different colour.
//
// One-shot only: every animation here is a single ~0.6s entrance pass driven by
// framer keyframes (no infinite loops, no blend modes) so it stays cheap on the
// combat frame budget. The outer AbilitySummonFx wrapper owns the master
// fade-in/out, so pieces below hold a steady end value rather than fading
// themselves — only transient STRIKE flashes animate their own opacity.

import { motion } from 'framer-motion'
import { ChaseSkinFx } from './ChaseSkinFx'

// Skins that have a bespoke summon built. Add an id here + a case below to give
// another chase skin its own attack. Anything not listed falls back to the
// shared conjure in AbilitySummonFx.
const CHASE_SUMMON_IDS = new Set<string>(['mako_tempest'])

export function hasChaseSummon(skinId: string | null | undefined): boolean {
  return !!skinId && CHASE_SUMMON_IDS.has(skinId)
}

// Shared crew-art render — same sizing/glow AbilitySummonFx uses for a chase
// skin, so only the ENTRANCE motion (owned by each stage) differs.
function crewGlow(color: string): string {
  return `drop-shadow(0 0 34px ${color}) drop-shadow(0 0 80px ${color}) drop-shadow(0 0 130px ${color}66) drop-shadow(0 12px 32px rgba(0,0,0,0.7))`
}

/** Tempest (Mako) — a lightning strike. The screen storms and charges, a jagged
 *  bolt cracks down onto the mark, a white flash detonates, and Mako flickers
 *  into being on the strike, jittering with electric charge before she settles. */
function TempestSummon({ color, image, name }: { color: string; image: string | null; name: string }) {
  // Jagged bolt paths in a 0..100 box (stretched full-screen). Strokes use
  // vectorEffect non-scaling-stroke so the stretch doesn't distort their width.
  // Main bolt spears from the top down to ~the crew's head (y≈42); two forks
  // branch off it.
  const bolts = [
    'M50,0 L46,11 L54,22 L45,32 L52,42',
    'M45,32 L37,37 L40,46',
    'M54,22 L61,27 L57,36',
  ]
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', width: '100%' }}>
      {/* Storm charge behind everything — gathers, pulses on the pre-strike, then
          holds a moody blue haze the master wrapper fades out with. */}
      <motion.div aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.35, 0.18, 0.55, 0.4] }}
        transition={{ duration: 0.7, times: [0, 0.18, 0.32, 0.46, 1], ease: 'easeOut' }}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(ellipse 85% 72% at 50% 42%, ${color}30 0%, rgba(2,7,18,0.72) 62%)` }} />

      {/* Full-screen detonation flash at the moment of impact. */}
      <motion.div aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 0.95, 0, 0.32, 0] }}
        transition={{ duration: 0.5, times: [0, 0.22, 0.3, 0.44, 0.5, 1], ease: 'easeOut' }}
        style={{ position: 'fixed', inset: 0, pointerEvents: 'none',
          background: `radial-gradient(circle at 50% 44%, #ffffff 0%, ${color}cc 26%, ${color}44 46%, transparent 68%)` }} />

      {/* The bolt — a wide soft-blue glow stroke under a bright white core, drawn
          top-to-mark in a fast crack, then gone. Two quick re-strikes (opacity
          keyframes) sell the flicker. */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden
        style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <motion.g
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.2, 0.9, 0] }}
          transition={{ duration: 0.6, times: [0, 0.24, 0.4, 0.5, 1], ease: 'easeOut' }}
        >
          {bolts.map((d, i) => (
            <g key={i}>
              <motion.path d={d} fill="none" stroke={color} strokeWidth={i === 0 ? 7 : 4}
                strokeLinecap="round" strokeLinejoin="round" opacity={0.5}
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.1, delay: 0.12 + i * 0.02, ease: 'easeIn' }} />
              <motion.path d={d} fill="none" stroke="#ffffff" strokeWidth={i === 0 ? 2 : 1.2}
                strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                transition={{ duration: 0.1, delay: 0.12 + i * 0.02, ease: 'easeIn' }} />
            </g>
          ))}
        </motion.g>
      </svg>

      {/* Mako — flickers into being ON the strike (opacity stutter), overshoots
          in, then a brief electric jitter before she settles. Ambient sparks
          (ChaseSkinFx summon overlay) crackle behind her through the hold. */}
      <motion.div
        initial={{ x: 0 }}
        animate={{ x: [0, 0, -3, 3, -1.5, 1, 0], rotate: [0, 0, -0.5, 0.5, -0.25, 0.15, 0] }}
        transition={{ duration: 0.7, times: [0, 0.2, 0.28, 0.36, 0.46, 0.58, 0.72], ease: 'linear' }}
        style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 1.18 }}
          animate={{ opacity: [0, 0, 1, 0.25, 1, 0.7, 1], scale: [1.18, 1.18, 1.03, 1, 1, 1, 1] }}
          transition={{ duration: 0.62, times: [0, 0.2, 0.26, 0.33, 0.42, 0.52, 0.64], ease: 'easeOut' }}
          style={{ position: 'relative', display: 'inline-block' }}
        >
          {image ? (
            <>
              <ChaseSkinFx skinId="mako_tempest" color={color} variant="summon" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image} alt={name} decoding="async" loading="eager"
                style={{ position: 'relative', zIndex: 1, height: 'min(50vh, 300px)', width: 'auto', maxWidth: '82vw', display: 'block', willChange: 'transform', filter: crewGlow(color) }} />
            </>
          ) : null}
        </motion.div>
      </motion.div>
    </div>
  )
}

/** The bespoke center stage for a chase skin's summon. Only rendered when
 *  hasChaseSummon(skinId) is true; returns the crew art + its signature attack
 *  entrance, sitting where AbilitySummonFx's shared character block would. */
export function ChaseSummonStage({ skinId, color, image, name }: { skinId: string | null | undefined; color: string; image: string | null; name: string }) {
  switch (skinId) {
    case 'mako_tempest': return <TempestSummon color={color} image={image} name={name} />
    default: return null
  }
}
