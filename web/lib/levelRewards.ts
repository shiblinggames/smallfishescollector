// ── FISHING LEVEL REWARDS ────────────────────────────────────────────────────
// Every level from 2 to 50 pays something. Before this, 20 of the first 25 paid
// NOTHING, while the level-up overlay fired a full-screen fireworks display around
// `Math.floor(level * 0.2)` degrees of catch zone — which only ticks every 5th level.
// Four times out of five a new captain got rings, sparkles, and nothing measurable.
// That is not a missing dopamine hit, it is a broken promise, and it teaches a player
// that levelling is noise.
//
// ── HOW THE COIN IS SIZED, AND WHY IT IS NOT MORE ────────────────────────────
// The first cut of this table was a SECOND JOB. Reaching level 50, a captain fishes up
// roughly 67,000 doubloons — and the rewards handed them another 133,000 on top. A 197%
// bonus on their entire income. Levelling was out-earning the core loop two to one,
// which quietly tells a player: do not bother fishing, just level.
//
// So a reward is now a SLICE of what that level already paid you, tapering from ~35% of
// it early to ~5% by level 50, as your own income takes over. Milestones multiply that
// slice by 3, so the pop survives while staying cheap in absolute terms. Total across
// all 49 levels: ~23,000 doubloons — a 34% bonus. A garnish on the loop, not a rival.
//
// The ordinary levels are MONOTONE by construction. The raw model dipped when a captain
// entered a new zone (XP-per-catch changes, so level 16 paid less than level 14), and a
// reward that SHRINKS as you climb is worse than no reward at all.
//
// ── AND IT STOPS AT 50 ───────────────────────────────────────────────────────
// Past 50 you are making real money. A level-60 reward measured 55% of what fishing that
// level had already given you; a level-80 reward, 14%. A reward you would not notice is
// noise, and it cheapens the ones that land. Levelling past 50 is not empty — the Abyss
// opens at 50, Ancient Deep at 75, gear keeps climbing, Renown waits at 100 — it just
// stops needing a purse taped to it.
//
// Granted STATE-BASED, never on the crossing: trawl XP can level a captain up while they
// are nowhere near the fishing screen, so the grant reconciles against
// claimed_fishing_levels and is idempotent. See claimFishingLevelRewards.

import { getBait } from './bait'
import { FISH_HOLD_TIERS } from './fishHold'

export interface LevelReward {
  doubloons?: number
  gems?: number
  /** Bait to hand over: type → count. Types must exist in lib/bait. */
  bait?: Record<string, number>
  /**
   * Raise the fish hold to AT LEAST this tier. A FLOOR, not a bump.
   *
   * It was a relative +1, which meant the identical "bigger fish hold" reward was worth
   * 500 doubloons to a fresh captain and 50,000 to one who had already bought a Deep
   * Hold — the same level-up, a hundredfold difference in value, scaling with what the
   * player had ALREADY paid. A floor gives everyone the same thing, and a captain who
   * already bought better simply keeps it.
   */
  holdFloor?: number
  /** A milestone gets the bigger treatment on the overlay. */
  milestone?: boolean
}

/** The last level that pays. See the header. */
export const LEVEL_REWARD_MAX = 50

/** Every 5th level up to the cap. */
export function isMilestoneLevel(level: number): boolean {
  return level >= 5 && level <= LEVEL_REWARD_MAX && level % 5 === 0
}

/**
 * Doubloons per level. A literal table rather than a formula, so it can be READ and
 * audited at a glance, and so a future tweak to the XP curve can never silently move the
 * economy. Derived from "a tapering slice of that level's own fishing income" (35% → 5%,
 * milestones x3), then locked in. Monotone: no level pays less than the one before it.
 */
const COIN: Record<number, number> = {
  2: 90,    3: 100,   4: 110,   5: 360,   6: 130,   7: 140,   8: 150,   9: 160,   10: 510,
  11: 180,  12: 190,  13: 200,  14: 210,  15: 660,  16: 230,  17: 240,  18: 250,  19: 260,  20: 810,
  21: 280,  22: 290,  23: 300,  24: 310,  25: 960,  26: 330,  27: 340,  28: 350,  29: 360,  30: 1110,
  31: 380,  32: 390,  33: 400,  34: 410,  35: 1260, 36: 430,  37: 440,  38: 450,  39: 460,  40: 1410,
  41: 480,  42: 490,  43: 500,  44: 510,  45: 1560, 46: 530,  47: 540,  48: 550,  49: 560,  50: 1710,
}

/**
 * The non-coin extras. Bait survives the trim because it feeds the fishing loop rather
 * than bypassing it. The hold floors are deliberately CHEAP tiers (500 and 2,000): the
 * Lv 50 send-off used to hand over a Deep Hold worth 20,000, which was most of the bloat
 * on its own.
 */
const EXTRAS: Record<number, Omit<LevelReward, 'doubloons' | 'milestone'>> = {
  2:  { bait: { worm: 5 } },
  3:  { bait: { minnow: 3 } },
  5:  { gems: 5,  bait: { minnow: 5 } },
  6:  { bait: { worm: 8 } },
  8:  { bait: { night_crawler: 3 } },
  10: { gems: 10, holdFloor: 1 },
  11: { bait: { minnow: 6 } },
  13: { bait: { night_crawler: 5 } },
  15: { gems: 15, bait: { chum: 5 } },
  16: { bait: { worm: 12 } },
  18: { bait: { chum: 4 } },
  20: { gems: 20, holdFloor: 2 },
  21: { bait: { night_crawler: 8 } },
  23: { bait: { chum: 6 } },
  25: { gems: 30, bait: { anglers_formula: 3 } },
  30: { gems: 35 },
  35: { gems: 40 },
  40: { gems: 45 },
  45: { gems: 50 },
  // The last reward there is. It leans on GEMS, a separate currency that does not inflate
  // the doubloon economy the way another five-figure purse would.
  50: { gems: 100, bait: { anglers_formula: 10 } },
}

/** What level `level` pays, or null if it pays nothing (below 2, or past the cap). */
export function rewardForLevel(level: number): LevelReward | null {
  if (level < 2 || level > LEVEL_REWARD_MAX) return null
  const coin = COIN[level]
  if (coin == null) return null
  return { doubloons: coin, milestone: isMilestoneLevel(level), ...EXTRAS[level] }
}

/**
 * The label, BUILT FROM THE PAYLOAD.
 *
 * These used to be hand-written strings sitting beside the numbers, which is precisely
 * what drifts: change a value, forget the label, and the game cheerfully promises one
 * figure and pays another. The label can no longer disagree with the reward, because it
 * is derived from it.
 */
export function rewardLabel(r: LevelReward): string {
  const parts: string[] = []
  if (r.doubloons) parts.push(`${r.doubloons.toLocaleString()} ⟡`)
  if (r.gems) parts.push(`${r.gems} ◆`)
  for (const [type, qty] of Object.entries(r.bait ?? {})) {
    const b = getBait(type)
    if (b) parts.push(`${qty} ${b.name}`)
  }
  if (r.holdFloor != null) parts.push(FISH_HOLD_TIERS[r.holdFloor]?.name ?? 'a bigger hold')
  if (parts.length <= 1) return parts[0] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** Every level in (claimedThrough, level] that owes a reward. A set difference, not a
 *  crossing test — a trawl can level you up while you are nowhere near this screen. */
export function rewardsOwed(claimedThrough: number, level: number): { level: number; reward: LevelReward }[] {
  const out: { level: number; reward: LevelReward }[] = []
  for (let l = Math.max(2, claimedThrough + 1); l <= Math.min(level, LEVEL_REWARD_MAX); l++) {
    const r = rewardForLevel(l)
    if (r) out.push({ level: l, reward: r })
  }
  return out
}

/** The carrot. What the NEXT level pays, so there is always a stated reason to cast one
 *  more time. Nothing on the XP bar said this before. Null past the cap. */
export function nextLevelReward(level: number): { level: number; reward: LevelReward } | null {
  const r = rewardForLevel(level + 1)
  return r ? { level: level + 1, reward: r } : null
}
