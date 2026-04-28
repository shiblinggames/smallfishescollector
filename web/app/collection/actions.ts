'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rarityFromVariant } from '@/lib/variants'
import { revalidatePath } from 'next/cache'

export const GEM_VALUES: Record<string, number> = {
  Common:    1,
  Rare:      5,
  Epic:      10,
  Legendary: 25,
  Mythic:    50,
}

export async function sellDuplicate(rowId: number, variantName: string, dropWeight: number) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

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

  const rarity = rarityFromVariant(variantName, dropWeight)
  const gemValue = GEM_VALUES[rarity] ?? 1

  const { data: profile } = await admin.from('profiles').select('gems').eq('id', user.id).single()
  const newGems = (profile?.gems ?? 0) + gemValue

  await Promise.all([
    admin.from('user_collection').delete().eq('id', rowId),
    admin.from('profiles').update({ gems: newGems }).eq('id', user.id),
  ])

  revalidatePath('/collection')
  return { sold: 1, gems: newGems }
}

export interface DuplicateBreakdownItem {
  variantName: string
  borderStyle: string
  artEffect: string
  dropWeight: number
  cardName: string
  filename: string
  extraCopies: number
  gemValue: number
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

  const grouped: Record<number, { rowIds: number[]; meta: DuplicateBreakdownItem }> = {}
  for (const row of rows ?? []) {
    const v = row.card_variants as unknown as {
      variant_name: string; border_style: string; art_effect: string; drop_weight: number
      cards: { name: string; filename: string }
    } | null
    if (!v) continue
    if (!grouped[row.card_variant_id]) {
      const rarity = rarityFromVariant(v.variant_name, v.drop_weight)
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
          gemValue:    GEM_VALUES[rarity] ?? 1,
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
    items.push({ ...meta, extraCopies: extras, rowIds: rowIds.slice(1) })
    total += extras
  }

  items.sort((a, b) => b.dropWeight - a.dropWeight)

  return { items, total }
}

export async function sellAllDuplicates(): Promise<{ sold: number; gems: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const breakdown = await getDuplicatesBreakdown()
  if ('error' in breakdown) return breakdown
  if (breakdown.items.length === 0) return { sold: 0, gems: 0 }

  const admin = createAdminClient()
  const allRowIds = breakdown.items.flatMap((i) => i.rowIds)
  const totalSold = breakdown.items.reduce((sum, i) => sum + i.extraCopies, 0)
  const totalGems = breakdown.items.reduce((sum, i) => sum + i.extraCopies * i.gemValue, 0)

  const { data: profile } = await admin.from('profiles').select('gems').eq('id', user.id).single()
  const newGems = (profile?.gems ?? 0) + totalGems

  await Promise.all([
    admin.from('user_collection').delete().in('id', allRowIds),
    admin.from('profiles').update({ gems: newGems }).eq('id', user.id),
  ])

  revalidatePath('/collection')
  return { sold: totalSold, gems: newGems }
}
