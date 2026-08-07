import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { isPremiumActive } from '@/lib/premium'
import { getCurrentProfile } from '@/lib/userData'
import { provenCaughtSpecies } from '@/lib/collection'
import TackleShopClient from './TackleShopClient'

export default async function TackleShopPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the service-role cached loader, NOT the RLS client: an
  // RLS `.single()` can transiently return null while the auth session is
  // refreshing, which collapsed `rod_tier ?? 0` to Bamboo and showed the
  // wrong equipped rod. Every other read on this page already uses admin.
  const [profile, { data: baitInventory }, { data: rodRows }, { data: collRows }, { data: speciesRows }] = await Promise.all([
    getCurrentProfile(),
    admin.from('bait_inventory').select('bait_type, quantity').eq('user_id', user.id),
    admin.from('rod_inventory').select('rod_tier').eq('user_id', user.id),
    admin.from('fish_collection').select('fish_id').eq('user_id', user.id),
    admin.from('fish_species').select('id, habitat'),
  ])

  const ownedRods = (rodRows ?? []).map(r => r.rod_tier)
  // Species caught for the Completionist Rod gate — prestige-proof (see
  // lib/collection): lifetime set + live collection + Ancient trophies, and every
  // non-ancient species once all four zones are prestiged. Mirrors claimCompletionistRod.
  const allSpecies = (speciesRows ?? []) as { id: number; habitat: string }[]
  const totalSpecies = allSpecies.length
  const caughtSet = provenCaughtSpecies(allSpecies, {
    lifetime: profile?.lifetime_species as number[] | null,
    liveIds: (collRows ?? []).map(r => r.fish_id),
    ancientCatches: profile?.ancient_catches as number[] | null,
    prestige: profile?.prestige_levels as Record<string, number> | null,
  })
  const uniqueSpeciesCaught = allSpecies.filter(s => caughtSet.has(s.id)).length

  return (
    <>
      {/* Painterly bait-and-tackle shop backdrop, under a scrim heavy enough
          that it is TEXTURE rather than a picture.

          It was at 0.6 opening, which is a photograph you can read every detail
          of, and the whole page sits on top of it: a category grid, then rows
          of rod, reel, hook, line and bait tiles, most of them 4-6% white
          washes. The shipyard next door deliberately has no image at all for
          exactly this reason, and its own note in ClientBackground says why —
          "a busy photo behind translucent tiles was exactly what made them look
          muddy". This page added a photo and then hit that. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tackle-shop-page-bg.jpg" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(6,9,14,0.90) 0%, rgba(6,9,14,0.94) 42%, rgba(5,7,11,0.98) 100%)' }} />
      </div>
      <main className="min-h-screen pb-24 sm:pb-0 pt-6" style={{ position: 'relative', zIndex: 1 }}>
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
