// THE OCEAN HUB — admin only.
//
// The ocean IS the hub: a painted chart you sail across, with the Mainland
// (tavern, market, shops) as one stop on it rather than the front door. Ports
// you go ashore at, waters you fish. See chart.ts for the layout and SeaMap.tsx
// for why it is painted 2D rather than an engine.
//
// ADMIN ONLY while it finds its feet, the same way Chapter 4 shipped. It is not
// the landing page yet and should not become one until it has been lived with.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { getEffectiveRod } from '@/lib/rods'
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
import { loadDeployedParty } from '@/lib/crewData'
import { getRaidItem } from '@/lib/raidItems'
import { componentsAvailable } from '@/lib/seaPortal'
import { RODS } from '@/lib/rods'
import SeaMap from './SeaMap'
import { dealtToday } from './traderActions'
import { getDiscoveries } from './isleActions'
import { getDigState } from './digActions'
import { getHomestead } from '../home/actions'
import { gauntletAutoCatchMaxRarity } from '@/lib/gauntletUpgrades'
import { getCachedFishSpecies } from '@/lib/fishSpecies'
import { vigilFor } from '@/lib/ancientVigil'
import { getTrawlState } from '../fishing/trawls/actions'
import { getRenownState } from '../actions/renown'

export const metadata = { title: 'The Sea' }

export default async function SeaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')

  // EVERYTHING THE DIAL NEEDS TO BE THE REAL DIAL. buildFishZones takes the
  // same modifiers on the map as it does on the fishing screen, because a fish
  // must not be easier or harder depending on which surface you cast from.
  const rod = getEffectiveRod(
    Number(profile?.rod_tier ?? 0),
    (profile?.completionist_effects as number[] | null) ?? null,
  )
  const line = getLine(Number(profile?.line_tier ?? 0))

  const admin = createAdminClient()

  // THE SHIP'S CAPACITY, worked out once and shared: the party loader caps by
  // it, and the dock draws the empty seats — the whole point of a muster is
  // that an empty seat is VISIBLE.
  const raidSeats =
    (EXPEDITION_SHIP_STATS[Number(profile?.ship_tier ?? MIN_SHIP_TIER)]?.crewSlots ?? 1)
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).crewSlots
    + (profile?.has_sixth_berth === true ? 1 : 0)
  const itemMounts =
    raidItemSlotsForTier(Number(profile?.ship_tier ?? MIN_SHIP_TIER))
    + classSlotBonuses(profile?.ship_classes as Record<string, string> | null).itemSlots
    + (profile?.has_armory_expansion === true ? 1 : 0)

  // ── THE COLLECTION LOG ────────────────────────────────────────────────
  // The same drawer the fishing page shows, so it needs the same reference
  // data. Species come from the long-TTL cross-request cache, not a per-view
  // query — this page is as hot as the fishing screen.
  // ── EVERYTHING, AT ONCE ───────────────────────────────────────────────
  //
  // These were ten separate awaits, one under the other, each a full roundtrip
  // to the database — the page could not start rendering until the last of a
  // chain of eight-to-ten serial queries came home, none of which needed any
  // other's answer. At 20-50ms a hop that was 200-500ms of TTFB spent on
  // nothing but waiting in single file.
  //
  // Every read here is independent per-user state. The only ordering that
  // exists at all is `trawlsOut`, which derives from trawlState SYNCHRONOUSLY
  // after the batch lands.
  const [
    allSpecies, { data: collectionRows }, { data: pbRows }, raidPartyRows,
    { data: baitRows }, dealt, discovered, digs, homestead, renown, trawlState,
    { data: finaleRow }, { data: holdRows },
  ] = await Promise.all([
    getCachedFishSpecies(),
    admin.from('fish_collection').select('fish_id, is_golden').eq('user_id', user.id),
    admin.from('fish_personal_bests').select('fish_id, best_length_in').eq('user_id', user.id),
    // WHO WOULD ACTUALLY SAIL. The dock is where the crew is CONFIRMED, so it
    // gets the party itself — faces and names, not a count. Same loader every
    // raid uses, so what the dock shows is exactly what would board.
    loadDeployedParty(admin, user.id, raidSeats, 'raid'),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    dealtToday(),
    getDiscoveries(),
    getDigState(),
    getHomestead(),
    getRenownState('fishing'),
    getTrawlState(),
    // THE LONG VIGIL's gate, for the collection log's Ancient Deep block.
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_sunken_hand').limit(1).maybeSingle(),
    admin.from('fish_inventory').select('quantity').eq('user_id', user.id),
  ])

  // Bait: whatever they have most of, which is almost always what they would
  // have picked anyway. Choosing it properly is the full screen's job.
  const best = ((baitRows ?? []) as { bait_type: string; quantity: number }[])
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)[0]
  const baitType = best?.bait_type ?? 'worm'
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id)
  const mountedFishIds = (collectionRows ?? [])
    .filter((r: { is_golden: boolean }) => r.is_golden)
    .map((r: { fish_id: number }) => r.fish_id)
  const personalBests: Record<number, number> = {}
  for (const r of (pbRows ?? []) as { fish_id: number; best_length_in: number }[]) {
    personalBests[r.fish_id] = Number(r.best_length_in)
  }

  // WHO IS OUT, WHERE, AND WHEN THEY ARE DUE. This threw everything but the
  // clock away, which was enough to count how many are coming and nothing else
  // — so the chart could say "2 crew back" and not which two, or from where.
  const trawlsOut = 'error' in trawlState
    ? []
    : trawlState.zones
        .filter(z => z.trawl?.endsAt)
        .map(z => ({
          zone: z.label,
          endsAt: z.trawl!.endsAt as string,
          crew: z.trawl!.crew.name,
          art: z.trawl!.crew.filename,
        }))

  // ── THE SPECIALS THE CLIENT DRIVES ────────────────────────────────────
  // Phantom Hook, Perfected Sigil and the Primeval Eye need nothing here: the
  // server reads them off the profile inside castLine and reelIn, so they have
  // been applying out here all along. These three are behaviour rather than
  // effect, so they have to be carried.
  const equippedSpecial = (profile?.equipped_special as string | null) ?? null
  const hasCatcher = profile?.has_auto_catcher === true
  const hasCaster = profile?.has_auto_caster === true
  // THE CATCHER IS AN UPGRADE OF THE CASTER, not a second thing you equip.
  // specialItems declares it `upgradeOf: 'auto_caster'`, so a captain who owns
  // both still has 'auto_caster' sitting in the slot and has_auto_catcher is
  // what raises the tier. This asked for `equipped_special === 'auto_catcher'`
  // before, which is a value almost nobody has — so the Auto Catcher never
  // engaged at sea no matter what you owned or equipped.
  //
  // Ownership of the CASTER gates both tiers, matching FishingGame exactly.
  // Legacy rows that really do say 'auto_catcher' resolve the same way.
  const autoTier: 0 | 1 | 2 =
    ((equippedSpecial === 'auto_caster' || equippedSpecial === 'auto_catcher') && hasCaster)
      ? (hasCatcher ? 2 : 1)
      : 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const ttUsed = profile?.tide_turner_date === todayStr ? Number(profile?.tide_turner_used ?? 0) : 0

  // THE HOLD. Same two numbers the fishing screen shows: what is aboard and
  // what it can take. Without them the map lets you fish until a catch silently
  // stops being banked, which is the one failure a hold is supposed to warn you
  // about before it happens.
  const holdCount = ((holdRows ?? []) as { quantity: number }[])
    .reduce((n, r) => n + (r.quantity ?? 0), 0)
  const holdCapacity = getFishHold(Number(profile?.fish_hold_tier ?? 0)).capacity

  // ── WHAT IS ON THE BOAT ───────────────────────────────────────────────
  // The rack, resolved. Only these rods can be swapped to at sea — that is the
  // whole point of the Shipyard, and it is enforced here rather than trusted
  // from the client. Every entry is a rod the player owns; the equipped one is
  // always first because it is in their hands rather than in a berth.
  const rodTierNow = Number(profile?.rod_tier ?? 0)
  const aboardTiers = rodsAboard(
    rodTierNow,
    (profile?.rods_aboard as number[] | null) ?? null,
    Number(profile?.rod_rack_tier ?? 0),
  )
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
  const pet = PETS.find(p => p.id === equippedPet) ?? null

  return (
    <SeaMap
      fishingXP={Number(profile?.fishing_xp ?? 0)}
      userId={user.id}
      tour={{
        seen: profile?.has_seen_sea_tour === true,
        // Where the first voyage got to. It leaves the chart for the market,
        // so it has to resume rather than restart.
        step: Number(profile?.sea_tour_step ?? 0),
        hints: (profile?.sea_hints_seen as string[] | null) ?? [],
      }}
      characterColor={(profile?.character_color as string | null) ?? 'default'}
      boatId={(profile?.equipped_boat as string | null) ?? null}
      hatId={(profile?.equipped_hat as string | null) ?? null}
      // THE WHOLE RIG. You are fishing here, so what is in your hands should be
      // what you actually own — the same rod, reel and hook the fishing screen
      // draws, at the same overlay coordinates.
      gear={{
        // RODS COME IN TWO FLAVOURS and I only handled one, which is why the
        // Lightsaber never appeared. A `slug` rod has three per-frame files
        // (rod_lightsaber_rest/wait/cast.png); an `imageUrl` rod has a single
        // image reused across frames. Every high tier is a slug rod, so the
        // players most likely to notice were the only ones seeing nothing.
        rodSlug: rod.slug ?? null,
        rod: rod.imageUrl ?? null,
        rodGlow: rod.glow ? (rod.glowType ?? 'default') : null,
        rodColor: rod.color ?? null,
        reel: getReel(Number(profile?.reel_tier ?? 0)).imageUrl ?? null,
        hook: getHook(Number(profile?.hook_tier ?? 0)).imageUrl ?? null,
        pet: pet?.species ?? null,
        petArt: pet?.restImageUrl ?? null,
      }}
      bait={baitType}
      // THE WHOLE BAG, not just the one type the page picked. The bait row lets
      // you switch mid-session, so it needs everything aboard.
      hold={{ count: holdCount, capacity: holdCapacity }}
      rack={rack}
      // The hull tier only ever changes how fast you cross the chart.
      hullSpeed={hullSpeed(Number(profile?.hull_speed_tier ?? 0))}
      // THE SHIP YOU OWN, for the water beyond the anchorage. Not the fishing
      // boat: past the sortie the hull under you is the one the expedition
      // ladder sells, which is the whole point of the crossing.
      shipTier={Number(profile?.ship_tier ?? MIN_SHIP_TIER)}
      // The party and the mounts, for the dock's confirm. Names and art only:
      // the chart shows the muster, the raid screens do the maths.
      raidParty={raidPartyRows.map(c => ({ name: c.name, art: c.filename }))}
      raidItems={((profile?.equipped_raid_items as string[] | null) ?? [])
        .map(id => getRaidItem(id))
        .filter((d): d is NonNullable<typeof d> => !!d)
        .map(d => ({ name: d.name, image: d.image }))}
      raidSeats={raidSeats}
      itemMounts={itemMounts}
      // Sailing a sunk ship is refused at the raid screen; the DOCK is where
      // that should be discovered, not past the sortie.
      raidRepairOwed={Number(profile?.raid_repair_owed ?? 0)}
      // THE HOMESTEAD PORTAL. Components are chests already opened — derived
      // from the same discoveries list the chart is already being handed.
      portal={{
        tier: Number(profile?.portal_tier ?? 1),
        components: componentsAvailable(discovered, Number(profile?.portal_components_spent ?? 0)),
      }}
      // The two new movement ladders. Passed as TIERS rather than as computed
      // rates: the map multiplies them by the boat's own trim, and doing half
      // that sum here and half there is how the two drift apart.
      handlingTier={Number(profile?.hull_handling_tier ?? 0)}
      accelTier={Number(profile?.hull_accel_tier ?? 0)}
      // WHERE YOU LEFT OFF. Null on a profile that has never sailed, and the
      // map falls back to HOME — which is also what happens if either half is
      // missing, because half a position is not one.
      trawlsOut={trawlsOut}
      renown={renown}
      // The fog, as stored. Decoded on the client — the bitfield is the
      // record and the map is the only thing that reads it.
      exploredRaw={(profile?.sea_explored as string | null) ?? null}
      discovered={discovered}
      digs={digs}
      homestead={homestead}
      // WHAT STANDS ON THE CREW HALL'S ISLAND. Three tiers off the profile, and
      // the island renders whichever art the captain has paid for — the same
      // shape the Homestead's buildings already take.
      crewTiers={{
        hall: Number(profile?.crew_hall_tier ?? 1),
        drill: Number(profile?.crew_drill_level ?? 1),
        stores: Number(profile?.crew_stores_level ?? 1),
      }}
      log={{
        allFishSpecies: allSpecies ?? [],
        caughtFishIds, mountedFishIds, personalBests,
        prestigeLevels: (profile?.prestige_levels as Record<string, number> | null) ?? {},
        goldenBoosts: (profile?.zone_golden_boost as Record<string, number> | null) ?? {},
        ancientCatches: (profile?.ancient_catches as number[] | null) ?? [],
        ancientVigil: vigilFor(profile?.ancient_vigil, (profile?.ancient_catches as number[] | null)),
        // Self-enforcing, same as the fishing page: One Last Ride carries
        // requiresAncients: 6, so clearing it means the wall was full.
        vigilUnlocked: !!finaleRow,
        zoneRewardsClaimed: {
          shallows:    profile?.zone_shallows_rewarded    ?? false,
          open_waters: profile?.zone_open_waters_rewarded ?? false,
          deep:        profile?.zone_deep_rewarded        ?? false,
          abyss:       profile?.zone_abyss_rewarded       ?? false,
        },
      }}
      // WHERE YOU COME IN. The saved position is a FISHING position — it is
      // written as you sail the southern chart — so it means nothing on the far
      // side of the reef. Arriving there puts you just north of the arch you
      // came through, facing open water, which is also the way back.
      start={profile?.sea_x != null && profile?.sea_y != null
        ? { x: Number(profile.sea_x), y: Number(profile.sea_y) }
        : null}
      // Which sea that position is in. Without it a saved northern position is
      // ambiguous, which is why one was never saved at all.
      startSide={((profile?.sea_side as string | null) ?? 'fishing') as 'fishing' | 'anchorage' | 'moored' | 'open'}
      baitBag={((baitRows ?? []) as { bait_type: string; quantity: number }[])
        .filter(b => b.quantity > 0)
        .map(b => ({ type: b.bait_type, quantity: b.quantity }))
        .sort((a, b) => b.quantity - a.quantity)}
      baitQty={best?.quantity ?? 0}
      dealtToday={dealt}
      auto={{
        tier: autoTier,
        // WHETHER IT IS SWITCHED ON, as they last left it. Owning the item and
        // wanting it running are different things.
        on: profile?.auto_fishing_on === true,
        maxRarity: gauntletAutoCatchMaxRarity(profile?.gauntlet_upgrades as string[] | null),
      }}
      tideTurner={{
        // OWNING IT IS NOT CARRYING IT. This read `has_tide_turner` alone, so
        // the skip was offered at sea to anyone who had ever bought the thing,
        // equipped or not — while the fishing screen has always required it in
        // the special slot. The auto tier four lines above already gates on
        // `equippedSpecial`; this is the same rule, which was simply missed.
        //
        // Slot 1 only, matching FishingGame: the second special slot exists but
        // is not consulted for behaviour items on either screen, and making the
        // sea the one place it counts would be a new rule, not a fix.
        has: profile?.has_tide_turner === true && equippedSpecial === 'tide_turner',
        // 3/day, matching useTideTurnerSkip's own guard. The date string is
        // built the same way the server builds it (UTC ISO date), or the count
        // shown here would disagree with the one enforced there.
        left: Math.max(0, 3 - ttUsed),
      }}
      mods={{
        // The reel's needle-speed multiplier. Without it every reel tier was
        // identical out here and the dial ran at a flat speed for every fish.
        reelSpeedMult: getReel(Number(profile?.reel_tier ?? 0)).needleSpeedMultiplier,
        hookTier: Number(profile?.hook_tier ?? 0),
        linePenalty: line.penaltyMultiplier,
        reelTier: Number(profile?.reel_tier ?? 0),
        lineTier: line.tier,
        rodCatchBonus: rod.catchZoneBonus ?? 0,
        // Three rod effects the fishing screen implements CLIENT-side, which is
        // why the map silently did not have them.
        rodRetryOnMiss: rod.retryOnMissChance ?? 0,
        rodSnagImmune: rod.snagImmune === true,
        rodPerfectXpMult: rod.perfectXpMult ?? 1,
        rodPerfectBonus: rod.perfectZoneBonus ?? 0,
        fishingLevel: getLevelFromXP(Number(profile?.fishing_xp ?? 0)),
      }}
    />
  )
}
