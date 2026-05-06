import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import CannonGame from './CannonGame'
import { getCannonPlayerStats } from './actions'

export default async function CannonPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    getCannonPlayerStats(user.id),
  ])

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main className="min-h-screen pb-24 sm:pb-0">
        <div className="px-6 pb-12 max-w-sm mx-auto md:[zoom:1.25] lg:[zoom:1.45]">
          <CannonGame
            shipImageUrl={stats.shipImageUrl}
            shipName={stats.shipName}
            playerHPMax={stats.playerHPMax}
            shipMinDamage={stats.shipMinDamage}
            shipSpeed={stats.shipSpeed}
            totalPower={stats.totalPower}
            totalDodge={stats.totalDodge}
            totalFortune={stats.totalFortune}
            crewCount={stats.crewCount}
            crewMembers={stats.crewMembers}
          />
        </div>
      </main>
    </>
  )
}
