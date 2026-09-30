// The Davy Jones Gauntlet — Chapter 2.5 push-your-luck roguelike.
// 1-hour cooldown between runs; depth-scaled enemies from Raids 1-4; pot banked
// only on cash-out. The cooldown gate + payout are server-authoritative (see
// actions.ts); the fight engine is the shared RaidCombat, hosted by GauntletGame.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import GauntletGame from './GauntletGame'
import { getRaidPlayerStats } from '@/lib/raidPlayerStats'
import { getGauntletDailyState, getGauntletLeaderboard } from './actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { gauntletPageProps } from '@/lib/core/gauntletPage'

export default async function GauntletPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profile, stats, daily, leaderboard, throneRes] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
    getGauntletDailyState(),
    getGauntletLeaderboard(),
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_throne').limit(1).maybeSingle(),
  ])

  // Locked until GAUNTLET_LIVE flips (then: cleared Chapter 2). Admins always.
  const page = gauntletPageProps({ variant: 'davy', profile, stats, daily, leaderboard, throneCleared: !!throneRes.data })
  if (page.redirect) redirect(page.redirect)

  return (
    <main className="min-h-screen pt-6">
      {/* No pb here. GauntletGame pads its OWN bottom on every screen it
          renders: pb-10 on the three lobby views, and an explicit safe-area
          plus tab-bar clearance on the in-run ones. The shell's pb-12 stacked
          48px on top of that and left a dead strip under the home page. */}
      <div className="page-col">
        <GauntletGame {...page.props} />
      </div>
    </main>
  )
}
