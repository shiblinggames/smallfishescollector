'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getRod } from '@/lib/rods'
import { ZONE_RARITY_RATES, ZONE_UNLOCK_ROD } from './zoneData'

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
    body: 'Deeper zones have stronger currents. The needle will change speed more often and randomly reverse direction. The same fish is harder to reel in from the Abyss than the Shallows.',
  },
  {
    title: 'Snag Zones',
    body: 'Red zones on the dial snag your line — you lose the fish and your bait. Upgrade your line to shrink them.',
  },
  {
    title: 'Gear Summary',
    body: 'Rod → unlocks zones + faster bites. Reel → slows the needle. Hook → widens the catch zone. Line → shrinks snag zones. Bait → faster bites + zone access.',
  },
]

export default function ZoneLanding({
  rodTier, onSelect,
}: {
  rodTier: number
  onSelect: (zone: ZoneKey) => void
}) {
  const rod = getRod(rodTier)
  const [guideOpen, setGuideOpen] = useState(false)

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
          <div className="mb-5">
            <p className="font-cinzel font-700 uppercase tracking-[0.2em]"
              style={{ fontSize: '1.1rem', color: '#f0ede8' }}>
              Fishing
            </p>
            <p className="font-karla font-400" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)' }}>
              Choose your zone
            </p>
          </div>

          {/* Zone cards */}
          <div className="flex flex-col gap-3 mb-4">
            {ZONES.map((zone, i) => {
              const accessible = rod.habitats.includes(zone)
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
                      Requires {ZONE_UNLOCK_ROD[zone] ?? 'a better rod'} — upgrade at the Tackle Shop
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
          {/* How it works */}
          <div style={{
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 14,
            overflow: 'hidden',
          }}>
            <button
              onClick={() => setGuideOpen(o => !o)}
              className="w-full flex items-center justify-between font-karla font-600"
              style={{
                padding: '0.85rem 1rem',
                background: 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem',
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              <span>How fishing works</span>
              <span style={{ transition: 'transform 0.2s', transform: guideOpen ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>▾</span>
            </button>

            <AnimatePresence initial={false}>
              {guideOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: 'easeInOut' }}
                  style={{ overflow: 'hidden' }}
                >
                  <div className="flex flex-col gap-3" style={{ padding: '0.75rem 1rem 1rem' }}>
                    {HOW_IT_WORKS.map(({ title, body }) => (
                      <div key={title}>
                        <p className="font-karla font-700 mb-0.5" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.8)' }}>
                          {title}
                        </p>
                        <p className="font-karla font-300" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                          {body}
                        </p>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  )
}
