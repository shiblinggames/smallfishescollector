'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { RARITY_TIERS } from '@/lib/variants'
import { applyVariantBoosts, raidItemSlotsForTier } from '@/lib/expeditions'
import { DAVY_FORGE } from '@/lib/raidItems'

// ── Crew picker ───────────────────────────────────────────────────────────────

export async function getCollectionForCrew(): Promise<Array<{
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  borderStyle: string
  artEffect: string
  variantName: string
  dropWeight: number
  rarity: string
  power: number
  dodge: number
  fortune: number
}>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune))')
    .eq('user_id', user.id)

  if (!data) return []

  const seen = new Set<number>()
  type Row = {
    id: number; card_variant_id: number
    card_variants: { id: number; variant_name: string; border_style: string; art_effect: string; drop_weight: number; cards: { id: number; name: string; slug: string; filename: string; tier: number; power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number } }
  }

  const result = []
  for (const row of (data as unknown as Row[])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)
    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t => t.variants.includes(v.variant_name))?.name ?? 'Common'
    const base = { power: card.power, dodge: card.dodge, fortune: card.fortune }
    const mythic = { power: card.mythic_power, dodge: card.mythic_dodge, fortune: card.mythic_fortune }
    const stats = applyVariantBoosts(base, v.variant_name, mythic)
    result.push({
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      borderStyle: v.border_style,
      artEffect: v.art_effect,
      variantName: v.variant_name,
      dropWeight: v.drop_weight,
      rarity,
      power: stats.power,
      dodge: stats.dodge,
      fortune: stats.fortune,
    })
  }

  result.sort((a, b) => (b.power + b.dodge + b.fortune) - (a.power + a.dodge + a.fortune))
  return result
}

// ── Crew loadout persistence ──────────────────────────────────────────────────

export async function saveCrew(variantIds: number[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()

  // Resolve each variant to its card name so we can dedup by name. Two
  // variants of the same character (e.g. standard + foil) must never both
  // sit in the crew loadout — they're the same person.
  const unique = Array.from(new Set(variantIds))
  const { data: variants } = await admin
    .from('card_variants')
    .select('id, cards(name)')
    .in('id', unique)
  type VRow = { id: number; cards: { name: string } | null }
  const nameByVariant = new Map<number, string>()
  for (const row of ((variants ?? []) as unknown as VRow[])) {
    if (row.cards?.name) nameByVariant.set(row.id, row.cards.name)
  }

  const seenNames = new Set<string>()
  const cleaned: number[] = []
  for (const vid of variantIds) {
    const name = nameByVariant.get(vid)
    if (!name || seenNames.has(name)) continue
    seenNames.add(name)
    cleaned.push(vid)
  }

  await admin.from('profiles').update({ saved_crew: cleaned }).eq('id', user.id)
}

// ── Raid item / ship skin equip ───────────────────────────────────────────────

export async function saveEquippedRaidItems(itemIds: string[]): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  // Pull ship_tier so the slot cap scales with hull size (see
  // raidItemSlotsForTier in lib/expeditions). A Rowboat captain gets 1
  // slot; a Man-o-War captain gets 4.
  const { data: profile } = await admin.from('profiles').select('raid_items, ship_tier').eq('id', user.id).single()
  const owned = (profile?.raid_items as string[] | null) ?? []
  const slots = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0)
  const valid = itemIds.filter(id => owned.includes(id)).slice(0, slots)
  await admin.from('profiles').update({ equipped_raid_items: valid }).eq('id', user.id)
}

/** Forge Davy's Grand Cannon by sacrificing the Heavy + Hand cannons. Mirrors
 *  the completionist-rod forge: consumes both components and mints the combined
 *  item. Server-validated so a tampered client can't forge without both. */
export async function forgeGrandCannon(): Promise<{ ok: true; raidItems: string[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('raid_items, equipped_raid_items')
    .eq('id', user.id)
    .single()
  const owned = (profile?.raid_items as string[] | null) ?? []
  const [a, b] = DAVY_FORGE.components
  if (owned.includes(DAVY_FORGE.result)) return { error: 'Already forged.' }
  if (!owned.includes(a) || !owned.includes(b)) return { error: 'You need both Davy cannons to forge.' }

  // Sacrifice the two components, mint the Grand Cannon, and drop the consumed
  // components from the equipped loadout (they no longer exist).
  const newOwned = [...owned.filter(id => id !== a && id !== b), DAVY_FORGE.result]
  const equipped = ((profile?.equipped_raid_items as string[] | null) ?? []).filter(id => id !== a && id !== b)
  await admin.from('profiles').update({ raid_items: newOwned, equipped_raid_items: equipped }).eq('id', user.id)
  return { ok: true, raidItems: newOwned }
}

export async function equipShipSkin(skinId: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  if (skinId !== null) {
    const { data: profile } = await admin.from('profiles').select('ship_skins').eq('id', user.id).single()
    const owned = (profile?.ship_skins as string[] | null) ?? []
    if (!owned.includes(skinId)) return
  }
  await admin.from('profiles').update({ equipped_ship_skin: skinId }).eq('id', user.id)
}
