'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { claimWelcomePack } from './welcomeActions'

const FEATURES = [
  { color: '#f0c040', label: 'Daily Bonus' },
  { color: '#4ade80', label: 'Fishing' },
  { color: '#60a5fa', label: 'Fish of the Day' },
  { color: '#f87171', label: 'Bounties' },
  { color: '#c084fc', label: 'Crown & Anchor' },
  { color: '#a78bfa', label: 'Fish Slots' },
  { color: '#34d399', label: 'Expeditions' },
  { color: '#fb923c', label: 'Fish Market' },
  { color: '#e879f9', label: 'Collection' },
  { color: '#60a5fa', label: 'Tackle Shop' },
  { color: '#94a3b8', label: 'Shipyard' },
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
              maxWidth: 420,
              width: '100%',
              boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
              margin: 'auto',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            <AnimatePresence mode="wait">
              {!claimed ? (
                <motion.div key="intro" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

                  {/* Hero image */}
                  <div style={{ position: 'relative', height: 180, overflow: 'hidden' }}>
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
                      <p className="sg-eyebrow text-[#9a9488] mb-1">Welcome aboard</p>
                      <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem', lineHeight: 1.15 }}>
                        Seas the Booty
                      </h2>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: '1.25rem 1.75rem 1.75rem' }}>
                    <p className="font-karla font-400 text-[#6a6764]" style={{ fontSize: '0.83rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
                      Catch fish, earn doubloons, open packs, and build your collection. Here&apos;s everything waiting for you:
                    </p>

                    {/* Feature grid */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr',
                      gap: '0.4rem',
                      marginBottom: '1.5rem',
                    }}>
                      {FEATURES.map(f => (
                        <div key={f.label} style={{
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                          background: 'rgba(8,8,6,0.82)',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '0.5rem',
                          padding: '0.45rem 0.7rem',
                        }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: f.color, flexShrink: 0 }} />
                          <span className="font-karla font-600" style={{ fontSize: '0.76rem', color: '#b8b5b0' }}>{f.label}</span>
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
                  </div>
                </motion.div>
              ) : (
                <motion.div key="claimed" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}
                  style={{ textAlign: 'center', padding: '2.5rem 1.75rem' }}>
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
