'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drawPack, drawGodPack } from '@/lib/drawPack'
import { rarityFromVariant } from '@/lib/variants'
import { revalidatePath } from 'next/cache'
import type { CardVariant, DrawnCard } from '@/lib/types'
import { checkAchievements } from '@/lib/checkAchievements'
import { getWeekStart } from '@/lib/weekStart'

const PACK_GEM_COSTS: Record<number, number> = { 1: 100, 10: 900 }

export async function buyPacksWithGems(count: 1 | 10): Promise<{ packsAvailable: number; gems: number } | { error: string }> {
  const cost = PACK_GEM_COSTS[count]
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('gems, packs_available')
    .eq('id', user.id)
    .single()

  if (!profile || (profile.gems ?? 0) < cost) return { error: 'Not enough gems' }

  const newGems = (profile.gems ?? 0) - cost
  const newPacks = profile.packs_available + count

  await Promise.all([
    admin.from('profiles').update({ gems: newGems, packs_available: newPacks }).eq('id', user.id),
    admin.from('gem_transactions').insert({ user_id: user.id, amount: -cost, reason: `Bought ${count} pack${count > 1 ? 's' : ''} with gems` }),
  ])

  revalidatePath('/packs')
  return { packsAvailable: newPacks, gems: newGems }
}

const RANK_THRESHOLDS = [
  { name: 'Crewmate',      min: 0,   bonus: 0     },
  { name: 'Officer',       min: 25,  bonus: 200   },
  { name: 'Second Mate',   min: 75,  bonus: 500   },
  { name: 'Quartermaster', min: 150, bonus: 1500  },
  { name: 'Captain',       min: 250, bonus: 5000  },
]

function getRankIndex(uniqueVariants: number): number {
  for (let i = RANK_THRESHOLDS.length - 1; i >= 0; i--) {
    if (uniqueVariants >= RANK_THRESHOLDS[i].min) return i
  }
  return 0
}

export interface BountyCompletion {
  tier: string
  fishName: string
  reward: number
  packAwarded: boolean
}

export interface OpenPackResponse {
  drawn?: DrawnCard[]
  newVariantIds?: number[]
  packsRemaining?: number
  isGodPack?: boolean
  packsSinceLegendary?: number
  rankUp?: { rank: string; bonus: number }
  newAchievements?: string[]
  bountyCompletions?: BountyCompletion[]
  error?: string
}

export async function openPack(): Promise<OpenPackResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  // Read current pack count
  const { data: profile } = await admin
    .from('profiles')
    .select('packs_available, packs_since_legendary, doubloons, highest_rank_claimed')
    .eq('id', user.id)
    .single()

  if (!profile || profile.packs_available <= 0) return { error: 'No packs available' }

  // Atomically decrement — optimistic lock ensures no double-spend
  const { data: decremented } = await admin
    .from('profiles')
    .update({ packs_available: profile.packs_available - 1 })
    .eq('id', user.id)
    .eq('packs_available', profile.packs_available)
    .select('packs_available')
    .single()

  if (!decremented) return { error: 'No packs available' }

  // Fetch variants server-side
  const { data: variantRows } = await admin
    .from('card_variants')
    .select('id, card_id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, zone)')

  const variants = (variantRows ?? []) as unknown as CardVariant[]
  const isGodPack = Math.random() < 0.001
  const forceLegendary = (profile.packs_since_legendary ?? 0) >= 20
  const drawn = isGodPack ? drawGodPack(variants) : drawPack(variants, forceLegendary)

  // Check what the user already owns (for new badge)
  const { data: existing } = await admin
    .from('user_collection')
    .select('card_variant_id')
    .eq('user_id', user.id)

  const ownedIds = new Set((existing ?? []).map((r) => r.card_variant_id))
  const newCards = drawn.filter((d) => !ownedIds.has(d.variantId))

  // Always insert all drawn cards — dupes accumulate as extra rows
  await admin.from('user_collection').insert(
    drawn.map((d) => ({ user_id: user.id, card_variant_id: d.variantId }))
  )

  // Check for rank-up
  const newUniqueCount = ownedIds.size + newCards.length
  const oldRankIndex = profile.highest_rank_claimed ?? 0
  const newRankIndex = getRankIndex(newUniqueCount)
  const rankUp = newRankIndex > oldRankIndex ? RANK_THRESHOLDS[newRankIndex] : null

  // Check weekly bounties
  const weekStart = getWeekStart()
  const [{ data: bountyRow }, { data: existingProgress }] = await Promise.all([
    admin.from('weekly_bounties')
      .select('shallows_card_id, open_waters_card_id, deep_card_id, abyss_card_id')
      .eq('week_start', weekStart)
      .maybeSingle(),
    admin.from('weekly_bounty_progress')
      .select('shallows_completed, open_waters_completed, deep_completed, abyss_completed')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ])

  const bountyCompletions: BountyCompletion[] = []
  const bountyProgressUpdate: Record<string, unknown> = {}
  let bountyDoubloons = 0
  let bountyPackGain = 0

  if (bountyRow) {
    const drawnCardIds = new Set(drawn.map((d) => d.cardId))
    const completedMap = {
      shallows:    existingProgress?.shallows_completed    ?? false,
      open_waters: existingProgress?.open_waters_completed ?? false,
      deep:        existingProgress?.deep_completed        ?? false,
      abyss:       existingProgress?.abyss_completed       ?? false,
    }
    const BOUNTY_CHECKS = [
      { tier: 'shallows',    field: 'shallows'    as const, cardId: bountyRow.shallows_card_id,    reward: 50,  packAwarded: false },
      { tier: 'open_waters', field: 'open_waters' as const, cardId: bountyRow.open_waters_card_id, reward: 150, packAwarded: false },
      { tier: 'deep',        field: 'deep'        as const, cardId: bountyRow.deep_card_id,         reward: 300, packAwarded: false },
      { tier: 'abyss',       field: 'abyss'       as const, cardId: bountyRow.abyss_card_id,        reward: 500, packAwarded: true  },
    ]

    for (const check of BOUNTY_CHECKS) {
      if (!completedMap[check.field] && drawnCardIds.has(check.cardId)) {
        const matchingCard = drawn.find((d) => d.cardId === check.cardId)
        bountyCompletions.push({ tier: check.tier, fishName: matchingCard?.name ?? '', reward: check.reward, packAwarded: check.packAwarded })
        bountyProgressUpdate[`${check.field}_completed`] = true
        bountyProgressUpdate[`${check.field}_claimed_at`] = new Date().toISOString()
        bountyDoubloons += check.reward
        if (check.packAwarded) bountyPackGain++
      }
    }
  }

  // Update tide counter + rank + doubloons
  const hitLegendary = drawn.some((d) => ['Legendary', 'Mythic', 'Divine'].includes(rarityFromVariant(d.variantName, d.dropWeight)))
  const totalDoubloonGain = (rankUp?.bonus ?? 0) + bountyDoubloons
  const profileUpdates: Record<string, unknown> = {
    packs_since_legendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1,
  }
  if (rankUp) profileUpdates.highest_rank_claimed = newRankIndex
  if (totalDoubloonGain > 0) profileUpdates.doubloons = (profile.doubloons ?? 0) + totalDoubloonGain
  if (bountyPackGain > 0) profileUpdates.packs_available = decremented.packs_available + bountyPackGain

  const writes: any[] = [
    admin.from('profiles').update(profileUpdates).eq('id', user.id),
    admin.from('pack_history').insert({ user_id: user.id, cards: drawn, was_god_pack: isGodPack }),
  ]
  if (rankUp && rankUp.bonus > 0) {
    writes.push(admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: rankUp.bonus,
      reason: `Rank up: ${rankUp.name}`,
    }))
  }
  if (Object.keys(bountyProgressUpdate).length > 0) {
    const TIER_LABELS: Record<string, string> = { shallows: 'Shallows', open_waters: 'Open Waters', deep: 'Deep', abyss: 'Abyss' }
    writes.push(
      admin.from('weekly_bounty_progress').upsert(
        { user_id: user.id, week_start: weekStart, ...bountyProgressUpdate },
        { onConflict: 'user_id,week_start' }
      )
    )
    for (const c of bountyCompletions) {
      writes.push(admin.from('doubloon_transactions').insert({
        user_id: user.id,
        amount: c.reward,
        reason: `Weekly bounty (${TIER_LABELS[c.tier]}): ${c.fishName}`,
      }))
    }
  }
  await Promise.all(writes)

  const newAchievements = await checkAchievements(user.id, { type: 'pack', drawn })

  return {
    drawn,
    newVariantIds: newCards.map((d) => d.variantId),
    packsRemaining: decremented.packs_available + bountyPackGain,
    isGodPack,
    packsSinceLegendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1,
    rankUp: rankUp ? { rank: rankUp.name, bonus: rankUp.bonus } : undefined,
    newAchievements,
    bountyCompletions: bountyCompletions.length > 0 ? bountyCompletions : undefined,
  }
}
