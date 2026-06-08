// Crew leveling — matches the player's per-level XP cost EARLY (BASE_GAP=60,
// same as player) so a fresh recruit doesn't trivialize the first ten levels,
// but uses a much gentler geometric growth (1.05 vs player's 1.086) so the
// late game doesn't become an unscalable wall. Lv 100 takes ~149,044 XP — a
// multi-month project at engaged pacing, but real, not a years-long grind.
//
// Pacing reality check (910 XP/Krust raid):
//   - 1 raid:    Lv 12 from Lv 1   (player-feel: 910 player-XP also = Lv 12)
//   - 5 raids:   ~Lv 25
//   - 20 raids:  ~Lv 45
//   - 100 raids: ~Lv 85
//   - 163 raids: Lv 100
//
// First curve (BASE=6, growth=1.086) inherited the player's STEEP-LATE feel
// but compressed the early ramp into nothing — 910 XP would put a Lv 1 crew
// at Lv 33. Players reasonably read that as a bug. The corrected curve below
// keeps Lv 1→11 around 60–93 XP per level (same shape as player) and tapers
// the late compound so Lv 91→100 is meaningful but not a wall.
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

const BASE_GAP   = 60
const GAP_GROWTH = 1.05

function computeXPTable(): number[] {
  const table: number[] = [0]
  let total = 0
  for (let lv = 1; lv <= 99; lv++) {
    total += Math.floor(BASE_GAP * Math.pow(GAP_GROWTH, lv - 1))
    table.push(total)
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
