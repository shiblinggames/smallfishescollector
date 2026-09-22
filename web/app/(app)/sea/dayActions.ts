'use server'

// ── EVERYTHING THAT RESETS, IN ONE READ ─────────────────────────────────────
//
// Kong: the dailies are hidden. Voyages live at the Charterhouse, trawls at
// the fleet, bounties at the Posting House, the puzzles and the trivia inside
// the Tavern, and every one of them only tells you its state once you have
// gone to look. The Daily Haul disc fixed that for the login bonus by asking
// for its own state and flashing while something was unclaimed; this is the
// same idea for the rest of the day.
//
// One server action, one round trip from the chart, fanning out to each
// system's OWN reader so nothing here can disagree with the sheet it opens.
// Every reader authenticates itself; a reader that fails leaves its row null
// rather than failing the board, because a board that is empty when one
// table hiccups is a board that flashes for nothing.
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentProfile } from '@/lib/userData'
import { isPremiumActive } from '@/lib/premium'
import { getDailyChallenge } from '@/app/(app)/fishing/dailyChallengeActions'
import { getDailyVoyageState } from '@/app/(app)/expeditions/voyageActions'
import { getTrawlState } from '@/app/(app)/fishing/trawls/actions'
import { getBountyBoard } from '@/app/(app)/expeditions/bountyActions'
import { getHoldState } from '@/app/(app)/tavern/chart-room/hold/actions'
import { getMatchState } from '@/app/(app)/charting/actions'
import { getMinefieldState } from '@/app/(app)/charting/minefieldActions'
import { getRiggingState } from '@/app/(app)/tavern/chart-room/rigging/actions'
import { kingWeekStr } from '@/app/(app)/tavern/trivia/constants'
import { finnState } from './finnActions'

export type DayState = {
  /** Today's Orders: the daily challenges. */
  orders: { done: number; total: number; ready: number; sweepClaimed: boolean } | null
  /** The daily voyage. */
  voyage: { state: 'none' | 'at_sea' | 'ready'; endsAt: number | null } | null
  /** The trawls: how many crews are out, how many hauls are waiting. */
  trawls: { out: number; ready: number; slots: number } | null
  /** The Posting House board. */
  bounties: { unlocked: boolean; claimed: number; total: number; claimable: number; remaining: number } | null
  /** The Chart Room's week: four puzzles. */
  chart: { solved: number; total: number } | null
  /** The Parlor: tonight's board and this week's ladder. */
  parlor: { boardPlayedToday: boolean; ladderDone: boolean } | null
  /** Finn's job. */
  finn: { hasJob: boolean; ready: boolean; label: string | null } | null
}

/** A thenable, not only a Promise: the Supabase query builder is one. */
const safe = async <T,>(p: PromiseLike<T>): Promise<T | null> => {
  try { return await p } catch { return null }
}

export async function dayState(): Promise<DayState | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [profile, orders, voyage, trawls, board, hold, mtch, mine, rig, boardAttempt, ladderAttempt, finn] = await Promise.all([
    safe(getCurrentProfile()),
    safe(getDailyChallenge()),
    safe(getDailyVoyageState()),
    safe(getTrawlState()),
    safe(getBountyBoard()),
    safe(getHoldState()),
    safe(getMatchState()),
    safe(getMinefieldState()),
    safe(getRiggingState()),
    safe(admin.from('trivia_board_attempts').select('answers').eq('user_id', user.id).eq('date', kingWeekStr()).maybeSingle()),
    safe(admin.from('trivia_ladder_attempts').select('status').eq('user_id', user.id).eq('date', kingWeekStr()).maybeSingle()),
    safe(finnState()),
  ])

  const out: DayState = { orders: null, voyage: null, trawls: null, bounties: null, chart: null, parlor: null, finn: null }

  if (orders) {
    const n = orders.challenges.length
    const done = orders.challenges.filter((c, i) => (orders.progress[i] ?? 0) >= c.target).length
    const ready = orders.challenges.filter((c, i) => (orders.progress[i] ?? 0) >= c.target && !orders.claimed[i]).length
    out.orders = { done, total: n, ready, sweepClaimed: orders.sweepClaimed }
  }

  if (voyage && !('error' in voyage)) {
    if (voyage.readyVoyage) out.voyage = { state: 'ready', endsAt: null }
    else if (voyage.todayVoyage) {
      const v = voyage.todayVoyage as { created_at: string; duration_ms?: number }
      const endsAt = new Date(v.created_at).getTime() + (v.duration_ms ?? 0)
      out.voyage = { state: 'at_sea', endsAt: v.duration_ms ? endsAt : null }
    } else out.voyage = { state: 'none', endsAt: null }
  }

  if (trawls && !('error' in trawls)) {
    const active = trawls.zones.filter(z => z.trawl)
    const ready = active.filter(z => z.trawl?.ready).length
    out.trawls = { out: active.length, ready, slots: trawls.unlockedSlots }
  }

  if (board) {
    const claimable = board.bounties.filter(b => !b.claimed && b.progress >= b.target).length
    const claimed = board.bounties.filter(b => b.claimed).length
    out.bounties = { unlocked: board.unlocked, claimed, total: board.bounties.length, claimable, remaining: board.remaining }
  }

  {
    const holdSolved = hold && !('error' in hold) ? (hold.puzzles.filter(p => p.solved).length > 0 ? 1 : 0) : 0
    const cleared = (s: { status: 'active' | 'cleared' } | { error: string } | null) => (s && !('error' in s) && s.status === 'cleared' ? 1 : 0)
    out.chart = { solved: holdSolved + cleared(mtch) + cleared(mine) + cleared(rig), total: 4 }
  }

  {
    const answers = (boardAttempt?.data?.answers as Record<string, { day?: string }> | null) ?? {}
    const picksAllowed = isPremiumActive(profile) ? 2 : 1
    const picksToday = Object.values(answers).filter(a => a.day === today).length
    // The ladder is one climb a week: anything but an active climb is settled.
    const ladder = ladderAttempt?.data?.status as string | undefined
    out.parlor = { boardPlayedToday: picksToday >= picksAllowed, ladderDone: ladder === 'walked' || ladder === 'busted' || ladder === 'crowned' }
  }

  if (finn) {
    out.finn = { hasJob: !!finn.quest, ready: finn.questReady, label: finn.quest?.label ?? null }
  }

  return out
}
