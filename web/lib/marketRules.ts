// ── THE MARKET'S HOURLY TICK, WITH NO DATABASE IN IT (Steam prep, 2026-09-29) ──
//
// On the web the market moves by itself: a cron runs update_fish_market() in
// Postgres every hour, for everybody at once (supabase/live/04_functions.sql).
// An offline game has no cron and no shared market, so this is that function as
// plain arithmetic, driven by the injected dice (lib/rng). A local save keeps its
// own market and catches it up by the hours that passed since it last ticked.
//
// Ported line for line, numbers unchanged:
//   - a MOOD holds for 2 to 5 hours, then a new one is rolled: 5% kraken, 5%
//     bounty season, 6% cursed waters, 12% tide rising, 12% low tide, 20%
//     storm, 40% calm; each carries a bias added to every species each hour;
//   - each species moves by a pull back toward 1.0 (8% of the gap), plus noise
//     (three dice summed, centred) scaled by its rarity's volatility and the
//     mood, plus the bias; clamped to 0.40..2.50 and rounded to cents;
//   - the last 24 multipliers are kept as its history.
// The web keeps the SQL; scripts/check-market-rules.mts holds this one.

import { rngNext } from '@/lib/rng'

export type MarketMood = 'kraken' | 'bounty_season' | 'cursed_waters' | 'tide_rising' | 'low_tide' | 'storm' | 'calm'

export type MarketState = {
  mood: MarketMood
  bias: number
  /** When the mood runs out (epoch ms). */
  moodExpiresAt: number
  /** The hour the market last ticked (epoch ms, on the hour). */
  lastTickAt: number
  /** Per species: today's multiplier, the one before, the last 24. */
  fish: Record<number, { m: number; prev: number; history: number[] }>
}

const HOUR = 3_600_000
const hours = (min: number) => (min + Math.floor(rngNext() * 4)) * HOUR

/** Roll the next mood, as update_fish_market does when the last one expires. */
export function rollMood(now: number): Pick<MarketState, 'mood' | 'bias' | 'moodExpiresAt'> {
  const roll = rngNext()
  let mood: MarketMood, bias: number
  if (roll < 0.05)      { mood = 'kraken';        bias = rngNext() < 0.5 ? 0.02 : -0.02 }
  else if (roll < 0.10) { mood = 'bounty_season'; bias = 0.025 }
  else if (roll < 0.16) { mood = 'cursed_waters'; bias = -0.025 }
  else if (roll < 0.28) { mood = 'tide_rising';   bias = 0.012 }
  else if (roll < 0.40) { mood = 'low_tide';      bias = -0.012 }
  else if (roll < 0.60) { mood = 'storm';         bias = rngNext() < 0.5 ? 0.01 : -0.01 }
  else                  { mood = 'calm';          bias = 0 }
  return { mood, bias, moodExpiresAt: now + hours(2) }
}

/** How much a species of this bite rarity swings in an hour, before the mood. */
export function rarityVolatility(biteRarity: number): number {
  return biteRarity === 1 ? 0.04 : biteRarity === 2 ? 0.06 : biteRarity === 3 ? 0.09 : biteRarity === 4 ? 0.14 : 0.20
}

/** The mood's hand on the volatility. */
export function moodVolatility(mood: MarketMood): number {
  return mood === 'storm' ? 1.5 : mood === 'kraken' ? 2.0 : mood === 'bounty_season' || mood === 'cursed_waters' ? 1.2 : 1
}

/** One species' next multiplier. */
export function nextMultiplier(m: number, biteRarity: number, mood: MarketMood, bias: number): number {
  const volatility = rarityVolatility(biteRarity) * moodVolatility(mood)
  const drift = 0.08 * (1.0 - m)
  const noise = (rngNext() + rngNext() + rngNext() - 1.5) * volatility
  return Math.round(Math.max(0.40, Math.min(2.50, m + drift + noise + bias)) * 100) / 100
}

/** One hourly tick at `now`: maybe a new mood, then every species moves. */
export function tickMarket(state: MarketState, species: { id: number; bite_rarity: number }[], now: number): MarketState {
  const moodPart = now >= state.moodExpiresAt ? rollMood(now) : { mood: state.mood, bias: state.bias, moodExpiresAt: state.moodExpiresAt }
  const fish: MarketState['fish'] = {}
  for (const s of species) {
    const cur = state.fish[s.id] ?? { m: 1, prev: 1, history: [] }
    fish[s.id] = {
      m: nextMultiplier(cur.m, s.bite_rarity, moodPart.mood, moodPart.bias),
      prev: cur.m,
      history: [...cur.history, Math.round(cur.m * 100) / 100].slice(-24),
    }
  }
  return { ...moodPart, lastTickAt: now, fish }
}

/** A market that has never ticked: every species at par, a mood rolled. */
export function freshMarket(now: number): MarketState {
  const hour = Math.floor(now / HOUR) * HOUR
  return { ...rollMood(hour), lastTickAt: hour, fish: {} }
}

/**
 * Tick once for every whole hour since the last tick, as the cron would have.
 * Capped: after two days away the drift has long since pulled every species
 * back toward par, so older hours change nothing a captain could tell, and a
 * save opened after a year must not spin through nine thousand ticks.
 */
export const MAX_CATCH_UP_TICKS = 48
export function catchUpMarket(state: MarketState, species: { id: number; bite_rarity: number }[], now: number): MarketState {
  const due = Math.floor((now - state.lastTickAt) / HOUR)
  if (due <= 0) return state
  let s = state
  const skip = Math.max(0, due - MAX_CATCH_UP_TICKS)
  for (let k = skip + 1; k <= due; k++) s = tickMarket(s, species, state.lastTickAt + k * HOUR)
  return s
}
