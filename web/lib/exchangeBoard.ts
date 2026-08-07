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
export const TERMS = [1, 6, 24, 72, 168] as const
export type Term = typeof TERMS[number]

export const TERM_NAME: Record<Term, string> = {
  1: 'One hour',
  6: 'Six hours',
  24: 'One day',
  72: 'Three days',
  168: 'One week',
}

/** The one-line pitch for each length, in plain words. */
export const TERM_PITCH: Record<Term, string> = {
  1: 'Settles at the next price. Rarely pays, pays big.',
  6: 'An afternoon. Still a long shot.',
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
const RUNG_STEPS = [0.25, 0.4, 0.6, 0.85, 1.2, 1.6, 2.0, 2.5, 3.0] as const

/** The distances this index offers, in percent, smallest first. Rounded to
 *  something a person would say out loud: no 13.847%.
 *
 *  De-duplicated after rounding, because on a very calm index two steps can land
 *  on the same number and a board showing "+0.3%" twice at different odds is a
 *  bug that looks like a lie. */
export function rungsFor(dailyMovePct: number): number[] {
  const out = RUNG_STEPS.map(k => {
    const raw = dailyMovePct * k
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
export function priceBet(dailyMovePct: number, hours: Term, distancePct: number): Bet {
  const s = spreadOver(dailyMovePct, hours)
  if (!(s > 0) || !(distancePct > 0)) return { distancePct, chance: 0, multiplier: 0 }
  const chance = 1 - normCdf(distancePct / s)
  if (chance <= 0.00005) return { distancePct, chance: 0, multiplier: 0 }
  return { distancePct, chance, multiplier: 1 / chance }
}

/** Below this a rung is not offered at all. A one-in-fifty-thousand bet is not a
 *  long shot, it is a way to lose money you will never notice going. */
export const MIN_CHANCE = 0.005

export function offeredBets(dailyMovePct: number, hours: Term): Bet[] {
  return rungsFor(dailyMovePct)
    .map(d => priceBet(dailyMovePct, hours, d))
    .filter(b => b.chance >= MIN_CHANCE)
}

// ── Saying it out loud ──────────────────────────────────────────────────────

/** "about 1 in 3". Never a percentage: people read 12% as "unlikely" and 1 in 8
 *  as "I have a shot", and the second one is the honest feeling. */
export function chanceInWords(chance: number): string {
  if (chance <= 0) return 'no chance'
  if (chance >= 0.95) return 'near certain'
  const n = Math.round(1 / chance)
  if (n <= 1) return 'better than even'
  if (n === 2) return 'about a coin flip'
  return `about 1 in ${n >= 20 ? Math.round(n / 5) * 5 : n}`
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

export const MIN_STAKE = 500
export const MAX_STAKE = 250_000
