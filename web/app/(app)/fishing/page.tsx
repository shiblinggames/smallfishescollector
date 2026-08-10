import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import FishingPageClient from './FishingPageClient'
import { getDailyChallenge } from './dailyChallengeActions'
import { settlePendingCatchCredit } from './actions'
import { isPremiumActive } from '@/lib/premium'
import { getCharacterSprites, earnedLevelColors, earnedAchievementColors } from '@/lib/characters'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import { getLevelFromXP as fishLevelFromXP } from '@/lib/fishingLevel'
import { EXCHANGE_FISHING_LEVEL, EXCHANGE_UNDER_CONSTRUCTION } from '@/lib/fishExchange'
import type { TickerItem } from '@/components/MarketTicker'
import { getLevelFromXP as navLevelFromXP } from '@/lib/expeditionLevel'
import { getBoat, earnedAchievementBoats } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { getRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { catchXP } from '@/lib/fishingLevel'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { getCachedFishMarket } from '@/lib/fishMarket'
import { getCachedFishSpecies } from '@/lib/fishSpecies'
import type { ZoneStat } from './ZoneLanding'

export default async function FishingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // A Wormhole catch holds its species credit until the player either rerolls
  // or casts again. Backing out of a zone calls router.refresh(), so without
  // this the Logbook below would re-seed from a fish_collection that has not
  // been written yet and the fish they just caught would read one lower (or
  // missing, if it was a new species) until their next cast. Awaited, not
  // fired-and-forgotten, so the reads further down see the settled row.
  // Costs no extra query: it reads the same request-cached profile this page
  // already loads, and only writes when a credit is actually pending. The
  // trade for that is that the cached profile below is the PRE-settle
  // snapshot, so a settle that happens to cross a line-tier boundary shows
  // the old tier for this one render. fish_collection is queried after this
  // await, so the Logbook counts (the thing players noticed) are correct.
  await settlePendingCatchCredit()

  // Kicked off now so it overlaps the page's other queries (this page is hot).
  // Gates the achievement-earned skins (Galaxy/Ethereal) in the picker.
  const achievementPointsPromise = getUserAchievementPoints(user.id)

  // Profile comes from the request-scoped cached loader (lib/userData.ts) so
  // any other server component in this render that needs profile shares this
  // single fetch instead of issuing its own.
  const [
    dailyChallenge,
    profile,
    { data: baitInventory },
    { data: fishInventory },
    { count: uniqueSpeciesCaught },
    { data: rodRows },
    allSpecies,
    { data: collectionRows },
    marketRows,
    { data: pbRows },
    { data: ch3Row },
    { data: lifetimeRows },
    { data: marketState },
  ] = await Promise.all([
    getDailyChallenge(),
    getCurrentProfile(),
    admin.from('bait_inventory')
      .select('bait_type, quantity')
      .eq('user_id', user.id),
    admin.from('fish_inventory')
      .select('fish_id, quantity, fish_species(*)')
      .eq('user_id', user.id)
      .gt('quantity', 0),
    admin.from('fish_collection')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    admin.from('rod_inventory')
      .select('rod_tier')
      .eq('user_id', user.id),
    // Static species reference data, served from the long-TTL cache.
    getCachedFishSpecies(),
    admin.from('fish_collection')
      .select('fish_id, is_golden, catch_count')
      .eq('user_id', user.id),
    // Fish market is public + shared; served from the cross-request cache
    // (lib/fishMarket) so the hot fishing screen isn't a DB read per view.
    getCachedFishMarket(),
    // Personal-best lengths per species — read-only seed for the collection
    // drawer. New PBs during the session are updated client-side in state so
    // the drawer reflects them without a page refresh.
    admin.from('fish_personal_bests')
      .select('fish_id, best_length_in')
      .eq('user_id', user.id),
    // Chapter 3 clear (defeated the Quartermaster) — the second gate on the
    // Ancient Deep, alongside Fishing 75.
    admin.from('raid_completions')
      .select('id').eq('user_id', user.id).eq('raid_id', 'the_quartermaster').limit(1).maybeSingle(),
    // The Almanac's own numbers. fish_collection is the prestige CYCLE log and
    // gets wiped; the hub card was reading it and so disagreed with the book it
    // links to the moment anyone prestiged.
    admin.from('fish_lifetime').select('fish_id, catches').eq('user_id', user.id),
    admin.from('market_state').select('mood, next_update_at').eq('id', 1).maybeSingle(),
  ])

  const marketMultipliers: Record<number, number> = {}
  for (const row of (marketRows ?? []) as { fish_id: number; multiplier: number | string }[]) {
    marketMultipliers[row.fish_id] = Number(row.multiplier)
  }
  const isPremium = isPremiumActive(profile)
  // ── Almanac card numbers ──────────────────────────────────────────────────
  // These have to match The Angler's Almanac exactly, because the card is the
  // door to it. Both halves were wrong: it counted fish_collection, which a
  // prestige deletes, against all 152 species including the six Ancient Deep
  // trophies that live in the Giants room and never appear in the Collection.
  //
  // Same rules as almanacActions.getAlmanacData: lifetime catches, the ancient
  // ledger, and a prestige, which only happens once a zone is fully collected
  // and so proves you caught every species in it.
  // Built HERE from collectionRows rather than reusing the caughtSet further
  // down the file: that one is declared after this block, so referencing it
  // threw a temporal-dead-zone ReferenceError and took the whole page down.
  const cycleCaught = new Set((collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id))
  const lifetimeCaught = new Set((lifetimeRows ?? [])
    .filter((r: { catches: number }) => (r.catches ?? 0) > 0)
    .map((r: { fish_id: number }) => r.fish_id))
  const ancientSet = new Set((profile?.ancient_catches as number[] | null) ?? [])
  const prestigeMap = (profile?.prestige_levels as Record<string, number> | null) ?? {}
  const collectableSpecies = ((allSpecies ?? []) as { id: number; habitat: string; sell_value: number }[])
    .filter(f => !(f.habitat === 'ancient_deep' && f.sell_value === 0))
  const speciesTotal = collectableSpecies.length
  const speciesCaught = collectableSpecies.filter(f =>
    lifetimeCaught.has(f.id)
    || cycleCaught.has(f.id)
    || ancientSet.has(f.id)
    || (prestigeMap[f.habitat] ?? 0) > 0).length

  // ── Market card ───────────────────────────────────────────────────────────
  // What the hold is WORTH at today's prices, which is the number the market's
  // own portfolio leads with. "23 fish" told you nothing about whether it was
  // worth the trip.
  const holdValue = ((fishInventory ?? []) as unknown as { fish_id: number; quantity: number; fish_species: { sell_value: number } }[])
    .reduce((n, r) => n + r.quantity * (r.fish_species?.sell_value ?? 0) * (marketMultipliers[r.fish_id] ?? 1), 0)
  const marketMood = (marketState?.mood as string | null) ?? 'calm'
  // When the board turns over. The Market tile counts down to it rather than
  // reporting the hold, which the hold's own screen already does better.
  const marketNextUpdate = (marketState?.next_update_at as string | null)
    ?? new Date(Date.now() + 3600_000).toISOString()



  // Ancient Deep unlock — Fishing 75 AND Chapter 3 cleared (or grandfathered via
  // has_ancient_deep_access). Drives the zone selector's lock so a player can't
  // pick a zone the server would reject. Mirrors the gate in actions.ts castLine.
  const ancientDeepUnlocked =
    profile?.has_ancient_deep_access === true
    || (fishLevelFromXP(profile?.fishing_xp ?? 0) >= 75 && !!ch3Row)

  // Fishing 100 opens the Exchange, and it opens INSIDE the market, two taps
  // from here. Without a word on the hub tile a captain can cap the skill and
  // never find out anything changed. Cleared the moment they read the
  // announcement, so it says something new or says nothing.
  // Shut while the board is rebuilt, so the hub stops advertising it: no index
  // ticks on the strip, no contract count on the Market tile, and no unveil
  // announcement for a room nobody can walk into.
  const exchangeOpen = !EXCHANGE_UNDER_CONSTRUCTION
    && fishLevelFromXP(profile?.fishing_xp ?? 0) >= EXCHANGE_FISHING_LEVEL
  const exchangeUnveil = exchangeOpen && profile?.has_seen_exchange_intro !== true

  // ── The market ticker ─────────────────────────────────────────────────────
  // Costs no extra query for the fish half: marketRows and the collection are
  // already loaded above for the hold value and the Almanac card.
  //
  // Only species you have DISCOVERED, so the strip never spoils a fish you have
  // not met. Lifetime union cycle, not fish_collection alone: that table is the
  // prestige cycle log and gets wiped, so the old Tavern strip went quiet for
  // exactly the players who had fished the most.
  const tickerSeen = new Set([...lifetimeCaught, ...cycleCaught])
  const fishTicks: TickerItem[] = ((marketRows ?? []) as unknown as {
    fish_id: number; multiplier: number; prev_multiplier: number
    fish_species: { name: string; sell_value: number } | null
  }[])
    .filter(r => r.fish_species != null && tickerSeen.has(r.fish_id))
    .map(r => {
      const mult = Number(r.multiplier)
      const prev = Number(r.prev_multiplier)
      return {
        name: r.fish_species!.name,
        price: Math.floor(r.fish_species!.sell_value * mult * 0.97),
        pct: prev > 0 ? ((mult - prev) / prev) * 100 : 0,
        kind: 'fish' as const,
      }
    })
    .sort((a, b) => b.price - a.price)

  // The Exchange's indexes ride the same strip once the board is open to you.
  // One extra read, and only for captains at the Fishing cap.
  let indexTicks: TickerItem[] = []
  // Contracts still running, for the Market tile. Rides the SAME gated trip as
  // the index ticks rather than adding a second one, and stays zero for every
  // captain below the Fishing cap.
  let openContracts = 0
  if (exchangeOpen) {
    // The REBUILT board: exchange_indexes and exchange_bets, not the retired
    // funds and positions. Only the WATERS ride the strip: the whole board is 28
    // instruments and a ticker is a glance, not a list.
    const [{ data: idxRows }, { count: running }] = await Promise.all([
      admin.from('exchange_indexes').select('name, price, prev_price').eq('family', 'zone'),
      admin.from('exchange_bets').select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('status', 'open'),
    ])
    openContracts = running ?? 0
    indexTicks = (idxRows ?? [])
      .map(f => {
        const price = Number(f.price)
        const prev = Number(f.prev_price)
        return {
          name: f.name as string,
          price,
          pct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
          kind: 'index' as const,
        }
      })
      .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))
  }

  // Indexes lead: they are the summary of the whole board, and a captain who
  // has them is reading the strip for the market rather than for one fish.
  const tickerItems: TickerItem[] = [...indexTicks, ...fishTicks]

  // Union earned-but-ungranted level colors into the GearScreen picker (e.g.
  // crossed Nav 50 via raids without the voyage grant firing). Equipping one
  // persists the unlock server-side. Mirrors the profile page.
  const storedColors = (profile?.unlocked_character_colors as string[] | null) ?? []
  // Earned but not yet persisted (level/combo/achievement). These both feed the
  // picker's unlocked set AND drive the one-time "Skin Unlocked" toast on mount;
  // the client persists them via persistEarnedSkins so they don't re-announce.
  const achievementPoints = await achievementPointsPromise
  const newlyUnlockedSkins = [
    ...earnedLevelColors({
      fishingLevel: fishLevelFromXP(profile?.fishing_xp ?? 0),
      navLevel:     navLevelFromXP(profile?.expedition_xp ?? 0),
      maxPrestige:  Math.max(0, ...Object.values((profile?.prestige_levels as Record<string, number> | null) ?? {})),
    }, storedColors),
    ...earnedAchievementColors(achievementPoints, storedColors),
  ]
  const unlockedCharacterColors = [...storedColors, ...newlyUnlockedSkins]
  // Same treatment for achievement-earned boats (Celestial/Abyssal): union them
  // into the picker's unlocked set so they show earned; equipping persists it.
  const storedBoats = (profile?.unlocked_boats as string[] | null) ?? []
  const newlyUnlockedBoats = earnedAchievementBoats(achievementPoints, storedBoats)
  const unlockedBoats = [...storedBoats, ...newlyUnlockedBoats]

  // Per-zone summary stats for the zone selector cards (avg sell value, avg
  // catch XP, top catch). Ancient Deep trophies pay 3× XP (see actions.ts).
  const ALL_ZONES = ['shallows', 'open_waters', 'deep', 'abyss', 'ancient_deep']
  const zoneAgg: Record<string, { value: number; xp: number; top: number; n: number }> = {}
  for (const f of (allSpecies ?? []) as { habitat: string; sell_value: number; catch_difficulty: number }[]) {
    if (!ALL_ZONES.includes(f.habitat)) continue
    const a = zoneAgg[f.habitat] ?? (zoneAgg[f.habitat] = { value: 0, xp: 0, top: 0, n: 0 })
    a.value += f.sell_value
    a.xp += catchXP(f.catch_difficulty, f.habitat, false) * (f.habitat === 'ancient_deep' ? 3 : 1)
    a.top = Math.max(a.top, f.sell_value)
    a.n++
  }
  const zoneStats: Record<string, ZoneStat> = {}
  for (const z of ALL_ZONES) {
    const a = zoneAgg[z]
    zoneStats[z] = a && a.n > 0
      ? { avgValue: Math.round(a.value / a.n), avgXp: Math.round(a.xp / a.n), topValue: a.top, count: a.n }
      : { avgValue: 0, avgXp: 0, topValue: 0, count: 0 }
  }

  const ownedRods = (rodRows ?? []).map((r: { rod_tier: number }) => r.rod_tier)
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number; is_golden: boolean }) => r.fish_id)
  const mountedFishIds = (collectionRows ?? [])
    .filter((r: { fish_id: number; is_golden: boolean }) => r.is_golden)
    .map((r: { fish_id: number; is_golden: boolean }) => r.fish_id)
  const fishHoldTier = profile?.fish_hold_tier ?? 0
  // Flat fish_id → inches lookup for the collection drawer. Numeric coercion
  // because Supabase returns NUMERIC columns as strings.
  const personalBests: Record<number, number> = {}
  for (const r of (pbRows ?? []) as { fish_id: number; best_length_in: number | string }[]) {
    personalBests[r.fish_id] = Number(r.best_length_in)
  }
  // Total lifetime catches per species — surfaced alongside the PB length in
  // the collection detail modal. New catches during the session bump this
  // client-side so the modal reflects them without a refresh.
  const catchCounts: Record<number, number> = {}
  for (const r of (collectionRows ?? []) as { fish_id: number; catch_count: number | string }[]) {
    catchCounts[r.fish_id] = Number(r.catch_count)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner ?? false
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  const tideTurnerSkipsLeft = hasTideTurner ? Math.max(0, 3 - usedToday) : 0
  const hasPhantomHook = profile?.has_phantom_hook ?? false
  const hasAutoCaster = profile?.has_auto_caster ?? false
  const hasAutoCatcher = profile?.has_auto_catcher ?? false
  const gauntletDeepest = profile?.gauntlet_deepest ?? 0
  // Account/world Locker perks apply from EITHER gauntlet (e.g. Tireless Catcher
  // in Davy's, Relentless Catcher in Don's), so fishing reads the union.
  const gauntletUpgrades = [
    ...((profile?.gauntlet_upgrades as string[] | null) ?? []),
    ...((profile?.dons_gauntlet_upgrades as string[] | null) ?? []),
  ]
  const hasPerfectedSigil = profile?.has_perfected_sigil ?? false
  const characterColor = profile?.character_color ?? 'default'

  // Preload the player's active character sprites + equipped cosmetics so
  // they're warm in the browser cache by the time FishingGame mounts —
  // otherwise the character flickers in after navigation. Only the
  // CURRENT player's assets are preloaded (not all colors / all hats /
  // all boats) to keep total preload bytes minimal.
  const charSprites = getCharacterSprites(characterColor)
  const equippedBoatDef = getBoat((profile?.equipped_boat as string | null) ?? null)
  const equippedHatDef  = getHat((profile?.equipped_hat as string | null) ?? null)
  const equippedRodDef  = getRod(profile?.rod_tier ?? 0)
  const equippedReelDef = getReel(profile?.reel_tier ?? 0)
  const preloads: string[] = [
    charSprites.rest, charSprites.wait, charSprites.cast,
    ...(equippedBoatDef ? [equippedBoatDef.restImageUrl, equippedBoatDef.castImageUrl] : []),
    ...(equippedHatDef  ? [equippedHatDef.restImageUrl,  equippedHatDef.castImageUrl ] : []),
    ...(equippedRodDef.slug
      ? [`/${equippedRodDef.slug}_rest.png`, `/${equippedRodDef.slug}_wait.png`, `/${equippedRodDef.slug}_cast.png`]
      : []),
    ...(equippedReelDef.imageUrl ? [equippedReelDef.imageUrl] : []),
  ]

  return (
    <>
      {/* Image preload hints — React 19 hoists these into <head>. Loading and
          decoding starts as the page HTML streams in, so by the time the player
          picks a zone the character + cosmetics are ready.

          LOW PRIORITY, and that is the whole point. These are up to ten PNGs and
          the character sprites alone run 240-320KB each, so at default priority
          they were close to a megabyte of images racing the page's own scripts
          on a cold load — the fishing hub sat black for about five seconds while
          expeditions, which preloads nothing and ships MORE JavaScript, painted
          in one. Nothing here is needed to render the hub; it is all warming for
          a zone the player has not picked yet, so it must never outrank the
          things that paint. fetchPriority keeps the warming and drops the race. */}
      {preloads.map(href => (
        <link key={href} rel="preload" as="image" href={href} fetchPriority="low" />
      ))}
      <main>
        <FishingPageClient
          hookTier={profile?.hook_tier ?? 0}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          initialDoubloons={profile?.doubloons ?? 0}
          initialGems={profile?.gems ?? 0}
          initialFathoms={profile?.gauntlet_fathoms ?? 0}
          initialFishingXP={profile?.fishing_xp ?? 0}
          initialBait={baitInventory ?? []}
          initialLastUsedBait={(profile?.last_used_bait as string | null) ?? null}
          initialInventory={(fishInventory ?? []) as unknown as {
            fish_id: number
            quantity: number
            fish_species: {
              id: number; name: string; scientific_name: string
              description: string | null; fun_fact: string; habitat: string
              bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
            }
          }[]}
          fishHoldTier={fishHoldTier}
          unlockedBadges={(profile?.unlocked_badges as string[] | null) ?? []}
          uniqueSpeciesCaught={uniqueSpeciesCaught ?? 0}
          zoneStats={zoneStats}
          ancientDeepUnlocked={ancientDeepUnlocked}
          ownedRods={ownedRods}
          initialCompletionistEffects={(profile?.completionist_effects as number[] | null) ?? []}
          initialHasForgedBefore={profile?.has_seen_forge_flourish === true}
          allFishSpecies={(allSpecies ?? []) as { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number; length_min_in: number | null; length_max_in: number | null }[]}
          caughtFishIds={caughtFishIds}
          mountedFishIds={mountedFishIds}
          initialPersonalBests={personalBests}
          initialCatchCounts={catchCounts}
          initialHighestPerfectStreak={profile?.highest_perfect_streak ?? 0}
          initialPerfectStreak={profile?.catch_pending ? 0 : (profile?.current_perfect_streak ?? 0)}
          initialStreakZone={(profile?.current_streak_zone as string | null) ?? null}
          hubSpeciesCaught={speciesCaught}
          hubSpeciesTotal={speciesTotal}
          hubMarketMood={marketMood}
          hubMarketNextUpdate={marketNextUpdate}
          hubOpenContracts={openContracts}
          hubExchangeUnveil={exchangeUnveil}
          hubTicker={tickerItems}
          hasSeenFishingHubTour={profile?.has_seen_fishing_hub_tour ?? false}
          hasSeenFishingTour={profile?.has_seen_fishing_tour ?? false}
          hasSeenFishingCatchTour={profile?.has_seen_fishing_catch_tour ?? false}
          hasSeenFirstCatchCelebration={profile?.has_seen_first_catch_celebration ?? false}
          initialShowWaitTimer={(profile as { show_wait_timer?: boolean } | null)?.show_wait_timer ?? true}
          initialDailyChallenge={dailyChallenge}
          username={profile?.username ?? ''}
          zoneRewardsClaimed={{
            shallows:    profile?.zone_shallows_rewarded    ?? false,
            open_waters: profile?.zone_open_waters_rewarded ?? false,
            deep:        profile?.zone_deep_rewarded        ?? false,
            abyss:       profile?.zone_abyss_rewarded       ?? false,
          }}
          hasTideTurner={hasTideTurner}
          initialTideTurnerSkipsLeft={tideTurnerSkipsLeft}
          initialEquippedSpecial={(profile?.equipped_special as string | null) ?? null}
          initialEquippedSpecial2={(profile?.equipped_special_2 as string | null) ?? null}
          hasDeepReel={profile?.finn_spoil_free === 'fishing' || profile?.finn_spoil_paid === 'fishing'}
          hasAnglersPatience={profile?.has_anglers_patience === true}
          anglersPatienceXp={Number(profile?.anglers_patience_xp ?? 0)}
          hasPhantomHook={hasPhantomHook}
          hasAutoCaster={hasAutoCaster}
          hasAutoCatcher={hasAutoCatcher}
          gauntletDeepest={gauntletDeepest}
          gauntletUpgrades={gauntletUpgrades}
          hasPerfectedSigil={hasPerfectedSigil}
          prestigeLevels={(profile?.prestige_levels as Record<string, number> | null) ?? {}}
          goldenBoosts={(profile?.zone_golden_boost as Record<string, number> | null) ?? {}}
          ancientCatches={(profile?.ancient_catches as number[] | null) ?? []}
          characterColor={characterColor}
          unlockedCharacterColors={unlockedCharacterColors}
          newlyUnlockedSkins={newlyUnlockedSkins}
          equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
          marketMultipliers={marketMultipliers}
          isPremium={isPremium}
          equippedBoat={(profile?.equipped_boat as string | null) ?? null}
          unlockedBoats={unlockedBoats}
          newlyUnlockedBoats={newlyUnlockedBoats}
          equippedHat={(profile?.equipped_hat as string | null) ?? null}
          unlockedHats={(profile?.unlocked_hats as string[] | null) ?? []}
          equippedPet={(profile?.equipped_pet as string | null) ?? null}
          unlockedPets={(profile?.unlocked_pets as string[] | null) ?? []}
          initialFinnEncounters={profile?.finn_encounters ?? 0}
          initialFinnWins={profile?.finn_wins ?? 0}
          initialFinnSeenBeats={(profile?.finn_seen_beats as string[] | null) ?? []}
          initialFinnRevealed={profile?.finn_revealed ?? false}
          initialFinnLastOutcome={(profile?.finn_last_outcome as 'won' | 'lost' | 'passed' | null) ?? null}
          initialFishingRenownAlloc={(profile?.fishing_renown_alloc as Record<string, number> | null) ?? null}
          seenFishingRenownIntro={profile?.seen_fishing_renown_intro === true}
        />
      </main>
    </>
  )
}
