import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import PracticeRaidGame from './PracticeRaidGame'
import { getRaidPlayerStats } from '../actions'

export default async function PracticeRaidPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems, expedition_xp, has_seen_raid_tutorial, has_completed_practice_raid').eq('id', user.id).single(),
    getRaidPlayerStats(user.id),
  ])

  return (
    <>
      <Nav
        packsAvailable={profile?.packs_available ?? 0}
        doubloons={profile?.doubloons ?? 0}
        gems={profile?.gems ?? 0}
      />
      <main>
        <div className="px-6 pt-4 pb-6 max-w-sm mx-auto md:[zoom:1.25] lg:[zoom:1.45]">
          <PracticeRaidGame
            shipImageUrl={stats.shipImageUrl}
            shipName={stats.shipName}
            playerHPMax={stats.playerHPMax}
            shipMinDamage={stats.shipMinDamage}
            shipSpeed={stats.shipSpeed}
            totalPower={stats.totalPower}
            totalDodge={stats.totalDodge}
            crewMembers={stats.crewMembers}
            equippedShipSkin={stats.equippedShipSkin}
            hasSeenTutorial={stats.hasSeenRaidTutorial}
            hasCompletedPractice={!!(profile?.has_completed_practice_raid)}
            initialExpeditionXP={profile?.expedition_xp ?? 0}
          />
        </div>
      </main>
    </>
  )
}
