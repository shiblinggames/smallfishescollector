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
}

export default async function CollectionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: allCards }, { data: owned }, { data: profile }, { count: totalVariants }, { data: allVariants }] = await Promise.all([
    supabase.from('cards').select('*').order('tier').order('name'),
    supabase
      .from('user_collection')
      .select('card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, card_id)')
      .eq('user_id', user.id),
    supabase.from('profiles').select('packs_available').eq('id', user.id).single(),
    supabase.from('card_variants').select('*', { count: 'exact', head: true }),
    supabase.from('card_variants').select('card_id'),
  ])

  const totalVariantsByCardId: Record<number, number> = {}
  for (const v of allVariants ?? []) {
    totalVariantsByCardId[v.card_id] = (totalVariantsByCardId[v.card_id] ?? 0) + 1
  }

  // Build map: card_id → OwnedEntry[] (one entry per unique variant, with count for dupes)
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
    } else {
      ownedByCardId[v.card_id].push({
        variantId:   v.id,
        variantName: v.variant_name,
        borderStyle: v.border_style as BorderStyle,
        artEffect:   v.art_effect as ArtEffect,
        dropWeight:  v.drop_weight,
        count:       1,
      })
    }
  }

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} />
      <main className="min-h-screen px-6 py-14">
        <p className="sg-eyebrow text-center mb-3">Your Cards</p>
        <h1 className="font-cinzel font-700 text-[#f0ede8] text-center leading-[0.92] tracking-[-0.01em] mb-12"
            style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)' }}>
          Collection.
        </h1>
        <CollectionGrid
          allCards={(allCards ?? []) as Card[]}
          ownedByCardId={ownedByCardId}
          totalVariants={totalVariants ?? 0}
          totalVariantsByCardId={totalVariantsByCardId}
        />
      </main>
    </>
  )
}
