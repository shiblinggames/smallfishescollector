'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { claimWelcomePack } from './welcomeActions'

const SECTIONS = [
  {
    label: 'Earn',
    color: '#f0c040',
    items: [
      { label: 'Daily Bonus', desc: '50–100 ⟡ free every day' },
      { label: 'Fishing', desc: 'Cast your line and catch rare fish' },
      { label: 'Fish of the Day', desc: 'Guess the mystery fish for up to 100 ⟡' },
      { label: 'Bounties', desc: 'Weekly catch targets — earn packs' },
    ],
  },
  {
    label: 'Games',
    color: '#a78bfa',
    items: [
      { label: 'Crown & Anchor', desc: 'Bet on a symbol — win up to 3×' },
      { label: 'Fish Slots', desc: 'Match three fish to win big' },
    ],
  },
  {
    label: 'Explore',
    color: '#34d399',
    items: [
      { label: 'Expeditions', desc: 'Send your crew on voyages for loot' },
      { label: 'Fish Market', desc: 'Sell your catch at live market prices' },
      { label: 'Collection', desc: 'Track every species you discover' },
    ],
  },
  {
    label: 'Upgrade',
    color: '#60a5fa',
    items: [
      { label: 'Tackle Shop', desc: 'Better hooks, rods, and bait' },
      { label: 'Shipyard', desc: 'Upgrade your ship for bigger hauls' },
    ],
  },
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
            background: 'rgba(0,0,0,0.78)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '1.5rem',
            overflowY: 'auto',
          }}
          onClick={claimed ? handleClose : undefined}
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
              padding: '2rem 1.75rem',
              maxWidth: 440,
              width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
              margin: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              {!claimed ? (
                <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

                  {/* Header */}
                  <p className="sg-eyebrow text-[#9a9488] mb-2">Welcome aboard</p>
                  <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.6rem', lineHeight: 1.15, marginBottom: '0.5rem' }}>
                    Seas the Booty
                  </h2>
                  <p className="font-karla font-400 text-[#6a6764]" style={{ fontSize: '0.85rem', lineHeight: 1.65, marginBottom: '1.75rem' }}>
                    Catch fish, earn doubloons, open packs, and build your collection. Here&apos;s everything you can do:
                  </p>

                  {/* Feature sections */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.75rem' }}>
                    {SECTIONS.map(section => (
                      <div key={section.label}
                        style={{
                          background: 'rgba(8,8,6,0.82)',
                          border: '1px solid rgba(255,255,255,0.10)',
                          borderRadius: '0.75rem',
                          overflow: 'hidden',
                        }}
                      >
                        <p className="font-karla font-700 uppercase tracking-[0.14em]"
                          style={{ fontSize: '0.6rem', color: section.color, padding: '0.6rem 0.9rem 0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          {section.label}
                        </p>
                        {section.items.map((item, i) => (
                          <div key={item.label}
                            style={{
                              display: 'flex', alignItems: 'baseline', gap: '0.6rem',
                              padding: '0.5rem 0.9rem',
                              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined,
                            }}
                          >
                            <div style={{ width: 5, height: 5, borderRadius: '50%', background: section.color, flexShrink: 0, marginTop: 5 }} />
                            <span className="font-karla font-700" style={{ fontSize: '0.78rem', color: '#c8c5c0', whiteSpace: 'nowrap' }}>{item.label}</span>
                            <span className="font-karla font-400" style={{ fontSize: '0.75rem', color: '#4a4845' }}>— {item.desc}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>

                  {/* Welcome gift */}
                  <div style={{
                    background: 'rgba(240,192,64,0.07)',
                    border: '1px solid rgba(240,192,64,0.22)',
                    borderRadius: '0.75rem',
                    padding: '0.85rem 1rem',
                    marginBottom: '1.25rem',
                  }}>
                    <p className="font-karla font-700 text-[#f0c040]" style={{ fontSize: '0.82rem', marginBottom: '0.2rem' }}>
                      🎁 Welcome gift — 1 free pack
                    </p>
                    <p className="font-karla font-400 text-[#6a5e40]" style={{ fontSize: '0.72rem' }}>
                      Open it from the Packs page to see what you reel in.
                    </p>
                  </div>

                  <button onClick={handleClaim} className="btn-ghost w-full">
                    Claim Free Pack &amp; Start Playing
                  </button>
                </motion.div>
              ) : (
                <motion.div key="claimed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                  style={{ textAlign: 'center', padding: '1rem 0' }}>
                  <p style={{ fontSize: '2.25rem', marginBottom: '0.75rem' }}>🎣</p>
                  <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.3rem', marginBottom: '0.5rem' }}>
                    Pack claimed!
                  </h2>
                  <p className="font-karla font-400 text-[#6a6764]" style={{ fontSize: '0.82rem', marginBottom: '1.75rem' }}>
                    Head to Packs to open it when you&apos;re ready.
                  </p>
                  <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                    <button onClick={handleClose}
                      className="font-karla font-700 uppercase tracking-[0.12em]"
                      style={{
                        padding: '0.6rem 1.25rem', borderRadius: '2rem',
                        border: '1px solid rgba(255,255,255,0.10)',
                        background: 'transparent', color: '#6a6764',
                        fontSize: '0.72rem', cursor: 'pointer',
                      }}>
                      Explore Tavern
                    </button>
                    <Link href="/packs"
                      className="font-karla font-700 uppercase tracking-[0.12em]"
                      style={{
                        padding: '0.6rem 1.25rem', borderRadius: '2rem',
                        border: '1px solid rgba(240,192,64,0.35)',
                        background: 'rgba(240,192,64,0.08)', color: '#f0c040',
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
