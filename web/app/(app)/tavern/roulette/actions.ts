'use server'

// Fish Roulette server actions. Wagers come out of the SHARED casino
// chip purse (profiles.casino_chips — one balance across blackjack/
// roulette/slots); buy-in and cash-out live in ../casino/actions.
// Roulette has no mid-game state: bet → spin → settle is one atomic
// action, so this file is just the spin plus the page snapshot.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import {
  rollWinningNumber, settleSpin,
  type Bet,
} from '@/lib/roulette'
import {
  denDailyCap,
  denCapFromXp,
} from '../constants'
import { isPremiumActive } from '@/lib/premium'
import { spend, grant } from '@/lib/wallet'
import { betSlipRefusal, afterRound, casinoDayStart } from '@/lib/casinoRules'
import type { RouletteState, SpinResult, RecentSpin } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Today's buy-ins into the SHARED casino wallet (one cap across all
// three games — casino_buy_ins is the only source).
async function getDailyBuyInTotal(userId: string): Promise<number> {
  const admin = createAdminClient()
  const today = casinoDayStart()
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
      dailyBoughtIn: 0, dailyCap: denDailyCap(0, false), dailyRemaining: denDailyCap(0, false),
      recentSpins: [],
    }
  }
  const admin = createAdminClient()
  const [{ data: profile }, dailyBoughtIn, { data: recentRows }] = await Promise.all([
    admin.from('profiles')
      .select('doubloons, casino_chips, casino_session_buy_ins, roulette_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at')
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
    dailyCap: denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isPremiumActive(profile)),
    dailyRemaining: Math.max(0, denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isPremiumActive(profile)) - dailyBoughtIn),
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
  // The bet slip: per-bet limits, inside bets on the straight cap, outside on
  // the higher one, and the cap held on each zone's TOTAL (lib/casinoRules).
  const slipError = betSlipRefusal(bets)
  if (slipError) return { error: slipError }
  const totalWagered = bets.reduce((sum, b) => sum + b.amount, 0)

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

  // The wager leaves the purse in place first. That is the guard: two spins
  // fired together cannot both bet the same chips.
  const afterStake = await spend(admin, user.id, 'casino_chips', totalWagered)
  if (afterStake === null) return { error: 'Not enough chips' }
  const chipsBefore = afterStake + totalWagered

  // Server-authoritative spin + pure settlement.
  const winningNumber = rollWinningNumber()
  const settlement = settleSpin(bets, winningNumber)

  const chipsAfter = settlement.totalPayout > 0
    ? await grant(admin, user.id, 'casino_chips', settlement.totalPayout)
    : afterStake
  // Shared purse hitting 0 ends the casino session (lib/casinoRules afterRound).
  const { busted, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns } = afterRound(
    chipsAfter, (profile.roulette_session_net as number | null) ?? 0, settlement.net, (profile.casino_session_buy_ins as number | null) ?? 0)

  await Promise.all([
    admin.from('profiles').update({
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

  // Called It badge (best-effort): won a straight-up single-number bet.
  if (settlement.perBet.some(pb => pb.won && pb.bet.type === 'straight')) {
    try { await grantBadgeDirect(user.id, 'called_it') } catch { /* best-effort */ }
  }

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
