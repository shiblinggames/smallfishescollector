'use client'

import { motion } from 'framer-motion'
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

export default function ZoneLanding({
  rodTier, onSelect,
}: {
  rodTier: number
  onSelect: (zone: ZoneKey) => void
}) {
  const rod = getRod(rodTier)

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
          <div className="flex flex-col gap-3">
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
        </div>
      </div>
    </div>
  )
}
