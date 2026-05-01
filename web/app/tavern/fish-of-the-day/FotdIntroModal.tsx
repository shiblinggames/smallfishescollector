'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markFotdIntroSeen } from './fotdIntroAction'

const STEPS = [
  { color: '#4ade80', label: 'Mystery Fish',   desc: 'A new secret fish is chosen every day. Your job is to figure out which one it is.' },
  { color: '#f0c040', label: 'Four Clues',     desc: 'You start with one clue. Each wrong guess reveals the next clue, up to four total.' },
  { color: '#60a5fa', label: 'Four Guesses',   desc: 'You get four guesses. Type a fish name and pick from the list — no free-typing.' },
  { color: '#a78bfa', label: 'Gem Rewards',    desc: 'Guess right on the 1st try → 100 ◆ · 2nd → 75 ◆ · 3rd → 50 ◆ · 4th → 25 ◆' },
  { color: '#fb923c', label: 'Daily Reset',    desc: 'A new fish drops every day. Come back tomorrow for another shot at gems.' },
]

export default function FotdIntroModal() {
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  function handleClose() {
    startTransition(async () => {
      await markFotdIntroSeen()
      setVisible(false)
    })
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
            overflowY: 'auto',
          }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              background: '#100e0c',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: '1.25rem',
              maxWidth: 400,
              width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
              margin: 'auto',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ padding: '1.75rem 1.75rem 0' }}>
              <p className="sg-eyebrow text-[#9a9488] mb-1">How to Play</p>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.35rem', lineHeight: 1.2, marginBottom: '0.5rem' }}>
                Fish of the Day
              </h2>
              <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                A mystery fish is chosen each day. Use the clues to figure out which one it is before your guesses run out.
              </p>
            </div>

            {/* Steps */}
            <div style={{ padding: '0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.4rem' }}>
              {STEPS.map(s => (
                <div key={s.label} style={{
                  display: 'flex', alignItems: 'baseline', gap: '0.6rem',
                  background: 'rgba(8,8,6,0.82)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '0.6rem',
                  padding: '0.5rem 0.85rem',
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, flexShrink: 0, marginTop: 3 }} />
                  <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: s.color, whiteSpace: 'nowrap' }}>{s.label}</span>
                  <span className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#5a5856', lineHeight: 1.4 }}>{s.desc}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div style={{ padding: '0 1.75rem 1.75rem' }}>
              <button onClick={handleClose} className="btn-ghost w-full">
                Got it — Let&apos;s Play
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
