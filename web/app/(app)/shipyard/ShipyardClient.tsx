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

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { RODS, getEffectiveRod, rodGlowClass } from '@/lib/rods'
import { REELS, getReel } from '@/lib/reels'
import { HOOKS, getHook } from '@/lib/hooks'
import { getPet, petSlot } from '@/lib/pets'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { vibrate } from '@/lib/haptics'
import FisherPose from '@/components/FisherPose'
import LoadoutStats from '@/components/LoadoutStats'
import GearScreen from '../fishing/GearScreen'
import {
  rackSlots, nextRackCost, MAX_RACK_TIER,
  nextHullCost, MAX_HULL_TIER, hullSpeed, HULL_NAMES,
} from '@/lib/shipyard'
import { buyRackBerth, buyHullTier, setRodsAboard, equipRod as equipRodAction } from './actions'
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

  async function toggleAboard(tier: number) {
    if (busy || tier === equipped) return
    const has = aboard.includes(tier)
    if (!has && aboard.length >= spareSlots) {
      setErr(spareSlots === 0
        ? 'You have no spare berths. Buy one above to carry a second rod.'
        : 'The rack is full. Take one off first.')
      return
    }
    const next = has ? aboard.filter(t => t !== tier) : [...aboard, tier].slice(0, spareSlots)
    setErr(''); vibrate(8); setAboard(next)
    const r = await setRodsAboard(next).catch(() => null)
    // The server clamps and validates; trust its answer over the optimistic one.
    if (r && 'aboard' in r) setAboard(r.aboard)
  }

  async function buy(what: 'rack' | 'hull' | 'hold') {
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
  }

  const rods = RODS.filter(r => ownedRods.includes(r.tier)).sort((a, b) => a.tier - b.tier)
  const rodDef = getEffectiveRod(equipped, effects)
  const petDef = pet ? getPet(pet) : null

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0 overflow-y-auto"
      style={{ background: '#08121c' }}>
      <div className="w-full max-w-md mx-auto" style={{ padding: '0 1rem 2rem' }}>

        {/* ── THE HERO ────────────────────────────────────────────────────
            The boat on its own, big, before any tile or price. You came here to
            look at your rig, so the page opens with it.

            Glow is ON here, unlike the small preview inside the gear grid: at
            this size the halo on a legendary rod is the whole point of the shot,
            and there is exactly one of these on the page. */}
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
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '34%',
            background: 'linear-gradient(180deg, rgba(24,66,88,0) 0%, rgba(20,58,80,0.55) 45%, rgba(12,36,52,0.85) 100%)',
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
          <div style={{ position: 'relative', padding: '0 0.9rem 0.85rem' }}>
            <h1 className="font-cinzel font-700" style={{ fontSize: '1.35rem', color: '#f2ead8', lineHeight: 1.1 }}>
              The Shipyard
            </h1>
            <p className="font-karla" style={{ fontSize: '0.74rem', color: 'rgba(190,214,228,0.66)', marginTop: 3, lineHeight: 1.5 }}>
              What you sail with is decided here. Out at sea you can only change
              to a rod you brought with you.
            </p>
            {/* What is actually in the picture, named. The composite is small on
                a phone and a legendary hook is four pixels of it. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 9 }}>
              <Tag label={rodDef.name} color={rodDef.color} />
              <Tag label={getReel(reelTier).name} color={getReel(reelTier).color} />
              <Tag label={getHook(hookTier).name} color={getHook(hookTier).color} />
              {petDef && <Tag label={petDef.name} color={petDef.accentColor} />}
            </div>
          </div>
        </div>

        {err && (
          <p className="font-karla font-600" style={{ fontSize: '0.8rem', color: '#e6a0a0', marginTop: 10, lineHeight: 1.5 }}>
            {err}
          </p>
        )}

        {/* ── THE BOAT'S THREE NUMBERS ───────────────────────────────────
            Rack, hull and hold, side by side and above everything else, because
            they are what makes this a shipyard rather than a wardrobe. Each
            card is the whole upgrade: what you have, what is next, the price. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7, marginTop: 12 }}>
          <BoatCard
            name="Rod Rack" accent="#67d4e8"
            now={String(slots)} unit={slots === 1 ? 'rod aboard' : 'rods aboard'}
            next={rack >= MAX_RACK_TIER ? null : `${rackSlots(rack + 1)} rods`}
            cost={rackCost}
            busy={busy === 'rack'} disabled={!!busy || doubloons < (rackCost ?? Infinity)}
            onBuy={() => void buy('rack')}
          />
          <BoatCard
            name={HULL_NAMES[Math.min(hull, MAX_HULL_TIER)]} accent="#9fc9e8"
            now={`${Math.round(hullSpeed(hull) * 100)}%`} unit="of top speed"
            next={hull >= MAX_HULL_TIER ? null : `${Math.round(hullSpeed(hull + 1) * 100)}% speed`}
            cost={hullCost}
            busy={busy === 'hull'} disabled={!!busy || doubloons < (hullCost ?? Infinity)}
            onBuy={() => void buy('hull')}
          />
          <BoatCard
            name={getFishHold(hold).name} accent="#f0c040"
            now={String(cap)} unit="fish in the hold"
            next={holdNext ? `${holdNext.capacity} fish` : null}
            cost={holdNext?.cost ?? null}
            busy={busy === 'hold'} disabled={!!busy || doubloons < (holdNext?.cost ?? Infinity)}
            onBuy={() => void buy('hold')}
          />
        </div>

        {/* ── WHAT THE RIG ADDS UP TO ──────────────────────────────────── */}
        <div style={{ marginTop: 12 }}>
          <LoadoutStats
            rodTier={equipped} reelTier={reelTier} hookTier={hookTier} lineTier={p.lineTier}
            completionistEffects={effects}
            fishingLevel={p.fishingLevel}
            sub="Everything in the picture above, added up."
          />
        </div>

        {/* ── THE RACK ─────────────────────────────────────────────────── */}
        <Section title="The rack" sub={`${aboard.length + 1} of ${slots} berths used`}>
          {rods.map(rod => {
            const eff = getEffectiveRod(rod.tier, effects)
            const isEquipped = rod.tier === equipped
            const isAboard = aboard.includes(rod.tier)
            const locked = p.fishingLevel < fishingGearLevelReq(rod)
            return (
              <div key={rod.tier} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.6rem 0.7rem', borderRadius: 12, marginBottom: 6,
                background: isEquipped ? `${rod.color}12` : 'rgba(255,255,255,0.035)',
                border: `1px solid ${isEquipped ? rod.color + '55' : isAboard ? 'rgba(103,212,232,0.4)' : 'rgba(255,255,255,0.09)'}`,
                opacity: locked ? 0.5 : 1,
              }}>
                {rod.slug && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/${rod.slug}_thumb.png`} alt="" className={eff.glow ? rodGlowClass(eff) : undefined}
                    style={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="font-cinzel font-700 block truncate" style={{ fontSize: '0.82rem', color: '#f0ede8' }}>
                    {rod.name}
                  </span>
                  <span className="font-karla font-600 block" style={{ fontSize: '0.6rem', color: 'rgba(190,212,228,0.55)' }}>
                    {locked ? `Fishing ${fishingGearLevelReq(rod)} needed`
                      : isEquipped ? 'In your hands'
                        : isAboard ? 'In the rack' : 'Ashore'}
                  </span>
                </span>
                {!locked && !isEquipped && (
                  <button onClick={() => void toggleAboard(rod.tier)} disabled={!!busy}
                    className="font-karla font-700"
                    style={{
                      flexShrink: 0, padding: '0.3rem 0.6rem', borderRadius: 9, fontSize: '0.6rem',
                      color: isAboard ? '#67d4e8' : 'rgba(190,212,228,0.75)',
                      background: isAboard ? 'rgba(103,212,232,0.14)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isAboard ? 'rgba(103,212,232,0.5)' : 'rgba(255,255,255,0.14)'}`,
                      cursor: busy ? 'default' : 'pointer',
                    }}>
                    {isAboard ? 'Aboard' : 'Load'}
                  </button>
                )}
                {!locked && !isEquipped && (
                  <button onClick={() => void pickRod(rod.tier)} disabled={!!busy}
                    className="font-karla font-700"
                    style={{
                      flexShrink: 0, padding: '0.3rem 0.6rem', borderRadius: 9, fontSize: '0.6rem',
                      color: '#f2ead8', background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.16)', cursor: busy ? 'default' : 'pointer',
                    }}>
                    Equip
                  </button>
                )}
              </div>
            )
          })}
          <p className="font-karla font-600" style={{ fontSize: '0.66rem', color: 'rgba(190,212,228,0.45)', marginTop: 8, lineHeight: 1.6 }}>
            The rod in your hands always sails with you. Berths carry the spares.
          </p>
        </Section>

        {/* ── THE LOCKER ───────────────────────────────────────────────── */}
        <Section title="The locker" sub="Every slot on the boat">
          <GearScreen
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
            showStats={false}
            showWaitTimer={waitTimer}
            onToggleShowWaitTimer={(next) => { setWaitTimer(next); void persistShowWaitTimer(next) }}
            // Nothing to close: this is a page, not a drawer. The pickers close
            // themselves; only the drawer's own dismiss ever used this.
            onClose={() => {}}
          />
        </Section>

        <Link href="/sea" className="font-cinzel font-700 block text-center"
          style={{
            marginTop: 18, padding: '0.75rem', borderRadius: 12, fontSize: '0.9rem',
            color: '#f2ead8', background: 'rgba(180,214,232,0.14)',
            border: '1px solid rgba(180,214,232,0.4)',
          }}>
          Back to the water
        </Link>
      </div>
    </div>
  )
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span className="font-karla font-600 truncate" style={{
      fontSize: '0.6rem', maxWidth: '100%',
      color: `${color}dd`, background: `${color}18`,
      border: `1px solid ${color}45`, padding: '0.14rem 0.5rem', borderRadius: '2rem',
    }}>{label}</span>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 8, gap: 8 }}>
        <h2 className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#dfeaf2' }}>{title}</h2>
        {sub && <span className="font-karla font-600 truncate" style={{ fontSize: '0.66rem', color: 'rgba(190,212,228,0.55)' }}>{sub}</span>}
      </div>
      {children}
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
        fontSize: '0.54rem', letterSpacing: '0.1em', color: `${accent}b0`,
      }}>{name}</p>
      <p className="font-cinzel font-700" style={{ fontSize: '1.25rem', color: '#f2ead8', lineHeight: 1.05, marginTop: 3 }}>
        {now}
      </p>
      <p className="font-karla font-600" style={{ fontSize: '0.58rem', color: 'rgba(190,212,228,0.5)', marginTop: 1, lineHeight: 1.3 }}>
        {unit}
      </p>
      {maxed ? (
        <p className="font-karla font-700" style={{ fontSize: '0.58rem', color: '#7fd6a0', marginTop: 'auto', paddingTop: 10 }}>
          Fully upgraded
        </p>
      ) : (
        <button onClick={onBuy} disabled={disabled} className="font-karla font-700"
          style={{
            marginTop: 'auto', width: '100%', padding: '0.35rem 0.2rem', borderRadius: 9,
            fontSize: '0.58rem', lineHeight: 1.35,
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
