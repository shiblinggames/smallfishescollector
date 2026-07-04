// Crew leveling — GEOMETRIC progression (2026-07-04). Each level costs
// LEVEL_GROWTH× the one before it, so per-level cost COMPOUNDS: trivial early,
// steep late. Switched from the old arithmetic (linear-slope) curve because the
// user wanted a clear "easy early, way harder late" shape.
//
// Pacing (BASE 188, growth 1.06 → ~1.0M total to Lv 100):
//   - Lv  1→2:      188 XP    → early levels fly (a single raid = several)
//   - Lv 25→26:     761 XP
//   - Lv 50→51:   3,267 XP
//   - Lv 75→76:  14,021 XP
//   - Lv 99→100: 56,772 XP    → the late-game wall
// Cumulative: Lv 50 ≈ 5.5% of the whole grind, Lv 90 ≈ 59%, and the LAST 10
// LEVELS (90→100) are ~41% — reaching 100 is a real long haul. Retune via BASE
// (early cost) + LEVEL_GROWTH (how sharply it compounds; higher = steeper late).
//
// Why ~1M + geometric: original curve was ~252,945 (arithmetic, tuned to the
// RAID path ~278 raids), but the Gauntlet pays crew XP fast AND is UNCAPPED so
// maxing was trivial. Raids still grant FULL crew XP (per-source decouple
// rejected — earlier raids kept full). Level + STATS derive live from stored
// XP, so this retroactively lowered every existing crew's level + stat ticks.
//
// Tuning history: arithmetic BASE 1400+178/lv (~1M, moderate back-load) was the
// prior shape; earlier small-total geometric tries (BASE 6 g1.086 too cheap
// early, BASE 60 g1.05) informed the growth pick. g1.06 keeps the total ~1M
// while making the top a wall — the "way harder late" the user asked for.
//
// What grants stats vs what's just progress:
//   - Lv 3, 6, 9, ..., 99 → +1 stat tick (33 milestones)
//   - Lv 50              → +1 bonus tick
//   - Lv 100             → +2 bonus ticks
//   Total: +36 stat points lifetime.
// All other levels are pure XP progress — bar fills, no stat change. This
// keeps stat moments feeling like *events* rather than a constant trickle.
//
// Stat distribution is auto by the crew's affinity (their rolled stats — the
// same biases that `rollStats` applied at recruit), with a min-1-per-stat
// floor once we have ≥3 ticks. Distribution is hidden from players during
// play (no "next tick: Power" preview); the graveyard memorial surfaces the
// final lifetime distribution as a tribute.

const BASE_LEVEL_COST = 188    // XP cost of Lv 1→2 (early levels are cheap)
const LEVEL_GROWTH    = 1.06   // each level costs this multiple of the previous (geometric — compounds into a late wall)

function computeXPTable(): number[] {
  const table: number[] = [0]
  let total = 0
  let cost = BASE_LEVEL_COST
  for (let lv = 1; lv <= 99; lv++) {
    total += Math.round(cost)
    table.push(total)
    cost *= LEVEL_GROWTH
  }
  return table
}

// XP_TABLE[n] = total XP needed to reach level n+1 (matches the
// fishing/expedition pattern).
export const XP_TABLE: number[] = computeXPTable()
export const CREW_MAX_LEVEL = 100

export function crewLevelFromXP(xp: number): number {
  if (xp >= XP_TABLE[CREW_MAX_LEVEL - 1]) return CREW_MAX_LEVEL
  for (let lv = CREW_MAX_LEVEL - 1; lv >= 1; lv--) {
    if (xp >= XP_TABLE[lv]) return lv + 1
  }
  return 1
}

export interface CrewXPProgress {
  level: number
  progress: number    // 0–1 fill fraction for the XP bar
  xpInLevel: number   // XP earned within the current level
  xpForLevel: number  // total XP span of the current level
  xpToNextLevel: number
}

export function crewXPProgress(xp: number): CrewXPProgress {
  const level = crewLevelFromXP(xp)
  if (level >= CREW_MAX_LEVEL) {
    return { level: CREW_MAX_LEVEL, progress: 1, xpInLevel: 0, xpForLevel: 0, xpToNextLevel: 0 }
  }
  const currentLevelXP = XP_TABLE[level - 1]
  const nextLevelXP    = XP_TABLE[level]
  const xpInLevel  = xp - currentLevelXP
  const xpForLevel = nextLevelXP - currentLevelXP
  return {
    level,
    progress: xpForLevel > 0 ? Math.min(1, xpInLevel / xpForLevel) : 1,
    xpInLevel,
    xpForLevel,
    xpToNextLevel: Math.max(0, nextLevelXP - xp),
  }
}

// ── Stat milestone schedule ─────────────────────────────────────────────────
// Number of stat ticks earned by the given level. Each tick = +1 stat point
// (the distribution to specific stats is handled by levelStatBonuses below).
export function statTicksEarned(level: number): number {
  if (level < 3) return 0
  // Regular ticks: every 3rd level from Lv 3 through Lv 99.
  let ticks = Math.floor(Math.min(level, 99) / 3)
  if (level >= 50) ticks += 1
  if (level >= 100) ticks += 2
  return ticks
}

/** Whether the GIVEN level granted a stat tick (used by end-of-mission UI to
 *  decide if a level-up row should get the milestone gold-flash). */
export function isStatTickLevel(level: number): boolean {
  if (level === 50 || level === 100) return true
  if (level >= 3 && level <= 99 && level % 3 === 0) return true
  return false
}

// ── Stat distribution by affinity ───────────────────────────────────────────
// Total bonus stats earned at this level, distributed across power/dodge/
// fortune by the crew's own rolled-stat affinity (largest-remainder method).
// Min 1-per-stat once we have ≥3 ticks so the highest-affinity stat never
// monopolises the entire bonus pool. Deterministic — same affinity + level
// always produces the same distribution.
export interface StatTriple { power: number; dodge: number; fortune: number }

export function levelStatBonuses(level: number, affinity: StatTriple): StatTriple {
  const total = statTicksEarned(level)
  if (total === 0) return { power: 0, dodge: 0, fortune: 0 }
  return distributeProportional(total, affinity)
}

function distributeProportional(total: number, affinity: StatTriple): StatTriple {
  const keys: Array<keyof StatTriple> = ['power', 'dodge', 'fortune']
  const weights = keys.map(k => Math.max(0, affinity[k]))
  const sumW = weights[0] + weights[1] + weights[2]

  // No affinity signal — split as evenly as possible (power > dodge > fortune
  // for the rounding tie-break so behaviour is deterministic).
  if (sumW <= 0) {
    const each = Math.floor(total / 3)
    const rem  = total - each * 3
    return {
      power:   each + (rem > 0 ? 1 : 0),
      dodge:   each + (rem > 1 ? 1 : 0),
      fortune: each,
    }
  }

  // Largest-remainder method: floor each share, distribute the remainder to
  // the largest fractional parts.
  const shares = weights.map(w => (w / sumW) * total)
  const floors = shares.map(s => Math.floor(s))
  const fracs  = shares.map((s, i) => ({ key: keys[i], frac: s - floors[i] }))
  let assigned = floors.reduce((a, b) => a + b, 0)
  const remainder = total - assigned
  const sorted = [...fracs].sort((a, b) => b.frac - a.frac)
  const allocs: Record<keyof StatTriple, number> = { power: floors[0], dodge: floors[1], fortune: floors[2] }
  for (let i = 0; i < remainder; i++) allocs[sorted[i].key] += 1

  // Min 1-per-stat floor (only meaningful once total ≥ 3 — before that we
  // physically don't have enough points to give all three stats one).
  if (total >= 3) {
    for (const k of keys) {
      if (allocs[k] === 0) {
        // Steal from the highest-allocated stat (which has the most cushion).
        const donor = keys.reduce((acc, kk) => (allocs[kk] > allocs[acc] ? kk : acc), keys[0])
        if (allocs[donor] > 1) {
          allocs[donor] -= 1
          allocs[k] = 1
        }
      }
    }
  }

  return { power: allocs.power, dodge: allocs.dodge, fortune: allocs.fortune }
}

/** Apply a crew's level bonuses to a base stat triple. Use this everywhere
 *  crew stats are read for combat/voyage math — single source of truth so
 *  retuning the curve doesn't require a code-wide audit. */
export function applyLevelBonuses(base: StatTriple, xp: number, affinity?: StatTriple): StatTriple {
  const level = crewLevelFromXP(xp)
  // Affinity defaults to the crew's own base stats — the rolled stats are
  // already biased by species profile (see rollStats in crewGen), so they
  // are the cleanest "who is this individual" signal we have.
  const bonus = levelStatBonuses(level, affinity ?? base)
  return {
    power:   base.power   + bonus.power,
    dodge:   base.dodge   + bonus.dodge,
    fortune: base.fortune + bonus.fortune,
  }
}
