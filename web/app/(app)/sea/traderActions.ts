'use server'

// THE SALT ROAD — striking a deal.
//
// The client sends a trader KEY and nothing else. Not a price, not a quantity,
// not what they are selling. All of that is re-derived here from the key, by
// the same pure function the map drew them with, so the worst a forged request
// can do is name a trader who does not exist and get turned away.
//
// Two guards, and they are different guards for different problems:
//
//   ONCE PER TRADER — a primary key on (user_id, trader_key). The insert is the
//   claim. Two taps landing together cannot both succeed, because the second
//   one violates the key rather than reading a stale row and deciding it is
//   fine. This is the mail/bounty pattern, not the collectTrawl pattern.
//
//   SIX PER DAY — the real bound on the whole feature. The map is client-side,
//   so the server has no idea where the boat is and cannot check that you
//   actually sailed to anyone. Rather than pretend otherwise, the cap makes it
//   not matter: skipping the sailing gets you the best few deals of the day
//   instead of the nearest few, which against a day's fishing is a rounding
//   error.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { traderFromKey, seaDay, DEALS_PER_DAY } from '@/lib/seaTraders'
import { getBait } from '@/lib/bait'

export type DealResult =
  | { ok: true; spent?: number; earned?: number; baitType?: string; qty?: number; doubloons: number }
  | { error: string }

/** Read on the page so the cap survives a reload. */
export async function dealtToday(): Promise<string[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const { data } = await supabase
    .from('sea_trader_deals')
    .select('trader_key')
    .eq('user_id', user.id)
    .eq('sea_day', seaDay())
  return (data ?? []).map(r => r.trader_key as string)
}

export async function strikeDeal(traderKey: string): Promise<DealResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  // THE TRADER IS REBUILT, NOT RECEIVED. traderFromKey re-hashes the cell and
  // the day and only returns someone if the key it produces matches the key it
  // was given, so a made-up key cannot conjure a made-up price.
  const trader = traderFromKey(traderKey)
  if (!trader) return { error: 'There is nobody there.' }

  const today = seaDay()
  // A key from another day is a stale tab, not an attack. Say so plainly.
  if (!traderKey.startsWith(`${today}:`)) {
    return { error: 'They sailed on. The sea has different people in it today.' }
  }

  const admin = createAdminClient()

  const { count } = await admin
    .from('sea_trader_deals')
    .select('trader_key', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('sea_day', today)
  if ((count ?? 0) >= DEALS_PER_DAY) {
    return { error: `Word travels. Nobody else out here will deal with you today.` }
  }

  const { data: profile } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()
  const doubloons = Number(profile?.doubloons ?? 0)

  // ── CLAIM FIRST, PAY SECOND ─────────────────────────────────────────────
  // The insert IS the lock. Everything below it happens exactly once because
  // only one caller can have got past this line.
  const detail = trader.deal === 'bait'
    ? { deal: 'bait', baitType: trader.baitType, qty: trader.qty, cost: trader.cost }
    : { deal: 'buy', rate: trader.rate }

  if (trader.deal === 'bait') {
    if (doubloons < trader.cost) {
      return { error: `${trader.name} wants ${trader.cost.toLocaleString()} and you have not got it.` }
    }
  }

  const { error: claimErr } = await admin
    .from('sea_trader_deals')
    .insert({
      user_id: user.id,
      trader_key: traderKey,
      sea_day: today,
      kind: trader.kind,
      detail,
    })
  if (claimErr) {
    // 23505 is the primary key. Anything else is a real failure and must not be
    // reported as "already done", or a broken write looks like a completed one.
    if (claimErr.code === '23505') return { error: 'You have already dealt with them.' }
    return { error: 'The deal fell through.' }
  }

  if (trader.deal === 'bait') {
    const bait = getBait(trader.baitType)
    if (!bait) return { error: 'The deal fell through.' }

    // THE ARGUMENTS ARE (uid, amount), and the RESULT is the guard.
    //
    // deduct_doubloons does the balance check inside its own WHERE clause and
    // RETURNS the new balance — so when you cannot afford it, it updates no
    // rows and hands back NULL without raising anything at all. Checking
    // `error` here would have been checking something that never fires, and the
    // bait would have been granted for free. The atomic check is the return
    // value; the read above is only there to word the message nicely.
    const { data: newBalance, error: spendErr } = await admin.rpc('deduct_doubloons', {
      uid: user.id, amount: trader.cost,
    })
    if (spendErr || newBalance == null) {
      // Give the claim back. A captain who was charged nothing must not lose
      // the trader as well.
      await admin.from('sea_trader_deals')
        .delete().eq('user_id', user.id).eq('trader_key', traderKey)
      return { error: 'You have not got the coin.' }
    }

    await admin.rpc('upsert_bait', {
      p_user_id: user.id, p_bait_type: trader.baitType, p_qty: trader.qty,
    })
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: -trader.cost, reason: `Bought ${trader.qty} ${bait.name} from ${trader.name}`,
    })

    return {
      ok: true, spent: trader.cost, baitType: trader.baitType, qty: trader.qty,
      // The balance the DB actually landed on, not the one this request
      // predicted before it started.
      doubloons: Number(newBalance),
    }
  }

  // ── THE SALTER buys the hold outright ───────────────────────────────────
  const { data: hold } = await admin
    .from('fish_inventory')
    .select('fish_id, quantity')
    .eq('user_id', user.id)
  const rows = (hold ?? []) as { fish_id: number; quantity: number }[]
  if (!rows.length) {
    await admin.from('sea_trader_deals')
      .delete().eq('user_id', user.id).eq('trader_key', traderKey)
    return { error: 'Your hold is empty. Nothing to sell.' }
  }

  // Prices come from the market, server side. The rate is the only thing the
  // trader contributes, and that came out of the hash.
  const ids = [...new Set(rows.map(r => r.fish_id))]
  const { data: species } = await admin
    .from('fish_species').select('id, sell_value').in('id', ids)
  const value = new Map((species ?? []).map(f => [f.id as number, Number(f.sell_value ?? 0)]))

  let earned = 0
  for (const r of rows) earned += (value.get(r.fish_id) ?? 0) * r.quantity * trader.rate
  earned = Math.floor(earned)
  if (earned <= 0) {
    await admin.from('sea_trader_deals')
      .delete().eq('user_id', user.id).eq('trader_key', traderKey)
    return { error: 'Nothing in your hold is worth his salt.' }
  }

  await admin.from('fish_inventory').delete().eq('user_id', user.id)
  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: earned })
  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: earned, reason: `Sold the hold to ${trader.name} at sea`,
  })

  return { ok: true, earned, doubloons: doubloons + earned }
}
