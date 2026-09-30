// ── THE PARLOR OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// TriviaData over one captain's save, spreading the daily loop's. The week's
// questions come from the shipped bank (lib/triviaBank), rotated by week. Each
// game's attempt is kept per week (the last twelve), and moves only from the
// exact state it was read in, as on the web: an answer lands only over the
// answers read, the capstan's runs only over the runs read, the ladder only
// from the rung, status, clock and 50/50 read.

import type { TriviaData, LadderAttemptRow } from '../triviaData'
import { localDailyData } from './dailyLocal'
import { localCaptain, type LocalSave } from './save'
import { TRIVIA_BANK, bankFor } from '@/lib/triviaBank'

/** Weeks of attempts kept per game. */
const KEEP_WEEKS = 12

/** Drop all but the newest KEEP_WEEKS weeks (keys are Mondays, YYYY-MM-DD). */
function trim<T>(byWeek: Record<string, T>): Record<string, T> {
  const keep = Object.keys(byWeek).sort().slice(-KEEP_WEEKS)
  return Object.fromEntries(keep.map(k => [k, byWeek[k]]))
}

/** TriviaData over one captain's local save. */
export function localTriviaData(save: LocalSave): TriviaData {
  const daily = localDailyData(save)
  const captain = localCaptain(save)
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
  }
  const t = save.trivia

  return {
    ...daily,
    grantBadge: captain.grantBadge,

    // ── The week's questions, from the bank ──
    async weeklyBoard(week) { return structuredClone(bankFor(TRIVIA_BANK.boards, week)) },
    async weeklyCapstan(week) { return structuredClone(bankFor(TRIVIA_BANK.capstan, week)) },
    async weeklyLadder(week) { return structuredClone(bankFor(TRIVIA_BANK.ladders, week)) },

    // ── The Captain's Board ──
    async boardAttempt(uid, week) { me(uid); return t.board[week] ? structuredClone(t.board[week]) : null },
    async saveBoardAttempt(uid, week, row) {
      me(uid)
      t.board[week] = { gems_awarded: t.board[week]?.gems_awarded ?? 0, ...structuredClone(row) }
      save.trivia.board = trim(t.board)
    },
    async recordBoardAnswer(uid, week, readAnswers, patch) {
      me(uid)
      const cur = t.board[week]
      if (!cur || JSON.stringify(cur.answers) !== JSON.stringify(readAnswers)) return false
      t.board[week] = structuredClone(patch)
      return true
    },

    // ── Spin the Capstan ──
    async capstanAttempt(uid, week) { me(uid); return t.capstan[week] ? structuredClone(t.capstan[week]) : null },
    async saveCapstanRuns(uid, week, runs, doubloonsAwarded, readAs) {
      me(uid)
      const cur = t.capstan[week]
      if (readAs === null ? cur != null : (!cur || JSON.stringify(cur.runs) !== readAs)) return false
      t.capstan[week] = { runs: structuredClone(runs), doubloons_awarded: doubloonsAwarded }
      save.trivia.capstan = trim(t.capstan)
      return true
    },

    // ── The Pirate King ──
    async ladderAttempt(uid, week) { me(uid); return t.ladder[week] ? structuredClone(t.ladder[week]) : null },
    async advanceLadder(uid, week, from, patch) {
      me(uid)
      const cur = t.ladder[week]
      if (!from) {
        if (cur) return false
        t.ladder[week] = { rung: 0, status: 'active', fifty: null, doubloons_awarded: 0, current_started_at: null, ...structuredClone(patch) } as LadderAttemptRow
        save.trivia.ladder = trim(t.ladder)
        return true
      }
      if (!cur || cur.rung !== from.rung || cur.status !== from.status || cur.current_started_at !== from.current_started_at
        || (cur.fifty === null) !== (from.fifty === null)) return false
      // The web row has a gems_awarded column the offline row does not keep.
      const { gems_awarded: _g, ...rest } = structuredClone(patch)
      void _g
      t.ladder[week] = { ...cur, ...rest } as LadderAttemptRow
      return true
    },
  }
}
