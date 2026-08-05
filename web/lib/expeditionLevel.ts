// Identical leveling curve to fishing level
const BASE_GAP   = 60
const GAP_GROWTH = 1.086

function computeXPTable(): number[] {
  const table: number[] = [0]
  let total = 0
  for (let lv = 1; lv <= 99; lv++) {
    total += Math.floor(BASE_GAP * Math.pow(GAP_GROWTH, lv - 1))
    table.push(total)
  }
  return table
}

export const XP_TABLE: number[] = computeXPTable()
export const MAX_LEVEL = 100

export function getLevelFromXP(xp: number): number {
  if (xp >= XP_TABLE[MAX_LEVEL - 1]) return MAX_LEVEL
  for (let lv = MAX_LEVEL - 1; lv >= 1; lv--) {
    if (xp >= XP_TABLE[lv]) return lv + 1
  }
  return 1
}

export function getXPProgress(xp: number): {
  level: number
  progress: number
  xpInLevel: number
  xpForLevel: number
} {
  const level = getLevelFromXP(xp)
  if (level >= MAX_LEVEL) return { level: MAX_LEVEL, progress: 1, xpInLevel: 0, xpForLevel: 0 }
  const levelStart = XP_TABLE[level - 1]
  const levelEnd   = XP_TABLE[level]
  const xpInLevel  = xp - levelStart
  const xpForLevel = levelEnd - levelStart
  return { level, progress: xpInLevel / xpForLevel, xpInLevel, xpForLevel }
}

// Note: the seven nautical titles (Deckhand → Legendary Seafarer) used to
// live here tied to nav level. They were moved to lib/expeditions.ts as
// RANK_TITLES / getRankTitle so Voyage Score and Raid Score share ONE ladder
// and players don't juggle two title systems. Nav level is now just a number.

// ── Nav-level → combat bonuses ──────────────────────────────────────────────
// Veteran-captain stat boost applied on top of ship + crew totals. Per level:
//   +1 max HP
// Every 5 levels:
//   +1 Power, +1 Savvy, +1 Fortune  (the `navigation` field below = the Savvy stat; key kept to avoid a migration)
// Tuning sanity: at Nav 30 a player gains +30 HP and +6 to each of the other
// three stats — meaningful but doesn't eclipse crew/gear investment.
export interface NavLevelBonuses {
  hp: number
  power: number
  navigation: number
  fortune: number
}
export function navLevelBonuses(navLevel: number): NavLevelBonuses {
  return {
    hp:         navLevel,
    power:      Math.floor(navLevel / 5),
    navigation: Math.floor(navLevel / 5),
    fortune:    Math.floor(navLevel / 5),
  }
}

// ── XP awarded per voyage ────────────────────────────────────────────────────

// Base XP for completing the route at all. Triangle + Shroud were previously
// missing here and fell to the 150 default, so the dangerous late routes gave
// barely more Nav XP than Deep despite paying far more doubloons. Retuned
// 2026-06-17: the curve ramps steeply from Triangle on, so the endgame routes
// are the real XP grind, matching their doubloon jump (Deep ~800 → Triangle
// ~1,500 → Shroud ~2,100). Anything unlisted still falls to the 150 default.
export const ROUTE_BASE_XP: Record<string, number> = {
  coastal:  30,
  open:     55,
  deep:     90,
  triangle: 240,
  shroud:   420,
}

// XP per crew member (more crew = more XP, rewards building a full roster)
const XP_PER_CREW = 12

// XP per event, by type × outcome
const EVENT_XP: Record<string, Record<string, number>> = {
  encounter: { success: 18, failure: 5,  neutral: 8  },
  discovery: { success: 12, failure: 4,  neutral: 8  },
  danger:    { success: 14, failure: 3,  neutral: 6  },
  weather:   { success: 6,  failure: 3,  neutral: 4  },
  peaceful:  { success: 4,  failure: 4,  neutral: 4  },
}

// Voyages are Nav's passive leveler, the parallel to trawls for Fishing — but
// paid an order of magnitude less per stream, so they weren't a meaningful way
// to level Nav. Lift the whole payout ~2.75× to make them a worthwhile passive
// trickle. Deliberately NOT pushed to trawl-per-slot parity: Nav also has big
// active sources (raids + the Gauntlet), and trawls run 4 slots to a voyage's 1.
// One knob so it's easy to retune.
export const VOYAGE_XP_MULT = 2.75

/** Share of a voyage's Navigation XP that its surviving crew earn as CREW XP.
 *
 *  0.25. A voyage is a small top-up to a hand's training, not a way to train
 *  them: the Crew Hall is the building you pay for that, and it should be the
 *  obvious place to do it. Was 0.75, which made sailing a serious rival to the
 *  hall, and briefly a per-route constant while Nav XP was rebalanced (see
 *  ROUTE_PAYOUTS) before this went back to being a ratio.
 *
 *  A RATIO on purpose. It is meant to stay a quarter of the voyage whatever
 *  happens to Nav XP later, so this cannot silently drift the way it would if
 *  the two were separate numbers someone had to remember to update together.
 *
 *  For scale, at Drills VI a single bunk pays 4,100 crew XP an hour against a
 *  Shroud voyage's ~707 per surviving hand. The hall wins by roughly 6x, which
 *  is the point. */
export const VOYAGE_CREW_XP_MULT = 0.25

export function voyageXP(
  route: string,
  crewCount: number,
  events: { type: string; outcome: string; crewVariantLost?: number | null }[],
): number {
  const base      = ROUTE_BASE_XP[route] ?? 150
  const crewBonus = crewCount * XP_PER_CREW
  const eventXP   = events.reduce((sum, e) => {
    const row     = EVENT_XP[e.type] ?? EVENT_XP.peaceful
    // Crew loss always counts as failure for XP — dying in battle still teaches lessons
    const outcome = e.crewVariantLost != null ? 'failure' : (e.outcome ?? 'neutral')
    return sum + (row[outcome] ?? row.neutral ?? 20)
  }, 0)
  return Math.round((base + crewBonus + eventXP) * VOYAGE_XP_MULT)
}
