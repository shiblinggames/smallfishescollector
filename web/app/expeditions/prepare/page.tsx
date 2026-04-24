import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { createAdminClient } from '@/lib/supabase/admin'
import { ZONES, EXPEDITION_SHIP_STATS, RARITY_COLORS, getCrewPower, type ZoneKey } from '@/lib/expeditions'
import { RARITY_TIERS } from '@/lib/variants'
import PreparePage from './PreparePage'

export default async function ExpeditionsPreparePage({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string }>
}) {
  const { zone: zoneParam } = await searchParams
  const zone = zoneParam as ZoneKey | undefined

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!zone || !ZONES[zone]) redirect('/expeditions')

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: profile }, { data: existingRun }] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, ship_tier').eq('id', user.id).single(),
    admin.from('expeditions')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('zone', zone)
      .eq('expedition_date', today)
      .maybeSingle(),
  ])

  // Already attempted — redirect appropriately
  if (existingRun) {
    if (existingRun.status === 'active') redirect(`/expeditions/voyage?id=${existingRun.id}`)
    redirect('/expeditions')
  }

  const shipTier = profile?.ship_tier ?? 0
  const zoneConfig = ZONES[zone]

  if (shipTier < zoneConfig.requiredShipTier) redirect('/expeditions')

  // Fetch collection for crew picker
  const { data: collectionRows } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, drop_weight, cards(id, name, slug, filename, tier, zone))')
    .eq('user_id', user.id)

  const seen = new Set<number>()
  const collection: Array<{
    collectionId: number; cardId: number; variantId: number
    name: string; slug: string; filename: string
    fishTier: 1 | 2 | 3; rarity: string; power: number
  }> = []

  type PrepRow = {
    id: number; card_variant_id: number
    card_variants: { id: number; variant_name: string; drop_weight: number; cards: { id: number; name: string; slug: string; filename: string; tier: number; zone: string } }
  }
  for (const row of ((collectionRows as unknown as PrepRow[]) ?? [])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)
    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t => t.variants.includes(v.variant_name))?.name ?? 'Common'
    collection.push({
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      fishTier: card.tier as 1 | 2 | 3,
      rarity,
      power: getCrewPower(rarity, card.tier),
    })
  }

  collection.sort((a, b) => b.power - a.power)

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <PreparePage
        zone={zone}
        zoneConfig={zoneConfig}
        shipStats={EXPEDITION_SHIP_STATS[shipTier]}
        shipTier={shipTier}
        doubloons={profile?.doubloons ?? 0}
        collection={collection}
        rarityColors={RARITY_COLORS}
      />
    </>
  )
}
