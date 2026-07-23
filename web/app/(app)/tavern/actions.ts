'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { SLOT_SYMBOLS_LIST, SLOT_PAYOUTS, SLOT_PAIR_PAYOUTS, SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT, SLOT_BONUS_MULT } from './constants'
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

// ── Bonus round: its own richer pool (base fish + Jellyfish WILD, no hook) ──
function slotBonusWeightedRandom(): SlotSymbolId {
  const total = SLOT_SYMBOLS_LIST.reduce((s, sym) => s + sym.bonusWeight, 0)
  let r = Math.random() * total
  for (const sym of SLOT_SYMBOLS_LIST) {
    r -= sym.bonusWeight
    if (r <= 0) return sym.id
  }
  return SLOT_SYMBOLS_LIST[SLOT_SYMBOLS_LIST.length - 1].id
}
function slotRollBonusReels(): SlotSymbolId[] {
  return [slotBonusWeightedRandom(), slotBonusWeightedRandom(), slotBonusWeightedRandom()]
}

// Best-paying bonus line with Jellyfish WILD substitution. The wild stands in for
// common/rare/legendary (NEVER catfish/jackpot). Returns the resolved fish + its
// base multiplier + triple/pair, or null for no win. Caller applies the bonus
// boost (SLOT_BONUS_MULT). Enumerating all options + taking the max means a
// generous case like 2 wilds + 1 fish correctly pays the best line available.
function evalBonusLine(rs: SlotSymbolId[]): { symbol: SlotSymbolId; kind: 'triple' | 'pair'; mult: number } | null {
  const wilds = rs.filter(r => r === 'wild').length
  const nat = (s: SlotSymbolId) => rs.filter(r => r === s).length
  const opts: { symbol: SlotSymbolId; kind: 'triple' | 'pair'; mult: number }[] = []
  for (const s of ['common', 'rare', 'shark', 'legendary'] as const) {
    if (nat(s) + wilds === 3) opts.push({ symbol: s, kind: 'triple', mult: SLOT_PAYOUTS[s] })
  }
  if (nat('legendary') + wilds >= 2 && SLOT_PAIR_PAYOUTS.legendary) opts.push({ symbol: 'legendary', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.legendary })
  if (nat('shark') + wilds >= 2 && SLOT_PAIR_PAYOUTS.shark) opts.push({ symbol: 'shark', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.shark })
  if (nat('catfish') >= 2 && SLOT_PAIR_PAYOUTS.catfish) opts.push({ symbol: 'catfish', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.catfish })
  if (nat('rare') + wilds >= 2 && SLOT_PAIR_PAYOUTS.rare) opts.push({ symbol: 'rare', kind: 'pair', mult: SLOT_PAIR_PAYOUTS.rare })
  if (opts.length === 0) return null
  return opts.reduce((best, o) => (o.mult > best.mult ? o : best))
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
  // Aggregate in the DB — a plain SELECT is capped at PostgREST's default 1000
  // rows, which made the panel stick at 1000 spins with a wrong net for anyone
  // who'd spun more than that.
  const { data } = await admin.rpc('get_slot_stats', { uid: user.id })
  const row = (Array.isArray(data) ? data[0] : data) as { spins: number; net: number; biggest_win: number } | null | undefined
  return {
    spins: Number(row?.spins ?? 0),
    net: Number(row?.net ?? 0),
    biggestWin: Number(row?.biggest_win ?? 0),
  }
}

export async function spinSlots(wager: number): Promise<SlotSpinResult | { error: string }> {
  // Integer + range guard. NaN/fractional wagers slipped past a bare min/max
  // compare (NaN < MIN and NaN > MAX are both false) and could corrupt the
  // player's own int chip balance. Blackjack/roulette already guard this.
  if (!Number.isInteger(wager) || wager < SLOTS_MIN_BET || wager > SLOTS_MAX_BET) return { error: 'Invalid wager' }

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
    .select('casino_chips, casino_session_buy_ins, slots_session_net, username, is_admin, slots_force_next')
    .eq('id', user.id)
    .single()
  if (!profile) return { error: 'Profile not found' }
  const chipsBefore = (profile.casino_chips as number | null) ?? 0
  if (chipsBefore < wager) return { error: 'Not enough chips' }
  // Admins still spin + feed the pot, but can't TAKE the community jackpot —
  // a catfish triple pays them a normal big win instead, pot left intact.
  const isAdmin = (profile as { is_admin?: boolean | null }).is_admin === true

  // One-time forced outcome (admin rig/gift): if profiles.slots_force_next holds
  // a valid symbol, THIS spin lands that symbol as a triple, then the flag is
  // cleared in the persist below. Otherwise a normal random roll.
  const forcedSym = (profile as { slots_force_next?: string | null }).slots_force_next ?? null
  const FORCEABLE = new Set<string>(['common', 'rare', 'legendary', 'catfish', 'anchor'])
  const isForced = forcedSym !== null && FORCEABLE.has(forcedSym)
  const reels: SlotSymbolId[] = isForced
    ? [forcedSym as SlotSymbolId, forcedSym as SlotSymbolId, forcedSym as SlotSymbolId]
    : slotRollReels()
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
    // 3 hooks → the "charged" bonus round. It rolls its OWN richer pool (base
    // fish + the Jellyfish WILD, no hook), the wild substitutes to complete a
    // line, and every fish win pays 50% MORE (SLOT_BONUS_MULT). A NATURAL
    // 3-catfish bonus roll still takes the jackpot (the wild can't complete it).
    outcome = 'bonus'
    const bonusReels = slotRollBonusReels()
    const [ba, bb, bc] = bonusReels
    const bonusNaturalCatfish = ba === 'catfish' && bb === 'catfish' && bc === 'catfish'
    if (bonusNaturalCatfish && !isAdmin) {
      const share = await claimJackpot()
      jackpotWin = share
      bonus = { reels: bonusReels, outcome: 'jackpot', payout: share }
    } else if (bonusNaturalCatfish) {
      // Admin catfish triple → big win (boosted like any bonus win), pot untouched.
      bonus = { reels: bonusReels, outcome: 'win', payout: Math.floor(wager * SLOT_PAYOUTS.legendary * SLOT_BONUS_MULT), matchedSymbol: 'catfish' }
    } else {
      const line = evalBonusLine(bonusReels)
      if (line && line.kind === 'triple') {
        bonus = { reels: bonusReels, outcome: 'win', payout: Math.floor(wager * line.mult * SLOT_BONUS_MULT), matchedSymbol: line.symbol }
      } else if (line && line.kind === 'pair') {
        bonus = { reels: bonusReels, outcome: 'pair', payout: Math.floor(wager * line.mult * SLOT_BONUS_MULT), matchedSymbol: line.symbol }
      } else {
        bonus = { reels: bonusReels, outcome: 'lose', payout: 0 }
      }
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
      // Consume the one-time forced-spin override so it only fires once.
      ...(isForced ? { slots_force_next: null } : {}),
      ...(busted ? { casino_session_buy_ins: 0, blackjack_session_net: 0, roulette_session_net: 0 } : {}),
    }).eq('id', user.id),
    admin.from('slot_spins').insert({ user_id: user.id, wager, reels, outcome, payout }),
  ])

  // Catfish Jackpot badge — winning the global pot (natural or via a bonus roll).
  if (jackpotWin && jackpotWin > 0) { try { await grantBadgeDirect(user.id, 'catfish_jackpot') } catch { /* best-effort */ } }

  revalidatePath('/tavern/slots')
  return { reels, outcome, payout, net, newChips, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns, matchedSymbol, pot, jackpotWin, bonus }
}

