'use client'

/** THE HALL'S BUNKS.
 *
 *  Renders INSIDE the hall hero, not as a panel of its own. There is no
 *  separate "Bunkhouse": the hall is the building, the bunks are what is in it,
 *  and one thing with one border reads better than a box inside a box.
 *
 *  Three upgrades, deliberately non-overlapping so no two buttons ever mean the
 *  same thing:
 *
 *    hall tier  ->  HOW MANY bunks      (the hero's own upgrade button, above)
 *    Drills     ->  XP PER HOUR
 *    Stores     ->  HOW MANY HOURS before a bunk fills
 *
 *  A bunk is a COMMITMENT: a hand put in is locked there for the whole stint,
 *  so the tile is a countdown, not a running total. There is no take-them-out
 *  button while it runs, because there is no early exit to offer.
 *
 *  The clock ticks only while something is still running, then stops dead, so
 *  an idle tab is not re-rendering for nothing.
 */

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER, hallTierDef } from '@/lib/crewHall'
import {
  bunkCount, bunkRatePerHour, canBunk, drillsMaxed, msUntilDone, stintDone,
  stintProgress, stintXP, nextDrillCost, nextStoresCost, storesCapHours,
  storesMaxed, tierNumeral,
} from '@/lib/crewBunks'
import type { CrewMember, CrewState } from './actions'

const GOLD = '#f0c040'
/** Every bunk the hall can ever hold, drawn whether or not it is unlocked. */
const MAX_BUNKS = 6

/** One picture per Drills tier, matching DRILL_MAX_LEVEL. Kept as its own
 *  constant so a mismatch between "tiers that exist" and "tiers we drew" shows
 *  up here rather than as a silently missing image on the top upgrade. */
const DRILL_ART_MAX = 6

function fmtLeft(ms: number): string {
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m}m left`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m left`
}

function fmtStint(h: number): string {
  return h === 1 ? '1 hour' : `${h} hours`
}

export default function HallBunks({
  state, artSrc, accent, pending, pop, onBunk, onCollectOne, onBuyDrill, onBuyStores,
}: {
  state: CrewState
  artSrc: (filename: string) => string
  /** The hall tier's accent, so the bunks read as part of the building. */
  accent: string
  pending: boolean
  /** Which tree just went up, so its art can pop IN PLACE rather than behind
   *  an overlay the hero's overflow:hidden would clip. */
  pop: 'drill' | 'stores' | null
  onBunk: (crewId: number) => void
  /** Collect one hand's finished stint. The only way to collect: the reward
   *  belongs to a face, not to a header button. */
  onCollectOne: (crewId: number) => void
  onBuyDrill: () => void
  onBuyStores: () => void
}) {
  const [picking, setPicking] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const slots = bunkCount(state.hallTier)
  const rate = bunkRatePerHour(state.navLevel, state.drillLevel)
  const cap = state.capHours

  // Stable order, so a claim never reshuffles the grid under your finger.
  const bunked = useMemo(() => {
    const byId = new Map(state.roster.map(c => [c.id, c]))
    return state.bunkedCrewIds
      .map(id => byId.get(id))
      .filter((c): c is CrewMember => !!c)
      .sort((a, b) => a.id - b.id)
  }, [state.roster, state.bunkedCrewIds])

  // Per-bunk terms. A tile shows what ITS hand agreed to, which after an
  // upgrade is not what the hall now offers.
  const termsById = state.bunkTerms ?? {}

  // What a NEW stint would be worth, for the header line.
  const payout = stintXP(rate, cap)

  const anyRunning = bunked.some(c => {
    const t = termsById[c.id]
    return !!t && !stintDone(t.since, now, t.cap)
  })

  // Tick every 10s while a stint is running, then stop. A minute's granularity
  // is all the countdown shows, so anything finer is wasted renders.
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [anyRunning])

  const eligible = useMemo(() => state.roster.filter(c =>
    c.voyageSlot === null && c.raidSlot === null
    && !state.bunkedCrewIds.includes(c.id)
    && !state.trawlingCrewIds.includes(c.id)
    && !state.lockedCrewIds.includes(c.id)
    && canBunk(c.xp),
  ), [state.roster, state.bunkedCrewIds, state.trawlingCrewIds, state.lockedCrewIds])

  return (
    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: `1px solid ${accent}2e` }}>
      {/* No collect-all button. A hand comes off their own bunk by tapping
          THEM, which is the only place the reward is attached to a face — a
          header button that swept them all up made the good bit anonymous.
          The line just states the current deal. */}
      <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.72)', lineHeight: 1.5, marginBottom: '0.6rem' }}>
        A stint is <span style={{ color: '#f0ede8', fontWeight: 700 }}>{fmtStint(cap)}</span> for{' '}
        <span style={{ color: '#f0ede8', fontWeight: 700 }}>{payout.toLocaleString()} XP</span>.
        They cannot leave until it ends.
      </p>

      {/* ALL SIX slots, always. A new captain sees the whole hall and what it
          will hold, with the ones past their tier locked rather than missing —
          the same reason the assign board draws six seats and locks the ones
          the hull has not opened yet. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        {Array.from({ length: MAX_BUNKS }, (_, i) => {
          const crew = bunked[i]
          if (i >= slots) {
            // Which hall opens THIS one, so the lock names its own key.
            // i is 0-BASED, so slot i is bunk i+1, and tier N opens bunk N —
            // hence i + 1. Passing i named the tier that opens the PREVIOUS
            // bunk, so every lock was one tier short.
            const opensAt = hallTierDef(Math.min(CREW_HALL_MAX_TIER, i + 1))
            return (
              <div key={`locked-${i}`} title={`${opensAt.name} opens this bunk`}
                aria-label={`Locked bunk. ${opensAt.name} opens it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 100, borderRadius: 11,
                  border: '1px dashed rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.22)',
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" /><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
                </svg>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.35, padding: '0 0.2rem' }}>
                  {opensAt.name.replace(' Hall', '')}
                </span>
              </div>
            )
          }
          if (!crew) {
            return (
              <button key={`empty-${i}`} type="button" disabled={pending}
                onClick={() => setPicking(i)}
                aria-label={`Empty bunk ${i + 1}. Tap to put a crew in it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 100, borderRadius: 11, cursor: 'pointer', font: 'inherit',
                  border: `1.5px dashed ${accent}55`, background: 'rgba(0,0,0,0.28)',
                  touchAction: 'manipulation',
                }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  background: `${accent}1f`, border: `1.5px solid ${accent}99`,
                  color: accent, fontSize: '1rem', lineHeight: 1,
                }}>+</span>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: `${accent}dd` }}>
                  Empty bunk
                </span>
              </button>
            )
          }
          const t = termsById[crew.id]
          const maxed = !canBunk(crew.xp)
          const done = !t || stintDone(t.since, now, t.cap)
          const left = t ? msUntilDone(t.since, now, t.cap) : 0
          const pct = t ? stintProgress(t.since, now, t.cap) : 1
          // What THIS hand is owed, which after an upgrade differs from what a
          // fresh stint would pay.
          const tilePay = t ? stintXP(t.rate, t.cap) : payout
          return (
            <button key={crew.id} type="button" disabled={pending || !done}
              onClick={() => { if (done) onCollectOne(crew.id) }}
              title={done ? `Collect ${crew.name} and free the bunk` : `Locked in for another ${fmtLeft(left)}`}
              aria-label={done
                ? `${crew.name} has finished training. Collect to free the bunk.`
                : `${crew.name} is training, ${fmtLeft(left)}.`}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                minHeight: 100, padding: '0.4rem 0.25rem 0.45rem', borderRadius: 11,
                cursor: 'pointer', font: 'inherit', textAlign: 'center',
                border: `1.5px solid ${done ? `${GOLD}aa` : 'rgba(255,255,255,0.16)'}`,
                background: `linear-gradient(180deg, ${done ? `${GOLD}1f` : 'rgba(255,255,255,0.04)'} 0%, rgba(0,0,0,0.25) 100%)`,
                touchAction: 'manipulation',
              }}>
              <div style={{ width: '100%', height: 38, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artSrc(crew.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity: done ? 1 : 0.75 }} />
              </div>
              <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.72rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {crew.name}
              </span>
              {done ? (
                <span className="font-cinzel font-700" style={{ fontSize: '0.92rem', lineHeight: 1, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                  {maxed ? 'Done' : `+${tilePay.toLocaleString()}`}
                </span>
              ) : (
                <>
                  <span className="font-karla font-600" style={{ fontSize: '0.64rem', color: 'rgba(255,255,255,0.72)', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtLeft(left)}
                  </span>
                  {/* scaleX on a solid fill, never width — width is layout. */}
                  <span aria-hidden style={{ display: 'block', width: '80%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden', marginTop: 2 }}>
                    <span style={{ display: 'block', width: '100%', height: '100%', borderRadius: 2, background: GOLD, transformOrigin: 'left', transform: `scaleX(${pct})`, transition: 'transform 0.4s linear' }} />
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Two trees doing different jobs. Drills is the only one that raises
          throughput (a stint pays rate x hours and takes hours, so XP per DAY
          is rate x 24 whatever the stint length). Stores buys fewer trips back
          to collect, which is why it is cheap and stops at six hours. */}
      <div style={{ display: 'flex', gap: 7, marginTop: '0.65rem' }}>
        {drillsMaxed(state.drillLevel) ? (
          <MaxedCard art={`/crew/drill_${DRILL_ART_MAX}.png`} label="Drills mastered"
            sub={`${rate.toLocaleString()} XP/hr`} accent={GOLD} popping={pop === 'drill'} />
        ) : (
          <UpgradeButton
            label={`Drills ${tierNumeral(state.drillLevel + 1)}`}
            art="/crew/drill_" tier={Math.min(state.drillLevel, DRILL_ART_MAX)} popping={pop === 'drill'}
            now={`${rate.toLocaleString()} XP/hr`}
            next={`${bunkRatePerHour(state.navLevel, state.drillLevel + 1).toLocaleString()} XP/hr`}
            cost={nextDrillCost(state.drillLevel)} balance={state.doubloons}
            accent={GOLD} disabled={pending} onClick={onBuyDrill} />
        )}
        {storesMaxed(state.storesLevel) ? (
          <MaxedCard art={`/crew/stores_${state.storesLevel}.png`} label="Stores full"
            sub={`${cap}h stints`} accent="#7fc4a8" popping={pop === 'stores'} />
        ) : (
          <UpgradeButton
            label={`Stores ${tierNumeral(state.storesLevel + 1)}`}
            art="/crew/stores_" tier={state.storesLevel} popping={pop === 'stores'}
            now={`${cap}h stints`}
            next={`${storesCapHours(state.storesLevel + 1)}h stints`}
            cost={nextStoresCost(state.storesLevel)} balance={state.doubloons}
            accent="#7fc4a8" disabled={pending} onClick={onBuyStores} />
        )}
      </div>

      {picking !== null && typeof document !== 'undefined' && createPortal(
        <BunkPicker
          eligible={eligible} artSrc={artSrc} accent={accent} pending={pending}
          stint={fmtStint(cap)} payout={payout}
          onPick={id => { onBunk(id); setPicking(null) }}
          onClose={() => setPicking(null)}
        />, document.body)}
    </div>
  )
}

/** Shows what you have and what you would get, not just a price — the whole
 *  question with an upgrade tree is "is this worth it". */
function UpgradeButton({
  label, art, tier, popping, now, next, cost, balance, accent, disabled, onClick,
}: {
  popping?: boolean
  label: string
  /** '/crew/drill_' or '/crew/stores_'; the CURRENT tier is appended, so the
   *  picture improves as the tree is bought, like the hall building above. */
  art: string
  tier: number
  now: string; next: string; cost: number; balance: number
  accent: string; disabled: boolean; onClick: () => void
}) {
  const afford = balance >= cost
  return (
    <button type="button" disabled={disabled || !afford} onClick={onClick}
      title={afford ? `${cost.toLocaleString()} doubloons` : `Need ${(cost - balance).toLocaleString()} more`}
      className="active:scale-95"
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
        padding: '0.55rem 0.35rem 0.6rem', borderRadius: 11, font: 'inherit',
        background: afford
          ? `linear-gradient(180deg, ${accent}22 0%, ${accent}0b 100%)`
          : 'rgba(255,255,255,0.03)',
        border: `1px solid ${afford ? `${accent}66` : 'rgba(255,255,255,0.1)'}`,
        boxShadow: afford ? `inset 0 1px 0 ${accent}33` : undefined,
        cursor: disabled || !afford ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, touchAction: 'manipulation',
        transition: 'transform 0.08s',
      }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* ART PENDING: /crew/drill_*.png and /crew/stores_*.png do not exist
          yet. Falls back one tier, then hides entirely, so this is a clean
          text button until the art lands and gains the picture the moment it
          does. Never a broken-image box. */}
      <motion.img src={`${art}${tier}.png`} alt="" aria-hidden decoding="async"
        // Keyed on the tier so buying one REMOUNTS the picture in place.
        key={tier}
        initial={popping ? { scale: 0.5, opacity: 0, rotate: -8 } : { opacity: 0 }}
        animate={popping ? { scale: [0.5, 1.18, 1], opacity: 1, rotate: 0 } : { opacity: 1 }}
        transition={popping ? { duration: 0.6, times: [0, 0.66, 1], ease: 'easeOut' } : { duration: 0.2 }}
        style={{ width: 54, height: 54, objectFit: 'contain', filter: afford ? `drop-shadow(0 3px 8px ${accent}55)` : 'grayscale(0.7) brightness(0.7)' }}
        onError={e => {
          const img = e.target as HTMLImageElement
          if (!img.dataset.step && tier > 1) { img.dataset.step = '1'; img.src = `${art}${tier - 1}.png`; return }
          img.style.display = 'none'
        }} />
      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.7rem', color: afford ? '#f0ede8' : 'rgba(255,255,255,0.45)' }}>
        {label}
      </span>
      <span className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.58)', whiteSpace: 'nowrap' }}>
        {now} <span style={{ color: afford ? accent : 'rgba(255,255,255,0.3)' }}>&rarr; {next}</span>
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.84rem', marginTop: 3, color: afford ? accent : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
        {cost.toLocaleString()} ⟡
      </span>
    </button>
  )
}

/** A finished ladder. Keeps its picture, so a tree does not lose its art at
 *  the exact moment you finish paying for it. */
function MaxedCard({ art, label, sub, accent, popping }: { art: string; label: string; sub: string; accent: string; popping?: boolean }) {
  return (
    <div className="font-karla" style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, padding: '0.55rem 0.35rem 0.6rem', borderRadius: 11,
      background: `${accent}18`, border: `1px solid ${accent}55`,
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <motion.img src={art} alt="" aria-hidden decoding="async"
        initial={popping ? { scale: 0.5, opacity: 0, rotate: -8 } : false}
        animate={popping ? { scale: [0.5, 1.18, 1], opacity: 1, rotate: 0 } : {}}
        transition={{ duration: 0.6, times: [0, 0.66, 1], ease: 'easeOut' }}
        style={{ width: 54, height: 54, objectFit: 'contain', filter: `drop-shadow(0 3px 8px ${accent}66)` }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.7rem', color: accent }}>
        {label}
      </span>
      <span style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.58)' }}>{sub}</span>
    </div>
  )
}

/** One sheet for both jobs: fill an empty bunk, or swap/remove the occupant. */
function BunkPicker({
  eligible, artSrc, accent, pending, stint, payout, onPick, onClose,
}: {
  eligible: CrewMember[]
  artSrc: (f: string) => string
  accent: string
  pending: boolean
  stint: string
  payout: number
  onPick: (crewId: number) => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'rgba(14,11,7,0.99)', borderTop: `2px solid ${accent}`, borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 44px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '1rem 1rem 0.8rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.66rem', color: accent }}>Crew Hall</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.1 }}>
              Who trains?
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0ddd8', cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Said before the tap, not after. Whoever goes in is committed. */}
        <p className="font-karla" style={{ padding: '0 1rem 0.8rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
          Whoever you pick is in for <span style={{ color: accent }}>{stint}</span> and earns{' '}
          <span style={{ color: accent }}>{payout.toLocaleString()} XP</span>. They cannot raid, sail,
          trawl or be dismissed until the stint ends.
        </p>

        <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 1rem 1.4rem' }}>
          {eligible.length === 0 ? (
            <p className="font-karla text-center" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, padding: '1.6rem 0.5rem' }}>
              Every hand you have is either sailing, trawling, already in a bunk, or fully trained. Only benched crew can train.
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {eligible.map(m => (
                <button key={m.id} type="button" disabled={pending} onClick={() => onPick(m.id)}
                  aria-label={`Put ${m.name} in a bunk`}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    padding: '0.5rem 0.35rem', borderRadius: 12, textAlign: 'center',
                    background: 'rgba(24,20,14,0.96)', border: `1px solid ${accent}44`,
                    cursor: pending ? 'not-allowed' : 'pointer', font: 'inherit',
                    opacity: pending ? 0.55 : 1, touchAction: 'manipulation',
                  }}>
                  <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={artSrc(m.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  </div>
                  <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.78rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                  </span>
                  <span className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#b8b1a8', fontVariantNumeric: 'tabular-nums' }}>
                    Lv {crewLevelFromXP(m.xp)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
