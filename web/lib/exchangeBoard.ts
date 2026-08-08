// THE EXCHANGE, in the words a player would use.
//
// The old board asked people to read "break-even move 5.76%" and "leverage
// 0.1736" and work out for themselves whether that was a good bet. These are
// captains, not traders. Nobody should have to know what leverage is, or a
// strike, or a sigma, to place a bet on this screen.
//
// So the whole thing reduces to three plain questions, and every number the UI
// prints answers one of them:
//
//   WHICH WAY   up or down
//   HOW FAR     "at least +7%"      <- a distance, in percent, not a strike
//   HOW LONG    "by this time next week"
//
// and the board answers with two more:
//
//   HOW LIKELY  "about 1 in 3"      <- never a decimal probability
//   WHAT IT PAYS "3.2x your stake"
//
// That is the entire vocabulary. There is no jargon anywhere in this file's
// exported strings, on purpose.

export type Direction = 'up' | 'down'

// ── How long ────────────────────────────────────────────────────────────────
//
// An hour up to a week. The short end is the lottery: over one tick almost
// nothing travels far, so the near rungs are nearly impossible and pay
// enormously. The long end is the steady bet, where a week is enough time that
// even a big move is a fair shout.
//
// This is the ONLY reason the term matters, and it only works because the
// distances below are fixed in PERCENT rather than scaled to each term. Scale
// them per term and every term has identical odds, which is the trap the first
// version of this walked into.
// A DAY IS THE SHORTEST BET. The hour and the six-hour went, and not because
// they were mispriced: they were fair to the decimal. They were the wrong GAME.
// A term that resolves inside an hour is a thing you pull rather than a position
// you hold, and it can be re-entered all day, which is a slot machine wearing a
// chart. Selling early already covers the impatient case, and covers it better,
// because the price moves every hour whether or not your bet is about to end.
export const TERMS = [24, 72, 168] as const
export type Term = typeof TERMS[number]

/** Keyed loosely, because SETTLED bets keep whatever term they were sold at.
 *  The hour is gone from the board but not from anyone's history, and a row
 *  that renders a blank where its length should be reads as a bug. */
export const TERM_NAME: Record<number, string> = {
  1: 'One hour',
  6: 'Six hours',
  24: 'One day',
  72: 'Three days',
  168: 'One week',
}

/** The one-line pitch for each length, in plain words. */
export const TERM_PITCH: Record<Term, string> = {
  24: 'A day to get there. The everyday bet.',
  72: 'Three days of room to move.',
  168: 'A whole week. The patient bet.',
}

// ── How far ─────────────────────────────────────────────────────────────────
//
// Nine distances per index, set against how far THAT index travels in a normal
// day, so they are always sized to the thing you are betting on.
//
// The distances do NOT change with the term. That is the whole point: the same
// +7% is a near-miracle in an hour and a coin flip over a week.
//
// NINE, NOT FIVE, and the reason is the short end. Spaced for a day, five rungs
// left a cliff: on the wildest index a one-hour bet could reach +3% and then
// nothing until +7%, so the board offered exactly one option at 9x and the
// entire 20x-to-140x band simply did not exist. That band IS the one-hour bet.
// Denser at the bottom, so every term gets a ladder instead of a single rung:
//
//   wildest index, one hour   +3% 1 in 9 -> 9x   +5% 1 in 50 -> 49x
//   wildest index, one week   nine rungs from a coin flip out to 1 in 30
//
// THREE MORE AT THE BOTTOM. They were added to give the one-hour bet a
// near-money rung instead of nothing but long shots; the hour is gone now, but
// they earn their place on the day: a quarter of a day's travel is the SMALLEST
// thing the old ladder could ask for, which left no safe end at all. These are
// the low-risk bets, the ones that pay 2x for something likely.
const RUNG_STEPS = [0.05, 0.09, 0.14, 0.25, 0.4, 0.6, 0.85, 1.2, 1.6, 2.0, 2.5, 3.0] as const


/** The distances this index offers, in percent, smallest first. Rounded to
 *  something a person would say out loud: no 13.847%.
 *
 *  De-duplicated after rounding, because on a very calm index two steps can land
 *  on the same number and a board showing "+0.3%" twice at different odds is a
 *  bug that looks like a lie. */
export function rungsFor(dailyMovePct: number): number[] {
  const out = RUNG_STEPS.map(k => {
    const raw = dailyMovePct * k
    // Two decimals under a half, or the fine steps on a calm index all round to
    // zero and get dropped -- the calmest index would lose its whole short end.
    if (raw < 0.5) return Math.round(raw * 100) / 100  // 0.04, 0.11
    if (raw < 1) return Math.round(raw * 10) / 10   // 0.4, 0.8
    if (raw < 10) return Math.round(raw)            // 3, 7
    return Math.round(raw / 5) * 5                  // 15, 25, 40
  })
  return [...new Set(out)].filter(n => n > 0)
}

// ── The maths, kept in one place and never shown ────────────────────────────

const INV_SQRT_2PI = 0.3989422804014327
const normPdf = (z: number) => INV_SQRT_2PI * Math.exp(-0.5 * z * z)
/** Abramowitz and Stegun 7.1.26. Plenty for pricing a game contract. */
function normCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const d = normPdf(z)
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  return z >= 0 ? 1 - p : p
}

/** THE NUMBER TO SHOW, which is not the number to price with.
 *
 *  Everything here works in sigma, the spread of the move. But sigma is not what
 *  "a normal day" means: a third of days fall outside it. The typical day is the
 *  MEDIAN absolute move, 0.6745 of sigma, and quoting sigma instead overstates
 *  an ordinary day by half.
 *
 *  Price with spreadOver. Print this. */
export function typicalDayMove(dailySigmaPct: number): number {
  return dailySigmaPct * 0.6745
}

/** How far this index typically wanders over a given number of hours, given how
 *  far it wanders in a day. Root-time, the same way every market works. */
export function spreadOver(dailyMovePct: number, hours: Term): number {
  return dailyMovePct * Math.sqrt(hours / 24)
}

export type Bet = {
  /** The move it has to make, in percent. */
  distancePct: number
  /** Chance of getting there, 0 to 1. */
  chance: number
  /** What one staked doubloon comes back as if it does. */
  multiplier: number
}

/** Price one rung on one index over one term.
 *
 *  Payout is stake x multiplier when the move clears the distance, and nothing
 *  at all when it does not. All or nothing, because "you were nearly right" is
 *  a rule nobody can hold in their head while betting.
 *
 *  The multiplier is solved so the bet is FAIR: chance x multiplier = 1. No
 *  house edge. A market that quietly takes 8% off every bet is a thing you have
 *  to explain, and this screen is trying to explain as little as possible. */
// ── News ────────────────────────────────────────────────────────────────────
//
// KEEP IN LOCKSTEP WITH update_exchange_indexes, the same way driftOver is.
//
// The diffusion alone is Bates(3), whose support is HARD BOUNDED at 1.5 vol a
// tick. Pod's largest possible hour was 7.3%, Coral Reef's 0.79%, so a 20% gap
// on news was not a long shot, it was arithmetically impossible while the far
// rungs were still quoted at long-shot prices off a normal curve that assumed
// tails the engine could not produce. Real markets gap. This is that.
//
// CALIBRATED IN MARKET HOURS, NOT CALENDAR YEARS, and the difference is the
// whole thing. This board ticks 24/7, so one of our years is 8,760 ticks. A real
// market trades 6.5 hours by 252 days, or 1,638 hours a year. Our year holds
// 5.3x more market hours than a real one, so anything quoted "per year" has to
// be divided by our clock, not the calendar's.
//
// A real stock sees roughly eight notable events across those 1,638 hours, which
// is one per ~205 hours: p = 0.0049 per MARKET hour. Pricing it at 11 a calendar
// year instead made the board four times too quiet, and an index nobody ever
// sees gap may as well not have jumps at all.
//
// The same clock governs the vols. Our 24-tick day is about 3.7 real trading
// days, so an index should move sqrt(3.7) = 1.9x a real stock's daily figure:
// 3-7% for the species rather than a real company's 1.7-4%.
export const JUMP_P = 0.002          // SURPRISES only, per market hour
/** Scheduled reports run every 3 to 9 days per index. Keep in lockstep with
 *  EVENT_MIN_DAYS / EVENT_MAX_DAYS in update_exchange_indexes. */
export const EVENT_MIN_DAYS = 3
export const EVENT_MAX_DAYS = 9
export const JUMP_MIN_PCT = 10
export const JUMP_MAX_PCT = 35

/** PERCENTAGES INTO THE ENGINE'S OWN UNITS.
 *
 *  The engine accumulates in LOG space and the ladder is written in percent. The
 *  two agree near zero and part company where the money is: reaching +35% only
 *  costs ln(1.35) = 30 log-percent, so pricing the rung at a flat 35 asks the
 *  index for more room than it actually needs. Left uncorrected that underpriced
 *  Pod's far rungs by half, which at 159x is a 96% edge to whoever noticed.
 *
 *  Down is not the mirror of up, either: ln(0.75) is -28.8 against ln(1.25)'s
 *  +22.3, so a fall is the LONGER trip in log space. Both directions are
 *  converted on their own terms rather than by flipping a sign. */
const logPct = (pct: number) => 100 * Math.log(1 + pct / 100)

/** Four equal-weight magnitudes standing in for the uniform band, each carried
 *  as the pair of log moves it actually causes. A single jump is BIMODAL, up or
 *  down and nothing near zero, so approximating it with one normal prices the
 *  near rungs badly. Quadrature is cheap and honest. */
const JUMP_POINTS = [0, 1, 2, 3].map(i => {
  const m = JUMP_MIN_PCT + (JUMP_MAX_PCT - JUMP_MIN_PCT) * ((i + 0.5) / 4)
  return { up: logPct(m), down: logPct(-m) }
})
/** E[J^2] in log space, for the two-or-more case where a normal is fine. */
const JUMP_VAR = JUMP_POINTS.reduce((a, j) => a + (j.up ** 2 + j.down ** 2) / 2, 0) / JUMP_POINTS.length

/** Chance of clearing `distancePct`, counting both the ordinary drift of the
 *  water and the chance the news breaks while your bet is running.
 *
 *  A Poisson mixture over how many times it gaps: almost always none, sometimes
 *  one, rarely more. Jumps are symmetric, so they add no drift, only tail. */
function reachChance(
  distancePct: number, driftPct: number, s: number, hours: number,
  /** Scheduled reports certain to land inside this term, normally 0 or 1. A
   *  report is not a maybe once its hour is known, so it is counted rather than
   *  sampled -- and counting it is the entire reason a contract that spans one
   *  costs more than a contract that stops the hour before. */
  scheduled = 0,
): number {
  const lam = JUMP_P * hours
  const p0 = Math.exp(-lam)
  const p1 = lam * Math.exp(-lam)
  const p2 = Math.max(0, 1 - p0 - p1)
  const need = logPct(distancePct) - driftPct
  const tail = (d: number, sd: number) => 1 - normCdf(d / sd)

  // Chance of clearing the distance given exactly n gaps of either kind.
  const withJumps = (n: number): number => {
    if (n <= 0) return tail(need, s)
    if (n === 1) {
      let c = 0
      for (const j of JUMP_POINTS) c += tail(need - j.up, s) + tail(need - j.down, s)
      return c / (JUMP_POINTS.length * 2)
    }
    // Two or more and the sum is close enough to normal to say so.
    return tail(need, Math.sqrt(s * s + n * JUMP_VAR))
  }

  return p0 * withJumps(scheduled)
       + p1 * withJumps(scheduled + 1)
       + p2 * withJumps(scheduled + 2)
}

export function priceBet(
  dailyMovePct: number, hours: Term, distancePct: number,
  /** Where the index is already heading, over this whole term, signed the
   *  player's way. Trend and weather are PERSISTENT and drawn on the chart, so
   *  pricing pure noise sells a near-certainty at long-shot odds: a +0.3% hour
   *  on the Shallows was 3.3% flat and 100% during a bull run, both at 30x. */
  driftPct = 0,
  /** Scheduled reports landing inside this term. */
  scheduled = 0,
): Bet {
  const s = spreadOver(dailyMovePct, hours)
  if (!(s > 0) || !(distancePct > 0)) return { distancePct, chance: 0, multiplier: 0 }
  const chance = reachChance(distancePct, driftPct, s, hours, scheduled)
  if (chance <= 0.00005) return { distancePct, chance: 0, multiplier: 0 }
  // Never pay out on something that cannot lose. Drift can carry a near
  // certainty, and 1.01x is an honest price for one.
  return { distancePct, chance: Math.min(chance, 0.99), multiplier: 1 / Math.min(chance, 0.99) }
}

/** REPORTS LANDING INSIDE A TERM, from the next one's timestamp.
 *
 *  Normally 0 or 1: reports are 3 to 9 days apart and the longest term is a
 *  week, so two is possible but rare. Counted rather than assumed. */
export function scheduledIn(nextEventAt: string | null, hours: number, now: number): number {
  if (!nextEventAt) return 0
  const first = (new Date(nextEventAt).getTime() - now) / 3_600_000
  if (!Number.isFinite(first) || first > hours) return 0
  // Anything already due lands on the next tick, so it still counts.
  const gapHours = ((EVENT_MIN_DAYS + EVENT_MAX_DAYS) / 2) * 24
  return 1 + Math.max(0, Math.floor((hours - Math.max(0, first)) / gapHours))
}

/** WHAT A RUNNING BET IS WORTH RIGHT NOW.
 *
 *  A bet pays stake x multiplier if it gets there and nothing if it does not, so
 *  what it is worth mid-flight is simply that payout times the chance it still
 *  makes it FROM HERE. It has already used some of its time and covered some of
 *  its distance, so both of those go into the sum.
 *
 *  Two properties make this the honest price rather than an approximation of
 *  one, and both matter for a Sell button:
 *
 *    at the moment it is placed, the chance is the chance it was sold at, so it
 *    is worth exactly what was paid. Buying and selling straight back costs
 *    nothing, because there is no edge anywhere on this board.
 *
 *    at expiry it is worth the payout or it is worth nothing, which is what
 *    settlement pays, so the number never jumps at the end.
 *
 *  A bet already past its distance is NOT home: settlement reads where the price
 *  ENDS, so it can still fall back. That is why this asks the chance of finishing
 *  there rather than the chance of having touched it. */
export function worthNow(
  stake: number, multiplier: number, distancePct: number, movedPct: number,
  hoursLeft: number, dailyMovePct: number, driftPct = 0,
  /** Reports still to land before this one expires. */
  scheduled = 0,
): number {
  const payout = stake * multiplier
  if (!(hoursLeft > 0)) return movedPct >= distancePct ? Math.round(payout) : 0
  const s = dailyMovePct * Math.sqrt(hoursLeft / 24)
  if (!(s > 0)) return movedPct >= distancePct ? Math.round(payout) : 0
  // How much further it still has to travel, which can be negative if it is
  // already there and only has to stay.
  //
  // PRICED THE SAME WAY IT WAS SOLD. This used a bare normal while the ticket
  // had long since moved to a jump mixture, so the tail a far contract is
  // entirely made of was missing from its resale value: the board bought back
  // long shots for less than they were worth, quietly, on every early sell.
  const remaining = distancePct - movedPct
  const chance = Math.max(0, Math.min(1, reachChance(remaining, driftPct, s, hoursLeft, scheduled)))
  return Math.round(payout * chance)
}

/** THE MOVE THAT GETS YOUR MONEY BACK, as a percentage from where you bought.
 *
 *  A binary has no breakeven at expiry: it pays all or nothing, so the strike is
 *  the only number that matters there. But it can be SOLD at any hour, and the
 *  resale price is the payout times the chance from here, so there is a live
 *  price at which selling returns exactly what you paid.
 *
 *  It falls out prettily: resale equals stake exactly when the chance from here
 *  equals the chance you bought at. So breakeven is wherever the odds are back
 *  to what you paid for, and it CLIMBS as the clock runs down, because less time
 *  means less room, which means the index has to be further along to be worth
 *  the same. That climb is theta, in the only unit that matters to a player. */
export function breakEvenMovePct(
  multiplier: number, distancePct: number, hoursLeft: number,
  dailyMovePct: number, driftPct = 0, scheduled = 0,
): number | null {
  if (!(multiplier > 0) || !(hoursLeft > 0) || !(dailyMovePct > 0)) return null
  const s = dailyMovePct * Math.sqrt(hoursLeft / 24)
  if (!(s > 0)) return null
  const want = 1 / multiplier
  const chanceAt = (m: number) => reachChance(distancePct - m, driftPct, s, hoursLeft, scheduled)
  let lo = -95, hi = distancePct + 200
  if (chanceAt(hi) < want) return null
  // Chance rises with the move, so bisect. Sixty passes is far past the
  // precision any price is printed at.
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (chanceAt(mid) >= want) hi = mid; else lo = mid
  }
  return hi
}

/** Below this a rung is not offered at all. A one-in-fifty-thousand bet is not a
 *  long shot, it is a way to lose money you will never notice going. */
export const MIN_CHANCE = 0.005

export function offeredBets(dailyMovePct: number, hours: Term, driftPct = 0, scheduled = 0): Bet[] {
  return rungsFor(dailyMovePct)
    .map(d => priceBet(dailyMovePct, hours, d, driftPct, scheduled))
    .filter(b => b.chance >= MIN_CHANCE)
}

/** How far the engine will carry this index on its own over `hours`, before any
 *  noise. Mirrors update_exchange_indexes; keep the constants in lockstep or the
 *  board starts selling bets it has already won.
 *
 *  TWO HORIZONS, not one. Drift grows with time while noise only grows with its
 *  square root, so any drift wins eventually and a long bet becomes a formality.
 *  Priced with a single per-hour figure times the term, a one-week Shallows bet
 *  came out at THIRTEEN sigma: every rung 99% at 1.0x, and nothing at all on the
 *  other side. That is not a market, it is a receipt.
 *
 *  So each source is carried only as far as it actually persists:
 *    the MOOD re-rolls every 2 to 5 hours, so it is worth about 3.5 hours and
 *    nothing beyond, whatever the term
 *    the TREND runs out its own countdown, so it is worth the hours it has left
 *  and DRIFT_K is set so a full trend is roughly one sigma over a WEEK rather
 *  than thirteen. */
const DRIFT_K = 0.05, MAX_BIAS = 0.0125, TREND_MAX = 0.0018
/** Average life of a mood, in hours. update_fish_market rolls 2 + floor(rand*4). */
const MOOD_LIFE = 3.5

export function driftOver(
  vol: number, beta: number, trend: number, trendTicks: number,
  moodBias: number,
  /** HOURS STILL TO RUN, which is the term when pricing a new contract and the
   *  time LEFT when valuing a running one. Passing the full term to a contract
   *  with an hour to go charged it a whole term of drift against an hour of
   *  spread, so a bet on a trending index climbed toward certain on the clock
   *  alone, with the price never moving. */
  hours: number, dir: Direction,
): number {
  const halved = moodBias * 0.5
  const moodPerHour = vol * DRIFT_K * beta * (halved / MAX_BIAS)
  const trendPerHour = vol * DRIFT_K * (trend / TREND_MAX)
  const pct = (moodPerHour * Math.min(hours, MOOD_LIFE)
             + trendPerHour * Math.min(hours, Math.max(0, trendTicks))) * 100
  return dir === 'up' ? pct : -pct
}

// ── Saying it out loud ──────────────────────────────────────────────────────

/** "12% chance". A percentage, because next to a payout multiplier it is the
 *  number you can actually work with: 12% beside 8x is a comparison anyone can
 *  make, where "1 in 8" beside 8x makes you convert before you can think. */
export function chanceInWords(chance: number): string {
  if (chance <= 0) return 'no chance'
  if (chance >= 0.995) return 'near certain'
  if (chance >= 0.10) return `${Math.round(chance * 100)}% chance`
  // Below 10% a whole number throws away most of what is left: 3% and 3.4% are
  // a 13% difference in the payout.
  return `${(chance * 100).toFixed(1)}% chance`
}

/** "3.2x" for the small ones, "40x" once the decimal stops meaning anything. */
export function payoutInWords(multiplier: number): string {
  if (multiplier <= 0) return '-'
  if (multiplier < 10) return `${(Math.round(multiplier * 10) / 10).toFixed(1)}x`
  return `${Math.round(multiplier)}x`
}

/** What a stake actually comes back as, which is the number people care about
 *  more than any multiplier. */
export function payoutFor(stake: number, multiplier: number): number {
  return Math.max(0, Math.round(stake * multiplier))
}

/** A price, at whatever size it happens to be.
 *
 *  Prices are free to wander now, so this has to survive a Smack that has fallen
 *  99% as well as a Pod that has gone up tenfold. Fixed decimal places do not:
 *  at four decimals a 0.0024 stock moving 3% still reads 0.0024, and the chart
 *  moves while the number sits there insisting nothing happened.
 *
 *  So below 1 it keeps four SIGNIFICANT figures rather than four decimal places,
 *  and every price shows its movement however far it has fallen. Above 1, plain
 *  decimals, because that is what people expect of money. */
export function fmtPrice(p: number): string {
  if (!Number.isFinite(p) || p <= 0) return '-'
  if (p < 1) return Number(p.toPrecision(4)).toString()
  if (p < 1000) return p.toFixed(2)
  return p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** THE STAKE BAND, widened to let one quantity ladder serve every index.
 *
 *  Both ends used to be picked as round numbers a captain would recognise. They
 *  cannot be, now that the four quantities are fixed and the prices are not: the
 *  floor has to admit a single unit of the cheapest index, and the ceiling has to
 *  admit a thousand of the dearest, or the shared rungs stop being shared.
 *
 *  The floor is ONE doubloon, because a unit of a fallen index genuinely costs
 *  about that, and rounding it up to 500 would be inventing a price.
 *
 *  The ceiling is the real change: 250,000 to 2,000,000. It is not a licence to
 *  bet the economy -- MAX_PAYOUT still caps what any bet returns, so the long
 *  shots take far less than this and only the near-money bets reach it. But a
 *  captain CAN now put a million on a coin flip, and at fair odds that is a
 *  genuine coin flip. That is the trade for one honest quantity ladder. */
export const MIN_STAKE = 1
export const MAX_STAKE = 2_000_000

/** MOST A SINGLE BET CAN EVER RETURN.
 *
 *  A stake cap alone caps nothing. The longest odds the board offers are about
 *  199x, and 250,000 at 199x is 49.6 MILLION out of one lucky hour, against a
 *  richest-captain balance of about 3 million. One bet should not be able to end
 *  the economy.
 *
 *  Capped on the PAYOUT rather than the odds, which is what a real book does:
 *  the long shots stay on the board at their honest price, and the stake box
 *  simply says how much this particular one will take. */
export const MAX_PAYOUT = 5_000_000

/** ROUND NUMBERS OF UNITS, sized so the cost lands somewhere sensible.
 *
 *  You buy UNITS of an index and the cost is units x price, which is how a real
 *  ticket works and is the reason an expensive underlying costs more. But a
 *  board running from 0.09 to 1,420 cannot share one set of quantities: 25 units
 *  is 2 doubloons of Smack and 35,500 of Pod.
 *
 *  So the quantities are chosen per price to stay round AND land the cost in the
 *  range a captain actually bets. Nobody has to multiply anything to find a
 *  reasonable ticket; the four buttons already are ones. */
/** THE SAME FOUR, ON EVERY INDEX.
 *
 *  A hundred units is a hundred units wherever you are standing. Only the bill
 *  changes, which is the whole point of letting the indexes carry real prices.
 *
 *  This costs something and it is worth naming. The board runs from about 0.09
 *  to 1,500, so the same four quantities span roughly seventeen THOUSAND times
 *  in cost. A thousand units of the dearest index is over a million doubloons;
 *  a thousand of the cheapest is ninety. There is no set of four numbers that is
 *  meaty on both ends, because that is multiplication, not design. So the rungs
 *  stay fixed and the ones you cannot afford grey out -- rather than the board
 *  quietly showing different quantities per index and pretending they match. */
export const UNIT_PRESETS = [1, 10, 100, 1000] as const

export function unitPresets(_price?: number): number[] {
  return [...UNIT_PRESETS]
}

/** WHAT A CONTRACT COSTS: the PREMIUM, not the share.
 *
 *  This board used to charge the full index price per unit, which is buying the
 *  fish rather than betting on it. A contract is not the thing, it is the right
 *  to be paid if the thing moves, and it costs a fraction accordingly.
 *
 *  One contract pays the index price if it lands and nothing if it does not, so
 *  the fair premium is that price times the chance of landing. Payout over
 *  premium comes back to 1/chance, the same multiplier the board already quotes,
 *  so nothing about the odds changes -- only the size of the cheque, which falls
 *  by roughly the multiplier.
 *
 *  It also buys the shape a real chain has, which charging the share price
 *  destroyed: the far strikes are CHEAP. A near-money contract costs half the
 *  index, a long shot costs a fiftieth, and the ladder finally reads like a
 *  ladder instead of every rung costing the same. */
export function premiumOf(price: number, chance: number): number {
  if (!(price > 0) || !(chance > 0)) return 0
  return price * Math.min(chance, 0.99)
}

/** What a parcel of contracts costs, in doubloons. */
export function costOf(units: number, price: number, chance: number): number {
  return Math.max(0, Math.round(units * premiumOf(price, chance)))
}

/** The largest stake this bet will accept, given what it pays. */
export function stakeCapFor(multiplier: number): number {
  if (!(multiplier > 0)) return MAX_STAKE
  return Math.max(MIN_STAKE, Math.min(MAX_STAKE, Math.floor(MAX_PAYOUT / multiplier)))
}
