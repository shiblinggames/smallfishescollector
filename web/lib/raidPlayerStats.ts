// ── THE RAID LOADOUT, READ SERVER-SIDE ──────────────────────────────────────
//
// Plain module, NOT 'use server'. getRaidPlayerStats(userId) used to be an
// export of raids/actions.ts, which made it a public endpoint that returned any
// captain's full loadout for any user id it was handed. Pages and server
// actions that already know who is asking call it from here instead.

import { createAdminClient } from '@/lib/supabase/admin'
import { dialAimBonus, type DialAimBonus } from '@/lib/dialAim'
import { ownedSpecialIds } from '@/lib/specialItems'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier, type RaidMods } from '@/lib/expeditions'
import { getLevelFromXP, navLevelBonuses } from '@/lib/expeditionLevel'
import { loadDeployedParty } from '@/lib/crewData'
import { resolveDeployedCrew } from '@/lib/crewResolve'
import { getActiveEffects, dedupeRaidItems, RAID_ITEMS } from '@/lib/raidItems'
import { finnItemLevel } from '@/lib/finnItems'
import { aggregateShipClasses } from '@/lib/shipClasses'
import { navRenownEffects, type RenownAlloc } from '@/lib/renown'
import { shipSkinImage } from '@/lib/shipSkins'
import { bonusChargeSlots, gauntletRepairHealMult, donsRaidHpMult, donsLegendaryLootMult } from '@/lib/gauntletUpgrades'
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
  /** Fishing SPECIALS the player owns, which live one boolean column each
   *  rather than in raid_items. Finn's table drops one (The Primeval Eye), so
   *  without this the exclusion above cannot see it and he can hand out a
   *  second copy -- burning a 2.5% ancient roll on something that grants
   *  nothing. Same blind spot the grant path already had to be taught about. */
  ownedSpecialItems: string[]
  /** Aggregated ship-class effects from every chapter the player has
   *  picked one for. damageMult and doubloonMult are passed through to
   *  RaidGame to apply at hit time; hpMult + speedFlat are already
   *  baked into playerHPMax + shipSpeed below. */
  classDamageMult: number
  classDoubloonMult: number
  /** Kingpin's Cut (Don's Locker perk): legendary boss-drop weight multiplier
   *  for the raid loot roll (1 = none, 2 = 2x). */
  legendaryLootMult: number
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
  /** Fishing gear widening the Finn dial's bands. Only the dial fight reads
   *  this; every bar fight ignores it, so no existing raid changes. */
  dialAim: DialAimBonus
}

export async function getRaidPlayerStats(userId: string): Promise<RaidPlayerStats> {
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('ship_tier, saved_crew, ship_name, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, equipped_ship_skin, ship_skins, raid_items, equipped_raid_items, equipped_repair_kit, has_seen_raid_tutorial, expedition_xp, nav_renown_alloc, ship_classes, gauntlet_upgrades, dons_gauntlet_upgrades, manowar_augment, manowar_augment_build, has_sixth_berth, has_armory_expansion, finn_spoil_free, finn_spoil_paid, borrowed_jaw_xp, has_tide_turner, has_phantom_hook, has_auto_caster, has_auto_catcher, has_perfected_sigil, has_anglers_patience, rod_tier, hook_tier, reel_tier, completionist_effects')
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
  // Hull cap + the Ch4 Expanded Armory refit's extra mount (purchased flag),
  // plus any legacy class-pick itemSlots (none in production).
  const armorySlot  = (profile as { has_armory_expansion?: boolean } | null)?.has_armory_expansion === true ? 1 : 0
  const slotCap     = raidItemSlotsForTier((profile?.ship_tier as number | null) ?? 0) + classEffects.itemSlots + armorySlot
  // Drop items that can't coexist (tier-family grades + a fusion beside its own
  // forge ingredients) so a legacy/stale loadout can't double-apply a stat that
  // was never meant to stack, then cap to the hull's slots.
  // THE SUNKEN HAND MOUNT. Not a general slot: it exists only while you hold
  // the nav spoil, and it accepts only the item that spoil is for. So rather
  // than widening slotCap for everyone, his item is pulled OUT of the normal
  // loadout, checked against the unlock, and re-attached beside it. That way
  // it never competes for a hull slot and it can never be worn without the
  // unlock, however the array got saved.
  const spoilFree = (profile as { finn_spoil_free?: string | null } | null)?.finn_spoil_free ?? null
  const spoilPaid = (profile as { finn_spoil_paid?: string | null } | null)?.finn_spoil_paid ?? null
  const hasMount  = spoilFree === 'nav' || spoilPaid === 'nav'
  const finaleIds = new Set(RAID_ITEMS.filter(i => i.finaleSlotOnly).map(i => i.id))
  const mounted   = hasMount ? rawEquipped.filter(id => finaleIds.has(id)).slice(0, 1) : []
  const normal    = rawEquipped.filter(id => !finaleIds.has(id))
  const equippedItems = [...dedupeRaidItems(normal).slice(0, slotCap), ...mounted]
  // THE BORROWED JAW pays out by CHARGE. Tag its id with the level it has
  // reached so combat resolves the right milestone (see baseItemId). Only the
  // copy handed to the client is tagged; the database keeps the plain id.
  const jawLevel = finnItemLevel(Number((profile as { borrowed_jaw_xp?: number } | null)?.borrowed_jaw_xp ?? 0))
  const chargedItems = equippedItems.map(id => (id === 'borrowed_jaw' ? `borrowed_jaw#${jawLevel}` : id))
  const hpMaxMult = getActiveEffects(equippedItems)
    .filter(e => e.type === 'max_hp_mult')
    .reduce((a, e) => a * e.value, 1)

  const gauntletUpgrades = (profile?.gauntlet_upgrades as string[] | null) ?? []
  // Account-scope Locker perks apply from EITHER gauntlet, so the Don's Ship &
  // Shore perks (Deep-Sea Plating / Ghost Ordnance) read the union of both.
  const accountUpgrades = [...gauntletUpgrades, ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? [])]

  // The convergence: the finale is aimed on a dial, and the player's ROD and
  // HOOK widen its bands by the same degrees they widen the fishing dial.
  const dialAim = dialAimBonus(
    (profile as { rod_tier?: number } | null)?.rod_tier ?? 0,
    (profile as { hook_tier?: number } | null)?.hook_tier ?? 0,
    (profile as { completionist_effects?: number[] } | null)?.completionist_effects ?? null,
    (profile as { reel_tier?: number } | null)?.reel_tier ?? 0,
  )

  return {
    playerHPMax:      Math.round((ship.durability + navBonus.hp + navRenown.hullFlat) * hpMaxMult * classEffects.hpMult * donsRaidHpMult(accountUpgrades)),
    shipMinDamage:    ship.minDamage,
    shipSpeed:        Math.max(0, ship.speed + classEffects.speedFlat),
    totalPower:       totalPower   + navBonus.power,
    totalDodge:       totalDodge   + navBonus.navigation,
    totalFortune:     totalFortune + navBonus.fortune,
    // Skin can swap the ship sprite outright via imageByTier (Finndicate
    // Hull → enemychapter1[tier]); falls back to the default ship art.
    // Any skin's CSS filter is resolved client-side on the rendered <img>.
    shipImageUrl:     shipSkinImage((profile?.equipped_ship_skin as string | null) ?? null, shipTier, ship.image),
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
    equippedRaidItems:    chargedItems,
    ownedRaidItems:       (profile?.raid_items as string[] | null) ?? [],
    ownedSpecialItems:    ownedSpecialIds(profile as unknown as Record<string, unknown>),
    classDamageMult:      classEffects.damageMult * navRenown.damageMult,
    legendaryLootMult:    donsLegendaryLootMult(accountUpgrades),
    classDoubloonMult:    classEffects.doubloonMult,
    shipClasses:          shipClassPicks,
    equippedRepairKit:    (profile?.equipped_repair_kit as string | null) ?? 'basic_repair_kit',
    hasSeenRaidTutorial:  (profile?.has_seen_raid_tutorial as boolean | null) ?? false,
    raidMods:             { ...resolved.raid, repairHealMult: gauntletRepairHealMult(gauntletUpgrades) },
    bonusChargeSlots:     bonusChargeSlots((profile?.gauntlet_upgrades as string[] | null) ?? []),
    manowarAugment:       shipTier === MANOWAR_TIER ? getShipAugment(activeAugmentId) : null,
    dialAim,
  }
}
