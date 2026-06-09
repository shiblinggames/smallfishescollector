// Fish Roulette game logic — pure functions, no IO. Imported by the
// server actions (which own state + persistence) and the client (for
// optimistic bet preview + UI lookups).
//
// Wheel: European single-zero (0-36). Single 'house' pocket = 0 = Abyss,
// the unfishable. House edge is uniformly 1/37 ≈ 2.703% on every bet.
//
// Numbers 1-36 are split three ways:
//   • Dozens   — 1-12 (shallows), 13-24 (open waters), 25-36 (deep)
//   • Columns  — visual 3x12 table layout, columns 1/2/3 = {1,4,7,...},
//                {2,5,8,...}, {3,6,9,...}
//   • Colors   — standard roulette red/black pattern, themed as TIDE
//                (red) and TRENCH (black). 0 = green/abyss, loses all
//                even-money bets.
//
// Each number 1-36 is canonically associated with a fish species (see
// FISH_BY_NUMBER) so the table reads as "bet on the Marlin" rather than
// "bet on 34". Mapping is curated per habitat dozen so the thematic
// hierarchy is real (shallows fish in the first dozen, deep fish in the
// third).

export type BetType =
  | 'straight'    // 1 number   — 35:1
  | 'split'       // 2 adjacent — 17:1
  | 'street'      // 3 in a row — 11:1
  | 'corner'      // 2x2 = 4    — 8:1
  | 'line'        // 6 in 2 rows — 5:1
  | 'dozen'       // 12 numbers — 2:1
  | 'column'      // 12 numbers — 2:1
  | 'color'       // 18 numbers — 1:1
  | 'parity'      // 18 numbers — 1:1
  | 'half'        // 18 numbers — 1:1

export type BetColor  = 'red' | 'black'
export type BetParity = 'even' | 'odd'
export type BetHalf   = 'low' | 'high'

/** Target serialization per bet type:
 *  - straight:           number 0-36 (the winning pocket)
 *  - split (2 adjacent): [a, b] sorted ascending
 *  - street (row of 3):  number 1-12 (street idx; covers {3i-2, 3i-1, 3i})
 *  - corner (2x2):       [a, b, c, d] sorted ascending
 *  - line (6 in 2 rows): number 1-11 (top street idx; covers streets i & i+1)
 *  - dozen / column:     1 | 2 | 3
 *  - color:              'red' | 'black'
 *  - parity:             'even' | 'odd'
 *  - half:               'low' | 'high' (low = 1-18, high = 19-36)
 *
 *  Splits / corners use sorted number arrays so equivalent bets stack
 *  (a chip on split [4,5] from a horizontal swipe and the same split
 *  from a vertical swipe key the same).
 */
export type BetTarget =
  | number
  | number[]
  | BetColor
  | BetParity
  | BetHalf

export interface Bet {
  type: BetType
  target: BetTarget
  amount: number
}

/** Payout multipliers — chips RETURNED on a winning bet (including
 *  stake). Standard European single-zero payouts: house edge is 1/37
 *  ≈ 2.703% on every line of this table by construction. */
export const PAYOUT_MULT: Record<BetType, number> = {
  straight: 36,   // 35:1
  split:    18,   // 17:1
  street:   12,   // 11:1
  corner:    9,   //  8:1
  line:      6,   //  5:1
  dozen:     3,   //  2:1
  column:    3,   //  2:1
  color:     2,   //  1:1
  parity:    2,   //  1:1
  half:      2,   //  1:1
}

// ── Helpers for inside bets ──────────────────────────────────────────

/** Resolve a street index (1-12) → the 3 numbers it covers. Street 1 =
 *  {1,2,3}; street 12 = {34,35,36}. Used by both the win-check and the
 *  client bet-zone labels. */
export function streetNumbers(idx: number): number[] {
  return [3 * idx - 2, 3 * idx - 1, 3 * idx]
}

/** Resolve a line index (1-11) → the 6 numbers across two adjacent
 *  streets. Line 1 = {1..6}; line 11 = {31..36}. */
export function lineNumbers(idx: number): number[] {
  return [...streetNumbers(idx), ...streetNumbers(idx + 1)]
}

/** Returns true if two numbers are adjacent on the standard roulette
 *  table grid (3-row × 12-column layout, 0 sits separately). Splits
 *  must connect adjacent cells either horizontally (same row, columns
 *  differ by 1 — i.e., numbers differ by 3) or vertically (same column,
 *  rows differ by 1 — numbers differ by 1 and not crossing a column
 *  boundary). 0 has no splits in this v1. */
export function isSplitAdjacent(a: number, b: number): boolean {
  if (a < 1 || b < 1 || a > 36 || b > 36 || a === b) return false
  const [lo, hi] = a < b ? [a, b] : [b, a]
  // Vertical (same column): differ by 1, AND the smaller is not a top-of-column
  // In my orientation, columns are {1,2,3}, {4,5,6}, ... → smaller % 3 != 0 means same column
  if (hi - lo === 1 && lo % 3 !== 0) return true
  // Horizontal (same row, adjacent columns): differ by 3
  if (hi - lo === 3) return true
  return false
}

/** Returns true if 4 numbers form a valid 2x2 corner on the table.
 *  Sorted ascending: [a, a+1, a+3, a+4] where a is the top-left number
 *  of the 2x2 (so a%3 != 0 to ensure the block stays within one
 *  column-pair, and a+4 <= 36). */
export function isValidCorner(nums: number[]): boolean {
  if (nums.length !== 4) return false
  const [a, b, c, d] = [...nums].sort((x, y) => x - y)
  if (a < 1 || d > 36) return false
  if (a % 3 === 0) return false   // would cross a column boundary
  return b === a + 1 && c === a + 3 && d === a + 4
}

/** Standard roulette red pocket set (European wheel). Black is the
 *  complement among 1-36; 0 is green/abyss and loses all color bets. */
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])

export function colorOf(n: number): BetColor | 'green' {
  if (n === 0) return 'green'
  return RED_NUMBERS.has(n) ? 'red' : 'black'
}

export function dozenOf(n: number): 1 | 2 | 3 | null {
  if (n === 0) return null
  if (n <= 12) return 1
  if (n <= 24) return 2
  return 3
}

export function columnOf(n: number): 1 | 2 | 3 | null {
  if (n === 0) return null
  // Standard roulette layout — column 1 contains 1,4,7,...,34;
  // column 2 = 2,5,8,...,35; column 3 = 3,6,9,...,36.
  const mod = n % 3
  if (mod === 1) return 1
  if (mod === 2) return 2
  return 3
}

export function parityOf(n: number): BetParity | null {
  if (n === 0) return null
  return n % 2 === 0 ? 'even' : 'odd'
}

export function halfOf(n: number): BetHalf | null {
  if (n === 0) return null
  return n <= 18 ? 'low' : 'high'
}

/** Does this bet win on `winningNumber`? Returns true only when the
 *  winning pocket matches the target. 0 loses every inside / outside
 *  multi-number bet — it's only payable on a straight bet on 0. */
export function isWinner(bet: Bet, winningNumber: number): boolean {
  switch (bet.type) {
    case 'straight': return bet.target === winningNumber
    case 'split':
      return Array.isArray(bet.target) && bet.target.includes(winningNumber)
    case 'street':
      return typeof bet.target === 'number' && streetNumbers(bet.target).includes(winningNumber)
    case 'corner':
      return Array.isArray(bet.target) && bet.target.includes(winningNumber)
    case 'line':
      return typeof bet.target === 'number' && lineNumbers(bet.target).includes(winningNumber)
    case 'dozen':    return bet.target === dozenOf(winningNumber)
    case 'column':   return bet.target === columnOf(winningNumber)
    case 'color':    return bet.target === colorOf(winningNumber)
    case 'parity':   return bet.target === parityOf(winningNumber)
    case 'half':     return bet.target === halfOf(winningNumber)
  }
}

/** Compute the chips returned for one bet on a given spin. Returns the
 *  FULL payout (stake + profit), not just profit — losing bets return
 *  0, winning bets return amount * PAYOUT_MULT[type]. */
export function payoutFor(bet: Bet, winningNumber: number): number {
  return isWinner(bet, winningNumber) ? bet.amount * PAYOUT_MULT[bet.type] : 0
}

export interface SpinSettlement {
  winningNumber: number
  totalWagered: number     // sum of bet.amount across all bets
  totalPayout: number      // sum of payouts (stake-included) for winning bets
  net: number              // totalPayout - totalWagered
  perBet: { bet: Bet; payout: number; won: boolean }[]
}

/** Settle a set of bets against a winning number. Pure function — caller
 *  is responsible for picking `winningNumber` (server-authoritative
 *  RNG) and applying the resulting `net` to the player's chip balance. */
export function settleSpin(bets: Bet[], winningNumber: number): SpinSettlement {
  let totalWagered = 0
  let totalPayout = 0
  const perBet = bets.map(bet => {
    const payout = payoutFor(bet, winningNumber)
    totalWagered += bet.amount
    totalPayout  += payout
    return { bet, payout, won: payout > 0 }
  })
  return { winningNumber, totalWagered, totalPayout, net: totalPayout - totalWagered, perBet }
}

/** Pick a random pocket 0-36 with uniform distribution. Server-only —
 *  Math.random is fine for a tavern minigame; the daily wager cap is
 *  the real economic guardrail. */
export function rollWinningNumber(): number {
  return Math.floor(Math.random() * 37)
}

// ── Fish-to-number canonical mapping ──────────────────────────────────
//
// One species per pocket 1-36, organized so the dozens are habitat-
// themed: first dozen (1-12) = shallows, second (13-24) = open waters,
// third (25-36) = deep. The Abyss pocket (0) is the house pocket and
// has no playable species — themed as "The One That Got Away".
//
// IDs match fish_species.id so the UI can pull artwork from the
// existing fish-sprite pipeline without a duplicate lookup table.

export interface RoulettePocket {
  number: number
  /** fish_species.id for 1-36 pockets; null for the Abyss (0). */
  fishId: number | null
  /** Display name — fish species name for 1-36, label for 0. */
  name: string
  /** Wheel/table color. 'green' for 0, otherwise standard roulette
   *  red/black alternation. */
  color: BetColor | 'green'
}

export const POCKETS: readonly RoulettePocket[] = [
  { number: 0,  fishId: null, name: 'The Abyss',           color: 'green' },
  // ── 1-12: Shallows
  { number: 1,  fishId: 1,    name: 'Bluegill',            color: colorOf(1)  as BetColor },
  { number: 2,  fishId: 2,    name: 'Common Carp',         color: colorOf(2)  as BetColor },
  { number: 3,  fishId: 3,    name: 'Yellow Perch',        color: colorOf(3)  as BetColor },
  { number: 4,  fishId: 69,   name: 'Needlefish',          color: colorOf(4)  as BetColor },
  { number: 5,  fishId: 4,    name: 'Pumpkinseed',         color: colorOf(5)  as BetColor },
  { number: 6,  fishId: 5,    name: 'Channel Catfish',     color: colorOf(6)  as BetColor },
  { number: 7,  fishId: 6,    name: 'Crappie',             color: colorOf(7)  as BetColor },
  { number: 8,  fishId: 7,    name: 'Rainbow Trout',       color: colorOf(8)  as BetColor },
  { number: 9,  fishId: 8,    name: 'Largemouth Bass',     color: colorOf(9)  as BetColor },
  { number: 10, fishId: 9,    name: 'Smallmouth Bass',     color: colorOf(10) as BetColor },
  { number: 11, fishId: 10,   name: 'Brown Trout',         color: colorOf(11) as BetColor },
  { number: 12, fishId: 11,   name: 'Northern Pike',       color: colorOf(12) as BetColor },
  // ── 13-24: Open Waters
  { number: 13, fishId: 98,   name: 'European Anchovy',    color: colorOf(13) as BetColor },
  { number: 14, fishId: 99,   name: 'Pacific Sardine',     color: colorOf(14) as BetColor },
  { number: 15, fishId: 14,   name: 'Atlantic Herring',    color: colorOf(15) as BetColor },
  { number: 16, fishId: 13,   name: 'Atlantic Mackerel',   color: colorOf(16) as BetColor },
  { number: 17, fishId: 15,   name: 'Skipjack Tuna',       color: colorOf(17) as BetColor },
  { number: 18, fishId: 106,  name: 'Spanish Mackerel',    color: colorOf(18) as BetColor },
  { number: 19, fishId: 17,   name: 'Bluefish',            color: colorOf(19) as BetColor },
  { number: 20, fishId: 16,   name: 'Bonito',              color: colorOf(20) as BetColor },
  { number: 21, fishId: 18,   name: 'Striped Bass',        color: colorOf(21) as BetColor },
  { number: 22, fishId: 25,   name: 'Mahi-mahi',           color: colorOf(22) as BetColor },
  { number: 23, fishId: 22,   name: 'Wahoo',               color: colorOf(23) as BetColor },
  { number: 24, fishId: 24,   name: 'Barracuda',           color: colorOf(24) as BetColor },
  // ── 25-36: Deep
  { number: 25, fishId: 51,   name: 'Lanternfish',         color: colorOf(25) as BetColor },
  { number: 26, fishId: 52,   name: 'Hatchetfish',         color: colorOf(26) as BetColor },
  { number: 27, fishId: 30,   name: 'Red Snapper',         color: colorOf(27) as BetColor },
  { number: 28, fishId: 27,   name: 'Atlantic Cod',        color: colorOf(28) as BetColor },
  { number: 29, fishId: 29,   name: 'Sea Bass',            color: colorOf(29) as BetColor },
  { number: 30, fishId: 31,   name: 'Moray Eel',           color: colorOf(30) as BetColor },
  { number: 31, fishId: 33,   name: 'Grouper',             color: colorOf(31) as BetColor },
  { number: 32, fishId: 39,   name: 'Mako Shark',          color: colorOf(32) as BetColor },
  { number: 33, fishId: 40,   name: 'Swordfish',           color: colorOf(33) as BetColor },
  { number: 34, fishId: 38,   name: 'Blue Marlin',         color: colorOf(34) as BetColor },
  { number: 35, fishId: 68,   name: 'Giant Squid',         color: colorOf(35) as BetColor },
  { number: 36, fishId: 61,   name: 'Megamouth Shark',     color: colorOf(36) as BetColor },
] as const

export function getPocket(n: number): RoulettePocket | undefined {
  return POCKETS[n]
}

// ── Validation helpers (used by server actions) ──────────────────────

/** Validate a single bet. Returns null on success, an error string on
 *  failure. Used by the server action to reject malformed client input
 *  before debiting chips. Inside-bet adjacency / shape checks live here
 *  too so the server is the source of truth even if the client lets a
 *  bad bet through. */
export function validateBet(bet: Bet, minBet: number, maxBet: number): string | null {
  if (!Number.isInteger(bet.amount) || bet.amount < minBet || bet.amount > maxBet) {
    return `Each bet must be ${minBet}–${maxBet} chips`
  }
  switch (bet.type) {
    case 'straight':
      if (typeof bet.target !== 'number' || !Number.isInteger(bet.target) || bet.target < 0 || bet.target > 36) {
        return 'Invalid number'
      }
      return null
    case 'split': {
      if (!Array.isArray(bet.target) || bet.target.length !== 2) return 'Invalid split'
      const [a, b] = bet.target
      if (!isSplitAdjacent(a, b)) return 'Numbers not adjacent for split'
      return null
    }
    case 'street':
      if (typeof bet.target !== 'number' || !Number.isInteger(bet.target) || bet.target < 1 || bet.target > 12) {
        return 'Invalid street'
      }
      return null
    case 'corner':
      if (!Array.isArray(bet.target) || !isValidCorner(bet.target)) return 'Invalid corner'
      return null
    case 'line':
      if (typeof bet.target !== 'number' || !Number.isInteger(bet.target) || bet.target < 1 || bet.target > 11) {
        return 'Invalid line'
      }
      return null
    case 'dozen':
    case 'column':
      if (bet.target !== 1 && bet.target !== 2 && bet.target !== 3) return 'Invalid group'
      return null
    case 'color':
      if (bet.target !== 'red' && bet.target !== 'black') return 'Invalid color'
      return null
    case 'parity':
      if (bet.target !== 'even' && bet.target !== 'odd') return 'Invalid parity'
      return null
    case 'half':
      if (bet.target !== 'low' && bet.target !== 'high') return 'Invalid half'
      return null
    default:
      return 'Unknown bet type'
  }
}
