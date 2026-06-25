'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTESTS, type ContestView, type ContestStanding } from '@/lib/contests'

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
    if (c.board) {
      const stat = c.board.statColumn
      const { data: rows } = await admin
        .from('profiles')
        .select(`username, character_color, equipped_hat, avatar_bg_color, avatar_border_color, ${stat}`)
        .gt(stat, 0)
        .not('username', 'is', null)
        .eq('is_admin', false)
        .order(stat, { ascending: false })
        .order(c.board.tiebreakColumn, { ascending: true, nullsFirst: false })
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
