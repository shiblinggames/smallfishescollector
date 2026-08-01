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
import { createPortal } from 'react-dom'
import { crewLevelFromXP } from '@/lib/crewLevel'
import {
  bunkCount, bunkRatePerHour, canBunk, msUntilDone, stintDone, stintProgress,
  stintXP, nextDrillCost, nextStoresCost, storesCapHours, tierNumeral,
} from '@/lib/crewBunks'
import type { CrewMember, CrewState } from './actions'

const GOLD = '#f0c040'

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
  state, artSrc, accent, pending, onBunk, onClaim, onBuyDrill, onBuyStores,
}: {
  state: CrewState
  artSrc: (filename: string) => string
  /** The hall tier's accent, so the bunks read as part of the building. */
  accent: string
  pending: boolean
  onBunk: (crewId: number) => void
  onClaim: () => void
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

  const sinceById = state.bunkSince ?? {}

  const payout = stintXP(rate, cap)
  const readyCount = bunked.filter(c => {
    const since = sinceById[c.id]
    return !!since && stintDone(since, now, cap)
  }).length
  const owed = bunked.filter(c => {
    const since = sinceById[c.id]
    return !!since && stintDone(since, now, cap) && canBunk(c.xp)
  }).length * payout

  const anyRunning = bunked.some(c => {
    const since = sinceById[c.id]
    return !!since && !stintDone(since, now, cap)
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
      {/* What the bunks pay, and the one button that matters. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '0.6rem' }}>
        <p className="font-karla" style={{ flex: 1, minWidth: 0, fontSize: '0.64rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.4 }}>
          A stint is <span style={{ color: '#f0ede8', fontWeight: 700 }}>{fmtStint(cap)}</span> for{' '}
          <span style={{ color: '#f0ede8', fontWeight: 700 }}>{payout.toLocaleString()} XP</span>.
          They cannot leave until it ends.
        </p>
        <button type="button" disabled={pending || owed <= 0} onClick={onClaim}
          className="font-karla font-700 uppercase"
          style={{
            flexShrink: 0, padding: '0.5rem 0.85rem', borderRadius: 9,
            fontSize: '0.68rem', letterSpacing: '0.06em', whiteSpace: 'nowrap',
            background: owed > 0 ? `${GOLD}26` : 'rgba(255,255,255,0.04)',
            border: `1px solid ${owed > 0 ? `${GOLD}88` : 'rgba(255,255,255,0.14)'}`,
            color: owed > 0 ? GOLD : 'rgba(255,255,255,0.35)',
            cursor: pending || owed <= 0 ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1, touchAction: 'manipulation',
          }}>
          {owed > 0 ? `Collect ${owed.toLocaleString()}` : readyCount > 0 ? 'Collect' : 'None ready'}
        </button>
      </div>

      {/* Bunks. Same three-across tile language as the assign board's seats. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        {Array.from({ length: slots }, (_, i) => {
          const crew = bunked[i]
          if (!crew) {
            return (
              <button key={`empty-${i}`} type="button" disabled={pending}
                onClick={() => setPicking(i)}
                aria-label={`Empty bunk ${i + 1}. Tap to put a crew in it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 88, borderRadius: 11, cursor: 'pointer', font: 'inherit',
                  border: `1.5px dashed ${accent}55`, background: 'rgba(0,0,0,0.28)',
                  touchAction: 'manipulation',
                }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  background: `${accent}1f`, border: `1.5px solid ${accent}99`,
                  color: accent, fontSize: '1rem', lineHeight: 1,
                }}>+</span>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: `${accent}cc` }}>
                  Empty bunk
                </span>
              </button>
            )
          }
          const since = sinceById[crew.id]
          const maxed = !canBunk(crew.xp)
          const done = !since || stintDone(since, now, cap)
          const left = since ? msUntilDone(since, now, cap) : 0
          const pct = since ? stintProgress(since, now, cap) : 1
          return (
            <button key={crew.id} type="button" disabled={pending || !done}
              onClick={() => { if (done) onClaim() }}
              title={done ? 'Collect and free the bunk' : `Locked in for another ${fmtLeft(left)}`}
              aria-label={done
                ? `${crew.name} has finished training. Collect to free the bunk.`
                : `${crew.name} is training, ${fmtLeft(left)}.`}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                minHeight: 88, padding: '0.35rem 0.25rem 0.4rem', borderRadius: 11,
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
              <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.62rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {crew.name}
              </span>
              {done ? (
                <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', lineHeight: 1, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                  {maxed ? 'Done' : `+${payout.toLocaleString()}`}
                </span>
              ) : (
                <>
                  <span className="font-karla font-600" style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.6)', fontVariantNumeric: 'tabular-nums' }}>
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

      {/* The two trees. Neither caps, and they buy different things: one is XP
          per hour, the other is how many hours. */}
      <div style={{ display: 'flex', gap: 7, marginTop: '0.65rem' }}>
        <UpgradeButton
          label={`Drills ${tierNumeral(state.drillLevel + 1)}`}
          now={`${rate.toLocaleString()} XP/hr`}
          next={`${bunkRatePerHour(state.navLevel, state.drillLevel + 1).toLocaleString()} XP/hr`}
          cost={nextDrillCost(state.drillLevel)} balance={state.doubloons}
          accent={GOLD} disabled={pending} onClick={onBuyDrill} />
        <UpgradeButton
          label={`Stores ${tierNumeral(state.storesLevel + 1)}`}
          now={`${cap}h of training`}
          next={`${storesCapHours(state.storesLevel + 1)}h of training`}
          cost={nextStoresCost(state.storesLevel)} balance={state.doubloons}
          accent="#7fc4a8" disabled={pending} onClick={onBuyStores} />
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
  label, now, next, cost, balance, accent, disabled, onClick,
}: {
  label: string; now: string; next: string; cost: number; balance: number
  accent: string; disabled: boolean; onClick: () => void
}) {
  const afford = balance >= cost
  return (
    <button type="button" disabled={disabled || !afford} onClick={onClick}
      title={afford ? `${cost.toLocaleString()} doubloons` : `Need ${(cost - balance).toLocaleString()} more`}
      style={{
        flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        padding: '0.5rem 0.35rem', borderRadius: 9, font: 'inherit',
        background: afford ? `${accent}14` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${afford ? `${accent}55` : 'rgba(255,255,255,0.1)'}`,
        cursor: disabled || !afford ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1, touchAction: 'manipulation',
      }}>
      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.6rem', color: afford ? '#f0ede8' : 'rgba(255,255,255,0.45)' }}>
        {label}
      </span>
      <span className="font-karla" style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap' }}>
        {now} <span style={{ color: afford ? accent : 'rgba(255,255,255,0.3)' }}>&rarr; {next}</span>
      </span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', marginTop: 2, color: afford ? accent : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
        {cost.toLocaleString()} ⟡
      </span>
    </button>
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
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: accent }}>Crew Hall</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.1 }}>
              Who trains?
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0ddd8', cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Said before the tap, not after. Whoever goes in is committed. */}
        <p className="font-karla" style={{ padding: '0 1rem 0.8rem', fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
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
                  <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.7rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {m.name}
                  </span>
                  <span className="font-karla font-600" style={{ fontSize: '0.6rem', color: '#a9a29a', fontVariantNumeric: 'tabular-nums' }}>
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
