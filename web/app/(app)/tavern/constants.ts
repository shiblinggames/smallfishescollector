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
export const CASINO_DAILY_CAP = 5000   // doubloons committed to the casino per day
export const CASINO_BUY_IN_PRESETS = [100, 250, 500, 1000, 2500, 5000] as const
export const CASINO_BUY_IN_MIN = 10
export const CASINO_BUY_IN_MAX = CASINO_DAILY_CAP

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
export const RL_MAX_OUTSIDE_BET  = 2500                     // 1:1 / 2:1 outside bets — bigger ceiling, smaller payout
export const RL_BET_PRESETS = [10, 25, 50, 100, 250, 500] as const
