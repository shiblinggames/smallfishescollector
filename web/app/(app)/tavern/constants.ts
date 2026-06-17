// Crown & Anchor constants (SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET) were
// removed 2026-06-06 when C&A was retired in favor of Blackjack. The
// Blackjack equivalents (BJ_*) are defined below.

// ─── Fish Slots ───────────────────────────────────────────────────────────────
// 2026-06 redesign: variance reshape + global progressive jackpot.
// Design rules: no payout below 1× (a "win" that loses money is worse
// than a clean miss), 3 catfish pays a share of the global pot instead
// of a fixed multiplier, and a sardine pair is just a near-miss.
//
// Base-game RTP at these numbers ≈ 91.6%; the ~5% jackpot feed plus the
// seeded pot brings the total to ≈ 96.6%+. Verified with slots-rtp.mjs
// (repo root) — rerun it before changing ANY weight or payout here.
//
// 2026-06-10 small-population retune (second pass same day): with ~25
// active players the slots see only ~40–120 spins/day, so even
// 1-in-4,630 would take a month+ to pop. Catfish weight 6 → 14 puts the
// natural triple at 1-in-364 — the pot pops every ~3–7 days at current
// volume and is a community event instead of a myth. Compensation so
// RTP stays put: catfish pair 15× → 3× (it lands 1-in-20 now, a small
// frequent win rather than a mid-thrill), sardine triple 3× → 4× and
// marlin pair 1.5× → 2× give back what the sardine/hook weight cuts
// took.
//
// 2026-06-11 seed raise (5,000 → 15,000): the claim is linear in wager
// (pot × wager/500), so EVERY bet wins the same multiple — pot ÷ 500.
// At the old 5k floor that was a measly 10× and low-bet players saw
// "jackpot would pay 100 ⟡" on their 10 ⟡ spins — no enticement at
// all. The 15k floor makes every claim ≥ 30× the wager (10 ⟡ → 300+,
// max bet → the full 15k+) while keeping EV uniform across bet sizes
// (no min-bet farming gradient). Jackpot EV at floor rises ~2.7% →
// ~8.2% of wager, so total RTP sits around ~100% at the floor pot —
// deliberately player-positive for a 25-active community game; the
// house eats the seed top-up only after big-bet claims since partial
// claims leave the remainder in the pot.

export type SlotSymbolId = 'common' | 'rare' | 'legendary' | 'catfish' | 'anchor'

export const SLOT_SYMBOLS_LIST: {
  id: SlotSymbolId
  filename?: string
  color: string
  weight: number
  label: string
}[] = [
  { id: 'common',    filename: 'Sardine_v2.png',  color: '#8a8880', weight: 39, label: 'Sardine' },
  { id: 'rare',      filename: 'Blue_Marlin.png', color: '#60a5fa', weight: 20, label: 'Blue Marlin' },
  { id: 'legendary', filename: 'Blue_Whale_v2.png', color: '#a78bfa', weight: 9, label: 'Blue Whale' },
  { id: 'catfish',   filename: 'Catfish.png',      color: '#f0c040', weight: 14, label: 'Catfish' },
  { id: 'anchor',                                   color: '#34d399', weight: 18, label: 'Hook' },
]

// 3-of-a-kind. Catfish is 0 here because a natural catfish triple pays
// the global jackpot pot (proportional to wager), not a multiplier.
export const SLOT_PAYOUTS: Record<SlotSymbolId, number> = {
  common:    4,
  rare:      12,
  legendary: 60,
  catfish:   0,
  anchor:    0,
}

// Pair payouts: exactly 2 matching fish, third reel anything (a single
// hook included). Sardine pairs pay nothing — they read as a near-miss
// instead of the old 0.5× fake win.
export const SLOT_PAIR_PAYOUTS: Partial<Record<SlotSymbolId, number>> = {
  rare:      2,
  legendary: 5,
  catfish:   3,
}

export const SLOTS_MIN_BET   = 10
export const SLOTS_MAX_BET   = 500

// Global jackpot: every spin feeds the pot by this fraction of the
// wager; a natural 3-catfish spin wins pot × (wager / SLOTS_MAX_BET).
// Pot resets to its seed (15,000 ⟡, set in the slots_jackpot row;
// raised from 5,000 on 2026-06-11 — see the seed-raise note above)
// after a claim, so every jackpot pays at least ~30× the wager.
export const SLOTS_JACKPOT_FEED_PCT = 0.05

// ─── Shared casino wallet ────────────────────────────────────────────────────
// One chip purse across Blackjack / Roulette / Slots (profiles.casino_chips),
// one shared 5,000 ⟡/day buy-in cap (summed from casino_buy_ins), one
// buy-in surface. Chips churn freely between games without re-hitting
// the cap; cash-out converts everything back to doubloons and ends the
// session (per-game session nets reset). Per-game WAGER bands stay below.
export const CASINO_DAILY_CAP = 5000   // base doubloons/day; raised by puzzle points (denDailyCap)
export const CASINO_BUY_IN_PRESETS = [100, 250, 500, 1000, 2500, 5000] as const
export const CASINO_BUY_IN_MIN = 10

// Puzzle-points → Den daily buy-in cap. Cumulative points from solving
// The Quartermaster's Hold (Chart Room) permanently raise how many
// doubloons a player can commit to the Den per day. Steady curve: a
// regular solver tops out in ~4-5 weeks. The cap is the ONLY thing
// points buy — they're not spent. Tune the ladder here.
export const DEN_PURSE_TIERS = [
  { points: 0,  cap: 5000 },
  { points: 15, cap: 6000 },
  { points: 40, cap: 7500 },
  { points: 80, cap: 10000 },
] as const

/** Flat Den daily buy-in cap for NON-members — the puzzle-point ladder is a
 *  member perk, so non-members sit at a hard 2,000 ⟡/day regardless of points. */
export const DEN_CAP_NONMEMBER = 2000

/** The shared Den daily buy-in cap. Members climb the puzzle-point ladder
 *  (5k → 10k); non-members are capped flat at DEN_CAP_NONMEMBER. `isMember`
 *  defaults to true so the Chart Room's "puzzle points unlock this cap"
 *  feedback shows the member ladder (the cap is a member perk); the casino
 *  trio passes the player's real membership so the live limit is correct. */
export function denDailyCap(puzzlePoints: number, isMember: boolean = true): number {
  if (!isMember) return DEN_CAP_NONMEMBER
  let cap: number = DEN_PURSE_TIERS[0].cap
  for (const t of DEN_PURSE_TIERS) if ((puzzlePoints ?? 0) >= t.points) cap = t.cap
  return cap
}

/** The next tier a player is climbing toward, or null at the top. */
export function nextDenTier(puzzlePoints: number): { points: number; cap: number } | null {
  for (const t of DEN_PURSE_TIERS) if ((puzzlePoints ?? 0) < t.points) return { points: t.points, cap: t.cap }
  return null
}

// A single buy-in can be as large as the top tier's cap (high-tier
// players buy in big in one go); the per-call amount is still bounded by
// the player's effective cap + remaining at enforcement time.
export const CASINO_BUY_IN_MAX = DEN_PURSE_TIERS[DEN_PURSE_TIERS.length - 1].cap

// ─── Blackjack ───────────────────────────────────────────────────────────────
// Same wager band as Fish Slots so the tavern reads coherently. Wagers
// come out of the shared casino chip purse.
export const BJ_MIN_BET   = 10
export const BJ_MAX_BET   = 500    // per-hand wager ceiling
export const BJ_BET_PRESETS = [10, 25, 50, 100, 250, 500] as const

// ─── Fish Roulette ──────────────────────────────────────────────────────────
// European single-zero wheel — house edge 1/37 ≈ 2.703% across all bets.
export const RL_MIN_BET   = 10                              // per-bet floor
export const RL_MAX_STRAIGHT_BET = 500                      // 35:1 single number
export const RL_MAX_OUTSIDE_BET  = 500                      // 1:1 / 2:1 outside bets — same 500 cap as inside, matches blackjack
export const RL_BET_PRESETS = [10, 25, 50, 100, 250, 500] as const
