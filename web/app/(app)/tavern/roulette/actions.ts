'use server'

// Fish Roulette server actions. Mirrors the blackjack pattern — buy-in
// converts doubloons to chips, chips stake bets that can churn freely
// without re-hitting the daily cap, cash-out converts chips back. The
// crucial difference vs. blackjack: roulette has no mid-game state.
// Bet → spin → settle is one atomic action; there's no "resume the
// spin" path because nothing is left in-flight.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import {
  rollWinningNumber, settleSpin, validateBet,
  type Bet,
} from '@/lib/roulette'
import {
  RL_MIN_BET, RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET,
  RL_DAILY_CAP, RL_BUY_IN_MIN, RL_BUY_IN_MAX,
} from '../constants'
import type { RouletteState, BuyInResult, CashOutResult, SpinResult, RecentSpin } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Daily-wager helper (mirrors blackjack's getDailyBuyInTotal) ──────

async function getDailyBuyInTotal(userId: string): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('roulette_buy_ins')
    .select('amount')
    .eq('user_id', userId)
    .gte('created_at', today)
  return (data ?? []).reduce((sum: number, r: any) => sum + (r.amount as number), 0)
}

// ── Snapshot: what the page server-renders ───────────────────────────

export async function getRouletteState(): Promise<RouletteState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      chips: 0, doubloons: 0, sessionBuyIns: 0,
      dailyWagered: 0, dailyRemaining: RL_DAILY_CAP,
      recentSpins: [],
    }
  }
  const admin = createAdminClient()
  const [{ data: profile }, dailyWagered, { data: recentRows }] = await Promise.all([
    admin.from('profiles')
      .select('doubloons, roulette_chips, roulette_session_buy_ins')
      .eq('id', user.id)
      .single(),
    getDailyBuyInTotal(user.id),
    admin.from('roulette_spins')
      .select('id, winning_number, net_chips, total_wagered, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const recentSpins: RecentSpin[] = ((recentRows ?? []) as any[]).map(r => ({
    id: r.id,
    winningNumber: r.winning_number,
    net: r.net_chips,
    totalWagered: r.total_wagered,
    createdAt: r.created_at,
  }))

  return {
    chips: (profile?.roulette_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.roulette_session_buy_ins as number | null) ?? 0,
    dailyWagered,
    dailyRemaining: Math.max(0, RL_DAILY_CAP - dailyWagered),
    recentSpins,
  }
}

// ── Buy-in / Cash-out ────────────────────────────────────────────────

/** Convert N doubloons → N chips. Same daily-cap semantics as blackjack
 *  — capped at RL_DAILY_CAP doubloons committed to the table per day. */
export async function buyInRoulette(amount: number): Promise<BuyInResult | { error: string }> {
  if (!Number.isInteger(amount) || amount < RL_BUY_IN_MIN || amount > RL_BUY_IN_MAX) {
    return { error: 'Invalid amount' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, roulette_chips, roulette_session_buy_ins')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const chips = (profile.roulette_chips as number | null) ?? 0
  const prevSessionBuyIns = (profile.roulette_session_buy_ins as number | null) ?? 0
  if (doubloons < amount) return { error: 'Insufficient doubloons' }

  const dailyAlready = await getDailyBuyInTotal(user.id)
  if (dailyAlready + amount > RL_DAILY_CAP) {
    return { error: `Daily limit reached (${RL_DAILY_CAP} ⟡)` }
  }

  const newDoubloons = doubloons - amount
  const newChips = chips + amount
  const newSessionBuyIns = prevSessionBuyIns + amount

  await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      roulette_chips: newChips,
      roulette_session_buy_ins: newSessionBuyIns,
    }).eq('id', user.id),
    admin.from('roulette_buy_ins').insert({ user_id: user.id, amount }),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -amount, reason: `Roulette: buy-in ${amount} ⟡` }),
  ])

  revalidatePath('/tavern')
  return {
    newDoubloons, newChips,
    dailyWagered: dailyAlready + amount,
    dailyRemaining: Math.max(0, RL_DAILY_CAP - (dailyAlready + amount)),
    sessionBuyIns: newSessionBuyIns,
  }
}

/** Convert all chips → doubloons. Errors if there are no chips on the
 *  table. Session counter resets to 0 on cash-out (mirrors blackjack). */
export async function cashOutRoulette(): Promise<CashOutResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, roulette_chips')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const chips = (profile.roulette_chips as number | null) ?? 0
  if (chips <= 0) return { error: 'No chips to cash out' }

  const newDoubloons = doubloons + chips

  await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      roulette_chips: 0,
      roulette_session_buy_ins: 0,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: chips, reason: `Roulette: cash-out ${chips} ⟡` }),
  ])

  revalidatePath('/tavern')
  return { newDoubloons, cashedOut: chips, sessionBuyIns: 0 }
}

// ── The actual spin ──────────────────────────────────────────────────

/** Atomic bet → spin → settle. Validates every bet against the configured
 *  min/max, debits chips, rolls the wheel server-side, settles via the
 *  pure logic in lib/roulette, writes one roulette_spins row + updates
 *  the player's chip balance, and returns the winning number + payout
 *  for the client to animate. */
export async function placeBetsAndSpin(bets: Bet[]): Promise<SpinResult | { error: string }> {
  if (!Array.isArray(bets) || bets.length === 0) return { error: 'Place at least one bet' }
  if (bets.length > 50) return { error: 'Too many bets' }

  // Per-bet validation — inside (single-pocket / few-pocket high-vol)
  // bets share the straight cap; outside (low-vol) bets get the higher
  // cap. Same constants used by the client buttons so a bet that's UI-
  // valid is also server-valid.
  const INSIDE: ReadonlySet<string> = new Set(['straight', 'split', 'street', 'corner', 'line'])
  for (const bet of bets) {
    const maxBet = INSIDE.has(bet.type) ? RL_MAX_STRAIGHT_BET : RL_MAX_OUTSIDE_BET
    const err = validateBet(bet, RL_MIN_BET, maxBet)
    if (err) return { error: err }
  }

  const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0)
  if (totalWagered <= 0) return { error: 'Invalid bet total' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('roulette_chips, doubloons')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const chipsBefore = (profile.roulette_chips as number | null) ?? 0
  if (chipsBefore < totalWagered) return { error: 'Not enough chips' }

  // Server-authoritative spin + pure settlement.
  const winningNumber = rollWinningNumber()
  const settlement = settleSpin(bets, winningNumber)

  const chipsAfter = chipsBefore - settlement.totalWagered + settlement.totalPayout

  await Promise.all([
    admin.from('profiles').update({ roulette_chips: chipsAfter }).eq('id', user.id),
    admin.from('roulette_spins').insert({
      user_id: user.id,
      bets: bets as unknown as object,
      winning_number: winningNumber,
      total_wagered: settlement.totalWagered,
      total_payout: settlement.totalPayout,
      net_chips: settlement.net,
      chips_before: chipsBefore,
      chips_after: chipsAfter,
    }),
  ])

  return {
    winningNumber,
    totalWagered: settlement.totalWagered,
    totalPayout: settlement.totalPayout,
    net: settlement.net,
    chipsBefore,
    chipsAfter,
    perBet: settlement.perBet,
    doubloons: (profile.doubloons as number | null) ?? 0,
  }
}
