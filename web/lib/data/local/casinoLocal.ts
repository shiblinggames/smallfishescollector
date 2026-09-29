// ── THE DEN OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// CasinoData over one captain's save. The one-shot contracts in
// lib/data/casinoData hold here too: a hand settles once, a hand is saved only
// while it is still active, the cash-out moves every chip in one step.
//
// Four web functions become arithmetic here: casino_cash_out (every chip to
// doubloons at once), slots_feed_jackpot, slots_claim_jackpot (the share is the
// pot times wager / max bet, floored, and the pot never drops below its seed)
// and get_slot_stats (kept as running totals rather than a row per spin).
//
// THE COMMUNITY POT is everybody's on the web; offline it is this captain's own,
// seeded like the web's.

import type { CasinoData } from '../casinoData'
import { localCaptain, type LocalSave } from './save'
import { clockNow } from '@/lib/clock'

/** The pot's floor and its opening size, as the web's slots_jackpot row has it. */
export const LOCAL_POT_SEED = 15000
/** How many roulette spins the save keeps (the page shows the last twenty). */
const KEEP_ROULETTE = 20

/** CasinoData over one captain's local save. */
export function localCasinoData(save: LocalSave): CasinoData {
  const captain = localCaptain(save)
  const { me } = captain
  const nowIso = () => new Date(clockNow()).toISOString()
  const den = save.casino

  return {
    ...captain,
    grant: (uid, col, n) => captain.grant(uid, col, n),
    spend: (uid, col, n) => captain.spend(uid, col, n),

    // ── The purse's day ──
    async boughtInSince(uid, sinceDate) {
      me(uid)
      return den.buyIns.filter(b => b.at >= sinceDate).reduce((n, b) => n + b.amount, 0)
    },
    async recordBuyIn(uid, amount) {
      me(uid)
      // Only the last couple of days can ever count toward a day's cap.
      const cutoff = new Date(clockNow() - 2 * 86_400_000).toISOString()
      den.buyIns = [...den.buyIns.filter(b => b.at >= cutoff), { amount, at: nowIso() }]
    },
    async cashOutChips(uid) {
      const prof = me(uid)
      const chips = Number(prof.casino_chips ?? 0)
      if (chips <= 0) return { paid: 0, doubloons: Number(prof.doubloons ?? 0) }
      prof.doubloons = Number(prof.doubloons ?? 0) + chips
      prof.casino_chips = 0
      return { paid: chips, doubloons: prof.doubloons as number }
    },

    // ── Blackjack ──
    async activeHand(uid) { me(uid); return den.hand ? structuredClone(den.hand) : null },
    async openHand(uid, wager, state) {
      me(uid)
      const id = save.nextId++
      den.hand = { id, state: structuredClone(state), initial_wager: wager, total_wagered: wager }
      return id
    },
    async saveHand(handId, state, totalWagered) {
      if (den.hand?.id !== handId) return
      den.hand = { ...den.hand, state: structuredClone(state), total_wagered: totalWagered }
    },
    async settleHand(uid, handId) {
      me(uid)
      // The web keeps every settled hand as a row; the save needs only the open one.
      if (den.hand?.id !== handId) return false
      den.hand = null
      return true
    },

    // ── Spin logs ──
    async recentRouletteSpins(uid, limit) {
      me(uid)
      return [...den.rouletteSpins].reverse().slice(0, limit).map(r => ({ ...r }))
    },
    async logRouletteSpin(uid, row) {
      me(uid)
      den.rouletteSpins = [...den.rouletteSpins, { id: save.nextId++, ...structuredClone(row), created_at: nowIso() }].slice(-KEEP_ROULETTE)
    },
    async logSlotSpin(uid, row) {
      me(uid)
      const net = Number(row.payout ?? 0) - Number(row.wager ?? 0)
      den.slots = { spins: den.slots.spins + 1, net: den.slots.net + net, biggest_win: Math.max(den.slots.biggest_win, net) }
    },
    async slotStats(uid) { me(uid); return { ...den.slots } },

    // ── The pot ──
    async slotsPot() { return { pot: den.pot.pot, last_winner_name: den.pot.last_winner_name, last_win_amount: den.pot.last_win_amount, last_won_at: den.pot.last_won_at } },
    async feedPot(amount) {
      den.pot.pot += Math.max(0, Math.trunc(Number(amount) || 0))
      return den.pot.pot
    },
    async claimPot(uid, winnerName, wager, maxBet) {
      me(uid)
      if (!maxBet || maxBet <= 0) return null
      const share = Math.floor(den.pot.pot * Math.min(Math.max(wager || 0, 0), maxBet) / maxBet)
      den.pot = { ...den.pot, pot: Math.max(den.pot.seed, den.pot.pot - share), last_win_amount: share, last_winner_name: winnerName, last_won_at: nowIso() }
      return { share, newPot: den.pot.pot }
    },
  }
}
