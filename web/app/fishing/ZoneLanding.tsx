'use client'

import { useState, useEffect, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL } from './zoneData'
import { updateUsername } from '@/app/u/actions'

const AUTO_NAME_RE = /^crew_[0-9a-f]{5}$/
const DISMISSED_KEY = 'sf_username_prompt_dismissed'
const XP_THRESHOLD = 100

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep'] as const
export type ZoneKey = typeof ZONES[number]

const HABITAT_COLOR: Record<string, string> = {
  shallows:    '#60a5fa',
  open_waters: '#34d399',
  deep:        '#a78bfa',
  abyss:       '#f87171',
  ancient_deep: '#c084fc',
}
const HABITAT_LABEL: Record<string, string> = {
  shallows:    'Shallows',
  open_waters: 'Open Waters',
  deep:        'Deep',
  abyss:       'Abyss',
  ancient_deep: 'Ancient Deep',
}
const HABITAT_TAGLINE: Record<string, string> = {
  shallows:    'Clear water, gentle currents',
  open_waters: 'Wide open sea',
  deep:        'Cold and dark below',
  abyss:       'The unknown depths',
  ancient_deep: 'Before time. Beyond depth.',
}

const ZONE_DIFFICULTY: Record<string, number> = {
  shallows:    1,
  open_waters: 2,
  deep:        3,
  abyss:       4,
  ancient_deep: 5,
}

const ZONE_DIFFICULTY_LABEL: Record<string, string> = {
  shallows:    'Beginner Friendly',
  open_waters: 'Moderate',
  deep:        'Challenging',
  abyss:       'Expert Only',
  ancient_deep: 'Boss Encounters',
}

const ZONE_STATS: Record<string, { topSell: number }> = {
  shallows:    { topSell: 360  },
  open_waters: { topSell: 500  },
  deep:        { topSell: 680  },
  abyss:       { topSell: 1380 },
  ancient_deep: { topSell: 6000 },
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
  fishingLevel, fishingXP, uniqueSpeciesCaught, highestPerfectStreak, username, onSelect,
}: {
  fishingLevel: number
  fishingXP: number
  uniqueSpeciesCaught: number
  highestPerfectStreak: number
  username: string
  onSelect: (zone: ZoneKey) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)

  const showUsernamePrompt = AUTO_NAME_RE.test(username) && fishingXP >= XP_THRESHOLD
  const [usernamePromptOpen, setUsernamePromptOpen] = useState(false)
  const [usernameInput, setUsernameInput] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [, startTransition] = useTransition()
  const [usernameSaving, setUsernameSaving] = useState(false)

  useEffect(() => {
    if (showUsernamePrompt && !localStorage.getItem(DISMISSED_KEY)) {
      setUsernamePromptOpen(true)
    }
  }, [showUsernamePrompt])

  function dismissUsernamePrompt() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setUsernamePromptOpen(false)
  }

  function saveUsername() {
    setUsernameError('')
    setUsernameSaving(true)
    startTransition(async () => {
      const res = await updateUsername(usernameInput)
      if (res.error) {
        setUsernameError(res.error)
        setUsernameSaving(false)
      } else {
        localStorage.setItem(DISMISSED_KEY, '1')
        setUsernamePromptOpen(false)
      }
    })
  }

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
              <p className="font-karla font-400" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)' }}>
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
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Total XP</p>
            </div>
            <div style={{ flex: 1, background: 'rgba(2,6,12,0.75)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#60a5fa', lineHeight: 1 }}>{uniqueSpeciesCaught}</p>
              <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Species Found</p>
            </div>
            {highestPerfectStreak > 0 && (
              <div style={{ flex: 1, background: 'rgba(2,6,12,0.75)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#fb923c', lineHeight: 1 }}>{highestPerfectStreak}×</p>
                <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>Best Streak</p>
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
              const diffLabel = ZONE_DIFFICULTY_LABEL[zone]
              const stats = ZONE_STATS[zone]
              const isRecommended = accessible && ZONES.filter(z => fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1)).slice(-1)[0] === zone

              return (
                <motion.div key={zone}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: i * 0.07 }}
                  onClick={() => accessible && onSelect(zone)}
                  style={{
                    borderRadius: 16,
                    border: `1px solid ${accessible ? color + '55' : 'rgba(255,255,255,0.1)'}`,
                    borderLeft: `3px solid ${accessible ? color + 'cc' : 'rgba(255,255,255,0.15)'}`,
                    background: accessible
                      ? `linear-gradient(135deg, rgba(6,16,26,0.97) 0%, ${color}14 100%)`
                      : 'rgba(255,255,255,0.04)',
                    opacity: accessible ? 1 : 0.5,
                    cursor: accessible ? 'pointer' : 'default',
                    overflow: 'hidden',
                  }}
                >
                  {/* Top section */}
                  <div style={{ padding: '0.9rem 1rem 0.75rem' }}>
                    <div className="flex items-start justify-between">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2">
                          <p className="font-cinzel font-700"
                            style={{ fontSize: '1.08rem', color: accessible ? color : '#4a4845', letterSpacing: '0.04em' }}>
                            {HABITAT_LABEL[zone]}
                          </p>
                          {isRecommended && (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]"
                              style={{
                                fontSize: '0.58rem', color: color,
                                background: `${color}1a`, border: `1px solid ${color}44`,
                                padding: '0.18rem 0.5rem', borderRadius: '2rem', flexShrink: 0,
                              }}>
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="font-karla font-300 italic mt-0.5"
                          style={{ fontSize: '0.76rem', color: accessible ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.25)' }}>
                          {HABITAT_TAGLINE[zone]}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4].map(d => (
                            <div key={d} style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: d <= difficulty
                                ? (accessible ? color : '#3a3835')
                                : 'rgba(255,255,255,0.1)',
                            }} />
                          ))}
                        </div>
                        {!accessible && (
                          <span className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{
                              fontSize: '0.65rem', color: '#7a7976',
                              background: 'rgba(255,255,255,0.06)',
                              border: '1px solid rgba(255,255,255,0.12)',
                              padding: '0.22rem 0.55rem', borderRadius: '2rem',
                            }}>
                            Lv {minLevel}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {accessible && (<>
                    {/* Tags row */}
                    <div style={{ borderTop: `1px solid ${color}1a`, padding: '0.55rem 1rem', display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="font-karla font-600"
                        style={{ fontSize: '0.68rem', color: `${color}dd`, background: `${color}18`, border: `1px solid ${color}30`, padding: '0.2rem 0.6rem', borderRadius: '2rem' }}>
                        {diffLabel}
                      </span>
                    </div>

                    {/* Top catch — no spoilers, just the value */}
                    {zone !== 'ancient_deep' && (
                      <div style={{ padding: '0.3rem 1rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <span className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)' }}>Top catch worth up to</span>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.76rem', color: '#f59e0b' }}>{stats.topSell.toLocaleString()} ⟡</span>
                      </div>
                    )}
                  </>)}
                </motion.div>
              )
            })}
          </div>
        </div>

        {/* Username prompt modal */}
        <AnimatePresence>
          {usernamePromptOpen && (
            <>
              <motion.div
                key="username-backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={dismissUsernamePrompt}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 50 }}
              />
              <motion.div
                key="username-modal"
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.97 }}
                transition={{ duration: 0.22, ease: 'easeOut' }}
                style={{
                  position: 'absolute', left: '1rem', right: '1rem',
                  top: '50%', transform: 'translateY(-50%)',
                  background: '#0d1e2e',
                  border: '1px solid rgba(240,192,64,0.2)',
                  borderRadius: 18, zIndex: 51,
                  padding: '1.5rem 1.25rem',
                }}
              >
                <p className="font-karla font-600 uppercase tracking-[0.18em] mb-1" style={{ fontSize: '0.5rem', color: '#f0c04077' }}>Your Identity</p>
                <p className="font-cinzel font-700 mb-1" style={{ fontSize: '1.1rem', color: '#f0ede8' }}>Set your captain name</p>
                <p className="font-karla font-400 mb-5" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                  You&apos;re showing up on the leaderboard as <span style={{ color: '#f0c040', fontFamily: 'monospace' }}>{username}</span>. Pick a name — you can only do this once.
                </p>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => { setUsernameInput(e.target.value); setUsernameError('') }}
                  placeholder="your_name"
                  maxLength={20}
                  className="sg-input font-karla font-600 w-full mb-1"
                  style={{ fontSize: '0.88rem' }}
                  spellCheck={false}
                  autoComplete="off"
                  autoCapitalize="none"
                  onKeyDown={e => e.key === 'Enter' && saveUsername()}
                />
                <p className="font-karla font-300 mb-4" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
                  3–20 chars · letters, numbers, underscores · one time only
                </p>
                {usernameError && (
                  <p className="font-karla font-600 mb-3" style={{ fontSize: '0.68rem', color: '#f87171' }}>{usernameError}</p>
                )}
                <button
                  onClick={saveUsername}
                  disabled={usernameSaving || usernameInput.trim().length < 3}
                  className="w-full font-karla font-700 uppercase tracking-[0.12em] mb-2"
                  style={{
                    padding: '0.7rem', borderRadius: 10, fontSize: '0.68rem',
                    background: 'rgba(240,192,64,0.15)', border: '1px solid rgba(240,192,64,0.4)',
                    color: '#f0c040', cursor: usernameSaving ? 'not-allowed' : 'pointer',
                    opacity: (usernameSaving || usernameInput.trim().length < 3) ? 0.5 : 1,
                  }}
                >
                  {usernameSaving ? 'Saving…' : 'Set Captain Name'}
                </button>
                <button
                  onClick={dismissUsernamePrompt}
                  className="w-full font-karla font-600"
                  style={{ padding: '0.5rem', fontSize: '0.65rem', color: '#4a4845', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Maybe later
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>

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
