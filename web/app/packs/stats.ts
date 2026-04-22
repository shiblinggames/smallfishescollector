'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { BorderStyle, ArtEffect } from '@/lib/types'

export interface PackStats {
  totalPacksOpened: number
  packsSinceLegendary: number
  rarestPull: { name: string; variantName: string; dropWeight: number } | null
  completionPct: number
}

export interface HistoryCard {
  name: string
  filename: string
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
}

export interface PackHistoryEntry {
  id: number
  openedAt: string
  wasGodPack: boolean
  cards: HistoryCard[]
}

export async function getPackStats(): Promise<PackStats | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminClient()

  const [
    { count: totalPacksOpened },
    { data: profile },
    { data: rarestRow },
    { count: totalVariants },
    { count: ownedVariants },
  ] = await Promise.all([
    admin.from('pack_history').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('profiles').select('packs_since_legendary').eq('id', user.id).single(),
    admin
      .from('user_collection')
      .select('card_variants(variant_name, drop_weight, cards(name))')
      .eq('user_id', user.id)
      .order('card_variants(drop_weight)', { ascending: true })
      .limit(1)
      .single(),
    admin.from('card_variants').select('*', { count: 'exact', head: true }),
    admin.from('user_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
  ])

  const rv = rarestRow?.card_variants as unknown as { variant_name: string; drop_weight: number; cards: { name: string } } | null

  return {
    totalPacksOpened: totalPacksOpened ?? 0,
    packsSinceLegendary: profile?.packs_since_legendary ?? 0,
    rarestPull: rv ? { name: rv.cards.name, variantName: rv.variant_name, dropWeight: rv.drop_weight } : null,
    completionPct: totalVariants ? Math.round(((ownedVariants ?? 0) / totalVariants) * 100) : 0,
  }
}

export async function getPackHistory(): Promise<PackHistoryEntry[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('pack_history')
    .select('id, opened_at, was_god_pack, cards')
    .eq('user_id', user.id)
    .order('opened_at', { ascending: false })
    .limit(10)

  return (data ?? []).map((row) => ({
    id: row.id,
    openedAt: row.opened_at,
    wasGodPack: row.was_god_pack,
    cards: row.cards as HistoryCard[],
  }))
}
