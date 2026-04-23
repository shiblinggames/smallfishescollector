'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drawPack, drawGodPack } from '@/lib/drawPack'
import { rarityFromVariant } from '@/lib/variants'
import { revalidatePath } from 'next/cache'
import type { CardVariant, DrawnCard } from '@/lib/types'

const PACK_COSTS: Record<number, number> = { 1: 200, 10: 1500 }

export async function buyPacksWithDoubloons(count: 1 | 10): Promise<{ packsAvailable: number; doubloons: number } | { error: string }> {
  const cost = PACK_COSTS[count]
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, packs_available')
    .eq('id', user.id)
    .single()

  if (!profile || profile.doubloons < cost) return { error: 'Not enough doubloons' }

  const newDoubloons = profile.doubloons - cost
  const newPacks = profile.packs_available + count

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, packs_available: newPacks }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -cost, reason: `Bought ${count} pack${count > 1 ? 's' : ''} with doubloons` }),
  ])

  revalidatePath('/packs')
  return { packsAvailable: newPacks, doubloons: newDoubloons }
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

export interface OpenPackResponse {
  drawn?: DrawnCard[]
  newVariantIds?: number[]
  packsRemaining?: number
  isGodPack?: boolean
  packsSinceLegendary?: number
  rankUp?: { rank: string; bonus: number }
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
    .select('id, card_id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier)')

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

  // Update tide counter + rank + doubloons
  const hitLegendary = drawn.some((d) => ['Legendary', 'Mythic'].includes(rarityFromVariant(d.variantName, d.dropWeight)))
  const profileUpdates: Record<string, unknown> = {
    packs_since_legendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1,
  }
  if (rankUp) {
    profileUpdates.highest_rank_claimed = newRankIndex
    profileUpdates.doubloons = (profile.doubloons ?? 0) + rankUp.bonus
  }

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
  await Promise.all(writes)

  return {
    drawn,
    newVariantIds: newCards.map((d) => d.variantId),
    packsRemaining: decremented.packs_available,
    isGodPack,
    packsSinceLegendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1,
    rankUp: rankUp ? { rank: rankUp.name, bonus: rankUp.bonus } : undefined,
  }
}
