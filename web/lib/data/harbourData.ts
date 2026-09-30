// ── THE HARBOUR'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// The shops ashore and the reads that describe a captain's gear: the tackle
// shop (bait, rods, reels, the Completionist), the hook bench, the fish hold,
// the Shipyard's hulls and name, the Almanac, and the Shipyard's and ship
// screen's state. Built on the sea's store (the purse, the ledger, the rods,
// the regulars, the isles) plus the bait, the hold, the species list and the
// catch logs.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - rods are items now: the inventory (CaptainData give/take) holds them as copies;
//   - every tier (hook, reel, hold, ship) rises only from the tier read, through
//     updateProfileIf.

import type { Db, Row } from './common'
import { seaData, type SeaData } from './seaData'

export interface HarbourData extends SeaData {
  /** Every bait held, with its count. */
  baitRows(uid: string): Promise<{ bait_type: string; quantity: number }[]>
  /** Every fish in the hold with a count above zero. */
  holdRows(uid: string): Promise<{ fish_id: number; quantity: number }[]>
  /** Every species in the book's order, with its Almanac columns. Static game data. */
  speciesList(): Promise<Row[]>
  /** Every species in this prestige cycle's catch log. */
  collectionIds(uid: string): Promise<number[]>
  /** The four logs the Almanac reads: this cycle's catches, the lifetime
   *  catches, the personal bests and every golden ever landed (newest first). */
  almanacLogs(uid: string): Promise<{ collection: Row[]; lifetime: Row[]; bests: Row[]; goldens: Row[] }>
}

/** HarbourData over Supabase. */
export function harbourData(admin: Db): HarbourData {
  return {
    ...seaData(admin),
    async baitRows(uid) {
      const { data } = await admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', uid)
      return (data ?? []) as { bait_type: string; quantity: number }[]
    },
    async holdRows(uid) {
      const { data } = await admin.from('fish_inventory').select('fish_id, quantity').eq('user_id', uid)
      return (data ?? []) as { fish_id: number; quantity: number }[]
    },
    async speciesList() {
      const { data, error } = await admin.from('fish_species')
        .select('id, name, scientific_name, description, fun_fact, habitat, bite_rarity, catch_difficulty, sell_value, length_min_in, length_max_in, size_category, diet_type, water_type, region, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw new Error('Could not read the species list')
      return (data ?? []) as Row[]
    },
    async collectionIds(uid) {
      const { data } = await admin.from('fish_collection').select('fish_id').eq('user_id', uid)
      return ((data ?? []) as { fish_id: number }[]).map(r => r.fish_id)
    },
    async almanacLogs(uid) {
      const [collection, lifetime, bests, goldens] = await Promise.all([
        admin.from('fish_collection').select('fish_id, catch_count, first_caught_at, last_caught_at, is_golden').eq('user_id', uid),
        admin.from('fish_lifetime').select('fish_id, catches, first_caught_at, last_caught_at').eq('user_id', uid),
        admin.from('fish_personal_bests').select('fish_id, best_length_in, caught_at').eq('user_id', uid),
        admin.from('shiny_catches').select('id, fish_id, size_in, caught_at, status, sold_for').eq('user_id', uid).order('caught_at', { ascending: false }),
      ])
      return {
        collection: (collection.data ?? []) as Row[],
        lifetime: (lifetime.data ?? []) as Row[],
        bests: (bests.data ?? []) as Row[],
        goldens: (goldens.data ?? []) as Row[],
      }
    },
  }
}
