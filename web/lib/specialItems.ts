export type SpecialItemId = 'tide_turner' | 'phantom_hook' | 'auto_caster' | 'auto_catcher' | 'perfected_sigil'

export type SpecialItemDef = {
  id: SpecialItemId
  name: string
  color: string
  image?: string
  description: string
  effectLabel: string
  obtainedFrom?: string
  shopCost?: number
  /** Other special item that must be owned before this one can be bought. */
  requiresItem?: SpecialItemId
  /** Minimum Davy Jones' Gauntlet depth required to unlock the purchase. */
  requiresGauntletDepth?: number
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
    id: 'auto_catcher',
    name: 'Auto Catcher',
    color: '#46e0c0',
    image: '/autocaster.png',
    description: 'Everything the Auto Caster does, plus it reels in common and uncommon fish on its own — the needle lands true on the catch band, no dial needed. Rarer fish still wait for your hand. Stops when your hold is full or your bait runs out.',
    effectLabel: 'Auto cast + catch commons & uncommons',
    shopCost: 25000,
    requiresItem: 'auto_caster',
    requiresGauntletDepth: 5,
  },
  {
    id: 'perfected_sigil',
    name: 'Perfected Sigil',
    color: '#94a3b8',
    image: '/perfectedsigil.png',
    description: 'Each Perfect catch pays a bonus 10 ⟡ × your current streak (capped at +30 from streak 3 onward), credited the moment you reel it in.',
    effectLabel: '+10 / +20 / +30 ⟡ by streak',
    obtainedFrom: 'The Shrouded Reach voyage',
  },
]

export function getSpecialItem(id: string): SpecialItemDef | undefined {
  return SPECIAL_ITEMS.find(s => s.id === id)
}
