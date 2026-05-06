'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { applyVariantBoosts, EXPEDITION_SHIP_STATS } from '@/lib/expeditions'

const CARD_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/card-arts/'

export interface RaidCrewMember {
  name: string
  imageUrl: string
  power: number
  dodge: number
  fortune: number
}

export interface RaidPlayerStats {
  playerHPMax: number
  shipMinDamage: number
  shipSpeed: number
  totalPower: number
  totalDodge: number
  totalFortune: number
  shipImageUrl: string
  shipName: string
  crewCount: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  shipSkins: string[]
}

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew, ship_name, equipped_ship_skin, ship_skins')
    .eq('id', userId)
    .single()

  const shipTier = profile?.ship_tier ?? 0
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const savedCrew = (profile?.saved_crew as number[] | null) ?? []

  let totalPower = 0, totalDodge = 0, totalFortune = 0
  const crewMembers: RaidCrewMember[] = []

  if (savedCrew.length > 0) {
    const { data: crewData } = await admin
      .from('card_variants')
      .select('id, variant_name, cards(power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune, name, filename)')
      .in('id', savedCrew)

    if (crewData) {
      savedCrew.forEach((vid, i) => {
        const v = (crewData as any[]).find(c => c.id === vid)
        if (!v?.cards) return
        const card = v.cards as { power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number; name: string; filename: string }
        const base   = { power: card.power,        dodge: card.dodge,        fortune: card.fortune }
        const mythic = { power: card.mythic_power,  dodge: card.mythic_dodge, fortune: card.mythic_fortune }
        const stats  = applyVariantBoosts(base, v.variant_name, mythic)
        const mult   = i === 0 ? 1 : 0.8
        totalPower   += Math.floor(stats.power   * mult)
        totalDodge   += Math.floor(stats.dodge   * mult)
        totalFortune += Math.floor(stats.fortune * mult)
        crewMembers.push({
          name:     card.name,
          imageUrl: CARD_IMG_BASE + card.filename,
          power:    Math.floor(stats.power   * mult),
          dodge:    Math.floor(stats.dodge   * mult),
          fortune:  Math.floor(stats.fortune * mult),
        })
      })
    }
  }

  return {
    playerHPMax:      ship.durability,
    shipMinDamage:    ship.minDamage,
    shipSpeed:        ship.speed,
    totalPower,
    totalDodge,
    totalFortune,
    shipImageUrl:     ship.image,
    shipName:         (profile?.ship_name as string | null) ?? ship.name,
    crewCount:        savedCrew.length,
    crewMembers,
    equippedShipSkin: (profile?.equipped_ship_skin as string | null) ?? null,
    shipSkins:        (profile?.ship_skins as string[] | null) ?? [],
  }
}

// Item IDs and what they grant
const ITEM_GRANTS: Record<string, { doubloons?: number; gems?: number; packs?: number; shipSkin?: string }> = {
  doubloons_300:  { doubloons: 300 },
  doubloons_600:  { doubloons: 600 },
  gems_3:         { gems: 3 },
  gems_5:         { gems: 5 },
  pack:           { packs: 1 },
  corsair_black:  { shipSkin: 'corsair_black' },
}

export async function claimRaidLoot(
  baseDoubloons: number,
  rolledItemIds: string[],
): Promise<{ newShipSkins: string[]; newDoubloonTotal: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newShipSkins: [], newDoubloonTotal: 0 }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, packs_available, ship_skins, equipped_ship_skin')
    .eq('id', user.id)
    .single()

  let doubloons     = (profile?.doubloons ?? 0) + baseDoubloons
  let gems          = profile?.gems ?? 0
  let packs         = profile?.packs_available ?? 0
  const ownedSkins  = (profile?.ship_skins as string[] | null) ?? []
  let equippedSkin  = (profile?.equipped_ship_skin as string | null) ?? null
  const newSkins    = [...ownedSkins]

  for (const id of rolledItemIds) {
    const grant = ITEM_GRANTS[id]
    if (!grant) continue
    if (grant.doubloons) doubloons += grant.doubloons
    if (grant.gems)      gems      += grant.gems
    if (grant.packs)     packs     += grant.packs
    if (grant.shipSkin && !newSkins.includes(grant.shipSkin)) {
      newSkins.push(grant.shipSkin)
      // Auto-equip if this is their first ship skin
      if (!equippedSkin) equippedSkin = grant.shipSkin
    }
  }

  await admin
    .from('profiles')
    .update({ doubloons, gems, packs_available: packs, ship_skins: newSkins, equipped_ship_skin: equippedSkin })
    .eq('id', user.id)

  return { newShipSkins: newSkins.filter(s => !ownedSkins.includes(s)), newDoubloonTotal: doubloons }
}
