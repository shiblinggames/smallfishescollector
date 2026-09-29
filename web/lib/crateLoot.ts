import type { SupabaseClient } from '@supabase/supabase-js'
import { CRATE_PET_CHANCE, rollPet, type PetDef } from '@/lib/pets'
import { getBait } from '@/lib/bait'
import { arrayAdd, grant } from '@/lib/wallet'
import { rngNext } from './rng'

// Crate loot tables + the shared roller. Kept OUT of the fishing 'use server'
// actions file on purpose: this is a plain module, so grantCrateLoot is NOT a
// client-callable server action (a loot-granting action could be looped to farm
// crates). Callers that reach it must have already gated the grant — reelCrate
// via its one-shot pending_cast token, claimWeeklyCrate via the weekly stamp.

/** 'ancient' is the Ancient Deep's exclusive chest. It never drops anywhere
 *  else, and nothing else drops there, so the deepest water has exactly one
 *  container and it is the best one in the game. */
export type CrateTier = 'wooden' | 'metal' | 'gold' | 'diamond' | 'ancient'

/** A pet roll that landed on one already aboard. The crate pays its normal
 *  outcome instead; this rides along purely so the reveal can say what was
 *  passed over. */
export type DupePet = { petId: string; petName: string; petImageUrl: string; petAccent: string }

export type CrateLoot = (
  | { type: 'doubloons'; amount: number; newDoubloons: number }
  | { type: 'bait';      baitType: string; baitName: string; quantity: number }
  | { type: 'skin';      skinId: string;   skinName: string }
  | { type: 'hat';       hatId: string;    hatName: string;  hatImageUrl: string  }
  | { type: 'boat';      boatId: string;   boatName: string; boatImageUrl: string }
  | { type: 'pet';       petId: string;    petName: string;  petImageUrl: string; petAccent: string }
) & { dupePet?: DupePet }

// Crate loot tables — doubloons and bait pool depend on crate tier, not zone.
const CRATE_DOUBLOON_RANGE: Record<CrateTier, [number, number]> = {
  wooden:  [100,  400 ],
  metal:   [250,  1000],
  gold:    [500,  2000],
  diamond: [1000, 4000],
  ancient: [2500, 8000],
}

const CRATE_BAIT_POOLS: Record<CrateTier, { type: string; weight: number }[]> = {
  wooden:  [
    { type: 'worm',            weight: 50 },
    { type: 'minnow',          weight: 30 },
    { type: 'night_crawler',   weight: 20 },
  ],
  metal:   [
    { type: 'chum',            weight: 40 },
    { type: 'anglers_formula', weight: 30 },
    { type: 'night_crawler',   weight: 20 },
    { type: 'minnow',          weight: 10 },
  ],
  gold:    [
    { type: 'chum',            weight: 50 },
    { type: 'anglers_formula', weight: 35 },
    { type: 'night_crawler',   weight: 15 },
  ],
  diamond: [
    { type: 'chum',            weight: 60 },
    { type: 'anglers_formula', weight: 40 },
  ],
  // Nothing but the two best baits, which is the point of the deepest chest.
  ancient: [
    { type: 'chum',            weight: 45 },
    { type: 'anglers_formula', weight: 55 },
  ],
}

const CRATE_BAIT_QTY: Record<CrateTier, number> = {
  wooden:  5,
  metal:   10,
  gold:    15,
  diamond: 20,
  ancient: 30,
}

// Per-tier outcome weights. Wooden/metal have no cosmetic outcome.
const CRATE_OUTCOME_WEIGHTS: Record<CrateTier, { doubloons: number; bait: number; cosmetic: number }> = {
  wooden:  { doubloons: 50, bait: 50, cosmetic: 0  },
  metal:   { doubloons: 50, bait: 50, cosmetic: 0  },
  gold:    { doubloons: 55, bait: 35, cosmetic: 10 },
  diamond: { doubloons: 25, bait: 60, cosmetic: 15 },
  // Ancient leans hardest into cosmetics, since its whole reason to exist is
  // being the best place to find something you cannot buy.
  ancient: { doubloons: 20, bait: 55, cosmetic: 25 },
}

// Crate-exclusive cosmetics that can drop from gold/diamond crates.
// Keep ids in sync with lib/boats.ts, lib/hats.ts, lib/characters.ts.
const CRATE_COSMETIC_POOL = [
  { kind: 'skin' as const, id: 'mint',      name: 'Mint'                   },
  { kind: 'skin' as const, id: 'lavender',  name: 'Lavender'               },
  { kind: 'skin' as const, id: 'storm',     name: 'Storm'                  },
  { kind: 'boat' as const, id: 'charcoal',  name: 'Charcoal',  imageUrl: '/boat_charcoal_rest.png' },
  { kind: 'boat' as const, id: 'offwhite',  name: 'Offwhite',  imageUrl: '/boat_offwhite_rest.png' },
  { kind: 'hat'  as const, id: 'black',     name: 'Black',     imageUrl: '/hat_black_rest.png'     },
  { kind: 'hat'  as const, id: 'gray',      name: 'Gray',      imageUrl: '/hat_gray_rest.png'      },
  { kind: 'hat'  as const, id: 'golden',    name: 'Golden',    imageUrl: '/hat_golden_rest.png'    },
  { kind: 'hat'  as const, id: 'cheetah',   name: 'Cheetah',   imageUrl: '/hat_cheetah_rest.png'   },
  { kind: 'hat'  as const, id: 'fuego',     name: 'Fuego',     imageUrl: '/hat_fuego_rest.png'     },
  { kind: 'hat'  as const, id: 'spotted',   name: 'Spotted',   imageUrl: '/hat_spotted_rest.png'   },
]

/** What a crate rolled, before anything is granted. */
export type CrateRoll = {
  /** The pet the pet roll hit (the roll is blind to what you own), or null. */
  pet: PetDef | null
  outcome:
    | { kind: 'cosmetic'; entry: (typeof CRATE_COSMETIC_POOL)[number] }
    | { kind: 'doubloons'; amount: number }
    | { kind: 'bait'; baitType: string; qty: number }
}

/**
 * ── THE CRATE'S DICE, WITH NO DATABASE IN THEM (Phase B, 2026-09-28) ────────
 *
 * The pet roll first (blind to what you own: duplicates are what keep the full
 * set hard, and filtering would renormalise the rare golds upward), then the
 * ordinary outcome: doubloons, bait, or a crate cosmetic you do not own yet (a
 * cosmetic slot with nothing left to give folds into doubloons). The ordinary
 * outcome is always rolled, because a DUPLICATE pet must not eat the crate: it
 * rides along on the ordinary payout instead. grantCrateLoot applies this.
 */
export function rollCrateLoot(tier: CrateTier, owned: { skins: string[]; boats: string[]; hats: string[] }): CrateRoll {
  const pet = rngNext() < CRATE_PET_CHANCE[tier] ? rollPet() : null

  const isOwned = (entry: typeof CRATE_COSMETIC_POOL[number]) => {
    if (entry.kind === 'skin') return owned.skins.includes(entry.id)
    if (entry.kind === 'boat') return owned.boats.includes(entry.id)
    return owned.hats.includes(entry.id)
  }
  const weights = CRATE_OUTCOME_WEIGHTS[tier]
  const unownedCosmetics = CRATE_COSMETIC_POOL.filter(c => !isOwned(c))
  const cosmeticWeight = unownedCosmetics.length > 0 ? weights.cosmetic : 0
  const doubloonWeight = weights.doubloons + (unownedCosmetics.length > 0 ? 0 : weights.cosmetic)
  type Outcome = 'doubloons' | 'bait' | 'cosmetic'
  const pool: { outcome: Outcome; weight: number }[] = [
    { outcome: 'doubloons', weight: doubloonWeight },
    { outcome: 'bait',      weight: weights.bait   },
    { outcome: 'cosmetic',  weight: cosmeticWeight },
  ]
  const total = pool.reduce((s, o) => s + o.weight, 0)
  let rand = rngNext() * total
  let outcome: Outcome = 'doubloons'
  for (const o of pool) { rand -= o.weight; if (rand <= 0) { outcome = o.outcome; break } }

  if (outcome === 'cosmetic') {
    return { pet, outcome: { kind: 'cosmetic', entry: unownedCosmetics[Math.floor(rngNext() * unownedCosmetics.length)] } }
  }
  if (outcome === 'doubloons') {
    const [min, max] = CRATE_DOUBLOON_RANGE[tier]
    return { pet, outcome: { kind: 'doubloons', amount: Math.floor(min + rngNext() * (max - min + 1)) } }
  }
  const baitPool = CRATE_BAIT_POOLS[tier]
  const totalBaitWeight = baitPool.reduce((s, b) => s + b.weight, 0)
  let baitRand = rngNext() * totalBaitWeight
  let picked = baitPool[0]
  for (const b of baitPool) { baitRand -= b.weight; if (baitRand <= 0) { picked = b; break } }
  return { pet, outcome: { kind: 'bait', baitType: picked.type, qty: CRATE_BAIT_QTY[tier] } }
}

/**
 * What granting a crate needs from the game's store: read the owned lists, add
 * to one once, set the pet slot only while it is empty, pay coin, add bait.
 * FishingData satisfies it; the web's service-role client is adapted below.
 * Kept this small on purpose, so the roller never pulls a whole store (or the
 * server) into the offline build.
 */
export interface CrateGrantStore {
  profile(uid: string, cols: string): Promise<Record<string, unknown> | null>
  addToList(uid: string, col: string, value: string): Promise<boolean>
  updateProfileIf(uid: string, patch: Record<string, unknown>, when: { col: string; is: null }[]): Promise<boolean>
  grant(uid: string, col: 'doubloons', n: number): Promise<number>
  addBait(uid: string, bait: string, qty: number): Promise<void>
}

/** The service-role client as a CrateGrantStore (the web's callers). */
function adminCrateStore(admin: SupabaseClient): CrateGrantStore {
  return {
    async profile(uid, cols) {
      const { data } = await admin.from('profiles').select(cols).eq('id', uid).single()
      return (data as Record<string, unknown> | null) ?? null
    },
    addToList: (uid, col, value) => arrayAdd(admin, uid, col, value),
    async updateProfileIf(uid, patch, when) {
      let q = admin.from('profiles').update(patch).eq('id', uid)
      for (const g of when) q = q.is(g.col, null)
      const { data } = await q.select('id')
      return !!data && data.length > 0
    },
    grant: (uid, col, n) => grant(admin, uid, col, n),
    async addBait(uid, bait, qty) {
      await admin.rpc('upsert_bait', { p_user_id: uid, p_bait_type: bait, p_qty: qty })
    },
  }
}

/**
 * Roll a crate of `tier` and grant its reward to `userId`, returning the loot.
 * ALWAYS pays out exactly one reward (pet / cosmetic / doubloons / bait) — never
 * an empty result — so a gated caller (fishing crate token, weekly stamp) can
 * rely on getting something back. The caller owns the anti-forgery / rate gate;
 * this function rolls (rollCrateLoot) and writes the grant.
 *
 * THE CRATES-OPENED COUNTER IS NOT BUMPED HERE: this roller is shared by the
 * crate reeled up mid-cast, the weekly free crate and the Master challenge's
 * payout, and the crate badges are about FISHING ONE UP. reelCrate bumps it.
 */
export async function grantCrateLoot(
  admin: SupabaseClient,
  userId: string,
  tier: CrateTier,
): Promise<CrateLoot> {
  return grantCrateLootTo(adminCrateStore(admin), userId, tier)
}

/** grantCrateLoot against any store: the web's, or the offline save. */
export async function grantCrateLootTo(
  db: CrateGrantStore,
  userId: string,
  tier: CrateTier,
): Promise<CrateLoot> {
  const profile = await db.profile(userId, 'unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets')
  const unlockedPets = (profile?.unlocked_pets as string[] | null) ?? []
  const roll = rollCrateLoot(tier, {
    skins: (profile?.unlocked_character_colors as string[] | null) ?? [],
    boats: (profile?.unlocked_boats as string[] | null) ?? [],
    hats: (profile?.unlocked_hats as string[] | null) ?? [],
  })

  // A NEW pet owns the screen. Added in place, never by writing back the list
  // read above: false means it landed aboard meanwhile, a dupe like any other.
  let dupePet: DupePet | undefined
  if (roll.pet) {
    const pet = roll.pet
    if (!unlockedPets.includes(pet.id) && await db.addToList(userId, 'unlocked_pets', pet.id)) {
      // Auto-equip the first pet so it lands in the loadout without an extra tap.
      await db.updateProfileIf(userId, { equipped_pet: pet.id }, [{ col: 'equipped_pet', is: null }])
      return { type: 'pet', petId: pet.id, petName: pet.name, petImageUrl: pet.restImageUrl, petAccent: pet.accentColor }
    }
    dupePet = { petId: pet.id, petName: pet.name, petImageUrl: pet.restImageUrl, petAccent: pet.accentColor }
  }
  /** Tag whatever the crate actually paid with the pet it passed over. */
  const pay = <T extends CrateLoot>(loot: T): T => (dupePet ? { ...loot, dupePet } : loot)

  const o = roll.outcome
  if (o.kind === 'cosmetic') {
    const picked = o.entry
    if (picked.kind === 'skin') {
      await db.addToList(userId, 'unlocked_character_colors', picked.id)
      return pay({ type: 'skin', skinId: picked.id, skinName: picked.name })
    }
    if (picked.kind === 'boat') {
      await db.addToList(userId, 'unlocked_boats', picked.id)
      return pay({ type: 'boat', boatId: picked.id, boatName: picked.name, boatImageUrl: picked.imageUrl })
    }
    await db.addToList(userId, 'unlocked_hats', picked.id)
    return pay({ type: 'hat', hatId: picked.id, hatName: picked.name, hatImageUrl: picked.imageUrl })
  }
  if (o.kind === 'doubloons') {
    // Paid in place, so a sale landing at the same moment is not overwritten.
    // The new total rides along (KAN-61) so the purse on the sea moves.
    const newDoubloons = await db.grant(userId, 'doubloons', o.amount)
    return pay({ type: 'doubloons', amount: o.amount, newDoubloons })
  }
  await db.addBait(userId, o.baitType, o.qty)
  return pay({ type: 'bait', baitType: o.baitType, baitName: getBait(o.baitType).name, quantity: o.qty })
}
