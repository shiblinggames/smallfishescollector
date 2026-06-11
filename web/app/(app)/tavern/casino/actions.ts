'use server'

// Shared casino wallet actions. ONE chip purse (profiles.casino_chips)
// backs all three tavern casino games — Blackjack, Fish Roulette, Fish
// Slots. Buy-in converts doubloons → chips against a single shared
// 5,000 ⟡/day cap (summed from casino_buy_ins; the legacy per-game
// blackjack_buy_ins / roulette_buy_ins tables are dormant history and
// deliberately do NOT count). Chips churn freely across games; cash-out
// converts everything back and ends the session — the shared session
// buy-in tally AND all three per-game session nets reset together.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { CASINO_DAILY_CAP, CASINO_BUY_IN_MIN, CASINO_BUY_IN_MAX } from '../constants'
import type { CasinoWallet, CasinoBuyInResult, CasinoCashOutResult } from './types'

async function getDailyBuyInTotal(userId: string): Promise<number> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('casino_buy_ins')
    .select('amount')
    .eq('user_id', userId)
    .gte('created_at', today)
  return (data ?? []).reduce((sum, r) => sum + (r.amount as number), 0)
}

export async function getCasinoState(): Promise<CasinoWallet> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      chips: 0, doubloons: 0, sessionBuyIns: 0,
      dailyBoughtIn: 0, dailyRemaining: CASINO_DAILY_CAP,
      sessionNets: { blackjack: 0, roulette: 0, slots: 0 },
    }
  }
  const admin = createAdminClient()
  const [{ data: profile }, dailyBoughtIn] = await Promise.all([
    admin.from('profiles')
      .select('doubloons, casino_chips, casino_session_buy_ins, blackjack_session_net, roulette_session_net, slots_session_net')
      .eq('id', user.id)
      .single(),
    getDailyBuyInTotal(user.id),
  ])
  return {
    chips: (profile?.casino_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.casino_session_buy_ins as number | null) ?? 0,
    dailyBoughtIn,
    dailyRemaining: Math.max(0, CASINO_DAILY_CAP - dailyBoughtIn),
    sessionNets: {
      blackjack: (profile?.blackjack_session_net as number | null) ?? 0,
      roulette: (profile?.roulette_session_net as number | null) ?? 0,
      slots: (profile?.slots_session_net as number | null) ?? 0,
    },
  }
}

/** Convert N doubloons → N chips in the shared purse. Enforces the
 *  shared daily cap + sufficient doubloons. Buying in mid-session just
 *  tops up the purse — it never resets the per-game nets. */
export async function buyInCasino(amount: number): Promise<CasinoBuyInResult | { error: string }> {
  if (!Number.isInteger(amount) || amount < CASINO_BUY_IN_MIN || amount > CASINO_BUY_IN_MAX) {
    return { error: 'Invalid amount' }
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, casino_chips, casino_session_buy_ins')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const chips = (profile.casino_chips as number | null) ?? 0
  const prevSessionBuyIns = (profile.casino_session_buy_ins as number | null) ?? 0
  if (doubloons < amount) return { error: 'Insufficient doubloons' }

  const dailyAlready = await getDailyBuyInTotal(user.id)
  if (dailyAlready + amount > CASINO_DAILY_CAP) {
    return { error: `Daily limit reached (${CASINO_DAILY_CAP} ⟡)` }
  }

  const newDoubloons = doubloons - amount
  const newChips = chips + amount
  const newSessionBuyIns = prevSessionBuyIns + amount

  await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      casino_chips: newChips,
      casino_session_buy_ins: newSessionBuyIns,
    }).eq('id', user.id),
    admin.from('casino_buy_ins').insert({ user_id: user.id, amount }),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: -amount, reason: `Casino: buy-in ${amount} ⟡` }),
  ])

  revalidatePath('/tavern')
  return {
    newDoubloons, newChips,
    dailyBoughtIn: dailyAlready + amount,
    dailyRemaining: Math.max(0, CASINO_DAILY_CAP - (dailyAlready + amount)),
    sessionBuyIns: newSessionBuyIns,
  }
}

/** Convert all chips → doubloons and end the casino session: shared
 *  buy-in tally AND all three per-game session nets reset. Blocked
 *  while a blackjack hand is mid-flight — those chips are on the felt. */
export async function cashOutCasino(): Promise<CasinoCashOutResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: activeHand } = await admin
    .from('blackjack_hands')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (activeHand) return { error: 'Finish your blackjack hand first' }

  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, casino_chips')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const chips = (profile.casino_chips as number | null) ?? 0
  if (chips <= 0) return { error: 'No chips to cash out' }

  const newDoubloons = doubloons + chips

  await Promise.all([
    admin.from('profiles').update({
      doubloons: newDoubloons,
      casino_chips: 0,
      casino_session_buy_ins: 0,
      blackjack_session_net: 0,
      roulette_session_net: 0,
      slots_session_net: 0,
    }).eq('id', user.id),
    admin.from('doubloon_transactions').insert({ user_id: user.id, amount: chips, reason: `Casino: cash-out ${chips} ⟡` }),
  ])

  revalidatePath('/tavern')
  return { newDoubloons, cashedOut: chips }
}
