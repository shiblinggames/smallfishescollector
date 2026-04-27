import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'

async function fetchBoard(admin: ReturnType<typeof createAdminClient>, view: string, userId: string) {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from(view).select('user_id, username, score').order('score', { ascending: false }).limit(50),
    admin.from(view).select('score').eq('user_id', userId).single(),
  ])
  return {
    top: (top ?? []) as LeaderboardEntry[],
    myScore: (me as any)?.score ?? 0,
  }
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [profile, fishingData, packsData, collectionData, streakData, achievementsData] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    fetchBoard(admin, 'leaderboard_fishing', user.id),
    fetchBoard(admin, 'leaderboard_packs', user.id),
    fetchBoard(admin, 'leaderboard_collection', user.id),
    fetchBoard(admin, 'leaderboard_streak', user.id),
    fetchBoard(admin, 'leaderboard_achievements', user.id),
  ])

  return (
    <>
      <Nav packsAvailable={profile.data?.packs_available ?? 0} doubloons={profile.data?.doubloons ?? 0} gems={profile.data?.gems ?? 0} />
      <main className="min-h-screen pb-24 sm:pb-0 pt-8">
        <div className="px-6 max-w-xl mx-auto">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Global</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8] mb-6" style={{ fontSize: '1.4rem' }}>Leaderboard</h1>
          <LeaderboardClient
            fishing={fishingData.top}
            packs={packsData.top}
            collection={collectionData.top}
            streak={streakData.top}
            achievements={achievementsData.top}
            myScores={{
              fishing: fishingData.myScore,
              packs: packsData.myScore,
              collection: collectionData.myScore,
              streak: streakData.myScore,
              achievements: achievementsData.myScore,
            }}
            currentUserId={user.id}
          />
        </div>
      </main>
    </>
  )
}
