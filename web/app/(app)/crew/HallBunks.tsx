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

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { CREW_HALL_MAX_TIER, hallTierDef } from '@/lib/crewHall'
import {
  bunkCount, bunkRatePerHour, canBunk, drillsMaxed, hallTierRequiredFor,
  isLeviathanSlot, ladderHallLocked, msUntilDone, stintDone, stintProgress,
  stintXP, nextDrillCost, nextStoresCost, storesCapHours, storesMaxed,
  tierNumeral, LEVIATHAN_COLOR,
} from '@/lib/crewBunks'
import type { CrewMember, CrewState } from './actions'

const GOLD = '#f0c040'
/** Every bunk the hall can ever hold, drawn whether or not it is unlocked. */
const MAX_BUNKS = 6

/** The Leviathan bunk's colour, shared with the claim reveal. */
const LEVIATHAN = LEVIATHAN_COLOR

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

/** The same length, short enough to sit in a three-term sum on a phone. */
function fmtStintShort(h: number): string {
  return `${h}h`
}

export default function HallBunks({
  state, artSrc, accent, pending, pop, offers, onOpenOffer, onBunk, onCollectOne,
  onBuyDrill, onBuyStores,
}: {
  state: CrewState
  artSrc: (filename: string) => string
  /** The hall tier's accent, so the bunks read as part of the building. */
  accent: string
  pending: boolean
  /** Which tree just went up, so its art can pop IN PLACE rather than behind
   *  an overlay the hero's overflow:hidden would clip. */
  pop: 'drill' | 'stores' | null
  /** crew id -> the trait the deep is offering them, still undecided. */
  offers: Record<number, string>
  onOpenOffer: (crewId: number) => void
  onBunk: (crewId: number, slot: number) => void
  /** Collect one hand's finished stint. The only way to collect: the reward
   *  belongs to a face, not to a header button. */
  onCollectOne: (crewId: number) => void
  onBuyDrill: () => void
  onBuyStores: () => void
}) {
  const [picking, setPicking] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const slots = bunkCount(state.hallTier)
  const rate = bunkRatePerHour(state.drillLevel)
  const cap = state.capHours

  // Per-bunk terms. A tile shows what ITS hand agreed to, which after an
  // upgrade is not what the hall now offers.
  const termsById = state.bunkTerms ?? {}

  // WHO IS IN WHICH BUNK, by the slot stored on their row. This used to be id
  // order against the grid, which meant a hand's bunk could silently move when
  // a different one was collected. It has to be a stored fact now that bunk 6
  // does something the other five do not.
  const bySlot = useMemo(() => {
    const byId = new Map(state.roster.map(c => [c.id, c]))
    const out: (CrewMember | undefined)[] = new Array(MAX_BUNKS).fill(undefined)
    const strays: CrewMember[] = []
    for (const id of state.bunkedCrewIds) {
      const crew = byId.get(id)
      if (!crew) continue
      const slot = termsById[id]?.slot
      if (slot != null && slot >= 0 && slot < MAX_BUNKS && !out[slot]) out[slot] = crew
      else strays.push(crew)
    }
    // A row with no slot predates the column. Drop them into the first free
    // bunk so they are still visible and still collectable, rather than
    // vanishing from a grid that is now keyed on a column they lack.
    for (const crew of strays.sort((a, b) => a.id - b.id)) {
      const free = out.findIndex(x => !x)
      if (free >= 0) out[free] = crew
    }
    return out
  }, [state.roster, state.bunkedCrewIds, termsById])

  // What a NEW stint would be worth, for the header line.
  const payout = stintXP(rate, cap)

  const anyRunning = bySlot.some(c => {
    const t = c ? termsById[c.id] : null
    return !!t && !stintDone(t.since, now, t.cap)
  })

  // Tick every 10s while a stint is running, then stop. A minute's granularity
  // is all the countdown shows, so anything finer is wasted renders.
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [anyRunning])

  // Hands with an untaken offer. Ordered by roster position rather than by id
  // so the row does not reshuffle as decisions are made.
  const waitingOffers = useMemo(
    () => state.roster.filter(c => offers[c.id]),
    [state.roster, offers])

  const eligible = useMemo(() => state.roster.filter(c =>
    c.voyageSlot === null && c.raidSlot === null
    && !state.bunkedCrewIds.includes(c.id)
    && !state.trawlingCrewIds.includes(c.id)
    && !state.lockedCrewIds.includes(c.id)
    && canBunk(c.xp),
  ), [state.roster, state.bunkedCrewIds, state.trawlingCrewIds, state.lockedCrewIds])

  return (
    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: `1px solid ${accent}2e` }}>
      {/* THE SUM, not a sentence. What a stint pays is stint length x rate,
          and both halves are things you buy, so showing the working with each
          term labelled by the ladder that set it makes the two upgrade buttons
          below self-explanatory. A prose version hid which number moved when
          you bought something.

          No collect-all button either. A hand comes off their own bunk by
          tapping THEM, which is the only place the reward is attached to a
          face; a header button that swept them all up made the good bit
          anonymous. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '0.6rem 0.5rem', borderRadius: 11, marginBottom: '0.6rem',
        background: 'rgba(0,0,0,0.26)', border: `1px solid ${accent}33`,
      }}>
        <SumTerm value={fmtStintShort(cap)} label={`Stores ${tierNumeral(state.storesLevel)}`} />
        <SumOp>&times;</SumOp>
        <SumTerm value={`${rate.toLocaleString()}/hr`} label={`Drills ${tierNumeral(state.drillLevel)}`} />
        <SumOp>=</SumOp>
        <SumTerm value={`${payout.toLocaleString()} XP`} label="per stint" accent={accent} />
      </div>

      {/* DECISIONS WAITING. An offer survives the reveal that produced it, so
          a captain who closed the tab mid-choice finds it here rather than
          losing the whole stint. Above the grid because it is the only thing
          on this panel that is waiting on the player. */}
      {waitingOffers.length > 0 && (
        <div style={{
          marginBottom: '0.6rem', padding: '0.6rem 0.65rem', borderRadius: 11,
          background: `${LEVIATHAN}12`, border: `1px solid ${LEVIATHAN}55`,
        }}>
          <p className="font-karla font-700 uppercase tracking-[0.12em]" style={{ fontSize: '0.58rem', color: LEVIATHAN, marginBottom: 6 }}>
            {waitingOffers.length === 1 ? 'A trait offer awaits your word' : `${waitingOffers.length} trait offers await your word`}
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {waitingOffers.map(crew => (
              <button key={crew.id} type="button" disabled={pending}
                onClick={() => onOpenOffer(crew.id)}
                aria-label={`Decide ${crew.name}'s offered trait`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '0.3rem 0.6rem 0.3rem 0.3rem',
                  borderRadius: 999, font: 'inherit', cursor: pending ? 'not-allowed' : 'pointer',
                  background: 'rgba(0,0,0,0.32)', border: `1px solid ${LEVIATHAN}66`,
                  touchAction: 'manipulation',
                }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={artSrc(crew.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                  style={{ width: 24, height: 24, objectFit: 'contain' }} />
                <span className="font-karla font-700" style={{ fontSize: '0.72rem', color: '#eee8de' }}>{crew.name}</span>
                <span className="font-karla font-700 uppercase" style={{ fontSize: '0.58rem', letterSpacing: '0.08em', color: LEVIATHAN }}>Decide</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ALL SIX slots, always. A new captain sees the whole hall and what it
          will hold, with the ones past their tier locked rather than missing —
          the same reason the assign board draws six seats and locks the ones
          the hull has not opened yet. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 7 }}>
        {Array.from({ length: MAX_BUNKS }, (_, i) => {
          const crew = bySlot[i]
          // Bunk 6 is the Leviathan bunk. It wears its own colour in every
          // state it can be in — locked, empty and occupied — so it never
          // looks like the other five with a note attached.
          const lev = isLeviathanSlot(i)
          const tint = lev ? LEVIATHAN : accent
          if (i >= slots) {
            // Which hall opens THIS one, so the lock names its own key.
            // i is 0-BASED, so slot i is bunk i+1, and tier N opens bunk N —
            // hence i + 1. Passing i named the tier that opens the PREVIOUS
            // bunk, so every lock was one tier short.
            const opensAt = hallTierDef(Math.min(CREW_HALL_MAX_TIER, i + 1))
            return (
              <div key={`locked-${i}`}
                title={lev ? `${opensAt.name} opens the Leviathan bunk, which rolls a new trait every stint` : `${opensAt.name} opens this bunk`}
                aria-label={lev
                  ? `Locked. ${opensAt.name} opens the Leviathan bunk, which rolls a new trait every stint.`
                  : `Locked bunk. ${opensAt.name} opens it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 100, borderRadius: 11,
                  border: lev ? `1px dashed ${LEVIATHAN}55` : '1px dashed rgba(255,255,255,0.12)',
                  background: lev ? `linear-gradient(180deg, ${LEVIATHAN}12 0%, rgba(0,0,0,0.3) 100%)` : 'rgba(0,0,0,0.22)',
                }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={lev ? `${LEVIATHAN}99` : 'rgba(255,255,255,0.32)'} strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <rect x="4.5" y="11" width="15" height="9.5" rx="1.5" /><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11" />
                </svg>
                <span className="font-karla font-700 uppercase tracking-[0.08em]" style={{ fontSize: '0.56rem', color: lev ? `${LEVIATHAN}cc` : 'rgba(255,255,255,0.4)', textAlign: 'center', lineHeight: 1.35, padding: '0 0.2rem' }}>
                  {opensAt.name.replace(' Hall', '')}
                </span>
              </div>
            )
          }
          if (!crew) {
            return (
              <button key={`empty-${i}`} type="button" disabled={pending}
                onClick={() => setPicking(i)}
                title={lev ? 'The Leviathan bunk. Every stint here rolls a new trait and offers it to you.' : undefined}
                aria-label={lev
                  ? 'Empty Leviathan bunk. Tap to put a crew in it. Every stint rolls them a new trait.'
                  : `Empty bunk ${i + 1}. Tap to put a crew in it.`}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                  minHeight: 100, borderRadius: 11, cursor: 'pointer', font: 'inherit',
                  border: `1.5px dashed ${tint}${lev ? '99' : '55'}`,
                  background: lev
                    ? `linear-gradient(180deg, ${LEVIATHAN}1c 0%, rgba(0,0,0,0.3) 100%)`
                    : 'rgba(0,0,0,0.28)',
                  touchAction: 'manipulation',
                }}>
                {lev
                  ? <LeviathanMark />
                  : (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 24, height: 24, borderRadius: '50%',
                      background: `${accent}1f`, border: `1.5px solid ${accent}99`,
                      color: accent, fontSize: '1rem', lineHeight: 1,
                    }}>+</span>
                  )}
                <span className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.62rem', color: `${tint}dd` }}>
                  {lev ? 'Leviathan' : 'Empty bunk'}
                </span>
                {lev && (
                  <span className="font-karla" style={{ fontSize: '0.55rem', color: `${LEVIATHAN}99`, textAlign: 'center', lineHeight: 1.3, padding: '0 0.2rem' }}>
                    Rolls new traits
                  </span>
                )}
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
                // Done still reads gold, because that is the collect cue
                // everywhere. A running Leviathan stint keeps the teal, so you
                // can see at a glance that this one has a chance riding on it.
                border: `1.5px solid ${done ? `${GOLD}aa` : lev ? `${LEVIATHAN}66` : 'rgba(255,255,255,0.16)'}`,
                background: `linear-gradient(180deg, ${done ? `${GOLD}1f` : lev ? `${LEVIATHAN}14` : 'rgba(255,255,255,0.04)'} 0%, rgba(0,0,0,0.25) 100%)`,
                touchAction: 'manipulation',
              }}>
              {lev && (
                <span aria-hidden style={{ position: 'absolute', top: 4, right: 4, lineHeight: 0, opacity: 0.9 }}>
                  <LeviathanMark size={13} />
                </span>
              )}
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
        ) : ladderHallLocked(state.drillLevel, state.hallTier) ? (
          <LockedCard art={`/crew/drill_${Math.min(state.drillLevel + 1, DRILL_ART_MAX)}.png`}
            label={`Drills ${tierNumeral(state.drillLevel + 1)}`}
            hall={hallTierDef(hallTierRequiredFor(state.drillLevel + 1))} />
        ) : (
          <UpgradeButton
            label={`Drills ${tierNumeral(state.drillLevel + 1)}`}
            art="/crew/drill_" tier={Math.min(state.drillLevel, DRILL_ART_MAX)} popping={pop === 'drill'}
            now={`${rate.toLocaleString()} XP/hr`}
            next={`${bunkRatePerHour(state.drillLevel + 1).toLocaleString()} XP/hr`}
            cost={nextDrillCost(state.drillLevel)} balance={state.doubloons}
            accent={GOLD} disabled={pending} onClick={onBuyDrill} />
        )}
        {storesMaxed(state.storesLevel) ? (
          <MaxedCard art={`/crew/stores_${state.storesLevel}.png`} label="Stores full"
            sub={`${cap}h stints`} accent="#7fc4a8" popping={pop === 'stores'} />
        ) : ladderHallLocked(state.storesLevel, state.hallTier) ? (
          <LockedCard art={`/crew/stores_${state.storesLevel + 1}.png`}
            label={`Stores ${tierNumeral(state.storesLevel + 1)}`}
            hall={hallTierDef(hallTierRequiredFor(state.storesLevel + 1))} />
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
          leviathan={isLeviathanSlot(picking)}
          onPick={id => { onBunk(id, picking); setPicking(null) }}
          onClose={() => setPicking(null)}
        />, document.body)}
    </div>
  )
}

/** One term of the training sum. The label under each number names the ladder
 *  that set it, so it is obvious which button to press to move which half. */
function SumTerm({ value, label, accent }: { value: string; label: string; accent?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <span className="font-cinzel font-700" style={{
        fontSize: accent ? '0.92rem' : '0.85rem', lineHeight: 1.1, whiteSpace: 'nowrap',
        color: accent ?? '#f0ede8', fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
      <span className="font-karla font-600 uppercase tracking-[0.08em]" style={{ fontSize: '0.53rem', color: 'rgba(255,255,255,0.42)', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  )
}

function SumOp({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.3)', marginBottom: '0.55rem' }}>
      {children}
    </span>
  )
}

/** The Leviathan bunk's sigil: a coiled deep-sea eye. Drawn rather than
 *  lettered so the special slot is recognisable at 13px on a tile corner,
 *  where any text would be unreadable. */
function LeviathanMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden
      stroke={LEVIATHAN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.6-5.5 9.5-5.5S21.5 12 21.5 12s-3.6 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.4" fill={`${LEVIATHAN}44`} />
    </svg>
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

/**
 * A ladder the hall has not caught up with. Shows the tier you are reaching for
 * and the building that opens it, rather than a price you cannot pay — the
 * blocker is the hall, so naming the hall is the useful thing to say.
 */
function LockedCard({ art, label, hall }: { art: string; label: string; hall: { name: string; accent: string } }) {
  return (
    <div className="font-karla" style={{
      flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 2, padding: '0.55rem 0.35rem 0.6rem', borderRadius: 11,
      background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.16)',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art} alt="" aria-hidden decoding="async"
        style={{ width: 54, height: 54, objectFit: 'contain', filter: 'grayscale(0.85) brightness(0.55)' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
      <span className="font-karla font-700 uppercase tracking-[0.06em]" style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </span>
      <span style={{ fontSize: '0.62rem', color: hall.accent, textAlign: 'center', lineHeight: 1.3 }}>
        Needs {hall.name}
      </span>
    </div>
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
  eligible, artSrc, accent: hallAccent, pending, stint, payout, leviathan, onPick, onClose,
}: {
  eligible: CrewMember[]
  artSrc: (f: string) => string
  accent: string
  pending: boolean
  stint: string
  payout: number
  /** Filling the sixth bunk, which rolls a new trait every stint. */
  leviathan: boolean
  onPick: (crewId: number) => void
  onClose: () => void
}) {
  // The sheet takes the bunk's colour, so you can tell which one you are
  // filling from the sheet alone without reading back to the grid.
  const accent = leviathan ? LEVIATHAN : hallAccent
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(2,6,12,0.72)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '84vh', display: 'flex', flexDirection: 'column', background: 'rgba(14,11,7,0.99)', borderTop: `2px solid ${accent}`, borderRadius: '18px 18px 0 0', boxShadow: '0 -12px 44px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '1rem 1rem 0.8rem' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p className="font-karla font-700 uppercase tracking-[0.14em]" style={{ fontSize: '0.66rem', color: accent }}>
              {leviathan ? 'The Leviathan Bunk' : 'Crew Hall'}
            </p>
            <p className="font-cinzel font-700" style={{ fontSize: '1.15rem', color: '#f0ede8', lineHeight: 1.1 }}>
              {leviathan ? 'Who goes below?' : 'Who trains?'}
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

        {/* The whole reason to pick this bunk over the other five, and the
            goal at the end of it. Two short sentences carry the rules and the
            target line does the rest, because "+4 +4 +4 = Divine" is
            understood at a glance in a way a paragraph about magnitude
            ceilings never is. The old copy explained the mechanic accurately
            and never once said what you were aiming AT. */}
        {leviathan && (
          <div style={{ margin: '0 1rem 0.9rem', padding: '0.8rem 0.85rem', borderRadius: 12, background: `${LEVIATHAN}14`, border: `1px solid ${LEVIATHAN}4d` }}>
            <p className="font-karla font-700 uppercase tracking-[0.1em]" style={{ fontSize: '0.6rem', color: LEVIATHAN, marginBottom: 5 }}>
              The chase for Divine
            </p>
            <p className="font-karla" style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.82)', lineHeight: 1.5 }}>
              Every stint rolls them a new trait. Keep the stats you want, roll again for the rest.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
              {['+4 PWR', '+4 DGE', '+4 FTN'].map(t => (
                <span key={t} className="font-karla font-700" style={{
                  fontSize: '0.63rem', padding: '0.22rem 0.45rem', borderRadius: 6,
                  background: 'rgba(0,0,0,0.32)', border: `1px solid ${LEVIATHAN}55`,
                  color: '#c6e8e2', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                }}>{t}</span>
              ))}
              <span aria-hidden style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.72rem' }}>=</span>
              <span className="font-cinzel font-700" style={{ fontSize: '0.88rem', color: LEVIATHAN, whiteSpace: 'nowrap' }}>Divine</span>
            </div>
            <p className="font-karla" style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginTop: 7, lineHeight: 1.4 }}>
              No other bunk ever rolls a 4.
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
                  aria-label={leviathan ? `Send ${m.name} to the Leviathan bunk` : `Put ${m.name} in a bunk`}
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
