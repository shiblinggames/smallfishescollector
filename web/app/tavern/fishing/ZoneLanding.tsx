'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_RARITY_RATES, ZONE_MIN_LEVEL } from './zoneData'

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
export type ZoneKey = typeof ZONES[number]

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#60a5fa',
  open_waters: '#34d399',
  deep:        '#a78bfa',
  abyss:       '#f87171',
}
const HABITAT_LABEL: Record<string, string> = {
  shallows:    'Shallows',
  open_waters: 'Open Waters',
  deep:        'Deep',
  abyss:       'Abyss',
}
const HABITAT_TAGLINE: Record<string, string> = {
  shallows:    'Clear water, gentle currents',
  open_waters: 'Wide open sea',
  deep:        'Cold and dark below',
  abyss:       'The unknown depths',
}

const RARITY_COLORS: Record<number, string> = {
  1: '#94a3b8',
  2: '#4ade80',
  3: '#60a5fa',
  4: '#c084fc',
  5: '#f59e0b',
}
const RARITY_LABELS: Record<number, string> = {
  1: 'Common',
  2: 'Uncommon',
  3: 'Rare',
  4: 'Epic',
  5: 'Legendary',
}

const HOW_IT_WORKS = [
  {
    title: 'Cast & Wait',
    body: 'Each cast uses one bait. A fish is selected the moment you cast — rarer fish take longer to bite. Better rod and bait reduce the wait.',
  },
  {
    title: 'Reel In',
    body: 'When the rod dips, a spinning dial appears. Hit the green catch zone to land the fish, or the gold perfect zone to land it and get a chance to save your bait.',
  },
  {
    title: 'Fish Speed',
    body: "The needle speed depends on the fish's difficulty — harder fish spin faster. Upgrade your reel to slow it down.",
  },
  {
    title: 'Zone Conditions',
    body: 'Deeper zones have stronger currents. The needle changes speed more often, randomly reverses direction, and the catch window is smaller. The same fish is significantly harder to reel in from the Abyss than the Shallows.',
  },
  {
    title: 'Snag Zones',
    body: 'Red zones on the dial snag your line — you lose the fish and your bait. Upgrade your line to shrink them.',
  },
  {
    title: 'Gear Summary',
    body: 'Rod → faster bites. Reel → slows the needle. Hook → widens the catch zone. Line → shrinks snag zones. Bait → faster bites + wider catch zone.',
  },
]

export default function ZoneLanding({
  fishingLevel, onSelect,
}: {
  fishingLevel: number
  onSelect: (zone: ZoneKey) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0"
      style={{ background: '#08121c', zIndex: 40, display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-md overflow-hidden" style={{ height: '100%' }}>

        {/* Background */}
        <img src="/fishing.jpeg" alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: 'top center',
        }} />
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(8,18,28,0.82)' }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1, height: '100%',
          display: 'flex', flexDirection: 'column',
          padding: '1.25rem 1rem',
          overflowY: 'auto',
        }}>
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div>
              <p className="font-cinzel font-700 uppercase tracking-[0.2em]"
                style={{ fontSize: '1.1rem', color: '#f0ede8' }}>
                Fishing
              </p>
              <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
                Choose your zone
              </p>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              aria-label="How fishing works"
              style={{
                width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: 'rgba(255,255,255,0.6)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', touchAction: 'manipulation',
                fontSize: '0.75rem', fontFamily: 'serif', fontStyle: 'italic', fontWeight: 700,
              }}
            >
              i
            </button>
          </div>

          {/* Zone cards */}
          <div className="flex flex-col gap-3">
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              const accessible = fishingLevel >= minLevel
              const color = HABITAT_COLOR[zone]
              const rates = ZONE_RARITY_RATES[zone]
              const total = Object.values(rates).reduce((s, v) => s + v, 0)

              return (
                <motion.div key={zone}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.06 }}
                  style={{
                    border: `1px solid ${accessible ? color + '80' : 'rgba(255,255,255,0.15)'}`,
                    background: accessible ? `${color}22` : 'rgba(255,255,255,0.06)',
                    borderRadius: 14,
                    padding: '1rem 1rem 0.9rem',
                    opacity: accessible ? 1 : 0.65,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-cinzel font-700"
                        style={{ fontSize: '1.05rem', color: accessible ? color : '#8a8784' }}>
                        {HABITAT_LABEL[zone]}
                      </p>
                      <p className="font-karla font-400 mt-0.5"
                        style={{ fontSize: '0.75rem', color: accessible ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>
                        {HABITAT_TAGLINE[zone]}
                      </p>
                    </div>
                    {!accessible && (
                      <span className="font-karla font-700 uppercase tracking-[0.1em] shrink-0"
                        style={{
                          fontSize: '0.58rem', color: '#8a8784',
                          background: 'rgba(255,255,255,0.08)',
                          border: '1px solid rgba(255,255,255,0.18)',
                          padding: '0.28rem 0.65rem', borderRadius: '2rem',
                        }}>
                        Locked
                      </span>
                    )}
                  </div>

                  {/* Rarity bar */}
                  <div className="mb-3">
                    <div className="flex mb-2" style={{ height: 6, borderRadius: 3, overflow: 'hidden', gap: 1 }}>
                      {[1, 2, 3, 4, 5].map(tier => (
                        <div key={tier} style={{
                          flex: rates[tier] / total,
                          background: RARITY_COLORS[tier],
                          opacity: accessible ? 1 : 0.3,
                        }} />
                      ))}
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {[1, 2, 3, 4, 5].map(tier => (
                        <span key={tier} className="font-karla font-600"
                          style={{
                            fontSize: '0.62rem',
                            color: accessible ? RARITY_COLORS[tier] : '#5a5956',
                          }}>
                          {RARITY_LABELS[tier]} {rates[tier]}%
                        </span>
                      ))}
                    </div>
                  </div>

                  {accessible ? (
                    <button
                      onClick={() => onSelect(zone)}
                      className="w-full font-karla font-700 uppercase tracking-[0.12em]"
                      style={{
                        padding: '0.7rem',
                        borderRadius: 10,
                        background: `${color}30`,
                        border: `1px solid ${color}80`,
                        color,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        touchAction: 'manipulation',
                      }}
                    >
                      Fish Here →
                    </button>
                  ) : (
                    <p className="font-karla font-600 text-center"
                      style={{ fontSize: '0.65rem', color: '#6a6764' }}>
                      Reach Fishing Level {minLevel} to unlock
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Info modal */}
        <AnimatePresence>
          {modalOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setModalOpen(false)}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 50 }}
              />
              <motion.div
                key="modal"
                initial={{ opacity: 0, y: 16, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                style={{
                  position: 'absolute', top: '10%', left: '1rem', right: '1rem',
                  background: '#0d1e2e',
                  border: '1px solid rgba(255,255,255,0.14)',
                  borderRadius: 18,
                  zIndex: 51,
                  maxHeight: '78%',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                }}
              >
                {/* Modal header */}
                <div className="flex items-center justify-between" style={{ padding: '1rem 1.1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <p className="font-cinzel font-700 uppercase tracking-[0.15em]" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>
                    How Fishing Works
                  </p>
                  <button
                    onClick={() => setModalOpen(false)}
                    style={{ color: 'rgba(255,255,255,0.4)', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: '0.1rem 0.3rem' }}
                  >
                    ✕
                  </button>
                </div>

                {/* Modal body */}
                <div style={{ overflowY: 'auto', padding: '0.9rem 1.1rem 1.1rem' }}>
                  <div className="flex flex-col gap-4">
                    {HOW_IT_WORKS.map(({ title, body }) => (
                      <div key={title}>
                        <p className="font-karla font-700 mb-1" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.88)' }}>
                          {title}
                        </p>
                        <p className="font-karla font-300" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55 }}>
                          {body}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
