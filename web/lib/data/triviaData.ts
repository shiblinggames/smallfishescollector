// ── THE PARLOR'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// The Captain's Board, Spin the Capstan and the Pirate King: the week's
// questions, and each game's attempt row. Built on the daily loop's store (the
// profile, the purse, the ledger) plus badge grants.
//
// On the web the week's questions come from the generators (Claude writes them
// and they are cached per week); offline they come from the shipped bank.
//
// The one-shot guards are the contract, and an offline store must keep them.
// Each game moves its attempt row ONLY from the exact state it read:
//   - recordBoardAnswer lands only if the answers are still what was read;
//   - saveCapstanRuns lands only over the runs read (or inserts the first);
//   - advanceLadder lands only from the rung, status, clock and 50/50 read.
// A false means a twin request got there first, and nothing is paid.

import type { Db } from './common'
import { dailyData, type DailyData } from './dailyData'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { getThisWeeksBoard, type GeneratedTile } from '@/app/(app)/tavern/trivia/board/generate'
import { getThisWeeksCapstan, type GeneratedPuzzle } from '@/app/(app)/tavern/trivia/capstan/generate'
import { getThisWeeksLadder, type GeneratedRung } from '@/app/(app)/tavern/trivia/king/generate'
import type { PirateKingStatus, CapstanStatus } from '@/app/(app)/tavern/trivia/constants'

/** Per-card record. `chosen`/`correct` are absent while the card is committed
 *  (revealed) but not yet answered. `day` is the date it was committed. */
export interface BoardAnswerEntry { day: string; chosen?: number; correct?: boolean; revealedAt?: string }
export interface BoardAttemptRow {
  answers: Record<string, BoardAnswerEntry>
  doubloons_awarded: number
  gems_awarded: number
}

export interface CapstanRun {
  /** EVERY letter tried, hit or miss. */
  called: string[]
  bank: number
  strikes: number
  status: CapstanStatus
  pendingValue: number | null
  earned: number
  /** Hazards dealt back to back so far. Optional: runs opened before it shipped lack it. */
  hazardRun?: number
}
export type CapstanRuns = Record<string, CapstanRun>

export interface LadderAttemptRow {
  rung: number
  status: PirateKingStatus
  fifty: { rung: number; removed: number[] } | null
  doubloons_awarded: number
  /** When the current rung was revealed (ISO), or null: the answer clock. */
  current_started_at: string | null
}

export interface TriviaData extends DailyData {
  grantBadge(uid: string, badgeId: string): Promise<void>

  // ── The week's questions ──
  weeklyBoard(week: string): Promise<GeneratedTile[] | null>
  weeklyCapstan(week: string): Promise<GeneratedPuzzle[] | null>
  weeklyLadder(week: string): Promise<GeneratedRung[] | null>

  // ── The Captain's Board ──
  boardAttempt(uid: string, week: string): Promise<BoardAttemptRow | null>
  /** Commit a card (write the week's answers). */
  saveBoardAttempt(uid: string, week: string, row: { answers: Record<string, BoardAnswerEntry>; doubloons_awarded: number }): Promise<void>
  /** Record an answer only if the answers still read `readAnswers`. */
  recordBoardAnswer(uid: string, week: string, readAnswers: Record<string, BoardAnswerEntry>, patch: BoardAttemptRow): Promise<boolean>

  // ── Spin the Capstan ──
  /** The week's runs, or null before the first move. */
  capstanAttempt(uid: string, week: string): Promise<{ runs: CapstanRuns; doubloons_awarded: number } | null>
  /** Save the runs over the exact runs read (`readAs`, as JSON), or insert the
   *  first (`readAs` null). */
  saveCapstanRuns(uid: string, week: string, runs: CapstanRuns, doubloonsAwarded: number, readAs: string | null): Promise<boolean>

  // ── The Pirate King ──
  ladderAttempt(uid: string, week: string): Promise<LadderAttemptRow | null>
  /** Move the run from `from` (null: no row yet) by `patch`, only if it still reads `from`. */
  advanceLadder(uid: string, week: string, from: LadderAttemptRow | null, patch: Record<string, unknown>): Promise<boolean>
}

/** TriviaData over Supabase. */
export function triviaData(admin: Db): TriviaData {
  return {
    ...dailyData(admin),
    async grantBadge(uid, badgeId) { await grantBadgeDirect(uid, badgeId) },

    // The generators key their own week (the real clock) and cache it.
    weeklyBoard: () => getThisWeeksBoard(),
    weeklyCapstan: () => getThisWeeksCapstan(),
    weeklyLadder: () => getThisWeeksLadder(),

    async boardAttempt(uid, week) {
      const { data } = await admin.from('trivia_board_attempts').select('answers, doubloons_awarded, gems_awarded').eq('user_id', uid).eq('date', week).maybeSingle()
      return (data as BoardAttemptRow | null) ?? null
    },
    async saveBoardAttempt(uid, week, row) {
      await admin.from('trivia_board_attempts').upsert({ user_id: uid, date: week, category: null, ...row })
    },
    async recordBoardAnswer(uid, week, readAnswers, patch) {
      const { data } = await admin.from('trivia_board_attempts').update(patch)
        .eq('user_id', uid).eq('date', week).eq('answers', JSON.stringify(readAnswers))
        .select('user_id')
      return !!data && data.length > 0
    },

    async capstanAttempt(uid, week) {
      const { data } = await admin.from('trivia_capstan_attempts').select('runs, doubloons_awarded').eq('user_id', uid).eq('date', week).maybeSingle()
      if (!data) return null
      return { runs: (data.runs as CapstanRuns | null) ?? {}, doubloons_awarded: (data.doubloons_awarded as number | null) ?? 0 }
    },
    async saveCapstanRuns(uid, week, runs, doubloonsAwarded, readAs) {
      const row = { runs, doubloons_awarded: doubloonsAwarded, updated_at: new Date().toISOString() }
      if (readAs === null) {
        const { error } = await admin.from('trivia_capstan_attempts').insert({ user_id: uid, date: week, ...row })
        return !error
      }
      const { data } = await admin.from('trivia_capstan_attempts').update(row)
        .eq('user_id', uid).eq('date', week).eq('runs', readAs)
        .select('user_id')
      return !!data && data.length > 0
    },

    async ladderAttempt(uid, week) {
      const { data } = await admin.from('trivia_ladder_attempts').select('rung, status, fifty, doubloons_awarded, current_started_at').eq('user_id', uid).eq('date', week).maybeSingle()
      return (data as LadderAttemptRow | null) ?? null
    },
    async advanceLadder(uid, week, from, patch) {
      if (!from) {
        const { error } = await admin.from('trivia_ladder_attempts').insert({
          user_id: uid, date: week, rung: 0, status: 'active', fifty: null, doubloons_awarded: 0, current_started_at: null,
          ...patch,
        })
        return !error
      }
      let q = admin.from('trivia_ladder_attempts').update(patch)
        .eq('user_id', uid).eq('date', week)
        .eq('rung', from.rung).eq('status', from.status)
      q = from.current_started_at === null ? q.is('current_started_at', null) : q.eq('current_started_at', from.current_started_at)
      q = from.fifty === null ? q.is('fifty', null) : q.not('fifty', 'is', null)
      const { data } = await q.select('user_id')
      return !!data && data.length > 0
    },
  }
}
