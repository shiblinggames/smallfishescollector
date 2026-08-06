'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL, ZONE_WAIT_BASE, ZONE_BG, zoneCrateChance, zoneDiamondShare, zonePetPerCrate } from './zoneData'
import { updateUsername } from '@/app/(app)/u/actions'
import FisherPose from '@/components/FisherPose'
import { PRESTIGE_MAX, goldenBoostPct, goldenBoostMult } from '@/lib/zoneRewards'
import { SHINY_ODDS } from '@/lib/shiny'

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
  // One star and a count, not five pips. The zone cards are two to a row now
  // and a five-pip rail plus a "MAX" word ate more of the standing line than
  // the collection count it sits beside.
  return (
    <span className="font-karla font-800" style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0, whiteSpace: 'nowrap', fontSize: '0.55rem', letterSpacing: '0.02em' }}>
      <svg width="10" height="10" viewBox="0 0 24 24" aria-hidden fill={GOLD} style={{ filter: `drop-shadow(0 0 3px ${GOLD}bb)` }}>
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
      </svg>
      {isMax ? (
        <span className="uppercase" style={{
          backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8)',
          WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
        }}>Max</span>
      ) : (
        <span style={{ color: GOLD }}>{level}</span>
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
  onBack,
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
  /** Back to the Fishing hub — the selector is a view inside it now, not the
   *  landing page, so it owns the way out. */
  onBack: () => void
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

  // Escape closes, same as the campaign map overlay.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

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

  // Portal to <body> at the app's modal layer, the same shell the campaign map
  // uses. Previously this sat INSIDE the nav chrome (top-44/bottom-60, z40),
  // which made it read as a page rather than as the full-page modal the
  // Campaign tile opens. Escaping to the body also gets it out from under the
  // fixed Nav header, which is a root-level z50 sibling.
  return createPortal(
    <div role="dialog" aria-modal
      style={{ position: 'fixed', inset: 0, zIndex: 111, background: '#08121c', display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-lg overflow-hidden" style={{ height: '100%' }}>

        {/* Deep-water backdrop — a painted water column (sunlit surface + god-rays
            up top, abyssal black at the bottom) under a soft tonal ramp so the
            header + zone nodes stay legible while the scene reads through. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/fishing-zones-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(5,14,22,0.3) 0%, rgba(4,10,16,0.42) 42%, rgba(2,6,10,0.66) 100%)' }} />
        </div>

        {/* Content shell. */}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>

          {/* Fixed header — mirrors the campaign map overlay's: section
              eyebrow + destination on the left, close on the right, on an
              opaque bar with a hairline under it. Outside the scroll area so
              the close stays reachable five zones down the descent. Palette is
              fishing's blue where the campaign's is parchment gold. */}
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 'calc(env(safe-area-inset-top, 0px) + 0.7rem) 1rem 0.7rem',
            background: 'rgba(6,14,22,0.96)',
            borderBottom: '1px solid rgba(125,160,216,0.18)',
          }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: 'rgba(125,160,216,0.72)', marginBottom: 1 }}>
                Fishing
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#e6efff' }}>
                The Waters
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              aria-label="Close"
              style={{
                width: 34, height: 34, borderRadius: '50%', padding: 0, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.18)',
                color: '#cfcabf', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scroll area — free scroll (no snap) so the big scene cards glide
              past naturally. */}
          <div ref={scrollRef} onScroll={syncScrollCue} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', padding: '0.9rem 0.9rem calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}>

          {/* The waters, two to a row. These were one full-bleed scene card per
              zone at 66vh, which meant one zone on screen at a time and four
              scrolls to see what you had. At this size the whole descent reads
              at a glance and picking one is a tap, not an expedition. The odd
              zone out (the Ancient Deep, last and hardest) spans the row rather
              than sitting orphaned in a column. */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 4, paddingBottom: 12 }}>
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              // Ancient Deep needs Fishing 75 AND Chapter 3 cleared (or grandfathered).
              const accessible = fishingLevel >= minLevel && (zone !== 'ancient_deep' || ancientDeepUnlocked)
              const color = HABITAT_COLOR[zone]
              const col = zoneCollection[zone] ?? { caught: 0, total: 0 }
              const colDone = col.total > 0 && col.caught >= col.total
              const prestige = prestigeLevels[zone] ?? 0
              const isCurrent = accessible && zone === currentZone
              const enter = () => { if (accessible) onSelect(zone) }
              // An odd zone count leaves the last card alone on its row. Let it
              // span instead of sitting in a half-empty row.
              const wide = i === ZONES.length - 1 && ZONES.length % 2 === 1

              return (
                <div key={zone} style={wide ? { gridColumn: 'span 2' } : undefined}>
                  {/* Art-forward zone card — the zone's painted scene, full-bleed
                      and tappable, with the name + tagline and your boat riding on
                      it. The whole card is the button; the accent border, press
                      animation, and an enter chevron read as clickable. */}
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.34, delay: i * 0.06 }}
                    whileTap={accessible ? { scale: 0.975 } : undefined}
                    onClick={enter}
                    style={{
                      position: 'relative', width: '100%', height: 170,
                      borderRadius: 16, overflow: 'hidden',
                      cursor: accessible ? 'pointer' : 'default',
                      border: `${isCurrent ? 2 : 1.5}px solid ${accessible ? (isCurrent ? color : `${color}8c`) : 'rgba(255,255,255,0.14)'}`,
                      boxShadow: isCurrent ? `0 8px 20px rgba(0,0,0,0.5), 0 0 16px ${color}44` : '0 6px 16px rgba(0,0,0,0.45)',
                      WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                    }}
                  >
                    {/* The zone's fishing scene. These plates are 1024x4128 water
                        COLUMNS, so how much of one a card shows depends entirely on
                        how tall the card is. Anchored to the top, a 170px card
                        showed the top 18% of the plate, which is all sky with the
                        horizon buried behind the caption scrim: five cards of
                        empty air. 8% down puts the horizon near the top edge and
                        gives the rest to water, which is what tells the zones
                        apart. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ZONE_BG[zone]} alt="" className={accessible ? 'zone-art-drift' : undefined} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 8%', filter: accessible ? 'none' : 'grayscale(0.92) brightness(0.4)', ...(accessible ? { animationDuration: `${24 + i * 4}s`, animationDelay: `-${i * 9}s` } : {}) }} />
                    <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(3,9,15,0.05) 0%, rgba(3,8,13,0.20) 34%, rgba(2,6,10,0.80) 74%, rgba(2,6,10,0.96) 100%)' }} />

                    {/* Top-right — current tag, enter chevron, or lock. */}
                    {!accessible ? (
                      <span aria-hidden style={{ position: 'absolute', top: 9, right: 10, display: 'grid', placeItems: 'center' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.8" strokeLinecap="round"><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                      </span>
                    ) : isCurrent ? (
                      <span className="font-karla font-800 uppercase" style={{ position: 'absolute', top: 7, right: 7, padding: '0.1rem 0.4rem', borderRadius: 999, background: 'rgba(2,6,12,0.72)', border: `1px solid ${color}`, fontSize: '0.42rem', letterSpacing: '0.1em', color: '#fff' }}>You are here</span>
                    ) : (
                      <span aria-hidden style={{ position: 'absolute', top: 7, right: 7, width: 21, height: 21, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(2,6,12,0.5)', border: `1px solid ${color}99` }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                      </span>
                    )}

                    {/* Your boat — rides on the water, up near the horizon of the
                        scene (current zone). Bigger + higher on the larger card. */}
                    {isCurrent && (
                      <div aria-hidden style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: '36%', width: '64%', maxWidth: 170, pointerEvents: 'none', filter: 'drop-shadow(0 6px 10px rgba(0,10,25,0.6))', zIndex: 1 }}>
                        <FisherPose characterColor={characterColor} equippedHat={equippedHat} equippedBoat={equippedBoat} equippedPet={equippedPet} rodTier={rodTier} reelTier={reelTier} hookTier={hookTier} noGlow />
                      </div>
                    )}

                    {/* Name, tagline and standing, bottom-left. The (i) moved
                        to the top-left corner: reserving a column of the
                        caption for it cost more than it was worth once the card
                        got this narrow. */}
                    <div style={{ position: 'absolute', left: 10, right: 10, bottom: 9, zIndex: 2, pointerEvents: 'none' }}>
                      {accessible && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                          <span className="font-karla font-700" style={{ fontSize: '0.55rem', color: colDone ? '#f0c040' : 'rgba(255,255,255,0.86)', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                            {colDone ? '✦ all charted' : `${col.caught}/${col.total} logged`}
                          </span>
                          {prestige > 0 && <PrestigeMark level={prestige} />}
                          {(goldenBoosts[zone] ?? 0) > 0 && (
                            <span className="font-karla font-800" style={{ fontSize: '0.52rem', color: '#f0c040', letterSpacing: '0.03em', textShadow: '0 0 6px rgba(240,192,64,0.5)' }}>
                              ✦ +{goldenBoostPct(goldenBoosts[zone] ?? 0)}%
                            </span>
                          )}
                        </div>
                      )}
                      <p className="font-cinzel font-800" style={{ fontSize: '1.02rem', color: accessible ? '#fdf7e8' : 'rgba(253,247,232,0.55)', lineHeight: 1.05, textShadow: `0 2px 6px rgba(0,0,0,0.95), 0 0 14px ${color}66`, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{HABITAT_LABEL[zone]}</p>
                      <p className="font-karla font-400 italic" style={{ fontSize: '0.56rem', color: accessible ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.55)', marginTop: 2, textShadow: '0 1px 4px rgba(0,0,0,0.9)', lineHeight: 1.3, display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden' }}>
                        {accessible ? HABITAT_TAGLINE[zone] : (zone === 'ancient_deep' && fishingLevel >= minLevel ? 'Clear Chapter 3 to enter' : `Unlocks at Level ${minLevel}`)}
                      </p>
                    </div>

                    {/* Catch-details (i) button — opens the stats modal. */}
                    {accessible && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDetailsFor(zone) }}
                        aria-label={`${HABITAT_LABEL[zone]} catch details`}
                        style={{ position: 'absolute', left: 7, top: 7, zIndex: 3, width: 21, height: 21, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(2,6,12,0.55)', border: `1px solid ${color}99`, color: '#fff', cursor: 'pointer', pointerEvents: 'auto', WebkitTapHighlightColor: 'transparent', padding: 0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.5h.01" /></svg>
                      </button>
                    )}
                  </motion.div>

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

        {/* Zone catch-details modal — opened by a card's (i) button. */}
        <AnimatePresence>
          {detailsFor && (() => {
            const zone = detailsFor
            const dColor = HABITAT_COLOR[zone]
            const dDifficulty = ZONE_DIFFICULTY[zone]
            const dDiffLabel = ZONE_DIFFICULTY_LABEL[zone]
            const dStats = zoneStats[zone] ?? { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
            const [zMin, zMax] = ZONE_WAIT_BASE[zone] ?? [5000, 20000]
            const cycleSec = (zMin + 0.3 * (zMax - zMin)) / 1000 + 4
            const perHr = 3600 / cycleSec
            const doubPerHr = Math.round((perHr * dStats.avgValue) / 100) * 100
            const xpPerHr = Math.round((perHr * dStats.avgXp) / 10) * 10
            const ancientOnly = zone === 'ancient_deep'   // one chest type, and it is the best one
            const goldenOdds = Math.round(SHINY_ODDS / goldenBoostMult(goldenBoosts[zone] ?? 0))
            const round1 = (v: number) => (v * 100).toFixed(1)
            return (
              <>
                <motion.div
                  key="details-backdrop"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  onClick={() => setDetailsFor(null)}
                  style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 50 }}
                />
                <motion.div
                  key="details-modal"
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.97 }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  style={{ position: 'absolute', left: '1rem', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'linear-gradient(180deg, #0b141d 0%, #060b12 100%)', border: `1px solid ${dColor}55`, borderRadius: 18, zIndex: 51, padding: '1.1rem 1.15rem 1.2rem' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 13 }}>
                    <div>
                      <p className="font-cinzel font-800" style={{ fontSize: '1.35rem', color: '#fdf7e8', lineHeight: 1 }}>{HABITAT_LABEL[zone]}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
                        <WaveMarks n={dDifficulty} color={dColor} />
                        <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>{dDiffLabel}</span>
                      </div>
                    </div>
                    <button onClick={() => setDetailsFor(null)} aria-label="Close" style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.18)', color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18, rowGap: 9 }}>
                    <DetailStat label="Bite wait" value={`${Math.round(zMin / 1000)}–${Math.round(zMax / 1000)}s`} />
                    <DetailStat label="Golden" value={`1 in ${goldenOdds.toLocaleString()}`} accent="#f0c040" />
                    <DetailStat label="Doubloons / hr" value={`~${doubPerHr.toLocaleString()} ⟡`} accent="#f0c040" />
                    <DetailStat label="XP / hr" value={`~${xpPerHr.toLocaleString()}`} accent="#7dd3fc" />
                    <DetailStat label="Avg catch" value={`${dStats.avgValue.toLocaleString()} ⟡`} />
                    <DetailStat label="Top catch" value={`${dStats.topValue.toLocaleString()} ⟡`} accent="#f59e0b" />
                    <DetailStat label="Crate / cast" value={`~${(zoneCrateChance(zone) * 100).toFixed(0)}%`} />
                    {/* The Ancient Deep has no diamond crates because it has
                        no crates at all, only Ancient Chests. Naming the chest
                        says more than a 0% would. */}
                    <DetailStat
                      label={ancientOnly ? 'Chest type' : 'Diamond crate'}
                      value={ancientOnly ? 'Ancient' : `${Math.round(zoneDiamondShare(zone) * 100)}%`}
                      accent={ancientOnly ? '#d8cfbb' : undefined}
                    />
                    <DetailStat
                      label="Pet / crate"
                      value={`${round1(zonePetPerCrate(zone))}%`}
                      accent={ancientOnly ? '#d8cfbb' : undefined}
                    />
                  </div>
                  <p className="font-karla" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.42)', fontStyle: 'italic', marginTop: 12, lineHeight: 1.4 }}>
                    Rates estimated at base gear. Faster bites and better crates come with your rod, bait, and level.
                  </p>
                </motion.div>
              </>
            )
          })()}
        </AnimatePresence>


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
    </div>,
    document.body,
  )
}
