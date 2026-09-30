// ── SELLING, CORE (Steam prep, 2026-09-29) ──
//
// The two sell lanes, the wandering traders, the blockade runner and the boat's
// place on the chart, with nothing of the web in them. Each takes the store it
// reads and writes (SellData) and the captain's id. On the web the server
// actions (tavern/market/actions, sea/traderActions) check the session and hand
// these the Supabase store; offline, the local save's store.
//
// Moved verbatim out of those actions. The only edits: the session read became
// `uid`, the wallet grant became db.grant, and the clock became clockNow. The
// prices are lib/sellRules; the web-only step (settling the retired delayed
// lane, which only ever existed on the server) stays in the market actions.

import { traderFromKey, seaDay, DEALS_PER_DAY } from '@/lib/seaTraders'
import { PLACES, RESIDENTS } from '@/app/(app)/sea/chart'
import { decodeFog, encodeFog, fogSet } from '@/lib/seaExplore'
import { decodeXfog, encodeXfog, xfogSet } from '@/lib/seaExploreExp'
import { getBait } from '@/lib/bait'
import { RODS } from '@/lib/rods'
import { holdAtRate, runnerCutWon, marketSale, marketPriceEach } from '@/lib/sellRules'
import { clockNow } from '@/lib/clock'
import type { SellData, HoldStack } from '@/lib/data/sellData'

export type PendingSale = {
  id: string
  amount: number
  fishCount: number
  reason: string
  settlesAt: string
}

/** The old delayed lane's rows still owed, and the purse. */
export async function pendingSales(db: SellData, uid: string): Promise<{ pending: PendingSale[]; doubloons: number }> {
  const [data, profile] = await Promise.all([
    db.pendingSales(uid),
    db.profile(uid, 'doubloons'),
  ])
  const pending: PendingSale[] = data.map(r => ({
    id: r.id as string,
    amount: r.amount as number,
    fishCount: r.fish_count as number,
    reason: r.reason as string,
    settlesAt: r.settles_at as string,
  }))
  return { pending, doubloons: (profile?.doubloons as number | null) ?? 0 }
}

/**
 * SELL THE WHOLE HOLD, HERE, NOW, AT THE MARKET PRICE.
 *
 * This used to be "liquidate": 90% of market, minus the fee, paid an hour
 * later. The hour was standing in for a cost — the market lane was supposed to
 * be the one you had to work for, and holding the money back was the only way
 * to charge for it on a screen you could open from anywhere.
 *
 * The ocean hub charges that cost properly now. The market is a building on an
 * island; getting to it means sailing home with a full hold, which is a real
 * trip with real time in it and a decision about whether it is worth making
 * yet. Once you have made it, taking another hour off the player is charging
 * twice for the same thing.
 *
 * So the wait is gone and so is the 10% haircut: the whole hold sells for
 * exactly what the per-species market pays, because it IS the per-species
 * market, in one tap instead of thirty.
 *
 * The three lanes still ladder cleanly, and they ladder on DISTANCE now rather
 * than on time:
 *   65-75%  quick sell   — from anywhere, without moving
 *   78-86%  a zone buyer — where you are fishing, if you sail to them
 *   100%    the market   — ashore, which is the whole way home
 */
export async function sellEntireHold(db: SellData, uid: string): Promise<
  { earned: number; fishSold: number; doubloons: number } | { error: string }
> {
  const [inventory, multiplierMap, profile] = await Promise.all([
    db.pricedHold(uid),
    db.marketMultipliers(),
    db.profile(uid, 'doubloons, is_premium, premium_expires_at'),
  ])

  if (!profile) return { error: 'Profile not found' }
  if (inventory.length === 0) return { error: 'The hold is empty' }

  // NO CUT: the non-Captain fee went on 2026-09-16 for everybody. The price
  // itself is lib/sellRules marketSale.

  // Empty each stack only if it still holds what was read, and pay only for
  // the stacks that emptied. Two sells fired together cannot both be paid for
  // the same fish: the second one's update matches nothing.
  const cleared = await Promise.all(inventory.map(async item =>
    (await db.emptyStack(uid, item.fish_id, item.quantity)) ? item : null))

  const { earned: totalEarned, fishSold: totalFishSold } = marketSale(
    cleared.filter((x): x is NonNullable<typeof x> => !!x).map(item => ({
      sellValue: item.sell_value,
      multiplier: multiplierMap.get(item.fish_id) ?? 1.0,
      quantity: item.quantity,
    })))
  if (totalEarned <= 0) return { error: 'The hold is empty' }

  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', totalEarned),
    db.ledger(uid, totalEarned, `Sold ${totalFishSold} fish (market)`),
    db.bumpStat(uid, 'fish_sold_doubloons', totalEarned),
  ])

  return { earned: totalEarned, fishSold: totalFishSold, doubloons: newDoubloons }
}

export async function marketSellFish(
  db: SellData,
  uid: string,
  fishId: number,
  quantity: number,
): Promise<{ earned: number; doubloons: number } | { error: string }> {
  if (!Number.isInteger(quantity) || quantity <= 0) return { error: 'Invalid quantity' }

  const [held, sellValue, profile, multiplier] = await Promise.all([
    db.stackQty(uid, fishId),
    db.speciesValue(fishId),
    db.profile(uid, 'doubloons, is_premium, premium_expires_at'),
    db.marketMultiplier(fishId),
  ])

  if (held == null || sellValue == null || !profile) return { error: 'Data not found' }
  if (held < quantity) return { error: 'Not enough fish' }

  // NO CUT. See the note on the other sell path.
  const earned = marketPriceEach(sellValue, multiplier ?? 1.0) * quantity

  // Take the fish first, and only if the stack still holds what was read. A
  // twin request that got there first leaves this update matching nothing.
  if (!(await db.takeStack(uid, fishId, held - quantity, held))) return { error: 'Not enough fish' }

  const [newDoubloons] = await Promise.all([
    db.grant(uid, 'doubloons', earned),
    db.ledger(uid, earned, 'Sold fish (market)'),
    db.bumpStat(uid, 'fish_sold_doubloons', earned),
  ])

  return { earned, doubloons: newDoubloons }
}

// ── THE SALT ROAD — striking a deal ─────────────────────────────────────────
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

export type DealResult =
  | { ok: true; spent?: number; earned?: number; baitType?: string; qty?: number; doubloons: number }
  | { error: string }

/** The traders dealt with today, so the cap survives a reload. */
export async function dealtToday(db: SellData, uid: string): Promise<string[]> {
  return db.dealtKeys(uid, seaDay())
}

export async function strikeDeal(db: SellData, uid: string, traderKey: string): Promise<DealResult> {
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

  if ((await db.dealsToday(uid, today)) >= DEALS_PER_DAY) {
    return { error: `Word travels. Nobody else out here will deal with you today.` }
  }

  const profile = await db.profile(uid, 'doubloons')
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

  // 'taken' is the primary key refusing a second claim; anything else is a real
  // failure and must not be reported as "already done".
  const claim = await db.claimDeal(uid, { trader_key: traderKey, sea_day: today, kind: trader.kind, detail })
  if (claim === 'taken') return { error: 'You have already dealt with them.' }
  if (claim === 'failed') return { error: 'The deal fell through.' }

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
    const newBalance = await db.deductDoubloons(uid, trader.cost)
    if (newBalance == null) {
      // Give the claim back. A captain who was charged nothing must not lose
      // the trader as well.
      await db.releaseDeal(uid, traderKey)
      return { error: 'You have not got the coin.' }
    }

    await db.addBait(uid, trader.baitType, trader.qty)
    await db.ledger(uid, -trader.cost, `Bought ${trader.qty} ${bait.name} from ${trader.name}`)

    return {
      ok: true, spent: trader.cost, baitType: trader.baitType, qty: trader.qty,
      // The balance the DB actually landed on, not the one this request
      // predicted before it started.
      doubloons: Number(newBalance),
    }
  }

  // ── THE SALTER buys the hold outright ───────────────────────────────────
  const rows = await db.holdStacks(uid)
  if (!rows.length) {
    await db.releaseDeal(uid, traderKey)
    return { error: 'Your hold is empty. Nothing to sell.' }
  }

  // Prices come from the market, server side. The rate is the only thing the
  // trader contributes, and that came out of the hash.
  const value = await db.speciesValues([...new Set(rows.map(r => r.fish_id))])

  const rate = trader.deal === 'buy' ? trader.rate : 0
  const earned = holdAtRate(rows.map(r => ({ sellValue: value.get(r.fish_id) ?? 0, quantity: r.quantity })), rate)
  if (earned <= 0) {
    await db.releaseDeal(uid, traderKey)
    return { error: 'Nothing in your hold is worth his salt.' }
  }

  // Pay for what the delete actually took, not for what was read above. Two
  // Salters fired together both read the same hold; only one of them gets the
  // rows back from the delete, and the other is paid for nothing.
  const taken = await db.takeWholeHold(uid)
  const sold = await holdValue(db, taken.rows, rate)
  if (taken.failed || sold <= 0) {
    await db.releaseDeal(uid, traderKey)
    return { error: 'Your hold is empty. Nothing to sell.' }
  }

  // The balance the wallet landed on, returned by the same statement that paid.
  const newBalance = await db.grant(uid, 'doubloons', sold)
  await db.ledger(uid, sold, `Sold the hold to ${trader.name} at sea`)

  return { ok: true, earned: sold, doubloons: newBalance }
}

/** What a set of inventory rows is worth at `rate`, priced server side off the
 *  species table. Floored once over the whole lot, as both hold sales do. */
async function holdValue(
  db: SellData,
  rows: HoldStack[],
  rate: number,
): Promise<number> {
  if (!rows.length) return 0
  const value = await db.speciesValues([...new Set(rows.map(r => r.fish_id))])
  return holdAtRate(rows.map(r => ({ sellValue: value.get(r.fish_id) ?? 0, quantity: r.quantity })), rate)
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
export async function sellToResident(db: SellData, uid: string, zoneId: string): Promise<
  { ok: true; earned: number; doubloons: number; rate: number } | { error: string }
> {
  const zone = PLACES.find(p => p.id === zoneId && p.kind === 'water')
  const res = RESIDENTS.find(r => r.zoneId === zoneId)
  if (!zone || !res) return { error: 'There is nobody buying here.' }
  const rate = res.rate

  const rows = await db.holdStacks(uid)
  if (!rows.length) return { error: 'Your hold is empty.' }

  // Prices come from the species table, server side. The rate is the only thing
  // the buyer contributes and it came off the chart, not off the request.
  const value = await db.speciesValues([...new Set(rows.map(r => r.fish_id))])

  const earned = holdAtRate(rows.map(r => ({ sellValue: value.get(r.fish_id) ?? 0, quantity: r.quantity })), rate)
  if (earned <= 0) return { error: 'Nothing in your hold is worth anything to them.' }

  // CLEAR THE HOLD FIRST. If the grant failed after the delete the player would
  // lose the fish for nothing; if the delete fails after the grant they would
  // be paid for a hold they still have, which is worse. Deleting first and
  // checking the result means the only failure left is being paid late.
  //
  // And pay for the rows the delete handed back, not the ones read above: N
  // sales fired together all read the same hold, but only one delete gets the
  // rows, so only one of them is paid.
  const taken = await db.takeWholeHold(uid)
  if (taken.failed) return { error: 'The sale fell through.' }
  const sold = await holdValue(db, taken.rows, rate)
  if (sold <= 0) return { error: 'Your hold is empty.' }

  const newBalance = await db.grant(uid, 'doubloons', sold)
  await db.ledger(uid, sold, `Sold the hold to ${res.name} in ${zone.name}`)

  return { ok: true, earned: sold, rate, doubloons: newBalance }
}

/**
 * ── CUT THE DECK FOR THE YOLO ROD ───────────────────────────────────────────
 *
 * The blockade runner does not sell. He deals: one stake, one cut, one time in
 * ten you row home with the rod, and either way he will not deal with you again
 * until tomorrow.
 *
 * WHY IT IS NOT A PRICE. The YOLO Rod is a long-odds roll on every cast, and it
 * used to be the one rod you could simply buy if you had sailed far enough on
 * the right night. Ten stakes is what it cost on the shelf, so the arithmetic
 * has not moved - the average captain still pays a million for it - but the
 * money now behaves the way the rod does. Somebody gets it for a hundred
 * thousand and tells that story for a year.
 *
 * THE THREE LOCKS, and each one is a different thing being protected:
 *
 * 1. THE KEY carries the night it belongs to, so an offer saved from an earlier
 *    cycle rebuilds to nothing. That is the encounter.
 * 2. THE DAY ROW is `yolo:<sea day>` in sea_trader_deals, whose primary key is
 *    (user_id, trader_key) - so the insert IS the once-a-day lock, and two taps
 *    in the same second cannot both get a cut. That is the pacing.
 * 3. THE ROLL happens here and nowhere else. A client that decides its own odds
 *    is not a gamble, it is a button.
 *
 * NOT AGAINST THE DAILY DEAL CAP. It has a harder limit of its own, and burning
 * one of six ordinary trades on a coin flip would make somebody choose between
 * the rod and their day's selling.
 */
export async function wagerForRunnerRod(db: SellData, uid: string, traderKey: string): Promise<
  { ok: true; won: boolean; rodTier: number; rodName: string; stake: number; doubloons: number }
  | { error: string }
> {
  const trader = traderFromKey(traderKey)
  if (!trader || trader.deal !== 'wager') {
    return { error: 'They have gone. The dark does not keep anyone in one place.' }
  }
  const rod = RODS.find(r => r.tier === trader.rodTier)
  if (!rod) return { error: 'The deal fell through.' }

  const today = seaDay()

  // Say so before taking a stake. You cannot own the rod twice, and somebody
  // who already has it staking a hundred thousand on winning it again is the
  // worst possible way to find that out.
  if ((await db.held(uid, 'rod', rod.id)) > 0) return { error: `You already carry the ${rod.name}.` }

  // ONE CUT A DAY, and the row is the lock rather than a count that could be
  // read twice. Keyed on the sea day rather than the trader, deliberately: a
  // second runner on the same night is still the same night's cut.
  const claim = await db.claimDeal(uid, {
    trader_key: `yolo:${today}`, sea_day: today, kind: 'runner',
    detail: { deal: 'wager', rodTier: trader.rodTier, stake: trader.stake },
  })
  if (claim === 'taken') return { error: 'You have had your cut tonight. He will deal again tomorrow.' }
  if (claim === 'failed') return { error: 'The deal fell through.' }

  // The RESULT is the guard, not the error: deduct_doubloons checks the balance
  // inside its own WHERE and returns NULL rather than raising. If it will not
  // cover, the day's cut goes back - nobody loses a turn for being short.
  const newBalance = await db.deductDoubloons(uid, trader.stake)
  if (newBalance == null) {
    await db.releaseDeal(uid, `yolo:${today}`)
    return { error: `He wants ${trader.stake.toLocaleString()} on the table and you have not got it.` }
  }

  const won = runnerCutWon(trader.odds)

  if (won) {
    // The insert can still lose a race against another grant of the same rod.
    // If it does the captain keeps the stake as a loss rather than paying for
    // something they already own - which is the same outcome the dice give nine
    // times in ten, and cannot be told apart from it.
    if (await db.give(uid, 'rod', rod.id)) {
      await db.ledger(uid, -trader.stake, `Won the ${rod.name} off a blockade runner`)
      return {
        ok: true, won: true, rodTier: trader.rodTier, rodName: rod.name,
        stake: trader.stake, doubloons: Number(newBalance),
      }
    }
  }

  await db.ledger(uid, -trader.stake, `Staked on the ${rod.name} with a blockade runner`)
  return {
    ok: true, won: false, rodTier: trader.rodTier, rodName: rod.name,
    stake: trader.stake, doubloons: Number(newBalance),
  }
}

/**
 * Does this captain already carry the runner's rod? (KAN-25.) The wager
 * refuses the stake for an owned rod, but the panel had no way to know that
 * before the press, so it offered a bet nobody could take.
 */
export async function runnerRodOwned(db: SellData, uid: string, rodTier: number): Promise<boolean> {
  const id = RODS.find(r => r.tier === rodTier)?.id
  return id ? (await db.held(uid, 'rod', id)) > 0 : false
}

/** Which water the boat is in, and which hull (see saveSeaPosition). */
export type SeaSide = 'fishing' | 'anchorage' | 'moored' | 'open'

/** How long another chart's last heartbeat counts as "still sailing". The
 *  chart saves every few seconds while moving; half a minute is well past a
 *  dropped connection and well short of a tab somebody actually left open. */
const HELM_FRESH_MS = 30_000

/**
 * WHERE THE BOAT IS, remembered across a navigation. (The arguments are
 * documented on the action, sea/traderActions saveSeaPosition.)
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
  db: SellData,
  uid: string,
  x: number, y: number,
  seen: number[] = [],
  seenExp: number[] = [],
  side: SeaSide = 'fishing',
  helm?: { session: string; claim: boolean },
): Promise<{ helm: 'mine' | 'elsewhere' }> {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return { helm: 'mine' }
  const now = clockNow()

  if (helm && !helm.claim) {
    const row = await db.profile(uid, 'sea_session, sea_seen_at')
    const other = row?.sea_session && row.sea_session !== helm.session
    const fresh = row?.sea_seen_at && (now - Date.parse(String(row.sea_seen_at))) < HELM_FRESH_MS
    if (other && fresh) return { helm: 'elsewhere' }
  }

  const patch: Record<string, unknown> = {
    sea_x: Math.max(-1e6, Math.min(1e6, x)),
    sea_y: Math.max(-1e6, Math.min(1e6, y)),
    // WHEN, not just where. A position with no timestamp could be from thirty
    // seconds ago or from last March, and the compass cannot honestly point a
    // friend at a boat without knowing which. This is the only writer.
    sea_seen_at: new Date(now).toISOString(),
    // Never trusted from the client as anything but one of three words: this
    // decides which wall a captain wakes up behind.
    sea_side: side === 'anchorage' || side === 'moored' || side === 'open' ? side : 'fishing',
  }
  if (helm) patch.sea_session = helm.session

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
  if (seen.length || seenExp.length) {
    const row = await db.profile(uid, 'sea_explored, sea_explored_exp')
    if (seen.length) {
      const bits = decodeFog(row?.sea_explored as string | null)
      for (const i of seen) fogSet(bits, i)
      patch.sea_explored = encodeFog(bits)
    }
    // The campaign's own mask, on its own column and its own grid. Same OR, same
    // reasoning: the worst a lost update can do is leave water foggy that has
    // already been sailed, and it will be sailed again.
    if (seenExp.length) {
      const bits = decodeXfog(row?.sea_explored_exp as string | null)
      for (const i of seenExp) xfogSet(bits, i)
      patch.sea_explored_exp = encodeXfog(bits)
    }
  }

  await db.updateProfile(uid, patch)
  return { helm: 'mine' }
}
