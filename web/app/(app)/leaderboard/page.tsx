import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'

/** Resolve the player's rank on a board. If they're in the top-50 array we
 *  already fetched, use that index (free). Otherwise run a count query for
 *  "how many people have a higher score than mine" — their rank is that + 1.
 *  Returns null if the player has no score (myScore === 0). */
async function resolveMyRank(
  admin: ReturnType<typeof createAdminClient>,
  view: string,
  userId: string,
  myScore: number,
  top: LeaderboardEntry[],
): Promise<number | null> {
  if (myScore <= 0) return null
  const idx = top.findIndex(e => e.user_id === userId)
  if (idx >= 0) return idx + 1
  const { count } = await admin.from(view).select('*', { count: 'exact', head: true }).gt('score', myScore)
  return (count ?? 0) + 1
}

async function fetchBoard(admin: ReturnType<typeof createAdminClient>, view: string, userId: string) {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from(view).select('user_id, username, score').order('score', { ascending: false }).order('created_at', { ascending: true }).limit(50),
    admin.from(view).select('score').eq('user_id', userId).single(),
  ])
  const topRows = (top ?? []) as LeaderboardEntry[]
  const myScore = (me as any)?.score ?? 0
  const myRank = await resolveMyRank(admin, view, userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

// Raid Progress: count of raid_node_progress.cleared entries per player.
// Ties broken by the latest raid_completions.completed_at (earlier = wins)
// so the player who reached that node-count first ranks higher. Players
// who somehow have nodes but no raid_completions (story-only edge case)
// fall to the back of their tied group.
async function fetchRaidProgressBoard(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, raid_node_progress')
    .eq('is_admin', false)
  if (!profiles || profiles.length === 0) return { top: [] as LeaderboardEntry[], myScore: 0, myRank: null as number | null }

  const { data: completions } = await admin
    .from('raid_completions')
    .select('user_id, completed_at')
  const lastByUser = new Map<string, string>()
  for (const c of (completions ?? []) as Array<{ user_id: string; completed_at: string }>) {
    const prev = lastByUser.get(c.user_id)
    if (!prev || c.completed_at > prev) lastByUser.set(c.user_id, c.completed_at)
  }

  type Row = LeaderboardEntry & { lastAt: string | null }
  const rows: Row[] = []
  for (const p of profiles as Array<{ id: string; username: string | null; raid_node_progress: { cleared?: string[] } | null }>) {
    const cleared = Array.isArray(p.raid_node_progress?.cleared) ? p.raid_node_progress!.cleared!.length : 0
    if (cleared > 0) rows.push({ user_id: p.id, username: p.username ?? '', score: cleared, lastAt: lastByUser.get(p.id) ?? null })
  }
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.lastAt && b.lastAt) return a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0
    if (a.lastAt) return -1
    if (b.lastAt) return 1
    return 0
  })
  const top: LeaderboardEntry[] = rows.slice(0, 50).map(r => ({ user_id: r.user_id, username: r.username, score: r.score }))
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : 0, myRank: myIdx >= 0 ? myIdx + 1 : null }
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
  const topRows = (top ?? []) as LeaderboardEntry[]
  const myScore = (me as any)?.score ?? 0
  const myRank = await resolveMyRank(admin, 'leaderboard_perfect_streak', userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [profile, fishingData, perfectStreakData, tideRunData, fishSlotsData, expeditionData, raidProgressData] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    fetchBoard(admin, 'leaderboard_fishing', user.id),
    fetchPerfectStreakBoard(admin, user.id),
    fetchBoard(admin, 'leaderboard_tide_run', user.id),
    fetchBoard(admin, 'leaderboard_fish_slots', user.id),
    fetchBoard(admin, 'leaderboard_expedition', user.id),
    fetchRaidProgressBoard(admin, user.id),
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
    ...raidProgressData.top.map(e => e.user_id),
  ])
  const avatarsMap: Record<string, {
    characterColor: string | null
    equippedHat: string | null
    avatarBg: string | null
    avatarBorder: string | null
  }> = {}
  if (displayedUserIds.size > 0) {
    const { data: avatarRows } = await admin
      .from('profiles')
      .select('id, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .in('id', Array.from(displayedUserIds))
    for (const row of (avatarRows ?? []) as Array<{
      id: string
      character_color: string | null
      equipped_hat: string | null
      avatar_bg_color: string | null
      avatar_border_color: string | null
    }>) {
      avatarsMap[row.id] = {
        characterColor: row.character_color,
        equippedHat: row.equipped_hat,
        avatarBg: row.avatar_bg_color,
        avatarBorder: row.avatar_border_color,
      }
    }
  }

  return (
    <>
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-6 max-w-xl mx-auto">
          <LeaderboardClient
            fishing={fishingData.top}
            perfectStreak={perfectStreakData.top}
            tideRun={tideRunData.top}
            fishSlots={fishSlotsData.top}
            expedition={expeditionData.top}
            raidProgress={raidProgressData.top}
            myScores={{
              fishing: fishingData.myScore,
              perfectStreak: perfectStreakData.myScore,
              tideRun: tideRunData.myScore,
              fishSlots: fishSlotsData.myScore,
              expedition: expeditionData.myScore,
              raidProgress: raidProgressData.myScore,
            }}
            myRanks={{
              fishing: fishingData.myRank,
              perfectStreak: perfectStreakData.myRank,
              tideRun: tideRunData.myRank,
              fishSlots: fishSlotsData.myRank,
              expedition: expeditionData.myRank,
              raidProgress: raidProgressData.myRank,
            }}
            currentUserId={user.id}
            avatars={avatarsMap}
          />
        </div>
      </main>
    </>
  )
}
