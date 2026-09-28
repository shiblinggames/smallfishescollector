'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { spend, grant } from '@/lib/wallet'
import { SLOTS_MIN_BET, SLOTS_MAX_BET, SLOTS_JACKPOT_FEED_PCT } from './constants'
import type { SlotSymbolId } from './constants'
import { rollSlots, afterRound } from '@/lib/casinoRules'

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

// The reel roll, the bonus round and the pay table are lib/casinoRules rollSlots.

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
  // The wager leaves the purse in place before the roll. That is the guard:
  // two spins fired together cannot both bet the same chips.
  const afterStake = await spend(admin, user.id, 'casino_chips', wager)
  if (afterStake === null) return { error: 'Not enough chips' }
  // Admins still spin + feed the pot, but can't TAKE the community jackpot —
  // a catfish triple pays them a normal big win instead, pot left intact.
  const isAdmin = (profile as { is_admin?: boolean | null }).is_admin === true

  // One-time forced outcome (admin rig/gift): a valid symbol in
  // profiles.slots_force_next lands as a triple on THIS spin, then the flag is
  // cleared in the persist below. The roll and the pay table are
  // lib/casinoRules rollSlots; the community pot is claimed here.
  const roll = rollSlots(wager, { forced: (profile as { slots_force_next?: string | null }).slots_force_next ?? null, isAdmin })
  const { reels, isForced } = roll

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

  const outcome = roll.outcome
  let payout = roll.payout
  const matchedSymbol = roll.matchedSymbol
  let bonus = roll.bonus
  let jackpotWin: number | undefined
  // A natural three catfish (main reels or the bonus round) takes the pot.
  if (roll.jackpot) {
    const share = await claimJackpot()
    jackpotWin = share
    if (roll.jackpot === 'main') payout = share
    else { bonus = { ...bonus!, payout: share }; payout = wager + share }
  }

  const net = payout - wager
  const newChips = payout > 0 ? await grant(admin, user.id, 'casino_chips', payout) : afterStake

  // Chip movement is internal to the casino session — no
  // doubloon_transactions row here (matches blackjack/roulette;
  // doubloons only move at buy-in / cash-out).
  // Shared purse hitting 0 ends the casino session (lib/casinoRules afterRound).
  const { busted, sessionNet: newSessionNet, sessionBuyIns: newSessionBuyIns } = afterRound(
    newChips, (profile.slots_session_net as number | null) ?? 0, net, (profile.casino_session_buy_ins as number | null) ?? 0)

  await Promise.all([
    admin.from('profiles').update({
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

