'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyVariantBoosts, EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

export interface CannonPlayerStats {
  playerHPMax: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  shipImageUrl: string
  shipName: string
  crewCount: number
}

export async function getCannonPlayerStats(userId: string): Promise<CannonPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew')
    .eq('id', userId)
    .single()

  const shipTier = profile?.ship_tier ?? 0
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const savedCrew = (profile?.saved_crew as number[] | null) ?? []

  let totalPower = 0, totalDodge = 0, totalFortune = 0

  if (savedCrew.length > 0) {
    const { data: crewData } = await admin
      .from('card_variants')
      .select('id, variant_name, cards(power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune)')
      .in('id', savedCrew)

    if (crewData) {
      savedCrew.forEach((vid, i) => {
        const v = (crewData as any[]).find(c => c.id === vid)
        if (!v?.cards) return
        const card = v.cards as { power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number }
        const base   = { power: card.power,        dodge: card.dodge,        fortune: card.fortune }
        const mythic = { power: card.mythic_power,  dodge: card.mythic_dodge, fortune: card.mythic_fortune }
        const stats  = applyVariantBoosts(base, v.variant_name, mythic)
        const mult   = i === 0 ? 1 : 0.8
        totalPower   += Math.floor(stats.power   * mult)
        totalDodge   += Math.floor(stats.dodge   * mult)
        totalFortune += Math.floor(stats.fortune * mult)
      })
    }
  }

  return {
    playerHPMax:  ship.durability,
    shipSpeed:    ship.speed,
    totalPower,
    totalDodge,
    totalFortune,
    shipImageUrl: ship.image,
    shipName:     ship.name,
    crewCount:    savedCrew.length,
  }
}

export async function claimCannonLoot(doubloons: number): Promise<void> {
  if (doubloons <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons')
    .eq('id', user.id)
    .single()

  await admin
    .from('profiles')
    .update({ doubloons: (profile?.doubloons ?? 0) + doubloons })
    .eq('id', user.id)
}
