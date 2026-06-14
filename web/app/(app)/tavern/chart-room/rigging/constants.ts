// Lay the Rigging — shared constants + types for the weekly Flow puzzle
// in the Chart Room. Plain module (NOT 'use server') so sync helpers +
// types survive the build.
//
// Connect each pair of matching cleats with a rope, cover every deck
// plank, no rope crosses another. One board a week; first clear banks
// puzzle points toward the Den purse (no doubloons), like the Minefield.

import type { RiggingPair } from './rigging'

export const RIGGING_COLS = 7
export const RIGGING_ROWS = 7
export const RIGGING_COLORS = 6

/** Puzzle points banked on the first clear of the week (same weight as
 *  the Minefield — a weekly bonus toward the Den purse). */
export const RIGGING_POINTS = 5

/** Rope colors by index (must be >= RIGGING_COLORS). Readable on the
 *  dark deck grid. */
export const RIGGING_PALETTE = ['#e0524e', '#4f9bd0', '#46b46e', '#f0c040', '#a87bd0', '#e0894e', '#e070b0', '#5ad0c0'] as const

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
  denCap: number
}

export interface SubmitRiggingResult {
  solved: boolean
  pointsWon: number
  newPuzzlePoints: number | null
  capBefore: number
  capAfter: number
}
