'use client'

import React, { useState, useEffect, useRef, useTransition, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { castLine, reelIn, reelCrate, sellFish, quickBuyWorms, markFishingTourSeen, markFishingCatchTourSeen, checkLeaderboardPosition, claimZoneReward, equipBoat, buyBoat, equipHat, buyHat, equipSpecialItem, buySpecialItem, useTideTurnerSkip, prestigeZone, activateEvent, type FishSpecies } from './actions'
import { recordFinnEncounter, settleFinnChallenge, recordFinnPass, markFinnRevealSeen } from './finnActions'
import FinnEncounter from './FinnEncounter'
import {
  FINN_ENCOUNTER_RATE, FINN_PERFECT_TIERS, FINN_SPEED_TIERS, FINN_SPEED_ZONE_MULT, FINN_REVEAL_BEAT,
  FINN_OFFER_LINES, FINN_WIN_LINES, FINN_LOSS_LINES,
  FINN_EPILOGUE_OFFER_LINES, FINN_EPILOGUE_WIN_LINES, FINN_EPILOGUE_LOSS_LINES,
  FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE,
  FINN_RETURN_AFTER_WIN, FINN_RETURN_AFTER_LOSS, FINN_RETURN_AFTER_PASS,
  pickFinnTier, pickChallengeType, pickRandomLine,
  findNextEncounterBeat, findNextWinBeat,
  type FinnChallengeType,
} from '@/lib/finn'
import { liquidateAllFish } from '@/app/tavern/market/actions'
import { BOATS, getBoat, boatGlowClass } from '@/lib/boats'
import { HATS, getHat } from '@/lib/hats'
import { upgradeFishHold } from './holdActions'
import { getFishHold, FISH_HOLD_TIERS } from '@/lib/fishHold'
import { setFishingMusicMuted, playPerfectSfx, playCastSfx, playCast2Sfx, startDialLoop, stopDialLoop, getFishingSfxMuted, setFishingSfxMuted } from '@/lib/fishingMusic'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { zoneRewardDoubloons } from '@/lib/zoneRewards'
import { updateCharacterColor } from '@/app/u/actions'
import { equipBadge, unequipBadge } from '@/app/achievements/badgeActions'
import { BADGES, BADGE_MAP, BADGE_SLOT_POSITIONS } from '@/lib/badges'

const CRATE_FISH_ID = -1
import { claimDailyReward } from './dailyChallengeActions'
import { getDailyChallenges, type DailyChallengeState, type DailyChallenge } from '@/lib/dailyChallenges'
import PodiumToast, { type PodiumNotif } from '@/components/PodiumToast'
import LeaderboardModal from '@/components/LeaderboardModal'
import AncientBgEffect from '@/components/AncientBgEffect'
import { finishSession, type ActiveSession } from '@/app/social/challengeActions'
import { equipRod, purchaseRod, buyReel } from '@/app/marketplace/tackle-shop/actions'
import { buyHook } from '@/app/hooks/actions'
import { buildFishZones, FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY, CATCH_CENTER, type ZoneDef, type ZoneType } from './depths'
import { ZONE_MIN_LEVEL } from './zoneData'
import { getXPProgress, getLevelFromXP, levelCatchBonus, MAX_LEVEL } from '@/lib/fishingLevel'
import { getHook, HOOKS, hookGlowClass } from '@/lib/hooks'
import { getRod, RODS, rodGlowClass, type RodDef } from '@/lib/rods'
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


function applyBossMods(zones: ZoneDef[], mechanic: BossMechanic | null, shrinkDeg: number): ZoneDef[] {
  if (!mechanic) return zones
  let result = [...zones]
  if (mechanic === 'split') {
    const perfect = result.find(z => z.type === 'perfect')
    if (perfect) {
      const center = (perfect.from + perfect.to) / 2
      const half = (perfect.to - perfect.from) / 2
      const opposite = (center + 180) % 360
      result = [...result, { from: opposite - half, to: opposite + half, type: 'perfect' as ZoneType, label: 'Perfect!', color: '#fde68a' }]
    }
  }
  if (shrinkDeg > 0) {
    result = result.map(z => {
      if (z.type !== 'perfect') return z
      const center = (z.from + z.to) / 2
      const newHalf = Math.max(2, (z.to - z.from) / 2 - shrinkDeg / 2)
      return { ...z, from: center - newHalf, to: center + newHalf }
    })
  }
  return result
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CX = 110, CY = 110
const OUTER_R = 96, INNER_R = 66
const GAP = 1.0

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
const ZONE_BG: Record<string, string> = {
  shallows:     '/shallows.jpg',
  open_waters:  '/openwaters.jpg',
  deep:         '/deep.jpg',
  abyss:        '/abyss.jpg',
  ancient_deep: '/ancient.jpg',
}
// Per-zone horizon position (% from the top of the scene). Drives where
// the cloud overlay's bottom edge sits — clouds fill from 0 down to the
// horizon, fading at the bottom. Set to 0 for zones with no visible sky
// (currently just ancient_deep). Tune by eye against each painted
// backdrop via /dev/clouds.
const ZONE_HORIZON_PCT: Record<string, number> = {
  shallows:     34,
  open_waters:  34,
  deep:         38,
  abyss:        40,
  ancient_deep: 0,
}

// Per-zone time-of-day for cloud / reflection / shimmer tinting. 'day'
// is the unfiltered baseline (Shallows + Open Waters). Deep is a sunset
// painted backdrop, Abyss is night, Ancient Deep is unhandled (no sky).
type CloudVariant = 'day' | 'sunset' | 'night' | 'none'
const ZONE_CLOUD_VARIANT: Record<string, CloudVariant> = {
  shallows:     'day',
  open_waters:  'day',
  deep:         'sunset',
  abyss:        'night',
  ancient_deep: 'none',
}

const ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep'] as const
type ZoneKey = typeof ZONES[number]

type BossMechanic = 'shrink' | 'drift' | 'accelerate' | 'randomize' | 'split'
const BOSS_CONFIG: Record<string, BossMechanic> = {
  'Megalodon':    'shrink',
  'Plesiosaurus': 'drift',
  'Dunkleosteus': 'accelerate',
  'Mosasaurus':   'randomize',
  'Basilosaurus': 'split',
  'Shastasaurus': 'shrink', // gets random mechanic per stage via handlePrestige logic
}
const SHASTASAURUS_MECHANICS: BossMechanic[] = ['shrink', 'drift', 'accelerate', 'randomize', 'split']

const RARITY: Record<number, { label: string; color: string; hookedText: string }> = {
  1: { label: 'Common',    color: '#94a3b8', hookedText: "Something's on the line…" },
  2: { label: 'Uncommon',  color: '#4ade80', hookedText: "You've got a bite!" },
  3: { label: 'Rare',      color: '#60a5fa', hookedText: "Something strong is pulling!" },
  4: { label: 'Epic',      color: '#c084fc', hookedText: "A big one! Hold tight!" },
  5: { label: 'Legendary', color: '#f59e0b', hookedText: "SOMETHING MASSIVE IS ON THE LINE!" },
}

// ─── Random events ───────────────────────────────────────────────────────────

type EventType = 'bloom' | 'fullmoon' | 'redtide' | 'glassy'

const EVENT_DEFS: Record<EventType, { name: string; tagline: string; color: string; tint: string }> = {
  bloom:    { name: 'Bioluminescent Bloom', tagline: 'No bait consumed this cycle',        color: '#2dd4bf', tint: 'rgba(45,212,191,0.09)' },
  fullmoon: { name: 'Full Moon Rising',     tagline: 'Quick sell pays full market price',  color: '#e2e8f0', tint: 'rgba(226,232,240,0.07)' },
  redtide:  { name: 'Red Tide',             tagline: 'Rare fish are surfacing',             color: '#f87171', tint: 'rgba(248,113,113,0.08)' },
  glassy:   { name: 'Glassy Waters',        tagline: 'Catch window is wider',              color: '#c084fc', tint: 'rgba(192,132,252,0.08)' },
}

const EVENT_TYPES: EventType[] = ['bloom', 'fullmoon', 'redtide', 'glassy']

// ─────────────────────────────────────────────────────────────────────────────


function toRoman(n: number): string {
  const vals: [number, string][] = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']]
  let result = ''
  for (const [v, s] of vals) { while (n >= v) { result += s; n -= v } }
  return result
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
  ancient_deep: [
    "Something ancient stirs…",
    "You are not alone down here.",
    "Three perfect strikes. That's the deal.",
    "It knows you're here.",
    "Few have ever seen what swims here.",
    "Stay sharp. All three stages.",
    "These things were here before the continents split.",
    "No second chances in the Ancient Deep.",
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
    "Absolutely dialed in. 🔥🔥",
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
    "You're dialed in.",
    "Bait saved, streak alive.",
  ]],
]

const SPECIAL_ITEM_TIPS: { condition: (ctx: TipContext) => boolean; tip: string }[] = [
  {
    condition: ctx => !ctx.hasTideTurner,
    tip: "Tip: the Tide Turner lets you skip a hooked fish without breaking your perfect streak — found on voyages.",
  },
  {
    condition: ctx => !ctx.hasPhantomHook,
    tip: "Tip: the Phantom Hook gives a 25% chance to save your bait on every cast — it's a voyage reward.",
  },
  {
    condition: ctx => !ctx.hasAutoCaster,
    tip: "Tip: the Auto Caster resets automatically after every catch — pick it up in the gear shop for 5,000 ⟡.",
  },
]

const SKIN_TIPS = [
  "Tip: reach Fishing Level 50 to unlock the Forest character color.",
  "Tip: prestige any zone 3 times to unlock the Sand character color.",
  "Tip: reach Navigation Level 50 on voyages to unlock the Sky character color.",
  "Tip: the Golden character color can be bought for 1,000,000 doubloons from your profile.",
  "Tip: open fishing crates for a rare chance to find the Mint character color.",
]

// General mechanics tips. Always in the pool (no unlock condition), so
// they surface for every player. Keep them short, accurate, and in the
// same voice as the zone wait-messages. Verify any number against the
// source before adding — stale tips are worse than no tip.
const GENERAL_TIPS = [
  "Tip: prestige a zone and every catch there earns +10% XP per prestige level — forever.",
  "Tip: a zone's completion reward grows each time you prestige it, up to double at Prestige 5.",
  "Tip: quick-sell only pays 65%. Sell on the market or liquidate for far more.",
  "Tip: each hook tier widens your catch zone by 3°. It adds up fast.",
  "Tip: a better reel slows the needle — the single biggest skill upgrade.",
  "Tip: the Twin-Strike rod has a 25% chance to land two fish at once.",
  "Tip: the Millionaire's Rod catches two fish on every single catch.",
  "Tip: the YOLO Rod has a 10% chance to haul in 100 fish at once.",
  "Tip: the Telescoping Rod draws rarer fish to the surface.",
  "Tip: sunken crates come in Wooden, Metal, Gold, and Diamond — bigger is better.",
  "Tip: complete a zone's whole collection to claim a one-time doubloon reward.",
  "Tip: daily challenges reset every day — easy doubloons and XP if you keep up.",
  "Tip: badges are earned through milestones. Equip your favorites from your profile.",
  "Tip: keep an eye out for Finn — a rival angler who shows up to challenge you.",
  "Tip: upgrade your fish hold so a good run doesn't fill up and stall.",
  "Tip: Ancient Deep trophies never enter your hold. They go straight to your wall.",
  "Tip: equip a boat and hat from the gear screen to customize your fisher.",
  "Tip: a perfect catch keeps your streak alive, and the bonus XP compounds.",
  "Tip: your perfect streak carries over when you leave between casts. Bail on a hooked fish and it breaks.",
  "Tip: recruit a crew at the Crew Hall, then send them on voyages and raids for loot and rare gear.",
  "Tip: special fishing gear like the Tide Turner is won out on voyages and raids.",
  "Tip: give your captain a background and border on your profile to stand out on the leaderboards.",
]

type TipContext = { hasTideTurner: boolean; hasPhantomHook: boolean; hasAutoCaster: boolean }

function pickWaitMessage(zone: ZoneKey, streak: number, ctx?: TipContext): string {
  for (const [threshold, msgs] of STREAK_MESSAGES) {
    if (streak >= threshold) return msgs[Math.floor(Math.random() * msgs.length)]
  }

  // 1-in-6 chance to show a contextual tip instead of a zone message
  if (ctx && Math.random() < 1 / 6) {
    const available: string[] = []
    for (const { condition, tip } of SPECIAL_ITEM_TIPS) {
      if (condition(ctx)) available.push(tip)
    }
    available.push(...SKIN_TIPS)
    available.push(...GENERAL_TIPS)
    if (available.length > 0) return available[Math.floor(Math.random() * available.length)]
  }

  const pool = WAIT_MESSAGES[zone]
  return pool[Math.floor(Math.random() * pool.length)]
}

// ─── Catch mechanics tour ────────────────────────────────────────────────────

const CATCH_TOUR_STEPS = [
  {
    color: '#4ade80',
    title: 'Catch zone',
    body: 'Stop the dial in the green to land the fish. A better Hook makes the green bigger.',
  },
  {
    color: '#f59e0b',
    title: 'Perfect zone',
    body: 'The gold strip is the Perfect zone. Land there for bonus XP and a shot at a free recast.',
  },
  {
    color: '#fb923c',
    title: 'On fire 🔥',
    body: 'Hit two Perfects in a row and you catch fire — extra XP on every Perfect. One miss puts it out.',
  },
  {
    color: '#f87171',
    title: 'Snag zone',
    body: 'Land in the red and you lose the fish and your bait. A better Line shrinks the red.',
  },
  {
    color: '#94a3b8',
    title: 'Dial speed',
    body: 'Tougher fish spin the dial faster, and the Abyss gets tricky. A better Reel slows it down.',
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
    title: 'Zones',
    body: 'Go deeper for rarer fish. Earn XP to unlock the next zone.',
    cardStyle: { top: 96, left: 16, right: 16 },
    arrowDir: 'up', arrowAlign: 'center',
  },
  {
    title: 'Collection',
    body: "Every fish you catch is saved here. Tap one for details.",
    cardStyle: { top: 56, right: 16 },
    maxWidth: 210,
    arrowDir: 'up', arrowAlign: 'right',
  },
  {
    title: 'Gear',
    body: 'Your rod, reel, hook and line. A green dot means you can afford an upgrade.',
    cardStyle: { bottom: 112, left: 16 },
    maxWidth: 220,
    arrowDir: 'down', arrowAlign: 'left',
  },
  {
    title: 'Bait',
    body: 'Different baits change how bites work. 10 free worms every day.',
    cardStyle: { bottom: 112, left: 16, right: 16 },
    maxWidth: 220,
    arrowDir: 'down', arrowAlign: 'center',
  },
  {
    title: 'Sell your fish',
    body: 'Quick-sell for fast cash, or take them to the market for a lot more.',
    cardStyle: { bottom: 112, right: 16 },
    maxWidth: 220,
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
  zones, angle, rotation = 0, needleColor, zoneOpacityFn, fireLevel = 0, snapKey = 0, perfectBurstKey = 0, needleRef,
}: {
  zones: ZoneDef[]
  angle: number
  rotation?: number
  needleColor: string
  zoneOpacityFn: (z: ZoneDef) => number
  fireLevel?: 0 | 1 | 2
  snapKey?: number
  perfectBurstKey?: number
  needleRef?: React.Ref<SVGGElement>
}) {
  const needleTipY  = CY - (INNER_R - 8)
  const perfectZone = zones.find(z => z.type === 'perfect')
  const penaltyZones = zones.filter(z => z.type === 'penalty')

  // Perfect-hit flash on the needle — short gold burst with a thicker
  // stroke so the needle reads as the thing the player nailed. Tied to
  // perfectBurstKey so it fires at the exact same instant as the arc
  // flash + expanding ring.
  const [perfectFlash, setPerfectFlash] = useState(false)
  const prevBurstRef = useRef(perfectBurstKey)
  useEffect(() => {
    if (perfectBurstKey > 0 && perfectBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = perfectBurstKey
      setPerfectFlash(true)
      const t = setTimeout(() => setPerfectFlash(false), 450)
      return () => clearTimeout(t)
    }
  }, [perfectBurstKey])
  const liveNeedleColor = perfectFlash ? '#fde68a' : needleColor
  const liveNeedleStroke = perfectFlash ? 3.6 : 2.5
  const liveTipRadius = perfectFlash ? 7 : 5

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
        <circle cx={CX} cy={CY} r={OUTER_R + 6} fill="rgba(0,0,0,0.78)" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
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
        {/* Needle — the parent drives `transform` imperatively via needleRef
            every frame (no per-frame React re-render); the `angle` prop is a
            live angleRef read so any real re-render lands jump-free.
            IMPORTANT: no `style` (filter/transition) in the normal case.
            The transform attribute changes every frame; a standing CSS
            transition/filter declaration on the same element forces it
            off the raster-cache fast path and causes per-frame stutter
            (worst on mobile). The perfect-flash filter is applied only
            during the brief flash window, where the extra cost is fine. */}
        <g ref={needleRef} transform={`rotate(${angle}, ${CX}, ${CY})`}
           style={perfectFlash ? { filter: 'drop-shadow(0 0 6px #fde68a)' } : undefined}>
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={liveNeedleColor} strokeWidth={perfectFlash ? 12 : 10} strokeOpacity={perfectFlash ? 0.28 : 0.12} strokeLinecap="round" />
          <line x1={CX} y1={CY} x2={CX} y2={needleTipY} stroke={liveNeedleColor} strokeWidth={liveNeedleStroke} strokeLinecap="round" />
          <circle cx={CX} cy={needleTipY} r={liveTipRadius} fill={liveNeedleColor} />
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
              padding: '0.55rem 0.7rem', borderRadius: 10, width: '100%',
              background: isSelected ? `${c}12` : 'rgba(4,10,18,0.72)',
              border: `1px solid ${isSelected ? c + '50' : 'rgba(255,255,255,0.09)'}`,
              cursor: 'pointer', transition: 'border-color 0.12s',
            }}
          >
            {bait.imageUrl
              ? <img src={bait.imageUrl} alt={bait.name} style={{ width: 22, height: 22, objectFit: 'contain', opacity: qty > 0 ? 1 : 0.3, flexShrink: 0 }} />
              : <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, opacity: qty > 0 ? 1 : 0.3 }} />
            }
            <div style={{ flex: 1, textAlign: 'left' }}>
              <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: qty > 0 ? '#f0ede8' : '#4a4845' }}>
                {bait.name}
              </p>
              <div style={{ display: 'flex', gap: 3, marginTop: 2, flexWrap: 'wrap' }}>
                {bait.catchZoneBonus > 0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    +{bait.catchZoneBonus}° zone
                  </span>
                )}
                {bait.waitMult < 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: `${c}cc`, background: `${c}14`, border: `1px solid ${c}30`, padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((1 - bait.waitMult) * 100)}% faster
                  </span>
                )}
                {bait.waitMult > 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: 'rgba(248,113,113,0.8)', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.25)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
                    {Math.round((bait.waitMult - 1) * 100)}% slower
                  </span>
                )}
                {!bait.catchZoneBonus && bait.waitMult === 1.0 && (
                  <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#4a4845', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '0.1rem 0.4rem', borderRadius: '2rem' }}>
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

type CharFrame = 'rest' | 'wait' | 'cast'

function getCharSrc(colorId: string): Record<CharFrame, string> {
  const prefix = colorId === 'default' ? 'fishing' : `fishing_${colorId}`
  return { rest: `/${prefix}_rest.png`, wait: `/${prefix}_wait.png`, cast: `/${prefix}_cast.png` }
}

const CHAR_POS: Record<CharFrame, { bottom: number; left: number; width: number }> = {
  rest: { bottom: 60, left: 31, width: 70 },
  wait: { bottom: 57, left: 26, width: 70 },
  cast: { bottom: 60, left: 26, width: 70 },
}

// Rod overlay — final tuned positions for the 3-pose raw-quadrant sprites
// (rest/wait = 960×540, cast = 960×1080). Same coords apply to every rod
// because the artist places the rod handle at the same x,y in every
// source sheet quadrant. Tuned on /fishing-test against rod_carbon.
const CHAR_ROD_OVERLAY: Record<CharFrame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 37,   left: -12, width: 107.5, rotate: 0 },
  wait: { top: 37.5, left: -8,  width: 107.5, rotate: 0 },
  cast: { top: -8.5, left: 3.5, width: 100.5, rotate: 0 },
}

// Reel overlay — raw 1920×1080 uploads, same canvas across every tier so
// a single CHAR_REEL_OVERLAY position lines up all 9 reels identically
// (basic, spinning, baitcasting, saltwater, precision, tournament,
// deepsea, kraken, tidecaller). Decorations on higher tiers live inside
// the canvas padding without shifting the reel core. Tuned on
// /fishing-test against reel_basic.
const CHAR_REEL_OVERLAY: Record<CharFrame, { top: number; left: number; width: number; rotate: number }> = {
  rest: { top: 15,   left: -10.3, width: 222,   rotate: -18   },
  wait: { top: -5.2, left:  -3.1, width: 222,   rotate: -36.5 },
  cast: { top: 38.9, left: -42,   width: 219.5, rotate:  46.5 },
}

// Hook overlay — raw 1920×1080 uploads, same canvas across every tier so a
// single set of coords lines up all 9 hooks identically (copper, bronze,
// iron, steel, silver, gold, enchanted, abyssal, legendary). Wait frame is
// hidden because the hook is in the water during the bite. Tuned on
// /fishing-test against the raw uploads.
const CHAR_HOOK_OVERLAY: Record<CharFrame, { top: number; left: number; width: number; rotate: number; hidden?: boolean }> = {
  rest: { top: 39.5, left: -10.5, width: 204.5, rotate: 0 },
  wait: { top: 39.5, left: -10.5, width: 222,   rotate: 0,    hidden: true },
  cast: { top: 40.5, left: -73,   width: 204.5, rotate: 66.5 },
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

function ResultCard({ fish, baitSaved, isNewSpecies, isPerfect, xpGained, doubleCatch, gemEarned, perfectStreak = 1, streakBonusXP = 0, jackpotMultiplier, ancientCount = 0, ancientTotal = 6 }: {
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
  ancientCount?: number
  ancientTotal?: number
}) {
  const isAncient = fish.habitat === 'ancient_deep'
  const rarity = fish.bite_rarity ?? 1
  const baseR = RARITY[rarity] ?? RARITY[1]
  // Ancient deep gets its own palette + label, overriding the gold legendary look
  const r = isAncient
    ? { label: 'Ancient', color: '#e11d48', hookedText: baseR.hookedText }
    : baseR
  const isLegendary = rarity === 5 && !isAncient
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

      {/* Ancient One discovery banner */}
      {isAncient && (
        <motion.div
          initial={{ opacity: 0, y: -12, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 16, delay: 0.05 }}
          className="mb-2"
          style={{
            position: 'relative',
            padding: '0.7rem 0.95rem',
            borderRadius: 14,
            background: 'linear-gradient(135deg, rgba(50,8,18,0.96) 0%, rgba(20,6,8,0.98) 70%, rgba(40,18,4,0.96) 100%)',
            border: '1px solid rgba(225,29,72,0.5)',
            boxShadow: '0 0 30px rgba(225,29,72,0.32), inset 0 1px 0 rgba(255,255,255,0.06)',
            overflow: 'hidden',
          }}
        >
          {/* Slow shimmer sweep across the banner */}
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 2.4, delay: 0.4, ease: 'easeOut', repeat: Infinity, repeatDelay: 4 }}
            style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(105deg, transparent 30%, rgba(225,29,72,0.24) 50%, rgba(253,230,138,0.22) 60%, transparent 75%)',
              pointerEvents: 'none',
            }}
          />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div>
              <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: '#fde68a', marginBottom: 3 }}>
                Ancient One Discovered
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#fee2e2', lineHeight: 1.1, textShadow: '0 0 14px rgba(225,29,72,0.5)' }}>
                A relic from the deep
              </p>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <p className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#e11d48', lineHeight: 1, textShadow: '0 0 12px rgba(225,29,72,0.55)' }}>
                {ancientCount}<span style={{ color: '#7a2030' }}>/{ancientTotal}</span>
              </p>
              <p className="font-karla font-600 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.15em', color: '#be123c', marginTop: 2 }}>
                Revealed
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Compact banner row — perfect / double / jackpot / gem all collapse
          into a single flex-wrap row of slim pills so they never push the
          cast button or bottom nav off the screen. Each pill keeps its own
          accent color + the same gradient + top-accent chrome as before,
          just at ~32px tall instead of ~80px. Ignition burst rings still
          fire on the perfect pill at the 3-streak ignition moment. */}
      {(isPerfect || (jackpotMultiplier && jackpotMultiplier > 1) || doubleCatch || gemEarned) && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
          {isPerfect && (() => {
            const isOnFire = perfectStreak >= 3
            const isIgnition = perfectStreak === 3
            const s = Math.min(perfectStreak, 6)
            const accent = isOnFire ? '#fb923c' : '#fbbf24'
            const accentRgb = isOnFire ? '251,146,60' : '251,191,36'
            const glow = `0 0 ${10 + (s - 1) * 3}px rgba(${accentRgb},${0.30 + (s - 1) * 0.04})`
            const basePerfectBonus = Math.round((xpGained - streakBonusXP) * 0.2 / 1.2)
            const totalXp = basePerfectBonus + streakBonusXP
            return (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Ignition burst rings — fire on first time hitting streak 3 */}
                {isIgnition && [0, 0.1, 0.2].map((delay, i) => (
                  <motion.div key={i}
                    initial={{ scale: 0.85, opacity: 0.7 - i * 0.2 }}
                    animate={{ scale: 2.2 - i * 0.25, opacity: 0 }}
                    transition={{ duration: 0.55, ease: 'easeOut', delay }}
                    style={{
                      position: 'absolute', inset: 0, borderRadius: 999,
                      border: `${1.5 - i * 0.3}px solid rgba(251,146,60,${0.7 - i * 0.2})`,
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                <motion.div
                  key={perfectStreak}
                  initial={{ opacity: 0, y: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="font-karla font-700 uppercase"
                  style={{
                    background: `linear-gradient(180deg, rgba(${accentRgb},0.22) 0%, rgba(${accentRgb},0.06) 100%), #0d1320`,
                    border: `1px solid rgba(${accentRgb},0.48)`,
                    borderTop: `1px solid rgba(${accentRgb},0.78)`,
                    borderRadius: 999,
                    boxShadow: glow,
                    padding: '0.36rem 0.72rem',
                    fontSize: '0.62rem',
                    letterSpacing: '0.14em',
                    color: accent,
                    display: 'inline-flex', alignItems: 'center', gap: 7,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{isOnFire ? '🔥' : '⭐'}</span>
                  <span>{isOnFire ? 'On Fire' : 'Perfect'}</span>
                  {totalXp > 0 && (
                    <span style={{ color: '#86efac', letterSpacing: 0 }}>+{totalXp} XP</span>
                  )}
                  {perfectStreak >= 2 && (
                    <span style={{ color: accent, letterSpacing: 0, textShadow: `0 0 8px rgba(${accentRgb},0.6)` }}>×{perfectStreak}</span>
                  )}
                  {baitSaved && <span style={{ color: '#86efac', letterSpacing: 0 }}>+bait</span>}
                </motion.div>
              </div>
            )
          })()}

          {doubleCatch && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(251,191,36,0.22) 0%, rgba(251,191,36,0.06) 100%), #1a1304',
                border: '1px solid rgba(251,191,36,0.50)',
                borderTop: '1px solid rgba(251,191,36,0.80)',
                borderRadius: 999,
                boxShadow: '0 0 12px rgba(251,191,36,0.22)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#fbbf24',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>✦</span>
              <span>Double</span>
              <span style={{ color: '#fde68a', letterSpacing: 0, textShadow: '0 0 8px rgba(251,191,36,0.55)' }}>×2</span>
            </motion.div>
          )}

          {jackpotMultiplier && jackpotMultiplier > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(249,115,22,0.24) 0%, rgba(249,115,22,0.06) 100%), #1a0c04',
                border: '1px solid rgba(249,115,22,0.55)',
                borderTop: '1px solid rgba(249,115,22,0.85)',
                borderRadius: 999,
                boxShadow: '0 0 14px rgba(249,115,22,0.32)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#fb923c',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>★</span>
              <span>Jackpot</span>
              <span style={{ color: '#fdba74', letterSpacing: 0, textShadow: '0 0 8px rgba(249,115,22,0.55)' }}>×{jackpotMultiplier}</span>
            </motion.div>
          )}

          {gemEarned && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.15 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(99,226,183,0.20) 0%, rgba(99,226,183,0.04) 100%), #04141a',
                border: '1px solid rgba(99,226,183,0.50)',
                borderTop: '1px solid rgba(99,226,183,0.78)',
                borderRadius: 999,
                boxShadow: '0 0 12px rgba(99,226,183,0.22)',
                padding: '0.36rem 0.72rem',
                fontSize: '0.62rem',
                letterSpacing: '0.14em',
                color: '#63e2b7',
                display: 'inline-flex', alignItems: 'center', gap: 7,
                whiteSpace: 'nowrap',
              }}
            >
              <span>◆</span>
              <span>Challenge</span>
              <span style={{ color: '#9af3cf', letterSpacing: 0 }}>+1 Gem</span>
            </motion.div>
          )}
        </div>
      )}

      {/* Card + all its effects in one relative container */}
      <div style={{ position: 'relative' }}>

        {/* Burst rings — epic gets 2, legendary 3, ancient 5 */}
        {isEpicPlus && (isAncient ? [0, 0.1, 0.22, 0.36, 0.52] : [0, 0.09, ...(isLegendary ? [0.18] : [])]).map((delay, i) => (
          <motion.div key={i}
            initial={{ scale: 0.86, opacity: isAncient ? 0.85 - i * 0.13 : isLegendary ? 0.75 - i * 0.18 : 0.55 - i * 0.15 }}
            animate={{ scale: isAncient ? 2.2 - i * 0.18 : isLegendary ? 1.9 - i * 0.18 : 1.55 - i * 0.12, opacity: 0 }}
            transition={{ duration: isAncient ? 0.95 : isLegendary ? 0.7 : 0.5, ease: 'easeOut', delay: delay + (isAncient ? 0.16 : isLegendary ? 0.12 : 0.04) }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '1rem',
              border: `${isAncient ? 1.6 - i * 0.22 : isLegendary ? 1.5 - i * 0.3 : 1}px solid ${r.color}${isAncient ? 'cc' : isLegendary ? 'dd' : '99'}`,
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

        {/* Ancient color bloom — violet to cyan iridescent */}
        {isAncient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.32, 0.18, 0] }}
            transition={{ duration: 1.2, delay: 0.1, ease: 'easeOut' }}
            style={{
              position: 'absolute', inset: -32, borderRadius: '2.4rem',
              background: 'radial-gradient(ellipse at 50% 55%, rgba(225,29,72,0.55) 0%, rgba(253,230,138,0.28) 40%, transparent 75%)',
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
        initial={{ opacity: 0, y: isAncient ? 48 : isLegendary ? 40 : isEpicPlus ? 24 : 16, scale: isAncient ? 0.78 : isLegendary ? 0.84 : isEpicPlus ? 0.91 : 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: isAncient ? 110 : isLegendary ? 140 : isEpicPlus ? 210 : 280, damping: isAncient ? 10 : isLegendary ? 11 : isEpicPlus ? 16 : 22, delay: isAncient ? 0.18 : isLegendary ? 0.1 : 0 }}
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

        {/* Ancient iridescent sweep — slower, dual-tone */}
        {isAncient && (
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '220%' }}
            transition={{ duration: 2.2, delay: 0.7, ease: 'easeOut', repeat: Infinity, repeatDelay: 3.0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
              background: 'linear-gradient(105deg, transparent 22%, rgba(225,29,72,0.32) 48%, rgba(253,230,138,0.28) 56%, transparent 78%)',
            }}
          />
        )}

        {/* Header band — just the rarity tag + "New Species" if applicable.
            Zone label dropped (player already knows what zone they're in). */}
        <div className="px-4 py-2.5 flex items-center justify-center gap-2"
          style={{ position: 'relative', zIndex: 2, background: `${r.color}28`, borderBottom: `1px solid ${r.color}45` }}>
          <span className="font-karla font-700 uppercase tracking-[0.18em]"
            style={{
              fontSize: '0.58rem', color: r.color,
              background: `${r.color}1c`, border: `1px solid ${r.color}45`,
              padding: '0.18rem 0.6rem', borderRadius: '2rem',
            }}>
            {r.label}{rarity >= 4 ? ' ✦' : ''}
          </span>
          {isNewSpecies && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.2 }}
              className="font-karla font-700 uppercase tracking-[0.18em]"
              style={{ fontSize: '0.58rem', color: '#fde68a',
                background: 'rgba(253,230,138,0.15)', border: '1px solid rgba(253,230,138,0.4)',
                padding: '0.18rem 0.6rem', borderRadius: '2rem' }}
            >New ✦</motion.span>
          )}
        </div>

        {/* Body — fish is the hero. Big image, name, and the price (or
            trophy badge) get the visual weight; fun fact sits below as
            flavor, not as the focus. */}
        <div style={{ position: 'relative', zIndex: 2, padding: '1rem 1rem 1.1rem' }}>
          {/* Big fish image — entrance bounce so it FEELS like a reveal. */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 14, delay: 0.08 }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: '0.55rem',
            }}
          >
            <FishImg
              name={fish.name}
              style={{
                width: '78%', maxWidth: 220, height: 124, objectFit: 'contain',
                filter: `drop-shadow(0 8px 20px ${r.color}55)${isEpicPlus ? ` drop-shadow(0 0 28px ${r.color}40)` : ''}`,
              }}
            />
          </motion.div>

          {/* Name */}
          <p className="font-cinzel font-700 text-center" style={{ fontSize: '1.35rem', color: r.color, lineHeight: 1.1, marginBottom: 2 }}>
            {fish.name}
          </p>
          <p className="font-karla font-300 italic text-center" style={{ fontSize: '0.68rem', color: '#6a6764', marginBottom: '0.7rem' }}>
            {fish.scientific_name}
          </p>

          {/* Hero price — non-ancient. Big gold number, the thing your eye
              lands on first after the fish itself. */}
          {!isAncient && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.22 }}
              style={{
                display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4,
                marginBottom: '0.7rem',
              }}
            >
              <span className="font-cinzel font-700"
                style={{
                  fontSize: '2.05rem', color: '#f0c040', lineHeight: 1,
                  textShadow: '0 0 18px rgba(240,192,64,0.45)',
                }}>
                {fish.sell_value.toLocaleString()}
              </span>
              <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0c040', lineHeight: 1 }}>⟡</span>
            </motion.div>
          )}

          {/* Trophy badge — ancient catches go on display, no sell price. */}
          {isAncient && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, delay: 0.22 }}
              className="font-karla font-700 uppercase text-center"
              style={{
                fontSize: '0.7rem', letterSpacing: '0.22em',
                color: r.color,
                background: `${r.color}14`, border: `1px solid ${r.color}45`,
                borderRadius: 999, padding: '0.4rem 1rem',
                marginBottom: '0.7rem',
                alignSelf: 'center', display: 'inline-block',
                textShadow: `0 0 10px ${r.color}66`,
                marginLeft: '50%', transform: 'translateX(-50%)',
              }}
            >
              ★ Trophy
            </motion.div>
          )}

          {/* Flavor — the fun fact, demoted to caption status. */}
          <p className="font-karla font-400 text-center" style={{ fontSize: '0.72rem', color: '#7a7670', lineHeight: 1.5 }}>
            {fish.fun_fact}
          </p>
        </div>
      </motion.div>
    </div>
    </div>
  )
}

// ─── Drawer helpers ──────────────────────────────────────────────────────────

function DrawerHandle() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '0.55rem 0 0.1rem', flexShrink: 0, cursor: 'grab' }}>
      <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
    </div>
  )
}

// Shared close button for the bottom-sheet drawers. The old inline ✕ was a
// near-invisible 17px glyph (#4a4845, no hit area) that was hard to find and
// hard to tap; this is a proper 34px circular target with a visible icon.
function DrawerClose({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Close"
      style={{
        flexShrink: 0,
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.16)',
        borderRadius: '50%',
        width: 34, height: 34, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#e0ddd8', cursor: 'pointer', touchAction: 'manipulation',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  )
}

function drawerDragProps(onClose: () => void) {
  return {
    drag: 'y' as const,
    dragConstraints: { top: 0 },
    dragElastic: { top: 0, bottom: 0.35 },
    onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
      if (info.offset.y > 80 || info.velocity.y > 400) onClose()
    },
  }
}

// ─── EventParticles ──────────────────────────────────────────────────────────

function EventParticles({ color }: { color: string }) {
  const particles = useMemo(() => Array.from({ length: 10 }, () => ({
    x: 5 + Math.random() * 90,
    size: 3 + Math.random() * 4,
    delay: Math.random() * 7,
    duration: 8 + Math.random() * 6,
    drift: (Math.random() - 0.5) * 50,
  })), [])

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          style={{
            position: 'absolute', left: `${p.x}%`, bottom: 0,
            width: p.size, height: p.size, borderRadius: '50%',
            background: color, boxShadow: `0 0 ${p.size * 2}px ${color}88`,
          }}
          animate={{ y: [0, -800], x: [0, p.drift], opacity: [0, 0.75, 0.75, 0] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
    </div>
  )
}

// ─── EventBanner ─────────────────────────────────────────────────────────────

function EventBanner({ event, announcing }: {
  event: { type: EventType; endsAt: number } | null
  announcing: boolean
}) {
  const def = event ? EVENT_DEFS[event.type] : null
  return (
    <AnimatePresence>
      {announcing && def && (
        <motion.div
          key={event!.type}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.35 }}
          style={{
            position: 'fixed', top: 56, left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            zIndex: 200, pointerEvents: 'none', padding: '0 1rem',
          }}
        >
          <div style={{
            background: 'rgba(4,10,18,0.94)',
            border: `1px solid ${def.color}45`,
            borderLeft: `3px solid ${def.color}`,
            borderRadius: 14, padding: '0.7rem 1.1rem',
            backdropFilter: 'blur(8px)',
            boxShadow: `0 4px 24px rgba(0,0,0,0.55), 0 0 20px ${def.color}18`,
            maxWidth: 340,
          }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]"
              style={{ fontSize: '0.42rem', color: def.color + '88', marginBottom: 3 }}>
              Event Active
            </p>
            <p className="font-cinzel font-700"
              style={{ fontSize: '0.9rem', color: def.color, marginBottom: 2 }}>
              {def.name}
            </p>
            <p className="font-karla font-400"
              style={{ fontSize: '0.62rem', color: '#a0a09a' }}>
              {def.tagline}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
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

/** Cumulative fishing-level perks at a given level. Used by the level-up
 *  overlay to surface what the player's level actually does — bite speed
 *  and catch-zone width scale linearly with level (see lib/fishingLevel
 *  and app/fishing/actions.ts fishWaitMs). Zone unlocks are checked against
 *  ZONE_MIN_LEVEL separately. */
function fishingLevelPerks(level: number) {
  return {
    catchZone: Math.floor(level * 0.2),                                // degrees
    biteSpeed: Math.round(((level - 1) / 99) * 33 * 10) / 10,          // percent
  }
}

/** Returns the zones that unlock between two adjacent levels — the player
 *  sees a "Zone Unlocked" callout on the level-up overlay only when crossing
 *  a threshold. */
function zonesUnlockedBetween(from: number, to: number): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = []
  for (const [zone, min] of Object.entries(ZONE_MIN_LEVEL)) {
    if (min > from && min <= to) out.push({ key: zone, label: HABITAT_LABEL[zone] ?? zone })
  }
  return out
}

/** Stat-perk line for the level-up overlay. Cinzel value + caps label,
 *  styled to match NavLevelUpOverlay's stat-delta lines. */
function PerkLine({ label, value }: { label: string; value: string }) {
  return (
    <p
      className="font-cinzel font-700"
      style={{
        display: 'inline-flex', alignItems: 'baseline', gap: 10,
        fontSize: '1.05rem', lineHeight: 1.25,
        color: '#f0ede8',
        textShadow: '0 0 16px rgba(240,192,64,0.45), 0 0 30px rgba(96,165,250,0.22)',
      }}
    >
      <span style={{ color: '#f0c040' }}>{value}</span>
      <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: '0.82rem', letterSpacing: '0.08em' }}>{label}</span>
    </p>
  )
}

/** Live countdown to the next midnight UTC — used in the Daily Challenges
 *  drawer header so the player can see exactly when challenges reset. */
function DailyResetCountdown() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // Once per minute is plenty — the seconds tick adds noise without
    // useful information for a multi-hour countdown.
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const next = new Date(now)
  next.setUTCHours(24, 0, 0, 0)
  const msLeft = next.getTime() - now
  const hours = Math.floor(msLeft / 3_600_000)
  const mins  = Math.floor((msLeft % 3_600_000) / 60_000)
  const label = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  return (
    <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#6a7488', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#7a9bc4', boxShadow: '0 0 6px rgba(122,155,196,0.6)', flexShrink: 0 }} />
      Resets in {label}
    </p>
  )
}

/** Tiny live-countdown shown inside the Finn-challenge HUD chip for speed
 *  challenges. Re-renders ~4× a second; cheap. */
function SpeedClock({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const secs = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return (
    <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: secs <= 5 ? '#ef4444' : '#fde68a' }}>
      · {secs}s
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }

export default function FishingGame({
  hookTier: initialHookTier, rodTier, reelTier: initialReelTier, lineTier,
  initialDoubloons, initialFishingXP, initialBait, initialLastUsedBait, initialInventory,
  fishHoldTier: initialFishHoldTier,
  ownedRods: initialOwnedRods,
  allFishSpecies, initialCaughtFishIds,
  initialHighestPerfectStreak, initialPerfectStreak,
  hasSeenFishingTour, hasSeenFishingCatchTour,
  selectedZone: initialZone, onBack, activeSession, zoneRewardsClaimed,
  initialDailyChallenge, onDailyChallengeChange,
  hasTideTurner, initialTideTurnerSkipsLeft, initialEquippedSpecial, hasPhantomHook, hasAutoCaster,
  initialPrestigeLevels, initialTrophyCatches, characterColor, unlockedCharacterColors, equippedBadges, unlockedBadges,
  marketMultipliers, isPremium, initialEquippedBoat, initialUnlockedBoats, onBoatStateChange,
  initialEquippedHat, initialUnlockedHats, onHatStateChange,
  initialFinnEncounters, initialFinnWins, initialFinnSeenBeats, initialFinnRevealed, initialFinnLastOutcome,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialLastUsedBait: string | null
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  fishHoldTier: number
  ownedRods: number[]
  allFishSpecies: FishSpeciesBasic[]
  initialCaughtFishIds: number[]
  initialHighestPerfectStreak: number
  initialPerfectStreak: number
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  selectedZone: ZoneKey
  onBack: () => void
  activeSession?: ActiveSession
  zoneRewardsClaimed: Record<string, boolean>
  initialDailyChallenge: DailyChallengeState | null
  /** Fired whenever local progress/claimed updates so the parent
   *  (FishingPageClient) can preserve the state across zone remounts. */
  onDailyChallengeChange?: (
    progress: [number, number, number],
    claimed: [boolean, boolean, boolean],
  ) => void
  hasTideTurner: boolean
  initialTideTurnerSkipsLeft: number
  initialEquippedSpecial: string | null
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  initialPrestigeLevels: Record<string, number>
  initialTrophyCatches: number[]
  characterColor: string
  unlockedCharacterColors: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  marketMultipliers: Record<number, number>
  isPremium: boolean
  initialEquippedBoat: string | null
  initialUnlockedBoats: string[]
  onBoatStateChange?: (equipped: string | null, unlocked: string[]) => void
  initialEquippedHat: string | null
  initialUnlockedHats: string[]
  onHatStateChange?: (equipped: string | null, unlocked: string[]) => void
  initialFinnEncounters: number
  initialFinnWins: number
  initialFinnSeenBeats: string[]
  initialFinnRevealed: boolean
  initialFinnLastOutcome: 'won' | 'lost' | 'passed' | null
}) {

  const [localCharacterColor, setLocalCharacterColor] = useState(characterColor)
  const [equippedBoat, setEquippedBoat] = useState<string | null>(initialEquippedBoat)
  const [unlockedBoats, setUnlockedBoats] = useState<string[]>(initialUnlockedBoats)
  const boatDef = getBoat(equippedBoat)
  const [equippedHat, setEquippedHat] = useState<string | null>(initialEquippedHat)
  const [unlockedHats, setUnlockedHats] = useState<string[]>(initialUnlockedHats)
  const hatDef = getHat(equippedHat)
  const [localEquippedBadges, setLocalEquippedBadges] = useState(equippedBadges)
  const charSrc = getCharSrc(localCharacterColor)

  const [currentFishHoldTier, setCurrentFishHoldTier] = useState(initialFishHoldTier)
  const holdCapacity = getFishHold(currentFishHoldTier).capacity

  const [equippedRodTier, setEquippedRodTier] = useState(rodTier)
  const [ownedRods, setOwnedRods] = useState(initialOwnedRods)
  const [reelTier, setReelTier] = useState(initialReelTier)
  const [hookTier, setHookTier] = useState(initialHookTier)
  const [caughtFishIds, setCaughtFishIds] = useState(() => new Set(initialCaughtFishIds))
  const rod  = getRod(equippedRodTier)
  const reel = getReel(reelTier)
  const hook = getHook(hookTier)
  const line = getLine(lineTier)

  // Sprite preload — every cosmetic image the player will see in the
  // first few seconds (character poses, boat, hat, rod, reel, hook). We
  // explicitly call img.decode() so the browser does the load + decode
  // work UP FRONT, instead of stealing main-thread time during the
  // bob animation's first few cycles. The bob is then gated on
  // spritesReady so the player doesn't see stuttery frames while the
  // decode is in progress. Re-runs whenever any sprite-affecting state
  // changes (color / hat / boat / rod / reel / hook).
  const [spritesReady, setSpritesReady] = useState(false)
  useEffect(() => {
    setSpritesReady(false)
    const urls: string[] = []
    const charSrcs = getCharSrc(localCharacterColor)
    urls.push(charSrcs.rest, charSrcs.wait, charSrcs.cast)
    if (boatDef) urls.push(boatDef.restImageUrl, boatDef.castImageUrl)
    if (hatDef)  urls.push(hatDef.restImageUrl, hatDef.castImageUrl)
    if (rod.slug) {
      urls.push(`/${rod.slug}_rest.png`, `/${rod.slug}_wait.png`, `/${rod.slug}_cast.png`)
    } else if (rod.imageUrl) {
      urls.push(rod.imageUrl)
    }
    if (reel.imageUrl) urls.push(reel.imageUrl)
    if (hook.imageUrl) urls.push(hook.imageUrl)
    let cancelled = false
    Promise.all(urls.map(src => {
      const img = new Image()
      img.src = src
      // .decode() returns a promise that resolves when the bitmap is
      // ready to paint. Some browsers don't support it → fall back to
      // resolving on the load event.
      if (typeof img.decode === 'function') {
        return img.decode().catch(() => new Promise<void>(r => {
          img.onload = () => r()
          img.onerror = () => r()
        }))
      }
      return new Promise<void>(r => {
        img.onload = () => r()
        img.onerror = () => r()
      })
    })).then(() => { if (!cancelled) setSpritesReady(true) })
    return () => { cancelled = true }
  }, [localCharacterColor, boatDef, hatDef, rod, reel.imageUrl, hook.imageUrl])

  // Background soundtrack — managed by the module-level singleton in
  // lib/fishingMusic so the audio element survives React unmount and the
  // fade-out actually runs when the player leaves /fishing. Persists the
  // mute preference via localStorage.
  const [audioMuted, setAudioMuted] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    const saved = window.localStorage.getItem('fishingAudioMuted')
    return saved === null ? true : saved === 'true'
  })
  // SFX mute is independent of the music mute (separate localStorage key,
  // separate sfxGain node in lib/fishingMusic). Default ON (not muted).
  const [sfxMuted, setSfxMutedState] = useState<boolean>(() => getFishingSfxMuted())

  // Music start/stop now lives in FishingPageClient so it persists across the
  // ZoneLanding ↔ FishingGame views. Here we only react to the in-game mute
  // toggle. Skip the FIRST run so mounting (music already playing) doesn't
  // clobber the parent's entry fade with the shorter toggle ramp.
  const audioMutedInitialRunRef = useRef(true)
  useEffect(() => {
    if (audioMutedInitialRunRef.current) {
      audioMutedInitialRunRef.current = false
      try { window.localStorage.setItem('fishingAudioMuted', String(audioMuted)) } catch {}
      return
    }
    setFishingMusicMuted(audioMuted)
    try { window.localStorage.setItem('fishingAudioMuted', String(audioMuted)) } catch {}
  }, [audioMuted])

  // Game state
  const [phase, setPhase]           = useState<Phase>('idle')
  const selectedZone = initialZone
  const [selectedBait, setSelectedBait] = useState<string>(() => {
    // Prefer last-used bait if the player still has at least one — saved
    // to profile.last_used_bait by castLine on every cast. Falls back to
    // the first bait with quantity > 0, then 'worm' as a final default.
    if (initialLastUsedBait) {
      const last = initialBait.find(b => b.bait_type === initialLastUsedBait && b.quantity > 0)
      if (last) return last.bait_type
    }
    const first = initialBait.find(b => b.quantity > 0)
    return first?.bait_type ?? 'worm'
  })
  const [baitInventory, setBaitInventory] = useState<BaitItem[]>(initialBait)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  // Dismiss-on-open tracking. Reading localStorage in a lazy initializer keeps
  // the values stable across re-renders without a useEffect roundtrip.
  const [seenRodTiers, setSeenRodTiers] = useState<number[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem('fishing:seen-rods')
      const parsed = raw ? JSON.parse(raw) : null
      return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number') : []
    } catch { return [] }
  })
  const [seenReelTier, setSeenReelTier] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const n = parseInt(localStorage.getItem('fishing:seen-reel-tier') ?? '0', 10)
    return Number.isFinite(n) ? n : 0
  })
  const [seenHookTier, setSeenHookTier] = useState<number>(() => {
    if (typeof window === 'undefined') return 0
    const n = parseInt(localStorage.getItem('fishing:seen-hook-tier') ?? '0', 10)
    return Number.isFinite(n) ? n : 0
  })

  // Shop affordability — drives the "↑" dot on the gear button + rod/reel/hook slots.
  // The dot suppresses once the drawer is opened with that upgrade visible.
  const affordableRodTiers = RODS
    .filter(r => r.cost > 0 && !r.earnedOnly && !ownedRods.includes(r.tier) && doubloons >= r.cost)
    .map(r => r.tier)
  const rodHasAffordable = affordableRodTiers.some(t => !seenRodTiers.includes(t))
  const nextReelDef = REELS[reelTier + 1]
  const reelHasAffordable = nextReelDef ? (doubloons >= nextReelDef.cost && (reelTier + 1) > seenReelTier) : false
  const nextHookDef = HOOKS[hookTier + 1]
  const hookHasAffordable = nextHookDef ? (doubloons >= nextHookDef.cost && (hookTier + 1) > seenHookTier) : false
  const anyShopAffordable = rodHasAffordable || reelHasAffordable || hookHasAffordable
  const [holdOpen, setHoldOpen]         = useState(false)
  const [sellOpen, setSellOpen]         = useState(false)
  const [gearOpen, setGearOpen]         = useState(false)
  const [baitOpen, setBaitOpen]         = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [uncheckedNewFishIds, setUncheckedNewFishIds] = useState<Set<number>>(new Set())
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [claimedZones, setClaimedZones] = useState<Record<string, boolean>>(zoneRewardsClaimed)
  const [claimingZone, setClaimingZone] = useState<string | null>(null)
  const [zoneClaimToast, setZoneClaimToast] = useState<{ zone: string; earned: number } | null>(null)
  const [skinUnlockToast, setSkinUnlockToast] = useState<string | null>(null)
  const [prestigeLevels, setPrestigeLevels] = useState<Record<string, number>>(initialPrestigeLevels)
  const [prestigingZone, setPrestigingZone] = useState<string | null>(null)
  const [confirmPrestigeZone, setConfirmPrestigeZone] = useState<string | null>(null)
  const [tappedFishId, setTappedFishId] = useState<number | null>(null)
  const [trophyCatches, setTrophyCatches] = useState(() => new Set(initialTrophyCatches))

  // Boss fight state (ancient_deep)
  const [bossStage, setBossStage] = useState(0)
  const bossStageRef = useRef(0)
  const [activeBossMechanic, setActiveBossMechanic] = useState<BossMechanic | null>(null)
  const activeBossMechanicRef = useRef<BossMechanic | null>(null)
  const [bossZoneShrink, setBossZoneShrink] = useState(0)
  const bossZoneShrinkRef = useRef(0)
  const bossNeedleMultRef = useRef(1.0)
  const [bossStageCleared, setBossStageCleared] = useState(false)

  const [sessionCatches, setSessionCatches] = useState<FishSpecies[]>([])
  const [sessionPerfects, setSessionPerfects] = useState(0)
  const [sessionNewSpecies, setSessionNewSpecies] = useState(0)
  const [sellPending, setSellPending] = useState<number | null>(null)
  const [liquidating, setLiquidating] = useState(false)
  const [liquidateConfirm, setLiquidateConfirm] = useState(false)
  const [buyingWorms, setBuyingWorms] = useState(false)
  const [wormBuyMsg, setWormBuyMsg] = useState<string | null>(null)
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number; biteRarity: number; crateTier?: 'wooden' | 'metal' | 'gold' | 'diamond' } | null>(null)
  const [catchResult, setCatchResult] = useState<{ fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean; isPerfect: boolean; xpGained: number; doubleCatch?: boolean; gemEarned?: boolean; perfectStreak: number; streakBonusXP: number; jackpotMultiplier?: number } | null>(null)
  const [crateResult, setCrateResult] = useState<
    | { type: 'doubloons'; amount: number }
    | { type: 'bait';      baitType: string; baitName: string; quantity: number }
    | { type: 'skin';      skinId: string;   skinName: string }
    | { type: 'hat';       hatId: string;    hatName: string;  hatImageUrl: string  }
    | { type: 'boat';      boatId: string;   boatName: string; boatImageUrl: string }
    | null
  >(null)
  const [cratePhase, setCratePhase] = useState<'closed' | 'rolling' | 'revealed'>('closed')
  const [crateRollDisplay, setCrateRollDisplay] = useState<{ type: 'doubloons'; amount: number } | { type: 'bait'; baitType: string; baitName: string } | null>(null)
  // ── Finn (fishing rival) ────────────────────────────────────────────────
  // Encounter counters mirror the DB columns so we can pick story beats
  // locally without a server round-trip. Updated optimistically; the server
  // actions return authoritative state we resync against.
  const [finnEncounters, setFinnEncounters] = useState(initialFinnEncounters)
  const [finnWins, setFinnWins] = useState(initialFinnWins)
  const [finnSeenBeats, setFinnSeenBeats] = useState<string[]>(initialFinnSeenBeats)
  const [finnRevealed, setFinnRevealed] = useState(initialFinnRevealed)
  // Outcome of the LAST encounter ('won' | 'lost' | 'passed'). When set,
  // the next encounter opens with a callback line acknowledging it, then
  // clears (server-side via recordFinnEncounter). null after a fresh
  // encounter or for a player who's never met Finn.
  const [finnLastOutcome, setFinnLastOutcome] = useState<'won' | 'lost' | 'passed' | null>(initialFinnLastOutcome)
  // Active challenge — non-null while a bet is in flight. Cleared on settle.
  const [finnChallenge, setFinnChallenge] = useState<{
    type: FinnChallengeType
    tier: 1 | 2 | 3
    multiplier: number
    perfectsTarget?: number; perfectsHit?: number
    fishTarget?: number;     fishCaught?: number
    speedEndsAt?: number
  } | null>(null)
  // True for ~500ms after a cast triggers an encounter — gives the player
  // a beat to register the cast before Finn slides in, and blocks further
  // input during the lead-in.
  const [finnPending, setFinnPending] = useState(false)
  // Overlay state — when set, FinnEncounter mounts with these props.
  const [finnOverlay, setFinnOverlay] = useState<{
    mode: 'offer' | 'result' | 'reveal'
    lines: string[]
    challenge?: { type: FinnChallengeType; tier: 1 | 2 | 3; targetText: string; rewardText: string }
    pendingChallenge?: {
      type: FinnChallengeType
      tier: 1 | 2 | 3
      multiplier: number
      perfectsTarget?: number
      fishTarget?: number
      timeMs?: number
    }
    // Drives the win/loss badge on result overlays.
    resultKind?: 'won' | 'lost'
    rewardText?: string
  } | null>(null)
  const [perfectStreak, setPerfectStreak] = useState(initialPerfectStreak)
  const [highestPerfectStreak, setHighestPerfectStreak] = useState(initialHighestPerfectStreak)
  // The perfect streak is server-authoritative (reelIn tracks + persists it and
  // returns the live value). The client mirrors it for display and reconciles
  // from each catch's response — see the catch handler below.
  const [snapKey, setSnapKey] = useState(0)
  const [castRippleKey, setCastRippleKey] = useState(0)
  const [reelRippleKey, setReelRippleKey] = useState(0)
  const [newStreakRecord, setNewStreakRecord] = useState<number | null>(null)
  const [castNotice, setCastNotice] = useState<string | null>(null)
  const [tideTurnerSkipsLeft, setTideTurnerSkipsLeft] = useState(initialTideTurnerSkipsLeft)
  const [equippedSpecial, setEquippedSpecial] = useState<string | null>(initialEquippedSpecial)
  const [ownedAutoCaster, setOwnedAutoCaster] = useState(hasAutoCaster)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [catchTourStep, setCatchTourStep] = useState<number | null>(null)
  const catchTourShownRef = useRef(false)
  const [perfectFlash, setPerfectFlash] = useState(false)
  const [perfectBurstKey, setPerfectBurstKey] = useState(0)
  const [waitMessage, setWaitMessage] = useState('')
  const [retryFlash, setRetryFlash] = useState(false)
  const [missResult, setMissResult] = useState<ZoneType | null>(null)
  const [fishingXP, setFishingXP]   = useState(initialFishingXP)
  const [xpPopup, setXpPopup]       = useState<{ value: number; id: number; prestige?: boolean } | null>(null)
  // Level-up celebration carries both the old AND new level so we can
  // compute the stat deltas the player just earned (catch-zone width,
  // bite speed, zone unlocks) — see fishingLevelDeltas() helper.
  const [levelUpNotif, setLevelUpNotif] = useState<{ from: number; to: number } | null>(null)
  const [podiumNotif, setPodiumNotif] = useState<PodiumNotif | null>(null)
  const podiumPositionsRef = useRef<{ fishingLevel: number | null; perfectStreak: number | null }>({ fishingLevel: null, perfectStreak: null })
  const [, startTransition]         = useTransition()

  // ── Daily challenges ────────────────────────────────────────────────────
  const dailyChallenges = initialDailyChallenge ? initialDailyChallenge.challenges : getDailyChallenges(new Date().toISOString().slice(0, 10))
  const [dailyProgress, setDailyProgress] = useState<[number, number, number]>(initialDailyChallenge?.progress ?? [0, 0, 0])
  const [dailyClaimed, setDailyClaimed] = useState<[boolean, boolean, boolean]>(initialDailyChallenge?.claimed ?? [false, false, false])
  // Push local progress + claimed up to the parent on every change so the
  // state survives a ZoneLanding remount when the player switches zones.
  // Without this the second zone reads a stale server snapshot and the
  // claim UI reappears for an already-claimed challenge.
  useEffect(() => {
    onDailyChallengeChange?.(dailyProgress, dailyClaimed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyProgress, dailyClaimed])
  const [dailyOpen, setDailyOpen] = useState(false)
  const [dailyJustCompleted, setDailyJustCompleted] = useState<number | null>(null)
  const [claimingDaily, setClaimingDaily] = useState<number | null>(null)

  // ── Random events ───────────────────────────────────────────────────────
  const [activeEvent, setActiveEvent] = useState<{ type: EventType; endsAt: number } | null>(null)
  const [eventAnnouncing, setEventAnnouncing] = useState(false)
  const activeEventRef = useRef<{ type: EventType; endsAt: number } | null>(null)
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const [blackoutOpacity, setBlackoutOpacity] = useState(0)
  const angleRef        = useRef(270)
  const speedRef        = useRef(0)
  const dirRef          = useRef(1)
  const phaseRef        = useRef<Phase>('idle')
  const animRef         = useRef<number | null>(null)
  const blackoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimeRef     = useRef(0)
  const elapsedMsRef    = useRef(0)
  const nextChgMsRef    = useRef(0)
  // Perf: the needle is driven imperatively (DOM transform) each frame so the
  // huge parent doesn't re-render 60×/sec during the dial. These mirror the
  // latest zones/rotation for in-loop zone-crossing detection (the only thing
  // that needs a real re-render — to refresh the colour/label tells).
  const needleGroupRef   = useRef<SVGGElement | null>(null)
  const catchingZonesRef = useRef<ZoneDef[]>([])
  const zoneRotationRef  = useRef(0)
  const lastZoneFromRef  = useRef<number>(NaN)
  const hookedFishRef   = useRef<{ fishId: number; catchDifficulty: number; crateTier?: 'wooden' | 'metal' | 'gold' | 'diamond' } | null>(null)
  const selectedBaitRef = useRef(selectedBait)
  useEffect(() => { phaseRef.current = phase }, [phase])

  // When the gear drawer opens, mark currently-affordable upgrades as seen so
  // the green pulse dots stop nagging. Re-pulses once a NEW tier crosses into
  // budget (e.g. you buy reel 4 → reel 5 becomes the next-tier and is unseen).
  useEffect(() => {
    if (!gearOpen) return
    if (affordableRodTiers.length > 0) {
      const merged = Array.from(new Set([...seenRodTiers, ...affordableRodTiers]))
      if (merged.length !== seenRodTiers.length) {
        setSeenRodTiers(merged)
        try { localStorage.setItem('fishing:seen-rods', JSON.stringify(merged)) } catch {}
      }
    }
    if (nextReelDef && doubloons >= nextReelDef.cost && (reelTier + 1) > seenReelTier) {
      const tier = reelTier + 1
      setSeenReelTier(tier)
      try { localStorage.setItem('fishing:seen-reel-tier', String(tier)) } catch {}
    }
    if (nextHookDef && doubloons >= nextHookDef.cost && (hookTier + 1) > seenHookTier) {
      const tier = hookTier + 1
      setSeenHookTier(tier)
      try { localStorage.setItem('fishing:seen-hook-tier', String(tier)) } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gearOpen])

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
  useEffect(() => { activeEventRef.current = activeEvent }, [activeEvent])

  useEffect(() => {
    function scheduleNext() {
      const delay = (15 + Math.random() * 5) * 60 * 1000
      eventTimerRef.current = setTimeout(() => {
        const type = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)]
        const ev = { type, endsAt: Date.now() + 120_000 }
        setActiveEvent(ev)
        activeEventRef.current = ev
        setEventAnnouncing(true)
        activateEvent(type) // register server-side so effects are validated there
        setTimeout(() => setEventAnnouncing(false), 5_000)
        setTimeout(() => { setActiveEvent(null); activeEventRef.current = null }, 120_000)
        scheduleNext()
      }, delay)
    }
    scheduleNext()
    return () => { if (eventTimerRef.current) clearTimeout(eventTimerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { selectedBaitRef.current = selectedBait }, [selectedBait])
  // If the selected bait runs dry but the player still owns another type, switch
  // to it. Otherwise selectedBaitQty hits 0 while hasBait stays true, which
  // hides the Cast button behind the "get bait" prompt and stalls the Auto
  // Caster — even though the player clearly has bait to fish with.
  useEffect(() => {
    const cur = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (cur > 0) return
    const fallback = baitInventory.find(b => b.quantity > 0)
    if (fallback) setSelectedBait(fallback.bait_type)
  }, [baitInventory, selectedBait])
  useEffect(() => { hookedFishRef.current = hookedFish }, [hookedFish])
  useEffect(() => {
    if (newStreakRecord === null) return
    const id = setTimeout(() => setNewStreakRecord(null), 4000)
    return () => clearTimeout(id)
  }, [newStreakRecord])

  useEffect(() => {
    if (castNotice === null) return
    const id = setTimeout(() => setCastNotice(null), 3500)
    return () => clearTimeout(id)
  }, [castNotice])


  useEffect(() => {
    if (!hasSeenFishingTour) setTourStep(0)
  }, [hasSeenFishingTour])

  useEffect(() => {
    if (phase === 'catching' && !catchTourShownRef.current) {
      catchTourShownRef.current = true
      if (!hasSeenFishingCatchTour) setCatchTourStep(0)
    }
  }, [phase, hasSeenFishingCatchTour])

  // Character frame — drives which sprite is shown
  const [charFrame, setCharFrame] = useState<CharFrame>('rest')
  const [castAnimDone, setCastAnimDone] = useState(false)
  useEffect(() => {
    if (phase === 'idle' || phase === 'result') { setCharFrame('rest'); return }
    if (phase === 'hooked' || phase === 'catching' || phase === 'reeling') { setCharFrame('wait'); return }
    if (phase !== 'casting') { setCastAnimDone(false); return }
    setCastAnimDone(false)
    setCharFrame('cast')
    // First cast SFX — fired here, paired with setCharFrame('cast') so
    // it lands with the visual cast pose. Previously we fired it on
    // the button onPointerDown which played ~200 ms before the pose
    // appeared and felt premature.
    playCastSfx()
    // Second cast SFX — fires the instant the cast animation finishes
    // and the line hits the water. We fire the audio ~50 ms before
    // setCharFrame('wait') because Web Audio BufferSource.start has a
    // small startup latency on iOS (~30–60 ms); without the lead, the
    // sound feels slightly behind the visual pose flip.
    const t0 = setTimeout(() => playCast2Sfx(), 600)
    const t1 = setTimeout(() => setCharFrame('wait'), 650)
    const t2 = setTimeout(() => setCastAnimDone(true), 1500)
    return () => { clearTimeout(t0); clearTimeout(t1); clearTimeout(t2) }
  }, [phase])

  // Needle animation during catching phase
  useEffect(() => {
    if (phase !== 'catching' || !hookedFish) {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      return
    }
    const diffSpeed = FISH_DIFFICULTY_SPEED[Math.max(0, Math.min(4, hookedFish.catchDifficulty - 1))]
    const zoneDiff  = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baseMin = diffSpeed.speedMin * reel.needleSpeedMultiplier * bossNeedleMultRef.current
    const baseMax = diffSpeed.speedMax * reel.needleSpeedMultiplier * bossNeedleMultRef.current
    const capturedZoneRotation = zoneRotation

    speedRef.current   = baseMin + Math.random() * (baseMax - baseMin)
    lastTimeRef.current  = 0
    elapsedMsRef.current = 0
    nextChgMsRef.current = (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50
    lastZoneFromRef.current = NaN // force a zone sync on the first frame

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
        const scaledBlackout = zoneDiff.blackoutChance * (hookedFish.catchDifficulty / 5)
        if (Math.random() < scaledBlackout && blackoutTimerRef.current === null) {
          const duration = 500 + Math.random() * 600
          setBlackoutOpacity(0.91)
          blackoutTimerRef.current = setTimeout(() => {
            setBlackoutOpacity(0)
            blackoutTimerRef.current = null
          }, duration)
        }
        nextChgMsRef.current = elapsedMsRef.current + (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50
      }
      // Move the needle imperatively (no React re-render) for a smooth 60fps.
      const ng = needleGroupRef.current
      if (ng) ng.setAttribute('transform', `rotate(${angleRef.current}, ${CX}, ${CY})`)
      // Re-render the parent ONLY when the needle crosses into a new zone, so
      // the needle colour / zone highlight / label tells stay accurate.
      const zNow = getZone(catchingZonesRef.current, angleRef.current, zoneRotationRef.current)
      if (zNow.from !== lastZoneFromRef.current) {
        lastZoneFromRef.current = zNow.from
        setAngle(angleRef.current)
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      if (blackoutTimerRef.current) { clearTimeout(blackoutTimerRef.current); blackoutTimerRef.current = null }
      setBlackoutOpacity(0)
    }
  // retryKey increments on Second Wind retry to restart animation with fresh randomization
  }, [phase, hookedFish, reel.needleSpeedMultiplier, retryKey])

  // Dial sound — loops while the reel dial is on screen (phase='catching')
  // and stops the instant the player taps Reel In (handleReelIn also calls
  // stopDialLoop synchronously so the stop hits before the phase change
  // propagates here, giving the snappiest possible audio cut).
  //
  // Playback rate scales with the fish's catch difficulty (1–5) so harder
  // fish get a faster, higher-pitched ticking — adds urgency in audio to
  // match the faster needle speed already in play visually.
  //   diff 1 → 1.00×    diff 3 → 1.30×    diff 5 → 1.60×
  useEffect(() => {
    if (phase === 'catching' && hookedFish) {
      const diff = Math.max(1, Math.min(5, hookedFish.catchDifficulty))
      const rate = 1 + (diff - 1) * 0.15
      startDialLoop(rate)
      return () => stopDialLoop()
    }
    stopDialLoop()
  }, [phase, hookedFish])

  // Drift mechanic: Plesiosaurus rotates the zone arc continuously while the needle spins
  useEffect(() => {
    if (phase !== 'catching' || activeBossMechanic !== 'drift') return
    const id = setInterval(() => setZoneRotation(r => (r + 1) % 360), 30)
    return () => clearInterval(id)
  }, [phase, activeBossMechanic])

  function deductBait(type: string, qty = 1) {
    setBaitInventory(prev => prev.map(b =>
      b.bait_type === type ? { ...b, quantity: Math.max(0, b.quantity - qty) } : b
    ))
  }

  function handleTideTurnerSkip() {
    if (equippedSpecial !== 'tide_turner' || tideTurnerSkipsLeft <= 0 || phase !== 'catching') return
    setHookedFish(null)
    setPhase('idle')
    startTransition(async () => {
      const res = await useTideTurnerSkip()
      if ('ok' in res) setTideTurnerSkipsLeft(res.skipsLeft)
    })
  }

  function totalBait() {
    return baitInventory.reduce((s, b) => s + b.quantity, 0)
  }

  // Core cast logic — no phase guard, called from both Cast and Cast Again
  async function doCast() {
    const currentQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (currentQty <= 0) { setPhase('idle'); return }
    // Belt-and-suspenders: clear any stale crate state from a previous
    // catch. handleCastAgain already does this, but handleCast (and the
    // autocaster path) didn't — and a stuck crateResult will hide the
    // Cast Again button on the next regular catch.
    setCrateResult(null)
    setCratePhase('closed')
    setCrateRollDisplay(null)

    const ev = activeEventRef.current
    const isBloom = ev?.type === 'bloom'
    const isRedTide = ev?.type === 'redtide'

    setPerfectBurstKey(0)
    setWaitMessage(pickWaitMessage(selectedZone as ZoneKey, perfectStreak, { hasTideTurner, hasPhantomHook, hasAutoCaster: ownedAutoCaster }))
    if (!isBloom) deductBait(selectedBait)
    await new Promise(r => setTimeout(r, 200))
    setPhase('casting')

    let committed = false
    try {
      const res = await castLine(selectedBait, selectedZone)
      committed = true

      if ('error' in res) {
        // Server didn't spend — restore the optimistic deduct and tell the
        // player WHY (e.g. "Fish hold full") instead of failing silently.
        if (!isBloom) setBaitInventory(prev => prev.map(b =>
          b.bait_type === selectedBait ? { ...b, quantity: b.quantity + 1 } : b
        ))
        setCastNotice(res.error)
        setPhase('idle')
        return
      }

      // Server committed the spend — reconcile bait to its authoritative count
      // so the client can never drift above the server (the "worms go back up
      // on screen but are down on reload" desync).
      if (!isBloom && typeof res.baitRemaining === 'number') {
        const remaining = res.baitRemaining
        setBaitInventory(prev => prev.map(b =>
          b.bait_type === selectedBait ? { ...b, quantity: remaining } : b
        ))
      }

      await new Promise(r => setTimeout(r, res.waitMs))

      setHookedFish({ fishId: res.fishId, catchDifficulty: res.catchDifficulty, biteRarity: res.biteRarity, crateTier: res.crateTier })

      // Initialise boss fight state for ancient_deep
      if (selectedZone === 'ancient_deep') {
        const bossName = allFishSpecies.find(f => f.id === res.fishId)?.name ?? ''
        const isShastasaurus = bossName === 'Shastasaurus'
        const mechanic = isShastasaurus
          ? SHASTASAURUS_MECHANICS[Math.floor(Math.random() * SHASTASAURUS_MECHANICS.length)]
          : (BOSS_CONFIG[bossName] ?? 'shrink')
        activeBossMechanicRef.current = mechanic
        setActiveBossMechanic(mechanic)
        bossStageRef.current = 1
        setBossStage(1)
        bossZoneShrinkRef.current = 0
        setBossZoneShrink(0)
        bossNeedleMultRef.current = 1.0
      }

      setPhase('hooked')
    } catch {
      // Only restore bait if castLine never resolved (it threw before the
      // server could commit the spend). If it resolved, the spend is committed
      // and already reconciled above — re-adding here would over-credit.
      if (!committed && !isBloom) setBaitInventory(prev => prev.map(b =>
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

  // ── Finn rival helpers ──────────────────────────────────────────────────

  function fireFinnEncounter() {
    // Reveal supersedes every other beat once the player has landed an
    // Ancient Deep trophy and hasn't seen the climax yet.
    const hasAncientTrophy = trophyCatches.size > 0
    if (hasAncientTrophy && !finnRevealed) {
      setFinnOverlay({ mode: 'reveal', lines: FINN_REVEAL_BEAT.lines })
      setFinnRevealed(true)
      setFinnSeenBeats(prev => prev.includes('reveal') ? prev : [...prev, 'reveal'])
      startTransition(() => { void markFinnRevealSeen() })
      return
    }

    // Normal encounter — bump counters, pick story beat (if any), pick challenge.
    const newEncounters = finnEncounters + 1
    const beat = findNextEncounterBeat(newEncounters, finnSeenBeats)

    // Pick challenge type. Speed challenges don't make sense in Ancient
    // Deep (boss-style multi-stage catches break the timer concept), so
    // we force perfect_streak there.
    const zoneSpeedMult = FINN_SPEED_ZONE_MULT[selectedZone] ?? 1
    const type = zoneSpeedMult === 0 ? 'perfect_streak' : pickChallengeType()
    const tier = pickFinnTier()

    let perfectsTarget: number | undefined
    let fishTarget: number | undefined
    let timeMs: number | undefined
    let multiplier: number
    let targetText: string

    if (type === 'perfect_streak') {
      const def = FINN_PERFECT_TIERS[tier - 1]
      perfectsTarget = def.perfects
      multiplier = def.multiplier
      targetText = def.perfects === 1
        ? 'Land a perfect on your next cast'
        : `Land ${def.perfects} perfects in a row`
    } else {
      const def = FINN_SPEED_TIERS[tier - 1]
      fishTarget = def.fish
      // Scale time by zone — deeper waters get more wall-clock seconds so
      // the per-fish pace stays similar to Shallows. Base time stays tight.
      timeMs = Math.round(def.timeMs * zoneSpeedMult)
      multiplier = def.multiplier
      targetText = `Catch ${def.fish} fish in ${Math.round(timeMs / 1000)}s`
    }

    const rewardText = `+${(fishingLevel * multiplier).toLocaleString()} ⟡`

    // Build dialogue: optional callback line (if Finn remembers a previous
    // outcome) + beat lines (if any) + a closing offer line. Post-reveal,
    // occasionally swap the offer for a lore drop instead.
    const offerPool = finnRevealed ? FINN_EPILOGUE_OFFER_LINES : FINN_OFFER_LINES
    const callbackLine = (() => {
      switch (finnLastOutcome) {
        case 'won':    return pickRandomLine(FINN_RETURN_AFTER_WIN)
        case 'lost':   return pickRandomLine(FINN_RETURN_AFTER_LOSS)
        case 'passed': return pickRandomLine(FINN_RETURN_AFTER_PASS)
        default:       return null
      }
    })()
    let lines: string[]
    if (beat) {
      lines = [...beat.lines, pickRandomLine(offerPool)]
    } else if (finnRevealed && Math.random() < FINN_EPILOGUE_LORE_CHANCE) {
      lines = [pickRandomLine(FINN_EPILOGUE_LORE_LINES), pickRandomLine(offerPool)]
    } else {
      lines = [pickRandomLine(offerPool)]
    }
    if (callbackLine) lines = [callbackLine, ...lines]

    // Hold for ~500ms so the cast tap feels intentional — the player sees
    // the cast ripple, then Finn arrives. Slamming the overlay in
    // instantly reads as a jump-cut.
    setFinnPending(true)
    setTimeout(() => {
      setFinnPending(false)
      setFinnOverlay({
        mode: 'offer',
        lines,
        challenge: { type, tier, targetText, rewardText },
        pendingChallenge: { type, tier, multiplier, perfectsTarget, fishTarget, timeMs },
      })
    }, 500)

    // Optimistic state — server resyncs us.
    setFinnEncounters(newEncounters)
    if (beat) setFinnSeenBeats(prev => prev.includes(beat.id) ? prev : [...prev, beat.id])
    // Clear the remembered outcome locally — the server-side
    // recordFinnEncounter call below also nulls finn_last_outcome.
    setFinnLastOutcome(null)

    startTransition(() => {
      void recordFinnEncounter(beat?.id ?? null).then(res => {
        if (!res) return
        setFinnEncounters(res.encounters)
        setFinnSeenBeats(res.seenBeats)
      })
    })
  }

  function handleFinnAccept() {
    const pc = finnOverlay?.pendingChallenge
    if (!pc) { setFinnOverlay(null); return }
    setFinnChallenge({
      type: pc.type, tier: pc.tier, multiplier: pc.multiplier,
      perfectsTarget: pc.perfectsTarget, perfectsHit: 0,
      fishTarget: pc.fishTarget, fishCaught: 0,
      speedEndsAt: pc.timeMs ? Date.now() + pc.timeMs : undefined,
    })
    setFinnOverlay(null)
  }

  function handleFinnPass() {
    setFinnOverlay(null)
    // Remember the decline so the next encounter can call it out.
    setFinnLastOutcome('passed')
    startTransition(() => { void recordFinnPass() })
  }

  function handleFinnDismiss() {
    setFinnOverlay(null)
  }

  function resolveFinnChallenge(won: boolean) {
    if (!finnChallenge) return
    const rewardAmount = won ? fishingLevel * finnChallenge.multiplier : 0

    // Win-track beat takes priority over generic win lines.
    const newWins = won ? finnWins + 1 : finnWins
    const winBeat = won ? findNextWinBeat(newWins, finnSeenBeats) : null

    let lines: string[]
    if (won) {
      if (winBeat) lines = winBeat.lines
      else lines = [pickRandomLine(finnRevealed ? FINN_EPILOGUE_WIN_LINES : FINN_WIN_LINES)]
    } else {
      lines = [pickRandomLine(finnRevealed ? FINN_EPILOGUE_LOSS_LINES : FINN_LOSS_LINES)]
    }

    // Optimistic state
    if (won) {
      setFinnWins(newWins)
      if (winBeat) setFinnSeenBeats(prev => prev.includes(winBeat.id) ? prev : [...prev, winBeat.id])
      setDoubloons(prev => {
        const next = prev + rewardAmount
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: next }))
        return next
      })
    }

    setFinnChallenge(null)
    // Stamp the outcome so the NEXT encounter can open with a callback
    // line. Cleared on the server when recordFinnEncounter fires next time.
    setFinnLastOutcome(won ? 'won' : 'lost')
    // Hold the result overlay back a beat so the catch result card / banners
    // get to land first. Without this Finn slams in over the catch and the
    // player can't even tell if they hit it.
    setTimeout(() => setFinnOverlay({
      mode: 'result',
      lines,
      resultKind: won ? 'won' : 'lost',
      rewardText: won ? `+${rewardAmount.toLocaleString()} ⟡` : undefined,
    }), 1200)

    startTransition(() => {
      void settleFinnChallenge(won, rewardAmount, winBeat?.id ?? null).then(res => {
        if (!res) return
        setFinnWins(res.wins)
        setFinnSeenBeats(res.seenBeats)
        setDoubloons(res.doubloons)
      })
    })
  }

  // Speed challenge timeout — when the clock runs out the challenge fails.
  useEffect(() => {
    if (!finnChallenge?.speedEndsAt) return
    const ms = finnChallenge.speedEndsAt - Date.now()
    if (ms <= 0) { resolveFinnChallenge(false); return }
    const t = setTimeout(() => resolveFinnChallenge(false), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finnChallenge?.speedEndsAt])

  // Phase 1 — cast (from idle)
  async function handleCast() {
    if (phase !== 'idle') return
    if (finnPending) return  // encounter is loading in
    // 2% chance Finn intercepts the cast (no bait consumed). Suppressed
    // while a challenge is already in flight so the player isn't double-bet.
    if (!finnChallenge && !finnOverlay && Math.random() < FINN_ENCOUNTER_RATE) {
      // Brief cast ripple for tap feedback before Finn arrives — keeps
      // the tap from feeling unresponsive during the 500ms lead-in.
      setCastRippleKey(k => k + 1)
      setTimeout(() => setCastRippleKey(0), 1800)
      fireFinnEncounter()
      return
    }
    // cast SFX is fired from the charFrame useEffect when the pose
    // actually flips to 'cast' — keeps audio synced to the visible
    // animation rather than the click.
    setCastRippleKey(k => k + 1)
    setTimeout(() => setCastRippleKey(0), 1800)
    await doCast()
  }

  // Phase 2 — reel in
  async function handleReelIn() {
    if (phase !== 'catching' || !hookedFishRef.current) return
    // Cut the dial sound immediately on tap.
    stopDialLoop()
    // Cancel the rAF so no further ticks advance the needle, then freeze
    // the displayed angle at exactly what the player saw (the committed
    // `angle` state). Using `angle` for both the freeze and the zone
    // calc below keeps the catch result consistent with the visible
    // needle and avoids the one-frame "creep" after the tap.
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    const lockedAngle = angle
    setAngle(lockedAngle)
    angleRef.current = lockedAngle
    setSnapKey(k => k + 1)
    setReelRippleKey(k => k + 1)
    setTimeout(() => setReelRippleKey(0), 1800)

    const zoneDiff2 = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baitBonus = getBait(selectedBaitRef.current).catchZoneBonus
    const eventCatchBonus = activeEventRef.current?.type === 'glassy' ? 12 : 0
    const baseZones = buildFishZones(hookedFishRef.current.catchDifficulty, hookTier, line.penaltyMultiplier, zoneDiff2.catchMultiplier, levelBonus + baitBonus + rod.catchZoneBonus + eventCatchBonus, rod.perfectZoneBonus + 1)
    const zones = selectedZone === 'ancient_deep'
      ? applyBossMods(baseZones, activeBossMechanicRef.current, bossZoneShrinkRef.current)
      : baseZones
    const zone  = getZone(zones, angleRef.current, zoneRotation)

    // Snag immune: treat penalty as miss — no extra bait lost
    const effectiveZoneType = (zone.type === 'penalty' && rod.snagImmune) ? 'miss' : zone.type

    if (effectiveZoneType === 'penalty') deductBait(selectedBaitRef.current)

    const isCatch = effectiveZoneType === 'catch' || effectiveZoneType === 'perfect'

    // Ancient Deep: 3-stage boss mechanic
    if (selectedZone === 'ancient_deep') {
      if (!isCatch) {
        // Miss resets the entire boss fight
        bossStageRef.current = 0
        setBossStage(0)
        activeBossMechanicRef.current = null
        setActiveBossMechanic(null)
        bossZoneShrinkRef.current = 0
        setBossZoneShrink(0)
        bossNeedleMultRef.current = 1.0
        // Fall through to normal miss handling
      } else {
        const stage = bossStageRef.current
        if (stage < 3) {
          // Stage cleared — show feedback, then advance
          setBossStageCleared(true)
          phaseRef.current = 'reeling'
          setPhase('reeling')
          await new Promise(r => setTimeout(r, 1100))
          setBossStageCleared(false)

          const nextStage = stage + 1
          bossStageRef.current = nextStage
          setBossStage(nextStage)

          // Apply stage-escalation for each mechanic
          const mechanic = activeBossMechanicRef.current
          if (mechanic === 'shrink') {
            const newShrink = bossZoneShrinkRef.current + 10
            bossZoneShrinkRef.current = newShrink
            setBossZoneShrink(newShrink)
          } else if (mechanic === 'accelerate') {
            bossNeedleMultRef.current = Math.min(bossNeedleMultRef.current * 1.4, 4.0)
          }

          // Shastasaurus: pick a new random mechanic each stage
          const bossName = allFishSpecies.find(f => f.id === hookedFishRef.current?.fishId)?.name ?? ''
          if (bossName === 'Shastasaurus') {
            const next = SHASTASAURUS_MECHANICS[Math.floor(Math.random() * SHASTASAURUS_MECHANICS.length)]
            activeBossMechanicRef.current = next
            setActiveBossMechanic(next)
            bossZoneShrinkRef.current = next === 'shrink' ? 8 : 0
            setBossZoneShrink(next === 'shrink' ? 8 : 0)
            bossNeedleMultRef.current = next === 'accelerate' ? 1.5 : 1.0
          }

          setZoneRotation(Math.floor(Math.random() * 360))
          angleRef.current = 270
          dirRef.current = 1
          setAngle(270)
          setRetryKey(k => k + 1)
          phaseRef.current = 'catching'
          setPhase('catching')
          return
        }
        // Stage 3 cleared — reset stage counter and fall through to reelIn
        bossStageRef.current = 0
        setBossStage(0)
        activeBossMechanicRef.current = null
        setActiveBossMechanic(null)
        bossZoneShrinkRef.current = 0
        setBossZoneShrink(0)
        bossNeedleMultRef.current = 1.0
      }
    }

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

      // Miss/penalty: streak resets — but only for real fish. reelIn resets it
      // server-side for real misses; crate fumbles never hit reelIn, so we keep
      // the client neutral on crates to avoid drift. (Finn perfect challenge is
      // unaffected by misses — it only fails on a non-perfect CATCH.)
      if (hookedFishRef.current!.fishId !== CRATE_FISH_ID) setPerfectStreak(0)
      setMissResult(effectiveZoneType)
      setCatchResult(null)
      await new Promise(r => setTimeout(r, 200))
      phaseRef.current = 'result'
      setPhase('result')
      if (hookedFishRef.current!.fishId !== CRATE_FISH_ID) {
        startTransition(async () => {
          await reelIn(hookedFishRef.current!.fishId, effectiveZoneType as 'miss' | 'penalty', selectedBaitRef.current)
        })
      }
      return
    }

    // Catch/perfect: freeze needle, wait for server before showing result
    const wasPerfect = zone.type === 'perfect'
    if (wasPerfect) {
      // Fire the SFX FIRST (before any setState) so the audio call hits
      // the same JS tick as the input — no render cycle in between.
      playPerfectSfx()
      setPerfectBurstKey(k => k + 1)
      setPerfectFlash(true)
      if ('vibrate' in navigator) navigator.vibrate([40, 60, 80])
    }

    // Perfect streak is server-authoritative now (reelIn computes + returns it).
    // Optimistically reset on a non-perfect REAL catch; crates are streak-neutral.
    if (!wasPerfect && hookedFishRef.current!.fishId !== CRATE_FISH_ID) setPerfectStreak(0)

    // Finn challenge progression — replaces the old gem-challenge mechanic.
    // Perfect-streak: a non-perfect catch fails. Speed-catch: any catch
    // counts; misses don't fail (the timer handles loss). Resolution
    // (showing the win/loss overlay + payout) happens via resolveFinnChallenge.
    if (finnChallenge) {
      if (finnChallenge.type === 'perfect_streak' && isCatch) {
        if (wasPerfect) {
          const newHit = (finnChallenge.perfectsHit ?? 0) + 1
          if (newHit >= (finnChallenge.perfectsTarget ?? 1)) {
            void resolveFinnChallenge(true)
          } else {
            setFinnChallenge(prev => prev ? { ...prev, perfectsHit: newHit } : null)
          }
        } else {
          void resolveFinnChallenge(false)
        }
      } else if (finnChallenge.type === 'speed_catch' && isCatch) {
        const newCount = (finnChallenge.fishCaught ?? 0) + 1
        if (newCount >= (finnChallenge.fishTarget ?? 1)) {
          void resolveFinnChallenge(true)
        } else {
          setFinnChallenge(prev => prev ? { ...prev, fishCaught: newCount } : null)
        }
      }
    }

    await new Promise(r => setTimeout(r, 200))
    phaseRef.current = 'reeling'
    setPhase('reeling')

    // Crate catch — fetch loot, don't credit until player claims
    if (hookedFishRef.current.fishId === CRATE_FISH_ID) {
      const tier = hookedFishRef.current.crateTier ?? 'wooden'
      startTransition(async () => {
        try {
          const res = await reelCrate(selectedZone, tier)
          if (!('error' in res)) setCrateResult(res)
        } catch {}
        setCratePhase('closed')
        setCrateRollDisplay(null)
        phaseRef.current = 'result'
        setPhase('result')
      })
      return
    }

    // Twin-Strike rod: 25% chance to catch 2 fish
    const doubleCatch = rod.doubleCatchChance > 0 && Math.random() < rod.doubleCatchChance
    // YOLO Rod: 10% chance to catch 100x fish
    const jackpotHit = !doubleCatch && (rod.jackpotChance ?? 0) > 0 && Math.random() < rod.jackpotChance!
    const jackpotMultiplier = jackpotHit ? (rod.jackpotMultiplier ?? 1) : 1

    startTransition(async () => {
      try {
      const res = await reelIn(hookedFishRef.current!.fishId, zone.type as 'perfect' | 'catch', selectedBaitRef.current, doubleCatch, 0, jackpotMultiplier)

      if ('error' in res || !res.caught) {
        setMissResult('miss')
      } else {
        const { fish, baitSaved, isNewSpecies, xpGained, newXP, dailyProgress: newDailyP } = res
        if (newDailyP) {
          setDailyProgress(prev => {
            for (let i = 0; i < 3; i++) {
              if (prev[i] < dailyChallenges[i].target && newDailyP[i] >= dailyChallenges[i].target) {
                setDailyJustCompleted(i)
                setTimeout(() => setDailyJustCompleted(null), 4000)
              }
            }
            return newDailyP
          })
        }
        // Reconcile the streak from the server (authoritative). reelIn already
        // persisted current_perfect_streak, the highest-streak record, and the
        // 'unbroken' badge — the client only mirrors it for display + celebration.
        if (res.perfectStreak != null) {
          setPerfectStreak(res.perfectStreak)
          if (res.perfectStreak > highestPerfectStreak) {
            setHighestPerfectStreak(res.perfectStreak)
            setNewStreakRecord(res.perfectStreak)
            window.dispatchEvent(new Event('badges-may-have-changed'))
            checkLeaderboardPosition('perfectStreak').then(r => {
              const cur = r?.position ?? null
              if (cur === 1 && podiumPositionsRef.current.perfectStreak !== 1) setPodiumNotif({ category: 'Perfect Streak', position: 1 })
              podiumPositionsRef.current.perfectStreak = cur
            }).catch(() => {})
          }
        }
        const currentHoldCount = inventory.reduce((s, i) => s + i.quantity, 0)
        const desiredQty = doubleCatch ? 2 : jackpotMultiplier
        const actualQty = Math.min(desiredQty, Math.max(0, holdCapacity - currentHoldCount))
        // jackpotMultiplier is the YOLO Rod's special ×N event — only set
        // it when the YOLO jackpot actually triggered. Double catches go
        // through the separate "Double Catch — ×2" banner; we don't want
        // Millionaire's / Twin-Strike showing the "Jackpot!" banner too.
        setCatchResult({ fish, baitSaved, isNewSpecies, isPerfect: wasPerfect, xpGained, doubleCatch, gemEarned: false, perfectStreak: res.perfectStreak ?? perfectStreak, streakBonusXP: res.streakBonusXP ?? 0, jackpotMultiplier: jackpotHit && actualQty > 1 ? actualQty : undefined })
        if (isNewSpecies) {
          if (fish.habitat === 'ancient_deep') {
            setTrophyCatches(prev => new Set([...prev, fish.id]))
          } else {
            setCaughtFishIds(prev => new Set([...prev, fish.id]))
            setUncheckedNewFishIds(prev => new Set([...prev, fish.id]))
          }
        }
        const catchCount = actualQty
        const newCatches = [...sessionCatches, ...Array(catchCount).fill(fish)]
        const newPerfects = sessionPerfects + (wasPerfect ? 1 : 0)
        const newNewSpecies = sessionNewSpecies + (isNewSpecies ? 1 : 0)
        setSessionCatches(newCatches)
        if (wasPerfect) setSessionPerfects(newPerfects)
        if (isNewSpecies) setSessionNewSpecies(newNewSpecies)
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
            gems: 0,
            bestCatch: bestCatch ? { name: bestCatch.name, bite_rarity: bestCatch.bite_rarity, scientific_name: bestCatch.scientific_name } : null,
            rarityCounts,
          }))
        } catch {}

        if (res.unlockedSkinId) { setSkinUnlockToast(res.unlockedSkinId); setTimeout(() => setSkinUnlockToast(null), 6000) }
        const oldLevel = getLevelFromXP(fishingXP)
        const newLevel = getLevelFromXP(newXP)
        setFishingXP(newXP)
        setXpPopup({ value: xpGained, id: Date.now(), prestige: (prestigeLevels[fish.habitat] ?? 0) > 0 })
        if (newLevel > oldLevel) {
          setLevelUpNotif({ from: oldLevel, to: newLevel })
          checkLeaderboardPosition('fishingLevel').then(r => {
            const cur = r?.position ?? null
            if (cur === 1 && podiumPositionsRef.current.fishingLevel !== 1) setPodiumNotif({ category: 'Fishing Level', position: 1 })
            podiumPositionsRef.current.fishingLevel = cur
          }).catch(() => {})
        }
        if (actualQty > 0) {
          setInventory(prev => {
            const existing = prev.find(i => i.fish_id === fish.id)
            return existing
              ? prev.map(i => i.fish_id === fish.id ? { ...i, quantity: i.quantity + actualQty } : i)
              : [...prev, { fish_id: fish.id, quantity: actualQty, fish_species: fish }]
          })
        }
        if (baitSaved) {
          setBaitInventory(prev => prev.map(b =>
            b.bait_type === selectedBaitRef.current ? { ...b, quantity: b.quantity + 1 } : b
          ))
        }
      }

      phaseRef.current = 'result'
      setPhase('result')
      window.dispatchEvent(new Event('badges-may-have-changed'))
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

  async function handleLiquidate() {
    if (liquidating) return
    setLiquidating(true)
    const res = await liquidateAllFish()
    setLiquidating(false)
    setLiquidateConfirm(false)
    if ('error' in res) return
    setInventory([])
    window.dispatchEvent(new Event('pending-sales-may-have-changed'))
    setSellOpen(false)
  }

  // Auto Caster: fire cast again ~1.5s after a result when equipped and conditions allow
  useEffect(() => {
    if (equippedSpecial !== 'auto_caster' || !ownedAutoCaster) return
    if (phase !== 'result') return
    if (crateResult && cratePhase !== 'revealed') return
    const currentBaitQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    const currentHoldCount = inventory.reduce((s, i) => s + i.quantity, 0)
    if (currentBaitQty <= 0 || currentHoldCount >= holdCapacity) return
    const t = setTimeout(() => { handleCastAgain() }, 1500)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, equippedSpecial, ownedAutoCaster, cratePhase])

  async function handleCastAgain() {
    if (phase !== 'result') return
    if (finnPending) return
    // Same Finn intercept as handleCast. Bait isn't consumed during an
    // encounter, so the player can pass freely.
    if (!finnChallenge && !finnOverlay && Math.random() < FINN_ENCOUNTER_RATE) {
      setCastRippleKey(k => k + 1)
      setTimeout(() => setCastRippleKey(0), 1800)
      fireFinnEncounter()
      return
    }
    // cast SFX fires from the charFrame useEffect — same as handleCast.
    setCastRippleKey(k => k + 1)
    setTimeout(() => setCastRippleKey(0), 1800)
    setCatchResult(null)
    setMissResult(null)
    setCrateResult(null)
    setCratePhase('closed')
    setCrateRollDisplay(null)
    setHookedFish(null)
    setPerfectFlash(false)
    setLevelUpNotif(null)
    setHoldOpen(false)
    setGearOpen(false)
    await doCast()
  }

  function handleOpenCrate() {
    if (!crateResult || cratePhase !== 'closed') return
    const result = crateResult
    // Cosmetics (skin/hat/boat) skip the roll animation and reveal directly.
    if (result.type === 'skin' || result.type === 'hat' || result.type === 'boat') {
      setCratePhase('revealed')
      return
    }
    setCratePhase('rolling')

    const pool: Array<{ type: 'doubloons'; amount: number } | { type: 'bait'; baitType: string; baitName: string }> = [
      { type: 'doubloons', amount: 75 },
      { type: 'bait',      baitType: 'worm',            baitName: 'Worms' },
      { type: 'doubloons', amount: 350 },
      { type: 'bait',      baitType: 'night_crawler',   baitName: 'Night Crawler' },
      { type: 'doubloons', amount: 150 },
      { type: 'bait',      baitType: 'minnow',          baitName: 'Minnow' },
      { type: 'doubloons', amount: 500 },
      { type: 'bait',      baitType: 'chum',            baitName: 'Chum' },
      { type: 'doubloons', amount: 250 },
      { type: 'bait',      baitType: 'anglers_formula', baitName: "Angler's Formula" },
    ]
    const delays = [65, 65, 75, 95, 125, 165, 220, 300, 420, 600]
    let elapsed = 0
    delays.forEach((d, i) => {
      elapsed += d
      const isLast = i === delays.length - 1
      setTimeout(() => {
        if (isLast) {
          const final = result.type === 'doubloons'
            ? { type: 'doubloons' as const, amount: result.amount }
            : { type: 'bait' as const, baitType: result.baitType, baitName: result.baitName }
          setCrateRollDisplay(final)
          setCratePhase('revealed')
        } else {
          setCrateRollDisplay(pool[Math.floor(Math.random() * pool.length)])
        }
      }, elapsed)
    })
  }

  async function handleClaimCrate() {
    if (!crateResult) return
    const result = crateResult
    if (result.type === 'doubloons') {
      setDoubloons(prev => {
        const next = prev + result.amount
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: next }))
        return next
      })
    } else if (result.type === 'bait') {
      setBaitInventory(prev => {
        const existing = prev.find(b => b.bait_type === result.baitType)
        if (existing) return prev.map(b => b.bait_type === result.baitType ? { ...b, quantity: b.quantity + result.quantity } : b)
        return [...prev, { bait_type: result.baitType, quantity: result.quantity }]
      })
    } else if (result.type === 'hat') {
      setUnlockedHats(prev => prev.includes(result.hatId) ? prev : [...prev, result.hatId])
    } else if (result.type === 'boat') {
      setUnlockedBoats(prev => prev.includes(result.boatId) ? prev : [...prev, result.boatId])
    }
    setCratePhase('closed')
    setCrateRollDisplay(null)
    // Don't auto-cast after the player taps Claim — they should decide
    // when to fish next. Clearing crateResult drops the crate panel and
    // reveals the normal Cast Again button for them to tap manually.
    setCrateResult(null)
  }

  async function handleClaimDaily(index: 0 | 1 | 2) {
    if (claimingDaily !== null || dailyClaimed[index]) return
    setClaimingDaily(index)
    const res = await claimDailyReward(index)
    setClaimingDaily(null)
    if ('error' in res) {
      // If the server says it's already claimed, our local state is
      // stale (e.g. a previous tab claimed it, or a zone remount lost
      // the flag). Reconcile by marking it claimed locally so the
      // button disappears and the player isn't stuck staring at a
      // no-op Collect.
      if (res.error === 'Already claimed') {
        setDailyClaimed(prev => { const n = [...prev] as [boolean, boolean, boolean]; n[index] = true; return n })
      }
      return
    }
    setDailyClaimed(prev => { const n = [...prev] as [boolean, boolean, boolean]; n[index] = true; return n })
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
  }

  async function handleEquipRod(tier: number) {
    const result = await equipRod(tier)
    if (!('error' in result)) {
      setEquippedRodTier(tier)
      if (!ownedRods.includes(tier)) setOwnedRods(prev => [...prev, tier])
    }
  }

  async function handlePrestige(zone: string) {
    if (prestigingZone) return
    setPrestigingZone(zone)
    const result = await prestigeZone(zone)
    setPrestigingZone(null)
    if ('error' in result) { setConfirmPrestigeZone(null); return }
    if (result.unlockedSkinId) { setSkinUnlockToast(result.unlockedSkinId); setTimeout(() => setSkinUnlockToast(null), 6000) }
    const zoneIds = new Set(allFishSpecies.filter(f => f.habitat === zone).map(f => f.id))
    setCaughtFishIds(prev => { const next = new Set(prev); zoneIds.forEach(id => next.delete(id)); return next })
    setClaimedZones(prev => ({ ...prev, [zone]: false }))
    setPrestigeLevels(prev => ({ ...prev, [zone]: result.prestigeLevel }))
    setConfirmPrestigeZone(null)
    window.dispatchEvent(new Event('badges-may-have-changed'))
  }

  async function handleClaimZoneReward(zone: string) {
    if (claimingZone || claimedZones[zone]) return
    setClaimingZone(zone)
    const result = await claimZoneReward(zone)
    setClaimingZone(null)
    if ('error' in result) return
    setClaimedZones(prev => ({ ...prev, [zone]: true }))
    setDoubloons(result.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: result.doubloons }))
    setZoneClaimToast({ zone, earned: result.earned })
    setTimeout(() => setZoneClaimToast(null), 4000)
  }

  // Zone display helpers
  const catchingZones = hookedFish ? (() => {
    const base = buildFishZones(hookedFish.catchDifficulty, hookTier, line.penaltyMultiplier, (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).catchMultiplier, levelBonus + getBait(selectedBait).catchZoneBonus + rod.catchZoneBonus + (activeEvent?.type === 'glassy' ? 12 : 0), rod.perfectZoneBonus + 1)
    return selectedZone === 'ancient_deep' ? applyBossMods(base, activeBossMechanic, bossZoneShrink) : base
  })() : []
  // Mirror the latest zones + rotation so the needle rAF loop can detect
  // zone crossings without depending on per-frame React state.
  catchingZonesRef.current = catchingZones
  zoneRotationRef.current = zoneRotation
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
  const ancientSpecies   = allFishSpecies.filter(f => f.habitat === 'ancient_deep')
  const allAncientCaught = selectedZone === 'ancient_deep' && ancientSpecies.length > 0 && ancientSpecies.every(f => trophyCatches.has(f.id))
  const isFullMoon = activeEvent?.type === 'fullmoon'
  const holdTotalValue   = inventory.reduce((s, i) => s + Math.floor(i.fish_species.sell_value * (isFullMoon ? 1.0 : 0.65)) * i.quantity, 0)
  const holdBaseValue    = inventory.reduce((s, i) => s + i.fish_species.sell_value * i.quantity, 0)
  const liquidateFee     = isPremium ? 1.0 : 0.97
  const holdLiquidateValue = inventory.reduce((s, i) => {
    const mult = marketMultipliers[i.fish_id] ?? 1.0
    return s + Math.floor(i.fish_species.sell_value * mult * 0.90 * liquidateFee) * i.quantity
  }, 0)

  // Active bobbing — calm casting wait + hooked-fish struggle. The world
  // bob (painted scene shake) is gated to phase==='hooked' AND this flag.
  // Sprite decode must be done first or the bob would stutter as each
  // overlay finishes loading (drops frames during the first 3 cycles).
  const isActiveBobbing = spritesReady && charFrame === 'wait' && (phase === 'casting' || phase === 'hooked')
  // Ambient idle bob — gentle rise/fall on the boat+character even when
  // the player is just sitting on /fishing, so the scene reads as "on the
  // water" instead of frozen. Smaller amplitude + slower period than the
  // casting bob so it doesn't compete visually.
  const isIdleBobbing = spritesReady && charFrame === 'rest'

  const cp  = CHAR_POS[charFrame]
  const crc = CHAR_ROD_OVERLAY[charFrame]
  const chc = CHAR_HOOK_OVERLAY[charFrame]

  const hookedRarity = hookedFish?.biteRarity ?? 1
  const bgBobAnimate = isIdleBobbing
    ? { x: 0, y: [0, -4, 0] }
    : !isActiveBobbing
      ? { x: 0, y: 0 }
      : phase !== 'hooked'
        ? { x: 0, y: [0, -6, 0] }
        : hookedRarity >= 5 ? { x: [0, -8, 8, -6, 6, -3, 0], y: [0, 15, -4, 13, -1, 0] }
        : hookedRarity >= 4 ? { x: [0, -4, 4, -2, 0],         y: [0, 11, -1, 9, 0] }
        : hookedRarity >= 3 ? { x: 0,                          y: [0, 8, 0] }
        : hookedRarity >= 2 ? { x: 0,                          y: [0, 5, 0] }
        :                     { x: 0,                          y: [0, 3, 0] }
  const bgBobTransition = isIdleBobbing
    ? { duration: 3.4, repeat: Infinity, ease: 'easeInOut' as const }
    : !isActiveBobbing
      ? { duration: 0.12 }
      : phase !== 'hooked'
        ? { duration: 2.5, repeat: Infinity, ease: 'easeInOut' as const }
        : {
            duration: hookedRarity >= 5 ? 0.32 : hookedRarity >= 4 ? 0.40 : hookedRarity >= 3 ? 0.50 : hookedRarity >= 2 ? 0.60 : 0.72,
            repeat: Infinity, ease: 'easeInOut' as const,
          }

  // World bob — only fires during the hooked-fish struggle so the
  // painted scene shakes for that dramatic moment. Calm casting and
  // idle keep the world locked still while only the boat/character
  // bob (the boat rocking against a stable horizon reads more like
  // "on the water" than "the camera is shaking"). Reuses bgBobAnimate's
  // hooked-phase values when active.
  const worldBobAnimate    = phase === 'hooked' && isActiveBobbing ? bgBobAnimate    : { x: 0, y: 0 }
  const worldBobTransition = phase === 'hooked' && isActiveBobbing ? bgBobTransition : { duration: 0.12 }

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0" style={{ background: '#08121c', zIndex: 40, display: 'flex', justifyContent: 'center' }}>
      <div
        className={`relative w-full max-w-md overflow-hidden${(phase === 'catching' || phase === 'reeling') ? ' ambient-paused' : ''}`}
        style={{ height: '100%' }}
      >

        {/* Background soundtrack lives in lib/fishingMusic singleton —
            kept outside React's tree so unmount fade-out actually runs. */}

        {/* Audio toggles — two independent mutes: music (note icon) and
            SFX (speaker icon). Left edge, below the back-button row.
            Both set state synchronously inside the gesture so iOS PWA
            permits playback in the same call stack. Hidden while any panel
            (hold/sell/gear/bait/collection) is open so they don't float over it. */}
        {!(holdOpen || sellOpen || gearOpen || baitOpen || collectionOpen) && (
        <div style={{ position: 'absolute', bottom: 110, left: 10, zIndex: 60, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {([
            {
              key: 'music',
              muted: audioMuted,
              label: audioMuted ? 'Unmute music' : 'Mute music',
              toggle: () => { const n = !audioMuted; setFishingMusicMuted(n); setAudioMuted(n) },
              // music note — slashed when muted
              icon: audioMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                  <line x1="3" y1="2.5" x2="21" y2="21.5" />
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              ),
            },
            {
              key: 'sfx',
              muted: sfxMuted,
              label: sfxMuted ? 'Unmute sound effects' : 'Mute sound effects',
              toggle: () => { const n = !sfxMuted; setFishingSfxMuted(n); setSfxMutedState(n) },
              // speaker
              icon: sfxMuted ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <line x1="23" y1="9" x2="17" y2="15"/>
                  <line x1="17" y1="9" x2="23" y2="15"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
                </svg>
              ),
            },
          ] as const).map(t => (
            <button
              key={t.key}
              type="button"
              onClick={t.toggle}
              aria-label={t.label}
              style={{
                position: 'relative',
                width: 34, height: 34,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                // On = lit blue chip; muted = dark + dim + slashed icon, so the
                // state reads at a glance instead of relying on a faint opacity shift.
                background: t.muted ? 'rgba(8,18,28,0.62)' : 'rgba(96,165,250,0.22)',
                border: `1px solid ${t.muted ? 'rgba(255,255,255,0.14)' : 'rgba(96,165,250,0.6)'}`,
                borderRadius: '50%',
                color: t.muted ? 'rgba(240,237,232,0.4)' : '#cfe2ff',
                boxShadow: t.muted ? 'none' : '0 0 8px rgba(96,165,250,0.4)',
                cursor: 'pointer',
                padding: 0,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                transition: 'background 0.15s, border-color 0.15s, color 0.15s, box-shadow 0.15s',
              }}
            >
              {t.icon}
            </button>
          ))}
        </div>
        )}

        {/* Background — gated to worldBobAnimate so the painted scene
            stays still during calm casting (only the boat/character
            bob, matching how a real boat sits against a stable
            horizon) and shakes only during the hooked-fish struggle.
            willChange: 'transform' promotes this to its own GPU layer
            so the bobbing animation doesn't force the browser to
            re-rasterize a 1920x1080 image every frame on mobile. */}
        <motion.div
          animate={worldBobAnimate}
          transition={worldBobTransition}
          style={{ position: 'absolute', inset: '-14px', willChange: 'transform' }}
        >
          <img
            src={ZONE_BG[selectedZone] ?? '/shallows.jpg'}
            alt=""
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center' }}
          />
        </motion.div>

        {/* Ambient layers — clouds in the sky, mirrored cloud reflection
            on the water just below the horizon, and a slow shimmer that
            sweeps the rest of the water band. Each picks up the zone's
            time-of-day tint (sunset / night) via a variant modifier
            class. Sibling of the bg motion.div so cloud drift stays
            decoupled from the wave-bob. */}
        {(() => {
          const horizonPct = ZONE_HORIZON_PCT[selectedZone] ?? 0
          const variant    = ZONE_CLOUD_VARIANT[selectedZone] ?? 'none'
          if (variant === 'none') return null
          const tint =
            variant === 'sunset' ? '--sunset' :
            variant === 'night'  ? '--night'  : ''
          const cloudClass    = 'fishing-clouds-overlay'    + (tint ? ` fishing-clouds-overlay${tint}` : '')
          const reflectClass  = 'fishing-clouds-reflection' + (tint ? ` fishing-clouds-reflection${tint}` : '')
          const shimmerClass  = 'fishing-water-shimmer'     + (tint ? ` fishing-water-shimmer${tint}` : '')
          return (
            <>
              {horizonPct > 0 && (
                <>
                  <div aria-hidden className={cloudClass}   style={{ height: `${horizonPct}%` }} />
                  <div aria-hidden className={reflectClass} style={{ top: `${horizonPct}%`, height: '14%' }} />
                </>
              )}
              <div aria-hidden className={shimmerClass} style={{ top: `${horizonPct}%`, bottom: 0 }} />
            </>
          )
        })()}

        {/* Ancient Deep ambiance — the same drifting lavender motes + pulsing
            glow as the Ancient Deep profile background. Sibling of the scene
            layers (above the painted bg, below the character) so the motes
            rise behind the boat. Only the climax zone gets it. */}
        {selectedZone === 'ancient_deep' && <AncientBgEffect />}

        {/* Character + rod + hook overlay — all 3 frames always in DOM so
            sprites are pre-decoded. willChange + transform: translateZ(0)
            forces a stable compositing layer on mobile; the drop-shadow
            that used to live here was applying a per-frame blur to the
            entire compositied set of children (character + hat + boat +
            rod + reel + hook + badges), which is the most expensive
            filter operation on mobile GPUs. Moved to the character img
            individually below so we only blur the character silhouette.
            pause-glows freezes the rod + hook glow CSS animations during
            the dial / reel phase so the GPU has spare budget for the
            needle on mobile (see .pause-glows in globals.css). */}
        <motion.div
          animate={bgBobAnimate}
          transition={bgBobTransition}
          className={(phase === 'catching' || phase === 'reeling') ? 'pause-glows' : undefined}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', willChange: 'transform' }}
        >
          {(() => { const dialActive = phase === 'catching' || phase === 'reeling'; return (Object.keys(charSrc) as CharFrame[]).map(f => {
            const p   = CHAR_POS[f]
            const rc  = CHAR_ROD_OVERLAY[f]
            const rec = CHAR_REEL_OVERLAY[f]
            const hc  = CHAR_HOOK_OVERLAY[f]
            const visible = f === charFrame
            return (
              <div key={f} style={{
                position: 'absolute',
                bottom: `${p.bottom}%`,
                left: `${p.left}%`,
                width: `${p.width}%`,
                // Character sprite is 900×800. Lock the container's aspect
                // ratio so the boat/rod overlays (positioned via top: X%) have
                // a stable reference height *before* the sprite finishes
                // decoding — otherwise they collapse to the container bottom
                // and visibly jump up once the image lands.
                aspectRatio: '900 / 800',
                // Hidden-pose hiding strategy depends on phase:
                //  - During the dial (catching/reeling) the needle animates
                //    every frame; we want the fewest composited layers, so
                //    hidden poses use visibility:hidden (dropped from the
                //    compositor entirely).
                //  - During the bob phases (idle/cast/wait) poses transition
                //    constantly, and visibility:hidden defers bitmap decode
                //    until first shown → a 1-frame flicker per transition.
                //    opacity:0 keeps them decoded so transitions stay clean.
                ...(visible
                  ? null
                  : dialActive
                    ? { visibility: 'hidden' as const }
                    : { opacity: 0 }),
                pointerEvents: visible ? 'auto' : 'none',
              }}>
                <img src={charSrc[f]} alt="" style={{ width: '100%', display: 'block', filter: 'drop-shadow(0 8px 14px rgba(0,15,35,0.6))' }} />
                {hatDef && (() => {
                  const hp = hatDef.positions[f]
                  const hatSrc = f === 'cast' ? hatDef.castImageUrl : hatDef.restImageUrl
                  return (
                    <img src={hatSrc} alt="" style={{
                      position: 'absolute', top: `${hp.top}%`, left: `${hp.left}%`,
                      width: `${hp.width}%`,
                      transform: `rotate(${hp.rotate}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }} />
                  )
                })()}
                {boatDef && (() => {
                  const bp = boatDef.positions[f]
                  const src = f === 'cast' ? boatDef.castImageUrl : boatDef.restImageUrl
                  // iOS subpixel rounding through the motion.div + drop-shadow filter
                  // nudges the rest-frame boat overlay 1px to the right in production
                  // compared to fishing-test. Compensate with a translateX(-2px).
                  const restPxOffset = f === 'rest' ? ' translateX(-2px)' : ''
                  return (
                    <div style={{
                      position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                      width: `${bp.width}%`,
                      transform: `rotate(${bp.rotate}deg)${restPxOffset}`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }}>
                      <img
                        src={src}
                        alt=""
                        className={boatGlowClass(boatDef)}
                        style={{ width: '100%', display: 'block' }}
                      />
                    </div>
                  )
                })()}
                {/* Rod — 3-pose sliced sprites (slug-based). Each rod's
                    source sheet is split by web/slice-rod.mjs into raw
                    quadrants, and the artist places the handle at the same
                    x,y in every sheet, so CHAR_ROD_OVERLAY applies uniformly
                    to every rod. Legacy single-sprite path kept for rods
                    without 3-pose art (none currently). maxWidth: 'none'
                    overrides Tailwind's preflight which would otherwise cap
                    the rod img at 100% of its parent. */}
                {rod.slug ? (
                  <img
                    src={`/${rod.slug}_${f}.png`}
                    alt=""
                    className={rodGlowClass(rod)}
                    style={{
                      position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                      width: `${rc.width}%`,
                      transform: `rotate(${rc.rotate}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                      maxWidth: 'none',
                      ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                    } as React.CSSProperties}
                  />
                ) : rod.imageUrl && (
                  <img src={rod.imageUrl} alt="" className={rodGlowClass(rod)} style={{
                    position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                    width: `${rc.width}%`,
                    transform: `rotate(${rc.rotate}deg)`,
                    transformOrigin: 'bottom right',
                    pointerEvents: 'none',
                    ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                  } as React.CSSProperties} />
                )}
                {/* Reel — sits on the rod handle. Same per-frame coords
                    work for every reel tier because all 9 source images
                    are uploaded raw at 1920×1080 with the reel core at
                    the same x,y. maxWidth: 'none' overrides Tailwind's
                    preflight cap so width can scale past 100%. */}
                {reel.imageUrl && (
                  <img src={reel.imageUrl} alt="" style={{
                    position: 'absolute', top: `${rec.top}%`, left: `${rec.left}%`,
                    width: `${rec.width}%`,
                    transform: `rotate(${rec.rotate}deg)`,
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                  }} />
                )}
                {/* Hook — raw 1920x1080 sprite at CHAR_HOOK_OVERLAY coords.
                    Same coords work for every hook tier; wait frame is
                    hidden (hook is in the water during the bite).
                    maxWidth: 'none' bypasses Tailwind preflight cap so the
                    >100% width values actually render. */}
                {hook.imageUrl && !hc.hidden && (
                  <img src={hook.imageUrl} alt="" className={hookGlowClass(hook)} style={{
                    position: 'absolute', top: `${hc.top}%`, left: `${hc.left}%`,
                    width: `${hc.width}%`,
                    transform: `rotate(${hc.rotate}deg)`,
                    transformOrigin: 'center center',
                    pointerEvents: 'none',
                    maxWidth: 'none',
                    ...(hook.glow ? { ['--rod-glow-color' as string]: hook.color } : {}),
                  } as React.CSSProperties} />
                )}
                {localEquippedBadges.map((badgeId, slot) => {
                  if (!badgeId) return null
                  const badge = BADGE_MAP[badgeId]
                  if (!badge) return null
                  const bp = BADGE_SLOT_POSITIONS[slot]?.[f]
                  if (!bp) return null
                  return (
                    <img key={slot} src={badge.imageUrl} alt="" style={{
                      position: 'absolute', top: `${bp.top}%`, left: `${bp.left}%`,
                      width: `${bp.width}%`,
                      transform: `rotate(${bp.rotate}deg)`,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                    }} />
                  )
                })}
              </div>
            )
          }) })()}
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

        {/* Event overlay — atmospheric tint + particles */}
        <AnimatePresence>
          {activeEvent && (() => {
            const def = EVENT_DEFS[activeEvent.type]
            return (
              <motion.div
                key={activeEvent.type}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 2 }}
                style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}
              >
                <div style={{ position: 'absolute', inset: 0, background: def.tint, mixBlendMode: 'screen' }} />
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: 0, background: def.tint, mixBlendMode: 'screen' }}
                />
                <EventParticles color={def.color} />
              </motion.div>
            )
          })()}
        </AnimatePresence>

        {/* UI content — fills full height as flex column */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', paddingBottom: '1.25rem' }}>

          {/* Header row — back button left, gear button right */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={onBack}
              className="font-karla font-600 uppercase tracking-[0.1em]"
              style={{
                display: 'inline-flex', alignItems: 'center',
                height: 26, padding: '0 0.7rem', borderRadius: 20,
                fontSize: '0.55rem', color: HABITAT_COLOR[selectedZone],
                background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                cursor: 'pointer', touchAction: 'manipulation',
              }}
            >
              ← {HABITAT_LABEL[selectedZone]}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {/* Leaderboard — subtle HUD-matching pill so it blends with
                  the zone-tinted header instead of the bold default. */}
              <LeaderboardModal
                boards={['perfectStreak', 'fishingLevel']}
                title="Fishing Leaderboard"
                label="Ranks"
                triggerStyle={{
                  background: 'rgba(4,10,18,0.72)',
                  border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                  color: HABITAT_COLOR[selectedZone],
                  boxShadow: 'none',
                  fontSize: '0.5rem',
                  height: 26,
                  padding: '0 0.6rem',
                  borderRadius: 20,
                  letterSpacing: '0.1em',
                  gap: 4,
                }}
              />

              {/* Daily challenge icon */}
              {(() => {
                const claimable = dailyChallenges.some((c, i) => dailyProgress[i] >= c.target && !dailyClaimed[i])
                const allClaimed = dailyClaimed.every(Boolean)
                return (
                  <button
                    onClick={() => setDailyOpen(o => !o)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      height: 26, padding: '0 0.6rem', borderRadius: 20,
                      background: dailyOpen ? 'rgba(240,192,64,0.12)' : 'rgba(4,10,18,0.72)',
                      border: `1px solid ${claimable ? 'rgba(240,192,64,0.55)' : dailyOpen ? 'rgba(240,192,64,0.3)' : 'rgba(255,255,255,0.12)'}`,
                      cursor: 'pointer', touchAction: 'manipulation',
                      position: 'relative',
                    }}
                  >
                    <span className="font-karla font-600 uppercase tracking-[0.1em]"
                      style={{ fontSize: '0.5rem', color: claimable ? '#f0c040' : allClaimed ? '#4ade80' : '#c8c4bc', lineHeight: 1 }}>
                      Daily
                    </span>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {dailyChallenges.map((c, i) => (
                        <div key={i} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: dailyClaimed[i] ? '#4ade80' : dailyProgress[i] >= c.target ? '#f0c040' : 'rgba(255,255,255,0.28)',
                        }} />
                      ))}
                    </div>
                    {claimable && (
                      <span style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 8, height: 8, borderRadius: '50%',
                        background: '#f0c040', border: '1.5px solid #08121c',
                      }} />
                    )}
                  </button>
                )
              })()}

              <button
                onClick={() => { setCollectionOpen(o => !o); setGearOpen(false); setHoldOpen(false) }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  height: 26, padding: '0 0.6rem', borderRadius: 20,
                  background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                  cursor: 'pointer', touchAction: 'manipulation',
                  position: 'relative',
                }}
              >
                <span className="font-karla font-600 uppercase tracking-[0.1em]"
                  style={{ fontSize: '0.5rem', color: HABITAT_COLOR[selectedZone] + 'dd', lineHeight: 1 }}>
                  Fish
                </span>
                <span className="font-cinzel font-700"
                  style={{ fontSize: '0.8rem', color: HABITAT_COLOR[selectedZone], lineHeight: 1 }}>
                  {caughtFishIds.size}
                  <span className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.5)' }}>
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
                      fontSize: '0.8rem',
                      color: xpPopup.prestige ? '#c084fc' : '#4ade80',
                      pointerEvents: 'none',
                      textShadow: xpPopup.prestige ? '0 0 10px rgba(192,132,252,0.8)' : '0 0 10px rgba(74,222,128,0.7)',
                    }}
                  >
                    +{xpPopup.value} XP{xpPopup.prestige ? ' ✦' : ''}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {/* Special item action — chip docked under the XP bar.
               Only renders when an equipped special has an activatable action
               available in the current phase. */}
            <AnimatePresence>
              {equippedSpecial === 'tide_turner' && tideTurnerSkipsLeft > 0 && phase === 'catching' && (
                <motion.button
                  key="tide-turner-action"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.18 }}
                  onClick={handleTideTurnerSkip}
                  className="font-karla font-700"
                  style={{
                    marginTop: '0.4rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'rgba(14,8,28,0.85)',
                    border: '1px solid rgba(167,139,250,0.5)',
                    borderRadius: 999,
                    padding: '0.32rem 0.8rem',
                    color: '#c4b5fd',
                    fontSize: '0.64rem',
                    cursor: 'pointer',
                    letterSpacing: '0.05em',
                    boxShadow: '0 2px 10px rgba(139,111,192,0.28)',
                  }}
                >
                  <span style={{ textTransform: 'uppercase', color: 'rgba(196,181,253,0.7)', fontSize: '0.52rem', letterSpacing: '0.12em' }}>Tide Turner</span>
                  <span style={{ color: '#e9e4ff' }}>Skip</span>
                  <span style={{ opacity: 0.7 }}>· {tideTurnerSkipsLeft} left</span>
                </motion.button>
              )}
            </AnimatePresence>
          </div>


          {/* Active Finn challenge chip — sits directly below the XP bar
              so the player can glance up and see where they are in the
              bet. Amber palette to keep the rival vibe light. */}
          {finnChallenge && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, marginBottom: '0.4rem',
              padding: '0.32rem 0.78rem',
              background: 'linear-gradient(180deg, rgba(200,168,80,0.18) 0%, rgba(200,168,80,0.05) 100%), #14100a',
              border: '1px solid rgba(200,168,80,0.42)',
              borderTop: '1px solid rgba(200,168,80,0.70)',
              borderRadius: 999,
              boxShadow: '0 0 14px rgba(200,168,80,0.18)',
            }}>
              <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: '#d8b878', letterSpacing: '0.16em' }}>
                Finn&apos;s Bet
              </span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: '#f0d8a0' }}>
                {finnChallenge.type === 'perfect_streak'
                  ? `${finnChallenge.perfectsHit ?? 0} / ${finnChallenge.perfectsTarget} perfects`
                  : `${finnChallenge.fishCaught ?? 0} / ${finnChallenge.fishTarget} fish`}
              </span>
              {finnChallenge.type === 'speed_catch' && (
                <SpeedClock endsAt={finnChallenge.speedEndsAt ?? 0} />
              )}
            </div>
          )}

          {/* Active event indicator — below XP bar, reserved height prevents layout shift */}
          <div style={{ minHeight: 28, marginBottom: '0.3rem' }}>
            <AnimatePresence>
              {activeEvent && (() => {
                const def = EVENT_DEFS[activeEvent.type]
                return (
                  <motion.div
                    key={activeEvent.type}
                    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.4 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      background: 'rgba(4,10,18,0.82)', border: `1px solid ${def.color}50`,
                      borderRadius: 20, padding: '0.3rem 0.65rem',
                    }}
                  >
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{ width: 5, height: 5, borderRadius: '50%', background: def.color, boxShadow: `0 0 6px ${def.color}`, flexShrink: 0 }}
                    />
                    <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: def.color, letterSpacing: '0.04em' }}>
                      {def.name}
                    </span>
                    <span className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.72)' }}>
                      · {def.tagline}
                    </span>
                  </motion.div>
                )
              })()}
            </AnimatePresence>
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

          {/* Phase content — grows to fill available space. Relative so
              the separate hooked-banner AnimatePresence below can absolutely
              overlay the same area without affecting the main phase flow.
              minHeight:0 + overflowY:auto is required: flex:1 items default to
              min-height:auto and can't shrink below their content's intrinsic
              size, so a tall ResultCard (long fun-fact, ancient banner, pills
              stack) would expand this div and push the action button row + the
              4 bottom tiles down behind the MobileTabBar. With these two, the
              card scrolls inside its slot and the siblings stay locked. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
            <AnimatePresence mode="wait">

              {/* ── IDLE / CASTING ── */}
              {(phase === 'idle' || phase === 'casting') && (
                <motion.div key="pre-cast"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

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

                  </div>

                </motion.div>
              )}

              {/* HOOKED banner lives in its own AnimatePresence below — it
                  used to share this one, but the catching transition was
                  reconciling against the exiting hooked child and producing
                  a one-frame ghost re-render of the bite text a few pixels
                  above its original position. Separating them entirely is
                  the reliable fix. */}

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
                          {retryFlash ? 'Second Wind!' : (phase === 'reeling' && bossStageCleared) ? `Stage ${bossStage - 1}/3 — Hold On!` : phase === 'reeling' ? 'Reeling in…' : (currentZone?.label ?? '')}
                        </p>
                      </div>
                    )}
                    {/* Boss stage progress dots */}
                    {selectedZone === 'ancient_deep' && phase === 'catching' && bossStage > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                        <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#c084fc99' }}>Stage</p>
                        {[1,2,3].map(s => (
                          <div key={s} style={{
                            width: 8, height: 8, borderRadius: '50%',
                            background: s < bossStage ? '#c084fc' : s === bossStage ? '#c084fc' : 'rgba(192,132,252,0.2)',
                            boxShadow: s <= bossStage ? '0 0 6px #c084fcaa' : 'none',
                            border: s === bossStage ? '1px solid #c084fc' : '1px solid rgba(192,132,252,0.3)',
                          }} />
                        ))}
                        <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#c084fc99' }}>{bossStage}/3</p>
                      </div>
                    )}
                  </div>

                  <div style={{ position: 'relative' }}>
                    <div style={{
                      position: 'absolute', zIndex: 10, borderRadius: '50%',
                      width: '87.27%', aspectRatio: '1',
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      background: '#000',
                      opacity: blackoutOpacity,
                      pointerEvents: 'none',
                      transition: blackoutOpacity > 0 ? 'opacity 0.25s ease-in' : 'opacity 0.6s ease-out',
                    }} />
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
                    <DialSVG zones={catchingZones} angle={angleRef.current} rotation={zoneRotation}
                      needleRef={needleGroupRef}
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

                  {crateResult ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                      style={{
                        background: 'rgba(6,14,22,0.96)',
                        border: `1px solid ${cratePhase === 'revealed' ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 20,
                        padding: '1.4rem 1.25rem 1.1rem',
                        boxShadow: cratePhase === 'revealed' ? '0 0 50px rgba(251,191,36,0.18), 0 0 120px rgba(251,191,36,0.08)' : 'none',
                        textAlign: 'center',
                      }}
                    >
                      {/* Crate image */}
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.9rem' }}>
                        <motion.img
                          src={(() => {
                            const tier = hookedFish?.crateTier ?? 'wooden'
                            const state = cratePhase === 'revealed' ? 'open' : 'closed'
                            return tier === 'wooden' ? `/crate${state}.png` : `/${tier}crate${state}.png`
                          })()}
                          alt="crate"
                          animate={cratePhase === 'rolling'
                            ? { rotate: [-5, 5, -4, 4, -3, 3, 0], scale: [1, 1.05, 1] }
                            : cratePhase === 'revealed'
                            ? { scale: [0.85, 1.1, 1] }
                            : {}
                          }
                          transition={cratePhase === 'rolling'
                            ? { duration: 0.3, repeat: Infinity, ease: 'easeInOut' }
                            : cratePhase === 'revealed'
                            ? { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }
                            : {}
                          }
                          style={{ height: 96, objectFit: 'contain', cursor: cratePhase === 'closed' ? 'pointer' : 'default' }}
                          onClick={cratePhase === 'closed' ? handleOpenCrate : undefined}
                        />
                      </div>

                      {/* Closed: label + tap button */}
                      {cratePhase === 'closed' && (() => {
                        // Show the actual crate tier so the player knows
                        // what they hooked at a glance, not just "a crate".
                        const tier = hookedFish?.crateTier ?? 'wooden'
                        const tierName = tier === 'wooden' ? 'Wooden Crate'
                                       : tier === 'metal'  ? 'Metal Crate'
                                       : tier === 'gold'   ? 'Gold Crate'
                                       :                     'Diamond Crate'
                        return (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                          <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.42)', letterSpacing: '0.18em', marginBottom: 3 }}>
                            You reeled up a
                          </p>
                          <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0ede8', marginBottom: '0.7rem', textShadow: '0 0 12px rgba(251,191,36,0.35)' }}>
                            {tierName}
                          </p>
                          <motion.button
                            onClick={handleOpenCrate}
                            whileTap={{ scale: 0.96 }}
                            animate={{ boxShadow: ['0 0 0px rgba(251,191,36,0)', '0 0 18px rgba(251,191,36,0.45)', '0 0 0px rgba(251,191,36,0)'] }}
                            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                            className="font-karla font-700 uppercase tracking-[0.14em]"
                            style={{
                              width: '100%', padding: '0.65rem 0',
                              borderRadius: 12,
                              background: 'linear-gradient(135deg, rgba(217,119,6,0.4), rgba(251,191,36,0.18))',
                              border: '1px solid rgba(251,191,36,0.5)',
                              color: '#fbbf24',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                            }}
                          >
                            Open Crate
                          </motion.button>
                        </motion.div>
                        )
                      })()}

                      {/* Rolling: slot ticker */}
                      {cratePhase === 'rolling' && (
                        <div style={{ minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                          <AnimatePresence mode="wait">
                            {crateRollDisplay && (
                              <motion.div
                                key={crateRollDisplay.type === 'doubloons' ? `d-${crateRollDisplay.amount}` : `b-${crateRollDisplay.baitType}`}
                                initial={{ opacity: 0, y: -14 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 14 }}
                                transition={{ duration: 0.06 }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                              >
                                <img
                                  src={crateRollDisplay.type === 'doubloons' ? '/smallpile.png' : (getBait(crateRollDisplay.baitType).imageUrl ?? '/worms.png')}
                                  style={{ height: 36, width: 36, objectFit: 'contain' }}
                                />
                                <p className="font-cinzel font-700" style={{
                                  fontSize: '1.05rem',
                                  color: crateRollDisplay.type === 'doubloons' ? '#fbbf24' : '#86efac',
                                  lineHeight: 1,
                                }}>
                                  {crateRollDisplay.type === 'doubloons'
                                    ? `${crateRollDisplay.amount.toLocaleString()} ⟡`
                                    : crateRollDisplay.baitName}
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )}

                      {/* Revealed: reward + claim */}
                      {cratePhase === 'revealed' && crateResult && (
                        <motion.div
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.3, delay: 0.1 }}
                        >
                          {crateResult.type === 'skin' ? (
                            <div style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
                              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#4ade8099', marginBottom: 6 }}>Rare Drop!</p>
                              <motion.div
                                initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
                                style={{
                                  width: 72, height: 72, borderRadius: 12, overflow: 'hidden',
                                  backgroundImage: `url(/fishing_${crateResult.skinId}_rest.png)`,
                                  backgroundSize: '420% auto', backgroundPosition: '60% 68%',
                                  backgroundRepeat: 'no-repeat', margin: '0 auto 8px',
                                  border: '2px solid rgba(74,222,128,0.4)',
                                  boxShadow: '0 0 20px rgba(74,222,128,0.25)',
                                }}
                              />
                              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#4ade80', textShadow: '0 0 20px rgba(74,222,128,0.5)', lineHeight: 1 }}>
                                {crateResult.skinName} Skin
                              </p>
                              <p className="font-karla" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>New character color unlocked</p>
                            </div>
                          ) : crateResult.type === 'hat' || crateResult.type === 'boat' ? (
                            <div style={{ textAlign: 'center', marginBottom: '0.9rem' }}>
                              <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.5rem', color: '#4ade8099', marginBottom: 6 }}>Rare Drop!</p>
                              <motion.img
                                src={crateResult.type === 'hat' ? crateResult.hatImageUrl : crateResult.boatImageUrl}
                                alt=""
                                initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 380, damping: 18, delay: 0.1 }}
                                style={{
                                  width: 72, height: 72, objectFit: 'contain',
                                  margin: '0 auto 8px', display: 'block',
                                  filter: 'drop-shadow(0 0 18px rgba(74,222,128,0.4))',
                                }}
                              />
                              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#4ade80', textShadow: '0 0 20px rgba(74,222,128,0.5)', lineHeight: 1 }}>
                                {crateResult.type === 'hat' ? `${crateResult.hatName} Bandana` : `${crateResult.boatName} Boat`}
                              </p>
                              <p className="font-karla" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                                {crateResult.type === 'hat' ? 'New bandana color unlocked' : 'New boat color unlocked'}
                              </p>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: '0.9rem' }}>
                              <motion.img
                                src={crateResult.type === 'doubloons' ? '/smallpile.png' : (getBait(crateResult.baitType).imageUrl ?? '/worms.png')}
                                initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.15 }}
                                style={{ height: 48, width: 48, objectFit: 'contain' }}
                              />
                              <div style={{ textAlign: 'left' }}>
                                <p className="font-cinzel font-700" style={{
                                  fontSize: '1.55rem',
                                  color: crateResult.type === 'doubloons' ? '#fbbf24' : '#86efac',
                                  textShadow: crateResult.type === 'doubloons' ? '0 0 28px rgba(251,191,36,0.55)' : '0 0 22px rgba(134,239,172,0.5)',
                                  lineHeight: 1,
                                }}>
                                  {crateResult.type === 'doubloons'
                                    ? `+${crateResult.amount.toLocaleString()} ⟡`
                                    : `×${crateResult.quantity}`}
                                </p>
                                <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                                  {crateResult.type === 'doubloons' ? 'Doubloons' : crateResult.baitName}
                                </p>
                              </div>
                            </div>
                          )}
                          {(() => {
                            const isCosmetic = crateResult.type === 'skin' || crateResult.type === 'hat' || crateResult.type === 'boat'
                            const isDoubloons = crateResult.type === 'doubloons'
                            const bg = isCosmetic
                              ? 'linear-gradient(135deg, rgba(20,83,45,0.5), rgba(74,222,128,0.18))'
                              : isDoubloons
                              ? 'linear-gradient(135deg, rgba(217,119,6,0.45), rgba(251,191,36,0.2))'
                              : 'linear-gradient(135deg, rgba(20,83,45,0.5), rgba(134,239,172,0.18))'
                            const border = isCosmetic ? 'rgba(74,222,128,0.45)' : isDoubloons ? 'rgba(251,191,36,0.5)' : 'rgba(134,239,172,0.45)'
                            const color = isCosmetic ? '#4ade80' : isDoubloons ? '#fbbf24' : '#86efac'
                            const glow = isCosmetic ? '0 0 18px rgba(74,222,128,0.2)' : isDoubloons ? '0 0 20px rgba(251,191,36,0.22)' : '0 0 18px rgba(134,239,172,0.18)'
                            return (
                              <motion.button
                                onClick={handleClaimCrate}
                                whileTap={{ scale: 0.97 }}
                                className="font-karla font-700 uppercase tracking-[0.14em]"
                                style={{
                                  width: '100%', padding: '0.65rem 0',
                                  borderRadius: 12,
                                  background: bg,
                                  border: `1px solid ${border}`,
                                  color,
                                  fontSize: '0.72rem',
                                  cursor: 'pointer',
                                  boxShadow: glow,
                                }}
                              >
                                Claim
                              </motion.button>
                            )
                          })()}
                        </motion.div>
                      )}
                    </motion.div>
                  ) : catchResult ? (
                    <ResultCard fish={catchResult.fish} baitSaved={catchResult.baitSaved} isNewSpecies={catchResult.isNewSpecies} isPerfect={catchResult.isPerfect} xpGained={catchResult.xpGained} doubleCatch={catchResult.doubleCatch} gemEarned={catchResult.gemEarned} perfectStreak={catchResult.perfectStreak} streakBonusXP={catchResult.streakBonusXP} jackpotMultiplier={catchResult.jackpotMultiplier} ancientCount={trophyCatches.size} ancientTotal={allFishSpecies.filter(f => f.habitat === 'ancient_deep').length || 6} />
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

            {/* HOOKED banner — its OWN AnimatePresence, absolutely overlaid
                so its enter/exit is fully independent of the catching
                transition. Was producing a ghost re-render of the bite text
                when it shared an AP with the catching child (the parent's
                reconciliation flashed the exiting hooked back on for one
                frame, a few pixels offset). */}
            <AnimatePresence>
              {phase === 'hooked' && hookedFish && (() => {
                const r = RARITY[hookedFish.biteRarity] ?? RARITY[1]
                const isLegendary = hookedFish.biteRarity === 5
                const isEpicPlus  = hookedFish.biteRarity >= 4
                const isCrate = hookedFish.fishId === CRATE_FISH_ID
                const isBoss = selectedZone === 'ancient_deep'
                const bossName = isBoss ? (allFishSpecies.find(f => f.id === hookedFish.fishId)?.name ?? 'Ancient Creature') : null

                if (isCrate) return (
                  <motion.div key={`hooked-${hookedFish.fishId}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div
                      style={{
                        position: 'relative',
                        background: 'rgba(4,10,18,0.52)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 20,
                        padding: '1.1rem 1.75rem',
                        textAlign: 'center',
                      }}
                    >
                      <p className="font-karla font-400" style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.65)' }}>
                        Something heavy... and square?
                      </p>
                      <div style={{
                        position: 'absolute', bottom: -7, left: '50%',
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: 12, height: 12,
                        background: 'rgba(4,10,18,0.52)',
                        borderRight: '1px solid rgba(255,255,255,0.12)',
                        borderBottom: '1px solid rgba(255,255,255,0.12)',
                      }} />
                    </div>
                  </motion.div>
                )

                if (isBoss && bossName) return (
                  <motion.div key={`hooked-${hookedFish.fishId}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.2 }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 1rem', pointerEvents: 'none' }}>
                    <motion.div
                      initial={{ scale: 0.92, y: 8 }} animate={{ scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                      style={{
                        width: '100%',
                        background: 'rgba(20,4,4,0.92)',
                        border: '1px solid #ef444466',
                        borderLeft: '3px solid #ef4444',
                        borderRadius: 14,
                        padding: '1rem 1.1rem',
                        boxShadow: '0 0 40px rgba(239,68,68,0.25), inset 0 0 30px rgba(239,68,68,0.04)',
                      }}
                    >
                      {/* Warning header */}
                      <motion.div
                        animate={{ opacity: [1, 0.5, 1] }}
                        transition={{ duration: 0.6, repeat: Infinity, ease: 'easeInOut' }}
                        className="flex items-center gap-2"
                        style={{ marginBottom: '0.6rem' }}
                      >
                        <span style={{ fontSize: '0.75rem' }}>⚠</span>
                        <p className="font-karla font-700 uppercase tracking-[0.2em]" style={{ fontSize: '0.58rem', color: '#ef4444', letterSpacing: '0.2em' }}>
                          Ancient Encounter Detected
                        </p>
                        <span style={{ fontSize: '0.75rem' }}>⚠</span>
                      </motion.div>

                      {/* Boss name */}
                      <motion.p
                        className="font-cinzel font-700"
                        animate={{ textShadow: ['0 0 20px rgba(239,68,68,0.6)', '0 0 35px rgba(239,68,68,0.9)', '0 0 20px rgba(239,68,68,0.6)'] }}
                        transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                        style={{ fontSize: '1.5rem', color: '#fca5a5', letterSpacing: '0.05em', marginBottom: '0.5rem', lineHeight: 1 }}
                      >
                        {bossName}
                      </motion.p>

                      {/* Divider */}
                      <div style={{ height: 1, background: 'linear-gradient(90deg, #ef444444, #ef444422, transparent)', marginBottom: '0.5rem' }} />

                      {/* 3-stage warning */}
                      <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
                        <div className="flex gap-1">
                          {[1,2,3].map(s => (
                            <div key={s} style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444' }} />
                          ))}
                        </div>
                        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#fca5a5' }}>
                          3 stages required
                        </p>
                      </div>
                      <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(252,165,165,0.55)', lineHeight: 1.4 }}>
                        Miss once and it escapes. Stay sharp.
                      </p>
                    </motion.div>
                  </motion.div>
                )

                return (
                  <motion.div key={`hooked-${hookedFish.fishId}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    transition={{ duration: 0.15 }}
                    style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                    <div
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
                      {isEpicPlus ? (
                        <motion.p
                          className="font-karla font-700"
                          animate={isLegendary
                            ? { scale: [1, 1.04, 1], opacity: [1, 0.82, 1] }
                            : { opacity: [1, 0.85, 1] }
                          }
                          transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
                          style={{
                            fontSize: isLegendary ? '1.1rem' : '1rem',
                            color: r.color,
                            textShadow: `0 0 20px ${r.color}80`,
                            letterSpacing: isLegendary ? '0.04em' : 'normal',
                          }}
                        >
                          {r.hookedText}
                        </motion.p>
                      ) : (
                        <p
                          className="font-karla font-700"
                          style={{
                            fontSize: '0.95rem',
                            color: r.color,
                            textShadow: `0 0 20px ${r.color}80`,
                          }}
                        >
                          {r.hookedText}
                        </p>
                      )}
                      <div style={{
                        position: 'absolute', bottom: -7, left: '50%',
                        transform: 'translateX(-50%) rotate(45deg)',
                        width: 12, height: 12,
                        background: 'rgba(4,10,18,0.52)',
                        borderRight: `1px solid ${r.color}40`,
                        borderBottom: `1px solid ${r.color}40`,
                      }} />
                    </div>
                  </motion.div>
                )
              })()}
            </AnimatePresence>
          </div>

          {/* ── Action button — same position every phase ── */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', paddingTop: '0.5rem', paddingBottom: '0.75rem' }}>
            {/* No AnimatePresence wrapper here on purpose. mode="wait" could get
                stuck during the catch → reeling → result transition and leave
                this area EMPTY — hiding the Cast / Cast Again button even with
                bait and hold space (the recurring "no cast button" report).
                Plain conditionals always render the correct button; the motion
                children still play their enter animation on mount. */}
            <>
              {(phase === 'idle' || phase === 'result') && holdTotalCount >= holdCapacity && selectedZone !== 'ancient_deep' && (
                <motion.div key="holdfull"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-center">
                  <p className="font-karla font-700 mb-1" style={{ fontSize: '0.78rem', color: '#f87171' }}>
                    Hold is full
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5, marginBottom: 8 }}>
                    Sell your catch below<br />to keep fishing
                  </p>
                  {/* Open the Fish Hold drawer (where the upgrade button lives)
                      instead of routing to the shipyard — hold capacity is
                      now upgraded directly from the fishing page. */}
                  <button
                    type="button"
                    onClick={() => { setHoldOpen(true); setGearOpen(false); setBaitOpen(false); setSellOpen(false) }}
                    className="font-karla font-700"
                    style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(96,165,250,0.4)', paddingBottom: 1 }}
                  >
                    Upgrade your hold for more storage ↑
                  </button>
                </motion.div>
              )}
              {(phase === 'idle' || phase === 'result') && allAncientCaught && (
                <motion.div key="all-ancient-caught"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="text-center"
                  style={{
                    padding: '0.85rem 1rem',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(50,8,18,0.92) 0%, rgba(20,6,8,0.96) 70%, rgba(40,18,4,0.92) 100%)',
                    border: '1px solid rgba(225,29,72,0.45)',
                    boxShadow: '0 0 26px rgba(225,29,72,0.22)',
                    maxWidth: 280,
                  }}
                >
                  <p className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.26em', color: '#fde68a', marginBottom: 4 }}>
                    The deep is silent
                  </p>
                  <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#fee2e2', lineHeight: 1.2, marginBottom: 6, textShadow: '0 0 12px rgba(225,29,72,0.45)' }}>
                    All Ancient Ones revealed
                  </p>
                  <p className="font-karla font-300" style={{ fontSize: '0.62rem', color: 'rgba(254,226,226,0.7)', lineHeight: 1.5 }}>
                    There is nothing more to catch here.
                  </p>
                </motion.div>
              )}
              {phase === 'idle' && !allAncientCaught && (selectedZone === 'ancient_deep' || holdTotalCount < holdCapacity) && hasBait && selectedBaitQty > 0 && (
                <motion.button key="cast"
                  // pointerdown rather than onClick — fires on tap-start
                  // (~50–100 ms earlier than click on touch devices), so
                  // the cast SFX lands in sync with the player's tap
                  // instead of trailing it. Mirrors the Reel In button.
                  onPointerDown={(e) => { e.preventDefault(); handleCast() }}
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
              {phase === 'idle' && !allAncientCaught && holdTotalCount < holdCapacity && (!hasBait || selectedBaitQty <= 0) && (
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
              {phase === 'result' && !allAncientCaught && (selectedZone === 'ancient_deep' || holdTotalCount < holdCapacity) && (!crateResult || cratePhase === 'revealed' || !!catchResult || !!missResult) && (
                <motion.button key="again"
                  onPointerDown={(e) => { e.preventDefault(); handleCastAgain() }}
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
            </>
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

            const tile: React.CSSProperties = {
              flex: 1, height: 60, borderRadius: 20,
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center',
              gap: 3, padding: '0 0.75rem', minWidth: 0,
              cursor: 'pointer', touchAction: 'manipulation', transition: 'all 0.15s',
            }

            return (
              <div style={{ display: 'flex', gap: '0.45rem', paddingTop: '0.75rem' }}>

                {/* Gear — circle thumbnail with pencil edit overlay */}
                <button
                  onClick={() => { setGearOpen(o => !o); setHoldOpen(false); setBaitOpen(false); setSellOpen(false) }}
                  style={{
                    ...tile,
                    flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '0 0.5rem',
                    background: gearOpen ? 'rgba(240,192,64,0.10)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${gearOpen ? 'rgba(240,192,64,0.32)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                    <div style={{
                      width: '100%', height: '100%', borderRadius: '50%',
                      backgroundImage: 'url(/fishing_rest.png)',
                      backgroundSize: '220% auto',
                      backgroundPosition: 'center 88%',
                      backgroundRepeat: 'no-repeat',
                      border: '1px solid rgba(255,255,255,0.18)',
                    }} />
                    {/* Pencil edit overlay (top-left) */}
                    <div style={{
                      position: 'absolute', top: -4, left: -4,
                      width: 16, height: 16, borderRadius: '50%',
                      background: '#f0c040',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                      pointerEvents: 'none',
                    }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#1a1410" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>
                      </svg>
                    </div>
                    {/* Shop affordance — pulses when any rod/reel/hook upgrade is in budget */}
                    {anyShopAffordable && !gearOpen && (
                      <div style={{
                        position: 'absolute', top: -4, right: -4,
                        width: 14, height: 14, borderRadius: '50%',
                        background: '#4ade80',
                        border: '2px solid rgba(4,10,18,1)',
                        boxShadow: '0 0 6px rgba(74,222,128,0.7)',
                        animation: 'shop-pulse 1.6s ease-in-out infinite',
                        pointerEvents: 'none',
                      }} />
                    )}
                  </div>
                </button>

                {/* Bait — image + readable count */}
                <button
                  onClick={() => { setBaitOpen(o => !o); setGearOpen(false); setHoldOpen(false); setSellOpen(false) }}
                  style={{
                    ...tile,
                    flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '0 0.5rem',
                    background: baitOpen ? `${baitAccent}10` : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${baitOpen ? baitAccent + '38' : outOfBait ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  {selectedBaitDef?.imageUrl ? (
                    <img src={selectedBaitDef.imageUrl} alt={selectedBaitDef.name} style={{
                      width: 36, height: 36, objectFit: 'contain', flexShrink: 0,
                      filter: outOfBait ? 'grayscale(1) brightness(0.45)' : `drop-shadow(0 2px 6px ${baitAccent}55)`,
                    }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: baitAccent + '33', border: `1px solid ${baitAccent}66`, flexShrink: 0 }} />
                  )}
                  <p className="font-cinzel font-700" style={{
                    fontSize: '1.05rem', lineHeight: 1,
                    color: outOfBait ? '#f87171' : '#f0ede8',
                  }}>
                    {outOfBait ? '0' : `×${selectedBaitQty.toLocaleString()}`}
                  </p>
                </button>

                {/* Hold — fish icon + count */}
                <button
                  onClick={() => { setHoldOpen(o => !o); setGearOpen(false); setBaitOpen(false); setSellOpen(false) }}
                  style={{
                    ...tile,
                    flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '0 0.5rem',
                    background: holdOpen
                      ? `${holdAccent}10`
                      : holdFull ? 'rgba(248,113,113,0.06)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${holdOpen
                      ? holdAccent + '45'
                      : holdFull ? 'rgba(248,113,113,0.35)' : holdCritical ? 'rgba(251,146,60,0.28)' : holdWarning ? 'rgba(251,191,36,0.20)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  <img src="/crateclosed.png" alt="" style={{
                    width: 36, height: 36, objectFit: 'contain', flexShrink: 0,
                    filter: holdTotalCount > 0 ? undefined : 'grayscale(1) brightness(0.5)',
                  }} />
                  <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', lineHeight: 1, color: holdTotalCount > 0 ? holdAccent : '#3a3835' }}>
                    {holdTotalCount}<span className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.3)' }}>/{holdCapacity}</span>
                  </p>
                </button>

                {/* Sell — coin icon + value */}
                <button
                  onClick={() => { setSellOpen(o => !o); setHoldOpen(false); setGearOpen(false); setBaitOpen(false) }}
                  style={{
                    ...tile,
                    flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 6, padding: '0 0.5rem',
                    background: sellOpen ? 'rgba(240,192,64,0.08)' : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${sellOpen ? 'rgba(240,192,64,0.28)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  <span className="font-cinzel font-700" style={{
                    width: 36, fontSize: '1.7rem', lineHeight: 1,
                    color: holdTotalValue > 0 ? '#f0c040' : '#3a3835',
                    textAlign: 'center', flexShrink: 0,
                  }}>⟡</span>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, lineHeight: 1 }}>
                    <span className="font-karla font-700 uppercase" style={{
                      fontSize: '0.52rem',
                      letterSpacing: '0.18em',
                      color: holdTotalValue > 0 ? '#f0c040' : '#8a8784',
                      lineHeight: 1,
                    }}>Sell</span>
                    <p className="font-cinzel font-700" style={{ fontSize: '0.78rem', lineHeight: 1, color: holdTotalValue > 0 ? '#f0c040' : '#3a3835', whiteSpace: 'nowrap' }}>
                      {holdTotalValue > 0 ? holdTotalValue.toLocaleString() : '—'}
                    </p>
                  </div>
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
                  style={{ fontSize: '0.98rem', color: CATCH_TOUR_STEPS[catchTourStep].color }}>
                  {CATCH_TOUR_STEPS[catchTourStep].title}
                </p>
              </div>
              <p className="font-karla font-400 mb-3"
                style={{ fontSize: '0.92rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.55 }}>
                {CATCH_TOUR_STEPS[catchTourStep].body}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#5a5856' }}>
                  {catchTourStep + 1} / {CATCH_TOUR_STEPS.length}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); advanceCatchTour() }}
                  className="font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    fontSize: '0.74rem', cursor: 'pointer', touchAction: 'manipulation',
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
        {tourStep !== null && !collectionOpen && !gearOpen && !baitOpen && !holdOpen && !sellOpen && (
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
                style={{ fontSize: '0.95rem', color: HABITAT_COLOR[selectedZone] }}>
                {TOUR_STEPS[tourStep].title}
              </p>
              <p className="font-karla font-400 mb-3"
                style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>
                {TOUR_STEPS[tourStep].body}
              </p>
              <div className="flex items-center justify-between">
                <p className="font-karla font-600" style={{ fontSize: '0.68rem', color: '#5a5856' }}>
                  {tourStep + 1} / {TOUR_STEPS.length}
                </p>
                <button
                  onClick={e => { e.stopPropagation(); advanceTour() }}
                  className="font-karla font-700 uppercase tracking-[0.12em]"
                  style={{
                    fontSize: '0.74rem', cursor: 'pointer', touchAction: 'manipulation',
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
        {skinUnlockToast && (() => {
          const skinColor = getCharSrc(skinUnlockToast)
          const SKIN_NAMES: Record<string, string> = { default: 'Green', gray: 'Gray', blue: 'Blue', pink: 'Pink', sand: 'Sand', sky: 'Sky', golden: 'Golden', forest: 'Forest', mint: 'Mint' }
          const skinName = SKIN_NAMES[skinUnlockToast] ?? skinUnlockToast
          return (
            <motion.div key="skin-unlock-toast"
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(3,8,16,0.82)', backdropFilter: 'blur(6px)',
              }}
              onClick={() => setSkinUnlockToast(null)}
            >
              <div style={{
                background: 'linear-gradient(145deg, rgba(6,16,26,0.98) 0%, rgba(20,83,45,0.25) 100%)',
                border: '1px solid rgba(74,222,128,0.35)',
                borderTop: '3px solid rgba(74,222,128,0.7)',
                borderRadius: 20, padding: '2rem 2.5rem',
                textAlign: 'center', maxWidth: 280,
                boxShadow: '0 0 60px rgba(74,222,128,0.18), 0 0 120px rgba(74,222,128,0.08)',
              }}>
                <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: 'rgba(74,222,128,0.7)', marginBottom: '0.75rem' }}>
                  Skin Unlocked
                </p>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                  style={{
                    width: 96, height: 96, borderRadius: 16, overflow: 'hidden', margin: '0 auto 1rem',
                    backgroundImage: `url(${skinColor.rest})`,
                    backgroundSize: '420% auto', backgroundPosition: '60% 68%',
                    backgroundRepeat: 'no-repeat',
                    border: '2px solid rgba(74,222,128,0.4)',
                    boxShadow: '0 0 24px rgba(74,222,128,0.3)',
                  }}
                />
                <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#4ade80', textShadow: '0 0 24px rgba(74,222,128,0.6)', marginBottom: '0.3rem', lineHeight: 1.1 }}>
                  {skinName}
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem' }}>
                  New character color available
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.2)' }}>Tap anywhere to close</p>
              </div>
            </motion.div>
          )
        })()}

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
            {...drawerDragProps(() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) })}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            <DrawerHandle />
            {/* Sticky header */}
            <div className="flex items-center justify-between flex-shrink-0"
              style={{ padding: '1.25rem 1.1rem 0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.82rem', color: '#6a6764' }}>Fish Collection</p>
              <DrawerClose onClick={() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) }} />
            </div>

            {/* Scrollable body */}
            <div style={{ overflowY: 'auto', padding: '0 1.1rem 2rem', overscrollBehavior: 'contain' }}>
            {ZONES.filter(z => z !== 'ancient_deep').map(zone => {
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
                        <div className="flex items-center gap-2">
                          <p className="font-karla font-700 uppercase tracking-[0.14em]"
                            style={{ fontSize: '0.85rem', color: zoneColor, lineHeight: 1 }}>{HABITAT_LABEL[zone]}</p>
                          {(prestigeLevels[zone] ?? 0) > 0 && (
                            <div style={{ display: 'flex', gap: 3 }}>
                              {Array.from({ length: prestigeLevels[zone] }).map((_, i) => (
                                <svg key={i} width="11" height="11" viewBox="0 0 24 24" fill={zoneColor} style={{ filter: `drop-shadow(0 0 4px ${zoneColor}cc)`, flexShrink: 0 }}>
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                              ))}
                            </div>
                          )}
                        </div>
                        <p className="font-karla font-400"
                          style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{HABITAT_TAGLINE[zone]}</p>
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
                          style={{ fontSize: '0.68rem', color: isClaimed ? zoneColor + '99' : 'rgba(240,192,64,0.65)' }}>
                          {isClaimed ? '✓ reward claimed' : `${zoneRewardDoubloons(zone, prestigeLevels[zone] ?? 0).toLocaleString()} ⟡ on completion`}
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
                        {isClaiming ? '…' : `${zoneRewardDoubloons(zone, prestigeLevels[zone] ?? 0).toLocaleString()} ⟡`}
                      </p>
                    </motion.button>
                  )}
                  {isComplete && isClaimed && (
                    <div style={{
                      background: `linear-gradient(to bottom, ${zoneColor}14, ${zoneColor}08)`,
                      border: `1px solid ${zoneColor}40`,
                      borderTop: 'none',
                      borderRadius: '0 0 12px 12px',
                      padding: '0.7rem 0.9rem 0.8rem',
                    }}>
                      {confirmPrestigeZone === zone ? (
                        <div>
                          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: zoneColor, marginBottom: '0.3rem' }}>
                            Are you sure?
                          </p>
                          <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.55rem', lineHeight: 1.4 }}>
                            Your {HABITAT_LABEL[zone]} catch log resets, but you&apos;ll permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every catch here. You can complete the collection again for another full reward.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setConfirmPrestigeZone(null)}
                              className="font-karla font-600 uppercase tracking-[0.1em]"
                              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', padding: '0.3rem 0.7rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7 }}
                            >Cancel</button>
                            <button
                              onClick={() => handlePrestige(zone)}
                              disabled={prestigingZone === zone}
                              className="font-karla font-700 uppercase tracking-[0.1em]"
                              style={{ fontSize: '0.62rem', color: '#fff', padding: '0.3rem 0.9rem', background: zoneColor + 'cc', border: `1px solid ${zoneColor}`, borderRadius: 7, boxShadow: `0 0 10px ${zoneColor}66` }}
                            >{prestigingZone === zone ? '…' : 'Yes, Prestige!'}</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-1.5" style={{ marginBottom: '0.25rem' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill={zoneColor} style={{ filter: `drop-shadow(0 0 5px ${zoneColor})`, flexShrink: 0 }}>
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.65rem', color: zoneColor }}>
                              Prestige {(prestigeLevels[zone] ?? 0) + 1} Available
                            </p>
                          </div>
                          <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.65)', marginBottom: '0.55rem', lineHeight: 1.35 }}>
                            Reset your collection and permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every {HABITAT_LABEL[zone]} catch — forever.
                          </p>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmPrestigeZone(zone) }}
                            className="font-karla font-700 uppercase tracking-[0.12em] w-full"
                            style={{
                              fontSize: '0.68rem',
                              color: '#fff',
                              padding: '0.42rem 1rem',
                              background: `linear-gradient(135deg, ${zoneColor}aa, ${zoneColor}66)`,
                              border: `1px solid ${zoneColor}88`,
                              borderRadius: 8,
                              boxShadow: `0 0 14px ${zoneColor}44, inset 0 1px 0 rgba(255,255,255,0.1)`,
                            }}
                          >★ Prestige {(prestigeLevels[zone] ?? 0) + 1}</button>
                        </div>
                      )}
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
                                    style={{ fontSize: '0.82rem', color: rarityColor + 'cc' }}>{f.scientific_name}</p>
                                  <p className="font-karla font-400 mb-3"
                                    style={{ fontSize: '0.88rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>
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

            {/* Ancient Deep trophy zone */}
            {(() => {
              const zone = 'ancient_deep'
              const zoneColor = HABITAT_COLOR[zone]
              const bossSpecies = allFishSpecies.filter(f => f.habitat === zone)
              const caughtCount = bossSpecies.filter(f => trophyCatches.has(f.id)).length
              const isExpanded = expandedZone === zone
              const isLocked = getLevelFromXP(fishingXP) < 75
              return (
                <div key={zone} style={{ marginBottom: '0.6rem' }}>
                  <button
                    className="w-full text-left"
                    style={{
                      background: `linear-gradient(135deg, rgba(6,6,20,0.97) 0%, ${zoneColor}16 100%)`,
                      border: `1px solid ${zoneColor}40`,
                      borderLeft: `3px solid ${zoneColor}cc`,
                      borderRadius: isExpanded && !isLocked ? '12px 12px 0 0' : 12,
                      padding: '0.75rem 0.9rem 0.65rem',
                      cursor: 'pointer',
                    }}
                    onClick={() => !isLocked && setExpandedZone(isExpanded ? null : zone)}
                  >
                    <div className="flex items-center justify-between" style={{ marginBottom: '0.4rem' }}>
                      <div>
                        <p className="font-karla font-700 uppercase tracking-[0.14em]"
                          style={{ fontSize: '0.85rem', color: zoneColor, lineHeight: 1 }}>
                          {isLocked ? '🔒 ' : ''}Ancient Deep
                        </p>
                        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                          {isLocked ? 'Unlocks at Fishing Level 75' : 'Before time. Beyond depth.'}
                        </p>
                      </div>
                      <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: isLocked ? 'rgba(255,255,255,0.2)' : (caughtCount === bossSpecies.length && bossSpecies.length > 0 ? zoneColor : 'rgba(255,255,255,0.5)') }}>
                        {isLocked ? '—' : <>{caughtCount}<span style={{ color: 'rgba(255,255,255,0.25)' }}>/{bossSpecies.length}</span></>}
                      </p>
                    </div>
                    {!isLocked && (
                      <p className="font-karla font-500" style={{ fontSize: '0.65rem', color: `${zoneColor}88`, letterSpacing: '0.06em' }}>
                        Ancient trophies
                      </p>
                    )}
                  </button>
                  {isExpanded && !isLocked && (
                    <div style={{
                      background: `${zoneColor}08`, border: `1px solid ${zoneColor}22`,
                      borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.5rem 0.6rem 0.6rem',
                    }}>
                      {bossSpecies.map(f => {
                        const caught = trophyCatches.has(f.id)
                        return (
                          <div key={f.id} style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '0.45rem 0.5rem', borderRadius: 8, marginBottom: 2,
                            background: caught ? `${zoneColor}14` : 'rgba(255,255,255,0.02)',
                          }}>
                            <div style={{
                              width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                              background: caught ? `${zoneColor}30` : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${caught ? zoneColor + '60' : 'rgba(255,255,255,0.08)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem',
                            }}>
                              {caught ? '🏆' : <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.15)' }}>—</span>}
                            </div>
                            <div>
                              <p className="font-karla font-700" style={{ fontSize: '0.78rem', color: caught ? '#f0ede8' : 'rgba(255,255,255,0.2)', lineHeight: 1.2 }}>
                                {caught ? f.name : '??? Undiscovered'}
                              </p>
                              {caught && <p className="font-karla font-400" style={{ fontSize: '0.6rem', color: `${zoneColor}99`, fontStyle: 'italic' }}>{f.scientific_name}</p>}
                            </div>
                            {caught && (
                              <div style={{ marginLeft: 'auto' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill={zoneColor} style={{ filter: `drop-shadow(0 0 4px ${zoneColor})` }}>
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}
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
            {...drawerDragProps(() => setGearOpen(false))}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '82vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <DrawerHandle />
            <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Gear &amp; Shop</p>
              <DrawerClose onClick={() => setGearOpen(false)} />
            </div>
            <GearScreen
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelectBait={setSelectedBait}
              equippedRodTier={equippedRodTier}
              ownedRods={ownedRods}
              onEquipRod={handleEquipRod}
              rodHasAffordable={rodHasAffordable}
              reelHasAffordable={reelHasAffordable}
              hookHasAffordable={hookHasAffordable}
              onBuyRod={async (tier) => {
                const res = await purchaseRod(tier)
                if ('error' in res) return
                setOwnedRods(res.ownedRods)
                setDoubloons(res.doubloons)
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                await handleEquipRod(tier)
              }}
              reelTier={reelTier}
              onBuyReel={async () => {
                const res = await buyReel()
                if ('error' in res) return
                setReelTier(res.reelTier)
                setDoubloons(res.doubloons)
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
              }}
              hookTier={hookTier}
              onBuyHook={async () => {
                const res = await buyHook()
                if ('error' in res) return
                setHookTier(res.hookTier)
                setDoubloons(res.doubloons)
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
              }}
              lineTier={lineTier}
              characterColor={localCharacterColor}
              charSrc={charSrc}
              equippedBadges={localEquippedBadges}
              unlockedCharacterColors={unlockedCharacterColors}
              unlockedBadges={unlockedBadges}
              onUpdateColor={async (colorId) => {
                setLocalCharacterColor(colorId)
                await updateCharacterColor(colorId)
              }}
              onEquipBadge={async (id, slot) => {
                const currentSlots = localEquippedBadges.slice()
                while (currentSlots.length < 3) currentSlots.push('')
                const alreadyIdx = currentSlots.indexOf(id)
                if (slot !== undefined) {
                  if (currentSlots[slot] === id) {
                    const newSlots = currentSlots.map((b, i) => i === slot ? '' : b)
                    setLocalEquippedBadges(newSlots)
                    await unequipBadge(slot)
                  } else {
                    const newSlots = currentSlots.map((b, i) => {
                      if (i === slot) return id
                      if (b === id) return ''
                      return b
                    })
                    setLocalEquippedBadges(newSlots)
                    await equipBadge(id, slot)
                  }
                } else if (alreadyIdx >= 0) {
                  const newSlots = currentSlots.map((b, i) => i === alreadyIdx ? '' : b)
                  setLocalEquippedBadges(newSlots)
                  await unequipBadge(alreadyIdx as 0 | 1 | 2)
                } else {
                  const emptySlot = currentSlots.findIndex(b => !b)
                  const targetSlot = (emptySlot >= 0 ? emptySlot : 0) as 0 | 1 | 2
                  const newSlots = currentSlots.map((b, i) => i === targetSlot ? id : b)
                  setLocalEquippedBadges(newSlots)
                  await equipBadge(id, targetSlot)
                }
              }}
              doubloons={doubloons}
              equippedBoat={equippedBoat}
              unlockedBoats={unlockedBoats}
              onEquipBoat={async (id) => {
                setEquippedBoat(id)
                onBoatStateChange?.(id, unlockedBoats)
                await equipBoat(id)
              }}
              onBuyBoat={async (id) => {
                const res = await buyBoat(id)
                if ('ok' in res) {
                  const newUnlocked = unlockedBoats.includes(id) ? unlockedBoats : [...unlockedBoats, id]
                  setUnlockedBoats(newUnlocked)
                  setEquippedBoat(id)
                  onBoatStateChange?.(id, newUnlocked)
                  setDoubloons(res.doubloons)
                  window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                }
              }}
              equippedHat={equippedHat}
              unlockedHats={unlockedHats}
              onEquipHat={async (id) => {
                setEquippedHat(id)
                onHatStateChange?.(id, unlockedHats)
                await equipHat(id)
              }}
              onBuyHat={async (id) => {
                const res = await buyHat(id)
                if ('ok' in res) {
                  const newUnlocked = unlockedHats.includes(id) ? unlockedHats : [...unlockedHats, id]
                  setUnlockedHats(newUnlocked)
                  setEquippedHat(id)
                  onHatStateChange?.(id, newUnlocked)
                  setDoubloons(res.doubloons)
                  window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                }
              }}
              hasTideTurner={hasTideTurner}
              tideTurnerSkipsLeft={tideTurnerSkipsLeft}
              hasPhantomHook={hasPhantomHook}
              hasAutoCaster={ownedAutoCaster}
              fishingLevel={fishingLevel}
              equippedSpecial={equippedSpecial}
              onEquipSpecial={async (itemId) => {
                setEquippedSpecial(itemId)
                await equipSpecialItem(itemId)
              }}
              onBuySpecialItem={async (itemId) => {
                const res = await buySpecialItem(itemId)
                if ('ok' in res) {
                  if (itemId === 'auto_caster') {
                    setOwnedAutoCaster(true)
                    setDoubloons(d => {
                      const next = d - 5000
                      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: next }))
                      return next
                    })
                  }
                }
              }}
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
            {...drawerDragProps(() => setBaitOpen(false))}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <DrawerHandle />
            <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Bait</p>
              <DrawerClose onClick={() => setBaitOpen(false)} />
            </div>
            <BaitSelector
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelect={(type) => { setSelectedBait(type); setBaitOpen(false) }}
            />
            {/* Quick-buy worms */}
            {(() => {
              const canAfford = doubloons >= 200
              return (
                <button
                  disabled={buyingWorms || !canAfford}
                  onClick={async () => {
                    setBuyingWorms(true)
                    setWormBuyMsg(null)
                    const res = await quickBuyWorms()
                    if ('error' in res) {
                      setWormBuyMsg(res.error)
                    } else {
                      setBaitInventory(prev =>
                        prev.some(b => b.bait_type === 'worm')
                          ? prev.map(b => b.bait_type === 'worm' ? { ...b, quantity: b.quantity + res.qty } : b)
                          : [...prev, { bait_type: 'worm', quantity: res.qty }]
                      )
                      setDoubloons(res.doubloons)
                      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                      setWormBuyMsg('+10 worms')
                    }
                    setBuyingWorms(false)
                    setTimeout(() => setWormBuyMsg(null), 2000)
                  }}
                  className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-3 w-full"
                  style={{
                    background: canAfford ? 'rgba(160,120,80,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${canAfford ? 'rgba(160,120,80,0.28)' : 'rgba(255,255,255,0.07)'}`,
                    cursor: canAfford && !buyingWorms ? 'pointer' : 'not-allowed',
                    opacity: buyingWorms ? 0.6 : 1,
                  }}
                >
                  <div style={{ textAlign: 'left' }}>
                    <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: canAfford ? '#d4a96a' : 'rgba(255,255,255,0.25)' }}>
                      Quick-buy Worms
                    </span>
                    <span className="font-karla font-400" style={{ fontSize: '0.58rem', color: canAfford ? 'rgba(212,169,106,0.55)' : 'rgba(255,255,255,0.15)', marginLeft: 6 }}>
                      ×10 · 2× price
                    </span>
                  </div>
                  <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: wormBuyMsg ? (wormBuyMsg.startsWith('+') ? '#4ade80' : '#f87171') : (canAfford ? '#d4a96a' : '#f0c040') }}>
                    {wormBuyMsg ?? '200 ⟡'}
                  </span>
                </button>
              )
            })()}
            <Link href="/marketplace/tackle-shop#bait" onClick={() => setBaitOpen(false)}
              className="flex items-center justify-between px-3 py-2.5 rounded-xl mt-2"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', textDecoration: 'none' }}>
              <span className="font-karla font-700" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)' }}>Buy more bait</span>
              <span className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#5a5956' }}>Tackle Shop ↗</span>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Daily challenge drawer ── */}
      <AnimatePresence>
        {dailyOpen && (
          <motion.div key="daily-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            {...drawerDragProps(() => setDailyOpen(false))}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '75vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <DrawerHandle />
            <div className="flex items-start justify-between mb-4" style={{ paddingTop: '0.75rem' }}>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.20em]"
                  style={{ fontSize: '0.6rem', color: '#7a9bc4', marginBottom: 4 }}>Captain&rsquo;s Log</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1.1, marginBottom: 4 }}>
                  Daily Challenges
                </p>
                <DailyResetCountdown />
              </div>
              <DrawerClose onClick={() => setDailyOpen(false)} />
            </div>

            <div className="flex flex-col gap-2.5">
              {dailyChallenges.map((challenge: DailyChallenge, i) => {
                const progress = dailyProgress[i]
                const claimed = dailyClaimed[i]
                const done = progress >= challenge.target
                const isClaiming = claimingDaily === i
                const pct = Math.min(progress / challenge.target, 1)
                // Difficulty palette: easy/medium/hard — accent stays color-coded
                // until claimed, then everything shifts to a muted "done" tone.
                const accent    = i === 0 ? '#60a5fa' : i === 1 ? '#f0c040' : '#f87171'
                const accentRgb = i === 0 ? '96,165,250' : i === 1 ? '240,192,64' : '248,113,113'
                const tier      = i === 0 ? 'Easy' : i === 1 ? 'Medium' : 'Hard'
                // Gradient + top-accent chrome matches the rest of the new UI.
                // Three visual states: in-progress (subtle), ready-to-claim (glow),
                // claimed (muted slate).
                const bg = claimed
                  ? 'linear-gradient(180deg, rgba(120,130,160,0.10) 0%, rgba(120,130,160,0.02) 100%), #0a0e16'
                  : done
                    ? `linear-gradient(180deg, rgba(${accentRgb},0.22) 0%, rgba(${accentRgb},0.06) 100%), #0d1320`
                    : `linear-gradient(180deg, rgba(${accentRgb},0.10) 0%, rgba(${accentRgb},0.02) 100%), #06101c`
                const borderColor    = claimed ? 'rgba(120,130,160,0.22)' : done ? `rgba(${accentRgb},0.50)` : `rgba(${accentRgb},0.28)`
                const borderTopColor = claimed ? 'rgba(120,130,160,0.38)' : done ? `rgba(${accentRgb},0.80)` : `rgba(${accentRgb},0.52)`
                const glow           = done && !claimed ? `0 0 18px rgba(${accentRgb},0.28)` : 'none'

                return (
                  <div key={i} style={{
                    background: bg,
                    border: `1px solid ${borderColor}`,
                    borderTop: `1px solid ${borderTopColor}`,
                    borderRadius: 12,
                    padding: '0.85rem 0.95rem',
                    boxShadow: glow,
                    transition: 'box-shadow 0.25s ease',
                  }}>
                    {/* Top row — difficulty tag + reward */}
                    <div className="flex items-center justify-between mb-2" style={{ gap: 10 }}>
                      <div className="flex items-center" style={{ gap: 7 }}>
                        <span className="font-karla font-700 uppercase"
                          style={{
                            fontSize: '0.54rem',
                            color: claimed ? '#7a8090' : accent,
                            letterSpacing: '0.20em',
                            padding: '0.2rem 0.5rem',
                            background: claimed ? 'rgba(120,130,160,0.10)' : `rgba(${accentRgb},0.12)`,
                            border: `1px solid ${claimed ? 'rgba(120,130,160,0.28)' : `rgba(${accentRgb},0.36)`}`,
                            borderRadius: 999,
                          }}>
                          {tier}
                        </span>
                        {claimed && (
                          <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: '#86efac', letterSpacing: '0.16em' }}>
                            ✓ Claimed
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <span className="font-cinzel font-700" style={{
                          fontSize: done && !claimed ? '1.1rem' : '0.9rem',
                          color: claimed ? '#7a8090' : '#f0c040',
                          textShadow: done && !claimed ? '0 0 12px rgba(240,192,64,0.4)' : 'none',
                          lineHeight: 1,
                          transition: 'font-size 0.2s ease',
                        }}>
                          +{challenge.reward.toLocaleString()}
                        </span>
                        <span className="font-cinzel font-700" style={{ fontSize: '0.7rem', color: claimed ? '#7a8090' : '#f0c040', lineHeight: 1 }}>⟡</span>
                      </div>
                    </div>

                    {/* Challenge label */}
                    <p className="font-karla font-600"
                      style={{
                        fontSize: '0.88rem',
                        color: claimed ? '#9a9890' : done ? '#f0ede8' : '#c8c4bc',
                        lineHeight: 1.35,
                        marginBottom: '0.55rem',
                      }}>
                      {challenge.label}
                    </p>

                    {/* Progress bar + count */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: done && !claimed ? '0.7rem' : 0 }}>
                      <div style={{
                        flex: 1, height: 5, background: 'rgba(255,255,255,0.08)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <motion.div
                          animate={{ width: `${pct * 100}%` }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          style={{
                            height: '100%', borderRadius: 3,
                            background: claimed
                              ? 'rgba(120,130,160,0.45)'
                              : done
                                ? accent
                                : `linear-gradient(90deg, ${accent}88, ${accent})`,
                            boxShadow: done && !claimed ? `0 0 8px ${accent}88` : 'none',
                          }}
                        />
                      </div>
                      <span className="font-karla font-700 tabular-nums" style={{
                        fontSize: '0.66rem',
                        color: claimed ? '#7a8090' : done ? accent : '#9a9488',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}>
                        {progress.toLocaleString()} / {challenge.target.toLocaleString()}
                      </span>
                    </div>

                    {/* Claim button — only shows when done & unclaimed */}
                    {done && !claimed && (
                      <motion.button
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={() => handleClaimDaily(i as 0 | 1 | 2)}
                        disabled={isClaiming}
                        className="font-karla font-700 uppercase tracking-[0.1em] w-full"
                        style={{
                          fontSize: '0.78rem', padding: '0.6rem', borderRadius: 10,
                          background: 'rgba(240,192,64,0.16)',
                          border: '1px solid rgba(240,192,64,0.5)',
                          color: '#f0c040',
                          opacity: isClaiming ? 0.5 : 1,
                          cursor: isClaiming ? 'default' : 'pointer',
                        }}
                      >
                        {isClaiming ? 'Claiming…' : `Claim ${challenge.reward.toLocaleString()} ⟡`}
                      </motion.button>
                    )}
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sell panel ── */}
      <AnimatePresence>
        {sellOpen && (
          <motion.div key="sell-panel"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            {...drawerDragProps(() => setSellOpen(false))}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
            }}
          >
            <DrawerHandle />
            <div className="flex items-center justify-between mb-5" style={{ paddingTop: '0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Sell</p>
              <DrawerClose onClick={() => setSellOpen(false)} />
            </div>

            {inventory.length === 0 ? (
              <p className="font-karla font-300 text-center py-6" style={{ fontSize: '0.8rem', color: '#4a4845' }}>
                Nothing to sell yet.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {/* Fish Market */}
                <Link href="/tavern/market" onClick={() => setSellOpen(false)} style={{ textDecoration: 'none' }}>
                  <div style={{
                    background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.3)',
                    borderRadius: 16, padding: '1rem 1.1rem',
                    boxShadow: '0 0 20px rgba(56,189,248,0.06)',
                  }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: '#38bdf8' }}>Fish Market</p>
                      <span style={{ fontSize: '0.85rem', color: '#38bdf8' }}>→</span>
                    </div>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0ede8', lineHeight: 1 }}>
                      {holdBaseValue.toLocaleString()} ⟡
                    </p>
                    <p className="font-karla font-400 mt-1.5" style={{ fontSize: '0.68rem', color: '#38bdf8aa' }}>
                      Est. market price · live prices update hourly
                    </p>
                  </div>
                </Link>

                {/* Market Liquidate */}
                <div style={{
                  background: 'rgba(240,192,64,0.06)', border: '1px solid rgba(240,192,64,0.28)',
                  borderRadius: 16, padding: '1rem 1.1rem',
                }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: '#f0c040' }}>Market Liquidate</p>
                    <span className="font-karla font-600" style={{ fontSize: '0.55rem', color: '#bda05a', letterSpacing: '0.1em', padding: '0.15rem 0.45rem', borderRadius: 999, background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.25)' }}>1h delay</span>
                  </div>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f0c040', lineHeight: 1 }}>
                    {holdLiquidateValue.toLocaleString()} ⟡
                  </p>
                  <p className="font-karla font-400 mt-1.5" style={{ fontSize: '0.68rem', color: '#bda05a', lineHeight: 1.4 }}>
                    90% of current market value{isPremium ? '' : ' · 3% fee'} · price locked at sale, settles in 1h
                  </p>
                  {!liquidateConfirm ? (
                    <button
                      onClick={() => setLiquidateConfirm(true)}
                      disabled={liquidating || inventory.length === 0}
                      className="font-karla font-600 uppercase tracking-[0.1em] w-full"
                      style={{
                        fontSize: '0.65rem', padding: '0.65rem', borderRadius: 10, marginTop: 12,
                        background: 'rgba(240,192,64,0.14)',
                        border: '1px solid rgba(240,192,64,0.45)',
                        color: '#f0c040', opacity: liquidating ? 0.5 : 1,
                        cursor: liquidating ? 'default' : 'pointer',
                      }}
                    >
                      Liquidate at Market
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                      <button
                        onClick={() => setLiquidateConfirm(false)}
                        disabled={liquidating}
                        className="font-karla font-600 uppercase tracking-[0.1em]"
                        style={{
                          flex: 1, fontSize: '0.62rem', padding: '0.6rem', borderRadius: 10,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#a0a09a', cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleLiquidate}
                        disabled={liquidating}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{
                          flex: 2, fontSize: '0.62rem', padding: '0.6rem', borderRadius: 10,
                          background: 'linear-gradient(180deg, rgba(240,192,64,0.28) 0%, rgba(240,192,64,0.14) 100%)',
                          border: '1px solid rgba(240,192,64,0.55)',
                          color: '#f0c040', cursor: liquidating ? 'default' : 'pointer',
                          opacity: liquidating ? 0.6 : 1,
                        }}
                      >
                        {liquidating ? 'Submitting…' : 'Confirm — Lock Price'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Quick Sell */}
                <div style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 16, padding: '1rem 1.1rem',
                }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.65rem', color: '#a0a09a' }}>Quick Sell</p>
                    {isFullMoon && (
                      <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{
                        fontSize: '0.48rem', color: '#e2e8f0', padding: '0.1rem 0.45rem', borderRadius: '2rem',
                        background: 'rgba(226,232,240,0.12)', border: '1px solid rgba(226,232,240,0.3)',
                      }}>Full Moon · Full Price</span>
                    )}
                  </div>
                  <p className="font-cinzel font-600" style={{ fontSize: '1.4rem', color: isFullMoon ? '#e2e8f0' : '#f0ede8', lineHeight: 1 }}>
                    {holdTotalValue.toLocaleString()} ⟡
                  </p>
                  <p className="font-karla font-400 mt-1.5" style={{ fontSize: '0.68rem', color: '#9a9488' }}>
                    {isFullMoon
                      ? 'Full market price · Full Moon Rising'
                      : <>65% of base value · you lose{' '}<span style={{ color: '#f87171' }}>{Math.floor(holdBaseValue * 0.35).toLocaleString()} ⟡</span></>
                    }
                  </p>
                  <button
                    onClick={async () => { for (const item of inventory) await handleSell(item.fish_id, item.quantity) }}
                    disabled={!!sellPending}
                    className="font-karla font-600 uppercase tracking-[0.1em] w-full"
                    style={{ fontSize: '0.65rem', padding: '0.65rem', borderRadius: 10, marginTop: 12,
                      background: isFullMoon ? 'rgba(226,232,240,0.09)' : 'rgba(255,255,255,0.07)',
                      border: `1px solid ${isFullMoon ? 'rgba(226,232,240,0.28)' : 'rgba(255,255,255,0.15)'}`,
                      color: isFullMoon ? '#e2e8f0' : '#a0a09a', opacity: sellPending ? 0.5 : 1, cursor: sellPending ? 'default' : 'pointer' }}>
                    {sellPending ? 'Selling…' : isFullMoon ? 'Sell All at Full Price' : 'Sell All at Discount'}
                  </button>
                </div>
              </div>
            )}
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
            <img src="/hook_gold_thumb.png" alt="" style={{ width: 16, height: 16, objectFit: 'contain', opacity: 0.9 }} />
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

      {/* ── Cast notice — surfaces why a cast didn't go (e.g. fish hold full),
            so casting never fails silently. Non-blocking (no pointer events). ── */}
      <AnimatePresence>
        {castNotice !== null && (
          <motion.div
            key={`cast-notice-${castNotice}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            style={{
              position: 'absolute', bottom: 96, left: '50%', transform: 'translateX(-50%)',
              zIndex: 45, pointerEvents: 'none', maxWidth: '88%', textAlign: 'center',
              background: 'rgba(40,12,8,0.94)',
              border: '1px solid rgba(240,120,90,0.4)',
              borderRadius: 10, padding: '8px 16px',
            }}
          >
            <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: '#f0b8a8', lineHeight: 1.35 }}>
              {castNotice}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Level-up overlay — surfaces what the new level actually does
            (cumulative bite-speed + catch-zone perks, and any zone unlock).
            Mirrors NavLevelUpOverlay's stat-delta style. */}
      <AnimatePresence>
        {levelUpNotif && (() => {
          const perks = fishingLevelPerks(levelUpNotif.to)
          const zoneUnlocks = zonesUnlockedBetween(levelUpNotif.from, levelUpNotif.to)
          return (
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
              // Near-opaque dark backdrop so the catch-result card behind
              // never bleeds through the LEVEL UP text. Soft blue tint at
              // center keeps the celebratory glow.
              background: 'radial-gradient(ellipse 80% 65% at 50% 50%, rgba(20,40,80,0.94) 0%, rgba(0,0,0,0.98) 100%)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              cursor: 'pointer',
              padding: '1.5rem',
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
              initial={{ scale: 0.55, y: 18, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              transition={{ duration: 0.28, ease: 'easeOut', delay: 0.06 }}
              style={{ textAlign: 'center', position: 'relative', maxWidth: 320 }}
            >
              <p className="font-cinzel font-700 uppercase tracking-[0.25em]"
                style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '0.35rem', textShadow: '0 0 18px rgba(255,255,255,0.95), 0 0 48px rgba(96,165,250,0.6)' }}>
                Level Up!
              </p>
              <p className="font-cinzel font-700"
                style={{
                  fontSize: '5rem', lineHeight: 1, color: '#f0c040',
                  textShadow: '0 0 40px rgba(240,192,64,1), 0 0 90px rgba(240,192,64,0.5)',
                }}>
                {levelUpNotif.to}
              </p>

              {/* Perks at this level — cumulative numbers so the player sees
                  where they ARE, not just the marginal gain. */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28, duration: 0.3, ease: 'easeOut' }}
                style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
              >
                <p className="font-karla font-700 uppercase tracking-[0.22em]"
                   style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginBottom: '0.4rem', textShadow: '0 0 12px rgba(96,165,250,0.4)' }}>
                  Angler&apos;s Perks
                </p>
                {perks.biteSpeed > 0 && (
                  <PerkLine label="Faster Bites" value={`+${perks.biteSpeed}%`} />
                )}
                {perks.catchZone > 0 && (
                  <PerkLine label="Catch Zone" value={`+${perks.catchZone}°`} />
                )}
              </motion.div>

              {/* Zone unlock — only when crossing a threshold, prominent. */}
              {zoneUnlocks.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 18 }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(180deg, rgba(96,165,250,0.22) 0%, rgba(96,165,250,0.06) 100%), #06121e',
                    border: '1px solid rgba(96,165,250,0.50)',
                    borderTop: '1px solid rgba(96,165,250,0.80)',
                    borderRadius: 999,
                    boxShadow: '0 0 22px rgba(96,165,250,0.35)',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: '#90c0ff', letterSpacing: '0.20em' }}>
                    Zone Unlocked
                  </span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8', textShadow: '0 0 12px rgba(96,165,250,0.55)' }}>
                    {zoneUnlocks.map(z => z.label).join(' · ')}
                  </span>
                </motion.div>
              )}

              <motion.p
                className="font-karla font-400"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.32)', marginTop: '1rem', letterSpacing: '0.08em' }}>
                tap to continue
              </motion.p>
            </motion.div>
          </motion.div>
          )
        })()}
      </AnimatePresence>

      <PodiumToast notif={podiumNotif} onDone={() => setPodiumNotif(null)} />

      {/* ── Fish Hold drawer ── */}
      <AnimatePresence>
        {holdOpen && (
          <motion.div key="hold-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            {...drawerDragProps(() => setHoldOpen(false))}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '72vh',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Non-scrollable drag zone */}
            <DrawerHandle />
            <div style={{ padding: '0.75rem 1rem 0', flexShrink: 0 }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{ fontSize: '0.72rem', color: '#9a9488', marginBottom: 3 }}>Fish Hold</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: holdTotalCount >= holdCapacity ? '#f87171' : '#f0ede8', lineHeight: 1.1 }}>
                    {holdTotalCount} <span style={{ fontSize: '1.1rem', color: '#6a6764' }}>/ {holdCapacity}</span>
                  </p>
                </div>
                <DrawerClose onClick={() => setHoldOpen(false)} />
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, padding: '0 1rem 2rem' }}>
              {/* Upgrade fish hold */}
              {(() => {
                const maxTier = FISH_HOLD_TIERS.length - 1
                const isMax = currentFishHoldTier >= maxTier
                const next = !isMax ? getFishHold(currentFishHoldTier + 1) : null
                const canAfford = next ? doubloons >= next.cost : false
                return (
                  <div style={{ marginBottom: '1rem' }}>
                    {isMax ? (
                      <div style={{
                        padding: '1rem 1.1rem',
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 14,
                      }}>
                        <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: '#6a6764', marginBottom: 4 }}>Fish Hold</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1 }}>{getFishHold(currentFishHoldTier).name}</p>
                        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: '#4a4845', marginTop: 4 }}>Maximum capacity reached</p>
                      </div>
                    ) : (
                      <button
                        disabled={!canAfford}
                        onClick={async () => {
                          const res = await upgradeFishHold()
                          if ('ok' in res) {
                            setCurrentFishHoldTier(res.newTier)
                            setDoubloons(res.doubloons)
                            window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                          }
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '1rem 1.1rem', width: '100%',
                          background: canAfford ? 'rgba(240,192,64,0.13)' : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${canAfford ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 14, cursor: canAfford ? 'pointer' : 'default',
                          textAlign: 'left',
                        }}
                      >
                        <div>
                          <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: canAfford ? '#f0c040' : '#5a5755', marginBottom: 4 }}>Upgrade Hold</p>
                          <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: canAfford ? '#f0ede8' : '#6a6764', lineHeight: 1 }}>{next!.name}</p>
                          <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: canAfford ? 'rgba(240,192,64,0.75)' : '#f0c040', marginTop: 5 }}>
                            {next!.capacity} slots &nbsp;·&nbsp; {next!.cost.toLocaleString()} ⟡
                          </p>
                        </div>
                        {canAfford && (
                          <div style={{
                            flexShrink: 0, marginLeft: '0.75rem',
                            background: 'rgba(240,192,64,0.18)', border: '1px solid rgba(240,192,64,0.4)',
                            borderRadius: 8, padding: '0.3rem 0.65rem',
                          }}>
                            <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#f0c040' }}>Buy</span>
                          </div>
                        )}
                      </button>
                    )}
                  </div>
                )
              })()}

              {inventory.length === 0 ? (
                <p className="font-karla font-300 text-center py-6" style={{ fontSize: '0.8rem', color: '#4a4845' }}>
                  No fish yet. Cast a line!
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {Object.entries(
                    inventory.reduce((acc, item) => {
                      const h = item.fish_species.habitat
                      acc[h] = (acc[h] ?? 0) + item.quantity
                      return acc
                    }, {} as Record<string, number>)
                  ).map(([habitat, count]) => {
                    const hColor = HABITAT_COLOR[habitat] ?? '#888'
                    const label = habitat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
                    return (
                      <div key={habitat} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.55rem 0.85rem', borderRadius: 10,
                        background: `${hColor}0a`, border: `1px solid ${hColor}1a`,
                      }}>
                        <p className="font-karla font-600" style={{ fontSize: '0.75rem', color: hColor }}>{label}</p>
                        <p className="font-cinzel font-700" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>{count}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
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

      <EventBanner event={activeEvent} announcing={eventAnnouncing} />

      {/* ── Finn (fishing rival) overlay ─────────────────────────────────
          Mounted at the document root so it floats above the fishing UI.
          Mode controls whether this is an offer, a result, or the climax
          reveal. Bait is never consumed during an encounter. */}
      <FinnEncounter
        visible={finnOverlay !== null}
        lines={finnOverlay?.lines ?? []}
        mode={finnOverlay?.mode ?? 'offer'}
        challenge={finnOverlay?.challenge}
        resultKind={finnOverlay?.resultKind}
        rewardText={finnOverlay?.rewardText}
        onAccept={handleFinnAccept}
        onPass={handleFinnPass}
        onDismiss={handleFinnDismiss}
      />

    </div>
  )
}
