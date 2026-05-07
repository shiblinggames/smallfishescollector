import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FishingPageClient from './FishingPageClient'
import { getActiveChallengeSession } from '@/app/social/challengeActions'
import { getShip } from '@/lib/ships'
import { getDailyChallenge } from './dailyChallengeActions'

export default async function FishingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    activeSession,
    dailyChallenge,
    { data: profile },
    { data: baitInventory },
    { data: fishInventory },
    { count: uniqueSpeciesCaught },
    { data: rodRows },
    { data: allSpecies },
    { data: collectionRows },
  ] = await Promise.all([
    getActiveChallengeSession(),
    getDailyChallenge(),
    admin.from('profiles')
      .select('packs_available, doubloons, hook_tier, rod_tier, reel_tier, line_tier, gems, fishing_xp, ship_tier, highest_perfect_streak, has_seen_fishing_tour, has_seen_fishing_catch_tour, username, zone_shallows_rewarded, zone_open_waters_rewarded, zone_deep_rewarded, zone_abyss_rewarded, ring_skin, unlocked_ring_skins, has_tide_turner, tide_turner_used, tide_turner_date, equipped_special, has_phantom_hook, has_auto_caster, prestige_levels, trophy_catches')
      .eq('id', user.id)
      .single(),
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
      .select('id, name, scientific_name, fun_fact, habitat, bite_rarity, sell_value')
      .order('bite_rarity'),
    admin.from('fish_collection')
      .select('fish_id')
      .eq('user_id', user.id),
  ])

  const ownedRods = (rodRows ?? []).map((r: { rod_tier: number }) => r.rod_tier)
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id)
  const holdCapacity = getShip(profile?.ship_tier ?? 0).holdCapacity

  const todayStr = new Date().toISOString().split('T')[0]
  const hasTideTurner = profile?.has_tide_turner ?? false
  const usedToday = hasTideTurner && profile?.tide_turner_date === todayStr ? (profile.tide_turner_used ?? 0) : 0
  const tideTurnerSkipsLeft = hasTideTurner ? Math.max(0, 3 - usedToday) : 0
  const hasPhantomHook = profile?.has_phantom_hook ?? false
  const hasAutoCaster = profile?.has_auto_caster ?? false

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
      <main>
        <FishingPageClient
          hookTier={profile?.hook_tier ?? 0}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          initialDoubloons={profile?.doubloons ?? 0}
          initialFishingXP={profile?.fishing_xp ?? 0}
          initialBait={baitInventory ?? []}
          initialInventory={(fishInventory ?? []) as unknown as {
            fish_id: number
            quantity: number
            fish_species: {
              id: number; name: string; scientific_name: string
              description: string | null; fun_fact: string; habitat: string
              bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
            }
          }[]}
          holdCapacity={holdCapacity}
          shipTier={profile?.ship_tier ?? 0}
          uniqueSpeciesCaught={uniqueSpeciesCaught ?? 0}
          ownedRods={ownedRods}
          allFishSpecies={(allSpecies ?? []) as { id: number; name: string; scientific_name: string; fun_fact: string; habitat: string; bite_rarity: number; sell_value: number }[]}
          caughtFishIds={caughtFishIds}
          initialHighestPerfectStreak={profile?.highest_perfect_streak ?? 0}
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
          initialRingSkin={profile?.ring_skin ?? 'standard'}
          initialUnlockedRingSkins={(profile?.unlocked_ring_skins as string[] | null) ?? []}
          hasTideTurner={hasTideTurner}
          initialTideTurnerSkipsLeft={tideTurnerSkipsLeft}
          initialEquippedSpecial={(profile?.equipped_special as string | null) ?? null}
          hasPhantomHook={hasPhantomHook}
          hasAutoCaster={hasAutoCaster}
          prestigeLevels={(profile?.prestige_levels as Record<string, number> | null) ?? {}}
          trophyCatches={(profile?.trophy_catches as number[] | null) ?? []}
        />
      </main>
    </>
  )
}
