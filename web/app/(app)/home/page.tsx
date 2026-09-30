// THE HOMESTEAD.
//
// Admin-gated for as long as /sea is: it is reached by sailing there, and a
// page you can only get to through a door that is shut should not be open.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedFishSpecies } from '@/lib/fishSpecies'
import { homePageProps } from '@/lib/core/homestead'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import { canSail } from '@/lib/seaAccess'
import { getHomestead } from './actions'
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
  // WHOSE ROOMS ARE BEING DRAWN. A visit shows their island and their rooms, so
  // the three room feeds have to follow the same owner the homestead does or you
  // would be standing in somebody else's gallery looking at your own badges.
  const owner = visit ? visit.userId : user.id

  const [homestead, { data: row }, { data: petRows }, { data: logRows }, { data: ancientRow }, species] = await Promise.all([
    getHomestead(),
    // The gallery hangs what the captain has actually unlocked. `badge_unlocked_at`
    // carries the dates, which is what turns a wall of icons into a record of
    // when you did each thing.
    admin.from('profiles')
      .select('doubloons, unlocked_badges, badge_unlocked_at, unlocked_pets')
      .eq('id', user.id).single(),
    // THE MENAGERIE SHOWS EVERY PET EVER TAKEN IN, not the equipped one. The
    // equipped pet already swims beside the hull, so a room showing only that
    // would hold nothing you could not see from the water.
    admin.from('profiles').select('unlocked_pets').eq('id', owner).single(),
    // The gallery's species count comes off the log. The TROPHY ROOM does not,
    // and reading it from here is why it was empty — see below.
    admin.from('fish_collection').select('fish_id').eq('user_id', owner),
    admin.from('profiles').select('ancient_catches').eq('id', owner).single(),
    getCachedFishSpecies(),
  ])

  return (
    <HomeClient {...homePageProps({
      homestead,
      own: {
        doubloons: Number(row?.doubloons ?? 0),
        unlocked_badges: (row?.unlocked_badges as string[] | null) ?? [],
        badge_unlocked_at: (row?.badge_unlocked_at as Record<string, string | null> | null) ?? {},
      },
      owner: {
        pets: (petRows?.unlocked_pets as string[] | null) ?? [],
        logged: (logRows ?? []).map(r => Number(r.fish_id)),
        ancients: ((ancientRow?.ancient_catches as number[] | null) ?? []).map(Number),
      },
      species,
      visit: visit ? { username: visit.username, homestead: visit.homestead, unlocked: visit.unlocked, stamps: visit.stamps } : null,
    })} />
  )
}
