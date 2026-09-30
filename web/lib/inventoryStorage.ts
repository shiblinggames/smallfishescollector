// WHERE EACH KIND OF THING IS KEPT (the item system, stage 2, 2026-09-30).
//
// One table, read by both inventories (the web's over Supabase, lib/data/
// inventory; the desktop's over the save, lib/data/local/inventoryLocal), so
// the two cannot disagree about where a rod or a pet lives. The catalogue
// (lib/items) says what a thing IS; this says where it is STORED today, in the
// six ways the survey found, plus raid items' list of copies (stage 3).

import { SPECIAL_OWNED_COLUMN, type SpecialItemId } from '@/lib/specialItems'
import type { ItemCategory } from '@/lib/items'

export type Storage =
  /** bait_inventory (bait_type, quantity) / save.bait */
  | { type: 'bait' }
  /** fish_inventory (fish_id, quantity) / save.hold */
  | { type: 'hold' }
  /** rods by ID, held as copies: rod_inventory (rod_tier, quantity) on the web,
   *  translated through the rod's tier / save.rodItems; the Bamboo is always held */
  | { type: 'rods' }
  /** a profiles array column of ids, each owned once */
  | { type: 'list'; col: string }
  /** a profiles array column that may hold COPIES (raid items, since stage 3) */
  | { type: 'counted'; col: string }
  /** one boolean profiles column per id */
  | { type: 'flag'; col: string }
  /** a profiles level column: held when the level reaches the id */
  | { type: 'tier'; col: string }
  /** homesteads.owned / save.homestead.owned */
  | { type: 'homestead' }

const LIST: Partial<Record<ItemCategory, string>> = {
  forge_recipe: 'forge_recipes_learned',
  pet: 'unlocked_pets',
  boat: 'unlocked_boats',
  hat: 'unlocked_hats',
  color: 'unlocked_character_colors',
  avatar_special: 'unlocked_avatar_specials',
  crew_skin: 'owned_crew_skins',
  ship_skin: 'ship_skins',
  // A ladder, but stored as the set of kits owned (lib/repairKits).
  repair_kit: 'owned_repair_kits',
}

const TIER: Partial<Record<ItemCategory, string>> = {
  reel: 'reel_tier',
  hook: 'hook_tier',
  line: 'line_tier',
  hold: 'fish_hold_tier',
  hull: 'ship_tier',
}

/** Where a thing of this category (and id) is kept. Crew and goldens are
 *  one-of-a-kind rows with systems of their own, not inventory. */
export function storageFor(category: ItemCategory, id: string): Storage {
  if (category === 'bait') return { type: 'bait' }
  if (category === 'fish') return { type: 'hold' }
  if (category === 'rod') return { type: 'rods' }
  if (category === 'furnishing') return { type: 'homestead' }
  // Held as copies since stage 3 (Kong, 2026-09-30): a captain can hold several
  // of a piece of gear.
  if (category === 'raid_item') return { type: 'counted', col: 'raid_items' }
  if (category === 'special') {
    const col = SPECIAL_OWNED_COLUMN[id as SpecialItemId]
    if (!col) throw new Error(`no such special item: ${id}`)
    return { type: 'flag', col }
  }
  const list = LIST[category]
  if (list) return { type: 'list', col: list }
  const tier = TIER[category]
  if (tier) return { type: 'tier', col: tier }
  throw new Error(`${category} is not kept in the inventory`)
}

/** The Bamboo: every captain's, never given or taken. */
export { STARTER_ROD_ID } from '@/lib/rods'
