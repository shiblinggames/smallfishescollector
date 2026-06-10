// Crown & Anchor constants (SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET) were
// removed 2026-06-06 when C&A was retired in favor of Blackjack. The
// Blackjack equivalents (BJ_*) are defined below.

// ─── Fish Slots ───────────────────────────────────────────────────────────────
// 2026-06 redesign: variance reshape + global progressive jackpot.
// Design rules: no payout below 1× (a "win" that loses money is worse
// than a clean miss), 3 catfish pays a share of the global pot instead
// of a fixed multiplier, and a sardine pair is just a near-miss.
//
// Base-game RTP at these numbers ≈ 92%; the ~5% jackpot feed plus the
// seeded pot brings the total to ≈ 97% — slightly under the old table
// in base pay but with real variance: 1-in-11 spins hit a sardine
// triple (3×), catfish PAIRS pay 15× about 1-in-99, and the natural
// catfish triple (1-in-4,630) takes the pot.
//
// 2026-06-10 retune: catfish weight 4 → 6 (jackpot was 1-in-15,625 and
// never popped at current population; now hits 3.4× more often, pots
// pop smaller but regularly). Pair payout 25× → 15× to compensate —
// the more-common pair would have added ~14pp of RTP otherwise.

export type SlotSymbolId = 'common' | 'rare' | 'legendary' | 'catfish' | 'anchor'

export const SLOT_SYMBOLS_LIST: {
  id: SlotSymbolId
  filename?: string
  color: string
  weight: number
  label: string
}[] = [
  { id: 'common',    filename: 'Sardine_v2.png',  color: '#8a8880', weight: 45, label: 'Sardine' },
  { id: 'rare',      filename: 'Blue_Marlin.png', color: '#60a5fa', weight: 20, label: 'Blue Marlin' },
  { id: 'legendary', filename: 'Blue_Whale_v2.png', color: '#a78bfa', weight: 9, label: 'Blue Whale' },
  { id: 'catfish',   filename: 'Catfish.png',      color: '#f0c040', weight: 6,  label: 'Catfish' },
  { id: 'anchor',                                   color: '#34d399', weight: 20, label: 'Hook' },
]

// 3-of-a-kind. Catfish is 0 here because a natural catfish triple pays
// the global jackpot pot (proportional to wager), not a multiplier.
export const SLOT_PAYOUTS: Record<SlotSymbolId, number> = {
  common:    3,
  rare:      12,
  legendary: 60,
  catfish:   0,
  anchor:    0,
}

// Pair payouts: exactly 2 matching fish, third reel anything (a single
// hook included). Sardine pairs pay nothing — they read as a near-miss
// instead of the old 0.5× fake win.
export const SLOT_PAIR_PAYOUTS: Partial<Record<SlotSymbolId, number>> = {
  rare:      1.5,
  legendary: 5,
  catfish:   15,
}

export const SLOTS_MIN_BET   = 10
export const SLOTS_MAX_BET   = 500
export const SLOTS_DAILY_CAP = 5000

// Global jackpot: every spin feeds the pot by this fraction of the
// wager; a natural 3-catfish spin wins pot × (wager / SLOTS_MAX_BET).
// Pot resets to its seed (5,000 ⟡, set in the slots_jackpot row) after
// a claim, so it never looks empty.
export const SLOTS_JACKPOT_FEED_PCT = 0.05

// ─── Blackjack ───────────────────────────────────────────────────────────────
// Same wager band as C&A + Fish Slots so the tavern reads coherently.
// The daily cap is enforced server-side as the sum of `total_wagered`
// rows from blackjack_hands (initial wager + any doubles + splits +
// insurance) for that day, NOT just the initial deal — so the cap
// genuinely bounds the player's day at risk.
export const BJ_MIN_BET   = 10
export const BJ_MAX_BET   = 500    // per-hand wager ceiling
export const BJ_DAILY_CAP = 5000   // also serves as the per-buy-in ceiling
export const BJ_BET_PRESETS = [10, 25, 50, 100, 250, 500] as const
// Buy-in is a budget commitment (chips on the table that can churn freely
// without re-hitting the daily cap), so it scales up to the full 5,000
// cap in one go. Lets a player fund a longer session without having to
// step out for repeat buy-ins between hands.
export const BJ_BUY_IN_PRESETS = [100, 250, 500, 1000, 2500, 5000] as const
export const BJ_BUY_IN_MIN = 10
export const BJ_BUY_IN_MAX = BJ_DAILY_CAP

// ─── Fish Roulette ──────────────────────────────────────────────────────────
// European single-zero wheel — house edge 1/37 ≈ 2.703% across all bets.
// Same wager band as the rest of the tavern so the lineup reads
// coherently; daily cap caps doubloons committed to the table per day,
// not chip-level wagers (chips can churn freely between buy-ins).
export const RL_MIN_BET   = 10                              // per-bet floor
export const RL_MAX_STRAIGHT_BET = 500                      // 35:1 single number
export const RL_MAX_OUTSIDE_BET  = 2500                     // 1:1 / 2:1 outside bets — bigger ceiling, smaller payout
export const RL_DAILY_CAP = 5000                            // doubloons committed to table per day
export const RL_BET_PRESETS = [10, 25, 50, 100, 250, 500] as const
export const RL_BUY_IN_PRESETS = [100, 250, 500, 1000, 2500, 5000] as const
export const RL_BUY_IN_MIN = 10
export const RL_BUY_IN_MAX = RL_DAILY_CAP
