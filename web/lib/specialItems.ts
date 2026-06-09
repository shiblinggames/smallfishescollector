export type SpecialItemId = 'tide_turner' | 'phantom_hook' | 'auto_caster' | 'perfected_sigil'

export type SpecialItemDef = {
  id: SpecialItemId
  name: string
  color: string
  image?: string
  description: string
  effectLabel: string
  obtainedFrom?: string
  shopCost?: number
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
  {
    id: 'phantom_hook',
    name: 'Phantom Hook',
    color: '#2dd4bf',
    image: '/phantomhook.png',
    description: '25% chance to save your bait on every cast. Stacks with perfect-catch saves.',
    effectLabel: '25% bait save',
    obtainedFrom: 'The Bertuna Triangle voyage',
  },
  {
    id: 'auto_caster',
    name: 'Auto Caster',
    color: '#f0c040',
    image: '/autocaster.png',
    description: 'Snaps a new cast every half-second after each catch, and auto-opens & claims any crates along the way. Stops when your hold is full or you run out of bait.',
    effectLabel: 'Auto cast',
    shopCost: 5000,
  },
  {
    id: 'perfected_sigil',
    name: 'Perfected Sigil',
    color: '#94a3b8',
    // image: '/perfectedsigil.png' — TODO: drop the file in /public and
    // wire this up once the art ships. Until then the GearScreen / drop
    // panel fall back to a colored swatch via getSpecialItem(...).image
    // being undefined (existing code handles this).
    description: 'Each Perfect catch pays you a bonus 10 ⟡, credited the moment you reel it in.',
    effectLabel: '+10 ⟡ per perfect',
    obtainedFrom: 'The Shrouded Reach voyage',
  },
]

export function getSpecialItem(id: string): SpecialItemDef | undefined {
  return SPECIAL_ITEMS.find(s => s.id === id)
}
