import type { SupabaseClient } from '@supabase/supabase-js'
import { CRATE_PET_CHANCE, rollPet } from '@/lib/pets'
import { getBait } from '@/lib/bait'

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
  | { type: 'doubloons'; amount: number }
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

/**
 * Roll a crate of `tier` and grant its reward to `userId`, returning the loot.
 * ALWAYS pays out exactly one reward (pet / cosmetic / doubloons / bait) — never
 * an empty result — so a gated caller (fishing crate token, weekly stamp) can
 * rely on getting something back. The caller owns the anti-forgery / rate gate;
 * this function only rolls + writes the grant.
 */
export async function grantCrateLoot(
  admin: SupabaseClient,
  userId: string,
  tier: CrateTier,
): Promise<CrateLoot> {
  const { data: profile } = await admin.from('profiles')
    .select('doubloons, unlocked_character_colors, unlocked_boats, unlocked_hats, unlocked_pets, equipped_pet')
    .eq('id', userId).single()

  // Lifetime crates-opened counter (admin stat).
  await admin.rpc('bump_profile_stat', { uid: userId, col: 'fishing_crates_opened', n: 1 })

  const unlockedSkins = (profile?.unlocked_character_colors as string[] | null) ?? []
  const unlockedBoats = (profile?.unlocked_boats as string[] | null) ?? []
  const unlockedHats  = (profile?.unlocked_hats  as string[] | null) ?? []
  const unlockedPets  = (profile?.unlocked_pets  as string[] | null) ?? []

  // ── Pet roll — OVERRIDE the normal outcome on hit ─────────────────
  // Rolled FIRST and exclusively, so the rare moment owns the screen instead of
  // fighting a doubloons/bait/cosmetic result. Rates in lib/pets.CRATE_PET_CHANCE.
  // The roll is DELIBERATELY blind to what you already own. Duplicates are what
  // keep the full 19-pet set hard, and filtering the pool would renormalise the
  // six 1.2% golds upward every time you closed out a common one.
  //
  // What a duplicate must NOT do is eat the crate. The pet roll overrides the
  // normal outcome, so a dupe used to resolve to an empty screen: no pet, and no
  // doubloons, bait or cosmetic either. At 1-in-333 casts in the Ancient Deep
  // that is the rarest moment in fishing paying nothing at all. A dupe now falls
  // through to the normal roll and rides along on it for the reveal.
  let dupePet: DupePet | undefined
  if (Math.random() < CRATE_PET_CHANCE[tier]) {
    const pet = rollPet()
    if (!unlockedPets.includes(pet.id)) {
      await admin.from('profiles').update({
        unlocked_pets: [...unlockedPets, pet.id],
        // Auto-equip the first pet so it lands in the loadout without an extra tap.
        equipped_pet: (profile?.equipped_pet as string | null) ?? pet.id,
      }).eq('id', userId)
      return {
        type: 'pet',
        petId: pet.id, petName: pet.name,
        petImageUrl: pet.restImageUrl,
        petAccent: pet.accentColor,
      }
    }
    dupePet = { petId: pet.id, petName: pet.name, petImageUrl: pet.restImageUrl, petAccent: pet.accentColor }
  }

  /** Tag whatever the crate actually paid with the pet it passed over. */
  const pay = <T extends CrateLoot>(loot: T): T => (dupePet ? { ...loot, dupePet } : loot)

  const isOwned = (entry: typeof CRATE_COSMETIC_POOL[number]) => {
    if (entry.kind === 'skin') return unlockedSkins.includes(entry.id)
    if (entry.kind === 'boat') return unlockedBoats.includes(entry.id)
    return unlockedHats.includes(entry.id)
  }

  const weights = CRATE_OUTCOME_WEIGHTS[tier]
  const unownedCosmetics = CRATE_COSMETIC_POOL.filter(c => !isOwned(c))
  // If cosmetic outcome can't actually pay out (everything owned), fold its weight into doubloons.
  const cosmeticWeight = unownedCosmetics.length > 0 ? weights.cosmetic : 0
  const doubloonWeight = weights.doubloons + (unownedCosmetics.length > 0 ? 0 : weights.cosmetic)

  type Outcome = 'doubloons' | 'bait' | 'cosmetic'
  const pool: { outcome: Outcome; weight: number }[] = [
    { outcome: 'doubloons', weight: doubloonWeight },
    { outcome: 'bait',      weight: weights.bait   },
    { outcome: 'cosmetic',  weight: cosmeticWeight },
  ]
  const total = pool.reduce((s, o) => s + o.weight, 0)
  let rand = Math.random() * total
  let outcome: Outcome = 'doubloons'
  for (const o of pool) { rand -= o.weight; if (rand <= 0) { outcome = o.outcome; break } }

  if (outcome === 'cosmetic') {
    const picked = unownedCosmetics[Math.floor(Math.random() * unownedCosmetics.length)]
    if (picked.kind === 'skin') {
      await admin.from('profiles').update({ unlocked_character_colors: [...unlockedSkins, picked.id] }).eq('id', userId)
      return pay({ type: 'skin', skinId: picked.id, skinName: picked.name })
    }
    if (picked.kind === 'boat') {
      await admin.from('profiles').update({ unlocked_boats: [...unlockedBoats, picked.id] }).eq('id', userId)
      return pay({ type: 'boat', boatId: picked.id, boatName: picked.name, boatImageUrl: picked.imageUrl })
    }
    await admin.from('profiles').update({ unlocked_hats: [...unlockedHats, picked.id] }).eq('id', userId)
    return pay({ type: 'hat', hatId: picked.id, hatName: picked.name, hatImageUrl: picked.imageUrl })
  }

  if (outcome === 'doubloons') {
    const [min, max] = CRATE_DOUBLOON_RANGE[tier]
    const amount = Math.floor(min + Math.random() * (max - min + 1))
    await admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + amount }).eq('id', userId)
    return pay({ type: 'doubloons', amount })
  }

  // Bait — weighted random pick from this tier's pool
  const baitPool = CRATE_BAIT_POOLS[tier]
  const totalBaitWeight = baitPool.reduce((s, b) => s + b.weight, 0)
  let baitRand = Math.random() * totalBaitWeight
  let picked = baitPool[0]
  for (const b of baitPool) { baitRand -= b.weight; if (baitRand <= 0) { picked = b; break } }
  const qty = CRATE_BAIT_QTY[tier]
  const { data: existing } = await admin.from('bait_inventory').select('quantity').eq('user_id', userId).eq('bait_type', picked.type).single()
  if (existing) {
    await admin.from('bait_inventory').update({ quantity: existing.quantity + qty }).eq('user_id', userId).eq('bait_type', picked.type)
  } else {
    await admin.from('bait_inventory').insert({ user_id: userId, bait_type: picked.type, quantity: qty })
  }
  const baitName = getBait(picked.type).name
  return pay({ type: 'bait', baitType: picked.type, baitName, quantity: qty })
}
