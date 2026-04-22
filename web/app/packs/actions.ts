'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { drawPack, drawGodPack } from '@/lib/drawPack'
import type { CardVariant, DrawnCard } from '@/lib/types'

export interface OpenPackResponse {
  drawn?: DrawnCard[]
  newVariantIds?: number[]
  packsRemaining?: number
  isGodPack?: boolean
  packsSinceLegendary?: number
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
    .select('packs_available, packs_since_legendary')
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
  const isGodPack = Math.random() < 1 / 1000
  const forceLegendary = (profile.packs_since_legendary ?? 0) >= 50
  const drawn = isGodPack ? drawGodPack(variants) : drawPack(variants, forceLegendary)

  // Check what the user already owns
  const { data: existing } = await admin
    .from('user_collection')
    .select('card_variant_id')
    .eq('user_id', user.id)

  const ownedIds = new Set((existing ?? []).map((r) => r.card_variant_id))
  const newCards = drawn.filter((d) => !ownedIds.has(d.variantId))

  if (newCards.length > 0) {
    await admin.from('user_collection').insert(
      newCards.map((d) => ({ user_id: user.id, card_variant_id: d.variantId }))
    )
  }

  // Update pity counter — reset if a Legendary/Mythic dropped, else increment
  const hitLegendary = drawn.some((d) => d.dropWeight < 1)
  await admin
    .from('profiles')
    .update({ packs_since_legendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1 })
    .eq('id', user.id)

  // Record pack history
  await admin.from('pack_history').insert({
    user_id: user.id,
    cards: drawn,
    was_god_pack: isGodPack,
  })

  return {
    drawn,
    newVariantIds: newCards.map((d) => d.variantId),
    packsRemaining: decremented.packs_available,
    isGodPack,
    packsSinceLegendary: hitLegendary ? 0 : (profile.packs_since_legendary ?? 0) + 1,
  }
}
