// ── THE SEA CHART'S PAGE, SHAPED (Steam prep, 2026-09-30) ──
//
// What the chart is handed when it mounts, built from PIECES, the same way the
// ship screen is (lib/core/harbour shipHeroProps). The web's /sea page reads
// its pieces in one parallel batch against Supabase, with the species behind
// the cross-request cache, because it is the hottest page in the game. The
// desktop reads the same pieces from the save. Either way this one function
// turns them into SeaMap's props, so the two cannot disagree about what the
// chart shows.
//
// Moved verbatim out of app/(app)/sea/page.tsx. The only edit: the date for the
// Tide Turner's count is the game's clock, not `new Date()`.

import { inCaptainsWater } from '@/lib/captainWater'
import { computeRaidMap, RAID_MAP } from '@/lib/raidMap'
import { getLevelFromXP as getExpeditionLevel } from '@/lib/expeditionLevel'
import { getEffectiveRod, ownedRodTiers, RODS } from '@/lib/rods'
import { getLine } from '@/lib/lines'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { PETS } from '@/lib/pets'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getFishHold } from '@/lib/fishHold'
import { rodsAboard, hullSpeed } from '@/lib/shipyard'
import { MIN_SHIP_TIER } from '@/lib/ships'
import { EXPEDITION_SHIP_STATS, raidItemSlotsForTier } from '@/lib/expeditions'
import { classSlotBonuses } from '@/lib/shipClasses'
import { getRaidItem } from '@/lib/raidItems'
import { gauntletAutoCatchMaxRarity, hasForge, hasAbyssalForge, hasAbyssalAccelerator } from '@/lib/gauntletUpgrades'
import { vigilFor } from '@/lib/ancientVigil'
import { clockNow } from '@/lib/clock'
import type { CachedSpecies } from '@/lib/fishSpecies'
import type { Row } from '@/lib/data/common'
import type { Homestead } from '@/lib/homestead'
import type { RenownState } from '@/lib/core/progress'
import type { DigState } from '@/lib/core/sea'
import type { TrawlState } from '@/app/(app)/fishing/trawls/constants'

/** Everything the chart's props are built from. */
export type SeaPagePieces = {
  uid: string
  profile: Row | null
  /** The campaign nodes cleared (lib/raidCleared buildClearedSetVia). */
  clearedNodes: Set<string>
  species: CachedSpecies[]
  collection: { fish_id: number; is_golden: boolean | null }[]
  bests: { fish_id: number; best_length_in: number }[]
  /** Who would actually sail (loadDeployedParty, capped at `raidSeatsFor`). */
  party: { name: string; filename: string }[]
  bait: { bait_type: string; quantity: number }[]
  dealt: string[]
  discovered: string[]
  digs: DigState
  homestead: Homestead
  renown: RenownState | null
  renownNav: RenownState | null
  trawlState: TrawlState | { error: string }
  /** The Long Vigil's gate: One Last Ride cleared. */
  finaleCleared: boolean
  holdCount: number
  hasPact: boolean
  /** Rod tiers in the inventory. */
  rodTiers: number[]
}

/** What the URL asked the chart to open on arrival. */
export type SeaPageQuery = { open?: string; card?: string; boss?: string }

/** THE SHIP'S CAPACITY, worked out once and shared: the party loader caps by
 *  it, and the dock draws the empty seats (the whole point of a muster is that
 *  an empty seat is VISIBLE). */
export function raidSeatsFor(profile: Row | null): number {
  return (EXPEDITION_SHIP_STATS[Number(profile?.ship_tier ?? MIN_SHIP_TIER)]?.crewSlots ?? 1)
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).crewSlots
    + (profile?.has_sixth_berth === true ? 1 : 0)
}

/**
 * NO SEA UNTIL THERE IS A CAPTAIN. Setup and the welcome open over whatever
 * page the session lands on, and the session lands on the chart. Until both are
 * through there is no chart at all, only a dark field behind the modals (see
 * the note in app/(app)/sea/page.tsx).
 */
export function isFirstRun(profile: Row | null): boolean {
  return profile?.has_seen_setup !== true || profile?.has_seen_welcome !== true
}

/** SeaMap's props, from the pieces. */
export function seaMapProps(p: SeaPagePieces, q: SeaPageQuery = {}) {
  const profile = p.profile
  const rod = getEffectiveRod(
    Number(profile?.rod_tier ?? 0),
    (profile?.completionist_effects as number[] | null) ?? null,
  )
  const line = getLine(Number(profile?.line_tier ?? 0))
  const raidSeats = raidSeatsFor(profile)
  const itemMounts =
    raidItemSlotsForTier(Number(profile?.ship_tier ?? MIN_SHIP_TIER))
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).itemSlots
    + (profile?.has_armory_expansion === true ? 1 : 0)

  // Bait: whatever they have most of, which is almost always what they would
  // have picked anyway. Choosing it properly is the full screen's job.
  const best = p.bait
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)[0]
  const baitType = best?.bait_type ?? 'worm'
  const caughtFishIds = p.collection.map(r => r.fish_id)
  const mountedFishIds = p.collection.filter(r => r.is_golden).map(r => r.fish_id)
  const personalBests: Record<number, number> = {}
  for (const r of p.bests) personalBests[r.fish_id] = Number(r.best_length_in)

  // WHO IS OUT, WHERE, AND WHEN THEY ARE DUE.
  const trawlsOut = 'error' in p.trawlState
    ? []
    : p.trawlState.zones
        .filter(z => z.trawl?.endsAt)
        .map(z => ({
          zone: z.label,
          endsAt: z.trawl!.endsAt as string,
          crew: z.trawl!.crew.name,
          art: z.trawl!.crew.filename,
        }))

  // ── THE SPECIALS THE CLIENT DRIVES ──
  // THE CATCHER IS AN UPGRADE OF THE CASTER, not a second thing you equip: a
  // captain who owns both still has 'auto_caster' in the slot, and
  // has_auto_catcher is what raises the tier. Ownership of the CASTER gates both
  // tiers, matching FishingGame; legacy 'auto_catcher' rows resolve the same.
  const equippedSpecial = (profile?.equipped_special as string | null) ?? null
  const hasCatcher = profile?.has_auto_catcher === true
  const hasCaster = profile?.has_auto_caster === true
  const autoTier: 0 | 1 | 2 =
    ((equippedSpecial === 'auto_caster' || equippedSpecial === 'auto_catcher') && hasCaster)
      ? (hasCatcher ? 2 : 1)
      : 0

  const todayStr = new Date(clockNow()).toISOString().slice(0, 10)
  const ttUsed = profile?.tide_turner_date === todayStr ? Number(profile?.tide_turner_used ?? 0) : 0

  // THE HOLD: what is aboard and what it can take, so the chart warns before a
  // catch silently stops being banked.
  const holdTier = Number(profile?.fish_hold_tier ?? 0)
  const holdCapacity = getFishHold(holdTier).capacity

  // ── EVERY ROD YOU OWN SAILS WITH YOU ──
  // Resolved here rather than sent up from the client: what a rod does to the
  // dial is a server fact, and a client that names its own rods names its own
  // bonuses.
  const rodTierNow = Number(profile?.rod_tier ?? 0)
  const aboardTiers = rodsAboard(rodTierNow, ownedRodTiers(p.rodTiers, rodTierNow))
  const rack = aboardTiers.map(t => {
    const r = getEffectiveRod(t, (profile?.completionist_effects as number[] | null) ?? null)
    return {
      tier: t,
      name: RODS.find(x => x.tier === t)?.name ?? 'Rod',
      slug: r.slug ?? null,
      image: r.imageUrl ?? null,
      glow: r.glow ? (r.glowType ?? 'default') : null,
      color: r.color ?? null,
      catchZoneBonus: r.catchZoneBonus ?? 0,
      perfectZoneBonus: r.perfectZoneBonus ?? 0,
      retryOnMiss: r.retryOnMissChance ?? 0,
      snagImmune: r.snagImmune === true,
      perfectXpMult: r.perfectXpMult ?? 1,
    }
  })

  const equippedPet = (profile?.equipped_pet as string | null) ?? null
  const pet = PETS.find(x => x.id === equippedPet) ?? null

  // AND A CAPTAIN WHO HAS NEVER SAILED STARTS AT HOME. The first voyage's own
  // step is the honest signal: until beat one, a position on the row is not
  // theirs to resume (see the note in app/(app)/sea/page.tsx).
  const neverSailed = profile?.has_seen_sea_tour !== true && Number(profile?.sea_tour_step ?? 0) === 0

  const upgrades = [
    ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  const navLevel = getExpeditionLevel(Number(profile?.expedition_xp ?? 0))
  const ancients = (profile?.ancient_catches as number[] | null) ?? []

  return {
    fishingXP: Number(profile?.fishing_xp ?? 0),
    userId: p.uid,
    recall: {
      fishing: (profile?.last_recall_fish_at as string | null) ?? null,
      expedition: (profile?.last_recall_exp_at as string | null) ?? null,
    },
    tour: {
      seen: profile?.has_seen_sea_tour === true,
      step: Number(profile?.sea_tour_step ?? 0),
      hints: (profile?.sea_hints_seen as string[] | null) ?? [],
      gateSeen: profile?.has_seen_gate_tour === true,
      gateStep: Number(profile?.gate_tour_step ?? 0),
    },
    characterColor: (profile?.character_color as string | null) ?? 'default',
    boatId: (profile?.equipped_boat as string | null) ?? null,
    hatId: (profile?.equipped_hat as string | null) ?? null,
    gear: {
      // RODS COME IN TWO FLAVOURS: a `slug` rod has three per-frame files, an
      // `imageUrl` rod one image reused across frames.
      rodSlug: rod.slug ?? null,
      rod: rod.imageUrl ?? null,
      rodGlow: rod.glow ? (rod.glowType ?? 'default') : null,
      rodColor: rod.color ?? null,
      reel: getReel(Number(profile?.reel_tier ?? 0)).imageUrl ?? null,
      hook: getHook(Number(profile?.hook_tier ?? 0)).imageUrl ?? null,
      pet: pet?.species ?? null,
      petArt: pet?.restImageUrl ?? null,
      // THE ID, not the species: FisherPose keys its overlay off the equipped id.
      petId: equippedPet,
      petBow: (profile?.equipped_pet_bow as string | null) ?? null,
    },
    bait: baitType,
    hold: { count: p.holdCount, capacity: holdCapacity, tier: holdTier },
    rack,
    hullSpeed: hullSpeed(Number(profile?.hull_speed_tier ?? 0)),
    shipTier: Number(profile?.ship_tier ?? MIN_SHIP_TIER),
    equippedShipSkin: (profile?.equipped_ship_skin as string | null) ?? null,
    raidParty: p.party.map(c => ({ name: c.name, art: c.filename })),
    // ANYBODY AT ALL IN THE SEATS: the party loader returns only live, seated,
    // unreserved crew, so one row is the whole question.
    hasCaptain: p.party.length > 0,
    raidItems: ((profile?.equipped_raid_items as string[] | null) ?? [])
      .map(id => getRaidItem(id))
      .filter((d): d is NonNullable<typeof d> => !!d)
      .map(d => ({ name: d.name, image: d.image })),
    raidSeats,
    itemMounts,
    unequippedGear: ((profile?.raid_items as string[] | null) ?? []).length > 0
      && ((profile?.equipped_raid_items as string[] | null) ?? []).length === 0,
    portal: {
      tier: Number(profile?.portal_tier ?? 1),
      ports: (profile?.portal_ports as string[] | null) ?? [],
    },
    handlingTier: Number(profile?.hull_handling_tier ?? 0),
    accelTier: Number(profile?.hull_accel_tier ?? 0),
    lanternTier: Number(profile?.lantern_tier ?? 0),
    trawlsOut,
    renown: p.renown,
    exploredRaw: (profile?.sea_explored as string | null) ?? null,
    discovered: p.discovered,
    digs: p.digs,
    homestead: p.homestead,
    crewTiers: {
      hall: Number(profile?.crew_hall_tier ?? 1),
      drill: Number(profile?.crew_drill_level ?? 1),
      stores: Number(profile?.crew_stores_level ?? 1),
    },
    // BOTH LOCKERS, OR THE ISLAND NEVER LEAVES RUNG ONE: the Forge is Davy's,
    // the Abyssal Forge and the Accelerator are the Don's.
    forgeTier: hasAbyssalAccelerator(upgrades) ? 3 : hasAbyssalForge(upgrades) ? 2 : hasForge(upgrades) ? 1 : 0,
    clearedNodes: [...p.clearedNodes],
    isAdmin: profile?.is_admin === true,
    captain: inCaptainsWater(profile),
    donsDeepest: Number(profile?.dons_gauntlet_deepest ?? 0),
    hasAncientAccess: profile?.has_ancient_deep_access === true,
    hasPact: p.hasPact,
    navLevel,
    navXP: Number(profile?.expedition_xp ?? 0),
    renownNav: p.renownNav,
    doubloonsNow: Number(profile?.doubloons ?? 0),
    ancientsCaught: ancients.length,
    // The one resolver, given the one cleared set, so the water and the node map
    // are never two opinions about what is open.
    nodeStatus: Object.fromEntries(
      computeRaidMap(
        p.clearedNodes,
        Number(profile?.doubloons ?? 0),
        navLevel,
        profile?.is_admin === true,
        ancients.length,
        { captain: inCaptainsWater(profile) },
      ).map(v => [v.node.id, v.status]),
    ),
    log: {
      allFishSpecies: p.species,
      caughtFishIds, mountedFishIds, personalBests,
      prestigeLevels: (profile?.prestige_levels as Record<string, number> | null) ?? {},
      goldenBoosts: (profile?.zone_golden_boost as Record<string, number> | null) ?? {},
      ancientCatches: ancients,
      ancientVigil: vigilFor(profile?.ancient_vigil, ancients),
      vigilUnlocked: p.finaleCleared,
      zoneRewardsClaimed: {
        shallows:    (profile?.zone_shallows_rewarded as boolean | null)    ?? false,
        open_waters: (profile?.zone_open_waters_rewarded as boolean | null) ?? false,
        deep:        (profile?.zone_deep_rewarded as boolean | null)        ?? false,
        abyss:       (profile?.zone_abyss_rewarded as boolean | null)       ?? false,
      },
    },
    start: !neverSailed && profile?.sea_x != null && profile?.sea_y != null
      ? { x: Number(profile.sea_x), y: Number(profile.sea_y) }
      : null,
    startSide: (neverSailed ? 'fishing' : ((profile?.sea_side as string | null) ?? 'fishing')) as 'fishing' | 'anchorage' | 'moored' | 'open',
    exploredExpRaw: (profile?.sea_explored_exp as string | null) ?? null,
    openDoor: (q.open === 'crew' ? 'crew'
      : q.open === 'loadout' ? 'loadout'
        : q.open === 'ship' ? 'ship'
          : q.open === 'forge' ? 'forge' : null) as 'crew' | 'loadout' | 'ship' | 'forge' | null,
    seenChapterUnlocks: (profile?.seen_chapter_unlocks as string[] | null) ?? [],
    seenUltimateUnlock: profile?.seen_ultimate_unlock === true,
    openCard: (q.card === 'assign' || q.card === 'recruits' || q.card === 'roster' || q.card === 'wardrobe'
      ? q.card : null) as 'assign' | 'recruits' | 'roster' | 'wardrobe' | null,
    // Checked against the map so a stray value opens nothing.
    openBoss: q.boss && RAID_MAP.some(n => n.id === q.boss && n.raidId) ? q.boss : null,
    baitBag: p.bait
      .filter(b => b.quantity > 0)
      .map(b => ({ type: b.bait_type, quantity: b.quantity }))
      .sort((a, b) => b.quantity - a.quantity),
    baitQty: best?.quantity ?? 0,
    dealtToday: p.dealt,
    auto: {
      tier: autoTier,
      on: profile?.auto_fishing_on === true,
      maxRarity: gauntletAutoCatchMaxRarity(profile?.gauntlet_upgrades as string[] | null),
    },
    tideTurner: {
      // OWNING IT IS NOT CARRYING IT: it has to be in special slot 1, as on the
      // fishing screen.
      has: profile?.has_tide_turner === true && equippedSpecial === 'tide_turner',
      left: Math.max(0, 3 - ttUsed),
    },
    mods: {
      reelSpeedMult: getReel(Number(profile?.reel_tier ?? 0)).needleSpeedMultiplier,
      hookTier: Number(profile?.hook_tier ?? 0),
      linePenalty: line.penaltyMultiplier,
      reelTier: Number(profile?.reel_tier ?? 0),
      lineTier: line.tier,
      rodCatchBonus: rod.catchZoneBonus ?? 0,
      rodRetryOnMiss: rod.retryOnMissChance ?? 0,
      rodSnagImmune: rod.snagImmune === true,
      rodPerfectXpMult: rod.perfectXpMult ?? 1,
      rodPerfectBonus: rod.perfectZoneBonus ?? 0,
      fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
    },
  }
}
