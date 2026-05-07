export interface CharacterColor {
  id: string
  name: string
  free: boolean  // false = earned through fishing
}

export const CHARACTER_COLORS: CharacterColor[] = [
  { id: 'default', name: 'Green',  free: true  },
  { id: 'gray',    name: 'Gray',   free: true  },
  { id: 'blue',    name: 'Blue',   free: true  },
  { id: 'pink',    name: 'Pink',   free: true  },
  { id: 'sand',    name: 'Sand',   free: false },
  { id: 'sky',     name: 'Sky',    free: false },
  { id: 'golden',  name: 'Golden', free: false },
  { id: 'forest',  name: 'Forest', free: false },
  { id: 'mint',    name: 'Mint',   free: false },
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
