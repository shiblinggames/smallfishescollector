import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { isPremiumActive } from '@/lib/premium'
import TackleShopClient from './TackleShopClient'

export default async function TackleShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [{ data: profile }, { data: baitInventory }, { data: rodRows }, { data: collRows }, { count: totalSpecies }] = await Promise.all([
    supabase.from('profiles').select('hook_tier, rod_tier, reel_tier, line_tier, doubloons, packs_available, gems, fishing_xp, is_premium, premium_expires_at, ancient_catches').eq('id', user.id).single(),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('*', { count: 'exact', head: true }),
  ])

  const ownedRods = (rodRows ?? []).map(r => r.rod_tier)
  // Species caught = distinct regular catches (fish_collection) + Ancient trophies
  // (which live in ancient_catches, NOT fish_collection). Counting only the
  // former made the Completionist Rod unclaimable — its total is ALL species.
  const regularsCaught = new Set((collRows ?? []).map(r => r.fish_id)).size
  const ancientsCaught = ((profile?.ancient_catches as number[] | null) ?? []).length
  const uniqueSpeciesCaught = regularsCaught + ancientsCaught

  return (
    <>
      {/* A solid dark PAGE, not pure black. The shop's translucent cards need a dark
          surface to sit on the way the Forge's do — on raw black a subtle wash reads as
          nothing. This is the surface; the cards lift off it. */}
      <main className="min-h-screen pb-24 sm:pb-0 pt-6" style={{ background: '#0b0f18' }}>
        <TackleShopClient
          hookTier={profile?.hook_tier ?? 0}
          equippedRod={profile?.rod_tier ?? 0}
          ownedRods={ownedRods.length > 0 ? ownedRods : [0]}
          reelTier={profile?.reel_tier ?? 0}
          lineTier={profile?.line_tier ?? 0}
          doubloons={profile?.doubloons ?? 0}
          baitInventory={baitInventory ?? []}
          fishingXP={profile?.fishing_xp ?? 0}
          isPremium={isPremiumActive(profile)}
          uniqueSpeciesCaught={uniqueSpeciesCaught}
          totalSpecies={totalSpecies ?? 0}
        />
      </main>
    </>
  )
}
