import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import FishingPageClient from './FishingPageClient'
import { getActiveChallengeSession } from '@/app/(app)/social/challengeActions'
import { getDailyChallenge } from './dailyChallengeActions'
import { isPremiumActive } from '@/lib/premium'
import { getCharacterSprites } from '@/lib/characters'
import { getBoat } from '@/lib/boats'
import { getHat } from '@/lib/hats'
import { getRod } from '@/lib/rods'
import { getReel } from '@/lib/reels'
import { catchXP } from '@/lib/fishingLevel'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import type { ZoneStat } from './ZoneLanding'

export default async function FishingPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile comes from the request-scoped cached loader (lib/userData.ts) so
  // any other server component in this render that needs profile shares this
  // single fetch instead of issuing its own.
  const [
    activeSession,
    dailyChallenge,
    profile,
    { data: baitInventory },
    { data: fishInventory },
    { count: uniqueSpeciesCaught },
    { data: rodRows },
    { data: allSpecies },
    { data: collectionRows },
    { data: marketRows },
    { data: pbRows },
  ] = await Promise.all([
    getActiveChallengeSession(),
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
    admin.from('fish_species')
      .select('id, name, scientific_name, fun_fact, habitat, bite_rarity, sell_value, catch_difficulty')
      .order('bite_rarity'),
    admin.from('fish_collection')
      .select('fish_id')
      .eq('user_id', user.id),
    admin.from('fish_market')
      .select('fish_id, multiplier'),
    // Personal-best lengths per species — read-only seed for the collection
    // drawer. New PBs during the session are updated client-side in state so
    // the drawer reflects them without a page refresh.
    admin.from('fish_personal_bests')
      .select('fish_id, best_length_in')
      .eq('user_id', user.id),
  ])

  const marketMultipliers: Record<number, number> = {}
  for (const row of (marketRows ?? []) as { fish_id: number; multiplier: number | string }[]) {
    marketMultipliers[row.fish_id] = Number(row.multiplier)
  }
  const isPremium = isPremiumActive(profile)

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
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id)
  const fishHoldTier = profile?.fish_hold_tier ?? 0
  // Flat fish_id → inches lookup for the collection drawer. Numeric coercion
  // because Supabase returns NUMERIC columns as strings.
  const personalBests: Record<number, number> = {}
  for (const r of (pbRows ?? []) as { fish_id: number; best_length_in: number | string }[]) {
    personalBests[r.fish_id] = Number(r.best_length_in)
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner ?? false
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  const tideTurnerSkipsLeft = hasTideTurner ? Math.max(0, 3 - usedToday) : 0
  const hasPhantomHook = profile?.has_phantom_hook ?? false
  const hasAutoCaster = profile?.has_auto_caster ?? false
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
      {/* Image preload hints — React 19 hoists these into <head>. Loading
          and decoding starts as the page HTML streams in, so by the time
          the player picks a zone the character + cosmetics are ready. */}
      {preloads.map(href => (
        <link key={href} rel="preload" as="image" href={href} />
      ))}
      <main>
        <FishingPageClient
          hookTier={profile?.hook_tier ?? 0}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          initialDoubloons={profile?.doubloons ?? 0}
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
          ownedRods={ownedRods}
          allFishSpecies={(allSpecies ?? []) as { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }[]}
          caughtFishIds={caughtFishIds}
          initialPersonalBests={personalBests}
          initialHighestPerfectStreak={profile?.highest_perfect_streak ?? 0}
          initialPerfectStreak={profile?.catch_pending ? 0 : (profile?.current_perfect_streak ?? 0)}
          hasSeenFishingTour={profile?.has_seen_fishing_tour ?? false}
          hasSeenFishingCatchTour={profile?.has_seen_fishing_catch_tour ?? false}
          activeSession={activeSession ?? undefined}
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
          hasPhantomHook={hasPhantomHook}
          hasAutoCaster={hasAutoCaster}
          prestigeLevels={(profile?.prestige_levels as Record<string, number> | null) ?? {}}
          trophyCatches={(profile?.trophy_catches as number[] | null) ?? []}
          characterColor={characterColor}
          unlockedCharacterColors={(profile?.unlocked_character_colors as string[] | null) ?? []}
          equippedBadges={(profile?.equipped_badges as string[] | null) ?? []}
          marketMultipliers={marketMultipliers}
          isPremium={isPremium}
          equippedBoat={(profile?.equipped_boat as string | null) ?? null}
          unlockedBoats={(profile?.unlocked_boats as string[] | null) ?? []}
          equippedHat={(profile?.equipped_hat as string | null) ?? null}
          unlockedHats={(profile?.unlocked_hats as string[] | null) ?? []}
          initialFinnEncounters={profile?.finn_encounters ?? 0}
          initialFinnWins={profile?.finn_wins ?? 0}
          initialFinnSeenBeats={(profile?.finn_seen_beats as string[] | null) ?? []}
          initialFinnRevealed={profile?.finn_revealed ?? false}
          initialFinnLastOutcome={(profile?.finn_last_outcome as 'won' | 'lost' | 'passed' | null) ?? null}
        />
      </main>
    </>
  )
}
