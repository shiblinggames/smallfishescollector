'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ZONE_MIN_LEVEL, ZONE_WAIT_BASE, BASE_CRATE_CHANCE, zoneDiamondShare, zonePetPerCrate } from './zoneData'
import { updateUsername } from '@/app/(app)/u/actions'
import LeaderboardModal from '@/components/LeaderboardModal'
import FisherPose from '@/components/FisherPose'
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

const HOW_IT_WORKS: { color: string; title: string; body: string; icon: React.ReactNode }[] = [
  {
    color: '#60a5fa', title: 'Cast & wait',
    body: 'Each cast spends one bait. Your fish is set the instant you cast, and rarer fish take longer to bite. A better rod and bait shorten the wait.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21c7-1 12-6 15-15" /><path d="M19 6l1-3 -3 1" /><circle cx="7" cy="18" r="1.4" fill="currentColor" stroke="none" /></svg>,
  },
  {
    color: '#4ade80', title: 'Reel it in',
    body: 'When the rod dips, a dial spins. Tap while the needle is in the green band to land the fish. Nail the gold band for a Perfect, with a chance to save your bait.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 12l4.5-2.5" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>,
  },
  {
    color: '#fb923c', title: 'Catch fire',
    body: 'Chain Perfect catches to set your line ablaze. Each one stacks bonus XP that keeps growing. Bail on a hooked fish and the streak resets.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2c.5 3 3 4.2 3 7.5a3 3 0 0 1-1.2 2.4c.1-1.2-.4-2.2-1.3-2.9.2 1.9-.9 2.7-1.8 3.6-.9.9-1.9 1.9-1.9 3.6a5.2 5.2 0 0 0 10.4 0c0-4.4-3.6-6-3.4-10.2C13.9 4.6 13.2 3.1 12 2z" /></svg>,
  },
  {
    color: '#a78bfa', title: 'Deeper, tougher',
    body: 'Deeper zones spin the dial faster, flip its direction more often, and shrink the green band. The same fish is far harder to land in the Abyss than the Shallows.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 5l6 6 6-6" /><path d="M6 13l6 6 6-6" /></svg>,
  },
  {
    color: '#f87171', title: 'Watch for snags',
    body: 'Red bands on the dial snag your line: you lose the fish and the bait. A stronger line shrinks them.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l9 16H3z" /><path d="M12 9v5" /><path d="M12 17h.01" /></svg>,
  },
  {
    color: '#2dd4bf', title: 'Crates & pets',
    body: 'Casts can pull up sunken crates, from Wooden to Diamond, and the better ones run deeper. They hold doubloons, gear, and the rare pet.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8l9-4 9 4v8l-9 4-9-4z" /><path d="M3 8l9 4 9-4" /><path d="M12 12v8" /></svg>,
  },
  {
    color: '#94a3b8', title: 'Mind your hold',
    body: 'Every catch fills your hold. When it is full you cannot cast, so sell from the Hold drawer or upgrade its size to keep going.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M3 12h18" /><rect x="10" y="11" width="4" height="3" rx="0.5" /></svg>,
  },
  {
    color: '#c4a96a', title: 'Your gear',
    body: 'Rod: faster bites. Reel: slower dial. Hook: wider green band. Line: smaller snags. Bait: faster bites and a wider band.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" /></svg>,
  },
  {
    color: '#f0c040', title: 'Complete & prestige',
    body: 'Catch every fish in a zone for a one-time reward. Prestige to reset the log and earn more, up to Max Prestige. Past that, each wipe adds a permanent golden-catch boost.',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>,
  },
]

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
  const [modalOpen, setModalOpen] = useState(false)
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

        {/* Deep-water backdrop — the page IS the water column: surface
            light up top, abyssal black at the bottom. No photo underlay,
            no boxed chrome; the five zone scenes carry all the art. */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0b1a29 0%, #071220 32%, #04090f 68%, #020307 100%)' }} />

        {/* Content shell — header pinned up top, only the zones scroll beneath. */}
        <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header — a level medallion + XP-to-next bar, with ranks + guide on
              the right. Stays pinned as you dive. */}
          {(() => {
            const xp = getXPProgress(fishingXP)
            const atMax = xp.level >= 100
            const toNext = atMax ? 0 : xp.xpForLevel - xp.xpInLevel
            return (
              <div className="flex items-center" style={{ flexShrink: 0, gap: 12, height: 68, padding: '0 0.9rem', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 8px 16px -8px rgba(0,0,0,0.5)' }}>
                {/* Level medallion */}
                <div style={{ position: 'relative', width: 46, height: 46, flexShrink: 0, borderRadius: '50%', background: 'conic-gradient(from 210deg, #e0a94a, #fff2c8, #f0c040, #c48a2a, #e0a94a)', padding: 2, boxShadow: '0 0 14px rgba(240,192,64,0.3)' }}>
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 50% 32%, #1a2837, #0a121c)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(0,0,0,0.4)' }}>
                    <span className="font-cinzel font-800" style={{ fontSize: xp.level >= 100 ? '0.95rem' : '1.18rem', color: '#f6e6b0', lineHeight: 1, textShadow: '0 1px 3px rgba(0,0,0,0.7)' }}>{xp.level}</span>
                  </div>
                </div>

                {/* Label + XP bar (its own centered block) */}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.62rem', letterSpacing: '0.22em', color: 'rgba(196,169,106,0.92)' }}>
                    Fishing
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.12)', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                      <div style={{ width: `${Math.round(xp.progress * 100)}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #c4a96a, #f0c040)', boxShadow: '0 0 8px rgba(240,192,64,0.5)' }} />
                    </div>
                    <span className="font-karla font-600" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.58)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                      {atMax ? 'Max Level' : `${toNext.toLocaleString()} XP to Lv ${xp.level + 1}`}
                    </span>
                  </div>
                </div>

                {/* Ranks + guide, centered against the whole bar */}
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
            )
          })()}

          {/* Scroll area — only the zones scroll (header stays pinned). Gentle
              y-snap so each dive settles on a zone. */}
          <div ref={scrollRef} onScroll={syncScrollCue} style={{ flex: 1, minHeight: 0, overflowY: 'auto', scrollSnapType: 'y proximity', padding: '0.5rem 0.9rem 1.5rem' }}>

          {/* The water column — five contiguous bands of sea, no boxes, no
              gaps. Each band is that zone's painted scene; seams blend band
              into band, a shared darkness overlay deepens toward the bottom,
              and the sounding line down the right edge marks the fathoms.
              One continuous descent, surface to the Ancient Deep. */}
          <div style={{ position: 'relative', flexShrink: 0, borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 12px 36px rgba(0,0,0,0.55)' }}>
            {ZONES.map((zone, i) => {
              const minLevel = ZONE_MIN_LEVEL[zone] ?? 1
              // Ancient Deep needs Fishing 75 AND Chapter 3 cleared (or grandfathered).
              const accessible = fishingLevel >= minLevel && (zone !== 'ancient_deep' || ancientDeepUnlocked)
              const color = HABITAT_COLOR[zone]
              const difficulty = ZONE_DIFFICULTY[zone]
              const diffLabel = ZONE_DIFFICULTY_LABEL[zone]
              const stats = zoneStats[zone] ?? { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
              const col = zoneCollection[zone] ?? { caught: 0, total: 0 }
              const colDone = col.total > 0 && col.caught >= col.total
              const prestige = prestigeLevels[zone] ?? 0

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
                    // Big immersive panels — you scroll through them to dive from
                    // the bright surface down to the Ancient Deep. The zone you're
                    // currently fishing gets extra height for your fisher up top.
                    minHeight: accessible ? (zone === currentZone ? 348 : 300) : 190,
                    scrollSnapAlign: 'start',
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
                  {/* Band scrim — art breathes up top, a strong base where the
                      title card sits so the name always reads. */}
                  <div style={{ position: 'absolute', inset: 0, background: accessible
                    ? 'linear-gradient(180deg, rgba(4,10,18,0.26) 0%, rgba(4,10,18,0.05) 38%, rgba(2,6,12,0.88) 100%)'
                    : 'rgba(3,7,12,0.58)' }} />
                  {/* Seam — each band surfaces out of the one above it. */}
                  {i > 0 && (
                    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 20, background: 'linear-gradient(180deg, rgba(2,4,10,0.6), rgba(2,4,10,0))', pointerEvents: 'none' }} />
                  )}

                  {/* Your fisher, right where you last cast — the player's boat +
                      character + gear composite drifts in the water of the zone
                      they're currently fishing. Decorative, never eats the tap. */}
                  {accessible && zone === currentZone && (
                    <div aria-hidden style={{
                      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
                      width: 178, zIndex: 1, pointerEvents: 'none',
                      filter: 'drop-shadow(0 10px 16px rgba(0,10,25,0.6))',
                    }}>
                      <FisherPose
                        characterColor={characterColor}
                        equippedHat={equippedHat}
                        equippedBoat={equippedBoat}
                        equippedPet={equippedPet}
                        rodTier={rodTier}
                        reelTier={reelTier}
                        hookTier={hookTier}
                      />
                    </div>
                  )}

                  {/* Content — the zone name + mood ride the lower third like a
                      title card. The last band gets extra bottom padding to clear
                      the column's rounded clip + descent overlay. */}
                  <div style={{ position: 'relative', zIndex: 1, minHeight: 'inherit', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: `0.9rem 1.15rem ${i === ZONES.length - 1 ? '1.4rem' : '1.15rem'}` }}>
                    {accessible ? (
                      <>
                        <p className="font-cinzel font-800"
                          style={{ fontSize: '2.4rem', color: '#fdf7e8', letterSpacing: '0.01em', lineHeight: 1.0, textShadow: `0 2px 4px rgba(0,0,0,0.75), 0 2px 26px rgba(0,0,0,0.85), 0 0 30px ${color}66` }}>
                          {HABITAT_LABEL[zone]}
                        </p>
                        <p className="font-karla font-400 italic"
                          style={{ fontSize: '1.02rem', color: 'rgba(255,255,255,0.9)', marginTop: 7, textShadow: '0 1px 8px rgba(0,0,0,0.95)' }}>
                          {HABITAT_TAGLINE[zone]}
                        </p>

                        {/* Quiet standing line: collection + prestige, and a
                            Details tap that reveals the catch numbers. */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                            <span className="font-karla font-600" style={{ fontSize: '0.8rem', color: colDone ? '#f0c040' : 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}>
                              {colDone ? '✦ all charted' : `${col.caught} of ${col.total} logged`}
                            </span>
                            {prestige > 0 && <PrestigeMark level={prestige} />}
                            {(goldenBoosts[zone] ?? 0) > 0 && (
                              <span className="font-karla font-800" style={{ flexShrink: 0, fontSize: '0.6rem', color: '#f0c040', letterSpacing: '0.04em', whiteSpace: 'nowrap', textShadow: '0 0 6px rgba(240,192,64,0.5)' }}>
                                ✦ +{goldenBoostPct(goldenBoosts[zone] ?? 0)}% Goldens
                              </span>
                            )}
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setDetailsFor(d => (d === zone ? null : zone)) }}
                            aria-label={`${HABITAT_LABEL[zone]} catch details`}
                            className="font-karla font-600"
                            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '3px 0 3px 10px', color: 'rgba(255,255,255,0.72)', fontSize: '0.74rem', textShadow: '0 1px 4px rgba(0,0,0,0.95)' }}
                          >
                            Details
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ transform: detailsFor === zone ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><path d="m6 9 6 6 6-6" /></svg>
                          </button>
                        </div>

                        {/* Tap-to-see panel — the full zone read: difficulty, bite
                            wait, per-hour rates, crate/pet/golden odds. Hidden by
                            default so the water stays clean. */}
                        <AnimatePresence initial={false}>
                          {detailsFor === zone && (() => {
                            const [zMin, zMax] = ZONE_WAIT_BASE[zone] ?? [5000, 20000]
                            // Representative wait: commons dominate the bite pool, so
                            // the typical wait sits toward the fast end of the band.
                            // Add a few seconds of dial/reel to make it a full cycle.
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
                                style={{ overflow: 'hidden' }}
                              >
                                <div style={{ marginTop: 9, padding: '9px 11px 10px', borderRadius: 12, background: 'rgba(2,6,12,0.42)', border: '1px solid rgba(255,255,255,0.1)', textShadow: '0 1px 3px rgba(0,0,0,0.85)' }}>
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
                      <>
                        <p className="font-cinzel font-800"
                          style={{ fontSize: '2rem', color: 'rgba(253,247,232,0.5)', letterSpacing: '0.01em', lineHeight: 1.0, textShadow: '0 2px 12px rgba(0,0,0,0.85)' }}>
                          {HABITAT_LABEL[zone]}
                        </p>
                        <p className="font-karla font-400 italic"
                          style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.42)', marginTop: 6, textShadow: '0 1px 6px rgba(0,0,0,0.9)' }}>
                          {HABITAT_TAGLINE[zone]}
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2" strokeLinecap="round" aria-hidden><rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
                          <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.66)', whiteSpace: 'nowrap', textShadow: '0 1px 4px rgba(0,0,0,0.9)' }}>
                            {zone === 'ancient_deep' && fishingLevel >= minLevel ? 'Clear Chapter 3 to enter' : `Unlocks at Level ${minLevel}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )
            })}

            {/* Shared descent darkening — one continuous fall into the dark,
                laid over every band so the column reads as one body of water. */}
            <div aria-hidden style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(180deg, rgba(2,4,10,0) 0%, rgba(2,4,10,0.1) 45%, rgba(2,3,8,0.38) 100%)' }} />
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

        {/* Info modal */}
        <AnimatePresence>
          {modalOpen && (
            <>
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                onClick={() => setModalOpen(false)}
                style={{ position: 'absolute', inset: 0, background: 'rgba(2,6,12,0.82)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 50 }}
              />
              <motion.div
                key="modal"
                initial={{ opacity: 0, y: 18, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 260, damping: 24 }}
                style={{
                  position: 'absolute', top: '7%', left: '1rem', right: '1rem', maxWidth: 440, margin: '0 auto',
                  background: 'linear-gradient(180deg, #101c2c 0%, #070d16 100%)',
                  border: '1px solid rgba(96,165,250,0.22)',
                  borderRadius: 20,
                  zIndex: 51,
                  maxHeight: '84%',
                  display: 'flex', flexDirection: 'column',
                  overflow: 'hidden',
                  boxShadow: '0 24px 70px rgba(0,0,0,0.6), 0 0 44px rgba(96,165,250,0.1)',
                }}
              >
                {/* Header */}
                <div style={{ position: 'relative', padding: '1.15rem 1.15rem 0.9rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                  <button
                    onClick={() => setModalOpen(false)}
                    aria-label="Close"
                    style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                  </button>
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.26em', color: 'rgba(196,169,106,0.9)' }}>Field Guide</p>
                  <p className="font-cinzel font-800" style={{ fontSize: '1.32rem', color: '#f4f1ea', lineHeight: 1.1, marginTop: 4 }}>How Fishing Works</p>
                </div>

                {/* Body — one icon row per rule. */}
                <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '0.85rem 1rem 1.15rem', display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {HOW_IT_WORKS.map(({ color, title, body, icon }) => (
                    <div key={title} style={{ display: 'flex', gap: 11, alignItems: 'flex-start', padding: '0.68rem 0.75rem', borderRadius: 13, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, background: `${color}1e`, border: `1px solid ${color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f2efe8', lineHeight: 1.15 }}>{title}</p>
                        <p className="font-karla" style={{ fontSize: '0.75rem', color: 'rgba(226,232,240,0.66)', lineHeight: 1.5, marginTop: 3 }}>{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

      </div>
    </div>
  )
}
