import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import ShipyardClient from './ShipyardClient'

export default async function ShipyardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('ship_tier, doubloons, packs_available, gems')
    .eq('id', user.id)
    .single()

  return (
    <>
      {/* Background */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://pwvndjczpdcttmyvnsyq.supabase.co/storage/v1/object/public/card-arts/backgrounds/shipyardbackground.jpeg"
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
          <ShipyardClient
            shipTier={profile?.ship_tier ?? 0}
            doubloons={profile?.doubloons ?? 0} />
        </main>
      </div>
    </>
  )
}
