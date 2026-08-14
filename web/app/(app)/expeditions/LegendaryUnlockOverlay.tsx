'use client'

// Fires when a chapter's gate story node is cleared and its legendary joins the
// recruit pool. A full-screen reveal — the crew surfaces on a ray-fan burst,
// name slams in, and a line tells the player they're now recruitable. One-shot,
// tap to dismiss. Themed by the legendary's class color.

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { classForSlug, CLASSES } from '@/lib/crewClasses'
import type { UnlockedLegendary } from '@/lib/legendaryUnlocks'
import { Letterbox, LivingFrame, prefersReducedMotion } from '@/components/cutscene'

const SUPA = process.env.NEXT_PUBLIC_SUPABASE_URL
const artSrc = (f: string) => `${SUPA}/storage/v1/object/public/card-arts/${f}`

export function LegendaryUnlockOverlay({ crew, onClose }: { crew: UnlockedLegendary; onClose: () => void }) {
  const cls = classForSlug(crew.slug)
  const def = cls ? CLASSES[cls] : null
  const color = def?.color ?? '#f5c542'
  const reduced = prefersReducedMotion()

  useEffect(() => {
    try { navigator.vibrate?.([0, 60, 40, 90]) } catch { /* no haptics */ }
  }, [])

  if (typeof document === 'undefined') return null

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      data-any-key
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1300, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 4, padding: 24, cursor: 'pointer', overflowY: 'auto',
        background: 'radial-gradient(ellipse at center, rgba(10,14,24,0.92) 0%, rgba(4,6,12,0.98) 70%)',
        backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
      }}
    >
      {/* Same cinematic frame as the story/boss scenes — drifting motes, a
          breathing vignette, and letterbox bars — so the reveal reads as part
          of the same film. */}
      <LivingFrame accent={color} reduced={reduced} />
      <Letterbox />

      {/* Ray-fan burst behind the portrait */}
      <motion.div
        initial={{ scale: 0.4, opacity: 0, rotate: 0 }}
        animate={{ scale: 1.1, opacity: 0.5, rotate: 40 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        style={{
          position: 'absolute', width: 520, height: 520, borderRadius: '50%', pointerEvents: 'none',
          backgroundImage: `repeating-conic-gradient(${color}30 0deg 7deg, transparent 7deg 18deg)`,
          maskImage: 'radial-gradient(circle, black 30%, transparent 68%)',
          WebkitMaskImage: 'radial-gradient(circle, black 30%, transparent 68%)',
        }}
      />

      <motion.p
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}
        className="font-karla font-800 uppercase" style={{ position: 'relative', fontSize: '0.7rem', letterSpacing: '0.24em', color }}
      >
        Legendary Unlocked
      </motion.p>

      {/* Crew portrait */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 14 }} animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
        style={{ position: 'relative', width: 'min(52vw, 200px)', aspectRatio: '3 / 4', flexShrink: 0 }}
      >
        {crew.filename ? (
          <img src={artSrc(crew.filename)} alt={crew.name}
            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 12px 30px ${color}88)` }} />
        ) : (
          <div style={{ width: '100%', height: '100%', borderRadius: 16, border: `2px solid ${color}66`, background: `${color}14` }} />
        )}
      </motion.div>

      <motion.h2
        initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.28, type: 'spring', stiffness: 300, damping: 18 }}
        className="font-pirata" style={{ position: 'relative', fontSize: '2.4rem', lineHeight: 1, color: '#f0ede8', textShadow: `0 0 22px ${color}aa` }}
      >
        {crew.name}
      </motion.h2>

      {/* Signature ability — clearly labeled as THEIR ability, with the class + effect. */}
      {def && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42, duration: 0.4 }}
          style={{ position: 'relative', marginTop: 10, maxWidth: 360, padding: '11px 15px', border: `1px solid ${color}55`, borderRadius: 14, background: `${color}14`, textAlign: 'center' }}
        >
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.2em', color, marginBottom: 4 }}>
            Signature Ability
          </p>
          <p className="font-pirata" style={{ fontSize: '1.2rem', lineHeight: 1.1, color: '#f0ede8', marginBottom: 5 }}>
            {def.name} <span style={{ color, fontSize: '0.82rem' }}>· {def.shortLabel}</span>
          </p>
          <p className="font-karla" style={{ fontSize: '0.82rem', lineHeight: 1.4, color: 'rgba(240,237,232,0.85)' }}>
            {def.blurb}
          </p>
        </motion.div>
      )}

      {/* Recruit callout — crystal clear that they are RECRUITABLE, not auto-added. */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.62, duration: 0.4 }}
        style={{ position: 'relative', marginTop: 14, maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}
      >
        <span className="font-karla font-800 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.16em', color: '#0a0e18', background: color, padding: '3px 11px', borderRadius: 999 }}>
          Now Recruitable
        </span>
        <p className="font-karla font-700" style={{ fontSize: '0.98rem', color: '#f0ede8', textAlign: 'center', lineHeight: 1.25 }}>
          {crew.name} can now be recruited in the Crew Hall.
        </p>
        <p className="font-karla" style={{ fontSize: '0.78rem', color: 'rgba(240,237,232,0.6)', textAlign: 'center', lineHeight: 1.35 }}>
          They won't join on their own. Sign them on from the recruit board.
        </p>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} transition={{ delay: 1.1, duration: 0.5 }}
        className="font-karla" style={{ position: 'relative', marginTop: 18, fontSize: '0.72rem', color: 'rgba(240,237,232,0.5)' }}
      >
        Tap to continue
      </motion.p>
    </motion.div>,
    document.body,
  )
}
