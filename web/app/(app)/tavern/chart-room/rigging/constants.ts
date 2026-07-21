// Lay the Rigging — shared constants + types for the weekly Flow puzzle
// in the Chart Room. Plain module (NOT 'use server') so sync helpers +
// types survive the build.
//
// Connect each pair of matching cleats with a rope, cover every deck
// plank, no rope crosses another. One board a week; first clear banks
// puzzle points toward the World Chart (no doubloons), like the Minefield.

import type { RiggingPair } from './rigging'

// Bigger + harder than a daily — it's a weekly. 9x9 with 8 ropes.
export const RIGGING_COLS = 9
export const RIGGING_ROWS = 9
export const RIGGING_COLORS = 8

/** Puzzle points banked on the first clear of the week (same weight as
 *  the Minefield — a weekly bonus toward the World Chart). */
export const RIGGING_POINTS = 5

/** Rope colors by index (must be >= RIGGING_COLORS). Bright, maximally-distinct
 *  hues so every rope pops on the dark deck and no two read alike at a glance —
 *  red, orange, yellow, blue, purple, green, pink, cyan. Distinctness matters
 *  more than subtlety here: it's a flow puzzle, you must tell ropes apart fast. */
export const RIGGING_PALETTE = ['#ef4444', '#ff8c1a', '#ffd21e', '#3b82f6', '#a855f7', '#22c55e', '#ec4899', '#06b6d4'] as const

/** Monday (UTC) of the current week — the weekly key. */
export function riggingWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

export interface RiggingState {
  week: string
  cols: number
  rows: number
  pairs: RiggingPair[]
  /** The player's saved in-progress ropes (color → ordered cells). */
  paths: Record<number, number[]>
  status: 'active' | 'cleared'
  pointsAwarded: number
  reward: number
  puzzlePoints: number
}

export interface SubmitRiggingResult {
  solved: boolean
  pointsWon: number
  newPuzzlePoints: number | null
}
