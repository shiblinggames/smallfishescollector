import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Nav from '@/components/Nav'
import LeaderboardClient from './LeaderboardClient'
import type { LeaderboardEntry } from './LeaderboardClient'
import {
  EXPEDITION_SHIP_STATS, computeCombatRating,
} from '@/lib/expeditions'
import { resolveDeployedCrew, type DeployedCrew } from '@/lib/crewResolve'
import { getLevelFromXP as getExpeditionLevel, navLevelBonuses } from '@/lib/expeditionLevel'

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

/** Raid Score isn't stored — it's a live combat rating computed from each
 *  player's CURRENT loadout (ship + assigned crew + nav-level bonuses). We
 *  pull every profile, sum stats, run computeCombatRating, sort. There's
 *  no leaderboard view to lean on since the inputs change every time the
 *  player edits their loadout. */
async function fetchRaidScoreBoard(admin: ReturnType<typeof createAdminClient>, userId: string) {
  // 1. All non-admin profiles with the fields that feed into combat rating.
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, ship_tier, expedition_xp')
    .eq('is_admin', false)

  if (!profiles || profiles.length === 0) {
    return { top: [] as LeaderboardEntry[], myScore: 0, myRank: null as number | null }
  }

  // 2. Everyone's deployed crew (assigned to a ship slot), one query, grouped.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const { data: crewRows } = await admin
    .from('user_crew')
    .select('id, user_id, assigned_slot, rarity, power, dodge, fortune, effects')
    .not('assigned_slot', 'is', null)
  const crewByUser = new Map<string, any[]>()
  for (const r of ((crewRows ?? []) as any[])) {
    const arr = crewByUser.get(r.user_id) ?? []
    arr.push(r)
    crewByUser.set(r.user_id, arr)
  }

  // 3. Resolve each player's deployed party (effects applied) → combat rating.
  const rows: LeaderboardEntry[] = []
  for (const p of profiles as Array<{ id: string; username: string | null; ship_tier: number | null; expedition_xp: number | null }>) {
    const shipStats = EXPEDITION_SHIP_STATS[p.ship_tier ?? 0] ?? EXPEDITION_SHIP_STATS[0]
    const navLevel  = getExpeditionLevel(p.expedition_xp ?? 0)
    const navBonus  = navLevelBonuses(navLevel)

    const party: DeployedCrew[] = (crewByUser.get(p.id) ?? [])
      .sort((a, b) => a.assigned_slot - b.assigned_slot)
      .slice(0, shipStats.crewSlots)
      .map(r => ({ id: r.id, slot: r.assigned_slot, rarity: r.rarity, power: r.power, dodge: r.dodge, fortune: r.fortune, effects: r.effects ?? [] }))
    const resolved = resolveDeployedCrew(party)

    const rating = computeCombatRating(
      resolved.totals.power + navBonus.power,
      resolved.totals.dodge + navBonus.navigation,
      resolved.totals.fortune + navBonus.fortune,
      shipStats.durability + navBonus.hp,
      shipStats.minDamage,
      resolved.raid,
    )

    if (rating.total > 0 && (party.length > 0 || (p.ship_tier ?? 0) > 0)) {
      rows.push({ user_id: p.id, username: p.username ?? '', score: rating.total })
    }
  }

  rows.sort((a, b) => b.score - a.score)
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  const myScore = myIdx >= 0 ? rows[myIdx].score : 0
  const myRank  = myIdx >= 0 ? myIdx + 1 : null
  return { top, myScore, myRank }
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

  const [profile, fishingData, perfectStreakData, tideRunData, fishSlotsData, expeditionData, raidScoreData] = await Promise.all([
    admin.from('profiles').select('packs_available, doubloons, gems').eq('id', user.id).single(),
    fetchBoard(admin, 'leaderboard_fishing', user.id),
    fetchPerfectStreakBoard(admin, user.id),
    fetchBoard(admin, 'leaderboard_tide_run', user.id),
    fetchBoard(admin, 'leaderboard_fish_slots', user.id),
    fetchBoard(admin, 'leaderboard_expedition', user.id),
    fetchRaidScoreBoard(admin, user.id),
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
    ...raidScoreData.top.map(e => e.user_id),
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
      <Nav packsAvailable={profile.data?.packs_available ?? 0} doubloons={profile.data?.doubloons ?? 0} gems={profile.data?.gems ?? 0} />
      <main className="min-h-screen pt-8" style={{ position: 'relative', zIndex: 1 }}>
        <div className="px-6 max-w-xl mx-auto">
          <LeaderboardClient
            fishing={fishingData.top}
            perfectStreak={perfectStreakData.top}
            tideRun={tideRunData.top}
            fishSlots={fishSlotsData.top}
            expedition={expeditionData.top}
            raidScore={raidScoreData.top}
            myScores={{
              fishing: fishingData.myScore,
              perfectStreak: perfectStreakData.myScore,
              tideRun: tideRunData.myScore,
              fishSlots: fishSlotsData.myScore,
              expedition: expeditionData.myScore,
              raidScore: raidScoreData.myScore,
            }}
            myRanks={{
              fishing: fishingData.myRank,
              perfectStreak: perfectStreakData.myRank,
              tideRun: tideRunData.myRank,
              fishSlots: fishSlotsData.myRank,
              expedition: expeditionData.myRank,
              raidScore: raidScoreData.myRank,
            }}
            currentUserId={user.id}
            avatars={avatarsMap}
          />
        </div>
      </main>
    </>
  )
}
