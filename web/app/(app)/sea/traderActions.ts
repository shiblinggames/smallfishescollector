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
import { PLACES, RESIDENTS, YOON } from '@/app/(app)/sea/chart'
import { decodeFog, encodeFog, fogSet } from '@/lib/seaExplore'
import { getBait } from '@/lib/bait'
import { RODS } from '@/lib/rods'

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
  // The union has more arms than this action handles — talkers want nothing and
  // residents have their own uncapped path — so narrow explicitly rather than
  // letting an `else` quietly stand for "must be a salter".
  if (trader.deal !== 'bait' && trader.deal !== 'buy') {
    return { error: 'They have nothing to trade.' }
  }
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
  const rate = trader.deal === 'buy' ? trader.rate : 0
  for (const r of rows) earned += (value.get(r.fish_id) ?? 0) * r.quantity * rate
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

  // Re-read rather than predict. This number is now DISPLAYED in the nav, and
  // `doubloons + earned` is the balance this request expected rather than the
  // one the database landed on — a concurrent sale elsewhere would leave the
  // header showing a total that was never true.
  const { data: after } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()
  return { ok: true, earned, doubloons: Number(after?.doubloons ?? doubloons + earned) }
}

/**
 * SELL THE HOLD TO A ZONE'S RESIDENT BUYER.
 *
 * Deliberately NOT the wandering-trader path, and deliberately NOT capped. The
 * six-a-day limit exists because a wanderer's discount is a reward you could
 * otherwise farm by skipping the sailing. This is not a reward — it is the same
 * conversion the 65% quick sell already does without limit, at a better rate,
 * in exchange for having sailed out here at all. Capping it would only ever
 * strand somebody with a full hold and nowhere to put it.
 *
 * The rate comes off the chart, server side. The client sends a zone id and
 * nothing else.
 */
export async function sellToResident(zoneId: string): Promise<
  { ok: true; earned: number; doubloons: number; rate: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const zone = PLACES.find(p => p.id === zoneId && p.kind === 'water')
  const res = RESIDENTS.find(r => r.zoneId === zoneId)
  if (!zone || !res) return { error: 'There is nobody buying here.' }
  const rate = res.rate

  const admin = createAdminClient()
  const { data: hold } = await admin
    .from('fish_inventory')
    .select('fish_id, quantity')
    .eq('user_id', user.id)
  const rows = (hold ?? []) as { fish_id: number; quantity: number }[]
  if (!rows.length) return { error: 'Your hold is empty.' }

  // Prices come from the species table, server side. The rate is the only thing
  // the buyer contributes and it came off the chart, not off the request.
  const ids = [...new Set(rows.map(r => r.fish_id))]
  const { data: species } = await admin
    .from('fish_species').select('id, sell_value').in('id', ids)
  const value = new Map((species ?? []).map(f => [f.id as number, Number(f.sell_value ?? 0)]))

  let earned = 0
  for (const r of rows) earned += (value.get(r.fish_id) ?? 0) * r.quantity * rate
  earned = Math.floor(earned)
  if (earned <= 0) return { error: 'Nothing in your hold is worth anything to them.' }

  // CLEAR THE HOLD FIRST. If the grant failed after the delete the player would
  // lose the fish for nothing; if the delete fails after the grant they would
  // be paid for a hold they still have, which is worse. Deleting first and
  // checking the result means the only failure left is being paid late.
  const { error: delErr } = await admin
    .from('fish_inventory').delete().eq('user_id', user.id)
  if (delErr) return { error: 'The sale fell through.' }

  await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: earned })
  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: earned,
    reason: `Sold the hold to ${res.name} in ${zone.name}`,
  })

  const { data: profile } = await admin
    .from('profiles').select('doubloons').eq('id', user.id).single()
  return { ok: true, earned, rate, doubloons: Number(profile?.doubloons ?? 0) }
}

/**
 * BUY A ROD FROM A BLOCKADE RUNNER.
 *
 * The only way three of the rods in this game change hands. The shop refuses
 * them and the shop's list hides them, so this is it.
 *
 * Rebuilt from the key like every other deal, which here does two jobs: it
 * fixes the price, and because a runner's key carries the NIGHT it belongs to,
 * it also enforces that it is still that night. A key saved from an earlier
 * cycle rebuilds to nothing.
 *
 * Counts against the daily deal cap and against the once-per-trader key, the
 * same as any other encounter — a rod is emphatically a reward.
 */
export async function buyRunnerRod(traderKey: string): Promise<
  { ok: true; rodTier: number; spent: number; doubloons: number } | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const trader = traderFromKey(traderKey)
  if (!trader || trader.deal !== 'rod') {
    return { error: 'They have gone. The dark does not keep anyone in one place.' }
  }
  const rod = RODS.find(r => r.tier === trader.rodTier)
  if (!rod) return { error: 'The deal fell through.' }

  const admin = createAdminClient()
  const today = seaDay()

  // THE CAP DOES NOT APPLY TO YOON.
  //
  // It exists because the wanderers are a daily rotation and skipping the
  // sailing should not get you the best six deals on the chart. Yoon sells one
  // thing, once ever — you cannot own the rod twice — so a cap on him is not a
  // bound on anything, it is a way to make somebody burn a day's trading to
  // discover they were one deal short of a rod they sailed an hour for.
  if (trader.key !== YOON.key) {
    const { count } = await admin
      .from('sea_trader_deals')
      .select('trader_key', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('sea_day', today)
    if ((count ?? 0) >= DEALS_PER_DAY) {
      return { error: 'Word travels. Nobody else out here will deal with you today.' }
    }
  }

  // Already own it? Say so before taking the claim, or a captain burns one of
  // six daily deals discovering they have one.
  const { data: had } = await admin
    .from('rod_inventory').select('rod_tier')
    .eq('user_id', user.id).eq('rod_tier', trader.rodTier).maybeSingle()
  if (had) return { error: `You already carry the ${rod.name}.` }

  const { error: claimErr } = await admin.from('sea_trader_deals').insert({
    user_id: user.id, trader_key: traderKey, sea_day: today, kind: 'runner',
    detail: { deal: 'rod', rodTier: trader.rodTier, cost: trader.cost },
  })
  if (claimErr) {
    if (claimErr.code === '23505') return { error: 'You have already dealt with them.' }
    return { error: 'The deal fell through.' }
  }

  // The RESULT is the guard, not the error — deduct_doubloons checks the
  // balance inside its own WHERE and returns NULL rather than raising.
  const { data: newBalance, error: spendErr } = await admin.rpc('deduct_doubloons', {
    uid: user.id, amount: trader.cost,
  })
  if (spendErr || newBalance == null) {
    await admin.from('sea_trader_deals')
      .delete().eq('user_id', user.id).eq('trader_key', traderKey)
    return { error: `They want ${trader.cost.toLocaleString()} and you have not got it.` }
  }

  await admin.from('rod_inventory').insert({ user_id: user.id, rod_tier: trader.rodTier })
  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -trader.cost,
    reason: `Bought the ${rod.name} from ${trader.name} at sea`,
  })

  return { ok: true, rodTier: trader.rodTier, spent: trader.cost, doubloons: Number(newBalance) }
}


/**
 * WHERE THE BOAT IS, remembered across a navigation.
 *
 * /sea used to drop you at HOME every time you opened it, which quietly made
 * the sail home optional: fill the hold in the Ancient Deep, tap the nav to the
 * market, sell at full price, and you reappear at the Mainland — exactly where
 * the trip home would have put you, for nothing. Leaving the page no longer
 * moves the boat.
 *
 * Deliberately NOT validated against anything. A forged position buys you
 * nothing: the only thing it changes is where your own boat starts, and there
 * is nothing on this chart you can reach by starting somewhere that you could
 * not reach by sailing there. The sell lanes are all guarded on their own terms
 * — the residents by rate, the wanderers by the daily deal cap — so position is
 * a convenience, not a permission.
 *
 * Clamped only to keep a NaN or an Infinity out of a numeric column.
 */
export async function saveSeaPosition(
  x: number, y: number,
  /** Fog cells uncovered since the last flush. Merged with OR — see below. */
  seen: number[] = [],
  /**
   * WHICH SEA THIS POSITION IS IN.
   *
   * This used to be unnecessary because northern positions were never written
   * at all: a coordinate past the reef, restored with no idea which side it
   * belonged to, would put a captain beyond a wall they can only cross at the
   * gate. The chart's answer was to refuse, and the cost was that the anchorage
   * and the sortie evaporated on every remount — switch tabs, come back, and
   * you are in the fishing grounds on the fishing boat, having been silently
   * taken off your own ship.
   *
   * Storing the side is what makes the northern coordinate safe. The wall, the
   * rim and the hull are all decided by it, so they agree on load.
   *
   * FOUR VALUES, because there are four states: which water, and which hull.
   * They are not independent — no fishing boat in the open sea, no warship in
   * the fishing grounds — so one field still covers it. `moored` is the harbour
   * on the expedition ship, with the fishing boat tied up at the raid dock.
   */
  side: 'fishing' | 'anchorage' | 'moored' | 'open' = 'fishing',
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  const admin = createAdminClient()

  const patch: Record<string, unknown> = {
    sea_x: Math.max(-1e6, Math.min(1e6, x)),
    sea_y: Math.max(-1e6, Math.min(1e6, y)),
    // WHEN, not just where. A position with no timestamp could be from thirty
    // seconds ago or from last March, and the compass cannot honestly point a
    // friend at a boat without knowing which. This is the only writer.
    sea_seen_at: new Date().toISOString(),
    // Never trusted from the client as anything but one of three words: this
    // decides which wall a captain wakes up behind.
    sea_side: side === 'anchorage' || side === 'moored' || side === 'open' ? side : 'fishing',
  }

  // ── THE FOG ───────────────────────────────────────────────────────────
  //
  // Read, OR, write. Not read-modify-write in the dangerous sense: OR is
  // idempotent and commutative, so two tabs racing, or a flush that arrives
  // out of order, can only ever ADD cells. The worst a lost update can do is
  // leave a patch of sea foggy that the player has already sailed — and they
  // will sail it again, because they cannot see what is in it.
  //
  // That is the whole reason this is a bitfield and not a list: a list would
  // need dedup and ordering and could lose entries; a bitfield cannot.
  if (seen.length) {
    const { data: row } = await admin
      .from('profiles').select('sea_explored').eq('id', user.id).single()
    const bits = decodeFog(row?.sea_explored as string | null)
    for (const i of seen) fogSet(bits, i)
    patch.sea_explored = encodeFog(bits)
  }

  await admin.from('profiles').update(patch).eq('id', user.id)
}
