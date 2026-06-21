import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { getCasinoState } from './actions'
import { getSlotsJackpot } from '../actions'
import CasinoLobby from './CasinoLobby'
import type { DenTopEarner, DenLeaderboards } from './types'

// The four High Rollers boards: the combined Den net (overall, default tab)
// plus each game's own lifetime-net view. Keyed to DenLeaderboards.
const DEN_BOARDS = [
  { key: 'overall',   view: 'leaderboard_den' },
  { key: 'blackjack', view: 'leaderboard_blackjack' },
  { key: 'roulette',  view: 'leaderboard_roulette' },
  { key: 'slots',     view: 'leaderboard_fish_slots' },
] as const

type RawRow = { user_id: string; username: string; score: number | string }

// Top 3 net-up earners per board (the lobby showcases winners, not losers),
// with avatar data enriched in ONE profiles query across all four boards.
async function getDenLeaderboards(): Promise<DenLeaderboards> {
  const admin = createAdminClient()

  const lists = await Promise.all(DEN_BOARDS.map(async ({ view }) => {
    const { data } = await admin
      .from(view)
      .select('user_id, username, score')
      .gt('score', 0)
      .order('score', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(3)
    return ((data ?? []) as RawRow[]).map(r => ({ user_id: r.user_id, username: r.username, score: Number(r.score) }))
  }))

  const allIds = Array.from(new Set(lists.flat().map(r => r.user_id)))
  const avatarById = new Map<string, { character_color: string | null; equipped_hat: string | null; avatar_bg_color: string | null; avatar_border_color: string | null }>()
  if (allIds.length > 0) {
    const { data: avatarRows } = await admin
      .from('profiles')
      .select('id, character_color, equipped_hat, avatar_bg_color, avatar_border_color')
      .in('id', allIds)
    for (const a of avatarRows ?? []) avatarById.set(a.id as string, a as never)
  }

  const enrich = (rows: { user_id: string; username: string; score: number }[]): DenTopEarner[] =>
    rows.map(r => {
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

  const out = { overall: [], blackjack: [], roulette: [], slots: [] } as unknown as DenLeaderboards
  DEN_BOARDS.forEach((b, i) => { out[b.key] = enrich(lists[i]) })
  return out
}

export default async function CasinoPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Parallel: shared wallet snapshot + live jackpot pot (rides on the
  // slots card) + the High Rollers strip.
  const [wallet, jackpot, denBoards] = await Promise.all([
    getCasinoState(),
    getSlotsJackpot(),
    getDenLeaderboards(),
  ])

  return (
    <main className="min-h-screen pb-24 sm:pb-0">
      <div className="px-4 pt-6 pb-12">
        <CasinoLobby
          initial={wallet}
          jackpotPot={jackpot.pot}
          denBoards={denBoards}
        />
      </div>
    </main>
  )
}
