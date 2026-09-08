'use client'

// ── WHAT YOUR LEVEL IS ACTUALLY DOING FOR YOU ───────────────────────────────
//
// Two spines run this game — Fishing gates the fishing half, Navigation gates
// the expedition half — and until now neither of them had a page. There was a
// BAR: a number, a fill and, past 100, a chip that opened the renown allocator.
// A bar says how far along you are and nothing whatsoever about what being
// there is worth.
//
// So every question a captain has about a level is answered in one panel: what
// it takes to reach the next one, what this one is paying you right now, what
// the next one changes, and what is waiting further up the road.
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

import { useMemo } from 'react'
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
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { navLevelReqForShip } from '@/lib/gearGating'
import { RAID_MAP } from '@/lib/raidMap'
import type { RenownState } from '@/app/(app)/actions/renown'

const GOLD = '#f0c040'
const SEA = 'rgba(180,214,232'

export type Skill = 'fishing' | 'nav'

/** One thing a level is doing, or will do. */
type Line = { label: string; value: string; note?: string }

/**
 * THE FISHING SPINE, read off the same places fishing reads.
 *
 * `levelCatchBonus` is the only continuous one — every fifth level widens the
 * catch band by a degree — so it is quoted with the level that next moves it
 * rather than as "+0 next level", which is true four times in five and useless
 * every time.
 */
function fishingRows(level: number): { now: Line[]; next: Line[]; ahead: Line[] } {
  const band = levelCatchBonus(level)
  const waters = PLACES.filter(p => p.kind === 'water' && (p.minLevel ?? 0) > 0)
  const open = waters.filter(w => level >= (w.minLevel ?? 0))
  const shut = waters.filter(w => level < (w.minLevel ?? 0)).sort((a, b) => (a.minLevel ?? 0) - (b.minLevel ?? 0))
  const nextWater = shut[0]

  const now: Line[] = [
    { label: 'Catch band', value: `+${band}°`, note: 'Widens the green zone on the dial, on top of your hook.' },
    { label: 'Waters open', value: `${open.length} of ${waters.length}`, note: open.length ? open[open.length - 1].name : 'The Shallows' },
  ]
  if (level >= 75) now.push({ label: "The day's orders", value: '4 a day', note: 'A fourth challenge, from Fishing 75.' })
  if (level >= FISH_MAX) now.push({ label: 'Prestige', value: 'Open', note: 'Reset the curve for a permanent multiplier. See the Homestead.' })

  const next: Line[] = []
  if (level < FISH_MAX) {
    const at = level + 1
    // The band moves on fifths. Say WHICH level moves it, not "+0".
    const bandAt = levelCatchBonus(at)
    if (bandAt > band) next.push({ label: 'Catch band', value: `+${bandAt}°`, note: 'One more degree of green.' })
    else {
      const to = Math.ceil((level + 1) / 5) * 5
      next.push({ label: 'Catch band', value: `+${levelCatchBonus(to)}° at ${to}`, note: 'The band widens every fifth level.' })
    }
    const r = rewardForLevel(at)
    if (r) next.push({ label: r.milestone ? 'Milestone reward' : 'Level reward', value: rewardLabel(r), note: r.milestone ? 'Every fifth level pays more.' : undefined })
    if (nextWater && (nextWater.minLevel ?? 0) === at) {
      next.push({ label: 'New water', value: nextWater.name, note: 'Opens the moment you reach it.' })
    }
  }

  const ahead: Line[] = []
  if (nextWater && (nextWater.minLevel ?? 0) > level + 1) {
    ahead.push({ label: nextWater.name, value: `Fishing ${nextWater.minLevel}`, note: 'The next water to open.' })
  }
  if (level < 75) ahead.push({ label: 'A fourth daily order', value: 'Fishing 75' })
  if (level < LEVEL_REWARD_MAX) {
    const nm = Math.min(LEVEL_REWARD_MAX, Math.ceil((level + 1) / 5) * 5)
    if (nm > level) ahead.push({ label: 'Next milestone', value: `Fishing ${nm}`, note: rewardLabel(rewardForLevel(nm) ?? {}) })
  }
  if (level < FISH_MAX) ahead.push({ label: 'Prestige, and renown', value: `Fishing ${FISH_MAX}`, note: 'The curve ends and the points begin.' })
  return { now, next, ahead }
}

/**
 * THE NAVIGATION SPINE.
 *
 * Nav pays a hull point EVERY level and a point of power, navigation and
 * fortune every fifth — see `navLevelBonuses` — so the "next level" answer is
 * genuinely different depending on where you are standing, and it says which.
 */
function navRows(level: number, hallTier: number): { now: Line[]; next: Line[]; ahead: Line[] } {
  const b = navLevelBonuses(level)
  const cap = crewCapacity(level, hallTier)

  const now: Line[] = [
    { label: 'Ship hull', value: `+${b.hp} HP`, note: 'One hull point every Navigation level.' },
    { label: 'Crew stats', value: `+${b.power} power · +${b.navigation} nav · +${b.fortune} fortune`, note: 'One of each every fifth level.' },
    { label: 'Berths', value: `${cap} crew`, note: 'Navigation and your Crew Hall together.' },
  ]
  const hulls = Object.entries(EXPEDITION_SHIP_STATS)
    .map(([tier, st]) => ({ tier: Number(tier), name: (st as { name?: string }).name ?? `Tier ${tier}`, cost: (st as { cost?: number }).cost ?? 0 }))
    .filter(h => h.cost > 0)
    .sort((x, y) => x.cost - y.cost)
  const buyable = hulls.filter(h => level >= navLevelReqForShip(h.cost))
  if (buyable.length) now.push({ label: 'Hulls open', value: buyable[buyable.length - 1].name, note: `${buyable.length} of ${hulls.length} at the Shipyard.` })
  if (level >= NAV_MAX) now.push({ label: 'Renown', value: 'Open', note: 'Every level past the cap banks a point.' })

  const next: Line[] = []
  if (level < NAV_MAX) {
    const at = level + 1
    const nb = navLevelBonuses(at)
    next.push({ label: 'Ship hull', value: `+1 HP`, note: `${nb.hp} in all.` })
    if (nb.power > b.power) next.push({ label: 'Crew stats', value: '+1 power, +1 nav, +1 fortune', note: 'Every fifth level, and the next one is it.' })
    else {
      const to = Math.ceil((level + 1) / 5) * 5
      next.push({ label: 'Crew stats', value: `+1 of each at ${to}`, note: 'Power, navigation and fortune move on fifths.' })
    }
    if (crewCapacity(at, hallTier) > cap) next.push({ label: 'Berths', value: `${crewCapacity(at, hallTier)} crew`, note: 'One more hand aboard.' })
    const hull = hulls.find(h => navLevelReqForShip(h.cost) === at)
    if (hull) next.push({ label: 'New hull', value: hull.name, note: 'Buyable at the Shipyard once you have the coin.' })
  }

  const ahead: Line[] = []
  const nextHull = hulls.find(h => navLevelReqForShip(h.cost) > level + 1)
  if (nextHull) ahead.push({ label: nextHull.name, value: `Navigation ${navLevelReqForShip(nextHull.cost)}`, note: 'The next hull the yard will sell you.' })
  const gate = RAID_MAP
    .filter(n => (n.requiresNavLevel ?? 0) > level)
    .sort((x, y) => (x.requiresNavLevel ?? 0) - (y.requiresNavLevel ?? 0))[0]
  if (gate) ahead.push({ label: gate.label, value: `Navigation ${gate.requiresNavLevel}`, note: 'A stop on the campaign that will not talk to you yet.' })
  const nextCap = [...Array(NAV_MAX)].map((_, i) => i + 1).find(l => l > level && crewCapacity(l, hallTier) > cap)
  if (nextCap && nextCap > level + 1) ahead.push({ label: 'Another berth', value: `Navigation ${nextCap}` })
  if (level < NAV_MAX) ahead.push({ label: 'Renown', value: `Navigation ${NAV_MAX}`, note: 'The curve ends and the points begin.' })
  return { now, next, ahead }
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

  const rows = useMemo(
    () => (fishing ? fishingRows(level) : navRows(level, hallTier)),
    [fishing, level, hallTier],
  )

  const title = fishing ? 'Fishing' : 'Navigation'
  const what = fishing
    ? 'Every fish you land. The harder the water, the more it pays.'
    : 'Voyages, raids and the gauntlets. Nothing on the fishing side moves it.'

  return (
    <PopupShell open={open} onClose={onClose}>
      <motion.div role="dialog" aria-modal onClick={e => e.stopPropagation()}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.16 }}
        style={{
          position: 'relative', margin: 'auto', width: '100%', maxWidth: 'var(--modal-w)',
          height: 'min(80vh, 660px)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          borderRadius: 20,
          background: 'linear-gradient(180deg, rgba(28,24,17,0.72) 0%, rgba(10,12,16,0.8) 100%), rgba(8,12,18,0.98)',
          border: '1px solid rgba(196,169,106,0.34)',
          boxShadow: '0 18px 50px rgba(0,0,0,0.6)',
        }}>
        <CloseButton onClick={onClose} style={{ position: 'absolute', top: 12, right: 12, zIndex: 4 }} />

        {/* ── THE LEVEL, AND HOW FAR TO THE NEXT ─────────────────────────── */}
        <div style={{ flexShrink: 0, padding: '1.05rem 1.05rem 0.9rem' }}>
          <p className="font-karla font-800 uppercase" style={{ fontSize: '0.5rem', letterSpacing: '0.24em', color: `${GOLD}cc`, margin: 0 }}>
            Your {title}
          </p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 3, paddingRight: 34 }}>
            <span className="font-cinzel font-800" style={{ fontSize: '2.1rem', lineHeight: 1, color: '#f4efe4' }}>
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
              ? 'Nothing left on the curve. Every level from here banks a renown point.'
              : `${prog.xpInLevel.toLocaleString()} / ${prog.xpForLevel.toLocaleString()} XP · ${(prog.xpForLevel - prog.xpInLevel).toLocaleString()} to ${level + 1}`}
          </p>
          <p className="font-karla" style={{ margin: '6px 0 0', fontSize: '0.68rem', color: `${SEA},0.45)`, lineHeight: 1.45, fontStyle: 'italic' }}>
            {what}
          </p>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: '0 1.05rem 1rem' }}>
          {/* ── RENOWN, WHEN THERE IS ANY ────────────────────────────────
              At the top once it exists, because a captain at the cap has
              nothing else on this panel that changes: points in hand are the
              only live thing left. Below the cap it is not mentioned — an
              allocator you cannot use is a locked door with a sign on it. */}
          {renown && (renown.available > 0 || capped) && (
            <button type="button" className="tap"
              onClick={() => { vibrate(10); onOpenRenown() }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                marginBottom: '0.9rem', padding: '0.65rem 0.75rem', borderRadius: 12, cursor: 'pointer',
                background: renown.available > 0 ? 'rgba(240,192,64,0.1)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${renown.available > 0 ? 'rgba(240,192,64,0.45)' : 'rgba(255,255,255,0.1)'}`,
              }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="font-cinzel font-700" style={{ display: 'block', fontSize: '0.95rem', color: '#f4efe4' }}>
                  Renown
                </span>
                <span className="font-karla" style={{ display: 'block', fontSize: '0.68rem', color: `${SEA},0.55)`, marginTop: 1 }}>
                  {renown.available > 0
                    ? `${renown.available} point${renown.available === 1 ? '' : 's'} to spend`
                    : 'Every point spent. Open to read them again.'}
                </span>
              </span>
              {renown.available > 0 && (
                <span className="font-cinzel font-800" style={{
                  flexShrink: 0, fontSize: '1.3rem', color: GOLD, fontVariantNumeric: 'tabular-nums',
                }}>{renown.available}</span>
              )}
              <span aria-hidden style={{ flexShrink: 0, color: `${SEA},0.5)`, display: 'flex' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </span>
            </button>
          )}

          <Group title={`What ${title} ${level} gives you`} lines={rows.now} accent={GOLD} />
          {rows.next.length > 0 && (
            <Group title={`At ${title} ${level + 1}`} lines={rows.next} accent="rgba(143,220,154,0.9)" />
          )}
          {rows.ahead.length > 0 && (
            <Group title="Further up" lines={rows.ahead} accent={`${SEA},0.45)`} muted />
          )}
        </div>
      </motion.div>
    </PopupShell>
  )
}

/** One block of facts. The value carries the weight and the note explains it,
 *  because a number without its unit is a quiz. */
function Group({ title, lines, accent, muted }: {
  title: string; lines: Line[]; accent: string; muted?: boolean
}) {
  return (
    <div style={{ marginBottom: '0.95rem' }}>
      <p className="font-karla font-800 uppercase" style={{
        margin: '0 0 0.45rem', fontSize: '0.5rem', letterSpacing: '0.2em', color: accent,
      }}>{title}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.34rem' }}>
        {lines.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'baseline', gap: 10,
            padding: '0.5rem 0.65rem', borderRadius: 11,
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid rgba(255,255,255,0.07)',
            opacity: muted ? 0.85 : 1,
          }}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span className="font-karla font-700" style={{ display: 'block', fontSize: '0.8rem', color: '#f0ede8' }}>
                {l.label}
              </span>
              {l.note && (
                <span className="font-karla" style={{ display: 'block', fontSize: '0.66rem', color: `${SEA},0.5)`, lineHeight: 1.4, marginTop: 2 }}>
                  {l.note}
                </span>
              )}
            </span>
            <span className="font-cinzel font-700" style={{
              flexShrink: 0, fontSize: '0.86rem', color: muted ? `${SEA},0.6)` : '#f6dfa0',
              fontVariantNumeric: 'tabular-nums', textAlign: 'right', maxWidth: '48%',
            }}>{l.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Kept so the file has one export shape whichever way it is imported. */
export { AnimatePresence }
