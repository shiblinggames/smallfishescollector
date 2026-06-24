import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'
import { getAchievementPointsBoard } from '@/lib/achievementPoints'

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
  // Caller is expected to skip this when the user has no row in the
  // view (myScore = null upstream). Once they DO have a row, every
  // score — including 0 or negative for signed-score boards like
  // Blackjack — gets a real rank.
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
  // Coerce score → number. The tide-run view exposes numeric(10,1) and
  // PostgREST serializes numeric as a string; downstream formatters
  // (toLocaleString) would silently break on a string. Integer views
  // pass through Number() unchanged.
  const topRows = ((top ?? []) as Array<{ user_id: string; username: string; score: number | string }>)
    .map(r => ({ user_id: r.user_id, username: r.username, score: Number(r.score) })) as LeaderboardEntry[]
  // myScore = null when the player has no row in the view (haven't
  // played / no score). Boards that allow signed scores (Blackjack)
  // need to distinguish "broke even, 0 net" (number) from "never
  // played" (null) so the "you" tile and rank chip render correctly.
  const myRow = me as { score?: number | string } | null
  const myScore: number | null = myRow === null ? null : Number(myRow.score)
  const myRank = myScore === null ? null : await resolveMyRank(admin, view, userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

// Raid Progress: total number of distinct raid-map nodes the captain
// has cleared. Combines three sources:
//   - raid_node_progress.cleared[]: story, milestone, shop, puzzle,
//     event, class-pick nodes (the things the player explicitly clears)
//   - distinct raid_completions.raid_id per user: boss-kill nodes
//     (e.g. corsairs_reckoning + corsairs_reckoning_challenge each
//     count as one)
//   - has_completed_practice_raid: the one skirmish/tutorial node
// Everything counts as 1 — no weighting per node type. Ties broken
// by latest raid_completions.completed_at ASC so whoever reached
// that count first wins.
async function fetchRaidProgressBoard(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, raid_node_progress, has_completed_practice_raid')
    .eq('is_admin', false)
  if (!profiles || profiles.length === 0) return { top: [] as LeaderboardEntry[], myScore: null as number | null, myRank: null as number | null }

  const { data: completions } = await admin
    .from('raid_completions')
    .select('user_id, raid_id, completed_at')
  const lastByUser = new Map<string, string>()
  const raidsByUser = new Map<string, Set<string>>()
  for (const c of (completions ?? []) as Array<{ user_id: string; raid_id: string; completed_at: string }>) {
    const prev = lastByUser.get(c.user_id)
    if (!prev || c.completed_at > prev) lastByUser.set(c.user_id, c.completed_at)
    const set = raidsByUser.get(c.user_id) ?? new Set<string>()
    set.add(c.raid_id)
    raidsByUser.set(c.user_id, set)
  }

  type Row = LeaderboardEntry & { lastAt: string | null }
  const rows: Row[] = []
  for (const p of profiles as Array<{ id: string; username: string | null; raid_node_progress: { cleared?: string[] } | null; has_completed_practice_raid: boolean | null }>) {
    const clearedCount = Array.isArray(p.raid_node_progress?.cleared) ? p.raid_node_progress!.cleared!.length : 0
    const bossCount = raidsByUser.get(p.id)?.size ?? 0
    const skirmish = p.has_completed_practice_raid ? 1 : 0
    const score = clearedCount + bossCount + skirmish
    if (score > 0) rows.push({ user_id: p.id, username: p.username ?? '', score, lastAt: lastByUser.get(p.id) ?? null })
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
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

// Charting Points: cumulative puzzle points banked across the Chart Room
// (Hold + Rigging + Treasure Match), stored in profiles.puzzle_points.
// Highest total wins; only players who've banked at least one point show.
// Ties broken by username ASC for a stable order (no per-point timestamp).
async function fetchChartingPointsBoard(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, puzzle_points')
    .eq('is_admin', false)
    .gt('puzzle_points', 0)
  type Row = LeaderboardEntry
  const rows: Row[] = ((profiles ?? []) as Array<{ id: string; username: string | null; puzzle_points: number | null }>)
    .map(p => ({ user_id: p.id, username: p.username ?? '', score: p.puzzle_points ?? 0 }))
  rows.sort((a, b) => b.score - a.score || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
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
  const myRow = me as { score?: number } | null
  const myScore: number | null = myRow === null ? null : (myRow.score ?? 0)
  const myRank = myScore === null ? null : await resolveMyRank(admin, 'leaderboard_perfect_streak', userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  const [profile, fishingData, perfectStreakData, tideRunData, chartingPointsData, fishSlotsData, blackjackData, rouletteData, expeditionData, raidProgressData, achievementPointsData] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    fetchBoard(admin, 'leaderboard_fishing', user.id),
    fetchPerfectStreakBoard(admin, user.id),
    fetchBoard(admin, 'leaderboard_tide_run', user.id),
    fetchChartingPointsBoard(admin, user.id),
    fetchBoard(admin, 'leaderboard_fish_slots', user.id),
    fetchBoard(admin, 'leaderboard_blackjack', user.id),
    fetchBoard(admin, 'leaderboard_roulette', user.id),
    fetchBoard(admin, 'leaderboard_expedition', user.id),
    fetchRaidProgressBoard(admin, user.id),
    getAchievementPointsBoard(admin, user.id),
  ])

  // Fetch avatar data (character_color + equipped_hat) for every user that
  // appears on any board, in a single round-trip, so the leaderboard rows
  // can render the player's actual character + hat composite next to their
  // username instead of a colored letter circle.
  const displayedUserIds = new Set<string>([
    ...fishingData.top.map(e => e.user_id),
    ...perfectStreakData.top.map(e => e.user_id),
    ...tideRunData.top.map(e => e.user_id),
    ...chartingPointsData.top.map(e => e.user_id),
    ...fishSlotsData.top.map(e => e.user_id),
    ...blackjackData.top.map(e => e.user_id),
    ...rouletteData.top.map(e => e.user_id),
    ...expeditionData.top.map(e => e.user_id),
    ...raidProgressData.top.map(e => e.user_id),
    ...achievementPointsData.top.map(e => e.user_id),
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
            chartingPoints={chartingPointsData.top}
            fishSlots={fishSlotsData.top}
            blackjack={blackjackData.top}
            roulette={rouletteData.top}
            expedition={expeditionData.top}
            raidProgress={raidProgressData.top}
            achievementPoints={achievementPointsData.top}
            myScores={{
              fishing: fishingData.myScore,
              perfectStreak: perfectStreakData.myScore,
              tideRun: tideRunData.myScore,
              chartingPoints: chartingPointsData.myScore,
              fishSlots: fishSlotsData.myScore,
              blackjack: blackjackData.myScore,
              roulette: rouletteData.myScore,
              expedition: expeditionData.myScore,
              raidProgress: raidProgressData.myScore,
              achievementPoints: achievementPointsData.myScore,
            }}
            myRanks={{
              fishing: fishingData.myRank,
              perfectStreak: perfectStreakData.myRank,
              tideRun: tideRunData.myRank,
              chartingPoints: chartingPointsData.myRank,
              fishSlots: fishSlotsData.myRank,
              blackjack: blackjackData.myRank,
              roulette: rouletteData.myRank,
              expedition: expeditionData.myRank,
              raidProgress: raidProgressData.myRank,
              achievementPoints: achievementPointsData.myRank,
            }}
            currentUserId={user.id}
            avatars={avatarsMap}
          />
        </div>
      </main>
    </>
  )
}
