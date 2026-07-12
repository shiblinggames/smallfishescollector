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

// Chart depths for the sounding line down the right edge — flavor, not math.
// Plain feet: "ftm" (fathoms) read as jargon nobody knew.
const ZONE_FATHOMS: Record<string, string> = {
  shallows:    '12 ft',
  open_waters: '60 ft',
  deep:        '240 ft',
  abyss:       '600 ft',
  ancient_deep: 'no chart',
}

const ZONE_DIFFICULTY: Record<string, number> = {
  shallows:    1,
  open_waters: 2,
  deep:        3,
  abyss:       4,
  ancient_deep: 5,
}

// Sea voice, not app-store difficulty copy — the dots carry the scale.
const ZONE_DIFFICULTY_LABEL: Record<string, string> = {
  shallows:    'Gentle Water',
  open_waters: 'Fair Seas',
  deep:        'Rough Water',
  abyss:       'Cruel Water',
  ancient_deep: 'Beyond Reckoning',
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

/* Difficulty as drawn wave marks — one hump per point of rough water.
   Replaces the old dot row (dots read as generic app-store rating). */
function WaveMarks({ n, color, dim }: { n: number; color: string; dim?: boolean }) {
  return (
    <svg width={n * 11} height="10" viewBox={`0 0 ${n * 11} 10`} fill="none" aria-hidden style={{ display: 'block' }}>
      {Array.from({ length: n }).map((_, k) => (
        <path key={k} d={`M${k * 11 + 1} 7 q4.5 -7 9 0`} stroke={dim ? 'rgba(255,255,255,0.28)' : color} strokeWidth="1.7" strokeLinecap="round" />
      ))}
    </svg>
  )
}

/* Slim inline stat — value + tiny label, no box. The zone art does the
   talking; stats sit quietly on the bottom scrim. */
function ZoneStatInline({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <p className="font-karla" style={{ lineHeight: 1, whiteSpace: 'nowrap' }}>
      <span className="font-cinzel font-700" style={{ fontSize: '0.95rem', color }}>{value}</span>
      <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.65)', marginLeft: 6 }}>{label}</span>
    </p>
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
  fishingLevel, fishingXP, username, zoneStats, zoneCollection, prestigeLevels, onSelect,
}: {
  fishingLevel: number
  fishingXP: number
  username: string
  zoneStats: Record<string, ZoneStat>
  /** Species caught vs zone total (this prestige cycle); trophies for Ancient Deep. */
  zoneCollection: Record<string, { caught: number; total: number }>
  prestigeLevels: Record<string, number>
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

        {/* Deep-water backdrop — the page IS the water column: surface
            light up top, abyssal black at the bottom. No photo underlay,
            no boxed chrome; the five zone scenes carry all the art. */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0b1a29 0%, #071220 32%, #04090f 68%, #020307 100%)' }} />

        {/* Content */}
        <div style={{
          position: 'relative', zIndex: 1, height: '100%',
          display: 'flex', flexDirection: 'column',
          padding: '1.1rem 0.9rem 1.5rem',
          overflowY: 'auto',
        }}>
          {/* Header — one question, one breath. The old XP/species/streak
              strip is gone (that summary lives on the player profile now). */}
          <div className="flex items-end justify-between mb-3">
            <div style={{ minWidth: 0 }}>
              <p className="font-karla font-700 uppercase tracking-[0.22em]" style={{ fontSize: '0.56rem', color: 'rgba(196,169,106,0.85)' }}>
                Fishing · Level {fishingLevel}
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f0ede8', lineHeight: 1.15, marginTop: 2 }}>
                Where do you cast?
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingBottom: 3 }}>
              <LeaderboardModal boards={['perfectStreak', 'fishingLevel', 'totalPrestige']} title="Fishing Leaderboard" />
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

          {/* The water column — five contiguous bands of sea, no boxes, no
              gaps. Each band is that zone's painted scene; seams blend band
              into band, a shared darkness overlay deepens toward the bottom,
              and the sounding line down the right edge marks the fathoms.
              One continuous descent, surface to the Ancient Deep. */}
          <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)' }}>
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              const accessible = fishingLevel >= minLevel
              const color = HABITAT_COLOR[zone]
              const difficulty = ZONE_DIFFICULTY[zone]
              const diffLabel = ZONE_DIFFICULTY_LABEL[zone]
              const stats = zoneStats[zone] ?? { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
              const col = zoneCollection[zone] ?? { caught: 0, total: 0 }
              const colPct = col.total > 0 ? Math.min(100, (col.caught / col.total) * 100) : 0
              const colDone = col.total > 0 && col.caught >= col.total
              const prestige = prestigeLevels[zone] ?? 0
              const isRecommended = accessible && ZONES.filter(z => fishingLevel >= (ZONE_MIN_LEVEL[z] ?? 1)).slice(-1)[0] === zone

              return (
                <motion.div
                  key={zone}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  /* scale gets its own zero-delay spring — the entrance stagger
                     delay must never apply to press feedback or lower bands
                     would respond a beat late. */
                  transition={{
                    duration: 0.26, delay: i * 0.08,
                    scale: { type: 'spring', stiffness: 520, damping: 28, delay: 0 },
                  }}
                  whileTap={accessible ? { scale: 0.985 } : undefined}
                  onClick={() => accessible && onSelect(zone)}
                  style={{
                    position: 'relative', overflow: 'hidden',
                    minHeight: accessible ? 138 : 84,
                    cursor: accessible ? 'pointer' : 'default',
                    WebkitTapHighlightColor: 'transparent',
                    touchAction: 'manipulation',
                  }}
                >
                  {/* Zone scene, full-bleed. Accessible bands get the living-
                      scene drift (globals.css); per-band duration + negative
                      delay desync the loops. Locked bands stay static — they
                      carry a grayscale filter, and transform animation on a
                      filtered element is a perf trap. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={ZONE_BG[zone]} alt="" className={accessible ? 'zone-art-drift' : undefined} style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    objectFit: 'cover', objectPosition: 'center',
                    filter: accessible ? 'none' : 'grayscale(0.9) brightness(0.32)',
                    ...(accessible ? { animationDuration: `${22 + i * 4}s`, animationDelay: `-${i * 9}s` } : {}),
                  }} />
                  {/* Band scrim — light from above, heavier where the text sits. */}
                  <div style={{ position: 'absolute', inset: 0, background: accessible
                    ? 'linear-gradient(180deg, rgba(4,10,18,0.44) 0%, rgba(4,10,18,0.14) 42%, rgba(3,8,14,0.8) 100%)'
                    : 'rgba(3,7,12,0.55)' }} />
                  {/* Seam — each band surfaces out of the one above it. */}
                  {i > 0 && (
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, background: 'linear-gradient(180deg, rgba(2,4,10,0.6), rgba(2,4,10,0))', pointerEvents: 'none' }} />
                  )}

                  {/* Tap affordance — a chevron chip at the right edge so an
                      open water reads as a row you can enter, not a mural.
                      Locked bands get none; the contrast does the teaching. */}
                  {accessible && (
                    <div aria-hidden style={{
                      position: 'absolute', right: 20, top: '50%', transform: 'translateY(-50%)', zIndex: 2,
                      width: 28, height: 28, borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(2,6,12,0.55)',
                      border: `1.5px solid ${color}aa`,
                      boxShadow: `0 0 10px ${color}33`,
                      pointerEvents: 'none',
                    }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg>
                    </div>
                  )}

                  {/* Fathom mark — a tick off the sounding line. */}
                  <div style={{ position: 'absolute', top: 9, right: 7, display: 'flex', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
                    <span className="font-karla font-600 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.55)', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                      {ZONE_FATHOMS[zone]}
                    </span>
                    <span aria-hidden style={{ width: 10, height: 1, background: 'rgba(255,255,255,0.45)' }} />
                  </div>

                  {/* No height:100% here — content must always define the band's
                      height (a percentage against the min-height clamped the
                      Ancient Deep band and clipped its bottom row). The last
                      band gets extra bottom padding to clear the column's
                      rounded clip + descent overlay. */}
                  <div style={{ position: 'relative', zIndex: 1, minHeight: 'inherit', display: 'flex', flexDirection: 'column', padding: accessible ? `1rem 1.05rem ${i === ZONES.length - 1 ? '1.15rem' : '0.85rem'}` : '0 1.05rem', justifyContent: accessible ? 'flex-start' : 'center' }}>
                    {accessible ? (
                      <>
                        <div className="flex items-start justify-between" style={{ paddingRight: 46 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-cinzel font-700"
                                style={{ fontSize: '1.34rem', color: '#f5f2ec', letterSpacing: '0.03em', lineHeight: 1, textShadow: '0 1px 8px rgba(0,0,0,0.8)' }}>
                                {HABITAT_LABEL[zone]}
                              </p>
                              {isRecommended && (
                                <span className="font-karla font-700 uppercase tracking-[0.1em]"
                                  style={{
                                    fontSize: '0.55rem', color: '#fff',
                                    background: `${color}cc`, border: `1px solid ${color}`,
                                    padding: '0.18rem 0.5rem', borderRadius: '2rem', flexShrink: 0,
                                  }}>
                                  Fish Here
                                </span>
                              )}
                            </div>
                            <p className="font-karla font-300 italic mt-1"
                              style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.85)', textShadow: '0 1px 4px rgba(0,0,0,0.85)' }}>
                              {HABITAT_TAGLINE[zone]}
                            </p>
                          </div>
                        </div>
                        {/* Your standing in this water — collection progress bar
                            (gold once complete: prestige is waiting) + prestige
                            level. Fills what was dead space mid-band. */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 'auto', paddingTop: '0.8rem', paddingRight: 40, textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                            <div style={{ flex: 1, maxWidth: 110, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                              <div style={{ width: `${colPct}%`, height: '100%', borderRadius: 999, background: colDone ? '#f0c040' : color, boxShadow: `0 0 6px ${colDone ? '#f0c040' : color}` }} />
                            </div>
                            <span className="font-karla font-700" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                              {col.caught}/{col.total}
                              <span className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.6)', marginLeft: 5 }}>
                                {zone === 'ancient_deep' ? 'trophies' : 'collected'}
                              </span>
                            </span>
                          </div>
                          {/* Prestige ladder: bronze (1-2) → silver (3-4) →
                              gold (5-6) → prismatic text at 7+, matching the
                              badges-page grandmaster treatment. */}
                          {prestige >= 7 ? (
                            <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{
                              flexShrink: 0, fontSize: '0.6rem',
                              backgroundImage: 'linear-gradient(90deg, #7dd3fc, #f0c040, #f472b6, #a78bfa)',
                              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                            }}>
                              Prestige {prestige}
                            </span>
                          ) : prestige > 0 ? (() => {
                            const tc = prestige >= 5 ? '#f0c040' : prestige >= 3 ? '#d7dee8' : '#e0a96d'
                            return (
                              <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{
                                flexShrink: 0, fontSize: '0.54rem', color: tc,
                                background: `${tc}22`, border: `1px solid ${tc}70`,
                                padding: '0.16rem 0.5rem', borderRadius: '2rem',
                              }}>
                                Prestige {prestige}
                              </span>
                            )
                          })() : null}
                        </div>

                        {/* Bottom line — rough-water marks left, catch stats right.
                            Ancient Deep fish are kept trophies (no sell value), so
                            it shows trophy/rarity reads instead. */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, paddingTop: '0.55rem', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                            <WaveMarks n={difficulty} color={color} />
                            <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                              {diffLabel}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                            {zone === 'ancient_deep' ? (
                              <ZoneStatInline label="Rarity" value="Legendary" color="#f59e0b" />
                            ) : (
                              <>
                                <ZoneStatInline label="Avg" value={`${stats.avgValue.toLocaleString()} ⟡`} color="#f0c040" />
                                <ZoneStatInline label="Top" value={`${stats.topValue.toLocaleString()} ⟡`} color="#f59e0b" />
                              </>
                            )}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between" style={{ paddingRight: 46 }}>
                        <p className="font-cinzel font-700"
                          style={{ fontSize: '1.15rem', color: 'rgba(255,255,255,0.42)', letterSpacing: '0.03em', lineHeight: 1 }}>
                          {HABITAT_LABEL[zone]}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <WaveMarks n={difficulty} color={color} dim />
                          <span className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{
                              fontSize: '0.58rem', color: '#cdd3da',
                              background: 'rgba(2,6,12,0.6)',
                              border: '1px dashed rgba(255,255,255,0.28)',
                              padding: '0.2rem 0.55rem', borderRadius: '2rem', whiteSpace: 'nowrap',
                            }}>
                            Unlocks at Lv {minLevel}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}

            {/* Shared descent darkening — one continuous fall into the dark,
                laid over every band so the column reads as one body of water. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(2,4,10,0) 0%, rgba(2,4,10,0.1) 45%, rgba(2,3,8,0.38) 100%)' }} />
            {/* The sounding line — a plumb line down the right edge. */}
            <div aria-hidden style={{ position: 'absolute', top: 12, bottom: 12, right: 12, width: 1, background: 'linear-gradient(180deg, rgba(255,255,255,0.32), rgba(255,255,255,0.04))', pointerEvents: 'none' }} />
          </div>

          <p className="font-karla font-300 italic" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.32)', textAlign: 'center', marginTop: 12 }}>
            Five waters, each deeper than the last.
          </p>
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
                  background: 'linear-gradient(180deg, #241a10 0%, #140d07 100%)',
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
                  background: 'linear-gradient(180deg, #241a10 0%, #140d07 100%)',
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
                    aria-label="Close"
                    style={{ color: 'rgba(255,255,255,0.45)', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none', padding: '0.15rem 0.3rem', display: 'flex' }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
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
