import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import TackleShopClient from './TackleShopClient'

export default async function TackleShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: baitInventory }, { data: rodRows }, { count: uniqueSpecies }, { count: totalSpecies }] = await Promise.all([
    supabase.from('profiles').select('hook_tier, rod_tier, reel_tier, line_tier, doubloons, packs_available, gems, fishing_xp').eq('id', user.id).single(),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('fish_collection').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
    admin.from('fish_species').select('*', { count: 'exact', head: true }),
  ])

  const ownedRods = (rodRows ?? []).map(r => r.rod_tier)

  return (
    <>
      <main className="min-h-screen pb-24 sm:pb-0 pt-6">
        <TackleShopClient
          hookTier={profile?.hook_tier ?? 0}
          equippedRod={profile?.rod_tier ?? 0}
          ownedRods={ownedRods.length > 0 ? ownedRods : [0]}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          doubloons={profile?.doubloons ?? 0}
          baitInventory={baitInventory ?? []}
          fishingXP={profile?.fishing_xp ?? 0}
          uniqueSpeciesCaught={uniqueSpecies ?? 0}
          totalSpecies={totalSpecies ?? 0}
        />
      </main>
    </>
  )
}
