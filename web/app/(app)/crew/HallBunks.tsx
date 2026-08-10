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
import { hapticTap } from '@/lib/haptics'
import { createPortal } from 'react-dom'
import { crewLevelFromXP } from '@/lib/crewLevel'
import { isDivineTrait, netTraitStats, traitLabel, traitKind, type TraitStats } from '@/lib/crewEffects'
import { CREW_HALL_MAX_TIER, hallTierDef } from '@/lib/crewHall'
import {
  bunkCount, bunkRatePerHour, canBunk, drillsMaxed, hallTierRequiredFor,
  isLeviathanSlot, ladderHallLocked, msUntilDone, stintDone, stintProgress,
  stintXP, nextDrillCost, nextStoresCost, storesCapHours, storesMaxed,
  tierNumeral, LEVIATHAN_COLOR,
} from '@/lib/crewBunks'
import type { CrewMember, CrewState } from './actions'

/**
 * WHO LAST TRAINED IN THIS BUNK, per slot.
 *
 * Mirrors the trawl sheet's per-zone "Send again", which exists for the same
 * reason: most sends are the same hand back into the same place, and hunting
 * them out of a roster of thirty every cycle is the whole friction. localStorage
 * rather than a column because it is a convenience hint, not state the server
 * needs to be right about — a wrong or missing value just means the normal
 * picker, which is where you were going anyway.
 */
const LAST_BUNK_KEY = (slot: number) => `hall:lastBunk:${slot}`

function readLastBunkCrew(slot: number): number | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_BUNK_KEY(slot))
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

function writeLastBunkCrew(slot: number, crewId: number) {
  if (typeof localStorage === 'undefined') return
  try { localStorage.setItem(LAST_BUNK_KEY(slot), String(crewId)) } catch { /* no-op */ }
}

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

/** A trait's three stats as one line, for the tile's tooltip. The label alone
 *  says the shape; the numbers say how much. */
function statLine(t: TraitStats): string {
  const parts = ([['PWR', t.power], ['DGE', t.dodge], ['FTN', t.fortune]] as const)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`)
  return parts.length ? parts.join(' / ') : 'no effect'
}

function fmtStint(h: number): string {
  return h === 1 ? '1 hour' : `${h} hours`
}

/** The same length, short enough to sit in a three-term sum on a phone. */
function fmtStintShort(h: number): string {
  return `${h}h`
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
  onBunk: (crewId: number, slot: number) => void
  /** Collect one hand's finished stint. The only way to collect: the reward
   *  belongs to a face, not to a header button. */
  onCollectOne: (crewId: number) => void
  onBuyDrill: () => void
  onBuyStores: () => void
}) {
  const [picking, setPicking] = useState<number | null>(null)
  /** The crew whose claim is in flight. Purely so the tapped tile can show it
   *  is working; cleared when the bunk it belonged to goes away, which is the
   *  server confirming the claim landed. */
  const [claiming, setClaiming] = useState<number | null>(null)
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

  // Seed the per-slot memory from whoever is IN each bunk right now, so the
  // hint works for hands bunked before it existed (and on a fresh device)
  // rather than staying blank until a full cycle has been completed since.
  // The current occupant IS the most recent for that slot, so this can only
  // ever agree with what a claim would write.
  useEffect(() => {
    bySlot.forEach((crew, slot) => { if (crew) writeLastBunkCrew(slot, crew.id) })
    // The claim landed when the hand is no longer in a bunk. Clearing off the
    // DATA rather than off a timer means the tile holds its busy state for
    // exactly as long as the round trip actually took.
    setClaiming(c => (c != null && !bySlot.some(x => x?.id === c) ? null : c))
  }, [bySlot])

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

  // ONE source for who can go in and why not. The picker draws both lists off
  // this, so the Available tab and a blocked hand's label can never disagree
  // about the same crew.
  const blockers = useMemo(() => {
    const out: Record<number, string> = {}
    const trawling = new Set(state.trawlingCrewIds)
    const atSea = new Set(state.lockedCrewIds)
    const bunked = new Set(state.bunkedCrewIds)
    for (const c of state.roster) {
      const why =
        bunked.has(c.id) ? 'In a bunk'
        : atSea.has(c.id) ? 'At sea'
        : trawling.has(c.id) ? 'On a trawl'
        : c.raidSlot !== null ? 'Raid party'
        : c.voyageSlot !== null ? 'Voyage party'
        // Slot-aware, because the Leviathan bunk pays a trait re-cut rather
        // than XP and a maxed hand is exactly who wants one. Blocking them
        // everywhere shut the deepest bunk to the only crew built for it.
        : !canBunk(c.xp, picking) ? 'Fully trained'
        : null
      if (why) out[c.id] = why
    }
    return out
  }, [state.roster, state.bunkedCrewIds, state.trawlingCrewIds, state.lockedCrewIds, picking])

  const eligible = useMemo(
    () => state.roster.filter(c => !blockers[c.id]),
    [state.roster, blockers])

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
                title={lev ? `${opensAt.name} opens the Leviathan bunk, which re-cuts a trait every stint and never makes it worse` : `${opensAt.name} opens this bunk`}
                aria-label={lev
                  ? `Locked. ${opensAt.name} opens the Leviathan bunk, which re-cuts a trait every stint and never makes it worse.`
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
                title={lev ? 'The Leviathan bunk. Every stint rolls against their trait and keeps the better of each stat. It can never make them worse.' : undefined}
                aria-label={lev
                  ? 'Empty Leviathan bunk. Tap to put a crew in it. Every stint rolls against their trait and keeps the better of each stat.'
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
          const done = !t || stintDone(t.since, now, t.cap)
          const left = t ? msUntilDone(t.since, now, t.cap) : 0
          const pct = t ? stintProgress(t.since, now, t.cap) : 1
          return (
            <motion.button key={crew.id} type="button" disabled={pending || !done}
              // THE PRESS HAS TO ANSWER. Claiming used to run straight into a
              // server round trip with nothing happening: no scale, no haptic,
              // no busy state, and the vibrate lived AFTER the await. Tap, dead
              // air, then a card appeared. The card was never the problem.
              whileTap={done ? { scale: 0.93 } : undefined}
              transition={{ type: 'spring', stiffness: 620, damping: 26 }}
              // Remember them on the way OUT as well as on the way in. Recording
              // only at bunk-time meant the hint stayed invisible until you had
              // completed a whole cycle since it shipped — and the claim is the
              // better moment anyway: the instant a hand comes off a bunk is
              // exactly when you decide whether to send them straight back.
              onClick={() => {
                if (!done) return
                // Fired SYNCHRONOUSLY, before the action, so the thumb gets its
                // answer in the same frame as the tap rather than after the
                // server has had its say.
                hapticTap()
                setClaiming(crew.id)
                writeLastBunkCrew(i, crew.id)
                onCollectOne(crew.id)
              }}
              title={done ? `Claim ${crew.name} and free the bunk` : `Locked in for another ${fmtLeft(left)}`}
              aria-label={done
                ? `${crew.name} has finished training. Claim to free the bunk.`
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
                // The tapped tile dims and holds while the claim is in flight,
                // so the wait reads as "working" rather than as "nothing
                // happened". Only the one you touched: the others stay live.
                opacity: claiming === crew.id ? 0.55 : 1,
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
              {/* A finished bunk shows JUST the word. The XP used to sit under
                  it and said nothing the header did not: the sum row at the top
                  of the panel already states what a stint pays, and it is the
                  same figure for every bunk. On a tile the only useful fact is
                  that this hand is waiting on you.

                  The pulse is on the pill alone, not the whole tile: six of them
                  breathing at once would be a light show, one small moving thing
                  per finished bunk is a nudge. */}
              {done ? (
                <span className="bunk-claim-pulse font-karla font-800 uppercase" style={{
                  display: 'inline-block', padding: '0.2rem 0.7rem', borderRadius: 999,
                  fontSize: '0.66rem', letterSpacing: '0.1em', lineHeight: 1.45,
                  background: `${GOLD}26`, border: `1px solid ${GOLD}99`, color: '#f6e6b4',
                }}>
                  {claiming === crew.id ? 'Hauling in' : 'Claim'}
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
            </motion.button>
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
          eligible={eligible} roster={state.roster} blockers={blockers}
          artSrc={artSrc} accent={accent} pending={pending}
          stint={fmtStint(cap)} payout={payout}
          leviathan={isLeviathanSlot(picking)}
          lastCrew={(() => {
            const id = readLastBunkCrew(picking)
            return id == null ? null : eligible.find(c => c.id === id) ?? null
          })()}
          onPick={id => { writeLastBunkCrew(picking, id); onBunk(id, picking); setPicking(null) }}
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
  eligible, roster, blockers, artSrc, accent: hallAccent, pending, stint, payout, leviathan, lastCrew, onPick, onClose,
}: {
  eligible: CrewMember[]
  /** Everyone alive, for the All tab. */
  roster: CrewMember[]
  /** crew id -> why they cannot be bunked, absent when they can. */
  blockers: Record<number, string>
  artSrc: (f: string) => string
  accent: string
  pending: boolean
  stint: string
  payout: number
  /** Filling the sixth bunk, which re-cuts a trait every stint (per-stat max
   *  against a fresh roll, so it can only ever improve them). */
  leviathan: boolean
  /** The hand who last trained in THIS bunk, if they are free to go back in. */
  lastCrew: CrewMember | null
  onPick: (crewId: number) => void
  onClose: () => void
}) {
  // The sheet takes the bunk's colour, so you can tell which one you are
  // filling from the sheet alone without reading back to the grid.
  const accent = leviathan ? LEVIATHAN : hallAccent
  // Available by default, because that is the list you almost always want.
  // All exists so the sheet can answer "where IS everyone" without sending you
  // to another tab to find out: an empty picker used to look like a bug rather
  // than like a roster that is busy.
  const [who, setWho] = useState<'available' | 'all'>('available')
  const shown = who === 'available' ? eligible : roster
  const blockedCount = roster.length - eligible.length
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

        {/* THE THING THAT DECIDES THE CHASE, said at the moment you choose who
            goes down. The re-cut rolls on a rarity-weighted table, so the same
            bunk is several times faster for a Legendary than for an Epic — and
            with nothing on screen saying so, a slow Epic reads as bad luck or a
            broken bunk rather than as the hand you picked. Stated as an
            ORDERING, not as percentages: the weights get retuned, and a number
            baked into copy would quietly start lying. */}
        {leviathan && (
          <p className="font-karla" style={{ padding: '0 1rem 0.8rem', fontSize: '0.8rem', color: 'rgba(255,255,255,0.62)', lineHeight: 1.5 }}>
            Rarity decides the odds down here. A <span style={{ color: accent }}>Legendary</span> rolls a
            4 far more often than an Epic, and an Epic more often than a Rare. The rarer the hand, the
            fewer stints it takes to finish them.
          </p>
        )}

        {/* TRAIN AGAIN. The same hand back into the same bunk is the common
            case by a distance, and finding them again in a roster of thirty was
            the whole cost of a cycle. Only shown while they are actually free
            to go back in, so it can never be a dead button. */}
        {lastCrew && (
          <button type="button" disabled={pending} onClick={() => onPick(lastCrew.id)}
            aria-label={`Train ${lastCrew.name} again`}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: 'calc(100% - 2rem)',
              margin: '0 1rem 0.8rem', padding: '0.5rem 0.7rem 0.5rem 0.5rem', borderRadius: 12,
              background: `${accent}1a`, border: `1px solid ${accent}66`, font: 'inherit',
              cursor: pending ? 'not-allowed' : 'pointer', textAlign: 'left',
              touchAction: 'manipulation',
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={artSrc(lastCrew.filename)} alt="" aria-hidden loading="lazy" decoding="async"
              style={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="font-karla font-800 uppercase tracking-[0.1em]" style={{ display: 'block', fontSize: '0.52rem', color: accent }}>
                Train again
              </span>
              <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.92rem', color: '#f4ecd8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {lastCrew.name}
              </span>
              <span className="font-karla font-600" style={{ display: 'block', fontSize: '0.62rem', color: '#a89e86' }}>
                Lv {crewLevelFromXP(lastCrew.xp)} · {traitLabel(netTraitStats(lastCrew.effects)) || 'No trait'}
              </span>
            </span>
            <span aria-hidden className="font-cinzel font-700" style={{ flexShrink: 0, fontSize: '1rem', color: accent }}>›</span>
          </button>
        )}

        {/* Available / All. Only worth drawing when somebody is actually
            blocked, otherwise the two tabs show the same list. */}
        {blockedCount > 0 && (
          <div style={{ display: 'flex', gap: 6, padding: '0 1rem 0.7rem' }}>
            {([['available', `Available (${eligible.length})`], ['all', `All (${roster.length})`]] as const).map(([k, label]) => (
              <button key={k} type="button" onClick={() => setWho(k)}
                aria-pressed={who === k}
                className="font-karla font-700 uppercase tracking-[0.08em]"
                style={{
                  flex: 1, padding: '0.42rem 0.5rem', borderRadius: 9, fontSize: '0.63rem', font: 'inherit',
                  background: who === k ? `${accent}22` : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${who === k ? `${accent}88` : 'rgba(255,255,255,0.12)'}`,
                  color: who === k ? '#f0ede8' : 'rgba(255,255,255,0.5)',
                  cursor: 'pointer', touchAction: 'manipulation',
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Says the ONE thing the All tab exists to explain: those greyed hands
            are not broken, they are busy, and you free them somewhere else. */}
        {who === 'all' && blockedCount > 0 && (
          <p className="font-karla" style={{ padding: '0 1rem 0.8rem', fontSize: '0.74rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.45 }}>
            Greyed hands are already busy. Take them out of their raid party, voyage party or trawl first and they can take a bunk.
          </p>
        )}

        {/* The whole reason to pick this bunk over the other five, and the
            goal at the end of it. Two short sentences carry the rules and the
            target line does the rest, because "+4 +4 +4 = Divine" is
            understood at a glance in a way a paragraph about magnitude
            ceilings never is. The old copy explained the mechanic accurately
            and never once said what you were aiming AT. */}
        {leviathan && (
          <div style={{ margin: '0 1rem 0.85rem', paddingTop: '0.7rem', borderTop: `1px solid ${LEVIATHAN}2e` }}>
            <p className="font-karla" style={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
              Every stint rolls them a new trait. Keep the stats you want, roll again for the rest.
            </p>
            <p className="font-karla" style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.42)', lineHeight: 1.5, marginTop: 5 }}>
              <span style={{ color: `${LEVIATHAN}cc`, fontVariantNumeric: 'tabular-nums' }}>+4 / +4 / +4</span>
              {' '}makes a <span className="trait-divine font-700">Divine</span> hand. No other bunk rolls a 4.
            </p>
          </div>
        )}

        <div className="scrollbar-hide" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', padding: '0 1rem 1.4rem' }}>
          {shown.length === 0 ? (
            <p className="font-karla text-center" style={{ fontSize: '0.82rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.55, padding: '1.6rem 0.5rem' }}>
              {who === 'available' && roster.length > 0
                ? 'Every hand you have is busy or fully trained. Switch to All to see where they are.'
                : 'No crew yet. Recruit some hands and they can train here.'}
            </p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {shown.map(m => {
                const blocked = blockers[m.id]
                return (
                  <button key={m.id} type="button" disabled={pending || !!blocked}
                    onClick={() => { if (!blocked) onPick(m.id) }}
                    title={blocked ?? undefined}
                    aria-label={blocked
                      ? `${m.name} cannot take a bunk: ${blocked}`
                      : leviathan ? `Send ${m.name} to the Leviathan bunk` : `Put ${m.name} in a bunk`}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                      padding: '0.5rem 0.35rem', borderRadius: 12, textAlign: 'center',
                      background: 'rgba(24,20,14,0.96)',
                      border: `1px solid ${blocked ? 'rgba(255,255,255,0.1)' : `${accent}44`}`,
                      cursor: pending || blocked ? 'not-allowed' : 'pointer', font: 'inherit',
                      opacity: blocked ? 0.45 : pending ? 0.55 : 1, touchAction: 'manipulation',
                    }}>
                    <div style={{ width: '100%', height: 52, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={artSrc(m.filename)} alt="" aria-hidden loading="lazy" decoding="async"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: blocked ? 'grayscale(0.8)' : undefined }} />
                    </div>
                    <span className="font-karla font-700" style={{ display: 'block', width: '100%', fontSize: '0.78rem', lineHeight: 1.15, color: '#eee8de', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.name}
                    </span>
                    {/* The reason REPLACES the level on a blocked hand. Their
                        level is not the useful fact when they cannot go in. */}
                    {blocked ? (
                      <span className="font-karla font-700 uppercase tracking-[0.05em]" style={{ display: 'block', width: '100%', fontSize: '0.55rem', color: 'rgba(255,255,255,0.5)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {blocked}
                      </span>
                    ) : (
                      <>
                        <span className="font-karla font-600" style={{ fontSize: '0.7rem', color: '#b8b1a8', fontVariantNumeric: 'tabular-nums' }}>
                          Lv {crewLevelFromXP(m.xp)}
                        </span>
                        {/* THE TRAIT THEY ALREADY CARRY. This is the fact the
                            choice actually turns on, most of all at the
                            Leviathan bunk: you send the hand whose trait you
                            want changed, or the one whose good trait you are
                            trying to finish. Picking blind and checking the
                            roster afterwards was the only way to know.
                            Coloured by kind, so a flaw reads as a flaw without
                            reading the word. */}
                        {(() => {
                          const t = netTraitStats(m.effects)
                          const label = traitLabel(t)
                          if (!label) return (
                            <span className="font-karla" style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>No trait</span>
                          )
                          const divine = isDivineTrait(t)
                          const kind = traitKind(t)
                          return (
                            <span
                              className={`font-karla font-700 uppercase tracking-[0.04em]${divine ? ' trait-divine' : ''}`}
                              title={statLine(t)}
                              style={{
                                display: 'block', width: '100%', fontSize: '0.55rem', lineHeight: 1.25,
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                ...(divine ? {} : {
                                  color: kind === 'buff' ? '#9cc7a8' : kind === 'flaw' ? '#c79c9c' : 'rgba(255,255,255,0.45)',
                                }),
                              }}>
                              {label}
                            </span>
                          )
                        })()}
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
