'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRod } from '@/lib/rods'
import { getHook } from '@/lib/hooks'
import { getBait } from '@/lib/bait'
import { checkAchievements } from '@/lib/checkAchievements'

function today() {
  return new Date().toISOString().split('T')[0]
}

export type FishSpecies = {
  id: number
  name: string
  scientific_name: string
  description: string | null
  fun_fact: string
  habitat: string
  bite_rarity: number
  catch_difficulty: number
  catch_score: number
  sell_value: number
}

import { ZONE_RARITY_RATES } from './zoneData'

// Two-stage fish selection:
//   Stage 1 — roll rarity tier using zone-specific fixed rates (commons always dominant)
//   Stage 2 — pick uniformly among fish of that tier in this zone
// Adding more fish of a rarity increases variety, not that rarity's probability.
// Tiers absent from a zone are excluded and the remaining rates normalise automatically.

function tierWeightedPick<T extends { bite_rarity: number }>(items: T[], habitat: string): T {
  const rates = ZONE_RARITY_RATES[habitat] ?? ZONE_RARITY_RATES.shallows

  // Group fish by rarity tier
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const g = groups.get(item.bite_rarity) ?? []
    g.push(item)
    groups.set(item.bite_rarity, g)
  }

  // Stage 1: pick tier (only from tiers that have fish in this zone)
  const tiers = [...groups.keys()]
  const totalWeight = tiers.reduce((s, r) => s + (rates[r] ?? 0), 0)
  if (totalWeight === 0) return items[Math.floor(Math.random() * items.length)]

  let rand = Math.random() * totalWeight
  let selectedTier = tiers[0]
  for (const r of tiers) {
    rand -= rates[r] ?? 0
    if (rand <= 0) { selectedTier = r; break }
  }

  // Stage 2: pick uniformly within selected tier
  const pool = groups.get(selectedTier)!
  return pool[Math.floor(Math.random() * pool.length)]
}

export async function castLine(baitType: string, habitat: string): Promise<
  | { hit: false }
  | { hit: true; fishId: number; catchDifficulty: number; biteRarity: number }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('rod_tier, hook_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const rod  = getRod(profile.rod_tier ?? 0)
  const hook = getHook(profile.hook_tier ?? 0)
  const bait = getBait(baitType)

  // Validate zone access
  if (!rod.habitats.includes(habitat as ReturnType<typeof getRod>['habitats'][0])) {
    return { error: 'Your rod cannot reach that depth' }
  }
  if (!bait.habitats.includes(habitat as ReturnType<typeof getRod>['habitats'][0])) {
    return { error: 'That bait is not suited for this zone' }
  }

  // Consume 1 bait
  const { data: baitRow } = await admin
    .from('bait_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('bait_type', baitType)
    .single()

  if (!baitRow || baitRow.quantity <= 0) return { error: 'No bait remaining.' }

  await admin
    .from('bait_inventory')
    .update({ quantity: baitRow.quantity - 1 })
    .eq('user_id', user.id)
    .eq('bait_type', baitType)

  // Draw a random fish from the selected habitat
  const { data: candidates } = await admin
    .from('fish_species')
    .select('id, catch_difficulty, catch_score, bite_rarity')
    .eq('habitat', habitat)

  if (!candidates || candidates.length === 0) return { hit: false }

  const fish = tierWeightedPick(candidates, habitat)

  // Roll: 1–50 base + rod bonus + hook bonus vs fish catch_score
  const roll = Math.floor(Math.random() * 50) + 1 + rod.rollBonus + hook.rollBonus

  if (roll < fish.catch_score) return { hit: false }

  return { hit: true, fishId: fish.id, catchDifficulty: fish.catch_difficulty, biteRarity: fish.bite_rarity }
}

const PERFECT_BAIT_SAVE_CHANCE = 0.5

// Phase 2 — process reel-in result
export async function reelIn(
  fishId: number,
  result: 'perfect' | 'catch' | 'miss' | 'penalty',
  baitType: string,
): Promise<
  | { caught: true; fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean; newAchievements: string[] }
  | { caught: false; newAchievements: string[] }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const isCatch = result === 'perfect' || result === 'catch'

  // Snag: consume one extra bait
  if (result === 'penalty') {
    const { data: baitRow } = await admin
      .from('bait_inventory')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
      .single()

    if (baitRow && baitRow.quantity > 0) {
      await admin
        .from('bait_inventory')
        .update({ quantity: baitRow.quantity - 1 })
        .eq('user_id', user.id)
        .eq('bait_type', baitType)
    }
  }

  if (!isCatch) {
    const newAchievements = await checkAchievements(user.id, {
      type: 'fishing', result, depthId: 0, abyssStreak: 0,
    })
    return { caught: false, newAchievements }
  }

  const [{ data: fish }, { data: profile }] = await Promise.all([
    admin.from('fish_species').select('*').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons, fishing_abyss_streak').eq('id', user.id).single(),
  ])

  if (!fish || !profile) return { error: 'Data not found' }

  // Perfect: 50% chance to return the bait used for this cast
  const baitSaved = result === 'perfect' && Math.random() < PERFECT_BAIT_SAVE_CHANCE

  // Check if new species for bestiary
  const { data: existing } = await admin
    .from('fish_collection')
    .select('catch_count')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .single()

  const isNewSpecies = !existing

  // Upsert bestiary log
  if (isNewSpecies) {
    await admin.from('fish_collection').insert({ user_id: user.id, fish_id: fishId, catch_count: 1 })
  } else {
    await admin.from('fish_collection').update({
      catch_count: existing.catch_count + 1,
      last_caught_at: new Date().toISOString(),
    }).eq('user_id', user.id).eq('fish_id', fishId)
  }

  // Upsert sellable inventory
  const { data: invRow } = await admin
    .from('fish_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .single()

  if (invRow) {
    await admin.from('fish_inventory')
      .update({ quantity: invRow.quantity + 1 })
      .eq('user_id', user.id).eq('fish_id', fishId)
  } else {
    await admin.from('fish_inventory').insert({ user_id: user.id, fish_id: fishId, quantity: 1 })
  }

  // Auto-upgrade line tier on new species unlock
  if (isNewSpecies) {
    const { count } = await admin
      .from('fish_collection')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
    const unique = count ?? 0
    const newLineTier = unique >= 45 ? 3 : unique >= 25 ? 2 : unique >= 10 ? 1 : 0
    await admin.from('profiles').update({ line_tier: newLineTier }).eq('id', user.id)
  }

  // Track abyss streak for achievements
  const isAbyssPerfect = result === 'perfect' && fish.habitat === 'abyss'
  const newAbyssStreak = isAbyssPerfect ? (profile.fishing_abyss_streak ?? 0) + 1 : 0

  await admin.from('profiles').update({ fishing_abyss_streak: newAbyssStreak }).eq('id', user.id)

  if (baitSaved) {
    const { data: baitRow } = await admin
      .from('bait_inventory')
      .select('quantity')
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
      .single()
    if (baitRow) {
      await admin.from('bait_inventory')
        .update({ quantity: baitRow.quantity + 1 })
        .eq('user_id', user.id)
        .eq('bait_type', baitType)
    }
  }

  const newAchievements = await checkAchievements(user.id, {
    type: 'fishing',
    result,
    depthId: ['shallows', 'open_waters', 'deep', 'abyss'].indexOf(fish.habitat),
    abyssStreak: newAbyssStreak,
  })

  return { caught: true, fish: fish as FishSpecies, baitSaved, isNewSpecies, newAchievements }
}

// Sell fish from inventory
export async function sellFish(
  fishId: number,
  quantity: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  if (quantity <= 0) return { error: 'Invalid quantity' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const [{ data: invRow }, { data: fish }, { data: profile }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id).eq('fish_id', fishId).single(),
    admin.from('fish_species').select('sell_value').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  const earned = fish.sell_value * quantity
  const newDoubloons = (profile.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('fish_inventory')
      .update({ quantity: invRow.quantity - quantity })
      .eq('user_id', user.id).eq('fish_id', fishId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned, reason: 'Sold fish',
    }),
  ])

  return { earned, doubloons: newDoubloons }
}

// Give daily free worm bait top-up (called server-side on page load)
export async function claimDailyBait(userId: string): Promise<void> {
  const admin = createAdminClient()
  const todayStr = today()

  const { data: profile } = await admin
    .from('profiles')
    .select('bait_last_topup')
    .eq('id', userId)
    .single()

  if (profile?.bait_last_topup === todayStr) return

  const DAILY_WORMS = 10

  const { data: existing } = await admin
    .from('bait_inventory')
    .select('quantity')
    .eq('user_id', userId)
    .eq('bait_type', 'worm')
    .single()

  await Promise.all([
    existing
      ? admin.from('bait_inventory')
          .update({ quantity: existing.quantity + DAILY_WORMS })
          .eq('user_id', userId).eq('bait_type', 'worm')
      : admin.from('bait_inventory').insert({ user_id: userId, bait_type: 'worm', quantity: DAILY_WORMS }),
    admin.from('profiles').update({ bait_last_topup: todayStr }).eq('id', userId),
  ])
}
