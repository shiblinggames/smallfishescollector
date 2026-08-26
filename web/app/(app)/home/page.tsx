// THE HOMESTEAD.
//
// Admin-gated for as long as /sea is: it is reached by sailing there, and a
// page you can only get to through a door that is shut should not be open.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { getHomestead, portalDestinations } from './actions'
import HomeClient from './HomeClient'

export const metadata = { title: 'The Homestead' }

export default async function HomePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  const profile = await getCurrentProfile()
  // ONE RULE FOR ALL FOUR SEA ROUTES. See lib/seaAccess: this used to be a
  // copy of `is_admin !== true` in each of them, which is four chances to
  // open three and forget the fourth.
  if (!canSail(profile)) redirect('/tavern')

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

  return (
    <HomeClient
      homestead={homestead}
      destinations={destinations}
      doubloons={Number(row?.doubloons ?? 0)}
      unlocked={(row?.unlocked_badges as string[] | null) ?? []}
      stamps={(row?.badge_unlocked_at as Record<string, string | null> | null) ?? {}}
    />
  )
}
