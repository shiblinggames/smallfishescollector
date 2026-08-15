'use client'

import React, { useState, useEffect, useRef, useTransition, useMemo, useCallback } from 'react'
import { ctaPill } from '@/lib/uiTokens'
import { installSpaceAction } from '@/lib/spaceAction'
import CloseButton from '@/components/CloseButton'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence, useDragControls, type MotionStyle } from 'framer-motion'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { releaseAncient, castLine, reelIn, reelCrate, rerollWormhole, quickSellAllFish, markFishingTourSeen, markFishingCatchTourSeen, markFirstCatchCelebrationSeen, checkLeaderboardPosition, claimZoneReward, equipBoat, buyBoat, equipHat, buyHat, equipPet, equipSpecialItem, buySpecialItem, useTideTurnerSkip, prestigeZone, activateEvent, sellGoldenTrophy, mountGoldenTrophy, setCompletionistEffects as saveCompletionistEffects, setShowWaitTimer as persistShowWaitTimer, claimFishingLevelRewards, type FishSpecies, syncFishHold } from './actions'
import { equipSecondSpecial } from '../expeditions/spoilsActions'
import { recordFinnEncounter, settleFinnChallenge, recordFinnPass, markFinnRevealSeen } from './finnActions'
import { buyBaitWithFathoms } from '@/app/(app)/raids/gauntlet/actions'
import FinnEncounter from './FinnEncounter'
import FinnScene from './FinnScene'
import TrawlIndicator from './TrawlIndicator'
import AncientRelease from './AncientRelease'
import {
  FINN_ENCOUNTER_RATE, FINN_PERFECT_TIERS, FINN_SPEED_TIERS, FINN_SPEED_ZONE_MULT, FINN_REVEAL_BEAT,
  FINN_OFFER_LINES, FINN_WIN_LINES, FINN_LOSS_LINES,
  FINN_EPILOGUE_OFFER_LINES, FINN_EPILOGUE_WIN_LINES, FINN_EPILOGUE_LOSS_LINES,
  FINN_EPILOGUE_LORE_LINES, FINN_EPILOGUE_LORE_CHANCE,
  FINN_RETURN_AFTER_WIN, FINN_RETURN_AFTER_LOSS, FINN_RETURN_AFTER_PASS,
  pickFinnTier, pickChallengeType, pickRandomLine,
  findNextEncounterBeat, findNextWinBeat, finnAncientBeat,
  type FinnChallengeType, type FinnAncientBeat, type FinnSceneLine,
} from '@/lib/finn'
import { liquidateAllFish } from '@/app/(app)/tavern/market/actions'
import { BOATS, getBoat, boatGlowClass } from '@/lib/boats'
import { HATS, getHat } from '@/lib/hats'
import { getPet, getPetOverlay, petSlot } from '@/lib/pets'
import { vigilScale, vigilNumeral, VIGIL_MAX_RANK, VIGIL_FRAME, type VigilState } from '@/lib/ancientVigil'
import { upgradeFishHold } from './holdActions'
import { getFishHold, FISH_HOLD_TIERS } from '@/lib/fishHold'
import { gauntletAutoCatchMaxRarity } from '@/lib/gauntletUpgrades'
import { setFishingMusicMuted, playPerfectSfx, playCastSfx, playCast2Sfx, playForgeSfx, startDialLoop, stopDialLoop, getFishingSfxMuted, setFishingSfxMuted } from '@/lib/fishingMusic'
import { CHARACTER_COLORS, getCharacterSprites } from '@/lib/characters'
import { zoneRewardDoubloons, PRESTIGE_MAX, goldenBoostPct } from '@/lib/zoneRewards'
import { updateCharacterColor, purchaseCharacterColor, persistEarnedSkins, persistEarnedBoats } from '@/app/(app)/u/actions'
import { equipBadge, unequipBadge } from '@/app/(app)/achievements/badgeActions'
import { BADGES, BADGE_MAP, BADGE_SLOT_POSITIONS } from '@/lib/badges'

const CRATE_FISH_ID = -1
import { claimDailyReward, claimDailySweep } from './dailyChallengeActions'
import { getDailyChallenges, DAILY_SWEEP_GEMS, type DailyChallengeState, type DailyChallenge } from '@/lib/dailyChallenges'
import { GEM_GLYPH, GEM_COLOR } from '@/lib/uiTokens'
import type { CrateLoot, CrateTier } from '@/lib/crateLoot'
import CrateOpening, { CRATE_TIERS, type CrateTierId, type CrateLootView } from '@/components/CrateOpening'
import PodiumToast, { type PodiumNotif } from '@/components/PodiumToast'
import LeaderboardModal from '@/components/LeaderboardModal'
import AncientBgEffect from '@/components/AncientBgEffect'
import PopupShell from '@/components/PopupShell'
import { IconFlame, IconStar, IconTrophy, IconLock } from '@/components/GameIcons'
import { equipRod, purchaseRod, sellRod, buyReel, buyBait } from '@/app/(app)/marketplace/tackle-shop/actions'
import { buyHook } from '@/app/(app)/hooks/actions'
import { buildFishZones, FISH_DIFFICULTY_SPEED, ZONE_DIFFICULTY, CATCH_CENTER, type ZoneDef, type ZoneType } from './depths'
import { DialSVG, arcPath, polar, CX, CY, OUTER_R, INNER_R } from '@/components/FishingDial'
import { ZONE_MIN_LEVEL } from './zoneData'
import { getXPProgress, getLevelFromXP, levelCatchBonus, MAX_LEVEL } from '@/lib/fishingLevel'
import { rewardsOwed, nextLevelReward, rewardLabel, LEVEL_REWARD_MAX, type LevelReward } from '@/lib/levelRewards'
import { renownLevel, renownProgress, spentPoints, type RenownAlloc } from '@/lib/renown'
import { markRenownIntroSeen, type RenownState } from '@/app/(app)/actions/renown'
import RenownPanel from '@/components/RenownPanel'
import RenownUpOverlay, { type RenownUpInfo } from '@/components/RenownUpOverlay'
import RenownIntroOverlay from '@/components/RenownIntroOverlay'
import GuideCoach from '@/components/GuideCoach'
import { GUIDES, FISHING_ACCENT } from '@/lib/onboardingScenes'
import { fishingGearUnlockedBetween } from '@/lib/gearUnlocks'
import GearUnlockRow from '@/components/GearUnlockRow'
import { formatFishLength, tierForLength, tierShowsPill, TIER_COLOR, TIER_LABEL, type FishSizeTier } from '@/lib/fishSize'
import { SHINY_FISH_FILTER, SHINY_THEME, SHINY_SELL_MULT, pickShinyMessage } from '@/lib/shiny'
import { getHook, HOOKS, hookGlowClass } from '@/lib/hooks'
import { getRod, getEffectiveRod, RODS, rodGlowClass, rodSpeedPct, rodStatSplit, COMPLETIONIST_TIER, lockedInState, type RodDef } from '@/lib/rods'
import { vibrate, hapticTap } from '@/lib/haptics'
import { getReel, REELS } from '@/lib/reels'
import { getLine } from '@/lib/lines'
import { BAITS, getBait, type BaitDef } from '@/lib/bait'
// LAZY. GearScreen is 216KB of source and already renders only behind
// {gearOpen && ...}, but a static import still parsed and evaluated all of it
// as part of the fishing bundle whether or not the drawer was ever opened. It
// loads on tap now, under the drawer's own slide-up, so the fetch hides inside
// an animation that was always there. ssr:false because it is drawer-only UI
// that never renders on the server.
const GearScreen = dynamic(() => import('./GearScreen'), {
  ssr: false,
  loading: () => (
    <div style={{
      minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: '#6a6764', fontFamily: 'var(--font-karla), system-ui, sans-serif',
      fontSize: '0.7rem', letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>
      Opening the locker…
    </div>
  ),
})

// ─── Types ───────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'casting' | 'hooked' | 'catching' | 'reeling' | 'result'

// Which action-bar tab a coach step flashes.
type FlashTab = 'gear' | 'bait' | 'hold' | 'log'
// Post-first-catch walkthrough: a stepped tour that flashes each action-bar tab
// as it explains it, then covers XP/leveling. Plain, one line per step.
const FISH_WALKTHROUGH: { portrait: string; speaker: string; text: string; flash: FlashTab | null }[] = [
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Nice catch! Buy items and equip gear in the *Gear & Shop* tab.", flash: 'gear' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Stock up on *bait* in the Bait tab. You need it to cast.", flash: 'bait' },
  { portrait: GUIDES.kat.portrait,  speaker: 'Kat',  text: "Sell your fish and buy upgrades in the *Fish Hold* tab.", flash: 'hold' },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Log every fish in the *Collection* tab. Complete a zone's fish for a bonus.", flash: 'log' },
  { portrait: GUIDES.doby.portrait, speaker: 'Doby', text: "Every fish earns XP. Level up to unlock new areas and hit *milestone* bonuses.", flash: null },
]

type BaitItem = { bait_type: string; quantity: number }
type InventoryItem = {
  fish_id: number
  quantity: number
  fish_species: FishSpecies
}

// ─── Wait time mechanics ──────────────────────────────────────────────────────


// Insert `ins` into a contiguous zone ring, CLIPPING anything it overlaps so the
// ring stays gap-free and `ins` is the only zone covering its range. Needed because
// getZone() returns the FIRST matching zone and DialSVG paints in array order: a
// naively-appended overlapping zone renders on top but resolves to whatever was
// under it (the old split bug — a gold decoy that scored as a miss). After a splice
// there is no overlap, so the picture and the resolver finally agree. Assumes `ins`
// does not wrap past 0/360 (callers guard).
function spliceZone(zones: ZoneDef[], ins: ZoneDef): ZoneDef[] {
  const out: ZoneDef[] = []
  for (const z of zones) {
    if (z.to <= ins.from || z.from >= ins.to) { out.push(z); continue } // no overlap
    if (z.from < ins.from) out.push({ ...z, to: ins.from })             // left remnant
    if (z.to > ins.to)   out.push({ ...z, from: ins.to })              // right remnant
  }
  out.push(ins)
  return out
}

function applyBossMods(zones: ZoneDef[], mechanic: BossMechanic | null, shrinkDeg: number): ZoneDef[] {
  if (!mechanic) return zones
  let result = [...zones]
  if (mechanic === 'precision') {
    // Perfect-only catch: the green catch ring becomes a miss zone, so
    // only the gold perfect sliver lands the fish. Player sees red
    // where there used to be green, the visual cue is unmistakable.
    // No separate gameplay branch needed in the resolver — the zone
    // resolver naturally returns 'miss' for what's now a miss zone.
    result = result.map(z => z.type === 'catch' ? { ...z, type: 'miss' as ZoneType, label: 'Miss', color: '#f87171' } : z)
  }
  if (mechanic === 'split') {
    // A SECOND, real perfect window on the far side of the dial. Spliced in
    // (not appended) so it actually lands the fish instead of reading gold and
    // scoring a miss. Guarded against wrap so the splice math stays simple.
    const perfect = result.find(z => z.type === 'perfect')
    if (perfect) {
      const center = (perfect.from + perfect.to) / 2
      const half = (perfect.to - perfect.from) / 2
      const opposite = (center + 180) % 360
      const from = opposite - half, to = opposite + half
      if (from >= 0 && to <= 360) {
        result = spliceZone(result, { from, to, type: 'perfect' as ZoneType, label: 'Perfect!', color: '#fde68a' })
      }
    }
  }
  if (shrinkDeg !== 0) {
    // Resize the gold PERFECT sliver. Positive shrinkDeg NARROWS it each stage (the
    // closing jaw); NEGATIVE shrinkDeg WIDENS it (Megalodon opens on a generous
    // perfect, then tightens phase by phase).
    //
    // CRUCIAL: don't just mutate from/to. getZone returns the FIRST matching zone and
    // DialSVG paints in array order, so a naively-widened perfect draws gold OVER the
    // neighbour zones while getZone still resolves them as miss underneath — the dial
    // would show a hit window bigger than the one that actually scores (the Megalodon
    // "reel-in changes colour" bug). So: WIDEN by splicing the bigger perfect in (it
    // clips whatever it now covers, becoming the sole zone in its arc); NARROW by
    // pulling it in and growing its immediate neighbours to meet it (no dead gap).
    const p = result.find(z => z.type === 'perfect')
    if (p) {
      const center = (p.from + p.to) / 2
      const newHalf = Math.max(2, (p.to - p.from) / 2 - shrinkDeg / 2)
      const nf = center - newHalf, nt = center + newHalf
      if (shrinkDeg < 0) {
        result = spliceZone(result.filter(z => z !== p), { ...p, from: nf, to: nt })
      } else {
        const oldFrom = p.from, oldTo = p.to
        result = result.map(z => {
          if (z === p) return { ...z, from: nf, to: nt }
          if (Math.abs(z.to - oldFrom) < 1e-6) return { ...z, to: nf }     // left neighbour meets it
          if (Math.abs(z.from - oldTo) < 1e-6) return { ...z, from: nt }   // right neighbour meets it
          return z
        })
      }
    }
  }
  return result
}

// ─── Ancient boss dial palette ────────────────────────────────────────────────
// The 6 giants ("final bosses of fishing") don't fight on the ordinary green/gold
// dial — the whole reel goes eldritch. We recolor BY ZONE TYPE so the semantic read
// survives (gold is still the target, red is still danger): the safe water glows
// cold cyan, the dead space turns void-violet. The needle inherits currentZone.color,
// so it adopts these tones for free. Only the 6 trophies get this — the 12 sellable
// regulars keep the normal look. Applied after applyBossMods so precision's
// converted bands recolor as void too.
const ANCIENT_ZONE_COLOR: Record<ZoneType, string> = {
  catch:   '#22d3ee', // cyan — the water that will land the giant
  perfect: '#fde68a', // gold stays the target (universal read)
  penalty: '#fb5f7a', // hot rose — danger, but hotter/pinker than the normal red
  miss:    '#4b3a63', // void-violet — dead water
}
function applyAncientPalette(zones: ZoneDef[]): ZoneDef[] {
  return zones.map(z => ({ ...z, color: ANCIENT_ZONE_COLOR[z.type] ?? z.color }))
}

// Megalodon (fish id 143) is the final-final boss. The SERVER gates it out of the
// pool until the other five giants are on the wall (see fishing/actions.ts); this
// id is only used client-side to flag its slain-cinematic as the apex variant.
const MEGALODON_ID = 143

// ─── Constants ────────────────────────────────────────────────────────────────

// CX/CY/OUTER_R/INNER_R now imported from components/FishingDial.

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

type BossMechanic = 'shrink' | 'drift' | 'accelerate' | 'randomize' | 'split' | 'precision' | 'gyre' | 'surge'
// shrink = the whole landing window BREATHES (shrinks and expands in real time), each
//   phase tighter + faster. surge = drift AND accelerate stacked (the ring circles you
//   while the needle speeds up each phase).
// Ancient Deep multi-phase reel config. Each of the 6 trophies has its OWN signature
// mechanic so no two giants fight alike. Megalodon is the gated final-final boss: a
// pure CONSISTENCY test — precision (perfect-only) on all 4 phases, each phase a
// little tighter and faster than the last (perfectShrinkStep / speedStepMult). It
// starts generous (a WIDE perfect via a negative perfectShrinkStart) and closes down,
// with NO blackouts (noBlackout) — the challenge is landing four perfects in a row,
// not fighting the dark. New sellable regulars run a shorter 2 stages. The wildcard
// flag rerolls the mechanic each stage (Sea Lamprey's "primitive, unpredictable" feel).
interface BossConfig {
  mechanic: BossMechanic
  phases: number
  wildcard?: boolean
  /** Perfect-escalation (Megalodon): the perfect window's bossZoneShrink at phase 1
   *  (NEGATIVE = wider than normal), then += perfectShrinkStep each phase. */
  perfectShrinkStart?: number
  perfectShrinkStep?: number
  /** Needle-speed multiplier applied each phase (Megalodon's gentle ramp). */
  speedStepMult?: number
  /** Suppress the zone blackout for this fish (Megalodon reads clean). */
  noBlackout?: boolean
}
const BOSS_CONFIG: Record<string, BossConfig> = {
  // ── Ancients (sell_value 0, route to ancient_catches) ──
  'Megalodon':         { mechanic: 'precision', phases: 4, perfectShrinkStart: -18, perfectShrinkStep: 6, speedStepMult: 1.12, noBlackout: true }, // FINAL boss — 4 perfects in a row, tightening each phase, gated behind the other 5
  'Plesiosaurus':      { mechanic: 'drift',      phases: 3 }, // the ring circles you, one way
  'Dunkleosteus':      { mechanic: 'accelerate', phases: 3 }, // the armored ram — faster each stage
  'Mosasaurus':        { mechanic: 'gyre',       phases: 3 }, // the sea-dragon coils — the ring rocks like a swell
  'Basilosaurus':      { mechanic: 'surge',      phases: 3 }, // the leviathan bears down — ring drifts AND the needle speeds each stage
  'Shastasaurus':      { mechanic: 'shrink',     phases: 3 }, // the breathing jaw — the window shrinks and expands in real time
  // ── New sellable regulars (sell_value > 0, route to inventory) ──
  'Chambered Nautilus': { mechanic: 'drift',      phases: 2 },
  'Ghost Shark':        { mechanic: 'randomize',  phases: 2 },
  'Spookfish':          { mechanic: 'split',      phases: 2 },
  'Snipe Eel':          { mechanic: 'precision',  phases: 2 },
  'Yeti Crab':          { mechanic: 'accelerate', phases: 2 },
  'Sea Lamprey':        { mechanic: 'shrink',     phases: 2, wildcard: true },
  'Pacific Hagfish':    { mechanic: 'split',      phases: 2 },
  'Tripod Fish':        { mechanic: 'drift',      phases: 2 },
  'Sea Pig':            { mechanic: 'accelerate', phases: 2 },
  'Bigfin Squid':       { mechanic: 'gyre',       phases: 2 },
  'Vent Octopus':       { mechanic: 'shrink',     phases: 2 },
  'Black Dragonfish':   { mechanic: 'shrink',     phases: 2, wildcard: true },
}
const WILDCARD_MECHANICS: BossMechanic[] = ['shrink', 'drift', 'accelerate', 'randomize', 'split', 'precision', 'gyre']

/** THE LONG VIGIL — a released giant fights for its next rank, and the rank
 *  STEEPENS ITS OWN FIGHT rather than replacing it. The mechanic is that
 *  giant's identity and never changes; what changes is how many phases you
 *  must hold, how hard the landing window closes, and how fast the needle
 *  gets. Rank 1 (no scale) is the fight exactly as shipped.
 *
 *  Megalodon already proved this shape with its own perfectShrinkStep, so the
 *  Vigil hands that curve to every giant and steepens whatever is there. */
function vigilBossConfig(base: BossConfig, mechanic: BossMechanic, rank: number | undefined): BossConfig {
  const sc = rank ? vigilScale(rank) : null
  if (!sc) return base
  // TWO carve-outs on the perfect curve:
  //  - 'shrink' BREATHES in real time off bossStage and deliberately holds
  //    bossZoneShrink at 0, so writing a curve here would fight its mechanic.
  //  - a giant that ships its OWN curve (Megalodon) keeps it whole. Layering
  //    the Vigil's opening on top of its -18 would throw the window absurdly
  //    wide, and its 4-phase close is already the shape this borrows.
  // Both still escalate through phases and needle speed.
  const ownCurve = base.perfectShrinkStep != null
  const stepsShrink = mechanic !== 'shrink' && !ownCurve
  // accelerate/surge ramp 1.4x a phase in the stage handler's own branch. Once
  // a perfectShrinkStep exists that branch is skipped, so fold the 1.4 in here
  // or the Vigil would make those two SLOWER than they ship.
  const ramps = mechanic === 'accelerate' || mechanic === 'surge'
  return {
    ...base,
    phases: base.phases + sc.extraPhases,
    perfectShrinkStart: stepsShrink ? sc.perfectShrinkStart : base.perfectShrinkStart,
    perfectShrinkStep: stepsShrink ? sc.perfectShrinkStep : base.perfectShrinkStep,
    speedStepMult: (base.speedStepMult ?? (ramps ? 1.4 : 1)) * sc.speedStepMult,
  }
}

const RARITY: Record<number, { label: string; color: string; hookedText: string }> = {
  1: { label: 'Common',    color: '#94a3b8', hookedText: "Something's on the line…" },
  2: { label: 'Uncommon',  color: '#4ade80', hookedText: "You've got a bite!" },
  3: { label: 'Rare',      color: '#60a5fa', hookedText: "Something strong is pulling!" },
  4: { label: 'Epic',      color: '#c084fc', hookedText: "A big one! Hold tight!" },
  5: { label: 'Legendary', color: '#f59e0b', hookedText: "SOMETHING MASSIVE IS ON THE LINE!" },
}

// ─── Random events ───────────────────────────────────────────────────────────

type EventType = 'bloom' | 'fullmoon' | 'redtide' | 'glassy'

const EVENT_DEFS: Record<EventType, { name: string; tagline: string; detail: string; color: string; tint: string }> = {
  bloom:    { name: 'Bioluminescent Bloom', tagline: 'No bait consumed this cycle',        detail: 'The water lights up and the fish rise to it. Every cast is free while the bloom holds, so your bait stays in the tin.', color: '#2dd4bf', tint: 'rgba(45,212,191,0.09)' },
  fullmoon: { name: 'Full Moon Rising',     tagline: 'Quick sell pays full market price',  detail: 'The tide runs high and the buyers are generous. Quick-sell pays the full market price, not the usual cut, so there is no reason to hold your catch.', color: '#e2e8f0', tint: 'rgba(226,232,240,0.07)' },
  redtide:  { name: 'Red Tide',             tagline: 'Rare fish are surfacing',             detail: 'Something has stirred the deep. Rare and better fish surface far more often than usual for as long as the tide runs red.', color: '#f87171', tint: 'rgba(248,113,113,0.08)' },
  glassy:   { name: 'Glassy Waters',        tagline: 'Catch window is wider',              detail: 'The surface goes dead calm and every strike reads clean. Your catch window is wider, so landing fish (and perfect catches) comes easier.', color: '#c084fc', tint: 'rgba(192,132,252,0.08)' },
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
    "Tip: snags strike more often down here — a stronger line fends them off.",
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
    "Clear every stage, or land nothing.",
    "It knows you're here.",
    "Few have ever seen what swims here.",
    "Stay sharp. Every stage counts.",
    "These things were here before the continents split.",
    "No second chances in the Ancient Deep.",
    "The oldest giant will not show until the rest are yours.",
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
    tip: "Tip: the Auto Caster keeps casting for you and opens crates between catches. Find it in the gear shop for 5,000 ⟡.",
  },
]

const SKIN_TIPS = [
  "Tip: reach Fishing Level 50 to unlock the Forest character color.",
  "Tip: prestige any zone 3 times to unlock the Sand character color.",
  "Tip: reach Navigation Level 50 on voyages to unlock the Sky character color.",
  "Tip: the Golden character color costs 100,000 doubloons; Gilded runs 1,000,000.",
  "Tip: open fishing crates for a rare chance to find the Mint character color.",
  "Tip: reach Fishing Level 75 to unlock the Ice character color.",
  "Tip: several character colors, like Autumn and Ruby, can be bought with gems from your profile.",
  "Tip: reach 300 achievement points to unlock the Galaxy character color.",
  "Tip: max out both Fishing and Navigation to Level 100 to unlock the Crystal character color.",
]

// General mechanics tips. Always in the pool (no unlock condition), so
// they surface for every player. Keep them short, accurate, and in the
// same voice as the zone wait-messages. Verify any number against the
// source before adding — stale tips are worse than no tip.
const GENERAL_TIPS = [
  "Tip: prestige a zone for +10% catch XP per level there, up to +50% at Prestige 5.",
  "Tip: a zone's completion reward grows each time you prestige it, up to double at Prestige 5.",
  "Tip: quick-sell pays 75%. Liquidate your whole hold for 87% an hour later, or work the market for the best price.",
  "Tip: each hook tier widens your catch zone by 3°. It adds up fast.",
  "Tip: a better reel slows the needle — the single biggest skill upgrade.",
  "Tip: the Twin-Strike rod has a 25% chance to land two fish at once.",
  "Tip: the Millionaire's Rod catches two fish on every single catch.",
  "Tip: the YOLO Rod has a 10% chance to haul in 100 fish at once.",
  "Tip: the Telescoping Rod draws rarer fish to the surface.",
  "Tip: sunken crates come in Wooden, Metal, Gold, and Diamond. The Ancient Deep hides something older.",
  "Tip: complete a zone's whole collection to claim a one-time doubloon reward.",
  "Tip: daily challenges reset every day — easy doubloons and XP if you keep up.",
  "Tip: badges are earned through milestones. Equip your favorites from your profile.",
  "Tip: keep an eye out for Finn — a rival angler who shows up to challenge you.",
  "Tip: upgrade your fish hold so a good run doesn't fill up and stall.",
  "Tip: Ancient Deep trophies never enter your hold. They go straight to your wall.",
  "Tip: equip a boat, hat, and pet from the gear screen to customize your fisher.",
  "Tip: a perfect catch keeps your streak alive, and the bonus XP compounds.",
  "Tip: your perfect streak carries over when you leave between casts. Bail on a hooked fish and it breaks.",
  "Tip: recruit a crew at the Crew Hall, then send them on voyages and raids for loot and rare gear.",
  "Tip: special fishing gear like the Tide Turner is won out on voyages and raids.",
  "Tip: give your captain a background and border on your profile to stand out on the leaderboards.",
  // Trawls — crew passive fishing (the headline new feature).
  "Tip: idle crew can Trawl a zone for you. Tap the crew badge on the fishing screen to send them off, and they haul back fishing XP and doubloons on their own.",
  "Tip: on a Trawl, a crew's Savvy grows the XP it brings back and Fortune grows the doubloons. Match the crew to what you need.",
  "Tip: you can run several Trawls at once, one per zone you've unlocked. Passive XP and gold while you cast or while you're away.",
  // Fish size / records.
  "Tip: every catch rolls a size, and your biggest of each species is kept as a personal best.",
  // New doubloon-earning rooms in the tavern.
  "Tip: the Parlor's daily trivia and weekly Pirate King ladder pay straight doubloons. Easy gold between casts.",
  // Charting — puzzles + the World Chart.
  "Tip: solve Charting's four weekly puzzles in the tavern to earn charting points.",
  "Tip: charting points uncover the World Chart, and each landmark you reveal pays out gems.",
  // Captain's Log / achievements.
  "Tip: your Captain's Log tracks every badge and milestone you earn. See what to chase next.",
  // The Den (casino) + slots jackpot.
  "Tip: the tavern's Den has Blackjack, Roulette, and Slots, all sharing one chip purse.",
  "Tip: land three catfish on the tavern slots to win the whole Catfish Jackpot.",
  // Expeditions endgame — Gauntlet, Renown, Forge.
  "Tip: clear Chapter 2 to unlock the Davy Jones Gauntlet, then dive deep for a growing pot.",
  "Tip: past Level 100, spare XP becomes Renown: points you spend on small permanent boosts.",
  "Tip: fuse raid items together in the Forge to craft stronger, unique gear.",
  // Crew skins + contests + leaderboards.
  "Tip: legendary crew can wear rare gem skins, dazzling variants you unlock with gems.",
  "Tip: Contests are limited-time races. Hit the goal first to claim a one-of-a-kind prize.",
  "Tip: check the leaderboards to see how your fishing, voyages, and raids stack up.",
]

type TipContext = { hasTideTurner: boolean; hasPhantomHook: boolean; hasAutoCaster: boolean }

// Max message LENGTH (characters) a zone will show, scaled to how long a
// bite takes there. Shallow water bites almost instantly, so a long tip
// flashes past before you can read it — cap it to one-liners. The deep
// zones make you wait, so there's time to read the full informative tips.
// Anything over a zone's budget is filtered out of that zone's pool.
const ZONE_READ_BUDGET: Record<ZoneKey, number> = {
  shallows:     52,
  open_waters:  92,
  deep:         150,
  abyss:        999,   // long waits — no practical cap
  ancient_deep: 999,
}

function pickWaitMessage(zone: ZoneKey, streak: number, ctx?: TipContext): string {
  for (const [threshold, msgs] of STREAK_MESSAGES) {
    if (streak >= threshold) return msgs[Math.floor(Math.random() * msgs.length)]
  }

  const budget = ZONE_READ_BUDGET[zone]

  // 1-in-6 chance to show a contextual tip instead of a zone message —
  // but only ones short enough to actually finish reading before the
  // bite lands in this zone. Shallow water filters out the long tips;
  // the deep lets them all through.
  if (ctx && Math.random() < 1 / 6) {
    const available: string[] = []
    for (const { condition, tip } of SPECIAL_ITEM_TIPS) {
      if (condition(ctx)) available.push(tip)
    }
    available.push(...SKIN_TIPS)
    available.push(...GENERAL_TIPS)
    const fits = available.filter(t => t.length <= budget)
    if (fits.length > 0) return fits[Math.floor(Math.random() * fits.length)]
    // else fall through to a (short) zone flavor message
  }

  const pool = WAIT_MESSAGES[zone].filter(m => m.length <= budget)
  const usePool = pool.length > 0 ? pool : WAIT_MESSAGES[zone]
  return usePool[Math.floor(Math.random() * usePool.length)]
}

// ─── Catch mechanics tour ────────────────────────────────────────────────────

// Two steps cover what the player needs RIGHT NOW. On Fire, snag, and
// dial speed all show themselves through play (you'll see the streak
// counter, you'll lose a fish to the red, you'll feel the dial speed
// change as you level up). Gear upgrades have their own affordances in
// the gear menu.
const CATCH_TOUR_STEPS = [
  {
    color: '#4ade80',
    title: 'Stop in the green',
    body: 'Tap to stop the dial. Green catches the fish. Red loses it.',
  },
  {
    color: '#f59e0b',
    title: 'Gold is Perfect',
    body: 'The thin gold strip is a Perfect. Bonus XP, and stack them to catch fire.',
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

// Two onboarding callouts cover the non-obvious bits: zones unlock as
// you level (the gate isn't visible up front), and the bottom row is
// the action bar. Collection / gear / bait / market each have clear
// icons and labels — players can poke around without a guided tour.
const TOUR_STEPS: TourStep[] = [
  {
    title: 'Zones unlock with XP',
    body: 'Go deeper for rarer fish. The next zone opens when you level up.',
    cardStyle: { top: 96, left: 16, right: 16 },
    arrowDir: 'up', arrowAlign: 'center',
  },
  {
    title: 'Gear, bait, hold, log',
    body: 'Your tools live down here. Tap around to see what each does.',
    cardStyle: { bottom: 112, left: 16, right: 16 },
    maxWidth: 240,
    arrowDir: 'down', arrowAlign: 'center',
  },
]

// ─── Geometry helpers ─────────────────────────────────────────────────────────
// polar() + arcPath() moved to components/FishingDial.tsx with the dial.

function getZone(zones: ZoneDef[], deg: number, rotation = 0): ZoneDef {
  const a = (((deg - rotation) % 360) + 360) % 360
  return zones.find(z => a >= z.from && a < z.to) ?? zones[0]
}

// Forward lookahead (in display frames) applied when the player locks a reel-in:
// the freeze + verdict both resolve at where the needle WILL be this many frames
// ahead, to compensate input latency. Forward-only, so it never snaps backward.
// TUNING KNOB — higher = more latency forgiveness but the freeze jumps further
// AHEAD of where you tapped; lower = the frozen needle matches the tapped spot
// more closely. Was 2; dialed to 1 (2 read a touch aggressive on the jump).
const REEL_LOOKAHEAD_FRAMES = 1

// DialSVG now lives in components/FishingDial.tsx so the Finn finale can mount
// the identical instrument over the raid screen. Imported above.

// ─── UnifiedGearDrawer ───────────────────────────────────────────────────────

// ── TACKLE SHOP LINK ─────────────────────────────────────────────────────────
// The gear drawer's link to the store used to be a muted grey row ("Buy more bait ·
// Tackle Shop ↗") that read as disabled text, not a place you could spend money. It
// is the store CTA now: gold (the currency's colour), a drawn storefront, and an
// arrow that says "this leaves the drawer and takes you shopping". One component so
// bait / rod / reel / hook all match, and all close the drawer on the way out — two
// of them used to leave it stacked behind the shop.
function TackleShopLink({ label, anchor, onClose }: { label: string; anchor: string; onClose: () => void }) {
  const GOLD = '#f0c040'
  return (
    <Link href={`/marketplace/tackle-shop#${anchor}`} onClick={onClose}
      className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mt-0.5 tap"
      style={{
        textDecoration: 'none',
        background: `linear-gradient(180deg, ${GOLD}22, ${GOLD}0d)`,
        border: `1px solid ${GOLD}66`,
        boxShadow: `0 0 14px ${GOLD}18`,
      }}>
      {/* storefront */}
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M3 9l1.5-4.5A1 1 0 0 1 5.4 4h13.2a1 1 0 0 1 .9.5L21 9" />
        <path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" />
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      </svg>
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
        <span className="font-cinzel font-800" style={{ display: 'block', fontSize: '0.78rem', color: GOLD }}>{label}</span>
        <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.12em', color: `${GOLD}aa` }}>Tackle Shop</span>
      </div>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </Link>
  )
}

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
                    <TackleShopLink label="Buy more bait" anchor="bait" onClose={onClose} />
                  </div>
                )}

                {/* ── Rod ── */}
                {sec.key === 'rod' && (
                  <div className="flex flex-col gap-1.5">
                    {ownedRodDefs.map(r => {
                      const isEquipped = r.tier === equippedRodTier
                      const speedPct = rodSpeedPct(r)
                      const hasSpecial = r.doubleCatchChance > 0 || r.retryOnMissChance > 0 || r.snagImmune || r.perfectZoneBonus > 0 || r.rarityBonus > 0 || (r.jackpotChance ?? 0) > 0 || r.wormhole || (r.instantBiteChance ?? 0) > 0 || (r.crateChanceMult ?? 1) > 1 || (r.perfectXpMult ?? 1) > 1
                      return (
                        <div key={r.tier} style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '0.55rem 0.7rem', borderRadius: 10,
                          background: isEquipped ? `${r.color}12` : 'rgba(4,10,18,0.72)',
                          border: `1px solid ${isEquipped ? r.color + '50' : 'rgba(255,255,255,0.09)'}`,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="font-cinzel font-700" style={{ fontSize: '0.72rem', color: '#f0ede8' }}>{r.name}</p>
                            {r.tier === COMPLETIONIST_TIER ? (() => {
                              // The Completionist splits into its fixed master-tool BASE and the
                              // effects FORGED in from socketed rods, so the two read apart.
                              const { base, forged } = rodStatSplit(r)
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginRight: 1 }}>Base</span>
                                    {base.map((l, i) => <StatPill key={i} label={l} color={r.color} />)}
                                  </div>
                                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span className="font-karla font-800 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', color: '#f3d98a', marginRight: 1 }}>Forged</span>
                                    {forged.length > 0 ? forged.map((l, i) => <StatPill key={i} label={l} color={r.color} />) : <StatPill label="Nothing forged in yet" muted />}
                                  </div>
                                </div>
                              )
                            })() : (
                              <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                                {r.doubleCatchChance > 0 && <StatPill label={r.doubleCatchChance >= 1 ? 'Always double catch' : `${Math.round(r.doubleCatchChance * 100)}% double catch`} color={r.color} />}
                                {r.retryOnMissChance > 0 && <StatPill label={`${Math.round(r.retryOnMissChance * 100)}% miss retry`} color={r.color} />}
                                {r.snagImmune && <StatPill label="Snag immune" color={r.color} />}
                                {r.perfectZoneBonus > 0 && <StatPill label={`Perfect zone +${r.perfectZoneBonus}°`} color={r.color} />}
                                {r.rarityBonus > 0 && <StatPill label={`+${Math.round(r.rarityBonus * 100)}% rare bias`} color={r.color} />}
                                {(r.jackpotChance ?? 0) > 0 && <StatPill label={`×${r.jackpotMultiplier} jackpot · odds rise in shallows`} color={r.color} />}
                                {(r.crateChanceMult ?? 1) > 1 && <StatPill label={`${r.crateChanceMult}× crate odds`} color={r.color} />}
                                {(r.perfectXpMult ?? 1) > 1 && <StatPill label={`${r.perfectXpMult}× perfect XP`} color={r.color} />}
                                {r.wormhole && <StatPill label="Wormhole reroll" color={r.color} />}
                                {(r.instantBiteChance ?? 0) > 0 && <StatPill label={`${Math.round(r.instantBiteChance! * 100)}% instant bite`} color={r.color} />}
                                {!hasSpecial && speedPct > 0 && <StatPill label={`${speedPct}% faster bites`} color={r.color} />}
                                {!hasSpecial && speedPct <= 0 && r.catchZoneBonus > 0 && <StatPill label={`+${r.catchZoneBonus}° catch zone`} color={r.color} />}
                                {!hasSpecial && speedPct <= 0 && r.catchZoneBonus === 0 && <StatPill label="Base rod" muted />}
                              </div>
                            )}
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
                    <TackleShopLink label="Buy more rods" anchor="rod" onClose={onClose} />
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
                    <TackleShopLink label="Upgrade reel" anchor="reel" onClose={onClose} />
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
                    <TackleShopLink label="Upgrade hook" anchor="hook" onClose={onClose} />
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

function BaitSelector({ baitInventory, selectedBait, onSelect, onBuy, buyingType, fathoms = 0, onBuyLure, buyingLure, lureBought }: {
  baitInventory: BaitItem[]
  selectedBait: string
  onSelect: (type: string) => void
  /** When provided, each purchasable bait shows a Buy button that opens the
   *  quantity-confirm modal. */
  onBuy?: (type: string) => void
  buyingType?: string | null
  /** The player's Fathom balance — gates the premium-lure Buy buttons. */
  fathoms?: number
  /** When provided, the Fathom lures (Golden / Luminous) show a Fathom Buy
   *  button that purchases a fixed bundle. */
  onBuyLure?: (type: string) => void
  buyingLure?: string | null
  lureBought?: string | null
}) {
  const inventoryMap = Object.fromEntries(baitInventory.map(b => [b.bait_type, b.quantity]))
  const isFathomLure = (b: BaitDef) => (b.fathomCost ?? 0) > 0
  // Show EVERY purchasable bait (so any can be bought directly). Doubloon baits
  // first, then the premium Fathom lures (always shown when onBuyLure is wired,
  // so they can be bought here even at 0 owned), then any other earned-only bait
  // you actually own. Without onBuy (legacy callers) fall back to the owned list.
  const list = onBuy
    ? [
        ...BAITS.filter(b => b.shopCost > 0),
        ...BAITS.filter(b => b.shopCost === 0 && (
          (onBuyLure && isFathomLure(b)) || (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait
        )),
      ]
    : BAITS.filter(b => (inventoryMap[b.type] ?? 0) > 0 || b.type === selectedBait)

  if (list.length === 0) return (
    <p className="font-karla font-600 text-center py-4" style={{ fontSize: '0.8rem', color: '#6a6764' }}>
      No bait in inventory
    </p>
  )

  return (
    <div className="flex flex-col gap-2">
      {list.map(bait => {
        const qty = inventoryMap[bait.type] ?? 0
        const isSelected = bait.type === selectedBait
        const c = bait.color
        const buyable = !!onBuy && bait.shopCost > 0
        const isBuying = buyingType === bait.type
        return (
          <div key={bait.type} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
            <button
              onClick={() => onSelect(bait.type)}
              className="tap"
              style={{
                flex: 1, minWidth: 0,
                display: 'flex', alignItems: 'center', gap: 11,
                padding: '0.6rem 0.75rem', borderRadius: 11,
                background: isSelected ? `${c}14` : 'rgba(4,10,18,0.72)',
                border: `1px solid ${isSelected ? c + '55' : 'rgba(255,255,255,0.1)'}`,
                textAlign: 'left',
              }}
            >
              {bait.imageUrl
                ? <img src={bait.imageUrl} alt={bait.name} style={{ width: 28, height: 28, objectFit: 'contain', opacity: qty > 0 ? 1 : 0.45, flexShrink: 0 }} />
                : <div style={{ width: 10, height: 10, borderRadius: '50%', background: c, flexShrink: 0, opacity: qty > 0 ? 1 : 0.45 }} />
              }
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: qty > 0 ? '#f0ede8' : '#b0aaa2' }}>
                  {bait.name}
                </p>
                <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                  {bait.catchZoneBonus > 0 && (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: `${c}dd`, background: `${c}16`, border: `1px solid ${c}34`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>
                      +{bait.catchZoneBonus}° zone
                    </span>
                  )}
                  {bait.waitMult < 1.0 && (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: `${c}dd`, background: `${c}16`, border: `1px solid ${c}34`, padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>
                      {Math.round((1 - bait.waitMult) * 100)}% faster
                    </span>
                  )}
                  {!bait.catchZoneBonus && bait.waitMult === 1.0 && (
                    <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: '#7a7672', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', padding: '0.12rem 0.45rem', borderRadius: '2rem' }}>
                      No bonus
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
                <p className="font-karla font-700" style={{ fontSize: '0.85rem', color: qty > 0 ? '#f0ede8' : '#7a7672' }}>
                  ×{qty}
                </p>
                {isSelected && (
                  <p className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.54rem', color: c }}>using</p>
                )}
              </div>
            </button>

            {buyable && (
              <button
                disabled={isBuying}
                onClick={() => onBuy!(bait.type)}
                className="font-karla font-700 uppercase tracking-[0.06em] tap"
                style={{
                  flexShrink: 0, width: 64, borderRadius: 11,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: `${c}18`, border: `1px solid ${c}50`,
                  color: c, fontSize: '0.74rem',
                  cursor: isBuying ? 'default' : 'pointer', opacity: isBuying ? 0.5 : 1,
                }}
              >
                {isBuying ? '…' : 'Buy'}
              </button>
            )}

            {/* Premium lures buy with Fathoms (a fixed bundle), same server-validated
                path as the Gauntlet Locker. Disabled until you can afford it. */}
            {onBuyLure && isFathomLure(bait) && (() => {
              const cost = bait.fathomCost ?? 0
              const bundle = bait.fathomBundle ?? 0
              const canAfford = fathoms >= cost
              const busy = buyingLure === bait.type
              const ok = canAfford && !busy
              return (
                <button
                  disabled={!ok}
                  onClick={ok ? () => onBuyLure(bait.type) : undefined}
                  className="tap"
                  style={{
                    flexShrink: 0, width: 66, borderRadius: 11,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, lineHeight: 1,
                    background: ok ? `${c}18` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${ok ? c + '55' : 'rgba(255,255,255,0.1)'}`,
                    color: ok ? c : '#6a6764', cursor: ok ? 'pointer' : 'default',
                  }}
                >
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.46rem', letterSpacing: '0.1em', opacity: 0.85 }}>
                    {lureBought === bait.type ? `+${bundle}` : busy ? '' : canAfford ? `Buy ×${bundle}` : 'Need'}
                  </span>
                  <span className="font-cinzel font-800" style={{ fontSize: '0.95rem' }}>{busy ? '…' : cost}</span>
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.4rem', letterSpacing: '0.08em', opacity: 0.7 }}>Fathoms</span>
                </button>
              )
            })()}
          </div>
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

// Pet overlay positions live in lib/pets.PET_OVERLAY so the slot
// composite preview in GearScreen.tsx stays in sync with the in-game
// render (single source of truth). Tune over there.

function fishImageUrl(name: string) {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

// Sepia-ink "DISCOVERED" stamp that overlays a card the first time
// the player sees their just-caught species in the Logbook. Replaces
// the previous tiny red "NEW" badge with something that reads as a
// captain's logbook moment — circular ink stamp, slight rotation,
// short spring entrance. Drops out the moment the card is tapped
// (uncheckedNewFishIds clears that id). Pure SVG so it stays sharp
// at any DPI without loading an image asset.
function DiscoveredStamp() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 1.7, rotate: -34 }}
      animate={{ opacity: 1, scale: 1, rotate: -14 }}
      transition={{ type: 'spring', stiffness: 240, damping: 18, delay: 0.18 }}
      style={{
        position: 'absolute', top: -8, right: -6,
        width: 56, height: 56,
        pointerEvents: 'none',
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.45))',
      }}
    >
      <svg viewBox="0 0 56 56" width="56" height="56">
        <defs>
          <radialGradient id="discovered-ink" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#c44030" stopOpacity="0.95" />
            <stop offset="70%" stopColor="#a02818" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7a1810" stopOpacity="0.78" />
          </radialGradient>
        </defs>
        {/* Outer + inner rings — slight stroke variance fakes the
            "uneven ink coverage" of a real rubber stamp. */}
        <circle cx="28" cy="28" r="25" fill="none" stroke="url(#discovered-ink)" strokeWidth="2.4" opacity="0.92" />
        <circle cx="28" cy="28" r="20" fill="none" stroke="url(#discovered-ink)" strokeWidth="1.3" opacity="0.6" />
        {/* DISCOVERED arc across the top half. tspan letter-spacing
            is faked with explicit spacing per character for legibility
            at this size. */}
        <text x="28" y="20" textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="5.8" fontWeight="700"
          fill="url(#discovered-ink)" opacity="0.95"
          letterSpacing="0.55">
          DISCOVERED
        </text>
        {/* Anchor sigil in the center. Hand-drawn paths keep the ink
            feel; no emoji that would render with native colors. */}
        <g stroke="url(#discovered-ink)" fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
          <circle cx="28" cy="28.5" r="1.8" />
          <line x1="28" y1="30.5" x2="28" y2="40" />
          <line x1="24" y1="34.5" x2="32" y2="34.5" />
          <path d="M 22 39 Q 24 43 28 43 Q 32 43 34 39" />
        </g>
        {/* Tiny ★ underneath the anchor — marks it as a captain's stamp */}
        <text x="28" y="50" textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="5" fontWeight="700"
          fill="url(#discovered-ink)" opacity="0.82">★ ★ ★</text>
      </svg>
    </motion.div>
  )
}

// Small sepia anchor seal that sits in the top-left of the species
// detail modal. Pure decoration — gives the modal the visual register
// of a logbook page rather than a generic detail panel. SVG-only so
// it tints cleanly to whatever ink color we want.
function AnchorSeal() {
  return (
    <div style={{
      position: 'absolute', top: 10, left: 10,
      width: 32, height: 32,
      pointerEvents: 'none',
      opacity: 0.55,
    }}>
      <svg viewBox="0 0 32 32" width="32" height="32">
        <circle cx="16" cy="16" r="14" fill="none" stroke="#c2a47a" strokeWidth="1" opacity="0.9" />
        <g stroke="#c2a47a" fill="none" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.95">
          <circle cx="16" cy="11" r="1.4" />
          <line x1="16" y1="12.4" x2="16" y2="22.5" />
          <line x1="12.5" y1="15.5" x2="19.5" y2="15.5" />
          <path d="M 11 21 Q 12.5 24.5 16 24.5 Q 19.5 24.5 21 21" />
        </g>
      </svg>
    </div>
  )
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

// The bait wait-time readout. Isolated into its own component so its 100ms tick
// re-renders ONLY this <p>, not the whole ~8k-line FishingGame tree (which it did
// when the elapsed value lived in FishingGame state). Conditionally mounted per
// cast, so it starts at 0.0 each time and clears its interval on catch.
function WaitTimer() {
  const [elapsedMs, setElapsedMs] = useState(0)
  useEffect(() => {
    const startedAt = Date.now()
    const id = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 100)
    return () => clearInterval(id)
  }, [])
  return (
    <p className="font-karla font-700" style={{ fontSize: '0.7rem', color: '#8a8480', letterSpacing: '0.06em', marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
      {(elapsedMs / 1000).toFixed(1)}s
    </p>
  )
}

function ResultCard({ fish, baitSaved, isNewSpecies, isPerfect, xpGained, doubleCatch, gemEarned, perfectStreak = 1, streakBonusXP = 0, jackpotMultiplier, perfectXpMult = 1, lockedStage = 0, catchQty = 1, ancientCount = 0, ancientTotal = 6, sizeIn, sizeMin, sizeMax, sizeTier, isPB, previousBest, isShiny = false, deepStirs = false }: {
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
  perfectXpMult?: number
  /** Locked-In Rod active stage this catch (0 base · 1 speed · 2 +triple · 3 LOCKED IN). */
  lockedStage?: number
  /** Fish actually banked this catch (3 on a Locked-In triple). */
  catchQty?: number
  ancientCount?: number
  ancientTotal?: number
  // ── Per-catch size variance (lib/fishSize) ──
  sizeIn: number
  sizeMin?: number
  sizeMax?: number
  sizeTier?: FishSizeTier
  isPB: boolean
  previousBest: number | null
  /** Pokémon-style ultra-rare gold variant — gated server-side on a
   *  Perfect catch + 1/SHINY_ODDS roll. When true, the card swaps to
   *  the gold/amber palette and the fish image gets the SHINY_FISH_FILTER
   *  so the entire result moment reads as premium. */
  isShiny?: boolean
  /** Ancient Deep: rare, subtle omen line nudging toward a rarer lure without
   *  naming it — shown only on a common-bait catch while trophies remain. */
  deepStirs?: boolean
}) {
  // 'Ancient' card treatment is the red boss palette + heavy
  // burst / ominous chrome reserved for the 6 trophies. The 12 new
  // ancient_deep regulars added 2026-06-10 are still ancient-zone catches
  // but read as "regular high-value fish", not boss reveals, so they
  // fall back to the standard bite_rarity treatment (rare blue / epic
  // purple / legendary gold). Discriminator: sell_value 0 = trophy,
  // matches the trophy/inventory routing split server-side.
  const isAncient = fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
  const rarity = fish.bite_rarity ?? 1
  const baseR = RARITY[rarity] ?? RARITY[1]

  // ── Size readout count-up ─────────────────────────────────────────────────
  // Slot-machine roll: the size number ticks from 0 up to the rolled length
  // over ~700ms with an ease-out curve, then locks. Single rAF loop; no state
  // outside this component touched. Animated value drives the rendered string
  // but the underlying sizeIn stays canonical for math.
  const hasSize = sizeIn > 0
  // Shiny suppresses ALL size-related UI: hero readout, range bar,
  // trophy/large pill, PB ribbon. Shinies are always Trophy-tier by
  // design (server forces max length), so the size info is redundant
  // and just crowds the moment. The gold fish IS the celebration.
  const showRange = hasSize && !isAncient && !isShiny && sizeMin != null && sizeMax != null && sizeMax > sizeMin
  const [displaySize, setDisplaySize] = useState(0)
  useEffect(() => {
    if (!hasSize) return
    let raf = 0
    let start = 0
    const dur = 550
    const target = sizeIn
    const tick = (t: number) => {
      if (!start) start = t
      const elapsed = t - start
      const p = Math.min(1, elapsed / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplaySize(target * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [sizeIn, hasSize])
  const sizePercentile = showRange ? Math.max(0, Math.min(1, (sizeIn - sizeMin!) / (sizeMax! - sizeMin!))) : 0.5
  const isPBMoment = !isAncient && !isShiny && isPB
  // LARGE / TROPHY pill. tierShowsPill has always said these two earn a
  // callout and the card comments have always claimed one renders, but none
  // ever did: sizeTier was destructured and never read, so a 3%-roll Trophy
  // looked exactly like a 47% Average except for where the needle sat.
  // Gated on showRange because a tier is meaningless without the species
  // range behind it, and off shinies (always Trophy by design, and the gold
  // fish is already the celebration).
  const tierPill = !isShiny && !isAncient && showRange && sizeTier && tierShowsPill(sizeTier) ? sizeTier : null
  const isTrophyCatch = tierPill === 'trophy'
  // Shiny copy — picked once per catch (memoised on fish.id) so it
  // doesn't reshuffle on every re-render. Empty string when not shiny.
  const shinyMessage = useMemo(
    () => (isShiny ? pickShinyMessage(fish.name) : ''),
    [isShiny, fish.name],
  )

  // PB overlay is transient — sits over the fish image like a victory ribbon
  // for ~2.6s, then fades out so the rest of the card can be inspected. Stays
  // mounted long enough for the count-up to land and the player to register
  // the moment without freezing the celebration on screen forever.
  const [pbOverlayVisible, setPbOverlayVisible] = useState(isPBMoment)
  useEffect(() => {
    if (!isPBMoment) return
    setPbOverlayVisible(true)
    const t = setTimeout(() => setPbOverlayVisible(false), 2600)
    return () => clearTimeout(t)
  }, [isPBMoment])

  // Ancient deep gets its own palette + label, overriding the gold legendary look.
  // Shiny ("Golden" in player-facing copy — the internal variable name is kept
  // as isShiny to avoid touching every reference) overrides BOTH (rarity +
  // ancient) with the premium gold theme so the moment reads as the headline
  // reward of the catch, not a sub-modifier.
  const r = isShiny
    ? { label: 'Golden ✦', color: SHINY_THEME.primary, hookedText: baseR.hookedText }
    : isAncient
      ? { label: 'Ancient', color: '#e11d48', hookedText: baseR.hookedText }
      : baseR
  const isLegendary = rarity === 5 && !isAncient
  const isEpicPlus  = isShiny || rarity >= 4

  // Inset-only halos so the scrollable parent (overflowY:auto on the
  // catching area at line ~4797) can't clip the glow to a rectangle.
  // Same blur radii / alphas as the prior outer-shadow recipe — the
  // effect now reads as "lit from within" instead of "halo around"
  // but the saturation + brightness budget is the same, so each
  // rarity still tiers up visibly. The longest insets on rarity 5
  // extend well past the card's interior so the gradient continues
  // to fade through the whole card body.
  const glowShadow: Record<number, string> = {
    1: 'none',
    2: `inset 0 0 10px ${r.color}40, inset 0 0 28px ${r.color}22`,
    3: `inset 0 0 18px ${r.color}55, inset 0 0 44px ${r.color}30`,
    4: `inset 0 0 26px ${r.color}70, inset 0 0 60px ${r.color}3a`,
    5: `inset 0 0 32px ${r.color}88, inset 0 0 80px ${r.color}4a, inset 0 0 130px ${r.color}28`,
  }
  const borderOpMap: Record<number, string> = { 1: '55', 2: '70', 3: '88', 4: 'aa', 5: 'cc' }
  // Shiny matches the Treasure premium avatar background exactly:
  // bright cream-yellow center → warm amber → deep espresso edges.
  // Combined with the slow rotating blurred sunburst overlay below
  // (also lifted from .avatar-bg-treasure in globals.css), this gives
  // the same "premium glowing gold" feel as the Treasure avatar bg
  // that the player called out as the best-looking gold treatment.
  const cardBg = isShiny
    ? 'radial-gradient(circle at 50% 45%, #fde68a 0%, #b45309 55%, #4a2007 100%)'
    : 'rgba(6,16,26,0.82)'
  // Subtle warm inset glow only around the edges — gives the gold
  // border a soft "framed" depth like polished metal catching light.
  // Kept low-alpha so it doesn't reach the center and wash out the
  // fish or body text.
  const shinyGlow: string | undefined = 'inset 0 0 22px rgba(200,140,40,0.18), inset 0 0 1px rgba(255,225,140,0.55)'
  // Sparkles are now concentrated AROUND the fish (not the whole
  // card) so they reinforce the fish-is-the-wow framing. Positions
  // are roughly bounded to the central fish image area; sizes
  // vary so the field has texture without a uniform grid look.
  const shinySparkles = useMemo(
    () => Array.from({ length: 8 }, () => ({
      // Polar around center, biased to a halo radius so the sparkles
      // ring the fish without sitting directly on it.
      angle: Math.random() * Math.PI * 2,
      radius: 38 + Math.random() * 32,        // % from center
      size: 3 + Math.random() * 4,            // 3–7px
      delay: Math.random() * 2.5,
      duration: 1.8 + Math.random() * 1.4,
    })),
    [],
  )

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 330, margin: '0 auto' }}>

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

      {/* Compact banner row — perfect / double / jackpot / gem / trophy /
          large / PB all collapse into a single flex-wrap row of slim pills
          so they never push the cast button or bottom nav off the screen.
          Each pill keeps its own accent color + the same gradient + top-
          accent chrome as before, just at ~32px tall instead of ~80px.
          Size-tier pills (Trophy / Large) and the PB pill render first so
          they catch the eye on the dopamine moments. */}
      {(tierPill || isPerfect || (jackpotMultiplier && jackpotMultiplier > 1) || doubleCatch || gemEarned || lockedStage > 0 || catchQty > 1) && (
        <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
          {/* Size tier leads the row — it is the rarest thing on most cards. */}
          {tierPill && (() => {
            const tc = TIER_COLOR[tierPill]
            const rgb = isTrophyCatch ? '251,191,36' : '96,165,250'
            return (
              <div style={{ position: 'relative', display: 'inline-flex' }}>
                {/* Trophy alone gets the burst. Large is common enough (15%)
                    that ringing it every time would cheapen both. */}
                {isTrophyCatch && [0, 0.1, 0.2].map((delay, i) => (
                  <motion.div key={i}
                    initial={{ scale: 0.85, opacity: 0.75 - i * 0.2 }}
                    animate={{ scale: 2.3 - i * 0.25, opacity: 0 }}
                    transition={{ duration: 0.6, ease: 'easeOut', delay }}
                    style={{ position: 'absolute', inset: 0, borderRadius: 999,
                      border: `${1.5 - i * 0.3}px solid rgba(${rgb},${0.75 - i * 0.2})`, pointerEvents: 'none' }} />
                ))}
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="font-karla font-700 uppercase"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    background: `linear-gradient(180deg, rgba(${rgb},0.22) 0%, rgba(${rgb},0.06) 100%), #0d1320`,
                    border: `1px solid rgba(${rgb},0.5)`,
                    borderTop: `1px solid rgba(${rgb},0.8)`,
                    borderRadius: 999,
                    boxShadow: isTrophyCatch ? `0 0 16px rgba(${rgb},0.4)` : `0 0 9px rgba(${rgb},0.24)`,
                    padding: '0.36rem 0.72rem',
                    fontSize: '0.62rem', letterSpacing: '0.14em', color: tc,
                  }}>
                  {isTrophyCatch && <TrophyMark size={11} color={tc} />}
                  {TIER_LABEL[tierPill]}
                </motion.div>
              </div>
            )
          })()}
          {isPerfect && (() => {
            const isOnFire = perfectStreak >= 3
            const isIgnition = perfectStreak === 3
            const s = Math.min(perfectStreak, 6)
            const accent = isOnFire ? '#fb923c' : '#fbbf24'
            const accentRgb = isOnFire ? '251,146,60' : '251,191,36'
            const glow = `0 0 ${10 + (s - 1) * 3}px rgba(${accentRgb},${0.30 + (s - 1) * 0.04})`
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
                  <span style={{ display: 'flex' }}>{isOnFire ? <IconFlame size={12} /> : <IconStar size={12} />}</span>
                  <span>{isOnFire ? 'On Fire' : 'Perfect'}</span>
                  {perfectStreak >= 2 && (
                    <span style={{ color: accent, letterSpacing: 0, textShadow: `0 0 8px rgba(${accentRgb},0.6)` }}>×{perfectStreak}</span>
                  )}
                  {baitSaved && <span style={{ color: '#86efac', letterSpacing: 0 }}>+bait</span>}
                </motion.div>
              </div>
            )
          })()}

          {/* Perfect Rod — ×N XP callout so the doubled-XP bonus is visible
              (only shows on a Perfect, which is the only time it applies). */}
          {isPerfect && perfectXpMult > 1 && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(147,197,253,0.22) 0%, rgba(147,197,253,0.06) 100%), #0a1020',
                border: '1px solid rgba(147,197,253,0.5)',
                borderTop: '1px solid rgba(147,197,253,0.8)',
                borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                letterSpacing: '0.12em', color: '#bfe3ff',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                boxShadow: '0 0 12px rgba(147,197,253,0.28)',
              }}
            >
              ×{perfectXpMult} XP
            </motion.div>
          )}

          {/* Locked-In Rod — the active stage this catch. Cyan (speed) → gold
              (triple) → prismatic (LOCKED IN), matching the rod glow. */}
          {lockedStage > 0 && (() => {
            const c = lockedStage >= 3 ? '#e879f9' : lockedStage === 2 ? '#f0c040' : '#22d3ee'
            const rgb = lockedStage >= 3 ? '232,121,249' : lockedStage === 2 ? '240,192,64' : '34,211,238'
            const label = lockedStage >= 3 ? 'Locked In' : lockedStage === 2 ? 'Locked In · Triple' : 'Locked In · Fast'
            return (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="font-karla font-700 uppercase"
                style={{
                  background: `linear-gradient(180deg, rgba(${rgb},0.22) 0%, rgba(${rgb},0.06) 100%), #0d1320`,
                  border: `1px solid rgba(${rgb},0.5)`, borderTop: `1px solid rgba(${rgb},0.82)`,
                  borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                  letterSpacing: '0.14em', color: c,
                  display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                  boxShadow: `0 0 ${8 + lockedStage * 4}px rgba(${rgb},0.32)`,
                }}
              >
                <IconFlame size={11} /> {label}
              </motion.div>
            )
          })()}

          {/* Locked-In triple haul (guaranteed ×3 at streak 5+). */}
          {catchQty > 1 && !doubleCatch && (!jackpotMultiplier || jackpotMultiplier <= 1) && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              className="font-karla font-700 uppercase"
              style={{
                background: 'linear-gradient(180deg, rgba(240,192,64,0.22) 0%, rgba(240,192,64,0.06) 100%), #1a1304',
                border: '1px solid rgba(240,192,64,0.5)', borderTop: '1px solid rgba(240,192,64,0.82)',
                borderRadius: 999, padding: '0.36rem 0.72rem', fontSize: '0.62rem',
                letterSpacing: '0.12em', color: '#f0c040',
                display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                boxShadow: '0 0 12px rgba(240,192,64,0.24)',
              }}
            >
              ×{catchQty} Haul
            </motion.div>
          )}

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

        {/* ── Cinematic golden light shaft (shiny only) ──────────────
            A tall, narrow column of warm light that drops down behind
            the card during the reveal — like the heavens cracking open
            on a trophy pull. Starts above the card, sweeps down past
            the bottom over ~1.2s, peaks in opacity around the moment
            the fish punches in. Soft blur + wide gradient edges so it
            reads as light, not a shape. */}
        {isShiny && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0, y: -80, scaleY: 0.6 }}
            animate={{ opacity: [0, 0.7, 0.5, 0], y: [-80, -20, 20, 60], scaleY: [0.6, 1.05, 1.1, 1.2] }}
            transition={{ duration: 1.4, ease: 'easeOut', delay: 0.1, times: [0, 0.4, 0.65, 1] }}
            style={{
              position: 'absolute', top: '-30%', left: '50%',
              width: 220, height: '160%',
              marginLeft: -110,
              background: 'linear-gradient(180deg, transparent 0%, rgba(255,235,160,0.35) 12%, rgba(255,210,90,0.55) 38%, rgba(255,225,140,0.45) 62%, rgba(255,210,90,0.25) 82%, transparent 100%)',
              filter: 'blur(10px)',
              pointerEvents: 'none',
              zIndex: 0,
              mixBlendMode: 'screen',
            }}
          />
        )}

        {/* ── Outer glow ring — shockwave that radiates outward from
            behind the card as it lands. Single expanding ring, gold,
            heavily blurred — the "impact" pulse. Fires once at delay
            0.16s so it coincides with the card's spring-overshoot
            apex. */}
        {isShiny && (
          <motion.div
            aria-hidden
            initial={{ opacity: 0.75, scale: 0.6 }}
            animate={{ opacity: 0, scale: 2.4 }}
            transition={{ duration: 0.9, ease: 'easeOut', delay: 0.16 }}
            style={{
              position: 'absolute', inset: 0,
              borderRadius: '50%',
              border: '4px solid rgba(255,225,140,0.85)',
              boxShadow: '0 0 40px rgba(255,210,90,0.7), inset 0 0 24px rgba(255,235,160,0.6)',
              filter: 'blur(2px)',
              pointerEvents: 'none', zIndex: 0,
            }}
          />
        )}

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

        {/* Legendary color bloom — suppressed for shiny (own gold treatment) */}
        {isLegendary && !isShiny && (
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

        {/* Glow halo previously sat as a separate motion.div behind the
            card (inset:-1, boxShadow: outer rarity glow). Moved onto
            the card itself as inset shadows below — the scrollable
            parent (overflowY:auto on the catching area) was clipping
            the outer halo to a rectangle on every rarity, losing the
            rounded corners. Insets render inside the card's bounds so
            the rounding is preserved. Pulse for epic+ became a soft
            opacity oscillation on a separate radial-gradient overlay
            so the highlight still breathes. */}
        {rarity >= 2 && !isShiny && isEpicPlus && (
          <motion.div
            animate={{ opacity: [0.45, 0.85, 0.45] }}
            transition={{ duration: isLegendary ? 1.2 : 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', inset: 0, borderRadius: '1rem',
              background: `radial-gradient(ellipse at 50% 55%, ${r.color}28 0%, transparent 70%)`,
              pointerEvents: 'none', zIndex: 1,
            }}
          />
        )}

      {/* Card. Shiny punches in faster + bigger overshoot — a real
          spring snap rather than the slow settle the legendary uses.
          Combined with the burst + particle explosion below this is
          the "dopamine shot" moment when the card lands.
          When shiny, the background-position also continuously drifts
          to create the holographic foil shimmer across the iridescent
          jewel-tone gradient. background-size on the style is 300%
          300% so the gradient has room to travel without exposing the
          repeat seam. */}
      <motion.div
        initial={{ opacity: 0, y: isShiny ? -90 : isAncient ? 48 : isLegendary ? 40 : isEpicPlus ? 24 : 16, scale: isShiny ? 0.42 : isAncient ? 0.78 : isLegendary ? 0.84 : isEpicPlus ? 0.91 : 0.96, rotate: isShiny ? -22 : 0 }}
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: isShiny ? 200 : isAncient ? 110 : isLegendary ? 140 : isEpicPlus ? 210 : 280, damping: isShiny ? 12 : isAncient ? 10 : isLegendary ? 11 : isEpicPlus ? 16 : 22, delay: isShiny ? 0.12 : isAncient ? 0.18 : isLegendary ? 0.1 : 0 }}
        className={isShiny ? 'overflow-hidden' : 'rounded-2xl overflow-hidden'}
        style={{
          // Shiny gets strongly rounded corners (2.5rem) for a
          // polished treasure-chest-trim / coin-slab silhouette
          // that reads distinct from the standard rounded-2xl
          // (~1rem) used by every other catch card.
          border: isShiny
            ? '2px solid rgba(228,188,108,0.85)'
            : `1px solid ${r.color}${borderOpMap[rarity] ?? '55'}`,
          borderRadius: isShiny ? '2.5rem' : undefined,
          background: cardBg,
          // Non-shiny cards are translucent; a light frosted blur keeps the
          // text crisp over the fishing scene behind.
          ...(isShiny ? {} : { backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }),
          position: 'relative', zIndex: 1,
          // Shiny → its own gold inset glow; everything else → the
          // rarity-tiered inset halo (replaces the prior outer halo
          // motion.div that was getting clipped by the scrollable
          // parent). Rarity-1 commons get no glow as before.
          boxShadow: isShiny ? shinyGlow : (rarity >= 2 ? glowShadow[rarity] : undefined),
        }}
      >
        {/* ── Treasure-style gold overlay for shiny ─────────────────
            Lifted directly from .avatar-bg-treasure in globals.css —
            the same premium golden bg the player loves on the avatar.
            A slow-rotating blurred conic-gradient creates a soft
            sunburst of light that drifts across the gold surface
            (14s per rotation). Sits on top of the radial gold base
            (cardBg above) but below the content (zIndex 1).
            All pointer-events: none so it doesn't intercept taps. */}
        {isShiny && (
          <motion.div
            aria-hidden
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
            style={{
              position: 'absolute', inset: '-30%',
              background: `conic-gradient(from 0deg,
                rgba(255, 248, 200, 0.55), rgba(255, 248, 200, 0) 22%,
                rgba(255, 248, 200, 0.45), rgba(255, 248, 200, 0) 50%,
                rgba(255, 248, 200, 0.55), rgba(255, 248, 200, 0) 78%,
                rgba(255, 248, 200, 0.55))`,
              filter: 'blur(4px)',
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {/* Legendary shimmer sweep */}
        {isLegendary && !isShiny && (
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

        {/* Header band — rarity tag + "New Species" if applicable. Hidden
            entirely on common catches that aren't new species: that's the
            most-frequent path, and the band was a whole row of chrome just
            to say "yeah, normal one." Epic+ rarity gets the band (chrome
            reinforces the moment); a common first-catch gets the band so
            the New badge has a home. Zone label dropped long ago. */}
        {/* Rarity band. The big "SHINY" hero was removed (the fish is
            the wow now) — but the small "Shiny ✦" label here still
            tells the player what just happened, sitting alongside any
            "New ✦" pill. Shiny uses cream-on-dark instead of gold-on-
            gold (which had no contrast). */}
        {(rarity >= 2 || isNewSpecies || isShiny) && (
          <div className="px-4 py-2 flex items-center justify-center gap-2"
            style={{
              position: 'relative', zIndex: 2,
              // Warm dark amber band for shiny — matches the trophy-
              // plaque card chrome. Bottom edge gets a soft gold line
              // to echo the outer gold border.
              background: isShiny ? 'rgba(34,22,8,0.62)' : `${r.color}28`,
              borderBottom: isShiny ? '1px solid rgba(200,160,90,0.4)' : `1px solid ${r.color}45`,
            }}>
            <span className="font-karla font-700 uppercase tracking-[0.18em]"
              style={{
                fontSize: '0.58rem',
                color: isShiny ? '#fff2cc' : r.color,
                background: isShiny ? 'rgba(80,52,18,0.5)' : `${r.color}1c`,
                border: isShiny ? '1px solid rgba(218,178,98,0.65)' : `1px solid ${r.color}45`,
                padding: '0.18rem 0.6rem', borderRadius: '2rem',
                textShadow: isShiny ? '0 0 8px rgba(251,204,74,0.55)' : 'none',
              }}>
              {r.label}{!isShiny && rarity >= 4 ? ' ✦' : ''}
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
        )}

        {/* Body — fish is the hero, but the card has to fit on screen
            without scrolling. Tight top/bottom padding + a shrunken image
            keep the whole result block in view even with the Ancient
            banner + 4 pills above on a small phone. */}
        <div style={{ position: 'relative', zIndex: 2, padding: isShiny ? '0.35rem 0.85rem 0.55rem' : '0.5rem 0.6rem 0.65rem' }}>
          {/* Fish image — entrance bounce so it FEELS like a reveal.
              Wrapped in a position:relative so the transient PB ribbon can
              overlay directly on top of the fish (auto-dismisses ~2.6s
              after the catch). Height intentionally compact so the card
              fits a tall result phase without scrolling. */}
          <motion.div
            initial={{ scale: 0.6, opacity: 0, rotate: -8 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.04 }}
            style={{
              position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              // Shiny hugs the fish — no minHeight padding, tighter
              // marginBottom — so the bigger sprite fills the card chrome
              // without empty halo space around it.
              marginBottom: isShiny ? '0.05rem' : '0.1rem',
            }}
          >
            {/* DOPAMINE-SHOT v2 — layered burst sequence on entry. */}
            {isShiny && (
              <>
                {/* 1) Bright white-cored flash. Punches the catch with a
                       hard pop of light before settling into the warmer
                       burst beneath it. */}
                <div aria-hidden style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 160, height: 160,
                  marginLeft: -80, marginTop: -80,
                  pointerEvents: 'none', zIndex: 1,
                }}>
                  <motion.div
                    initial={{ opacity: 1, scale: 0 }}
                    animate={{ opacity: 0, scale: 3.6 }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
                    style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(255,255,255,0.96) 0%, rgba(255,235,150,0.75) 28%, rgba(255,200,80,0.4) 55%, transparent 75%)',
                    }}
                  />
                </div>

                {/* 2) Warm gold burst — lingers a little longer than the
                       white flash, fading from scale 0 to 4.5 over 0.95s. */}
                <div aria-hidden style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 200, height: 200,
                  marginLeft: -100, marginTop: -100,
                  pointerEvents: 'none', zIndex: 1,
                }}>
                  <motion.div
                    initial={{ opacity: 0.85, scale: 0 }}
                    animate={{ opacity: 0, scale: 4.5 }}
                    transition={{ duration: 0.95, ease: 'easeOut', delay: 0.22 }}
                    style={{
                      width: '100%', height: '100%',
                      borderRadius: '50%',
                      background: 'radial-gradient(circle, rgba(255,225,140,0.9) 0%, rgba(255,200,80,0.6) 26%, rgba(251,191,36,0.22) 55%, transparent 75%)',
                    }}
                  />
                </div>

                {/* 3) Concentric ring waves — 3 expanding gold rings,
                       staggered by 150ms each. Reads like the catch
                       is sending pulses of energy outward. Each ring
                       is just a border with no fill, so they read as
                       sharp pulses rather than soft blooms. */}
                {[0, 0.15, 0.3].map((extraDelay, i) => (
                  <div key={`ring-${i}`} aria-hidden style={{
                    position: 'absolute', top: '50%', left: '50%',
                    width: 70, height: 70,
                    marginLeft: -35, marginTop: -35,
                    pointerEvents: 'none', zIndex: 1,
                  }}>
                    <motion.div
                      initial={{ scale: 0, opacity: 0.95 }}
                      animate={{ scale: 4.2, opacity: 0 }}
                      transition={{ duration: 1.1, ease: 'easeOut', delay: 0.28 + extraDelay }}
                      style={{
                        width: '100%', height: '100%',
                        borderRadius: '50%',
                        border: '2px solid rgba(255,225,140,0.85)',
                        boxShadow: '0 0 16px rgba(255,210,90,0.85), inset 0 0 12px rgba(255,235,160,0.55)',
                      }}
                    />
                  </div>
                ))}
              </>
            )}

            {/* Particle burst — 15 sparkles now (was 10), flying farther
                (110-160px instead of 75-110), with a tiny random rotation
                tumble during travel. Wraps each in a static-positioned
                span so framer-motion's x/y animation doesn't fight a
                centering transform. */}
            {isShiny && (
              <div aria-hidden style={{ position: 'absolute', top: '50%', left: '50%', width: 0, height: 0, pointerEvents: 'none', zIndex: 3 }}>
                {Array.from({ length: 15 }).map((_, i) => {
                  const angle = (i / 15) * Math.PI * 2 + Math.random() * 0.25
                  const distance = 110 + Math.random() * 50
                  const tumble = (Math.random() - 0.5) * 180
                  return (
                    <motion.span
                      key={i}
                      initial={{ opacity: 1, x: 0, y: 0, scale: 0.4, rotate: 0 }}
                      animate={{
                        opacity: [1, 1, 0],
                        x: Math.cos(angle) * distance,
                        y: Math.sin(angle) * distance,
                        scale: [0.4, 1.2, 0.6],
                        rotate: tumble,
                      }}
                      transition={{ duration: 1.0, ease: 'easeOut', delay: 0.24 + i * 0.008, times: [0, 0.55, 1] }}
                      style={{
                        position: 'absolute',
                        top: -4, left: -4,
                        width: 8, height: 8,
                        borderRadius: '50%',
                        background: '#fff8dc',
                        boxShadow: '0 0 10px #fbcc4a, 0 0 22px rgba(251,204,74,0.85)',
                      }}
                    />
                  )
                })}
              </div>
            )}

            {/* Radial halo behind the fish removed — even with
                border-radius:50% and no filter:blur, the radial
                gradient div's 220×220 bounds rendered as a visible
                rectangle against the warm card background (the
                circular fade blended into the surrounding warmth
                and the element's square footprint showed through).
                The fish's own gold rim drop-shadow + the entrance
                burst + the orbiting sparkles supply all the ambient
                gold light without needing a static halo div behind. */}

            {/* Sparkles ringing the fish in polar coords from center.
                Same wrapper-split as the halo above: outer span owns
                the static polar position + the translate(-50%,-50%)
                centering, inner motion.span owns the scale/opacity
                animation. Without the split, framer-motion's scale
                animation overwrote the centering translate and the
                sparkle dot slid off-position by half its size on each
                animation frame. */}
            {isShiny && (
              <div aria-hidden style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
                {shinySparkles.map((s, i) => (
                  <span
                    key={i}
                    style={{
                      position: 'absolute',
                      left: `calc(50% + ${Math.cos(s.angle) * s.radius}%)`,
                      top:  `calc(50% + ${Math.sin(s.angle) * s.radius}%)`,
                      width: s.size, height: s.size,
                      transform: 'translate(-50%, -50%)',
                      display: 'block',
                    }}
                  >
                    <motion.span
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
                      transition={{ duration: s.duration, delay: s.delay, repeat: Infinity, repeatDelay: 0.8, ease: 'easeOut' }}
                      style={{
                        display: 'block',
                        width: '100%', height: '100%',
                        borderRadius: '50%',
                        background: '#fffbe6',
                        boxShadow: `0 0 ${s.size * 3}px #fbcc4a, 0 0 ${s.size * 7}px rgba(251,204,74,0.65)`,
                      }}
                    />
                  </span>
                ))}
              </div>
            )}

            {/* Fish image — double-wrap for shiny:
                  outer motion.div: punch-in animation (one-shot).
                    scale 0 → 1.25 (big overshoot) → 0.95 → 1.0 over
                    ~0.65s with a spring-like ease, so the fish
                    literally PUNCHES INTO the card after the burst.
                  inner motion.div: breathing animation (infinite),
                    delayed until after the punch-in lands so the
                    two never conflict.
                Earlier 68% / 190px / 108px size kept; the entrance
                drama comes from the punch-in motion, not raw size. */}
            <motion.div
              initial={isShiny ? { scale: 0, opacity: 0 } : false}
              animate={isShiny ? { scale: [0, 1.25, 0.92, 1.04, 1], opacity: 1 } : undefined}
              transition={isShiny ? { duration: 0.65, ease: 'easeOut', delay: 0.32, times: [0, 0.45, 0.65, 0.85, 1] } : undefined}
              style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <motion.div
                animate={isShiny ? { y: [0, -2.5, 0], scale: [1, 1.022, 1] } : undefined}
                transition={isShiny ? { duration: 2.8, repeat: Infinity, ease: 'easeInOut', delay: 1.1 } : undefined}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <FishImg
                  name={fish.name}
                  style={{
                    // Shiny gets a noticeably bigger fish so it dominates
                    // the card like a SIR full-art (the art is meant to
                    // BE the card, not be framed by the chrome). Tuned
                    // up to 138px with the surrounding container hugging
                    // tight (no minHeight padding) so the bigger sprite
                    // gains presence without the card itself growing.
                    // Normal catches got bumped too (was 62%/170/92) — the
                    // fish was swimming in empty padding; now it fills the
                    // card width and stands taller as the hero art.
                    width: isShiny ? '88%' : '86%',
                    maxWidth: isShiny ? 240 : 250,
                    // Box height hugs the (wide) art so there's no dead
                    // vertical space above/below — width is the constraint at
                    // this size, so trimming height doesn't shrink the fish.
                    height: isShiny ? 138 : 104,
                    objectFit: 'contain',
                    // Shiny stacks the gold filter (lib/shiny.ts) on top
                    // of a warm drop-shadow for the "hovering metal" feel.
                    filter: isShiny
                      ? `${SHINY_FISH_FILTER} drop-shadow(0 8px 18px rgba(120,70,8,0.55))`
                      : `drop-shadow(0 6px 14px ${r.color}55)${isEpicPlus ? ` drop-shadow(0 0 22px ${r.color}40)` : ''}`,
                  }}
                />
              </motion.div>
            </motion.div>

            {/* PB ribbon — overlays the fish on a personal-best catch, then
                fades out so the rest of the card can be read. Plain-English
                copy ("Your biggest yet!") for non-jargon clarity.
                The outer wrapper handles centering (translate -50%/-50%)
                statically because framer-motion's y/scale animations write
                the whole transform property and would clobber a static
                translate, shifting the ribbon off-center. AnimatePresence
                lives inside the centering shell. */}
            {isPBMoment && (
              <div style={{
                position: 'absolute', top: '38%', left: '50%',
                transform: 'translate(-50%, -50%)',
                pointerEvents: 'none', zIndex: 5,
              }}>
                <AnimatePresence>
                  {pbOverlayVisible && (
                    <motion.div
                      key="pb-ribbon"
                      initial={{ opacity: 0, y: 8, scale: 0.85 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.95 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 18, delay: 0.45 }}
                      className="font-karla font-700 uppercase"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        padding: '0.4rem 0.85rem', borderRadius: 999,
                        fontSize: '0.66rem', letterSpacing: '0.16em',
                        color: '#5eead4',
                        // Translucent so the fish still reads through the ribbon
                        // instead of being hidden behind a solid card.
                        background: 'linear-gradient(180deg, rgba(15,30,28,0.5) 0%, rgba(8,18,18,0.5) 100%)',
                        backdropFilter: 'blur(6px)',
                        WebkitBackdropFilter: 'blur(6px)',
                        border: '1px solid rgba(94,234,212,0.55)',
                        boxShadow: '0 0 18px rgba(94,234,212,0.45), 0 6px 22px rgba(0,0,0,0.45)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span aria-hidden style={{ fontSize: '0.84rem', display: 'flex' }}><IconTrophy size={13} /></span>
                      <span>Your biggest yet!</span>
                      {previousBest != null && (
                        <span style={{ color: '#99f6e4', letterSpacing: 0 }}>+{(sizeIn - previousBest).toFixed(1)} in</span>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          </motion.div>

          {/* Name. Shiny gets bigger, more ornate Cinzel + a wide
              gold gradient text with a soft warm shadow — reads as the
              centerpiece of the holographic card. Regular catches keep
              the standard size. Shiny also prefixes the species name
              with "Golden" so the card actually reads as e.g.
              "Golden Pickerel" instead of just "Pickerel". */}
          <p className="font-cinzel font-700 text-center"
            style={isShiny ? {
              fontSize: '1.55rem',
              letterSpacing: '0.06em',
              lineHeight: 1.1,
              marginBottom: '0.5rem',
              background: 'linear-gradient(180deg, #ffeec0 0%, #e6b85a 55%, #a87a2e 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              filter: 'drop-shadow(0 1px 0 rgba(60,30,4,0.7)) drop-shadow(0 0 18px rgba(251,191,36,0.55))',
            } : {
              fontSize: '1.25rem',
              color: r.color,
              lineHeight: 1.1,
              marginBottom: hasSize ? '0.35rem' : '0.55rem',
            }}>
            {isShiny ? `Golden ${fish.name}` : fish.name}
          </p>

          {/* Ancient Deep breadcrumb — a rare, faint omen on a common-bait catch
              while giants remain. Deliberately vague: it never names the lure,
              only that something down there did not rise. Pairs with the lures'
              own "the oldest things rise for its shine" flavor. */}
          {deepStirs && (
            <p className="font-karla italic text-center" style={{ fontSize: '0.62rem', color: 'rgba(192,132,252,0.72)', lineHeight: 1.4, marginTop: '-0.15rem', marginBottom: '0.5rem' }}>
              Something vast stirred in the black below, and did not rise.
            </p>
          )}

          {/* Ornate gold divider — only on shiny. Reads as a holographic
              card's section break with two flanking diamond dots. */}
          {isShiny && (
            <div aria-hidden style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, marginBottom: '0.5rem',
            }}>
              <div style={{ width: 38, height: 1, background: 'linear-gradient(90deg, transparent, rgba(228,188,108,0.85), transparent)' }} />
              <span style={{ width: 5, height: 5, transform: 'rotate(45deg)', background: 'rgba(228,188,108,0.95)', boxShadow: '0 0 6px rgba(251,191,36,0.7)' }} />
              <div style={{ width: 38, height: 1, background: 'linear-gradient(90deg, transparent, rgba(228,188,108,0.85), transparent)' }} />
            </div>
          )}

          {/* ── Size readout — the new hero of the card ──
              Big counter that ticks up from 0 over ~700ms; range bar below
              shows where this catch landed in the species's range. Large and
              Trophy tint the bar, the needle and the length itself. Ancients
              get just the canonical number — no range bar (single defined
              catch, nothing to compare to). */}
          {hasSize && !isShiny && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, delay: 0.1 }}
              style={{ textAlign: 'center', marginBottom: '0.5rem' }}
            >
              {/* Sell ⟡ + XP are the headline row now (skipped for ancients —
                  trophies have no sale). The catch length drops down into the
                  range labels under the bar so it reads in the context of the
                  species's min/max. */}
              {!isAncient && (
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12 }}>
                  <span className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 11px rgba(240,192,64,0.32)', fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
                    {fish.sell_value.toLocaleString()}<span style={{ fontSize: '0.95rem', marginLeft: 3 }}>⟡</span>
                  </span>
                  {xpGained > 0 && (
                    <>
                      <span style={{ color: '#3a3835', fontSize: '0.8rem' }}>·</span>
                      <span className="font-karla font-700" style={{ fontSize: '0.95rem', color: '#86efac', lineHeight: 1, whiteSpace: 'nowrap' }}>
                        +{xpGained} XP
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Length stands alone (centered) only when there's no range bar
                  to host it — ancients and any fish without a real range. */}
              {!showRange && (
                <span
                  className="font-cinzel font-700"
                  style={{
                    display: 'inline-block',
                    marginTop: isAncient ? 0 : '0.35rem',
                    fontSize: '1.85rem', lineHeight: 1,
                    color: '#f0ede8',
                    textShadow: '0 0 12px rgba(255,255,255,0.18)',
                    fontFeatureSettings: '"tnum"',
                    letterSpacing: '0.01em',
                  }}
                >
                  {formatFishLength(displaySize)}
                </span>
              )}

              {/* Range bar — only when there's a real range. Slim track with
                  a glowing needle at the catch's percentile. Labels at the
                  ends so the player learns the species's natural scale. */}
              {showRange && (
                <div style={{ marginTop: 8, padding: '0 0.3rem' }}>
                  <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'visible' }}>
                    {/* Fill from min up to the needle so the catch's spot in
                        the range reads at a glance. */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${sizePercentile * 100}%`,
                      // The bar carries the tier too, so the cue is where the
                      // player is already looking to judge the catch.
                      background: tierPill
                        ? `linear-gradient(90deg, ${TIER_COLOR[tierPill]}22 0%, ${TIER_COLOR[tierPill]} 100%)`
                        : 'linear-gradient(90deg, rgba(176,141,79,0.12) 0%, rgba(176,141,79,0.55) 100%)',
                      borderRadius: 3,
                    }} />
                    {/* Needle */}
                    <motion.div
                      initial={{ left: 0, opacity: 0 }}
                      animate={{ left: `${sizePercentile * 100}%`, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 18, delay: 0.45 }}
                      style={{
                        position: 'absolute', top: '50%',
                        width: 3, height: 14,
                        marginLeft: -1.5, marginTop: -7,
                        borderRadius: 2,
                        background: tierPill ? TIER_COLOR[tierPill] : '#f0ede8',
                        boxShadow: tierPill
                          ? `0 0 ${isTrophyCatch ? 12 : 8}px ${TIER_COLOR[tierPill]}`
                          : '0 0 6px rgba(255,255,255,0.35)',
                      }}
                    />
                  </div>
                  {/* Min — the caught length (the hero, brighter & larger) —
                      max. Putting the catch between its bounds, right under
                      the needle, reads in context of where it landed. */}
                  <div className="flex justify-between items-baseline" style={{ marginTop: 9 }}>
                    <span style={{ fontSize: '0.5rem', color: '#5a5856', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{formatFishLength(sizeMin!)}</span>
                    <span className="font-cinzel font-700" style={{ fontSize: isTrophyCatch ? '1.25rem' : '1.05rem', color: tierPill ? TIER_COLOR[tierPill] : '#f0ede8', lineHeight: 1, textShadow: tierPill ? `0 0 12px ${TIER_COLOR[tierPill]}88` : '0 0 10px rgba(255,255,255,0.18)', fontFeatureSettings: '"tnum"' }}>{formatFishLength(displaySize)}</span>
                    <span style={{ fontSize: '0.5rem', color: '#5a5856', letterSpacing: '0.18em', textTransform: 'uppercase' }}>{formatFishLength(sizeMax!)}</span>
                  </div>
                </div>
              )}
              {/* "Largest you've caught" caption removed — the collection
                  drawer now owns per-species PB display. Result card stays
                  focused on THIS catch. */}
            </motion.div>
          )}

          {/* Shiny (and any sizeless catch) skips the flanked length row, so
              its sale + XP show on a compact centered line here instead. */}
          {!isAncient && (isShiny || !hasSize) && (
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 12, marginBottom: '0.5rem' }}>
              <span className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f0c040', lineHeight: 1, textShadow: '0 0 10px rgba(240,192,64,0.32)' }}>
                {(isShiny ? fish.sell_value * SHINY_SELL_MULT : fish.sell_value).toLocaleString()}<span style={{ fontSize: '0.78rem', marginLeft: 3 }}>⟡</span>
              </span>
              {xpGained > 0 && (
                <>
                  <span style={{ color: '#3a3835', fontSize: '0.7rem' }}>·</span>
                  <span className="font-karla font-700" style={{ fontSize: '0.82rem', color: '#86efac' }}>+{xpGained} XP</span>
                </>
              )}
            </div>
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

          {/* A captain's-log style message ONLY on shiny catches — a
              moment-of-record. The fun fact used to show here for normal
              catches, but nobody read it; it now lives in the collection log
              (each fish's Captain's Note), which keeps this card compact. */}
          {isShiny && (
            <p className="text-center" style={{
              fontFamily: 'Georgia, "Times New Roman", serif',
              fontSize: '0.74rem',
              fontStyle: 'italic',
              fontWeight: 500,
              color: 'rgba(238,210,150,0.92)',
              lineHeight: 1.4,
              padding: '0 0.4rem',
              textShadow: '0 0 12px rgba(245,205,110,0.25)',
            }}>
              &ldquo;{shinyMessage}&rdquo;
            </p>
          )}
        </div>
      </motion.div>
    </div>
    </div>
  )
}

// ─── Drawer helpers ──────────────────────────────────────────────────────────

function DrawerHandle({ dragHandleProps }: { dragHandleProps?: React.HTMLAttributes<HTMLDivElement> }) {
  // The drag area is enlarged via top/bottom padding so the visible 4px pill
  // sits inside a comfortable touch target. `touchAction: 'none'` keeps the
  // browser from claiming the gesture as a scroll before framer-motion's
  // drag-controls can start the drag.
  return (
    <div
      {...dragHandleProps}
      style={{
        display: 'flex', justifyContent: 'center', padding: '0.7rem 0 0.3rem',
        flexShrink: 0, cursor: 'grab', touchAction: 'none',
        ...dragHandleProps?.style,
      }}
    >
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

// Drag-only-from-handle variant. `dragListener: false` stops framer-motion
// from claiming touches anywhere on the drawer body; the handle's
// onPointerDown is the sole trigger for dragControls.start(). Use this on
// any drawer whose body contains a scrollable list — without it, swiping
// up inside the list (a downward finger gesture) drags the whole drawer
// down toward close instead of scrolling the list. Caller spreads
// motionProps onto the outer motion.div and passes handleProps to the
// DrawerHandle's dragHandleProps so the visual pill is the drag target.
function useDrawerDrag(onClose: () => void) {
  const controls = useDragControls()
  return {
    motionProps: {
      drag: 'y' as const,
      dragControls: controls,
      dragListener: false,
      dragConstraints: { top: 0 },
      dragElastic: { top: 0, bottom: 0.35 },
      onDragEnd: (_: unknown, info: { offset: { y: number }; velocity: { y: number } }) => {
        if (info.offset.y > 80 || info.velocity.y > 400) onClose()
      },
    },
    handleProps: {
      onPointerDown: (e: React.PointerEvent) => controls.start(e),
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

function XPBarDisplay({ xp, bestStreak, renownAvailable, onOpenRenown }: {
  xp: number; bestStreak?: number
  /** Banked Renown points (post-100). When defined, MAX becomes a tappable
   *  "Renown N" chip + the bar tracks progress to the next Renown level. */
  renownAvailable?: number
  onOpenRenown?: () => void
}) {
  const { level, progress, xpInLevel, xpForLevel } = getXPProgress(xp)
  const isMax = level >= MAX_LEVEL
  const rn = isMax ? renownProgress('fishing', xp) : null
  const fillPct = isMax ? (rn ? rn.progress * 100 : 100) : progress * 100
  const toGo = xpForLevel - xpInLevel
  const c = isMax ? '#f0c040' : '#60a5fa'
  const clickable = isMax && !!onOpenRenown
  const hasPoints = isMax && (renownAvailable ?? 0) > 0
  return (
    <motion.div
      onClick={clickable ? onOpenRenown : undefined}
      className="flex items-center gap-2.5 px-3 py-2"
      animate={hasPoints ? { boxShadow: [`0 0 0px ${c}00`, `0 0 16px ${c}99`, `0 0 0px ${c}00`] } : { boxShadow: `0 0 0px ${c}00` }}
      transition={hasPoints ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.3 }}
      style={{ background: 'rgba(4,10,18,0.72)', border: `1px solid ${hasPoints ? c + '99' : c + '28'}`, borderRadius: 20, cursor: clickable ? 'pointer' : 'default' }}>
      <div className="shrink-0 flex items-baseline gap-0.5">
        <span className="font-karla font-600" style={{ fontSize: '0.48rem', color: c + 'bb', letterSpacing: '0.08em' }}>LV</span>
        <span className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: c, lineHeight: 1 }}>{level}</span>
      </div>
      <div style={{ flex: 1, height: 7, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
        <motion.div
          key={isMax ? `rn-${rn?.level ?? 0}` : level}
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
        {isMax && rn ? (
          <span className="font-karla font-700 flex items-center gap-1.5" style={{ fontSize: '0.6rem', color: c, lineHeight: 1 }}>
            ✦ R{rn.level}
            {hasPoints && (
              <motion.span
                animate={{ scale: [1, 1.12, 1] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  fontSize: '0.52rem', color: '#0a0f1c', background: c, borderRadius: 999,
                  padding: '2px 6px', fontWeight: 800, whiteSpace: 'nowrap',
                }}>{renownAvailable} spend</motion.span>
            )}
          </span>
        ) : (
          // ── THE CARROT ──────────────────────────────────────────────────
          // "312 xp" told the player how far, and NOTHING about why. There was no
          // stated reason anywhere in the game to reach the next level. Now the bar
          // says what is waiting at the top of it, and lights gold on a milestone.
          (() => {
            const nx = nextLevelReward(level)
            const gold = '#f0c040'
            return (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, minWidth: 0 }}>
                <p className="font-karla font-600"
                  style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.65)', textAlign: 'right', lineHeight: 1 }}>
                  {`${toGo.toLocaleString()} xp`}
                </p>
                {nx && (
                  <p className="font-karla font-700 truncate"
                    style={{
                      maxWidth: 116, fontSize: '0.52rem', lineHeight: 1, textAlign: 'right',
                      color: nx.reward.milestone ? gold : 'rgba(255,255,255,0.45)',
                      textShadow: nx.reward.milestone ? `0 0 10px ${gold}66` : 'none',
                    }}>
                    {nx.level === LEVEL_REWARD_MAX ? '★ Last reward · ' : nx.reward.milestone ? '★ ' : ''}{rewardLabel(nx.reward)}
                  </p>
                )}
              </div>
            )
          })()
        )}
        {(bestStreak ?? 0) > 0 && (
          <span className="font-karla font-700" style={{ fontSize: '0.6rem', color: 'rgba(251,146,60,0.9)', lineHeight: 1 }}>
            <IconFlame size={10} />{bestStreak}
          </span>
        )}
      </div>
    </motion.div>
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
function SpeedClock({ endsAt, paused = false }: { endsAt: number; paused?: boolean }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    // While paused, freeze the displayed count by skipping the tick — the
    // ms shown stays at (endsAt - lastNow). On resume the parent has
    // already bumped `endsAt` forward by the paused duration, so the
    // clock picks up at the same number and keeps counting down.
    if (paused) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [paused])
  const secs = Math.max(0, Math.ceil((endsAt - now) / 1000))
  return (
    <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', color: secs <= 5 ? '#ef4444' : '#fde68a' }}>
      · {secs}s
    </span>
  )
}

// ─── YOLO Rod jackpot celebration ─────────────────────────────────────────
// Full-screen "you just won big" overlay that mounts on top of the regular
// result card when the YOLO Rod's ×N jackpot procs. The result card itself
// stays underneath (with its own ×N banner) as the post-celebration proof
// surface; this overlay is the dopamine hit before they see the numbers.
//
// Structure (~1.8s total, tap anywhere to skip):
//   - Gold radial flash backdrop fades in
//   - "JACKPOT" headline slams in with a spring scale
//   - +N FISH counter ticks 0→qty with cubic ease-out
//   - 16 coin glyphs erupt outward + up from center
//   - 24 confetti squares rain from the top
function JackpotBoomOverlay({ qty, onDone }: { qty: number; onDone: () => void }) {
  const [displayed, setDisplayed] = useState(0)

  // Auto-dismiss. 1.8s is enough for the counter to finish + the player to
  // savor the headline; longer than that and it stops feeling like a punch.
  useEffect(() => {
    const t = setTimeout(onDone, 1800)
    return () => clearTimeout(t)
  }, [onDone])

  // Counter tick — 700ms cubic ease-out so the number cascades fast then
  // settles. Polling at 30ms is fine for a one-shot animation.
  useEffect(() => {
    const start = Date.now()
    const dur = 700
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / dur)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplayed(Math.floor(eased * qty))
      if (t >= 1) {
        setDisplayed(qty)
        clearInterval(id)
      }
    }, 30)
    return () => clearInterval(id)
  }, [qty])

  // 16 coin particles erupting from center on deterministic angles so the
  // spray reads as intentional, not random. Each gets a tiny stagger.
  const coins = Array.from({ length: 16 }, (_, i) => ({
    angle: (i / 16) * Math.PI * 2,
    distance: 180 + (i % 4) * 28,
    delay: i * 0.022,
    rotation: (i * 47) % 360,
  }))

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      data-any-key
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'radial-gradient(ellipse at center, rgba(249,115,22,0.55) 0%, rgba(15,6,2,0.88) 60%)',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Confetti rain from the top — each strip falls a hair after the last
          so the rain reads as continuous rather than a single burst frame. */}
      {Array.from({ length: 24 }, (_, i) => (
        <motion.div
          key={`conf-${i}`}
          initial={{ left: `${(i / 24) * 100}%`, top: '-5%', rotate: 0, opacity: 0 }}
          animate={{ top: '105%', rotate: 360 + (i * 17), opacity: [0, 1, 1, 0] }}
          transition={{ duration: 1.5, delay: i * 0.035, ease: 'linear' }}
          style={{
            position: 'absolute',
            width: 8, height: 12,
            background: ['#f0c040', '#fb923c', '#fde68a', '#f59e0b'][i % 4],
            borderRadius: 2,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Coin glyphs erupting from center. translate is composited so this is
          cheap even with 16 of them on weaker phones. */}
      {coins.map((p, i) => (
        <motion.div
          key={`coin-${i}`}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4, rotate: 0 }}
          animate={{
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance - 60,
            opacity: 0, scale: 1.3, rotate: p.rotation,
          }}
          transition={{ duration: 1.1, delay: p.delay, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            fontSize: '1.8rem',
            color: '#f0c040',
            textShadow: '0 0 16px rgba(249,115,22,0.9)',
            pointerEvents: 'none',
            lineHeight: 1,
          }}
        >
          ⟡
        </motion.div>
      ))}

      {/* Headline + counter. Both nested in one spring so the slam-in lands
          together; pointer-events disabled so the backdrop owns the tap. */}
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 13 }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          pointerEvents: 'none', textAlign: 'center',
        }}
      >
        <p className="font-cinzel font-700" style={{
          fontSize: '3.2rem', lineHeight: 1,
          color: '#fdba74',
          textShadow: '0 0 32px rgba(249,115,22,0.95), 0 0 64px rgba(249,115,22,0.5)',
          letterSpacing: '0.05em',
        }}>
          JACKPOT
        </p>
        <p className="font-cinzel font-700" style={{
          fontSize: '2rem', lineHeight: 1,
          color: '#fde68a',
          textShadow: '0 0 18px rgba(251,191,36,0.75)',
        }}>
          +{displayed} <span style={{ fontSize: '1.2rem', letterSpacing: '0.08em' }}>FISH</span>
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── Ancient giant slain — full-screen cinematic ──────────────────────────────
// The 6 giants are the final bosses of fishing, so landing one earns a real
// takeover moment before the result card: letterbox slams in, the giant surfaces
// from the dark on a colored glow, its name lands, and the "N / VI" tally counts
// the wall. Megalodon — the gated apex — runs the crimson variant and, at 6/6,
// calls the whole collection complete. Auto-dismisses; tap anywhere to skip. The
// result card sits underneath as the lasting proof surface.
function AncientSlainCinematic({ fish, count, total, isMegalodon, onDone }: {
  fish: FishSpecies; count: number; total: number; isMegalodon: boolean; onDone: () => void
}) {
  const complete = count >= total
  // Apex crimson for Megalodon (and any final 6/6 fill); abyssal violet/cyan for
  // the other giants.
  const apex = isMegalodon || complete
  const glow   = apex ? '#f43f5e' : '#22d3ee'
  const accent = apex ? '#fb7185' : '#a855f7'
  const bg = apex
    ? 'radial-gradient(ellipse 90% 70% at 50% 46%, rgba(120,8,20,0.82) 0%, rgba(6,2,6,0.96) 62%)'
    : 'radial-gradient(ellipse 90% 70% at 50% 46%, rgba(40,10,70,0.80) 0%, rgba(4,4,10,0.96) 62%)'
  const eyebrow = apex ? (isMegalodon ? 'The Apex Falls' : 'The Wall Is Complete') : 'Ancient Slain'

  useEffect(() => {
    // Heavy triple-buzz on the moment landing. Guarded — not all devices have it.
    try { navigator.vibrate?.(apex ? [60, 40, 60, 40, 120] : [40, 30, 90]) } catch { /* no haptics */ }
    const t = setTimeout(onDone, apex ? 3400 : 2900)
    return () => clearTimeout(t)
  }, [onDone, apex])

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.28 }}
      data-any-key
      onClick={onDone}
      style={{
        position: 'fixed', inset: 0, zIndex: 9200,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: bg, cursor: 'pointer', overflow: 'hidden',
      }}
    >
      {/* Letterbox bars — slam in from top and bottom */}
      <motion.div initial={{ height: 0 }} animate={{ height: '13%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, background: '#000' }} />
      <motion.div initial={{ height: 0 }} animate={{ height: '13%' }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#000' }} />

      {/* Expanding rings behind the giant */}
      {[0, 0.14, 0.3].map((delay, i) => (
        <motion.div key={i}
          initial={{ scale: 0.5, opacity: 0.5 - i * 0.14 }}
          animate={{ scale: 2.4 - i * 0.3, opacity: 0 }}
          transition={{ duration: 1.1, ease: 'easeOut', delay: 0.2 + delay }}
          style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', border: `2px solid ${glow}`, pointerEvents: 'none' }}
        />
      ))}

      {/* The giant surfacing from the dark */}
      <motion.div
        initial={{ opacity: 0, y: 70, scale: 0.7 }}
        animate={{ opacity: 1, y: [70, 0, 0], scale: [0.7, 1.06, 1] }}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.12 }}
        style={{ position: 'relative', zIndex: 2 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fishImageUrl(fish.name)} alt={fish.name} decoding="async"
          style={{ width: 'min(72vw, 300px)', height: 'auto', objectFit: 'contain',
            filter: `drop-shadow(0 0 18px ${glow}) drop-shadow(0 0 44px ${glow}aa)` }} />
      </motion.div>

      {/* Eyebrow + name slam + tally */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.55 }}
        style={{ position: 'relative', zIndex: 2, textAlign: 'center', marginTop: 8, padding: '0 1.2rem' }}
      >
        <p className="font-karla font-800 uppercase" style={{ letterSpacing: '0.34em', textIndent: '0.34em', fontSize: '0.62rem', color: accent, marginBottom: 6 }}>
          {eyebrow}
        </p>
        <motion.p className="font-cinzel font-700"
          initial={{ scale: 1.25, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.5 }}
          style={{ fontSize: 'clamp(1.6rem, 8vw, 2.6rem)', lineHeight: 1.05, color: '#fdf4e3',
            textShadow: `0 0 18px ${glow}88` }}>
          {fish.name}
        </motion.p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <span style={{ height: 1, width: 26, background: `${accent}66` }} />
          <p className="font-cinzel font-700" style={{ fontSize: '0.9rem', color: accent, letterSpacing: '0.08em' }}>
            {toRoman(count)} <span style={{ color: `${accent}77` }}>/ {toRoman(total)}</span>
          </p>
          <span style={{ height: 1, width: 26, background: `${accent}66` }} />
        </div>
        <p className="font-karla font-600 uppercase" style={{ letterSpacing: '0.2em', fontSize: '0.5rem', color: '#8a8a99', marginTop: 5 }}>
          {complete ? 'Every giant on the wall' : 'Giants of the Ancient Deep'}
        </p>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

/** The trophy mark: a drawn cup, so it lives in the same visual language as the rest of
 *  the UI and never leans on an emoji. Sits on the collection card's corner and beside
 *  the personal best. */
function TrophyMark({ size = 10, color = '#fbbf24' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M6 4h12v4a6 6 0 0 1-12 0z" />
      <path d="M6 6H4a2 2 0 0 0 2 4M18 6h2a2 2 0 0 1-2 4" />
      <path d="M12 14v4M9 20h6" />
    </svg>
  )
}

type FishSpeciesBasic = { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number; length_min_in?: number | null; length_max_in?: number | null }

export default function FishingGame({
  hookTier: initialHookTier, rodTier, reelTier: initialReelTier, lineTier,
  initialDoubloons, initialGems, initialFathoms, initialFishingXP, initialBait, initialLastUsedBait, initialInventory,
  fishHoldTier: initialFishHoldTier,
  ownedRods: initialOwnedRods,
  initialCompletionistEffects,
  initialHasForgedBefore,
  allFishSpecies, initialCaughtFishIds, initialMountedFishIds,
  initialPersonalBests, initialCatchCounts,
  initialHighestPerfectStreak, initialPerfectStreak,
  hasSeenFishingTour, hasSeenFishingCatchTour, hasSeenFirstCatchCelebration, initialShowWaitTimer,
  selectedZone: initialZone, onBack, onHome, zoneRewardsClaimed, unfishedZones = 0,
  initialDailyChallenge, onDailyChallengeChange,
  hasTideTurner, initialTideTurnerSkipsLeft, initialEquippedSpecial, hasPhantomHook, hasAutoCaster, hasAutoCatcher, gauntletDeepest, gauntletUpgrades, hasPerfectedSigil,
  initialEquippedSpecial2,
  hasDeepReel = false,
  hasAnglersPatience = false,
  anglersPatienceXp = 0,
  initialPrestigeLevels, initialGoldenBoosts, initialAncientCatches, initialAncientVigil, vigilUnlocked = false, characterColor, unlockedCharacterColors, newlyUnlockedSkins, newlyUnlockedBoats, equippedBadges, unlockedBadges,
  marketMultipliers, isPremium, initialEquippedBoat, initialUnlockedBoats, onBoatStateChange,
  initialEquippedHat, initialUnlockedHats, onHatStateChange,
  initialEquippedPet, initialEquippedPetBow, initialUnlockedPets, onPetStateChange,
  initialFinnEncounters, initialFinnWins, initialFinnSeenBeats, initialFinnRevealed, initialFinnLastOutcome,
  initialFishingRenownAlloc, seenFishingRenownIntro,
}: {
  hookTier: number
  rodTier: number
  reelTier: number
  lineTier: number
  initialDoubloons: number
  initialGems: number
  initialFathoms: number
  initialFishingXP: number
  initialBait: BaitItem[]
  initialLastUsedBait: string | null
  initialInventory: InventoryItem[]
  uniqueSpeciesCaught: number
  fishHoldTier: number
  ownedRods: number[]
  initialCompletionistEffects: number[]
  initialHasForgedBefore: boolean
  allFishSpecies: FishSpeciesBasic[]
  initialCaughtFishIds: number[]
  /** Species the player has mounted as golden in the Logbook. Used to
   *  paint those species cards with the gold treatment and to disable
   *  the Mount option in the forced-choice modal on repeat goldens. */
  initialMountedFishIds: number[]
  /** fish_id → best length in inches. Seeded from fish_personal_bests on
   *  page load; updated in state when a new PB lands during the session. */
  initialPersonalBests: Record<number, number>
  /** fish_id → total lifetime catch count. Seeded from fish_collection on
   *  page load; bumped in state on each catch during the session. */
  initialCatchCounts: Record<number, number>
  initialHighestPerfectStreak: number
  initialPerfectStreak: number
  hasSeenFishingTour: boolean
  hasSeenFishingCatchTour: boolean
  hasSeenFirstCatchCelebration: boolean
  initialShowWaitTimer: boolean
  selectedZone: ZoneKey
  onBack: () => void
  /** Open zones this captain has never landed anything in. Drives the dot on the
   *  zone breadcrumb, which is the only route back to the picker that badges
   *  them. Derived from catch counts upstream, so it clears itself. */
  unfishedZones?: number
  /** Straight out to the fishing hub, past the zone selector. */
  onHome: () => void
  zoneRewardsClaimed: Record<string, boolean>
  initialDailyChallenge: DailyChallengeState | null
  /** Fired whenever local progress/claimed updates so the parent
   *  (FishingPageClient) can preserve the state across zone remounts. */
  onDailyChallengeChange?: (
    progress: number[],
    claimed: boolean[],
    sweepClaimed: boolean,
  ) => void
  hasTideTurner: boolean
  initialTideTurnerSkipsLeft: number
  initialEquippedSpecial: string | null
  /** THE DEEP REEL: second special slot (Finn spoil). */
  initialEquippedSpecial2?: string | null
  hasDeepReel?: boolean
  hasAnglersPatience?: boolean
  anglersPatienceXp?: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  gauntletDeepest: number
  gauntletUpgrades: string[]
  hasPerfectedSigil: boolean
  initialPrestigeLevels: Record<string, number>
  initialGoldenBoosts: Record<string, number>
  initialAncientCatches: number[]
  /** THE LONG VIGIL — per-giant rank + released state, and whether the finale
   *  has been cleared at all. */
  initialAncientVigil?: VigilState
  vigilUnlocked?: boolean
  characterColor: string
  unlockedCharacterColors: string[]
  newlyUnlockedSkins: string[]
  newlyUnlockedBoats: string[]
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
  initialEquippedPet: string | null
  /** Front-facing pet, the second slot. Only bow pets seat here. */
  initialEquippedPetBow?: string | null
  initialUnlockedPets: string[]
  onPetStateChange?: (equipped: string | null, unlocked: string[]) => void
  initialFinnEncounters: number
  initialFinnWins: number
  initialFinnSeenBeats: string[]
  initialFinnRevealed: boolean
  initialFinnLastOutcome: 'won' | 'lost' | 'passed' | null
  /** Persisted Fishing Renown allocations ({} when none). Renown LEVEL derives
   *  live from fishingXP; only the spend map is threaded in. */
  initialFishingRenownAlloc: RenownAlloc | null
  /** Whether the one-time "reached 100, meet Renown" intro has already played. */
  seenFishingRenownIntro: boolean
}) {

  const [localCharacterColor, setLocalCharacterColor] = useState(characterColor)
  const [localUnlockedColors, setLocalUnlockedColors] = useState(unlockedCharacterColors)
  const [equippedBoat, setEquippedBoat] = useState<string | null>(initialEquippedBoat)
  const [unlockedBoats, setUnlockedBoats] = useState<string[]>(initialUnlockedBoats)
  const boatDef = getBoat(equippedBoat)
  const [equippedHat, setEquippedHat] = useState<string | null>(initialEquippedHat)
  const [unlockedHats, setUnlockedHats] = useState<string[]>(initialUnlockedHats)
  const hatDef = getHat(equippedHat)
  // Pet state — same shape as hat. Mutations go through onPetStateChange
  // (in GearScreen below) and equipPet() / the crate drop server action.
  const [equippedPet, setEquippedPet] = useState<string | null>(initialEquippedPet)
  const [equippedPetBow, setEquippedPetBow] = useState<string | null>(initialEquippedPetBow ?? null)
  const [unlockedPets, setUnlockedPets] = useState<string[]>(initialUnlockedPets)
  const [localEquippedBadges, setLocalEquippedBadges] = useState(equippedBadges)
  const charSrc = getCharSrc(localCharacterColor)

  const [currentFishHoldTier, setCurrentFishHoldTier] = useState(initialFishHoldTier)
  const holdCapacity = getFishHold(currentFishHoldTier).capacity

  const [equippedRodTier, setEquippedRodTier] = useState(rodTier)
  const [ownedRods, setOwnedRods] = useState(initialOwnedRods)
  // Completionist Rod forge: which (up to 3) owned rods' effects are folded in.
  // Resolved into the rod's effective stats below via getEffectiveRod. The
  // forge UI in GearScreen updates this optimistically + persists server-side.
  const [completionistEffects, setCompletionistEffects] = useState<number[]>(initialCompletionistEffects)
  // Has the player already done their FREE first forge? Drives the re-forge fee
  // (free first, 50k after). Set true once a forge with effects commits.
  const [hasForgedBefore, setHasForgedBefore] = useState(initialHasForgedBefore)
  // One-time "Rod Forged" flourish — fires the first time the player ever fuses
  // an effect (server returns firstForge off the has_seen_forge_flourish flag).
  const [forgeFlourish, setForgeFlourish] = useState(false)
  useEffect(() => {
    if (!forgeFlourish) return
    const t = setTimeout(() => setForgeFlourish(false), 4800)
    return () => clearTimeout(t)
  }, [forgeFlourish])
  const [reelTier, setReelTier] = useState(initialReelTier)
  const [hookTier, setHookTier] = useState(initialHookTier)
  const [caughtFishIds, setCaughtFishIds] = useState(() => new Set(initialCaughtFishIds))
  // Live set of species the player has mounted as golden. Seeded from
  // fish_collection.is_golden; updated when the choice modal resolves
  // a Mount so the Logbook reflects it without a refresh.
  const [mountedFishIds, setMountedFishIds] = useState(() => new Set(initialMountedFishIds))
  // Live PB lookup for the collection drawer. Seeded server-side; bumped in
  // state when a new PB lands so the drawer reflects it without a page
  // refresh.
  const [personalBests, setPersonalBests] = useState<Record<number, number>>(initialPersonalBests)
  // Live total-caught lookup for the collection detail modal. Seeded
  // server-side; bumped in state on each catch so the modal reflects it
  // without a page refresh.
  const [catchCounts, setCatchCounts] = useState<Record<number, number>>(initialCatchCounts)
  const rod  = getEffectiveRod(equippedRodTier, completionistEffects)
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
    // Depend on the STABLE rod sprite fields (slug/imageUrl), NOT the `rod`
    // object — getEffectiveRod rebuilds a fresh object every render for the
    // Completionist Rod, so `rod` in the deps re-ran this effect on every
    // render, thrashing spritesReady (which gates the bob + the hooked-fish
    // shake) into a render loop. This effect only reads rod.slug/rod.imageUrl.
  }, [localCharacterColor, boatDef, hatDef, rod.slug, rod.imageUrl, reel.imageUrl, hook.imageUrl])

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

  const router = useRouter()

  // Leave-confirm modal — popups when the player tries to navigate away
  // mid-cast (link tap / Back button). Mirrors the raid flee-guard
  // pattern in lib/RaidGame.tsx (search 'Mid-battle exit guard'). The
  // pending nav callback fires on confirm so the player ends up where
  // they were trying to go; cancel just closes the dialog.
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false)
  const pendingLeaveNavRef = useRef<(() => void) | null>(null)

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
  // Bait quick-swap carousel (the idle-screen bait tile): the direction of the
  // last swipe (drives which side the new bait slides in from) + a dragged flag
  // so the post-swipe synthetic click doesn't also open the bait drawer.
  const [baitSwapDir, setBaitSwapDir] = useState<1 | -1>(1)
  const baitDraggedRef = useRef(false)
  const [inventory, setInventory]   = useState<InventoryItem[]>(initialInventory)
  // THE HOLD CATCHES UP WHEN YOU COME BACK.
  //
  // `inventory` is seeded from a server-rendered prop and then only ever mutated
  // locally, so a route restored from the browser's back/forward cache shows the
  // count from whenever that snapshot was taken. That is what produced a pill
  // reading 38/40 beside a refusal saying the hold was full, and a different
  // stale number on each return.
  //
  // pageshow catches the bfcache restore itself (its `persisted` flag is exactly
  // this case); visibilitychange catches app-switching back on mobile, which the
  // Android back button and the task switcher both land on.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState !== 'visible') return
      syncFishHold().then(rows => { if (rows) setInventory(rows) }).catch(() => {})
    }
    document.addEventListener('visibilitychange', resync)
    window.addEventListener('pageshow', resync)
    return () => {
      document.removeEventListener('visibilitychange', resync)
      window.removeEventListener('pageshow', resync)
    }
  }, [])
  const [doubloons, setDoubloons]   = useState(initialDoubloons)
  const [gems, setGems]             = useState(initialGems)
  // Keep the local gem balance in step with gem changes fired anywhere (crate
  // rewards, purchases) so the boat picker's affordability stays accurate.
  useEffect(() => {
    const onGems = (e: Event) => { const d = (e as CustomEvent).detail; if (typeof d === 'number') setGems(d) }
    window.addEventListener('gems-changed', onGems)
    return () => window.removeEventListener('gems-changed', onGems)
  }, [])
  const [fathoms, setFathoms]       = useState(initialFathoms)
  // Perfected Sigil payout — gold coins arc from the catch result area
  // up to the Nav's doubloon pill (tagged data-doubloon-pill) so the
  // player sees the bonus actually landing. A floating "+N ⟡" caption
  // spawns at the same origin and drifts up so the player can READ how
  // much they got, not just see vague coin movement. Pure cosmetic: the
  // doubloons are already credited server-side by the time these spawn.
  const [flyingSigilCoins, setFlyingSigilCoins] = useState<{ id: number; fromX: number; fromY: number; toX: number; toY: number; delay: number }[]>([])
  const [sigilLabels, setSigilLabels] = useState<{ id: number; x: number; y: number; amount: number }[]>([])
  const sigilCoinIdRef = useRef(1)
  const sigilLabelIdRef = useRef(1)
  const spawnSigilCoins = useCallback((bonus: number) => {
    if (bonus <= 0 || typeof window === 'undefined') return
    // Both desktop + mobile Nav render their own [data-doubloon-pill],
    // one hidden via responsive CSS at any given breakpoint. Pick the
    // first one with a non-zero rect — display:none yields all-zero
    // bounds so the visible pill always wins.
    const candidates = Array.from(document.querySelectorAll('[data-doubloon-pill]'))
    const target = candidates.find(el => {
      const r = (el as HTMLElement).getBoundingClientRect()
      return r.width > 0 && r.height > 0
    }) as HTMLElement | undefined
    if (!target) return
    const tr = target.getBoundingClientRect()
    const toX = tr.left + tr.width / 2
    const toY = tr.top + tr.height / 2
    // Origin: roughly center-screen, mid-viewport. Catch result card
    // lives there during the post-reel beat, so coins look like they
    // peel off the fish.
    const fromX = window.innerWidth / 2
    const fromY = window.innerHeight / 2
    // Coin count: 1 per 10 ⟡, capped at 3 (the cap matches the +30
    // payout ceiling — streak 1 = 1 coin, streak 2 = 2 coins,
    // streak 3+ = 3 coins). Tight cluster so the "+N ⟡" caption
    // stays the dominant signal.
    const count = Math.min(3, Math.max(1, Math.round(bonus / 10)))
    setFlyingSigilCoins(prev => {
      const next = [...prev]
      for (let i = 0; i < count; i++) {
        const jitterX = (Math.random() - 0.5) * 60
        const jitterY = (Math.random() - 0.5) * 30
        next.push({
          id: sigilCoinIdRef.current++,
          fromX: fromX + jitterX,
          fromY: fromY + jitterY,
          toX, toY,
          delay: i * 0.06,
        })
      }
      return next
    })
    // Floating caption — the legible "how much" signal. Spawns above the
    // coin cluster, drifts up + fades out so it doesn't clutter the
    // result card.
    setSigilLabels(prev => [...prev, {
      id: sigilLabelIdRef.current++,
      x: fromX,
      y: fromY - 40,
      amount: bonus,
    }])
  }, [])
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
  const [gearOpen, setGearOpen]         = useState(false)
  // MOUNT THE LOCKER AFTER THE DRAWER LANDS. GearScreen builds a large tree —
  // every rod, hook, reel, line, boat, hat, pet and badge, ~106 catalog entries
  // and 19 images — and it used to mount on the same frame the drawer started
  // sliding. The slide is a compositor transform, but a mount that heavy blocks
  // the main thread anyway, so the open stuttered. The drawer now slides empty
  // (220ms, matching its own transition) and the contents mount on the frame
  // after it settles, when nothing is animating.
  const [gearMounted, setGearMounted]   = useState(false)
  // Deep-link to the Appearance picker (mail CTA: /fishing?gear=appearance).
  // GearScreen consumes the flag on open and calls back to clear it.
  const [gearAutoAppearance, setGearAutoAppearance] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('gear') !== 'appearance') return
    setGearOpen(true)
    setGearAutoAppearance(true)
    // Strip the param so a refresh or later drawer re-open doesn't force it again.
    params.delete('gear')
    const qs = params.toString()
    window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [baitOpen, setBaitOpen]         = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [uncheckedNewFishIds, setUncheckedNewFishIds] = useState<Set<number>>(new Set())
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [claimedZones, setClaimedZones] = useState<Record<string, boolean>>(zoneRewardsClaimed)
  const [claimingZone, setClaimingZone] = useState<string | null>(null)
  const [zoneClaimToast, setZoneClaimToast] = useState<{ zone: string; earned: number } | null>(null)
  const [skinUnlockToast, setSkinUnlockToast] = useState<string | null>(null)
  // One-time celebration for skins earned but never announced — the endgame
  // gates (achievement points, both-tracks-maxed) and trawl-driven level
  // crossings grant silently. The list arrives pre-validated from the server
  // page; we toast each once, then persist so it never re-fires.
  useEffect(() => {
    if (!newlyUnlockedSkins || newlyUnlockedSkins.length === 0) return
    void persistEarnedSkins(newlyUnlockedSkins).catch(() => {})
    const queue = [...newlyUnlockedSkins]
    let idx = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const showNext = () => {
      if (idx >= queue.length) { setSkinUnlockToast(null); return }
      setSkinUnlockToast(queue[idx]); idx++
      timers.push(setTimeout(showNext, 5000))
    }
    timers.push(setTimeout(showNext, 900)) // let the screen settle first
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Same one-time celebration for achievement-earned boats (Celestial/Abyssal).
  const [boatUnlockToast, setBoatUnlockToast] = useState<string | null>(null)
  useEffect(() => {
    if (!newlyUnlockedBoats || newlyUnlockedBoats.length === 0) return
    void persistEarnedBoats(newlyUnlockedBoats).catch(() => {})
    const queue = [...newlyUnlockedBoats]
    let idx = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    const showNext = () => {
      if (idx >= queue.length) { setBoatUnlockToast(null); return }
      setBoatUnlockToast(queue[idx]); idx++
      timers.push(setTimeout(showNext, 5000))
    }
    timers.push(setTimeout(showNext, 1400)) // stagger after any skin toast
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [prestigeLevels, setPrestigeLevels] = useState<Record<string, number>>(initialPrestigeLevels)
  // Per-zone golden boost (wipes past Max Prestige). Each wipe = +10% golden odds.
  const [goldenBoosts, setGoldenBoosts] = useState<Record<string, number>>(initialGoldenBoosts)
  const [prestigingZone, setPrestigingZone] = useState<string | null>(null)
  // The prestige ceremony overlay — the stamp-slam moment after a prestige
  // lands. `goldenBoost` set (in place of a level bump) when the wipe was a
  // past-max golden-boost gain rather than a level-up.
  const [prestigeCeremony, setPrestigeCeremony] = useState<{ zone: string; level: number; skin: string | null; goldenBoost?: number } | null>(null)
  const [confirmPrestigeZone, setConfirmPrestigeZone] = useState<string | null>(null)
  const [tappedFishId, setTappedFishId] = useState<number | null>(null)
  const [ancientCatches, setAncientCatches] = useState(() => new Set(initialAncientCatches))
  const [ancientVigil, setAncientVigil] = useState<VigilState>(() => initialAncientVigil ?? {})
  // The giant whose release ceremony is open, from the collection drawer.
  const [releasingAncient, setReleasingAncient] = useState<FishSpeciesBasic | null>(null)

  // Lock body scroll while the trophy detail modal is open. Without
  // this, the collection drawer's overflowY:auto underneath catches
  // scroll gestures that overshoot the PopupShell wrapper, and the
  // drawer slowly creeps along while the user is trying to scroll the
  // modal content. Matches the lock pattern used by ShipHero's loadout
  // + sheet modals — see [ShipHero.tsx:277-280].
  useEffect(() => {
    if (tappedFishId == null) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [tappedFishId])

  // Drag-from-handle for the collection drawer. The 2-column trophy
  // grid is scrollable, and drag-from-anywhere would let an upward
  // scroll gesture get reinterpreted as a drag-down-to-close. Hook is
  // called unconditionally here so the dragControls instance is
  // stable across the drawer's mount/unmount cycle.
  const collectionDrawerDrag = useDrawerDrag(() => {
    setCollectionOpen(false)
    setExpandedZone(null)
    setTappedFishId(null)
  })
  // Every bottom-sheet drawer that can scroll uses the handle-only drag
  // pattern (useDrawerDrag) instead of the legacy drag-from-anywhere
  // drawerDragProps. Without this, swiping inside the body to scroll gets
  // reinterpreted as a pull-down-to-close, fights the inner scroll, and
  // sometimes leaks the gesture to the page behind. Drag handle pill is
  // the only thing that triggers the close gesture.
  const gearDrawerDrag  = useDrawerDrag(() => setGearOpen(false))
  const baitDrawerDrag  = useDrawerDrag(() => setBaitOpen(false))
  const dailyDrawerDrag = useDrawerDrag(() => setDailyOpen(false))
  const holdDrawerDrag  = useDrawerDrag(() => setHoldOpen(false))
  const eventInfoDrawerDrag = useDrawerDrag(() => setEventInfoOpen(false))

  // Refs for the collection drawer's scrollable body + each zone block.
  // When the player taps a zone header, we want the just-expanded zone's
  // header to land at the top of the drawer body so the grid that just
  // appeared is what they see. Without this, opening a zone whose
  // header is offscreen leaves the player scrolled to wherever they
  // were and the new content lands above/below their viewport.
  const collectionBodyRef = useRef<HTMLDivElement | null>(null)
  const zoneBlockRefs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => {
    if (!expandedZone) return
    const body = collectionBodyRef.current
    const zoneEl = zoneBlockRefs.current[expandedZone]
    if (!body || !zoneEl) return
    // Compute the zone header's offset relative to the body's current
    // scrollTop, then scrollTo. requestAnimationFrame waits one frame
    // for the expanded grid's DOM to lay out so we don't overshoot.
    requestAnimationFrame(() => {
      const containerTop = body.getBoundingClientRect().top
      const zoneTop = zoneEl.getBoundingClientRect().top
      const target = body.scrollTop + (zoneTop - containerTop)
      body.scrollTo({ top: target, behavior: 'smooth' })
    })
  }, [expandedZone])

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
  const [sellingAll, setSellingAll] = useState(false)
  const [liquidating, setLiquidating] = useState(false)
  const [holdUpgradeConfirm, setHoldUpgradeConfirm] = useState(false)
  const [holdUpgrading, setHoldUpgrading] = useState(false)
  // Which sell-lane row is currently expanded for confirm. Only one
  // open at a time so the drawer stays tidy. Fish Market isn't in this
  // set — tapping it just navigates.
  const [expandedSellLane, setExpandedSellLane] = useState<null | 'quick' | 'liquidate'>(null)
  // Direct bait buying from the bait modal. `confirmBait` opens the quantity
  // confirm modal; `buyingBait` flags the in-flight purchase.
  const [buyingBait, setBuyingBait] = useState<string | null>(null)
  const [confirmBait, setConfirmBait] = useState<string | null>(null)
  const [confirmQty, setConfirmQty] = useState(10)
  async function handleBuyBait(type: string, qty: number) {
    if (buyingBait) return
    const bait = getBait(type)
    if (!bait || bait.shopCost <= 0 || qty <= 0) return
    setBuyingBait(type)
    const res = await buyBait(type, qty)
    setBuyingBait(null)
    if ('error' in res) return
    setBaitInventory(prev =>
      prev.some(b => b.bait_type === type)
        ? prev.map(b => b.bait_type === type ? { ...b, quantity: res.newQty } : b)
        : [...prev, { bait_type: type, quantity: res.newQty }]
    )
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    setConfirmBait(null)
  }
  // Buy a bundle of a premium lure (Golden / Luminous) with Fathoms, right in the
  // bait drawer. Same server-validated action the Gauntlet Locker uses; fixed
  // bundle, no quantity picker. Flashes "+N" on the row via lureBought.
  const [buyingLure, setBuyingLure] = useState<string | null>(null)
  const [lureBought, setLureBought] = useState<string | null>(null)
  async function handleBuyLure(type: string) {
    if (buyingLure) return
    setBuyingLure(type)
    const res = await buyBaitWithFathoms(type)
    setBuyingLure(null)
    // The Buy button is disabled when unaffordable, so errors here are rare
    // (races / network). Fail quiet rather than hijack the low-bait toast.
    if ('error' in res) return
    setBaitInventory(prev =>
      prev.some(b => b.bait_type === type)
        ? prev.map(b => b.bait_type === type ? { ...b, quantity: b.quantity + res.added } : b)
        : [...prev, { bait_type: type, quantity: res.added }]
    )
    setFathoms(res.fathoms)
    setLureBought(type)
    setTimeout(() => setLureBought(cur => cur === type ? null : cur), 1800)
  }
  // Low-bait warning — fires once when the player's total bait crosses
  // BELOW the threshold so they aren't ambushed by an "out of bait"
  // modal. Auto-dismiss after 2.5s. Tracked via ref-of-prev-total so
  // each downward crossing fires exactly one toast.
  const [lowBaitMsg, setLowBaitMsg] = useState<string | null>(null)
  const prevBaitTotalRef = useRef<number | null>(null)
  useEffect(() => {
    if (!lowBaitMsg) return
    const t = setTimeout(() => setLowBaitMsg(null), 2500)
    return () => clearTimeout(t)
  }, [lowBaitMsg])
  const [hookedFish, setHookedFish] = useState<{ fishId: number; catchDifficulty: number; biteRarity: number; crateTier?: CrateTier; jackpotMult?: number; doubleCatch?: boolean; catchQty?: number } | null>(null)
  // THE LONG VIGIL: the rank this hooked giant is being fought for, straight
  // from the server's cast token. A ref because the boss-stage handlers read it
  // outside React's render cycle.
  const vigilRankRef = useRef<number | undefined>(undefined)
  const [vigilRank, setVigilRank] = useState<number | undefined>(undefined)
  // YOLO Rod jackpot celebration — set when a jackpot resolves, drives the
  // full-screen JackpotBoom overlay. Cleared on auto-dismiss / tap.
  const [jackpotBoom, setJackpotBoom] = useState<{ qty: number } | null>(null)
  const [ancientCinematic, setAncientCinematic] = useState<{ fish: FishSpecies; count: number; total: number; isMegalodon: boolean; finnBeat: FinnAncientBeat | null } | null>(null)
  // The Finn cutscene queued to play AFTER the slain-cinematic dismisses.
  const [finnAncientScene, setFinnAncientScene] = useState<FinnAncientBeat | null>(null)
  // First-catch celebration — true for the player's very first successful
  // reel-in if their account flag is still unset. Server-flag gated so it
  // can't replay across devices. Set + immediately fire the mark-seen
  // action so the overlay is a one-shot even if the player closes the
  // tab mid-celebration.
  const [firstCatchCeleb, setFirstCatchCeleb] = useState(false)
  const firstCatchArmedRef = useRef(!hasSeenFirstCatchCelebration)
  // First-Ancient-Deep-Catch contest. Server-side atomic claim — only
  // the global winner ever sees this fire, everyone else's flag is
  // false. The prize is a custom boat redeemed via the in-game mail
  // sent at the same moment.
  const [firstAncientCeleb, setFirstAncientCeleb] = useState(false)
  const [catchResult, setCatchResult] = useState<{
    fish: FishSpecies
    baitSaved: boolean
    isNewSpecies: boolean
    isPerfect: boolean
    xpGained: number
    doubleCatch?: boolean
    gemEarned?: boolean
    perfectStreak: number
    streakBonusXP: number
    jackpotMultiplier?: number
    /** Perfect Rod — the perfect-XP multiplier that applied (>1 shows a
     *  "×N XP" pill on the result card). */
    perfectXpMult?: number
    // Per-catch size (lib/fishSize). Ancients have sizeIn but no min/max/tier.
    sizeIn: number
    sizeMin?: number
    sizeMax?: number
    sizeTier?: import('@/lib/fishSize').FishSizeTier
    isPB: boolean
    previousBest: number | null
    isShiny?: boolean
    /** ID of the inserted shiny_catches row — passed to the forced
     *  Sell-or-Mount modal so it knows which trophy to resolve. */
    shinyId?: number
    /** Already mounted this species before? Disables the Mount option. */
    alreadyMounted?: boolean
    /** Galaxy Rod — this catch can be rerolled once through the Wormhole.
     *  Cleared the moment the player uses it (one-shot). */
    wormhole?: boolean
    /** Fish actually banked this catch (3 on a Locked-In triple). */
    catchQty?: number
    /** Ancient Deep: a rare, subtle omen line hinting the giants want a rarer
     *  lure — shown only on a common-bait catch while trophies remain. */
    deepStirs?: boolean
  } | null>(null)
  const [rerollingWormhole, setRerollingWormhole] = useState(false)
  // Lock-out for golden catches. The card's entrance + burst + ring waves
  // run for ~1.8s — the reveal lock holds the button slot empty for the
  // full cinematic, then a "Claim Trophy" button slides into the action
  // row. The decision modal only opens once the player taps that button,
  // so they can savor the card as long as they want before committing.
  // Reset every time a new golden lands so back-to-back catches each
  // get their full moment.
  const [shinyRevealLocked, setShinyRevealLocked] = useState(false)
  const [shinyChoiceModalOpen, setShinyChoiceModalOpen] = useState(false)
  useEffect(() => {
    if (!catchResult?.isShiny) {
      setShinyRevealLocked(false)
      setShinyChoiceModalOpen(false)
      return
    }
    setShinyRevealLocked(true)
    setShinyChoiceModalOpen(false)
    const t = setTimeout(() => setShinyRevealLocked(false), 2400)
    return () => clearTimeout(t)
  }, [catchResult?.isShiny, catchResult?.fish.id])
  const [crateResult, setCrateResult] = useState<
    | { type: 'doubloons'; amount: number }
    | { type: 'bait';      baitType: string; baitName: string; quantity: number }
    | { type: 'skin';      skinId: string;   skinName: string }
    | { type: 'hat';       hatId: string;    hatName: string;  hatImageUrl: string  }
    | { type: 'boat';      boatId: string;   boatName: string; boatImageUrl: string }
    | { type: 'pet';       petId: string;    petName: string;  petImageUrl: string; petAccent: string }
    | null
  >(null)
  // Mirrors CrateOpening's internal phase, driven by its onOpened/onSettled
  // callbacks. The host needs it because the crate's OPEN and CLAIM buttons
  // live in the bottom action row (same slot as Cast and Reel) rather than
  // inside the card, so the action never shifts position between phases.
  const [cratePhase, setCratePhase] = useState<'closed' | 'rolling' | 'revealed'>('closed')
  // Bumped by the bottom action row's Open button; CrateOpening watches it.
  const [crateOpenSignal, setCrateOpenSignal] = useState(false)
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
    lines: (string | FinnSceneLine)[]
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
  // Locked-In Rod: its effects + glow escalate with the live perfect streak
  // (stage 1 at 3 · 2 at 5 · 3/LOCKED IN at 10). Same pure helper the server uses.
  const locked = rod.lockedIn ? lockedInState(rod, perfectStreak) : null
  // On a stage-up, the rod SPRITE flares into the new stage's colour (a one-shot
  // CSS burst) then settles into that stage's steady glow — signalling the mode
  // shift on the rod itself. Stage 3 (LOCKED IN) bursts biggest + longest, with a
  // forge sting + heavier haptic.
  const [rodBurstStage, setRodBurstStage] = useState(0)
  const rodGlow = rodBurstStage
    ? `rod-burst-lockedin-${rodBurstStage}`
    : (locked && locked.stage > 0 ? `rod-glow-lockedin-${locked.stage}` : rodGlowClass(rod))
  const prevLockedStageRef = useRef(locked?.stage ?? 0)
  useEffect(() => {
    const stage = locked?.stage ?? 0
    const prev = prevLockedStageRef.current
    prevLockedStageRef.current = stage
    if (stage > prev && stage >= 1) {
      setRodBurstStage(stage)
      if (stage >= 3) { try { playForgeSfx() } catch { /* muted */ } vibrate([0, 60, 40, 90, 40, 170]) }
      else { vibrate([0, 40, 30, 70]) }
      const t = setTimeout(() => setRodBurstStage(0), stage >= 3 ? 1150 : 860)
      return () => clearTimeout(t)
    }
  }, [locked?.stage])
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
  // THE DEEP REEL: the second special slot, opened by beating Finn. Separate
  // state from slot one because it is a different slot with one legal item.
  const [equippedSpecial2, setEquippedSpecial2] = useState<string | null>(initialEquippedSpecial2 ?? null)
  const [ownedAutoCaster, setOwnedAutoCaster] = useState(hasAutoCaster)
  const [ownedAutoCatcher, setOwnedAutoCatcher] = useState(hasAutoCatcher)
  // Quick on/off for the equipped auto item, toggled from a chip under the XP
  // bar — pauses auto-cast/catch without unequipping in the gear shop.
  const [autoEnabled, setAutoEnabled] = useState(true)
  const [tourStep, setTourStep] = useState<number | null>(null)
  const [catchTourStep, setCatchTourStep] = useState<number | null>(null)
  const catchTourShownRef = useRef(false)
  // Contextual fishing coach-marks (Doby + Kat) — a tip appears over the LIVE
  // game at the moment it matters (first cast, first bite) instead of a
  // full-screen scene. `coach` = which tip is showing; the ref tracks whether
  // we're still in the first-visit tour so tips fire once.
  const [coach, setCoach] = useState<'cast' | 'dial' | null>(null)
  const fishTourActiveRef = useRef(false)
  // Post-first-catch walkthrough (step index → FISH_WALKTHROUGH). The flashed
  // action-bar tab is derived from the current step.
  const [walkStep, setWalkStep] = useState<number | null>(null)
  const flashTab: FlashTab | null = walkStep != null ? (FISH_WALKTHROUGH[walkStep]?.flash ?? null) : null
  const [perfectFlash, setPerfectFlash] = useState(false)
  const [perfectBurstKey, setPerfectBurstKey] = useState(0)
  const [waitMessage, setWaitMessage] = useState('')

  // Cast→bite count-up state lives here; the useEffect that drives it
  // is below the castAnimDone declaration since it depends on that.
  const [showWaitTimer, setShowWaitTimer] = useState(initialShowWaitTimer)
  // Persist toggle changes to the profile (fire-and-forget). The toggle
  // itself updates local state immediately so the UI responds without
  // waiting for the round-trip.
  function updateShowWaitTimer(next: boolean) {
    setShowWaitTimer(next)
    void persistShowWaitTimer(next).catch(() => { /* best-effort */ })
  }
  const [retryFlash, setRetryFlash] = useState(false)
  // Lightsaber "Lightspeed" — brief red blade-flash cue when a near-instant
  // bite fires (server sets res.instantBite). Cleared on a timer.
  const [instantBiteFlash, setInstantBiteFlash] = useState(false)
  const [missResult, setMissResult] = useState<ZoneType | null>(null)

  // Fresh-catch hook — pulses the header Logbook button (top right) for
  // the latest noteworthy catch (new species or PB). Set in the catch
  // handler, cleared on cast / cast-again / opening the Logbook. The
  // older uncheckedNewFishIds state still drives a subtle persistent
  // pulse for ANY unviewed entry; this state stacks a stronger
  // momentary flash on top so the player notices THIS catch without
  // being forced into the drawer — totally optional.
  const [freshCatchHook, setFreshCatchHook] = useState<'new-species' | 'pb' | null>(null)

  // Latest noteworthy catch's habitat — used to auto-expand the right
  // zone when the player taps the flashing Logbook button after a new
  // species / PB. Without this, opening the drawer drops the player
  // on the zone header list with no signal which zone holds their
  // just-caught fish.
  const [latestCatchHabitat, setLatestCatchHabitat] = useState<string | null>(null)

  // Auto-clear unviewed-badge state when the drawer closes. Without
  // this, the only way to make the red count badge go away is to tap
  // every new card individually, which players don't intuit. Opening
  // the Logbook now counts as "I saw the notification" — badges
  // persist until close. Uses a ref to detect the open → closed
  // transition so we only clear once per session.
  const prevCollectionOpenRef = useRef(false)
  useEffect(() => {
    if (prevCollectionOpenRef.current && !collectionOpen) {
      setUncheckedNewFishIds(new Set())
      setLatestCatchHabitat(null)
    }
    prevCollectionOpenRef.current = collectionOpen
  }, [collectionOpen])
  const [fishingXP, setFishingXP]   = useState(initialFishingXP)

  // ── PAY WHAT IS OWED, ON ARRIVAL ────────────────────────────────────────────
  // The claim used to fire ONLY from the catch handler's level-up branch, which meant
  // a level earned anywhere else was stranded. Fishing XP also arrives from TRAWLS,
  // which resolve while the captain is on another screen entirely: they would come back
  // already levelled, so `newLevel > oldLevel` was false on their next catch, so nothing
  // ever claimed it. The reward sat unpaid until the NEXT level-up swept it up as a
  // batch -- and if they never levelled again, or were already at the level-50 cap, it
  // was never paid at all.
  //
  // The grant was always idempotent and state-based; it just had nowhere to be called
  // from. So: reconcile on mount. Anything owed is handed over the moment they open the
  // fishing screen, and they see the same celebration they would have seen live.
  useEffect(() => {
    claimFishingLevelRewards().then(res => {
      if (res.granted.length === 0) return
      const from = res.granted[0].level - 1
      const to   = res.granted[res.granted.length - 1].level
      setLevelRewards(res.granted)
      setLevelUpNotif({ from, to })
      setDoubloons(res.newDoubloons)
      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
      window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGems }))
      if (res.newHoldTier > 0) setCurrentFishHoldTier(res.newHoldTier)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [xpPopup, setXpPopup]       = useState<{ value: number; id: number; prestige?: boolean } | null>(null)
  // Fishing Renown (post-100). Level derives live from fishingXP; only the
  // spend map is stateful (updated when the panel allocates/respecs).
  const [fishingRenownAlloc, setFishingRenownAlloc] = useState<RenownAlloc>(initialFishingRenownAlloc ?? {})
  const [renownOpen, setRenownOpen] = useState(false)
  const [renownUpNotif, setRenownUpNotif] = useState<RenownUpInfo | null>(null)
  // One-time "reached level 100, meet Renown" intro. Shows for players already
  // maxed (on mount) and for a live crossing to 100 (see catch handler).
  const [renownIntro, setRenownIntro] = useState(false)
  const [renownIntroSeen, setRenownIntroSeen] = useState(seenFishingRenownIntro)
  // Show the intro once on mount for players who are ALREADY level 100 (they
  // never re-cross, so they'd otherwise never meet Renown). Live crossers get
  // it from the catch handler instead.
  const introCheckedRef = useRef(false)
  useEffect(() => {
    if (introCheckedRef.current) return
    introCheckedRef.current = true
    if (!renownIntroSeen && getLevelFromXP(fishingXP) >= MAX_LEVEL) {
      const t = setTimeout(() => setRenownIntro(true), 700)
      return () => clearTimeout(t)
    }
  }, [renownIntroSeen, fishingXP])
  const fishingRenownLevel = renownLevel('fishing', fishingXP)
  const fishingRenownAvailable = Math.max(0, fishingRenownLevel - spentPoints('fishing', fishingRenownAlloc))
  const fishingRenownState: RenownState = {
    skill: 'fishing', level: fishingRenownLevel,
    spent: spentPoints('fishing', fishingRenownAlloc),
    available: fishingRenownAvailable, alloc: fishingRenownAlloc,
      // The panel refetches these on open; a bar built from page-load props
    // cannot know a live gem balance.
    respecs: 0, gems: 0,
  }
  // Trawls (crew passive fishing) collect off-screen in the Trawls panel; when
  // a haul lands it dispatches these so the fishing screen's own XP bar + purse
  // tick live (the Nav purse already listens to doubloons-changed separately).
  useEffect(() => {
    const onXP = (e: Event) => { const v = (e as CustomEvent<number>).detail; if (typeof v === 'number') setFishingXP(v) }
    const onDbl = (e: Event) => { const v = (e as CustomEvent<number>).detail; if (typeof v === 'number') setDoubloons(v) }
    // A trawl haul can push the player over a fishing level while they're on
    // the fishing screen. The Trawls indicator fires this AFTER its own haul
    // card is dismissed, so the SAME full level-up celebration the catch flow
    // shows runs here too (perks, zone/gear/trawl unlocks) — no stacked
    // popups, since the haul card is already gone. Mirrors the catch-flow
    // path at the reel-in handler (setLevelUpNotif + the two events).
    const onTrawlLevelUp = (e: Event) => {
      const d = (e as CustomEvent<{ from?: number; to?: number }>).detail
      if (!d || typeof d.from !== 'number' || typeof d.to !== 'number' || d.to <= d.from) return
      setLevelUpNotif({ from: d.from, to: d.to })
      window.dispatchEvent(new CustomEvent('fishing-levelup-open'))
      window.dispatchEvent(new CustomEvent('fishing-leveled'))
    }
    window.addEventListener('fishing-xp-changed', onXP)
    window.addEventListener('doubloons-changed', onDbl)
    window.addEventListener('fishing-levelup', onTrawlLevelUp)
    return () => {
      window.removeEventListener('fishing-xp-changed', onXP)
      window.removeEventListener('doubloons-changed', onDbl)
      window.removeEventListener('fishing-levelup', onTrawlLevelUp)
    }
  }, [])
  // Level-up celebration carries both the old AND new level so we can
  // compute the stat deltas the player just earned (catch-zone width,
  // bite speed, zone unlocks) — see fishingLevelDeltas() helper.
  const [levelUpNotif, setLevelUpNotif] = useState<{ from: number; to: number } | null>(null)
  // A level-up is QUEUED, not shown instantly, so it never buries the catch
  // reveal (a legendary was landing right as the overlay slammed over it). The
  // fish shows first; the overlay slides in after a beat, or the moment the
  // player taps Cast Again — whichever comes first.
  const pendingLevelUpRef = useRef<{ from: number; to: number } | null>(null)
  // What the levels just crossed actually PAID. Reconciled with the server, which owns
  // the money and is the only thing that can say "already paid" -- so a level earned by
  // a TRAWL while the player was nowhere near this screen still gets handed over.
  const [levelRewards, setLevelRewards] = useState<{ level: number; reward: LevelReward }[]>([])
  const [podiumNotif, setPodiumNotif] = useState<PodiumNotif | null>(null)
  const podiumPositionsRef = useRef<{ fishingLevel: number | null; perfectStreak: number | null }>({ fishingLevel: null, perfectStreak: null })
  const [, startTransition]         = useTransition()

  // ── Daily challenges ────────────────────────────────────────────────────
  // Pass the current fishing level to the fallback so the client doesn't
  // briefly flash a zone challenge the player can't actually do before
  // the server-loaded set replaces it. Server-side path always passes
  // the snapshotted level — see fishing/actions.ts + dailyChallengeActions.
  const dailyChallenges = initialDailyChallenge
    ? initialDailyChallenge.challenges
    : getDailyChallenges(new Date().toISOString().slice(0, 10), getLevelFromXP(initialFishingXP))
  const [dailyProgress, setDailyProgress] = useState<number[]>(initialDailyChallenge?.progress ?? [0, 0, 0])
  const [dailyClaimed, setDailyClaimed] = useState<boolean[]>(initialDailyChallenge?.claimed ?? [false, false, false])
  // The all-three sweep bonus. `sweepClaimed` is the server's word on whether
  // today's gems are already paid; `sweepAward` is the one-shot celebration
  // that fires on the claim that completed the set.
  const [sweepClaimed, setSweepClaimed] = useState(initialDailyChallenge?.sweepClaimed ?? false)
  const [sweepAward, setSweepAward] = useState(false)
  const [claimingSweep, setClaimingSweep] = useState(false)
  // What the Master challenge's crate turned out to be. Shown inline in the
  // drawer rather than routed through the big reel-in crate reveal, which is
  // welded to the fishing result phase and would fight the open drawer.
  const [masterCrate, setMasterCrate] = useState<
    { tier: CrateTierId; loot: CrateLootView } | null
  >(null)
  // Push local progress + claimed up to the parent on every change so the
  // state survives a ZoneLanding remount when the player switches zones.
  // Without this the second zone reads a stale server snapshot and the
  // claim UI reappears for an already-claimed challenge.
  useEffect(() => {
    onDailyChallengeChange?.(dailyProgress, dailyClaimed, sweepClaimed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyProgress, dailyClaimed, sweepClaimed])
  const [dailyOpen, setDailyOpen] = useState(false)
  // Tap the active-event chip (docked on the action row under the XP bar) to
  // open a small drawer explaining what the event does.
  const [eventInfoOpen, setEventInfoOpen] = useState(false)
  const [dailyJustCompleted, setDailyJustCompleted] = useState<number | null>(null)
  const [claimingDaily, setClaimingDaily] = useState<number | null>(null)

  // ── Random events ───────────────────────────────────────────────────────
  const [activeEvent, setActiveEvent] = useState<{ type: EventType; endsAt: number } | null>(null)
  const [eventAnnouncing, setEventAnnouncing] = useState(false)
  const activeEventRef = useRef<{ type: EventType; endsAt: number } | null>(null)
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fishingLevel = getLevelFromXP(fishingXP)
  // Renown no longer touches the catch window. Precision widened it a hair per
  // point and was replaced by Providence, which is a crate-rate multiplier
  // resolved server-side in castLine, so nothing here reads it.
  const levelBonus   = levelCatchBonus(fishingLevel)

  // Needle state
  const [angle, setAngle]           = useState(270)
  const [zoneRotation, setZoneRotation] = useState(0)
  const [retryKey, setRetryKey]     = useState(0)
  // Blackout overlay — imperative, NOT state. setBlackoutOpacity used to
  // be the last remaining in-spin setState: it fires at random speed-change
  // boundaries (often inside the first revolution on slower dials) and the
  // resulting full-component render was the residual first-revolution
  // needle hitch after the zone-crossing paint went imperative. The div
  // stays mounted with opacity 0; show/hide writes style directly,
  // preserving the asymmetric fade (0.25s in / 0.6s out).
  const blackoutRef = useRef<HTMLDivElement | null>(null)
  const paintBlackout = (o: number) => {
    const el = blackoutRef.current
    if (!el) return
    el.style.transition = o > 0 ? 'opacity 0.25s ease-in' : 'opacity 0.6s ease-out'
    el.style.opacity = String(o)
  }
  const angleRef        = useRef(270)
  const speedRef        = useRef(0)
  const dirRef          = useRef(1)
  const phaseRef        = useRef<Phase>('idle')
  // Desktop keyboard: Space presses whatever the action row currently shows
  // (Cast / Reel In / Open Crate / Claim / Cast Again / Claim Trophy — the
  // tagged data-space-action button). The dispatcher fires the same
  // pointerdown the button binds, so nothing here re-derives button guards.
  useEffect(() => installSpaceAction(), [])

  const animRef         = useRef<number | null>(null)
  const blackoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTimeRef     = useRef(0)
  const elapsedMsRef    = useRef(0)
  const nextChgMsRef    = useRef(0)
  // Smoothed rAF frame duration (ms) — drives the lock-in freeze's
  // forward lookahead (see handleReelIn). 16.7 until measured; 120Hz
  // phones converge to ~8.3 within a few frames.
  const frameDurRef     = useRef(16.7)
  // Compositor-driven needle. The needle used to be an SVG <g> rotated via
  // setAttribute('transform') from the rAF tick — but SVG attribute
  // transforms are NOT compositor-accelerated, so every frame the main
  // thread had to repaint the dial. At steady state that's cheap; in the
  // first ~0.5s after the dial mounts the main thread is busy with one-time
  // work (phase-flip render, first SVG rasterization, entrance animation,
  // layer-tree rebuild from visibility/class flips, GC from the cast server
  // action) and any overrun made the main-thread-driven needle visibly skip
  // — the unkillable "stutters near the start of the first revolution".
  // Now the needle lives in its own tiny overlay layer (HTML div) and spins
  // via a Web Animations API rotation that runs on the COMPOSITOR thread:
  // the main thread can block entirely and the needle still glides. The
  // angle is deterministic — a0 + dir × speed × elapsed — so the rAF tick
  // derives angleRef from the clock (for zone tells + lock-in resolution)
  // instead of integrating per-frame deltas. Reversals restart the
  // animation at the flip point (a deliberate discontinuity). If
  // element.animate is unavailable/fails, spinAnimRef stays null and the
  // tick falls back to the old imperative per-frame transform write.
  const needleGroupRef   = useRef<HTMLDivElement | null>(null)
  const spinAnimRef      = useRef<Animation | null>(null)
  const spinA0Ref        = useRef(0)         // angle at animation start (deg)
  const spinStartRef     = useRef<number | null>(null) // timeline time at start (ms)
  // True between the lock-in tap and the post-freeze yield in
  // handleReelIn — guards against a double-tap re-running resolution
  // while phase is still 'catching'. Reset defensively at spin start
  // (covers Second Wind, where phase never leaves 'catching').
  const reelLockPendingRef = useRef(false)
  /** Exact needle angle right now, derived from the animation clock.
   *  Uses document.timeline.currentTime (the time of the most recent
   *  rendering update) rather than performance.now(), which runs up to a
   *  frame ahead of it. NOTE: on mobile the glass is typically 1–2
   *  commits PAST even this — callers that freeze the visual must
   *  project forward, never freeze at this raw sample (see the lock-in
   *  protocol in handleReelIn). */
  const spinAngleNow = () => {
    if (spinAnimRef.current && spinStartRef.current !== null) {
      const tl = document.timeline?.currentTime
      const t = typeof tl === 'number' ? tl : performance.now()
      const a = spinA0Ref.current + dirRef.current * speedRef.current * (t - spinStartRef.current) / 1000
      return ((a % 360) + 360) % 360
    }
    return angleRef.current
  }
  /** (Re)start the compositor rotation from angle a0 in dirRef's direction. */
  const startNeedleSpin = (a0: number) => {
    const el = needleGroupRef.current
    spinAnimRef.current?.cancel()
    spinAnimRef.current = null
    spinStartRef.current = null
    spinA0Ref.current = a0
    if (!el || typeof el.animate !== 'function' || speedRef.current <= 0) return
    try {
      const anim = el.animate(
        [
          { transform: `rotate(${a0}deg)` },
          { transform: `rotate(${a0 + dirRef.current * 360}deg)` },
        ],
        { duration: 360_000 / speedRef.current, iterations: Infinity },
      )
      // Pin the start time synchronously so the visual position and the
      // deterministic angle math share the exact same t0 (otherwise the
      // animation starts "when ready", up to a frame later than now).
      const t0 = document.timeline?.currentTime
      if (typeof t0 === 'number') anim.startTime = t0
      spinAnimRef.current = anim
      spinStartRef.current = typeof t0 === 'number' ? t0 : performance.now()
    } catch {
      spinAnimRef.current = null
      spinStartRef.current = null
    }
  }
  /** Stop the compositor spin and freeze the needle at exactly `a` deg. */
  const freezeNeedleAt = (a: number) => {
    const el = needleGroupRef.current
    if (el) el.style.transform = `rotate(${a}deg)`
    spinAnimRef.current?.cancel()
    spinAnimRef.current = null
    spinStartRef.current = null
  }
  /** Imperative perfect-hit glow on the needle — the same visuals
   *  DialSVG renders for perfectFlash, painted directly in the tap's JS
   *  tick so the gold commits on the SAME frame as the needle freeze.
   *  Going through React cost 2 renders of this whole component before
   *  the glow reached the glass (~50–120ms late on mobile). React's
   *  perfectFlash render follows with identical values, then resets
   *  everything when the flash clears. */
  const paintNeedleGlow = () => {
    const ng = needleGroupRef.current
    if (!ng) return
    const g = ng.querySelector<SVGGElement>('g')
    if (g) g.style.filter = 'drop-shadow(0 0 6px #fde68a)'
    const lines = ng.querySelectorAll<SVGLineElement>('line')
    lines.forEach(l => l.setAttribute('stroke', '#fde68a'))
    lines[0]?.setAttribute('stroke-width', '12')
    lines[0]?.setAttribute('stroke-opacity', '0.28')
    lines[1]?.setAttribute('stroke-width', '3.6')
    const c = ng.querySelector<SVGCircleElement>('circle')
    if (c) { c.setAttribute('fill', '#fde68a'); c.setAttribute('r', '7') }
  }
  // Imperative target for the drift mechanic. Same pattern as the
  // needle: rotate the SVG zones group via setAttribute('transform')
  // every interval tick instead of triggering a parent re-render
  // through setZoneRotation. Eliminates the 33×/sec render thrash
  // during drift fish (Plesiosaurus / Chambered Nautilus / Tripod Fish).
  const zonesGroupRef    = useRef<SVGGElement | null>(null)
  // Imperative targets for the zone-crossing paint (needle color, arc
  // highlight, live zone label). Crossings used to call setAngle(...),
  // re-rendering this entire component ~6-10×/revolution; on a cold
  // first revolution those renders blew the frame budget and the needle
  // visibly hitched until React's render path warmed up. Now the tick
  // paints all three tells directly, same pattern as the needle
  // transform + drift rotation above.
  const zoneLabelRef     = useRef<HTMLParagraphElement | null>(null)
  const catchingZonesRef = useRef<ZoneDef[]>([])
  const zoneRotationRef  = useRef(0)
  const lastZoneFromRef  = useRef<number>(NaN)
  const hookedFishRef   = useRef<{ fishId: number; catchDifficulty: number; crateTier?: CrateTier; jackpotMult?: number; doubleCatch?: boolean; catchQty?: number } | null>(null)
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


  // First fishing visit → start the contextual coach flow with the "tap to cast"
  // tip. The dial tip follows on the first bite; both are plain, one-line hints.
  useEffect(() => {
    if (!hasSeenFishingTour) { fishTourActiveRef.current = true; setCoach('cast') }
  }, [hasSeenFishingTour])

  // Advance the coach flow off live game phases: cast → hide cast tip; a fish
  // bites (hooked) → show the dial tip; the first catch attempt resolves
  // (result) → clear it and mark the tour seen. Fires once (ref-gated).
  useEffect(() => {
    if (!fishTourActiveRef.current) return
    if (phase === 'casting' && coach === 'cast') {
      setCoach(null)                       // they cast → hide the cast tip
    } else if (phase === 'hooked' && coach !== 'dial') {
      setCoach('dial')                     // a fish is on → show the dial tip
      // They've cast and hooked — the loop's been taught. Complete the tour now
      // so closing / auto-hiding the dial tip can't leave it un-marked.
      fishTourActiveRef.current = false
      startTransition(async () => { await markFishingTourSeen() })
    }
  }, [phase, coach])

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
    // Megalodon (noBlackout) reads clean — its difficulty is the tightening perfect,
    // not the dark. Captured once so the lookup doesn't run inside the rAF tick.
    const fishSpecies = allFishSpecies.find(f => f.id === hookedFish.fishId)
    const noBlackout = selectedZone === 'ancient_deep' && BOSS_CONFIG[fishSpecies?.name ?? '']?.noBlackout === true

    speedRef.current   = baseMin + Math.random() * (baseMax - baseMin)
    lastTimeRef.current  = 0
    elapsedMsRef.current = 0
    nextChgMsRef.current = (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50
    lastZoneFromRef.current = NaN // force a zone sync on the first frame
    reelLockPendingRef.current = false // defensive: never start a spin locked

    // Hand the rotation to the compositor (see needleGroupRef block above).
    // The rAF tick below no longer MOVES the needle — it derives the angle
    // from the same clock the animation runs on, and only paints the
    // zone-crossing tells + runs the boundary mechanics.
    startNeedleSpin(angleRef.current)

    const tick = (timestamp: number) => {
      if (phaseRef.current !== 'catching') return
      if (lastTimeRef.current === 0) lastTimeRef.current = timestamp
      const delta = Math.min(timestamp - lastTimeRef.current, 50) // cap to avoid jump on tab-refocus
      lastTimeRef.current = timestamp
      elapsedMsRef.current += delta
      // Track the real display cadence for the lock-in lookahead.
      // Ignore degenerate deltas (first frame, tab-refocus, GC stalls).
      if (delta >= 4 && delta <= 40) frameDurRef.current = frameDurRef.current * 0.8 + delta * 0.2

      angleRef.current = spinAnimRef.current
        ? spinAngleNow()
        : ((angleRef.current + dirRef.current * speedRef.current * delta / 1000) % 360 + 360) % 360

      if (elapsedMsRef.current >= nextChgMsRef.current) {
        // NO speed re-roll here. The needle keeps the one speed rolled at cast start
        // for the whole spin — a mid-spin jump read as a stutter/skip. This boundary
        // now only drives the blackout (needle reversals were removed: even
        // telegraphed they felt like a cheap coin-flip, and the per-giant mechanics
        // carry the challenge on their own).
        const scaledBlackout = noBlackout ? 0 : zoneDiff.blackoutChance * (hookedFish.catchDifficulty / 5)
        if (Math.random() < scaledBlackout && blackoutTimerRef.current === null) {
          const duration = 500 + Math.random() * 600
          paintBlackout(0.91)
          blackoutTimerRef.current = setTimeout(() => {
            paintBlackout(0)
            blackoutTimerRef.current = null
          }, duration)
        }
        // Randomize mechanic: on some change ticks the whole ring SNAPS to a new
        // rotation — the layout jumps under you. getZone reads zoneRotationRef, so
        // the crossing paint + resolver follow the snap automatically. ~40% of
        // ticks so it's unpredictable but never a strobe.
        if (activeBossMechanicRef.current === 'randomize' && Math.random() < 0.4) {
          const r = Math.floor(Math.random() * 360)
          zoneRotationRef.current = r
          zonesGroupRef.current?.setAttribute('transform', `rotate(${r}, ${CX}, ${CY})`)
          // Sync state too (unlike drift/gyre, randomize has no re-asserting
          // interval, so an unrelated re-render would otherwise snap the VISUAL
          // back to the stale state rotation while the resolver uses the ref).
          setZoneRotation(r)
        }
        nextChgMsRef.current = elapsedMsRef.current + (zoneDiff.changeMin + Math.floor(Math.random() * (zoneDiff.changeMax - zoneDiff.changeMin))) * 50
      }
      // Fallback only — when the WAAPI spin couldn't start, drive the
      // needle imperatively per frame like the pre-compositor build did.
      const ng = needleGroupRef.current
      if (ng && !spinAnimRef.current) ng.style.transform = `rotate(${angleRef.current}deg)`
      // Zone-crossing paint — also imperative. This used to call
      // setAngle(...) so React could refresh the color/label tells, but
      // that re-rendered the entire component at every crossing; on a
      // cold first revolution those renders overran the frame budget and
      // the needle visibly hitched/skipped until the render path warmed
      // up. Now the three tells (needle paint, arc highlight, zone
      // label) are written directly and React stays out of the spin.
      const zNow = getZone(catchingZonesRef.current, angleRef.current, zoneRotationRef.current)
      if (zNow.from !== lastZoneFromRef.current) {
        lastZoneFromRef.current = zNow.from
        if (ng) {
          ng.querySelectorAll('line').forEach(l => l.setAttribute('stroke', zNow.color))
          ng.querySelector('circle')?.setAttribute('fill', zNow.color)
        }
        // Arc highlight — mirrors zoneOpacity()'s catching branch exactly.
        const zg = zonesGroupRef.current
        if (zg) {
          const arcs = zg.querySelectorAll<SVGPathElement>('path[data-zone-arc]')
          const zonesNow = catchingZonesRef.current
          arcs.forEach((p, i) => {
            const z = zonesNow[i]
            if (!z) return
            const op = z.from === zNow.from ? 1.0 : z.type === 'perfect' ? 0.50 : z.type === 'penalty' ? 0.45 : 0.28
            p.setAttribute('fill-opacity', String(op))
          })
        }
        // (The live per-frame zone label was removed — it was visual noise; the
        // needle colour + arc highlights already signal the current zone.)
      }
      animRef.current = requestAnimationFrame(tick)
    }
    animRef.current = requestAnimationFrame(tick)
    return () => {
      if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
      if (blackoutTimerRef.current) { clearTimeout(blackoutTimerRef.current); blackoutTimerRef.current = null }
      paintBlackout(0)
      // Stop the compositor spin on any exit path (lock-in already froze it
      // at the exact tap angle; this covers Tide Turner skips / leaving).
      angleRef.current = spinAngleNow()
      freezeNeedleAt(angleRef.current)
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

  // Drift mechanic: zone arc rotates continuously while the needle
  // spins. Updates the rotation ref + SVG group transform imperatively
  // every 30ms instead of calling setZoneRotation, matching the needle
  // pattern. The previous setState approach forced a parent re-render
  // ~33×/sec — invisible on desktop, observable as input lag on lower-
  // tier phones because each re-render rebuilds catchingZones and
  // re-runs every dependent useMemo / inline calc downstream. The rAF
  // tick already reads zoneRotationRef.current for zone-crossing
  // detection so the catch math is unaffected; handleReelIn now reads
  // from the same ref for resolution.
  useEffect(() => {
    // Surge (Basilosaurus) rides the same one-way drift; its extra bite is the
    // per-phase speed ramp handled in the stage-advance (accelerate escalation).
    if (phase !== 'catching' || (activeBossMechanic !== 'drift' && activeBossMechanic !== 'surge')) return
    const id = setInterval(() => {
      const next = (zoneRotationRef.current + 2.4) % 360 // ~80°/s — a brisk circle, not a crawl
      zoneRotationRef.current = next
      const zg = zonesGroupRef.current
      if (zg) zg.setAttribute('transform', `rotate(${next}, ${CX}, ${CY})`)
    }, 30)
    return () => clearInterval(id)
  }, [phase, activeBossMechanic])

  // Gyre mechanic (Mosasaurus, Bigfin Squid): the ring ROCKS back and forth like a
  // swell instead of drifting one way — the sea-dragon coiling. Same imperative
  // rotation channel as drift (so getZone + the resolver follow it for free), but a
  // sine sway around the stage's starting rotation. You time the turnaround, where
  // the ring hangs still for a beat, rather than a steady chase. ~±46° over ~1.5s.
  useEffect(() => {
    if (phase !== 'catching' || activeBossMechanic !== 'gyre') return
    const base = zoneRotationRef.current
    const AMP = 46, PERIOD = 1500 // wider + faster rock than before (was 38 / 2400)
    let t = 0
    const id = setInterval(() => {
      t += 30
      const next = (base + AMP * Math.sin((t / PERIOD) * Math.PI * 2) + 360) % 360
      zoneRotationRef.current = next
      const zg = zonesGroupRef.current
      if (zg) zg.setAttribute('transform', `rotate(${next}, ${CX}, ${CY})`)
    }, 30)
    return () => clearInterval(id)
  }, [phase, activeBossMechanic])

  // Deep-zone CURRENT: the zone's signature mechanic. Every catch in Deep rides a
  // slow, steady one-way drift (ZONE_DIFFICULTY.driftPerTick) — a deep-sea current
  // pushing the ring. Same imperative rotation channel as the boss drift, so getZone
  // + the reel-in resolver follow it for free with zero React re-renders. Skipped while
  // a boss mechanic owns the rotation (Ancient Deep), so the two never fight the channel.
  useEffect(() => {
    if (phase !== 'catching' || activeBossMechanic) return
    const per = (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).driftPerTick
    if (!per) return
    const id = setInterval(() => {
      const next = (zoneRotationRef.current + per) % 360
      zoneRotationRef.current = next
      const zg = zonesGroupRef.current
      if (zg) zg.setAttribute('transform', `rotate(${next}, ${CX}, ${CY})`)
    }, 30)
    return () => clearInterval(id)
  }, [phase, activeBossMechanic, selectedZone])

  // ── Mid-cast exit guard ─────────────────────────────────────────────
  // Once castLine fires, the server has already deducted the bait — a
  // hard exit (Back button, in-app nav, tab close) doesn't refund it.
  // Intercept those nav attempts during the in-flight phases and route
  // them through a confirm modal so the player doesn't lose worms (or
  // worse, a Golden Lure) by accident. Mirrors the raid flee-guard in
  // RaidGame.tsx. Active during casting/hooked/catching/reeling — every
  // phase where bait has been spent but the result hasn't landed.
  useEffect(() => {
    const inFlight = phase === 'casting' || phase === 'hooked' || phase === 'catching' || phase === 'reeling'
    if (!inFlight) return
    window.history.pushState(null, '', window.location.href) // Back sentinel
    const signal = (nav: () => void) => {
      pendingLeaveNavRef.current = nav
      setLeaveConfirmOpen(true)
    }
    const onClickCapture = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as HTMLElement | null)?.closest('a')
      if (!a) return
      const tgt = a.getAttribute('target')
      if (tgt && tgt !== '_self') return
      const href = a.getAttribute('href')
      if (!href || !href.startsWith('/')) return                  // same-app routes only
      if (href.split(/[?#]/)[0] === window.location.pathname) return // same page
      e.preventDefault()
      e.stopPropagation()
      signal(() => router.push(href))
    }
    const onPop = () => {
      window.history.pushState(null, '', window.location.href)    // re-arm; stay put
      signal(() => router.push('/fishing'))
    }
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    document.addEventListener('click', onClickCapture, true)
    window.addEventListener('popstate', onPop)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('click', onClickCapture, true)
      window.removeEventListener('popstate', onPop)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [phase, router])

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

  // Fire the low-bait warning when total bait crosses the 5-cast
  // threshold downward (e.g. 6→5). Skip 0→1 climbs (bait purchase)
  // and steady states (no change). Ref-of-prev avoids spamming a
  // toast on every render — only the actual crossing fires.
  useEffect(() => {
    const total = baitInventory.reduce((s, b) => s + b.quantity, 0)
    const prev = prevBaitTotalRef.current
    prevBaitTotalRef.current = total
    if (prev == null) return
    if (total <= 5 && total > 0 && prev > 5) {
      setLowBaitMsg(`Low bait — ${total} cast${total === 1 ? '' : 's'} left`)
    }
  }, [baitInventory])

  // Core cast logic — no phase guard, called from both Cast and Cast Again
  async function doCast() {
    const currentQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    if (currentQty <= 0) { setPhase('idle'); return }
    // Belt-and-suspenders: clear any stale crate state from a previous
    // catch. handleCastAgain already does this, but handleCast (and the
    // autocaster path) didn't — and a stuck crateResult will hide the
    // Cast Again button on the next regular catch.
    setCrateResult(null)
    setCrateOpenSignal(false)
    setCratePhase('closed')

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
        // The server just contradicted the screen. That is the strongest signal
        // there is that the local hold has drifted, and the case it was reported
        // in is exactly this one: a pill reading 38/40 next to a refusal saying
        // the hold is full. Re-read rather than leave the two disagreeing.
        syncFishHold().then(rows => { if (rows) setInventory(rows) }).catch(() => {})
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

      vigilRankRef.current = res.vigilRank
      setVigilRank(res.vigilRank)
      setHookedFish({ fishId: res.fishId, catchDifficulty: res.catchDifficulty, biteRarity: res.biteRarity, crateTier: res.crateTier, jackpotMult: res.jackpotMult, doubleCatch: res.doubleCatch, catchQty: res.catchQty })

      // Lightsaber Lightspeed cue — the blade flashed the fish onto the line.
      if (res.instantBite) {
        setInstantBiteFlash(true)
        setTimeout(() => setInstantBiteFlash(false), 1100)
      }

      // Decode-ahead: fetch + decode the result card's fish art NOW, off
      // the main thread, while the player is watching the hooked beat and
      // spinning the dial. Without this the image loads when the result
      // card mounts — a visible pop-in, and on slow connections a blank
      // hero slot. Mirrors the cosmetic sprite preload pattern above.
      const hookedName = allFishSpecies.find(f => f.id === res.fishId)?.name
      if (hookedName) {
        const pre = new Image()
        pre.src = fishImageUrl(hookedName)
        pre.decode().catch(() => {})
      }

      // Initialise boss-fight state for ancient_deep. ALL ancient_deep
      // fish run a multi-phase reel; trophies are 3-phase with a fixed
      // mechanic, new sellable regulars are 2-phase with their own
      // mechanic each. Wildcard fish (Shastasaurus, Sea Lamprey) reroll
      // the mechanic per stage.
      if (selectedZone === 'ancient_deep') {
        const bossName = allFishSpecies.find(f => f.id === res.fishId)?.name ?? ''
        const baseCfg = BOSS_CONFIG[bossName] ?? { mechanic: 'shrink' as BossMechanic, phases: 2 }
        const mechanic = baseCfg.wildcard
          ? WILDCARD_MECHANICS[Math.floor(Math.random() * WILDCARD_MECHANICS.length)]
          : baseCfg.mechanic
        const cfg = vigilBossConfig(baseCfg, mechanic, res.vigilRank)
        activeBossMechanicRef.current = mechanic
        setActiveBossMechanic(mechanic)
        bossStageRef.current = 1
        setBossStage(1)
        // Megalodon opens on a WIDE perfect (negative perfectShrinkStart) and tightens
        // each phase; everyone else starts un-shrunk.
        const startShrink = cfg.perfectShrinkStart ?? 0
        bossZoneShrinkRef.current = startShrink
        setBossZoneShrink(startShrink)
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
      zoneRotationRef.current = rot
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

  /** True if Finn actually appeared. False means the cast should carry on. */
  function fireFinnEncounter(): boolean {
    // Reveal supersedes every other beat once the player has landed an
    // Ancient Deep trophy and hasn't seen the climax yet.
    const hasAncientTrophy = ancientCatches.size > 0
    if (hasAncientTrophy && !finnRevealed) {
      setFinnOverlay({ mode: 'reveal', lines: FINN_REVEAL_BEAT.lines })
      setFinnRevealed(true)
      setFinnSeenBeats(prev => prev.includes('reveal') ? prev : [...prev, 'reveal'])
      startTransition(() => { void markFinnRevealSeen() })
      return true
    }

    // Normal encounter — bump counters, pick story beat (if any), pick challenge.
    const newEncounters = finnEncounters + 1
    const beat = findNextEncounterBeat(newEncounters, finnSeenBeats)

    // Pick challenge type. Speed challenges don't make sense in Ancient
    // Deep (boss-style multi-stage catches break the timer concept), so
    // we force perfect_streak there.
    const zoneSpeedMult = FINN_SPEED_ZONE_MULT[selectedZone] ?? 1

    // THE HOLD HAS TO BE ABLE TO TAKE THE WIN.
    //
    // Every challenge is counted in FISH LANDED, so a bet needing seven fish
    // against two free slots cannot be won without going to sell, and going
    // anywhere unmounts this screen and takes the challenge with it. A player
    // lost several that way and reasonably read it as the game punishing him
    // for stepping out.
    //
    // The bet is therefore sized to the room actually available: fall back to
    // the other challenge type if the rolled one cannot fit, then walk the tier
    // down. Below the smallest bet of either type there is nothing honest to
    // offer, so Finn does not appear at all and the cast carries on. The
    // encounter is free and there will be another one.
    const freeSlots = selectedZone === 'ancient_deep'
      ? Number.MAX_SAFE_INTEGER          // trophies bypass the hold entirely
      : Math.max(0, holdCapacity - holdTotalCount)
    const needOf = (ty: FinnChallengeType, t: number) => ty === 'perfect_streak'
      ? FINN_PERFECT_TIERS[t - 1].perfects
      : FINN_SPEED_TIERS[t - 1].fish

    let type: FinnChallengeType = zoneSpeedMult === 0 ? 'perfect_streak' : pickChallengeType()
    if (zoneSpeedMult !== 0 && needOf(type, 1) > freeSlots) {
      const other: FinnChallengeType = type === 'perfect_streak' ? 'speed_catch' : 'perfect_streak'
      if (needOf(other, 1) <= freeSlots) type = other
    }
    let tier = pickFinnTier()
    while (tier > 1 && needOf(type, tier) > freeSlots) tier--
    if (needOf(type, tier) > freeSlots) return false

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
    let lines: (string | FinnSceneLine)[]
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
    return true
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

    let lines: (string | FinnSceneLine)[]
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
  // Skipped while a level-up overlay is open so the player isn't taxed
  // wall-clock time they spent reading the level-up popup (see the pause
  // effect below — it bumps speedEndsAt forward by the paused duration
  // so this effect re-runs against the new deadline on resume).
  useEffect(() => {
    if (!finnChallenge?.speedEndsAt) return
    if (levelUpNotif) return
    const ms = finnChallenge.speedEndsAt - Date.now()
    if (ms <= 0) { resolveFinnChallenge(false); return }
    const t = setTimeout(() => resolveFinnChallenge(false), ms)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finnChallenge?.speedEndsAt, levelUpNotif])

  // Pause/resume the Finn speed clock around the level-up overlay so the
  // player doesn't bleed seconds while reading the celebration. On open
  // we stash the pause timestamp; on close we shift speedEndsAt forward
  // by the elapsed paused duration. The display freezes during the pause
  // via SpeedClock's `paused` prop (see component above).
  const finnPausedAtRef = useRef<number | null>(null)
  useEffect(() => {
    if (!finnChallenge?.speedEndsAt) return
    if (levelUpNotif) {
      if (finnPausedAtRef.current == null) finnPausedAtRef.current = Date.now()
    } else if (finnPausedAtRef.current != null) {
      const elapsed = Date.now() - finnPausedAtRef.current
      finnPausedAtRef.current = null
      setFinnChallenge(c => c?.speedEndsAt ? { ...c, speedEndsAt: c.speedEndsAt + elapsed } : c)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelUpNotif, finnChallenge?.speedEndsAt])

  useEffect(() => {
    if (!gearOpen) return
    const t = setTimeout(() => setGearMounted(true), 240)
    return () => clearTimeout(t)
  }, [gearOpen])

  // Phase 1 — cast (from idle)
  async function handleCast() {
    if (phase !== 'idle') return
    if (finnPending) return  // encounter is loading in
    setFreshCatchHook(null)  // moving on from the last catch — dismiss the Logbook flash
    // 2% chance Finn intercepts the cast (no bait consumed). Suppressed
    // while a challenge is already in flight so the player isn't double-bet.
    if (!finnChallenge && !finnOverlay && Math.random() < FINN_ENCOUNTER_RATE) {
      // Brief cast ripple for tap feedback before Finn arrives — keeps
      // the tap from feeling unresponsive during the 500ms lead-in.
      setCastRippleKey(k => k + 1)
      setTimeout(() => setCastRippleKey(0), 1800)
      // Finn declines to show when the hold cannot take the win. The cast then
      // has to carry on as a normal cast rather than being eaten.
      if (fireFinnEncounter()) return
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
    // Re-entrancy guard: phase stays 'catching' during the one-frame
    // yield below, so a double-tap would otherwise run the resolution
    // twice against the same hooked fish.
    if (reelLockPendingRef.current) return
    reelLockPendingRef.current = true
    // Cut the dial sound immediately on tap.
    stopDialLoop()
    if (animRef.current) { cancelAnimationFrame(animRef.current); animRef.current = null }
    // Lock-in protocol (compositor-spin era). Hard rule from playtesting:
    // the needle must NEVER move backwards after the tap. The WAAPI spin
    // runs on the compositor thread, and on mobile the glass is 1–2
    // frames PAST any angle the main thread can sample — so freezing at
    // a sampled angle snapped the needle backwards, and an eased settle
    // back to the tap angle read as the needle "moving back" (both
    // shipped, both rejected). Freeze FORWARD instead: predict the angle
    // the spin will be showing on the commit the freeze actually lands
    // on (sampled angle + ~2 frames of rotation at the measured display
    // cadence) and write that. Any prediction error is a tiny skip in
    // the direction of travel — invisible at spin speed — never a
    // back-step. The catch resolves at that same frozen angle, so the
    // needle's rest position IS the resolved zone: what you see is what
    // you got, with no mismatch for the player to catch.
    //
    // Everything below up to the hop runs SYNCHRONOUSLY in the tap's own
    // JS tick: the freeze write, the zone resolution (plain math), and —
    // when the player nailed the perfect zone — the SFX + haptic + an
    // imperative gold glow on the needle. The glow paints with the same
    // commit as the freeze, so "needle stops" and "needle flashes gold"
    // are literally the same frame. Routing the glow through React cost
    // two renders of this component before it reached the glass.
    let resolveAngle: number
    if (spinAnimRef.current) {
      // Cap the frame duration the lookahead scales with. At 60fps (~16ms) this
      // is a no-op, so the tuned feel is unchanged; but if the frame rate drops
      // (a laggy Ancient Deep dial), an un-capped lookahead balloons and the
      // resolve overshoots the tight perfect — you tap the gold and it lands on the
      // miss past it. 20ms bounds that.
      const lookaheadMs = REEL_LOOKAHEAD_FRAMES * Math.min(frameDurRef.current, 20)
      const a = spinAngleNow() + dirRef.current * speedRef.current * lookaheadMs / 1000
      resolveAngle = ((a % 360) + 360) % 360
    } else {
      resolveAngle = spinAngleNow() // imperative fallback: glass == angleRef
    }
    angleRef.current = resolveAngle
    freezeNeedleAt(resolveAngle)

    const zoneDiff2 = ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows
    const baitBonus = getBait(selectedBaitRef.current).catchZoneBonus
    const eventCatchBonus = activeEventRef.current?.type === 'glassy' ? 12 : 0
    // Shrink narrows the green catch band too (not just the perfect), so the whole
    // window closes stage to stage — applied as a negative catch bonus here and
    // mirrored in the catchingZones memo so the picture and resolver match.
    const shrinkCatch2 = activeBossMechanicRef.current === 'shrink' ? bossZoneShrinkRef.current : 0
    const baseZones = buildFishZones(hookedFishRef.current.catchDifficulty, hookTier, line.penaltyMultiplier, zoneDiff2.catchMultiplier, levelBonus + baitBonus + rod.catchZoneBonus + eventCatchBonus - shrinkCatch2, rod.perfectZoneBonus + 1)
    const zones = selectedZone === 'ancient_deep'
      ? applyBossMods(baseZones, activeBossMechanicRef.current, bossZoneShrinkRef.current)
      : baseZones
    // Drift mechanic: read the live rotation from the ref, not stale
    // state. The ref is the source of truth during the spin; state only
    // resyncs at one-shot transitions (cast, stage clear, second wind).
    // resolveAngle is the frozen rest angle — the visual and the
    // resolution are the same angle by construction, see the lock-in
    // protocol above.
    const zone = getZone(zones, resolveAngle, zoneRotationRef.current)

    // Instant perfect feedback — same JS tick as the input. Audio +
    // haptic fire now; the glow paints imperatively and lands on the
    // freeze frame. The React-side burst ring / arc flash / state follow
    // after the hop (they're decorative chasers, not the tactile hit).
    if (zone.type === 'perfect') {
      playPerfectSfx()
      vibrate([40, 60, 80])
      paintNeedleGlow()
    } else {
      // Non-perfect reels still get an "input registered" tick in the same
      // JS tick as the tap — the perfect buzz stays its own distinct signal.
      vibrate(6)
    }

    // The hop matters: it lets the freeze + glow COMMIT before the heavy
    // resolution render below (zone math + phase flip of this 7.5k-line
    // component) blocks the main thread. Without it the compositor keeps
    // spinning the needle 30–60ms past our written angle, then snaps.
    // A bare await-rAF resumes BEFORE that frame's style/paint, hence
    // the setTimeout(0) inside.
    await new Promise<void>(r => requestAnimationFrame(() => setTimeout(r, 0)))
    reelLockPendingRef.current = false
    setAngle(angleRef.current)
    setSnapKey(k => k + 1)
    setReelRippleKey(k => k + 1)
    setTimeout(() => setReelRippleKey(0), 1800)

    // Snag immune: treat penalty as miss — no extra bait lost
    const effectiveZoneType = (zone.type === 'penalty' && rod.snagImmune) ? 'miss' : zone.type

    if (effectiveZoneType === 'penalty') deductBait(selectedBaitRef.current)

    const isCatch = effectiveZoneType === 'catch' || effectiveZoneType === 'perfect'

    // Ancient Deep: multi-phase reel. Trophies = 3 stages, new sellable
    // regulars = 2 stages, both keyed off BOSS_CONFIG[name].phases.
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
        const bossName = allFishSpecies.find(f => f.id === hookedFishRef.current?.fishId)?.name ?? ''
        const cfg = vigilBossConfig(
          BOSS_CONFIG[bossName] ?? { mechanic: 'shrink' as BossMechanic, phases: 2 },
          activeBossMechanicRef.current ?? 'shrink',
          vigilRankRef.current,
        )
        if (stage < cfg.phases) {
          // Mid-stage perfect feedback: the SFX + haptic + needle glow
          // already fired in the tap's JS tick (pre-hop, see the lock-in
          // protocol above), so a perfect on stage 1 of a 2-phase fish
          // (precision Snipe Eel especially — every catch HAS to be a
          // perfect) gets the same instant hit as a final-stage perfect.
          // We return early from this branch on a stage clear and never
          // reach the 'wasPerfect' block below, so fire the React-side
          // chasers (burst ring + flash state) here.
          if (zone.type === 'perfect') {
            setPerfectBurstKey(k => k + 1)
            setPerfectFlash(true)
          }
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
          if (cfg.perfectShrinkStep != null) {
            // Megalodon's consistency ramp: the perfect closes a step each phase
            // (from its wide start toward a tight sliver) and the needle nudges
            // faster. Mechanic stays 'precision', so every phase is perfect-only.
            const newShrink = bossZoneShrinkRef.current + cfg.perfectShrinkStep
            bossZoneShrinkRef.current = newShrink
            setBossZoneShrink(newShrink)
            if (cfg.speedStepMult) bossNeedleMultRef.current = Math.min(bossNeedleMultRef.current * cfg.speedStepMult, 4.0)
          } else if (mechanic === 'accelerate' || mechanic === 'surge') {
            // accelerate + surge both ramp needle speed each phase (surge also drifts
            // via its own interval). shrink is NOT stepped here — it breathes in real
            // time and reads bossStage for its per-phase intensity, so it needs no
            // bossZoneShrink escalation (held at 0 so the memo renders the open base).
            bossNeedleMultRef.current = Math.min(bossNeedleMultRef.current * 1.4, 4.0)
          }

          // Wildcard fish (Sea Lamprey) reroll the mechanic each stage instead of
          // escalating one fixed mechanic.
          if (cfg.wildcard) {
            const next = WILDCARD_MECHANICS[Math.floor(Math.random() * WILDCARD_MECHANICS.length)]
            activeBossMechanicRef.current = next
            setActiveBossMechanic(next)
            bossZoneShrinkRef.current = 0 // shrink breathes via its interval, not a static value
            setBossZoneShrink(0)
            bossNeedleMultRef.current = (next === 'accelerate' || next === 'surge') ? 1.5 : 1.0
          }

          {
            const stageRot = Math.floor(Math.random() * 360)
            zoneRotationRef.current = stageRot
            setZoneRotation(stageRot)
          }
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
        zoneRotationRef.current = rot
        setZoneRotation(rot)
        angleRef.current = Math.random() * 360
        dirRef.current = 1
        setAngle(angleRef.current)
        setRetryKey(k => k + 1)
        return
      }

      // Miss/penalty: the streak resets, crates included. A fumbled crate never
      // calls back to the server, so the server side of this is castLine: the
      // cast left catch_pending set and the NEXT cast zeroes the streak through
      // the same path an abandoned fish takes. This is the optimistic half, so
      // the counter drops the instant you fumble rather than one cast later.
      // (Finn perfect challenge is unaffected by misses — it only fails on a
      // non-perfect CATCH.)
      setPerfectStreak(0)
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
      // SFX + haptic + needle glow already fired in the tap's JS tick
      // (pre-hop, see the lock-in protocol above) — only the React-side
      // chasers happen here.
      // Sync zoneRotation state ← ref so the perfect-burst arc, which
      // renders with `rotation` from state, lands on the actual current
      // zone position. During drift this state can be many degrees
      // behind the ref since we stopped per-frame setState; without
      // this sync the burst would render at the rotation the state
      // was last set to (cast init or stage clear).
      setZoneRotation(zoneRotationRef.current)
      setPerfectBurstKey(k => k + 1)
      setPerfectFlash(true)
    }

    // Perfect streak is server-authoritative (reelIn and reelCrate both compute
    // and return it). Optimistically reset on any non-perfect catch, crate or
    // fish, so the counter answers the tap immediately.
    if (!wasPerfect) setPerfectStreak(0)

    // Twin-Strike rod: 25% chance to catch 2 fish.
    // YOLO Rod: chance to catch 100x fish — odds scale per zone
    // (jackpotChanceForZone) so its ~150k/hr ceiling holds in every zone, and
    // the full ×100 now pays in the Ancient Deep too. Twin-Strike / Millionaire's
    // double STAYS disabled in the Ancient Deep (zone balanced around single
    // high-value catches). Ancient trophies (one-time bosses, sell_value 0)
    // never multiply. Server-side reelIn re-clamps so a manipulated client
    // can't claim more than the rod's max.
    // Rolled HERE (before the Finn block) so a speed challenge can count
    // the full haul from the same roll that reelIn receives below.
    const inAncient = selectedZone === 'ancient_deep'
    // The haul multipliers (jackpot / double-catch) are rolled SERVER-SIDE at
    // cast time now (castLine) and returned on the hooked fish. Use those
    // verbatim so the celebration matches exactly what reelIn grants — the
    // client no longer rolls its own, which is what made them forgeable.
    const jackpotMultiplier = hookedFishRef.current!.jackpotMult ?? 1
    const jackpotHit = jackpotMultiplier > 1
    const doubleCatch = hookedFishRef.current!.doubleCatch ?? false

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
        // Multi-catch rods count every fish in the haul — Twin-Strike /
        // Millionaire's doubles add 2, a YOLO jackpot adds the full ×N.
        // Crates aren't fish and never multiply, so they stay at 1.
        const haulQty = hookedFishRef.current!.fishId === CRATE_FISH_ID
          ? 1
          : (doubleCatch ? 2 : jackpotMultiplier)
        const newCount = (finnChallenge.fishCaught ?? 0) + haulQty
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
          const res = await reelCrate(selectedZone, tier, zone.type as 'perfect' | 'catch')
          if (!('error' in res)) {
            setCrateResult(res)
            // Sync to the server's number rather than trusting the optimistic
            // one above, same as the fish path does.
            if (typeof res.perfectStreak === 'number') setPerfectStreak(res.perfectStreak)
          }
        } catch {}
        setCratePhase('closed')
        phaseRef.current = 'result'
        setPhase('result')
      })
      return
    }

    startTransition(async () => {
      try {
      const res = await reelIn(hookedFishRef.current!.fishId, zone.type as 'perfect' | 'catch', selectedBaitRef.current, doubleCatch, 0, jackpotMultiplier)

      if ('error' in res || !res.caught) {
        setMissResult('miss')
      } else {
        const { fish, baitSaved, isNewSpecies, xpGained, newXP, dailyProgress: newDailyP } = res
        if (newDailyP) {
          setDailyProgress(prev => {
            // Length-driven: 4 once the player is past the Master gate.
            for (let i = 0; i < dailyChallenges.length; i++) {
              if (prev[i] < dailyChallenges[i].target && newDailyP[i] >= dailyChallenges[i].target) {
                setDailyJustCompleted(i)
                setTimeout(() => setDailyJustCompleted(null), 4000)
              }
            }
            return newDailyP
          })
        }
        // Perfected Sigil — server already credited the streak-scaled
        // bonus on a perfect catch when the sigil is equipped. Mirror
        // the new doubloons total locally + dispatch the change so Nav /
        // sticky pills update. Also spawn the coin-flight cosmetic so
        // the player sees the bonus actually landing on the Nav pill.
        if (res.newDoubloons != null) {
          setDoubloons(res.newDoubloons)
          window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
          // Give the Nav pill a render tick to mount with the new value
          // — querying for [data-doubloon-pill] in the same frame as the
          // setDoubloons can land before Nav re-renders, which is fine
          // (the rect is already laid out) but the value update lands
          // visually right as the coins arrive.
          spawnSigilCoins(res.sigilBonus ?? 0)
        }
        // First Ancient Deep Catch contest — server-side atomic claim
        // already happened. If THIS catch claimed it, fire the prize
        // overlay after a beat so the player reads the catch result
        // first, then the win announcement lands on top. The prize
        // mail is already in their inbox (sent server-side in the same
        // beat as the contest claim); the celebration tells them to
        // check it. Nav's mail pip catches up on next route change /
        // refresh, which is fine for a one-shot lifetime event.
        if ((res as { firstAncientCatch?: boolean }).firstAncientCatch) {
          setTimeout(() => setFirstAncientCeleb(true), 1500)
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
        // Mirror reelIn's priority: jackpot > Locked-In triple > double.
        const lockedQty = hookedFishRef.current?.catchQty ?? 1
        const desiredQty = jackpotMultiplier > 1 ? jackpotMultiplier : (lockedQty > 1 ? lockedQty : (doubleCatch ? 2 : 1))
        const actualQty = Math.min(desiredQty, Math.max(0, holdCapacity - currentHoldCount))
        // jackpotMultiplier is the YOLO Rod's special ×N event — only set
        // it when the YOLO jackpot actually triggered. Double catches go
        // through the separate "Double Catch — ×2" banner; we don't want
        // Millionaire's / Twin-Strike showing the "Jackpot!" banner too.
        setCatchResult({
          fish,
          baitSaved,
          isNewSpecies,
          isPerfect: wasPerfect,
          xpGained,
          doubleCatch,
          gemEarned: false,
          perfectStreak: res.perfectStreak ?? perfectStreak,
          streakBonusXP: res.streakBonusXP ?? 0,
          jackpotMultiplier: jackpotHit && actualQty > 1 ? actualQty : undefined,
          perfectXpMult: wasPerfect ? (rod.perfectXpMult ?? 1) : 1,
          sizeIn: res.sizeIn,
          sizeMin: res.sizeMin,
          sizeMax: res.sizeMax,
          sizeTier: res.sizeTier,
          isPB: res.isPB,
          previousBest: res.previousBest,
          isShiny: (res as { isShiny?: boolean }).isShiny ?? false,
          shinyId: (res as { shinyId?: number }).shinyId,
          alreadyMounted: (res as { alreadyMounted?: boolean }).alreadyMounted ?? false,
          wormhole: (res as { wormhole?: boolean }).wormhole ?? false,
          catchQty: actualQty,
          deepStirs: (res as { deepStirs?: boolean }).deepStirs ?? false,
        })
        // YOLO Rod jackpot — fire the full-screen celebration overlay on top
        // of the result card. Renders particles + a slamming "JACKPOT"
        // headline + a 0→N counter. Auto-dismisses after ~1.8s; tap anywhere
        // to skip. The result card stays underneath (with its own ×N banner)
        // as the post-celebration "proof" surface.
        if (jackpotHit && actualQty > 1) {
          setJackpotBoom({ qty: actualQty })
        }
        // First-catch celebration — armed if the server flag was unset
        // when the page loaded. Disarm immediately so a crate or double
        // catch on the same round can't re-fire it. Server-mark is
        // fire-and-forget; the local disarm is the actual one-shot guard.
        if (firstCatchArmedRef.current) {
          firstCatchArmedRef.current = false
          setCoach(null)   // clear the dial tip
          setWalkStep(0)   // kick off the post-first-catch walkthrough
          startTransition(() => { markFirstCatchCelebrationSeen().catch(() => {}) })
        }
        // Bump the live PB lookup so the collection drawer reflects the new
        // record without needing a page refresh. Server is authoritative —
        // we only mirror what reelIn already persisted.
        if (res.isPB && res.sizeIn > 0) {
          setPersonalBests(prev => ({ ...prev, [fish.id]: res.sizeIn }))
        }
        // Bump the live total-caught lookup so the collection detail modal
        // updates without a refresh. By ONE, not by actualQty:
        // fish_collection.catch_count counts CASTS, so a x100 jackpot is a
        // single catch of that species. Bumping by quantity made the tally
        // read 100 until the next refetch snapped it back to 1.
        setCatchCounts(prev => ({ ...prev, [fish.id]: (prev[fish.id] ?? 0) + 1 }))
        // Stage the Logbook header-button flash for noteworthy catches.
        // New species wins over PB so the gold treatment lands on
        // first-time catches that also set a PB. Cleared on next cast
        // or on opening the Logbook. Habitat is captured so the drawer
        // can auto-expand the right zone when the player taps the flash.
        if (isNewSpecies) {
          setFreshCatchHook('new-species')
          setLatestCatchHabitat(fish.habitat)
        } else if (res.isPB) {
          setFreshCatchHook('pb')
          setLatestCatchHabitat(fish.habitat)
        }
        if (isNewSpecies) {
          // Only the 6 sell_value-0 TROPHIES belong in ancientCatches (it mirrors
          // the server's ancient_catches column, which routes trophies only). The
          // 12 sellable ancient_deep regulars stack in the hold like any other
          // catch, so they track in caughtFishIds — putting them in ancientCatches
          // wrongly inflated the "N/6 giants" count.
          const isTrophy = fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0
          if (isTrophy) {
            setAncientCatches(prev => new Set([...prev, fish.id]))
          } else {
            setCaughtFishIds(prev => new Set([...prev, fish.id]))
            setUncheckedNewFishIds(prev => new Set([...prev, fish.id]))
          }
        }
        // ── Ancient giant slain — full-screen cinematic ──────────────────────
        // Fires only for the 6 trophies, and only on a first-ever catch of that
        // giant (they're one-and-done). Plays over the result card, which stays
        // underneath as the proof surface. ancientCatches state hasn't flushed
        // this tick, so count the giant we just landed by hand.
        if (isNewSpecies && fish.habitat === 'ancient_deep' && (fish.sell_value ?? 0) === 0) {
          const trophyTotal = allFishSpecies.filter(f => f.habitat === 'ancient_deep' && (f.sell_value ?? 0) === 0).length || 6
          const countAfter = new Set([...ancientCatches, fish.id]).size
          // Finn reacts to THIS giant after the slain-cinematic clears (see the
          // AncientSlainCinematic onDone). The first giant a captain lands also
          // stands in for the old encounter "reveal": flip finn_revealed so his
          // banter shifts to the epilogue pool and mark 'reveal' seen so the old
          // FINN_REVEAL_BEAT never also fires.
          const finnBeat = finnAncientBeat(fish.id)
          if (countAfter === 1 && !finnRevealed) {
            setFinnRevealed(true)
            setFinnSeenBeats(prev => prev.includes('reveal') ? prev : [...prev, 'reveal'])
            startTransition(() => { void markFinnRevealSeen() })
          }
          setAncientCinematic({ fish, count: countAfter, total: trophyTotal, isMegalodon: fish.id === MEGALODON_ID, finnBeat })
        }
        const catchCount = actualQty
        const newCatches = [...sessionCatches, ...Array(catchCount).fill(fish)]
        const newPerfects = sessionPerfects + (wasPerfect ? 1 : 0)
        const newNewSpecies = sessionNewSpecies + (isNewSpecies ? 1 : 0)
        setSessionCatches(newCatches)
        if (wasPerfect) setSessionPerfects(newPerfects)
        if (isNewSpecies) setSessionNewSpecies(newNewSpecies)

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
        // Renown crossing (post-100): one banked point per level crossed. The
        // overlay fires after the level-up overlay is dismissed if both hit.
        const oldRenown = renownLevel('fishing', fishingXP)
        const newRenown = renownLevel('fishing', newXP)
        setFishingXP(newXP)
        if (newRenown > oldRenown) {
          setRenownUpNotif({ skill: 'fishing', toLevel: newRenown, points: newRenown - oldRenown })
        }
        setXpPopup({ value: xpGained, id: Date.now(), prestige: (prestigeLevels[fish.habitat] ?? 0) > 0 })
        // Crossing INTO level 100 is the pinnacle moment — show the grand
        // max-level + Renown intro instead of the normal level-up overlay.
        const hitMax = newLevel >= MAX_LEVEL && oldLevel < MAX_LEVEL
        if (hitMax && !renownIntroSeen) {
          setTimeout(() => setRenownIntro(true), 600)
          window.dispatchEvent(new CustomEvent('fishing-leveled'))
        } else if (newLevel > oldLevel) {
          // QUEUE the overlay behind the catch reveal — don't slam it over the
          // fish the instant it surfaces. Auto-reveal after a beat if the player
          // is still on the result; handleCastAgain flushes it first otherwise.
          pendingLevelUpRef.current = { from: oldLevel, to: newLevel }
          setTimeout(() => {
            if (pendingLevelUpRef.current && phaseRef.current === 'result') {
              setLevelUpNotif(pendingLevelUpRef.current)
              pendingLevelUpRef.current = null
            }
          }, 2100)
          // Paint the payload instantly from the shared table so the overlay is never
          // empty, then reconcile with the server (which is authoritative on the coin).
          setLevelRewards(rewardsOwed(oldLevel, newLevel))
          claimFishingLevelRewards().then(res => {
            if (res.granted.length > 0) setLevelRewards(res.granted)
            setDoubloons(res.newDoubloons)
            window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
            window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.newGems }))
            if (res.newHoldTier > 0) setCurrentFishHoldTier(res.newHoldTier)
          }).catch(() => {})
          // Tell the Trawls indicator a level-up overlay is showing, so it
          // holds any "Crew Trawls unlocked" celebration until this is dismissed
          // (no stacked popups). Then nudge it to re-check the slot count.
          window.dispatchEvent(new CustomEvent('fishing-levelup-open'))
          window.dispatchEvent(new CustomEvent('fishing-leveled'))
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

  // Quick Sell now sweeps the whole hold in ONE server call (quickSellAllFish)
  // and updates the UI once with the lump sum — it used to loop sellFish per
  // species, awaiting each round-trip, so a full hold sold stack-by-stack.
  async function quickSellAll() {
    if (sellingAll || inventory.length === 0) return
    setSellingAll(true)
    const res = await quickSellAllFish()
    setSellingAll(false)
    if ('error' in res) return
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    setInventory([])
    setExpandedSellLane(null)
  }

  async function handleLiquidate() {
    if (liquidating) return
    setLiquidating(true)
    const res = await liquidateAllFish()
    setLiquidating(false)
    setExpandedSellLane(null)
    if ('error' in res) return
    setInventory([])
    window.dispatchEvent(new Event('pending-sales-may-have-changed'))
    setHoldOpen(false)
  }

  // Auto Caster: handle the whole post-catch flow when equipped.
  //   • Regular catch → recast 1000ms after the result lands.
  //   • Crate appears (closed) → auto-tap Open ~700ms in (player sees
  //     the closed-chest beat first, then the spin plays naturally).
  //   • Crate revealed → auto-claim 1200ms in (long enough to read
  //     what dropped), then the next effect tick (crateResult=null)
  //     schedules the regular 500ms recast.
  //   • Golden catch → never auto-anything. The trophy moment needs
  //     the player to consciously claim it; muscle-memory recast
  //     would blow past it.
  // Hoisted out of the effect below because the crate itself needs it: with
  // an auto-caster running, CrateOpening pries itself open after a beat so the
  // player watches the spin instead of chasing a button. 700ms is long enough
  // to register the closed crate and its tier first.
  // ONE Auto item, two tiers. The Caster/Catcher pair is a single piece of
  // gear now — the Catcher is a permanent upgrade, not a sibling — so the
  // runtime derives a tier instead of matching ids: equipping the Auto item
  // at all gives tier 1 (auto-cast), owning the upgrade lifts it to tier 2
  // (auto-catch). Legacy equipped_special === 'auto_catcher' rows (written
  // before the merge) resolve identically.
  const autoTier = ((equippedSpecial === 'auto_caster' || equippedSpecial === 'auto_catcher') && ownedAutoCaster)
    ? (ownedAutoCatcher ? 2 : 1) : 0
  const autoCrateOpenMs = autoTier > 0 && autoEnabled ? 700 : undefined

  useEffect(() => {
    // Both tiers auto-cast; tier 2 adds the auto-catch below.
    if (autoTier === 0 || !autoEnabled) return
    if (phase !== 'result') return
    if (catchResult?.isShiny) return

    // Crate flow — the OPEN tap is CrateOpening's job now (autoCrateOpenMs),
    // so all that is left here is the auto-claim once the reward is up.
    if (crateResult) {
      if (cratePhase === 'revealed') {
        const t = setTimeout(() => { void handleClaimCrate() }, 1200)
        return () => clearTimeout(t)
      }
      return
    }

    // Regular auto-cast — bait + hold check, then recast (a touch slower than
    // before so the result has a beat to read before the next cast snaps).
    const currentBaitQty = baitInventory.find(b => b.bait_type === selectedBait)?.quantity ?? 0
    const currentHoldCount = inventory.reduce((s, i) => s + i.quantity, 0)
    if (currentBaitQty <= 0 || currentHoldCount >= holdCapacity) return
    const t = setTimeout(() => { handleCastAgain() }, 1400)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, autoTier, autoEnabled, cratePhase, catchResult?.isShiny, crateResult])

  // Auto Catcher: while a common/uncommon fish is on the dial, watch the
  // needle spin and "tap" the instant it's about to land in a green CATCH
  // band — exactly like a player auto-tapping with perfect timing. It uses
  // the SAME forward prediction handleReelIn resolves at, so the needle keeps
  // its natural flow and the reel fires the moment it reaches green (never the
  // gold Perfect sliver, never a miss/snag). Rare+ fish, crates, the Ancient
  // Deep, and active Finn challenges are left for the player's own hand.
  useEffect(() => {
    if (autoTier !== 2 || !autoEnabled) return
    if (phase !== 'catching' || !hookedFish) return
    if (hookedFish.fishId === CRATE_FISH_ID) return
    // Commons + uncommons (tiers 1-2) by default; Tireless Catcher extends it to
    // rares (3), Relentless Catcher to epics (4). Legendaries always need your hand.
    const autoMaxRarity = gauntletAutoCatchMaxRarity(gauntletUpgrades)
    if ((hookedFish.biteRarity ?? 1) > autoMaxRarity) return
    if (selectedZone === 'ancient_deep') return           // never the boss zone
    if (finnChallenge) return                             // don't auto-fail/skew a Finn challenge
    let raf = 0
    let done = false
    const startAt = performance.now()
    const predictAngle = () => {
      if (spinAnimRef.current) {
        const lookaheadMs = REEL_LOOKAHEAD_FRAMES * Math.min(frameDurRef.current, 20)
        const a = spinAngleNow() + dirRef.current * speedRef.current * lookaheadMs / 1000
        return (((a % 360) + 360) % 360)
      }
      return spinAngleNow()
    }
    const tick = () => {
      if (done) return
      // brief grace so the dial visibly spins before the first auto-tap
      if (performance.now() - startAt >= 420) {
        const z = getZone(catchingZonesRef.current, predictAngle(), zoneRotationRef.current)
        if (z.type === 'catch') { done = true; void handleReelIn(); return }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { done = true; cancelAnimationFrame(raf) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, autoTier, autoEnabled, hookedFish, selectedZone, finnChallenge, gauntletUpgrades])

  // Golden catches force a Sell-or-Mount decision via a modal. Both
  // resolve through this helper to clear the catch result back to the
  // ready state — the player then has to manually tap Cast to fish
  // again (no auto-cast). Used after both choice paths and as a
  // last-ditch dismiss if the action ever errors.
  function dismissCatchResultToReady() {
    if (phase !== 'result') return
    setFreshCatchHook(null)
    setCatchResult(null)
    setMissResult(null)
    setCrateResult(null)
    setCrateOpenSignal(false)
    setCratePhase('closed')
    setHookedFish(null)
    setPerfectFlash(false)
    setLevelUpNotif(null)
    window.dispatchEvent(new CustomEvent('fishing-levelup-closed'))
    setHoldOpen(false)
    setGearOpen(false)
    setShinyChoiceModalOpen(false)
    // Transition back to idle so the action slot re-renders the Cast
    // button. Without this, phase stays 'result' with catchResult /
    // missResult / crateResult all null — neither the Cast Again branch
    // (gated on `catchResult || missResult`) nor the idle Cast button
    // (gated on `phase === 'idle'`) renders, and the player gets
    // stranded with no action after picking Sell or Mount on a golden.
    setPhase('idle')
  }

  // Forced choice modal handlers — both terminal, the trophy can't be
  // re-resolved after either lands. Action errors still dismiss the
  // result so the player isn't stranded, but show a toast so we know.
  const [shinyChoiceLoading, setShinyChoiceLoading] = useState<null | 'sell' | 'mount'>(null)
  const [shinyResolveToast, setShinyResolveToast] = useState<string | null>(null)

  async function handleSellGolden() {
    if (!catchResult?.shinyId || shinyChoiceLoading) return
    setShinyChoiceLoading('sell')
    try {
      const res = await sellGoldenTrophy(catchResult.shinyId)
      if ('error' in res) {
        setShinyResolveToast(res.error)
      } else {
        setDoubloons(res.doubloons)
        window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
        setShinyResolveToast(`+${res.earned.toLocaleString()} ⟡`)
      }
    } finally {
      setTimeout(() => setShinyResolveToast(null), 2200)
      setShinyChoiceLoading(null)
      dismissCatchResultToReady()
    }
  }

  async function handleMountGolden() {
    if (!catchResult?.shinyId || shinyChoiceLoading || catchResult.alreadyMounted) return
    setShinyChoiceLoading('mount')
    try {
      const res = await mountGoldenTrophy(catchResult.shinyId)
      if ('error' in res) {
        setShinyResolveToast(res.error)
      } else {
        setMountedFishIds(prev => new Set([...prev, res.fishId]))
        setShinyResolveToast('Mounted in Logbook')
      }
    } finally {
      setTimeout(() => setShinyResolveToast(null), 2200)
      setShinyChoiceLoading(null)
      dismissCatchResultToReady()
    }
  }

  // Galaxy Rod — "Wormhole": one-shot reroll of the just-landed catch into a
  // different fish from the same zone. The server swapped the hold; here we
  // morph the result card to the new fish + reconcile the local hold.
  async function handleWormholeReroll() {
    if (!catchResult?.wormhole || rerollingWormhole) return
    setRerollingWormhole(true)
    const oldId = catchResult.fish.id
    try {
      const res = await rerollWormhole()
      // The token is one-shot and already spent server-side, so a failure means
      // there is nothing left to reroll (usually the catch was sold out of the
      // hold first). Retire the affordance rather than leaving a dead button.
      if ('error' in res) {
        setCatchResult(prev => prev ? { ...prev, wormhole: false } : prev)
        return
      }
      setInventory(prev => {
        const trimmed = prev
          .map(i => i.fish_id === oldId ? { ...i, quantity: i.quantity - res.qty } : i)
          .filter(i => i.quantity > 0)
        const existing = trimmed.find(i => i.fish_id === res.fish.id)
        if (existing) return trimmed.map(i => i.fish_id === res.fish.id ? { ...i, quantity: i.quantity + res.qty } : i)
        return [...trimmed, { fish_id: res.fish.id, quantity: res.qty, fish_species: res.fish }]
      })
      if (res.isPB && res.sizeIn > 0) setPersonalBests(prev => ({ ...prev, [res.fish.id]: res.sizeIn }))
      // MOVE the credit from the fish that was caught to the one that
      // surfaced. reelIn optimistically counted the original a moment ago,
      // but the server defers that credit while a reroll is live and then
      // gives it to the NEW fish only (one species per cast). Leaving the
      // original counted here is why the tally changed on a zone switch: the
      // refetch replaced the optimistic number with the server's.
      setCatchCounts(prev => {
        const next = { ...prev, [res.fish.id]: (prev[res.fish.id] ?? 0) + 1 }
        const rolledBack = (next[oldId] ?? 0) - 1
        if (rolledBack > 0) next[oldId] = rolledBack
        else delete next[oldId]
        return next
      })
      // A new species off the wormhole deserves the same Logbook flash a new
      // species off the line gets.
      if (res.isNewSpecies) {
        setFreshCatchHook('new-species')
        setLatestCatchHabitat(res.fish.habitat)
      } else if (res.isPB) {
        setFreshCatchHook('pb')
        setLatestCatchHabitat(res.fish.habitat)
      }
      setCatchResult(prev => prev ? {
        ...prev,
        fish: res.fish,
        isNewSpecies: res.isNewSpecies,
        sizeIn: res.sizeIn,
        sizeMin: res.sizeMin,
        sizeMax: res.sizeMax,
        sizeTier: res.sizeTier,
        isPB: res.isPB,
        previousBest: res.previousBest,
        // The reroll never produces a multi-catch or shiny, and is one-shot.
        doubleCatch: false,
        jackpotMultiplier: undefined,
        wormhole: false,
      } : prev)
    } finally {
      setRerollingWormhole(false)
    }
  }

  async function handleCastAgain() {
    if (phase !== 'result') return
    if (finnPending) return
    // A level-up is waiting behind the catch reveal — show it now instead of
    // casting, so the sequence is always fish, then level-up, then cast.
    if (pendingLevelUpRef.current) {
      setLevelUpNotif(pendingLevelUpRef.current)
      pendingLevelUpRef.current = null
      return
    }
    setFreshCatchHook(null)  // moving on from the last catch — dismiss the Logbook flash
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
    setCrateOpenSignal(false)
    setCratePhase('closed')
    setHookedFish(null)
    setPerfectFlash(false)
    setLevelUpNotif(null)
    window.dispatchEvent(new CustomEvent('fishing-levelup-closed'))
    setHoldOpen(false)
    setGearOpen(false)
    await doCast()
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
    } else if (result.type === 'pet') {
      // Server already added the pet to unlocked_pets + auto-equipped on
      // first pet ever. Mirror that locally so the Appearance picker
      // sees the new parrot the moment the claim animation finishes.
      setUnlockedPets(prev => {
        const next = prev.includes(result.petId) ? prev : [...prev, result.petId]
        onPetStateChange?.(equippedPet ?? result.petId, next)
        return next
      })
      if (!equippedPet) setEquippedPet(result.petId)
    }
    setCratePhase('closed')
    // Don't auto-cast after the player taps Claim — they should decide
    // when to fish next. Clearing crateResult drops the crate panel and
    // reveals the normal Cast button.
    setCrateResult(null)
    setCrateOpenSignal(false)
    // Also reset hookedFish + flip phase to 'idle' so the bottom action
    // slot renders the idle Cast button. Without this, the Cast Again
    // render gate (`catchResult || missResult`) is false on a fresh
    // crate claim (no fish caught, no miss recorded), and the slot
    // goes empty — player can't tap to fish again. Tester report,
    // 2026-06-05.
    setHookedFish(null)
    setPhase('idle')
  }

  async function handleClaimDaily(index: 0 | 1 | 2 | 3) {
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
        setDailyClaimed(prev => { const n = [...prev]; n[index] = true; return n })
      }
      return
    }
    setDailyClaimed(prev => { const n = [...prev]; n[index] = true; return n })
    setDoubloons(res.doubloons)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
    // Master pays a rolled crate instead of coin. grantCrateLoot may also have
    // moved doubloons, bait, a cosmetic or a pet, so the balance above is
    // already the post-grant figure.
    if (res.crate) {
      setMasterCrate({ tier: res.crate.tier, loot: res.crate.loot as CrateLootView })
    }
  }

  async function handleClaimSweep() {
    if (claimingSweep || sweepClaimed) return
    // Answer the press before the server does.
    hapticTap()
    setClaimingSweep(true)
    const res = await claimDailySweep()
    setClaimingSweep(false)
    if ('error' in res) {
      // Stale local state (another tab claimed it, or a zone remount lost the
      // flag). Reconcile so the button stops offering something already taken.
      if (res.error === 'Already claimed') setSweepClaimed(true)
      return
    }
    setGems(res.gems)
    window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
    setSweepClaimed(true)
    setSweepAward(true)
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
    // The ceremony carries the whole moment (incl. any unlocked colorway) —
    // no separate skin toast on this path. Past max, `goldenBoost` is the new
    // wipe count and the level stays put — the ceremony crowns the boost instead.
    setPrestigeCeremony({ zone, level: result.prestigeLevel, skin: result.unlockedSkinId ?? null, goldenBoost: result.goldenBoost })
    const zoneIds = new Set(allFishSpecies.filter(f => f.habitat === zone).map(f => f.id))
    setCaughtFishIds(prev => { const next = new Set(prev); zoneIds.forEach(id => next.delete(id)); return next })
    setClaimedZones(prev => ({ ...prev, [zone]: false }))
    setPrestigeLevels(prev => ({ ...prev, [zone]: result.prestigeLevel }))
    if (result.goldenBoost !== undefined) setGoldenBoosts(prev => ({ ...prev, [zone]: result.goldenBoost! }))
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
  // Memoized — this used to be an inline IIFE, so every parent render
  // during the catch phase (zone-crossing setAngle, streak updates,
  // timers) re-ran buildFishZones + applyBossMods from scratch. The
  // memo also gives `catchingZones` a stable identity, which lets
  // DialSVG's internal useMemos (arc paths, perfect/penalty lookups)
  // actually hit.
  // True only while fighting one of the 6 Ancient TROPHIES (sell_value 0) — the
  // capstone giants, not the 12 sellable ancient_deep regulars. Drives the eldritch
  // dial recolor + aura + the full-screen cinematic on the catch.
  const isAncientTrophyFight = useMemo(() => {
    if (!hookedFish) return false
    const hf = allFishSpecies.find(f => f.id === hookedFish.fishId)
    return hf?.habitat === 'ancient_deep' && (hf.sell_value ?? 0) === 0
  }, [hookedFish, allFishSpecies])

  const catchingZones = useMemo(() => {
    if (!hookedFish) return [] as ZoneDef[]
    // Shrink narrows the green catch band too — mirror of the handleReelIn resolver
    // so the dial the player sees matches what the reel-in scores.
    const shrinkCatch = activeBossMechanic === 'shrink' ? bossZoneShrink : 0
    const base = buildFishZones(hookedFish.catchDifficulty, hookTier, line.penaltyMultiplier, (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).catchMultiplier, levelBonus + getBait(selectedBait).catchZoneBonus + rod.catchZoneBonus + (activeEvent?.type === 'glassy' ? 12 : 0) - shrinkCatch, rod.perfectZoneBonus + 1)
    const withMods = selectedZone === 'ancient_deep' ? applyBossMods(base, activeBossMechanic, bossZoneShrink) : base
    // The 6 giants fight on the eldritch palette; regulars keep the normal dial.
    return isAncientTrophyFight ? applyAncientPalette(withMods) : withMods
  }, [hookedFish, hookTier, line.penaltyMultiplier, selectedZone, levelBonus, selectedBait, rod.catchZoneBonus, rod.perfectZoneBonus, activeEvent?.type, activeBossMechanic, bossZoneShrink, isAncientTrophyFight])
  // Mirror the latest zones so the needle rAF loop can detect zone
  // crossings without depending on per-frame React state.
  catchingZonesRef.current = catchingZones

  // Shrink → BREATHE (Shastasaurus, Vent Octopus, wildcard rolls): the whole landing
  // window shrinks AND expands in real time instead of stepping down per phase — a
  // living jaw you time your tap through. Done IMPERATIVELY (like drift/gyre): each
  // tick rebuilds the zones at the current pulse size, writes them to catchingZonesRef
  // (so the crossing paint + reel-in resolve follow), and re-draws the arc `d`s — zero
  // React re-renders, so it never re-introduces dial lag. Only the widths change (the
  // ring never adds/removes zones at difficulty 5), so the arc list stays index-aligned.
  // Deeper phases breathe tighter + faster (bossStage). bossZoneShrink is held at 0 for
  // shrink fish, so the memo renders the open base and this owns the animation.
  useEffect(() => {
    if (phase !== 'catching' || activeBossMechanic !== 'shrink' || !hookedFish) return
    const diff = hookedFish.catchDifficulty
    const catchMult = (ZONE_DIFFICULTY[selectedZone] ?? ZONE_DIFFICULTY.shallows).catchMultiplier
    const baseBonus = levelBonus + getBait(selectedBait).catchZoneBonus + rod.catchZoneBonus + (activeEvent?.type === 'glassy' ? 12 : 0)
    const perfBonus = rod.perfectZoneBonus + 1
    const trophy = isAncientTrophyFight
    const stage = Math.max(1, bossStageRef.current)
    const AMP = 12 + stage * 3          // tighter trough each phase
    const PERIOD = Math.max(650, 1500 - stage * 250) // faster breath each phase
    let t = 0
    const id = setInterval(() => {
      t += 40
      // 0 at the crest (fully open) → AMP at the trough (tightest). Starts open.
      const s = AMP * (0.5 - 0.5 * Math.cos((t / PERIOD) * Math.PI * 2))
      const base = buildFishZones(diff, hookTier, line.penaltyMultiplier, catchMult, baseBonus - s, perfBonus)
      let zones = applyBossMods(base, 'shrink', s)
      if (trophy) zones = applyAncientPalette(zones)
      catchingZonesRef.current = zones
      const zg = zonesGroupRef.current
      if (zg) {
        const arcs = zg.querySelectorAll<SVGPathElement>('path[data-zone-arc]')
        arcs.forEach((p, i) => { if (zones[i]) p.setAttribute('d', arcPath(zones[i].from, zones[i].to)) })
      }
    }, 40)
    return () => clearInterval(id)
  }, [phase, activeBossMechanic, hookedFish, hookTier, line.penaltyMultiplier, selectedZone, levelBonus, selectedBait, rod.catchZoneBonus, rod.perfectZoneBonus, activeEvent?.type, isAncientTrophyFight, bossStage])
  // NOTE: zoneRotationRef is intentionally NOT synced from state here.
  // The ref is now the source of truth during the drift spin (updated
  // by the drift interval imperatively); syncing state → ref on every
  // render would clobber the ref's live value mid-rotation. The ref
  // is kept in sync with state at one-shot transitions instead (see
  // the inline `zoneRotationRef.current = …` writes at every
  // setZoneRotation callsite below).
  // Live ref reads, not state — the rAF tick no longer syncs angle into
  // React state on zone crossings (the crossing paint is imperative), so
  // state would be stale here. Reading the refs means any unrelated
  // re-render (blackout, streak, retry flash) paints the CURRENT zone
  // and never clobbers the imperative tells with an old one.
  const currentZone   = (phase === 'catching' || phase === 'reeling') ? getZone(catchingZones, angleRef.current, zoneRotationRef.current) : null

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
  // NOTE: Ancient Deep used to hard-block once all 6 trophies were caught (back
  // when the zone had ONLY the 6 one-and-done Ancients). It now also holds 12
  // repeatable, sellable regulars (ids 149-160), so the zone must stay fishable
  // forever — the server already stops the caught trophies from re-appearing.
  const isFullMoon = activeEvent?.type === 'fullmoon'
  const holdTotalValue   = inventory.reduce((s, i) => s + Math.floor(i.fish_species.sell_value * (isFullMoon ? 1.0 : 0.75)) * i.quantity, 0)
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

        {/* Trawls (crew passive fishing) — the left HUD indicator lives in the
            same z-15 layer as the audio chips, hidden behind any open panel so
            it never floats over a modal. Also hidden on the result phase so it
            never sits in front of the catch result card. Its own panel/reveal
            portal to <body>. */}
        <TrawlIndicator hidden={holdOpen || gearOpen || baitOpen || collectionOpen || phase === 'result'} />

        {/* Background soundtrack lives in lib/fishingMusic singleton —
            kept outside React's tree so unmount fade-out actually runs. */}

        {/* Audio toggles — two independent mutes: music (note icon) and
            SFX (speaker icon). Left edge, below the back-button row.
            Both set state synchronously inside the gesture so iOS PWA
            permits playback in the same call stack. Hidden while any panel
            (hold/sell/gear/bait/collection) is open so they don't float over it.
            zIndex 15: above the scene art (z 0–10) but BELOW every overlay —
            drawers (20), tours (18/22), level-up (32), toasts (40), challenge
            complete (60) — so the chips never float over a modal. */}
        {!(holdOpen || gearOpen || baitOpen || collectionOpen) && (
        <div style={{ position: 'absolute', bottom: 110, left: 10, zIndex: 15, display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                  <motion.img
                    src={`/${rod.slug}_${f}.png`}
                    alt=""
                    className={rodGlow}
                    // A physical scale-punch on the visible frame each stage-up —
                    // framer composes the static rotate (style) with the scale
                    // (animate) so the rod kicks as it flashes into the new mode.
                    // Scale-punch synced to the glow's pop (~50% of the burst) so
                    // the rod kicks exactly as its glow flips to the new colour.
                    animate={visible && rodBurstStage > 0 ? { scale: [1, 1.06, rodBurstStage >= 3 ? 1.34 : 1.24, 1] } : { scale: 1 }}
                    transition={{ duration: rodBurstStage >= 3 ? 1.0 : 0.78, ease: 'easeOut', times: [0, 0.36, 0.52, 1] }}
                    style={{
                      position: 'absolute', top: `${rc.top}%`, left: `${rc.left}%`,
                      width: `${rc.width}%`,
                      rotate: rc.rotate,
                      transformOrigin: 'center center',
                      pointerEvents: 'none',
                      maxWidth: 'none',
                      ...(rod.glow ? { ['--rod-glow-color' as string]: rod.color } : {}),
                    } as MotionStyle}
                  />
                ) : rod.imageUrl && (
                  <img src={rod.imageUrl} alt="" className={rodGlow} style={{
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
                {/* Pet overlay — last child of the character container
                    so it stacks ABOVE every other equipment layer
                    (boat / rod / reel / hook / badges). Pet is shared
                    across all rest/wait/cast frames using the per-frame
                    CHAR_PET_OVERLAY coords tuned in /fishing-test. */}
                {/* TWO pets can ride at once, and only ever one of each kind:
                    a stern pet and a front-facing bow pet. They are drawn from
                    separate slots with separate coords, so they never overlap
                    the way two stern pets would. */}
                {[equippedPet, equippedPetBow].map((id, slotIdx) => {
                  const pet = getPet(id)
                  if (!pet) return null
                  const pp = getPetOverlay(pet.species, f)
                  return (
                    <img
                      key={slotIdx}
                      src={pet.restImageUrl}
                      alt=""
                      style={{
                        position: 'absolute',
                        top: `${pp.top}%`,
                        left: `${pp.left}%`,
                        width: `${pp.width}%`,
                        transform: `rotate(${pp.rotate}deg)`,
                        transformOrigin: 'center center',
                        pointerEvents: 'none',
                        filter: `drop-shadow(0 0 6px ${pet.accentColor}55)`,
                      }}
                    />
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
                {/* NO mixBlendMode on these: the overlay persists for the whole
                    120s event over the always-animating scene (clouds/shimmer),
                    and blend layers force the region to re-composite every
                    frame — the Tidecaller-lag bug class. Plain tint layers
                    pulse opacity on the GPU for free. */}
                <div style={{ position: 'absolute', inset: 0, background: def.tint }} />
                <motion.div
                  animate={{ opacity: [0.3, 0.8, 0.3] }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ position: 'absolute', inset: 0, background: def.tint }}
                />
                <EventParticles color={def.color} />
              </motion.div>
            )
          })()}
        </AnimatePresence>

        {/* UI content — fills full height as flex column */}
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '1rem', paddingBottom: '1.25rem' }}>

          {/* Header row — home + zone left, gear button right.
              
              The zone pill used to be the only way out, and it goes back ONE
              step to the selector. That was the whole journey when the selector
              was the fishing home; now there is a hub above it, and leaving it
              meant selector, then close the selector, to reach a screen that is
              two taps away from everything else in fishing.
              
              So: a house to leave, the zone name to change water. Same pill
              language, same height, the icon narrow enough that the zone label
              keeps the position your thumb already knows. */}
          <div className="flex items-center justify-between mb-2">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <button
                onClick={onHome}
                aria-label="Back to fishing"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 26, height: 26, padding: 0, borderRadius: 20,
                  color: HABITAT_COLOR[selectedZone],
                  background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}50`,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M3 10.5L12 3l9 7.5" />
                  <path d="M5.5 9.5V20h13V9.5" />
                </svg>
              </button>
              {/* A DOT WHEN THERE IS WATER YOU HAVE NEVER FISHED. The zone
                  cards carry a "Never fished" badge, but a player who does not
                  know a zone opened has no reason to go and look at them, which
                  is exactly how someone reached Lv 50 without finding the Deep
                  or the Abyss. This is the only route back to that screen, so
                  the nudge belongs here. Derived from catch counts, so it puts
                  itself out the first time you land something there. */}
              <button
                onClick={onBack}
                className="font-karla font-600 uppercase tracking-[0.1em]"
                aria-label={unfishedZones > 0
                  ? `${HABITAT_LABEL[selectedZone]}. ${unfishedZones} other water${unfishedZones === 1 ? '' : 's'} you have never fished.`
                  : undefined}
                style={{
                  position: 'relative',
                  display: 'inline-flex', alignItems: 'center',
                  height: 26, padding: '0 0.7rem', borderRadius: 20,
                  fontSize: '0.55rem', color: HABITAT_COLOR[selectedZone],
                  background: 'rgba(4,10,18,0.72)', border: `1px solid ${HABITAT_COLOR[selectedZone]}${unfishedZones > 0 ? 'aa' : '50'}`,
                  cursor: 'pointer', touchAction: 'manipulation',
                }}
              >
                ← {HABITAT_LABEL[selectedZone]}
                {unfishedZones > 0 && (
                  <motion.span aria-hidden
                    animate={{ scale: [1, 1.25, 1], opacity: [0.85, 1, 0.85] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: '#f0c040', boxShadow: '0 0 8px rgba(240,192,64,0.9)' }} />
                )}
              </button>
            </div>

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
                // The sweep counts as claimable too now that it has its own
                // button. Without this the chip would go quiet with ten gems
                // still sitting unclaimed inside the drawer.
                const sweepReady = dailyClaimed.slice(0, 3).every(Boolean) && !sweepClaimed
                const claimable = sweepReady
                  || dailyChallenges.some((c, i) => dailyProgress[i] >= c.target && !dailyClaimed[i])
                const allClaimed = dailyClaimed.every(Boolean) && sweepClaimed
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

              {/* Logbook chip moved out of the header into the bottom
                  action row (next to Gear / Bait / Hold), so the header
                  is left with just Ranks + Daily and reads less
                  congested. See the Logbook tile in the action-row
                  factory below. */}
            </div>

          </div>

          {/* XP bar */}
          <div style={{ marginBottom: '0.6rem' }}>
            <div style={{ position: 'relative' }}>
              <XPBarDisplay xp={fishingXP} bestStreak={highestPerfectStreak} renownAvailable={fishingRenownAvailable} onOpenRenown={() => setRenownOpen(true)} />
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
            {/* Action row under the XP bar. The equipped special's action chip
               (Tide Turner skip / Auto Caster–Catcher toggle) sits on the LEFT,
               and the active fishing event's name sits CENTERED on the SAME row.
               The event always centers here; if the left chip would crowd it, the
               name truncates rather than shoving the chip off-screen. Tapping the
               event opens a small drawer explaining what it does. */}
            {(() => {
              const hasChip =
                (equippedSpecial === 'tide_turner' && tideTurnerSkipsLeft > 0 && phase === 'catching') ||
                autoTier > 0
              const rowActive = hasChip || !!activeEvent
              return (
                <div style={{ marginTop: rowActive ? '0.4rem' : 0, minHeight: rowActive ? 26 : 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* left: equipped-special action chip */}
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
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
                      {/* Auto Caster / Catcher — on/off toggle, always available while
                          one is equipped so you can pause it without the gear shop. */}
                      {autoTier > 0 && (() => {
                        const isCatcher = autoTier === 2
                        const col = isCatcher ? '#46e0c0' : '#f0c040'
                        return (
                          <motion.button
                            key="auto-toggle"
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.18 }}
                            onClick={() => setAutoEnabled(v => !v)}
                            aria-label={`${isCatcher ? 'Auto Catcher' : 'Auto Caster'}: ${autoEnabled ? 'on' : 'off'}`}
                            className="font-karla font-700"
                            // Matches the XP bar's panel (same dark fill so it reads over
                            // the water); the equipped item's icon stands in for a label.
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                              background: 'rgba(4,10,18,0.72)',
                              border: `1px solid ${col}${autoEnabled ? '55' : '28'}`,
                              borderRadius: 20, padding: '0.3rem 0.7rem',
                              fontSize: '0.62rem', cursor: 'pointer', letterSpacing: '0.04em',
                              boxShadow: autoEnabled ? `0 0 10px ${col}22` : 'none',
                            }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/autocaster.png" alt="" style={{ width: 17, height: 17, objectFit: 'contain', flexShrink: 0, opacity: autoEnabled ? 1 : 0.45, filter: autoEnabled ? `drop-shadow(0 0 4px ${col}66)` : 'grayscale(1) brightness(0.8)' }} />
                            {/* switch */}
                            <span aria-hidden style={{ width: 22, height: 12, borderRadius: 999, flexShrink: 0, position: 'relative', background: autoEnabled ? `${col}55` : 'rgba(255,255,255,0.1)', border: `1px solid ${autoEnabled ? col : 'rgba(255,255,255,0.22)'}` }}>
                              <span style={{ position: 'absolute', top: 1, left: autoEnabled ? 11 : 1, width: 8, height: 8, borderRadius: '50%', background: autoEnabled ? col : '#7a7672', transition: 'left 0.15s, background 0.15s' }} />
                            </span>
                            <span style={{ color: autoEnabled ? '#f0ede8' : '#9a9488' }}>{autoEnabled ? 'On' : 'Off'}</span>
                            {/* Tireless / Relentless Catcher (Locker Upgrades) — flag how
                                far up the rarity ladder the Auto Catcher now reels. */}
                            {isCatcher && gauntletAutoCatchMaxRarity(gauntletUpgrades) >= 3 && (
                              <span title={gauntletAutoCatchMaxRarity(gauntletUpgrades) >= 4 ? 'Relentless Catcher: also auto-reels epic fish' : 'Tireless Catcher: also auto-reels rare fish'} style={{ color: autoEnabled ? col : '#9a9488', fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.06em', borderLeft: `1px solid ${col}33`, paddingLeft: '0.45rem' }}>+ {gauntletAutoCatchMaxRarity(gauntletUpgrades) >= 4 ? 'EPICS' : 'RARES'}</span>
                            )}
                          </motion.button>
                        )
                      })()}
                    </AnimatePresence>
                  </div>
                  {/* center: active event — name only, centered, truncating, tappable */}
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                    <AnimatePresence>
                      {activeEvent && (() => {
                        const def = EVENT_DEFS[activeEvent.type]
                        return (
                          <motion.button
                            key={activeEvent.type}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                            transition={{ duration: 0.4 }}
                            onClick={() => setEventInfoOpen(true)}
                            aria-label={`${def.name} — tap for details`}
                            className="font-karla font-600"
                            style={{
                              maxWidth: '100%', minWidth: 0,
                              display: 'inline-flex', alignItems: 'center', gap: 7,
                              background: 'rgba(4,10,18,0.82)', border: `1px solid ${def.color}50`,
                              borderRadius: 20, padding: '0.3rem 0.7rem',
                              cursor: 'pointer',
                            }}
                          >
                            <motion.span
                              aria-hidden
                              animate={{ opacity: [1, 0.4, 1] }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                              style={{ width: 5, height: 5, borderRadius: '50%', background: def.color, boxShadow: `0 0 6px ${def.color}`, flexShrink: 0 }}
                            />
                            <span style={{ fontSize: '0.62rem', color: def.color, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                              {def.name}
                            </span>
                          </motion.button>
                        )
                      })()}
                    </AnimatePresence>
                  </div>
                </div>
              )
            })()}
          </div>


          {/* Finn's Bet indicator strip. (The active-event chip used to live here
              too; it now docks on the action row under the XP bar, centered on the
              same line as the Auto Catcher toggle.) Reserves height only while a
              bet is live so it costs nothing on short phones otherwise. */}
          <div style={{ minHeight: finnChallenge ? 28 : 0, marginBottom: finnChallenge ? '0.3rem' : 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            {finnChallenge && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 8, padding: '0.22rem 0.7rem',
                background: 'linear-gradient(180deg, rgba(200,168,80,0.18) 0%, rgba(200,168,80,0.05) 100%), #14100a',
                border: '1px solid rgba(200,168,80,0.42)',
                borderTop: '1px solid rgba(200,168,80,0.70)',
                borderRadius: 999,
                boxShadow: '0 0 14px rgba(200,168,80,0.18)',
              }}>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.52rem', color: '#d8b878', letterSpacing: '0.16em' }}>
                  Finn&apos;s Bet
                </span>
                <span className="font-cinzel font-700" style={{ fontSize: '0.74rem', color: '#f0d8a0' }}>
                  {finnChallenge.type === 'perfect_streak'
                    ? `${finnChallenge.perfectsHit ?? 0} / ${finnChallenge.perfectsTarget} perfects`
                    : `${finnChallenge.fishCaught ?? 0} / ${finnChallenge.fishTarget} fish`}
                </span>
                {finnChallenge.type === 'speed_catch' && (
                  <SpeedClock endsAt={finnChallenge.speedEndsAt ?? 0} paused={!!levelUpNotif} />
                )}
              </div>
            )}
          </div>

          {/* Phase content — grows to fill available space. Relative so
              the separate hooked-banner AnimatePresence below can absolutely
              overlay the same area without affecting the main phase flow.
              minHeight:0 + overflowY:auto is required: flex:1 items default to
              min-height:auto and can't shrink below their content's intrinsic
              size, so a tall ResultCard (long fun-fact, ancient banner, pills
              stack) would expand this div and push the action button row + the
              4 bottom tiles down behind the MobileTabBar. With these two, the
              card scrolls inside its slot and the siblings stay locked.
              .scrollbar-hide hides the gutter scrollbar desktop browsers
              render when overflow triggers — mobile already uses overlay
              scrollbars, so this just brings desktop in line. */}
          <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', position: 'relative' }}>
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
                        {showWaitTimer && phase === 'casting' && castAnimDone && <WaitTimer />}
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
                  // Opacity-only entrance — the old y: 8→0 slide had framer
                  // writing a transform on the dial's ancestor every frame
                  // for the first 180ms of the spin, forcing re-raster of
                  // the moving SVG at exactly the most jank-prone moment.
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: '0.5rem', paddingBottom: '0.25rem' }}>

                  {/* Live zone label. Minimal — just colored text, no pill
                      backing. The dial's colored arcs are the primary "what
                      zone am I in" signal; this is a small supporting cue
                      that doesn't need to dominate the vertical layout.
                      Reserved height kept tight so the dial has room to
                      render without clipping at the bottom. */}
                  <div style={{ minHeight: '1.05rem' }}>
                    {/* Only the meaningful beats show here now — the boss stage
                        progress and the Second Wind retry flash. The live zone
                        label AND the "Reeling in…" filler were removed as noise. */}
                    {(retryFlash || (phase === 'reeling' && bossStageCleared)) && (
                      <p ref={zoneLabelRef} className="font-cinzel font-700 uppercase tracking-[0.14em]"
                        style={{
                          fontSize: '0.7rem',
                          color: retryFlash ? '#fb923c' : (currentZone?.color ?? '#e8e4de'),
                          textShadow: retryFlash ? '0 0 12px rgba(251,146,60,0.7)' : currentZone ? `0 0 10px ${currentZone.color}60` : 'none',
                          margin: 0,
                        }}>
                        {(() => {
                          if (retryFlash) return 'Second Wind!'
                          const name = allFishSpecies.find(f => f.id === hookedFishRef.current?.fishId)?.name ?? ''
                          // Ranked fights add phases, so the shipped count would lie.
                          const base = BOSS_CONFIG[name] ?? { mechanic: 'shrink' as BossMechanic, phases: 2 }
                          const maxStages = vigilBossConfig(base, base.mechanic, vigilRankRef.current).phases
                          return `Stage ${bossStage - 1}/${maxStages}`
                        })()}
                      </p>
                    )}
                    {/* Boss stage progress dots — count comes from
                        BOSS_CONFIG[name].phases so a 2-phase regular
                        renders 2 dots + 'X/2', a 3-phase trophy renders
                        3 dots + 'X/3'. */}
                    {selectedZone === 'ancient_deep' && phase === 'catching' && bossStage > 0 && (() => {
                      const name = allFishSpecies.find(f => f.id === hookedFishRef.current?.fishId)?.name ?? ''
                      const base = BOSS_CONFIG[name] ?? { mechanic: 'shrink' as BossMechanic, phases: 2 }
                      const maxStages = vigilBossConfig(base, base.mechanic, vigilRank).phases
                      const stages = Array.from({ length: maxStages }, (_, i) => i + 1)
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                          {/* THE LONG VIGIL: what this fight is FOR. Only on a
                              released giant, so an ordinary ancient catch reads
                              exactly as it always has. */}
                          {vigilRank && (
                            <p className="font-cinzel font-800 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#e0455a' }}>
                              Rank {vigilNumeral(vigilRank)}
                            </p>
                          )}
                          <p className="font-karla font-600 uppercase tracking-[0.1em]" style={{ fontSize: '0.58rem', color: '#c084fc99' }}>Stage</p>
                          {stages.map(s => (
                            <div key={s} style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: s < bossStage ? '#c084fc' : s === bossStage ? '#c084fc' : 'rgba(192,132,252,0.2)',
                              boxShadow: s <= bossStage ? '0 0 6px #c084fcaa' : 'none',
                              border: s === bossStage ? '1px solid #c084fc' : '1px solid rgba(192,132,252,0.3)',
                            }} />
                          ))}
                          <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#c084fc99' }}>{bossStage}/{maxStages}</p>
                        </div>
                      )
                    })()}
                  </div>

                  <div style={{ position: 'relative' }}>
                    <div ref={blackoutRef} style={{
                      position: 'absolute', zIndex: 10, borderRadius: '50%',
                      width: '87.27%', aspectRatio: '1',
                      top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                      background: '#000',
                      // opacity + transition driven imperatively via
                      // paintBlackout() — see blackoutRef declaration.
                      opacity: 0,
                      pointerEvents: 'none',
                      transition: 'opacity 0.6s ease-out',
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
                          <IconFlame size={15} /> {perfectStreak} perfect streak
                        </motion.span>
                      </motion.div>
                    )}
                    <DialSVG zones={catchingZones} angle={angleRef.current} rotation={zoneRotation}
                      needleRef={needleGroupRef}
                      zonesGroupRef={zonesGroupRef}
                      needleColor={needleColor()} zoneOpacityFn={zoneOpacity}
                      fireLevel={perfectStreak >= 3 ? 2 : perfectStreak === 2 ? 1 : 0}
                      ancientBoss={isAncientTrophyFight}
                      snapKey={snapKey} perfectBurstKey={perfectBurstKey} />
                  </div>
                </motion.div>
              )}

              {/* ── RESULT ── */}
              {phase === 'result' && (
                <motion.div key="result"
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
                  style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: crateResult ? 'center' : 'flex-end', gap: '1rem', paddingBottom: '1rem' }}>

                  {crateResult ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                      style={{
                        background: 'rgba(6,14,22,0.96)',
                        border: `1px solid ${cratePhase === 'revealed' ? `rgba(${CRATE_TIERS[hookedFish?.crateTier ?? 'wooden'].rgb},0.4)` : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 20,
                        padding: '1.15rem 1.25rem 1.05rem',
                        textAlign: 'center',
                      }}
                    >
                      {/* The crate moment is shared with the Tavern's weekly
                          crate and the Master daily challenge crate. See
                          components/CrateOpening.tsx for why it stopped being
                          three separate implementations. The Claim button is
                          NOT passed as the footer: it lives in the bottom
                          action row, the same screen slot as Cast and Reel, so
                          the action position stays put across every phase. */}
                      <CrateOpening
                        tier={(hookedFish?.crateTier ?? 'wooden') as CrateTierId}
                        loot={crateResult as CrateLootView}
                        headline="You reeled up a"
                        autoOpenMs={autoCrateOpenMs}
                        hostOwnsOpenButton
                        openSignal={crateOpenSignal}
                        onOpened={() => setCratePhase('rolling')}
                        onSettled={() => setCratePhase('revealed')}
                      />
                    </motion.div>
                  ) : catchResult ? (
                    <>
                    {/* While an ancient cutscene overlay (the slain-cinematic or Finn's
                        beat) fully covers the screen, DON'T mount the result card — its
                        7 looping animations were burning frames behind the overlay and
                        compounding the cutscene lag. It mounts once when Finn fades, which
                        doubles as the reveal. Both overlays hand off in one tick, so it
                        stays gated through the whole sequence. */}
                    {!ancientCinematic && !finnAncientScene && (
                    <ResultCard
                      fish={catchResult.fish}
                      baitSaved={catchResult.baitSaved}
                      isNewSpecies={catchResult.isNewSpecies}
                      isPerfect={catchResult.isPerfect}
                      xpGained={catchResult.xpGained}
                      doubleCatch={catchResult.doubleCatch}
                      gemEarned={catchResult.gemEarned}
                      perfectStreak={catchResult.perfectStreak}
                      streakBonusXP={catchResult.streakBonusXP}
                      jackpotMultiplier={catchResult.jackpotMultiplier}
                      perfectXpMult={catchResult.perfectXpMult}
                      lockedStage={rod.lockedIn ? lockedInState(rod, catchResult.perfectStreak ?? 0).stage : 0}
                      catchQty={catchResult.catchQty}
                      ancientCount={ancientCatches.size}
                      ancientTotal={allFishSpecies.filter(f => f.habitat === 'ancient_deep' && (f.sell_value ?? 0) === 0).length || 6}
                      sizeIn={catchResult.sizeIn}
                      sizeMin={catchResult.sizeMin}
                      sizeMax={catchResult.sizeMax}
                      sizeTier={catchResult.sizeTier}
                      isPB={catchResult.isPB}
                      previousBest={catchResult.previousBest}
                      isShiny={catchResult.isShiny}
                      deepStirs={catchResult.deepStirs}
                    />
                    )}
                    {/* Galaxy Rod — Wormhole reroll. One-shot, opt-in gamble. */}
                    {catchResult.wormhole && !catchResult.isShiny && (
                      <motion.button
                        type="button"
                        onPointerDown={(e) => { e.preventDefault(); handleWormholeReroll() }}
                        disabled={rerollingWormhole}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                        whileTap={rerollingWormhole ? undefined : { scale: 0.96 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 24 }}
                        className="font-karla font-700 uppercase tracking-[0.1em]"
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          margin: '0.6rem auto 0', padding: '0.55rem 1.1rem', borderRadius: 999,
                          background: 'linear-gradient(180deg, rgba(167,139,250,0.26) 0%, rgba(124,92,255,0.14) 100%)',
                          border: '1px solid rgba(167,139,250,0.6)',
                          color: '#c9b8ff', fontSize: '0.62rem', cursor: rerollingWormhole ? 'default' : 'pointer',
                          opacity: rerollingWormhole ? 0.6 : 1,
                          boxShadow: '0 2px 14px rgba(124,92,255,0.22), inset 0 1px 0 rgba(255,255,255,0.1)',
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c9b8ff" strokeWidth="1.8" aria-hidden>
                          <ellipse cx="12" cy="12" rx="10" ry="4.5" />
                          <ellipse cx="12" cy="12" rx="6" ry="2.6" opacity="0.7" />
                          <circle cx="12" cy="12" r="1.4" fill="#c9b8ff" stroke="none" />
                        </svg>
                        {rerollingWormhole ? 'Folding space…' : 'Wormhole · reroll this catch'}
                      </motion.button>
                    )}
                    </>
                  ) : missResult ? (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="text-center" style={{ padding: '1.1rem 0' }}>
                      {/* Dark translucent plate so the muted miss text reads against
                          the water backdrop; border tints red on a snag. */}
                      <div style={{
                        display: 'inline-block', padding: '0.65rem 1.4rem', borderRadius: 14,
                        background: 'linear-gradient(180deg, rgba(12,16,22,0.82), rgba(8,11,16,0.9))',
                        border: `1px solid ${missResult === 'penalty' ? 'rgba(248,113,113,0.5)' : 'rgba(148,163,184,0.34)'}`,
                        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
                        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                      }}>
                        <p className="font-cinzel font-700"
                          style={{ fontSize: '1rem', marginBottom: missResult !== 'penalty' ? 2 : 0,
                            color: missResult === 'penalty' ? '#f87171' : '#dbe3ee',
                            textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                          {missResult === 'penalty' ? 'Snagged!' : 'No catch'}
                        </p>
                        {missResult !== 'penalty' && (
                          <p className="font-karla font-400" style={{ fontSize: '0.75rem', color: '#aeb9c9', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                            The fish slipped away.
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ) : null}

                </motion.div>
              )}

            </AnimatePresence>

            {/* Lightsaber "Lightspeed" cue — a brief red blade-flash pill when
                a near-instant bite fires. Localized at the top of the stage so
                it reads as the rod's doing without a screen-wide flash. The
                steady x:-50% keeps it centered while opacity/scale animate. */}
            <AnimatePresence>
              {instantBiteFlash && (
                <motion.div
                  key="instant-bite"
                  initial={{ opacity: 0, scale: 0.7, x: '-50%' }}
                  animate={{ opacity: 1, scale: 1, x: '-50%' }}
                  exit={{ opacity: 0, scale: 0.9, x: '-50%' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                  style={{
                    position: 'absolute', top: 14, left: '50%', zIndex: 30, pointerEvents: 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '0.32rem 0.72rem', borderRadius: 999,
                    background: 'linear-gradient(180deg, rgba(255,59,71,0.32) 0%, rgba(224,0,34,0.18) 100%)',
                    border: '1px solid rgba(255,90,100,0.7)',
                    boxShadow: '0 0 18px rgba(255,40,60,0.5), inset 0 0 8px rgba(255,255,255,0.22)',
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="#fff" aria-hidden style={{ filter: 'drop-shadow(0 0 4px #ff3344)' }}>
                    <path d="M13 2L3 14h7l-1 8 11-13h-7z" />
                  </svg>
                  <span className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.56rem', color: '#fff', textShadow: '0 0 8px rgba(255,60,70,0.85)' }}>Instant Bite</span>
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
                // 'Boss' warning panel (red 'Ancient Encounter Detected'
                // + ominous chrome + boss-name reveal + 3-dot stage warning)
                // is reserved for the 6 prehistoric trophies. The 12 new
                // sellable regulars hook as normal Rare/Epic fish — they
                // still run a multi-phase reel but their hook moment uses
                // the standard rarity banner.
                const hookedSpecies = selectedZone === 'ancient_deep'
                  ? allFishSpecies.find(f => f.id === hookedFish.fishId) ?? null
                  : null
                const isBoss = !!hookedSpecies && (hookedSpecies.sell_value ?? 0) === 0
                const bossName = isBoss ? (hookedSpecies?.name ?? 'Ancient Creature') : null

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
                      {/* Treasure Rod — flag that the rod boosted this find. */}
                      {(rod.crateChanceMult ?? 1) > 1 && (
                        <div className="flex items-center justify-center gap-1.5" style={{ marginTop: 7 }}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#e8b54a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ filter: 'drop-shadow(0 0 4px rgba(232,181,74,0.6))' }}>
                            <rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M3 12h18M12 8v12" /><path d="M8 8V6a4 4 0 0 1 8 0v2" />
                          </svg>
                          <span className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.5rem', color: '#e8b54a', textShadow: '0 0 8px rgba(232,181,74,0.5)' }}>Treasure Rod find</span>
                        </div>
                      )}
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

                const bossPhases = BOSS_CONFIG[bossName ?? '']?.phases ?? 3
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

                      {/* Stage warning — dot count + copy track the fish's real phase
                          count (Megalodon is 4, the other giants 3). */}
                      <div className="flex items-center gap-2" style={{ marginBottom: '0.35rem' }}>
                        <div className="flex gap-1">
                          {Array.from({ length: bossPhases }, (_, i) => i + 1).map(s => (
                            <div key={s} style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 5px #ef4444' }} />
                          ))}
                        </div>
                        <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.6rem', color: '#fca5a5' }}>
                          {bossPhases} stages required
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
                    onClick={() => { setHoldOpen(true); setGearOpen(false); setBaitOpen(false) }}
                    className="font-karla font-700"
                    style={{ fontSize: '0.68rem', color: '#60a5fa', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid rgba(96,165,250,0.4)', paddingBottom: 1 }}
                  >
                    Upgrade your hold for more storage ↑
                  </button>
                </motion.div>
              )}
              {phase === 'idle' && (selectedZone === 'ancient_deep' || holdTotalCount < holdCapacity) && hasBait && selectedBaitQty > 0 && (
                <motion.button key="cast" data-space-action
                  // pointerdown rather than onClick — fires on tap-start
                  // (~50–100 ms earlier than click on touch devices), so
                  // the cast SFX lands in sync with the player's tap
                  // instead of trailing it. Mirrors the Reel In button.
                  onPointerDown={(e) => { e.preventDefault(); vibrate(6); handleCast() }}
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
                <motion.button key="reel" data-space-action
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
              {/* Crate flow — Open / waiting / Claim. Lives in the same
                  slot as Cast / Reel so the action button never shifts
                  position between phases. */}
              {phase === 'result' && crateResult && cratePhase === 'closed' && (
                <motion.button key="open-crate" data-space-action
                  onPointerDown={(e) => { e.preventDefault(); setCrateOpenSignal(true) }}
                  className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                  style={{
                    width: 88, height: 88, borderRadius: '50%',
                    background: 'radial-gradient(ellipse at 40% 35%, rgba(217,119,6,0.45), rgba(217,119,6,0.15))',
                    border: '1px solid rgba(251,191,36,0.55)', cursor: 'pointer',
                    fontSize: '0.62rem', color: '#fbbf24', touchAction: 'manipulation',
                    boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 24px rgba(251,191,36,0.32), inset 0 1px 0 rgba(255,255,255,0.12)',
                    position: 'relative', lineHeight: 1.1,
                  }}
                  initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.92 }}
                  whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                  transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                >
                  Open<br />Crate
                </motion.button>
              )}
              {phase === 'result' && crateResult && cratePhase === 'rolling' && (
                <motion.div key="crate-rolling"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  style={{ width: 88, height: 88, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: '#4a4845' }}>…</p>
                </motion.div>
              )}
              {phase === 'result' && crateResult && cratePhase === 'revealed' && (() => {
                const isCosmetic = crateResult.type === 'skin' || crateResult.type === 'hat' || crateResult.type === 'boat' || crateResult.type === 'pet'
                const isDoubloons = crateResult.type === 'doubloons'
                const accent = isCosmetic ? '#4ade80' : isDoubloons ? '#fbbf24' : '#86efac'
                const accentRgb = isCosmetic ? '74,222,128' : isDoubloons ? '251,191,36' : '134,239,172'
                return (
                  <motion.button key="claim-crate" data-space-action
                    onPointerDown={(e) => { e.preventDefault(); handleClaimCrate() }}
                    className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                    style={{
                      width: 88, height: 88, borderRadius: '50%',
                      background: `radial-gradient(ellipse at 40% 35%, rgba(${accentRgb},0.42), rgba(${accentRgb},0.14))`,
                      border: `1px solid rgba(${accentRgb},0.55)`, cursor: 'pointer',
                      fontSize: '0.72rem', color: accent, touchAction: 'manipulation',
                      boxShadow: `0 6px 0 rgba(0,0,0,0.5), 0 0 26px rgba(${accentRgb},0.35), inset 0 1px 0 rgba(255,255,255,0.12)`,
                      position: 'relative',
                    }}
                    initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.92 }}
                    whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                    transition={{ type: 'spring', stiffness: 600, damping: 22 }}
                  >
                    Claim
                  </motion.button>
                )
              })()}
              {phase === 'result' && !crateResult && (selectedZone === 'ancient_deep' || holdTotalCount < holdCapacity) && (!!catchResult || !!missResult) && (() => {
                const isShinyResult = !!catchResult?.isShiny
                // Golden catches: three-stage action slot.
                //   1. Reveal lock (~2.4s after the catch): show a pulsing
                //      "Trophy Emerging" caption — nothing tappable.
                //   2. Lock lifts: a gold "Claim Trophy" button slides in.
                //      Tapping it opens the decision modal. The player can
                //      sit on this stage as long as they want, just looking
                //      at the card.
                //   3. Modal is open: hide the slot button — the choice
                //      modal owns the interaction now.
                // After the choice resolves, the result clears back to
                // ready state via the existing dismissCatchResultToReady.
                if (isShinyResult) {
                  return (
                    <motion.div key="shiny-locked"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 88, gap: 6 }}
                    >
                      {shinyRevealLocked && (
                        <motion.div
                          animate={{ opacity: [0.55, 1, 0.55], scale: [1, 1.08, 1] }}
                          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                          className="font-karla font-700 uppercase"
                          style={{
                            fontSize: '0.55rem', letterSpacing: '0.22em',
                            color: '#fbcc4a',
                            textShadow: '0 0 10px rgba(251,204,74,0.55)',
                          }}
                        >
                          ✦ Trophy Emerging
                        </motion.div>
                      )}
                      {!shinyRevealLocked && !shinyChoiceModalOpen && (
                        <motion.button
                          key="claim-trophy"
                          type="button"
                          data-space-action
                          onPointerDown={(e) => { e.preventDefault(); setShinyChoiceModalOpen(true) }}
                          className="font-karla font-700 uppercase tracking-[0.14em] flex items-center justify-center"
                          style={{
                            width: 88, height: 88, borderRadius: '50%',
                            background: 'radial-gradient(ellipse at 40% 35%, rgba(180,120,30,0.55), rgba(74,32,7,0.22))',
                            border: '1px solid rgba(228,188,108,0.7)', cursor: 'pointer',
                            fontSize: '0.6rem', color: '#fbcc4a', touchAction: 'manipulation',
                            boxShadow: '0 6px 0 rgba(0,0,0,0.5), 0 0 26px rgba(228,188,108,0.45), inset 0 1px 0 rgba(255,255,255,0.18)',
                            position: 'relative', lineHeight: 1.05,
                            padding: '0 0.5rem',
                            textAlign: 'center',
                          }}
                          initial={{ opacity: 0, scale: 0.4, rotate: -25 }}
                          animate={{ opacity: 1, scale: 1, rotate: 0 }}
                          exit={{ opacity: 0, scale: 0.92 }}
                          whileTap={{ scale: 0.95, y: 5, boxShadow: '0 1px 0 rgba(0,0,0,0.5)' }}
                          transition={{ type: 'spring', stiffness: 320, damping: 14 }}
                        >
                          Claim<br />Trophy
                        </motion.button>
                      )}
                    </motion.div>
                  )
                }
                return (
                  <motion.button key="again" data-space-action
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
                )
              })()}
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
                  className={flashTab === 'gear' ? 'coach-flash' : undefined}
                  onClick={() => { setGearOpen(o => !o); setHoldOpen(false); setBaitOpen(false) }}
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

                {/* Bait — image + readable count. QUICK-SWAP CAROUSEL: swipe the
                    tile left/right to cycle through owned baits (haptic detent
                    per step, content slides in from the swipe direction) — no
                    drawer needed for the every-cast bait swap. Tap still opens
                    the drawer for details/buying. */}
                {(() => {
                  const cycle = BAITS.filter(b => (baitInventory.find(i => i.bait_type === b.type)?.quantity ?? 0) > 0).map(b => b.type)
                  const canCycle = cycle.length > 1
                  const step = (dir: 1 | -1) => {
                    const at = cycle.indexOf(selectedBait)
                    const next = cycle[( (at === -1 ? 0 : at) + dir + cycle.length) % cycle.length]
                    if (!next || next === selectedBait) return
                    hapticTap()
                    setBaitSwapDir(dir)
                    setSelectedBait(next)
                  }
                  return (
                <button
                  className={flashTab === 'bait' ? 'coach-flash' : undefined}
                  onClick={() => { if (baitDraggedRef.current) { baitDraggedRef.current = false; return } setBaitOpen(o => !o); setGearOpen(false); setHoldOpen(false) }}
                  style={{
                    ...tile,
                    flexDirection: 'row',
                    alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: '0 0.5rem',
                    overflow: 'hidden',
                    background: baitOpen ? `${baitAccent}10` : 'rgba(4,10,18,0.72)',
                    border: `1px solid ${baitOpen ? baitAccent + '38' : outOfBait ? 'rgba(248,113,113,0.35)' : 'rgba(255,255,255,0.12)'}`,
                  }}
                >
                  <motion.div
                    drag={canCycle ? 'x' : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.18}
                    dragDirectionLock
                    onDrag={(_, info) => { if (Math.abs(info.offset.x) > 5) baitDraggedRef.current = true }}
                    onDragEnd={(_, info) => {
                      if (info.offset.x < -28 || info.velocity.x < -300) step(1)
                      else if (info.offset.x > 28 || info.velocity.x > 300) step(-1)
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, touchAction: 'pan-y', width: '100%' }}
                  >
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div key={selectedBait}
                        initial={{ x: baitSwapDir * 34, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -baitSwapDir * 34, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8 }}
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
                      </motion.div>
                    </AnimatePresence>
                  </motion.div>
                </button>
                  )
                })()}

                {/* Hold — fish icon + count */}
                <button
                  className={flashTab === 'hold' ? 'coach-flash' : undefined}
                  onClick={() => { setHoldOpen(o => !o); setGearOpen(false); setBaitOpen(false) }}
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

                {/* Logbook — book icon + caught/total. Moved here from
                    the top-right header so the action row carries the
                    full set of player tools (Gear / Bait / Hold / Log)
                    and the header has room to breathe. Flash + new-
                    species notification mirror what the header chip
                    used to do. */}
                {(() => {
                  const zoneColor = HABITAT_COLOR[selectedZone]
                  const total = allFishSpecies.length
                  // Ancient trophies (sell_value 0) live in ancientCatches, NOT
                  // caughtFishIds — add them so the headline "caught/total" matches
                  // the drawer (which already credits them). The two sets are
                  // disjoint (trophy ids vs everything else), so no double-count.
                  const caught = caughtFishIds.size + ancientCatches.size
                  const hasNew = uncheckedNewFishIds.size > 0
                  const flashing = freshCatchHook != null
                  const flashAccent = freshCatchHook === 'pb' ? '#5eead4' : '#fde68a'
                  // GOOD NEWS KEEPS ITS OWN COLOUR. The unread-entries state
                  // used to borrow the zone accent, which is #f87171 in the
                  // Abyss, so "you logged a new species" arrived down there
                  // looking like a warning. Its meaning does not change by zone,
                  // so neither should its colour, and warm gold is what the
                  // catch itself already flashed a moment earlier.
                  const NEW_ACCENT = '#fde68a'
                  const accent = flashing ? flashAccent : hasNew ? NEW_ACCENT : zoneColor
                  return (
                    <motion.button
                      key={freshCatchHook ?? 'logbook-tile'}
                      className={flashTab === 'log' ? 'coach-flash' : undefined}
                      onClick={() => {
                        const opening = !collectionOpen
                        setCollectionOpen(o => !o)
                        setGearOpen(false)
                        setHoldOpen(false)
                        setBaitOpen(false)
                        if (opening && latestCatchHabitat) {
                          setExpandedZone(latestCatchHabitat)
                        }
                        setFreshCatchHook(null)
                      }}
                      animate={flashing ? {
                        boxShadow: [
                          `0 0 14px ${flashAccent}88, 0 0 28px ${flashAccent}44`,
                          `0 0 30px ${flashAccent}ee, 0 0 60px ${flashAccent}88`,
                          `0 0 14px ${flashAccent}88, 0 0 28px ${flashAccent}44`,
                        ],
                      } : { boxShadow: hasNew ? `0 0 12px ${NEW_ACCENT}55` : '0 0 0 rgba(0,0,0,0)' }}
                      transition={flashing
                        ? { duration: 1.2, ease: 'easeInOut', repeat: Infinity }
                        : { duration: 0.2 }}
                      style={{
                        ...tile,
                        flexDirection: 'row',
                        alignItems: 'center', justifyContent: 'center',
                        gap: 7, padding: '0 0.5rem',
                        background: collectionOpen
                          ? `${accent}14`
                          : flashing
                            ? `linear-gradient(180deg, ${flashAccent}28 0%, rgba(4,10,18,0.72) 100%)`
                            : hasNew
                              ? `linear-gradient(180deg, ${NEW_ACCENT}18 0%, rgba(4,10,18,0.72) 100%)`
                              : 'rgba(4,10,18,0.72)',
                        border: `1px solid ${collectionOpen ? accent + '55' : flashing ? flashAccent : hasNew ? accent + 'aa' : 'rgba(255,255,255,0.12)'}`,
                        position: 'relative',
                      }}
                    >
                      {/* Story-node book sprite (same /raidlog.png used
                          in expedition raids' story beats). Drop-shadow
                          flips to the flash accent when a noteworthy
                          catch fires. Sized 28px (vs the 36 the other
                          tile glyphs use) — the book art carries more
                          visual mass than the bait / crate sprites, so
                          a smaller image still feels visually equal and
                          stops the right edge from clipping when the
                          count grows to "142/142". */}
                      <img
                        src="/raidlog.png"
                        alt=""
                        style={{
                          width: 28, height: 28, objectFit: 'contain', flexShrink: 0,
                          filter: flashing
                            ? `drop-shadow(0 0 8px ${flashAccent}) drop-shadow(0 1px 4px rgba(0,0,0,0.6))`
                            : 'drop-shadow(0 1px 4px rgba(0,0,0,0.55))',
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, lineHeight: 1, minWidth: 0 }}>
                        {flashing && (
                          <span className="font-karla font-700 uppercase" style={{
                            fontSize: '0.5rem',
                            letterSpacing: '0.16em',
                            color: '#fff',
                            lineHeight: 1,
                            textShadow: `0 0 6px ${flashAccent}`,
                          }}>{freshCatchHook === 'pb' ? 'New PB!' : 'New!'}</span>
                        )}
                        <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', lineHeight: 1, color: flashing ? '#fff' : accent, whiteSpace: 'nowrap' }}>
                          {caught}<span className="font-karla font-400" style={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.45)' }}>/{total}</span>
                        </p>
                      </div>
                      {hasNew && !flashing && (
                        <span style={{
                          position: 'absolute', top: -5, right: -5,
                          minWidth: 16, height: 16, borderRadius: 8,
                          // Gold with dark type, the same shape the crew and
                          // badge tab counts already use. It was a hardcoded
                          // #f87171 in EVERY zone, so a count of new discoveries
                          // was drawn in the one colour the rest of the app
                          // reserves for something being wrong.
                          ...ctaPill(false), border: '1.5px solid #08121c',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.5rem', fontWeight: 700,
                          paddingInline: uncheckedNewFishIds.size > 9 ? '0.2rem' : 0,
                          fontFamily: 'var(--font-karla)',
                        }}>{uncheckedNewFishIds.size}</span>
                      )}
                    </motion.button>
                  )
                })()}

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

      {/* ── Contextual fishing coach-marks (Doby + Kat) — first visit ──
          Tips ride OVER the live game and fall through to it (pointer-events
          none), so the player learns by doing. */}
      <GuideCoach
        show={coach === 'cast'}
        portrait={GUIDES.doby.portrait}
        speaker="Doby"
        text="Tap anywhere to cast your line."
        accent={FISHING_ACCENT}
        placement="top"
        autoHideMs={9000}
        onClose={() => setCoach(null)}
      />
      <GuideCoach
        show={coach === 'dial'}
        portrait={GUIDES.kat.portrait}
        speaker="Kat"
        text="A fish is on. Stop the needle in the *green* to catch it, or the *gold* for a Perfect. Perfects build a streak for bonus XP and can refund bait."
        accent={FISHING_ACCENT}
        placement="top"
        autoHideMs={11000}
        onClose={() => setCoach(null)}
      />
      {/* Post-first-catch walkthrough — steps through each action-bar tab
          (flashing it), then explains XP / leveling. */}
      {walkStep != null && FISH_WALKTHROUGH[walkStep] && (
        <GuideCoach
          show
          portrait={FISH_WALKTHROUGH[walkStep].portrait}
          speaker={FISH_WALKTHROUGH[walkStep].speaker}
          text={FISH_WALKTHROUGH[walkStep].text}
          accent={FISHING_ACCENT}
          placement="bottom"
          offset="calc(env(safe-area-inset-bottom, 0px) + 150px)"
          onNext={() => setWalkStep(s => (s != null && s < FISH_WALKTHROUGH.length - 1 ? s + 1 : null))}
          nextLabel={walkStep >= FISH_WALKTHROUGH.length - 1 ? 'Got it' : 'Next →'}
          onClose={() => setWalkStep(null)}
        />
      )}

      {/* ── Onboarding tour (legacy plain cards — retired, kept dead) ── */}
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

      {/* ── Prestige ceremony — the stamp slams, the log begins anew ── */}
      <AnimatePresence>
        {prestigeCeremony && (
          <PrestigeCeremonyOverlay
            zone={prestigeCeremony.zone}
            level={prestigeCeremony.level}
            goldenBoost={prestigeCeremony.goldenBoost}
            skinName={prestigeCeremony.skin ? prestigeCeremony.skin.charAt(0).toUpperCase() + prestigeCeremony.skin.slice(1) : null}
            onDone={() => setPrestigeCeremony(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Zone completion celebration ── */}
      <AnimatePresence>
        {skinUnlockToast && (() => {
          const skinColor = getCharSrc(skinUnlockToast)
          const skinName = CHARACTER_COLORS.find(c => c.id === skinUnlockToast)?.name ?? skinUnlockToast
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
              data-any-key
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

        {boatUnlockToast && (() => {
          const boat = getBoat(boatUnlockToast)
          if (!boat) return null
          return (
            <motion.div key="boat-unlock-toast"
              initial={{ opacity: 0, scale: 0.88, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: 'spring', stiffness: 380, damping: 22 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 40,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(3,8,16,0.82)', backdropFilter: 'blur(6px)',
              }}
              data-any-key
              onClick={() => setBoatUnlockToast(null)}
            >
              <div style={{
                background: 'linear-gradient(145deg, rgba(20,14,6,0.98) 0%, rgba(120,90,40,0.28) 100%)',
                border: '1px solid rgba(240,192,64,0.35)',
                borderTop: '3px solid rgba(240,192,64,0.7)',
                borderRadius: 20, padding: '2rem 2.5rem',
                textAlign: 'center', maxWidth: 300,
                boxShadow: '0 0 60px rgba(240,192,64,0.16), 0 0 120px rgba(240,192,64,0.07)',
              }}>
                <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.52rem', color: 'rgba(240,192,64,0.75)', marginBottom: '0.75rem' }}>
                  Boat Unlocked
                </p>
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
                  style={{ width: 180, height: 76, margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={boat.restImageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.55))' }} />
                </motion.div>
                <p className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0c040', textShadow: '0 0 24px rgba(240,192,64,0.55)', marginBottom: '0.3rem', lineHeight: 1.1 }}>
                  {boat.name}
                </p>
                <p className="font-karla font-400" style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)', marginBottom: '1rem' }}>
                  New boat available
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
              data-any-key
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
                  style={{ fontSize: '2.5rem', marginBottom: '0.75rem', lineHeight: 1, color: zc, display: 'flex', justifyContent: 'center' }}
                >
                  <IconTrophy size={40} />
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
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...collectionDrawerDrag.motionProps}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
              willChange: 'transform',
            }}
          >
            <DrawerHandle dragHandleProps={collectionDrawerDrag.handleProps} />
            {/* Sticky header */}
            <div className="flex items-center justify-between flex-shrink-0"
              style={{ padding: '1.25rem 1.1rem 0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.82rem', color: '#6a6764' }}>Fish Collection</p>
              <DrawerClose onClick={() => { setCollectionOpen(false); setExpandedZone(null); setTappedFishId(null) }} />
            </div>

            {/* Scrollable body */}
            <div ref={collectionBodyRef} style={{ overflowY: 'auto', padding: '0 1.1rem 2rem', overscrollBehavior: 'contain' }}>
            {ZONES.filter(z => z !== 'ancient_deep').map(zone => {
              const zoneSpecies = allFishSpecies.filter(f => f.habitat === zone)
              const discoveredCount = zoneSpecies.filter(f => caughtFishIds.has(f.id)).length
              // Trophies landed in this zone. Size gives no XP, no coin and no sell bonus:
              // the collection IS the reward, so it has to be somewhere you can point at.
              const trophyCount = zoneSpecies.filter(f => {
                const pb = personalBests[f.id]
                if (pb == null || f.length_min_in == null || f.length_max_in == null) return false
                return tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in)) === 'trophy'
              }).length
              const zoneColor = HABITAT_COLOR[zone]
              const isExpanded = expandedZone === zone
              const pct = zoneSpecies.length > 0 ? discoveredCount / zoneSpecies.length : 0
              const isComplete = discoveredCount === zoneSpecies.length && zoneSpecies.length > 0
              const isClaimed = claimedZones[zone] ?? false
              const isClaiming = claimingZone === zone
              // Count unviewed new fish in this zone so the header
              // shows a NEW pill — tells the player exactly which
              // zone to open without a guessing game.
              const newInZone = zoneSpecies.filter(f => uncheckedNewFishIds.has(f.id)).length

              return (
                <div key={zone} ref={el => { zoneBlockRefs.current[zone] = el }} style={{ marginBottom: '0.6rem' }}>
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
                          {(goldenBoosts[zone] ?? 0) > 0 && (
                            <span className="font-karla font-700" style={{ fontSize: '0.5rem', color: '#f0c040', letterSpacing: '0.06em', textShadow: '0 0 6px rgba(240,192,64,0.5)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                              ✦ +{goldenBoostPct(goldenBoosts[zone] ?? 0)}% GOLDENS
                            </span>
                          )}
                          {newInZone > 0 && (
                            <motion.span
                              animate={{ scale: [1, 1.08, 1] }}
                              transition={{ duration: 1.4, ease: 'easeInOut', repeat: Infinity }}
                              style={{
                                fontSize: '0.5rem', fontWeight: 700,
                                fontFamily: 'var(--font-karla)',
                                color: '#fde68a',
                                background: 'rgba(253,230,138,0.18)',
                                border: '1px solid rgba(253,230,138,0.5)',
                                padding: '0.14rem 0.42rem',
                                borderRadius: '2rem',
                                letterSpacing: '0.12em',
                                boxShadow: '0 0 12px rgba(253,230,138,0.32)',
                                lineHeight: 1,
                              }}>
                              {newInZone} NEW
                            </motion.span>
                          )}
                        </div>
                        <p className="font-karla font-400"
                          style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>{HABITAT_TAGLINE[zone]}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center gap-2">
                          {/* Percentage as the headline metric — bigger,
                              brighter, in Cinzel. Raw count drops to a
                              muted secondary so completion reads at a
                              glance. Same row height as before so the
                              zone header chrome stays compact. */}
                          <p className="font-cinzel font-700"
                            style={{ fontSize: '0.88rem', color: isComplete ? zoneColor : '#f0ede8', lineHeight: 1, textShadow: isComplete ? `0 0 8px ${zoneColor}66` : 'none' }}>
                            {Math.round(pct * 100)}%
                          </p>
                          <p className="font-karla font-600"
                            style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                            {discoveredCount}/{zoneSpecies.length}
                          </p>
                          {trophyCount > 0 && (
                            <p className="font-karla font-700" title={`${trophyCount} trophy catch${trophyCount === 1 ? '' : 'es'}`}
                              style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.7rem', lineHeight: 1, color: TIER_COLOR.trophy, textShadow: `0 0 7px ${TIER_COLOR.trophy}55` }}>
                              <TrophyMark size={10} color={TIER_COLOR.trophy} />
                              {trophyCount}
                            </p>
                          )}
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
                        <span style={{ fontSize: '0.9rem', color: zoneColor, display: 'flex' }}><IconTrophy size={14} /></span>
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
                          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.62rem', color: (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? '#f0c040' : zoneColor, marginBottom: '0.3rem' }}>
                            Are you sure?
                          </p>
                          {(prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? (
                            <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.55rem', lineHeight: 1.4 }}>
                              Wipe your {HABITAT_LABEL[zone]} catch log (your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>) for a permanent <span style={{ color: '#f0c040', fontWeight: 700 }}>+{goldenBoostPct(1)}% golden catch chance</span> here, stacking on your current +{goldenBoostPct(goldenBoosts[zone] ?? 0)}%.
                            </p>
                          ) : (
                            <p className="font-karla font-500" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.7)', marginBottom: '0.55rem', lineHeight: 1.4 }}>
                              Your {HABITAT_LABEL[zone]} catch log resets (your <span style={{ color: '#f5c451', fontWeight: 700 }}>golden trophies stay</span>), but you&apos;ll permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every catch here. You can complete the collection again for another full reward.
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setConfirmPrestigeZone(null)}
                              className="font-karla font-600 uppercase tracking-[0.1em]"
                              style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.4)', padding: '0.3rem 0.7rem', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 7 }}
                            >Cancel</button>
                            {(() => {
                              const gold = (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX
                              const acc = gold ? '#f0c040' : zoneColor
                              return (
                                <button
                                  onClick={() => handlePrestige(zone)}
                                  disabled={prestigingZone === zone}
                                  className="font-karla font-700 uppercase tracking-[0.1em]"
                                  style={{ fontSize: '0.62rem', color: gold ? '#1a1205' : '#fff', padding: '0.3rem 0.9rem', background: gold ? acc : acc + 'cc', border: `1px solid ${acc}`, borderRadius: 7, boxShadow: `0 0 10px ${acc}66` }}
                                >{prestigingZone === zone ? '…' : gold ? 'Yes, wipe for gold!' : 'Yes, Prestige!'}</button>
                              )
                            })()}
                          </div>
                        </div>
                      ) : (prestigeLevels[zone] ?? 0) >= PRESTIGE_MAX ? (
                        // MAX PRESTIGE — mastered. Further wipes no longer level up;
                        // each buys a permanent GOLDEN BOOST (higher golden odds
                        // here), the evergreen post-max chase.
                        <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 10, padding: '0.6rem 0.6rem 0.65rem', textAlign: 'center', background: 'linear-gradient(160deg, rgba(240,192,64,0.16), rgba(240,192,64,0.04))', border: '1px solid rgba(240,192,64,0.45)' }}>
                          <motion.div aria-hidden animate={{ opacity: [0.3, 0.7, 0.3] }} transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
                            style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(240,192,64,0.26), transparent 70%)', pointerEvents: 'none' }} />
                          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                            {Array.from({ length: PRESTIGE_MAX }).map((_, i) => (
                              <svg key={i} width="15" height="15" viewBox="0 0 24 24" fill="#f0c040" style={{ filter: 'drop-shadow(0 0 5px #f0c040cc)', flexShrink: 0 }}>
                                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                              </svg>
                            ))}
                          </div>
                          <p className="font-cinzel font-800 uppercase" style={{ position: 'relative', fontSize: '0.78rem', letterSpacing: '0.16em', backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8,#f0c040)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                            Max Prestige
                          </p>
                          {(goldenBoosts[zone] ?? 0) > 0 && (
                            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ position: 'relative', fontSize: '0.6rem', color: '#f0c040', marginTop: 4 }}>
                              ✦ Golden Boost +{goldenBoostPct(goldenBoosts[zone] ?? 0)}%
                            </p>
                          )}
                          <p className="font-karla font-500" style={{ position: 'relative', fontSize: '0.62rem', color: 'rgba(255,235,190,0.7)', marginTop: 4, marginBottom: '0.5rem', lineHeight: 1.35 }}>
                            Wipe again for a permanent <span style={{ color: '#f0c040', fontWeight: 700 }}>+{goldenBoostPct(1)}%</span> golden catch chance here.
                          </p>
                          <button
                            onClick={e => { e.stopPropagation(); setConfirmPrestigeZone(zone) }}
                            className="font-karla font-700 uppercase tracking-[0.12em] w-full"
                            style={{ position: 'relative', fontSize: '0.66rem', color: '#1a1205', padding: '0.42rem 1rem', background: 'linear-gradient(135deg,#ffe08a,#f0c040)', border: '1px solid #f0c040', borderRadius: 8, boxShadow: '0 0 14px rgba(240,192,64,0.4), inset 0 1px 0 rgba(255,255,255,0.3)' }}
                          >✦ Wipe for +{goldenBoostPct(1)}% Goldens</button>
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
                            Reset your collection (golden trophies stay) and permanently earn <span style={{ color: zoneColor, fontWeight: 700 }}>+{((prestigeLevels[zone] ?? 0) + 1) * 10}% XP</span> on every {HABITAT_LABEL[zone]} catch{(prestigeLevels[zone] ?? 0) + 1 >= PRESTIGE_MAX ? '. This is the final prestige — Max Prestige.' : ', up to +50% at Max Prestige.'}
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
                    <motion.div
                      // Stagger entrance — when a zone expands, the cards
                      // cascade in over ~300ms instead of materialising
                      // all at once. Parent's `visible` variant carries
                      // staggerChildren; each card's variant just declares
                      // hidden/visible states and inherits the delay from
                      // the parent's stagger schedule.
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden:  {},
                        visible: { transition: { staggerChildren: 0.028, delayChildren: 0.04 } },
                      }}
                      style={{
                        background: `${zoneColor}08`,
                        border: `1px solid ${zoneColor}20`,
                        borderTop: 'none',
                        borderRadius: '0 0 12px 12px',
                        padding: '0.55rem 0.55rem 0.65rem',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                        gap: '0.45rem',
                      }}>
                      {zoneSpecies.map(f => {
                        const discovered = caughtFishIds.has(f.id)
                        const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'
                        const pb = personalBests[f.id]
                        // The PB length, read back as a tier. fish_personal_bests never stored the
                        // tier, so a 3%-roll trophy used to vanish into the log as a slightly bigger
                        // number with nothing to say what it was. The length already knows:
                        // tierForLength is the exact inverse of the roll. No migration, no new column.
                        const pbTier = (pb != null && f.length_min_in != null && f.length_max_in != null)
                          ? tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in))
                          : null
                        const isTrophy = pbTier === 'trophy'
                        const isNew = uncheckedNewFishIds.has(f.id)
                        const cardVariants = {
                          hidden:  { opacity: 0, y: 10, scale: 0.96 },
                          visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.26, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                        }

                        // Undiscovered: silhouette card. Render the actual
                        // fish image at brightness:0 + low opacity so the
                        // player gets a hint of the shape (more compelling
                        // than a plain "???") without leaking the species.
                        if (!discovered) {
                          return (
                            <motion.div key={f.id}
                              variants={cardVariants}
                              style={{
                                position: 'relative',
                                background: 'rgba(4,10,18,0.45)',
                                border: `1px solid ${rarityColor}1c`,
                                borderRadius: 10,
                                padding: '0.55rem 0.5rem 0.5rem',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                minHeight: 96,
                              }}>
                              <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FishImg name={f.name} style={{ maxWidth: '88%', maxHeight: 48, objectFit: 'contain', filter: 'brightness(0) opacity(0.18)' }} />
                              </div>
                              <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: 4, letterSpacing: '0.06em' }}>???</p>
                            </motion.div>
                          )
                        }

                        // Discovered: full card. Tap opens the modal with
                        // the fun fact + sell value + PB. NEW badge clears
                        // on tap (same as before — replaces inline expand).
                        // Mounted (golden) species swap the card chrome to
                        // the gold treatment from the catch result card —
                        // gold radial bg, gold border, golden-filtered fish
                        // sprite, small ✦ badge.
                        const isMounted = mountedFishIds.has(f.id)
                        return (
                          <motion.button
                            key={f.id}
                            type="button"
                            variants={cardVariants}
                            onClick={() => {
                              setTappedFishId(f.id)
                              if (isNew) setUncheckedNewFishIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
                            }}
                            className="text-left"
                            style={{
                              position: 'relative',
                              background: isMounted
                                ? 'radial-gradient(circle at 50% 35%, rgba(253,230,138,0.28) 0%, rgba(120,68,16,0.55) 60%, rgba(40,18,4,0.85) 100%)'
                                : `linear-gradient(180deg, rgba(4,10,18,0.7) 0%, ${rarityColor}10 100%)`,
                              border: isMounted
                                ? '1px solid rgba(228,188,108,0.75)'
                                : isTrophy
                                  ? `1px solid ${TIER_COLOR.trophy}aa`
                                  : `1px solid ${rarityColor}55`,
                              borderRadius: 10,
                              padding: '0.55rem 0.5rem 0.55rem',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              minHeight: 96,
                              cursor: 'pointer',
                              touchAction: 'manipulation',
                              boxShadow: isMounted
                                ? 'inset 0 0 18px rgba(200,140,40,0.18), 0 0 14px rgba(228,188,108,0.22)'
                                : isTrophy
                                  ? `inset 0 0 16px ${TIER_COLOR.trophy}1f, 0 0 12px ${TIER_COLOR.trophy}2e`
                                  : undefined,
                            }}
                          >
                            <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <FishImg name={f.name} style={{
                                maxWidth: '88%', maxHeight: 50, objectFit: 'contain',
                                filter: isMounted ? SHINY_FISH_FILTER : `drop-shadow(0 1px 6px ${rarityColor}66)`,
                              }} />
                            </div>
                            <p className="font-cinzel font-700" style={{
                              fontSize: '0.72rem',
                              color: isMounted ? '#fff5d0' : rarityColor,
                              lineHeight: 1.15,
                              textAlign: 'center',
                              width: '100%',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              marginTop: 2,
                              textShadow: isMounted ? '0 0 8px rgba(251,204,74,0.45)' : undefined,
                            }}>{isMounted ? `Golden ${f.name}` : f.name}</p>
                            {pb != null && (
                              <p className="font-karla font-600" style={{
                                display: 'flex', alignItems: 'center', gap: 3,
                                fontSize: '0.6rem', letterSpacing: '0.04em',
                                color: isTrophy ? TIER_COLOR.trophy : isMounted ? 'rgba(251,204,74,0.85)' : 'rgba(230,220,200,0.7)',
                                textShadow: isTrophy ? `0 0 8px ${TIER_COLOR.trophy}66` : undefined,
                              }}>
                                {isTrophy && <TrophyMark size={9} color={TIER_COLOR.trophy} />}
                                {formatFishLength(pb)}
                              </p>
                            )}
                            {isMounted ? (
                              <span aria-hidden style={{
                                position: 'absolute', top: 5, right: 5,
                                fontSize: '0.62rem', color: '#fbcc4a',
                                textShadow: '0 0 8px rgba(251,204,74,0.85)',
                                lineHeight: 1,
                              }}>✦</span>
                            ) : isTrophy ? (
                              <span aria-hidden style={{ position: 'absolute', top: 4, right: 4, display: 'flex', filter: `drop-shadow(0 0 5px ${TIER_COLOR.trophy}aa)` }}>
                                <TrophyMark size={11} color={TIER_COLOR.trophy} />
                              </span>
                            ) : null}
                            {isNew && <DiscoveredStamp />}
                          </motion.button>
                        )
                      })}
                    </motion.div>
                  )}
                </div>
              )
            })}

            {/* Ancient Deep — split into regulars (grid w/ images, like
                other zones) + trophies (existing row layout). The 12
                regulars added 2026-06-09 stack in fish_collection like
                normal catches, so they need the same image-card format.
                Trophies stay in their distinct row format with the 🏆
                icon since they're ceremonial unlocks tracked via
                ancient_catches, not the regular fish_collection. */}
            {(() => {
              const zone = 'ancient_deep'
              const zoneColor = HABITAT_COLOR[zone]
              const allAncient = allFishSpecies.filter(f => f.habitat === zone)
              const regulars = allAncient.filter(f => (f.sell_value ?? 0) > 0)
              const trophies = allAncient.filter(f => (f.sell_value ?? 0) === 0)
              const regularsCaught = regulars.filter(f => caughtFishIds.has(f.id)).length
              const trophiesCaught = trophies.filter(f => ancientCatches.has(f.id)).length
              const caughtCount = regularsCaught + trophiesCaught
              const bossSpecies = allAncient   // header sizing uses the combined total
              const isExpanded = expandedZone === zone
              const isLocked = getLevelFromXP(fishingXP) < 75
              return (
                <div key={zone} ref={el => { zoneBlockRefs.current[zone] = el }} style={{ marginBottom: '0.6rem' }}>
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
                          {isLocked ? <><IconLock size={13} />{' '}</> : null}Ancient Deep
                        </p>
                        <p className="font-karla font-400" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.55)', marginTop: 4 }}>
                          {isLocked ? 'Unlocks at Fishing Level 75' : 'Before time. Beyond depth.'}
                        </p>
                      </div>
                      {/* Same percentage-led metric as the other zones,
                          gated on !isLocked so the header still reads
                          as "—" while the zone is locked. */}
                      {isLocked ? (
                        <p className="font-karla font-600" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.2)' }}>—</p>
                      ) : (() => {
                        const isAncientComplete = caughtCount === bossSpecies.length && bossSpecies.length > 0
                        const ancientPct = bossSpecies.length > 0 ? caughtCount / bossSpecies.length : 0
                        return (
                          <div className="flex items-center gap-2">
                            <p className="font-cinzel font-700"
                              style={{ fontSize: '0.88rem', color: isAncientComplete ? zoneColor : '#f0ede8', lineHeight: 1, textShadow: isAncientComplete ? `0 0 8px ${zoneColor}66` : 'none' }}>
                              {Math.round(ancientPct * 100)}%
                            </p>
                            <p className="font-karla font-600"
                              style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
                              {caughtCount}/{bossSpecies.length}
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  </button>
                  {isExpanded && !isLocked && (
                    <motion.div
                      initial="hidden"
                      animate="visible"
                      variants={{
                        hidden:  {},
                        visible: { transition: { staggerChildren: 0.025, delayChildren: 0.05 } },
                      }}
                      style={{
                        background: `${zoneColor}08`, border: `1px solid ${zoneColor}22`,
                        borderTop: 'none', borderRadius: '0 0 12px 12px', padding: '0.55rem 0.55rem 0.6rem',
                      }}>
                      {/* Regulars — 12 sellable Ancient Deep fish in the
                          same 2-column image grid the other zones use.
                          Same discovery / mounted / silhouette / NEW-stamp
                          treatments. */}
                      <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.45rem',
                      }}>
                        {regulars.map(f => {
                          const discovered = caughtFishIds.has(f.id)
                          const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'
                          const pb = personalBests[f.id]
                          // The PB length, read back as a tier. fish_personal_bests never stored the
                          // tier, so a 3%-roll trophy used to vanish into the log as a slightly bigger
                          // number with nothing to say what it was. The length already knows:
                          // tierForLength is the exact inverse of the roll. No migration, no new column.
                          const pbTier = (pb != null && f.length_min_in != null && f.length_max_in != null)
                            ? tierForLength(pb, Number(f.length_min_in), Number(f.length_max_in))
                            : null
                          const isTrophy = pbTier === 'trophy'
                          const isNew = uncheckedNewFishIds.has(f.id)
                          const cardVariants = {
                            hidden:  { opacity: 0, y: 10, scale: 0.96 },
                            visible: { opacity: 1, y: 0,  scale: 1, transition: { duration: 0.26, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                          }
                          if (!discovered) {
                            return (
                              <motion.div key={f.id}
                                variants={cardVariants}
                                style={{
                                  position: 'relative',
                                  background: 'rgba(4,10,18,0.45)',
                                  border: `1px solid ${rarityColor}1c`,
                                  borderRadius: 10,
                                  padding: '0.55rem 0.5rem 0.5rem',
                                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                  minHeight: 96,
                                }}>
                                <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <FishImg name={f.name} style={{ maxWidth: '88%', maxHeight: 48, objectFit: 'contain', filter: 'brightness(0) opacity(0.18)' }} />
                                </div>
                                <p className="font-karla font-600" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.28)', marginTop: 4, letterSpacing: '0.06em' }}>???</p>
                              </motion.div>
                            )
                          }
                          const isMounted = mountedFishIds.has(f.id)
                          return (
                            <motion.button
                              key={f.id}
                              type="button"
                              variants={cardVariants}
                              onClick={() => {
                                setTappedFishId(f.id)
                                if (isNew) setUncheckedNewFishIds(prev => { const next = new Set(prev); next.delete(f.id); return next })
                              }}
                              className="text-left"
                              style={{
                                position: 'relative',
                                background: isMounted
                                  ? 'radial-gradient(circle at 50% 35%, rgba(253,230,138,0.28) 0%, rgba(120,68,16,0.55) 60%, rgba(40,18,4,0.85) 100%)'
                                  : `linear-gradient(180deg, rgba(4,10,18,0.7) 0%, ${rarityColor}10 100%)`,
                                border: isMounted
                                  ? '1px solid rgba(228,188,108,0.75)'
                                  : isTrophy
                                    ? `1px solid ${TIER_COLOR.trophy}aa`
                                    : `1px solid ${rarityColor}55`,
                                borderRadius: 10,
                                padding: '0.55rem 0.5rem 0.55rem',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                                minHeight: 96,
                                cursor: 'pointer',
                                touchAction: 'manipulation',
                                boxShadow: isMounted
                                  ? 'inset 0 0 18px rgba(200,140,40,0.18), 0 0 14px rgba(228,188,108,0.22)'
                                  : isTrophy
                                    ? `inset 0 0 16px ${TIER_COLOR.trophy}1f, 0 0 12px ${TIER_COLOR.trophy}2e`
                                    : undefined,
                              }}
                            >
                              <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FishImg name={f.name} style={{
                                  maxWidth: '88%', maxHeight: 50, objectFit: 'contain',
                                  filter: isMounted ? SHINY_FISH_FILTER : `drop-shadow(0 1px 6px ${rarityColor}66)`,
                                }} />
                              </div>
                              <p className="font-cinzel font-700" style={{
                                fontSize: '0.72rem',
                                color: isMounted ? '#fff5d0' : rarityColor,
                                lineHeight: 1.15,
                                textAlign: 'center',
                                width: '100%',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                marginTop: 2,
                                textShadow: isMounted ? '0 0 8px rgba(251,204,74,0.45)' : undefined,
                              }}>{isMounted ? `Golden ${f.name}` : f.name}</p>
                              {pb != null && (
                                <p className="font-karla font-600" style={{
                                  display: 'flex', alignItems: 'center', gap: 3,
                                  fontSize: '0.6rem', letterSpacing: '0.04em',
                                  color: isTrophy ? TIER_COLOR.trophy : isMounted ? 'rgba(251,204,74,0.85)' : 'rgba(230,220,200,0.7)',
                                  textShadow: isTrophy ? `0 0 8px ${TIER_COLOR.trophy}66` : undefined,
                                }}>
                                  {isTrophy && <TrophyMark size={9} color={TIER_COLOR.trophy} />}
                                  {formatFishLength(pb)}
                                </p>
                              )}
                              {isMounted ? (
                                <span aria-hidden style={{
                                  position: 'absolute', top: 5, right: 5,
                                  fontSize: '0.62rem', color: '#fbcc4a',
                                  textShadow: '0 0 8px rgba(251,204,74,0.85)',
                                  lineHeight: 1,
                                }}>✦</span>
                              ) : isTrophy ? (
                                <span aria-hidden style={{ position: 'absolute', top: 4, right: 4, display: 'flex', filter: `drop-shadow(0 0 5px ${TIER_COLOR.trophy}aa)` }}>
                                  <TrophyMark size={11} color={TIER_COLOR.trophy} />
                                </span>
                              ) : null}
                              {isNew && <DiscoveredStamp />}
                            </motion.button>
                          )
                        })}
                      </div>

                      {/* The Ancients — 6 ceremonial relic-monolith cards.
                          Caught: stone-tablet card with warm amber relic
                          glow at the top, full silhouette art, Cinzel
                          name + scientific italic, ✦ corner glyph, taps
                          open the existing detail modal. Slumbering: dim
                          dashed-border tablet with a barely-visible
                          silhouette and a "Slumbering" caption — same
                          species shape so the player can read what's
                          waiting for them. */}
                      <p className="font-cinzel font-700 uppercase" style={{
                        fontSize: '0.62rem',
                        color: zoneColor,
                        marginTop: '0.95rem',
                        marginBottom: '0.55rem',
                        textAlign: 'center',
                        textShadow: `0 0 14px ${zoneColor}88`,
                        letterSpacing: '0.28em',
                      }}>
                        ✦ The Ancients · {vigilUnlocked
                          ? `${Object.values(ancientVigil).reduce((n, e) => n + e.rank, 0)} of ${trophies.length * VIGIL_MAX_RANK} vigil`
                          : `${trophiesCaught} of ${trophies.length} awakened`}
                      </p>
                      {trophies.map(f => {
                        const caught = ancientCatches.has(f.id)
                        const monoVariants = {
                          hidden:  { opacity: 0, y: 6, scale: 0.98 },
                          visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.32, ease: [0.2, 0.7, 0.3, 1] as [number, number, number, number] } },
                        }
                        if (!caught) {
                          return (
                            <motion.div key={f.id} variants={monoVariants} style={{
                              position: 'relative',
                              background: 'linear-gradient(180deg, rgba(8,12,22,0.92) 0%, rgba(4,8,16,0.96) 100%)',
                              border: '1px dashed rgba(255,255,255,0.08)',
                              borderRadius: 14,
                              padding: '1rem 1rem 0.85rem',
                              marginBottom: '0.5rem',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                            }}>
                              <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FishImg name={f.name} style={{ maxWidth: '68%', maxHeight: 50, objectFit: 'contain', filter: 'brightness(0) opacity(0.12)' }} />
                              </div>
                              <p className="font-cinzel font-700 uppercase" style={{
                                fontSize: '0.56rem',
                                color: 'rgba(255,255,255,0.25)',
                                letterSpacing: '0.28em',
                                marginTop: 2,
                              }}>Slumbering</p>
                            </motion.div>
                          )
                        }
                        return (
                          <motion.button
                            key={f.id}
                            type="button"
                            variants={monoVariants}
                            onClick={() => setTappedFishId(f.id)}
                            className="text-left w-full"
                            style={{
                              position: 'relative',
                              background: `
                                radial-gradient(120% 60% at 50% 0%, ${zoneColor}42 0%, transparent 55%),
                                linear-gradient(180deg, rgba(28,18,10,0.85) 0%, rgba(10,8,16,0.95) 70%, rgba(6,6,14,0.97) 100%)
                              `,
                              border: `1px solid ${zoneColor}66`,
                              boxShadow: `inset 0 0 0 1px ${zoneColor}18, inset 0 32px 64px -22px ${zoneColor}30, 0 6px 22px rgba(0,0,0,0.55), 0 0 18px ${zoneColor}22`,
                              borderRadius: 14,
                              padding: '1rem 1rem 0.95rem',
                              marginBottom: '0.5rem',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                              cursor: 'pointer',
                              touchAction: 'manipulation',
                              overflow: 'hidden',
                              width: '100%',
                            }}
                          >
                            <span aria-hidden style={{
                              position: 'absolute', top: 8, right: 10,
                              fontSize: '0.78rem', color: zoneColor,
                              textShadow: `0 0 10px ${zoneColor}cc`,
                              lineHeight: 1,
                            }}>✦</span>
                            {(() => {
                              // THE LONG VIGIL — the same rank the Giants room
                              // shows, so the two surfaces never disagree.
                              const ve = vigilUnlocked ? ancientVigil[String(f.id)] : undefined
                              const vr = ve?.rank ?? 0
                              const out = ve?.released === true
                              const vf = vr ? VIGIL_FRAME[vr] : null
                              return (
                                <p className="font-karla font-700 uppercase" style={{
                                  fontSize: '0.5rem',
                                  color: out ? 'rgba(148,163,184,0.9)' : vf ? vf.accent : `${zoneColor}b0`,
                                  letterSpacing: '0.36em',
                                  marginBottom: 4,
                                }}>{out ? 'AT LARGE' : vr ? `RANK ${vigilNumeral(vr)}` : 'ANCIENT'}</p>
                              )
                            })()}
                            <div style={{ width: '100%', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                              <FishImg name={f.name} style={{
                                maxWidth: '78%', maxHeight: 64, objectFit: 'contain',
                                filter: `sepia(0.3) saturate(1.1) brightness(1.05) drop-shadow(0 4px 14px ${zoneColor}55)`,
                              }} />
                            </div>
                            <p className="font-cinzel font-700 uppercase" style={{
                              fontSize: '0.95rem',
                              color: '#fbe9c2',
                              letterSpacing: '0.16em',
                              textShadow: `0 0 14px ${zoneColor}aa, 0 1px 0 rgba(0,0,0,0.5)`,
                              lineHeight: 1.1,
                              textAlign: 'center',
                              marginTop: 2,
                            }}>{f.name}</p>
                            <p className="font-karla font-400" style={{
                              fontSize: '0.62rem',
                              color: `${zoneColor}cc`,
                              fontStyle: 'italic',
                              marginTop: 2,
                              textAlign: 'center',
                            }}>{f.scientific_name}</p>
                            {(() => {
                              const ve = vigilUnlocked ? ancientVigil[String(f.id)] : undefined
                              if (!ve) return null
                              if (ve.released) {
                                return (
                                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: 'rgba(148,163,184,0.85)', marginTop: 7, textAlign: 'center', lineHeight: 1.4 }}>
                                    Out there now. Bring a lure.
                                  </p>
                                )
                              }
                              if (ve.rank >= VIGIL_MAX_RANK) {
                                return (
                                  <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: '#e7d5aa', marginTop: 7, textAlign: 'center' }}>Mastered</p>
                                )
                              }
                              const vf = VIGIL_FRAME[Math.min(VIGIL_MAX_RANK, ve.rank + 1)]
                              return (
                                // A DIV, not a button: this slab is itself a
                                // <button> that opens the fish sheet, and a
                                // nested button is invalid HTML that React will
                                // hydrate wrong. stopPropagation keeps the tap
                                // from also opening the sheet behind it.
                                <div
                                  role="button"
                                  tabIndex={0}
                                  onClick={e => { e.stopPropagation(); setReleasingAncient(f) }}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); setReleasingAncient(f) } }}
                                  className="font-karla font-700 uppercase tracking-[0.14em] tap"
                                  style={{
                                    marginTop: 9, padding: '0.42rem 0.9rem', borderRadius: 9,
                                    border: `1px solid ${vf.accent}66`, color: vf.accent,
                                    fontSize: '0.56rem', cursor: 'pointer',
                                  }}
                                >Release for Rank {vigilNumeral(ve.rank + 1)}</div>
                              )
                            })()}
                          </motion.button>
                        )
                      })}
                    </motion.div>
                  )}
                </div>
              )
            })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collection fish detail modal ──────────────────────────────
          Tapping a discovered fish card in the collection drawer opens
          this modal with the big image, fun fact, sell value, and the
          player's PB length. Replaces the old inline tap-to-expand on
          the row layout; the grid format made the inline panel push
          neighbouring cards around. Mounted at the FishingGame root so
          it floats above the drawer (PopupShell handles z-index +
          safe-area + tap-outside-to-close). */}
      {/* THE RELEASE, from the in-game log. Same ceremony the Giants room uses;
          it portals to body so the drawer above it is irrelevant. */}
      {releasingAncient && (
        <AncientRelease
          name={releasingAncient.name}
          fishId={releasingAncient.id}
          rank={ancientVigil[String(releasingAncient.id)]?.rank ?? 1}
          onConfirm={async () => {
            const res = await releaseAncient(releasingAncient.id)
            if ('ok' in res) setAncientVigil(res.vigil)
          }}
          onClose={() => setReleasingAncient(null)}
        />
      )}

      <PopupShell open={tappedFishId != null} onClose={() => setTappedFishId(null)}>
        {tappedFishId != null && (() => {
          const f = allFishSpecies.find(x => x.id === tappedFishId)
          if (!f) return null
          const rarityColor = RARITY[f.bite_rarity]?.color ?? '#888'
          const pb = personalBests[f.id]
          const totalCaught = catchCounts[f.id]
          return (
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 4 }}
              transition={{ duration: 0.18 }}
              style={{
                margin: 'auto', width: '100%', maxWidth: 360,
                // Layered background — opaque dark base BEHIND a subtle
                // rarity tint, instead of a single gradient that faded
                // to ~6% opacity at the bottom (the old recipe let the
                // fishing scene bleed through the lower half, making
                // body text hard to read). The tint stays as the
                // atmospheric flavor; the card itself is now fully
                // opaque from top to bottom.
                background: `linear-gradient(180deg, transparent 0%, ${rarityColor}26 100%), rgba(8,14,24,0.98)`,
                border: `1px solid ${rarityColor}55`,
                borderRadius: 18,
                padding: '1.1rem 1rem 1.2rem',
                position: 'relative',
                boxShadow: `0 18px 48px rgba(0,0,0,0.55), 0 0 24px ${rarityColor}22`,
                overscrollBehavior: 'contain',
              }}
            >
              {/* Anchor seal — sepia decoration in the top-left so the
                  modal reads as a logbook page entry rather than a
                  generic detail card. Pure cosmetic. */}
              <AnchorSeal />

              <CloseButton onClick={() => setTappedFishId(null)} size={28} style={{ position: 'absolute', top: 8, right: 8 }} />

              <div style={{ width: '100%', height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.6rem' }}>
                <FishImg name={f.name} style={{ maxWidth: '90%', maxHeight: 150, objectFit: 'contain', filter: `drop-shadow(0 4px 18px ${rarityColor}66)` }} />
              </div>

              <p className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: rarityColor, textAlign: 'center', lineHeight: 1.2, marginBottom: '0.7rem' }}>
                {f.name}
              </p>

              {/* Captain's Note — fun_fact restyled as a logbook entry.
                  Warm sepia tone, italic serif (Georgia falls back gracefully
                  if no custom font), leading "Captain's note —" prefix in
                  small caps + sepia. Reads like a handwritten margin note
                  on a journal page instead of a flavor caption. */}
              <div style={{
                marginBottom: '0.9rem',
                padding: '0.55rem 0.7rem 0.6rem',
                borderRadius: 8,
                background: 'rgba(194,164,122,0.06)',
                border: '1px solid rgba(194,164,122,0.18)',
                borderLeft: '2px solid rgba(194,164,122,0.55)',
              }}>
                <p style={{
                  fontFamily: 'var(--font-karla)',
                  fontSize: '0.48rem',
                  fontWeight: 700,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'rgba(194,164,122,0.7)',
                  marginBottom: 4,
                }}>
                  Captain's Note
                </p>
                <p style={{
                  fontFamily: 'Georgia, "Times New Roman", serif',
                  fontSize: '0.82rem',
                  fontStyle: 'italic',
                  fontWeight: 400,
                  color: 'rgba(228,212,180,0.86)',
                  lineHeight: 1.55,
                }}>
                  &ldquo;{f.fun_fact}&rdquo;
                </p>
              </div>

              <div className="flex items-center justify-between" style={{
                gap: 12, paddingTop: '0.7rem',
                borderTop: `1px solid ${rarityColor}25`,
              }}>
                <p className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#f0c040' }}>
                  {f.sell_value.toLocaleString()} ⟡
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
                  {pb != null && (
                    <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#9a8870', letterSpacing: '0.04em', textAlign: 'right' }}>
                      Largest you&apos;ve caught: <span className="font-cinzel font-700" style={{ color: '#e6dcc8' }}>{formatFishLength(pb)}</span>
                    </p>
                  )}
                  {totalCaught != null && totalCaught > 0 && (
                    <p className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#9a8870', letterSpacing: '0.04em', textAlign: 'right' }}>
                      Total caught: <span className="font-cinzel font-700" style={{ color: '#e6dcc8' }}>{totalCaught.toLocaleString()}</span>
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })()}
      </PopupShell>

      {/* ── Gear drawer ── */}
      <AnimatePresence onExitComplete={() => setGearMounted(false)}>
        {gearOpen && (
          <motion.div key="gear-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...gearDrawerDrag.motionProps}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              // Fixed height (not content-sized) so switching Loadout/Shop/Stats
              // doesn't resize the drawer — the tallest tab sets it, shorter tabs
              // scroll within the same box.
              height: '82vh', overflowY: 'auto', overscrollBehavior: 'contain',
              willChange: 'transform',
            }}
          >
            <DrawerHandle dragHandleProps={gearDrawerDrag.handleProps} />
            <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Gear &amp; Shop</p>
              <DrawerClose onClick={() => setGearOpen(false)} />
            </div>
            {!gearMounted ? (
              <div className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6a6764', fontSize: '0.7rem' }}>
                Opening the locker…
              </div>
            ) : (
            <GearScreen
              autoOpenAppearance={gearAutoAppearance}
              onAppearanceAutoOpened={() => setGearAutoAppearance(false)}
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelectBait={setSelectedBait}
              equippedRodTier={equippedRodTier}
              ownedRods={ownedRods}
              onEquipRod={handleEquipRod}
              completionistEffects={completionistEffects}
              hasForgedBefore={hasForgedBefore}
              onCompletionistEffectsChange={async (tiers) => {
                const prev = completionistEffects
                setCompletionistEffects(tiers) // optimistic
                const res = await saveCompletionistEffects(tiers)
                if ('error' in res) { setCompletionistEffects(prev); return { error: res.error } }
                setCompletionistEffects(res.completionistEffects)
                if (res.firstForge) setForgeFlourish(true)
                // After any committed forge the free first forge is spent.
                if (res.completionistEffects.length > 0) setHasForgedBefore(true)
                if (res.charged) {
                  setDoubloons(res.newDoubloons)
                  window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.newDoubloons }))
                }
                return { ok: true as const }
              }}
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
              onSellRod={async (tier) => {
                // 65% quick-sell. Server allows selling the equipped
                // rod too — when it does, it auto-equips Bamboo
                // (tier 0) and returns the new rodTier so the client
                // can mirror the swap. For a non-equipped sell, the
                // returned rodTier just matches the current one.
                const res = await sellRod(tier)
                if ('error' in res) return
                setOwnedRods(res.ownedRods)
                setDoubloons(res.doubloons)
                setEquippedRodTier(res.rodTier)
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
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
              equippedBadges={localEquippedBadges}
              unlockedCharacterColors={localUnlockedColors}
              unlockedBadges={unlockedBadges}
              onUpdateColor={async (colorId) => {
                setLocalCharacterColor(colorId)
                await updateCharacterColor(colorId)
              }}
              onBuyColor={async (colorId) => {
                const res = await purchaseCharacterColor(colorId)
                if ('error' in res) return { error: res.error }
                setLocalUnlockedColors(res.unlockedColors)
                setDoubloons(res.doubloons)
                setGems(res.gems)
                window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
                setLocalCharacterColor(colorId) // wear it right away
                await updateCharacterColor(colorId)
                return { ok: true }
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
              gems={gems}
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
                  if (typeof res.doubloons === 'number') {
                    setDoubloons(res.doubloons)
                    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                  }
                  if (typeof res.gems === 'number') {
                    setGems(res.gems)
                    window.dispatchEvent(new CustomEvent('gems-changed', { detail: res.gems }))
                  }
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
              equippedPet={equippedPet}
              unlockedPets={unlockedPets}
              onEquipPet={async (id) => {
                // The PET picks its slot, not the caller — a bow pet seats at
                // the bow and leaves the stern pet where it is, which is the
                // whole reason two can ride at once. Unequip (null) always
                // means the stern slot; the bow pet is cleared by tapping it.
                const slot = petSlot(getPet(id)) ?? 'stern'
                if (slot === 'bow') {
                  setEquippedPetBow(prev => (prev === id ? null : id))
                  await equipPet(equippedPetBow === id ? null : id, 'bow')
                  return
                }
                setEquippedPet(id)
                onPetStateChange?.(id, unlockedPets)
                await equipPet(id, 'stern')
              }}
              hasTideTurner={hasTideTurner}
              tideTurnerSkipsLeft={tideTurnerSkipsLeft}
              hasPhantomHook={hasPhantomHook}
              hasAutoCaster={ownedAutoCaster}
              hasAutoCatcher={ownedAutoCatcher}
              gauntletDeepest={gauntletDeepest}
              hasPerfectedSigil={hasPerfectedSigil}
              fishingLevel={fishingLevel}
              zoneGoldenBoostPct={goldenBoostPct(goldenBoosts[initialZone] ?? 0)}
              isPremium={isPremium}
              equippedSpecial={equippedSpecial}
              equippedSpecial2={equippedSpecial2}
              hasDeepReel={hasDeepReel}
              hasAnglersPatience={hasAnglersPatience}
              anglersPatienceXp={anglersPatienceXp}
              onEquipSpecial2={async (id) => {
                // Optimistic, then reconciled: the server is the authority on
                // whether the slot is open and whether this item may sit in it.
                const prev = equippedSpecial2
                setEquippedSpecial2(id)
                const res = await equipSecondSpecial(id)
                if (!res.ok) setEquippedSpecial2(prev)
              }}
              onEquipSpecial={async (itemId) => {
                setEquippedSpecial(itemId)
                await equipSpecialItem(itemId)
              }}
              onBuySpecialItem={async (itemId) => {
                const res = await buySpecialItem(itemId)
                if ('ok' in res) {
                  // Only the base Auto Caster is doubloon-bought here; its
                  // upgrade is a Fathoms purchase in the Gauntlet's Locker.
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
              showWaitTimer={showWaitTimer}
              onToggleShowWaitTimer={updateShowWaitTimer}
              onClose={() => setGearOpen(false)}
            />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── First-forge flourish ──
          A one-time celebration the first time the player ever fuses an effect
          into the Completionist. Portaled to body so it sits above the gear
          screen; auto-dismisses (timer above) or on tap. */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {forgeFlourish && (
            <motion.div
              key="forge-flourish"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              data-any-key
              onClick={() => setForgeFlourish(false)}
              style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: 'radial-gradient(ellipse at center, rgba(22,15,4,0.88) 0%, rgba(4,6,10,0.95) 100%)',
                backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
                padding: '2rem', textAlign: 'center', cursor: 'pointer',
              }}
            >
              {/* Expanding gold rings behind the rod. */}
              {[0, 0.12, 0.24].map((d, i) => (
                <motion.div key={i} aria-hidden
                  initial={{ scale: 0, opacity: 0.85 }}
                  animate={{ scale: 4.2, opacity: 0 }}
                  transition={{ duration: 1.3, ease: 'easeOut', delay: 0.15 + d }}
                  style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', border: '2px solid rgba(243,217,138,0.7)', boxShadow: '0 0 22px rgba(243,217,138,0.6)' }}
                />
              ))}
              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: -12 }}
                animate={{ scale: [0, 1.2, 1], opacity: 1, rotate: 0 }}
                transition={{ duration: 0.7, ease: 'easeOut', times: [0, 0.6, 1] }}
                style={{ position: 'relative', marginBottom: '1.1rem' }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/rod_completionist_thumb.png" alt="Completionist Rod" width={220} height={220}
                  style={{ width: 220, height: 220, objectFit: 'contain', filter: 'drop-shadow(0 0 12px rgba(242,109,109,0.65)) drop-shadow(0 0 20px rgba(90,169,240,0.5)) drop-shadow(0 0 30px rgba(87,208,106,0.45)) drop-shadow(0 0 44px rgba(242,193,78,0.55))' }} />
              </motion.div>
              <motion.p className="font-cinzel font-700"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
                style={{
                  fontSize: '1.85rem', lineHeight: 1.1, marginBottom: '0.6rem',
                  background: 'linear-gradient(180deg, #fff6d8 0%, #e6b85a 55%, #a87a2e 100%)',
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  filter: 'drop-shadow(0 0 18px rgba(245,205,110,0.5))',
                }}
              >
                Rod Forged
              </motion.p>
              <motion.p className="font-karla"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
                style={{ fontSize: '0.86rem', color: '#cdbfa0', maxWidth: 320, lineHeight: 1.5, marginBottom: '1.4rem' }}
              >
                Your Completionist Rod takes in its first borrowed gift. Fold in up to three, swap them however the seas demand, and the rod is never the worse for it.
              </motion.p>
              <motion.span className="font-karla font-700 uppercase"
                initial={{ opacity: 0 }} animate={{ opacity: 0.55 }} transition={{ delay: 1.15 }}
                style={{ fontSize: '0.64rem', letterSpacing: '0.2em', color: '#8a7a55' }}
              >
                Tap to continue
              </motion.span>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}

      {/* ── Bait panel ── */}
      <AnimatePresence>
        {baitOpen && (
          <motion.div key="bait-panel"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...baitDrawerDrag.motionProps}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
              willChange: 'transform',
            }}
          >
            <DrawerHandle dragHandleProps={baitDrawerDrag.handleProps} />
            <div className="flex items-center justify-between mb-4" style={{ paddingTop: '0.75rem' }}>
              <p className="font-karla font-700 uppercase tracking-[0.14em]"
                style={{ fontSize: '0.6rem', color: '#6a6764' }}>Bait</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Fathom balance — the premium lures buy with these. */}
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#5fd0c0" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3v6" /><circle cx="12" cy="14" r="5" /><path d="M12 19v2" /></svg>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.85rem', color: '#a9ede2' }}>{fathoms.toLocaleString()}</span>
                </span>
                <DrawerClose onClick={() => setBaitOpen(false)} />
              </div>
            </div>
            <BaitSelector
              baitInventory={baitInventory}
              selectedBait={selectedBait}
              onSelect={setSelectedBait}
              onBuy={(type) => { setConfirmQty(10); setConfirmBait(type) }}
              buyingType={buyingBait}
              fathoms={fathoms}
              onBuyLure={handleBuyLure}
              buyingLure={buyingLure}
              lureBought={lureBought}
            />
            <p className="font-karla font-600 text-center" style={{ fontSize: '0.66rem', color: '#6a6764', marginTop: 10 }}>
              Tap a bait to use it · buy with ⟡, or premium lures with Fathoms
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bait purchase confirm modal ── pick a quantity, see the total,
          confirm. Portaled above the bait panel. */}
      {confirmBait && typeof document !== 'undefined' && (() => {
        const bait = getBait(confirmBait)
        const total = bait.shopCost * confirmQty
        const canAfford = doubloons >= total
        const isBuying = buyingBait === confirmBait
        const QTYS = [10, 25, 50, 100]
        return createPortal(
          <div
            onClick={() => { if (!isBuying) setConfirmBait(null) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 100001,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
              background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%', maxWidth: 320, borderRadius: 18,
                background: 'linear-gradient(180deg, rgba(12,20,30,0.98) 0%, rgba(6,12,20,0.98) 100%)',
                border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                padding: '1.15rem 1.15rem 1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                {bait.imageUrl
                  ? <img src={bait.imageUrl} alt="" style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0 }} />
                  : <div style={{ width: 16, height: 16, borderRadius: '50%', background: bait.color, flexShrink: 0 }} />
                }
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.08rem', color: '#f0ede8', lineHeight: 1.1 }}>{bait.name}</p>
                  <p className="font-karla font-600" style={{ fontSize: '0.72rem', color: '#8a8680' }}>{bait.shopCost} ⟡ each</p>
                </div>
              </div>

              <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: '#7a7672', marginBottom: 8 }}>How many?</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 14 }}>
                {QTYS.map(q => {
                  const sel = confirmQty === q
                  return (
                    <button
                      key={q}
                      onClick={() => setConfirmQty(q)}
                      className="font-karla font-700 tap"
                      style={{
                        padding: '0.6rem 0', borderRadius: 10, fontSize: '0.86rem',
                        background: sel ? `${bait.color}22` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${sel ? bait.color : 'rgba(255,255,255,0.12)'}`,
                        color: sel ? bait.color : '#c8c4be', cursor: 'pointer',
                      }}
                    >
                      ×{q}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: canAfford ? 16 : 8 }}>
                <span className="font-karla font-600" style={{ fontSize: '0.82rem', color: '#9a9690' }}>Total</span>
                <span className="font-cinzel font-700" style={{ fontSize: '1.2rem', color: canAfford ? '#f0c040' : '#d07a7a' }}>{total.toLocaleString()} ⟡</span>
              </div>
              {!canAfford && (
                <p className="font-karla font-600 text-center" style={{ fontSize: '0.7rem', color: '#d07a7a', marginBottom: 12 }}>
                  Not enough doubloons for that many.
                </p>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setConfirmBait(null)}
                  disabled={isBuying}
                  className="font-karla font-700 uppercase tracking-[0.08em] tap"
                  style={{ flex: 1, padding: '0.72rem 0', borderRadius: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#c8c4be', fontSize: '0.76rem', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleBuyBait(confirmBait, confirmQty)}
                  disabled={!canAfford || isBuying}
                  className="font-karla font-700 uppercase tracking-[0.08em] tap"
                  style={{
                    flex: 1.4, padding: '0.72rem 0', borderRadius: 12, fontSize: '0.76rem',
                    background: canAfford ? 'linear-gradient(180deg, rgba(96,165,250,0.34) 0%, rgba(59,130,246,0.18) 100%)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${canAfford ? 'rgba(96,165,250,0.7)' : 'rgba(255,255,255,0.1)'}`,
                    color: canAfford ? '#bfdbff' : '#5a5654',
                    cursor: canAfford && !isBuying ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isBuying ? 'Buying…' : `Buy ×${confirmQty}`}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      })()}

      {/* ── Active event details drawer ── */}
      <AnimatePresence>
        {eventInfoOpen && activeEvent && (() => {
          const def = EVENT_DEFS[activeEvent.type]
          return (
            <motion.div key="event-info-drawer"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              {...eventInfoDrawerDrag.motionProps}
              style={{
                position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
                background: `linear-gradient(180deg, ${def.tint} 0%, rgba(6,12,20,0.99) 40%), #06101a`,
                borderTop: `1px solid ${def.color}55`,
                borderRadius: '18px 18px 0 0',
                padding: '0 1.15rem 2rem',
                maxHeight: '70vh', overflowY: 'auto', overscrollBehavior: 'contain',
                willChange: 'transform',
              }}
            >
              <DrawerHandle dragHandleProps={eventInfoDrawerDrag.handleProps} />
              <div className="flex items-start justify-between mb-3" style={{ paddingTop: '0.75rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: 5 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: def.color, boxShadow: `0 0 8px ${def.color}`, flexShrink: 0 }} />
                    <p className="font-karla font-700 uppercase tracking-[0.18em]" style={{ fontSize: '0.58rem', color: def.color }}>Fishing Event</p>
                  </div>
                  <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f2efe9', lineHeight: 1.1 }}>
                    {def.name}
                  </p>
                </div>
                <DrawerClose onClick={() => setEventInfoOpen(false)} />
              </div>
              <div style={{
                borderRadius: 14, padding: '0.7rem 0.85rem', marginBottom: 12,
                background: `${def.color}12`, border: `1px solid ${def.color}33`,
              }}>
                <p className="font-karla font-700" style={{ fontSize: '0.72rem', color: def.color, letterSpacing: '0.02em' }}>
                  {def.tagline}
                </p>
              </div>
              <p className="font-karla" style={{ fontSize: '0.82rem', color: 'rgba(240,237,232,0.82)', lineHeight: 1.5 }}>
                {def.detail}
              </p>
              <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(240,237,232,0.42)', fontStyle: 'italic', marginTop: 12 }}>
                Events roll in on their own and last a couple of minutes. Make the most of it while it&apos;s up.
              </p>
            </motion.div>
          )
        })()}
      </AnimatePresence>

      {/* ── Daily challenge drawer ── */}
      <AnimatePresence>
        {dailyOpen && (
          <motion.div key="daily-drawer"
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...dailyDrawerDrag.motionProps}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              // Warm timber, not cold navy — the badges-page palette (2026-07
              // warmth pass); this drawer is a claim list, same as that page.
              background: 'linear-gradient(180deg, rgba(30,22,10,0.98) 0%, rgba(16,11,6,0.99) 100%)',
              borderTop: '1px solid rgba(196,169,106,0.3)',
              borderRadius: '18px 18px 0 0',
              padding: '0 1rem 2rem',
              maxHeight: '75vh', overflowY: 'auto', overscrollBehavior: 'contain',
              willChange: 'transform',
            }}
          >
            <DrawerHandle dragHandleProps={dailyDrawerDrag.handleProps} />
            <div className="flex items-start justify-between mb-3" style={{ paddingTop: '0.75rem' }}>
              <div>
                <p className="font-karla font-700 uppercase tracking-[0.20em]"
                  style={{ fontSize: '0.6rem', color: '#c4a96a', marginBottom: 4 }}>Captain&rsquo;s Log</p>
                <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', lineHeight: 1.1, marginBottom: 5 }}>
                  Daily Challenges
                </p>
                {/* The italic subtitle used to sit here restating the title in
                    prettier words. Four lines of chrome over a three item list
                    is why the drawer read top-heavy, so the countdown now
                    carries the only fact the header actually owes the player:
                    how long is left. */}
                <DailyResetCountdown />
              </div>
              <DrawerClose onClick={() => setDailyOpen(false)} />
            </div>

            <div className="flex flex-col" style={{ gap: 8 }}>
              {/* The three coin challenges. The Master slot renders BELOW the
                  sweep strip, because the sweep is what these three add up to
                  and Master is deliberately outside it. */}
              {dailyChallenges.slice(0, 3).map((challenge: DailyChallenge, i) => {
                const progress   = dailyProgress[i]
                const claimed    = dailyClaimed[i]
                const done       = progress >= challenge.target
                const isClaiming = claimingDaily === i
                const pct        = Math.min(progress / challenge.target, 1)
                const rank       = ['I', 'II', 'III'][i]
                const tier       = ['Easy', 'Medium', 'Hard'][i]
                // ONE accent for the whole drawer. This used to run three
                // competing accents (sand / gold / crimson) at full card
                // width, so nothing led and the hard row read as an error
                // state. Difficulty now survives only in the rank numeral's
                // tint, which is about a tenth of the surface area, and the
                // reward figure does the rest of the telling.
                const rankTint = i === 0 ? 'rgba(206,186,133,0.9)'
                               : i === 1 ? 'rgba(240,192,64,0.95)'
                               :           'rgba(226,133,96,0.95)'

                return (
                  <div key={i} style={{
                    position: 'relative', overflow: 'hidden',
                    borderRadius: 12,
                    // Solid base under the tint, never tint alone: this drawer
                    // sits over the live fishing scene.
                    background: claimed ? '#101408' : '#150f08',
                    border: `1px solid ${claimed ? 'rgba(123,191,123,0.30)' : done ? 'rgba(240,192,64,0.42)' : 'rgba(196,169,106,0.18)'}`,
                    borderTop: `1px solid ${claimed ? 'rgba(123,191,123,0.45)' : done ? 'rgba(240,192,64,0.66)' : 'rgba(196,169,106,0.30)'}`,
                  }}>
                    {/* PROGRESS IS THE CARD, not a bar tucked under it. The
                        whole tile fills left to right as you work, which uses
                        the width the old row left empty and means a finished
                        challenge is legible from across the screen without
                        needing a glow. Absolutely positioned, so animating
                        its width reflows nothing around it. */}
                    <div aria-hidden style={{
                      position: 'absolute', top: 0, bottom: 0, left: 0,
                      width: `${pct * 100}%`,
                      background: claimed
                        ? 'linear-gradient(90deg, rgba(123,191,123,0.20) 0%, rgba(123,191,123,0.07) 100%)'
                        : 'linear-gradient(90deg, rgba(240,192,64,0.20) 0%, rgba(240,192,64,0.06) 100%)',
                      borderRight: pct > 0 && pct < 1
                        ? '1px solid rgba(240,192,64,0.5)'
                        : 'none',
                      transition: 'width 0.45s cubic-bezier(0.32,0.72,0,1)',
                    }} />

                    <div style={{
                      position: 'relative',
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '0.7rem 0.75rem 0.7rem 0.85rem',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="flex items-center" style={{ gap: 6, marginBottom: 3 }}>
                          <span className="font-cinzel font-700" style={{
                            fontSize: '0.68rem', lineHeight: 1, color: rankTint,
                          }}>{rank}</span>
                          <span className="font-karla font-800 uppercase" style={{
                            fontSize: '0.55rem', letterSpacing: '0.16em',
                            color: claimed ? 'rgba(240,237,232,0.35)' : 'rgba(230,215,180,0.5)',
                          }}>{tier}</span>
                        </div>
                        {/* The task leads now. The reward used to be set at
                            1.1rem in glowing gold while the thing you had to
                            DO sat under it at 0.88, so the card announced its
                            price before its point. */}
                        <p className="font-karla font-600" style={{
                          fontSize: '0.92rem', lineHeight: 1.25,
                          color: claimed ? '#8f8d86' : '#f0ede8',
                          marginBottom: 4,
                        }}>
                          {challenge.label}
                        </p>
                        <p className="font-karla font-700 tabular-nums" style={{
                          fontSize: '0.68rem', lineHeight: 1,
                          color: claimed ? '#6f7566' : done ? '#f0c040' : '#9a9488',
                        }}>
                          {done && !claimed
                            ? 'Ready to claim'
                            : `${progress.toLocaleString()} of ${challenge.target.toLocaleString()}`}
                        </p>
                      </div>

                      {/* ONE SLOT, THREE STATES. The reward chip, the claim
                          button and the claimed stamp all live in the same
                          fixed 86px box, so finishing a challenge never
                          changes the card's height and never shoves the rows
                          below it down the drawer. The old layout mounted the
                          button into flow and animated the reward's font-size,
                          so the whole list jumped on every claim. */}
                      <div style={{ width: 86, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                        {claimed ? (
                          <span className="font-cinzel font-800 uppercase" style={{
                            display: 'inline-block', transform: 'rotate(-7deg)',
                            padding: '0.2rem 0.45rem', borderRadius: 4,
                            border: '2px solid #7bbf7b', color: '#7bbf7b', opacity: 0.9,
                            fontSize: '0.54rem', letterSpacing: '0.12em',
                          }}>
                            Claimed
                          </span>
                        ) : done ? (
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                            onClick={() => { hapticTap(); handleClaimDaily(i as 0 | 1 | 2) }}
                            disabled={isClaiming}
                            className="font-karla font-800 uppercase"
                            style={{
                              width: '100%',
                              fontSize: '0.68rem', letterSpacing: '0.08em',
                              padding: '0.5rem 0.2rem', borderRadius: 9,
                              background: 'rgba(240,192,64,0.18)',
                              border: '1px solid rgba(240,192,64,0.62)',
                              color: '#f4cd63',
                              opacity: isClaiming ? 0.5 : 1,
                              cursor: isClaiming ? 'default' : 'pointer',
                              touchAction: 'manipulation',
                            }}
                          >
                            {isClaiming ? 'Claiming' : 'Claim'}
                          </motion.button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                            <span className="font-cinzel font-700 tabular-nums" style={{
                              fontSize: '1rem', lineHeight: 1, color: '#d9b45a',
                            }}>
                              {challenge.reward.toLocaleString()}
                            </span>
                            <span className="font-cinzel font-700" style={{
                              fontSize: '0.68rem', lineHeight: 1, color: '#d9b45a',
                            }}>&#10209;</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* ── The sweep bonus ──────────────────────────────────────────
                  Clear all three, then claim the gems. It sits below the three
                  so it reads as what they add up to rather than as a fourth
                  task. The gems used to pay themselves the instant the third
                  challenge was claimed, which landed them in the same moment as
                  a doubloon reward and made them easy to miss entirely.    */}
              {(() => {
                // Only the three coin challenges count. The optional Master
                // challenge must never gate this.
                const claimedCount = dailyClaimed.slice(0, 3).filter(Boolean).length
                const swept = sweepClaimed
                const ready = claimedCount === 3 && !swept
                return (
                  <motion.div
                    // The pop fires only on the claim that completed the set.
                    animate={sweepAward ? { scale: [1, 1.035, 1] } : { scale: 1 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                    onAnimationComplete={() => { if (sweepAward) setSweepAward(false) }}
                    style={{
                      // Purple for gems, the way gold means doubloons on the
                      // cards above, so the different currency reads instantly.
                      background: swept || ready
                        ? 'linear-gradient(90deg, rgba(167,139,250,0.18) 0%, rgba(167,139,250,0.05) 60%), #120d07'
                        : 'linear-gradient(180deg, rgba(167,139,250,0.07) 0%, rgba(167,139,250,0.02) 100%), #120d07',
                      border: `1px solid ${swept || ready ? 'rgba(167,139,250,0.45)' : 'rgba(167,139,250,0.18)'}`,
                      borderTop: `1px solid ${swept || ready ? 'rgba(167,139,250,0.7)' : 'rgba(167,139,250,0.30)'}`,
                      borderRadius: 12,
                      padding: '0.7rem 0.95rem',
                      marginTop: 2,
                    }}
                  >
                    <div className="flex items-center justify-between" style={{ gap: 10 }}>
                      <div style={{ minWidth: 0 }}>
                        <p className="font-karla font-800 uppercase" style={{
                          fontSize: '0.58rem', letterSpacing: '0.18em',
                          color: swept ? GEM_COLOR : 'rgba(167,139,250,0.75)',
                          marginBottom: 3,
                        }}>
                          Full Docket
                        </p>
                        <p className="font-karla font-600" style={{
                          fontSize: '0.8rem', color: swept ? '#c9c3d8' : '#c8c4bc', lineHeight: 1.3,
                        }}>
                          {swept
                            ? 'Gems are in the hold.'
                            : ready
                              ? 'All three cleared. Take the gems.'
                              : 'Clear all three to open this.'}
                        </p>
                      </div>
                      {/* Same fixed 86px slot as the reward chips above, so the
                          gem figure lands on the identical right margin and
                          the drawer keeps one clean vertical edge. */}
                      {/* Same fixed 86px slot the reward chips above use, and
                          the same one-slot-three-states rule: the figure
                          becomes the Claim button in place, so the strip never
                          changes height when the set completes. */}
                      <div style={{ width: 86, flexShrink: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 3 }}>
                        {ready ? (
                          <motion.button
                            whileTap={{ scale: 0.94 }}
                            transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                            onClick={handleClaimSweep}
                            disabled={claimingSweep}
                            className="font-karla font-800 uppercase"
                            style={{
                              width: '100%', fontSize: '0.68rem', letterSpacing: '0.08em',
                              padding: '0.5rem 0.2rem', borderRadius: 9,
                              background: 'rgba(167,139,250,0.2)',
                              border: `1px solid ${GEM_COLOR}`,
                              color: '#c4b5fd',
                              opacity: claimingSweep ? 0.5 : 1,
                              cursor: claimingSweep ? 'default' : 'pointer',
                              touchAction: 'manipulation',
                            }}
                          >
                            {claimingSweep ? 'Claiming' : 'Claim'}
                          </motion.button>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                            <span className="font-cinzel font-700 tabular-nums" style={{
                              fontSize: '1rem', lineHeight: 1,
                              color: swept ? GEM_COLOR : 'rgba(167,139,250,0.6)',
                            }}>
                              +{DAILY_SWEEP_GEMS}
                            </span>
                            <span className="font-cinzel font-700" style={{
                              fontSize: '0.68rem', lineHeight: 1,
                              color: swept ? GEM_COLOR : 'rgba(167,139,250,0.6)',
                            }}>
                              {GEM_GLYPH}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {!swept && (
                      <div className="flex items-center" style={{ gap: 7, marginTop: 7 }}>
                        {/* Three pips: which of the day's claims are in. */}
                        <div style={{ display: 'flex', gap: 4 }}>
                          {[0, 1, 2].map(i => (
                            <span key={i} aria-hidden style={{
                              width: 7, height: 7, borderRadius: 999,
                              background: dailyClaimed[i] ? GEM_COLOR : 'rgba(255,255,255,0.13)',
                              boxShadow: dailyClaimed[i] ? 'none' : 'inset 0 1px 2px rgba(0,0,0,0.5)',
                            }} />
                          ))}
                        </div>
                        <p className="font-karla font-700 tabular-nums" style={{
                          fontSize: '0.66rem', color: '#8d8a96', lineHeight: 1,
                        }}>
                          {claimedCount} of 3 claimed
                        </p>
                      </div>
                    )}
                  </motion.div>
                )
              })()}

              {/* ── MASTER ───────────────────────────────────────────────────
                  The optional fourth task, unlocked at Fishing 75 (the level
                  that opens the Ancient Deep). It sits BELOW the sweep strip
                  on purpose: the sweep means the three above it, and a high
                  level player is never asked to do more work for the same ten
                  gems. Its own copper accent, because gold already means
                  doubloons on the cards above and purple means gems on the
                  strip, and this pays neither.                            */}
              {dailyChallenges[3] && (() => {
                const challenge = dailyChallenges[3]
                const progress  = dailyProgress[3] ?? 0
                const claimed   = dailyClaimed[3] ?? false
                const done      = progress >= challenge.target
                const isClaiming = claimingDaily === 3
                const pct = Math.min(progress / challenge.target, 1)
                const COPPER = '#c98a55'

                return (
                  <div style={{ marginTop: 6 }}>
                    <div className="flex items-center" style={{ gap: 8, marginBottom: 6 }}>
                      <span aria-hidden style={{ flex: 1, height: 1, background: 'rgba(196,169,106,0.16)' }} />
                      <span className="font-karla font-800 uppercase" style={{
                        fontSize: '0.53rem', letterSpacing: '0.2em', color: 'rgba(201,138,85,0.8)',
                      }}>
                        Optional
                      </span>
                      <span aria-hidden style={{ flex: 1, height: 1, background: 'rgba(196,169,106,0.16)' }} />
                    </div>

                    <div style={{
                      position: 'relative', overflow: 'hidden', borderRadius: 12,
                      background: claimed ? '#131007' : '#160f09',
                      border: `1px solid ${claimed ? 'rgba(201,138,85,0.34)' : done ? 'rgba(201,138,85,0.55)' : 'rgba(201,138,85,0.2)'}`,
                      borderTop: `1px solid ${claimed ? 'rgba(201,138,85,0.5)' : done ? 'rgba(201,138,85,0.8)' : 'rgba(201,138,85,0.34)'}`,
                    }}>
                      <div aria-hidden style={{
                        position: 'absolute', top: 0, bottom: 0, left: 0,
                        width: `${pct * 100}%`,
                        background: 'linear-gradient(90deg, rgba(201,138,85,0.22) 0%, rgba(201,138,85,0.06) 100%)',
                        borderRight: pct > 0 && pct < 1 ? '1px solid rgba(201,138,85,0.55)' : 'none',
                        transition: 'width 0.45s cubic-bezier(0.32,0.72,0,1)',
                      }} />

                      <div style={{
                        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
                        padding: '0.7rem 0.75rem 0.7rem 0.85rem',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="flex items-center" style={{ gap: 6, marginBottom: 3 }}>
                            <span className="font-cinzel font-700" style={{ fontSize: '0.68rem', lineHeight: 1, color: COPPER }}>IV</span>
                            <span className="font-karla font-800 uppercase" style={{
                              fontSize: '0.55rem', letterSpacing: '0.16em', color: 'rgba(201,138,85,0.85)',
                            }}>
                              Master
                            </span>
                          </div>
                          <p className="font-karla font-600" style={{
                            fontSize: '0.92rem', lineHeight: 1.25,
                            color: claimed ? '#8f8d86' : '#f0ede8', marginBottom: 4,
                          }}>
                            {challenge.label}
                          </p>
                          <p className="font-karla font-700 tabular-nums" style={{
                            fontSize: '0.68rem', lineHeight: 1,
                            color: claimed ? '#6f7566' : done ? COPPER : '#9a9488',
                          }}>
                            {claimed
                              ? 'Crate hauled up'
                              : done
                                ? 'Ready to claim'
                                : `${progress.toLocaleString()} of ${challenge.target.toLocaleString()}`}
                          </p>
                        </div>

                        <div style={{ width: 86, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                          {claimed ? (
                            <span className="font-cinzel font-800 uppercase" style={{
                              display: 'inline-block', transform: 'rotate(-7deg)',
                              padding: '0.2rem 0.45rem', borderRadius: 4,
                              border: `2px solid ${COPPER}`, color: COPPER, opacity: 0.9,
                              fontSize: '0.54rem', letterSpacing: '0.12em',
                            }}>
                              Claimed
                            </span>
                          ) : done ? (
                            <motion.button
                              whileTap={{ scale: 0.94 }}
                              transition={{ type: 'spring', stiffness: 620, damping: 26 }}
                              onClick={() => { hapticTap(); handleClaimDaily(3) }}
                              disabled={isClaiming}
                              className="font-karla font-800 uppercase"
                              style={{
                                width: '100%', fontSize: '0.68rem', letterSpacing: '0.08em',
                                padding: '0.5rem 0.2rem', borderRadius: 9,
                                background: 'rgba(201,138,85,0.2)',
                                border: `1px solid ${COPPER}`,
                                color: '#e3a672',
                                opacity: isClaiming ? 0.5 : 1,
                                cursor: isClaiming ? 'default' : 'pointer',
                                touchAction: 'manipulation',
                              }}
                            >
                              {isClaiming ? 'Hauling' : 'Claim'}
                            </motion.button>
                          ) : (
                            <span className="font-cinzel font-700" style={{
                              fontSize: '0.82rem', lineHeight: 1, color: 'rgba(201,138,85,0.75)',
                            }}>
                              Crate
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* The crate opens right here, using the same moment the
                        reel-in crate and the Tavern's weekly crate use. This
                        used to be a line of text naming the drop, which was
                        the weakest crate in the game by a distance. */}
                    <AnimatePresence>
                      {masterCrate && (
                        <motion.div
                          key="master-crate"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          style={{
                            marginTop: 8, borderRadius: 12, padding: '0.9rem 0.8rem 0.8rem',
                            background: '#0d0f14',
                            border: '1px solid rgba(201,138,85,0.28)',
                          }}
                        >
                          <CrateOpening
                            tier={masterCrate.tier}
                            loot={masterCrate.loot}
                            headline="The tide paid out a"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sell drawer merged into the Fish Hold drawer — see the "Sell
          Lanes" section there. */}

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

      {/* ── YOLO Rod jackpot — full-screen dopamine hit before the result
            card lands. Auto-dismisses; tap anywhere to skip. */}
      <AnimatePresence>
        {jackpotBoom && (
          <JackpotBoomOverlay
            key="jackpot-boom"
            qty={jackpotBoom.qty}
            onDone={() => setJackpotBoom(null)}
          />
        )}
      </AnimatePresence>


      {/* ── Ancient giant slain — full-screen cinematic over the result card.
            Fires only for the 6 trophies, once each. Tap to skip. When it clears,
            it hands off to Finn's cutscene for that giant (if any). */}
      <AnimatePresence>
        {ancientCinematic && (
          <AncientSlainCinematic
            key="ancient-slain"
            fish={ancientCinematic.fish}
            count={ancientCinematic.count}
            total={ancientCinematic.total}
            isMegalodon={ancientCinematic.isMegalodon}
            onDone={() => {
              const beat = ancientCinematic?.finnBeat ?? null
              setAncientCinematic(null)
              if (beat) setFinnAncientScene(beat)
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Finn reacts to the giant — cinematic one-hander, plays right after the
            slain moment. The rival keeps his mask on until Megalodon. */}
      <AnimatePresence>
        {finnAncientScene && (
          <FinnScene
            key="finn-ancient"
            beat={finnAncientScene}
            onComplete={() => setFinnAncientScene(null)}
          />
        )}
      </AnimatePresence>

      {/* ── First-catch celebration — fires ONCE per account on the
            player's first successful reel-in. Welcomes the moment so
            new players feel the catch land. Server-flagged so it
            never replays. */}
      <AnimatePresence>
        {firstCatchCeleb && (
          <motion.div
            key="first-catch-celeb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={() => setFirstCatchCeleb(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'radial-gradient(ellipse at center, rgba(74,222,128,0.35) 0%, rgba(6,18,12,0.88) 65%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: '1.5rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 14 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 360, width: '100%',
                background: 'linear-gradient(180deg, #0d1a14 0%, #050a07 100%)',
                border: '1px solid rgba(74,222,128,0.55)',
                borderRadius: 22,
                padding: '1.8rem 1.4rem 1.4rem',
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 32px rgba(74,222,128,0.32)',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.2em]"
                style={{ fontSize: '0.6rem', color: 'rgba(134,239,172,0.8)', marginBottom: 8 }}>
                First Catch
              </p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '1.95rem', color: '#86efac', lineHeight: 1.1, marginBottom: 12, textShadow: '0 0 24px rgba(74,222,128,0.55)' }}>
                Welcome, Captain.
              </p>
              <p className="font-karla font-400"
                style={{ fontSize: '0.85rem', color: 'rgba(220,240,228,0.78)', lineHeight: 1.55, marginBottom: 18 }}>
                You just landed your first fish. Sell it for doubloons, or mount it to your collection to build your captain&apos;s legend.
              </p>
              <button
                type="button"
                onClick={() => setFirstCatchCeleb(false)}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{
                  width: '100%', padding: '0.85rem 0',
                  background: 'rgba(74,222,128,0.18)',
                  border: '1px solid rgba(74,222,128,0.65)',
                  color: '#86efac',
                  borderRadius: 12, fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Set Sail →
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── First Ancient Deep Catch contest winner overlay ──
          Server-atomic claim, so this only ever renders for the single
          global winner. Gold/legendary treatment to set it apart from
          the everyday first-catch celebration; foregrounds the prize
          code + points at the mail inbox for full claim instructions. */}
      <AnimatePresence>
        {firstAncientCeleb && (
          <motion.div
            key="first-ancient-celeb"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={() => setFirstAncientCeleb(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'radial-gradient(ellipse at center, rgba(240,192,64,0.42) 0%, rgba(20,12,4,0.92) 60%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', padding: '1.5rem',
            }}
          >
            <motion.div
              initial={{ scale: 0.4, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 14 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 380, width: '100%',
                background: 'linear-gradient(180deg, #1a1408 0%, #0a0703 100%)',
                border: '1px solid rgba(240,192,64,0.65)',
                borderRadius: 22,
                padding: '1.8rem 1.4rem 1.4rem',
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 48px rgba(240,192,64,0.45)',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.22em]"
                style={{ fontSize: '0.6rem', color: 'rgba(240,214,149,0.85)', marginBottom: 10 }}>
                ✦ Contest Winner ✦
              </p>
              <p className="font-cinzel font-700"
                style={{ fontSize: '1.9rem', color: '#f0d695', lineHeight: 1.1, marginBottom: 10, textShadow: '0 0 28px rgba(240,192,64,0.7)' }}>
                First in the Abyss.
              </p>
              <p className="font-karla font-400"
                style={{ fontSize: '0.85rem', color: 'rgba(232,220,188,0.82)', lineHeight: 1.55, marginBottom: 18 }}>
                You&apos;re the first captain ever to land a fish in the Ancient Deep. You&apos;ve won a <strong style={{ color: '#f0d695' }}>custom boat</strong> designed for you.
              </p>
              <div style={{
                background: 'rgba(240,192,64,0.10)',
                border: '1px dashed rgba(240,192,64,0.55)',
                borderRadius: 10,
                padding: '0.75rem 1rem',
                marginBottom: 14,
              }}>
                <p className="font-karla font-700 uppercase tracking-[0.18em]"
                  style={{ fontSize: '0.52rem', color: 'rgba(240,214,149,0.65)', marginBottom: 4 }}>
                  Prize Code
                </p>
                <p className="font-cinzel font-700"
                  style={{ fontSize: '1.25rem', color: '#f0d695', letterSpacing: '0.12em' }}>
                  ANCIENT-FIRST
                </p>
              </div>
              <p className="font-karla font-400"
                style={{ fontSize: '0.74rem', color: 'rgba(200,184,144,0.7)', lineHeight: 1.5, marginBottom: 18 }}>
                Check your inbox for claim instructions. The code + the mail confirm you as the winner.
              </p>
              <button
                type="button"
                onClick={() => setFirstAncientCeleb(false)}
                className="font-karla font-700 uppercase tracking-[0.12em]"
                style={{
                  width: '100%', padding: '0.85rem 0',
                  background: 'rgba(240,192,64,0.20)',
                  border: '1px solid rgba(240,192,64,0.7)',
                  color: '#f0d695',
                  borderRadius: 12, fontSize: '0.78rem',
                  cursor: 'pointer',
                }}
              >
                Claim Your Prize
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Leave-while-casting confirm ──
            Fires when the mid-cast exit guard above intercepts a nav
            attempt (link tap / Back button) while bait is in-flight. The
            server already deducted the bait at castLine time; leaving
            doesn't refund it (and breaks the perfect streak on the next
            cast, since castLine clears current_perfect_streak whenever
            catch_pending is still set). The dialog frames the trade
            plainly so the player can make the call. */}
      <AnimatePresence>
        {leaveConfirmOpen && (
          <motion.div
            key="fish-leave-confirm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9100, background: 'rgba(3,7,12,0.82)', backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem' }}
          >
            <motion.div
              initial={{ y: 8, scale: 0.96 }} animate={{ y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 360, damping: 24 }}
              style={{ width: '100%', maxWidth: 320, background: '#0a131f', border: '1px solid #2a3548', borderRadius: 16, padding: '1.1rem 1.1rem 1.2rem', textAlign: 'center', boxShadow: '0 20px 50px rgba(0,0,0,0.6)' }}
            >
              <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0ede8', marginBottom: 6 }}>Leave mid-cast?</p>
              {/* Says the CONSEQUENCE, not the implementation. It used to read
                  "your perfect streak breaks on your next cast", which is how
                  the server does it: leaving sets catch_pending and the next
                  cast is what zeroes the counter. As a warning that is worse
                  than useless, because it sounds like a delay you might get out
                  of by not casting. Nothing gets you out of it. The streak is
                  already displayed as 0 the moment you come back, so this line
                  was also the only surface still calling it alive. */}
              <p className="font-karla" style={{ fontSize: '0.78rem', color: '#a8b8d0', lineHeight: 1.55, marginBottom: 14 }}>
                Your bait is already in the water. Walk away now and it&apos;s gone, and your perfect streak with it.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => { setLeaveConfirmOpen(false); pendingLeaveNavRef.current = null }}
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.06)', color: '#cfcabf', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Keep Fishing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nav = pendingLeaveNavRef.current
                    pendingLeaveNavRef.current = null
                    setLeaveConfirmOpen(false)
                    nav?.()
                  }}
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{ flex: 1, padding: '0.7rem', borderRadius: 10, border: '1px solid rgba(228,114,114,0.55)', background: 'rgba(212,84,84,0.22)', color: '#f8d2d2', fontSize: '0.78rem', cursor: 'pointer' }}
                >
                  Leave Anyway
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fishing Renown board + level-earned celebration (post-100). */}
      <RenownPanel
        open={renownOpen}
        onClose={() => setRenownOpen(false)}
        skill="fishing"
        initial={fishingRenownState}
        onChange={s => setFishingRenownAlloc(s.alloc)}
      />
      <RenownUpOverlay info={renownUpNotif} onDismiss={() => setRenownUpNotif(null)} />
      <RenownIntroOverlay
        open={renownIntro}
        skill="fishing"
        onDismiss={() => {
          setRenownIntro(false)
          setRenownIntroSeen(true)
          markRenownIntroSeen('fishing').catch(() => {})
        }}
      />

      {/* ── Low-bait warning — surfaces the moment total bait drops to 5
            or fewer (see effect that watches baitInventory). Fires once
            per downward crossing, auto-dismisses in 2.5s. Top-centered
            so the player notices without it occluding the dial. */}
      <AnimatePresence>
        {lowBaitMsg && (
          <motion.div
            key={lowBaitMsg}
            initial={{ opacity: 0, y: -8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ type: 'spring', stiffness: 380, damping: 24 }}
            style={{
              position: 'absolute', top: 64, left: '50%', transform: 'translateX(-50%)',
              zIndex: 28,
              padding: '0.5rem 0.95rem',
              borderRadius: 999,
              background: 'linear-gradient(180deg, rgba(248,113,113,0.28) 0%, rgba(120,30,30,0.85) 100%)',
              border: '1px solid rgba(248,113,113,0.6)',
              boxShadow: '0 0 18px rgba(248,113,113,0.35)',
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.66rem', color: '#fff5f5' }}>
              {lowBaitMsg}
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
          const gearUnlocks = fishingGearUnlockedBetween(levelUpNotif.from, levelUpNotif.to)
          // Crew Trawls (passive crew fishing) unlock at Fishing 25 — call it
          // out here so the level-up actually announces it; the dedicated
          // Trawls celebration then fires once this overlay is dismissed.
          const trawlsUnlocked = levelUpNotif.from < 25 && levelUpNotif.to >= 25
          return (
          <motion.div
            key="levelup"
            data-any-key
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3 } }}
            transition={{ duration: 0.25 }}
            onClick={() => { setLevelUpNotif(null); window.dispatchEvent(new CustomEvent('fishing-levelup-closed')) }}
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

              {/* ── WHAT YOU ACTUALLY GOT ───────────────────────────────────
                  This is the whole point. The overlay used to fire a full-screen
                  fireworks display around "+0.7% bite speed" -- and on four levels out
                  of five, around nothing at all -- which taught a new captain that
                  levelling up is noise. Now every level pays, and the payment leads. */}
              {levelRewards.length > 0 && (() => {
                const totalCoin = levelRewards.reduce((a, r) => a + (r.reward.doubloons ?? 0), 0)
                const totalGems = levelRewards.reduce((a, r) => a + (r.reward.gems ?? 0), 0)
                const baitTotals: Record<string, number> = {}
                for (const { reward } of levelRewards)
                  for (const [t, q] of Object.entries(reward.bait ?? {})) baitTotals[t] = (baitTotals[t] ?? 0) + q
                const holdFloor = Math.max(0, ...levelRewards.map(r => r.reward.holdFloor ?? 0))
                const milestone = levelRewards.some(r => r.reward.milestone)
                const GOLD = '#f0c040'
                const chip = (key: string, text: string, color: string) => (
                  <motion.span key={key}
                    initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.34, type: 'spring', stiffness: 340, damping: 18 }}
                    className="font-cinzel font-800"
                    style={{
                      fontSize: '0.95rem', color, padding: '0.34rem 0.8rem', borderRadius: 999,
                      background: `${color}1c`, border: `1px solid ${color}66`,
                      boxShadow: `0 0 18px ${color}33`, whiteSpace: 'nowrap',
                    }}>
                    {text}
                  </motion.span>
                )
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.3, ease: 'easeOut' }}
                    style={{ marginTop: '1.15rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}
                  >
                    <p className="font-karla font-800 uppercase tracking-[0.22em]"
                       style={{ fontSize: '0.55rem', color: milestone ? GOLD : 'rgba(255,255,255,0.55)',
                         textShadow: milestone ? `0 0 16px ${GOLD}88` : 'none' }}>
                      {levelRewards.some(r => r.level === LEVEL_REWARD_MAX)
                        ? 'The Last Reward'
                        : milestone ? 'Milestone Reward' : 'Reward'}
                    </p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', maxWidth: 320 }}>
                      {totalCoin > 0 && chip('coin', `+${totalCoin.toLocaleString()} \u27e1`, GOLD)}
                      {totalGems > 0 && chip('gems', `+${totalGems} \u25c6`, '#a78bfa')}
                      {Object.entries(baitTotals).map(([t, q]) =>
                        chip(t, `+${q} ${getBait(t).name}`, '#7fd49a'))}
                      {holdFloor > 0 && chip('hold', FISH_HOLD_TIERS[holdFloor].name, '#60a5fa')}
                    </div>
                  </motion.div>
                )
              })()}

              {/* Perks at this level — cumulative numbers so the player sees
                  where they ARE, not just the marginal gain. */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.42, duration: 0.3, ease: 'easeOut' }}
                style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
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

              {/* Crew Trawls unlock — gold callout at Fishing 25. */}
              {trawlsUnlocked && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.58, type: 'spring', stiffness: 300, damping: 18 }}
                  style={{
                    marginTop: '0.7rem',
                    padding: '0.55rem 1rem',
                    background: 'linear-gradient(180deg, rgba(240,192,64,0.22) 0%, rgba(240,192,64,0.06) 100%), #161009',
                    border: '1px solid rgba(240,192,64,0.50)',
                    borderTop: '1px solid rgba(240,192,64,0.85)',
                    borderRadius: 999,
                    boxShadow: '0 0 22px rgba(240,192,64,0.35)',
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span className="font-karla font-700 uppercase" style={{ fontSize: '0.55rem', color: '#f0c040', letterSpacing: '0.20em' }}>
                    Unlocked
                  </span>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f5ecd6', textShadow: '0 0 12px rgba(240,192,64,0.55)' }}>
                    Crew Trawls — send crew to fish
                  </span>
                </motion.div>
              )}

              {/* Gear that just cleared its Fishing-Level buy gate. */}
              <GearUnlockRow items={gearUnlocks} delay={0.62} />

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
            transition={{ type: 'tween', duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
            {...holdDrawerDrag.motionProps}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
              background: 'rgba(6,12,20,0.98)',
              borderTop: '1px solid rgba(255,255,255,0.09)',
              borderRadius: '18px 18px 0 0',
              maxHeight: '72vh',
              display: 'flex', flexDirection: 'column',
              willChange: 'transform',
            }}
          >
            {/* Non-scrollable drag zone */}
            <DrawerHandle dragHandleProps={holdDrawerDrag.handleProps} />
            <div style={{ padding: '0.75rem 1rem 0', flexShrink: 0 }}>
              {/* Header — capacity on the left with an inline Upgrade pill
                  (opens the confirm modal), total value on the right. The
                  old upgrade row that lived below the inventory is gone;
                  this is the only entry-point now. */}
              <div className="flex items-start justify-between mb-4" style={{ gap: 12 }}>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{ fontSize: '0.72rem', color: '#9a9488', marginBottom: 3 }}>Fish Hold</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.8rem', color: holdTotalCount >= holdCapacity ? '#f87171' : '#f0ede8', lineHeight: 1.1 }}>
                      {holdTotalCount} <span style={{ fontSize: '1.1rem', color: '#6a6764' }}>/ {holdCapacity}</span>
                    </p>
                    {(() => {
                      const maxTier = FISH_HOLD_TIERS.length - 1
                      const isMax = currentFishHoldTier >= maxTier
                      if (isMax) return null
                      const next = getFishHold(currentFishHoldTier + 1)
                      const canAfford = doubloons >= next.cost
                      return (
                        <button
                          type="button"
                          onClick={() => setHoldUpgradeConfirm(true)}
                          className="font-karla font-700 uppercase tracking-[0.1em]"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '0.3rem 0.65rem', borderRadius: 999,
                            background: canAfford ? 'rgba(240,192,64,0.14)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${canAfford ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.14)'}`,
                            color: canAfford ? '#f0c040' : '#7a7470',
                            fontSize: '0.58rem',
                            cursor: 'pointer',
                            opacity: canAfford ? 1 : 0.85,
                          }}
                        >
                          <svg aria-hidden width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>
                          </svg>
                          Upgrade
                        </button>
                      )
                    })()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {holdTotalValue > 0 && (
                    <div style={{ textAlign: 'right' }}>
                      <p className="font-karla font-700 uppercase tracking-[0.14em]"
                        style={{ fontSize: '0.6rem', color: '#9a9488', marginBottom: 3 }}>Worth</p>
                      <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0c040', lineHeight: 1.05 }}>
                        {holdBaseValue.toLocaleString()} ⟡
                      </p>
                    </div>
                  )}
                  <DrawerClose onClick={() => setHoldOpen(false)} />
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', flex: 1, padding: '0 1rem 2rem' }}>
              {inventory.length === 0 ? (
                <p className="font-karla font-300 text-center py-6" style={{ fontSize: '0.8rem', color: '#4a4845' }}>
                  No fish yet. Cast a line!
                </p>
              ) : (
                <>
                  {/* ── Sell lanes ──
                      One unified neutral container, three rows.
                      Old design used three differently-colored cards
                      (blue / gold / silver) that read as competing
                      categories instead of a single decision. Now: same
                      dark background for every row, payout right-
                      aligned in gold, trade-off below in muted text.
                      Tap a row to commit (Fish Market navigates, Quick
                      Sell and Liquidate expand inline for a Cancel /
                      Confirm pair).
                      Order is fast→slow / cheap→best so the trade-off
                      reads left-to-right as you scan down. */}
                  <div style={{
                    background: 'rgba(0,0,0,0.32)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}>
                    {(() => {
                      type LaneKey = 'quick' | 'liquidate' | 'market'
                      const sellingNow = sellingAll
                      const quickLossText = isFullMoon
                        ? 'Full price — Full Moon Rising'
                        : `Instant · 75% of value · you lose ${Math.floor(holdBaseValue * 0.25).toLocaleString()} ⟡`
                      const lanes: Array<{
                        key: LaneKey
                        name: string
                        payout: string
                        payoutMuted?: boolean
                        tradeoff: React.ReactNode
                        action: 'navigate' | 'confirm'
                        href?: string
                        confirmLabel?: string
                        run?: () => void | Promise<void>
                        pending?: boolean
                      }> = [
                        {
                          key: 'quick',
                          name: 'Quick Sell',
                          payout: `${holdTotalValue.toLocaleString()} ⟡`,
                          tradeoff: quickLossText,
                          action: 'confirm',
                          confirmLabel: sellingNow ? 'Selling…' : 'Sell All Now',
                          run: () => quickSellAll(),
                          pending: sellingNow,
                        },
                        {
                          key: 'liquidate',
                          name: 'Liquidate',
                          payout: `${holdLiquidateValue.toLocaleString()} ⟡`,
                          tradeoff: `Locks 90% market${isPremium ? '' : ' · 3% fee'} · settles in 1 hour`,
                          action: 'confirm',
                          confirmLabel: liquidating ? 'Submitting…' : 'Lock In Price',
                          run: () => handleLiquidate(),
                          pending: liquidating,
                        },
                        {
                          key: 'market',
                          name: 'Fish Market',
                          payout: `~${holdBaseValue.toLocaleString()} ⟡`,
                          payoutMuted: true,
                          tradeoff: 'Set per-species prices — live market updates hourly',
                          action: 'navigate',
                          href: '/tavern/market',
                        },
                      ]
                      return lanes.map((lane, idx) => {
                        const expanded = expandedSellLane === lane.key
                        const isLast = idx === lanes.length - 1
                        const onTap = () => {
                          if (lane.action === 'navigate') return
                          if (lane.key === 'market') return
                          setExpandedSellLane(expanded ? null : lane.key)
                        }
                        const rowBody = (
                          <>
                            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                              <p className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#f0ede8', lineHeight: 1.1 }}>
                                {lane.name}
                              </p>
                              <p className="font-cinzel font-700" style={{
                                fontSize: '1.05rem',
                                color: lane.payoutMuted ? 'rgba(240,192,64,0.7)' : '#f0c040',
                                lineHeight: 1,
                                whiteSpace: 'nowrap',
                              }}>
                                {lane.payout}
                                {lane.action === 'navigate' && (
                                  <span style={{ color: 'rgba(240,192,64,0.55)', fontSize: '0.85rem', marginLeft: 6 }}>↗</span>
                                )}
                              </p>
                            </div>
                            <p className="font-karla" style={{
                              fontSize: '0.7rem', color: 'rgba(255,255,255,0.55)', marginTop: 4, lineHeight: 1.35,
                            }}>
                              {lane.tradeoff}
                            </p>
                            {expanded && lane.action === 'confirm' && (
                              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setExpandedSellLane(null) }}
                                  disabled={lane.pending}
                                  className="font-karla font-700 uppercase tracking-[0.1em]"
                                  style={{
                                    flex: 1, fontSize: '0.62rem', padding: '0.6rem', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.14)',
                                    color: 'rgba(240,237,232,0.65)', cursor: 'pointer',
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); lane.run?.() }}
                                  disabled={lane.pending}
                                  className="font-karla font-700 uppercase tracking-[0.1em]"
                                  style={{
                                    flex: 2, fontSize: '0.62rem', padding: '0.6rem', borderRadius: 10,
                                    background: 'rgba(240,192,64,0.16)',
                                    border: '1px solid rgba(240,192,64,0.55)',
                                    color: '#f0c040',
                                    cursor: lane.pending ? 'default' : 'pointer',
                                    opacity: lane.pending ? 0.65 : 1,
                                  }}
                                >
                                  {lane.confirmLabel}
                                </button>
                              </div>
                            )}
                          </>
                        )
                        const sharedStyle: React.CSSProperties = {
                          display: 'block', width: '100%', textAlign: 'left',
                          padding: '0.85rem 1rem',
                          background: expanded ? 'rgba(240,192,64,0.05)' : 'transparent',
                          border: 'none',
                          borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.06)',
                          cursor: 'pointer',
                          color: 'inherit',
                          textDecoration: 'none',
                          transition: 'background 0.14s',
                        }
                        if (lane.action === 'navigate' && lane.href) {
                          return (
                            <Link
                              key={lane.key}
                              href={lane.href}
                              onClick={() => setHoldOpen(false)}
                              style={sharedStyle}
                            >
                              {rowBody}
                            </Link>
                          )
                        }
                        return (
                          <button
                            key={lane.key}
                            type="button"
                            onClick={onTap}
                            style={sharedStyle}
                          >
                            {rowBody}
                          </button>
                        )
                      })
                    })()}
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ── Hold upgrade confirm modal ── */}
      <PopupShell
        open={holdUpgradeConfirm}
        onClose={() => { if (!holdUpgrading) setHoldUpgradeConfirm(false) }}
        zIndex={150}
      >
        {(() => {
          const maxTier = FISH_HOLD_TIERS.length - 1
          if (currentFishHoldTier >= maxTier) return null
          const current = getFishHold(currentFishHoldTier)
          const next = getFishHold(currentFishHoldTier + 1)
          const slotsGained = next.capacity - current.capacity
          const canAfford = doubloons >= next.cost
          return (
            <motion.div
              key="hold-upgrade-confirm"
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ duration: 0.18 }}
              role="dialog"
              aria-modal
              style={{
                margin: 'auto', width: '100%', maxWidth: 360,
                background: 'linear-gradient(180deg, #0e1626 0%, #070b14 100%)',
                border: '1px solid rgba(240,192,64,0.45)',
                borderRadius: 18, padding: '1.1rem 1rem 1rem',
                boxShadow: '0 18px 60px rgba(0,0,0,0.7)',
              }}
            >
              <p className="font-karla font-700 uppercase tracking-[0.18em] text-center"
                style={{ fontSize: '0.55rem', color: '#9a8a52', marginBottom: 4 }}>
                Upgrade Fish Hold
              </p>
              <p className="font-cinzel font-700 text-center"
                style={{ fontSize: '1.05rem', color: '#f0c040', marginBottom: 14 }}>
                {next.name}
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center', gap: 10,
                background: 'rgba(0,0,0,0.32)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12, padding: '0.7rem 0.85rem',
                marginBottom: 12,
              }}>
                <div style={{ textAlign: 'right' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.45)', marginBottom: 3 }}>Now</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#c0bdb8', lineHeight: 1 }}>
                    {current.capacity}<span className="font-karla font-400" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)' }}> slots</span>
                  </p>
                </div>
                <svg aria-hidden width="18" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(240,192,64,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
                </svg>
                <div style={{ textAlign: 'left' }}>
                  <p className="font-karla font-700 uppercase tracking-[0.14em]"
                    style={{ fontSize: '0.5rem', color: 'rgba(240,192,64,0.65)', marginBottom: 3 }}>After</p>
                  <p className="font-cinzel font-700" style={{ fontSize: '1rem', color: '#f0ede8', lineHeight: 1 }}>
                    {next.capacity}<span className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#f0c040' }}> slots</span>
                  </p>
                </div>
              </div>
              <p className="font-karla font-600 text-center"
                style={{ fontSize: '0.72rem', color: 'rgba(240,237,232,0.78)', marginBottom: 14 }}>
                +{slotsGained} slot{slotsGained === 1 ? '' : 's'} for <span style={{ color: '#f0c040' }}>{next.cost.toLocaleString()} ⟡</span>
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setHoldUpgradeConfirm(false)}
                  disabled={holdUpgrading}
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{
                    flex: 1, padding: '0.7rem 0',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(240,237,232,0.65)',
                    borderRadius: 12, fontSize: '0.7rem',
                    cursor: holdUpgrading ? 'default' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canAfford || holdUpgrading}
                  onClick={async () => {
                    setHoldUpgrading(true)
                    const res = await upgradeFishHold()
                    setHoldUpgrading(false)
                    if ('ok' in res) {
                      setCurrentFishHoldTier(res.newTier)
                      setDoubloons(res.doubloons)
                      window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: res.doubloons }))
                    }
                    setHoldUpgradeConfirm(false)
                  }}
                  className="font-karla font-700 uppercase tracking-[0.08em]"
                  style={{
                    flex: 2, padding: '0.7rem 0',
                    background: canAfford ? 'rgba(240,192,64,0.16)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${canAfford ? 'rgba(240,192,64,0.55)' : 'rgba(255,255,255,0.1)'}`,
                    color: canAfford ? '#f0c040' : '#5a5755',
                    borderRadius: 12, fontSize: '0.7rem',
                    cursor: canAfford && !holdUpgrading ? 'pointer' : 'default',
                    opacity: holdUpgrading ? 0.65 : 1,
                  }}
                >
                  {holdUpgrading
                    ? 'Upgrading…'
                    : canAfford
                      ? `Upgrade — ${next.cost.toLocaleString()} ⟡`
                      : 'Not enough doubloons'}
                </button>
              </div>
            </motion.div>
          )
        })()}
      </PopupShell>

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

      {/* ── Golden trophy choice modal ───────────────────────────────────
          Forced decision after a shiny lands and the reveal lock lifts.
          Sell for 10× doubloons OR mount the species golden in the
          Logbook forever. No cancel/dismiss — backdrop tap is a no-op
          on PopupShell since onClose stays empty. PopupShell handles
          the safe-area + tab-bar bottom padding so the modal isn't
          clipped on mobile. */}
      <PopupShell
        open={phase === 'result' && !!catchResult?.isShiny && shinyChoiceModalOpen}
        onClose={() => { /* forced choice — backdrop tap does nothing */ }}
        zIndex={200}
        backdropColor="radial-gradient(ellipse at 50% 65%, rgba(40,18,4,0.45) 0%, rgba(0,0,0,0.82) 80%)"
      >
        {catchResult?.isShiny && (
            <motion.div
              key="shiny-choice"
              initial={{ y: 60, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              role="dialog"
              aria-modal
              style={{
                margin: 'auto auto 0 auto',
                width: '100%', maxWidth: 380,
                background: 'radial-gradient(circle at 50% 25%, #2a1a08 0%, #16090a 100%)',
                border: '2px solid rgba(228,188,108,0.7)',
                borderRadius: 22,
                padding: '1.1rem 1rem 1.15rem',
                boxShadow: '0 18px 60px rgba(0,0,0,0.7), 0 0 32px rgba(228,188,108,0.35)',
              }}
            >
              <p className="font-karla font-700 uppercase text-center" style={{
                fontSize: '0.55rem', letterSpacing: '0.24em', color: '#fbcc4a',
                textShadow: '0 0 12px rgba(251,204,74,0.55)', marginBottom: 4,
              }}>
                ✦ Trophy Decision
              </p>
              <p className="font-cinzel font-700 text-center" style={{
                fontSize: '1.05rem', color: '#fff5d0', marginBottom: 2, lineHeight: 1.15,
              }}>
                Golden {catchResult.fish.name}
              </p>
              <p className="font-karla font-400 text-center" style={{
                fontSize: '0.66rem', color: '#9a8870', marginBottom: '0.85rem',
              }}>
                Pick its fate. This choice is final.
              </p>

              {/* Sell tile */}
              {(() => {
                const earnings = catchResult.fish.sell_value * SHINY_SELL_MULT
                const sellLoading = shinyChoiceLoading === 'sell'
                const mountLoading = shinyChoiceLoading === 'mount'
                return (
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); handleSellGolden() }}
                    disabled={!!shinyChoiceLoading}
                    style={{
                      width: '100%', padding: '0.85rem 1rem', borderRadius: 14,
                      background: 'rgba(180,120,30,0.18)', border: '1px solid rgba(228,188,108,0.55)',
                      cursor: shinyChoiceLoading ? 'default' : 'pointer', textAlign: 'left',
                      marginBottom: '0.65rem',
                      opacity: mountLoading ? 0.3 : 1,
                      touchAction: 'manipulation',
                    }}
                  >
                    <p className="font-karla font-700 uppercase" style={{ fontSize: '0.6rem', letterSpacing: '0.16em', color: '#fbcc4a', marginBottom: 3 }}>
                      {sellLoading ? 'Selling…' : 'Sell to Market'}
                    </p>
                    <p className="font-cinzel font-700" style={{ fontSize: '1.1rem', color: '#f0c040', lineHeight: 1 }}>
                      {earnings.toLocaleString()} ⟡
                    </p>
                    <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#9a8870', marginTop: 4, lineHeight: 1.35 }}>
                      10× the normal sell price. The trophy is gone.
                    </p>
                  </button>
                )
              })()}

              {/* Mount tile — disabled if this species is already golden in the Logbook */}
              {(() => {
                const sellLoading = shinyChoiceLoading === 'sell'
                const mountLoading = shinyChoiceLoading === 'mount'
                const disabled = !!catchResult.alreadyMounted
                return (
                  <button
                    type="button"
                    onPointerDown={(e) => { e.preventDefault(); if (!disabled) handleMountGolden() }}
                    disabled={!!shinyChoiceLoading || disabled}
                    style={{
                      width: '100%', padding: '0.85rem 1rem', borderRadius: 14,
                      background: disabled ? 'rgba(40,28,16,0.55)' : 'rgba(228,188,108,0.12)',
                      border: `1px solid ${disabled ? 'rgba(160,140,100,0.25)' : 'rgba(228,188,108,0.55)'}`,
                      cursor: disabled || shinyChoiceLoading ? 'default' : 'pointer',
                      textAlign: 'left',
                      opacity: disabled ? 0.6 : (sellLoading ? 0.3 : 1),
                      touchAction: 'manipulation',
                    }}
                  >
                    <p className="font-karla font-700 uppercase" style={{
                      fontSize: '0.6rem', letterSpacing: '0.16em',
                      color: disabled ? '#9a8870' : '#fbcc4a', marginBottom: 3,
                    }}>
                      {disabled ? 'Already in Logbook' : (mountLoading ? 'Mounting…' : 'Mount in Logbook')}
                    </p>
                    <p className="font-cinzel font-700" style={{
                      fontSize: disabled ? '0.85rem' : '0.95rem',
                      color: disabled ? '#9a8870' : '#fff5d0', lineHeight: 1.2,
                    }}>
                      {disabled
                        ? `Already enshrined a golden ${catchResult.fish.name}.`
                        : `Permanent golden ${catchResult.fish.name} entry.`}
                    </p>
                    <p className="font-karla font-400" style={{ fontSize: '0.62rem', color: '#9a8870', marginTop: 4, lineHeight: 1.35 }}>
                      {disabled
                        ? 'Sell is the only option for this one.'
                        : 'Trophy consumed. No doubloons paid out.'}
                    </p>
                  </button>
                )
              })()}
            </motion.div>
        )}
      </PopupShell>

      {/* Resolve toast — confirms the choice landed. Fixed-positioned so
          it floats above the modal + tab bar without needing a parent. */}
      <AnimatePresence>
        {shinyResolveToast && (
          <motion.div
            key="shiny-resolve-toast"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="font-karla font-700"
            style={{
              position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 80px)',
              left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(8,8,6,0.92)', border: '1px solid rgba(228,188,108,0.55)',
              padding: '0.55rem 1.1rem', borderRadius: 999,
              color: '#fbcc4a', fontSize: '0.82rem',
              textShadow: '0 0 10px rgba(251,204,74,0.55)',
              whiteSpace: 'nowrap',
              zIndex: 220,
              pointerEvents: 'none',
            }}
          >
            {shinyResolveToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Perfected Sigil coin flight + amount caption — fixed-position
          viewport layer so coordinates from getBoundingClientRect line
          up regardless of parent transforms / overflow:hidden. Each
          coin arcs from a jittered point near screen center up to the
          Nav's doubloon pill, then despawns. A floating "+N ⟡" caption
          spawns above the coin origin and drifts up so the player can
          READ the bonus amount. Pure cosmetic — the doubloons already
          credited server-side. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 220 }}>
        <AnimatePresence>
          {sigilLabels.map(label => (
            <motion.div
              key={`label-${label.id}`}
              initial={{ x: label.x, y: label.y, scale: 0.7, opacity: 0 }}
              animate={{
                x: label.x,
                y: label.y - 56,
                scale: [0.7, 1.15, 1],
                opacity: [0, 1, 1, 0],
              }}
              transition={{ duration: 1.1, times: [0, 0.15, 0.55, 1], ease: 'easeOut' }}
              onAnimationComplete={() => setSigilLabels(prev => prev.filter(l => l.id !== label.id))}
              className="font-cinzel font-700"
              style={{
                position: 'absolute', top: 0, left: 0,
                transform: 'translate(-50%, -50%)',
                fontSize: '1.35rem',
                color: '#f0c040',
                textShadow: '0 0 14px rgba(240,192,64,0.85), 0 0 28px rgba(240,192,64,0.5), 0 2px 0 rgba(0,0,0,0.6)',
                letterSpacing: '0.05em',
                whiteSpace: 'nowrap',
              }}
            >
              +{label.amount} ⟡
            </motion.div>
          ))}
          {flyingSigilCoins.map(coin => (
            <motion.div
              key={coin.id}
              initial={{ x: coin.fromX - 14, y: coin.fromY - 14, scale: 1, opacity: 0 }}
              animate={{
                x: coin.toX - 14,
                y: coin.toY - 14,
                scale: 0.55,
                opacity: [0, 1, 1, 0.9],
                rotate: 540,
              }}
              transition={{
                duration: 0.7,
                delay: coin.delay,
                ease: [0.4, 0, 0.2, 1],
                opacity: { duration: 0.7, times: [0, 0.15, 0.85, 1] },
              }}
              onAnimationComplete={() => setFlyingSigilCoins(prev => prev.filter(c => c.id !== coin.id))}
              style={{
                position: 'absolute', top: 0, left: 0,
                width: 28, height: 28, borderRadius: '50%',
                background: 'radial-gradient(circle at 35% 30%, #fde68a 0%, #f0c040 55%, #b8860b 100%)',
                border: '1.5px solid rgba(255,232,150,0.85)',
                color: '#5a3d00',
                fontSize: '0.72rem',
                fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                lineHeight: 1,
                boxShadow: '0 0 14px rgba(240,192,64,0.65), 0 4px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)',
                textShadow: '0 1px 0 rgba(255,255,255,0.3)',
              }}
            >
              ⟡
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

    </div>
  )
}

// ── Prestige ceremony ─────────────────────────────────────────────────────────
// A prestige is a rare, earned moment — it gets a full-screen beat, not a
// confirm dialog fizzle. The zone-colored ink stamp slams in (haptic lands
// with it), the stars count the new level, and the promise is spelled out.
// Tap anywhere or the button to go back to the water.
function PrestigeCeremonyOverlay({ zone, level, goldenBoost, skinName, onDone }: {
  zone: string
  level: number
  /** New golden-boost wipe count when this was a past-max wipe (level unchanged). */
  goldenBoost?: number
  skinName: string | null
  onDone: () => void
}) {
  const zColor = HABITAT_COLOR[zone] ?? '#f0c040'
  const label = HABITAT_LABEL[zone] ?? zone
  // Three flavors: a normal level-up, hitting the cap (Max Prestige), and a
  // past-max GOLDEN BOOST wipe. The latter two get the gold/prismatic crowning
  // so they feel like real, earned milestones.
  const isGolden = goldenBoost !== undefined
  const isMax = !isGolden && level >= PRESTIGE_MAX
  const grand = isMax || isGolden
  const color = grand ? '#f0c040' : zColor
  useEffect(() => {
    // A bigger, celebratory buzz on the gold moments.
    const t = setTimeout(() => vibrate(grand ? [0, 70, 45, 70, 45, 160] : [0, 60, 50, 110]), 300)
    return () => clearTimeout(t)
  }, [grand])
  return (
    <motion.div key="prestige-ceremony"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{
        position: 'absolute', inset: 0, zIndex: 45,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(2,5,10,0.93)', padding: '1.5rem',
      }}
      data-any-key
      onClick={onDone}
    >
      {/* rising flecks — more, and gold, on the crowning moments. */}
      {Array.from({ length: grand ? 26 : 14 }).map((_, i) => (
        <motion.div key={i} aria-hidden
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: [0, 1, 0], y: grand ? -140 : -90, x: (i % 2 ? 1 : -1) * (6 + (i * 5) % 40) }}
          transition={{ duration: 2.4 + (i % 3) * 0.5, delay: (i * 0.13) % 1.7, repeat: Infinity, ease: 'easeOut' }}
          style={{ position: 'absolute', left: `${(i * 29) % 100}%`, bottom: '14%', width: 4, height: 4, borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}` }} />
      ))}
      <div onClick={e => e.stopPropagation()} style={{ position: 'relative', textAlign: 'center', maxWidth: 320, width: '100%' }}>
        <p className="font-karla font-700 uppercase tracking-[0.24em]" style={{ fontSize: '0.56rem', color: `${color}cc`, marginBottom: 14 }}>
          {isGolden ? `${label} · Golden Boost` : isMax ? `${label} · Mastered` : label}
        </p>
        {/* the ink stamp slams in */}
        <motion.div
          initial={{ scale: 2.3, opacity: 0, rotate: 3 }}
          animate={{ scale: 1, opacity: 1, rotate: -6 }}
          transition={{ type: 'spring', stiffness: 340, damping: 17, delay: 0.18 }}
          className="font-cinzel font-800 uppercase"
          style={{
            display: 'inline-block', padding: '0.55rem 1.15rem',
            border: `3px double ${color}`, borderRadius: 8,
            fontSize: grand ? '1.5rem' : '1.7rem', letterSpacing: '0.12em', lineHeight: 1,
            textShadow: `0 0 22px ${color}66`, boxShadow: `0 0 34px ${color}2e, inset 0 0 18px ${color}18`,
            ...(grand
              ? { backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8,#f0c040)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }
              : { color }),
          }}
        >
          {isGolden ? 'Golden Boost' : isMax ? 'Max Prestige' : `Prestige ${level}`}
        </motion.div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 16 }}>
          {Array.from({ length: level }).map((_, i) => (
            <motion.svg key={i} width={grand ? 18 : 15} height={grand ? 18 : 15} viewBox="0 0 24 24" fill={color}
              initial={{ opacity: 0, scale: 0.3, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 0.55 + i * 0.12, type: 'spring', stiffness: 420, damping: 18 }}
              style={{ filter: `drop-shadow(0 0 ${grand ? 7 : 5}px ${color})` }}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </motion.svg>
          ))}
        </div>
        {isGolden && (
          <motion.p initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 15 }}
            className="font-cinzel font-800" style={{ fontSize: '2.1rem', marginTop: 14, lineHeight: 1, backgroundImage: 'linear-gradient(90deg,#fff2c8,#f0c040,#ffe9a8)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', textShadow: '0 0 22px rgba(240,192,64,0.4)' }}>
            +{goldenBoostPct(goldenBoost)}% Goldens
          </motion.p>
        )}
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="font-cinzel font-700" style={{ fontSize: '1.05rem', color: '#f5f2ec', marginTop: 16 }}>
          {isGolden ? `Golden catches come easier in the ${label}` : isMax ? `You've mastered the ${label}` : `+${level * 10}% XP on every ${label} catch, forever`}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}
          className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5, marginTop: 8, fontStyle: 'italic' }}>
          {isGolden
            ? 'Every wipe gilds these waters a little more. Keep going for richer golden odds — there is no ceiling.'
            : isMax
            ? '+50% catch XP, locked in for good. Few captains ever fish these waters dry five times over.'
            : 'The log begins anew. Every fish in these waters is waiting to be caught again.'}
        </motion.p>
        {skinName && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.05 }}
            className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: 10 }}>
            New colorway unlocked: {skinName}
          </motion.p>
        )}
        <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.15 }}
          type="button" onClick={onDone}
          className="font-cinzel font-700 uppercase tracking-[0.14em] tap"
          style={{ marginTop: 20, width: '100%', padding: '12px 0', borderRadius: 12, fontSize: '0.76rem', color: '#0c0f14', background: `linear-gradient(180deg, ${color}, ${color}cc)`, border: 'none', cursor: 'pointer', boxShadow: `0 0 22px ${color}55` }}>
          {isGolden ? 'Keep hunting goldens' : isMax ? 'Wear it with pride' : 'Back to the water'}
        </motion.button>
      </div>
    </motion.div>
  )
}
