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
import { getEffectiveRod } from '@/lib/rods'
import { getLine } from '@/lib/lines'
import { getReel } from '@/lib/reels'
import { getHook } from '@/lib/hooks'
import { PETS } from '@/lib/pets'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { getFishHold } from '@/lib/fishHold'
import { rodsAboard, hullSpeed } from '@/lib/shipyard'
import { RODS } from '@/lib/rods'
import SeaMap from './SeaMap'
import { dealtToday } from './traderActions'
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
  if (profile?.is_admin !== true) redirect('/tavern')

  // EVERYTHING THE DIAL NEEDS TO BE THE REAL DIAL. buildFishZones takes the
  // same modifiers on the map as it does on the fishing screen, because a fish
  // must not be easier or harder depending on which surface you cast from.
  const rod = getEffectiveRod(
    Number(profile?.rod_tier ?? 0),
    (profile?.completionist_effects as number[] | null) ?? null,
  )
  const line = getLine(Number(profile?.line_tier ?? 0))

  // Bait: whatever they have most of, which is almost always what they would
  // have picked anyway. Choosing it properly is the full screen's job.
  const admin = createAdminClient()
  const { data: baitRows } = await admin
    .from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id)
  const best = ((baitRows ?? []) as { bait_type: string; quantity: number }[])
    .filter(b => b.quantity > 0)
    .sort((a, b) => b.quantity - a.quantity)[0]
  const baitType = best?.bait_type ?? 'worm'

  // ── THE COLLECTION LOG ────────────────────────────────────────────────
  // The same drawer the fishing page shows, so it needs the same reference
  // data. Species come from the long-TTL cross-request cache, not a per-view
  // query — this page is as hot as the fishing screen.
  const [allSpecies, { data: collectionRows }, { data: pbRows }] = await Promise.all([
    getCachedFishSpecies(),
    admin.from('fish_collection').select('fish_id, is_golden').eq('user_id', user.id),
    admin.from('fish_personal_bests').select('fish_id, best_length_in').eq('user_id', user.id),
  ])
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id)
  const mountedFishIds = (collectionRows ?? [])
    .filter((r: { is_golden: boolean }) => r.is_golden)
    .map((r: { fish_id: number }) => r.fish_id)
  const personalBests: Record<number, number> = {}
  for (const r of (pbRows ?? []) as { fish_id: number; best_length_in: number }[]) {
    personalBests[r.fish_id] = Number(r.best_length_in)
  }

  // Read on the server so the day's deal count survives a page reload — a cap
  // the client remembers is not a cap.
  const dealt = await dealtToday()

  // RENOWN, for the level bar. Past 100 the bar becomes a tappable chip that
  // opens the panel, and it was mounted out here without either of the props
  // that make it do anything — so a captain at max level had a readout of a
  // stat they could no longer reach.
  const renown = await getRenownState('fishing')

  // ── WHEN THE CREW GET BACK ────────────────────────────────────────────
  // TIMESTAMPS, not a count. A trawl matures on a clock, so handing the map
  // the moments they come due lets it work out how many are waiting at any
  // instant without polling the server once — a crew that finishes while you
  // are halfway to the Abyss lights the Docks up on its own.
  const trawlState = await getTrawlState()
  const trawlEndsAt = 'error' in trawlState
    ? []
    : trawlState.zones.map(z => z.trawl?.endsAt).filter((v): v is string => !!v)

  // THE LONG VIGIL's gate, for the collection log's Ancient Deep block.
  const { data: finaleRow } = await admin
    .from('raid_completions')
    .select('id').eq('user_id', user.id).eq('raid_id', 'the_sunken_hand').limit(1).maybeSingle()

  // ── THE SPECIALS THE CLIENT DRIVES ────────────────────────────────────
  // Phantom Hook, Perfected Sigil and the Primeval Eye need nothing here: the
  // server reads them off the profile inside castLine and reelIn, so they have
  // been applying out here all along. These three are behaviour rather than
  // effect, so they have to be carried.
  const equippedSpecial = (profile?.equipped_special as string | null) ?? null
  const hasCatcher = profile?.has_auto_catcher === true
  const hasCaster = profile?.has_auto_caster === true
  const autoTier: 0 | 1 | 2 =
    (equippedSpecial === 'auto_catcher' && hasCatcher) ? 2
      : (equippedSpecial === 'auto_caster' && hasCaster) ? 1
        : 0

  const todayStr = new Date().toISOString().slice(0, 10)
  const ttUsed = profile?.tide_turner_date === todayStr ? Number(profile?.tide_turner_used ?? 0) : 0

  // THE HOLD. Same two numbers the fishing screen shows: what is aboard and
  // what it can take. Without them the map lets you fish until a catch silently
  // stops being banked, which is the one failure a hold is supposed to warn you
  // about before it happens.
  const { data: holdRows } = await admin
    .from('fish_inventory').select('quantity').eq('user_id', user.id)
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
      // WHERE YOU LEFT OFF. Null on a profile that has never sailed, and the
      // map falls back to HOME — which is also what happens if either half is
      // missing, because half a position is not one.
      trawlEndsAt={trawlEndsAt}
      renown={renown}
      // The fog, as stored. Decoded on the client — the bitfield is the
      // record and the map is the only thing that reads it.
      exploredRaw={(profile?.sea_explored as string | null) ?? null}
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
      start={profile?.sea_x != null && profile?.sea_y != null
        ? { x: Number(profile.sea_x), y: Number(profile.sea_y) }
        : null}
      baitBag={((baitRows ?? []) as { bait_type: string; quantity: number }[])
        .filter(b => b.quantity > 0)
        .map(b => ({ type: b.bait_type, quantity: b.quantity }))
        .sort((a, b) => b.quantity - a.quantity)}
      baitQty={best?.quantity ?? 0}
      dealtToday={dealt}
      auto={{
        tier: autoTier,
        maxRarity: gauntletAutoCatchMaxRarity(profile?.gauntlet_upgrades as string[] | null),
      }}
      tideTurner={{
        has: profile?.has_tide_turner === true,
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
