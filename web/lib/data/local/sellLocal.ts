// ── SELLING OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// SellData over one captain's save: the hold, the prices, the deals struck at
// sea and the rods. The one-shot contracts in lib/data/sellData hold here too:
// a stack is taken only while it reads what was seen, the whole hold is taken
// once and the sale pays for what was taken, a trader key is claimed once.
//
// THE MARKET is the one real difference. On the web it is one market for
// everybody, moved by a cron every hour. Offline it is this captain's own, kept
// in the save and caught up by the hours that passed whenever a price is read
// (lib/marketRules, the cron's arithmetic).

import type { SellData, HoldStack } from '../sellData'
import { localCaptain, type LocalSave } from './save'
import { catchUpMarket, freshMarket, type MarketState } from '@/lib/marketRules'
import { clockNow } from '@/lib/clock'

/** The captain's market, caught up to now (and started, the first time). */
export function currentMarket(save: LocalSave): MarketState {
  const now = clockNow()
  save.market = catchUpMarket(save.market ?? freshMarket(now), save.species, now)
  return save.market
}

/** SellData over one captain's local save. */
export function localSellData(save: LocalSave): SellData {
  const captain = localCaptain(save)
  const { me } = captain
  const value = (fishId: number) => save.species.find(f => f.id === fishId)?.sell_value ?? null
  return {
    ...captain,

    // ── The hold ──
    async holdStacks(uid) {
      me(uid)
      return Object.entries(save.hold).map(([id, q]) => ({ fish_id: Number(id), quantity: q }))
    },
    async pricedHold(uid) {
      me(uid)
      return Object.entries(save.hold).filter(([, q]) => q > 0)
        .map(([id, q]) => ({ fish_id: Number(id), quantity: q, sell_value: value(Number(id)) ?? 0 }))
    },
    async stackQty(uid, fishId) { me(uid); return fishId in save.hold ? save.hold[fishId] : null },
    async takeStack(uid, fishId, qty, ifWas) {
      me(uid)
      if (save.hold[fishId] !== ifWas) return false
      if (qty === 0) delete save.hold[fishId]; else save.hold[fishId] = qty
      return true
    },
    async emptyStack(uid, fishId, ifWas) {
      me(uid)
      if (save.hold[fishId] !== ifWas) return false
      delete save.hold[fishId]; return true
    },
    async takeWholeHold(uid) {
      me(uid)
      const rows: HoldStack[] = Object.entries(save.hold).map(([id, q]) => ({ fish_id: Number(id), quantity: q }))
      save.hold = {}
      return { rows, failed: false }
    },

    // ── Prices ──
    async speciesValues(fishIds) {
      return new Map(fishIds.map(id => [id, Number(value(id) ?? 0)] as [number, number]).filter(([id]) => value(id) != null))
    },
    async speciesValue(fishId) { return value(fishId) },
    async marketMultipliers() {
      const m = currentMarket(save)
      return new Map(save.species.map(s => [s.id, m.fish[s.id]?.m ?? 1]))
    },
    async marketMultiplier(fishId) {
      if (value(fishId) == null) return null
      return currentMarket(save).fish[fishId]?.m ?? 1
    },

    // ── The old delayed lane: never written offline ──
    async pendingSales(uid) { me(uid); return [] },

    // ── The day's deals ──
    async dealsToday(uid, seaDay) { me(uid); return save.deals.filter(d => d.sea_day === seaDay).length },
    async dealtKeys(uid, seaDay) { me(uid); return save.deals.filter(d => d.sea_day === seaDay).map(d => d.trader_key) },
    async claimDeal(uid, row) {
      me(uid)
      if (save.deals.some(d => d.trader_key === row.trader_key)) return 'taken'
      // Only the last week is kept: a key carries its day, so an older one can
      // never be claimed again anyway, and the save should not grow forever.
      save.deals = [...save.deals.filter(d => d.sea_day >= row.sea_day - 7), structuredClone(row)]
      return 'ok'
    },
    async releaseDeal(uid, traderKey) { me(uid); save.deals = save.deals.filter(d => d.trader_key !== traderKey) },

    // ── Rods ──
    async ownsRod(uid, tier) { me(uid); return save.rods.includes(tier) },
    async grantRod(uid, tier) {
      me(uid)
      if (save.rods.includes(tier)) return false
      save.rods.push(tier); return true
    },
  }
}
