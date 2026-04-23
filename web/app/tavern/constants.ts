export const SYMBOLS = ['anchor', 'crown', 'heart', 'diamond', 'spade', 'club'] as const
export type Symbol = typeof SYMBOLS[number]

export const DAILY_CAP = 500
export const MAX_BET   = 200
export const MIN_BET   = 10
