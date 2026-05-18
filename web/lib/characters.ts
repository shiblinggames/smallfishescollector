export interface CharacterColor {
  id: string
  name: string
  free: boolean
  unlockHint?: string
}

export const CHARACTER_COLORS: CharacterColor[] = [
  { id: 'default', name: 'Green',  free: true  },
  { id: 'gray',    name: 'Gray',   free: true  },
  { id: 'blue',    name: 'Blue',   free: true  },
  { id: 'pink',    name: 'Pink',   free: true  },
  { id: 'sand',    name: 'Sand',   free: false, unlockHint: 'Reach Prestige 3 in any zone' },
  { id: 'sky',     name: 'Sky',    free: false, unlockHint: 'Reach Navigation Level 50' },
  { id: 'golden',  name: 'Golden', free: false, unlockHint: 'Catch all 6 Ancient Deep trophies' },
  { id: 'forest',  name: 'Forest', free: false, unlockHint: 'Reach Fishing Level 50' },
  { id: 'mint',    name: 'Mint',   free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'autumn',  name: 'Autumn', free: false, unlockHint: 'Premium skin' },
  { id: 'ruby',    name: 'Ruby',   free: false, unlockHint: 'Premium skin' },
  { id: 'ice',      name: 'Ice',      free: false, unlockHint: 'Reach Fishing Level 75' },
  { id: 'lavender', name: 'Lavender', free: false, unlockHint: 'Rare drop from fishing crates' },
  { id: 'storm',    name: 'Storm',    free: false, unlockHint: 'Rare drop from fishing crates' },
]

export function getCharacterSprites(colorId: string) {
  const id = CHARACTER_COLORS.find(c => c.id === colorId) ? colorId : 'default'
  const prefix = id === 'default' ? 'fishing' : `fishing_${id}`
  return {
    rest: `/${prefix}_rest.png`,
    wait: `/${prefix}_wait.png`,
    cast: `/${prefix}_cast.png`,
  }
}
