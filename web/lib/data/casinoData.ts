// ── THE DEN'S DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// The shared chip purse's day (buy-ins, the cash-out), the blackjack hand row,
// the spin logs, and the community slots pot. The rules are lib/casinoRules;
// balances move through lib/wallet.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - settleHand settles an ACTIVE hand once; only the settler is paid;
//   - saveHand writes only while the hand is still active;
//   - cashOutChips moves every chip to doubloons in one step, so a spin landing
//     at the same moment is never paid out twice;
//   - claimPot takes the community jackpot atomically: the share and the new
//     pot come from the same step (offline, the pot is simply a local one).

import { captainData, type CaptainData, type Db, type Row } from './common'

export type PotRow = { pot: number | null; last_winner_name: string | null; last_win_amount: number | null; last_won_at: string | null }

export interface CasinoData extends CaptainData {
  // ── The purse's day ──
  /** Doubloons bought in since `sinceDate` (the day's shared cap counts these). */
  boughtInSince(uid: string, sinceDate: string): Promise<number>
  recordBuyIn(uid: string, amount: number): Promise<void>
  /** Every chip to doubloons, in one step. Null on a write error. */
  cashOutChips(uid: string): Promise<{ paid: number; doubloons: number } | null>

  // ── Blackjack ──
  /** The open hand, or null. */
  activeHand(uid: string): Promise<{ id: number; state: unknown; initial_wager: number; total_wagered: number } | null>
  /** Open a hand; its id, or null. */
  openHand(uid: string, wager: number, state: unknown): Promise<number | null>
  /** Save the table while the hand is still active. */
  saveHand(handId: number, state: unknown, totalWagered: number): Promise<void>
  /** Settle an active hand. True only for the request that settled it. */
  settleHand(uid: string, handId: number, result: Row): Promise<boolean>

  // ── Spin logs ──
  recentRouletteSpins(uid: string, limit: number): Promise<Row[]>
  logRouletteSpin(uid: string, row: Row): Promise<void>
  logSlotSpin(uid: string, row: Row): Promise<void>
  slotStats(uid: string): Promise<{ spins: number; net: number; biggest_win: number } | null>

  // ── The community slots pot ──
  slotsPot(): Promise<PotRow | null>
  /** Feed the pot; its new size, or null. */
  feedPot(amount: number): Promise<number | null>
  /** Take the pot's share for this wager; the share and the pot left, or null. */
  claimPot(uid: string, winnerName: string, wager: number, maxBet: number): Promise<{ share: number; newPot: number } | null>
}

/** CasinoData over Supabase. */
export function casinoData(admin: Db): CasinoData {
  return {
    ...captainData(admin),

    async boughtInSince(uid, sinceDate) {
      const { data } = await admin.from('casino_buy_ins').select('amount').eq('user_id', uid).gte('created_at', sinceDate)
      return ((data ?? []) as { amount: number }[]).reduce((sum, r) => sum + (r.amount as number), 0)
    },
    async recordBuyIn(uid, amount) {
      await admin.from('casino_buy_ins').insert({ user_id: uid, amount })
    },
    async cashOutChips(uid) {
      const { data, error } = await admin.rpc('casino_cash_out', { uid })
      if (error) return null
      const row = (Array.isArray(data) ? data[0] : data) as { paid: number | null; doubloons: number | null } | null
      return { paid: Number(row?.paid ?? 0), doubloons: Number(row?.doubloons ?? 0) }
    },

    async activeHand(uid) {
      const { data } = await admin.from('blackjack_hands').select('id, state, initial_wager, total_wagered').eq('user_id', uid).eq('status', 'active').maybeSingle()
      return (data as { id: number; state: unknown; initial_wager: number; total_wagered: number } | null) ?? null
    },
    async openHand(uid, wager, state) {
      const { data } = await admin.from('blackjack_hands')
        .insert({ user_id: uid, initial_wager: wager, total_wagered: wager, status: 'active', state }).select('id').single()
      return data ? (data.id as number) : null
    },
    async saveHand(handId, state, totalWagered) {
      await admin.from('blackjack_hands').update({ state, total_wagered: totalWagered }).eq('id', handId).eq('status', 'active')
    },
    async settleHand(uid, handId, result) {
      const { data } = await admin.from('blackjack_hands').update({ status: 'settled', ...result })
        .eq('id', handId).eq('user_id', uid).eq('status', 'active').select('id')
      return !!data && data.length > 0
    },

    async recentRouletteSpins(uid, limit) {
      const { data } = await admin.from('roulette_spins').select('id, winning_number, net_chips, total_wagered, created_at')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(limit)
      return (data ?? []) as Row[]
    },
    async logRouletteSpin(uid, row) {
      await admin.from('roulette_spins').insert({ user_id: uid, ...row })
    },
    async logSlotSpin(uid, row) {
      await admin.from('slot_spins').insert({ user_id: uid, ...row })
    },
    async slotStats(uid) {
      // Aggregated in the store: a plain read is capped at 1000 rows.
      const { data } = await admin.rpc('get_slot_stats', { uid })
      return ((Array.isArray(data) ? data[0] : data) as { spins: number; net: number; biggest_win: number } | null | undefined) ?? null
    },

    async slotsPot() {
      const { data } = await admin.from('slots_jackpot').select('pot, last_winner_name, last_win_amount, last_won_at').eq('id', 1).single()
      return (data as PotRow | null) ?? null
    },
    async feedPot(amount) {
      const { data } = await admin.rpc('slots_feed_jackpot', { p_amount: amount })
      return typeof data === 'number' ? data : null
    },
    async claimPot(uid, winnerName, wager, maxBet) {
      const { data } = await admin.rpc('slots_claim_jackpot', { p_user_id: uid, p_winner_name: winnerName, p_wager: wager, p_max_bet: maxBet })
      const row = Array.isArray(data) ? data[0] : data
      return row ? { share: row.share as number, newPot: row.new_pot as number } : null
    },
  }
}
