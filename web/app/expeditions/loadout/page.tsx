import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import { EXPEDITION_SHIP_STATS } from '@/lib/expeditions'
import { getCollectionForCrew } from '../actions'
import LoadoutClient from './LoadoutClient'

export default async function LoadoutPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [{ data: profile }, collection] = await Promise.all([
    admin.from('profiles')
      .select('packs_available, doubloons, gems, ship_tier, saved_crew, ship_name, expedition_xp, equipped_ship_skin, ship_skins')
      .eq('id', user.id)
      .single(),
    getCollectionForCrew(),
  ])

  const shipTier   = profile?.ship_tier ?? 0
  const shipStats  = EXPEDITION_SHIP_STATS[shipTier] ?? EXPEDITION_SHIP_STATS[0]
  const savedCrew  = (profile?.saved_crew as number[] | null) ?? []
  const shipSkins  = (profile?.ship_skins as string[] | null) ?? []
  const equippedSkin = (profile?.equipped_ship_skin as string | null) ?? null

  return (
    <>
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/expedition-background.jpg"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', display: 'block' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 50%, rgba(0,0,0,0.92) 100%)' }} />
      </div>
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Nav packsAvailable={profile?.packs_available ?? 0} doubloons={profile?.doubloons ?? 0} gems={profile?.gems ?? 0} />
        <main className="min-h-screen pb-24">
          <div className="px-5 max-w-lg mx-auto" style={{ paddingTop: '1rem' }}>
            <LoadoutClient
              shipStats={shipStats}
              shipTier={shipTier}
              collection={collection}
              savedCrewVariantIds={savedCrew}
              shipName={profile?.ship_name as string | null ?? null}
              expeditionXP={profile?.expedition_xp ?? 0}
              equippedShipSkin={equippedSkin}
              shipSkins={shipSkins}
            />
          </div>
        </main>
      </div>
    </>
  )
}
