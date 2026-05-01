'use client'

import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { markMarketIntroSeen } from './marketIntroAction'

const HOW_IT_WORKS = [
  { color: '#38bdf8', label: 'Live Prices',    desc: 'Every fish has a price multiplier that shifts hourly — up to 2.5× base value.' },
  { color: '#4ade80', label: 'Sell Your Catch', desc: 'Go to My Portfolio, pick a fish, choose a quantity, and confirm the sale.' },
  { color: '#f0c040', label: 'Watch the Trend', desc: 'Each fish shows a sparkline of recent price movement. Green arrow = rising, red = falling.' },
  { color: '#fb923c', label: 'Market Moods',   desc: 'Calm, Storm, or Kraken Surge — moods affect prices across the whole market.' },
  { color: '#a78bfa', label: 'Time It Right',  desc: "Don't rush to sell. Prices cycle — waiting for a spike can double your earnings." },
  { color: '#f0ede8', label: 'No Fees',         desc: 'Members sell with no transaction fee. Free accounts pay a small cut to the house.' },
]

export default function MarketIntroModal() {
  const [visible, setVisible] = useState(true)
  const [, startTransition] = useTransition()

  function handleClose() {
    startTransition(async () => {
      await markMarketIntroSeen()
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
                Fish Market
              </h2>
              <p className="font-karla font-300 text-[#6a6764]" style={{ fontSize: '0.82rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
                Sell the fish you catch for doubloons. Prices shift every hour — smart timing means bigger payouts.
              </p>
            </div>

            <div style={{ padding: '0 1.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '1.4rem' }}>
              {HOW_IT_WORKS.map(s => (
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

            <div style={{ padding: '0 1.75rem 1.75rem' }}>
              <button onClick={handleClose} className="btn-ghost w-full">
                Got it — Let&apos;s Trade
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
