'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { claimWelcomePack } from './welcomeActions'

const ACTIVITIES = [
  { color: '#60a5fa', label: 'Fish of the Day',  desc: 'Guess the mystery fish for up to 100 ⟡' },
  { color: '#4ade80', label: 'Fishing',       desc: 'Cast your line up to 20 times daily' },
  { color: '#f0c040', label: 'Daily Bonus',       desc: 'Claim free doubloons every day' },
  { color: '#a78bfa', label: 'Fish Trivia',       desc: 'One question, 50 ⟡ for a correct answer' },
  { color: '#f87171', label: 'Bounties',          desc: 'Weekly catch targets — earn packs' },
]

export default function WelcomeModal() {
  const [visible, setVisible]   = useState(true)
  const [claimed, setClaimed]   = useState(false)
  const [, startTransition]     = useTransition()

  function handleClaim() {
    startTransition(async () => {
      await claimWelcomePack()
      setClaimed(true)
    })
  }

  function handleClose() {
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.72)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
          }}
          onClick={claimed ? handleClose : undefined}
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              background: '#16130f',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '1.25rem',
              padding: '2rem 1.75rem',
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              {!claimed ? (
                <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#f0c040', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                    Welcome aboard
                  </p>
                  <h2 className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8', lineHeight: 1.2, marginBottom: '0.75rem' }}>
                    Seas the Booty
                  </h2>
                  <p className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#8a8884', lineHeight: 1.6, marginBottom: '1.5rem' }}>
                    Collect fish cards, earn doubloons through daily activities, and open packs to grow your collection.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.75rem' }}>
                    {ACTIVITIES.map(a => (
                      <div key={a.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ width: 7, height: 7, borderRadius: '50%', background: a.color, flexShrink: 0 }} />
                        <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: a.color, minWidth: 110 }}>{a.label}</span>
                        <span className="font-karla font-600" style={{ fontSize: '0.75rem', color: '#5a5956' }}>{a.desc}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{
                    background: 'rgba(240,192,64,0.07)',
                    border: '1px solid rgba(240,192,64,0.25)',
                    borderRadius: '0.75rem',
                    padding: '0.9rem 1.1rem',
                    marginBottom: '1.25rem',
                  }}>
                    <p className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#f0c040', marginBottom: '0.2rem' }}>
                      🎁 Welcome gift — 1 free pack
                    </p>
                    <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#7a7060' }}>
                      Open it from the Packs page to see what you reel in.
                    </p>
                  </div>

                  <button
                    onClick={handleClaim}
                    className="font-karla font-700 uppercase tracking-[0.12em] w-full"
                    style={{
                      padding: '0.75rem',
                      borderRadius: '0.65rem',
                      background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.3), rgba(240,192,64,0.1))',
                      border: '1px solid rgba(240,192,64,0.45)',
                      color: '#f0c040',
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}>
                    Claim Free Pack &amp; Start Playing
                  </button>
                </motion.div>
              ) : (
                <motion.div key="claimed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                  style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎣</p>
                  <h2 className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f0ede8', marginBottom: '0.5rem' }}>
                    Pack claimed!
                  </h2>
                  <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#6a6764', marginBottom: '1.5rem' }}>
                    Head to Packs to open it when you&apos;re ready.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button onClick={handleClose}
                      className="font-karla font-700 uppercase tracking-[0.12em]"
                      style={{
                        padding: '0.6rem 1.25rem', borderRadius: '2rem',
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'transparent', color: '#6a6764',
                        fontSize: '0.72rem', cursor: 'pointer',
                      }}>
                      Explore Tavern
                    </button>
                    <Link href="/packs"
                      className="font-karla font-700 uppercase tracking-[0.12em]"
                      style={{
                        padding: '0.6rem 1.25rem', borderRadius: '2rem',
                        border: '1px solid rgba(240,192,64,0.4)',
                        background: 'rgba(240,192,64,0.1)', color: '#f0c040',
                        fontSize: '0.72rem',
                      }}>
                      Open Pack →
                    </Link>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
