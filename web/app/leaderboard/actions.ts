'use server'

// On-demand leaderboard fetch for the in-section LeaderboardModal. Self
// contained (own auth + admin client) so it can be called from any
// client component without leaving the page. The /leaderboard page has
// its own server-side fetch with the same shape; this mirrors that
// plumbing for the subset of boards a section asks for.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { EXPEDITION_SHIP_STATS, applyVariantBoosts, computeCombatRating } from '@/lib/expeditions'
import { getLevelFromXP as getExpeditionLevel, navLevelBonuses } from '@/lib/expeditionLevel'
import type { LeaderboardEntry, BoardKey, AvatarMap } from './boardUI'

type Admin = ReturnType<typeof createAdminClient>

const VIEW_BY_KEY: Partial<Record<BoardKey, string>> = {
  fishingLevel: 'leaderboard_fishing',
  tideRun:      'leaderboard_tide_run',
  fishSlots:    'leaderboard_fish_slots',
  expedition:   'leaderboard_expedition',
}

async function resolveMyRank(admin: Admin, view: string, userId: string, myScore: number, top: LeaderboardEntry[]) {
  if (myScore <= 0) return null
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
  const topRows = (top ?? []) as LeaderboardEntry[]
  const myScore = (me as { score?: number } | null)?.score ?? 0
  const myRank = await resolveMyRank(admin, view, userId, myScore, topRows)
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
  const myScore = (me as { score?: number } | null)?.score ?? 0
  const myRank = await resolveMyRank(admin, 'leaderboard_perfect_streak', userId, myScore, topRows)
  return { top: topRows, myScore, myRank }
}

async function fetchRaidScore(admin: Admin, userId: string) {
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, username, ship_tier, saved_crew, expedition_xp')
    .eq('is_admin', false)
  if (!profiles || profiles.length === 0) return { top: [] as LeaderboardEntry[], myScore: 0, myRank: null as number | null }

  const variantIds = new Set<number>()
  for (const p of profiles as Array<{ saved_crew: number[] | null }>) {
    for (const id of (p.saved_crew ?? [])) variantIds.add(id)
  }
  const variantMap = new Map<number, { variantName: string; power: number; dodge: number; fortune: number; mythic: { power: number; dodge: number; fortune: number } }>()
  if (variantIds.size > 0) {
    const { data: variants } = await admin
      .from('card_variants')
      .select('id, variant_name, cards(power, dodge, fortune, mythic_power, mythic_dodge, mythic_fortune)')
      .in('id', Array.from(variantIds))
    for (const v of (variants ?? []) as unknown as Array<{ id: number; variant_name: string; cards: { power: number; dodge: number; fortune: number; mythic_power: number; mythic_dodge: number; mythic_fortune: number } | null }>) {
      const c = v.cards
      if (!c) continue
      variantMap.set(v.id, {
        variantName: v.variant_name,
        power: c.power ?? 0, dodge: c.dodge ?? 0, fortune: c.fortune ?? 0,
        mythic: { power: c.mythic_power ?? 0, dodge: c.mythic_dodge ?? 0, fortune: c.mythic_fortune ?? 0 },
      })
    }
  }
  const rows: LeaderboardEntry[] = []
  for (const p of profiles as Array<{ id: string; username: string | null; ship_tier: number | null; saved_crew: number[] | null; expedition_xp: number | null }>) {
    const shipStats = EXPEDITION_SHIP_STATS[p.ship_tier ?? 0] ?? EXPEDITION_SHIP_STATS[0]
    const navBonus = navLevelBonuses(getExpeditionLevel(p.expedition_xp ?? 0))
    let crewPower = 0, crewDodge = 0, crewFortune = 0
    ;(p.saved_crew ?? []).forEach((variantId, i) => {
      const v = variantMap.get(variantId)
      if (!v) return
      const boosted = applyVariantBoosts({ power: v.power, dodge: v.dodge, fortune: v.fortune }, v.variantName, v.mythic)
      const mult = i === 0 ? 1.0 : 0.8
      crewPower += Math.round(boosted.power * mult)
      crewDodge += Math.round(boosted.dodge * mult)
      crewFortune += Math.round(boosted.fortune * mult)
    })
    const rating = computeCombatRating(
      crewPower + navBonus.power, crewDodge + navBonus.navigation, crewFortune + navBonus.fortune,
      shipStats.durability + navBonus.hp, shipStats.minDamage,
    )
    if (rating.total > 0 && ((p.saved_crew ?? []).length > 0 || (p.ship_tier ?? 0) > 0)) {
      rows.push({ user_id: p.id, username: p.username ?? '', score: rating.total })
    }
  }
  rows.sort((a, b) => b.score - a.score)
  const top = rows.slice(0, 50)
  const myIdx = rows.findIndex(r => r.user_id === userId)
  return { top, myScore: myIdx >= 0 ? rows[myIdx].score : 0, myRank: myIdx >= 0 ? myIdx + 1 : null }
}

export interface LeaderboardBoardsResult {
  currentUserId: string
  boards: Partial<Record<BoardKey, LeaderboardEntry[]>>
  myScores: Partial<Record<BoardKey, number>>
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
  const myScores: Partial<Record<BoardKey, number>> = {}
  const myRanks: Partial<Record<BoardKey, number | null>> = {}

  await Promise.all(keys.map(async key => {
    let res: { top: LeaderboardEntry[]; myScore: number; myRank: number | null }
    if (key === 'perfectStreak')      res = await fetchPerfectStreak(admin, user.id)
    else if (key === 'raidScore')     res = await fetchRaidScore(admin, user.id)
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
