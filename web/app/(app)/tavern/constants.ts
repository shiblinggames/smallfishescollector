// Crown & Anchor constants (SYMBOLS, DAILY_CAP, MAX_BET, MIN_BET) were
// removed 2026-06-06 when C&A was retired in favor of Blackjack. The
// Blackjack equivalents (BJ_*) are defined below.

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export type SlotSymbolId = 'common' | 'rare' | 'legendary' | 'catfish' | 'anchor'

export const SLOT_SYMBOLS_LIST: {
  id: SlotSymbolId
  filename?: string
  color: string
  weight: number
  label: string
}[] = [
  { id: 'common',    filename: 'Sardine_v2.png',  color: '#8a8880', weight: 50, label: 'Sardine' },
  { id: 'rare',      filename: 'Blue_Marlin.png', color: '#60a5fa', weight: 25, label: 'Blue Marlin' },
  { id: 'legendary', filename: 'Blue_Whale_v2.png', color: '#a78bfa', weight: 10, label: 'Blue Whale' },
  { id: 'catfish',   filename: 'Catfish.png',      color: '#f0c040', weight: 3,  label: 'Catfish' },
  { id: 'anchor',                                   color: '#34d399', weight: 12, label: 'Hook' },
]

export const SLOT_PAYOUTS: Record<SlotSymbolId, number> = {
  common:    2,
  rare:      10,
  legendary: 50,
  catfish:   200,
  anchor:    0,
}

// 2-of-3 partial payouts (also used for hook wild)
export const SLOT_PARTIAL_PAYOUTS: Partial<Record<SlotSymbolId, number>> = {
  common:    0.5,  // lose half — still feels like something
  rare:      1.5,
  legendary: 3,
  catfish:   15,
}

export const SLOTS_MIN_BET   = 10
export const SLOTS_MAX_BET   = 500
export const SLOTS_DAILY_CAP = 5000

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
