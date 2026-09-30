// ── THE PARLOR'S OFFLINE BANK (Steam prep, 2026-09-29) ──
//
// The offline game cannot ask Claude for this week's questions, so it plays the
// weeks already written, shipped in content/trivia.json (refreshed by
// scripts/export-trivia-bank.mts) and rotated by week: each Monday moves every
// game one step along its own list. Pure; the local store reads it.

import type { GeneratedTile } from '@/app/(app)/tavern/trivia/board/generate'
import type { GeneratedPuzzle } from '@/app/(app)/tavern/trivia/capstan/generate'
import type { GeneratedRung } from '@/app/(app)/tavern/trivia/king/generate'
import bankJson from '@/content/trivia.json'

export type TriviaBank = {
  exported: string
  boards: GeneratedTile[][]
  ladders: GeneratedRung[][]
  capstan: GeneratedPuzzle[][]
}

export const TRIVIA_BANK = bankJson as unknown as TriviaBank

const WEEK_MS = 7 * 86_400_000

/** Which entry of a list of `n` a week (its Monday, YYYY-MM-DD) plays. */
export function bankWeekIndex(week: string, n: number): number {
  if (n <= 0) return -1
  const weeks = Math.floor(Date.parse(`${week}T00:00:00Z`) / WEEK_MS)
  return ((weeks % n) + n) % n
}

/** This week's entry of a bank list, or null if the list is empty. */
export function bankFor<T>(list: T[], week: string): T | null {
  const i = bankWeekIndex(week, list.length)
  return i < 0 ? null : list[i]
}
