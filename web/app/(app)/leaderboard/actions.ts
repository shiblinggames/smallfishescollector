'use server'

// On-demand leaderboard fetch for the in-section LeaderboardModal. Self
// contained (own auth + admin client) so it can be called from any
// client component without leaving the page. The /leaderboard page has
// its own server-side fetch with the same shape; this mirrors that
// plumbing for the subset of boards a section asks for.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAchievementPointsBoard } from '@/lib/achievementPoints'
import type { LeaderboardEntry, BoardKey, AvatarMap } from './boardUI'

type Admin = ReturnType<typeof createAdminClient>

const VIEW_BY_KEY: Partial<Record<BoardKey, string>> = {
  fishingLevel: 'leaderboard_fishing',
  tideRun:      'leaderboard_tide_run',
  fishSlots:    'leaderboard_fish_slots',
  blackjack:    'leaderboard_blackjack',
  roulette:     'leaderboard_roulette',
  expedition:   'leaderboard_expedition',
  gauntletBigHit: 'leaderboard_gauntlet_hit',
  exchangeNet:  'leaderboard_exchange',
  exchangeWeek: 'leaderboard_exchange_week',
}

async function resolveMyRank(admin: Admin, view: string, userId: string, myScore: number, top: LeaderboardEntry[]) {
  // Caller is expected to skip this when the user has no row in the
  // view (myScore = null upstream). Once they DO have a row, every
  // score — including 0 or negative for signed-score boards like
  // Blackjack — gets a real rank. We tiebreak by "count of strictly
  // higher scores" + 1, matching how the in-list rank reads.
  const idx = top.findIndex(e => e.user_id === userId)
  if (idx >= 0) return idx + 1
  const { count } = await admin.from(view).select('*', { count: 'exact', head: true }).gt('score', myScore)
  return (count ?? 0) + 1
}

async function fetchViewBoard(admin: Admin, view: string, userId: string) {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from(view).select('user_id, username, score').order('score', { ascending: false }).order('created_at', { ascending: true }).limit(50),
    admin.from(view).select('score').eq('user_id', userId).single(),
  ])
  // Coerce score → number. The tide-run view exposes numeric(10,1) and
  // PostgREST serializes numeric as a string by default; downstream
  // formatters (toLocaleString, arithmetic) would silently break on a
  // string. The other views' scores are integers but Number() is a no-op
  // on those, so this is safe across all boards.
  const topRows = ((top ?? []) as Array<{ user_id: string; username: string; score: number | string }>)
    .map(r => ({ user_id: r.user_id, username: r.username, score: Number(r.score) })) as LeaderboardEntry[]
  // myScore = null when the player has no row in the view (haven't
  // played / no score). Boards that allow signed scores (Blackjack)
  // distinguish "broke even, 0 net" (number) from "never played" (null).
  const myRow = me as { score?: number | string } | null
  const myScore = myRow === null ? null : Number(myRow.score)
  const myRank = myScore === null ? null : await resolveMyRank(admin, view, userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

function fmtRunTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

// Gauntlet "Deepest Descent" — compound sort: deepest CASHED-OUT depth, then
// WHO GOT THERE FIRST (created_at), then fastest run time. First-to-depth wins
// ties by design (2026-07-11, was fastest-run-first): reaching a record depth
// first is the claim; a later, faster run to the SAME depth doesn't take it.
// The view already excludes deaths (only cash-outs write gauntlet_best_depth)
// + admins. The hardcore "Drowned Ledger" board is the same shape on its own view.
async function fetchGauntlet(admin: Admin, userId: string, view = 'leaderboard_gauntlet') {
  const [{ data: top }, { data: me }] = await Promise.all([
    admin.from(view)
      .select('user_id, username, score, time_ms')
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .order('time_ms', { ascending: true })
      .limit(50),
    admin.from(view).select('score').eq('user_id', userId).single(),
  ])
  const topRows = ((top ?? []) as Array<{ user_id: string; username: string; score: number | string; time_ms: number | string | null }>)
    .map(r => ({
      user_id: r.user_id,
      username: r.username,
      score: Number(r.score),
      sub: r.time_ms != null ? fmtRunTime(Number(r.time_ms)) : 'cashed out',
    })) as LeaderboardEntry[]
  const myRow = me as { score?: number | string } | null
  const myScore = myRow === null ? null : Number(myRow.score)
  const myRank = myScore === null ? null : await resolveMyRank(admin, view, userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

async function fetchPerfectStreak(admin: Admin, userId: string) {
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
  const myScore = myRow === null ? null : (myRow.score ?? 0)
  const myRank = myScore === null ? null : await resolveMyRank(admin, 'leaderboard_perfect_streak', userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

// Raid Progress: total distinct nodes cleared (everything counts as 1).
// Combines raid_node_progress.cleared[] (story / milestone / shop /
// puzzle / event / class-pick) with distinct raid_completions.raid_id
// (boss nodes) and the skirmish flag (has_completed_practice_raid).
// Ties broken by latest raid_completions.completed_at ASC. Mirrors
// fetchRaidProgressBoard in /leaderboard/page.tsx.
async function fetchRaidProgress(admin: Admin, userId: string) {
  // Scored + ranked in SQL (raid_progress_board), same as the /leaderboard page —
  // no longer pulls every profile + every raid_completion to rank in JS.
  const { data } = await admin.rpc('raid_progress_board')
  const rows = (data ?? []) as Array<{ user_id: string; username: string | null; score: number }>
  const top: LeaderboardEntry[] = rows.slice(0, 50).map(r => ({ user_id: r.user_id, username: r.username ?? '', score: r.score }))
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

// Charting Points: cumulative puzzle points (Chart Room) from
// profiles.puzzle_points. Mirrors fetchChartingPointsBoard in
// /leaderboard/page.tsx — highest total wins, ties broken by username ASC.
async function fetchChartingPoints(admin: Admin, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, puzzle_points')
    .eq('is_admin', false)
    .gt('puzzle_points', 0)
  const rows: LeaderboardEntry[] = ((profiles ?? []) as Array<{ id: string; username: string | null; puzzle_points: number | null }>)
    .map(p => ({ user_id: p.id, username: p.username ?? '', score: p.puzzle_points ?? 0 }))
  rows.sort((a, b) => b.score - a.score || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

// Parlor Points: cumulative parlor points (The Parlor trivia hub) from
// profiles.parlor_points. Same live-computed shape as fetchChartingPoints —
// highest total wins, ties broken by username ASC.
async function fetchParlorPoints(admin: Admin, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, parlor_points')
    .eq('is_admin', false)
    .gt('parlor_points', 0)
  const rows: LeaderboardEntry[] = ((profiles ?? []) as Array<{ id: string; username: string | null; parlor_points: number | null }>)
    .map(p => ({ user_id: p.id, username: p.username ?? '', score: p.parlor_points ?? 0 }))
  rows.sort((a, b) => b.score - a.score || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0))
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : null, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

// Total Prestige board retired 2026-07-22 when prestige was capped at 5 ("Max
// Prestige") — an infinite ladder no longer made sense.

export interface LeaderboardBoardsResult {
  currentUserId: string
  boards: Partial<Record<BoardKey, LeaderboardEntry[]>>
  myScores: Partial<Record<BoardKey, number | null>>
  myRanks: Partial<Record<BoardKey, number | null>>
  avatars: AvatarMap
}

export async function getLeaderboardBoards(
  keys: BoardKey[],
): Promise<LeaderboardBoardsResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const boards: Partial<Record<BoardKey, LeaderboardEntry[]>> = {}
  const myScores: Partial<Record<BoardKey, number | null>> = {}
  const myRanks: Partial<Record<BoardKey, number | null>> = {}

  await Promise.all(keys.map(async key => {
    let res: { top: LeaderboardEntry[]; myScore: number | null; myRank: number | null }
    if (key === 'perfectStreak')      res = await fetchPerfectStreak(admin, user.id)
    else if (key === 'raidProgress')  res = await fetchRaidProgress(admin, user.id)
    else if (key === 'chartingPoints') res = await fetchChartingPoints(admin, user.id)
    else if (key === 'parlorPoints')  res = await fetchParlorPoints(admin, user.id)
    else if (key === 'achievementPoints') res = await getAchievementPointsBoard(user.id)
    else if (key === 'gauntletDepth') res = await fetchGauntlet(admin, user.id)
    else if (key === 'gauntletHardcore') res = await fetchGauntlet(admin, user.id, 'leaderboard_gauntlet_hardcore')
    else if (key === 'gauntletDonsDepth') res = await fetchGauntlet(admin, user.id, 'leaderboard_dons_gauntlet')
    else {
      const view = VIEW_BY_KEY[key]
      if (!view) return
      res = await fetchViewBoard(admin, view, user.id)
    }
    boards[key]   = res.top
    myScores[key] = res.myScore
    myRanks[key]  = res.myRank
  }))

  const userIds = new Set<string>([user.id])
  for (const list of Object.values(boards)) for (const e of list ?? []) userIds.add(e.user_id)

  const avatars: AvatarMap = {}
  if (userIds.size > 0) {
    const { data: rows } = await admin
      .from('profiles')
      .select('id, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .in('id', Array.from(userIds))
    for (const r of (rows ?? []) as Array<{ id: string; character_color: string | null; equipped_hat: string | null; avatar_bg_color: string | null; avatar_border_color: string | null }>) {
      avatars[r.id] = {
        characterColor: r.character_color,
        equippedHat: r.equipped_hat,
        avatarBg: r.avatar_bg_color,
        avatarBorder: r.avatar_border_color,
      }
    }
  }

  return { currentUserId: user.id, boards, myScores, myRanks, avatars }
}
