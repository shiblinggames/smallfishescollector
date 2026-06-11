import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCasinoState } from './actions'
import { getSlotsJackpot } from '../actions'
import CasinoLobby from './CasinoLobby'
import type { DenTopEarner } from './types'

// Top 3 combined lifetime earners across all three Den games
// (leaderboard_den view). Only net-up players make the strip — the
// lobby showcases winners, it doesn't headline losers. Avatar data
// rides along so the rows render real characters.
async function getDenTopEarners(): Promise<DenTopEarner[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('leaderboard_den')
    .select('user_id, username, score')
    .gt('score', 0)
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(3)
  const rows = ((data ?? []) as Array<{ user_id: string; username: string; score: number | string }>)
    .map(r => ({ user_id: r.user_id, username: r.username, score: Number(r.score) }))
  if (rows.length === 0) return []
  const { data: avatarRows } = await admin
    .from('profiles')
    .select('id, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
    .in('id', rows.map(r => r.user_id))
  const avatarById = new Map((avatarRows ?? []).map(a => [a.id as string, a]))
  return rows.map(r => {
    const a = avatarById.get(r.user_id)
    return {
      userId: r.user_id,
      username: r.username,
      score: r.score,
      characterColor: a?.character_color ?? null,
      equippedHat: a?.equipped_hat ?? null,
      avatarBg: a?.avatar_bg_color ?? null,
      avatarBorder: a?.avatar_border_color ?? null,
    }
  })
}

export default async function CasinoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: shared wallet snapshot + live jackpot pot (rides on the
  // slots card) + the High Rollers strip.
  const [wallet, jackpot, topEarners] = await Promise.all([
    getCasinoState(),
    getSlotsJackpot(),
    getDenTopEarners(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <CasinoLobby
          initial={wallet}
          jackpotPot={jackpot.pot}
          topEarners={topEarners}
        />
      </div>
    </main>
  )
}
