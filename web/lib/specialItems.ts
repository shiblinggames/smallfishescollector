export type SpecialItemId = 'tide_turner'

export type SpecialItemDef = {
  id: SpecialItemId
  name: string
  color: string
  image?: string
  description: string
  effectLabel: string
  obtainedFrom: string
}

export const SPECIAL_ITEMS: SpecialItemDef[] = [
  {
    id: 'tide_turner',
    name: 'Tide Turner',
    color: '#a78bfa',
    image: '/tideturner.png',
    description: 'Skip a hooked fish during the catch phase without breaking your perfect streak. Your bait is consumed.',
    effectLabel: '3 skips / day',
    obtainedFrom: 'The Howling Deep voyage',
  },
]

export function getSpecialItem(id: string): SpecialItemDef | undefined {
  return SPECIAL_ITEMS.find(s => s.id === id)
}
