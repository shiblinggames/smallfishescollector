'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTESTS, type ContestView, type ContestStanding } from '@/lib/contests'
import { getAchievementPointsBoard } from '@/lib/achievementPoints'

/** Clear the "new contest" pulse on the tavern tile once the player opens this
 *  page. Re-arm by resetting has_seen_contests when a new contest launches. */
export async function markContestsSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const admin = createAdminClient()
  await admin.from('profiles').update({ has_seen_contests: true }).eq('id', user.id)
}

type AvatarRow = {
  username: string | null
  character_color: string | null
  equipped_hat: string | null
  avatar_bg_color: string | null
  avatar_border_color: string | null
  [k: string]: unknown
}

/** Resolve every contest's winner (from the contests table) and, for active
 *  board-backed contests, the live top-3 standings (straight off profiles so
 *  we get avatar fields in one query). Keyed by contest id. */
export async function getContestsView(): Promise<Record<string, ContestView>> {
  const admin = createAdminClient()
  const out: Record<string, ContestView> = {}

  for (const c of CONTESTS) {
    // Winner — the single atomic row in `contests`.
    const { data: winRow } = await admin
      .from('contests')
      .select('winner_user_id, won_at')
      .eq('contest_id', c.id)
      .maybeSingle()

    let winner: ContestView['winner'] = null
    if (winRow) {
      const { data: wp } = await admin
        .from('profiles')
        .select('username, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
        .eq('id', (winRow as { winner_user_id: string }).winner_user_id)
        .single()
      const p = wp as AvatarRow | null
      if (p) {
        winner = {
          username: p.username ?? 'A captain',
          characterColor: p.character_color,
          equippedHat: p.equipped_hat,
          avatarBg: p.avatar_bg_color,
          avatarBorder: p.avatar_border_color,
          wonAt: (winRow as { won_at: string }).won_at,
        }
      }
    }

    // Live standings — top 3 chasing the goal (board-backed contests only).
    let standings: ContestStanding[] = []
    if (c.board?.computed === 'achievement_points') {
      // Live-computed board (not a profiles column): pull the population-wide
      // achievement-points ranking, then fetch avatar fields for the top 3.
      const board = await getAchievementPointsBoard('')
      const top3 = board.top.slice(0, 3)
      if (top3.length > 0) {
        const { data: av } = await admin
          .from('profiles')
          .select('id, username, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
          .in('id', top3.map(r => r.user_id))
        const byId = new Map(((av ?? []) as Array<AvatarRow & { id: string }>).map(a => [a.id, a]))
        standings = top3.map((r, i) => {
          const a = byId.get(r.user_id)
          return {
            username: a?.username ?? r.username ?? 'A captain',
            characterColor: a?.character_color ?? null,
            equippedHat: a?.equipped_hat ?? null,
            avatarBg: a?.avatar_bg_color ?? null,
            avatarBorder: a?.avatar_border_color ?? null,
            score: r.score,
            rank: i + 1,
          }
        })
      }
    } else if (c.board?.statColumn && c.board.tiebreakColumn) {
      const stat = c.board.statColumn
      const tiebreak = c.board.tiebreakColumn
      const { data: rows } = await admin
        .from('profiles')
        .select(`username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, ${stat}`)
        .gt(stat, 0)
        .not('username', 'is', null)
        .eq('is_admin', false)
        .order(stat, { ascending: false })
        .order(tiebreak, { ascending: true, nullsFirst: false })
        .limit(3)
      standings = ((rows ?? []) as unknown as AvatarRow[]).map((r, i) => ({
        username: r.username ?? 'A captain',
        characterColor: r.character_color,
        equippedHat: r.equipped_hat,
        avatarBg: r.avatar_bg_color,
        avatarBorder: r.avatar_border_color,
        score: Number(r[stat] ?? 0),
        rank: i + 1,
      }))
    }

    out[c.id] = { winner, standings }
  }

  return out
}
