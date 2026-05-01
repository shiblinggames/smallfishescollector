'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markPacksIntroSeen } from './packsIntroAction'

const RARITIES = [
  { color: '#5a5650', label: 'Common',    desc: 'The backbone of any crew. Reliable and plentiful.' },
  { color: '#3b8ef0', label: 'Rare',      desc: 'Noticeably harder to find. Worth holding onto.' },
  { color: '#a78bfa', label: 'Epic',      desc: 'Special art effects like Pearl and Holographic.' },
  { color: '#f0c040', label: 'Legendary', desc: 'Ghost, Shadow, and Prismatic variants. Very rare.' },
  { color: '#ff3838', label: 'Mythic',    desc: 'The rarest cards in existence — Kraken, Davy Jones, and beyond.' },
]

export default function PacksIntroModal() {
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  function handleClose() {
    startTransition(async () => {
      await markPacksIntroSeen()
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
            background: 'rgba(0,0,0,0.82)',
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
            <div style={{ padding: '1.75rem 1.75rem 0' }}>
              <p className="sg-eyebrow text-[#9a9488] mb-1">How It Works</p>
              <h2 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.35rem', lineHeight: 1.2, marginBottom: '0.5rem' }}>
                Recruiting Crew
              </h2>
              <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '1.1rem' }}>
                Each <span style={{ color: '#c8a870' }}>Crew Notice</span> lets you recruit 4 fish cards. Flip each card to reveal what you got — rarity determines how special your catch is.
              </p>
            </div>

            {/* How opening works */}
            <div style={{ padding: '0 1.75rem', marginBottom: '1.1rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.10em] text-[#4a4845]" style={{ fontSize: '0.6rem', marginBottom: '0.5rem' }}>Opening a Notice</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {[
                  { n: '1', text: 'Tap Recruit Crew to spend one Crew Notice' },
                  { n: '2', text: 'Four face-down cards are dealt to you' },
                  { n: '3', text: 'Tap each card to flip and reveal it' },
                  { n: '4', text: 'Tap Reveal All to flip everything at once' },
                ].map(s => (
                  <div key={s.n} style={{
                    display: 'flex', alignItems: 'center', gap: '0.65rem',
                    background: 'rgba(8,8,6,0.82)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.6rem',
                    padding: '0.45rem 0.85rem',
                  }}>
                    <span className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: '#4a4845', flexShrink: 0, width: 12 }}>{s.n}</span>
                    <span className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#5a5856', lineHeight: 1.4 }}>{s.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rarity tiers */}
            <div style={{ padding: '0 1.75rem', marginBottom: '1.4rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.10em] text-[#4a4845]" style={{ fontSize: '0.6rem', marginBottom: '0.5rem' }}>Rarity Tiers</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {RARITIES.map(r => (
                  <div key={r.label} style={{
                    display: 'flex', alignItems: 'baseline', gap: '0.6rem',
                    background: 'rgba(8,8,6,0.82)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '0.6rem',
                    padding: '0.45rem 0.85rem',
                  }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: r.color, flexShrink: 0, marginTop: 3 }} />
                    <span className="font-karla font-700" style={{ fontSize: '0.76rem', color: r.color, whiteSpace: 'nowrap' }}>{r.label}</span>
                    <span className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#5a5856', lineHeight: 1.4 }}>{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ padding: '0 1.75rem 1.75rem' }}>
              <button onClick={handleClose} className="btn-ghost w-full">
                Got it — Let&apos;s Recruit
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
