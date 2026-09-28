// ── SELLING'S DATA ACCESS (Steam prep, step 6, 2026-09-28) ──
//
// Every read and write the market, the sea's traders and the blockade runner
// make, as named operations. The prices are lib/sellRules; this is only where
// the fish, the coin and the day's deals live.
//
// The one-shot guards are the contract, and an offline store must keep them:
//   - emptyStack / takeStack take fish ONLY if the stack still reads what was
//     seen, so two sales fired together are never both paid for one fish;
//   - takeWholeHold returns exactly the rows it removed, and the sale pays for
//     those, not for what was read before;
//   - claimDeal is the once-per-trader (and once-a-night) lock: the SECOND
//     claim of a key reports 'taken', never 'ok';
//   - deductDoubloons returns null when the purse will not cover it, and that
//     null is the guard.

import { captainData, type CaptainData, type Db } from './common'

export type HoldStack = { fish_id: number; quantity: number }
export type PricedStack = HoldStack & { sell_value: number }
export type PendingSaleRow = { id: string; amount: number; fish_count: number; reason: string; settles_at: string }

export interface SellData extends CaptainData {
  // ── The hold ──
  /** Every stack in the hold (including empties). */
  holdStacks(uid: string): Promise<HoldStack[]>
  /** Stacks of at least one, each with its species' base value. */
  pricedHold(uid: string): Promise<PricedStack[]>
  /** One species' stack, or null. */
  stackQty(uid: string, fishId: number): Promise<number | null>
  /** Set a stack to `qty`, only if it still holds `ifWas`. True if it did. */
  takeStack(uid: string, fishId: number, qty: number, ifWas: number): Promise<boolean>
  /** Empty a stack, only if it still holds `ifWas`. True if it did. */
  emptyStack(uid: string, fishId: number, ifWas: number): Promise<boolean>
  /** Clear the whole hold and hand back exactly what was removed. */
  takeWholeHold(uid: string): Promise<{ rows: HoldStack[]; failed: boolean }>

  // ── Prices ──
  /** Base values for these species. */
  speciesValues(fishIds: number[]): Promise<Map<number, number>>
  /** One species' base value, or null. */
  speciesValue(fishId: number): Promise<number | null>
  /** Today's market multiplier for every species. */
  marketMultipliers(): Promise<Map<number, number>>
  /** Today's market multiplier for one species, or null. */
  marketMultiplier(fishId: number): Promise<number | null>

  // ── The old delayed lane (still honoured, nothing new is written) ──
  pendingSales(uid: string): Promise<PendingSaleRow[]>

  // ── The day's deals ──
  /** Deals struck on this sea day. */
  dealsToday(uid: string, seaDay: number): Promise<number>
  /** The trader keys dealt with on this sea day. */
  dealtKeys(uid: string, seaDay: number): Promise<string[]>
  /** Claim a trader for the day. 'taken' if already claimed. */
  claimDeal(uid: string, row: { trader_key: string; sea_day: number; kind: string; detail: object }): Promise<'ok' | 'taken' | 'failed'>
  /** Give a claim back (the deal fell through, nothing was charged). */
  releaseDeal(uid: string, traderKey: string): Promise<void>
  /** Take coin only if the purse covers it; the new balance, or null. */
  deductDoubloons(uid: string, amount: number): Promise<number | null>

  // ── Rods ──
  ownsRod(uid: string, tier: number): Promise<boolean>
  /** Give a rod; false if it could not be given (already owned, a race). */
  grantRod(uid: string, tier: number): Promise<boolean>
}

/** SellData over Supabase. */
export function sellData(admin: Db): SellData {
  return {
    ...captainData(admin),

    async holdStacks(uid) {
      const { data } = await admin.from('fish_inventory').select('fish_id, quantity').eq('user_id', uid)
      return (data ?? []) as HoldStack[]
    },
    async pricedHold(uid) {
      const { data } = await admin.from('fish_inventory').select('fish_id, quantity, fish_species(sell_value)').eq('user_id', uid).gt('quantity', 0)
      type R = { fish_id: number; quantity: number; fish_species: { sell_value: number } | null }
      return ((data ?? []) as unknown as R[]).map(r => ({ fish_id: r.fish_id, quantity: r.quantity, sell_value: r.fish_species?.sell_value ?? 0 }))
    },
    async stackQty(uid, fishId) {
      const { data } = await admin.from('fish_inventory').select('quantity').eq('user_id', uid).eq('fish_id', fishId).single()
      return data ? (data.quantity as number) : null
    },
    async takeStack(uid, fishId, qty, ifWas) {
      const { data } = await admin.from('fish_inventory').update({ quantity: qty })
        .eq('user_id', uid).eq('fish_id', fishId).eq('quantity', ifWas).select('fish_id')
      return !!data && data.length > 0
    },
    async emptyStack(uid, fishId, ifWas) {
      const { data } = await admin.from('fish_inventory').update({ quantity: 0 })
        .eq('user_id', uid).eq('fish_id', fishId).eq('quantity', ifWas).select('fish_id')
      return !!data && data.length > 0
    },
    async takeWholeHold(uid) {
      const { data, error } = await admin.from('fish_inventory').delete().eq('user_id', uid).select('fish_id, quantity')
      return { rows: (data ?? []) as HoldStack[], failed: !!error }
    },

    async speciesValues(fishIds) {
      if (!fishIds.length) return new Map()
      const { data } = await admin.from('fish_species').select('id, sell_value').in('id', fishIds)
      return new Map((data ?? []).map(f => [f.id as number, Number(f.sell_value ?? 0)]))
    },
    async speciesValue(fishId) {
      const { data } = await admin.from('fish_species').select('sell_value').eq('id', fishId).single()
      return data ? (data.sell_value as number) : null
    },
    async marketMultipliers() {
      const { data } = await admin.from('fish_market').select('fish_id, multiplier')
      return new Map((data ?? []).map(r => [r.fish_id as number, Number(r.multiplier)]))
    },
    async marketMultiplier(fishId) {
      const { data } = await admin.from('fish_market').select('multiplier').eq('fish_id', fishId).single()
      return data ? Number(data.multiplier) : null
    },

    async pendingSales(uid) {
      const { data } = await admin.from('pending_sales').select('id, amount, fish_count, reason, settles_at').eq('user_id', uid).order('settles_at', { ascending: true })
      return (data ?? []) as PendingSaleRow[]
    },

    async dealsToday(uid, seaDay) {
      const { count } = await admin.from('sea_trader_deals').select('trader_key', { count: 'exact', head: true }).eq('user_id', uid).eq('sea_day', seaDay)
      return count ?? 0
    },
    async dealtKeys(uid, seaDay) {
      const { data } = await admin.from('sea_trader_deals').select('trader_key').eq('user_id', uid).eq('sea_day', seaDay)
      return (data ?? []).map(r => r.trader_key as string)
    },
    async claimDeal(uid, row) {
      const { error } = await admin.from('sea_trader_deals').insert({ user_id: uid, ...row })
      // 23505 is the primary key. Anything else is a real failure and must not
      // be reported as "already done", or a broken write looks like a done one.
      return !error ? 'ok' : error.code === '23505' ? 'taken' : 'failed'
    },
    async releaseDeal(uid, traderKey) {
      await admin.from('sea_trader_deals').delete().eq('user_id', uid).eq('trader_key', traderKey)
    },
    async deductDoubloons(uid, amount) {
      // deduct_doubloons checks the balance in its own WHERE and RETURNS the new
      // balance, or NULL (without raising) when it will not cover.
      const { data, error } = await admin.rpc('deduct_doubloons', { uid, amount })
      return error || data == null ? null : Number(data)
    },

    async ownsRod(uid, tier) {
      const { data } = await admin.from('rod_inventory').select('rod_tier').eq('user_id', uid).eq('rod_tier', tier).maybeSingle()
      return !!data
    },
    async grantRod(uid, tier) {
      const { error } = await admin.from('rod_inventory').insert({ user_id: uid, rod_tier: tier })
      return !error
    },
  }
}
