// ── THE CHART ROOM OVER A LOCAL SAVE (Steam prep, 2026-09-29) ──
//
// ChartData over one captain's save, spreading the daily loop's. Each week's
// boards are the save's own: built the first time the week is asked for
// (lib/chartBoards, through the save's dice) and kept, so a board never changes
// under a player mid-week. Every guard the web keeps is kept here: a Match tier
// banks only from the tier read, a best only rises; a Minefield board saves
// only while unbanked and banks once; the Hold writes only over the row read
// (by its stamp); the Rigging saves only while active and clears once; a
// landmark claim lands only over the claimed set read.

import type { ChartData, HoldAttemptRow } from '../chartData'
import { localDailyData } from './dailyLocal'
import { localCaptain, type LocalSave } from './save'
import { clockNow } from '@/lib/clock'
import { buildMatchConfig, buildMinefieldLayout, buildSudokuSet, buildRiggingLayout, hasAllDifficulties } from '@/lib/chartBoards'

/** Weeks of boards and attempts kept. */
const KEEP_WEEKS = 12

/** Drop all but the newest KEEP_WEEKS weeks (keys are Mondays, YYYY-MM-DD). */
function trim<T>(byWeek: Record<string, T>): Record<string, T> {
  const keep = Object.keys(byWeek).sort().slice(-KEEP_WEEKS)
  return Object.fromEntries(keep.map(k => [k, byWeek[k]]))
}

/** ChartData over one captain's local save. */
export function localChartData(save: LocalSave): ChartData {
  const daily = localDailyData(save)
  const captain = localCaptain(save)
  const c = () => save.charting
  const me = (uid: string) => {
    if (uid !== save.uid) throw new Error(`local save belongs to ${save.uid}, not ${uid}`)
  }
  /** This week's board: the one already built, or a new one kept for the week.
   *  If building fails, last built week's board stands in, as on the web. */
  function board<T>(kind: keyof LocalSave['charting']['boards'], week: string, build: () => T, ok: (b: T) => boolean = () => true): T | null {
    const boards = c().boards[kind] as Record<string, T>
    if (boards[week] && ok(boards[week])) return structuredClone(boards[week])
    try {
      const b = build()
      boards[week] = b
      ;(c().boards as Record<string, unknown>)[kind] = trim(boards)
      return structuredClone(b)
    } catch {
      const prior = Object.keys(boards).filter(k => k < week).sort().pop()
      return prior ? structuredClone(boards[prior]) : null
    }
  }
  /** A stamp no two writes share, even inside one millisecond. */
  const stamp = () => `${new Date(clockNow()).toISOString()}#${save.nextId++}`

  return {
    ...daily,
    grantBadge: captain.grantBadge,

    // ── The week's boards, the save's own ──
    async weeklyMatch(week) { return board('match', week, buildMatchConfig) },
    async weeklyMinefield(week) { return board('minefield', week, buildMinefieldLayout) },
    async weeklySudoku(week) { return board('sudoku', week, buildSudokuSet, hasAllDifficulties) },
    async weeklyRigging(week) { return board('rigging', week, buildRiggingLayout) },

    // ── Treasure Match ──
    async matchAttempt(uid, week) { me(uid); return c().match[week] ? structuredClone(c().match[week]) : null },
    async raiseMatchBest(uid, week, best, maxed) {
      me(uid)
      const cur = c().match[week]
      if (!cur) {
        c().match[week] = { status: maxed ? 'cleared' : 'active', best_score: best, points_awarded: 0 }
        c().match = trim(c().match)
      } else if (cur.best_score < best) {
        c().match[week] = { ...cur, best_score: best, ...(maxed ? { status: 'cleared' as const } : {}) }
      }
    },
    async bankMatchTier(uid, week, readPoints, row) {
      me(uid)
      const cur = c().match[week]
      if (cur ? cur.points_awarded !== readPoints : readPoints !== 0) return false
      c().match[week] = { ...row }
      c().match = trim(c().match)
      return true
    },

    // ── The Minefield ──
    async minefieldAttempt(uid, week) { me(uid); return c().minefield[week] ? structuredClone(c().minefield[week]) : null },
    async saveMinefield(uid, week, a) {
      me(uid)
      const cur = c().minefield[week]
      if (cur && cur.points_awarded !== 0) return
      c().minefield[week] = { revealed: [...a.revealed], flagged: [...a.flagged], status: a.status, busts: a.busts, points_awarded: 0 }
      c().minefield = trim(c().minefield)
    },
    async bankMinefield(uid, week, a) {
      me(uid)
      // Banked once: from no row, or from an unbanked one, never over a bank.
      const cur = c().minefield[week]
      if (cur && cur.points_awarded !== 0) return false
      c().minefield[week] = structuredClone(a)
      c().minefield = trim(c().minefield)
      return true
    },

    // ── Lay the Rigging ──
    async riggingAttempt(uid, week) { me(uid); return c().rigging[week] ? structuredClone(c().rigging[week]) : null },
    async saveRiggingActive(uid, week, paths) {
      me(uid)
      const cur = c().rigging[week]
      if (cur && cur.status !== 'active') return
      c().rigging[week] = { paths: structuredClone(paths), status: 'active', points_awarded: cur?.points_awarded ?? 0 }
      c().rigging = trim(c().rigging)
    },
    async clearRigging(uid, week, paths, points) {
      me(uid)
      const cur = c().rigging[week]
      if (!cur || cur.status !== 'active' || cur.points_awarded !== 0) return false
      c().rigging[week] = { paths: structuredClone(paths), status: 'cleared', points_awarded: points }
      return true
    },

    // ── The Quartermaster's Hold ──
    async holdAttempt(uid, week) { me(uid); return c().hold[week] ? structuredClone(c().hold[week]) : null },
    async saveHold(uid, week, read, next) {
      me(uid)
      const cur = c().hold[week]
      if (read.updated_at === undefined ? cur != null : (!cur || cur.updated_at !== read.updated_at)) return false
      c().hold[week] = { ...structuredClone(next), updated_at: stamp() } as HoldAttemptRow
      c().hold = trim(c().hold)
      return true
    },

    // ── The World Chart ──
    async claimLandmarks(uid, read, next) {
      me(uid)
      const cur = (save.profile.charting_landmarks_claimed as number[] | null | undefined) ?? null
      if (JSON.stringify(cur) !== JSON.stringify(read)) return false
      save.profile.charting_landmarks_claimed = [...next]
      return true
    },
  }
}
