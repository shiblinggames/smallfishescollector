'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_DAILY_CAP, SLOTS_JACKPOT_FEED_PCT } from './constants'
import type { SlotSymbolId } from './constants'

// Crown & Anchor was retired 2026-06-06 — replaced by Blackjack
// (app/(app)/tavern/blackjack/actions.ts). The dice_rolls table stays
// in the DB as historical record but no code writes to it anymore.

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export interface SlotSpinResult {
  reels: SlotSymbolId[]
  outcome: 'win' | 'jackpot' | 'lose' | 'bonus' | 'refund' | 'near_miss' | 'pair_win'
  payout: number
  net: number
  newDoubloons: number
  dailyWagered: number
  matchedSymbol?: SlotSymbolId
  /** Global jackpot pot AFTER this spin (post-feed, post-claim). */
  pot: number
  /** Doubloons taken from the pot when outcome (or bonus) hit the jackpot. */
  jackpotWin?: number
  bonus?: {
    reels: SlotSymbolId[]
    outcome: 'win' | 'jackpot' | 'pair' | 'lose'
    payout: number
    matchedSymbol?: SlotSymbolId
  }
}

export interface SlotsJackpotState {
  pot: number
  lastWinnerName: string | null
  lastWinAmount: number | null
  lastWonAt: string | null
}

export async function getSlotsJackpot(): Promise<SlotsJackpotState> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('slots_jackpot')
    .select('pot, last_winner_name, last_win_amount, last_won_at')
    .eq('id', 1)
    .single()
  return {
    pot: data?.pot ?? 15000,
    lastWinnerName: data?.last_winner_name ?? null,
    lastWinAmount: data?.last_win_amount ?? null,
    lastWonAt: data?.last_won_at ?? null,
  }
}

function slotWeightedRandom(): SlotSymbolId {
  const total = SLOT_SYMBOLS_LIST.reduce((s, sym) => s + sym.weight, 0)
  let r = Math.random() * total
  for (const sym of SLOT_SYMBOLS_LIST) {
    r -= sym.weight
    if (r <= 0) return sym.id
  }
  return SLOT_SYMBOLS_LIST[SLOT_SYMBOLS_LIST.length - 1].id
}

function slotRollReels(): SlotSymbolId[] {
  return [slotWeightedRandom(), slotWeightedRandom(), slotWeightedRandom()]
}

export interface SlotStats {
  spins: number
  net: number
  biggestWin: number
}

export async function getSlotStats(): Promise<SlotStats> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { spins: 0, net: 0, biggestWin: 0 }
  const admin = createAdminClient()
  const { data } = await admin
    .from('slot_spins')
    .select('wager, payout')
    .eq('user_id', user.id)
  const rows = data ?? []
  const spins = rows.length
  const net = rows.reduce((s, r) => s + (r.payout - r.wager), 0)
  const biggestWin = rows.reduce((max, r) => Math.max(max, r.payout - r.wager), 0)
  return { spins, net, biggestWin }
}

export async function getSlotsDailyWagered(): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const { data } = await admin
    .from('slot_spins')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  return (data ?? []).reduce((sum: number, r: { wager: number }) => sum + r.wager, 0)
}

export async function spinSlots(wager: number): Promise<SlotSpinResult | { error: string }> {
  if (wager < SLOTS_MIN_BET || wager > SLOTS_MAX_BET) return { error: 'Invalid wager' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('doubloons, username')
    .eq('id', user.id)
    .single()
  if (!profile || profile.doubloons < wager) return { error: 'Insufficient doubloons' }

  const today = new Date().toISOString().split('T')[0]
  const { data: todaySpins } = await admin
    .from('slot_spins')
    .select('wager')
    .eq('user_id', user.id)
    .gte('created_at', today)
  const totalWagered = (todaySpins ?? []).reduce((sum: number, r: { wager: number }) => sum + r.wager, 0)
  if (totalWagered + wager > SLOTS_DAILY_CAP) return { error: `Daily limit reached (${SLOTS_DAILY_CAP} ⟡)` }

  const reels = slotRollReels()
  const [a, b, c] = reels
  const allSame = a === b && b === c
  const hookCount = reels.filter(r => r === 'anchor').length

  // Every spin feeds the global pot before any claim — your own
  // contribution is in the pot you might win this very spin.
  const feed = Math.ceil(wager * SLOTS_JACKPOT_FEED_PCT)
  const { data: fedPot } = await admin.rpc('slots_feed_jackpot', { p_amount: feed })
  let pot = typeof fedPot === 'number' ? fedPot : 15000

  const winnerName = (profile as { username?: string | null }).username ?? 'A sailor'
  async function claimJackpot(): Promise<number> {
    const { data } = await admin.rpc('slots_claim_jackpot', {
      p_user_id: user!.id,
      p_winner_name: winnerName,
      p_wager: wager,
      p_max_bet: SLOTS_MAX_BET,
    })
    const row = Array.isArray(data) ? data[0] : data
    if (!row) return 0
    pot = row.new_pot as number
    return row.share as number
  }

  // Finds an exactly-2 matching fish pair (third reel can be anything,
  // including a single hook). Returns the paired symbol or null.
  function pairSymbol(rs: SlotSymbolId[]): SlotSymbolId | null {
    const [x, y, z] = rs
    if (x === y && y === z) return null
    if (x === y && x !== 'anchor') return x
    if (x === z && x !== 'anchor') return x
    if (y === z && y !== 'anchor') return y
    return null
  }

  let outcome: SlotSpinResult['outcome']
  let payout = 0
  let matchedSymbol: SlotSymbolId | undefined
  let bonus: SlotSpinResult['bonus'] | undefined
  let jackpotWin: number | undefined

  if (allSame && a === 'anchor') {
    // 3 hooks → free bonus spin. The bonus roll pays triples and pairs
    // like a normal spin (no hook lines, no nested bonus) — and yes, a
    // natural 3-catfish bonus roll takes the jackpot.
    outcome = 'bonus'
    const bonusReels = slotRollReels()
    const [ba, bb, bc] = bonusReels
    const bonusAllSame = ba === bb && bb === bc
    const bonusPair = pairSymbol(bonusReels)
    if (bonusAllSame && ba === 'catfish') {
      const share = await claimJackpot()
      jackpotWin = share
      bonus = { reels: bonusReels, outcome: 'jackpot', payout: share }
    } else if (bonusAllSame && ba !== 'anchor') {
      bonus = { reels: bonusReels, outcome: 'win', payout: wager * SLOT_PAYOUTS[ba] }
    } else if (bonusPair && SLOT_PAIR_PAYOUTS[bonusPair]) {
      bonus = { reels: bonusReels, outcome: 'pair', payout: Math.floor(wager * SLOT_PAIR_PAYOUTS[bonusPair]!), matchedSymbol: bonusPair }
    } else {
      bonus = { reels: bonusReels, outcome: 'lose', payout: 0 }
    }
    payout = wager + bonus.payout
  } else if (allSame && a === 'catfish') {
    // Natural 3 catfish → global jackpot, share proportional to wager
    outcome = 'jackpot'
    const share = await claimJackpot()
    jackpotWin = share
    payout = share
  } else if (allSame) {
    // 3 of same fish → full win
    outcome = 'win'
    payout = wager * SLOT_PAYOUTS[a]
  } else if (hookCount === 2) {
    // 2 hooks anywhere → refund
    outcome = 'refund'
    payout = wager
  } else {
    const pair = pairSymbol(reels)
    if (pair && SLOT_PAIR_PAYOUTS[pair]) {
      // Pair of marlin / whale / catfish → real pair win (always ≥ 1.5×)
      outcome = 'pair_win'
      matchedSymbol = pair
      payout = Math.floor(wager * SLOT_PAIR_PAYOUTS[pair]!)
    } else if (pair === 'common') {
      // Sardine pair pays nothing — surfaced as a near-miss, not a win
      outcome = 'near_miss'
      matchedSymbol = pair
    } else {
      outcome = 'lose'
    }
  }

  const net = payout - wager
  const newDoubloons = profile.doubloons + net

  const outcomeLabel =
    outcome === 'win'      ? `${SLOT_PAYOUTS[a]}× on ${a}` :
    outcome === 'jackpot'  ? `JACKPOT — ${payout} from the pot` :
    outcome === 'bonus'    ? `bonus spin (${bonus!.outcome})` :
    outcome === 'refund'   ? '2 hooks — refund' :
    outcome === 'pair_win' ? `pair of ${matchedSymbol}` :
    'no match'

  await Promise.all([
    admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id),
    admin.from('slot_spins').insert({ user_id: user.id, wager, reels, outcome, payout }),
    admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: net,
      reason: `Fish Slots: ${outcomeLabel}`,
    }),
  ])

  revalidatePath('/tavern/slots')
  return { reels, outcome, payout, net, newDoubloons, dailyWagered: totalWagered + wager, matchedSymbol, pot, jackpotWin, bonus }
}

