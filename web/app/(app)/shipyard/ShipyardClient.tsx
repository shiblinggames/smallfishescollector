'use client'

// THE SHIPYARD.
//
// The successor to the fishing page's Gear & Shop drawer. Everything that
// drawer did happens here, on a page you sail to, with the boat itself above it
// instead of a strip of tiles in a bottom sheet.
//
// The order is the order you would actually do it in: look at the boat, see
// what it can carry, see what the rig adds up to, then open the
// locker and change something.
//
// GearScreen is MOUNTED, not reimplemented. It is three and a half thousand
// lines of pickers, buy flows, gating and the forge bench, all of it already
// right; a second copy here would be two copies of the fishing economy drifting
// apart. The handlers below are the same server actions the fishing page calls.

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { RODS, getEffectiveRod, rodGlowClass } from '@/lib/rods'
import { REELS, getReel } from '@/lib/reels'
import { HOOKS, getHook } from '@/lib/hooks'
import { getLine } from '@/lib/lines'
import { getPet, petSlot } from '@/lib/pets'
import { getHat } from '@/lib/hats'
import { CHARACTER_COLORS } from '@/lib/characters'
import { getBoat, boatSpeed, boatAgility, trimLabel } from '@/lib/boats'
import PopupShell from '@/components/PopupShell'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { vibrate } from '@/lib/haptics'
import LoadoutStats from '@/components/LoadoutStats'
import GearScreen, { type SlotKey } from '../fishing/GearScreen'
import CalloutLayer from '@/components/CalloutLayer'
import PreviewStage from '@/components/PreviewStage'
import { SPECIAL_ITEMS, effectiveSpecialDef } from '@/lib/specialItems'
import {
  nextHullCost, MAX_HULL_TIER,
  nextLanternCost, MAX_LANTERN_TIER, lanternMetres,
  nextHandlingCost, MAX_HANDLING_TIER,
  nextAccelCost, MAX_ACCEL_TIER,
  hullMetresPerSec, turnDegreesPerSec, secondsToTopSpeed,
} from '@/lib/shipyard'
import { buyHullTier, buyLanternTier, buyHandlingTier, buyAccelTier, equipRod as equipRodAction } from './actions'
import { upgradeFishHold } from '../fishing/holdActions'
import {
  equipBoat, buyBoat, equipHat, buyHat, equipPet,
  equipSpecialItem, buySpecialItem, setCompletionistEffects,
  setShowWaitTimer as persistShowWaitTimer,
} from '../fishing/actions'
import { equipSecondSpecial } from '../expeditions/spoilsActions'
import { purchaseRod, sellRod, buyReel } from '@/app/(app)/marketplace/tackle-shop/actions'
import { buyHook } from '@/app/(app)/hooks/actions'
import { updateCharacterColor, purchaseCharacterColor } from '@/app/(app)/u/actions'
import { equipBadge, unequipBadge } from '@/app/(app)/achievements/badgeActions'

/** The intro's harbour with its dinghy painted out: the water the boat sits on. */
const YARD_WATER = '/welcome-harbour-open.webp'

type BaitItem = { bait_type: string; quantity: number }

type Buyable = 'hull' | 'handling' | 'accel' | 'hold' | 'lantern'

/**
 * WHAT YOU ARE ABOUT TO BUY, in plain words.
 *
 * The cards had a name, a number and a price, which tells you what changes but
 * not what it MEANS — "3 rods" and "86% speed" are only legible if you already
 * know how the hull and the hold work. These are the explanations, and they are
 * written here rather than inside the confirm modal so the card and the modal
 * cannot end up describing the upgrade differently.
 *
 * Per the house rule: the mechanic is stated literally, the flavour stays out
 * of it. You are spending real money-equivalent on a permanent change and the
 * copy's only job is to make sure you meant to.
 */
/** Four words, for the row. `EXPLAIN.does` is the full sentence and the
 *  confirm modal still shows it — a page of five paragraphs is how a shipyard
 *  becomes a wall of text, and the number beside the tag is doing most of the
 *  explaining anyway. */
// ONE LINE, PLAIN, ABOUT THE STAT. These sit under the reading on each tile and
// they are the only prose a player reads before deciding. Written to the house
// rule for mechanics copy — literal, no metaphor — and about what the number
// does for you rather than about the part of the boat that provides it.
const TAG: Record<Buyable, string> = {
  hull: 'Get everywhere sooner. Does not change your fishing.',
  handling: 'Steer tighter. Easier to pull alongside things.',
  accel: 'Less waiting every time you set off again.',
  hold: 'Fish more before you have to go and sell.',
  lantern: 'See further after dark. Nothing changes by day.',
}

const EXPLAIN: Record<Buyable, { does: string; why: string }> = {
  hull: {
    does: 'Raises your top speed, so you cross the chart in less time.',
    why: 'It changes nothing about fishing. Bites, catch zones and rarity are '
       + 'untouched. It only shortens the sail to the deep water and back.',
  },
  handling: {
    does: 'Turns the boat faster, so she comes round in fewer degrees of drift.',
    why: 'Top speed is the long haul out. This is everything you do once you '
       + 'are there: pulling alongside a drifting trader, threading a wreck '
       + 'field, holding a line through a hotspot.',
  },
  accel: {
    does: 'Reaches top speed sooner after every stop.',
    why: 'Every stop and start: after a cast, after a hail, coming off a dock. '
       + 'It does not raise your top speed, only how quickly you reach it.',
  },
  hold: {
    does: 'Holds more fish, so you can stay out longer before selling.',
    why: 'A full hold stops you casting. Selling to a zone buyer or at the '
       + 'market ashore is what empties it.',
  },
  lantern: {
    does: 'Widens the pool of light your boat casts at night.',
    why: 'It changes nothing at all by day, and nothing about fishing at any '
       + 'hour. What it changes is how much of the water ahead you can see '
       + 'once the sun is down.',
  },
}


export default function ShipyardClient(p: {
  /**
   * SHUT IT WHERE IT STANDS, rather than navigating away.
   *
   * The Shipyard is a sheet on the chart now: you moor at its island and it
   * opens over the water you are sitting in. When it is mounted that way there
   * is nowhere to go back TO — the sea is still there underneath — so the
   * close and the foot button just dismiss it.
   *
   * Absent, this is the /shipyard route and leaving means a navigation, which
   * is what `leave` does.
   */
  onClose?: () => void
  doubloons: number
  gems: number
  fishingLevel: number
  isPremium: boolean

  equippedRod: number
  ownedRods: number[]
  reelTier: number
  hookTier: number
  lineTier: number
  completionistEffects: number[] | null
  hasForgedBefore: boolean

  hullTier: number
  handlingTier: number
  accelTier: number
  lanternTier: number
  holdTier: number
  holdCapacity: number

  baitInventory: BaitItem[]
  characterColor: string
  unlockedCharacterColors: string[]
  equippedBadges: string[]
  unlockedBadges: string[]
  equippedBoat: string | null
  unlockedBoats: string[]
  equippedHat: string | null
  unlockedHats: string[]
  equippedPet: string | null
  equippedPetBow: string | null
  unlockedPets: string[]

  equippedSpecial: string | null
  equippedSpecial2: string | null
  hasDeepReel: boolean
  hasAnglersPatience: boolean
  anglersPatienceXp: number
  hasTideTurner: boolean
  tideTurnerSkipsLeft: number
  hasPhantomHook: boolean
  hasAutoCaster: boolean
  hasAutoCatcher: boolean
  hasPerfectedSigil: boolean
  gauntletDeepest: number
  showWaitTimer: boolean
}) {
  // Everything GearScreen can change lives here, because GearScreen is a
  // CONTROLLED component: it renders what it is given and calls back. The
  // fishing page holds the identical set of useStates for the same reason.
  const [doubloons, setDoubloons] = useState(p.doubloons)
  const [gems, setGems] = useState(p.gems)
  const [equipped, setEquipped] = useState(p.equippedRod)
  const [ownedRods, setOwnedRods] = useState(p.ownedRods)
  const [reelTier, setReelTier] = useState(p.reelTier)
  const [hookTier, setHookTier] = useState(p.hookTier)
  const [effects, setEffects] = useState<number[]>(p.completionistEffects ?? [])
  const [forgedBefore, setForgedBefore] = useState(p.hasForgedBefore)

  const [hull, setHull] = useState(p.hullTier)
  const [handling, setHandling] = useState(p.handlingTier)
  const [accel, setAccel] = useState(p.accelTier)
  const [lantern, setLantern] = useState(p.lanternTier)
  const [hold, setHold] = useState(p.holdTier)
  const [cap, setCap] = useState(p.holdCapacity)

  const [selectedBait, setSelectedBait] = useState('worm')
  const [color, setColor] = useState(p.characterColor)
  const [colors, setColors] = useState(p.unlockedCharacterColors)
  const [badges, setBadges] = useState(p.equippedBadges)
  const [boat, setBoat] = useState(p.equippedBoat)
  const [boats, setBoats] = useState(p.unlockedBoats)
  const [hat, setHat] = useState(p.equippedHat)
  const [hats, setHats] = useState(p.unlockedHats)
  const [pet, setPet] = useState(p.equippedPet)
  const [petBow, setPetBow] = useState(p.equippedPetBow)
  const [special, setSpecial] = useState(p.equippedSpecial)
  const [special2, setSpecial2] = useState(p.equippedSpecial2)
  const [autoCaster, setAutoCaster] = useState(p.hasAutoCaster)
  const [waitTimer, setWaitTimer] = useState(p.showWaitTimer)

  const router = useRouter()
  /**
   * OUT. Same shape as the Trawl Docks' exit, and for the same reason: a push
   * mounts a SECOND /sea on top of the one still in history, so the chart
   * remounts from cold — re-reading the boat's position, rebuilding every
   * island — which is a visible reload of a screen nobody left. Going back
   * restores the one already there.
   *
   * Guarded on the breadcrumb the chart drops in `enter()`, not on
   * `history.length`, which counts other origins and would walk somebody out of
   * the site on a deep link.
   */
  const leave = useCallback(() => {
    // MOUNTED AS A SHEET: there is nothing to navigate back to, because the
    // chart never went anywhere.
    if (p.onClose) { p.onClose(); return }
    let cameFromChart = false
    try {
      cameFromChart = sessionStorage.getItem('sea:came-from-chart') === '1'
      sessionStorage.removeItem('sea:came-from-chart')
    } catch { /* private mode — fall through to the push */ }
    if (cameFromChart) router.back()
    else router.push('/sea')
  }, [router, p])

  /**
   * NOTHING IS BOUGHT ON ONE TAP.
   *
   * Every one of these is permanent, four to six figures, and sits under a
   * finger on a phone next to the tile you actually meant to press. A confirm
   * step on a purchase you cannot undo is not friction, it is the difference
   * between an upgrade and an accident.
   */
  const [confirm, setConfirm] = useState<Buyable | null>(null)
  const [busy, setBusy] = useState('')
  /** WHICH PICKER IS OPEN. Owned here rather than inside GearScreen, because
   *  the things that open them are the boat in the picture and the rows under
   *  it, and none of those are inside GearScreen any more. */
  const [slot, setSlot] = useState<SlotKey | null>(null)
  const [err, setErr] = useState('')

  // The Nav bar's balance is read once at render and never asks again, so every
  // mutation here has to tell it. Detail MUST be a number: the bar formats it
  // immediately and a null takes the whole shell down.
  function bank(total: number) {
    setDoubloons(total)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: total }))
  }
  function bankGems(total: number) {
    setGems(total)
    window.dispatchEvent(new CustomEvent('gems-changed', { detail: total }))
  }

  const hullCost = nextHullCost(hull)
  const handlingCost = nextHandlingCost(handling)
  const accelCost = nextAccelCost(accel)
  const lanternCost = nextLanternCost(lantern)
  const holdNext = hold < FISH_HOLD_TIERS.length - 1 ? FISH_HOLD_TIERS[hold + 1] : null

  // Shop dots: is there a better one of these, and can you pay for it right now.
  const nextReel = REELS.find(r => r.tier === reelTier + 1)
  const nextHook = HOOKS.find(h => h.tier === hookTier + 1)
  const rodHasAffordable = RODS.some(r =>
    !ownedRods.includes(r.tier) && r.cost > 0 && r.cost <= doubloons &&
    !r.earnedOnly && !r.traderOnly && p.fishingLevel >= fishingGearLevelReq(r))

  async function pickRod(tier: number) {
    if (busy || tier === equipped) return
    setBusy('rod'); setErr('')
    const r = await equipRodAction(tier).catch(() => ({ error: 'Could not equip that.' }))
    setBusy('')
    if ('error' in r) { setErr(r.error); return }
    vibrate(10)
    setEquipped(tier)
  }

  async function buy(what: Buyable) {
    if (busy) return
    setBusy(what); setErr('')
    try {
      if (what === 'hull') {
        const r = await buyHullTier()
        if ('error' in r) setErr(r.error)
        else { bank(r.doubloons); setHull(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else if (what === 'handling') {
        const r = await buyHandlingTier()
        if ('error' in r) setErr(r.error)
        else { bank(r.doubloons); setHandling(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else if (what === 'lantern') {
        const r = await buyLanternTier()
        if ('error' in r) setErr(r.error)
        else { bank(r.doubloons); setLantern(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else if (what === 'accel') {
        const r = await buyAccelTier()
        if ('error' in r) setErr(r.error)
        else { bank(r.doubloons); setAccel(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else {
        const r = await upgradeFishHold()
        if ('error' in r) setErr(r.error)
        else {
          bank(r.doubloons); setHold(r.newTier); setCap(getFishHold(r.newTier).capacity)
          vibrate([0, 30, 40, 60])
        }
      }
    } catch { setErr('That did not go through. Try again.') }
    setBusy('')
    setConfirm(null)
  }

  const rodDef = getEffectiveRod(equipped, effects)
  /** What a callout writes under its label. The picture already tells you what
   *  it looks like; the name is the bit you cannot read off a silhouette. */
  const nameFor = (k: SlotKey) =>
    k === 'rod' ? rodDef.name
      : k === 'hat' ? (getHat(hat)?.name ?? 'No hat')
        : k === 'skin' ? (CHARACTER_COLORS.find(c => c.id === color)?.name ?? color)
          : k === 'pet' ? (getPet(pet)?.name ?? 'No pet')
            : (getBoat(boat)?.name ?? 'No boat')
  // The three that the row under the picture names. Derived here rather than
  // inline so the row and anything else that wants them cannot disagree.
  const reelDef = getReel(reelTier)
  const hookDef = getHook(hookTier)
  const lineDef = getLine(p.lineTier)

  /** The three upgrades' current and next state, derived once. The cards and
   *  the confirm modal both read this, so they cannot disagree about what you
   *  are buying or what it costs. */
  /**
   * WHAT EACH UPGRADE IS, IN UNITS, AND WHAT THE NEXT ONE BUYS YOU.
   *
   * Three changes from the version this replaces, and they are all the same
   * change: say the thing rather than a proxy for it.
   *
   * THE TITLE IS THE STAT. It was the tier's name — "Greyhound Hull", "Spade
   * Rudder" — which is charming and tells a player nothing about what they are
   * buying, on the one screen whose whole job is to answer that. It is "Speed"
   * and "Turning" now.
   *
   * THE READING IS A UNIT. "140% sailing speed" is only a number if you know
   * what 100% was, and nobody does. 10.0 m/s is a speed.
   *
   * AND `gain` IS NEW. The old tile showed the next rung's absolute figure and
   * left you to subtract, which is exactly the arithmetic a shop should be
   * doing for you. This says "+1.2 m/s faster" and the tile leads with it.
   */
  const DETAIL: Record<Buyable, {
    title: string; accent: string; now: string; unit: string
    next: string | null; gain: string | null; cost: number | null
  }> = {
    hull: {
      title: 'Speed', accent: '#9fc9e8',
      // The HULL only. The boat's own trim multiplies this and is shown beside
      // it rather than folded in, because they are bought in different places
      // and one of them is a trade-off rather than an upgrade.
      now: `${hullMetresPerSec(hull).toFixed(1)} m/s`, unit: 'top speed',
      next: hull >= MAX_HULL_TIER ? null : `${hullMetresPerSec(hull + 1).toFixed(1)} m/s`,
      gain: hull >= MAX_HULL_TIER ? null
        : `+${(hullMetresPerSec(hull + 1) - hullMetresPerSec(hull)).toFixed(1)} m/s faster`,
      cost: hullCost,
    },
    handling: {
      title: 'Turning', accent: '#7dd3fc',
      now: `${Math.round(turnDegreesPerSec(handling))}°/s`, unit: 'how fast she turns',
      next: handling >= MAX_HANDLING_TIER ? null : `${Math.round(turnDegreesPerSec(handling + 1))}°/s`,
      gain: handling >= MAX_HANDLING_TIER ? null
        : `+${Math.round(turnDegreesPerSec(handling + 1) - turnDegreesPerSec(handling))}°/s sharper`,
      cost: handlingCost,
    },
    accel: {
      title: 'Pick-up', accent: '#a7f3d0',
      // SECONDS, and LOWER IS BETTER — which is why the gain says "quicker"
      // rather than showing a signed number. A "-0.2s" on a shop tile reads as
      // something being taken away.
      now: `${secondsToTopSpeed(accel).toFixed(1)}s`, unit: 'to reach top speed',
      next: accel >= MAX_ACCEL_TIER ? null : `${secondsToTopSpeed(accel + 1).toFixed(1)}s`,
      gain: accel >= MAX_ACCEL_TIER ? null
        : `${(secondsToTopSpeed(accel) - secondsToTopSpeed(accel + 1)).toFixed(1)}s quicker`,
      cost: accelCost,
    },
    lantern: {
      title: 'Lantern', accent: '#ffc07a',
      // METRES ACROSS, not a percentage of a number nobody was told. The pool
      // is a circle on the water and its diameter is the thing you can picture.
      now: `${lanternMetres(lantern).toFixed(1)} m`, unit: 'lit after dark',
      next: lantern >= MAX_LANTERN_TIER ? null : `${lanternMetres(lantern + 1).toFixed(1)} m`,
      gain: lantern >= MAX_LANTERN_TIER ? null
        : `+${(lanternMetres(lantern + 1) - lanternMetres(lantern)).toFixed(1)} m of light`,
      cost: lanternCost,
    },
    hold: {
      title: 'Fish hold', accent: '#f0c040',
      now: `${cap} fish`, unit: 'before you have to sell',
      next: holdNext ? `${holdNext.capacity} fish` : null,
      gain: holdNext ? `+${holdNext.capacity - cap} more fish` : null,
      cost: holdNext?.cost ?? null,
    },
  }

  // Where each upgrade stands on its ladder, for the tier track.
  const LADDER: Record<Buyable, { at: number; max: number }> = {
    hull: { at: hull, max: MAX_HULL_TIER },
    handling: { at: handling, max: MAX_HANDLING_TIER },
    accel: { at: accel, max: MAX_ACCEL_TIER },
    hold: { at: hold, max: FISH_HOLD_TIERS.length - 1 },
    lantern: { at: lantern, max: MAX_LANTERN_TIER },
  }

  return (
    // THE TYPE SCALE LIVES ON THE ROOT, as custom properties (--sy-*), because
    // inline styles cannot carry a media query. See globals.css.
    <div className="fixed left-0 right-0 top-[var(--nav-h)] bottom-[60px] sm:bottom-0 overflow-y-auto sea-shipyard"
      style={{
        background: 'radial-gradient(ellipse 90% 60% at 30% 0%, rgba(40,78,104,0.35) 0%, transparent 60%), #08121c',
        // Over the chart it is opened on: see the note in history (the sheet
        // rendered under the whole sea at z auto). One above the Almanac.
        zIndex: 112,
      }}>
      {/* ── THE YARD, REBUILT (Kong, 2026-09-24: "looks really bad") ──────
          In the loadout's language: the boat large on the harbour on the
          left, the refit on the right, every upgrade a card with its whole
          ladder drawn and one clear button. Every buy, picker and confirm is
          exactly the code it was; only the room around them changed. */}
      <div className="yard-host" style={{ maxWidth: 1180, margin: '0 auto', padding: '1.1rem clamp(0.9rem, 3vw, 1.6rem) 2.2rem' }}>
        {/* HEADER: the name, the purse, the way out. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-800 uppercase" style={{ fontSize: 'var(--sy-1)', letterSpacing: '0.24em', color: 'rgba(159,201,232,0.7)' }}>Refits and rigging</p>
            <h1 className="font-cinzel font-800" style={{ fontSize: 'var(--sy-7)', color: '#f4ecd8', lineHeight: 1.1 }}>The Shipyard</h1>
          </div>
          <div className="font-karla font-800" style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 0.8rem', borderRadius: 999,
            background: 'rgba(240,192,64,0.1)', border: '1px solid rgba(240,192,64,0.35)',
            color: '#f5dc8a', fontSize: 'var(--sy-4)', fontVariantNumeric: 'tabular-nums',
          }}>{doubloons.toLocaleString()} <span style={{ color: '#f0c040' }}>⟡</span></div>
          <button type="button" onClick={leave} aria-label="Back to the water" title="Back to the water"
            style={{
              width: 36, height: 36, borderRadius: '50%', padding: 0, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(6,12,18,0.82)', border: '1px solid rgba(180,214,232,0.34)',
              color: '#dfeaf2', cursor: 'pointer',
            }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: 'var(--sy-4)', color: '#e6a0a0', marginBottom: 10, lineHeight: 1.5 }}>
            {err}
          </p>
        )}

        <div className="yard-grid">
          {/* ── LEFT: YOUR BOAT ──────────────────────────────────────────── */}
          <div className="yard-stage">
            <PreviewStage kit={{
              characterColor: color,
              equippedHat: hat, equippedBoat: boat,
              equippedPet: pet, equippedPetBow: petBow,
              rodTier: equipped, reelTier, hookTier,
            }} style={{
              maxWidth: 'none', borderRadius: 18,
              background: `url(${YARD_WATER}) 40% 62% / cover no-repeat, #0d1e2b`,
            }}>
              {/* The callouts still open the pickers: press a label on the boat. */}
              <CalloutLayer nameFor={nameFor} onPick={setSlot} />
            </PreviewStage>
            <p className="font-karla font-600" style={{ fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.55)', textAlign: 'center', marginTop: 8 }}>
              Press any label on the boat to change what you carry or wear.
            </p>

            {/* The tackle you cannot pick out of the picture. */}
            <div className="sy-kit-row" style={{ marginTop: 10 }}>
              {([
                { slot: 'reel' as SlotKey, label: 'Reel', name: reelDef.name, color: reelDef.color },
                { slot: 'hook' as SlotKey, label: 'Hook', name: hookDef.name, color: hookDef.color },
                { slot: 'line' as SlotKey, label: 'Line', name: lineDef.name, color: lineDef.color },
              ]).map(k => (
                <button key={k.slot} type="button" className="tap yard-press"
                  onClick={() => { vibrate(8); setSlot(k.slot) }}
                  style={{
                    minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                    gap: 1, padding: '0.55rem 0.7rem', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(4,12,20,0.72)', border: `1px solid ${k.color}55`,
                  }}>
                  <span className="font-karla font-700 uppercase" style={{ fontSize: 'var(--sy-1)', letterSpacing: '0.14em', color: 'rgba(190,212,228,0.5)' }}>{k.label}</span>
                  <span className="font-cinzel font-700 truncate" style={{ maxWidth: '100%', fontSize: 'var(--sy-3)', color: '#e6e2dc' }}>{k.name}</span>
                </button>
              ))}
            </div>

            <Band title="Carried" />
            <div className="sy-rig-grid">
              {([0, 1] as const).map(n => {
                const id = n === 0 ? special : special2
                const def = n === 0
                  ? effectiveSpecialDef(special, p.hasAutoCatcher ? ['auto_catcher'] : [])
                  : (special2 ? SPECIAL_ITEMS.find(x => x.id === special2) ?? null : null)
                const locked = n === 1 && !p.hasDeepReel
                return (
                  <button key={n} type="button" className="tap"
                    onClick={() => { vibrate(8); setSlot(n === 0 ? 'special' : 'special2') }}
                    style={{
                      minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: 4, padding: '0.7rem 0.6rem', borderRadius: 16, cursor: 'pointer',
                      background: 'rgba(4,12,20,0.6)',
                      border: `1px solid ${locked ? 'rgba(120,116,110,0.35)' : def ? `${def.color}55` : 'rgba(150,196,222,0.22)'}`,
                    }}>
                    <div style={{
                      width: '100%', height: 'clamp(46px, 15vw, 74px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {def?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={def.image} alt="" style={{
                          maxWidth: '80%', maxHeight: '80%', objectFit: 'contain',
                          filter: `drop-shadow(0 3px 10px ${def.color}66)`,
                        }} />
                      ) : (
                        <span aria-hidden className="font-cinzel" style={{
                          fontSize: 'var(--sy-6)', color: locked ? 'rgba(120,116,110,0.6)' : 'rgba(150,196,222,0.35)',
                        }}>{locked ? 'Locked' : 'Empty'}</span>
                      )}
                    </div>
                    <span className="font-karla font-700 uppercase" style={{
                      fontSize: 'var(--sy-1)', letterSpacing: '0.14em', color: 'rgba(190,212,228,0.45)',
                    }}>{n === 0 ? 'Special' : 'Sunken Hand'}</span>
                    <span className="font-cinzel font-700 truncate" style={{
                      maxWidth: '100%', fontSize: 'var(--sy-3)', color: def ? '#e6e2dc' : '#4c4a47',
                    }}>{locked ? 'Locked' : def ? def.name : 'None'}</span>
                  </button>
                )
              })}

              <button type="button" className="tap"
                onClick={() => { vibrate(8); setSlot('badge') }}
                style={{
                  gridColumn: '1 / -1', minWidth: 0,
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0.7rem 0.8rem', borderRadius: 16, cursor: 'pointer',
                  background: 'rgba(4,12,20,0.6)', border: '1px solid rgba(240,192,64,0.3)',
                }}>
                <span className="font-karla font-700 uppercase" style={{
                  flex: 1, textAlign: 'left', fontSize: 'var(--sy-1)', letterSpacing: '0.14em',
                  color: 'rgba(190,212,228,0.5)',
                }}>Badges</span>
                <span className="font-cinzel font-700" style={{ fontSize: 'var(--sy-3)', color: '#e6e2dc' }}>
                  {badges.filter(Boolean).length} of 3 worn
                </span>
              </button>
            </div>
          </div>

          {/* ── RIGHT: THE REFIT ─────────────────────────────────────────── */}
          <div style={{ minWidth: 0 }}>
            <Band title="Refit your boat" first />
            <div className="yard-cards">
              {(['hull', 'handling', 'accel', 'hold', 'lantern'] as Buyable[]).map(k => {
                const d = DETAIL[k]
                const cost = d.cost ?? Infinity
                return (
                  <UpgradeCard key={k} d={d} does={TAG[k]} ladder={LADDER[k]}
                    busy={busy === k} short={Math.max(0, cost - doubloons)}
                    locked={!!busy}
                    onBuy={() => { setErr(''); setConfirm(k) }} />
                )
              })}
            </div>

            <Band title="What it adds up to" />
            <LoadoutStats
              rodTier={equipped} reelTier={reelTier} hookTier={hookTier} lineTier={p.lineTier}
              completionistEffects={effects}
              fishingLevel={p.fishingLevel}
              boatId={boat} hullTier={hull} handlingTier={handling} accelTier={accel}
            />
          </div>
        </div>

          <GearScreen
            variant="locker"
            // THE PICKERS, AND NOTHING ELSE. The tile grid that used to open
            // them is gone: the boat in the picture opens them now, and the
            // rows under it open the rest. GearScreen still owns every buy,
            // sell, equip and forge flow, because those are the fishing economy
            // and a second copy would be two of them drifting apart.
            hideGrid
            slot={slot}
            onSlotChange={setSlot}
            baitInventory={p.baitInventory}
            selectedBait={selectedBait}
            onSelectBait={setSelectedBait}
            equippedRodTier={equipped}
            ownedRods={ownedRods}
            onEquipRod={(tier) => { void pickRod(tier) }}
            completionistEffects={effects}
            hasForgedBefore={forgedBefore}
            onCompletionistEffectsChange={async (tiers) => {
              const prev = effects
              setEffects(tiers)
              const res = await setCompletionistEffects(tiers)
              if ('error' in res) { setEffects(prev); return { error: res.error } }
              setEffects(res.completionistEffects)
              // After any committed forge the free first forge is spent.
              if (res.completionistEffects.length > 0) setForgedBefore(true)
              if (res.charged) bank(res.newDoubloons)
              return { ok: true as const }
            }}
            reelTier={reelTier}
            hookTier={hookTier}
            lineTier={p.lineTier}
            onBuyReel={async () => {
              const res = await buyReel()
              if ('error' in res) { setErr(res.error); return }
              setReelTier(res.reelTier); bank(res.doubloons)
            }}
            onBuyHook={async () => {
              const res = await buyHook()
              if ('error' in res) { setErr(res.error); return }
              setHookTier(res.hookTier); bank(res.doubloons)
            }}
            rodHasAffordable={rodHasAffordable}
            reelHasAffordable={!!nextReel && doubloons >= nextReel.cost}
            hookHasAffordable={!!nextHook && doubloons >= nextHook.cost}
            onBuyRod={async (tier) => {
              const res = await purchaseRod(tier)
              if ('error' in res) { setErr(res.error); return }
              setOwnedRods(res.ownedRods); bank(res.doubloons)
              await pickRod(tier)
            }}
            onSellRod={async (tier) => {
              // The server allows selling the EQUIPPED rod and auto-equips
              // Bamboo when it does, returning the tier it landed on — mirror
              // that rather than assuming the equipped rod is unchanged.
              const res = await sellRod(tier)
              if ('error' in res) { setErr(res.error); return }
              setOwnedRods(res.ownedRods); setEquipped(res.rodTier); bank(res.doubloons)
            }}
            characterColor={color}
            unlockedCharacterColors={colors}
            onUpdateColor={(colorId) => { setColor(colorId); void updateCharacterColor(colorId) }}
            onBuyColor={async (colorId) => {
              const res = await purchaseCharacterColor(colorId)
              if ('error' in res) return { error: res.error }
              setColors(res.unlockedColors); bank(res.doubloons); bankGems(res.gems)
              setColor(colorId)               // wear it right away
              await updateCharacterColor(colorId)
              return { ok: true as const }
            }}
            equippedBadges={badges}
            unlockedBadges={p.unlockedBadges}
            onEquipBadge={(id, slot) => {
              const cur = badges.slice()
              while (cur.length < 3) cur.push('')
              if (slot !== undefined) {
                if (cur[slot] === id) {
                  setBadges(cur.map((b, i) => (i === slot ? '' : b)))
                  void unequipBadge(slot)
                } else {
                  setBadges(cur.map((b, i) => (i === slot ? id : b === id ? '' : b)))
                  void equipBadge(id, slot)
                }
                return
              }
              const at = cur.indexOf(id)
              if (at >= 0) {
                setBadges(cur.map((b, i) => (i === at ? '' : b)))
                void unequipBadge(at as 0 | 1 | 2)
              } else {
                const empty = cur.findIndex(b => !b)
                const target = (empty >= 0 ? empty : 0) as 0 | 1 | 2
                setBadges(cur.map((b, i) => (i === target ? id : b)))
                void equipBadge(id, target)
              }
            }}
            equippedBoat={boat}
            unlockedBoats={boats}
            onEquipBoat={(id) => { setBoat(id); void equipBoat(id) }}
            onBuyBoat={(id) => {
              void (async () => {
                const res = await buyBoat(id)
                if ('error' in res) { setErr(res.error); return }
                setBoats(prev => (prev.includes(id) ? prev : [...prev, id]))
                setBoat(id)
                if (res.doubloons != null) bank(res.doubloons)
                if (res.gems != null) bankGems(res.gems)
              })()
            }}
            equippedHat={hat}
            unlockedHats={hats}
            onEquipHat={(id) => { setHat(id); void equipHat(id) }}
            onBuyHat={(id) => {
              void (async () => {
                const res = await buyHat(id)
                if ('error' in res) { setErr(res.error); return }
                setHats(prev => (prev.includes(id) ? prev : [...prev, id]))
                setHat(id); bank(res.doubloons)
              })()
            }}
            equippedPet={pet}
            equippedPetBow={petBow}
            unlockedPets={p.unlockedPets}
            onEquipPet={(id) => {
              // The PET picks its slot, not the caller — a bow pet seats at the
              // bow and leaves the stern pet where it is, which is the whole
              // reason two can ride at once. Unequip (null) always means the
              // stern slot; the bow pet is cleared by tapping it.
              if (petSlot(getPet(id)) === 'bow') {
                const next = petBow === id ? null : id
                setPetBow(next); void equipPet(next, 'bow')
                return
              }
              setPet(id); void equipPet(id, 'stern')
            }}
            equippedSpecial={special}
            onEquipSpecial={(itemId) => { setSpecial(itemId); void equipSpecialItem(itemId) }}
            equippedSpecial2={special2}
            onEquipSpecial2={(id) => {
              // Optimistic, then reconciled: the server is the authority on
              // whether the slot is open and what may sit in it.
              const prev = special2
              setSpecial2(id)
              void equipSecondSpecial(id).then(res => { if (!res.ok) setSpecial2(prev) })
            }}
            onBuySpecialItem={async (itemId) => {
              const res = await buySpecialItem(itemId)
              if ('error' in res) { setErr(res.error); return }
              // Only the base Auto Caster is doubloon-bought here; its upgrade
              // is a Fathoms purchase in the Gauntlet's Locker.
              if (itemId === 'auto_caster') { setAutoCaster(true); bank(doubloons - 5000) }
            }}
            hasDeepReel={p.hasDeepReel}
            hasAnglersPatience={p.hasAnglersPatience}
            anglersPatienceXp={p.anglersPatienceXp}
            hasTideTurner={p.hasTideTurner}
            tideTurnerSkipsLeft={p.tideTurnerSkipsLeft}
            hasPhantomHook={p.hasPhantomHook}
            hasAutoCaster={autoCaster}
            hasAutoCatcher={p.hasAutoCatcher}
            hasPerfectedSigil={p.hasPerfectedSigil}
            gauntletDeepest={p.gauntletDeepest}
            doubloons={doubloons}
            gems={gems}
            fishingLevel={p.fishingLevel}
            isPremium={p.isPremium}
            showWaitTimer={waitTimer}
            onToggleShowWaitTimer={(next) => { setWaitTimer(next); void persistShowWaitTimer(next) }}
            // Nothing to close: this is a page, not a drawer. The pickers close
            // themselves; only the drawer's own dismiss ever used this.
            onClose={() => {}}
          />

        <button type="button" onClick={leave}
          className="font-cinzel font-700 block text-center yard-press"
          style={{
            width: '100%', maxWidth: 420, margin: '22px auto 0', padding: '0.8rem', borderRadius: 12,
            fontSize: 'var(--sy-5)', cursor: 'pointer',
            color: '#f2ead8', background: 'rgba(180,214,232,0.12)',
            border: '1px solid rgba(180,214,232,0.4)',
          }}>
          Back to the water
        </button>
      </div>

      {/* ── CONFIRM THE PURCHASE ────────────────────────────────────────
          Says what it does, what it does not do, what you have now, what you
          will have, and what it costs. Everything that made the card's two-word
          label ambiguous, spelled out, on the one screen where being wrong
          costs money you cannot get back. */}
      <PopupShell open={confirm !== null} onClose={() => { if (!busy) setConfirm(null) }}>
        {confirm && (() => {
          const d = DETAIL[confirm]
          const e = EXPLAIN[confirm]
          return (
            <motion.div role="dialog" aria-modal onClick={ev => ev.stopPropagation()}
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 6 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              style={{
                margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
                background: 'rgba(8,14,24,0.98)', border: `1px solid ${d.accent}44`,
                borderRadius: 18, padding: '1.1rem 1rem 1.15rem',
              }}>
              <p className="font-karla font-700 uppercase tracking-[0.16em]"
                style={{ fontSize: 'var(--sy-1)', color: `${d.accent}cc` }}>Confirm refit</p>
              <h2 className="font-cinzel font-700"
                style={{ fontSize: 'var(--sy-7)', color: '#f4ecd8', marginTop: 3, marginBottom: 10 }}>
                {d.title}
              </h2>

              <p className="font-karla" style={{
                fontSize: 'var(--sy-4)', color: '#dfeaf2', lineHeight: 1.55, marginBottom: 7,
              }}>{e.does}</p>
              <p className="font-karla" style={{
                fontSize: 'var(--sy-4)', color: 'rgba(190,212,228,0.7)', lineHeight: 1.55,
              }}>{e.why}</p>

              {/* NOW versus AFTER, side by side, because the difference is the
                  thing you are actually paying for. */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10,
                margin: '13px 0 4px', padding: '0.75rem 0.85rem', borderRadius: 12,
                background: 'rgba(0,0,0,0.32)', border: '1px solid rgba(255,255,255,0.08)',
              }}>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ fontSize: 'var(--sy-1)', color: 'rgba(255,255,255,0.45)' }}>Now</p>
                  <p className="font-cinzel font-700" style={{ fontSize: 'var(--sy-6)', color: '#b9c9d6', marginTop: 3 }}>
                    {d.now}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={d.accent}
                  strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <div>
                  <p className="font-karla font-700 uppercase tracking-[0.1em]"
                    style={{ fontSize: 'var(--sy-1)', color: `${d.accent}aa` }}>After</p>
                  <p className="font-cinzel font-700" style={{ fontSize: 'var(--sy-6)', color: '#f2ead8', marginTop: 3 }}>
                    {d.next ?? '—'}
                  </p>
                </div>
              </div>

              <p className="font-karla font-600" style={{
                fontSize: 'var(--sy-3)', color: 'rgba(190,212,228,0.62)', marginTop: 10, lineHeight: 1.5,
              }}>
                This costs <span style={{ color: '#f0c040' }}>{(d.cost ?? 0).toLocaleString()} ⟡</span> and
                cannot be undone or refunded. You have {doubloons.toLocaleString()} ⟡.
              </p>

              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <button type="button" onClick={() => setConfirm(null)} disabled={!!busy}
                  className="font-karla font-700"
                  style={{
                    flex: 1, padding: '0.7rem', borderRadius: 12, fontSize: 'var(--sy-4)',
                    color: 'rgba(226,240,248,0.8)', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.16)', cursor: 'pointer',
                  }}>
                  Not yet
                </button>
                <button type="button" onClick={() => void buy(confirm)}
                  disabled={!!busy || doubloons < (d.cost ?? Infinity)}
                  className="font-karla font-700"
                  style={{
                    flex: 1.3, padding: '0.7rem', borderRadius: 12, fontSize: 'var(--sy-4)',
                    color: doubloons < (d.cost ?? Infinity) ? 'rgba(242,234,216,0.4)' : '#f2ead8',
                    background: 'rgba(240,192,64,0.16)',
                    border: '1px solid rgba(240,192,64,0.45)',
                    cursor: doubloons < (d.cost ?? Infinity) ? 'default' : 'pointer',
                  }}>
                  {busy ? 'Working…'
                    : doubloons < (d.cost ?? Infinity) ? 'Not enough ⟡'
                      : `Pay ${(d.cost ?? 0).toLocaleString()} ⟡`}
                </button>
              </div>
            </motion.div>
          )
        })()}
      </PopupShell>

    </div>
  )
}



/** One of the boat's three numbers. Deliberately narrow — three across on a
 *  phone — so the VALUE is what you read and the price is what you tap. */
/** A band heading. The page had none: five upgrade cards, a stats panel and a
 *  locker grid all began at the same left edge with nothing saying where one
 *  thing ended and the next started, which is most of why it read as one
 *  undifferentiated pile. */
function Band({ title, first = false }: { title: string; first?: boolean }) {
  return (
    <div style={{ marginTop: first ? 0 : 24, marginBottom: 10 }}>
      <p className="font-cinzel font-700" style={{ fontSize: 'var(--sy-6)', color: '#f2ead8', lineHeight: 1.1 }}>
        {title}
      </p>
      <div aria-hidden style={{
        height: 1, marginTop: 9,
        background: 'linear-gradient(90deg, rgba(180,214,232,0.32), rgba(180,214,232,0.04))',
      }} />
    </div>
  )
}

/**
 * ── ONE UPGRADE, WITH ITS WHOLE PATH ────────────────────────────────────────
 *
 * Kong: much nicer buttons and a clear upgrade path for each. The card leads
 * with the stat and its reading in a real unit (from DETAIL, which the confirm
 * modal also reads, so they cannot disagree), then the LADDER: one segment per
 * tier, the ones you own filled in the stat's colour, the next one lit, the
 * rest waiting, and "Tier n of m" beside it. Then what the next tier adds and
 * one button that says what it does: Upgrade and the price, how much more you
 * need, or a finished stamp at the top.
 */
function UpgradeCard({ d, does, ladder, busy, short, locked, onBuy }: {
  d: { title: string; accent: string; now: string; unit: string; next: string | null; gain: string | null; cost: number | null }
  does: string
  ladder: { at: number; max: number }
  busy: boolean
  /** How many doubloons short of the next tier; 0 when affordable. */
  short: number
  /** Another purchase is in flight. */
  locked: boolean
  onBuy: () => void
}) {
  const maxed = d.next === null || d.cost === null
  const can = !maxed && short <= 0 && !locked
  const segs = ladder.max + 1
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 8, padding: '0.85rem 0.9rem', borderRadius: 16,
      background: `linear-gradient(180deg, ${d.accent}12 0%, rgba(255,255,255,0.012) 60%), #0b1620`,
      border: `1px solid ${maxed ? 'rgba(127,214,160,0.35)' : `${d.accent}38`}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: 'var(--sy-1)', letterSpacing: '0.14em', color: `${d.accent}c0` }}>{d.title}</p>
          <p className="font-cinzel font-800" style={{ fontSize: 'var(--sy-7)', color: '#f4ecd8', lineHeight: 1.05, marginTop: 2 }}>
            {d.now} <span className="font-karla font-600" style={{ fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.55)' }}>{d.unit}</span>
          </p>
        </div>
        <span className="font-karla font-700" style={{ flexShrink: 0, fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.6)', fontVariantNumeric: 'tabular-nums' }}>
          Tier {ladder.at + 1} of {segs}
        </span>
      </div>

      {/* THE PATH. */}
      <div aria-label={`Tier ${ladder.at + 1} of ${segs}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${segs}, minmax(0, 1fr))`, gap: 4 }}>
        {Array.from({ length: segs }).map((_, i) => {
          const owned = i <= ladder.at
          const next = i === ladder.at + 1
          return (
            <span key={i} style={{
              height: 7, borderRadius: 999,
              background: owned ? d.accent : next ? `${d.accent}40` : 'rgba(255,255,255,0.07)',
              boxShadow: owned ? `0 0 8px ${d.accent}55` : 'none',
              border: next ? `1px solid ${d.accent}aa` : '1px solid transparent',
            }} />
          )
        })}
      </div>

      <p className="font-karla font-600" style={{ fontSize: 'var(--sy-3)', color: 'rgba(190,212,228,0.72)', lineHeight: 1.4 }}>{does}</p>

      {maxed ? (
        <div className="font-cinzel font-700" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0.7rem', borderRadius: 12,
          fontSize: 'var(--sy-3)', color: '#9fe8bd', background: 'rgba(127,214,160,0.08)', border: '1px solid rgba(127,214,160,0.3)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6 9 17l-5-5" /></svg>
          Fully upgraded
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <p className="font-karla font-700" style={{ flex: 1, minWidth: 120, fontSize: 'var(--sy-3)', color: '#a7e8c0' }}>
            Next: {d.next} <span style={{ color: 'rgba(167,232,192,0.7)' }}>({d.gain})</span>
          </p>
          <button type="button" onClick={onBuy} disabled={!can} className="font-cinzel font-700 yard-press yard-buy"
            style={{
              flexShrink: 0, minWidth: 176, padding: '0.7rem 1rem', borderRadius: 12,
              fontSize: 'var(--sy-3)', letterSpacing: '0.03em', fontVariantNumeric: 'tabular-nums',
              // Tinted, never a solid gold slab: the house rule for buttons.
              color: can ? '#fff4d6' : 'rgba(242,234,216,0.45)',
              background: can ? 'linear-gradient(180deg, rgba(240,192,64,0.3), rgba(240,192,64,0.14))' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${can ? 'rgba(240,192,64,0.7)' : 'rgba(255,255,255,0.12)'}`,
              boxShadow: can ? '0 0 18px rgba(240,192,64,0.18), inset 0 1px 0 rgba(255,255,255,0.14)' : 'none',
              cursor: can ? 'pointer' : 'default',
            }}>
            {busy ? 'Working…'
              : short > 0 ? `Need ${short.toLocaleString()} more ⟡`
                : <>Upgrade · {(d.cost ?? 0).toLocaleString()} <span style={{ color: '#f0c040' }}>⟡</span></>}
          </button>
        </div>
      )}
    </div>
  )
}

