'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  ZONES, EXPEDITION_SHIP_STATS, HULL_POINTS, BASE_DOUBLOONS,
  rollStat, getCrewPower,
  type ZoneKey, type CrewLoadout, type EventResult, type LootResult,
  type Expedition, type DailyExpeditionRow,
} from '@/lib/expeditions'
import { ensureDailyExpeditionContent } from './generate'
import { RARITY_TIERS } from '@/lib/variants'
import type { CardVariant } from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────────────────────

function weightedPick<T extends { drop_weight: number }>(pool: T[]): T {
  const total = pool.reduce((s, v) => s + v.drop_weight, 0)
  let r = Math.random() * total
  for (const v of pool) {
    r -= v.drop_weight
    if (r <= 0) return v
  }
  return pool[pool.length - 1]
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

// ── Public Actions ─────────────────────────────────────────────────────────────

export async function startExpedition(
  zone: ZoneKey,
  crewLoadout: CrewLoadout
): Promise<{ expeditionId: number } | { error: string }> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    const admin = createAdminClient()
    const date = today()
    const zoneConfig = ZONES[zone]

    const { data: profile } = await admin
      .from('profiles')
      .select('doubloons, ship_tier')
      .eq('id', user.id)
      .single()

    if (!profile) return { error: 'Profile not found' }

    // Zone tier gate
    const shipTier = profile.ship_tier ?? 0
    if (shipTier < zoneConfig.requiredShipTier) {
      return { error: `Requires ${EXPEDITION_SHIP_STATS[zoneConfig.requiredShipTier].name} or better` }
    }

    // Special crew gate (Davy Jones)
    if (zoneConfig.specialCrewRequired) {
      const allCrew = (Object.values(crewLoadout) as CrewLoadout[keyof CrewLoadout][]).flat()
      const crewSlugs = allCrew.map(c => c.slug)
      const hasSpecial = zoneConfig.specialCrewRequired.some(s => crewSlugs.includes(s))
      if (!hasSpecial) {
        return { error: `Requires Catfish or Doby Mick in your crew` }
      }
    }

    // Entry cost check
    if ((profile.doubloons ?? 0) < zoneConfig.entryCost) {
      return { error: `Not enough doubloons (need ${zoneConfig.entryCost} ⟡)` }
    }

    // One attempt per zone per day
    const { data: existing } = await admin
      .from('expeditions')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('zone', zone)
      .eq('expedition_date', date)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'active') return { expeditionId: existing.id }
      return { error: 'Already attempted this zone today' }
    }

    // Ensure daily content exists (generates if needed — first player of the day)
    try {
      await ensureDailyExpeditionContent(zone, date)
    } catch (genErr) {
      console.error('[startExpedition] content generation failed:', genErr)
      const msg = genErr instanceof Error ? genErr.message : String(genErr)
      return { error: `Generation failed: ${msg}` }
    }

    // Deduct entry cost
    const newDoubloons = profile.doubloons - zoneConfig.entryCost
    await Promise.all([
      admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
      admin.from('doubloon_transactions').insert({
        user_id: user.id,
        amount: -zoneConfig.entryCost,
        reason: `Expedition entry: ${zoneConfig.name}`,
      }),
    ])

    const { data: expedition, error } = await admin
      .from('expeditions')
      .insert({
        user_id: user.id,
        zone,
        ship_tier: shipTier,
        crew_loadout: crewLoadout,
        expedition_date: date,
        status: 'active',
        current_node: 0,
      })
      .select('id')
      .single()

    if (error || !expedition) return { error: 'Failed to start expedition' }

    revalidatePath('/expeditions')
    return { expeditionId: expedition.id }
  } catch (err) {
    console.error('[startExpedition] unexpected error:', err)
    return { error: 'Something went wrong — please try again' }
  }
}

export async function resolveChoice(
  expeditionId: number,
  nodeIndex: number,
  choiceIndex: number
): Promise<EventResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const date = today()

  const { data: expedition } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('expedition_date', date)
    .single()

  if (!expedition) return { error: 'Expedition not found' }

  const { data: dailyData } = await admin
    .from('daily_expeditions')
    .select('event_sequence')
    .eq('expedition_date', date)
    .eq('zone', expedition.zone)
    .single()

  if (!dailyData) return { error: 'Daily content not found' }

  const exp = expedition as Expedition
  const eventSequence = (dailyData as { event_sequence: EventNode[] }).event_sequence
  const eventNode = eventSequence[nodeIndex]
  if (!eventNode) return { error: 'Invalid node' }

  const choice = eventNode.choices[choiceIndex]
  if (!choice) return { error: 'Invalid choice' }

  const zoneConfig = ZONES[exp.zone]

  // No-roll path
  if (choice.isNoRoll) {
    const result: EventResult = {
      nodeIndex,
      eventType: eventNode.eventType,
      choiceIndex,
      outcome: 'success',
      text: choice.successText,
      noRoll: true,
    }
    await saveProgress(admin, expeditionId, nodeIndex, result, exp.events)
    return result
  }

  const mechanics = eventNode.mechanics
  const stat = mechanics.stat ?? 'luck'
  const [min, max] = zoneConfig.difficulty[mechanics.difficultyTier]
  const threshold = Math.floor(Math.random() * (max - min + 1)) + min
  const crewForStat = exp.crew_loadout[stat] ?? []
  const rollResult = rollStat(stat, crewForStat, exp.ship_tier)
  const success = rollResult.total >= threshold

  const result: EventResult = {
    nodeIndex,
    eventType: eventNode.eventType,
    choiceIndex,
    stat,
    roll: rollResult.roll,
    base: rollResult.base,
    crewBonus: rollResult.crewBonus,
    crewRoll: rollResult.crewRoll,
    total: rollResult.total,
    threshold,
    outcome: success ? 'success' : 'fail',
    text: success ? choice.successText : choice.failText,
  }

  if (!success) {
    const isHullEvent = ['storm', 'mild_storm', 'sea_monster', 'kraken_attack', 'kraken_warning',
      'ghost_armada', 'abyss_creature', 'void_storm'].includes(eventNode.eventType)
    if (isHullEvent) {
      result.hullDamage = 1
    } else {
      result.lootPenalty = 0.2
    }
  }

  const newHullDamage = (exp.hull_damage ?? 0) + (result.hullDamage ?? 0)
  const hullMax = HULL_POINTS[exp.ship_tier] ?? 3
  if (newHullDamage >= hullMax) {
    result.expeditionFailed = true
    result.failReason = 'Your ship could not take any more damage. You limp back to port.'
    const newEvents = [...(exp.events ?? []), result]
    await admin.from('expeditions').update({
      status: 'failed',
      current_node: nodeIndex + 1,
      events: newEvents,
      hull_damage: newHullDamage,
      completed_at: new Date().toISOString(),
    }).eq('id', expeditionId)
    return result
  }

  await saveProgress(admin, expeditionId, nodeIndex, result, exp.events, newHullDamage)
  return result
}

async function saveProgress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  expeditionId: number,
  nodeIndex: number,
  result: EventResult,
  existingEvents: EventResult[],
  newHullDamage?: number,
) {
  const updatedEvents = [...(existingEvents ?? []), result]
  const update: Record<string, unknown> = {
    current_node: nodeIndex + 1,
    events: updatedEvents,
  }
  if (newHullDamage !== undefined) update.hull_damage = newHullDamage
  await admin.from('expeditions').update(update).eq('id', expeditionId)
}

export async function resolveFinalLoot(
  expeditionId: number
): Promise<LootResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const date = today()

  const { data: expedition } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('expedition_date', date)
    .single()

  if (!expedition) return { error: 'Expedition not found' }
  const exp = expedition as Expedition

  const zoneConfig = ZONES[exp.zone]
  const crewLuck = exp.crew_loadout.luck ?? []
  const rollResult = rollStat('luck', crewLuck, exp.ship_tier)

  const completedEvents = exp.events ?? []
  const successCount = completedEvents.filter((e: EventResult) => e.outcome === 'success').length
  const totalNodes = zoneConfig.length - 1
  const successBonus = Math.floor((successCount / Math.max(totalNodes, 1)) * 20)

  const lootPenaltyMultiplier = completedEvents
    .filter((e: EventResult) => e.lootPenalty)
    .reduce((acc: number, e: EventResult) => acc * (1 - (e.lootPenalty ?? 0)), 1)

  const finalScore = rollResult.total + successBonus

  const dropPool = zoneConfig.drops
  let lootRarity: string
  if (finalScore >= 35) lootRarity = dropPool[dropPool.length - 1]
  else if (finalScore >= 22) lootRarity = dropPool[Math.floor(dropPool.length / 2)]
  else lootRarity = dropPool[0]

  const baseDoubloons = BASE_DOUBLOONS[exp.zone]
  const doubloons = Math.max(10, Math.floor(baseDoubloons * (finalScore / 25) * lootPenaltyMultiplier))

  // Draw a card of the determined rarity
  const { data: variantRows } = await admin
    .from('card_variants')
    .select('id, card_id, variant_name, border_style, art_effect, drop_weight, cards(id, name, slug, filename, tier, zone)')

  const allVariants = (variantRows ?? []) as unknown as CardVariant[]
  const targetRarityName = lootRarity.charAt(0).toUpperCase() + lootRarity.slice(1)
  const validVariantNames = new Set(
    RARITY_TIERS.find(t => t.name === targetRarityName)?.variants ?? []
  )
  const pool = allVariants.filter(v => validVariantNames.has(v.variant_name))

  let cardVariantId: number | undefined
  let cardName: string | undefined
  let cardFilename: string | undefined
  let cardVariantName: string | undefined

  if (pool.length > 0) {
    const picked = weightedPick(pool)
    cardVariantId = picked.id
    cardName = picked.cards?.name
    cardFilename = picked.cards?.filename
    cardVariantName = picked.variant_name

    await admin.from('user_collection').insert({
      user_id: user.id,
      card_variant_id: picked.id,
    })
  }

  // Award doubloons
  const { data: profileData } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()
  const newDoubloons = (profileData?.doubloons ?? 0) + doubloons

  const loot: LootResult = {
    doubloons,
    lootRarity,
    roll: rollResult.roll,
    crewRoll: rollResult.crewRoll,
    total: rollResult.total,
    base: rollResult.base,
    crewBonus: rollResult.crewBonus,
    finalScore,
    successBonus,
    cardVariantId,
    cardName,
    cardFilename,
    cardVariantName,
  }

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloons,
      reason: `Expedition reward: ${ZONES[exp.zone].name}`,
    }),
    admin.from('expeditions').update({
      status: 'completed',
      loot,
      completed_at: new Date().toISOString(),
    }).eq('id', expeditionId),
  ])

  revalidatePath('/expeditions')
  return loot
}

export async function abandonExpedition(
  expeditionId: number
): Promise<{ success: boolean } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('expeditions')
    .update({ status: 'failed', completed_at: new Date().toISOString() })
    .eq('id', expeditionId)
    .eq('user_id', user.id)
    .eq('status', 'active')

  if (error) return { error: 'Failed to abandon expedition' }
  revalidatePath('/expeditions')
  return { success: true }
}

export async function getActiveExpedition(): Promise<{
  expedition: Expedition | null
  dailyContent: DailyExpeditionRow | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { expedition: null, dailyContent: null }

  const admin = createAdminClient()
  const date = today()

  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .eq('expedition_date', date)
    .maybeSingle()

  if (!data) return { expedition: null, dailyContent: null }
  const exp = data as Expedition

  const { data: dailyData } = await admin
    .from('daily_expeditions')
    .select('*')
    .eq('expedition_date', date)
    .eq('zone', exp.zone)
    .maybeSingle()

  return {
    expedition: exp,
    dailyContent: dailyData as DailyExpeditionRow | null,
  }
}

export async function getTodayExpeditions(): Promise<Expedition[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('user_id', user.id)
    .eq('expedition_date', today())

  return (data ?? []) as Expedition[]
}

export async function getExpeditionById(id: number): Promise<{
  expedition: Expedition | null
  dailyContent: DailyExpeditionRow | null
}> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { expedition: null, dailyContent: null }

  const admin = createAdminClient()

  const { data } = await admin
    .from('expeditions')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!data) return { expedition: null, dailyContent: null }
  const exp = data as Expedition

  const { data: dailyData } = await admin
    .from('daily_expeditions')
    .select('*')
    .eq('expedition_date', exp.expedition_date)
    .eq('zone', exp.zone)
    .maybeSingle()

  return { expedition: exp, dailyContent: dailyData as DailyExpeditionRow | null }
}

export async function getCollectionForCrew(): Promise<Array<{
  collectionId: number
  cardId: number
  variantId: number
  name: string
  slug: string
  filename: string
  fishTier: 1 | 2 | 3
  rarity: string
  power: number
}>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const admin = createAdminClient()
  const { data } = await admin
    .from('user_collection')
    .select('id, card_variant_id, card_variants(id, variant_name, drop_weight, cards(id, name, slug, filename, tier, zone))')
    .eq('user_id', user.id)

  if (!data) return []

  const seen = new Set<number>()
  type CollEntry = { collectionId: number; cardId: number; variantId: number; name: string; slug: string; filename: string; fishTier: 1 | 2 | 3; rarity: string; power: number }
  const result: CollEntry[] = []

  type CollRow = {
    id: number
    card_variant_id: number
    card_variants: {
      id: number; variant_name: string; drop_weight: number
      cards: { id: number; name: string; slug: string; filename: string; tier: number; zone: string }
    }
  }
  for (const row of (data as unknown as CollRow[])) {
    if (seen.has(row.card_variant_id)) continue
    seen.add(row.card_variant_id)

    const v = row.card_variants
    const card = v.cards
    const rarity = RARITY_TIERS.find(t =>
      t.variants.includes(v.variant_name)
    )?.name ?? 'Common'
    const power = getCrewPower(rarity, card.tier as 1 | 2 | 3)

    result.push({
      collectionId: row.id,
      cardId: card.id,
      variantId: v.id,
      name: card.name,
      slug: card.slug,
      filename: card.filename,
      fishTier: card.tier as 1 | 2 | 3,
      rarity,
      power,
    })
  }

  result.sort((a, b) => b.power - a.power)
  return result
}
