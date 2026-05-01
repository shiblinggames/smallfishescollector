'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { claimWelcomePack } from './welcomeActions'

const SECTIONS = [
  { color: '#c8a870', label: 'Recruit Crew',   desc: 'Use Crew Notices to recruit new fish card crew members. This is your starting point!' },
  { color: '#f0c040', label: 'Daily Bonus',     desc: 'Claim free gems and worms every single day.' },
  { color: '#4ade80', label: 'Fish of the Day', desc: 'Guess the mystery fish using clues and earn doubloons.' },
  { color: '#fb923c', label: 'Weekly Bounty',   desc: 'Catch specific fish each week for special loot and packs.' },
  { color: '#60a5fa', label: 'Crown & Anchor',  desc: 'Classic dice game — pick a symbol and wager your doubloons.' },
  { color: '#a78bfa', label: 'Fish Slots',      desc: 'Match three fish symbols to multiply your wager.' },
]

export default function WelcomeModal() {
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  function handleClose() {
    startTransition(async () => {
      await claimWelcomePack()
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
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
              margin: 'auto',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Hero */}
            <div style={{ position: 'relative', height: 160, overflow: 'hidden' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/bartender.jpeg"
                alt=""
                aria-hidden
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
              />
              <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(16,14,12,0.95) 100%)',
              }} />
              <div style={{ position: 'absolute', bottom: '1rem', left: '1.75rem' }}>
                <p className="sg-eyebrow text-[#9a9488] mb-1">Welcome to</p>
                <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.4rem', lineHeight: 1.15 }}>
                  Small Fishes
                </h2>
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '1.25rem 1.75rem 1.75rem' }}>
              <p className="font-karla font-400 text-[#6a6764]" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '1.1rem' }}>
                You&apos;re in the Tavern — your home base. Here&apos;s what you can do here:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.4rem' }}>
                {SECTIONS.map(s => (
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

              <button onClick={handleClose} className="btn-ghost w-full" style={{ marginBottom: '0.75rem' }}>
                Let&apos;s Go
              </button>
              <p className="font-karla font-400 text-center text-[#6a6764]" style={{ fontSize: '0.72rem' }}>
                Tap <span style={{ color: '#c8a870' }}>Recruit Crew</span> below to open your first pack ↓
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
