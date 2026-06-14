// The Quartermaster's Hold — shared constants + types for the daily
// sudoku in The Chart Room. Plain module (NOT 'use server') so sync
// helpers and types survive the build; server actions import from here.
//
// Theme: a 9x9 cargo hold split into nine 3x3 bays. Pack it so no deck
// (row), hull section (column), or bay carries two of the same cargo lot
// (1-9). Classic sudoku rules under a manifest skin.

export const HOLD_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type HoldDifficulty = (typeof HOLD_DIFFICULTIES)[number]

export interface HoldDifficultyMeta {
  key: HoldDifficulty
  label: string
  /** Roughly how many cells start filled (givens). Fewer = harder. */
  givens: number
  /** Base doubloons for the first solve of the day. */
  payout: number
  /** Puzzle points banked on solve (harder = more). Points are permanent
   *  and accumulate toward the Den purse tiers (see tavern denDailyCap). */
  points: number
  accent: string
}

// Clue counts give three honestly distinct solves; all are generated
// with a guaranteed-unique solution so they're always fair. Payouts
// climb with difficulty; a clean sweep of all three banks ~435 ⟡,
// in the same neighborhood as the Parlor board's 300/day.
export const HOLD_META: Record<HoldDifficulty, HoldDifficultyMeta> = {
  easy:   { key: 'easy',   label: 'Skiff',       givens: 40, payout: 40,  points: 1, accent: '#34d399' },
  medium: { key: 'medium', label: 'Galleon',     givens: 32, payout: 90,  points: 2, accent: '#60a5fa' },
  hard:   { key: 'hard',   label: 'Dreadnought', givens: 28, payout: 160, points: 4, accent: '#f0743a' },
}

/** Bonus for solving a hold with no tally (check/hint) used, as a
 *  fraction of the base payout. Rounded to a whole doubloon. */
export const CLEAN_BONUS_FRACTION = 0.5

/** Extra puzzle point for a clean (no-tally) solve. */
export const CLEAN_POINT_BONUS = 1

export function cleanBonus(difficulty: HoldDifficulty): number {
  return Math.round(HOLD_META[difficulty].payout * CLEAN_BONUS_FRACTION)
}

/** Total a clean solve pays (base + clean bonus). */
export function holdPayout(difficulty: HoldDifficulty, clean: boolean): number {
  return HOLD_META[difficulty].payout + (clean ? cleanBonus(difficulty) : 0)
}

/** Puzzle points a solve banks (base + clean bonus point). */
export function holdPoints(difficulty: HoldDifficulty, clean: boolean): number {
  return HOLD_META[difficulty].points + (clean ? CLEAN_POINT_BONUS : 0)
}

// ── Board encoding ──────────────────────────────────────────────────
// Boards are 81-char strings, row-major. '.' = empty cell, '1'-'9' = a
// placed cargo lot. The SOLUTION string is server-only and never sent
// to the client; the client only ever receives `givens`.

export const HOLD_CELLS = 81
export const HOLD_SIZE = 9
export const HOLD_BOX = 3

export function isHoldDifficulty(v: unknown): v is HoldDifficulty {
  return typeof v === 'string' && (HOLD_DIFFICULTIES as readonly string[]).includes(v)
}

/** A valid in-progress / submitted board: 81 chars of '.' or '1'-'9'. */
export function isValidBoardString(s: unknown): s is string {
  return typeof s === 'string' && s.length === HOLD_CELLS && /^[.1-9]+$/.test(s)
}

// ── Per-difficulty client + record shapes ───────────────────────────

/** What the client gets for one difficulty — givens only, never the
 *  solution. `solved` carries the banked result once earned. */
export interface HoldPuzzleClient {
  difficulty: HoldDifficulty
  givens: string
  /** The player's saved in-progress entries (81-char), or null. */
  progress: string | null
  hintsUsed: number
  solved: null | { doubloons: number; clean: boolean }
}

export interface HoldState {
  date: string
  puzzles: HoldPuzzleClient[]
  doubloonsAwarded: number
  /** The difficulty the player committed to today; null = not yet
   *  chosen. One hold a day — once set, the others are closed. */
  lockedDifficulty: HoldDifficulty | null
  /** Lifetime puzzle points + the Den purse perk they currently buy. */
  puzzlePoints: number
  denCap: number
  nextTier: { points: number; cap: number } | null
}

export interface LockHoldResult {
  lockedDifficulty: HoldDifficulty
}

/** Result of a "tally" — the player asks the quartermaster to check the
 *  manifest so far. `wrong[i]` is true for a filled cell that's wrong;
 *  empty cells are always false. Using a tally spends the clean bonus. */
export interface TallyHoldResult {
  wrong: boolean[]
  hintsUsed: number
}

export interface SubmitHoldResult {
  correct: boolean
  /** Per-cell wrongness for an incorrect submit, so the UI can flag the
   *  offending cells without revealing the answer (true = wrong). */
  wrong?: boolean[]
  doubloonsWon: number
  clean: boolean
  /** Wallet total after the payout, null when nothing was won — the
   *  client forwards it to the Nav's doubloons-changed listener. */
  newDoubloons: number | null
  /** Puzzle points banked by this solve + the player's new lifetime
   *  total, and whether crossing it raised the Den purse cap. */
  pointsWon: number
  newPuzzlePoints: number
  capBefore: number
  capAfter: number
}
