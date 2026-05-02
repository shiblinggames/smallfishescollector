import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FishingPageClient from './FishingPageClient'
import { getActiveChallengeSession } from '@/app/social/challengeActions'
import { getShip } from '@/lib/ships'

export default async function FishingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [
    activeSession,
    { data: profile },
    { data: baitInventory },
    { data: fishInventory },
    { count: uniqueSpeciesCaught },
    { data: rodRows },
    { data: allSpecies },
    { data: collectionRows },
  ] = await Promise.all([
    getActiveChallengeSession(),
    admin.from('profiles')
      .select('packs_available, doubloons, hook_tier, rod_tier, reel_tier, line_tier, gems, fishing_xp, ship_tier, highest_perfect_streak, has_seen_fishing_tour, has_seen_fishing_catch_tour, username')
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
          username={profile?.username ?? ''}
        />
      </main>
    </>
  )
}
