export interface CharacterColor {
  id: string
  name: string
  free: boolean
  unlockHint?: string
  /** If set, the locked swatch can be purchased outright with doubloons. */
  price?: number
  /** If set, the locked swatch can be purchased outright with gems. */
  gemPrice?: number
  /** Earned, not bought: see lib/cosmeticGates. */
  gate?: CosmeticGate
}

import { type CosmeticGate, type GateStats, gateHint, gateMet, apNeeded } from './cosmeticGates'

// ── HOW EACH SKIN IS HAD (the standard of 2026-09-25) ───────────────────────
// Free, bought (⟡ 100k / 500k / 1M, ◆ 250 / 500 / 750), a crate drop, or EARNED
// through a `gate` (lib/cosmeticGates): Fishing 25 Sand, 50 Forest, 75 Ice,
// 100 Crystal; Navigation 50 Sky, 100 Galaxy; half the achievement pool for
// Abyssal. Named sets (Ice, Abyssal, Ethereal, Golden) unlock the same way as
// the boat of the same name. Prestige no longer gates anything here.
const FISH = (level: number): CosmeticGate => ({ kind: 'fishing', level })
const NAV = (level: number): CosmeticGate => ({ kind: 'nav', level })
const AP = (share: number): CosmeticGate => ({ kind: 'ap', share })

export const CHARACTER_COLORS: CharacterColor[] = [
  { id: 'default', name: 'Green',  free: true  },
  { id: 'gray',    name: 'Gray',   free: true  },
  { id: 'blue',    name: 'Blue',   free: true  },
  { id: 'pink',    name: 'Pink',   free: true  },
  { id: 'sand',    name: 'Sand',   free: false, gate: FISH(25) },
  { id: 'sky',     name: 'Sky',    free: false, gate: NAV(50) },
  { id: 'golden',  name: 'Golden', free: false, unlockHint: '100,000 ⟡', price: 100_000 },
  { id: 'forest',  name: 'Forest', free: false, gate: FISH(50) },
  { id: 'mint',    name: 'Mint',   free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'autumn',  name: 'Autumn', free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ruby',    name: 'Ruby',   free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ice',      name: 'Ice',      free: false, gate: FISH(75) },
  { id: 'lavender', name: 'Lavender', free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'storm',    name: 'Storm',    free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'galaxy',   name: 'Galaxy',   free: false, gate: NAV(100) },
  { id: 'crystal',  name: 'Crystal',  free: false, gate: FISH(100) },
  { id: 'ethereal', name: 'Ethereal', free: false, unlockHint: '500,000 ⟡', price: 500_000 },
  { id: 'lava',     name: 'Lava',     free: false, unlockHint: '500 ◆', gemPrice: 500 },
  { id: 'gilded',   name: 'Gilded',   free: false, unlockHint: '1,000,000 ⟡', price: 1_000_000 },
  { id: 'frozen',   name: 'Frozen',   free: false, unlockHint: '500 ◆', gemPrice: 500 },
  { id: 'spectral', name: 'Spectral', free: false, unlockHint: '750 ◆', gemPrice: 750 },
  { id: 'abyssal',  name: 'Abyssal',  free: false, gate: AP(0.5) },
].map(c => (c.gate ? { ...c, unlockHint: gateHint(c.gate) } : c))

/** Skins earned on a share of the achievement pool. The score is derived
 *  (lib/achievementPoints) and costs queries, so callers ask this list whether
 *  it is worth fetching. `points` is today's number for that share. */
export const ACHIEVEMENT_COLORS: { id: string; points: number }[] = CHARACTER_COLORS
  .filter(c => c.gate?.kind === 'ap')
  .map(c => ({ id: c.id, points: apNeeded((c.gate as { share: number }).share) }))

/** Achievement-gated colors the player has earned but doesn't own yet. */
export function earnedAchievementColors(achievementPoints: number, unlocked: string[] = []): string[] {
  return CHARACTER_COLORS
    .filter(c => c.gate?.kind === 'ap' && !unlocked.includes(c.id))
    .filter(c => gateMet(c.gate!, { fishingLevel: 0, navLevel: 0, ap: achievementPoints }))
    .map(c => c.id)
}

/** `maxPrestige` is accepted and ignored: Sand moved from Prestige 3 to Fishing
 *  25 in the 2026-09-25 standard, and nothing is gated on prestige now. */
type LevelStats = { fishingLevel: number; navLevel: number; maxPrestige?: number }

/** Which level-gated colors a player has EARNED but doesn't own yet, given
 *  their current stats. STATE-based + idempotent (the `!unlocked.includes`
 *  guard), so it self-heals anyone who crossed a threshold via a path whose
 *  grant hook didn't fire (raids/gauntlet for nav, trawls for fishing) or
 *  before the color existed. */
export function earnedLevelColors(
  stats: LevelStats,
  unlocked: string[] = [],
): string[] {
  const s: GateStats = { fishingLevel: stats.fishingLevel, navLevel: stats.navLevel }
  return CHARACTER_COLORS
    .filter(c => c.gate && c.gate.kind !== 'ap' && !unlocked.includes(c.id))
    .filter(c => gateMet(c.gate!, s))
    .map(c => c.id)
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
