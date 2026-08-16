export interface CharacterColor {
  id: string
  name: string
  free: boolean
  unlockHint?: string
  /** If set, the locked swatch can be purchased outright with doubloons. */
  price?: number
  /** If set, the locked swatch can be purchased outright with gems. */
  gemPrice?: number
}

// ── ACHIEVEMENT-POINT GATES ─────────────────────────────────────────────────
// Declared up here because the unlockHint strings below interpolate them. They
// used to be written out by hand in three places (both hints and the fishing
// tip pool), which had already drifted once.
//
// SET RELATIVE TO THE BADGE POOL, NOT ABSOLUTELY. When these were first tuned
// on 2026-07-21 the pool was 410 points, so Galaxy at 300 meant 73% of every
// badge in the game and Ethereal at 350 meant 85%. The pool has since grown to
// 642, which quietly cut them to 47% and 55% without anyone touching a number.
// Re-tuned 2026-08-16 to sit at ~61% and ~70%. A straight proportional restore
// would be 470 and 548; that was judged too steep for a cosmetic, so these land
// deliberately short of the original share. Re-check whenever a batch of badges
// ships. See lib/boats.ts for the two boat gates, tuned in the same pass.
const GALAXY_PTS = 390
const ETHEREAL_PTS = 450

export const CHARACTER_COLORS: CharacterColor[] = [
  { id: 'default', name: 'Green',  free: true  },
  { id: 'gray',    name: 'Gray',   free: true  },
  { id: 'blue',    name: 'Blue',   free: true  },
  { id: 'pink',    name: 'Pink',   free: true  },
  { id: 'sand',    name: 'Sand',   free: false, unlockHint: 'Reach Prestige 3 in any zone' },
  { id: 'sky',     name: 'Sky',    free: false, unlockHint: 'Reach Navigation Level 50' },
  { id: 'golden',  name: 'Golden', free: false, unlockHint: '100,000 ⟡', price: 100_000 },
  { id: 'forest',  name: 'Forest', free: false, unlockHint: 'Reach Fishing Level 50' },
  { id: 'mint',    name: 'Mint',   free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'autumn',  name: 'Autumn', free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ruby',    name: 'Ruby',   free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ice',      name: 'Ice',      free: false, unlockHint: 'Reach Fishing Level 75' },
  { id: 'lavender', name: 'Lavender', free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'storm',    name: 'Storm',    free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'galaxy',   name: 'Galaxy',   free: false, unlockHint: `Reach ${GALAXY_PTS} achievement points` },
  { id: 'crystal',  name: 'Crystal',  free: false, unlockHint: 'Max out — Fishing 100 and Navigation 100' },
  { id: 'ethereal', name: 'Ethereal', free: false, unlockHint: `Reach ${ETHEREAL_PTS} achievement points` },
  { id: 'lava',     name: 'Lava',     free: false, unlockHint: '500 ◆', gemPrice: 500 },
  { id: 'gilded',   name: 'Gilded',   free: false, unlockHint: '1,000,000 ⟡', price: 1_000_000 },
  { id: 'frozen',   name: 'Frozen',   free: false, unlockHint: '500 ◆', gemPrice: 500 },
  { id: 'spectral', name: 'Spectral', free: false, unlockHint: '750 ◆', gemPrice: 750 },
  { id: 'abyssal',  name: 'Abyssal',  free: false, unlockHint: '750 ◆', gemPrice: 750 },
]

/** Character colors earned by hitting an Achievement Points threshold. Kept
 *  separate from LEVEL_COLORS because the gating stat (summed badge points) is
 *  derived, not a plain profile column — see lib/achievementPoints. */
export const ACHIEVEMENT_COLORS: { id: string; points: number }[] = [
  { id: 'galaxy',   points: GALAXY_PTS },
  { id: 'ethereal', points: ETHEREAL_PTS },
]

/** Achievement-gated colors the player has earned (>= threshold) but doesn't
 *  own yet. STATE-based + idempotent, mirroring {@link earnedLevelColors}. */
export function earnedAchievementColors(achievementPoints: number, unlocked: string[] = []): string[] {
  return ACHIEVEMENT_COLORS
    .filter(c => !unlocked.includes(c.id))
    .filter(c => achievementPoints >= c.points)
    .map(c => c.id)
}

/** Character colors earned purely by reaching a stat threshold. Single source
 *  of truth so display, equip-validation, and the per-action grant hooks all
 *  agree. Each gating stat (fishing level, nav level, prestige) has MULTIPLE
 *  write paths, so any transition-based unlock would miss players who cross the
 *  threshold via another path — these are checked STATE-based instead. */
export const LEVEL_COLORS: { id: string; stat: 'fishing' | 'nav' | 'prestige'; level: number }[] = [
  { id: 'forest', stat: 'fishing',  level: 50 },
  { id: 'ice',    stat: 'fishing',  level: 75 },
  { id: 'sky',    stat: 'nav',      level: 50 },
  { id: 'sand',   stat: 'prestige', level: 3  },
]

type LevelStats = { fishingLevel: number; navLevel: number; maxPrestige: number }

/** Colors gated on MULTIPLE stats at once (kept separate from the single-stat
 *  LEVEL_COLORS so the AND is explicit). Crystal = fully maxed (both 100). */
export const COMBO_COLORS: { id: string; test: (s: LevelStats) => boolean }[] = [
  { id: 'crystal', test: s => s.fishingLevel >= 100 && s.navLevel >= 100 },
]

/** Which level-gated colors a player has EARNED but doesn't own yet, given
 *  their current stats. STATE-based + idempotent (the `!unlocked.includes`
 *  guard), so it self-heals anyone who crossed a threshold via a path whose
 *  grant hook didn't fire (raids/gauntlet for nav, trawls for fishing) or
 *  before the color existed. Used for display union, equip validation, and the
 *  grant hooks alike. */
export function earnedLevelColors(
  stats: LevelStats,
  unlocked: string[] = [],
): string[] {
  const fromLevel = LEVEL_COLORS
    .filter(c => !unlocked.includes(c.id))
    .filter(c => (c.stat === 'fishing' ? stats.fishingLevel : c.stat === 'nav' ? stats.navLevel : stats.maxPrestige) >= c.level)
    .map(c => c.id)
  const fromCombo = COMBO_COLORS
    .filter(c => !unlocked.includes(c.id))
    .filter(c => c.test(stats))
    .map(c => c.id)
  return [...fromLevel, ...fromCombo]
}

/** Fishing-only slice of {@link earnedLevelColors} for the catch + trawl XP
 *  paths, which only know the player's fishing level. */
export function fishingColorsToGrant(fishingLevel: number, unlocked: string[]): string[] {
  return earnedLevelColors({ fishingLevel, navLevel: 0, maxPrestige: 0 }, unlocked)
}

export function getCharacterSprites(colorId: string) {
  const id = CHARACTER_COLORS.find(c => c.id === colorId) ? colorId : 'default'
  const prefix = id === 'default' ? 'fishing' : `fishing_${id}`
  return {
    rest: `/${prefix}_rest.png`,
    wait: `/${prefix}_wait.png`,
    cast: `/${prefix}_cast.png`,
  }
}
