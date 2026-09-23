import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentUser } from '@/lib/userData'
import { redirect } from 'next/navigation'
import { type AvatarMap } from './boardUI'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'
import { getAchievementPointsBoard } from '@/lib/achievementPoints'

/** How long every visitor shares one read of the top of each board. The
 *  captain's OWN score and rank are read fresh on every visit. */
const SHARED_SECONDS = 30

/** Boards that are a plain view with a `score` column. */
const VIEW_BOARDS = {
  fishing: 'leaderboard_fishing',
  fishSlots: 'leaderboard_fish_slots',
  blackjack: 'leaderboard_blackjack',
  roulette: 'leaderboard_roulette',
  expedition: 'leaderboard_expedition',
  species: 'leaderboard_species',
  fishSold: 'leaderboard_fish_sold',
  trophies: 'leaderboard_trophies',
  bountyPoints: 'leaderboard_bounty_points',
} as const
type ViewKey = keyof typeof VIEW_BOARDS
type Mine = { myScore: number | null; myRank: number | null }

const num = (rows: unknown): LeaderboardEntry[] =>
  ((rows ?? []) as Array<{ user_id: string; username: string | null; score: number | string }>)
    // Coerce score to a number. Some views expose numeric, and PostgREST
    // serializes numeric as a string; toLocaleString would silently break.
    .map(r => ({ user_id: r.user_id, username: r.username ?? '', score: Number(r.score) }))

/** Highest first, ties by name, for the two boards ranked out of profiles. */
const byScoreThenName = (a: LeaderboardEntry, b: LeaderboardEntry) =>
  b.score - a.score || (a.username < b.username ? -1 : a.username > b.username ? 1 : 0)

/**
 * ── THE PART EVERY VISITOR SEES THE SAME ────────────────────────────────────
 *
 * The top fifty of every board, the whole-population boards (raid progress,
 * charting and parlor points, ranked from every row), and the avatars for
 * everyone on them. Identical for every captain, and it was read afresh on
 * every visit: some thirty queries and then the avatars behind them. Held for
 * SHARED_SECONDS across all visitors now, the way the Achievement Points board
 * already was (lib/achievementPoints), so a visit usually pays for none of it.
 * A board may lag a catch by that long; your own row does not.
 */
const sharedBoards = unstable_cache(async () => {
  const admin = createAdminClient()
  const viewKeys = Object.keys(VIEW_BOARDS) as ViewKey[]
  const [viewTops, streakTop, raidRows, chartRows, parlorRows, achievement] = await Promise.all([
    Promise.all(viewKeys.map(k => admin.from(VIEW_BOARDS[k]).select('user_id, username, score')
      .order('score', { ascending: false }).order('created_at', { ascending: true }).limit(50))),
    admin.from('leaderboard_perfect_streak').select('user_id, username, score, zone')
      .order('score', { ascending: false }).order('zone_rank', { ascending: false }).order('created_at', { ascending: true }).limit(50),
    // Raid Progress: scored and ranked in SQL (raid_progress_board); rows
    // arrive ordered (score desc, earliest last clear first) and above 0.
    admin.rpc('raid_progress_board'),
    // Charting and Parlor points: banked totals on profiles, anyone above 0.
    admin.from('profiles').select('id, username, puzzle_points').eq('is_admin', false).gt('puzzle_points', 0),
    admin.from('profiles').select('id, username, parlor_points').eq('is_admin', false).gt('parlor_points', 0),
    // The top of the Achievement Points board, for the avatars; the viewer's
    // own place on it is asked for separately below.
    getAchievementPointsBoard(''),
  ])
  const tops = Object.fromEntries(viewKeys.map((k, i) => [k, num(viewTops[i].data)])) as Record<ViewKey, LeaderboardEntry[]>
  const raidAll = num(raidRows.data)
  const chartAll = ((chartRows.data ?? []) as Array<{ id: string; username: string | null; puzzle_points: number | null }>)
    .map(p => ({ user_id: p.id, username: p.username ?? '', score: p.puzzle_points ?? 0 })).sort(byScoreThenName)
  const parlorAll = ((parlorRows.data ?? []) as Array<{ id: string; username: string | null; parlor_points: number | null }>)
    .map(p => ({ user_id: p.id, username: p.username ?? '', score: p.parlor_points ?? 0 })).sort(byScoreThenName)
  const perfectStreak = (streakTop.data ?? []) as LeaderboardEntry[]

  // Everyone who appears on any board, in one round trip. The same select
  // carries what the podium needs to draw a whole fisher (boat, pet, rod,
  // reel, hook).
  const ids = new Set<string>([
    ...Object.values(tops).flat(), ...perfectStreak, ...raidAll.slice(0, 50),
    ...chartAll.slice(0, 50), ...parlorAll.slice(0, 50), ...achievement.top,
  ].map(e => e.user_id))
  const avatars: AvatarMap = {}
  if (ids.size > 0) {
    const { data: avatarRows } = await admin
      .from('profiles')
      .select('id, character_color, equipped_hat, avatar_bg_color, avatar_border_color, equipped_boat, equipped_pet, rod_tier, reel_tier, hook_tier')
      .in('id', Array.from(ids))
    for (const row of (avatarRows ?? []) as Array<{
      id: string; character_color: string | null; equipped_hat: string | null
      avatar_bg_color: string | null; avatar_border_color: string | null
      equipped_boat: string | null; equipped_pet: string | null
      rod_tier: number | null; reel_tier: number | null; hook_tier: number | null
    }>) {
      avatars[row.id] = {
        characterColor: row.character_color,
        equippedHat: row.equipped_hat,
        avatarBg: row.avatar_bg_color,
        avatarBorder: row.avatar_border_color,
        equippedBoat: row.equipped_boat,
        equippedPet: row.equipped_pet,
        rodTier: row.rod_tier ?? 0,
        reelTier: row.reel_tier ?? 0,
        hookTier: row.hook_tier ?? 0,
      }
    }
  }
  return { tops, perfectStreak, raidAll, chartAll, parlorAll, avatars }
}, ['leaderboard-shared-v1'], { revalidate: SHARED_SECONDS })

/** Your own place on a whole-population board, from the rows already held. */
function placeIn(all: LeaderboardEntry[], userId: string) {
  const i = all.findIndex(r => r.user_id === userId)
  return { top: all.slice(0, 50), myScore: i >= 0 ? all[i].score : null, myRank: i >= 0 ? i + 1 : null }
}

/**
 * YOUR ROW ON A VIEW BOARD, read fresh. No row means you have not played it
 * (null), which is not the same as 0 on a signed board like Blackjack. The
 * rank is your index when you are in the shared top fifty, and otherwise how
 * many score above you, plus one.
 */
async function mineOn(
  admin: ReturnType<typeof createAdminClient>, view: string, userId: string, top: LeaderboardEntry[],
): Promise<Mine> {
  const { data } = await admin.from(view).select('score').eq('user_id', userId).maybeSingle()
  if (!data) return { myScore: null, myRank: null }
  const myScore = Number((data as { score: number | string }).score)
  const idx = top.findIndex(e => e.user_id === userId)
  if (idx >= 0) return { myScore, myRank: idx + 1 }
  const { count } = await admin.from(view).select('*', { count: 'exact', head: true }).gt('score', myScore)
  return { myScore, myRank: (count ?? 0) + 1 }
}

export default async function LeaderboardPage() {
  // The request-cached check the shell already made (lib/userData), not a
  // second trip to the auth server.
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const shared = await sharedBoards()
  const viewKeys = Object.keys(VIEW_BOARDS) as ViewKey[]
  const [viewMine, streakMine, achievementPointsData] = await Promise.all([
    Promise.all(viewKeys.map(k => mineOn(admin, VIEW_BOARDS[k], user.id, shared.tops[k]))),
    mineOn(admin, 'leaderboard_perfect_streak', user.id, shared.perfectStreak),
    getAchievementPointsBoard(user.id),
  ])
  const v = Object.fromEntries(viewKeys.map((k, i) => [k, { top: shared.tops[k], ...viewMine[i] }])) as
    Record<ViewKey, { top: LeaderboardEntry[] } & Mine>
  const fishingData = v.fishing, fishSlotsData = v.fishSlots, blackjackData = v.blackjack
  const rouletteData = v.roulette, expeditionData = v.expedition, speciesData = v.species
  const fishSoldData = v.fishSold, trophiesData = v.trophies, bountyPointsData = v.bountyPoints
  const perfectStreakData = { top: shared.perfectStreak, ...streakMine }
  const raidProgressData = placeIn(shared.raidAll, user.id)
  const chartingPointsData = placeIn(shared.chartAll, user.id)
  const parlorPointsData = placeIn(shared.parlorAll, user.id)
  const avatarsMap = shared.avatars

  return (
    <>
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="page-col page-col-modal" style={{ maxWidth: 'max(var(--modal-w), var(--game-col))' }}>
          <div style={{ marginBottom: '1.1rem' }}>
            <h1 className="font-cinzel font-700" style={{ fontSize: '1.5rem', color: '#f0ede8' }}>Leaderboards</h1>
          </div>
          <LeaderboardClient
            fishing={fishingData.top}
            perfectStreak={perfectStreakData.top}
            chartingPoints={chartingPointsData.top}
            parlorPoints={parlorPointsData.top}
            fishSlots={fishSlotsData.top}
            blackjack={blackjackData.top}
            roulette={rouletteData.top}
            expedition={expeditionData.top}
            raidProgress={raidProgressData.top}
            achievementPoints={achievementPointsData.top}
            species={speciesData.top}
            fishSold={fishSoldData.top}
            trophies={trophiesData.top}
            bountyPoints={bountyPointsData.top}
            myScores={{
              fishing: fishingData.myScore,
              perfectStreak: perfectStreakData.myScore,
              chartingPoints: chartingPointsData.myScore,
              parlorPoints: parlorPointsData.myScore,
              fishSlots: fishSlotsData.myScore,
              blackjack: blackjackData.myScore,
              roulette: rouletteData.myScore,
              expedition: expeditionData.myScore,
              raidProgress: raidProgressData.myScore,
              achievementPoints: achievementPointsData.myScore,
              species: speciesData.myScore,
              fishSold: fishSoldData.myScore,
              trophies: trophiesData.myScore,
              bountyPoints: bountyPointsData.myScore,
            }}
            myRanks={{
              fishing: fishingData.myRank,
              perfectStreak: perfectStreakData.myRank,
              chartingPoints: chartingPointsData.myRank,
              parlorPoints: parlorPointsData.myRank,
              fishSlots: fishSlotsData.myRank,
              blackjack: blackjackData.myRank,
              roulette: rouletteData.myRank,
              expedition: expeditionData.myRank,
              raidProgress: raidProgressData.myRank,
              achievementPoints: achievementPointsData.myRank,
              species: speciesData.myRank,
              fishSold: fishSoldData.myRank,
              trophies: trophiesData.myRank,
              bountyPoints: bountyPointsData.myRank,
            }}
            currentUserId={user.id}
            avatars={avatarsMap}
          />
        </div>
      </main>
    </>
  )
}
