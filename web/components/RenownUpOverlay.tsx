'use client'

// Renown level earned — a real moment past level 100. Same visual language as
// the fishing / nav level-up (ring bursts + sparkles + big number) but gold-and-
// prismatic, with a "+N to spend" line. Fire it when a catch / raid kill /
// Gauntlet cash-out crosses one or more Renown levels (compare pre/post
// renownLevel from the same server response so it can't be faked).

import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { vibrate } from '@/lib/haptics'
import { playRenownUpSfx } from '@/lib/fishingMusic'
import type { RenownSkill } from '@/lib/renown'

export interface RenownUpInfo {
  skill: RenownSkill
  toLevel: number
  /** Points gained (levels crossed) — usually 1, but a big XP grant can span more. */
  points: number
}

interface Props {
  info: RenownUpInfo | null
  onDismiss: () => void
}

const LABEL: Record<RenownSkill, string> = { fishing: 'Fishing Renown', nav: 'Navigation Renown' }

export default function RenownUpOverlay({ info, onDismiss }: Props) {
  useEffect(() => {
    if (!info) return
    vibrate([12, 40, 18])
    playRenownUpSfx()
  }, [info])

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          key="renownup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          transition={{ duration: 0.25 }}
          onClick={onDismiss}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(60,45,10,0.94) 0%, rgba(0,0,0,0.98) 100%)',
            backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
            cursor: 'pointer', padding: '1.5rem',
          }}
        >
          {/* Ring bursts — gold + prismatic */}
          {[0, 0.12, 0.24].map((delay, i) => (
            <motion.div key={`ring-${i}`}
              initial={{ scale: 0.1, opacity: 0.85 - i * 0.2 }}
              animate={{ scale: 4.5 - i * 0.6, opacity: 0 }}
              transition={{ duration: 1.1, ease: 'easeOut', delay }}
              style={{
                position: 'absolute', width: 110, height: 110, borderRadius: '50%',
                border: `${2 - i}px solid ${i === 1 ? 'rgba(167,139,250,0.65)' : 'rgba(240,192,64,0.8)'}`,
                left: '50%', top: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none',
              }}
            />
          ))}

          {/* Sparkles */}
          {([
            { x: -60, delay: 0.08 }, { x: 60, delay: 0.14 }, { x: -30, delay: 0.22 },
            { x: 35, delay: 0.06 }, { x: 0, delay: 0.18 },
          ] as { x: number; delay: number }[]).map((s, i) => (
            <motion.span key={`sp-${i}`}
              initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
              animate={{ opacity: [0, 1, 0], y: -80 - i * 14, x: s.x * 1.4, scale: [0, 1.4, 0.4] }}
              transition={{ duration: 1.2, delay: s.delay, ease: 'easeOut' }}
              style={{ position: 'absolute', color: i % 2 === 0 ? '#f0c040' : '#a78bfa', fontSize: '0.9rem', pointerEvents: 'none' }}
            >✦</motion.span>
          ))}

          <motion.div
            initial={{ scale: 0.55, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ duration: 0.28, ease: 'easeOut', delay: 0.06 }}
            style={{ textAlign: 'center', position: 'relative', maxWidth: 320 }}
          >
            <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
               style={{ fontSize: '0.95rem', color: '#fff', marginBottom: '0.35rem', textShadow: '0 0 18px rgba(255,255,255,0.9), 0 0 48px rgba(240,192,64,0.6)' }}>
              {LABEL[info.skill]}
            </p>
            <p className="font-cinzel font-700"
               style={{ fontSize: '5rem', lineHeight: 1, color: '#f0c040', textShadow: '0 0 40px rgba(240,192,64,1), 0 0 90px rgba(240,192,64,0.5)' }}>
              {info.toLevel}
            </p>

            <motion.p
              className="font-karla font-700 uppercase tracking-[0.16em]"
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.3 }}
              style={{ marginTop: '1rem', fontSize: '0.72rem', color: '#a78bfa', textShadow: '0 0 16px rgba(167,139,250,0.5)' }}
            >
              +{info.points} point{info.points === 1 ? '' : 's'} to spend
            </motion.p>

            <motion.p
              className="font-karla font-400"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.32)', marginTop: '1rem', letterSpacing: '0.08em' }}>
              tap to continue
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
