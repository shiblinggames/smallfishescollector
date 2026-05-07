import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import RaidGame from './RaidGame'
import { getRaidPlayerStats } from './actions'
import { CORSAIRS_RECKONING } from '@/lib/bossRaids'

export default async function RaidPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, stats] = await Promise.all([
    supabase.from('profiles').select('packs_available, doubloons, gems, expedition_xp').eq('id', user.id).single(),
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
          <RaidGame
            config={CORSAIRS_RECKONING}
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
            equippedShipSkin={stats.equippedShipSkin}
            shipSkins={stats.shipSkins}
            equippedItems={stats.equippedRaidItems}
            initialExpeditionXP={profile?.expedition_xp ?? 0}
          />
        </div>
      </main>
    </>
  )
}
