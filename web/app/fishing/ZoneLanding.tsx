'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL } from './zoneData'

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

const ZONE_DIFFICULTY: Record<string, number> = {
  shallows:    1,
  open_waters: 2,
  deep:        3,
  abyss:       4,
}

const ZONE_CONDITIONS: Record<string, string[]> = {
  shallows:    ['Steady, easy to time', 'Wider catch window', 'No reversals'],
  open_waters: ['Occasional speed changes', 'Mild currents', 'Rare direction reversals'],
  deep:        ['Frequent speed changes', 'Dial reverses direction', 'Tighter catch window'],
  abyss:       ['Erratic, hard to time', 'Constant reversals', 'Smallest catch window'],
}

const HOW_IT_WORKS = [
  {
    title: 'Cast & Wait',
    body: 'Each cast uses one bait. A fish is selected the moment you cast — rarer fish take longer to bite. Better rod and bait reduce the wait. You can fish as much as you have bait for.',
  },
  {
    title: 'Reel In',
    body: 'When the rod dips, a spinning dial appears. Hit the green catch zone to land the fish, or the gold perfect zone to land it and get a chance to save your bait.',
  },
  {
    title: 'Fish Speed',
    body: "Harder fish make the dial spin faster and are trickier to time. Upgrading your reel slows the dial down across the board.",
  },
  {
    title: 'Zone Conditions',
    body: 'Deeper zones have stronger currents — the dial speeds up and reverses direction more often, and the catch window shrinks. The same fish is significantly harder to land from the Abyss than the Shallows.',
  },
  {
    title: 'Snag Zones',
    body: 'Red zones on the dial snag your line — you lose the fish and your bait. Upgrade your line to shrink them.',
  },
  {
    title: 'Fish Hold',
    body: "Your ship determines how many fish you can hold. When your hold is full you can't cast — head to the market to sell, then come back. Upgrade your ship at the Shipyard to carry more.",
  },
  {
    title: 'Gear Summary',
    body: 'Rod → faster bites. Reel → slows the dial. Hook → widens the catch zone. Line → shrinks snag zones. Bait → faster bites + wider catch zone. Ship → fish hold capacity.',
  },
]

export default function ZoneLanding({
  fishingLevel, fishingXP, uniqueSpeciesCaught, highestPerfectStreak, onSelect,
}: {
  fishingLevel: number
  fishingXP: number
  uniqueSpeciesCaught: number
  highestPerfectStreak: number
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
                Level {fishingLevel}
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

          {/* Cumulative stats strip */}
          <div className="flex gap-2 mb-4">
            <div style={{ flex: 1, background: 'rgba(2,6,12,0.75)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1 }}>{fishingXP.toLocaleString()}</p>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Total XP</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(2,6,12,0.75)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#60a5fa', lineHeight: 1 }}>{uniqueSpeciesCaught}</p>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Species Found</p>
            </div>
            {highestPerfectStreak > 0 && (
              <div style={{ flex: 1, background: 'rgba(2,6,12,0.75)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#fb923c', lineHeight: 1 }}>{highestPerfectStreak}×</p>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Best Streak</p>
              </div>
            )}
          </div>

          {/* Zone cards */}
          <div className="flex flex-col gap-3">
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              const accessible = fishingLevel >= minLevel
              const color = HABITAT_COLOR[zone]
              const difficulty = ZONE_DIFFICULTY[zone]
              const conditions = ZONE_CONDITIONS[zone]

              return (
                <motion.div key={zone}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.06 }}
                  onClick={() => accessible && onSelect(zone)}
                  style={{
                    border: `1px solid ${accessible ? color + 'aa' : 'rgba(255,255,255,0.18)'}`,
                    background: accessible ? `${color}3a` : 'rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    padding: '1rem 1rem 0.9rem',
                    opacity: accessible ? 1 : 0.65,
                    cursor: accessible ? 'pointer' : 'default',
                  }}
                >
                  <div className="flex items-start justify-between mb-2.5">
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
                    <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                      {/* Difficulty dots */}
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(d => (
                          <div key={d} style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: d <= difficulty
                              ? (accessible ? color : '#5a5956')
                              : 'rgba(255,255,255,0.12)',
                          }} />
                        ))}
                      </div>
                      {!accessible && (
                        <span className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{
                            fontSize: '0.58rem', color: '#8a8784',
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.18)',
                            padding: '0.28rem 0.65rem', borderRadius: '2rem',
                          }}>
                          Lv {minLevel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Conditions */}
                  <div className="flex flex-col gap-1">
                    {conditions.map(cond => (
                      <div key={cond} className="flex items-center gap-1.5">
                        <div style={{ width: 3, height: 3, borderRadius: '50%', background: accessible ? color + 'aa' : '#3a3835', flexShrink: 0 }} />
                        <p className="font-karla font-400"
                          style={{ fontSize: '0.72rem', color: accessible ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.2)' }}>
                          {cond}
                        </p>
                      </div>
                    ))}
                  </div>
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
