'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getBait } from '@/lib/bait'
import { getRod } from '@/lib/rods'
import { getFishHold } from '@/lib/fishHold'
import { checkAchievements } from '@/lib/checkAchievements'
import { unlockBadge } from '@/app/achievements/badgeActions'
import { recordChallengeScore } from '@/app/social/challengeActions'
import { catchXP, getLevelFromXP } from '@/lib/fishingLevel'
import { getLineForSpeciesCount } from '@/lib/lines'
import { getSpecialItem } from '@/lib/specialItems'
import { getEffectiveDailyChallenges, getTodayUTC, challengeIncrement } from '@/lib/dailyChallenges'
import { zoneRewardDoubloons } from '@/lib/zoneRewards'

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

import { ZONE_RARITY_RATES, ZONE_MIN_LEVEL } from './zoneData'

// Wait time: zone sets the range, catch_score positions within it (higher score = longer wait)
const ZONE_WAIT_BASE: Record<string, [number, number]> = {
  shallows:    [3000,  12000],
  open_waters: [5000,  20000],
  deep:        [8000,  35000],
  abyss:       [12000, 45000],
  ancient_deep: [45000, 120000],
}
function fishWaitMs(catchScore: number, habitat: string, baitType: string, fishingLevel: number): number {
  const [zMin, zMax] = ZONE_WAIT_BASE[habitat] ?? [5000, 20000]
  const frac = Math.max(0, Math.min(1, (catchScore - 8) / 90))
  const base = zMin + frac * (zMax - zMin)
  const baitMult = getBait(baitType).waitMult
  const levelMult = 1 - ((fishingLevel - 1) / 99) * 0.33
  return Math.max(3000, Math.min(60000, base * baitMult * levelMult))
}

// Two-stage fish selection:
//   Stage 1 — roll rarity tier using zone-specific fixed rates (commons always dominant)
//   Stage 2 — pick uniformly among fish of that tier in this zone
// Adding more fish of a rarity increases variety, not that rarity's probability.
// Tiers absent from a zone are excluded and the remaining rates normalise automatically.

function tierWeightedPick<T extends { bite_rarity: number }>(items: T[], habitat: string, rarityBonus: number): T {
  const baseRates = ZONE_RARITY_RATES[habitat] ?? ZONE_RARITY_RATES.shallows

  // Group fish by rarity tier
  const groups = new Map<number, T[]>()
  for (const item of items) {
    const g = groups.get(item.bite_rarity) ?? []
    g.push(item)
    groups.set(item.bite_rarity, g)
  }

  // Apply rod rarity bias: higher tiers get boosted proportionally
  const tiers = [...groups.keys()]
  const adjustedRates: Record<number, number> = {}
  for (const r of tiers) {
    adjustedRates[r] = (baseRates[r] ?? 0) * (1 + rarityBonus * (r - 1))
  }

  const totalWeight = tiers.reduce((s, r) => s + adjustedRates[r], 0)
  if (totalWeight === 0) return items[Math.floor(Math.random() * items.length)]

  let rand = Math.random() * totalWeight
  let selectedTier = tiers[0]
  for (const r of tiers) {
    rand -= adjustedRates[r]
    if (rand <= 0) { selectedTier = r; break }
  }

  const pool = groups.get(selectedTier)!
  return pool[Math.floor(Math.random() * pool.length)]
}

// ── Server-side event validation ─────────────────────────────────────────────

const EVENT_DURATION_MS = 120_000
const EVENT_MIN_GAP_MS  = 600_000 // 10 minutes minimum between events

function getActiveEvent(raw: unknown): { type: string } | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as { type?: string; started_at?: string }
  if (!e.type || !e.started_at) return null
  if (Date.now() - new Date(e.started_at).getTime() > EVENT_DURATION_MS) return null
  return { type: e.type }
}

export async function activateEvent(type: string): Promise<{ ok: true } | { error: string }> {
  const VALID = new Set(['bloom', 'fullmoon', 'redtide', 'glassy'])
  if (!VALID.has(type)) return { error: 'Invalid event type' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('active_event, last_event_at')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const now = Date.now()

  if (getActiveEvent(profile.active_event)) return { error: 'Event already active' }

  if (profile.last_event_at) {
    const lastAt = new Date(profile.last_event_at as string).getTime()
    if (now - lastAt < EVENT_MIN_GAP_MS) return { error: 'Too soon' }
  }

  const started_at = new Date().toISOString()
  await admin
    .from('profiles')
    .update({ active_event: { type, started_at }, last_event_at: started_at })
    .eq('id', user.id)

  return { ok: true }
}

export type CrateTier = 'wooden' | 'metal' | 'gold' | 'diamond'

const ZONE_CRATE_TIERS: Record<string, Record<CrateTier, number>> = {
  shallows:    { wooden: 80, metal: 10, gold: 7,  diamond: 3  },
  open_waters: { wooden: 60, metal: 20, gold: 12, diamond: 8  },
  deep:        { wooden: 35, metal: 30, gold: 20, diamond: 15 },
  abyss:       { wooden: 15, metal: 25, gold: 35, diamond: 25 },
}

function rollCrateTier(habitat: string): CrateTier {
  const dist = ZONE_CRATE_TIERS[habitat] ?? ZONE_CRATE_TIERS.shallows
  const total = dist.wooden + dist.metal + dist.gold + dist.diamond
  let r = Math.random() * total
  if ((r -= dist.wooden)  < 0) return 'wooden'
  if ((r -= dist.metal)   < 0) return 'metal'
  if ((r -= dist.gold)    < 0) return 'gold'
  return 'diamond'
}

export async function castLine(baitType: string, habitat: string): Promise<
  | { fishId: number; catchDifficulty: number; biteRarity: number; waitMs: number; crateTier?: CrateTier }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('rod_tier, hook_tier, fishing_xp, fish_hold_tier, trophy_catches, active_event')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const bait = getBait(baitType)

  // Validate zone access by fishing level
  const fishingLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const minLevel = ZONE_MIN_LEVEL[habitat] ?? 1
  if (fishingLevel < minLevel) {
    return { error: `Reach Fishing Level ${minLevel} to fish here` }
  }

  // Derive event effects server-side — never trust client flags
  const activeEvent = getActiveEvent(profile.active_event)
  const noBait = activeEvent?.type === 'bloom'
  const eventRarityBonus = activeEvent?.type === 'redtide' ? 0.25 : 0

  // Fetch hold, bait, and candidates in parallel
  const fishHold = getFishHold(profile.fish_hold_tier ?? 0)
  const [{ data: holdRows }, { data: baitRow }, { data: candidates }] = await Promise.all([
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
    admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', baitType).single(),
    admin.from('fish_species').select('id, catch_difficulty, catch_score, bite_rarity').eq('habitat', habitat),
  ])

  const totalFish = (holdRows ?? []).reduce((sum, r) => sum + (r.quantity ?? 0), 0)
  if (habitat !== 'ancient_deep' && totalFish >= fishHold.capacity) {
    return { error: `Fish hold full (${fishHold.capacity}/${fishHold.capacity}). Sell some fish to make room.` }
  }

  if (!noBait && (!baitRow || baitRow.quantity <= 0)) return { error: 'No bait remaining.' }

  if (!candidates || candidates.length === 0) return { error: 'No fish found in this zone' }

  // Ancient Deep: filter out already-caught trophies
  let pool = candidates
  if (habitat === 'ancient_deep') {
    const caught = new Set<number>((profile.trophy_catches as number[] | null) ?? [])
    pool = candidates.filter(f => !caught.has(f.id))
    if (pool.length === 0) return { error: 'You have caught all Ancient Deep trophies!' }
  }

  // Crate encounter: 2% chance in all zones except ancient_deep
  if (habitat !== 'ancient_deep' && Math.random() < 0.02) {
    if (!noBait && baitRow) {
      await admin.from('bait_inventory').update({ quantity: baitRow.quantity - 1 }).eq('user_id', user.id).eq('bait_type', baitType)
    }
    const crateWait = { shallows: 4000, open_waters: 7000, deep: 11000, abyss: 16000 }[habitat] ?? 6000
    const crateTier = rollCrateTier(habitat)
    return { fishId: CRATE_FISH_ID, catchDifficulty: 1, biteRarity: 1, waitMs: crateWait, crateTier }
  }

  if (!noBait && baitRow) {
    await admin
      .from('bait_inventory')
      .update({ quantity: baitRow.quantity - 1 })
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
  }

  const rod = getRod(profile.rod_tier ?? 0)
  const fish = tierWeightedPick(pool, habitat, rod.rarityBonus + eventRarityBonus)
  const waitMs = fishWaitMs(fish.catch_score, habitat, baitType, fishingLevel)

  return { fishId: fish.id, catchDifficulty: fish.catch_difficulty, biteRarity: fish.bite_rarity, waitMs }
}

const CRATE_FISH_ID = -1

const PERFECT_BAIT_SAVE_CHANCE = 0.5

// Phase 2 — process reel-in result
export async function reelIn(
  fishId: number,
  result: 'perfect' | 'catch' | 'miss' | 'penalty',
  baitType: string,
  doubleCatch = false,
  streakBonus = 0,
  jackpotMultiplier = 1,
): Promise<
  | { caught: true; fish: FishSpecies; baitSaved: boolean; isNewSpecies: boolean; newAchievements: string[]; xpGained: number; newXP: number; dailyProgress: [number, number, number]; unlockedSkinId?: string }
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

  const [{ data: fish }, { data: profile }, { data: holdRows }] = await Promise.all([
    admin.from('fish_species').select('*').eq('id', fishId).single(),
    admin.from('profiles').select('doubloons, fishing_abyss_streak, fishing_xp, fish_hold_tier, has_phantom_hook, line_tier, prestige_levels, trophy_catches, unlocked_character_colors').eq('id', user.id).single(),
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
  ])

  if (!fish || !profile) return { error: 'Data not found' }

  // Trophy path: ancient_deep fish go straight to trophy_catches, skip hold/collection/bounty
  if (fish.habitat === 'ancient_deep') {
    const existing = ((profile.trophy_catches as number[] | null) ?? [])
    const isNewTrophy = !existing.includes(fishId)
    const xpGained = Math.round(catchXP(fish.catch_difficulty, fish.habitat, result === 'perfect') * 3)
    const newXP = (profile.fishing_xp ?? 0) + xpGained
    const updates: Record<string, unknown> = { fishing_xp: newXP }
    if (isNewTrophy) updates.trophy_catches = [...existing, fishId]
    // Golden skin: unlock when all 6 trophies are caught
    let unlockedSkinId: string | undefined
    const newTrophies = isNewTrophy ? [...existing, fishId] : existing
    if (newTrophies.length >= 6) {
      const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
      if (!currentUnlocked.includes('golden')) {
        updates.unlocked_character_colors = [...currentUnlocked, 'golden']
        unlockedSkinId = 'golden'
      }
      await unlockBadge('ancient_ones')
    }
    await admin.from('profiles').update(updates).eq('id', user.id)
    const newAchievements = await checkAchievements(user.id, { type: 'fishing', result, depthId: 4, abyssStreak: 0 })
    return { caught: true, fish: fish as FishSpecies, baitSaved: false, isNewSpecies: isNewTrophy, newAchievements, xpGained, newXP, dailyProgress: [0, 0, 0], unlockedSkinId }
  }

  // Perfect: 50% chance to return the bait used for this cast; Phantom Hook: additional 25% on any catch
  let baitSaved = result === 'perfect' && Math.random() < PERFECT_BAIT_SAVE_CHANCE
  if (!baitSaved && profile.has_phantom_hook) baitSaved = Math.random() < 0.25

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

  // Upsert sellable inventory — cap at hold capacity
  const holdCapacity = getFishHold(profile.fish_hold_tier ?? 0).capacity
  const currentHoldCount = (holdRows ?? []).reduce((s: number, r: { quantity: number }) => s + (r.quantity ?? 0), 0)
  const desired = doubleCatch ? 2 : jackpotMultiplier
  const catchQty = Math.min(desired, Math.max(0, holdCapacity - currentHoldCount))

  const { data: invRow } = await admin
    .from('fish_inventory')
    .select('quantity')
    .eq('user_id', user.id)
    .eq('fish_id', fishId)
    .single()

  if (catchQty > 0) {
    if (invRow) {
      await admin.from('fish_inventory')
        .update({ quantity: invRow.quantity + catchQty })
        .eq('user_id', user.id).eq('fish_id', fishId)
    } else {
      await admin.from('fish_inventory').insert({ user_id: user.id, fish_id: fishId, quantity: catchQty })
    }
  }

  // Auto-upgrade line tier on new species unlock
  if (isNewSpecies) {
    const [{ count: uniqueCount }, { count: totalCount }] = await Promise.all([
      admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      admin.from('fish_species').select('*', { count: 'exact', head: true }).neq('habitat', 'ancient_deep'),
    ])
    const unique = uniqueCount ?? 0
    const newLineTier = getLineForSpeciesCount(unique).tier
    if (newLineTier > (profile?.line_tier ?? 0)) {
      await admin.from('profiles').update({ line_tier: newLineTier }).eq('id', user.id)
    }
    if (unique >= (totalCount ?? Infinity)) await unlockBadge('full_collection')
  }

  // Track abyss streak for achievements
  const isAbyssPerfect = result === 'perfect' && fish.habitat === 'abyss'
  const newAbyssStreak = isAbyssPerfect ? (profile.fishing_abyss_streak ?? 0) + 1 : 0
  const prestigeLevels = (profile.prestige_levels as Record<string, number> | null) ?? {}
  const zonePrestige = prestigeLevels[fish.habitat] ?? 0
  const prestigeXPMult = 1 + zonePrestige * 0.10
  const xpGained = Math.round((catchXP(fish.catch_difficulty, fish.habitat, result === 'perfect') + (result === 'perfect' ? streakBonus : 0)) * prestigeXPMult)
  const newXP = (profile.fishing_xp ?? 0) + xpGained

  // Forest skin: unlock at fishing level 50
  const profileUpdates: Record<string, unknown> = { fishing_abyss_streak: newAbyssStreak, fishing_xp: newXP }
  let reelInUnlockedSkin: string | undefined
  const oldFishingLevel = getLevelFromXP(profile.fishing_xp ?? 0)
  const newFishingLevel = getLevelFromXP(newXP)
  if (oldFishingLevel < 50 && newFishingLevel >= 50) {
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('forest')) {
      profileUpdates.unlocked_character_colors = [...currentUnlocked, 'forest']
      reelInUnlockedSkin = 'forest'
    }
  }
  if (oldFishingLevel < 100 && newFishingLevel >= 100) await unlockBadge('master_angler')

  const [, baitFetchResult] = await Promise.all([
    admin.from('profiles').update(profileUpdates).eq('id', user.id),
    baitSaved
      ? admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', baitType).single()
      : Promise.resolve({ data: null }),
  ])

  if (baitSaved && baitFetchResult.data) {
    await admin.from('bait_inventory')
      .update({ quantity: baitFetchResult.data.quantity + 1 })
      .eq('user_id', user.id)
      .eq('bait_type', baitType)
  }

  // Record challenge score (fire and forget)
  recordChallengeScore(user.id, fish.sell_value * catchQty, result === 'perfect').catch(() => {})

  // Check achievements
  const newAchievements = await checkAchievements(user.id, {
    type: 'fishing',
    result,
    depthId: ['shallows', 'open_waters', 'deep', 'abyss'].indexOf(fish.habitat),
    abyssStreak: newAbyssStreak,
  })

  // Update daily challenge progress
  const dailyDate = getTodayUTC()
  const dailyChallenges = await getEffectiveDailyChallenges(dailyDate, admin)
  const isPerfect = result === 'perfect'
  const { data: dailyRow } = await admin
    .from('daily_challenge_progress')
    .select('p1, p2, p3, claimed_1, claimed_2, claimed_3')
    .eq('user_id', user.id)
    .eq('date', dailyDate)
    .maybeSingle()

  const newP = [
    Math.min(
      (dailyRow?.p1 ?? 0) + challengeIncrement(dailyChallenges[0], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[0].target,
    ),
    Math.min(
      (dailyRow?.p2 ?? 0) + challengeIncrement(dailyChallenges[1], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[1].target,
    ),
    Math.min(
      (dailyRow?.p3 ?? 0) + challengeIncrement(dailyChallenges[2], fish.habitat, fish.bite_rarity, fish.sell_value, catchQty, isPerfect),
      dailyChallenges[2].target,
    ),
  ] as [number, number, number]

  await admin.from('daily_challenge_progress').upsert(
    { user_id: user.id, date: dailyDate, p1: newP[0], p2: newP[1], p3: newP[2] },
    { onConflict: 'user_id,date' },
  )

  return { caught: true, fish: fish as FishSpecies, baitSaved, isNewSpecies, newAchievements, xpGained, newXP, dailyProgress: newP, unlockedSkinId: reelInUnlockedSkin }
}

// Crate loot tables — doubloons and bait pool depend on crate tier, not zone.
const CRATE_DOUBLOON_RANGE: Record<CrateTier, [number, number]> = {
  wooden:  [100,  400 ],
  metal:   [250,  1000],
  gold:    [500,  2000],
  diamond: [1000, 4000],
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
}

const CRATE_BAIT_QTY: Record<CrateTier, number> = {
  wooden:  5,
  metal:   10,
  gold:    15,
  diamond: 20,
}

// Per-tier outcome weights. Wooden/metal have no cosmetic outcome.
const CRATE_OUTCOME_WEIGHTS: Record<CrateTier, { doubloons: number; bait: number; cosmetic: number }> = {
  wooden:  { doubloons: 50, bait: 50, cosmetic: 0  },
  metal:   { doubloons: 50, bait: 50, cosmetic: 0  },
  gold:    { doubloons: 55, bait: 35, cosmetic: 10 },
  diamond: { doubloons: 25, bait: 60, cosmetic: 15 },
}

// Crate-exclusive cosmetics that can drop from gold/diamond crates.
// Keep ids in sync with lib/boats.ts, lib/hats.ts, lib/characters.ts.
const CRATE_COSMETIC_POOL = [
  { kind: 'skin' as const, id: 'mint',      name: 'Mint'                   },
  { kind: 'boat' as const, id: 'charcoal',  name: 'Charcoal',  imageUrl: '/boat_charcoal_rest.png' },
  { kind: 'boat' as const, id: 'offwhite',  name: 'Offwhite',  imageUrl: '/boat_offwhite_rest.png' },
  { kind: 'hat'  as const, id: 'black',     name: 'Black',     imageUrl: '/hat_black_rest.png'     },
  { kind: 'hat'  as const, id: 'gray',      name: 'Gray',      imageUrl: '/hat_gray_rest.png'      },
]

export type CrateLoot =
  | { type: 'doubloons'; amount: number }
  | { type: 'bait';      baitType: string; baitName: string; quantity: number }
  | { type: 'skin';      skinId: string;   skinName: string }
  | { type: 'hat';       hatId: string;    hatName: string;  hatImageUrl: string  }
  | { type: 'boat';      boatId: string;   boatName: string; boatImageUrl: string }

export async function reelCrate(_zone: string, tier: CrateTier = 'wooden'): Promise<CrateLoot | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()

  const { data: profile } = await admin.from('profiles')
    .select('doubloons, unlocked_character_colors, unlocked_boats, unlocked_hats')
    .eq('id', user.id).single()

  const unlockedSkins = (profile?.unlocked_character_colors as string[] | null) ?? []
  const unlockedBoats = (profile?.unlocked_boats as string[] | null) ?? []
  const unlockedHats  = (profile?.unlocked_hats  as string[] | null) ?? []
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
      await admin.from('profiles').update({ unlocked_character_colors: [...unlockedSkins, picked.id] }).eq('id', user.id)
      return { type: 'skin', skinId: picked.id, skinName: picked.name }
    }
    if (picked.kind === 'boat') {
      await admin.from('profiles').update({ unlocked_boats: [...unlockedBoats, picked.id] }).eq('id', user.id)
      return { type: 'boat', boatId: picked.id, boatName: picked.name, boatImageUrl: picked.imageUrl }
    }
    await admin.from('profiles').update({ unlocked_hats: [...unlockedHats, picked.id] }).eq('id', user.id)
    return { type: 'hat', hatId: picked.id, hatName: picked.name, hatImageUrl: picked.imageUrl }
  }

  if (outcome === 'doubloons') {
    const [min, max] = CRATE_DOUBLOON_RANGE[tier]
    const amount = Math.floor(min + Math.random() * (max - min + 1))
    await admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + amount }).eq('id', user.id)
    return { type: 'doubloons', amount }
  }

  // Bait — weighted random pick from this tier's pool
  const baitPool = CRATE_BAIT_POOLS[tier]
  const totalBaitWeight = baitPool.reduce((s, b) => s + b.weight, 0)
  let baitRand = Math.random() * totalBaitWeight
  let picked = baitPool[0]
  for (const b of baitPool) { baitRand -= b.weight; if (baitRand <= 0) { picked = b; break } }
  const qty = CRATE_BAIT_QTY[tier]
  const { data: existing } = await admin.from('bait_inventory').select('quantity').eq('user_id', user.id).eq('bait_type', picked.type).single()
  if (existing) {
    await admin.from('bait_inventory').update({ quantity: existing.quantity + qty }).eq('user_id', user.id).eq('bait_type', picked.type)
  } else {
    await admin.from('bait_inventory').insert({ user_id: user.id, bait_type: picked.type, quantity: qty })
  }
  const baitName = getBait(picked.type).name
  return { type: 'bait', baitType: picked.type, baitName, quantity: qty }
}

const QUICK_BUY_WORMS_QTY  = 10
const QUICK_BUY_WORMS_COST = 200  // 2× the shop price of 100 doubloons per 10

export async function quickBuyWorms(): Promise<{ qty: number; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if ((profile.doubloons ?? 0) < QUICK_BUY_WORMS_COST) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - QUICK_BUY_WORMS_COST

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: 'worm', p_qty: QUICK_BUY_WORMS_QTY }),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -QUICK_BUY_WORMS_COST, reason: 'Quick-buy worms' }),
  ])

  return { qty: QUICK_BUY_WORMS_QTY, doubloons: newDoubloons }
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
    admin.from('profiles').select('doubloons, active_event').eq('id', user.id).single(),
  ])

  if (!invRow || !fish || !profile) return { error: 'Data not found' }
  if (invRow.quantity < quantity) return { error: 'Not enough fish' }

  const fullPrice = getActiveEvent(profile.active_event)?.type === 'fullmoon'
  const earned = Math.floor(fish.sell_value * (fullPrice ? 1.0 : 0.65)) * quantity
  const newDoubloons = (profile.doubloons ?? 0) + earned

  await Promise.all([
    admin.from('fish_inventory')
      .update({ quantity: invRow.quantity - quantity })
      .eq('user_id', user.id).eq('fish_id', fishId),
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: earned, reason: 'Sold fish (quick-sell)',
    }),
    ...(newDoubloons >= 1_000_000 ? [unlockBadge('deep_pockets')] : []),
  ])

  return { earned, doubloons: newDoubloons }
}

// Persist a new highest perfect streak if it beats the stored value
export async function saveHighestPerfectStreak(streak: number, zone: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('highest_perfect_streak').eq('id', user.id).single()
  if ((profile?.highest_perfect_streak ?? 0) < streak) {
    await admin.from('profiles').update({ highest_perfect_streak: streak, highest_streak_set_at: new Date().toISOString(), best_streak_zone: zone }).eq('id', user.id)
  }
  if (streak >= 10) await unlockBadge('unbroken')
}


export async function markFishingTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_fishing_tour: true }).eq('id', user.id)
}

export async function markFishingCatchTourSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('profiles').update({ has_seen_fishing_catch_tour: true }).eq('id', user.id)
}

export async function checkLeaderboardPosition(
  category: 'fishingLevel' | 'perfectStreak',
): Promise<{ position: number } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()
  const field = category === 'fishingLevel' ? 'fishing_xp' : 'highest_perfect_streak'

  const { data: me } = await admin.from('profiles').select(field).eq('id', user.id).single()
  if (!me) return null

  const myValue = (me as Record<string, number>)[field] ?? 0
  const { count } = await admin.from('profiles')
    .select('*', { count: 'exact', head: true })
    .gt(field, myValue)

  if (count !== null && count < 3) return { position: count + 1 }
  return null
}

const ZONE_REWARD_COL: Record<string, string> = {
  shallows:    'zone_shallows_rewarded',
  open_waters: 'zone_open_waters_rewarded',
  deep:        'zone_deep_rewarded',
  abyss:       'zone_abyss_rewarded',
}

export async function claimZoneReward(zone: string): Promise<{ doubloons: number; earned: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const admin = createAdminClient()

  const [{ data: profile }, { data: zoneSpecies }, { count: caughtCount }] = await Promise.all([
    admin.from('profiles').select('doubloons, prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded').eq('id', user.id).single(),
    admin.from('fish_species').select('id').eq('habitat', zone),
    admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
      .in('fish_id', (await admin.from('fish_species').select('id').eq('habitat', zone)).data?.map((f: { id: number }) => f.id) ?? []),
  ])

  if (!profile) return { error: 'Profile not found' }
  const alreadyClaimed = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (alreadyClaimed[zone as keyof typeof alreadyClaimed]) return { error: 'Already claimed' }

  const totalInZone = (zoneSpecies ?? []).length
  if ((caughtCount ?? 0) < totalInZone || totalInZone === 0) return { error: 'Zone not complete' }

  const prestigeLevel = ((profile.prestige_levels as Record<string, number> | null) ?? {})[zone] ?? 0
  const earned = zoneRewardDoubloons(zone, prestigeLevel)
  if (!earned) return { error: 'Invalid zone' }

  const newDoubloons = (profile.doubloons ?? 0) + earned
  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, [rewardCol]: true }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: earned, reason: `Zone completion: ${zone}` }),
  ])

  return { doubloons: newDoubloons, earned }
}

export async function prestigeZone(zone: string): Promise<{ prestigeLevel: number; unlockedSkinId?: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const rewardCol = ZONE_REWARD_COL[zone]
  if (!rewardCol) return { error: 'Invalid zone' }

  const admin = createAdminClient()

  const { data: zoneSpeciesRows } = await admin.from('fish_species').select('id').eq('habitat', zone)
  const zoneIds = (zoneSpeciesRows ?? []).map((f: { id: number }) => f.id)
  if (zoneIds.length === 0) return { error: 'Invalid zone' }

  const { data: profile } = await admin
    .from('profiles')
    .select('prestige_levels, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, unlocked_character_colors')
    .eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const rewardClaimed: Record<string, boolean | null> = {
    shallows:    profile.zone_shallows_rewarded,
    open_waters: profile.zone_open_waters_rewarded,
    deep:        profile.zone_deep_rewarded,
    abyss:       profile.zone_abyss_rewarded,
  }
  if (!rewardClaimed[zone]) return { error: 'Claim completion reward first' }

  const { count: caughtCount } = await admin
    .from('fish_collection').select('*', { count: 'exact', head: true })
    .eq('user_id', user.id).in('fish_id', zoneIds)
  if ((caughtCount ?? 0) < zoneIds.length) return { error: 'Zone not complete' }

  const currentLevels = (profile.prestige_levels as Record<string, number> | null) ?? {}
  const newLevel = (currentLevels[zone] ?? 0) + 1
  const newLevels = { ...currentLevels, [zone]: newLevel }

  // Sand skin: unlock when any zone reaches prestige 3
  let prestigeUnlockedSkin: string | undefined
  const profileUpdate: Record<string, unknown> = { prestige_levels: newLevels, [rewardCol]: false }
  const maxPrestige = Math.max(...Object.values(newLevels))
  if (maxPrestige >= 3) {
    const currentUnlocked = (profile.unlocked_character_colors as string[] | null) ?? []
    if (!currentUnlocked.includes('sand')) {
      profileUpdate.unlocked_character_colors = [...currentUnlocked, 'sand']
      prestigeUnlockedSkin = 'sand'
    }
  }

  const allZones = ['shallows', 'open_waters', 'deep', 'abyss']
  const allZonesPrestiged = allZones.every(z => (newLevels[z] ?? 0) >= 1)

  await Promise.all([
    admin.from('fish_collection').delete().eq('user_id', user.id).in('fish_id', zoneIds),
    admin.from('profiles').update(profileUpdate).eq('id', user.id),
    unlockBadge('prestige_i'),
    ...(allZonesPrestiged ? [unlockBadge('zone_legend')] : []),
  ])

  return { prestigeLevel: newLevel, unlockedSkinId: prestigeUnlockedSkin }
}

export async function useTideTurnerSkip(): Promise<{ ok: true; skipsLeft: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('has_tide_turner, tide_turner_used, tide_turner_date')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if (!profile.has_tide_turner) return { error: 'No Tide Turner' }

  const todayStr = today()
  const usedToday = profile.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  if (usedToday >= 3) return { error: 'No skips remaining today' }

  const newUsed = usedToday + 1
  await admin.from('profiles').update({ tide_turner_used: newUsed, tide_turner_date: todayStr }).eq('id', user.id)
  return { ok: true, skipsLeft: 3 - newUsed }
}

export async function buySpecialItem(itemId: string): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const columnMap: Record<string, string> = {
    auto_caster: 'has_auto_caster',
  }
  const column = columnMap[itemId]
  if (!column) return { error: 'Unknown item' }

  const def = getSpecialItem(itemId)
  if (!def?.shopCost) return { error: 'Not for sale' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, has_auto_caster').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const alreadyOwned = column === 'has_auto_caster' ? profile.has_auto_caster : false
  if (alreadyOwned) return { error: 'Already owned' }
  if ((profile.doubloons ?? 0) < def.shopCost) return { error: 'Not enough doubloons' }

  await admin.from('profiles').update({ doubloons: (profile.doubloons ?? 0) - def.shopCost, [column]: true }).eq('id', user.id)
  return { ok: true }
}

export async function equipSpecialItem(itemId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  await admin.from('profiles').update({ equipped_special: itemId }).eq('id', user.id)
  return { ok: true }
}

export async function equipBoat(boatId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (boatId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_boats').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_boats as string[] | null) ?? []
    if (!unlocked.includes(boatId)) return { error: 'Boat not unlocked' }
  }
  await admin.from('profiles').update({ equipped_boat: boatId }).eq('id', user.id)
  return { ok: true }
}

export async function buyBoat(boatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { BOAT_MAP } = await import('@/lib/boats')
  const def = BOAT_MAP[boatId]
  if (!def) return { error: 'Unknown boat' }
  if (def.crateOnly) return { error: 'This boat is only found in crates' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, unlocked_boats').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_boats as string[] | null) ?? []
  if (unlocked.includes(boatId)) return { error: 'Already owned' }
  if ((profile.doubloons ?? 0) < def.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - def.cost
  await admin.from('profiles').update({
    doubloons: newDoubloons,
    unlocked_boats: [...unlocked, boatId],
    equipped_boat: boatId,
  }).eq('id', user.id)
  await admin.from('doubloon_transactions').insert({
    user_id: user.id,
    amount: -def.cost,
    reason: `Bought ${def.name} boat`,
  })
  return { ok: true, doubloons: newDoubloons }
}

export async function equipHat(hatId: string | null): Promise<{ ok: true } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  if (hatId !== null) {
    const { data: profile } = await admin.from('profiles').select('unlocked_hats').eq('id', user.id).single()
    const unlocked = (profile?.unlocked_hats as string[] | null) ?? []
    if (!unlocked.includes(hatId)) return { error: 'Hat not unlocked' }
  }
  await admin.from('profiles').update({ equipped_hat: hatId }).eq('id', user.id)
  return { ok: true }
}

export async function buyHat(hatId: string): Promise<{ ok: true; doubloons: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const { HAT_MAP } = await import('@/lib/hats')
  const def = HAT_MAP[hatId]
  if (!def) return { error: 'Unknown hat' }
  if (def.crateOnly) return { error: 'This hat is only found in crates' }

  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons, unlocked_hats').eq('id', user.id).single()
  if (!profile) return { error: 'Profile not found' }
  const unlocked = (profile.unlocked_hats as string[] | null) ?? []
  if (unlocked.includes(hatId)) return { error: 'Already owned' }
  if ((profile.doubloons ?? 0) < def.cost) return { error: 'Not enough doubloons' }

  const newDoubloons = (profile.doubloons ?? 0) - def.cost
  await admin.from('profiles').update({
    doubloons: newDoubloons,
    unlocked_hats: [...unlocked, hatId],
    equipped_hat: hatId,
  }).eq('id', user.id)
  await admin.from('doubloon_transactions').insert({
    user_id: user.id,
    amount: -def.cost,
    reason: `Bought ${def.name} bandana`,
  })
  return { ok: true, doubloons: newDoubloons }
}

