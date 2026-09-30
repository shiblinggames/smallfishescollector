// Don's Gauntlet (Gauntlet 2) — the endgame variant, led by the ghost of Don
// Finleone. ADMIN-ONLY until DONS_GAUNTLET_LIVE flips (gate = beating Don =
// the_throne raid clear). Runs the SAME GauntletGame host with variant='don';
// slice 0 uses the classic Davy pool/curve/rewards as a stub — later slices add
// the Ch3+4 enemy pool, the steeper curve, the rewards, boons/curses, and theme.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import GauntletGame from '../gauntlet/GauntletGame'
import { getRaidPlayerStats } from '@/lib/raidPlayerStats'
import { getGauntletDailyState, getGauntletLeaderboard } from '../gauntlet/actions'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { gauntletPageProps } from '@/lib/core/gauntletPage'

export default async function DonsGauntletPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const [profile, stats, daily, leaderboard, throneRes] = await Promise.all([
    getCurrentProfile(),
    getRaidPlayerStats(user.id),
    getGauntletDailyState('don'),
    getGauntletLeaderboard('don'),
    admin.from('raid_completions').select('id').eq('user_id', user.id).eq('raid_id', 'the_throne').limit(1).maybeSingle(),
  ])

  // Gated on finishing the campaign (beat Don Finleone). Admins always, everyone
  // else only once DONS_GAUNTLET_LIVE flips.
  // AND ON CAPTAIN'S WATER: see lib/captainWater. A descent already on record
  // keeps the door open for whoever was down here before it went up.
  const page = gauntletPageProps({ variant: 'don', profile, stats, daily, leaderboard, throneCleared: !!throneRes.data })
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
