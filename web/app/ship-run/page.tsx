import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import Link from 'next/link'
import { getShip } from '@/lib/ships'
import ShipRunGame from './ShipRunGame'

export default async function ShipRunPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('packs_available, doubloons, gems, ship_tier')
    .eq('id', user.id)
    .single()

  const ship = getShip(profile?.ship_tier ?? 0)

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pt-6 pb-2">
          <Link
            href="/tavern"
            className="font-karla text-[#6a6764] text-xs uppercase tracking-[0.12em] hover:text-[#a0a09a] transition-colors"
          >
            ← Tavern
          </Link>
        </div>

        <div className="px-6 pt-4 pb-5 text-center">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Mini Game</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8]" style={{ fontSize: '1.5rem' }}>
            Run the Gauntlet
          </h1>
          <p className="font-karla font-300 text-[#a0a09a] text-xs mt-1">
            Sailing the {ship.name}. Dodge or die.
          </p>
        </div>

        <div className="px-4 pb-12 max-w-sm mx-auto">
          <ShipRunGame shipImageUrl={ship.imageUrl ?? '/models/rowboat.png'} shipName={ship.name} />
        </div>
      </main>
    </>
  )
}
