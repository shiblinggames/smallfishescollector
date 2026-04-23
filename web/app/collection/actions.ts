'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { doubloonValueFor, rarityFromVariant } from '@/lib/variants'
import { revalidatePath } from 'next/cache'

export async function sellDuplicate(rowId: number, variantName: string, dropWeight: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  // Verify row belongs to user and is truly a duplicate (user owns >1 of this variant)
  const { data: row } = await admin
    .from('user_collection')
    .select('id, card_variant_id')
    .eq('id', rowId)
    .eq('user_id', user.id)
    .single()
  if (!row) return { error: 'Not found' }

  const { count } = await admin
    .from('user_collection')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('card_variant_id', row.card_variant_id)
  if ((count ?? 0) <= 1) return { error: 'Cannot sell your only copy' }

  const earned = doubloonValueFor(variantName, dropWeight)

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  await Promise.all([
    admin.from('user_collection').delete().eq('id', rowId),
    admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + earned }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: earned, reason: `Sold duplicate: ${variantName}` }),
  ])

  revalidatePath('/collection')
  return { earned }
}

export interface DuplicateBreakdownItem {
  variantName: string
  borderStyle: string
  artEffect: string
  dropWeight: number
  cardName: string
  filename: string
  extraCopies: number
  doubloons: number
  rowIds: number[]
}

export async function getDuplicatesBreakdown(): Promise<{ items: DuplicateBreakdownItem[]; total: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(variant_name, border_style, art_effect, drop_weight, cards(name, filename))')
    .eq('user_id', user.id)

  // Group by variant
  const grouped: Record<number, { rowIds: number[]; meta: DuplicateBreakdownItem }> = {}
  for (const row of rows ?? []) {
    const v = row.card_variants as unknown as {
      variant_name: string; border_style: string; art_effect: string; drop_weight: number
      cards: { name: string; filename: string }
    } | null
    if (!v) continue
    if (!grouped[row.card_variant_id]) {
      grouped[row.card_variant_id] = {
        rowIds: [],
        meta: {
          variantName: v.variant_name,
          borderStyle: v.border_style,
          artEffect:   v.art_effect,
          dropWeight:  v.drop_weight,
          cardName:    v.cards.name,
          filename:    v.cards.filename,
          extraCopies: 0,
          doubloons:   0,
          rowIds:      [],
        },
      }
    }
    grouped[row.card_variant_id].rowIds.push(row.id)
  }

  const items: DuplicateBreakdownItem[] = []
  let total = 0
  for (const { rowIds, meta } of Object.values(grouped)) {
    const extras = rowIds.length - 1
    if (extras <= 0) continue
    const perCard = doubloonValueFor(meta.variantName, meta.dropWeight)
    const earned = extras * perCard
    items.push({ ...meta, extraCopies: extras, doubloons: earned, rowIds: rowIds.slice(1) })
    total += earned
  }

  // Sort by rarity (highest value first)
  items.sort((a, b) => doubloonValueFor(b.variantName, b.dropWeight) - doubloonValueFor(a.variantName, a.dropWeight))

  return { items, total }
}

export async function sellAllDuplicates(): Promise<{ earned: number; sold: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const breakdown = await getDuplicatesBreakdown()
  if ('error' in breakdown) return breakdown
  if (breakdown.items.length === 0) return { earned: 0, sold: 0 }

  const admin = createAdminClient()
  const allRowIds = breakdown.items.flatMap((i) => i.rowIds)
  const totalSold = breakdown.items.reduce((sum, i) => sum + i.extraCopies, 0)

  const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()

  await Promise.all([
    admin.from('user_collection').delete().in('id', allRowIds),
    admin.from('profiles').update({ doubloons: (profile?.doubloons ?? 0) + breakdown.total }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: breakdown.total,
      reason: `Sold ${totalSold} duplicate cards`,
    }),
  ])

  revalidatePath('/collection')
  return { earned: breakdown.total, sold: totalSold }
}
