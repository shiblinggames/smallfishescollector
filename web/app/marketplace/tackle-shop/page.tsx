import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
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
      {/* Background */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://pwvndjczpdcttmyvnsyq.supabase.co/storage/v1/object/public/card-arts/backgrounds/tackleshopbackground.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.68) 50%, rgba(0,0,0,0.88) 100%)',
        }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>
      <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
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
      </div>
    </>
  )
}
