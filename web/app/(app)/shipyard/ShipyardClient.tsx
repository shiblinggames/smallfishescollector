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
import CalloutLayer from './CalloutLayer'
import PreviewStage from '@/components/PreviewStage'
import { SPECIAL_ITEMS, effectiveSpecialDef } from '@/lib/specialItems'
import {
  nextHullCost, MAX_HULL_TIER, hullSpeed, HULL_NAMES,
  nextHandlingCost, MAX_HANDLING_TIER, handlingRate, HANDLING_NAMES,
  nextAccelCost, MAX_ACCEL_TIER, accelRate, ACCEL_NAMES,
} from '@/lib/shipyard'
import { buyHullTier, buyHandlingTier, buyAccelTier, equipRod as equipRodAction } from './actions'
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

type BaitItem = { bait_type: string; quantity: number }

type Buyable = 'hull' | 'handling' | 'accel' | 'hold'

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
const TAG: Record<Buyable, string> = {
  hull: 'Faster across the chart',
  handling: 'Comes round quicker',
  accel: 'Quicker off the mark',
  hold: 'Land more before it fills up',
}

const EXPLAIN: Record<Buyable, { does: string; why: string }> = {
  hull: {
    does: 'Refits the hull, so the boat sails faster across the whole chart.',
    why: 'It changes nothing about fishing. Bites, catch zones and rarity are '
       + 'untouched. It only shortens the sail to the deep water and back.',
  },
  handling: {
    does: 'A better rudder, so the bow comes round faster when you turn.',
    why: 'Top speed is the long haul out. This is everything you do once you '
       + 'are there: pulling alongside a drifting trader, threading a wreck '
       + 'field, holding a line through a hotspot.',
  },
  accel: {
    does: 'A taller rig, so she picks up speed harder from a standstill.',
    why: 'Every stop and start — after a cast, after a hail, coming off a dock. '
       + 'It does not raise your top speed, only how quickly you reach it.',
  },
  hold: {
    does: 'Enlarges the fish hold, so you can land more before it is full.',
    why: 'A full hold stops you casting. Selling to a zone buyer or at the '
       + 'market ashore is what empties it.',
  },
}


export default function ShipyardClient(p: {
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
    let cameFromChart = false
    try {
      cameFromChart = sessionStorage.getItem('sea:came-from-chart') === '1'
      sessionStorage.removeItem('sea:came-from-chart')
    } catch { /* private mode — fall through to the push */ }
    if (cameFromChart) router.back()
    else router.push('/sea')
  }, [router])

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
  const DETAIL: Record<Buyable, {
    title: string; accent: string; now: string; unit: string; next: string | null; cost: number | null
  }> = {
    hull: {
      title: HULL_NAMES[Math.min(hull + 1, MAX_HULL_TIER)], accent: '#9fc9e8',
      // The HULL only. The boat's own trim multiplies this and is shown beside
      // it rather than folded in, because they are bought in different places
      // and one of them is a trade-off rather than an upgrade.
      now: `${Math.round(hullSpeed(hull) * 100)}%`, unit: 'sailing speed',
      next: hull >= MAX_HULL_TIER ? null : `${Math.round(hullSpeed(hull + 1) * 100)}%`,
      cost: hullCost,
    },
    handling: {
      title: HANDLING_NAMES[Math.min(handling + 1, MAX_HANDLING_TIER)], accent: '#7dd3fc',
      now: `${Math.round(handlingRate(handling) * 100)}%`, unit: 'turn rate',
      next: handling >= MAX_HANDLING_TIER ? null : `${Math.round(handlingRate(handling + 1) * 100)}%`,
      cost: handlingCost,
    },
    accel: {
      title: ACCEL_NAMES[Math.min(accel + 1, MAX_ACCEL_TIER)], accent: '#a7f3d0',
      now: `${Math.round(accelRate(accel) * 100)}%`, unit: 'pick-up',
      next: accel >= MAX_ACCEL_TIER ? null : `${Math.round(accelRate(accel + 1) * 100)}%`,
      cost: accelCost,
    },
    hold: {
      title: holdNext?.name ?? getFishHold(hold).name, accent: '#f0c040',
      now: `${cap} fish`, unit: 'fish in the hold',
      next: holdNext ? `${holdNext.capacity} fish` : null,
      cost: holdNext?.cost ?? null,
    },
  }

  return (
    // THE TYPE SCALE LIVES ON THE ROOT, as custom properties, because inline
    // styles cannot carry a media query and every size on this page is inline.
    // globals.css bumps all seven steps at once on a wide screen and widens the
    // column to match — the phone layout was being served to a desktop monitor
    // at phone sizes, which is a column of six-point type down the middle of a
    // 27-inch screen.
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0 overflow-y-auto sea-shipyard"
      style={{ background: '#08121c' }}>
      <div className="page-col" style={{ paddingBottom: '2rem' }}>

        {/* ── THE HERO ────────────────────────────────
            The boat, and then what it is carrying. No title, no blurb, no strip
            of pills naming the gear — the picture says all of that, and a page
            you sail to does not need to introduce itself.

            Glow is ON here, unlike the small preview inside the gear grid: at
            this size the halo on a legendary rod is the whole point of the shot,
            and there is exactly one of these on the page. */}
        {/* OUT, and always in the same corner as every other close on this
            chart. The page had only a "Back to the water" link at the very
            bottom, which on a phone is a full scroll away from wherever you
            happen to be reading — and every modal you can open from the sea
            puts its X up here, so this is where a thumb goes looking. */}
        <button type="button" onClick={leave} aria-label="Back to the water" title="Back to the water"
          style={{
            position: 'absolute', top: 22, right: 22, zIndex: 5,
            width: 34, height: 34, borderRadius: '50%', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,12,18,0.82)', border: '1px solid rgba(180,214,232,0.34)',
            color: '#dfeaf2', cursor: 'pointer',
          }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>

        <PreviewStage style={{ marginTop: 64 }} kit={{
          characterColor: color,
          equippedHat: hat, equippedBoat: boat,
          equippedPet: pet, equippedPetBow: petBow,
          rodTier: equipped, reelTier, hookTier,
        }}>
          {/* ── THE CALLOUTS ────────────────────────────────────────────
              Names beside the boat with a hairline to the thing each one names.
              Both ends are free — see ./callouts — because a boat is not laid
              out in even quarters and neither are the things hanging off it.

              Shared with /shipyard/calibrate, which is where the numbers come
              from. Placing them by reading coordinates is hopeless: the sprite
              is a composite whose overlays move with every hat and every hull,
              so the only honest way is to drag them while looking at it. */}
          <CalloutLayer nameFor={nameFor} onPick={setSlot} />
        </PreviewStage>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: 'var(--sy-4)', color: '#e6a0a0', marginTop: 10, lineHeight: 1.5 }}>
            {err}
          </p>
        )}

        {/* ── THE LINE OF KIT YOU CANNOT SEE ──────────────────────────
            Reel, hook and line are drawn on the boat, but they are a few
            pixels of tackle at the end of a rod: a zone over them would be a
            label pointing at nothing. They get a row of their own directly
            under the picture, which is still "tap the thing to change it",
            just without pretending you could pick them out of the art. */}
        <div className="sy-kit-row" style={{ marginTop: 10 }}>
          {([
            { slot: 'reel' as SlotKey, label: 'Reel', name: reelDef.name, color: reelDef.color },
            { slot: 'hook' as SlotKey, label: 'Hook', name: hookDef.name, color: hookDef.color },
            { slot: 'line' as SlotKey, label: 'Line', name: lineDef.name, color: lineDef.color },
          ]).map(k => (
            <button key={k.slot} type="button" className="tap"
              onClick={() => { vibrate(8); setSlot(k.slot) }}
              style={{
                minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                gap: 1, padding: '0.5rem 0.6rem', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(4,12,20,0.72)',
                border: `1px solid ${k.color}44`,
              }}>
              <span className="font-karla font-700 uppercase" style={{
                fontSize: 'var(--sy-1)', letterSpacing: '0.14em', color: 'rgba(190,212,228,0.5)',
              }}>{k.label}</span>
              <span className="font-cinzel font-700 truncate" style={{
                maxWidth: '100%', fontSize: 'var(--sy-3)', color: '#e6e2dc',
              }}>{k.name}</span>
            </button>
          ))}
        </div>

        {/* ── YOUR BOAT ── what the boat IS, rather than what is on it.
            OUT FROM BEHIND A TAB. These five were the back half of a two-tab
            strip, so the things you come to a shipyard to buy were the things
            you could not see. They are the first thing under the picture now. */}
        <Band title="Your boat" />
        <div className="sy-boat-grid">
          <BoatTile
            label="Hull" name={HULL_NAMES[Math.min(hull, MAX_HULL_TIER)]} accent="#9fc9e8"
            now={`${Math.round(hullSpeed(hull) * 100)}%`} unit="sailing speed"
            does={TAG.hull}
            next={hull >= MAX_HULL_TIER ? null : `${Math.round(hullSpeed(hull + 1) * 100)}%`}
            cost={hullCost}
            busy={busy === 'hull'} disabled={!!busy || doubloons < (hullCost ?? Infinity)}
            onBuy={() => { setErr(''); setConfirm('hull') }}
          />
          <BoatTile
            label="Rudder" name={HANDLING_NAMES[Math.min(handling, MAX_HANDLING_TIER)]} accent="#7dd3fc"
            now={`${Math.round(handlingRate(handling) * 100)}%`} unit="turn rate"
            does={TAG.handling}
            next={handling >= MAX_HANDLING_TIER ? null : `${Math.round(handlingRate(handling + 1) * 100)}%`}
            cost={handlingCost}
            busy={busy === 'handling'} disabled={!!busy || doubloons < (handlingCost ?? Infinity)}
            onBuy={() => { setErr(''); setConfirm('handling') }}
          />
          <BoatTile
            label="Rig" name={ACCEL_NAMES[Math.min(accel, MAX_ACCEL_TIER)]} accent="#a7f3d0"
            now={`${Math.round(accelRate(accel) * 100)}%`} unit="pick-up"
            does={TAG.accel}
            next={accel >= MAX_ACCEL_TIER ? null : `${Math.round(accelRate(accel + 1) * 100)}%`}
            cost={accelCost}
            busy={busy === 'accel'} disabled={!!busy || doubloons < (accelCost ?? Infinity)}
            onBuy={() => { setErr(''); setConfirm('accel') }}
          />
          <BoatTile
            label="Fish hold" name={getFishHold(hold).name} accent="#f0c040"
            now={String(cap)} unit="fish aboard"
            does={TAG.hold}
            next={holdNext ? `${holdNext.capacity} fish` : null}
            cost={holdNext?.cost ?? null}
            busy={busy === 'hold'} disabled={!!busy || doubloons < (holdNext?.cost ?? Infinity)}
            onBuy={() => { setErr(''); setConfirm('hold') }}
          />
        </div>

        {/* THE ROD RACK IS GONE. It bought BERTHS, and only rods in a berth
            could be swapped at sea — so it sold you access to your own
            inventory and the only thing it could produce was being out in the
            Ancient Deep holding the wrong rod. You carry everything you own
            now and swap from the loadout screen on the water. See the note at
            the top of lib/shipyard. */}
        {/* ── CARRIED ── the kit with nothing to point at.
            Specials and badges change what happens rather than what you look
            like, so there is no part of the picture that could represent them.
            That is exactly why they get a section instead of a zone. */}
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

        {/* ── THE TOTAL ── last, because it is the sum of BOTH bands above and
            not just the picture. It used to sit directly under the hero, which
            put a table of numbers between you and everything the page is for. */}
        <Band title="What it adds up to" />
        <LoadoutStats
          rodTier={equipped} reelTier={reelTier} hookTier={hookTier} lineTier={p.lineTier}
          completionistEffects={effects}
          fishingLevel={p.fishingLevel}
          boatId={boat} hullTier={hull} handlingTier={handling} accelTier={accel}
        />

        <Link href="/sea" className="font-cinzel font-700 block text-center"
          style={{
            marginTop: 18, padding: '0.75rem', borderRadius: 12, fontSize: 'var(--sy-5)',
            color: '#f2ead8', background: 'rgba(180,214,232,0.14)',
            border: '1px solid rgba(180,214,232,0.4)',
          }}>
          Back to the water
        </Link>
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
                margin: 'auto', width: '100%', maxWidth: 420,
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
function Band({ title }: { title: string }) {
  return (
    <div style={{ marginTop: 26, marginBottom: 10 }}>
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
 * ONE UPGRADE, and the whole reason this replaced BoatCard: it has a `does`.
 *
 * BoatCard rendered a name, a number, a unit and a buy button. Nothing on it
 * said what sailing speed or turn rate or pick-up were FOR, so five upgrades
 * shipped with zero sentences of explanation between them. The sentences did
 * exist, in EXPLAIN, but only the confirm modal read them — so the game
 * explained the purchase only after you had already decided to make it.
 *
 * Full width rather than a third of a row, because three columns is what forced
 * the copy out in the first place: there was nowhere to put a sentence.
 */
/**
 * ONE UPGRADE.
 *
 * It was a full-width row for exactly one commit, which was a bad trade: the
 * row existed to hold a sentence, the sentence became a four-word tag, and five
 * stacked rows then pushed the rig off the bottom of the page to carry four
 * words each. Tiles, two to a line.
 *
 * What it still has, and what BoatCard never did, is the tag. Five upgrades
 * shipped for a long time with no words at all saying what sailing speed or
 * turn rate were FOR — the sentences existed in EXPLAIN, but only the confirm
 * modal read them, so the game explained a purchase after you decided to make
 * it. The long version still lives there; this is the short one.
 */
function BoatTile({ label, name, accent, now, unit, does, next, cost, busy, disabled, onBuy }: {
  label: string; name: string; accent: string; now: string; unit: string; does: string
  next: string | null; cost: number | null
  busy: boolean; disabled: boolean; onBuy: () => void
}) {
  const maxed = next === null || cost === null
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', flexDirection: 'column',
        padding: '0.7rem 0.75rem 0.65rem', borderRadius: 14,
        background: `linear-gradient(180deg, ${accent}10 0%, rgba(255,255,255,0.015) 100%), #0b1620`,
        border: `1px solid ${accent}33`,
      }}>
      <p className="font-karla font-700 uppercase truncate" style={{
        fontSize: 'var(--sy-1)', letterSpacing: '0.12em', color: `${accent}b0`,
      }}>{label}</p>

      {/* THE READING, big. What the boat is right now is what you came to
          check; what it could be is the offer at the bottom. */}
      <p className="font-cinzel font-700" style={{
        fontSize: 'var(--sy-7)', color: '#f2ead8', lineHeight: 1.05, marginTop: 2,
      }}>{now}</p>
      <p className="font-karla font-600" style={{
        fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.5)', lineHeight: 1.25,
      }}>{unit}</p>

      <p className="font-karla font-600 truncate" style={{
        fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.4)', marginTop: 5,
      }}>{name}</p>
      <p className="font-karla font-600" style={{
        fontSize: 'var(--sy-3)', color: 'rgba(190,212,228,0.72)', marginTop: 4, lineHeight: 1.4,
      }}>{does}</p>

      {maxed ? (
        <p className="font-karla font-700" style={{
          fontSize: 'var(--sy-2)', color: '#7fd6a0', marginTop: 'auto', paddingTop: 9,
        }}>Fully upgraded</p>
      ) : (
        <button onClick={onBuy} disabled={disabled} className="font-karla font-700"
          style={{
            marginTop: 'auto', width: '100%', padding: '0.42rem 0.5rem', borderRadius: 10,
            display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6,
            flexWrap: 'wrap',
            fontSize: 'var(--sy-2)', lineHeight: 1.3,
            color: disabled ? 'rgba(242,234,216,0.38)' : '#f2ead8',
            background: 'rgba(240,192,64,0.12)',
            border: '1px solid rgba(240,192,64,0.36)',
            cursor: disabled ? 'default' : 'pointer',
          }}>
          {busy ? <span>Working…</span> : (
            <>
              <span>{next}</span>
              <span style={{ color: disabled ? 'rgba(240,192,64,0.45)' : '#f0c040' }}>
                {cost.toLocaleString()} ⟡
              </span>
            </>
          )}
        </button>
      )}
    </motion.div>
  )
}
