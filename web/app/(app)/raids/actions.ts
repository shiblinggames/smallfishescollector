'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS, raidRepairCost, raidItemSlotsForTier, type RaidMods } from '@/lib/expeditions'
import { getLevelFromXP, navLevelBonuses } from '@/lib/expeditionLevel'
import { loadDeployedParty } from '@/lib/crewData'
import { resolveDeployedCrew } from '@/lib/crewResolve'
import { getActiveEffects } from '@/lib/raidItems'
import { unlockBadge } from '@/app/(app)/achievements/badgeActions'

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
  username: string | null
  characterColor: string | null
  equippedHat: string | null
  avatarBgColor: string | null
  avatarBorderColor: string | null
  crewCount: number
  crewMembers: RaidCrewMember[]
  equippedShipSkin: string | null
  shipSkins: string[]
  equippedRaidItems: string[]
  equippedRepairKit: string
  hasSeenRaidTutorial: boolean
  raidMods: RaidMods
}

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew, ship_name, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, equipped_ship_skin, ship_skins, equipped_raid_items, equipped_repair_kit, has_seen_raid_tutorial, expedition_xp')
    .eq('id', userId)
    .single()

  const shipTier = profile?.ship_tier ?? 0
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  // New crew system: deployed party from user_crew, resolved with effects.
  const party = await loadDeployedParty(admin, userId, ship.crewSlots)
  const resolved = resolveDeployedCrew(party)
  const totalPower = resolved.totals.power
  const totalDodge = resolved.totals.dodge
  const totalFortune = resolved.totals.fortune
  const crewMembers: RaidCrewMember[] = resolved.perCrew.map(pc => {
    const row = party.find(p => p.id === pc.id)
    const mult = pc.slot === 0 ? 1 : 0.8
    return {
      name:     row?.name ?? 'Crew',
      imageUrl: CARD_IMG_BASE + (row?.filename ?? ''),
      power:    Math.floor(pc.power   * mult),
      dodge:    Math.floor(pc.dodge   * mult),
      fortune:  Math.floor(pc.fortune * mult),
    }
  })

  // Apply Nav-level captain bonuses on top of crew + ship totals.
  const navLevel = getLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const navBonus = navLevelBonuses(navLevel)

  // Reinforced Hull etc. — raid items can scale max HP at raid start.
  // Multiplies after the ship + nav HP are summed so it applies to the
  // full pool. Multiple max_hp_mult items stack multiplicatively.
  //
  // Truncate equipped_raid_items to the ship-tier slot cap before reading
  // effects — a player who downgrades ships (or had stale rows from when
  // the cap was a flat 3) shouldn't get free effects past their hull's
  // capacity. The UI also caps at the same number when the loadout
  // drawer opens, so the next save will write the truncated list back.
  const rawEquipped = (profile?.equipped_raid_items as string[] | null) ?? []
  const slotCap     = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0)
  const equippedItems = rawEquipped.slice(0, slotCap)
  const hpMaxMult = getActiveEffects(equippedItems)
    .filter(e => e.type === 'max_hp_mult')
    .reduce((a, e) => a * e.value, 1)

  return {
    playerHPMax:      Math.round((ship.durability + navBonus.hp) * hpMaxMult),
    shipMinDamage:    ship.minDamage,
    shipSpeed:        ship.speed,
    totalPower:       totalPower   + navBonus.power,
    totalDodge:       totalDodge   + navBonus.navigation,
    totalFortune:     totalFortune + navBonus.fortune,
    shipImageUrl:     ship.image,
    shipName:         (profile?.ship_name as string | null) ?? ship.name,
    username:         (profile?.username as string | null) ?? null,
    characterColor:   (profile?.character_color as string | null) ?? null,
    equippedHat:      (profile?.equipped_hat as string | null) ?? null,
    avatarBgColor:    (profile?.avatar_bg_color as string | null) ?? null,
    avatarBorderColor:(profile?.avatar_border_color as string | null) ?? null,
    crewCount:        party.length,
    crewMembers,
    equippedShipSkin:     (profile?.equipped_ship_skin as string | null) ?? null,
    shipSkins:            (profile?.ship_skins as string[] | null) ?? [],
    equippedRaidItems:    equippedItems,
    equippedRepairKit:    (profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit',
    hasSeenRaidTutorial:  (profile?.has_seen_raid_tutorial as boolean | null) ?? false,
    raidMods:             resolved.raid,
  }
}

// ── Raid sink penalty ─────────────────────────────────────────────────────────

// Called when the player's ship sinks in a real raid (NOT the practice
// skirmish). Snapshots the tier-scaled repair fee onto the profile. Only
// sets it if nothing is owed yet, so dying again before repairing can't
// stack (you can't raid while owing anyway).
export async function reportRaidSink(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, raid_repair_owed')
    .eq('id', user.id)
    .single()
  if (!profile) return
  if ((profile.raid_repair_owed ?? 0) > 0) return

  const fee = raidRepairCost(profile.ship_tier ?? 0)
  await admin.from('profiles').update({ raid_repair_owed: fee }).eq('id', user.id)
}

// Pay the outstanding repair fee. Returns the new doubloon total, or an
// error if the player can't cover it.
export async function repairShip(): Promise<
  { newDoubloonTotal: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, raid_repair_owed')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const owed = profile.raid_repair_owed ?? 0
  if (owed <= 0) return { newDoubloonTotal: profile.doubloons ?? 0 }

  const doubloons = profile.doubloons ?? 0
  if (doubloons < owed) return { error: 'Not enough doubloons' }

  const newTotal = doubloons - owed
  await admin
    .from('profiles')
    .update({ doubloons: newTotal, raid_repair_owed: 0 })
    .eq('id', user.id)

  return { newDoubloonTotal: newTotal }
}

// Item IDs and what they grant
const ITEM_GRANTS: Record<string, { doubloons?: number; gems?: number; shipSkin?: string; raidItem?: string }> = {
  doubloons_300:   { doubloons: 300 },
  doubloons_600:   { doubloons: 600 },
  doubloons_1200:  { doubloons: 1200 },
  gems_25:         { gems: 25 },
  gems_50:         { gems: 50 },
  // Legacy "pack" loot ids now pay gems (packs are retired): 100 gems per pack.
  pack:            { gems: 100 },
  pack_2:          { gems: 200 },
  corsair_black:   { shipSkin: 'corsair_black' },
  corsair_cannon:  { raidItem: 'corsair_cannon' },
  verdigris_hull:  { shipSkin: 'verdigris_hull' },
  krusts_carapace: { raidItem: 'krusts_carapace' },
}

/** Record a single hit the player landed, keeping profiles.highest_raid_damage
 *  as the all-time max. Fired per new run-best from RaidGame (win OR loss), so
 *  "Biggest Hit" reflects the largest blow ever dealt, not just on clears.
 *  Atomic via the bump_raid_damage() greatest() update — safe under races. */
export async function recordRaidHit(dmg: number): Promise<void> {
  if (!Number.isFinite(dmg) || dmg <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.rpc('bump_raid_damage', { uid: user.id, dmg: Math.floor(dmg) })
}

export async function claimRaidLoot(
  baseDoubloons: number,
  rolledItemIds: string[],
  elapsedMs: number,
  damageTaken: number,
  raidId: string = 'corsairs_reckoning',
): Promise<{ newShipSkins: string[]; newDoubloonTotal: number; newRaidItems: string[] }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { newShipSkins: [], newDoubloonTotal: 0, newRaidItems: [] }
  // Challenge-mode boss trophies. Any clear of a challenge raid awards
  // the corresponding badge — no time/damage gating, the challenge fight
  // itself is the bar. corsairs_bane = Pete challenge; ghost_ship (now
  // labelled "Krust's Crutch") = Krust challenge. Normal-mode clears
  // never grant either, so the badges read as "you beat the hard
  // version". elapsedMs + damageTaken are still passed through for
  // cumulative stats tracking elsewhere.
  if (raidId === 'corsairs_reckoning_challenge') await unlockBadge('corsairs_bane')
  if (raidId === 'captain_krust_challenge')      await unlockBadge('ghost_ship')

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, ship_skins, equipped_ship_skin, raid_items')
    .eq('id', user.id)
    .single()

  let doubloons       = (profile?.doubloons ?? 0) + baseDoubloons
  let gems            = profile?.gems ?? 0
  const ownedSkins    = (profile?.ship_skins as string[] | null) ?? []
  let equippedSkin    = (profile?.equipped_ship_skin as string | null) ?? null
  const newSkins      = [...ownedSkins]
  const ownedRaidItems = (profile?.raid_items as string[] | null) ?? []
  const newRaidItems   = [...ownedRaidItems]

  for (const id of rolledItemIds) {
    const grant = ITEM_GRANTS[id]
    if (!grant) continue
    if (grant.doubloons) doubloons += grant.doubloons
    if (grant.gems)      gems      += grant.gems
    if (grant.shipSkin && !newSkins.includes(grant.shipSkin)) {
      newSkins.push(grant.shipSkin)
      if (!equippedSkin) equippedSkin = grant.shipSkin
    }
    if (grant.raidItem && !newRaidItems.includes(grant.raidItem)) {
      newRaidItems.push(grant.raidItem)
    }
  }

  await Promise.all([
    admin
      .from('profiles')
      .update({ doubloons, gems, ship_skins: newSkins, equipped_ship_skin: equippedSkin, raid_items: newRaidItems })
      .eq('id', user.id),
    admin
      .from('raid_completions')
      .insert({ user_id: user.id, elapsed_ms: elapsedMs, raid_id: raidId }),
  ])

  return {
    newShipSkins: newSkins.filter(s => !ownedSkins.includes(s)),
    newDoubloonTotal: doubloons,
    newRaidItems: newRaidItems.filter(i => !ownedRaidItems.includes(i)),
  }
}
