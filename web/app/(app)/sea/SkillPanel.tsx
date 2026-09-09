'use client'

// ── WHAT YOUR LEVEL IS ACTUALLY DOING FOR YOU ───────────────────────────────
//
// Two spines run this game — Fishing gates the fishing half, Navigation gates
// the expedition half — and until now neither of them had a page. There was a
// BAR: a number, a fill and, past 100, a chip that opened the renown allocator.
// A bar says how far along you are and nothing whatsoever about what being
// there is worth.
//
// ── A STAT IS ONE FACT WITH A TRAJECTORY, NOT TWO FACTS ─────────────────────
//
// The first cut of this panel had a block for what your level gives you and a
// second block for what the next one gives, and the second was mostly the first
// with different numbers: Catch band, Crew stats and Berths each appeared
// twice, three lines apart, and a captain had to diff them by eye. Worse, four
// levels in five the honest answer was "+0", so the block existed to say
// nothing.
//
// So a stat gets ONE row and the row carries the arrow: `+8° → +9° at 45`. The
// change is read where the number is, the level that moves it is named, and
// nothing is written twice.
//
// What is left over — a water opening, a hull, a milestone payout, a campaign
// gate — is not a stat at all. Those are EVENTS at a level, and they get a
// short list of the next three, whatever kind they are.
//
// ── AND THE EXPLANATIONS ARE BEHIND A TAP ───────────────────────────────────
//
// Every stat has a sentence saying what it does, and those sentences were most
// of the text on this screen: ten rows, two lines each, before you reached
// anything. They are one tap away now. A captain who wants to know what "catch
// band" means asks once and never again; the rest read a table.
//
// ── IT IS DERIVED, NOT WRITTEN ──────────────────────────────────────────────
//
// Every number in here is read from the same function the game plays by —
// `levelCatchBonus`, `navLevelBonuses`, `crewCapacity`, `rewardForLevel`, the
// zone table, the gear and hull gates. Nothing is a hand-typed copy of a rule
// that lives somewhere else, because a panel explaining the rules is the single
// worst place in a codebase for a number to drift: it is believed.
//
// ── AND RENOWN LIVES HERE ───────────────────────────────────────────────────
//
// It used to hang off the MAX chip on the fishing bar, which is a door only a
// captain at 100 ever sees and only while the rod is out. This is where you go
// to think about a level, so it is where the points you get for finishing one
// belong. The allocator itself is unchanged (`RenownPanel`) — this opens it.

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import PopupShell from '@/components/PopupShell'
import CloseButton from '@/components/CloseButton'
import { vibrate } from '@/lib/haptics'
import {
  getLevelFromXP as fishLevel, getXPProgress as fishProgress,
  levelCatchBonus, MAX_LEVEL as FISH_MAX,
} from '@/lib/fishingLevel'
import {
  getLevelFromXP as navLevelFromXP, getXPProgress as navProgress,
  navLevelBonuses, MAX_LEVEL as NAV_MAX,
} from '@/lib/expeditionLevel'
import { rewardForLevel, rewardLabel, LEVEL_REWARD_MAX } from '@/lib/levelRewards'
import { crewCapacity } from '@/lib/crewCapacity'
import { PLACES } from './chart'
import { SHIPS } from '@/lib/ships'
import { navLevelReqForShip } from '@/lib/gearGating'
import { RAID_MAP } from '@/lib/raidMap'
import type { RenownState } from '@/app/(app)/actions/renown'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

export type Skill = 'fishing' | 'nav'

/**
 * ONE STAT, WITH WHERE IT IS GOING.
 *
 * `at` is null for anything that has stopped moving — a maxed spine, a count
 * that is already complete — and the row simply does not draw an arrow rather
 * than drawing one to nowhere.
 */
type Stat = {
  label: string
  value: string
  at: { value: string; level: number } | null
  note: string
}

/** Something that happens AT a level and is not a number that grows. */
type Event = { level: number; what: string; detail?: string }

/** The next level that is a multiple of five, which is the beat both spines
 *  move their stepped stats on. */
const nextFifth = (level: number) => Math.ceil((level + 1) / 5) * 5

function fishingRows(level: number): { stats: Stat[]; ahead: Event[] } {
  const waters = PLACES.filter(p => p.kind === 'water' && (p.minLevel ?? 0) > 0)
  const open = waters.filter(w => level >= (w.minLevel ?? 0))
  const shut = waters
    .filter(w => level < (w.minLevel ?? 0))
    .sort((a, b) => (a.minLevel ?? 0) - (b.minLevel ?? 0))
  const nextWater = shut[0]
  const fifth = nextFifth(level)

  const stats: Stat[] = [
    {
      label: 'Catch band',
      value: `+${levelCatchBonus(level)}°`,
      at: level < FISH_MAX ? { value: `+${levelCatchBonus(fifth)}°`, level: fifth } : null,
      note: 'Widens the green zone on the dial, on top of whatever your hook gives you. It grows every fifth level.',
    },
    {
      label: 'Waters open',
      value: `${open.length} of ${waters.length}`,
      at: nextWater ? { value: `${open.length + 1} of ${waters.length}`, level: nextWater.minLevel ?? 0 } : null,
      note: nextWater
        ? `${nextWater.name} is the next to open. A water you are not levelled for will not let you cast.`
        : 'Every water on the chart is yours to fish.',
    },
    {
      label: "The day's orders",
      value: level >= 75 ? '4 a day' : '3 a day',
      at: level < 75 ? { value: '4 a day', level: 75 } : null,
      note: 'Daily challenges. A fourth slot opens at Fishing 75, and clearing the lot pays gems.',
    },
  ]
  if (level >= FISH_MAX) {
    stats.push({
      label: 'Prestige',
      value: 'Open',
      at: null,
      note: 'Reset the curve for a permanent multiplier on doubloons and catch XP. It is done at the Homestead.',
    })
  }

  // ── WHAT IS COMING, AND IT IS NOT A STAT ────────────────────────────
  // Anything already carried by a row above is deliberately absent: the catch
  // band's next step is on the catch band's row, and saying it twice is the
  // thing this panel was rebuilt to stop doing.
  const ahead: Event[] = []
  if (nextWater) ahead.push({ level: nextWater.minLevel ?? 0, what: `${nextWater.name} opens` })
  for (let l = level + 1; l <= LEVEL_REWARD_MAX && ahead.length < 6; l++) {
    const r = rewardForLevel(l)
    if (r?.milestone) { ahead.push({ level: l, what: 'Milestone', detail: rewardLabel(r) }); break }
  }
  if (level < FISH_MAX) ahead.push({ level: FISH_MAX, what: 'Prestige, and renown', detail: 'The curve ends and the points begin' })
  return { stats, ahead }
}

function navRows(level: number, hallTier: number): { stats: Stat[]; ahead: Event[] } {
  const b = navLevelBonuses(level)
  const cap = crewCapacity(level, hallTier)
  const fifth = nextFifth(level)
  const hulls = SHIPS.filter(h => h.cost > 0).sort((x, y) => x.cost - y.cost)
  const buyable = hulls.filter(h => level >= navLevelReqForShip(h.cost))
  const nextHull = hulls.find(h => navLevelReqForShip(h.cost) > level)
  // The next level that pays another berth, which is not every level.
  const nextBerth = level < NAV_MAX
    ? Array.from({ length: NAV_MAX - level }, (_, i) => level + 1 + i).find(l => crewCapacity(l, hallTier) > cap) ?? null
    : null

  const stats: Stat[] = [
    {
      label: 'Ship hull',
      value: `+${b.hp} HP`,
      at: level < NAV_MAX ? { value: `+${navLevelBonuses(level + 1).hp} HP`, level: level + 1 } : null,
      note: 'One hull point every Navigation level, on top of whatever the ship herself is worth.',
    },
    {
      label: 'Crew stats',
      value: `+${b.power} / +${b.navigation} / +${b.fortune}`,
      at: level < NAV_MAX
        ? { value: `+${navLevelBonuses(fifth).power} / +${navLevelBonuses(fifth).navigation} / +${navLevelBonuses(fifth).fortune}`, level: fifth }
        : null,
      note: 'Power, navigation and fortune, added to every hand you sail with. One of each every fifth level.',
    },
    {
      label: 'Berths',
      value: `${cap} crew`,
      at: nextBerth ? { value: `${crewCapacity(nextBerth, hallTier)} crew`, level: nextBerth } : null,
      note: 'How many hands you can hold at once. Navigation and your Crew Hall pay into the same number.',
    },
    {
      label: 'Hulls open',
      value: `${buyable.length} of ${hulls.length}`,
      at: nextHull ? { value: `${buyable.length + 1} of ${hulls.length}`, level: navLevelReqForShip(nextHull.cost) } : null,
      note: buyable.length
        ? `${buyable[buyable.length - 1].name} is the best the yard will sell you. Coin is the other half of it.`
        : 'The Shipyard sells by Navigation level as well as by price.',
    },
  ]
  if (level >= NAV_MAX) {
    stats.push({ label: 'Renown', value: 'Open', at: null, note: 'Every level past the cap banks a point to spend on the expedition side.' })
  }

  const ahead: Event[] = []
  if (nextHull) ahead.push({ level: navLevelReqForShip(nextHull.cost), what: `${nextHull.name} at the Shipyard` })
  const gate = RAID_MAP
    .filter(n => (n.requiresNavLevel ?? 0) > level)
    .sort((x, y) => (x.requiresNavLevel ?? 0) - (y.requiresNavLevel ?? 0))[0]
  if (gate) ahead.push({ level: gate.requiresNavLevel ?? 0, what: gate.label, detail: 'A campaign stop that will not talk to you yet' })
  if (level < NAV_MAX) ahead.push({ level: NAV_MAX, what: 'Renown', detail: 'The curve ends and the points begin' })
  return { stats, ahead }
}

export default function SkillPanel({ open, onClose, skill, xp, renown, onOpenRenown, hallTier }: {
  open: boolean
  onClose: () => void
  skill: Skill
  /** Raw XP for this spine. The level and the bar are both derived from it. */
  xp: number
  /** Null when the server has not read it (or the captain is not at the cap). */
  renown: RenownState | null
  onOpenRenown: () => void
  /** Only Navigation reads it, and only for the berth count. */
  hallTier: number
}) {
  const fishing = skill === 'fishing'
  const level = fishing ? fishLevel(xp) : navLevelFromXP(xp)
  const prog = fishing ? fishProgress(xp) : navProgress(xp)
  const max = fishing ? FISH_MAX : NAV_MAX
  const capped = level >= max
  /** Which stat has been asked about. One at a time: this is a table, and two
   *  open explanations put you back where the last version was. */
  const [asked, setAsked] = useState<string | null>(null)

  const { stats, ahead } = useMemo(
    () => (fishing ? fishingRows(level) : navRows(level, hallTier)),
    [fishing, level, hallTier],
  )
  // THE NEXT THREE, whatever they are. At level 5 the whole remaining road is a
  // long list of things you cannot have; what a captain wants is what is close.
  const soon = useMemo(
    () => [...ahead].sort((a, b) => a.level - b.level).filter(e => e.level > level).slice(0, 3),
    [ahead, level],
  )

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        style={{
          position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
          // Never taller than the room the shell left — see CrewHub's note.
          maxHeight: 'min(80vh, 620px, 100%)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
          border: '1px solid rgba(196,169,106,0.34)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 4 }} />

        {/* ── IT SAYS WHAT IT IS ─────────────────────────────────────────
            The title was a 0.5rem eyebrow reading "Your Fishing", so the one
            thing this panel is about was the smallest text on it and the word
            LEVEL never appeared. */}
        <div style={{ flexShrink: 0, padding: '1.05rem 1.05rem 0.85rem' }}>
          <h2 className="font-cinzel font-800 uppercase" style={{
            margin: 0, fontSize: '0.82rem', letterSpacing: '0.14em', color: '#f4efe4', paddingRight: 34,
          }}>
            {fishing ? 'Fishing Level' : 'Navigation Level'}
          </h2>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 4 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '2.2rem', lineHeight: 1, color: GOLD }}>
              {level}
            </span>
            <span className="font-karla font-700 uppercase" style={{ fontSize: '0.56rem', letterSpacing: '0.16em', color: `${SEA},0.5)` }}>
              {capped ? 'the cap' : `of ${max}`}
            </span>
          </div>

          <div style={{
            position: 'relative', height: 9, borderRadius: 999, marginTop: 11, overflow: 'hidden',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{
              position: 'absolute', inset: 0, transformOrigin: 'left center',
              transform: `scaleX(${capped ? 1 : prog.progress})`,
              background: `linear-gradient(90deg, ${GOLD}99, ${GOLD})`,
              transition: 'transform 400ms ease',
            }} />
          </div>
          <p className="font-karla" style={{
            margin: '5px 0 0', fontSize: '0.68rem', color: `${SEA},0.6)`, fontVariantNumeric: 'tabular-nums',
          }}>
            {capped
              ? 'Every level from here banks a renown point.'
              : `${(prog.xpForLevel - prog.xpInLevel).toLocaleString()} XP to ${level + 1}`}
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 1.05rem 1rem' }}>
          {renown && (renown.available > 0 || capped) && (
            <button type="button" className="tap"
              onClick={() => { vibrate(10); onOpenRenown() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                marginBottom: '0.9rem', padding: '0.6rem 0.7rem', borderRadius: 12, cursor: 'pointer',
                background: renown.available > 0 ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${renown.available > 0 ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.1)'}`,
              }}>
              <span className="font-cinzel font-700" style={{ flex: 1, minWidth: 0, fontSize: '0.92rem', color: '#f4efe4' }}>
                Renown
              </span>
              <span className="font-karla" style={{ flexShrink: 0, fontSize: '0.7rem', color: renown.available > 0 ? GOLD : `${SEA},0.5)` }}>
                {renown.available > 0 ? `${renown.available} to spend` : 'All spent'}
              </span>
              <span aria-hidden style={{ flexShrink: 0, color: `${SEA},0.5)`, display: 'flex' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          )}

          <p className="font-karla font-800 uppercase" style={{
            margin: '0 0 0.45rem', fontSize: '0.5rem', letterSpacing: '0.2em', color: `${GOLD}cc`,
          }}>What it gives you</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {stats.map(s => {
              const on = asked === s.label
              return (
                <div key={s.label} style={{
                  borderRadius: 11, overflow: 'hidden',
                  background: 'rgba(255,255,255,0.035)',
                  border: `1px solid rgba(255,255,255,${on ? 0.14 : 0.07})`,
                }}>
                  {/* ONE LINE. The name, what it is, and where it goes — and
                      the whole row is the button that explains itself. */}
                  <button type="button" className="tap"
                    onClick={() => { vibrate(6); setAsked(on ? null : s.label) }}
                    aria-expanded={on}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 8, width: '100%',
                      padding: '0.5rem 0.65rem', background: 'none', border: 'none',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    <span className="font-karla font-700" style={{
                      flex: 1, minWidth: 0, fontSize: '0.78rem', color: '#f0ede8',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{s.label}</span>
                    <span className="font-cinzel font-700" style={{
                      flexShrink: 0, fontSize: '0.85rem', color: '#f6dfa0', fontVariantNumeric: 'tabular-nums',
                    }}>{s.value}</span>
                    {s.at && (
                      <span className="font-karla font-600" style={{
                        flexShrink: 0, fontSize: '0.66rem', color: `${SEA},0.5)`, fontVariantNumeric: 'tabular-nums',
                      }}>
                        → {s.at.value} at {s.at.level}
                      </span>
                    )}
                    <span aria-hidden style={{
                      flexShrink: 0, display: 'grid', placeItems: 'center',
                      width: 13, height: 13, borderRadius: '50%',
                      border: `1px solid ${SEA},${on ? 0.6 : 0.3})`,
                      color: `${SEA},${on ? 0.85 : 0.45})`,
                      fontSize: '0.5rem', fontStyle: 'italic', lineHeight: 1,
                    }}>i</span>
                  </button>
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.div key="note"
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        style={{ overflow: 'hidden' }}>
                        <p className="font-karla" style={{
                          margin: 0, padding: '0 0.65rem 0.55rem', fontSize: '0.68rem',
                          lineHeight: 1.45, color: `${SEA},0.6)`,
                        }}>{s.note}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>

          {soon.length > 0 && (
            <>
              <p className="font-karla font-800 uppercase" style={{
                margin: '0.95rem 0 0.45rem', fontSize: '0.5rem', letterSpacing: '0.2em', color: `${SEA},0.45)`,
              }}>Ahead</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                {soon.map(e => (
                  <div key={`${e.level}:${e.what}`} style={{
                    display: 'flex', alignItems: 'baseline', gap: 10,
                    padding: '0.45rem 0.65rem', borderRadius: 11,
                    background: 'rgba(255,255,255,0.025)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <span className="font-cinzel font-800" style={{
                      flexShrink: 0, width: 26, fontSize: '0.85rem', color: `${SEA},0.65)`,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{e.level}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.76rem', color: 'rgba(240,237,232,0.82)' }}>
                        {e.what}
                      </span>
                      {e.detail && (
                        <span className="font-karla" style={{ display: 'block', fontSize: '0.64rem', color: `${SEA},0.45)`, marginTop: 1 }}>
                          {e.detail}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </motion.div>
    </PopupShell>
  )
}
