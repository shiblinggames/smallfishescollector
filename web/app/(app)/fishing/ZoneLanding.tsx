'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL, ZONE_WAIT_BASE, BASE_CRATE_CHANCE, zoneDiamondShare, zonePetPerCrate } from './zoneData'
import { updateUsername } from '@/app/(app)/u/actions'
import FisherPose from '@/components/FisherPose'
import { StatLevelBar } from '@/components/StatLevelBar'
import { PRESTIGE_MAX, goldenBoostPct, goldenBoostMult } from '@/lib/zoneRewards'
import { SHINY_ODDS } from '@/lib/shiny'
import { getXPProgress } from '@/lib/fishingLevel'

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

/* Prestige standing as a row of five stars filled by level. At the cap all five
   light gold with a "Max Prestige" flourish — the earned finish line. */
function PrestigeMark({ level }: { level: number }) {
  const isMax = level >= PRESTIGE_MAX
  const GOLD = '#f0c040'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, whiteSpace: 'nowrap' }}>
      <span style={{ display: 'inline-flex', gap: 1.5 }}>
        {Array.from({ length: PRESTIGE_MAX }).map((_, i) => (
          <svg key={i} width="10" height="10" viewBox="0 0 24 24" aria-hidden
            fill={i < level ? GOLD : 'rgba(255,255,255,0.24)'}
            style={{ filter: i < level ? `drop-shadow(0 0 3px ${GOLD}bb)` : 'none' }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
          </svg>
        ))}
      </span>
      {isMax && (
        <span className="font-karla font-800 uppercase" style={{
          fontSize: '0.58rem', letterSpacing: '0.08em',
          backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Max</span>
      )}
    </span>
  )
}

/* One label/value row in the expanded Details panel. */
function DetailStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
      <span className="font-karla font-600" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.58)', whiteSpace: 'nowrap' }}>{label}</span>
      <span className="font-karla font-700" style={{ fontSize: '0.7rem', color: accent ?? 'rgba(255,255,255,0.92)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

export default function ZoneLanding({
  fishingLevel, fishingXP, username, zoneStats, zoneCollection, prestigeLevels, goldenBoosts, ancientDeepUnlocked, onSelect,
  currentZone, characterColor, equippedHat, equippedBoat, equippedPet, rodTier, reelTier, hookTier,
}: {
  fishingLevel: number
  fishingXP: number
  username: string
  zoneStats: Record<string, ZoneStat>
  /** Species caught vs zone total (this prestige cycle), every zone alike. */
  zoneCollection: Record<string, { caught: number; total: number }>
  prestigeLevels: Record<string, number>
  /** Per-zone golden boost (wipes past Max Prestige) — +10% golden odds each. */
  goldenBoosts: Record<string, number>
  /** Ancient Deep is gated on Fishing 75 AND clearing Chapter 3 (or grandfathered). */
  ancientDeepUnlocked: boolean
  onSelect: (zone: ZoneKey) => void
  /** The zone the player last fished — its panel shows their fisher composite. */
  currentZone: ZoneKey | null
  characterColor: string
  equippedHat: string | null
  equippedBoat: string | null
  equippedPet: string | null
  rodTier: number
  reelTier: number
  hookTier: number
}) {
  // Which zone's Details strip is open (accordion — one at a time). Keeps the
  // numbers off the water until asked for.
  const [detailsFor, setDetailsFor] = useState<ZoneKey | null>(null)
  // Scroll cue — a glowing chevron that invites you to dive deeper, hidden once
  // you've reached the bottom (or if the column already fits without scrolling).
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [showScrollCue, setShowScrollCue] = useState(false)
  const syncScrollCue = () => {
    const el = scrollRef.current
    if (!el) return
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
    setShowScrollCue(!atEnd && el.scrollHeight > el.clientHeight + 8)
  }
  useEffect(() => { syncScrollCue() }, [])

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

        {/* Deep-water backdrop — a painted water column (sunlit surface + god-rays
            up top, abyssal black at the bottom) under a soft tonal ramp so the
            header + zone nodes stay legible while the scene reads through. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fishing-zones-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,14,22,0.3) 0%, rgba(4,10,16,0.42) 42%, rgba(2,6,10,0.66) 100%)' }} />
        </div>

        {/* Content shell — header pinned up top, only the zones scroll beneath. */}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header — a level medallion + XP-to-next bar, with ranks + guide on
              the right. Stays pinned as you dive. */}
          {(() => {
            const xp = getXPProgress(fishingXP)
            const atMax = xp.level >= 100
            const toNext = atMax ? 0 : xp.xpForLevel - xp.xpInLevel
            return (
              <div style={{ flexShrink: 0, padding: '0.85rem 0.9rem 0.7rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {/* Fishing level bar — the SAME shared pill as the raids' Nav bar,
                    just gold + FISH instead of green + NAV. */}
                <StatLevelBar level={xp.level} progress={xp.progress} toGo={toNext} isMax={atMax} accent="#f0c040" label="FISH" />
              </div>
            )
          })()}

          {/* Scroll area — only the zones scroll (header stays pinned). Gentle
              y-snap so each dive settles on a zone. */}
          <div ref={scrollRef} onScroll={syncScrollCue} style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollSnapType: 'y proximity', scrollPaddingTop: '1.6rem', padding: '0.5rem 0.9rem 1.5rem' }}>

          {/* The descent — each zone is a large circular node on a path, linked
              to the next one down. Scroll to dive from the bright surface to the
              Ancient Deep. */}
          <div style={{ position: 'relative', paddingTop: 30, paddingBottom: 12 }}>
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              // Ancient Deep needs Fishing 75 AND Chapter 3 cleared (or grandfathered).
              const accessible = fishingLevel >= minLevel && (zone !== 'ancient_deep' || ancientDeepUnlocked)
              const color = HABITAT_COLOR[zone]
              const prevColor = i > 0 ? HABITAT_COLOR[ZONES[i - 1]] : color
              const difficulty = ZONE_DIFFICULTY[zone]
              const diffLabel = ZONE_DIFFICULTY_LABEL[zone]
              const stats = zoneStats[zone] ?? { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
              const col = zoneCollection[zone] ?? { caught: 0, total: 0 }
              const colDone = col.total > 0 && col.caught >= col.total
              const prestige = prestigeLevels[zone] ?? 0
              const isCurrent = accessible && zone === currentZone
              const enter = () => { if (accessible) onSelect(zone) }

              return (
                <div key={zone} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', scrollSnapAlign: 'start' }}>
                  {/* Connector down from the node above — the path linking them. */}
                  {i > 0 && (
                    <div aria-hidden style={{ width: 4, height: 34, borderRadius: 2, marginBottom: 6, background: `linear-gradient(180deg, ${prevColor}, ${color})`, opacity: accessible ? 0.85 : 0.32, boxShadow: accessible ? `0 0 8px ${color}55` : 'none' }} />
                  )}

                  {/* The node — a big circular window into the zone */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.06, scale: { type: 'spring', stiffness: 420, damping: 26, delay: 0 } }}
                    whileTap={accessible ? { scale: 0.96 } : undefined}
                    onClick={enter}
                    style={{ position: 'relative', width: 200, height: 200, flexShrink: 0, cursor: accessible ? 'pointer' : 'default', WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }}
                  >
                    {/* Pulsing halo — signals a tappable node */}
                    {accessible && (
                      <motion.div aria-hidden
                        animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.045, 1] }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ position: 'absolute', inset: -5, borderRadius: '50%', boxShadow: `0 0 24px ${color}70`, border: `1px solid ${color}55`, pointerEvents: 'none' }} />
                    )}
                    {/* Art disc — clips the art to the circle. */}
                    <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden', border: `3px solid ${accessible ? color : 'rgba(255,255,255,0.16)'}`, boxShadow: accessible ? '0 10px 28px rgba(0,0,0,0.5), inset 0 0 34px rgba(0,0,0,0.4)' : 'inset 0 0 30px rgba(0,0,0,0.7)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={ZONE_BG[zone]} alt="" className={accessible ? 'zone-art-drift' : undefined} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: accessible ? 'none' : 'grayscale(0.9) brightness(0.34)', ...(accessible ? { animationDuration: `${22 + i * 4}s`, animationDelay: `-${i * 9}s` } : {}) }} />
                      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 44%, transparent 40%, rgba(2,6,12,0.9) 100%)' }} />
                      {!accessible && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                        </div>
                      )}
                    </div>

                    {/* Your fisher — sits at the base of the node, OUTSIDE the disc's
                        round clip so the boat is never cut off. */}
                    {isCurrent && (
                      <div aria-hidden style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', width: '48%', zIndex: 2, pointerEvents: 'none', filter: 'drop-shadow(0 6px 12px rgba(0,10,25,0.65))' }}>
                        <FisherPose characterColor={characterColor} equippedHat={equippedHat} equippedBoat={equippedBoat} equippedPet={equippedPet} rodTier={rodTier} reelTier={reelTier} hookTier={hookTier} />
                      </div>
                    )}

                    {/* Zone name — centered in the node, above the fisher. */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 14px', zIndex: 3, pointerEvents: 'none' }}>
                      <p className="font-cinzel font-800" style={{ fontSize: '1.5rem', textAlign: 'center', color: accessible ? '#fdf7e8' : 'rgba(253,247,232,0.5)', lineHeight: 1.05, textShadow: `0 2px 6px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85), 0 0 24px ${color}66` }}>
                        {HABITAT_LABEL[zone]}
                      </p>
                      {isCurrent && (
                        <span className="font-karla font-800 uppercase" style={{ marginTop: 6, padding: '0.12rem 0.5rem', borderRadius: 999, background: 'rgba(2,6,12,0.72)', border: `1px solid ${color}`, fontSize: '0.5rem', letterSpacing: '0.14em', color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>You are here</span>
                      )}
                    </div>
                  </motion.div>

                  {/* Info under the node */}
                  <div style={{ marginTop: 12, width: '100%', maxWidth: 340, textAlign: 'center' }}>
                    {accessible ? (
                      <>
                        <p className="font-karla font-400 italic" style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.82)' }}>{HABITAT_TAGLINE[zone]}</p>

                        {/* Standing line: collection + prestige + golden boost. */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
                          <span className="font-karla font-600" style={{ fontSize: '0.78rem', color: colDone ? '#f0c040' : 'rgba(255,255,255,0.82)', whiteSpace: 'nowrap' }}>
                            {colDone ? '✦ all charted' : `${col.caught} of ${col.total} logged`}
                          </span>
                          {prestige > 0 && <PrestigeMark level={prestige} />}
                          {(goldenBoosts[zone] ?? 0) > 0 && (
                            <span className="font-karla font-800" style={{ fontSize: '0.6rem', color: '#f0c040', letterSpacing: '0.04em', whiteSpace: 'nowrap', textShadow: '0 0 6px rgba(240,192,64,0.5)' }}>
                              ✦ +{goldenBoostPct(goldenBoosts[zone] ?? 0)}% Goldens
                            </span>
                          )}
                        </div>

                        {/* Details toggle. */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailsFor(d => (d === zone ? null : zone)) }}
                            aria-label={`${HABITAT_LABEL[zone]} catch details`}
                            className="font-karla font-600"
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 4px', color: 'rgba(255,255,255,0.72)', fontSize: '0.74rem' }}
                          >
                            Details
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: detailsFor === zone ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                        </div>

                        {/* Tap-to-see panel — the full zone read. */}
                        <AnimatePresence initial={false}>
                          {detailsFor === zone && (() => {
                            const [zMin, zMax] = ZONE_WAIT_BASE[zone] ?? [5000, 20000]
                            const cycleSec = (zMin + 0.3 * (zMax - zMin)) / 1000 + 4
                            const perHr = 3600 / cycleSec
                            const doubPerHr = Math.round((perHr * stats.avgValue) / 100) * 100
                            const xpPerHr = Math.round((perHr * stats.avgXp) / 10) * 10
                            const noCrates = zone === 'ancient_deep'
                            const goldenOdds = Math.round(SHINY_ODDS / goldenBoostMult(goldenBoosts[zone] ?? 0))
                            const round1 = (v: number) => (v * 100).toFixed(1)
                            return (
                              <motion.div
                                key="details"
                                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: 'easeOut' }}
                                style={{ overflow: 'hidden', textAlign: 'left' }}
                              >
                                <div style={{ marginTop: 11, padding: '10px 12px 11px', borderRadius: 12, background: 'rgba(3,8,14,0.92)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 6px 20px rgba(0,0,0,0.45)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                                    <WaveMarks n={difficulty} color={color} />
                                    <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>{diffLabel}</span>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, rowGap: 7 }}>
                                    <DetailStat label="Bite wait" value={`${Math.round(zMin / 1000)}–${Math.round(zMax / 1000)}s`} />
                                    <DetailStat label="Golden" value={`1 in ${goldenOdds.toLocaleString()}`} accent="#f0c040" />
                                    <DetailStat label="Doubloons / hr" value={`~${doubPerHr.toLocaleString()} ⟡`} accent="#f0c040" />
                                    <DetailStat label="XP / hr" value={`~${xpPerHr.toLocaleString()}`} accent="#7dd3fc" />
                                    <DetailStat label="Avg catch" value={`${stats.avgValue.toLocaleString()} ⟡`} />
                                    <DetailStat label="Top catch" value={`${stats.topValue.toLocaleString()} ⟡`} accent="#f59e0b" />
                                    <DetailStat label="Crate / cast" value={noCrates ? 'None' : `~${Math.round(BASE_CRATE_CHANCE * 100)}%`} />
                                    <DetailStat label="Diamond crate" value={noCrates ? '—' : `${Math.round(zoneDiamondShare(zone) * 100)}%`} />
                                    <DetailStat label="Pet / crate" value={noCrates ? 'None' : `${round1(zonePetPerCrate(zone))}%`} />
                                  </div>
                                  <p className="font-karla" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.42)', fontStyle: 'italic', marginTop: 8, lineHeight: 1.4 }}>
                                    Rates estimated at base gear. Faster bites and better crates come with your rod, bait, and level.
                                  </p>
                                </div>
                              </motion.div>
                            )
                          })()}
                        </AnimatePresence>
                      </>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>
                          {zone === 'ancient_deep' && fishingLevel >= minLevel ? 'Clear Chapter 3 to enter' : `Unlocks at Level ${minLevel}`}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          </div>

          {/* Scroll cue — a glowing, bobbing double chevron over the bottom edge,
              telling players there's more water to dive into. Fades once you've
              reached the deep (or if the column already fits). */}
          <AnimatePresence>
            {showScrollCue && (
              <motion.div aria-hidden
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                style={{ position: 'absolute', left: '50%', bottom: 12, transform: 'translateX(-50%)', zIndex: 4, pointerEvents: 'none' }}>
                <motion.div
                  animate={{ y: [0, 5, 0], boxShadow: ['0 0 8px rgba(125,211,252,0.35)', '0 0 18px rgba(125,211,252,0.75)', '0 0 8px rgba(125,211,252,0.35)'] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,10,18,0.72)', border: '1px solid rgba(125,211,252,0.6)' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7dd3fc" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m6 5 6 6 6-6" /><path d="m6 12 6 6 6-6" /></svg>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

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


      </div>
    </div>
  )
}
