'use client'

import { useState, useEffect, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL } from './zoneData'
import { updateUsername } from '@/app/(app)/u/actions'
import LeaderboardModal from '@/components/LeaderboardModal'

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
  shallows:    'Bright water, gentle currents',
  open_waters: 'Open blue, horizon to horizon',
  deep:        'Dusk settles over deep water',
  abyss:       'Cold and dark, far from any light',
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
  ancient_deep: 'Beyond Expert',
}

/** Per-zone summary stats computed server-side (see fishing/page.tsx). */
export type ZoneStat = { avgValue: number; avgXp: number; topValue: number; count: number }

// The zone's painted scene, reused as the card background (same art as the
// fishing scene + the profile backgrounds).
const ZONE_BG: Record<string, string> = {
  shallows:    '/shallows.jpg',
  open_waters: '/openwaters.jpg',
  deep:        '/deep.jpg',
  abyss:       '/abyss.jpg',
  ancient_deep: '/ancient.jpg',
}

function ZoneStatCell({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', background: 'rgba(2,6,12,0.6)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9, padding: '0.45rem 0.3rem', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)' }}>
      <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</p>
      <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>{label}</p>
    </div>
  )
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
    body: "When your hold is full you can't cast — sell some catch from the Hold drawer to make room. You can also upgrade the hold for more capacity right from the Hold drawer on the fishing screen.",
  },
  {
    title: 'Gear Summary',
    body: 'Rod → faster bites. Reel → slows the dial. Hook → widens the catch zone. Line → shrinks snag zones. Bait → faster bites + wider catch zone. Ship → fish hold capacity.',
  },
]

export default function ZoneLanding({
  fishingLevel, fishingXP, uniqueSpeciesCaught, highestPerfectStreak, username, zoneStats, onSelect,
}: {
  fishingLevel: number
  fishingXP: number
  uniqueSpeciesCaught: number
  highestPerfectStreak: number
  username: string
  zoneStats: Record<string, ZoneStat>
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
        <img src="/fishing.webp" alt="" style={{
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
            <div className="flex items-center gap-2 flex-shrink-0">
              <LeaderboardModal boards={['perfectStreak', 'fishingLevel']} title="Fishing Leaderboard" />
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
              const stats = zoneStats[zone] ?? { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
              const isRecommended = accessible && ZONES.filter(z => fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1)).slice(-1)[0] === zone

              return (
                <motion.div key={zone}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  /* scale gets its own zero-delay spring — the entrance stagger
                     delay must never apply to press feedback or lower cards
                     would respond a beat late. */
                  transition={{
                    duration: 0.22, delay: i * 0.07,
                    scale: { type: 'spring', stiffness: 520, damping: 28, delay: 0 },
                  }}
                  /* Tactile press: the card sinks like a physical tile under the
                     thumb; snappy spring so release pops back with a little life.
                     Locked cards stay inert. */
                  whileTap={accessible ? { scale: 0.965 } : undefined}
                  onClick={() => accessible && onSelect(zone)}
                  style={{
                    position: 'relative',
                    borderRadius: 16,
                    overflow: 'hidden',
                    border: `1px solid ${accessible ? color + '66' : 'rgba(255,255,255,0.12)'}`,
                    minHeight: accessible ? 142 : 84,
                    cursor: accessible ? 'pointer' : 'default',
                    // Resting depth so the card reads as a raised object you can
                    // press down, not a flat panel.
                    boxShadow: accessible
                      ? `0 3px 10px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 14px ${color}14`
                      : '0 1px 4px rgba(0,0,0,0.3)',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  {/* Zone scene as the card background (same art as the fishing
                      scene + the profile backgrounds). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ZONE_BG[zone]} alt="" style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center',
                    filter: accessible ? 'none' : 'grayscale(0.85) brightness(0.4)',
                  }} />
                  {/* Legibility scrim — darker toward the bottom where stats sit. */}
                  <div style={{ position: 'absolute', inset: 0, background: accessible
                    ? 'linear-gradient(180deg, rgba(4,10,18,0.5) 0%, rgba(4,10,18,0.34) 34%, rgba(4,10,18,0.88) 100%)'
                    : 'rgba(4,10,18,0.72)' }} />
                  {/* Accent edge in the zone color. */}
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accessible ? color : 'rgba(255,255,255,0.18)' }} />

                  <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', padding: '0.9rem 1rem 0.85rem' }}>
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-cinzel font-700"
                            style={{ fontSize: '1.18rem', color: accessible ? '#f5f2ec' : '#6a6764', letterSpacing: '0.04em', lineHeight: 1, textShadow: accessible ? '0 1px 6px rgba(0,0,0,0.75)' : 'none' }}>
                            {HABITAT_LABEL[zone]}
                          </p>
                          {isRecommended && (
                            <span className="font-karla font-700 uppercase tracking-[0.1em]"
                              style={{
                                fontSize: '0.55rem', color: '#fff',
                                background: `${color}cc`, border: `1px solid ${color}`,
                                padding: '0.18rem 0.5rem', borderRadius: '2rem', flexShrink: 0,
                              }}>
                              Recommended
                            </span>
                          )}
                        </div>
                        <p className="font-karla font-300 italic mt-1"
                          style={{ fontSize: '0.74rem', color: accessible ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.3)', textShadow: accessible ? '0 1px 4px rgba(0,0,0,0.85)' : 'none' }}>
                          {HABITAT_TAGLINE[zone]}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-3">
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map(d => (
                            <div key={d} style={{
                              width: 6, height: 6, borderRadius: '50%',
                              background: d <= difficulty
                                ? (accessible ? color : '#3a3835')
                                : 'rgba(255,255,255,0.18)',
                              boxShadow: accessible && d <= difficulty ? `0 0 4px ${color}` : 'none',
                            }} />
                          ))}
                        </div>
                        {accessible ? (
                          <span className="font-karla font-700 uppercase tracking-[0.08em]"
                            style={{ fontSize: '0.54rem', color: '#fff', whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>
                            {diffLabel}
                          </span>
                        ) : (
                          <span className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{
                              fontSize: '0.6rem', color: '#cdd3da',
                              background: 'rgba(2,6,12,0.6)',
                              border: '1px solid rgba(255,255,255,0.18)',
                              padding: '0.2rem 0.55rem', borderRadius: '2rem',
                            }}>
                            Unlocks at Lv {minLevel}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Zone stat row. Ancient Deep fish are kept trophies (no
                        sell value), so it shows trophy/rarity stats instead. */}
                    {accessible && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: '0.9rem' }}>
                        {zone === 'ancient_deep' ? (
                          <>
                            <ZoneStatCell label="Trophies" value={`${stats.count}`} color="#c084fc" />
                            <ZoneStatCell label="Avg XP" value={`+${stats.avgXp.toLocaleString()}`} color="#60a5fa" />
                            <ZoneStatCell label="Rarity" value="Legendary" color="#f59e0b" />
                          </>
                        ) : (
                          <>
                            <ZoneStatCell label="Avg Value" value={`${stats.avgValue.toLocaleString()} ⟡`} color="#f0c040" />
                            <ZoneStatCell label="Avg XP" value={`+${stats.avgXp.toLocaleString()}`} color="#60a5fa" />
                            <ZoneStatCell label="Top Catch" value={`${stats.topValue.toLocaleString()} ⟡`} color="#f59e0b" />
                          </>
                        )}
                      </div>
                    )}
                  </div>
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
