'use client'

/** THE BUNKHOUSE.
 *
 *  The Crew Hall's reason to exist. Benched crew take a bunk and train
 *  passively; the doubloons buy more bunks and a faster drill.
 *
 *  Two things the layout is built around:
 *
 *  - The XP number TICKS. It is the whole feedback loop, so it updates live
 *    rather than only on load, and the clock stops entirely once every bunk has
 *    hit its cap so an idle Crew tab isn't re-rendering for nothing.
 *  - Tapping a bunk, full or empty, opens ONE sheet. Filled bunks offer the
 *    occupant plus the roster to swap them for; no controls are stacked on top
 *    of the crew art.
 */

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { hallTierDef } from '@/lib/crewHall'
import {
  accruedXP, bunkCount, bunkRatePerHour, canBunk, drillName,
  msUntilFull, nextDrillCost, BUNK_CAP_HOURS,
} from '@/lib/crewBunks'
import type { CrewMember, CrewState } from './actions'

const GOLD = '#f0c040'

function fmtLeft(ms: number): string {
  if (ms <= 0) return 'Full'
  const m = Math.ceil(ms / 60_000)
  if (m < 60) return `${m}m to full`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m to full`
}

export default function BunkhousePanel({
  state, artSrc, pending, onBunk, onUnbunk, onClaim, onBuyDrill,
}: {
  state: CrewState
  artSrc: (filename: string) => string
  pending: boolean
  onBunk: (crewId: number) => void
  onUnbunk: (crewId: number) => void
  onClaim: () => void
  onBuyDrill: () => void
}) {
  // Which bunk index the sheet is open for, or null.
  const [picking, setPicking] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const hall = hallTierDef(state.hallTier)
  const slots = bunkCount(state.hallTier)
  const rate = bunkRatePerHour(state.navLevel, state.drillLevel)

  // Bunked crew, in a stable order so a claim doesn't shuffle the grid.
  const bunked = useMemo(() => {
    const byId = new Map(state.roster.map(c => [c.id, c]))
    return state.bunkedCrewIds
      .map(id => byId.get(id))
      .filter((c): c is CrewMember => !!c)
      .sort((a, b) => a.id - b.id)
  }, [state.roster, state.bunkedCrewIds])

  // Per-crew accrual anchors, straight from the server. The panel recomputes
  // the owed XP from these on every tick, using the SAME accruedXP the claim
  // uses, so the number counting up is exactly the number that gets paid.
  const sinceById = state.bunkSince ?? {}

  const owed = bunked.reduce((sum, c) => {
    const since = sinceById[c.id]
    return sum + (since && canBunk(c.xp) ? accruedXP(since, now, rate) : 0)
  }, 0)

  const soonestFull = bunked.reduce((min, c) => {
    const since = sinceById[c.id]
    if (!since || !canBunk(c.xp)) return min
    const left = msUntilFull(since, now)
    return left > 0 ? Math.min(min, left) : min
  }, Infinity)

  // Adaptive clock, borrowed from the trawl indicator: tick while something is
  // still filling, then stop dead. Nothing to animate once every bunk is full.
  useEffect(() => {
    if (!Number.isFinite(soonestFull)) return
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [soonestFull])

  const eligible = useMemo(() => state.roster.filter(c =>
    c.voyageSlot === null && c.raidSlot === null
    && !state.bunkedCrewIds.includes(c.id)
    && !state.trawlingCrewIds.includes(c.id)
    && !state.lockedCrewIds.includes(c.id)
    && canBunk(c.xp),
  ), [state.roster, state.bunkedCrewIds, state.trawlingCrewIds, state.lockedCrewIds])

  const drillCost = nextDrillCost(state.drillLevel)

  const occupant = picking === null ? null : bunked[picking] ?? null

  return (
    <div style={{
      borderRadius: 12, overflow: 'hidden', marginBottom: '0.9rem',
      border: `1px solid ${hall.accent}44`,
      background: `linear-gradient(180deg, ${hall.accent}12 0%, transparent 60%), ${hall.base}`,
    }}>
      {/* Header: what it is, what it pays, and the one button that matters. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0.75rem 0.8rem 0.6rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="font-cinzel font-700" style={{ fontSize: '0.92rem', color: '#f0ede8', lineHeight: 1.1 }}>Bunkhouse</p>
          <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
            {rate.toLocaleString()} XP an hour each, up to {BUNK_CAP_HOURS}h
          </p>
        </div>
        <button
          type="button"
          disabled={pending || owed <= 0}
          onClick={onClaim}
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
          {owed > 0 ? `Collect ${owed.toLocaleString()} XP` : 'Nothing owed'}
        </button>
      </div>

      {/* Bunks. Same three-across tile language as the assign board's seats. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7, padding: '0 0.8rem 0.7rem' }}>
        {Array.from({ length: slots }, (_, i) => {
          const crew = bunked[i]
          if (!crew) {
            return (
              <button key={`empty-${i}`} type="button" disabled={pending}
                onClick={() => setPicking(i)}
                aria-label={`Empty bunk ${i + 1}. Tap to put a crew in it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 92, borderRadius: 11, cursor: 'pointer', font: 'inherit',
                  border: `1.5px dashed ${hall.accent}55`,
                  background: 'rgba(0,0,0,0.26)',
                  touchAction: 'manipulation',
                }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  background: `${hall.accent}1f`, border: `1.5px solid ${hall.accent}99`,
                  color: hall.accent, fontSize: '1rem', lineHeight: 1,
                }}>+</span>
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.54rem', color: `${hall.accent}cc` }}>
                  Empty bunk
                </span>
              </button>
            )
          }
          const since = sinceById[crew.id]
          const maxed = !canBunk(crew.xp)
          const earned = since && !maxed ? accruedXP(since, now, rate) : 0
          const left = since && !maxed ? msUntilFull(since, now) : 0
          return (
            <button key={crew.id} type="button" disabled={pending}
              onClick={() => setPicking(i)}
              aria-label={`${crew.name} in bunk ${i + 1}, ${earned} XP earned. Tap to swap or take them out.`}
              style={{
                position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                minHeight: 92, padding: '0.35rem 0.25rem 0.4rem', borderRadius: 11,
                cursor: 'pointer', font: 'inherit', textAlign: 'center',
                border: `1.5px solid ${maxed ? 'rgba(255,255,255,0.18)' : `${GOLD}66`}`,
                background: `linear-gradient(180deg, ${maxed ? 'rgba(255,255,255,0.05)' : `${GOLD}14`} 0%, rgba(0,0,0,0.25) 100%)`,
                touchAction: 'manipulation',
              }}>
              <div style={{ width: '100%', height: 40, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artSrc(crew.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', opacity: maxed ? 0.5 : 1 }} />
              </div>
              <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.62rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {crew.name}
              </span>
              {maxed ? (
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)' }}>
                  Fully trained
                </span>
              ) : (
                <>
                  <span className="font-cinzel font-700" style={{ fontSize: '0.78rem', lineHeight: 1, color: GOLD, fontVariantNumeric: 'tabular-nums' }}>
                    +{earned.toLocaleString()}
                  </span>
                  <span className="font-karla" style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.4)' }}>
                    {fmtLeft(left)}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>

      {/* Drills are the only thing bought HERE. Bunk count comes from the hall
          tier alone, so the two upgrades never compete for the same tap: you
          upgrade the building for room, and drill for speed. */}
      <div style={{ padding: '0 0.8rem 0.8rem' }}>
        <UpgradeButton
          label={`Drill ${drillName(state.drillLevel + 1)}`} sub="Every bunk trains faster"
          cost={drillCost} balance={state.doubloons} accent={GOLD}
          disabled={pending} onClick={onBuyDrill} />
        <p className="font-karla" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.38)', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>
          Upgrade the hall above for more bunks.
        </p>
      </div>

      {picking !== null && typeof document !== 'undefined' && createPortal(
        <BunkPicker
          occupant={occupant}
          eligible={eligible}
          artSrc={artSrc}
          accent={hall.accent}
          pending={pending}
          onPick={id => { onBunk(id); setPicking(null) }}
          onTakeOut={id => { onUnbunk(id); setPicking(null) }}
          onClose={() => setPicking(null)}
        />, document.body)}
    </div>
  )
}

function UpgradeButton({
  label, sub, cost, balance, accent, disabled, onClick,
}: {
  label: string; sub: string; cost: number; balance: number
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
      <span className="font-karla" style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.38)' }}>{sub}</span>
      <span className="font-cinzel font-700" style={{ fontSize: '0.72rem', marginTop: 2, color: afford ? accent : 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
        {cost.toLocaleString()} ⟡
      </span>
    </button>
  )
}

/** One sheet for both jobs: fill an empty bunk, or swap/remove the occupant. */
function BunkPicker({
  occupant, eligible, artSrc, accent, pending, onPick, onTakeOut, onClose,
}: {
  occupant: CrewMember | null
  eligible: CrewMember[]
  artSrc: (f: string) => string
  accent: string
  pending: boolean
  onPick: (crewId: number) => void
  onTakeOut: (crewId: number) => void
  onClose: () => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'rgba(14,11,7,0.99)', borderTop: `2px solid ${accent}`, borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 44px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '1rem 1rem 0.8rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.56rem', color: accent }}>Bunkhouse</p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.1 }}>
              {occupant ? `Swap out ${occupant.name}` : 'Who trains?'}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e0ddd8', cursor: 'pointer' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {occupant && (
          <div style={{ padding: '0 1rem 0.8rem' }}>
            <button type="button" disabled={pending} onClick={() => onTakeOut(occupant.id)}
              className="font-karla font-700 uppercase"
              style={{ width: '100%', padding: '0.62rem', borderRadius: 9, fontSize: '0.7rem', letterSpacing: '0.05em', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(240,236,228,0.88)', cursor: pending ? 'not-allowed' : 'pointer' }}>
              Take {occupant.name} out
            </button>
            <p className="font-karla" style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: 6, lineHeight: 1.4 }}>
              Whatever they have earned is collected either way.
            </p>
          </div>
        )}

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
