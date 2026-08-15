export type SpecialItemId = 'tide_turner' | 'phantom_hook' | 'auto_caster' | 'auto_catcher' | 'perfected_sigil' | 'anglers_patience'

export type SpecialItemDef = {
  id: SpecialItemId
  name: string
  color: string
  image?: string
  description: string
  effectLabel: string
  obtainedFrom?: string
  /** Doubloon price (the default shop currency). */
  shopCost?: number
  /** Price in Fathoms — the Davy Jones Gauntlet currency. When set, the item is
   *  bought with Fathoms instead of doubloons (mutually exclusive with shopCost). */
  costFathoms?: number
  /** Other special item that must be owned before this one can be bought. */
  requiresItem?: SpecialItemId
  /** This item is a permanent TIER UPGRADE of another item, not a separate
   *  piece of gear. The pair renders as ONE card everywhere (shop, loadout,
   *  profiles): the base item's card, wearing this def once owned. The two
   *  ownership columns stay as-is — the upgrade column is simply the tier
   *  flag. Born from the Auto Caster/Catcher split, which put two cards in
   *  one slot where the second strictly superseded the first (a tester was
   *  found running the lesser one while owning both). */
  upgradeOf?: SpecialItemId
  /** Minimum Davy Jones' Gauntlet depth required to unlock the purchase. */
  requiresGauntletDepth?: number
  /** THE SUNKEN HAND. Only fits the SECOND special slot, which only opens by
   *  beating Finn. Never buyable and never valid in slot one, so it cannot be
   *  farmed or shuffled into an ordinary loadout. */
  finaleSlotOnly?: boolean
}

export const SPECIAL_ITEMS: SpecialItemDef[] = [
  {
    id: 'anglers_patience',
    name: 'The Primeval Eye',
    color: '#c4a96a',
    image: '/primevileye.png',
    description: 'Cut out of him still open, and still looking. It gains a TIER for every stretch of Navigation XP you earn while it is seated, and each tier keeps everything the tiers below it unlocked. Six in all.',
    effectLabel: 'Six stacking tiers, one new effect each',
    obtainedFrom: 'The Sunken Hand',
    finaleSlotOnly: true,
  },
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
    description: 'Snaps a new cast every half-second after each catch, and auto-opens & claims any crates along the way. Stops when your hold is full or you run out of bait. Can be permanently upgraded into the Auto Catcher in Davy Jones’ Gauntlet.',
    effectLabel: 'Auto cast',
    shopCost: 5000,
  },
  {
    id: 'auto_catcher',
    name: 'Auto Catcher',
    color: '#46e0c0',
    image: '/autocaster.png',
    description: 'Your Auto Caster, permanently upgraded: it now reels in common and uncommon fish on its own too. Rarer fish still need your hand. Stops when your hold or bait runs out.',
    effectLabel: 'Auto cast + catch commons & uncommons',
    costFathoms: 30,
    requiresItem: 'auto_caster',
    requiresGauntletDepth: 5,
    upgradeOf: 'auto_caster',
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

/** The def an equipped special should DISPLAY as, with tier upgrades folded
 *  in: an upgraded base item wears its upgrade's name/effect, and a legacy
 *  equip of the upgrade id itself (rows from before the merge) resolves the
 *  same way. Use this instead of getSpecialItem wherever an EQUIPPED item is
 *  shown (loadout slot, profile chips). */
export function effectiveSpecialDef(id: string | null | undefined, ownedIds: SpecialItemId[]): SpecialItemDef | undefined {
  if (!id) return undefined
  const def = getSpecialItem(id)
  if (!def) return undefined
  const upgraded = SPECIAL_ITEMS.find(s => s.upgradeOf === def.id && ownedIds.includes(s.id))
  return upgraded ?? def
}

/** Ownership for each special lives in its own boolean column. Kept here so a
 *  caller can never miss one (the profile Tackle rail reads all six). */
export const SPECIAL_OWNED_COLUMN: Record<SpecialItemId, string> = {
  tide_turner:      'has_tide_turner',
  phantom_hook:     'has_phantom_hook',
  auto_caster:      'has_auto_caster',
  auto_catcher:     'has_auto_catcher',
  perfected_sigil:  'has_perfected_sigil',
  anglers_patience: 'has_anglers_patience',
}

/** Every special the player owns, from a profile row. */
export function ownedSpecialIds(p: Record<string, unknown> | null | undefined): SpecialItemId[] {
  if (!p) return []
  return (Object.keys(SPECIAL_OWNED_COLUMN) as SpecialItemId[])
    .filter(id => p[SPECIAL_OWNED_COLUMN[id]] === true)
}
