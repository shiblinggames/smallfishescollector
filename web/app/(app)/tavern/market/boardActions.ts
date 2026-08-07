'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLevelFromXP } from '@/lib/fishingLevel'
import { EXCHANGE_FISHING_LEVEL, EXCHANGE_UNDER_CONSTRUCTION } from '@/lib/fishExchange'
import {
  TERMS, type Term, type Direction,
  rungsFor, priceBet, offeredBets, typicalDayMove, driftOver, stakeCapFor, costOf, MIN_CHANCE, MIN_STAKE, MAX_STAKE,
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
  multiplier: number
  stake: number
  entryPrice: number
  livePrice: number
  /** How far it has come, signed the player's way. */
  movedPct: number
  expiresAt: string
  status: 'open' | 'won' | 'lost'
  payout: number | null
  seen: boolean
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
      status: b.status as 'open' | 'won' | 'lost',
      payout: b.payout == null ? null : Number(b.payout),
      seen: b.seen === true,
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
    .select('id, vol, beta, trend, trend_ticks, price').eq('id', indexId).single()
  if (!idx) return { error: 'No such index' }
  const entry = Number(idx.price)
  if (!(entry > 0)) return { error: 'That index has no price right now' }

  const stake = costOf(units, entry)
  if (stake < MIN_STAKE) return { error: `That is only ${stake.toLocaleString()} ⟡. Buy at least ${MIN_STAKE.toLocaleString()} ⟡ worth.` }
  if (stake > MAX_STAKE) return { error: `Largest bet is ${MAX_STAKE.toLocaleString()} ⟡` }

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
  const allowed = offeredBets(daily, term, drift)
  const bet = allowed.find(b => Math.abs(b.distancePct - distancePct) < 0.0001)
  if (!bet || bet.chance < MIN_CHANCE) return { error: 'That bet is not offered on this one' }

  // Priced from the index, never from the caller.
  const priced = priceBet(daily, term, bet.distancePct, drift)
  if (!(priced.multiplier > 0)) return { error: 'Could not price that bet' }

  // Long shots are capped by what they PAY, not by their odds. 250,000 at 199x
  // is 49 million out of one hour, against a richest balance of three.
  const cap = stakeCapFor(priced.multiplier)
  if (stake > cap) return { error: `Most you can put on this one is ${cap.toLocaleString()} ⟡` }


  // Debit first, atomically and balance-guarded, the same order every purchase
  // in the game uses. A bet written before the stake was taken is a bet
  // somebody could place with money they do not have.
  const { data: left } = await admin.rpc('deduct_doubloons', { uid: user.id, amount: stake })
  if (left == null) return { error: `Need ${stake.toLocaleString()} ⟡` }

  const { error } = await admin.from('exchange_bets').insert({
    user_id: user.id,
    index_id: indexId,
    direction, term,
    distance_pct: bet.distancePct,
    multiplier: priced.multiplier,
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
