'use server'

// Fish Roulette server actions. Wagers come out of the SHARED casino
// chip purse (profiles.casino_chips — one balance across blackjack/
// roulette/slots); buy-in and cash-out live in ../casino/actions.
// Roulette has no mid-game state: bet → spin → settle is one atomic
// action, so this file is just the spin plus the page snapshot.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  rollWinningNumber, settleSpin, validateBet,
  type Bet,
} from '@/lib/roulette'
import {
  RL_MIN_BET, RL_MAX_STRAIGHT_BET, RL_MAX_OUTSIDE_BET,
  CASINO_DAILY_CAP,
} from '../constants'
import type { RouletteState, SpinResult, RecentSpin } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Today's buy-ins into the SHARED casino wallet (one cap across all
// three games — casino_buy_ins is the only source).
async function getDailyBuyInTotal(userId: string): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('casino_buy_ins')
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
      chips: 0, doubloons: 0, sessionBuyIns: 0, sessionNet: 0,
      dailyBoughtIn: 0, dailyRemaining: CASINO_DAILY_CAP,
      recentSpins: [],
    }
  }
  const admin = createAdminClient()
  const [{ data: profile }, dailyBoughtIn, { data: recentRows }] = await Promise.all([
    admin.from('profiles')
      .select('doubloons, casino_chips, casino_session_buy_ins, roulette_session_net')
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
    chips: (profile?.casino_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.casino_session_buy_ins as number | null) ?? 0,
    sessionNet: (profile?.roulette_session_net as number | null) ?? 0,
    dailyBoughtIn,
    dailyRemaining: Math.max(0, CASINO_DAILY_CAP - dailyBoughtIn),
    recentSpins,
  }
}

// ── The actual spin ──────────────────────────────────────────────────

/** Atomic bet → spin → settle. Validates every bet against the configured
 *  min/max, debits the shared casino purse, rolls the wheel server-side,
 *  settles via the pure logic in lib/roulette, writes one roulette_spins
 *  row + updates the chip balance and roulette's session net, and
 *  returns the winning number + payout for the client to animate. */
export async function placeBetsAndSpin(bets: Bet[]): Promise<SpinResult | { error: string }> {
  if (!Array.isArray(bets) || bets.length === 0) return { error: 'Place at least one bet' }
  if (bets.length > 50) return { error: 'Too many bets' }

  // Per-bet validation — inside (single-pocket / few-pocket high-vol)
  // bets share the straight cap; outside (low-vol) bets get the higher
  // cap. Same constants used by the client buttons so a bet that's UI-
  // valid is also server-valid.
  const INSIDE: ReadonlySet<string> = new Set(['straight', 'split', 'street', 'corner', 'line'])
  // Per-zone totals — the UI stacks chips into one bet per zone, but a
  // crafted request could split a zone across duplicate bets that each
  // pass the per-bet check, so the cap is enforced on the zone total.
  const zoneTotals = new Map<string, number>()
  for (const bet of bets) {
    const maxBet = INSIDE.has(bet.type) ? RL_MAX_STRAIGHT_BET : RL_MAX_OUTSIDE_BET
    const err = validateBet(bet, RL_MIN_BET, maxBet)
    if (err) return { error: err }
    const zone = `${bet.type}:${JSON.stringify(bet.target)}`
    const total = (zoneTotals.get(zone) ?? 0) + bet.amount
    if (total > maxBet) return { error: `Each bet maxes out at ${maxBet.toLocaleString()} chips` }
    zoneTotals.set(zone, total)
  }

  const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0)
  if (totalWagered <= 0) return { error: 'Invalid bet total' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('casino_chips, casino_session_buy_ins, roulette_session_net, doubloons')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }

  const chipsBefore = (profile.casino_chips as number | null) ?? 0
  if (chipsBefore < totalWagered) return { error: 'Not enough chips' }

  // Server-authoritative spin + pure settlement.
  const winningNumber = rollWinningNumber()
  const settlement = settleSpin(bets, winningNumber)

  const chipsAfter = chipsBefore - settlement.totalWagered + settlement.totalPayout
  const prevSessionNet = (profile.roulette_session_net as number | null) ?? 0
  const prevSessionBuyIns = (profile.casino_session_buy_ins as number | null) ?? 0
  // Shared purse hitting 0 ends the casino session — reset the shared
  // buy-in tally and ALL per-game nets (mirrors blackjack's bust-out).
  const busted = chipsAfter === 0
  const newSessionNet = busted ? 0 : prevSessionNet + settlement.net
  const newSessionBuyIns = busted ? 0 : prevSessionBuyIns

  await Promise.all([
    admin.from('profiles').update({
      casino_chips: chipsAfter,
      roulette_session_net: newSessionNet,
      ...(busted ? { casino_session_buy_ins: 0, blackjack_session_net: 0, slots_session_net: 0 } : {}),
    }).eq('id', user.id),
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
    sessionNet: newSessionNet,
    sessionBuyIns: newSessionBuyIns,
  }
}
