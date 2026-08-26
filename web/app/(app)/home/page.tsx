// THE HOMESTEAD.
//
// Admin-gated for as long as /sea is: it is reached by sailing there, and a
// page you can only get to through a door that is shut should not be open.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { getHomestead, portalDestinations } from './actions'
import { homesteadOf } from './visitActions'
import HomeClient from './HomeClient'

export const metadata = { title: 'The Homestead' }

export default async function HomePage({ searchParams }: {
  searchParams: Promise<{ visiting?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')

  // ── VISITING ──────────────────────────────────────────────────────────
  //
  // The guard is `homesteadOf`, which re-checks the mutual follow server-side
  // and returns null for every refusal without saying which. A bad or stale
  // username simply lands you in your own homestead rather than on an error.
  const { visiting: who } = await searchParams
  const visit = who ? await homesteadOf(who) : null

  const admin = createAdminClient()
  const [homestead, destinations, { data: row }] = await Promise.all([
    getHomestead(),
    portalDestinations(),
    // The gallery hangs what the captain has actually unlocked. `badge_unlocked_at`
    // carries the dates, which is what turns a wall of icons into a record of
    // when you did each thing.
    admin.from('profiles')
      .select('doubloons, unlocked_badges, badge_unlocked_at')
      .eq('id', user.id).single(),
  ])

  // A VISIT SHOWS THEIRS, not yours: their island, their room, their badges.
  // The doubloons stay YOURS and are simply never spent — nothing on the page
  // offers to spend them while `guest` is set.
  return (
    <HomeClient
      homestead={visit ? visit.homestead : homestead}
      guest={visit?.username ?? null}
      destinations={visit ? [] : destinations}
      doubloons={Number(row?.doubloons ?? 0)}
      unlocked={visit ? visit.unlocked : ((row?.unlocked_badges as string[] | null) ?? [])}
      stamps={visit ? visit.stamps : ((row?.badge_unlocked_at as Record<string, string | null> | null) ?? {})}
    />
  )
}
