export const SYMBOLS = ['anchor', 'crown', 'heart', 'diamond', 'spade', 'club'] as const
export type Symbol = typeof SYMBOLS[number]

export const DAILY_CAP = 5000
export const MAX_BET   = 500
export const MIN_BET   = 10

// ─── Fish Slots ───────────────────────────────────────────────────────────────

export type SlotSymbolId = 'common' | 'rare' | 'legendary' | 'catfish' | 'anchor'

export const SLOT_SYMBOLS_LIST: {
  id: SlotSymbolId
  filename?: string
  color: string
  weight: number
  label: string
}[] = [
  { id: 'common',    filename: 'Sardine.png',     color: '#8a8880', weight: 50, label: 'Sardine' },
  { id: 'rare',      filename: 'Blue_Marlin.png', color: '#60a5fa', weight: 25, label: 'Blue Marlin' },
  { id: 'legendary', filename: 'Blue_Whale.png',  color: '#a78bfa', weight: 10, label: 'Blue Whale' },
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
