'use client'

// THE SHIPYARD.
//
// Four jobs, in the order you would actually do them: pick the rod in your
// hands, load the spares you are taking, then spend on the boat that carries
// them. Everything on one screen because they are one decision — there is no
// point choosing a fourth rod you have no berth for.

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { RODS, getEffectiveRod, rodGlowClass } from '@/lib/rods'
import { FISH_HOLD_TIERS, getFishHold } from '@/lib/fishHold'
import { fishingGearLevelReq } from '@/lib/gearGating'
import { vibrate } from '@/lib/haptics'
import {
  rackSlots, nextRackCost, MAX_RACK_TIER,
  nextHullCost, MAX_HULL_TIER, hullSpeed, HULL_NAMES,
} from '@/lib/shipyard'
import { buyRackBerth, buyHullTier, setRodsAboard, equipRod } from './actions'
import { upgradeFishHold } from '../fishing/holdActions'

export default function ShipyardClient({
  doubloons: initialDoubloons, fishingLevel, equippedRod: initialEquipped, ownedRods,
  rackTier: initialRack, aboard: initialAboard, hullTier: initialHull,
  holdTier: initialHold, holdCapacity: initialCap, completionistEffects,
}: {
  doubloons: number
  fishingLevel: number
  equippedRod: number
  ownedRods: number[]
  rackTier: number
  aboard: number[]
  hullTier: number
  holdTier: number
  holdCapacity: number
  completionistEffects: number[] | null
}) {
  const [doubloons, setDoubloons] = useState(initialDoubloons)
  const [equipped, setEquipped] = useState(initialEquipped)
  const [rack, setRack] = useState(initialRack)
  const [aboard, setAboard] = useState<number[]>(initialAboard)
  const [hull, setHull] = useState(initialHull)
  const [hold, setHold] = useState(initialHold)
  const [cap, setCap] = useState(initialCap)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')

  /** The header's balance is read once at render and never asks again. */
  function bank(total: number) {
    setDoubloons(total)
    window.dispatchEvent(new CustomEvent('doubloons-changed', { detail: total }))
  }

  const slots = rackSlots(rack)
  /** Spare berths — the equipped rod is in your hands, not in the rack. */
  const spareSlots = slots - 1
  const rackCost = nextRackCost(rack)
  const hullCost = nextHullCost(hull)
  const holdNext = hold < FISH_HOLD_TIERS.length - 1 ? FISH_HOLD_TIERS[hold + 1] : null

  async function pickRod(tier: number) {
    if (busy || tier === equipped) return
    setBusy('rod'); setErr('')
    const r = await equipRod(tier).catch(() => ({ error: 'Could not equip that.' }))
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
    const next = has ? aboard.filter(t => t !== tier) : [...aboard, tier].slice(0, spareSlots)
    if (!has && aboard.length >= spareSlots) {
      setErr(spareSlots === 0
        ? 'You have no spare berths. Buy one below to carry a second rod.'
        : 'The rack is full. Take one off first.')
      return
    }
    setErr('')
    vibrate(8)
    setAboard(next)
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
        if ('error' in r) { setErr(r.error) } else { bank(r.doubloons); setRack(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else if (what === 'hull') {
        const r = await buyHullTier()
        if ('error' in r) { setErr(r.error) } else { bank(r.doubloons); setHull(t => t + 1); vibrate([0, 30, 40, 60]) }
      } else {
        const r = await upgradeFishHold()
        if ('error' in r) { setErr(r.error) } else {
          bank(r.doubloons); setHold(r.newTier); setCap(getFishHold(r.newTier).capacity)
          vibrate([0, 30, 40, 60])
        }
      }
    } catch { setErr('That did not go through. Try again.') }
    setBusy('')
  }

  const rods = RODS.filter(r => ownedRods.includes(r.tier)).sort((a, b) => a.tier - b.tier)

  return (
    <div className="fixed left-0 right-0 top-[44px] bottom-[60px] sm:top-[60px] sm:bottom-0 overflow-y-auto"
      style={{ background: '#08121c' }}>
      <div className="w-full max-w-md mx-auto" style={{ padding: '1rem 1rem 2rem' }}>

        <div className="flex items-baseline justify-between">
          <h1 className="font-cinzel font-700" style={{ fontSize: '1.4rem', color: '#f2ead8' }}>
            The Shipyard
          </h1>
          <span className="font-karla font-700" style={{ fontSize: '0.9rem', color: '#f0c040' }}>
            {doubloons.toLocaleString()} ⟡
          </span>
        </div>
        <p className="font-karla" style={{ fontSize: '0.8rem', color: '#9fb4c2', marginTop: 4, lineHeight: 1.55 }}>
          What you sail with is decided here. Out at sea you can only change to a
          rod you brought with you.
        </p>

        {err && (
          <p className="font-karla font-600" style={{
            fontSize: '0.8rem', color: '#e6a0a0', marginTop: 10, lineHeight: 1.5,
          }}>{err}</p>
        )}

        {/* ── THE RACK ──────────────────────────────────────────────────── */}
        <Section title="Your rods" sub={`${aboard.length + 1} of ${slots} berths used`}>
          {rods.map(rod => {
            const eff = getEffectiveRod(rod.tier, completionistEffects)
            const isEquipped = rod.tier === equipped
            const isAboard = aboard.includes(rod.tier)
            const locked = fishingLevel < fishingGearLevelReq(rod)
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

        {/* ── UPGRADES ──────────────────────────────────────────────────── */}
        <Section title="The boat">
          <Upgrade
            name="Rod rack"
            now={`${slots} rod${slots === 1 ? '' : 's'}`}
            next={rack >= MAX_RACK_TIER ? null : `${rackSlots(rack + 1)} rods`}
            cost={rackCost}
            note="How many rods you can carry to sea."
            busy={busy === 'rack'} disabled={!!busy || doubloons < (rackCost ?? Infinity)}
            onBuy={() => void buy('rack')}
          />
          <Upgrade
            name={HULL_NAMES[Math.min(hull, MAX_HULL_TIER)]}
            now={`${Math.round(hullSpeed(hull) * 100)}% sailing speed`}
            next={hull >= MAX_HULL_TIER ? null : `${Math.round(hullSpeed(hull + 1) * 100)}%`}
            cost={hullCost}
            note="How fast you cross the chart. Nothing else."
            busy={busy === 'hull'} disabled={!!busy || doubloons < (hullCost ?? Infinity)}
            onBuy={() => void buy('hull')}
          />
          <Upgrade
            name={getFishHold(hold).name}
            now={`${cap} fish`}
            next={holdNext ? `${holdNext.capacity} fish` : null}
            cost={holdNext?.cost ?? null}
            note="How much you can land before you have to sell."
            busy={busy === 'hold'} disabled={!!busy || doubloons < (holdNext?.cost ?? Infinity)}
            onBuy={() => void buy('hold')}
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

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 20 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 8 }}>
        <h2 className="font-cinzel font-700" style={{ fontSize: '0.95rem', color: '#dfeaf2' }}>{title}</h2>
        {sub && <span className="font-karla font-600" style={{ fontSize: '0.66rem', color: 'rgba(190,212,228,0.55)' }}>{sub}</span>}
      </div>
      {children}
    </div>
  )
}

function Upgrade({ name, now, next, cost, note, busy, disabled, onBuy }: {
  name: string; now: string; next: string | null; cost: number | null; note: string
  busy: boolean; disabled: boolean; onBuy: () => void
}) {
  const maxed = next === null || cost === null
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      style={{
        padding: '0.75rem 0.85rem', borderRadius: 12, marginBottom: 8,
        background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)',
      }}>
      <div className="flex items-baseline justify-between">
        <span className="font-cinzel font-700" style={{ fontSize: '0.86rem', color: '#f0ede8' }}>{name}</span>
        <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#dfeaf2' }}>{now}</span>
      </div>
      <p className="font-karla font-600" style={{ fontSize: '0.64rem', color: 'rgba(190,212,228,0.5)', marginTop: 3, lineHeight: 1.5 }}>
        {note}
      </p>
      {maxed ? (
        <p className="font-karla font-700" style={{ fontSize: '0.68rem', color: '#7fd6a0', marginTop: 8 }}>
          Fully upgraded
        </p>
      ) : (
        <button onClick={onBuy} disabled={disabled}
          className="font-karla font-700"
          style={{
            marginTop: 9, width: '100%', padding: '0.5rem', borderRadius: 10, fontSize: '0.74rem',
            color: disabled ? 'rgba(242,234,216,0.4)' : '#f2ead8',
            background: 'rgba(240,192,64,0.14)',
            border: '1px solid rgba(240,192,64,0.4)',
            cursor: disabled ? 'default' : 'pointer',
          }}>
          {busy ? '…' : `${next} · ${cost.toLocaleString()} ⟡`}
        </button>
      )}
    </motion.div>
  )
}
