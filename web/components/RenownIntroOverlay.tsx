'use client'

// One-time grand celebration for reaching LEVEL 100 (Fishing or Navigation) —
// the pinnacle of the normal level track — that also introduces Renown. Fires
// once per skill: on the live crossing to 100, or on the next visit for players
// already maxed (gated by profiles.seen_*_renown_intro). Bigger and slower than
// the per-level RenownUpOverlay: this is the "you did it" moment.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { playRenownUpSfx } from '@/lib/fishingMusic'
import type { RenownSkill } from '@/lib/renown'

interface Props {
  open: boolean
  skill: RenownSkill
  onDismiss: () => void
}

const COPY: Record<RenownSkill, { track: string; earn: string }> = {
  fishing: {
    track: 'Fishing Renown',
    earn: 'Every catch beyond this point earns Renown — bank the points, then spend them on permanent boosts to your angling.',
  },
  nav: {
    track: 'Navigation Renown',
    earn: 'Every raid and voyage beyond this point earns Renown — bank the points, then spend them on permanent boosts to your captaincy.',
  },
}

// Hold the moment: taps are ignored until the burst + Renown reveal have played,
// so a reflexive tap can't skip the "you did it" beat instantly.
const DISMISS_LOCK_MS = 1900

export default function RenownIntroOverlay({ open, skill, onDismiss }: Props) {
  const copy = COPY[skill]
  const [canDismiss, setCanDismiss] = useState(false)

  useEffect(() => {
    if (!open) return
    setCanDismiss(false)
    vibrate([0, 30, 60, 40, 90, 55])
    playRenownUpSfx()
    const t = setTimeout(() => setCanDismiss(true), DISMISS_LOCK_MS)
    return () => clearTimeout(t)
  }, [open])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="renown-intro"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.35 } }}
          transition={{ duration: 0.3 }}
          data-any-key
          onClick={() => { if (canDismiss) onDismiss() }}
          style={{
            position: 'fixed', inset: 0, zIndex: 95,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse 85% 70% at 50% 45%, rgba(70,52,12,0.96) 0%, rgba(0,0,0,0.99) 100%)',
            backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
            cursor: canDismiss ? 'pointer' : 'default', padding: '1.5rem',
          }}
        >
          {/* Ring bursts — larger + one extra ring vs the per-level overlay. */}
          {[0, 0.1, 0.2, 0.32].map((delay, i) => (
            <motion.div key={`ring-${i}`}
              initial={{ scale: 0.1, opacity: 0.9 - i * 0.18 }}
              animate={{ scale: 5.4 - i * 0.6, opacity: 0 }}
              transition={{ duration: 1.35, ease: 'easeOut', delay }}
              style={{
                position: 'absolute', width: 120, height: 120, borderRadius: '50%',
                border: `${2 - Math.min(1, i)}px solid ${i % 2 === 0 ? 'rgba(240,192,64,0.85)' : 'rgba(167,139,250,0.6)'}`,
                left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
              }}
            />
          ))}

          {/* Sparkles */}
          {([
            { x: -70, delay: 0.06 }, { x: 70, delay: 0.12 }, { x: -40, delay: 0.2 },
            { x: 45, delay: 0.04 }, { x: 0, delay: 0.16 }, { x: -12, delay: 0.26 }, { x: 24, delay: 0.3 },
          ] as { x: number; delay: number }[]).map((s, i) => (
            <motion.span key={`sp-${i}`}
              initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
              animate={{ opacity: [0, 1, 0], y: -95 - i * 13, x: s.x * 1.5, scale: [0, 1.5, 0.4] }}
              transition={{ duration: 1.4, delay: s.delay, ease: 'easeOut' }}
              style={{ position: 'absolute', color: i % 2 === 0 ? '#f0c040' : '#a78bfa', fontSize: '1rem', pointerEvents: 'none' }}
            >✦</motion.span>
          ))}

          <motion.div
            initial={{ scale: 0.5, y: 22, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.34, ease: 'easeOut', delay: 0.08 }}
            style={{ textAlign: 'center', position: 'relative', maxWidth: 340 }}
          >
            <motion.p
              className="font-karla font-700 uppercase tracking-[0.35em]"
              initial={{ opacity: 0, letterSpacing: '0.6em' }}
              animate={{ opacity: 1, letterSpacing: '0.35em' }}
              transition={{ delay: 0.18, duration: 0.5 }}
              style={{ fontSize: '0.7rem', color: '#f0c040', marginBottom: '0.4rem', textShadow: '0 0 22px rgba(240,192,64,0.7)' }}
            >
              Max Level
            </motion.p>
            <p className="font-cinzel font-700"
               style={{ fontSize: '5.6rem', lineHeight: 1, color: '#f7e6b0', textShadow: '0 0 46px rgba(240,192,64,1), 0 0 110px rgba(240,192,64,0.55)' }}>
              100
            </p>

            {/* Renown unlock — the introduction. */}
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.4 }}
              style={{ marginTop: '1.4rem' }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.16em]"
                 style={{ fontSize: '1rem', color: '#a78bfa', textShadow: '0 0 20px rgba(167,139,250,0.6)' }}>
                ✦ {copy.track} Unlocked
              </p>
              <p className="font-karla font-400"
                 style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.72)', marginTop: '0.6rem', lineHeight: 1.5 }}>
                {copy.earn}
              </p>
            </motion.div>

            {/* Only invites a tap once dismissal is actually unlocked, so the
                prompt never appears before the moment has landed. */}
            <AnimatePresence>
              {canDismiss && (
                <motion.p
                  className="font-karla font-400"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }}
                  style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.34)', marginTop: '1.5rem', letterSpacing: '0.08em' }}>
                  tap to continue
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
