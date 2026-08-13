// The Hold — shared constants + types for the weekly sudoku in The Chart
// Room. Plain module (NOT 'use server') so sync helpers and types survive
// the build; server actions import from here.
//
// Theme: a 9x9 cargo hold split into nine 3x3 bays. Pack it so no deck
// (row), hull section (column), or bay carries two of the same cargo lot
// (1-9). Classic sudoku rules under a manifest skin. FOUR holds a week
// (difficulty 1-4), all open — solve any or all; each banks its difficulty
// in charting points. All four refresh every Monday (no more one-per-week
// lock, 2026-07-21).

export const HOLD_DIFFICULTIES = ['easy', 'medium', 'hard', 'extreme'] as const
export type HoldDifficulty = (typeof HOLD_DIFFICULTIES)[number]

/** Monday (UTC) of the current week — the key the weekly board +
 *  attempts are stored under (the daily_sudoku/sudoku_attempts `date`
 *  column now holds this Monday). */
export function holdWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

export interface HoldDifficultyMeta {
  key: HoldDifficulty
  label: string
  /** Roughly how many cells start filled (givens). Fewer = harder. */
  givens: number
  /** Base doubloons for the first solve of the day. */
  payout: number
  /** Puzzle points banked on solve (harder = more). Points are permanent
   *  and accumulate toward the World Chart. */
  points: number
  accent: string
}

// Four honestly-distinct solves (difficulty 1-4), each with a guaranteed-
// unique solution so they're always fair. Charting points = the difficulty
// number (1/2/3/4); doubloon payouts climb alongside. Solve all four in a
// week to bank the full 10 points (+ a clean-sweep doubloon haul).
export const HOLD_META: Record<HoldDifficulty, HoldDifficultyMeta> = {
  easy:    { key: 'easy',    label: 'Skiff',       givens: 44, payout: 40,  points: 1, accent: '#34d399' },
  medium:  { key: 'medium',  label: 'Galleon',     givens: 36, payout: 80,  points: 2, accent: '#60a5fa' },
  hard:    { key: 'hard',    label: 'Dreadnought', givens: 30, payout: 130, points: 3, accent: '#f0743a' },
  extreme: { key: 'extreme', label: 'Man-o-War',   givens: 26, payout: 200, points: 4, accent: '#c084fc' },
}

/** Bonus for solving a hold with no tally (check/hint) used, as a
 *  fraction of the base payout. Rounded to a whole doubloon. */
export const CLEAN_BONUS_FRACTION = 0.5

export function cleanBonus(difficulty: HoldDifficulty): number {
  return Math.round(HOLD_META[difficulty].payout * CLEAN_BONUS_FRACTION)
}

/** Total a clean solve pays (base + clean bonus). */
export function holdPayout(difficulty: HoldDifficulty, clean: boolean): number {
  return HOLD_META[difficulty].payout + (clean ? cleanBonus(difficulty) : 0)
}

/** Charting points a solve banks — the difficulty number (1-4). Clean
 *  affects only the doubloon bonus, not points. */
export function holdPoints(difficulty: HoldDifficulty): number {
  return HOLD_META[difficulty].points
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
  /** Pencil marks, 81 comma-separated digit runs. Null on saves written before
   *  they were persisted, which restore as an empty pencil grid. */
  notes: string | null
  hintsUsed: number
  solved: null | { doubloons: number; clean: boolean }
}

export interface HoldState {
  date: string
  /** All four holds — every one is open; solve any or all. */
  puzzles: HoldPuzzleClient[]
  doubloonsAwarded: number
  /** Lifetime puzzle points banked from the puzzles. */
  puzzlePoints: number
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
  /** Puzzle points banked by this solve + the player's new lifetime total. */
  pointsWon: number
  newPuzzlePoints: number
}
