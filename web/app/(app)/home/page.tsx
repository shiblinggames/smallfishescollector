// THE HOMESTEAD.
//
// Admin-gated for as long as /sea is: it is reached by sailing there, and a
// page you can only get to through a door that is shut should not be open.

import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedFishSpecies } from '@/lib/fishSpecies'
import { fishImageUrl } from '@/lib/fishArt'
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

  const logged = new Set((logRows ?? []).map(r => Number(r.fish_id)))

  /**
   * ── THE SIX GIANTS, FROM THE RECORD THAT ACTUALLY HOLDS THEM ──────────────
   *
   * This read `fish_collection` and the trophy room was therefore ALWAYS empty,
   * for everybody, since the day it shipped. An Ancient never goes in there: the
   * catch path routes it straight to `profiles.ancient_catches` and skips the
   * hold, the collection and the bounty entirely — reelIn says so in a comment,
   * a few hundred lines above the code that does it.
   *
   * So there are two records of "which giants have you landed" and this wall was
   * reading the one that is never written. `ancient_catches` is the real one: it
   * is what gates the finale, it is append-only, and it survives a prestige,
   * which is right for a trophy — a wall you have to re-earn is not a wall.
   *
   * The species table is still what turns an id into a name and a picture; the
   * discriminator stays as a guard so a sellable ancient_deep fish can never
   * find its way onto the wall if the ids are ever renumbered.
   */
  const landed = new Set(((ancientRow?.ancient_catches as number[] | null) ?? []).map(Number))
  const giants = species
    .filter(f => f.habitat === 'ancient_deep' && (f.sell_value ?? 0) === 0 && landed.has(f.id))
    .map(f => ({ name: f.name, art: fishImageUrl(f.name) }))

  // A VISIT SHOWS THEIRS, not yours: their island, their room, their badges.
  // The doubloons stay YOURS and are simply never spent — nothing on the page
  // offers to spend them while `guest` is set.
  return (
    <HomeClient
      pets={(petRows?.unlocked_pets as string[] | null) ?? []}
      species={{ logged: logged.size, total: species.length }}
      giants={giants}
      homestead={visit ? visit.homestead : homestead}
      guest={visit?.username ?? null}
      doubloons={Number(row?.doubloons ?? 0)}
      unlocked={visit ? visit.unlocked : ((row?.unlocked_badges as string[] | null) ?? [])}
      stamps={visit ? visit.stamps : ((row?.badge_unlocked_at as Record<string, string | null> | null) ?? {})}
    />
  )
}
