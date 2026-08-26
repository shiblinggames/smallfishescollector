'use client'

// THE SHIPYARD.
//
// The successor to the fishing page's Gear & Shop drawer. Everything that
// drawer did happens here, on a page you sail to, with the boat itself above it
// instead of a strip of tiles in a bottom sheet.
//
// The order is the order you would actually do it in: look at the boat, see
// what it can carry, see what the rig adds up to, load the rack, then open the
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
import { REELS } from '@/lib/reels'
import { HOOKS } from '@/lib/hooks'
import { getPet, petSlot } from '@/lib/pets'
import { getBoat, boatSpeed, boatAgility, trimLabel } from '@/lib/boats'
import PopupShell from '@/components/PopupShell'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { vibrate } from '@/lib/haptics'
import FisherPose from '@/components/FisherPose'
import LoadoutStats from '@/components/LoadoutStats'
import GearScreen from '../fishing/GearScreen'
import {
  rackSlots, nextRackCost, MAX_RACK_TIER,
  nextHullCost, MAX_HULL_TIER, hullSpeed, HULL_NAMES,
  nextHandlingCost, MAX_HANDLING_TIER, handlingRate, HANDLING_NAMES,
  nextAccelCost, MAX_ACCEL_TIER, accelRate, ACCEL_NAMES,
} from '@/lib/shipyard'
import { buyRackBerth, buyHullTier, buyHandlingTier, buyAccelTier, setRodsAboard, equipRod as equipRodAction } from './actions'
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

type Buyable = 'rack' | 'hull' | 'handling' | 'accel' | 'hold'

/**
 * WHAT YOU ARE ABOUT TO BUY, in plain words.
 *
 * The cards had a name, a number and a price, which tells you what changes but
 * not what it MEANS — "3 rods" and "86% speed" are only legible if you already
 * know how the rack and the hull work. These are the explanations, and they are
 * written here rather than inside the confirm modal so the card and the modal
 * cannot end up describing the upgrade differently.
 *
 * Per the house rule: the mechanic is stated literally, the flavour stays out
 * of it. You are spending real money-equivalent on a permanent change and the
 * copy's only job is to make sure you meant to.
 */
const EXPLAIN: Record<Buyable, { does: string; why: string }> = {
  rack: {
    does: 'Adds one berth to the rod rack, so the boat carries one more rod.',
    why: 'Out at sea you can only switch to a rod you brought with you. Every '
       + 'other rod you own stays ashore until you come back.',
  },
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

  rackTier: number
  aboard: number[]
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

  const [rack, setRack] = useState(p.rackTier)
  const [aboard, setAboard] = useState<number[]>(p.aboard)
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

  const [tab, setTab] = useState<'locker' | 'upgrades'>('locker')
  /** Which berth's picker is open. 0 is the rod in your hands and never
   *  opens one — that swap is the locker's Rod slot. */
  const [berth, setBerth] = useState<number | null>(null)
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

  const slots = rackSlots(rack)
  /** Spare berths — the equipped rod is in your hands, not in the rack. */
  const spareSlots = slots - 1
  const rackCost = nextRackCost(rack)
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
    // The newly equipped rod leaves the rack: it is in your hands now and must
    // not also be taking up a berth.
    setAboard(prev => prev.filter(t => t !== tier))
    void setRodsAboard(aboard.filter(t => t !== tier))
  }

  /**
   * PUT A ROD IN A BERTH, or take one out.
   *
   * Indexed by BERTH, not by rod, because that is what you tapped. Berth 0 is
   * the rod in your hands and never reaches here.
   *
   * A rod can only be in one berth, so seating it anywhere clears it from
   * everywhere else first — otherwise a three-berth rack could carry the same
   * rod three times, which is not a loadout, it is a rounding error.
   */
  async function loadBerth(slotIdx: number, tier: number | null) {
    if (busy || slotIdx < 1) return
    const padded: (number | undefined)[] = Array.from({ length: spareSlots }, (_, k) => aboard[k])
    if (tier != null) {
      for (let k = 0; k < padded.length; k++) if (padded[k] === tier) padded[k] = undefined
    }
    padded[slotIdx - 1] = tier ?? undefined
    // Collapsed on save. A hole in the middle of a rack is not a thing a rack
    // has, and the display reads straight off this list.
    const clean = padded.filter((t): t is number => t !== undefined && t !== equipped)
    setErr(''); setBerth(null); vibrate(8)
    setAboard(clean)
    const r = await setRodsAboard(clean).catch(() => null)
    // The server clamps and validates; trust its answer over the optimistic one.
    if (r && 'aboard' in r) setAboard(r.aboard)
  }

  async function buy(what: Buyable) {
    if (busy) return
    setBusy(what); setErr('')
    try {
      if (what === 'rack') {
        const r = await buyRackBerth()
        if ('error' in r) setErr(r.error)
        else { bank(r.doubloons); setRack(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else if (what === 'hull') {
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

  /** The three upgrades' current and next state, derived once. The cards and
   *  the confirm modal both read this, so they cannot disagree about what you
   *  are buying or what it costs. */
  const DETAIL: Record<Buyable, {
    title: string; accent: string; now: string; unit: string; next: string | null; cost: number | null
  }> = {
    rack: {
      title: 'Rod Rack', accent: '#67d4e8',
      now: `${slots} rod${slots === 1 ? '' : 's'}`, unit: slots === 1 ? 'rod aboard' : 'rods aboard',
      next: rack >= MAX_RACK_TIER ? null : `${rackSlots(rack + 1)} rods`,
      cost: rackCost,
    },
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
      <div className="w-full mx-auto sea-shipyard-col" style={{ padding: '0 1rem 2rem' }}>

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

        <div style={{
          position: 'relative', marginTop: 12, borderRadius: 22,
          // MUST clip. FisherPose's overlays are positioned in percentages of
          // this box and genuinely run past it — the hook alone is 204.5% wide
          // at left -10.5% — so without this the widest child sets the page's
          // scroll width and the whole thing slides sideways.
          overflow: 'hidden',
          // A SOLID base under the tint. This sits on the page ground and a
          // translucent panel over anything painted reads as a smear.
          background: 'linear-gradient(180deg, #16303f 0%, #0d1e2b 55%, #0a1622 100%)',
          border: '1px solid rgba(150,196,222,0.22)',
          boxShadow: 'inset 0 -40px 60px -40px rgba(0,8,18,0.9)',
        }}>
          {/* A low band of water under the hull, so the boat is ON something. */}
          <div aria-hidden style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '46%',
            background: 'linear-gradient(180deg, rgba(24,66,88,0) 0%, rgba(20,58,80,0.5) 40%, rgba(10,30,44,0.9) 100%)',
          }} />
          <div style={{ position: 'relative', padding: '0.6rem 0.5rem 0' }}>
            {/* The sprite is 900x800 with the figure in the bottom 55.5%, so the
                top third of the box is empty sky. Pulled in by measurement, the
                same way the gear grid's small preview does it. */}
            <div style={{ marginTop: '-30%', marginBottom: '-2%' }}>
              <FisherPose
                characterColor={color}
                equippedHat={hat} equippedBoat={boat}
                equippedPet={pet} equippedPetBow={petBow}
                rodTier={equipped} reelTier={reelTier} hookTier={hookTier}
              />
            </div>
          </div>

          {/* ── THE RACK, ON THE BOAT ────────────────────────
              Berths as slots under the hull rather than a list further down the
              page, because a rack is a thing bolted to a boat and this is the
              boat. One tile per berth you own: the first is the rod in your
              hands and cannot be emptied, the rest are yours to load. If there
              is a berth left to buy, the next tile is it — an open zone that
              says what it costs and adds itself to the boat when you tap it.

              These are exactly what you can switch between AT SEA. Nothing else
              you own is out there with you. */}
          <div style={{
            position: 'relative', display: 'flex', gap: 6,
            padding: '0.5rem 0.55rem 0.6rem',
          }}>
            {Array.from({ length: slots }, (_, i) => {
              const tier = i === 0 ? equipped : aboard[i - 1]
              const filled = tier !== undefined
              const def = filled ? getEffectiveRod(tier, effects) : null
              return (
                <button key={i} type="button" className="tap"
                  onClick={() => { if (i > 0) { setErr(''); setBerth(i) } }}
                  disabled={i === 0 || !!busy}
                  style={{
                    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', gap: 3, padding: '0.45rem 0.25rem 0.4rem',
                    borderRadius: 12,
                    background: filled ? 'rgba(4,12,20,0.72)' : 'rgba(4,12,20,0.44)',
                    border: filled
                      ? `1px solid ${(def?.color ?? '#9fc9e8')}66`
                      : '1px dashed rgba(160,200,222,0.42)',
                    cursor: i === 0 ? 'default' : 'pointer',
                  }}>
                  {def?.slug ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/${def.slug}_thumb.png`} alt=""
                      className={def.glow ? rodGlowClass(def) : undefined}
                      style={{ width: 26, height: 26, objectFit: 'contain' }} />
                  ) : (
                    <span aria-hidden style={{
                      width: 26, height: 26, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', color: 'rgba(160,200,222,0.6)', fontSize: 'var(--sy-6)',
                    }}>+</span>
                  )}
                  <span className="font-karla font-700 truncate" style={{
                    maxWidth: '100%', fontSize: 'var(--sy-1)', letterSpacing: '0.04em',
                    color: filled ? 'rgba(226,240,248,0.86)' : 'rgba(160,200,222,0.7)',
                  }}>
                    {i === 0 ? 'In hand' : def ? def.name : 'Empty berth'}
                  </span>
                </button>
              )
            })}

            {rack < MAX_RACK_TIER && rackCost != null && (
              <button type="button" className="tap"
                onClick={() => { setErr(''); setConfirm('rack') }}
                disabled={!!busy || doubloons < rackCost}
                style={{
                  flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 3, padding: '0.45rem 0.25rem 0.4rem',
                  borderRadius: 12,
                  background: 'rgba(240,192,64,0.09)',
                  border: '1px dashed rgba(240,192,64,0.5)',
                  cursor: doubloons < rackCost ? 'default' : 'pointer',
                  opacity: doubloons < rackCost ? 0.55 : 1,
                }}>
                <span aria-hidden style={{
                  width: 26, height: 26, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: '#f0c040', fontSize: 'var(--sy-6)',
                }}>{busy === 'rack' ? '…' : '+'}</span>
                <span className="font-karla font-700 truncate" style={{
                  maxWidth: '100%', fontSize: 'var(--sy-1)', letterSpacing: '0.04em', color: '#f0c040',
                }}>
                  {rackCost.toLocaleString()} ⟡
                </span>
              </button>
            )}
          </div>
        </div>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: 'var(--sy-4)', color: '#e6a0a0', marginTop: 10, lineHeight: 1.5 }}>
            {err}
          </p>
        )}

        {/* ── WHAT THE RIG ADDS UP TO ── directly under the picture it is the
            sum of, so the numbers and the thing they describe read as one. */}
        <div style={{ marginTop: 12 }}>
          <LoadoutStats
            rodTier={equipped} reelTier={reelTier} hookTier={hookTier} lineTier={p.lineTier}
            completionistEffects={effects}
            fishingLevel={p.fishingLevel}
            boatId={boat} hullTier={hull} handlingTier={handling} accelTier={accel}
            sub="Everything in the picture above, added up."
          />
        </div>

        {/* ── TWO TABS ── what is on the boat, and what the boat is.
            The locker's OWN tab strip is off (variant="locker"): its Shop tab
            and its Stats tab would each be a second copy of something already
            on this page. */}
        <div style={{
          display: 'flex', gap: 3, marginTop: 16,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 12, padding: 3,
        }}>
          {([['locker', 'Locker'], ['upgrades', 'Upgrades']] as const).map(([key, label]) => {
            const on = tab === key
            return (
              <button key={key} type="button" onClick={() => setTab(key)}
                className="font-karla font-800 uppercase tracking-[0.1em] tap"
                style={{
                  flex: 1, padding: '0.72rem 0', borderRadius: 10, fontSize: 'var(--sy-3)', cursor: 'pointer',
                  border: on ? '1px solid rgba(240,192,64,0.55)' : '1px solid transparent',
                  color: on ? '#f5d98a' : 'rgba(255,255,255,0.6)',
                  background: on ? 'linear-gradient(180deg, rgba(240,192,64,0.22), rgba(224,168,46,0.10))' : 'transparent',
                  boxShadow: on ? 'inset 0 0 14px rgba(240,192,64,0.12)' : 'none',
                }}>
                {label}
              </button>
            )
          })}
        </div>

        {/* ── UPGRADES ── what the boat IS, rather than what is on it.
            FIVE cards now, so the grid wraps to two rows rather than squeezing
            five into three columns. */}
        {tab === 'upgrades' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 12 }}>
            <BoatCard
              name="Rod Rack" accent="#67d4e8"
              now={String(slots)} unit={slots === 1 ? 'rod aboard' : 'rods aboard'}
              next={rack >= MAX_RACK_TIER ? null : `${rackSlots(rack + 1)} rods`}
              cost={rackCost}
              busy={busy === 'rack'} disabled={!!busy || doubloons < (rackCost ?? Infinity)}
              onBuy={() => { setErr(''); setConfirm('rack') }}
            />
            <BoatCard
              name={HULL_NAMES[Math.min(hull, MAX_HULL_TIER)]} accent="#9fc9e8"
              now={`${Math.round(hullSpeed(hull) * 100)}%`} unit="sailing speed"
              next={hull >= MAX_HULL_TIER ? null : `${Math.round(hullSpeed(hull + 1) * 100)}% speed`}
              cost={hullCost}
              busy={busy === 'hull'} disabled={!!busy || doubloons < (hullCost ?? Infinity)}
              onBuy={() => { setErr(''); setConfirm('hull') }}
            />
            <BoatCard
              name={HANDLING_NAMES[Math.min(handling, MAX_HANDLING_TIER)]} accent="#7dd3fc"
              now={`${Math.round(handlingRate(handling) * 100)}%`} unit="turn rate"
              next={handling >= MAX_HANDLING_TIER ? null : `${Math.round(handlingRate(handling + 1) * 100)}%`}
              cost={handlingCost}
              busy={busy === 'handling'} disabled={!!busy || doubloons < (handlingCost ?? Infinity)}
              onBuy={() => { setErr(''); setConfirm('handling') }}
            />
            <BoatCard
              name={ACCEL_NAMES[Math.min(accel, MAX_ACCEL_TIER)]} accent="#a7f3d0"
              now={`${Math.round(accelRate(accel) * 100)}%`} unit="pick-up"
              next={accel >= MAX_ACCEL_TIER ? null : `${Math.round(accelRate(accel + 1) * 100)}%`}
              cost={accelCost}
              busy={busy === 'accel'} disabled={!!busy || doubloons < (accelCost ?? Infinity)}
              onBuy={() => { setErr(''); setConfirm('accel') }}
            />
            <BoatCard
              name={getFishHold(hold).name} accent="#f0c040"
              now={String(cap)} unit="fish in the hold"
              next={holdNext ? `${holdNext.capacity} fish` : null}
              cost={holdNext?.cost ?? null}
              busy={busy === 'hold'} disabled={!!busy || doubloons < (holdNext?.cost ?? Infinity)}
              onBuy={() => { setErr(''); setConfirm('hold') }}
            />
          </div>
        )}

        {/* ── THE LOCKER ── every slot on the boat and nothing else: no tab
            strip, no shop, no stats panel, no fisher preview. See `variant`. */}
        {tab === 'locker' && (
          <div style={{ marginTop: 12 }}>
          <GearScreen
            variant="locker"
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
          </div>
        )}

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

      {/* ── WHAT GOES IN THIS BERTH ────────────────────────────────────
          Only rods you actually own and can actually use. The rod in your hands
          is not listed: it is not in the rack, it is in your hands, and putting
          it here would eat a berth for nothing. */}
      <PopupShell open={berth !== null} onClose={() => setBerth(null)}>
        <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 6 }}
          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
          style={{
            margin: 'auto', width: '100%', maxWidth: 400,
            background: 'rgba(8,14,24,0.98)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 18, padding: '1rem 0.95rem 1.1rem',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <p className="font-karla font-700 uppercase tracking-[0.16em]" style={{ fontSize: 'var(--sy-1)', color: 'rgba(103,212,232,0.9)' }}>
                Berth {berth}
              </p>
              <p className="font-cinzel font-700" style={{ fontSize: 'var(--sy-5)', color: '#f4ecd8' }}>
                What sails with you
              </p>
            </div>
            <button type="button" onClick={() => setBerth(null)} aria-label="Close"
              style={{
                width: 28, height: 28, borderRadius: '50%', padding: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)',
                color: '#cfcabf', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>

          <div style={{ maxHeight: '52vh', overflowY: 'auto', overscrollBehavior: 'contain' }}>
            {berth != null && aboard[berth - 1] !== undefined && (
              <button type="button" onClick={() => void loadBerth(berth, null)}
                className="font-karla font-700 tap"
                style={{
                  width: '100%', textAlign: 'left', padding: '0.6rem 0.7rem', borderRadius: 12,
                  marginBottom: 6, fontSize: 'var(--sy-3)', color: 'rgba(226,240,248,0.7)',
                  background: 'rgba(255,255,255,0.035)', border: '1px dashed rgba(255,255,255,0.18)',
                  cursor: 'pointer',
                }}>
                Leave this berth empty
              </button>
            )}
            {RODS.filter(r => ownedRods.includes(r.tier) && r.tier !== equipped)
              .sort((a, b) => a.tier - b.tier)
              .map(rod => {
                const eff = getEffectiveRod(rod.tier, effects)
                const locked = p.fishingLevel < fishingGearLevelReq(rod)
                const seated = berth != null && aboard[berth - 1] === rod.tier
                const elsewhere = aboard.includes(rod.tier) && !seated
                return (
                  <button key={rod.tier} type="button" disabled={locked || !!busy}
                    onClick={() => { if (berth != null) void loadBerth(berth, rod.tier) }}
                    className="tap"
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                      padding: '0.6rem 0.7rem', borderRadius: 12, marginBottom: 6,
                      background: seated ? `${rod.color}14` : 'rgba(255,255,255,0.035)',
                      border: `1px solid ${seated ? rod.color + '66' : 'rgba(255,255,255,0.09)'}`,
                      opacity: locked ? 0.45 : 1,
                      cursor: locked ? 'default' : 'pointer',
                    }}>
                    {rod.slug && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/${rod.slug}_thumb.png`} alt=""
                        className={eff.glow ? rodGlowClass(eff) : undefined}
                        style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
                    )}
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="font-cinzel font-700 block truncate" style={{ fontSize: 'var(--sy-4)', color: '#f0ede8' }}>
                        {rod.name}
                      </span>
                      <span className="font-karla font-600 block" style={{ fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.55)' }}>
                        {locked ? `Fishing ${fishingGearLevelReq(rod)} needed`
                          : seated ? 'In this berth'
                            : elsewhere ? 'In another berth' : 'Ashore'}
                      </span>
                    </span>
                  </button>
                )
              })}
          </div>
        </motion.div>
      </PopupShell>
    </div>
  )
}



/** One of the boat's three numbers. Deliberately narrow — three across on a
 *  phone — so the VALUE is what you read and the price is what you tap. */
function BoatCard({ name, accent, now, unit, next, cost, busy, disabled, onBuy }: {
  name: string; accent: string; now: string; unit: string
  next: string | null; cost: number | null
  busy: boolean; disabled: boolean; onBuy: () => void
}) {
  const maxed = next === null || cost === null
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{
        display: 'flex', flexDirection: 'column',
        padding: '0.6rem 0.5rem 0.5rem', borderRadius: 14,
        background: `linear-gradient(180deg, ${accent}12 0%, rgba(255,255,255,0.02) 100%), #0b1620`,
        border: `1px solid ${accent}38`,
      }}>
      <p className="font-karla font-700 uppercase truncate" style={{
        fontSize: 'var(--sy-1)', letterSpacing: '0.1em', color: `${accent}b0`,
      }}>{name}</p>
      <p className="font-cinzel font-700" style={{ fontSize: 'var(--sy-7)', color: '#f2ead8', lineHeight: 1.05, marginTop: 3 }}>
        {now}
      </p>
      <p className="font-karla font-600" style={{ fontSize: 'var(--sy-2)', color: 'rgba(190,212,228,0.5)', marginTop: 1, lineHeight: 1.3 }}>
        {unit}
      </p>
      {maxed ? (
        <p className="font-karla font-700" style={{ fontSize: 'var(--sy-2)', color: '#7fd6a0', marginTop: 'auto', paddingTop: 10 }}>
          Fully upgraded
        </p>
      ) : (
        <button onClick={onBuy} disabled={disabled} className="font-karla font-700"
          style={{
            marginTop: 'auto', width: '100%', padding: '0.35rem 0.2rem', borderRadius: 9,
            fontSize: 'var(--sy-2)', lineHeight: 1.35,
            color: disabled ? 'rgba(242,234,216,0.38)' : '#f2ead8',
            background: 'rgba(240,192,64,0.13)',
            border: '1px solid rgba(240,192,64,0.38)',
            cursor: disabled ? 'default' : 'pointer',
          }}>
          {busy ? '…' : <>{next}<br />{cost.toLocaleString()} ⟡</>}
        </button>
      )}
    </motion.div>
  )
}
