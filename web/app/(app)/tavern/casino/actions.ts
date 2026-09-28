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
import { denDailyCap, denCapFromXp } from '../constants'
import { buyInAmountOk, buyInRefusal, casinoDayStart } from '@/lib/casinoRules'
import { casinoData } from '@/lib/data/casinoData'
import { isPremiumActive } from '@/lib/premium'
import { spend, grant } from '@/lib/wallet'
import type { CasinoWallet, CasinoBuyInResult, CasinoCashOutResult } from './types'

async function getDailyBuyInTotal(userId: string): Promise<number> {
  return casinoData(createAdminClient()).boughtInSince(userId, casinoDayStart())
}

/** A player's effective shared Den daily cap — Captains climb it with their
 *  combined Fishing+Nav level (2k→20k); non-Captains sit flat at 2,000 ⟡/day. */
async function getDenCap(userId: string): Promise<number> {
  const data = await casinoData(createAdminClient()).profile(userId, 'fishing_xp, expedition_xp, is_premium, premium_expires_at')
  return denCapFromXp((data?.fishing_xp as number | null) ?? 0, (data?.expedition_xp as number | null) ?? 0, isPremiumActive(data))
}

export async function getCasinoState(): Promise<CasinoWallet> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      chips: 0, doubloons: 0, sessionBuyIns: 0,
      dailyBoughtIn: 0, dailyCap: denDailyCap(0, false), dailyRemaining: denDailyCap(0, false),
      sessionNets: { blackjack: 0, roulette: 0, slots: 0 }, isMember: false,
    }
  }
  const [profile, dailyBoughtIn] = await Promise.all([
    casinoData(createAdminClient()).profile(user.id, 'doubloons, casino_chips, casino_session_buy_ins, blackjack_session_net, roulette_session_net, slots_session_net, fishing_xp, expedition_xp, is_premium, premium_expires_at'),
    getDailyBuyInTotal(user.id),
  ])
  const isMember = isPremiumActive(profile)
  const dailyCap = denCapFromXp((profile?.fishing_xp as number | null) ?? 0, (profile?.expedition_xp as number | null) ?? 0, isMember)
  return {
    isMember,
    chips: (profile?.casino_chips as number | null) ?? 0,
    doubloons: (profile?.doubloons as number | null) ?? 0,
    sessionBuyIns: (profile?.casino_session_buy_ins as number | null) ?? 0,
    dailyBoughtIn,
    dailyCap,
    dailyRemaining: Math.max(0, dailyCap - dailyBoughtIn),
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
  // The purse rules (range, funds, the shared daily cap) are lib/casinoRules buyInRefusal.
  if (!buyInAmountOk(amount)) return { error: 'Invalid amount' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const db = casinoData(admin)
  const profile = await db.profile(user.id, 'doubloons, casino_session_buy_ins')
  if (!profile) return { error: 'Profile not found' }
  const doubloons = profile.doubloons as number
  const prevSessionBuyIns = (profile.casino_session_buy_ins as number | null) ?? 0
  if (doubloons < amount) return { error: 'Insufficient doubloons' }

  const [dailyAlready, dailyCap] = await Promise.all([getDailyBuyInTotal(user.id), getDenCap(user.id)])
  const refusal = buyInRefusal(amount, doubloons, dailyAlready, dailyCap)
  if (refusal) return { error: refusal }

  // Doubloons leave in place first (the guard against two buy-ins spending
  // the same purse), then the chips land in place.
  const newDoubloons = await spend(admin, user.id, 'doubloons', amount)
  if (newDoubloons === null) return { error: 'Insufficient doubloons' }
  const newChips = await grant(admin, user.id, 'casino_chips', amount)
  const newSessionBuyIns = prevSessionBuyIns + amount

  await Promise.all([
    db.updateProfile(user.id, { casino_session_buy_ins: newSessionBuyIns }),
    db.recordBuyIn(user.id, amount),
    db.ledger(user.id, -amount, `Casino: buy-in ${amount} ⟡`),
  ])

  revalidatePath('/tavern')
  return {
    newDoubloons, newChips,
    dailyBoughtIn: dailyAlready + amount,
    dailyCap,
    dailyRemaining: Math.max(0, dailyCap - (dailyAlready + amount)),
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

  const db = casinoData(createAdminClient())
  if (await db.activeHand(user.id)) return { error: 'Finish your blackjack hand first' }

  // One step moves every chip to doubloons, so a spin landing at the same
  // moment can never be paid out twice.
  const cashed = await db.cashOutChips(user.id)
  if (!cashed) return { error: 'Cash-out failed' }
  const chips = cashed.paid
  if (chips <= 0) return { error: 'No chips to cash out' }
  const newDoubloons = cashed.doubloons

  await Promise.all([
    db.updateProfile(user.id, {
      casino_session_buy_ins: 0,
      blackjack_session_net: 0,
      roulette_session_net: 0,
      slots_session_net: 0,
    }),
    db.ledger(user.id, chips, `Casino: cash-out ${chips} ⟡`),
  ])

  revalidatePath('/tavern')
  return { newDoubloons, cashedOut: chips }
}

// First-visit Den guide dismissal (see components/LobbyGuide).
export async function markDenGuideSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await casinoData(createAdminClient()).updateProfile(user.id, { has_seen_den_guide: true })
}
