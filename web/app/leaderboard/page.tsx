import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'

async function fetchBoard(admin: ReturnType<typeof createAdminClient>, view: string, userId: string) {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from(view).select('user_id, username, score').order('score', { ascending: false }).order('created_at', { ascending: true }).limit(50),
    admin.from(view).select('score').eq('user_id', userId).single(),
  ])
  return {
    top: (top ?? []) as LeaderboardEntry[],
    myScore: (me as any)?.score ?? 0,
  }
}

async function fetchPerfectStreakBoard(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from('leaderboard_perfect_streak')
      .select('user_id, username, score, zone')
      .order('score', { ascending: false })
      .order('zone_rank', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(50),
    admin.from('leaderboard_perfect_streak').select('score').eq('user_id', userId).single(),
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

  const [profile, fishingData, perfectStreakData, tideRunData, fishSlotsData, expeditionData] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    fetchBoard(admin, 'leaderboard_fishing', user.id),
    fetchPerfectStreakBoard(admin, user.id),
    fetchBoard(admin, 'leaderboard_tide_run', user.id),
    fetchBoard(admin, 'leaderboard_fish_slots', user.id),
    fetchBoard(admin, 'leaderboard_expedition', user.id),
  ])

  // Fetch avatar data (character_color + equipped_hat) for every user that
  // appears on any board, in a single round-trip, so the leaderboard rows
  // can render the player's actual character + hat composite next to their
  // username instead of a colored letter circle.
  const displayedUserIds = new Set<string>([
    ...fishingData.top.map(e => e.user_id),
    ...perfectStreakData.top.map(e => e.user_id),
    ...tideRunData.top.map(e => e.user_id),
    ...fishSlotsData.top.map(e => e.user_id),
    ...expeditionData.top.map(e => e.user_id),
  ])
  const avatarsMap: Record<string, { characterColor: string | null; equippedHat: string | null }> = {}
  if (displayedUserIds.size > 0) {
    const { data: avatarRows } = await admin
      .from('profiles')
      .select('id, character_color, equipped_hat')
      .in('id', Array.from(displayedUserIds))
    for (const row of (avatarRows ?? []) as Array<{ id: string; character_color: string | null; equipped_hat: string | null }>) {
      avatarsMap[row.id] = { characterColor: row.character_color, equippedHat: row.equipped_hat }
    }
  }

  return (
    <>
      <Nav packsAvailable={profile.data?.packs_available ?? 0} doubloons={profile.data?.doubloons ?? 0} gems={profile.data?.gems ?? 0} />
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-6 max-w-xl mx-auto">
          <p className="sg-eyebrow mb-1" style={{ color: '#9a9488' }}>Global</p>
          <h1 className="font-cinzel font-700 text-[#f0ede8] mb-6" style={{ fontSize: '1.4rem' }}>Leaderboard</h1>
          <LeaderboardClient
            fishing={fishingData.top}
            perfectStreak={perfectStreakData.top}
            tideRun={tideRunData.top}
            fishSlots={fishSlotsData.top}
            expedition={expeditionData.top}
            myScores={{
              fishing: fishingData.myScore,
              perfectStreak: perfectStreakData.myScore,
              tideRun: tideRunData.myScore,
              fishSlots: fishSlotsData.myScore,
              expedition: expeditionData.myScore,
            }}
            currentUserId={user.id}
            avatars={avatarsMap}
          />
        </div>
      </main>
    </>
  )
}
