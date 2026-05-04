'use server'

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS, applyVariantBoosts } from '@/lib/expeditions'
import { RARITY_TIERS } from '@/lib/variants'
import { generateVoyageEvents, type VoyageEvent, type VoyageRoute } from '@/lib/voyageEvents'
import { generateAndSaveVoyageLog, type VoyageCrewMember } from '@/lib/captains-log'
import type { CrewCard } from '@/lib/expeditions'

function today(): string {
  return new Date().toISOString().split('T')[0]
}

const VOYAGE_DURATION_MS = 6 * 60 * 60 * 1000 // 6 hours

export interface DailyVoyage {
  id: number
  voyage_date: string
  crew_variant_ids: number[]
  ship_tier: number
  route: VoyageRoute
  status: 'pending' | 'revealed'
  events: VoyageEvent[]
  total_doubloons: number
  total_gems: number
  crew_lost: number[]
  created_at: string
  captains_log: string | null
  log_generated_at: string | null
}

export async function getDailyVoyageState(): Promise<{
  todayVoyage: DailyVoyage | null
  readyVoyage: DailyVoyage | null
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const rows = (data ?? []) as DailyVoyage[]
  const now = Date.now()
  const pending = rows.filter(r => r.status === 'pending')

  const activeVoyage = pending.find(r => new Date(r.created_at).getTime() + VOYAGE_DURATION_MS > now) ?? null
  const readyVoyage  = pending.find(r => new Date(r.created_at).getTime() + VOYAGE_DURATION_MS <= now) ?? null

  return { todayVoyage: activeVoyage, readyVoyage }
}

type CollectionRow = {
  id: number
  card_variant_id: number
  card_variants: {
    id: number
    variant_name: string
    border_style: string
    art_effect: string
    drop_weight: number
    cards: {
      id: number; name: string; slug: string; filename: string; tier: number
      power: number; dodge: number; fortune: number
      mythic_power: number; mythic_dodge: number; mythic_fortune: number
    }
  }
}

export async function sendDailyVoyage(crewVariantIds: number[], route: VoyageRoute = 'open'): Promise<
  { ok: true; voyage: DailyVoyage } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  if (crewVariantIds.length < 2) return { error: 'A voyage requires at least two crew members' }

  const admin = createAdminClient()

  // Block if a voyage is already pending (at sea or ready to reveal)
  const { data: existing } = await admin
    .from('daily_voyages')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) return { error: 'Your crew is already at sea' }

  // Block if a raid is in progress
  const { data: activeRaid } = await admin
    .from('expeditions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (activeRaid) return { error: 'Finish your raid before sending a voyage' }

  // Load profile for ship tier
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }
  if ((profile.ship_tier ?? 0) < 2) return { error: 'Requires a Sloop or better to send a voyage' }

  const shipTier = profile.ship_tier ?? 0
  const shipStats = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  if (crewVariantIds.length > shipStats.crewSlots) {
    return { error: `Your ship can hold at most ${shipStats.crewSlots} crew` }
  }

  // Resolve variantIds to CrewCards
  const { data: collectionRows } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune))')
    .eq('user_id', user.id)
    .in('card_variant_id', crewVariantIds)

  const seen = new Set<number>()
  const crewByVariantId = new Map<number, CrewCard>()

  for (const row of ((collectionRows ?? []) as unknown as CollectionRow[])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)
    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t => t.variants.includes(v.variant_name))?.name ?? 'Common'
    const base = { power: card.power, dodge: card.dodge, fortune: card.fortune }
    const mythic = { power: card.mythic_power, dodge: card.mythic_dodge, fortune: card.mythic_fortune }
    const stats = applyVariantBoosts(base, v.variant_name, mythic)
    crewByVariantId.set(v.id, {
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      rarity,
      power: stats.power,
      dodge: stats.dodge,
      fortune: stats.fortune,
    })
  }

  // Build crew array in the order provided (captain = first)
  const crew: CrewCard[] = crewVariantIds
    .map(id => crewByVariantId.get(id))
    .filter(Boolean) as CrewCard[]

  if (crew.length === 0) return { error: 'Could not find crew in your collection' }

  const result = generateVoyageEvents(crew, shipTier, route)

  const { data: voyage, error } = await admin
    .from('daily_voyages')
    .insert({
      user_id: user.id,
      voyage_date: today(),
      crew_variant_ids: crewVariantIds,
      ship_tier: shipTier,
      route,
      status: 'pending',
      events: result.events,
      total_doubloons: result.totalDoubloons,
      total_gems: result.totalGems,
      crew_lost: result.crewLost,
    })
    .select('*')
    .single()

  if (error || !voyage) return { error: 'Failed to send voyage' }
  return { ok: true, voyage: voyage as DailyVoyage }
}

export async function revealVoyageResults(voyageId: number): Promise<
  { ok: true; earnedDoubloons: number; newDoubloonTotal: number; earnedGems: number; newGemTotal: number; crewLost: number[]; newRingSkins: string[]; earnedBait: { type: string; qty: number }[] } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()

  const { data: voyageRow } = await admin
    .from('daily_voyages')
    .select('*')
    .eq('id', voyageId)
    .eq('user_id', user.id)
    .single()

  if (!voyageRow) return { error: 'Voyage not found' }
  if (voyageRow.status === 'revealed') return { error: 'Already revealed' }
  const sentAt = new Date(voyageRow.created_at as string).getTime()
  if (Date.now() < sentAt + VOYAGE_DURATION_MS) return { error: 'Your crew has not returned yet' }

  const voyage = voyageRow as DailyVoyage

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, saved_crew, unlocked_ring_skins')
    .eq('id', user.id)
    .single()

  if (!profile) return { error: 'Profile not found' }

  const newDoubloons = (profile.doubloons ?? 0) + voyage.total_doubloons
  const newGems = (profile.gems ?? 0) + voyage.total_gems
  const currentSavedCrew = (profile.saved_crew as number[] | null) ?? []
  const newSavedCrew = currentSavedCrew.filter(id => !voyage.crew_lost.includes(id))

  // Collect ring skin drops, filter out already-owned
  const allDropped = voyage.events
    .map((e: { ringSkinDrop?: string | null }) => e.ringSkinDrop)
    .filter((s): s is string => !!s)
  const currentSkins = (profile.unlocked_ring_skins as string[] | null) ?? []
  const newRingSkins = allDropped.filter(s => !currentSkins.includes(s))
  const updatedSkins = newRingSkins.length > 0 ? [...new Set([...currentSkins, ...allDropped])] : currentSkins

  // Collect bait drops
  const baitDropMap = new Map<string, number>()
  for (const e of voyage.events as { baitDrop?: string | null }[]) {
    if (e.baitDrop) baitDropMap.set(e.baitDrop, (baitDropMap.get(e.baitDrop) ?? 0) + 1)
  }
  const earnedBait = Array.from(baitDropMap.entries()).map(([type, qty]) => ({ type, qty }))

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons, gems: newGems, saved_crew: newSavedCrew, unlocked_ring_skins: updatedSkins }).eq('id', user.id),
    admin.from('daily_voyages').update({ status: 'revealed' }).eq('id', voyageId),
    ...(voyage.crew_lost.length > 0
      ? [admin.from('user_collection').delete().eq('user_id', user.id).in('card_variant_id', voyage.crew_lost)]
      : []),
    ...(voyage.total_doubloons > 0
      ? [admin.from('doubloon_transactions').insert({ user_id: user.id, amount: voyage.total_doubloons, reason: 'Daily crew voyage' })]
      : []),
    ...earnedBait.map(({ type, qty }) =>
      admin.rpc('upsert_bait', { p_user_id: user.id, p_bait_type: type, p_qty: qty })
    ),
  ])

  // Schedule captain's log generation after response is sent
  const voyageForLog = voyage
  after(async () => {
    const logAdmin = createAdminClient()
    // Resolve crew names + rarities from variant IDs
    const { data: variantRows } = await logAdmin
      .from('card_variants')
      .select('id, variant_name, drop_weight, cards(name)')
      .in('id', voyageForLog.crew_variant_ids)

    const crewMembers: VoyageCrewMember[] = (voyageForLog.crew_variant_ids).map(vid => {
      const row = (variantRows ?? []).find((r: { id: number }) => r.id === vid) as
        { id: number; variant_name: string; drop_weight: number; cards: { name: string } } | undefined
      if (!row) return null
      const rarity = RARITY_TIERS.find(t => t.variants.includes(row.variant_name))?.name ?? 'Common'
      return { variantId: vid, name: row.cards.name, rarity }
    }).filter((c): c is VoyageCrewMember => c !== null)

    const crewLostNames = crewMembers
      .filter(c => voyageForLog.crew_lost.includes(c.variantId))
      .map(c => c.name)

    await generateAndSaveVoyageLog({
      voyageId: voyageForLog.id,
      route: voyageForLog.route,
      crew: crewMembers,
      events: voyageForLog.events,
      totalDoubloons: voyageForLog.total_doubloons,
      totalGems: voyageForLog.total_gems,
      crewLostNames,
    })
  })

  return { ok: true, earnedDoubloons: voyage.total_doubloons, newDoubloonTotal: newDoubloons, earnedGems: voyage.total_gems, newGemTotal: newGems, crewLost: voyage.crew_lost, newRingSkins, earnedBait }
}

export async function fetchVoyageCaptainsLog(voyageId: number): Promise<{ log: string | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data } = await admin
    .from('daily_voyages')
    .select('captains_log')
    .eq('id', voyageId)
    .eq('user_id', user.id)
    .single()

  return { log: (data?.captains_log as string | null) ?? null }
}
