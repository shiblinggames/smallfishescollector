import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import FishingGame from './FishingGame'
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
  ] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, hook_tier, rod_tier, reel_tier, line_tier')
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
  ])

  return (
    <>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <FishingGame
          hookTier={profile?.hook_tier ?? 0}
          rodTier={profile?.rod_tier ?? 0}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          initialDoubloons={profile?.doubloons ?? 0}
          initialBait={baitInventory ?? []}
          initialInventory={(fishInventory ?? []) as {
            fish_id: number
            quantity: number
            fish_species: {
              id: number; name: string; scientific_name: string
              description: string | null; fun_fact: string; habitat: string
              bite_rarity: number; catch_difficulty: number; catch_score: number; sell_value: number
            }
          }[]}
          uniqueSpeciesCaught={uniqueSpeciesCaught ?? 0}
        />
      </main>
    </>
  )
}
