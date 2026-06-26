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

export const CHARACTER_COLORS: CharacterColor[] = [
  { id: 'default', name: 'Green',  free: true  },
  { id: 'gray',    name: 'Gray',   free: true  },
  { id: 'blue',    name: 'Blue',   free: true  },
  { id: 'pink',    name: 'Pink',   free: true  },
  { id: 'sand',    name: 'Sand',   free: false, unlockHint: 'Reach Prestige 3 in any zone' },
  { id: 'sky',     name: 'Sky',    free: false, unlockHint: 'Reach Navigation Level 50' },
  { id: 'golden',  name: 'Golden', free: false, unlockHint: '1,000,000 ⟡', price: 1_000_000 },
  { id: 'forest',  name: 'Forest', free: false, unlockHint: 'Reach Fishing Level 50' },
  { id: 'mint',    name: 'Mint',   free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'autumn',  name: 'Autumn', free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ruby',    name: 'Ruby',   free: false, unlockHint: '250 ◆', gemPrice: 250 },
  { id: 'ice',      name: 'Ice',      free: false, unlockHint: 'Reach Fishing Level 75' },
  { id: 'lavender', name: 'Lavender', free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'storm',    name: 'Storm',    free: false, unlockHint: 'Rare drop from fishing crates' },
]

/** Character colors earned purely by reaching a fishing level. Single source
 *  for the unlock so EVERY fishing-XP path (catches, trawls) grants them the
 *  same way. */
export const FISHING_LEVEL_COLORS: { level: number; id: string }[] = [
  { level: 50, id: 'forest' },
  { level: 75, id: 'ice' },
]

/** Which fishing-level colors a player at `fishingLevel` should have but is
 *  missing. STATE-based, not transition-based: it returns anything earned-but-
 *  unowned regardless of HOW the level was reached, so it self-heals players who
 *  crossed the threshold via a trawl, an admin grant, or before the color
 *  existed. The `!includes` guard keeps it idempotent (no duplicate grants). */
export function fishingColorsToGrant(fishingLevel: number, unlocked: string[]): string[] {
  return FISHING_LEVEL_COLORS.filter(c => fishingLevel >= c.level && !unlocked.includes(c.id)).map(c => c.id)
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
