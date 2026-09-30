// ── THE ITEM CATALOGUE (Steam prep, 2026-09-30) ──
//
// Everything a captain can own, in one list, each thing one of FOUR KINDS
// (decided with Kong; docs/systems/steam-port.md, "The item system"):
//
//   stack     a count of identical things (bait, fish, raid items and forge
//             materials, which may now be held more than once)
//   unlock    owned once, forever (rods, cosmetics, special items, recipes)
//   instance  one of a kind, with details of its own (a crew member with its
//             stats, a golden with its length); catalogued by CATEGORY only,
//             since each one is made when it is earned
//   upgrade   a level on the ship or the rig, never held or given (reels,
//             hooks, lines, the hold, the hull, repair kits)
//
// and whether it may go in a Charter's CREW CHEST: as the ITEM itself (raid
// items, forge materials, rods), as a TOKEN that unlocks it for whoever takes it
// (cosmetics), or not at all.
//
// This is stage 1 of the item system: a pure catalogue built from the game's
// own definitions, so nothing is written twice and nothing a player sees
// changes. Every thing has a KEY, `<category>:<id>`, unique across the game.
// scripts/check-items.mts holds it complete and the keys unique.

import { RODS } from '@/lib/rods'
import { BAITS } from '@/lib/bait'
import { REELS } from '@/lib/reels'
import { HOOKS } from '@/lib/hooks'
import { LINES } from '@/lib/lines'
import { FISH_HOLD_TIERS } from '@/lib/fishHold'
import { SHIPS } from '@/lib/ships'
import { RAID_ITEMS, FORGE_RECIPES } from '@/lib/raidItems'
import { SPECIAL_ITEMS } from '@/lib/specialItems'
import { PETS } from '@/lib/pets'
import { BOATS } from '@/lib/boats'
import { HATS } from '@/lib/hats'
import { CHARACTER_COLORS } from '@/lib/characters'
import { AVATAR_SPECIALS } from '@/lib/avatarColors'
import { CREW_SKINS } from '@/lib/crewSkins'
import { SHIP_SKINS } from '@/lib/shipSkins'
import { FURNITURE } from '@/lib/homestead'
import { REPAIR_KITS } from '@/lib/repairKits'
import speciesJson from '@/content/fish_species.json'

export type ItemKind = 'stack' | 'unlock' | 'instance' | 'upgrade'
/** How a thing may travel through a Charter's crew chest. */
export type ChestRule = 'item' | 'token' | false

export type ItemCategory =
  | 'rod' | 'bait' | 'fish' | 'raid_item' | 'special' | 'forge_recipe'
  | 'pet' | 'boat' | 'hat' | 'color' | 'avatar_special' | 'crew_skin' | 'ship_skin' | 'furnishing'
  | 'reel' | 'hook' | 'line' | 'hold' | 'hull' | 'repair_kit'
  | 'crew' | 'golden'

export type CategoryDef = { kind: ItemKind; chest: ChestRule; label: string }

export const CATEGORIES: Record<ItemCategory, CategoryDef> = {
  rod:            { kind: 'unlock',   chest: 'item',  label: 'Rods' },
  bait:           { kind: 'stack',    chest: false,   label: 'Bait' },
  fish:           { kind: 'stack',    chest: false,   label: 'Fish in the hold' },
  raid_item:      { kind: 'stack',    chest: 'item',  label: 'Raid items and forge materials' },
  special:        { kind: 'unlock',   chest: false,   label: 'Special items' },
  forge_recipe:   { kind: 'unlock',   chest: false,   label: 'Forge recipes' },
  pet:            { kind: 'unlock',   chest: 'token', label: 'Pets' },
  boat:           { kind: 'unlock',   chest: 'token', label: 'Boats' },
  hat:            { kind: 'unlock',   chest: 'token', label: 'Bandanas' },
  color:          { kind: 'unlock',   chest: 'token', label: 'Colors' },
  avatar_special: { kind: 'unlock',   chest: 'token', label: 'Avatar specials' },
  crew_skin:      { kind: 'unlock',   chest: 'token', label: 'Crew skins' },
  ship_skin:      { kind: 'unlock',   chest: 'token', label: 'Ship skins' },
  furnishing:     { kind: 'unlock',   chest: 'token', label: 'Furnishings' },
  reel:           { kind: 'upgrade',  chest: false,   label: 'Reel' },
  hook:           { kind: 'upgrade',  chest: false,   label: 'Hook' },
  line:           { kind: 'upgrade',  chest: false,   label: 'Line' },
  hold:           { kind: 'upgrade',  chest: false,   label: 'Fish hold' },
  hull:           { kind: 'upgrade',  chest: false,   label: 'Hull' },
  repair_kit:     { kind: 'upgrade',  chest: false,   label: 'Repair kit' },
  crew:           { kind: 'instance', chest: false,   label: 'Crew' },
  golden:         { kind: 'instance', chest: false,   label: 'Golden catches' },
}

export type ItemDef = {
  /** `<category>:<id>`, unique across the game. */
  key: string
  category: ItemCategory
  /** The id the game already uses for it (a rod's tier, a bait's type...). */
  id: string
  name: string
  image: string | null
  kind: ItemKind
  chest: ChestRule
}

/** Rod tier 0, the Bamboo, is every captain's own and never changes hands. */
const STARTER_ROD = 0

function def(category: ItemCategory, id: string | number, name: string, image?: string | null, chest?: ChestRule): ItemDef {
  const c = CATEGORIES[category]
  return { key: `${category}:${id}`, category, id: String(id), name, image: image ?? null, kind: c.kind, chest: chest ?? c.chest }
}

type SpeciesRow = { id: number; name: string }

function build(): ItemDef[] {
  return [
    ...RODS.map(r => def('rod', r.tier, r.name, null, r.tier === STARTER_ROD ? false : undefined)),
    ...BAITS.map(b => def('bait', b.type, b.name, b.imageUrl)),
    ...(speciesJson as unknown as SpeciesRow[]).map(f => def('fish', f.id, f.name)),
    ...RAID_ITEMS.map(i => def('raid_item', i.id, i.name, i.image)),
    ...SPECIAL_ITEMS.map(s => def('special', s.id, s.name, s.image)),
    ...FORGE_RECIPES.map(r => def('forge_recipe', r.result, RAID_ITEMS.find(i => i.id === r.result)?.name ?? r.result)),
    ...PETS.map(p => def('pet', p.id, p.name, p.restImageUrl)),
    ...BOATS.map(b => def('boat', b.id, b.name, b.restImageUrl)),
    ...HATS.map(h => def('hat', h.id, h.name, h.restImageUrl)),
    ...CHARACTER_COLORS.map(c => def('color', c.id, c.name)),
    ...AVATAR_SPECIALS.map(a => def('avatar_special', a.id, a.label)),
    ...CREW_SKINS.map(s => def('crew_skin', s.id, s.name)),
    ...SHIP_SKINS.map(s => def('ship_skin', s.id, s.name)),
    ...FURNITURE.flatMap(slot => slot.options.map(f => def('furnishing', f.id, f.name, f.art))),
    ...REELS.map(r => def('reel', r.tier, r.name, r.imageUrl)),
    ...HOOKS.map(h => def('hook', h.tier, h.name, h.imageUrl)),
    ...LINES.map(l => def('line', l.tier, l.name, l.imageUrl)),
    ...FISH_HOLD_TIERS.map(h => def('hold', h.tier, h.name)),
    ...SHIPS.map(s => def('hull', s.tier, s.name, s.imageUrl)),
    ...REPAIR_KITS.map(k => def('repair_kit', k.id, k.name)),
  ]
}

/** Every catalogued thing. Instance categories (crew, goldens) have no entries:
 *  each one is made when it is earned. */
export const ITEMS: ItemDef[] = build()

export const ITEM_BY_KEY: Map<string, ItemDef> = new Map(ITEMS.map(i => [i.key, i]))

export function itemKey(category: ItemCategory, id: string | number): string {
  return `${category}:${id}`
}

export function getItem(category: ItemCategory, id: string | number): ItemDef | undefined {
  return ITEM_BY_KEY.get(itemKey(category, id))
}

/** Whether (and how) a thing may go in a Charter's crew chest. */
export function chestRule(category: ItemCategory, id: string | number): ChestRule {
  return getItem(category, id)?.chest ?? CATEGORIES[category].chest
}
