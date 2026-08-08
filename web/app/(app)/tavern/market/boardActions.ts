'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { EXCHANGE_FISHING_LEVEL, EXCHANGE_UNDER_CONSTRUCTION } from '@/lib/fishExchange'
import {
  TERMS, type Term, type Direction,
  rungsFor, typicalDayMove, driftOver, contractValue, breakEvenFor, scheduledIn, MIN_STAKE, MAX_STAKE, MAX_NOTIONAL,
} from '@/lib/exchangeBoard'

// The write side of the rebuilt Exchange.
//
// EVERYTHING IS PRICED HERE, never taken from the caller. A server action is an
// HTTP endpoint: the multiplier, the distance and the odds all arrive as
// suggestions from a client that could be anything, and all three are thrown
// away and recomputed from the index's own volatility before a doubloon moves.
// The only things believed are which index, which way, how long, and how much,
// and each of those is checked against a list.

/** Per-tick vol is stored; a day is 24 ticks and the noise term contributes
 *  half of vol, so this is the figure the board is described by. Kept here as
 *  the ONE conversion, so nothing else has to know the tick shape. */
function dailyMovePct(vol: number): number {
  return vol * 2.449 * 100
}

export type BoardIndex = {
  id: string
  family: 'zone' | 'species'
  name: string
  blurb: string
  accent: string
  price: number
  prevPrice: number
  /** The SPREAD of a day's move. Prices every bet; never shown, because a third
   *  of days fall outside it and calling that "a normal day" is a lie. */
  dailyMovePct: number
  /** What an ordinary day actually looks like, which is the median move rather
   *  than the spread. This is the one that goes on screen. */
  typicalDayPct: number
  /** What the engine will carry it by on its own, per the current weather and
   *  its own trend. The client needs these to price a bet the same way the
   *  server will. */
  vol: number
  beta: number
  trend: number
  trendTicks: number
  /** When this index next reports, and what the report is called. Contracts
   *  that span it cost more, because they carry its variance. */
  nextEventAt: string | null
  /** When this index last ticked. Positions are valued as of THIS, not as of
   *  the wall clock, so the whole board moves once an hour together. */
  updatedAt: string | null
  nextEventLabel: string | null
  /** The last gap it took, so the chart's cliffs have an explanation. */
  lastEvent: string | null
  lastEventPct: number | null
  lastEventAt: string | null
  /** Oldest first. */
  history: number[]
  /** The five distances this index offers, whatever the term. */
  rungs: number[]
}

export type BoardBet = {
  id: number
  indexId: string
  indexName: string
  accent: string
  direction: Direction
  term: Term
  distancePct: number
  /** The price it has to beat. */
  strike: number
  /** What one contract cost. Breakeven is exactly this far past the strike. */
  premiumEach: number
  stake: number
  entryPrice: number
  livePrice: number
  /** How far it has come, signed the player's way. */
  movedPct: number
  expiresAt: string
  status: 'open' | 'won' | 'lost' | 'sold'
  payout: number | null
  /** When it finished, for the longer views of the book. */
  settledAt: string | null
  seen: boolean
  units: number
  /** What it would fetch if sold this second. Null once it has finished. */
  worth: number | null
  /** The price at which selling now returns exactly the premium paid. Climbs
   *  toward the target as the clock runs down, which is theta made visible. */
  breakEvenPrice: number | null
  hoursLeft: number
}

export type Board = {
  /** The shared weather right now. Half of it reaches an index, times its beta. */
  moodBias: number
  open: boolean
  closedReason: string | null
  doubloons: number
  indexes: BoardIndex[]
  bets: BoardBet[]
  unseen: number
}

const SHUT = (reason: string): Board => ({
  moodBias: 0, open: false, closedReason: reason, doubloons: 0, indexes: [], bets: [], unseen: 0,
})

export async function getBoard(): Promise<Board> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const uid = session?.user?.id
  if (!uid) return SHUT('Sign in to reach the Exchange')
  if (EXCHANGE_UNDER_CONSTRUCTION) return SHUT('The Exchange is closed while the board is rebuilt')

  const admin = createAdminClient()
  const [profileRes, idxRes, betRes, moodRes] = await Promise.all([
    admin.from('profiles').select('doubloons, fishing_xp').eq('id', uid).single(),
    admin.from('exchange_indexes').select('*').order('sort'),
    admin.from('exchange_bets').select('*').eq('user_id', uid).order('id', { ascending: false }).limit(40),
    admin.from('market_state').select('mood_bias').eq('id', 1).single(),
  ])

  const level = getLevelFromXP(Number(profileRes.data?.fishing_xp ?? 0))
  if (level < EXCHANGE_FISHING_LEVEL) {
    return SHUT(`Fishing ${EXCHANGE_FISHING_LEVEL} opens the Exchange`)
  }

  const indexes: BoardIndex[] = (idxRes.data ?? []).map(r => {
    const daily = dailyMovePct(Number(r.vol))
    return {
      id: r.id as string,
      family: r.family as 'zone' | 'species',
      name: r.name as string,
      blurb: r.blurb as string,
      accent: r.accent as string,
      price: Number(r.price),
      prevPrice: Number(r.prev_price),
      dailyMovePct: daily,
      typicalDayPct: typicalDayMove(daily),
      nextEventAt: (r.next_event_at as string | null) ?? null,
      updatedAt: (r.updated_at as string | null) ?? null,
      nextEventLabel: (r.next_event_label as string | null) ?? null,
      lastEvent: (r.last_event as string | null) ?? null,
      lastEventPct: r.last_event_pct == null ? null : Number(r.last_event_pct),
      lastEventAt: (r.last_event_at as string | null) ?? null,
      vol: Number(r.vol),
      beta: Number(r.beta),
      trend: Number(r.trend),
      trendTicks: Number(r.trend_ticks ?? 0),
      history: ((r.history as number[] | null) ?? []).map(Number),
      rungs: rungsFor(daily),
    }
  })
  const byId = new Map(indexes.map(i => [i.id, i]))

  const bets: BoardBet[] = (betRes.data ?? []).map(b => {
    const idx = byId.get(b.index_id as string)
    const live = idx?.price ?? Number(b.entry_price)
    const entry = Number(b.entry_price)
    const raw = entry > 0 ? ((live - entry) / entry) * 100 : 0
    // AS OF THE LAST TICK, not as of now. Time decay is continuous in the
    // maths, so valuing against the wall clock made a position creep on every
    // refresh while the price it depends on had not moved since the hour. The
    // board ticks hourly; so, now, does what your contracts are worth.
    const tickAt = idx?.updatedAt ? new Date(idx.updatedAt).getTime() : Date.now()
    const hoursLeft = Math.max(0, (new Date(b.expires_at as string).getTime() - tickAt) / 3600_000)
    // Valued the same way it was sold: same drift, same reports still to come.
    // Over what is LEFT, not over the term it was sold for. Spread already
    // shrinks with the clock; drift has to shrink with it or the two disagree.
    const betDrift = idx
      ? driftOver(idx.vol, idx.beta, idx.trend, idx.trendTicks,
          Number(moodRes.data?.mood_bias ?? 0), hoursLeft, 'up')
      : 0
    const betSched = idx ? scheduledIn(idx.nextEventAt, hoursLeft, tickAt) : 0
    return {
      id: b.id as number,
      indexId: b.index_id as string,
      indexName: idx?.name ?? (b.index_id as string),
      accent: idx?.accent ?? '#7dd3fc',
      direction: b.direction as Direction,
      term: Number(b.term) as Term,
      distancePct: Number(b.distance_pct),
      multiplier: Number(b.multiplier),
      stake: Number(b.stake),
      entryPrice: entry,
      livePrice: live,
      movedPct: b.direction === 'up' ? raw : -raw,
      expiresAt: b.expires_at as string,
      status: b.status as 'open' | 'won' | 'lost' | 'sold',
      payout: b.payout == null ? null : Number(b.payout),
      settledAt: (b.settled_at as string | null) ?? null,
      seen: b.seen === true,
      units: Number(b.units ?? 0),
      strike: Number(b.strike ?? 0),
      premiumEach: Number(b.premium_each ?? 0),
      worth: hoursLeft <= 0 || b.status !== 'open' || !idx ? null
        : Math.round(Number(b.units ?? 0) * contractValue(
            live, Number(b.strike), b.direction as Direction,
            hoursLeft, idx.dailyMovePct, betDrift, betSched)),
      /** FIXED THE MOMENT YOU BUY, unlike the binary's, which crept toward the
       *  strike all term. Past the strike the payoff grows a doubloon per
       *  doubloon, so the premium is recovered exactly one premium beyond it. */
      breakEvenPrice: Number(b.strike ?? 0) > 0
        ? breakEvenFor(Number(b.strike), Number(b.premium_each ?? 0), b.direction as Direction)
        : null,
      hoursLeft,
    }
  })

  return {
    moodBias: Number(moodRes.data?.mood_bias ?? 0),
    open: true,
    closedReason: null,
    doubloons: Number(profileRes.data?.doubloons ?? 0),
    indexes,
    bets,
    unseen: bets.filter(b => b.status !== 'open' && !b.seen).length,
  }
}

export type OpenResult = { ok: true; doubloons: number } | { error: string }

export async function openBet(
  indexId: string, direction: Direction, term: Term, distancePct: number,
  /** UNITS, not doubloons. What it costs is units times the price the server
   *  reads, so the cost is derived here and never sent. A client that could name
   *  its own stake could buy a 1,420 index for 500. */
  units: number,
): Promise<OpenResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  if (EXCHANGE_UNDER_CONSTRUCTION) return { error: 'The Exchange is closed while the board is rebuilt' }

  if (direction !== 'up' && direction !== 'down') return { error: 'Pick a direction' }
  if (!TERMS.includes(term)) return { error: 'Pick how long' }
  units = Math.floor(units)
  if (!Number.isFinite(units) || units < 1) return { error: 'Buy at least one unit' }

  const admin = createAdminClient()
  const { data: prof } = await admin.from('profiles').select('fishing_xp').eq('id', user.id).single()
  if (getLevelFromXP(Number(prof?.fishing_xp ?? 0)) < EXCHANGE_FISHING_LEVEL) {
    return { error: 'The Exchange is not open to you yet' }
  }

  const { data: idx } = await admin.from('exchange_indexes')
    .select('id, vol, beta, trend, trend_ticks, price, next_event_at').eq('id', indexId).single()
  if (!idx) return { error: 'No such index' }
  const entry = Number(idx.price)
  if (!(entry > 0)) return { error: 'That index has no price right now' }

  // The distance has to be one this index actually offers, and the bet has to
  // be one it offers AT THIS TERM. Both are recomputed here: a rung that is a
  // one-in-a-million on a one hour bet is not on the board, and asking for it
  // directly should not put it there.
  const daily = dailyMovePct(Number(idx.vol))
  // The SAME drift the engine will apply. Priced without it, a bet the weather
  // was already going to win was being sold at long-shot odds.
  const { data: mood } = await admin.from('market_state').select('mood_bias').eq('id', 1).single()
  const drift = driftOver(
    Number(idx.vol), Number(idx.beta), Number(idx.trend), Number(idx.trend_ticks ?? 0),
    Number(mood?.mood_bias ?? 0), term, direction,
  )
  // A report inside the window is certain variance, and the premium has to
  // carry it or the board hands that variance away.
  const sched = scheduledIn((idx.next_event_at as string | null) ?? null, term, Date.now())
  // The strike has to be one this index actually offers at this term.
  const rungs = rungsFor(daily)
  if (!rungs.some(d => Math.abs(d - distancePct) < 0.0001)) {
    return { error: 'That strike is not offered on this one' }
  }
  const strike = entry * (1 + (direction === 'up' ? 1 : -1) * distancePct / 100)
  if (!(strike > 0)) return { error: 'Could not price that contract' }

  // THE PREMIUM: the expected payoff, priced from the index and never from the
  // caller. Drift is the index's OWN, not signed to the buyer's side, because a
  // put and a call on the same water face the same weather.
  const driftRaw = driftOver(
    Number(idx.vol), Number(idx.beta), Number(idx.trend), Number(idx.trend_ticks ?? 0),
    Number(mood?.mood_bias ?? 0), term, 'up',
  )
  const each = contractValue(entry, strike, direction, term, daily, driftRaw, sched)
  const stake = Math.round(units * each)
  if (!(each > 0) || stake < MIN_STAKE) {
    return { error: `That is only ${stake.toLocaleString()} ⟡. Buy at least ${MIN_STAKE.toLocaleString()} ⟡ worth.` }
  }
  if (stake > MAX_STAKE) return { error: `Largest premium is ${MAX_STAKE.toLocaleString()} ⟡` }

  // NOTIONAL, not payout. A vanilla payoff has no ceiling to cap, and capping
  // it would break the fair price, so what is bounded is the size of the
  // position instead, the way a real position limit works.
  const notional = units * entry
  if (notional > MAX_NOTIONAL) {
    return { error: `Most you can hold of this one is ${Math.floor(MAX_NOTIONAL / entry).toLocaleString()} contracts` }
  }


  // Debit first, atomically and balance-guarded, the same order every purchase
  // in the game uses. A bet written before the stake was taken is a bet
  // somebody could place with money they do not have.
  const { data: left } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: stake })
  if (left == null) return { error: `Need ${stake.toLocaleString()} ⟡` }

  const { error } = await admin.from('exchange_bets').insert({
    user_id: user.id,
    index_id: indexId,
    direction, term,
    distance_pct: distancePct,
    strike,
    premium_each: each,
    units,
    stake,
    entry_price: entry,
    expires_at: new Date(Date.now() + term * 3600_000).toISOString(),
  })
  if (error) {
    // Give it back rather than leaving them short for a bet that does not exist.
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: stake })
    return { error: 'Could not place that bet' }
  }

  await admin.from('doubloon_transactions').insert({
    user_id: user.id, amount: -stake, reason: 'Exchange bet placed',
  })
  return { ok: true, doubloons: Number(left) }
}

/** Looking at your results is what clears the markers. */
export async function markBetsSeen(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await createAdminClient().from('exchange_bets')
    .update({ seen: true }).eq('user_id', user.id).eq('seen', false)
}

export type SellResult = { ok: true; got: number; doubloons: number } | { error: string }

/** Take a running bet's worth now instead of waiting for it to land.
 *
 *  Priced exactly as the board prices anything: payout times the chance it still
 *  gets there from where it stands, with the time it has left and the drift it is
 *  riding. Sold the moment it is placed it returns the stake, because there is no
 *  edge here and there is no penalty for changing your mind.
 *
 *  Claimed before it is paid, guarded on owner AND status, so a second tap or the
 *  settler landing at the same moment finds nothing to sell. */
export async function sellBet(betId: number): Promise<SellResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }
  if (EXCHANGE_UNDER_CONSTRUCTION) return { error: 'The Exchange is closed' }

  const admin = createAdminClient()
  const { data: bet } = await admin.from('exchange_bets')
    .update({ status: 'sold', settled_at: new Date().toISOString() })
    .eq('id', betId).eq('user_id', user.id).eq('status', 'open')
    .select('*').maybeSingle()
  if (!bet) return { error: 'That one is already settled' }

  const { data: idx } = await admin.from('exchange_indexes')
    .select('vol, beta, trend, trend_ticks, price, next_event_at, updated_at').eq('id', bet.index_id as string).single()
  const { data: mood } = await admin.from('market_state').select('mood_bias').eq('id', 1).single()

  const entry = Number(bet.entry_price)
  const live = Number(idx?.price ?? entry)
  const raw = entry > 0 ? ((live - entry) / entry) * 100 : 0
  const moved = bet.direction === 'up' ? raw : -raw
  // The same tick the sheet quoted against, or the button pays a different
  // number than the screen showed.
  const tickAt = idx?.updated_at ? new Date(idx.updated_at as string).getTime() : Date.now()
  const hoursLeft = Math.max(0, (new Date(bet.expires_at as string).getTime() - tickAt) / 3600_000)
  const daily = idx ? dailyMovePct(Number(idx.vol)) : 0
  const drift = idx ? driftOver(
    Number(idx.vol), Number(idx.beta), Number(idx.trend), Number(idx.trend_ticks ?? 0),
    Number(mood?.mood_bias ?? 0), hoursLeft, 'up',
  ) : 0

  // Same reports the sheet quoted against, or the sell button pays a different
  // number than the screen promised one second earlier.
  const sched = scheduledIn((idx?.next_event_at as string | null) ?? null, hoursLeft, tickAt)
  const got = Math.round(Number(bet.units) * contractValue(
    live, Number(bet.strike), bet.direction as Direction, hoursLeft, daily, drift, sched))

  await admin.from('exchange_bets')
    .update({ exit_price: live, payout: got, seen: true }).eq('id', betId)

  if (got > 0) {
    await admin.rpc('bump_profile_stat', { uid: user.id, col: 'doubloons', n: got })
    await admin.from('doubloon_transactions').insert({
      user_id: user.id, amount: got, reason: 'Exchange bet sold early',
    })
  }
  const { data: p } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
  return { ok: true, got, doubloons: Number(p?.doubloons ?? 0) }
}
