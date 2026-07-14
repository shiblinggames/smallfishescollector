// ── FISHING LEVEL REWARDS ────────────────────────────────────────────────────
// Every level pays something. It did not before, and that was the single worst thing
// about the early game.
//
// The numbers said it plainly: 20 of the first 25 levels handed the player NOTHING.
// Worse, the level-up overlay fired a full-screen fireworks display around
// `Math.floor(level * 0.2)` degrees of catch zone — which only ticks every 5th level —
// so four times out of five a new captain got rings, sparkles, and the words
// "Catch Zone +0". That is not a missing dopamine hit, it is a BROKEN PROMISE, and it
// teaches a player that levelling up is noise.
//
// The pacing was never the problem: a new captain levels every 6 to 14 catches. The
// payload was. So now:
//
//   - EVERY level from 2 up pays. There is no empty level-up left.
//   - MILESTONES (5/10/15/20/25/30...) pay heavily. Variable reward size is what
//     sustains a loop; a flat drip is only marginally better than nothing.
//   - The rewards VARY (coin, bait, gems, hold space). A predictable reward stops
//     being a reward.
//
// Granted STATE-BASED, never on the crossing: trawl XP can level a captain up while
// they are nowhere near the fishing screen, so the grant reconciles against
// claimed_fishing_levels and is idempotent. See claimFishingLevelRewards.

export interface LevelReward {
  doubloons?: number
  gems?: number
  /** Bait to hand over: type → count. Types must exist in lib/bait. */
  bait?: Record<string, number>
  /** Bump the fish hold by this many tiers. */
  holdTiers?: number
  /** The headline on the level-up overlay. Say what they GOT, not what it means. */
  label: string
  /** A milestone gets the bigger treatment on the overlay. */
  milestone?: boolean
}

/** Doubloons for an ordinary level. Grows with the level so it stays worth having. */
function coinFor(level: number): number {
  return Math.round((120 + level * 45) / 10) * 10
}

/**
 * What each level pays. Levels past the table's end fall back to a scaling coin purse,
 * so the curve never dead-ends and a level 80 captain is not levelling for nothing.
 */
export const LEVEL_REWARDS: Record<number, LevelReward> = {
  2:  { doubloons: coinFor(2),  bait: { worm: 5 },            label: '210 ⟡ and 5 Worms' },
  3:  { doubloons: coinFor(3),  bait: { minnow: 3 },          label: '260 ⟡ and 3 Minnow' },
  4:  { doubloons: coinFor(4),                                label: '300 ⟡' },
  5:  { doubloons: 750, gems: 5, bait: { minnow: 5 },         label: '750 ⟡, 5 ◆, and 5 Minnow', milestone: true },
  6:  { doubloons: coinFor(6),  bait: { worm: 8 },            label: '390 ⟡ and 8 Worms' },
  7:  { doubloons: coinFor(7),                                label: '440 ⟡' },
  8:  { doubloons: coinFor(8),  bait: { night_crawler: 3 },   label: '480 ⟡ and 3 Night Crawlers' },
  9:  { doubloons: coinFor(9),                                label: '530 ⟡' },
  10: { doubloons: 1500, gems: 10, holdTiers: 1,              label: '1,500 ⟡, 10 ◆, and a bigger fish hold', milestone: true },
  11: { doubloons: coinFor(11), bait: { minnow: 6 },          label: '620 ⟡ and 6 Minnow' },
  12: { doubloons: coinFor(12),                               label: '660 ⟡' },
  13: { doubloons: coinFor(13), bait: { night_crawler: 5 },   label: '710 ⟡ and 5 Night Crawlers' },
  14: { doubloons: coinFor(14),                               label: '750 ⟡' },
  15: { doubloons: 2500, gems: 15, bait: { chum: 5 },         label: '2,500 ⟡, 15 ◆, and 5 Chum', milestone: true },
  16: { doubloons: coinFor(16), bait: { worm: 12 },           label: '840 ⟡ and 12 Worms' },
  17: { doubloons: coinFor(17),                               label: '890 ⟡' },
  18: { doubloons: coinFor(18), bait: { chum: 4 },            label: '930 ⟡ and 4 Chum' },
  19: { doubloons: coinFor(19),                               label: '980 ⟡' },
  20: { doubloons: 4000, gems: 20, holdTiers: 1,              label: '4,000 ⟡, 20 ◆, and a bigger fish hold', milestone: true },
  21: { doubloons: coinFor(21), bait: { night_crawler: 8 },   label: '1,070 ⟡ and 8 Night Crawlers' },
  22: { doubloons: coinFor(22),                               label: '1,110 ⟡' },
  23: { doubloons: coinFor(23), bait: { chum: 6 },            label: '1,160 ⟡ and 6 Chum' },
  24: { doubloons: coinFor(24),                               label: '1,200 ⟡' },
  25: { doubloons: 6000, gems: 30, bait: { anglers_formula: 3 }, label: "6,000 ⟡, 30 ◆, and 3 Angler's Formula", milestone: true },
}

/** Every 5th level is a milestone, table or not. */
export function isMilestoneLevel(level: number): boolean {
  return level >= 5 && level % 5 === 0
}

/** What level `level` pays. Past the table, a scaling purse (with a milestone bump)
 *  so a high-level captain is never levelling for nothing. */
export function rewardForLevel(level: number): LevelReward | null {
  if (level < 2) return null
  const listed = LEVEL_REWARDS[level]
  if (listed) return listed

  const milestone = isMilestoneLevel(level)
  const doubloons = milestone ? coinFor(level) * 6 : coinFor(level) * 2
  const gems = milestone ? Math.min(50, 20 + Math.floor(level / 5) * 2) : undefined
  return {
    doubloons,
    gems,
    milestone,
    label: gems
      ? `${doubloons.toLocaleString()} ⟡ and ${gems} ◆`
      : `${doubloons.toLocaleString()} ⟡`,
  }
}

/** Every level in (from, to] that owes a reward. `from` is what they had ALREADY been
 *  paid for, so this is a set difference and not a crossing test. */
export function rewardsOwed(claimedThrough: number, level: number): { level: number; reward: LevelReward }[] {
  const out: { level: number; reward: LevelReward }[] = []
  for (let l = Math.max(2, claimedThrough + 1); l <= level; l++) {
    const r = rewardForLevel(l)
    if (r) out.push({ level: l, reward: r })
  }
  return out
}

/** The carrot. What the NEXT level pays, so there is always a stated reason to fish
 *  one more cast. Nothing on the XP bar said this before. */
export function nextLevelReward(level: number): { level: number; reward: LevelReward } | null {
  const next = level + 1
  const r = rewardForLevel(next)
  return r ? { level: next, reward: r } : null
}
