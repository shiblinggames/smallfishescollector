'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT } from './constants'
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
  newChips: number          // shared casino purse post-spin
  sessionNet: number        // slots' win/loss this session (post-spin)
  sessionBuyIns: number     // shared session buy-ins (0 after a bust-out reset)
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

export async function spinSlots(wager: number): Promise<SlotSpinResult | { error: string }> {
  if (wager < SLOTS_MIN_BET || wager > SLOTS_MAX_BET) return { error: 'Invalid wager' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // Wagers come out of the SHARED casino chip purse (one balance across
  // blackjack/roulette/slots). The daily cap is enforced at buy-in
  // (casino_buy_ins) — chips on the table churn freely, so the old
  // per-spin daily-wager check is gone.
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('casino_chips, casino_session_buy_ins, slots_session_net, username, is_admin')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const chipsBefore = (profile.casino_chips as number | null) ?? 0
  if (chipsBefore < wager) return { error: 'Not enough chips' }
  // Admins still spin + feed the pot, but can't TAKE the community jackpot —
  // a catfish triple pays them a normal big win instead, pot left intact.
  const isAdmin = (profile as { is_admin?: boolean | null }).is_admin === true

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
    if (bonusAllSame && ba === 'catfish' && !isAdmin) {
      const share = await claimJackpot()
      jackpotWin = share
      bonus = { reels: bonusReels, outcome: 'jackpot', payout: share }
    } else if (bonusAllSame && ba === 'catfish') {
      // Admin catfish triple → big win, no pot claim.
      bonus = { reels: bonusReels, outcome: 'win', payout: wager * SLOT_PAYOUTS.legendary }
    } else if (bonusAllSame && ba !== 'anchor') {
      bonus = { reels: bonusReels, outcome: 'win', payout: wager * SLOT_PAYOUTS[ba] }
    } else if (bonusPair && SLOT_PAIR_PAYOUTS[bonusPair]) {
      bonus = { reels: bonusReels, outcome: 'pair', payout: Math.floor(wager * SLOT_PAIR_PAYOUTS[bonusPair]!), matchedSymbol: bonusPair }
    } else {
      bonus = { reels: bonusReels, outcome: 'lose', payout: 0 }
    }
    payout = wager + bonus.payout
  } else if (allSame && a === 'catfish' && !isAdmin) {
    // Natural 3 catfish → global jackpot, share proportional to wager
    outcome = 'jackpot'
    const share = await claimJackpot()
    jackpotWin = share
    payout = share
  } else if (allSame && a === 'catfish') {
    // Admin catfish triple → normal big win, the community pot is left alone.
    outcome = 'win'
    payout = wager * SLOT_PAYOUTS.legendary
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
  const newChips = chipsBefore + net

  // Chip movement is internal to the casino session — no
  // doubloon_transactions row here (matches blackjack/roulette;
  // doubloons only move at buy-in / cash-out).
  const prevSessionNet = (profile.slots_session_net as number | null) ?? 0
  const prevSessionBuyIns = (profile.casino_session_buy_ins as number | null) ?? 0
  // Shared purse hitting 0 ends the casino session — reset the shared
  // buy-in tally and ALL per-game nets (mirrors blackjack's bust-out).
  const busted = newChips === 0
  const newSessionNet = busted ? 0 : prevSessionNet + net
  const newSessionBuyIns = busted ? 0 : prevSessionBuyIns

  await Promise.all([
    admin.from('profiles').update({
      casino_chips: newChips,
      slots_session_net: newSessionNet,
      ...(busted ? { casino_session_buy_ins: 0, blackjack_session_net: 0, roulette_session_net: 0 } : {}),
    }).eq('id', user.id),
    admin.from('slot_spins').insert({ user_id: user.id, wager, reels, outcome, payout }),
  ])

  revalidatePath('/tavern/slots')
  return { reels, outcome, payout, net, newChips, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns, matchedSymbol, pot, jackpotWin, bonus }
}

