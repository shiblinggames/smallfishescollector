'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS, raidRepairCost, raidItemSlotsForTier, type RaidMods } from '@/lib/expeditions'
import { getLevelFromXP, navLevelBonuses } from '@/lib/expeditionLevel'
import { loadDeployedParty } from '@/lib/crewData'
import { resolveDeployedCrew } from '@/lib/crewResolve'
import { getActiveEffects, dedupeRaidItems } from '@/lib/raidItems'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { getShipSkin } from '@/lib/shipSkins'
import { bonusChargeSlots, gauntletRepairHealMult } from '@/lib/gauntletUpgrades'
import { getShipAugment, MANOWAR_TIER, type ShipAugment } from '@/lib/shipAugments'
import { settleUltimateBuild } from '@/lib/ultimateBuild'

const CARD_IMG_BASE = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '') + '/storage/v1/object/public/card-arts/'


export interface RaidCrewMember {
  /** user_crew row id. Drives the per-crew once-per-raid ability cooldown
   *  state in RaidGame and lets the Special chooser key its cards. */
  id: number
  /** Lower-cased species slug. RaidGame derives the crew's class via
   *  classForSlug(slug); null/empty = no class wired (older species not yet
   *  in the class map). */
  slug: string
  name: string
  imageUrl: string
  /** Cumulative XP — drives the crew's current class-ability tier via
   *  crewLevelFromXP() + currentMilestone(). */
  xp: number
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
  /** All raid items the player owns (equipped or not). Used to exclude
   *  already-owned items from the boss loot roll so duplicates re-roll
   *  into something new. */
  ownedRaidItems: string[]
  /** Aggregated ship-class effects from every chapter the player has
   *  picked one for. damageMult and doubloonMult are passed through to
   *  RaidGame to apply at hit time; hpMult + speedFlat are already
   *  baked into playerHPMax + shipSpeed below. */
  classDamageMult: number
  classDoubloonMult: number
  /** Raw chapter -> classId picks. Threaded to the in-fight stats popup
   *  so the player can see WHICH classes are modifying their ship,
   *  not just the aggregated multiplier. */
  shipClasses: Record<string, string>
  equippedRepairKit: string
  hasSeenRaidTutorial: boolean
  raidMods: RaidMods
  /** Extra player cannonball slots from claimed Locker Upgrades (Gauntlet). */
  bonusChargeSlots: number
  /** The Man-o-War volley augment, resolved + gated on actually being on the
   *  Man-o-War (tier 6). Null otherwise — the Mega only exists on that hull. */
  manowarAugment: ShipAugment | null
}

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew, ship_name, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, equipped_ship_skin, ship_skins, raid_items, equipped_raid_items, equipped_repair_kit, has_seen_raid_tutorial, expedition_xp, nav_renown_alloc, ship_classes, gauntlet_upgrades, manowar_augment, manowar_augment_build, has_sixth_berth')
    .eq('id', userId)
    .single()

  // Promote a finished ultimate build into the active slot before combat reads
  // it, so a weapon that completed while the player was away fires this raid.
  const { active: activeAugmentId } = await settleUltimateBuild(
    admin, userId, (profile?.manowar_augment as string | null) ?? null, profile?.manowar_augment_build ?? null)

  const shipTier = profile?.ship_tier ?? 0
  const ship = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]

  // Ship classes: chapter-end identity picks (Master Gunner, Ironside,
  // Helmsman, Buccaneer) + the Ch4 augments. Parsed EARLY because the
  // Expanded Quarters augment widens the crew party and Expanded Armory
  // widens the item cap, both read below.
  const shipClassPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const classEffects = aggregateShipClasses(shipClassPicks)

  // New crew system: deployed party from user_crew (raid track), resolved
  // with effects. Voyage and raid each have an independent assignment slot
  // now — see migrate_split_crew_assignment.
  // The Sixth Berth (bought after Raid 7) widens the raid party to six.
  const berthSlots = (profile as { has_sixth_berth?: boolean } | null)?.has_sixth_berth === true ? 1 : 0
  const party = await loadDeployedParty(admin, userId, ship.crewSlots + classEffects.crewSlots + berthSlots, 'raid')
  const resolved = resolveDeployedCrew(party)
  const totalPower = resolved.totals.power
  const totalDodge = resolved.totals.dodge
  const totalFortune = resolved.totals.fortune
  const crewMembers: RaidCrewMember[] = resolved.perCrew.map(pc => {
    const row = party.find(p => p.id === pc.id)
    const mult = pc.slot === 0 ? 1 : 0.8
    return {
      id:       pc.id,
      slug:     row?.slug ?? '',
      name:     row?.name ?? 'Crew',
      imageUrl: CARD_IMG_BASE + (row?.filename ?? ''),
      xp:       (row?.xp as number | undefined) ?? 0,
      power:    Math.floor(pc.power   * mult),
      dodge:    Math.floor(pc.dodge   * mult),
      fortune:  Math.floor(pc.fortune * mult),
    }
  })

  // Apply Nav-level captain bonuses on top of crew + ship totals.
  const navLevel = getLevelFromXP((profile?.expedition_xp as number | null) ?? 0)
  const navBonus = navLevelBonuses(navLevel)

  // Navigation Renown (post-100): tiny captain boosts. Hull adds flat HP into
  // the pool below (before item/class mults); damage folds into the mult sent
  // to the client. Identity (1× / +0) when unallocated.
  const navRenown = navRenownEffects(profile?.nav_renown_alloc as RenownAlloc | null)

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
  // Hull cap + the Ch4 Expanded Armory augment's extra mount.
  const slotCap     = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0) + classEffects.itemSlots
  // Drop items that can't coexist (tier-family grades + a fusion beside its own
  // forge ingredients) so a legacy/stale loadout can't double-apply a stat that
  // was never meant to stack, then cap to the hull's slots.
  const equippedItems = dedupeRaidItems(rawEquipped).slice(0, slotCap)
  const hpMaxMult = getActiveEffects(equippedItems)
    .filter(e => e.type === 'max_hp_mult')
    .reduce((a, e) => a * e.value, 1)

  const gauntletUpgrades = (profile?.gauntlet_upgrades as string[] | null) ?? []

  return {
    playerHPMax:      Math.round((ship.durability + navBonus.hp + navRenown.hullFlat) * hpMaxMult * classEffects.hpMult),
    shipMinDamage:    ship.minDamage,
    shipSpeed:        Math.max(0, ship.speed + classEffects.speedFlat),
    totalPower:       totalPower   + navBonus.power,
    totalDodge:       totalDodge   + navBonus.navigation,
    totalFortune:     totalFortune + navBonus.fortune,
    // Skin can swap the ship sprite outright via imageByTier (Finndicate
    // Hull → enemychapter1[tier]); falls back to the default ship art.
    // Any skin's CSS filter is resolved client-side on the rendered <img>.
    shipImageUrl:     getShipSkin((profile?.equipped_ship_skin as string | null) ?? '')?.imageByTier?.[shipTier] ?? ship.image,
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
    ownedRaidItems:       (profile?.raid_items as string[] | null) ?? [],
    classDamageMult:      classEffects.damageMult * navRenown.damageMult,
    classDoubloonMult:    classEffects.doubloonMult,
    shipClasses:          shipClassPicks,
    equippedRepairKit:    (profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit',
    hasSeenRaidTutorial:  (profile?.has_seen_raid_tutorial as boolean | null) ?? false,
    raidMods:             { ...resolved.raid, repairHealMult: gauntletRepairHealMult(gauntletUpgrades) },
    bonusChargeSlots:     bonusChargeSlots((profile?.gauntlet_upgrades as string[] | null) ?? []),
    manowarAugment:       shipTier === MANOWAR_TIER ? getShipAugment(activeAugmentId) : null,
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
  doubloons_800:   { doubloons: 800 },
  doubloons_1200:  { doubloons: 1200 },
  doubloons_1500:  { doubloons: 1500 },
  gems_25:         { gems: 25 },
  gems_50:         { gems: 50 },
  // Legacy "pack" loot ids now pay gems (packs are retired): 100 gems per pack.
  pack:            { gems: 100 },
  pack_2:          { gems: 200 },
  corsair_cannon:          { raidItem: 'corsair_cannon' },
  corsair_prime_cannon:    { raidItem: 'corsair_prime_cannon' },
  krusts_carapace:         { raidItem: 'krusts_carapace' },
  captains_carapace:       { raidItem: 'captains_carapace' },
  cartographers_astrolabe: { raidItem: 'cartographers_astrolabe' },
  captains_astrolabe:      { raidItem: 'captains_astrolabe' },
  spets_primer:            { raidItem: 'spets_primer' },
  tollmasters_primer:      { raidItem: 'tollmasters_primer' },
  tell_tale_glass:         { raidItem: 'tell_tale_glass' },
  admirals_eye:            { raidItem: 'admirals_eye' },
  chain_shot:              { raidItem: 'chain_shot' },
  dons_signet:             { raidItem: 'dons_signet' },
  war_drum:                { raidItem: 'war_drum' },
  // The six either/or Cache items. They had NO grants until now because the Cache
  // node handed them out directly and they had never been raid loot. The
  // Quartermaster's Ghost drops them, and without an entry here the roll would
  // show the player a crate and silently give them nothing.
  quartermasters_anchor:   { raidItem: 'quartermasters_anchor' },
  navigators_compass:      { raidItem: 'navigators_compass' },
  gunners_sight:           { raidItem: 'gunners_sight' },
  reinforced_hull:         { raidItem: 'reinforced_hull' },
  incendiary_cannonball:   { raidItem: 'incendiary_cannonball' },
  frozen_cannonball:       { raidItem: 'frozen_cannonball' },
  thunder_drum:            { raidItem: 'thunder_drum' },
  finndicate_hull:         { shipSkin:  'finndicate_hull' },
  chartmaker_hull:         { shipSkin:  'chartmaker_hull' },
  coffers_hull:            { shipSkin:  'coffers_hull' },
}

/** Record a raid clear the MOMENT the boss dies — independent of the
 *  loot-claim flow. Previously the raid_completions insert was bundled
 *  inside claimRaidLoot(); any failure (network blip, player closing
 *  the tab on the victory screen, etc.) silently dropped the clear and
 *  the next story node stayed locked. Fire-and-forget; loot grant
 *  remains in claimRaidLoot. */
export async function recordRaidClear(raidId: string, elapsedMs: number): Promise<void> {
  if (!raidId || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin
    .from('raid_completions')
    .insert({ user_id: user.id, elapsed_ms: Math.floor(elapsedMs), raid_id: raidId })
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
  // Challenge-mode boss-clear badge unlocks live in RaidGame's
  // handleEnemyDefeated (the moment the boss sinks) so the celebration
  // pops as part of the kill beat, not after the loot crate is claimed.
  // elapsedMs + damageTaken are still passed through for cumulative
  // stats tracking elsewhere.

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, gems, ship_skins, equipped_ship_skin, raid_items, ship_classes')
    .eq('id', user.id)
    .single()

  // Helmsman + future doubloon-mult class picks scale the crate
  // doubloons too, in addition to the per-kill gold (which scales via
  // awardRaidKill). Same multiplier read from the same place.
  const classPicks = (profile?.ship_classes as Record<string, string> | null) ?? {}
  const classDoubloonMult = aggregateShipClasses(classPicks).doubloonMult
  const scaledBaseDoubloons = Math.round(baseDoubloons * classDoubloonMult)
  let doubloons       = (profile?.doubloons ?? 0) + scaledBaseDoubloons
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

  // raid_completions row is inserted by recordRaidClear() the moment
  // the boss dies (see RaidGame handleEnemyDefeated). Keeping the
  // clear independent of the loot grant means a failed loot persist
  // doesn't strand the player on a still-locked next node.
  await admin
    .from('profiles')
    .update({ doubloons, gems, ship_skins: newSkins, equipped_ship_skin: equippedSkin, raid_items: newRaidItems })
    .eq('id', user.id)

  return {
    newShipSkins: newSkins.filter(s => !ownedSkins.includes(s)),
    newDoubloonTotal: doubloons,
    newRaidItems: newRaidItems.filter(i => !ownedRaidItems.includes(i)),
  }
}
