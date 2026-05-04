'use client'

import React, { useState, useEffect, useRef, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { castLine, reelIn, sellFish, awardPerfectChallengeGem, saveHighestPerfectStreak, markFishingTourSeen, markFishingCatchTourSeen, checkLeaderboardPosition, claimZoneReward, type FishSpecies, type FishingBountyCompletion } from './actions'
import PodiumToast, { type PodiumNotif } from '@/components/PodiumToast'
import { finishSession, type ActiveSession } from '@/app/social/challengeActions'
import { equipRod } from '@/app/marketplace/tackle-shop/actions'
import { buildFishZones, FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY, CATCH_CENTER, type ZoneDef, type ZoneType } from './depths'
import { getXPProgress, getLevelFromXP, levelCatchBonus, MAX_LEVEL } from '@/lib/fishingLevel'
import { getHook, HOOKS } from '@/lib/hooks'
import { getRod, RODS, type RodDef } from '@/lib/rods'
import { getReel, REELS } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS, getBait } from '@/lib/bait'
import GearScreen from './GearScreen'

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'casting' | 'hooked' | 'catching' | 'reeling' | 'result'

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

// ─── Wait time mechanics ──────────────────────────────────────────────────────


// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 110, CY = 110
const OUTER_R = 96, INNER_R = 66
const GAP = 1.0

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
// Background art — place images in public/fishing/
const ZONE_BG: Record<string, string> = {
  shallows:    '/fishing/shallows.jpg',
  open_waters: '/fishing/open-waters.jpg',
  deep:        '/fishing/deep.jpg',
  abyss:       '/fishing/abyss.jpg',
}

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss'] as const
type ZoneKey = typeof ZONES[number]

const RARITY: Record<number, { label: string; color: string; hookedText: string }> = {
  1: { label: 'Common',    color: '#94a3b8', hookedText: "Something's on the line…" },
  2: { label: 'Uncommon',  color: '#4ade80', hookedText: "You've got a bite!" },
  3: { label: 'Rare',      color: '#60a5fa', hookedText: "Something strong is pulling!" },
  4: { label: 'Epic',      color: '#c084fc', hookedText: "A big one! Hold tight!" },
  5: { label: 'Legendary', color: '#f59e0b', hookedText: "SOMETHING MASSIVE IS ON THE LINE!" },
}

const ZONE_REWARD_DOUBLOONS_UI: Record<string, number> = {
  shallows:    10000,
  open_waters: 20000,
  deep:        50000,
  abyss:       100000,
}

// ─── Wait messages ───────────────────────────────────────────────────────────

const WAIT_MESSAGES: Record<ZoneKey, string[]> = {
  shallows: [
    "Waiting for a bite…",
    "Hold steady.",
    "The water's calm today.",
    "Patience.",
    "Tip: a better hook widens your catch window.",
    "Tip: better bait means faster bites.",
    "Even shallows have surprises.",
    "Tip: hit the gold strip for a perfect — there's a 50% chance you'll keep your bait.",
    "A gentle current today.",
    "Tip: a higher fishing level means shorter waits.",
  ],
  open_waters: [
    "Drifting on the open sea…",
    "The current's pulling gently.",
    "Something's circling out there.",
    "Anything could bite out here.",
    "Tip: a better line shrinks those snag zones.",
    "Tip: upgrade your reel to slow the needle down.",
    "Keep your eyes on the dial.",
    "Rarer fish start showing up out here.",
    "Tip: a perfect catch has a 50% chance to return your bait.",
    "The horizon stretches on forever.",
  ],
  deep: [
    "Waiting in the dark…",
    "Something's down there.",
    "It's cold. and quiet.",
    "You're in bigger fish territory now.",
    "Tip: snag zones hit harder down here — upgrade your line.",
    "Tip: chain perfects for bonus XP — it compounds fast.",
    "Your reel matters a lot down here.",
    "Tip: some rods have special abilities — worth a look at the tackle shop.",
    "The deep holds secrets.",
    "Tip: rarer fish sell for a lot more — it adds up.",
  ],
  abyss: [
    "Something stirs in the deep…",
    "Not many dare fish here.",
    "The abyss stares back.",
    "Coelacanth sightings have been reported…",
    "Stay calm. stay focused.",
    "Few return with what swims here.",
    "Tip: gear matters more than anywhere else down here.",
    "The pressure down here is immense.",
    "Legendary fish have been caught here. really.",
    "Tip: a perfect streak at this depth pays off massively.",
  ],
}

const STREAK_MESSAGES: [number, string[]][] = [
  [10, [
    "This is legendary. literally. 🔥🔥🔥",
    "Nobody does it like this. 🔥🔥🔥",
    "What is even happening right now. 🔥🔥🔥",
    "Fishing god mode. 🔥🔥🔥",
    "Unstoppable. 🔥🔥🔥",
  ]],
  [6, [
    "You are on fire right now. 🔥🔥",
    "Keep. it. going. 🔥🔥",
    "The fish don't stand a chance. 🔥🔥",
    "Absolutely dialled in. 🔥🔥",
    "This is getting out of hand. 🔥🔥",
  ]],
  [4, [
    "Four in a row. you're on fire. 🔥",
    "Don't you dare miss this one. 🔥",
    "You're in the zone. 🔥",
    "This is getting serious. 🔥",
    "Can't stop now. 🔥",
  ]],
  [3, [
    "Three in a row. stay focused.",
    "Hat trick. don't stop now.",
    "You're really feeling it.",
    "Three perfects. keep that dial steady.",
  ]],
  [2, [
    "Two in a row.",
    "Back to back. keep it up.",
    "Keep it going.",
    "You're dialled in.",
    "Bait saved, streak alive.",
  ]],
]

function pickWaitMessage(zone: ZoneKey, streak: number): string {
  for (const [threshold, msgs] of STREAK_MESSAGES) {
    if (streak >= threshold) return msgs[Math.floor(Math.random() * msgs.length)]
  }
  const pool = WAIT_MESSAGES[zone]
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── Catch mechanics tour ────────────────────────────────────────────────────

const CATCH_TOUR_STEPS = [
  {
    color: '#4ade80',
    title: 'Catch Zone',
    body: 'Land the dial anywhere in the green to catch the fish. Rarer fish have a narrower window — a better Hook widens it.',
  },
  {
    color: '#f59e0b',
    title: 'Perfect Zones',
    body: 'The gold strips in the middle of the green are Perfect zones. Land here for an XP bonus and a chance to save your bait for a free recast.',
  },
  {
    color: '#fb923c',
    title: 'On Fire 🔥',
    body: 'Chain two or more Perfect catches in a row and the dial lights on fire. Keep the streak alive for bonus XP on every perfect — one miss resets it.',
  },
  {
    color: '#f87171',
    title: 'Snag Zones',
    body: 'Hit a red zone and you lose the fish and your bait. Upgrade your Line to shrink these.',
  },
  {
    color: '#94a3b8',
    title: 'Dial Speed',
    body: 'Harder fish spin the dial faster. The Abyss adds random speed bursts and direction reversals. A better Reel slows the needle down.',
  },
]

// ─── Onboarding tour ─────────────────────────────────────────────────────────

type TourStep = {
  title: string
  body: string
  cardStyle: React.CSSProperties
  maxWidth?: number | string
  arrowDir: 'up' | 'down'
  arrowAlign: 'left' | 'center' | 'right'
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'Fishing Zones',
    body: 'There are four zones: Shallows, Open Waters, Deep, and Abyss. Deeper zones have rarer fish but a tighter catch window and faster dial. Earn XP to unlock them.',
    cardStyle: { top: 96, left: 16, right: 16 },
    arrowDir: 'up', arrowAlign: 'center',
  },
  {
    title: 'Fishing XP',
    body: 'Every catch earns XP. Leveling up unlocks the next zone and widens your catch window slightly — so veteran players find reeling in a bit easier.',
    cardStyle: { top: 96, left: 16, right: 16 },
    arrowDir: 'up', arrowAlign: 'center',
  },
  {
    title: 'Collection',
    body: "Every species you've caught lives here. Tap any fish to see its scientific name, fun fact, and sell value.",
    cardStyle: { top: 56, right: 16 },
    maxWidth: 210,
    arrowDir: 'up', arrowAlign: 'right',
  },
  {
    title: 'Gear & Bait',
    body: 'Upgrade your rod, reel, hook, and line. Bait matters too — some baits speed up bites, others widen your catch zone. You get 10 free worms every day.',
    cardStyle: { bottom: 112, left: 16 },
    maxWidth: 220,
    arrowDir: 'down', arrowAlign: 'left',
  },
  {
    title: 'Fish Hold',
    body: 'Caught fish wait here. Quick-sell everything instantly at 65% of base value, or head to the Fish Market to sell at live hourly prices — up to 2.5× base.',
    cardStyle: { bottom: 112, right: 16 },
    maxWidth: 210,
    arrowDir: 'down', arrowAlign: 'right',
  },
]

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function polar(r: number, deg: number) {
  const rad = (deg - 90) * (Math.PI / 180)
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function arcPath(startDeg: number, endDeg: number): string {
  const s0 = startDeg + GAP, e0 = endDeg - GAP
  const span = e0 - s0
  if (span <= 0) return ''
  const la = span > 180 ? 1 : 0
  const p1 = polar(OUTER_R, s0), p2 = polar(OUTER_R, e0)
  const p3 = polar(INNER_R, e0), p4 = polar(INNER_R, s0)
  return [
    `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
    `A ${OUTER_R} ${OUTER_R} 0 ${la} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`,
    `L ${p3.x.toFixed(2)} ${p3.y.toFixed(2)}`,
    `A ${INNER_R} ${INNER_R} 0 ${la} 0 ${p4.x.toFixed(2)} ${p4.y.toFixed(2)}`,
    'Z',
  ].join(' ')
}

function getZone(zones: ZoneDef[], deg: number, rotation = 0): ZoneDef {
  const a = (((deg - rotation) % 360) + 360) % 360
  return zones.find(z => a >= z.from && a < z.to) ?? zones[0]
}

// ─── DialSVG ─────────────────────────────────────────────────────────────────

function DialSVG({
  zones, angle, rotation = 0, needleColor, zoneOpacityFn, fireLevel = 0, snapKey = 0, perfectBurstKey = 0,
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
  fireLevel?: 0 | 1 | 2
  snapKey?: number
  perfectBurstKey?: number
}) {
  const needleTipY  = CY - (INNER_R - 8)
  const perfectZone = zones.find(z => z.type === 'perfect')
  const penaltyZones = zones.filter(z => z.type === 'penalty')

  // Snap/bounce + ripple on reel-in tap
  const [snapAnim, setSnapAnim] = useState(false)
  const [rippleKey, setRippleKey] = useState(0)
  const prevSnapRef = useRef(snapKey)
  useEffect(() => {
    if (snapKey > 0 && snapKey !== prevSnapRef.current) {
      prevSnapRef.current = snapKey
      setSnapAnim(true)
      setRippleKey(k => k + 1)
      setTimeout(() => setSnapAnim(false), 350)
    }
  }, [snapKey])



  return (
    <div style={{
      position: 'relative', width: '100%', maxWidth: 300, margin: '0 auto',
      filter: fireLevel === 2 ? 'drop-shadow(0 0 14px rgba(251,146,60,0.7)) drop-shadow(0 0 32px rgba(239,68,68,0.35))'
            : fireLevel === 1 ? 'drop-shadow(0 0 12px rgba(251,146,60,0.6)) drop-shadow(0 0 22px rgba(251,146,60,0.25))'
            : 'none',
      transition: 'filter 0.4s ease',
    }}>
      <svg viewBox="0 0 220 220" width="100%" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <radialGradient id="innerGrad" cx="50%" cy="45%" r="50%">
            <stop offset="0%"   stopColor="#1e2d3e" stopOpacity="1" />
            <stop offset="55%"  stopColor="#0d1a26" stopOpacity="1" />
            <stop offset="100%" stopColor="#050c14" stopOpacity="1" />
          </radialGradient>
        </defs>
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.78)" stroke={fireLevel === 2 ? '#f97316' : fireLevel === 1 ? '#f97316bb' : 'rgba(255,255,255,0.12)'} strokeWidth="1" />
<g transform={`rotate(${rotation}, ${CX}, ${CY})`}>
          {zones.map((zone, i) => (
            <path key={i} d={arcPath(zone.from, zone.to)} fill={zone.color}
              fillOpacity={zoneOpacityFn(zone)} style={{ transition: 'fill-opacity 0.08s' }} />
          ))}
          {perfectZone && (() => {
            const midDeg = (perfectZone.from + perfectZone.to) / 2
            const label = polar(OUTER_R + 14, midDeg)

            // Bracket tick marks at edges, pointing inward toward the needle
            const tickOuter = INNER_R - 2, tickInner = INNER_R - 10
            const tL0 = polar(tickOuter, perfectZone.from), tL1 = polar(tickInner, perfectZone.from)
            const tR0 = polar(tickOuter, perfectZone.to),   tR1 = polar(tickInner, perfectZone.to)

            return (
              <>
                {/* Bracket ticks */}
                <line x1={tL0.x.toFixed(2)} y1={tL0.y.toFixed(2)} x2={tL1.x.toFixed(2)} y2={tL1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                <line x1={tR0.x.toFixed(2)} y1={tR0.y.toFixed(2)} x2={tR1.x.toFixed(2)} y2={tR1.y.toFixed(2)} stroke="#fde68a" strokeWidth="1.5" strokeOpacity="0.9" />
                {/* Outer label — matches style of penalty ✕ */}
                <text x={label.x.toFixed(2)} y={label.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill="#fde68a" fontSize="9" opacity="0.85">✦</text>
              </>
            )
          })()}
          {penaltyZones.map((pz, i) => {
            const mid = polar(OUTER_R + 14, (pz.from + pz.to) / 2)
            return <text key={i} x={mid.x.toFixed(2)} y={mid.y.toFixed(2)} textAnchor="middle" dominantBaseline="central" fill={pz.color} fontSize="9" opacity="0.85">✕</text>
          })}
        </g>

        <circle cx={CX} cy={CY} r={INNER_R - 2} fill="url(#innerGrad)" />
        {/* Reel-in ripple */}
        {rippleKey > 0 && (
          <motion.circle key={rippleKey} cx={CX} cy={CY}
            fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1"
            initial={{ r: 8, strokeOpacity: 0.18 }}
            animate={{ r: INNER_R * 0.55, strokeOpacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        <g transform={`rotate(${angle}, ${CX}, ${CY})`}>
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="10" strokeOpacity="0.12" strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={needleColor} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={CX} cy={needleTipY} r="5" fill={needleColor} />
        </g>
        <motion.circle cx={CX} cy={CY} r="8"
          fill="rgba(10,10,10,0.9)" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5"
          animate={snapAnim ? { scale: [1, 1.8, 0.7, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.32, ease: 'easeOut' }}
          style={{ transformOrigin: `${CX}px ${CY}px` }}
        />

        {/* Perfect zone burst — arc flash + expanding ring on tap */}
        {perfectBurstKey > 0 && perfectZone && (
          <g key={perfectBurstKey} transform={`rotate(${rotation}, ${CX}, ${CY})`}>
            <motion.path
              d={arcPath(perfectZone.from, perfectZone.to)}
              fill="#fde68a"
              initial={{ fillOpacity: 0.85 }}
              animate={{ fillOpacity: 0 }}
              transition={{ duration: 0.38, ease: 'easeOut' }}
            />
          </g>
        )}
        {perfectBurstKey > 0 && (
          <motion.circle key={`pbr-${perfectBurstKey}`}
            cx={CX} cy={CY} r={OUTER_R + 4}
            fill="none" stroke="#fde68a" strokeWidth="5"
            initial={{ strokeOpacity: 0.8 }}
            animate={{ strokeOpacity: 0, r: OUTER_R + 22 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        )}

        {/* Fire effects — glowing rings only */}
        {fireLevel >= 1 && (
          <motion.circle cx={CX} cy={CY} r={OUTER_R + 4} fill="none" stroke="#fbbf24"
            strokeWidth={fireLevel === 2 ? 2.5 : 2}
            animate={{ strokeOpacity: fireLevel === 2 ? [0.3, 0.65, 0.3] : [0.25, 0.55, 0.25] }}
            transition={{ duration: 1.0, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
          />
        )}
        {fireLevel === 2 && (
          <motion.circle cx={CX} cy={CY} r={OUTER_R + 9} fill="none" stroke="#f97316" strokeWidth="10"
            animate={{ strokeOpacity: [0.1, 0.28, 0.1] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </svg>
    </div>
  )
}

// ─── UnifiedGearDrawer ───────────────────────────────────────────────────────

function StatPill({ label, color, muted }: { label: string; color?: string; muted?: boolean }) {
  const c = color ?? '#94a3b8'
  return (
    <span className="font-karla font-600" style={{
      fontSize: '0.48rem',
      color: muted ? '#4a4845' : `${c}cc`,
      background: muted ? 'rgba(255,255,255,0.04)' : `${c}14`,
      border: `1px solid ${muted ? 'rgba(255,255,255,0.08)' : c + '30'}`,
      padding: '0.1rem 0.4rem', borderRadius: '2rem',
    }}>{label}</span>
  )
}

function UnifiedGearDrawer({
  baitInventory, selectedBait, onSelectBait,
  equippedRodTier, ownedRods, onEquipRod,
  reelTier, hookTier, lineTier,
  onClose,
}: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelectBait: (type: string) => void
  equippedRodTier: number
  ownedRods: number[]
  onEquipRod: (tier: number) => void
  reelTier: number
  hookTier: number
  lineTier: number
  onClose: () => void
}) {
  const [activeSection, setActiveSection] = useState<string>('bait')

  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  const selectedBaitDef = BAITS.find(b => b.type === selectedBait)
  const dragPct = Math.round((1 - reel.needleSpeedMultiplier) * 100)
  const snagReduction = Math.round((1 - line.penaltyMultiplier) * 100)

  const sections: { key: string; label: string; subtitle: string; color: string }[] = [
    { key: 'bait', label: 'Bait',  subtitle: selectedBaitDef?.name ?? '—', color: selectedBaitDef?.color ?? '#94a3b8' },
    { key: 'rod',  label: 'Rod',   subtitle: rod.name,  color: rod.color  },
    { key: 'reel', label: 'Reel',  subtitle: reel.name, color: reel.color },
    { key: 'hook', label: 'Hook',  subtitle: hook.name, color: hook.color },
    { key: 'line', label: 'Line',  subtitle: line.name, color: line.color },
  ]

  const ownedRodDefs = RODS.filter(r => (r.cost === 0 && !r.earnedOnly) || ownedRods.includes(r.tier))

  return (
    <div className="flex flex-col gap-1.5">
      {sections.map(sec => {
        const isOpen = activeSection === sec.key
        return (
          <React.Fragment key={sec.key}>
            {sec.key === 'rod' && (
              <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0.35rem 0 0.1rem' }} />
            )}
          <div>
            <button
              onClick={() => setActiveSection(isOpen ? '' : sec.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.65rem 0.75rem', borderRadius: isOpen ? '10px 10px 0 0' : 10,
                background: isOpen ? `${sec.color}12` : 'rgba(4,10,18,0.72)',
                border: `1px solid ${isOpen ? sec.color + '45' : 'rgba(255,255,255,0.09)'}`,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
            >
              <div style={{ width: 3, height: 18, background: sec.color, borderRadius: 2, flexShrink: 0 }} />
              <p className="font-karla font-700 uppercase tracking-[0.1em]"
                style={{ fontSize: '0.72rem', color: isOpen ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)', minWidth: '2.5rem' }}>{sec.label}</p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '0.78rem', color: isOpen ? sec.color : '#f0ede8', flex: 1, textAlign: 'left' }}>{sec.subtitle}</p>
              <span style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)' }}>{isOpen ? '▴' : '▾'}</span>
            </button>


            {isOpen && (
              <div style={{
                borderRadius: '0 0 10px 10px', padding: '0.75rem',
                background: 'rgba(4,10,18,0.85)',
                border: `1px solid ${sec.color}30`, borderTop: 'none',
              }}>

                {/* ── Bait ── */}
                {sec.key === 'bait' && (
                  <div className="flex flex-col gap-2">
                    <BaitSelector baitInventory={baitInventory} selectedBait={selectedBait} onSelect={onSelectBait} />
                    <Link href="/marketplace/tackle-shop#bait" onClick={onClose}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-0.5"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Buy more bait</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
                    </Link>
                  </div>
                )}

                {/* ── Rod ── */}
                {sec.key === 'rod' && (
                  <div className="flex flex-col gap-1.5">
                    {ownedRodDefs.map(r => {
                      const isEquipped = r.tier === equippedRodTier
                      const speedPct = Math.round((3800 - r.biteIntervalMs) / 3800 * 100)
                      const hasSpecial = r.doubleCatchChance > 0 || r.retryOnMissChance > 0 || r.snagImmune || r.perfectZoneBonus > 0 || r.rarityBonus > 0 || (r.jackpotChance ?? 0) > 0
                      return (
                        <div key={r.tier} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${r.color}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{r.name}</p>
                            <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                              {r.doubleCatchChance > 0 && <StatPill label={r.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(r.doubleCatchChance * 100)}% double catch`} color={r.color} />}
                              {r.retryOnMissChance > 0 && <StatPill label={`${Math.round(r.retryOnMissChance * 100)}% miss retry`} color={r.color} />}
                              {r.snagImmune && <StatPill label="Snag immune" color={r.color} />}
                              {r.perfectZoneBonus > 0 && <StatPill label={`Perfect zone +${r.perfectZoneBonus}°`} color={r.color} />}
                              {r.rarityBonus > 0 && <StatPill label={`+${Math.round(r.rarityBonus * 100)}% rare bias`} color={r.color} />}
                              {(r.jackpotChance ?? 0) > 0 && <StatPill label={`${Math.round(r.jackpotChance! * 100)}% jackpot ×${r.jackpotMultiplier}`} color={r.color} />}
                              {!hasSpecial && speedPct > 0 && <StatPill label={`${speedPct}% faster bites`} color={r.color} />}
                              {!hasSpecial && speedPct <= 0 && r.catchZoneBonus > 0 && <StatPill label={`+${r.catchZoneBonus}° catch zone`} color={r.color} />}
                              {!hasSpecial && speedPct <= 0 && r.catchZoneBonus === 0 && <StatPill label="Base rod" muted />}
                            </div>
                          </div>
                          {isEquipped
                            ? <span className="font-karla font-700" style={{ fontSize: '0.52rem', color: r.color, whiteSpace: 'nowrap' }}>✓ Equipped</span>
                            : <button onClick={() => onEquipRod(r.tier)} className="font-karla font-700"
                                style={{ fontSize: '0.55rem', padding: '0.28rem 0.6rem', borderRadius: 7, whiteSpace: 'nowrap',
                                  background: `${r.color}16`, border: `1px solid ${r.color}44`, color: r.color, cursor: 'pointer' }}>
                                Equip
                              </button>
                          }
                        </div>
                      )
                    })}
                    <Link href="/marketplace/tackle-shop#rod" onClick={onClose}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-0.5"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Buy more rods</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
                    </Link>
                  </div>
                )}

                {/* ── Reel ── */}
                {sec.key === 'reel' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {dragPct > 0
                        ? <StatPill label={`−${dragPct}% needle speed`} color={reel.color} />
                        : <StatPill label="Base needle speed" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {reel.description}
                    </p>
                    <Link href="/marketplace/tackle-shop#reel" onClick={onClose}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Upgrade reel</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
                    </Link>
                  </div>
                )}

                {/* ── Hook ── */}
                {sec.key === 'hook' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {hookTier > 0
                        ? <StatPill label={`+${hookTier * 3}° catch zone`} color={hook.color} />
                        : <StatPill label="No catch zone bonus" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {hook.description}
                    </p>
                    <Link href="/marketplace/tackle-shop#hook" onClick={onClose}
                      className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
                      <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Upgrade hook</span>
                      <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
                    </Link>
                  </div>
                )}

                {/* ── Line ── */}
                {sec.key === 'line' && (
                  <div className="flex flex-col gap-2">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {snagReduction > 0
                        ? <StatPill label={`−${snagReduction}% snag zone`} color={line.color} />
                        : <StatPill label="Standard snag zones" muted />
                      }
                    </div>
                    <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: '#6a6764', lineHeight: 1.5 }}>
                      {line.description}
                    </p>
                    <p className="font-karla font-300" style={{ fontSize: '0.58rem', color: '#4a4845' }}>
                      Lines are earned by catching unique species — no purchase needed.
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── BaitSelector ─────────────────────────────────────────────────────────────

function BaitSelector({ baitInventory, selectedBait, onSelect }: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelect: (type: string) => void
}) {
  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const ownedBaits = BAITS.filter(b => (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait)

  if (ownedBaits.length === 0) return (
    <p className="font-karla font-600 text-center py-4" style={{ fontSize: '0.68rem', color: '#4a4845' }}>
      No bait in inventory
    </p>
  )

  return (
    <div className="flex flex-col gap-1.5">
      {ownedBaits.map(bait => {
        const qty = inventoryMap[bait.type] ?? 0
        const isSelected = bait.type === selectedBait
        const c = bait.color
        return (
          <button key={bait.type}
            onClick={() => onSelect(bait.type)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '0.6rem 0.75rem', borderRadius: 12, width: '100%',
              background: isSelected ? `${c}12` : 'rgba(4,10,18,0.72)',
              border: `1px solid ${isSelected ? c + '50' : 'rgba(255,255,255,0.09)'}`,
              cursor: 'pointer', transition: 'border-color 0.12s',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, opacity: qty > 0 ? 1 : 0.3 }} />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.75rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>
                {bait.name}
              </p>
              <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                {bait.catchZoneBonus > 0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    +{bait.catchZoneBonus}° catch zone
                  </span>
                )}
                {bait.waitMult < 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((1 - bait.waitMult) * 100)}% faster bite
                  </span>
                )}
                {bait.waitMult > 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: 'rgba(248,113,113,0.8)', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((bait.waitMult - 1) * 100)}% slower bite
                  </span>
                )}
                {!bait.catchZoneBonus && bait.waitMult === 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    No bonus
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
              <p className="font-karla font-700" style={{ fontSize: '0.65rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>
                ×{qty}
              </p>
              {isSelected && (
                <p className="font-karla font-600" style={{ fontSize: '0.44rem', color: c }}>selected</p>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}

type SceneFrame = 'windup' | 'cast1' | 'cast2' | 'fishing' | 'catching'

const FRAME_SRC: Record<SceneFrame, string> = {
  windup:   '/windup.jpg',
  cast1:    '/cast1.jpg',
  cast2:    '/cast2.jpeg',
  fishing:  '/fishing1.jpg',
  catching: '/fishing.jpeg',
}

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

function FishImg({ name, style }: { name: string; style?: React.CSSProperties }) {
  return (
    <img
      src={fishImageUrl(name)}
      alt={name}
      style={style}
      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

// ─── ResultCard ───────────────────────────────────────────────────────────────

function ResultCard({ fish, baitSaved, isNewSpecies, isPerfect, xpGained, doubleCatch, gemEarned, perfectStreak = 1, streakBonusXP = 0, jackpotMultiplier }: {
  fish: FishSpecies
  baitSaved: boolean
  isNewSpecies: boolean
  isPerfect: boolean
  xpGained: number
  doubleCatch?: boolean
  gemEarned?: boolean
  perfectStreak?: number
  streakBonusXP?: number
  jackpotMultiplier?: number
}) {
  const habitatColor = HABITAT_COLOR[fish.habitat] ?? '#888'
  const habitatLabel = HABITAT_LABEL[fish.habitat] ?? fish.habitat
  const rarity = fish.bite_rarity ?? 1
  const r = RARITY[rarity] ?? RARITY[1]
  const isLegendary = rarity === 5
  const isEpicPlus  = rarity >= 4

  const glowShadow: Record<number, string> = {
    1: 'none',
    2: `0 0 10px ${r.color}40, 0 0 28px ${r.color}18`,
    3: `0 0 18px ${r.color}55, 0 0 44px ${r.color}25`,
    4: `0 0 26px ${r.color}65, 0 0 60px ${r.color}32`,
    5: `0 0 32px ${r.color}80, 0 0 80px ${r.color}40, 0 0 130px ${r.color}20`,
  }
  const borderOpMap: Record<number, string> = { 1: '55', 2: '70', 3: '88', 4: 'aa', 5: 'cc' }
  const cardBg = 'rgba(6,16,26,0.96)'

  return (
    <div style={{ position: 'relative' }}>

      {/* Perfect catch banner */}
      {isPerfect && (() => {
        const s = Math.min(perfectStreak, 6)
        const isCombo = perfectStreak >= 3
        const isOnFire = perfectStreak >= 3
        const isIgnition = perfectStreak === 3
        const titleSize = 0.72 + (s - 1) * 0.05
        const iconSize  = 0.70 + (s - 1) * 0.05
        const accent = isOnFire ? '#fb923c' : '#fbbf24'
        const accentRgb = isOnFire ? '251,146,60' : '251,191,36'
        const borderAlpha = Math.min(0.65 + (s - 1) * 0.06, 0.95)
        const glow = `0 0 ${10 + (s - 1) * 5}px rgba(${accentRgb},${0.4 + (s - 1) * 0.08})`
        const basePerfectBonus = Math.round((xpGained - streakBonusXP) * 0.2 / 1.2)
        return (
          <div style={{ position: 'relative' }} className="mb-2">
            {/* Ignition burst rings */}
            {isIgnition && [0, 0.1, 0.2].map((delay, i) => (
              <motion.div key={i}
                initial={{ scale: 0.85, opacity: 0.7 - i * 0.2 }}
                animate={{ scale: 2.2 - i * 0.25, opacity: 0 }}
                transition={{ duration: 0.55, ease: 'easeOut', delay }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 12,
                  border: `${1.5 - i * 0.3}px solid rgba(251,146,60,${0.7 - i * 0.2})`,
                  pointerEvents: 'none',
                }}
              />
            ))}
            <motion.div
              key={perfectStreak}
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              style={{
                background: isOnFire ? 'rgba(20,6,0,0.92)' : 'rgba(6,4,0,0.88)',
                border: `1px solid rgba(${accentRgb},0.35)`,
                borderLeft: `3px solid rgba(${accentRgb},0.85)`,
                borderRadius: 12,
                boxShadow: glow,
                padding: '0.6rem 0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.14em]"
                  style={{ fontSize: '0.48rem', color: `rgba(${accentRgb},0.6)`, marginBottom: 4 }}>
                  {isIgnition ? '🔥 On Fire!' : isOnFire ? 'On Fire' : 'Perfect Catch'}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  {basePerfectBonus > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#86efac' }}>
                      +{basePerfectBonus} XP
                    </p>
                  )}
                  {streakBonusXP > 0 && (
                    <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: accent }}>+{streakBonusXP} XP</p>
                  )}
                  {baitSaved && (
                    <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#86efac' }}>
                      Bait returned
                    </p>
                  )}
                </div>
              </div>
              {isCombo && (
                <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: accent, textShadow: glow, lineHeight: 1, flexShrink: 0 }}>
                  ×{perfectStreak}
                </p>
              )}
            </motion.div>
          </div>
        )
      })()}

      {/* Jackpot banner */}
      {jackpotMultiplier && jackpotMultiplier > 1 && (
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.88 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 15 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(12,2,0,0.92)', border: '1px solid rgba(249,115,22,0.72)', boxShadow: '0 0 22px rgba(249,115,22,0.38)' }}
        >
          <span style={{ fontSize: '0.78rem', color: '#f97316' }}>★</span>
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.2em]"
              style={{ fontSize: '0.75rem', color: '#f97316', textShadow: '0 0 12px rgba(249,115,22,0.55)' }}>Jackpot!</p>
            <p className="font-karla font-700" style={{ fontSize: '0.62rem', color: '#fdba74' }}>×{jackpotMultiplier} fish landed</p>
          </div>
          <span style={{ fontSize: '0.78rem', color: '#f97316' }}>★</span>
        </motion.div>
      )}

      {/* Gem earned banner */}
      {gemEarned && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(0,8,12,0.88)', border: '1px solid rgba(99,226,183,0.55)' }}
        >
          <span style={{ fontSize: '0.72rem', color: '#63e2b7' }}>◆</span>
          <div style={{ textAlign: 'center' }}>
            <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
              style={{ fontSize: '0.72rem', color: '#63e2b7', textShadow: '0 0 10px rgba(99,226,183,0.6)' }}>
              Challenge Complete
            </p>
            <p className="font-karla font-600 mt-0.5" style={{ fontSize: '0.6rem', color: 'rgba(99,226,183,0.7)' }}>
              +1 Gem
            </p>
          </div>
          <span style={{ fontSize: '0.72rem', color: '#63e2b7' }}>◆</span>
        </motion.div>
      )}

      {/* Double catch banner */}
      {doubleCatch && (
        <motion.div
          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
          className="flex items-center justify-center gap-2 mb-2 py-2 px-3 rounded-xl"
          style={{ background: 'rgba(4,8,0,0.88)', border: '1px solid rgba(251,191,36,0.45)' }}
        >
          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>✦</span>
          <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
            style={{ fontSize: '0.68rem', color: '#fbbf24', textShadow: '0 0 10px rgba(251,191,36,0.6)' }}>
            Double Catch — ×2
          </p>
          <span style={{ fontSize: '0.65rem', color: '#fbbf24' }}>✦</span>
        </motion.div>
      )}

      {/* Card + all its effects in one relative container */}
      <div style={{ position: 'relative' }}>

        {/* Burst rings — epic gets 2, legendary gets 3 */}
        {isEpicPlus && [0, 0.09, ...(isLegendary ? [0.18] : [])].map((delay, i) => (
          <motion.div key={i}
            initial={{ scale: 0.88, opacity: isLegendary ? 0.75 - i * 0.18 : 0.55 - i * 0.15 }}
            animate={{ scale: isLegendary ? 1.9 - i * 0.18 : 1.55 - i * 0.12, opacity: 0 }}
            transition={{ duration: isLegendary ? 0.7 : 0.5, ease: 'easeOut', delay: delay + (isLegendary ? 0.12 : 0.04) }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '1rem',
              border: `${isLegendary ? 1.5 - i * 0.3 : 1}px solid ${r.color}${isLegendary ? 'dd' : '99'}`,
              pointerEvents: 'none', zIndex: 2,
            }}
          />
        ))}

        {/* Legendary color bloom */}
        {isLegendary && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0] }}
            transition={{ duration: 0.55, delay: 0.1, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -24, borderRadius: '2rem',
              background: `radial-gradient(ellipse at 50% 55%, ${r.color}60 0%, transparent 68%)`,
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

        {/* Glow halo — sits outside overflow:hidden so it isn't clipped */}
        {rarity >= 2 && (
          <motion.div
            animate={isEpicPlus ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
            transition={isEpicPlus
              ? { duration: isLegendary ? 1.2 : 1.8, repeat: Infinity, ease: 'easeInOut' }
              : {}}
            style={{
              position: 'absolute', inset: -1, borderRadius: '1rem',
              boxShadow: glowShadow[rarity],
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: isLegendary ? 40 : isEpicPlus ? 24 : 16, scale: isLegendary ? 0.84 : isEpicPlus ? 0.91 : 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: isLegendary ? 140 : isEpicPlus ? 210 : 280, damping: isLegendary ? 11 : isEpicPlus ? 16 : 22, delay: isLegendary ? 0.1 : 0 }}
        className="rounded-2xl overflow-hidden"
        style={{
          border: `1px solid ${r.color}${borderOpMap[rarity] ?? '55'}`,
          background: cardBg,
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Legendary shimmer sweep */}
        {isLegendary && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 1.5, delay: 0.6, ease: 'easeOut', repeat: Infinity, repeatDelay: 3.5 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 25%, rgba(255,210,80,0.30) 50%, transparent 75%)',
            }}
          />
        )}

        {/* Header band */}
        <div className="px-4 py-3 flex items-center justify-between"
          style={{ position: 'relative', zIndex: 2, background: `${r.color}28`, borderBottom: `1px solid ${r.color}45` }}>
          <div className="flex items-center gap-2">
            <span className="font-karla font-700 uppercase tracking-[0.14em]"
              style={{ fontSize: '0.55rem', color: habitatColor }}>{habitatLabel}</span>
            <span className="font-karla font-700 uppercase tracking-[0.12em]"
              style={{
                fontSize: '0.5rem', color: r.color,
                background: `${r.color}1c`, border: `1px solid ${r.color}45`,
                padding: '0.12rem 0.45rem', borderRadius: '2rem',
              }}>
              {r.label}{rarity >= 4 ? ' ✦' : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isNewSpecies && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.2 }}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{ fontSize: '0.5rem', color: '#fde68a',
                  background: 'rgba(253,230,138,0.15)', border: '1px solid rgba(253,230,138,0.4)',
                  padding: '0.15rem 0.5rem', borderRadius: '2rem' }}
              >New Species ✦</motion.span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-4 py-4" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <FishImg name={fish.name} style={{ width: 72, height: 56, objectFit: 'contain', flexShrink: 0 }} />
            <div>
              <p className="font-cinzel font-700 mb-0.5" style={{ fontSize: '1.1rem', color: r.color }}>
                {fish.name}
              </p>
              <p className="font-karla font-300 italic" style={{ fontSize: '0.68rem', color: '#6a6764' }}>
                {fish.scientific_name}
              </p>
            </div>
          </div>
          <p className="font-karla font-400 leading-relaxed mb-0" style={{ fontSize: '0.76rem', color: '#b0afa8' }}>
            {fish.fun_fact}
          </p>
          <div className="flex items-center gap-1.5 mt-3">
            <span style={{ width: 7, height: 7, borderRadius: 2, background: r.color, display: 'inline-block', flexShrink: 0 }} />
            <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#6a6764' }}>
              Sells for <span style={{ color: '#f0c040' }}>{fish.sell_value.toLocaleString()} ⟡</span>
            </p>
          </div>

        </div>
      </motion.div>
    </div>
    </div>
  )
}

// ─── FishInventory ────────────────────────────────────────────────────────────

function FishInventory({ inventory, onSell }: {
  inventory: InventoryItem[]
  onSell: (fishId: number, qty: number) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<number | null>(null)
  const [sellError, setSellError] = useState<string | null>(null)

  if (inventory.length === 0) return null

  async function handleSell(fishId: number, qty: number) {
    setPending(fishId)
    setSellError(null)
    await onSell(fishId, qty)
    setPending(null)
  }

  const totalValue = inventory.reduce(
    (sum, item) => sum + item.fish_species.sell_value * item.quantity, 0
  )
  const totalCount = inventory.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="mt-4 rounded-xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>

      {/* Header — always visible, tap to toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5"
        style={{ cursor: 'pointer' }}
      >
        <div className="flex items-center gap-2">
          <p className="font-karla font-600 uppercase tracking-[0.12em]"
            style={{ fontSize: '0.58rem', color: '#6a6764' }}>Fish Hold</p>
          <span className="font-karla font-600"
            style={{ fontSize: '0.55rem', color: '#4a4845',
              background: 'rgba(255,255,255,0.06)', padding: '0.1rem 0.45rem', borderRadius: '2rem' }}>
            {totalCount} fish
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#f0c040' }}>
            {totalValue.toLocaleString()} ⟡
          </p>
          <span style={{ fontSize: '0.6rem', color: '#4a4845', transition: 'transform 0.2s',
            display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
        </div>
      </button>

      {/* Expandable list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="hold"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="flex flex-col gap-1.5 px-3 pb-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {inventory.map(item => {
                const fish     = item.fish_species
                const hColor   = HABITAT_COLOR[fish.habitat] ?? '#888'
                const isPending = pending === item.fish_id

                return (
                  <div key={item.fish_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-xl mt-1.5"
                    style={{ background: `${hColor}0a`, border: `1px solid ${hColor}20` }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-cinzel font-700 truncate"
                          style={{ fontSize: '0.75rem', color: '#f0ede8' }}>{fish.name}</p>
                        <span className="font-karla font-600 shrink-0"
                          style={{ fontSize: '0.52rem', color: hColor,
                            background: `${hColor}18`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                          ×{item.quantity}
                        </span>
                      </div>
                      <p className="font-karla font-600 mt-0.5"
                        style={{ fontSize: '0.58rem', color: '#f0c040' }}>
                        {fish.sell_value.toLocaleString()} ⟡ each
                        {item.quantity > 1 && (
                          <span style={{ color: '#6a6764' }}> · {(fish.sell_value * item.quantity).toLocaleString()} ⟡</span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      {item.quantity > 1 && (
                        <button onClick={() => handleSell(item.fish_id, item.quantity)} disabled={isPending}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                            background: 'rgba(240,192,64,0.08)', border: '1px solid rgba(240,192,64,0.22)',
                            color: '#f0c040', opacity: isPending ? 0.5 : 1, cursor: isPending ? 'default' : 'pointer' }}>
                          Sell all
                        </button>
                      )}
                      <button onClick={() => handleSell(item.fish_id, 1)} disabled={isPending}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{ fontSize: '0.5rem', padding: '0.28rem 0.55rem', borderRadius: '0.5rem',
                          background: 'rgba(240,192,64,0.14)', border: '1px solid rgba(240,192,64,0.35)',
                          color: '#f0c040', opacity: isPending ? 0.5 : 1, cursor: isPending ? 'default' : 'pointer' }}>
                        {isPending ? '…' : 'Sell 1'}
                      </button>
                    </div>
                  </div>
                )
              })}
              {sellError && (
                <p className="font-karla font-300 text-red-400 text-xs text-center mt-1">{sellError}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── XPBar ───────────────────────────────────────────────────────────────────

function XPBarDisplay({ xp, bestStreak }: { xp: number; bestStreak?: number }) {
  const { level, progress, xpInLevel, xpForLevel } = getXPProgress(xp)
  const isMax = level >= MAX_LEVEL
  const fillPct = isMax ? 100 : progress * 100
  const toGo = xpForLevel - xpInLevel
  const c = isMax ? '#f0c040' : '#60a5fa'

  return (
    <div className="flex items-center gap-2.5 px-3 py-2"
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${c}28`, borderRadius: 20 }}>
      <div className="shrink-0 flex items-baseline gap-0.5">
        <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: c + 'bb', letterSpacing: '0.08em' }}>LV</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: c, lineHeight: 1 }}>{level}</span>
      </div>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <motion.div
          key={level}
          style={{
            height: '100%', borderRadius: 999,
            background: `linear-gradient(90deg, ${c}88 0%, ${c} 100%)`,
            boxShadow: `0 0 10px ${c}70`,
          }}
          initial={{ width: '0%' }}
          animate={{ width: `${fillPct}%` }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <div className="shrink-0 flex items-center gap-2">
        <p className="font-karla font-600"
          style={{ fontSize: '0.6rem', color: isMax ? c : 'rgba(255,255,255,0.65)', textAlign: 'right', lineHeight: 1 }}>
          {isMax ? 'MAX' : `${toGo.toLocaleString()} xp`}
        </p>
        {(bestStreak ?? 0) > 0 && (
          <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: 'rgba(251,146,60,0.9)', lineHeight: 1 }}>
            🔥{bestStreak}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }

export default function FishingGame({
  hookTier, rodTier, reelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialInventory,
  holdCapacity, shipTier,
  ownedRods: initialOwnedRods,
  allFishSpecies, initialCaughtFishIds,
  initialHighestPerfectStreak,
  hasSeenFishingTour, hasSeenFishingCatchTour,
  selectedZone: initialZone, onBack, activeSession, zoneRewardsClaimed,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  holdCapacity: number
  shipTier: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  initialCaughtFishIds: number[]
  initialHighestPerfectStreak: number
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  selectedZone: ZoneKey
  onBack: () => void
  activeSession?: ActiveSession
  zoneRewardsClaimed: Record<string, boolean>
}) {

  const [equippedRodTier, setEquippedRodTier] = useState(rodTier)
  const [ownedRods, setOwnedRods] = useState(initialOwnedRods)
  const [caughtFishIds, setCaughtFishIds] = useState(() => new Set(initialCaughtFishIds))
  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  // Game state
  const [phase, setPhase]           = useState<Phase>('idle')
  const selectedZone = initialZone
  const [selectedBait, setSelectedBait] = useState<string>(() => {
    const first = initialBait.find(b => b.quantity > 0)
    return first?.bait_type ?? 'worm'
  })
  const [baitInventory, setBaitInventory] = useState<BaitItem[]>(initialBait)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  const [holdOpen, setHoldOpen]         = useState(false)
  const [gearOpen, setGearOpen]         = useState(false)
  const [baitOpen, setBaitOpen]         = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [uncheckedNewFishIds, setUncheckedNewFishIds] = useState<Set<number>>(new Set())
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [claimedZones, setClaimedZones] = useState<Record<string, boolean>>(zoneRewardsClaimed)
  const [claimingZone, setClaimingZone] = useState<string | null>(null)
  const [zoneClaimToast, setZoneClaimToast] = useState<{ zone: string; earned: number } | null>(null)
  const [tappedFishId, setTappedFishId] = useState<number | null>(null)

  const [sessionCatches, setSessionCatches] = useState<FishSpecies[]>([])
  const [sessionPerfects, setSessionPerfects] = useState(0)
  const [sessionNewSpecies, setSessionNewSpecies] = useState(0)
  const [sessionGems, setSessionGems] = useState(0)
  const [sellPending, setSellPending] = useState<number | null>(null)
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number; biteRarity: number } | null>(null)
  const [catchResult, setCatchResult] = useState<{ fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean; isPerfect: boolean; xpGained: number; doubleCatch?: boolean; gemEarned?: boolean; perfectStreak: number; streakBonusXP: number; jackpotMultiplier?: number } | null>(null)
  const [challengeActive, setChallengeActive] = useState(false)
  const [perfectStreak, setPerfectStreak] = useState(0)
  const [highestPerfectStreak, setHighestPerfectStreak] = useState(initialHighestPerfectStreak)
  const [snapKey, setSnapKey] = useState(0)
  const [castRippleKey, setCastRippleKey] = useState(0)
  const [reelRippleKey, setReelRippleKey] = useState(0)
  const [newStreakRecord, setNewStreakRecord] = useState<number | null>(null)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [catchTourStep, setCatchTourStep] = useState<number | null>(null)
  const catchTourShownRef = useRef(false)
  const [bountyNotif, setBountyNotif] = useState<FishingBountyCompletion | null>(null)
  const [perfectFlash, setPerfectFlash] = useState(false)
  const [perfectBurstKey, setPerfectBurstKey] = useState(0)
  const [waitMessage, setWaitMessage] = useState('')
  const [retryFlash, setRetryFlash] = useState(false)
  const [missResult, setMissResult] = useState<ZoneType | null>(null)
  const [fishingXP, setFishingXP]   = useState(initialFishingXP)
  const [xpPopup, setXpPopup]       = useState<{ value: number; id: number } | null>(null)
  const [levelUpNotif, setLevelUpNotif] = useState<number | null>(null)
  const [podiumNotif, setPodiumNotif] = useState<PodiumNotif | null>(null)
  const podiumPositionsRef = useRef<{ fishingLevel: number | null; perfectStreak: number | null }>({ fishingLevel: null, perfectStreak: null })
  const [, startTransition]         = useTransition()

  // ── Challenge session ───────────────────────────────────────────────────
  const [sessionSecondsLeft, setSessionSecondsLeft] = useState<number | null>(() =>
    activeSession ? Math.max(0, Math.floor((new Date(activeSession.endsAt).getTime() - Date.now()) / 1000)) : null
  )
  const [sessionDone, setSessionDone] = useState(() =>
    activeSession ? new Date(activeSession.endsAt).getTime() <= Date.now() : false
  )
  const [sessionScore, setSessionScore] = useState(activeSession?.myScore ?? 0)
  const sessionFinishedRef = useRef(false)
  const [sessionOverlayDismissed, setSessionOverlayDismissed] = useState(false)

  const fishingLevel = getLevelFromXP(fishingXP)
  const levelBonus   = levelCatchBonus(fishingLevel)

  // Needle state
  const [angle, setAngle]           = useState(270)
  const [zoneRotation, setZoneRotation] = useState(0)
  const [retryKey, setRetryKey]     = useState(0)
  const angleRef        = useRef(270)
  const speedRef        = useRef(0)
  const dirRef          = useRef(1)
  const phaseRef        = useRef<Phase>('idle')
  const animRef         = useRef<number | null>(null)
  const lastTimeRef     = useRef(0)
  const elapsedMsRef    = useRef(0)
  const nextChgMsRef    = useRef(0)
  const hookedFishRef   = useRef<{ fishId: number; catchDifficulty: number } | null>(null)
  const selectedBaitRef = useRef(selectedBait)
  const frameRefs       = useRef<Partial<Record<SceneFrame, HTMLImageElement>>>({})

  useEffect(() => { phaseRef.current = phase }, [phase])

  useEffect(() => {
    Promise.all([
      checkLeaderboardPosition('fishingLevel'),
      checkLeaderboardPosition('perfectStreak'),
    ]).then(([fl, ps]) => {
      podiumPositionsRef.current = {
        fishingLevel: fl?.position ?? null,
        perfectStreak: ps?.position ?? null,
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!activeSession || sessionDone) return
    const id = setInterval(() => {
      setSessionSecondsLeft(s => {
        if (s === null || s <= 1) {
          clearInterval(id)
          setSessionDone(true)
          if (!sessionFinishedRef.current) {
            sessionFinishedRef.current = true
            startTransition(async () => { await finishSession(activeSession.challengeId) })
          }
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [activeSession, sessionDone]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { selectedBaitRef.current = selectedBait }, [selectedBait])
  useEffect(() => { hookedFishRef.current = hookedFish }, [hookedFish])
  useEffect(() => {
    if (newStreakRecord === null) return
    const id = setTimeout(() => setNewStreakRecord(null), 4000)
    return () => clearTimeout(id)
  }, [newStreakRecord])

  // Force-decode actual in-DOM img elements on mount so GPU has them compositor-ready
  useEffect(() => {
    Object.values(frameRefs.current).forEach(img => {
      if (img) img.decode().catch(() => {})
    })
  }, [])

  useEffect(() => {
    if (!hasSeenFishingTour) setTourStep(0)
  }, [hasSeenFishingTour])

  useEffect(() => {
    if (phase === 'catching' && !catchTourShownRef.current) {
      catchTourShownRef.current = true
      if (!hasSeenFishingCatchTour) setCatchTourStep(0)
    }
  }, [phase, hasSeenFishingCatchTour])

  // Scene background frame — animates during casting phase
  const [sceneFrame, setSceneFrame] = useState<SceneFrame>('fishing')
  const [castAnimDone, setCastAnimDone] = useState(false)
  useEffect(() => {
    if (phase === 'catching') { setSceneFrame('catching'); return }
    if (phase !== 'casting') { setCastAnimDone(false); return }
    setCastAnimDone(false)
    setSceneFrame('windup')
    const t1 = setTimeout(() => setSceneFrame('cast1'), 350)
    const t2 = setTimeout(() => setSceneFrame('cast2'), 500)
    const t3 = setTimeout(() => setSceneFrame('fishing'), 650)
    const t4 = setTimeout(() => setCastAnimDone(true), 1500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
  }, [phase])

  // Needle animation during catching phase
  useEffect(() => {
    if (phase !== 'catching' || !hookedFish) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      return
    }
    const diffSpeed = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, hookedFish.catchDifficulty - 1))]
    const zoneDiff  = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baseMin = diffSpeed.speedMin * reel.needleSpeedMultiplier
    const baseMax = diffSpeed.speedMax * reel.needleSpeedMultiplier
    const capturedZoneRotation = zoneRotation

    speedRef.current   = baseMin + Math.random() * (baseMax - baseMin)
    lastTimeRef.current  = 0
    elapsedMsRef.current = 0
    nextChgMsRef.current = (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50

    const tick = (timestamp: number) => {
      if (phaseRef.current !== 'catching') return
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp
      const delta = Math.min(timestamp - lastTimeRef.current, 50) // cap to avoid jump on tab-refocus
      lastTimeRef.current = timestamp
      elapsedMsRef.current += delta

      angleRef.current = ((angleRef.current + dirRef.current * speedRef.current * delta / 1000) % 360 + 360) % 360

      if (elapsedMsRef.current >= nextChgMsRef.current) {
        speedRef.current = baseMin + Math.random() * (baseMax - baseMin)
        if (Math.random() < zoneDiff.reverseChance) {
          // Only reverse near the catch zone — not while drifting through dead space
          const catchCenter = (CATCH_CENTER + capturedZoneRotation) % 360
          const needle = angleRef.current
          const dist = Math.min(Math.abs(catchCenter - needle), 360 - Math.abs(catchCenter - needle))
          if (dist <= 55) dirRef.current *= -1
        }
        nextChgMsRef.current = elapsedMsRef.current + (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50
      }
      setAngle(angleRef.current)
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null } }
  // retryKey increments on Second Wind retry to restart animation with fresh randomization
  }, [phase, hookedFish, reel.needleSpeedMultiplier, retryKey])

  function deductBait(type: string, qty = 1) {
    setBaitInventory(prev => prev.map(b =>
      b.bait_type === type ? { ...b, quantity: Math.max(0, b.quantity - qty) } : b
    ))
  }

  function totalBait() {
    return baitInventory.reduce((s, b) => s + b.quantity, 0)
  }

  // Core cast logic — no phase guard, called from both Cast and Cast Again
  async function doCast() {
    const currentQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (currentQty <= 0) { setPhase('idle'); return }

    setPerfectBurstKey(0)
    setWaitMessage(pickWaitMessage(selectedZone as ZoneKey, perfectStreak))
    deductBait(selectedBait)
    await new Promise(r => setTimeout(r, 200))
    setPhase('casting')

    try {
      const res = await castLine(selectedBait, selectedZone)

      if ('error' in res) {
        setBaitInventory(prev => prev.map(b =>
          b.bait_type === selectedBait ? { ...b, quantity: b.quantity + 1 } : b
        ))
        setPhase('idle')
        return
      }

      await new Promise(r => setTimeout(r, res.waitMs))

      setHookedFish({ fishId: res.fishId, catchDifficulty: res.catchDifficulty, biteRarity: res.biteRarity })
      setPhase('hooked')
    } catch {
      setBaitInventory(prev => prev.map(b =>
        b.bait_type === selectedBait ? { ...b, quantity: b.quantity + 1 } : b
      ))
      setPhase('idle')
      return
    }
    setTimeout(() => {
      if (phaseRef.current !== 'hooked') return
      const rot = Math.floor(Math.random() * 360)
      setZoneRotation(rot)
      angleRef.current = Math.random() * 360
      dirRef.current = 1
      setAngle(angleRef.current)
      setPhase('catching')
    }, 1600)
  }

  function advanceTour() {
    if (tourStep === null) return
    if (tourStep >= TOUR_STEPS.length - 1) {
      setTourStep(null)
      startTransition(async () => { await markFishingTourSeen() })
    } else {
      setTourStep(tourStep + 1)
    }
  }

  function advanceCatchTour() {
    if (catchTourStep === null) return
    if (catchTourStep >= CATCH_TOUR_STEPS.length - 1) {
      setCatchTourStep(null)
      startTransition(async () => { await markFishingCatchTourSeen() })
    } else {
      setCatchTourStep(catchTourStep + 1)
    }
  }

  // Phase 1 — cast (from idle)
  async function handleCast() {
    if (phase !== 'idle') return
    setCastRippleKey(k => k + 1)
    setTimeout(() => setCastRippleKey(0), 1800)
    await doCast()
  }

  // Phase 2 — reel in
  async function handleReelIn() {
    if (phase !== 'catching' || !hookedFishRef.current) return
    setSnapKey(k => k + 1)
    setReelRippleKey(k => k + 1)
    setTimeout(() => setReelRippleKey(0), 1800)
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }

    const zoneDiff2 = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baitBonus = getBait(selectedBaitRef.current).catchZoneBonus
    const zones = buildFishZones(hookedFishRef.current.catchDifficulty, hookTier, line.penaltyMultiplier, zoneDiff2.catchMultiplier, levelBonus + baitBonus + rod.catchZoneBonus, rod.perfectZoneBonus + 1)
    const zone  = getZone(zones, angleRef.current, zoneRotation)

    // Snag immune: treat penalty as miss — no extra bait lost
    const effectiveZoneType = (zone.type === 'penalty' && rod.snagImmune) ? 'miss' : zone.type

    if (effectiveZoneType === 'penalty') deductBait(selectedBaitRef.current)

    const isCatch = effectiveZoneType === 'catch' || effectiveZoneType === 'perfect'

    if (!isCatch) {
      // Second Wind rod: 25% chance to retry the dial on miss or snag
      if (rod.retryOnMissChance > 0 && Math.random() < rod.retryOnMissChance) {
        // Restore the bait lost to snag before retrying
        if (effectiveZoneType === 'penalty') {
          setBaitInventory(prev => prev.map(b =>
            b.bait_type === selectedBaitRef.current ? { ...b, quantity: b.quantity + 1 } : b
          ))
        }
        setRetryFlash(true)
        setTimeout(() => setRetryFlash(false), 1200)
        const rot = Math.floor(Math.random() * 360)
        setZoneRotation(rot)
        angleRef.current = Math.random() * 360
        dirRef.current = 1
        setAngle(angleRef.current)
        setRetryKey(k => k + 1)
        return
      }

      // Miss/penalty: challenge and streak fail
      setChallengeActive(false)
      setPerfectStreak(0)
      setMissResult(effectiveZoneType)
      setCatchResult(null)
      await new Promise(r => setTimeout(r, 200))
      phaseRef.current = 'result'
      setPhase('result')
      startTransition(async () => {
        await reelIn(hookedFishRef.current!.fishId, effectiveZoneType as 'miss' | 'penalty', selectedBaitRef.current)
      })
      return
    }

    // Catch/perfect: freeze needle, wait for server before showing result
    const wasPerfect = zone.type === 'perfect'
    if (wasPerfect) {
      setPerfectBurstKey(k => k + 1)
      setPerfectFlash(true)
      if ('vibrate' in navigator) navigator.vibrate([40, 60, 80])
    }

    // Consecutive perfect streak
    const newStreak = wasPerfect ? perfectStreak + 1 : 0
    const streakBonusXP = wasPerfect ? (perfectStreak + 1) ** 2 * 3 : 0  // streak 1=+3, 2=+12, 3=+27, 5=+75, 10=+300

    // Challenge mechanic: non-perfect catch clears the challenge without reward
    const wonChallenge = wasPerfect && challengeActive
    const triggerChallenge = wasPerfect && !challengeActive && Math.random() < 0.10
    if (!wasPerfect) { setChallengeActive(false); setPerfectStreak(0) }

    await new Promise(r => setTimeout(r, 200))
    phaseRef.current = 'reeling'
    setPhase('reeling')

    // Twin-Strike rod: 25% chance to catch 2 fish
    const doubleCatch = rod.doubleCatchChance > 0 && Math.random() < rod.doubleCatchChance
    // YOLO Rod: 10% chance to catch 100x fish
    const jackpotHit = !doubleCatch && (rod.jackpotChance ?? 0) > 0 && Math.random() < rod.jackpotChance!
    const jackpotMultiplier = jackpotHit ? (rod.jackpotMultiplier ?? 1) : 1

    startTransition(async () => {
      try {
      const res = await reelIn(hookedFishRef.current!.fishId, zone.type as 'perfect' | 'catch', selectedBaitRef.current, doubleCatch, streakBonusXP, jackpotMultiplier)

      if (wonChallenge) {
        await awardPerfectChallengeGem()
        setChallengeActive(false)
      } else if (triggerChallenge) {
        setChallengeActive(true)
      }

      if ('error' in res || !res.caught) {
        setMissResult('miss')
      } else {
        const { fish, baitSaved, isNewSpecies, bountyCompletion, xpGained, newXP } = res
        if (wasPerfect) {
          setPerfectStreak(newStreak)
          if (newStreak > highestPerfectStreak) {
            setHighestPerfectStreak(newStreak)
            setNewStreakRecord(newStreak)
            startTransition(() => { saveHighestPerfectStreak(newStreak) })
            checkLeaderboardPosition('perfectStreak').then(r => {
              const cur = r?.position ?? null
              if (cur === 1 && podiumPositionsRef.current.perfectStreak !== 1) setPodiumNotif({ category: 'Perfect Streak', position: 1 })
              podiumPositionsRef.current.perfectStreak = cur
            }).catch(() => {})
          }
        }
        setCatchResult({ fish, baitSaved, isNewSpecies, isPerfect: wasPerfect, xpGained, doubleCatch, gemEarned: wonChallenge, perfectStreak: newStreak, streakBonusXP, jackpotMultiplier: jackpotMultiplier > 1 ? jackpotMultiplier : undefined })
        if (isNewSpecies) { setCaughtFishIds(prev => new Set([...prev, fish.id])); setUncheckedNewFishIds(prev => new Set([...prev, fish.id])) }
        const catchCount = doubleCatch ? 2 : jackpotMultiplier
        const newCatches = [...sessionCatches, ...Array(catchCount).fill(fish)]
        const newPerfects = sessionPerfects + (wasPerfect ? 1 : 0)
        const newNewSpecies = sessionNewSpecies + (isNewSpecies ? 1 : 0)
        const newGems = sessionGems + (wonChallenge ? 1 : 0)
        setSessionCatches(newCatches)
        if (wasPerfect) setSessionPerfects(newPerfects)
        if (isNewSpecies) setSessionNewSpecies(newNewSpecies)
        if (wonChallenge) setSessionGems(newGems)
        if (activeSession && !sessionDone) {
          const ct = activeSession.challengeType
          if (ct === 'most_fish') setSessionScore(s => s + catchCount)
          else if (ct === 'most_doubloons') setSessionScore(s => s + (fish.sell_value ?? 0) * catchCount)
          else if (ct === 'most_perfects' && wasPerfect) setSessionScore(s => s + 1)
        }

        // Persist session to localStorage so Nav-away still surfaces a last session card
        try {
          const bestCatch = newCatches.reduce<FishSpecies | null>((b, f) => (!b || f.bite_rarity > b.bite_rarity) ? f : b, null)
          const rarityCounts: Record<number, number> = {}
          newCatches.forEach(f => { rarityCounts[f.bite_rarity] = (rarityCounts[f.bite_rarity] ?? 0) + 1 })
          localStorage.setItem('fishing_last_session', JSON.stringify({
            zone: selectedZone,
            totalCaught: newCatches.length,
            xpGained: newXP - initialFishingXP,
            perfects: newPerfects,
            newSpecies: newNewSpecies,
            gems: newGems,
            bestCatch: bestCatch ? { name: bestCatch.name, bite_rarity: bestCatch.bite_rarity, scientific_name: bestCatch.scientific_name } : null,
            rarityCounts,
          }))
        } catch {}

        if (bountyCompletion) setBountyNotif(bountyCompletion)
        const oldLevel = getLevelFromXP(fishingXP)
        const newLevel = getLevelFromXP(newXP)
        setFishingXP(newXP)
        setXpPopup({ value: xpGained, id: Date.now() })
        if (newLevel > oldLevel) {
          setLevelUpNotif(newLevel)
          checkLeaderboardPosition('fishingLevel').then(r => {
            const cur = r?.position ?? null
            if (cur === 1 && podiumPositionsRef.current.fishingLevel !== 1) setPodiumNotif({ category: 'Fishing Level', position: 1 })
            podiumPositionsRef.current.fishingLevel = cur
          }).catch(() => {})
        }
        setInventory(prev => {
          const existing = prev.find(i => i.fish_id === fish.id)
          const addQty = doubleCatch ? 2 : jackpotMultiplier
          const next = existing
            ? prev.map(i => i.fish_id === fish.id ? { ...i, quantity: i.quantity + addQty } : i)
            : [...prev, { fish_id: fish.id, quantity: addQty, fish_species: fish }]
          const prevCount = prev.reduce((s, i) => s + i.quantity, 0)
          const newCount  = next.reduce((s, i) => s + i.quantity, 0)
          return next
        })
        if (baitSaved) {
          setBaitInventory(prev => prev.map(b =>
            b.bait_type === selectedBaitRef.current ? { ...b, quantity: b.quantity + 1 } : b
          ))
        }
      }

      phaseRef.current = 'result'
      setPhase('result')
      } catch {
        setMissResult('miss')
        phaseRef.current = 'result'
        setPhase('result')
      }
    })
  }

  async function handleSell(fishId: number, qty: number) {
    setSellPending(fishId)
    const res = await sellFish(fishId, qty)
    setSellPending(null)
    if ('error' in res) return
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    setInventory(prev => prev
      .map(i => i.fish_id === fishId ? { ...i, quantity: i.quantity - qty } : i)
      .filter(i => i.quantity > 0)
    )
  }

  async function handleCastAgain() {
    if (phase !== 'result') return
    setCastRippleKey(k => k + 1)
    setTimeout(() => setCastRippleKey(0), 1800)
    setCatchResult(null)
    setMissResult(null)
    setHookedFish(null)
    setPerfectFlash(false)
    setBountyNotif(null)
    setLevelUpNotif(null)
    setHoldOpen(false)
    setGearOpen(false)
    await doCast()
  }

  async function handleEquipRod(tier: number) {
    const result = await equipRod(tier)
    if (!('error' in result)) {
      setEquippedRodTier(tier)
      if (!ownedRods.includes(tier)) setOwnedRods(prev => [...prev, tier])
    }
  }

  async function handleClaimZoneReward(zone: string) {
    if (claimingZone || claimedZones[zone]) return
    setClaimingZone(zone)
    const result = await claimZoneReward(zone)
    setClaimingZone(null)
    if ('error' in result) return
    setClaimedZones(prev => ({ ...prev, [zone]: true }))
    setDoubloons(result.doubloons)
    setZoneClaimToast({ zone, earned: result.earned })
    setTimeout(() => setZoneClaimToast(null), 4000)
  }

  // Zone display helpers
  const catchingZones = hookedFish ? buildFishZones(hookedFish.catchDifficulty, hookTier, line.penaltyMultiplier, (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).catchMultiplier, levelBonus + getBait(selectedBait).catchZoneBonus + rod.catchZoneBonus, rod.perfectZoneBonus + 1) : []
  const currentZone   = (phase === 'catching' || phase === 'reeling') ? getZone(catchingZones, angle, zoneRotation) : null

  function needleColor(): string {
    if ((phase === 'catching' || phase === 'reeling') && currentZone) return currentZone.color
    return 'rgba(255,255,255,0.3)'
  }

  function zoneOpacity(zone: ZoneDef): number {
    if (phase === 'catching' && currentZone) {
      return currentZone === zone ? 1.0 : zone.type === 'perfect' ? 0.50 : zone.type === 'penalty' ? 0.45 : 0.28
    }
    return 0.35
  }

  const hasBait = totalBait() > 0
  const selectedBaitQty  = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
  const selectedBaitDef  = BAITS.find(b => b.type === selectedBait)
  const holdTotalCount   = inventory.reduce((s, i) => s + i.quantity, 0)
  const holdTotalValue   = inventory.reduce((s, i) => s + Math.floor(i.fish_species.sell_value * 0.65) * i.quantity, 0)
  const holdBaseValue    = inventory.reduce((s, i) => s + i.fish_species.sell_value * i.quantity, 0)

  const isBobbing = sceneFrame === 'fishing' && (phase === 'casting' || phase === 'hooked')

  const hookedRarity = hookedFish?.biteRarity ?? 1
  const bgBobAnimate = !isBobbing
    ? { x: 0, y: 0 }
    : phase !== 'hooked'
      ? { x: 0, y: [0, -6, 0] }
      : hookedRarity >= 5 ? { x: [0, -8, 8, -6, 6, -3, 0], y: [0, 15, -4, 13, -1, 0] }
      : hookedRarity >= 4 ? { x: [0, -4, 4, -2, 0],         y: [0, 11, -1, 9, 0] }
      : hookedRarity >= 3 ? { x: 0,                          y: [0, 8, 0] }
      : hookedRarity >= 2 ? { x: 0,                          y: [0, 5, 0] }
      :                     { x: 0,                          y: [0, 3, 0] }
  const bgBobTransition = !isBobbing
    ? { duration: 0.12 }
    : phase !== 'hooked'
      ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }
      : {
          duration: hookedRarity >= 5 ? 0.32 : hookedRarity >= 4 ? 0.40 : hookedRarity >= 3 ? 0.50 : hookedRarity >= 2 ? 0.60 : 0.72,
          repeat: Infinity, ease: 'easeInOut' as const,
        }

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0" style={{ background: '#08121c', zIndex: 40, display: 'flex', justifyContent: 'center' }}>
      <div className="relative w-full max-w-md overflow-hidden" style={{ height: '100%' }}>

        {/* Background layers — img tags force eager loading so no black-frame on switch */}
        <motion.div
          animate={bgBobAnimate}
          transition={bgBobTransition}
          style={{ position: 'absolute', inset: '-14px' }}
        >
          {(Object.keys(FRAME_SRC) as SceneFrame[]).map(frame => (
            <img
              key={frame}
              ref={el => { if (el) frameRefs.current[frame] = el }}
              src={FRAME_SRC[frame]}
              alt=""
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'cover',
                objectPosition: 'top center',
                zIndex: sceneFrame === frame ? 1 : 0,
              }}
            />
          ))}
        </motion.div>

        {/* Zone darkness overlay — gradient from transparent (top 20%) to dark (bottom) */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none',
          background: `linear-gradient(to bottom, transparent 20%, rgba(0,0,0,${
            selectedZone === 'abyss'       ? '0.72' :
            selectedZone === 'deep'        ? '0.45' :
            selectedZone === 'open_waters' ? '0.22' : '0'
          }) 100%)`,
        }} />

        {/* UI content — fills full height as flex column */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', paddingBottom: '1.25rem' }}>

          {/* Header row — back button left, gear button right */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onBack}
              className="font-karla font-600 uppercase tracking-[0.1em]"
              style={{
                fontSize: '0.6rem', color: HABITAT_COLOR[selectedZone],
                background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                borderRadius: 20, padding: '0.3rem 0.65rem',
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              ← {HABITAT_LABEL[selectedZone]}
            </button>

            <button
              onClick={() => { setCollectionOpen(o => !o); setGearOpen(false); setHoldOpen(false) }}
              style={{
                background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                borderRadius: 20, padding: '0.28rem 0.7rem',
                cursor: 'pointer', touchAction: 'manipulation',
                position: 'relative',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <span className="font-karla font-600 uppercase tracking-[0.1em]"
                style={{ fontSize: '0.48rem', color: HABITAT_COLOR[selectedZone] + 'dd', lineHeight: 1 }}>
                Collection
              </span>
              <span className="font-cinzel font-700"
                style={{ fontSize: '0.88rem', color: HABITAT_COLOR[selectedZone], lineHeight: 1 }}>
                {caughtFishIds.size}
                <span className="font-karla font-400" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)' }}>
                  /{allFishSpecies.length}
                </span>
              </span>
              {uncheckedNewFishIds.size > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  minWidth: 14, height: 14, borderRadius: 7,
                  background: '#f87171',
                  border: '1.5px solid #08121c',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.48rem', fontWeight: 700, color: '#fff',
                  paddingInline: uncheckedNewFishIds.size > 9 ? '0.2rem' : 0,
                  fontFamily: 'var(--font-karla)',
                }}>
                  {uncheckedNewFishIds.size}
                </span>
              )}
            </button>

          </div>

          {/* XP bar */}
          <div style={{ marginBottom: '0.6rem' }}>
            <div style={{ position: 'relative' }}>
              <XPBarDisplay xp={fishingXP} bestStreak={highestPerfectStreak} />
              <AnimatePresence>
                {xpPopup && (
                  <motion.p
                    key={xpPopup.id}
                    initial={{ opacity: 0, y: 0 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -18 }}
                    transition={{ duration: 2.0, times: [0, 0.1, 0.6, 1], ease: 'easeOut' }}
                    onAnimationComplete={() => setXpPopup(null)}
                    className="font-karla font-700"
                    style={{
                      position: 'absolute', right: 8, top: 0,
                      fontSize: '0.8rem', color: '#4ade80',
                      pointerEvents: 'none',
                      textShadow: '0 0 10px rgba(74,222,128,0.7)',
                    }}
                  >
                    +{xpPopup.value} XP
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Challenge session strip */}
          {activeSession && !sessionDone && sessionSecondsLeft !== null && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(4,10,18,0.82)', border: '1px solid rgba(251,146,60,0.35)',
              borderRadius: 20, padding: '0.3rem 0.65rem', marginBottom: '0.5rem', gap: 8,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fb923c', animation: 'pulse 2s infinite', flexShrink: 0 }} />
                <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#fb923c' }}>
                  vs {activeSession.opponentUsername}
                </span>
                <span className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)' }}>
                  · {sessionScore} {activeSession.challengeType === 'most_fish' ? 'fish' : activeSession.challengeType === 'most_doubloons' ? '⟡' : 'perfects'}
                </span>
              </div>
              <span className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#fb923c', flexShrink: 0 }}>
                {Math.floor(sessionSecondsLeft / 60)}:{(sessionSecondsLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          {/* Phase content — grows to fill available space */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait">

              {/* ── IDLE / CASTING / HOOKED — single persistent element, updates in place ── */}
              {(phase === 'idle' || phase === 'casting' || phase === 'hooked') && (
                <motion.div key="pre-catch"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>


                  {/* Status pill — centred in the dial space, each state animates independently */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

                      {phase === 'casting' && castAnimDone && (
                        <motion.div key="waiting-pill"
                          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.15 }}
                          style={{
                            position: 'relative',
                            background: 'rgba(4,10,18,0.52)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 20,
                            padding: '1.1rem 1.75rem',
                            textAlign: 'center',
                          }}>
                          <p className="font-karla font-600" style={{ fontSize: '1rem', color: '#e8e4de' }}>
                            {waitMessage}
                          </p>
                          <div style={{
                            position: 'absolute', bottom: -7, left: '50%',
                            transform: 'translateX(-50%) rotate(45deg)',
                            width: 12, height: 12,
                            background: 'rgba(4,10,18,0.52)',
                            borderRight: '1px solid rgba(255,255,255,0.08)',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                          }} />
                        </motion.div>
                      )}

                      {phase === 'hooked' && hookedFish && (() => {
                        const r = RARITY[hookedFish.biteRarity] ?? RARITY[1]
                        const isLegendary = hookedFish.biteRarity === 5
                        const isEpicPlus  = hookedFish.biteRarity >= 4
                        return (
                          <motion.div key="hooked-pill"
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                            style={{
                              position: 'relative',
                              background: 'rgba(4,10,18,0.52)',
                              border: `1px solid ${r.color}40`,
                              borderRadius: 20,
                              padding: '1.1rem 1.75rem',
                              textAlign: 'center',
                              boxShadow: `0 0 32px ${r.color}28`,
                            }}
                          >
                            <motion.p
                              className="font-karla font-700"
                              animate={isLegendary
                                ? { scale: [1, 1.04, 1], opacity: [1, 0.82, 1] }
                                : isEpicPlus ? { opacity: [1, 0.85, 1] } : {}
                              }
                              transition={isLegendary || isEpicPlus
                                ? { duration: 0.8, repeat: Infinity, ease: 'easeInOut' }
                                : {}
                              }
                              style={{
                                fontSize: isLegendary ? '1.1rem' : isEpicPlus ? '1rem' : '0.95rem',
                                color: r.color,
                                textShadow: `0 0 20px ${r.color}80`,
                                letterSpacing: isLegendary ? '0.04em' : 'normal',
                              }}
                            >
                              {r.hookedText}
                            </motion.p>
                            <div style={{
                              position: 'absolute', bottom: -7, left: '50%',
                              transform: 'translateX(-50%) rotate(45deg)',
                              width: 12, height: 12,
                              background: 'rgba(4,10,18,0.52)',
                              borderRight: `1px solid ${r.color}40`,
                              borderBottom: `1px solid ${r.color}40`,
                            }} />
                          </motion.div>
                        )
                      })()}

                  </div>

                </motion.div>
              )}

              {/* ── CATCHING / REELING ── */}
              {(phase === 'catching' || phase === 'reeling') && hookedFish && (
                <motion.div key="catching"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  <div style={{ minHeight: '1.6rem' }}>
                    {(phase === 'reeling' || currentZone) && (
                      <div style={{
                        display: 'inline-block',
                        background: 'rgba(4,10,18,0.52)',
                        border: `1px solid ${currentZone?.color ?? 'rgba(255,255,255,0.08)'}35`,
                        borderRadius: 20,
                        padding: '0.3rem 0.85rem',
                      }}>
                        <p className="font-cinzel font-700 uppercase tracking-[0.18em]"
                          style={{
                            fontSize: '0.88rem',
                            color: retryFlash ? '#fb923c' : (currentZone?.color ?? '#e8e4de'),
                            textShadow: retryFlash ? '0 0 16px rgba(251,146,60,0.7)' : currentZone ? `0 0 16px ${currentZone.color}70` : 'none',
                          }}>
                          {retryFlash ? 'Second Wind!' : phase === 'reeling' ? 'Reeling in…' : (currentZone?.label ?? '')}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Double-perfect challenge taunt */}
                  {challengeActive && phase === 'catching' && (
                    <motion.p
                      initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                      className="font-karla font-700 text-center"
                      style={{ fontSize: '0.65rem', color: '#f59e0b', letterSpacing: '0.04em', marginBottom: 4 }}
                    >
                      I bet you can&apos;t do that again.
                    </motion.p>
                  )}

                  <div style={{ position: 'relative' }}>
                    {perfectStreak >= 3 && (
                      <motion.div
                        style={{ position: 'absolute', top: -28, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}
                        initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      >
                        <motion.span className="font-cinzel font-700"
                          style={{ fontSize: '0.95rem', color: '#f97316', textShadow: '0 0 16px rgba(249,115,22,0.8)', letterSpacing: '0.04em' }}
                          animate={{ opacity: [0.75, 1, 0.75] }}
                          transition={{ duration: 0.6, repeat: Infinity }}
                        >
                          🔥 {perfectStreak} perfect streak
                        </motion.span>
                      </motion.div>
                    )}
                    <DialSVG zones={catchingZones} angle={angle} rotation={zoneRotation}
                      needleColor={needleColor()} zoneOpacityFn={zoneOpacity}
                      fireLevel={perfectStreak >= 3 ? 2 : perfectStreak === 2 ? 1 : 0}
                      snapKey={snapKey} perfectBurstKey={perfectBurstKey} />
                  </div>
                </motion.div>
              )}

              {/* ── RESULT ── */}
              {phase === 'result' && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  {bountyNotif && (
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 22, delay: 0.3 }}
                      className="flex items-center gap-3 px-4 py-3 rounded-xl mb-3"
                      style={{
                        background: `rgba(4,10,20,0.88)`,
                        border: `1px solid ${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}90`,
                        boxShadow: `0 0 18px ${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}30`,
                      }}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}25`, border: `1px solid ${HABITAT_COLOR[bountyNotif.tier] ?? '#888'}60`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '1.1rem' }}>🎯</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.55rem', color: HABITAT_COLOR[bountyNotif.tier] ?? '#aaa', marginBottom: 2 }}>
                          Weekly Bounty Complete
                        </p>
                        <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.88rem', color: '#ffffff' }}>
                          {bountyNotif.fishName} caught!
                        </p>
                        <p className="font-karla font-600" style={{ fontSize: '0.65rem', color: '#d0cdc8' }}>
                          +{bountyNotif.reward} ⟡{bountyNotif.packAwarded ? ' + 1 Pack' : ''} · visit Bounties to claim
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {catchResult ? (
                    <ResultCard fish={catchResult.fish} baitSaved={catchResult.baitSaved} isNewSpecies={catchResult.isNewSpecies} isPerfect={catchResult.isPerfect} xpGained={catchResult.xpGained} doubleCatch={catchResult.doubleCatch} gemEarned={catchResult.gemEarned} perfectStreak={catchResult.perfectStreak} streakBonusXP={catchResult.streakBonusXP} jackpotMultiplier={catchResult.jackpotMultiplier} />
                  ) : missResult ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-6">
                      <p className="font-cinzel font-700 mb-1"
                        style={{ fontSize: '1rem', color: missResult === 'penalty' ? '#f87171' : '#64748b' }}>
                        {missResult === 'penalty' ? 'Snagged!' : 'No catch'}
                      </p>
                      {missResult !== 'penalty' && (
                        <p className="font-karla font-400" style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          The fish slipped away.
                        </p>
                      )}
                    </motion.div>
                  ) : null}

                </motion.div>
              )}

            </AnimatePresence>
          </div>

          {/* ── Action button — same position every phase ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
            <AnimatePresence mode="wait">
              {(phase === 'idle' || phase === 'result') && holdTotalCount >= holdCapacity && (
                <motion.div key="holdfull"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center">
                  <p className="font-karla font-700 mb-1" style={{ fontSize: '0.78rem', color: '#f87171' }}>
                    Hold is full
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 8 }}>
                    Sell your catch below<br />to keep fishing
                  </p>
                  <Link
                    href="/marketplace/shipyard"
                    className="font-karla font-700"
                    style={{ fontSize: '0.68rem', color: '#60a5fa', textDecoration: 'none', display: 'inline-block', borderBottom: '1px solid rgba(96,165,250,0.4)', paddingBottom: 1 }}
                  >
                    Upgrade your boat for more storage ↗
                  </Link>
                </motion.div>
              )}
              {phase === 'idle' && holdTotalCount < holdCapacity && hasBait && selectedBaitQty > 0 && (
                <motion.button key="cast" onClick={handleCast}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.45), rgba(14,116,144,0.18))',
                    border: '1px solid rgba(34,170,200,0.5)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#67d4e8', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.6), 0 0 28px rgba(14,116,144,0.35), inset 0 1px 0 rgba(255,255,255,0.12)',
                    position: 'relative',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.6)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >
                  {castRippleKey > 0 && [0, 220, 440].map((delay, i) => (
                    <motion.span key={`${castRippleKey}-${i}`} style={{ position: 'absolute', borderRadius: '50%', width: '100%', height: '100%', border: '1.5px solid rgba(103,212,232,0.55)', background: 'transparent', pointerEvents: 'none' }}
                      initial={{ scale: 1, opacity: 0.55 }} animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: [0.2, 0, 0.6, 1], delay: delay / 1000 }}
                    />
                  ))}
                  Cast
                </motion.button>
              )}
              {phase === 'idle' && holdTotalCount < holdCapacity && (!hasBait || selectedBaitQty <= 0) && (
                <motion.div key="nobait"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center">
                  <p className="font-karla font-600 mb-3" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)' }}>
                    You&apos;re out of bait
                  </p>
                  <Link href="/marketplace/tackle-shop#bait"
                    className="btn-ghost"
                    style={{ display: 'inline-block' }}>
                    Buy Bait
                  </Link>
                </motion.div>
              )}
              {phase === 'catching' && (
                <motion.button key="reel"
                  onPointerDown={e => { e.preventDefault(); handleReelIn() }}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(240,192,64,0.28), rgba(240,192,64,0.08))',
                    border: '1px solid rgba(240,192,64,0.4)', cursor: 'pointer',
                    fontSize: '0.72rem', color: '#f0c040', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(240,192,64,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                    position: 'relative',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >
                  {reelRippleKey > 0 && [0, 220, 440].map((delay, i) => (
                    <motion.span key={`${reelRippleKey}-${i}`} style={{ position: 'absolute', borderRadius: '50%', width: '100%', height: '100%', border: '1.5px solid rgba(240,192,64,0.55)', background: 'transparent', pointerEvents: 'none' }}
                      initial={{ scale: 1, opacity: 0.55 }} animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: [0.2, 0, 0.6, 1], delay: delay / 1000 }}
                    />
                  ))}
                  Reel In
                </motion.button>
              )}
              {phase === 'reeling' && (
                <motion.div key="reeling"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#4a4845' }}>…</p>
                </motion.div>
              )}
              {phase === 'result' && holdTotalCount < holdCapacity && (
                <motion.button key="again" onClick={handleCastAgain}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(14,116,144,0.35), rgba(14,116,144,0.12))',
                    border: '1px solid rgba(34,170,200,0.4)', cursor: 'pointer',
                    fontSize: '0.65rem', color: '#67d4e8', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 22px rgba(14,116,144,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
                    position: 'relative',
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >
                  {castRippleKey > 0 && [0, 220, 440].map((delay, i) => (
                    <motion.span key={`${castRippleKey}-${i}`} style={{ position: 'absolute', borderRadius: '50%', width: '100%', height: '100%', border: '1.5px solid rgba(103,212,232,0.55)', background: 'transparent', pointerEvents: 'none' }}
                      initial={{ scale: 1, opacity: 0.55 }} animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: [0.2, 0, 0.6, 1], delay: delay / 1000 }}
                    />
                  ))}
                  Cast Again
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* ── Bottom buttons — 4 action tiles ── */}
          {(() => {
            const holdPct      = holdCapacity > 0 ? holdTotalCount / holdCapacity : 0
            const holdFull     = holdTotalCount >= holdCapacity
            const holdCritical = !holdFull && holdPct >= 0.9
            const holdWarning  = !holdFull && !holdCritical && holdPct >= 0.75
            const holdAccent   = holdFull ? '#f87171' : holdCritical ? '#fb923c' : holdWarning ? '#fbbf24' : '#f0c040'
            const baitAccent   = selectedBaitDef?.color ?? '#94a3b8'
            const outOfBait    = selectedBaitQty === 0

            const baitStat = outOfBait
              ? 'Out of bait'
              : (selectedBaitDef?.catchZoneBonus ?? 0) > 0
                ? `+${selectedBaitDef!.catchZoneBonus}° zone`
                : (selectedBaitDef?.waitMult ?? 1) < 1.0
                  ? `${Math.round((1 - selectedBaitDef!.waitMult) * 100)}% faster`
                  : 'Standard'

            const tile: React.CSSProperties = {
              flex: 1, height: 74, borderRadius: 16,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
              gap: 2, padding: '0 0.65rem', minWidth: 0,
              cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
            }

            return (
              <div style={{ display: 'flex', gap: '0.45rem', paddingTop: '0.75rem' }}>

                {/* Gear */}
                <button
                  onClick={() => { setGearOpen(o => !o); setHoldOpen(false); setBaitOpen(false) }}
                  style={{
                    ...tile,
                    background: gearOpen ? 'rgba(240,192,64,0.10)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${gearOpen ? 'rgba(240,192,64,0.32)' : 'rgba(255,255,255,0.09)'}`,
                  }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>Gear</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#d4c09a', lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {rod.name}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.22)', lineHeight: 1 }}>
                    Hk{hookTier} · Re{reelTier} · Ln{lineTier}
                  </p>
                </button>

                {/* Bait */}
                <button
                  onClick={() => { setBaitOpen(o => !o); setGearOpen(false); setHoldOpen(false) }}
                  style={{
                    ...tile,
                    background: baitOpen ? `${baitAccent}10` : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${baitOpen ? baitAccent + '38' : outOfBait ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.09)'}`,
                  }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>Bait</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: outOfBait ? '#f87171' : baitAccent, lineHeight: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                    {selectedBaitDef?.name ?? '—'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: outOfBait ? 'rgba(248,113,113,0.55)' : 'rgba(255,255,255,0.22)', lineHeight: 1 }}>
                    {outOfBait ? 'Out of bait' : `×${selectedBaitQty} · ${baitStat}`}
                  </p>
                </button>

                {/* Hold */}
                <button
                  onClick={() => { setHoldOpen(o => !o); setGearOpen(false); setBaitOpen(false) }}
                  style={{
                    ...tile,
                    background: holdOpen
                      ? `${holdAccent}10`
                      : holdFull ? 'rgba(248,113,113,0.06)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${holdOpen
                      ? holdAccent + '45'
                      : holdFull ? 'rgba(248,113,113,0.35)' : holdCritical ? 'rgba(251,146,60,0.28)' : holdWarning ? 'rgba(251,191,36,0.20)' : 'rgba(255,255,255,0.09)'}`,
                  }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>Hold</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', lineHeight: 1, color: holdTotalCount > 0 ? holdAccent : '#3a3835' }}>
                    {holdTotalCount}<span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.18)', fontWeight: 400 }}> /{holdCapacity}</span>
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', lineHeight: 1, color: holdFull ? '#f87171aa' : holdCritical ? '#fb923caa' : holdTotalCount > 0 ? 'rgba(255,255,255,0.22)' : '#2a2825' }}>
                    {holdFull ? 'Full' : holdCritical ? 'Almost full' : holdWarning ? 'Getting full' : holdTotalCount > 0 ? 'fish in hold' : 'empty'}
                  </p>
                </button>

                {/* Sell */}
                <button
                  onClick={() => { setHoldOpen(o => !o); setGearOpen(false); setBaitOpen(false) }}
                  style={{
                    ...tile,
                    background: holdOpen ? 'rgba(240,192,64,0.08)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${holdOpen ? 'rgba(240,192,64,0.28)' : 'rgba(255,255,255,0.09)'}`,
                  }}
                >
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.45)' }}>Sell</p>
                  <p className="font-karla font-700" style={{ fontSize: '0.72rem', lineHeight: 1, color: holdTotalValue > 0 ? '#f0c040' : '#3a3835' }}>
                    {holdTotalValue > 0 ? `${holdTotalValue.toLocaleString()} ⟡` : '—'}
                  </p>
                  <p className="font-karla" style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.22)', lineHeight: 1 }}>
                    quick sell · market
                  </p>
                </button>

              </div>
            )
          })()}

        </div>

      {/* ── Catch mechanics tour ── */}
      <AnimatePresence>
        {catchTourStep !== null && (
          <>
            <motion.div
              key="catch-tour-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={advanceCatchTour}
              style={{ position: 'absolute', inset: 0, background: 'rgba(4,8,16,0.82)', zIndex: 18, cursor: 'pointer' }}
            />
            <motion.div
              key={`catch-tour-${catchTourStep}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', bottom: 136, left: 16, right: 16, zIndex: 19,
                background: '#0a1828',
                border: '1px solid rgba(255,255,255,0.1)',
                borderLeft: `3px solid ${CATCH_TOUR_STEPS[catchTourStep].color}`,
                borderRadius: 14,
                padding: '1rem 1.1rem',
              }}
            >
              <div className="flex items-center gap-2.5 mb-2">
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: CATCH_TOUR_STEPS[catchTourStep].color, flexShrink: 0 }} />
                <p className="font-cinzel font-700"
                  style={{ fontSize: '0.85rem', color: CATCH_TOUR_STEPS[catchTourStep].color }}>
                  {CATCH_TOUR_STEPS[catchTourStep].title}
                </p>
              </div>
              <p className="font-karla font-400 mb-3"
                style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
                {CATCH_TOUR_STEPS[catchTourStep].body}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
                  {catchTourStep + 1} / {CATCH_TOUR_STEPS.length}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); advanceCatchTour() }}
                  className="font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
                    color: CATCH_TOUR_STEPS[catchTourStep].color,
                    background: `${CATCH_TOUR_STEPS[catchTourStep].color}18`,
                    border: `1px solid ${CATCH_TOUR_STEPS[catchTourStep].color}50`,
                    borderRadius: 8, padding: '0.35rem 0.85rem',
                  }}
                >
                  {catchTourStep === CATCH_TOUR_STEPS.length - 1 ? 'Got it' : 'Next →'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Onboarding tour ── */}
      <AnimatePresence>
        {tourStep !== null && !collectionOpen && !gearOpen && !baitOpen && !holdOpen && (
          <>
            <motion.div
              key="tour-backdrop"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={advanceTour}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.62)', zIndex: 22, cursor: 'pointer' }}
            />
            <motion.div
              key={`tour-${tourStep}`}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.18 }}
              style={{
                position: 'absolute', zIndex: 23,
                background: '#0d1e2e',
                border: `1px solid ${HABITAT_COLOR[selectedZone]}45`,
                borderRadius: 14,
                padding: '1rem 1.1rem',
                maxWidth: TOUR_STEPS[tourStep].maxWidth ?? 'calc(100% - 2rem)',
                ...TOUR_STEPS[tourStep].cardStyle,
              }}
            >
              {/* Arrow caret */}
              {(() => {
                const step = TOUR_STEPS[tourStep]
                const color = `${HABITAT_COLOR[selectedZone]}45`
                const base: React.CSSProperties = {
                  position: 'absolute', width: 10, height: 10, background: '#0d1e2e',
                  transform: 'rotate(45deg)',
                }
                const pos: React.CSSProperties = step.arrowDir === 'up'
                  ? { top: -6, ...(step.arrowAlign === 'center' ? { left: '50%', marginLeft: -5 } : step.arrowAlign === 'right' ? { right: 22 } : { left: 22 }) }
                  : { bottom: -6, ...(step.arrowAlign === 'right' ? { right: 22 } : { left: 22 }) }
                const border: React.CSSProperties = step.arrowDir === 'up'
                  ? { borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` }
                  : { borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }
                return <div style={{ ...base, ...pos, ...border }} />
              })()}

              <p className="font-cinzel font-700 mb-1.5"
                style={{ fontSize: '0.82rem', color: HABITAT_COLOR[selectedZone] }}>
                {TOUR_STEPS[tourStep].title}
              </p>
              <p className="font-karla font-400 mb-3"
                style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                {TOUR_STEPS[tourStep].body}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845' }}>
                  {tourStep + 1} / {TOUR_STEPS.length}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); advanceTour() }}
                  className="font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    fontSize: '0.68rem', cursor: 'pointer', touchAction: 'manipulation',
                    color: HABITAT_COLOR[selectedZone],
                    background: `${HABITAT_COLOR[selectedZone]}18`,
                    border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                    borderRadius: 8, padding: '0.35rem 0.85rem',
                  }}
                >
                  {tourStep === TOUR_STEPS.length - 1 ? 'Got it' : 'Next →'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Zone completion celebration ── */}
      <AnimatePresence>
        {zoneClaimToast && (() => {
          const zc = HABITAT_COLOR[zoneClaimToast.zone] ?? '#f59e0b'
          const zl = HABITAT_LABEL[zoneClaimToast.zone] ?? zoneClaimToast.zone
          return (
            <motion.div key="zone-claim-toast"
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(3,8,16,0.82)',
                backdropFilter: 'blur(6px)',
              }}
              onClick={() => setZoneClaimToast(null)}
            >
              {/* Burst rings */}
              {[0, 0.12, 0.24].map((delay, i) => (
                <motion.div key={i}
                  initial={{ scale: 0.6, opacity: 0.6 - i * 0.15 }}
                  animate={{ scale: 2.8 - i * 0.3, opacity: 0 }}
                  transition={{ duration: 0.9, ease: 'easeOut', delay }}
                  style={{
                    position: 'absolute',
                    width: 180, height: 180,
                    borderRadius: '50%',
                    border: `${2 - i * 0.4}px solid ${zc}${['99', '66', '44'][i]}`,
                    pointerEvents: 'none',
                  }}
                />
              ))}
              <div style={{
                background: `linear-gradient(145deg, rgba(6,16,26,0.98) 0%, ${zc}18 100%)`,
                border: `1px solid ${zc}50`,
                borderTop: `3px solid ${zc}cc`,
                borderRadius: 20,
                padding: '2rem 2.5rem',
                textAlign: 'center',
                boxShadow: `0 0 60px ${zc}30, 0 0 120px ${zc}15`,
                maxWidth: 280,
              }}>
                <motion.div
                  initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                  style={{ fontSize: '2.5rem', marginBottom: '0.75rem', lineHeight: 1 }}
                >
                  🏆
                </motion.div>
                <p className="font-karla font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.52rem', color: zc + 'cc', marginBottom: '0.4rem' }}>
                  Zone Complete
                </p>
                <p className="font-cinzel font-700"
                  style={{ fontSize: '1.4rem', color: zc, textShadow: `0 0 24px ${zc}80`, marginBottom: '0.25rem', lineHeight: 1.1 }}>
                  {zl}
                </p>
                <p className="font-karla font-400"
                  style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '1.25rem' }}>
                  Every fish in this zone discovered
                </p>
                <div style={{
                  background: 'rgba(240,192,64,0.08)',
                  border: '1px solid rgba(240,192,64,0.25)',
                  borderRadius: 12,
                  padding: '0.6rem 1rem',
                  marginBottom: '1rem',
                }}>
                  <p className="font-karla font-600 uppercase tracking-[0.1em]"
                    style={{ fontSize: '0.48rem', color: 'rgba(240,192,64,0.5)', marginBottom: 3 }}>Reward</p>
                  <p className="font-cinzel font-700"
                    style={{ fontSize: '1.6rem', color: '#f0c040', textShadow: '0 0 20px rgba(240,192,64,0.6)', lineHeight: 1 }}>
                    +{zoneClaimToast.earned.toLocaleString()} ⟡
                  </p>
                </div>
                <p className="font-karla font-400"
                  style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.2)' }}>Tap anywhere to close</p>
              </div>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Collection drawer ── */}
      <AnimatePresence>
        {collectionOpen && (
          <motion.div key="collection-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Sticky header */}
            <div className="flex items-center justify-between flex-shrink-0"
              style={{ padding: '1.25rem 1.1rem 0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.82rem', color: '#6a6764' }}>Fish Collection</p>
              <button onClick={() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) }}
                style={{ color: '#4a4845', fontSize: '1.2rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '0 1.1rem 2rem', overscrollBehavior: 'contain' }}>
            {ZONES.map(zone => {
              const zoneSpecies = allFishSpecies.filter(f => f.habitat === zone)
              const discoveredCount = zoneSpecies.filter(f => caughtFishIds.has(f.id)).length
              const zoneColor = HABITAT_COLOR[zone]
              const isExpanded = expandedZone === zone
              const pct = zoneSpecies.length > 0 ? discoveredCount / zoneSpecies.length : 0
              const isComplete = discoveredCount === zoneSpecies.length && zoneSpecies.length > 0
              const isClaimed = claimedZones[zone] ?? false
              const isClaiming = claimingZone === zone

              return (
                <div key={zone} style={{ marginBottom: '0.6rem' }}>
                  <button
                    className="w-full text-left"
                    style={{
                      background: `linear-gradient(135deg, rgba(6,16,26,0.97) 0%, ${zoneColor}12 100%)`,
                      border: `1px solid ${zoneColor}28`,
                      borderLeft: `3px solid ${zoneColor}bb`,
                      borderRadius: isExpanded ? '12px 12px 0 0' : 12,
                      padding: '0.75rem 0.9rem 0.65rem',
                      cursor: 'pointer',
                      transition: 'border-radius 0.15s',
                    }}
                    onClick={() => { setExpandedZone(isExpanded ? null : zone); setTappedFishId(null) }}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                      <div>
                        <p className="font-karla font-700 uppercase tracking-[0.14em]"
                          style={{ fontSize: '0.85rem', color: zoneColor, lineHeight: 1 }}>{HABITAT_LABEL[zone]}</p>
                        <p className="font-karla font-400"
                          style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{HABITAT_TAGLINE[zone]}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          <p className="font-karla font-600"
                            style={{ fontSize: '0.78rem', color: isComplete ? zoneColor : 'rgba(255,255,255,0.5)' }}>
                            {discoveredCount}<span style={{ color: 'rgba(255,255,255,0.25)' }}>/{zoneSpecies.length}</span>
                          </p>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={zoneColor + '80'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                            style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0 }}>
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </div>
                        <p className="font-karla font-600"
                          style={{ fontSize: '0.58rem', color: isClaimed ? zoneColor + '70' : 'rgba(240,192,64,0.4)' }}>
                          {isClaimed ? '✓ reward claimed' : `🏆 ${(ZONE_REWARD_DOUBLOONS_UI[zone] ?? 0).toLocaleString()} ⟡ on completion`}
                        </p>
                      </div>
                    </div>
                    <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${pct * 100}%`,
                        background: isComplete ? zoneColor : `linear-gradient(90deg, ${zoneColor}88, ${zoneColor})`,
                        borderRadius: 2,
                        transition: 'width 0.4s ease',
                        boxShadow: pct > 0 ? `0 0 6px ${zoneColor}60` : 'none',
                      }} />
                    </div>
                  </button>

                  {/* Reward claim strip */}
                  {isComplete && !isClaimed && (
                    <motion.button
                      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                      onClick={() => handleClaimZoneReward(zone)}
                      disabled={isClaiming}
                      className="w-full flex items-center justify-between"
                      style={{
                        background: `linear-gradient(90deg, ${zoneColor}20, ${zoneColor}10)`,
                        border: `1px solid ${zoneColor}50`,
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        padding: '0.5rem 0.9rem',
                        cursor: isClaiming ? 'default' : 'pointer',
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: '0.9rem' }}>🏆</span>
                        <div className="text-left">
                          <p className="font-karla font-700 uppercase tracking-[0.1em]"
                            style={{ fontSize: '0.52rem', color: zoneColor, lineHeight: 1 }}>Zone Complete!</p>
                          <p className="font-karla font-600"
                            style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Tap to claim your reward</p>
                        </div>
                      </div>
                      <p className="font-cinzel font-700"
                        style={{ fontSize: '0.88rem', color: '#f0c040' }}>
                        {isClaiming ? '…' : `${(ZONE_REWARD_DOUBLOONS_UI[zone] ?? 0).toLocaleString()} ⟡`}
                      </p>
                    </motion.button>
                  )}
                  {isComplete && isClaimed && (
                    <div className="flex items-center justify-between"
                      style={{
                        background: 'rgba(4,10,18,0.4)',
                        border: `1px solid ${zoneColor}20`,
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        padding: '0.4rem 0.9rem',
                      }}>
                      <p className="font-karla font-600"
                        style={{ fontSize: '0.6rem', color: zoneColor + '80' }}>Reward claimed</p>
                      <span style={{ fontSize: '0.75rem', color: zoneColor + '80' }}>✓</span>
                    </div>
                  )}

                  {isExpanded && (
                    <div className="flex flex-col gap-1.5 mb-1"
                      style={{
                        background: `${zoneColor}08`,
                        border: `1px solid ${zoneColor}20`,
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        padding: '0.5rem 0.5rem 0.6rem',
                      }}>
                      {zoneSpecies.map(f => {
                        const discovered = caughtFishIds.has(f.id)
                        const isTapped = tappedFishId === f.id
                        const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'

                        if (!discovered) return (
                          <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                            style={{ background: 'rgba(4,10,18,0.35)', border: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ width: 9, height: 9, borderRadius: '50%', background: rarityColor + '28', flexShrink: 0 }} />
                            <p className="font-karla font-600 flex-1"
                              style={{ fontSize: '0.82rem', color: '#3a3835', letterSpacing: '0.04em' }}>??? Undiscovered</p>
                          </div>
                        )

                        return (
                          <div key={f.id}>
                            <button
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left"
                              style={{
                                background: isTapped ? `${rarityColor}14` : 'rgba(4,10,18,0.6)',
                                border: `1px solid ${isTapped ? rarityColor + '40' : 'rgba(255,255,255,0.06)'}`,
                                transition: 'background 0.15s, border-color 0.15s',
                              }}
                              onClick={() => {
                                setTappedFishId(isTapped ? null : f.id)
                                if (!isTapped) setUncheckedNewFishIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
                              }}
                            >
                              <FishImg name={f.name} style={{ width: 48, height: 38, objectFit: 'contain', flexShrink: 0 }} />
                              <p className="font-cinzel font-700 flex-1 truncate"
                                style={{ fontSize: '0.88rem', color: rarityColor }}>{f.name}</p>
                              {uncheckedNewFishIds.has(f.id) && (
                                <span style={{ fontSize: '0.5rem', fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', padding: '0.1rem 0.4rem', borderRadius: '2rem', flexShrink: 0, fontFamily: 'var(--font-karla)' }}>NEW</span>
                              )}
                              <span style={{ fontSize: '0.7rem', color: '#4ade80', flexShrink: 0 }}>✓</span>
                            </button>

                            {isTapped && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                style={{ overflow: 'hidden' }}
                              >
                                <div className="px-3 pt-2 pb-3 mx-0.5 rounded-b-xl"
                                  style={{ background: `${rarityColor}0a`, border: `1px solid ${rarityColor}25`, borderTop: 'none' }}>
                                  <FishImg name={f.name} style={{ width: '100%', height: 110, objectFit: 'contain', marginBottom: '0.5rem' }} />
                                  <p className="font-karla font-300 italic mb-2"
                                    style={{ fontSize: '0.75rem', color: rarityColor + 'aa' }}>{f.scientific_name}</p>
                                  <p className="font-karla font-400 mb-3"
                                    style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.55 }}>
                                    &ldquo;{f.fun_fact}&rdquo;
                                  </p>
                                  <p className="font-cinzel font-700"
                                    style={{ fontSize: '0.82rem', color: '#f0c040' }}>{f.sell_value.toLocaleString()} ⟡</p>
                                </div>
                              </motion.div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Gear drawer ── */}
      <AnimatePresence>
        {gearOpen && (
          <motion.div key="gear-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
              maxHeight: '82vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Gear</p>
              <button onClick={() => setGearOpen(false)}
                style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>
            <GearScreen
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelectBait={setSelectedBait}
              equippedRodTier={equippedRodTier}
              ownedRods={ownedRods}
              onEquipRod={handleEquipRod}
              reelTier={reelTier}
              hookTier={hookTier}
              lineTier={lineTier}
              shipTier={shipTier}
              onClose={() => setGearOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bait panel ── */}
      <AnimatePresence>
        {baitOpen && (
          <motion.div key="bait-panel"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
              maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Bait</p>
              <button onClick={() => setBaitOpen(false)}
                style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>
            <BaitSelector
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelect={(type) => { setSelectedBait(type); setBaitOpen(false) }}
            />
            <Link href="/marketplace/tackle-shop#bait" onClick={() => setBaitOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
              <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Buy more bait</span>
              <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Perfect catch flash overlay ── */}
      <AnimatePresence>
        {perfectFlash && (
          <motion.div
            key="perfect-flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onAnimationComplete={() => {
              if (perfectFlash) setTimeout(() => setPerfectFlash(false), 1200)
            }}
            style={{
              position: 'absolute', inset: 0, zIndex: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              background: 'radial-gradient(ellipse 90% 60% at 50% 50%, rgba(245,158,11,0.32) 0%, transparent 70%)',
            }}
          >
            {/* Expanding ring burst */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0.9 }}
              animate={{ scale: 3.2, opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              style={{
                position: 'absolute',
                width: 140, height: 140, borderRadius: '50%',
                border: '2px solid rgba(245,158,11,0.7)',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />
            {/* Second ring, slightly delayed */}
            <motion.div
              initial={{ scale: 0.2, opacity: 0.6 }}
              animate={{ scale: 2.4, opacity: 0 }}
              transition={{ duration: 0.65, ease: 'easeOut', delay: 0.1 }}
              style={{
                position: 'absolute',
                width: 140, height: 140, borderRadius: '50%',
                border: '1px solid rgba(253,230,138,0.5)',
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            />

            {/* Floating sparks */}
            {([
              { x: -55, delay: 0.08 }, { x: 55, delay: 0.12 },
              { x: -28, delay: 0.18 }, { x: 32, delay: 0.05 },
            ] as { x: number; delay: number }[]).map((s, i) => (
              <motion.span key={i}
                initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
                animate={{ opacity: [0, 1, 0], y: -70 - i * 12, x: s.x * 1.3, scale: [0, 1.2, 0.6] }}
                transition={{ duration: 1.0, delay: s.delay, ease: 'easeOut' }}
                style={{ position: 'absolute', color: '#fde68a', fontSize: '0.85rem', pointerEvents: 'none' }}
              >✦</motion.span>
            ))}

            {/* Main text */}
            <motion.div
              initial={{ scale: 0.45, y: 12, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 18, delay: 0.04 }}
              style={{ textAlign: 'center', position: 'relative' }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.28em]"
                style={{
                  fontSize: '2.6rem', color: '#fff',
                  textShadow: '0 0 18px #fff, 0 0 40px rgba(245,158,11,1), 0 0 80px rgba(245,158,11,0.75), 0 0 140px rgba(245,158,11,0.35)',
                }}>
                Perfect!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── New streak record toast ── */}
      <AnimatePresence>
        {newStreakRecord !== null && (
          <motion.div
            key={`streak-record-${newStreakRecord}`}
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
              zIndex: 40, pointerEvents: 'none', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(8,8,6,0.92)',
              border: '1px solid rgba(255,255,255,0.14)',
              borderRadius: 10, padding: '7px 14px',
            }}
          >
            <img src="/models/hooks/gold-hook.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.9 }} />
            <div>
              <p className="font-karla font-600 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.38)', marginBottom: 1 }}>
                New personal best
              </p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '0.82rem', color: '#f0ede8', lineHeight: 1 }}>
                {newStreakRecord} perfect streak
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Level-up overlay ── */}
      <AnimatePresence>
        {levelUpNotif && (
          <motion.div
            key="levelup"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.25 }}
            onClick={() => setLevelUpNotif(null)}
            style={{
              position: 'absolute', inset: 0, zIndex: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(96,165,250,0.22) 0%, rgba(0,0,0,0.88) 100%)',
              cursor: 'pointer',
            }}
          >
            {/* Ring bursts */}
            {[0, 0.12, 0.24].map((delay, i) => (
              <motion.div key={i}
                initial={{ scale: 0.1, opacity: 0.85 - i * 0.2 }}
                animate={{ scale: 4.5 - i * 0.6, opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut', delay }}
                style={{
                  position: 'absolute',
                  width: 110, height: 110, borderRadius: '50%',
                  border: `${2 - i}px solid ${i % 2 === 0 ? 'rgba(96,165,250,0.75)' : 'rgba(240,192,64,0.6)'}`,
                  left: '50%', top: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                }}
              />
            ))}

            {/* Sparkles */}
            {([{ x: -60, delay: 0.08 }, { x: 60, delay: 0.14 }, { x: -30, delay: 0.22 }, { x: 35, delay: 0.06 }, { x: 0, delay: 0.18 }] as { x: number; delay: number }[]).map((s, i) => (
              <motion.span key={i}
                initial={{ opacity: 0, y: 0, x: s.x, scale: 0 }}
                animate={{ opacity: [0, 1, 0], y: -80 - i * 14, x: s.x * 1.4, scale: [0, 1.4, 0.4] }}
                transition={{ duration: 1.2, delay: s.delay, ease: 'easeOut' }}
                style={{ position: 'absolute', color: i % 2 === 0 ? '#60a5fa' : '#f0c040', fontSize: '0.9rem', pointerEvents: 'none' }}
              >✦</motion.span>
            ))}

            {/* Text */}
            <motion.div
              initial={{ scale: 0.4, y: 24, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.06 }}
              style={{ textAlign: 'center', position: 'relative' }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
                style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.4rem', textShadow: '0 0 18px rgba(255,255,255,0.95), 0 0 48px rgba(96,165,250,0.6)' }}>
                Level Up!
              </p>
              <p className="font-cinzel font-700"
                style={{
                  fontSize: '5rem', lineHeight: 1, color: '#f0c040',
                  textShadow: '0 0 40px rgba(240,192,64,1), 0 0 90px rgba(240,192,64,0.5)',
                }}>
                {levelUpNotif}
              </p>
              <motion.p
                className="font-karla font-400"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
                style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: '0.75rem' }}>
                tap to continue
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <PodiumToast notif={podiumNotif} onDone={() => setPodiumNotif(null)} />

      {/* ── Fish Hold drawer ── */}
      <AnimatePresence>
        {holdOpen && (
          <motion.div key="hold-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '1.25rem 1rem 2rem',
              maxHeight: '72vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.14em]"
                  style={{ fontSize: '0.72rem', color: '#9a9488', marginBottom: 3 }}>Fish Hold</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: holdTotalCount >= holdCapacity ? '#f87171' : '#f0ede8', lineHeight: 1.1 }}>
                  {holdTotalCount} <span style={{ fontSize: '1.1rem', color: '#6a6764' }}>/ {holdCapacity}</span>
                </p>
              </div>
              <button onClick={() => setHoldOpen(false)}
                style={{ color: '#4a4845', fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', background: 'none', border: 'none' }}>✕</button>
            </div>

            {/* Upgrade boat CTA */}
            <Link href="/marketplace/shipyard" onClick={() => setHoldOpen(false)} style={{ textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.28)',
                borderRadius: 14, boxShadow: '0 0 14px rgba(96,165,250,0.07)',
                transition: 'box-shadow 0.2s',
              }}>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#60a5fa', marginBottom: 2 }}>Shipyard</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: '#f0ede8' }}>Upgrade your boat</p>
                  <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#60a5faaa', marginTop: 1 }}>More storage · faster sail · bigger crew</p>
                </div>
                <span style={{ fontSize: '1.3rem', color: '#60a5fa', marginLeft: '0.75rem' }}>⛵</span>
              </div>
            </Link>

            {inventory.length === 0 ? (
              <p className="font-karla font-300 text-center py-6" style={{ fontSize: '0.8rem', color: '#4a4845' }}>
                No fish yet. Cast a line!
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {inventory.map(item => {
                  const fish = item.fish_species
                  const hColor = HABITAT_COLOR[fish.habitat] ?? '#888'
                  return (
                    <div key={item.fish_id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                      style={{ background: `${hColor}0a`, border: `1px solid ${hColor}20` }}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-cinzel font-700 truncate" style={{ fontSize: '0.78rem', color: '#f0ede8' }}>{fish.name}</p>
                          <span className="font-karla font-600 shrink-0" style={{ fontSize: '0.52rem', color: hColor, background: `${hColor}18`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                            ×{item.quantity}
                          </span>
                        </div>
                        <p className="font-karla font-600 mt-0.5" style={{ fontSize: '0.58rem', color: '#f0c04088' }}>
                          {fish.sell_value.toLocaleString()} ⟡ each
                          {item.quantity > 1 && <span style={{ color: '#6a676488' }}> · {(fish.sell_value * item.quantity).toLocaleString()} ⟡</span>}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Challenge session complete overlay ── */}
      {activeSession && sessionDone && !sessionOverlayDismissed && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60,
          background: 'rgba(4,8,14,0.88)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '2rem',
        }}>
          <p className="font-karla font-600 uppercase tracking-[0.18em] mb-2" style={{ fontSize: '0.55rem', color: '#fb923c' }}>Challenge</p>
          <p className="font-cinzel font-700 mb-1" style={{ fontSize: '1.4rem', color: '#f0ede8', textAlign: 'center' }}>Session Complete</p>
          <p className="font-karla font-400 mb-6" style={{ fontSize: '0.78rem', color: '#6a6764' }}>vs {activeSession.opponentUsername}</p>
          <div style={{ background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 14, padding: '1.25rem 2rem', textAlign: 'center', marginBottom: '1.5rem' }}>
            <p className="font-cinzel font-700" style={{ fontSize: '2.4rem', color: '#fb923c', lineHeight: 1 }}>{sessionScore}</p>
            <p className="font-karla font-400 mt-1" style={{ fontSize: '0.68rem', color: '#a0a09a' }}>
              {activeSession.challengeType === 'most_fish' ? 'fish caught' : activeSession.challengeType === 'most_doubloons' ? 'doubloons earned' : 'perfect catches'}
            </p>
          </div>
          <Link
            href="/social"
            className="font-karla font-700 uppercase tracking-[0.12em] w-full text-center"
            style={{ padding: '0.75rem', borderRadius: 10, fontSize: '0.68rem', background: 'rgba(251,146,60,0.15)', border: '1px solid rgba(251,146,60,0.4)', color: '#fb923c', textDecoration: 'none', display: 'block', marginBottom: '0.75rem' }}
          >
            View Results on Social →
          </Link>
          <button
            onClick={() => setSessionOverlayDismissed(true)}
            className="font-karla font-600 w-full"
            style={{ padding: '0.75rem', borderRadius: 10, fontSize: '0.68rem', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: '#6a6764', cursor: 'pointer' }}
          >
            Keep Fishing
          </button>
        </div>
      )}

      </div>
    </div>
  )
}
