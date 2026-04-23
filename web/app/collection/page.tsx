import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CollectionGrid from './CollectionGrid'
import type { Card, BorderStyle, ArtEffect } from '@/lib/types'


export interface OwnedEntry {
  variantId: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
  count: number
  rowIds: number[]
}

export interface AllVariantEntry {
  id: number
  variantName: string
  borderStyle: BorderStyle
  artEffect: ArtEffect
  dropWeight: number
}

export default async function CollectionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: allCards }, { data: owned }, { data: profile }, { count: totalVariants }, { data: allVariantsRaw }] = await Promise.all([
    supabase.from('cards').select('*').order('tier').order('name'),
    supabase
      .from('user_collection')
      .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, card_id)')
      .eq('user_id', user.id),
    supabase.from('profiles').select('packs_available, doubloons, username, username_changed, showcase_variant_ids, is_premium, premium_expires_at').eq('id', user.id).single(),
    supabase.from('card_variants').select('*', { count: 'exact', head: true }),
    supabase.from('card_variants').select('id, variant_name, border_style, art_effect, drop_weight, card_id'),
  ])

  const totalVariantsByCardId: Record<number, number> = {}
  const allVariantsByCardId: Record<number, AllVariantEntry[]> = {}
  for (const v of allVariantsRaw ?? []) {
    totalVariantsByCardId[v.card_id] = (totalVariantsByCardId[v.card_id] ?? 0) + 1
    if (!allVariantsByCardId[v.card_id]) allVariantsByCardId[v.card_id] = []
    allVariantsByCardId[v.card_id].push({
      id:          v.id,
      variantName: v.variant_name,
      borderStyle: v.border_style as BorderStyle,
      artEffect:   v.art_effect as ArtEffect,
      dropWeight:  v.drop_weight,
    })
  }

  // Build map: card_id → OwnedEntry[] (one entry per unique variant, with count + rowIds for dupes)
  const ownedByCardId: Record<number, OwnedEntry[]> = {}

  for (const row of owned ?? []) {
    const v = (row.card_variants as unknown) as {
      id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; card_id: number
    } | null
    if (!v) continue

    if (!ownedByCardId[v.card_id]) ownedByCardId[v.card_id] = []
    const existing = ownedByCardId[v.card_id].find((e) => e.variantId === v.id)
    if (existing) {
      existing.count++
      existing.rowIds.push(row.id)
    } else {
      ownedByCardId[v.card_id].push({
        variantId:   v.id,
        variantName: v.variant_name,
        borderStyle: v.border_style as BorderStyle,
        artEffect:   v.art_effect as ArtEffect,
        dropWeight:  v.drop_weight,
        count:       1,
        rowIds:      [row.id],
      })
    }
  }

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pt-6">
        <CollectionGrid
          allCards={(allCards ?? []) as Card[]}
          ownedByCardId={ownedByCardId}
          totalVariants={totalVariants ?? 0}
          totalVariantsByCardId={totalVariantsByCardId}
          allVariantsByCardId={allVariantsByCardId}
          doubloons={profile?.doubloons ?? 0}
          username={profile?.username ?? ''}
          usernameChanged={profile?.username_changed ?? false}
          showcaseVariantIds={(profile?.showcase_variant_ids as number[] | null) ?? []}
          isPremium={
            !!profile?.is_premium &&
            !!profile?.premium_expires_at &&
            new Date(profile.premium_expires_at) > new Date()
          }
        />
      </main>
    </>
  )
}
