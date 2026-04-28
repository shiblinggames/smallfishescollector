import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FishingPageClient from './FishingPageClient'
import { claimDailyBait } from './actions'

export default async function FishingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Give daily free worms if not yet claimed today
  await claimDailyBait(user.id)

  const [
    { data: profile },
    { data: baitInventory },
    { data: fishInventory },
    { count: uniqueSpeciesCaught },
    { data: rodRows },
    { data: allSpecies },
    { data: collectionRows },
  ] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, hook_tier, rod_tier, reel_tier, line_tier, gems, fishing_xp')
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
      .select('id, name, habitat, bite_rarity')
      .order('bite_rarity'),
    admin.from('fish_collection')
      .select('fish_id')
      .eq('user_id', user.id),
  ])

  const ownedRods = (rodRows ?? []).map((r: { rod_tier: number }) => r.rod_tier)
  const caughtFishIds = (collectionRows ?? []).map((r: { fish_id: number }) => r.fish_id)

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
          uniqueSpeciesCaught={uniqueSpeciesCaught ?? 0}
          ownedRods={ownedRods}
          allFishSpecies={(allSpecies ?? []) as { id: number; name: string; habitat: string; bite_rarity: number }[]}
          caughtFishIds={caughtFishIds}
        />

      </main>
    </>
  )
}
