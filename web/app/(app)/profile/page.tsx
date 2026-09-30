import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'
import { getCrewRoster } from '@/app/(app)/crew/actions'
import { getUserAchievementPoints } from '@/lib/achievementPoints'
import { getCurrentUser, getCurrentProfile } from '@/lib/userData'
import type { CareerAggregates } from '@/lib/careerStats'
import { profilePageProps } from '@/lib/core/profile'

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Profile via the request-scoped cached loader (lib/userData.ts).
  //
  // ONE WAVE. The achievement points used to be awaited after all of this had
  // landed, a whole round trip on its own, and the golden mounts were a
  // second read of the same fish_collection rows. Both are in the one
  // Promise.all now, and the goldens are picked out of the collection read.
  const [
    profile,
    crewRoster,
    { data: rarestFishRows },
    { data: allFishSpecies },
    { data: careerAgg },
    achievementPoints,
  ] = await Promise.all([
    getCurrentProfile(),
    getCrewRoster(),
    // ALL caught fish — the per-zone Rarest Catches showcase groups + ranks
    // these client-side (top 3 per zone by rarity, then sell value). Carries
    // is_golden too: the gilded trophy wall is these rows filtered, and
    // fish_collection.is_golden is exactly what the collection log shows.
    admin.from('fish_collection')
      .select('is_golden, fish_species(id, name, bite_rarity, habitat, sell_value)')
      .eq('user_id', user.id),
    // fish_species has ~140 rows — pulling id+name for the whole table is
    // cheaper than a second round-trip just to map trophy names by id.
    admin.from('fish_species').select('id, name'),
    // Career aggregates (fish sold, voyage loot, raids, fastest raid) in one
    // SQL round-trip via the career_stats() function.
    admin.rpc('career_stats', { uid: user.id }),
    getUserAchievementPoints(user.id),
  ])

  return (
    <main className="min-h-screen pt-8">
      <ProfileClient {...profilePageProps({
        email: user.email ?? '',
        profile,
        crewRoster,
        collection: ((rarestFishRows ?? []) as unknown as { is_golden: boolean | null; fish_species: { id: number; name: string; bite_rarity: number; habitat?: string; sell_value?: number } | null }[])
          .map(r => ({ is_golden: r.is_golden, species: r.fish_species })),
        species: (allFishSpecies ?? []) as { id: number; name: string }[],
        career: (careerAgg ?? {}) as Partial<CareerAggregates>,
        achievementPoints,
      })} />
    </main>
  )
}
