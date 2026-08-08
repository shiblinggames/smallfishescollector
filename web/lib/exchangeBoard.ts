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
export function spreadOver(dailyMovePct: number, hours: number): number {
  return dailyMovePct * Math.sqrt(hours / 24)
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
/** HOW HARD THIS ONE GAPS, sized to what it is.
 *
 *  Every index used to gap 10 to 35% whatever it was, and that broke the calm
 *  end of the board. The Coral Reef travels 1.29% on a normal day and its whole
 *  strike ladder stops at +4%, so one gap cleared every rung at once and the
 *  chain came out flat: a 3-sigma strike costing 44% of the at-the-money one.
 *  It is wrong the same way in life. A broad index gaps 3 to 7% on real news; a
 *  single company gaps 10 to 35%.
 *
 *  So a gap is a multiple of the index's OWN day, floored so a very calm water
 *  can still make news and capped so the wildest creature does not vanish in an
 *  hour. Keep in lockstep with update_exchange_indexes. */
export function jumpRange(dailyMovePct: number): { min: number; max: number } {
  const min = Math.max(3, Math.min(15, 2 * dailyMovePct))
  const max = Math.max(8, Math.min(40, 5 * dailyMovePct))
  return { min, max: Math.max(max, min + 1) }
}

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
function jumpPoints(dailyMovePct: number): { up: number; down: number }[] {
  const { min, max } = jumpRange(dailyMovePct)
  return [0, 1, 2, 3].map(i => {
    const m = min + (max - min) * ((i + 0.5) / 4)
    return { up: logPct(m), down: logPct(-m) }
  })
}

/** A SCHEDULED REPORT IS NOT THE SAME EVENT as a surprise, and it took a
 *  player asking to see it.
 *
 *  A surprise only exists because something happened, so it is large by
 *  construction: news that moves nothing is not news and nobody files it. A
 *  report lands on the calendar whether or not there is anything to say, so it
 *  has to be free to be a damp squib. Real earnings do this constantly.
 *
 *  Same ceiling, no floor: a report is uniform from nothing up to the index's
 *  full gap, so most are ordinary, some are heavy, and one in a while the beds
 *  are exactly as full as everyone expected. */
function reportPoints(dailyMovePct: number): { up: number; down: number }[] {
  const { max } = jumpRange(dailyMovePct)
  return [0, 1, 2, 3].map(i => {
    const m = max * ((i + 0.5) / 4)
    return { up: logPct(m), down: logPct(-m) }
  })
}

/** Average `base` over every way this many gaps could land.
 *
 *  Up to two gaps it enumerates: each is BIMODAL, so a normal smears it across
 *  a middle it never occupies. Beyond two, the sum is close enough to normal to
 *  say so, and rare enough that the difference is noise. */
function overJumps(
  sets: { up: number; down: number }[][],
  base: (shiftPct: number, extraVarPct2: number) => number,
): number {
  if (sets.length === 0) return base(0, 0)
  if (sets.length <= 2) {
    const shifts = sets.reduce<number[]>(
      (acc, pts) => acc.flatMap(a => pts.flatMap(j => [a + j.up, a + j.down])), [0])
    return shifts.reduce((t, sh) => t + base(sh, 0), 0) / shifts.length
  }
  let mean = 0, variance = 0
  for (const pts of sets) {
    const m = pts.reduce((a, j) => a + (j.up + j.down) / 2, 0) / pts.length
    const sq = pts.reduce((a, j) => a + (j.up ** 2 + j.down ** 2) / 2, 0) / pts.length
    mean += m; variance += Math.max(0, sq - m * m)
  }
  return base(mean, variance)
}

/** The gap sets in play over a term: one per scheduled report, plus `k`
 *  surprises. They are different distributions and must not be pooled. */
function jumpSets(dailyMovePct: number, scheduled: number, surprises: number) {
  const rp = reportPoints(dailyMovePct)
  const sp = jumpPoints(dailyMovePct)
  return [...Array(Math.max(0, scheduled)).fill(rp), ...Array(Math.max(0, surprises)).fill(sp)]
}
/** Mean and variance of ONE gap in log space, for the two-or-more case where a
 *  normal is fine. The mean is NOT zero: a gap is symmetric in price, but
 *  ln(1-j) is further from zero than ln(1+j), so the pair leans down. */
function jumpMoments(points: { up: number; down: number }[]) {
  const mean = points.reduce((a, j) => a + (j.up + j.down) / 2, 0) / points.length
  const sq = points.reduce((a, j) => a + (j.up ** 2 + j.down ** 2) / 2, 0) / points.length
  return { mean, variance: Math.max(0, sq - mean * mean) }
}



// ── What a contract is worth ────────────────────────────────────────────────
//
// A VANILLA PAYOFF, not all or nothing. One contract is one unit of the index:
// at expiry a call pays max(price - strike, 0) doubloons and a put pays
// max(strike - price, 0). Prices are already in doubloons, so the price IS the
// payoff scale and there is no contract multiplier to invent.
//
// The premium is the EXPECTED payoff, which keeps the same zero-edge promise
// the binary board made: what you pay is what the contract is worth on average.

/** Black-Scholes with no interest, in log space, given the mean and spread of
 *  the log move. Puts are computed on their own terms rather than by flipping a
 *  sign: the two are not mirrors once the distribution is lognormal. */
function payoffValue(price: number, strike: number, m: number, s: number, dir: Direction): number {
  const fwd = price * Math.exp(m + (s * s) / 2)
  if (!(s > 0)) {
    const settled = price * Math.exp(m)
    return Math.max(0, dir === 'up' ? settled - strike : strike - settled)
  }
  const d2 = (Math.log(price / strike) + m) / s
  const d1 = d2 + s
  return dir === 'up'
    ? fwd * normCdf(d1) - strike * normCdf(d2)
    : strike * normCdf(-d2) - fwd * normCdf(-d1)
}

/** WHAT ONE CONTRACT IS WORTH, in doubloons.
 *
 *  Same Poisson mixture the binary board priced with, carrying a VALUE instead
 *  of a probability: almost always no gap, sometimes one, rarely more. The
 *  single-gap term is quadrature because one jump is bimodal and a normal
 *  smears it across the middle where it never lands. */
export function contractValue(
  price: number, strike: number, dir: Direction,
  hours: number, dailyMovePct: number,
  /** The index's OWN drift over these hours, in percent, positive meaning up.
   *  Not signed to the player's side: a put and a call on the same index face
   *  the same weather. */
  driftPct = 0,
  scheduled = 0,
): number {
  if (!(price > 0) || !(strike > 0) || !(hours > 0)) return 0
  const s = spreadOver(dailyMovePct, hours) / 100
  const m = driftPct / 100
  const lam = JUMP_P * hours
  const p0 = Math.exp(-lam)
  const p1 = lam * Math.exp(-lam)
  const p2 = Math.max(0, 1 - p0 - p1)

  const withSurprises = (k: number): number =>
    overJumps(jumpSets(dailyMovePct, scheduled, k),
      (shift, extraVar) => payoffValue(price, strike, m + shift / 100,
        Math.sqrt(s * s + extraVar / 10_000), dir))

  return Math.max(0, p0 * withSurprises(0) + p1 * withSurprises(1) + p2 * withSurprises(2))
}

/** CHANCE THE POSITION ENDS IN PROFIT, which is not the chance it ends in the
 *  money. A vanilla contract can finish past its strike and still be down, all
 *  the way up to one premium beyond it, so the honest number to quote is the
 *  chance of clearing BREAKEVEN rather than the strike.
 *
 *  Same Poisson mixture as the premium, carrying a probability again. */
export function profitChance(
  price: number, breakEven: number, dir: Direction,
  hours: number, dailyMovePct: number, driftPct = 0, scheduled = 0,
): number {
  if (!(price > 0) || !(breakEven > 0) || !(hours > 0)) return 0
  const s = spreadOver(dailyMovePct, hours) / 100
  const m = driftPct / 100
  const need = Math.log(breakEven / price)
  const lam = JUMP_P * hours
  const p0 = Math.exp(-lam)
  const p1 = lam * Math.exp(-lam)
  const p2 = Math.max(0, 1 - p0 - p1)

  const tail = (mu: number, sd: number): number => {
    if (!(sd > 0)) return (dir === 'up' ? mu >= need : mu <= need) ? 1 : 0
    const z = (need - mu) / sd
    return dir === 'up' ? 1 - normCdf(z) : normCdf(z)
  }
  const withSurprises = (k: number): number =>
    overJumps(jumpSets(dailyMovePct, scheduled, k),
      (shift, extraVar) => tail(m + shift / 100, Math.sqrt(s * s + extraVar / 10_000)))
  const p = p0 * withSurprises(0) + p1 * withSurprises(1) + p2 * withSurprises(2)
  return Math.max(0, Math.min(1, p))
}

/** The price that has to be reached before the contract has paid for itself.
 *  Unlike the binary's, this one is fixed the moment you buy: the payoff grows
 *  a doubloon per doubloon past the strike, so the premium is recovered exactly
 *  one premium beyond it. */
export function breakEvenFor(strike: number, premiumEach: number, dir: Direction): number {
  return dir === 'up' ? strike + premiumEach : strike - premiumEach
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


/** MOST OF ONE INDEX A CAPTAIN CAN HOLD, as contracts times price.
 *
 *  A vanilla payoff has no ceiling to cap, and capping it would break the fair
 *  premium, since a price is only fair for the payoff it actually buys. So the
 *  bound moves to the SIZE of the position, which is how a real position limit
 *  works: what it can pay is then whatever the market does, and fair pricing
 *  means the house does not lose on average however far that goes. */
export const MAX_NOTIONAL = 5_000_000

/** WHAT ONE CONTRACT COVERS, in index units.
 *
 *  A real option is written on a hundred shares, and not out of tradition: it is
 *  what stops a contract on a two-dollar stock costing two cents. This board had
 *  exactly that problem. One contract covered one unit, so the largest position
 *  the ladder allowed on the Flatfish was 436 doubloons, which is not a trade to
 *  anyone who reached Fishing 100 to get in here.
 *
 *  SQUARE ROOT, NOT FLAT. Sizing every contract to the same notional fixed the
 *  penny problem and broke something else: it made a Pod contract cost the same
 *  as a Flatfish one, and a board where the grandest water and the cheapest cost
 *  alike has thrown away the reason to have different prices at all. Damping by
 *  the root keeps the order intact while pulling the extremes in. Pod stays far
 *  and away the dearest thing on the board, the Flatfish stops being loose
 *  change, and the ladder between them still climbs. */
const LOT_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
export function lotSize(price: number): number {
  if (!(price > 0)) return 1
  const want = 60 / Math.sqrt(price)
  if (want <= 1) return 1
  let best = LOT_STEPS[0]
  for (const n of LOT_STEPS) if (Math.abs(n - want) < Math.abs(best - want)) best = n
  return best
}

/** THE THINNEST CONTRACT WORTH LISTING, as a fraction of the index price.
 *
 *  A scaling payoff makes deep strikes genuinely cheap, which is the point, but
 *  it keeps going: far enough out the premium rounds to nothing and the rung
 *  becomes a free lottery ticket that also PRINTS as 0.00, which reads as a
 *  broken row rather than a long shot. Strikes below this are simply not
 *  offered, the way a real chain stops quoting once the bid is dust.
 *
 *  SET LOW ON PURPOSE. It was ten times this while every index gapped 10 to 35%,
 *  and once gaps were sized per index it started eating the far strikes it was
 *  meant to protect: the Reef lost +2%, +3% and +4%, which is precisely the
 *  cheap end that makes a chain worth reading. A far strike being cheap is the
 *  feature. This only stops one being free. */
export const MIN_PREMIUM_FRACTION = 0.0002

/** Every strike this index offers at this term, priced. Sorted near to far, and
 *  cut where the premium stops being worth quoting. */
export function chainFor(
  price: number, dir: Direction, hours: number, dailyMovePct: number,
  driftPct = 0, scheduled = 0,
): { distancePct: number; strike: number; each: number }[] {
  const floor = price * MIN_PREMIUM_FRACTION
  return rungsFor(dailyMovePct)
    .map(d => {
      const strike = price * (1 + (dir === 'up' ? 1 : -1) * d / 100)
      return { distancePct: d, strike, each: contractValue(price, strike, dir, hours, dailyMovePct, driftPct, scheduled) }
    })
    .filter(b => b.strike > 0 && b.each >= floor)
}

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
//  RESCALED WHEN PREMIUMS ARRIVED. Charging the premium instead of the share
//  price made every ticket cheaper by roughly its multiplier, and this ladder
//  did not move with it: a thousand of a cheap index went from 85,000 doubloons
//  to 16,540, so the top rung lost most of its reach and captains sat pinned
//  against it on every position. Ten to ten thousand puts that back. The bottom
//  is still affordable precisely because premiums are fractions: ten contracts
//  of the dearest index is about 8,000, where one SHARE of it was 1,500.
export const UNIT_PRESETS = [10, 100, 1000, 10_000] as const

export function unitPresets(_price?: number): number[] {
  return [...UNIT_PRESETS]
}



