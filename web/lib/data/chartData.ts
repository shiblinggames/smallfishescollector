// ── THE CHART ROOM'S DATA ACCESS (Steam prep, 2026-09-29) ──
//
// The four weekly puzzles (Treasure Match, the Minefield, the Quartermaster's
// Hold, Lay the Rigging), the World Chart and the room's guide. Built on the
// daily loop's store (the profile, the purse, the ledger) plus badge grants.
//
// On the web each week's board comes from its generator (built once, cached
// for everyone); offline the save builds and keeps its own (lib/chartBoards).
//
// Every puzzle banks its points once, and an offline store must keep each
// guard exactly:
//   - Treasure Match banks a tier only from the tier read (bankMatchTier), and
//     a best score only ever rises (raiseMatchBest);
//   - the Minefield saves a board only while it is unbanked (saveMinefield) and
//     banks the clear once (bankMinefield);
//   - the Hold writes only over the exact row it read (saveHold, by its stamp);
//   - the Rigging saves ropes only on an active board and clears it once;
//   - the World Chart claims a landmark only over the claimed set read.

import type { Db } from './common'
import { dailyData, type DailyData } from './dailyData'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { getThisWeeksMatch } from '@/app/(app)/charting/generate'
import { getThisWeeksMinefield } from '@/app/(app)/charting/minefieldGenerate'
import { getThisWeeksSudoku } from '@/app/(app)/tavern/chart-room/hold/generate'
import { getThisWeeksRigging } from '@/app/(app)/tavern/chart-room/rigging/generate'
import type { MatchConfig, MinefieldLayout, SudokuSet, RiggingLayout } from '@/lib/chartBoards'
import type { HoldDifficulty } from '@/app/(app)/tavern/chart-room/hold/constants'

export interface MatchAttemptRow { status: 'active' | 'cleared'; best_score: number; points_awarded: number }
export interface MinefieldAttemptRow { revealed: number[]; flagged: number[]; status: 'active' | 'cleared'; points_awarded: number; busts: number }
export interface RiggingAttemptRow { paths: Record<number, number[]>; status: 'active' | 'cleared'; points_awarded: number }
/** `notes` are the PENCIL marks, 81 comma-separated digit runs. Optional:
 *  saves written before pencil marks were persisted have none. */
export interface HoldProgressEntry { entries: string; hints: number; notes?: string }
export interface HoldSolvedEntry { doubloons: number; clean: boolean; points: number; solved_at: string }
export interface HoldAttemptRow {
  progress: Partial<Record<HoldDifficulty, HoldProgressEntry>>
  solved: Partial<Record<HoldDifficulty, HoldSolvedEntry>>
  doubloons_awarded: number
  /** The row's stamp as read; every write is guarded on it. undefined = no row yet. */
  updated_at?: string | null
}

export interface ChartData extends DailyData {
  grantBadge(uid: string, badgeId: string): Promise<void>

  // ── The week's boards ──
  weeklyMatch(week: string): Promise<MatchConfig | null>
  weeklyMinefield(week: string): Promise<MinefieldLayout | null>
  weeklySudoku(week: string): Promise<SudokuSet | null>
  weeklyRigging(week: string): Promise<RiggingLayout | null>

  // ── Treasure Match ──
  matchAttempt(uid: string, week: string): Promise<MatchAttemptRow | null>
  /** Raise the week's best score (never lowers it, never touches the points). */
  raiseMatchBest(uid: string, week: string, best: number, maxed: boolean): Promise<void>
  /** Bank a tier, only from the points read. True if this call banked it. */
  bankMatchTier(uid: string, week: string, readPoints: number, row: MatchAttemptRow): Promise<boolean>

  // ── The Minefield ──
  minefieldAttempt(uid: string, week: string): Promise<MinefieldAttemptRow | null>
  /** Save the board, only while it is unbanked (a missing row is created). */
  saveMinefield(uid: string, week: string, a: MinefieldAttemptRow): Promise<void>
  /** Bank the clear from the unbanked state. True if this call banked it. */
  bankMinefield(uid: string, week: string, a: MinefieldAttemptRow, existed: boolean): Promise<boolean>

  // ── Lay the Rigging ──
  riggingAttempt(uid: string, week: string): Promise<RiggingAttemptRow | null>
  /** Save ropes on a board still active (a missing row is created). */
  saveRiggingActive(uid: string, week: string, paths: Record<number, number[]>): Promise<void>
  /** Clear the board with its points, only from active and unbanked. */
  clearRigging(uid: string, week: string, paths: Record<number, number[]>, points: number): Promise<boolean>

  // ── The Quartermaster's Hold ──
  holdAttempt(uid: string, week: string): Promise<HoldAttemptRow | null>
  /** Write the row only over the exact row read (its stamp), or insert the
   *  first (stamp undefined). */
  saveHold(uid: string, week: string, read: HoldAttemptRow, next: Pick<HoldAttemptRow, 'progress' | 'solved' | 'doubloons_awarded'>): Promise<boolean>

  // ── The World Chart ──
  /** Write the claimed landmarks only over the set read (null: never claimed). */
  claimLandmarks(uid: string, read: number[] | null, next: number[]): Promise<boolean>
}

/** ChartData over Supabase. */
export function chartData(admin: Db): ChartData {
  const nowIso = () => new Date().toISOString()
  return {
    ...dailyData(admin),
    async grantBadge(uid, badgeId) { await grantBadgeDirect(uid, badgeId) },

    // The generators key their own week (the real clock) and cache it.
    weeklyMatch: () => getThisWeeksMatch(),
    weeklyMinefield: () => getThisWeeksMinefield(),
    weeklySudoku: () => getThisWeeksSudoku(),
    weeklyRigging: () => getThisWeeksRigging(),

    async matchAttempt(uid, week) {
      const { data } = await admin.from('treasure_match_attempts').select('status, best_score, points_awarded').eq('user_id', uid).eq('week', week).maybeSingle()
      return (data as MatchAttemptRow | null) ?? null
    },
    async raiseMatchBest(uid, week, best, maxed) {
      const updated_at = nowIso()
      await admin.from('treasure_match_attempts')
        .update({ best_score: best, updated_at, ...(maxed ? { status: 'cleared' } : {}) })
        .eq('user_id', uid).eq('week', week).lt('best_score', best)
      await admin.from('treasure_match_attempts').upsert(
        { user_id: uid, week, status: maxed ? 'cleared' : 'active', best_score: best, points_awarded: 0, updated_at },
        { onConflict: 'user_id,week', ignoreDuplicates: true },
      )
    },
    async bankMatchTier(uid, week, readPoints, row) {
      const updated_at = nowIso()
      const { data: banked } = await admin.from('treasure_match_attempts')
        .update({ ...row, updated_at })
        .eq('user_id', uid).eq('week', week).eq('points_awarded', readPoints)
        .select('user_id')
      if (banked && banked.length > 0) return true
      if (readPoints !== 0) return false
      // No row yet: the first insert wins, a concurrent one hits the key.
      const { error } = await admin.from('treasure_match_attempts').insert({ user_id: uid, week, ...row, updated_at })
      return !error
    },

    async minefieldAttempt(uid, week) {
      const { data } = await admin.from('minefield_attempts').select('revealed, flagged, status, points_awarded, busts').eq('user_id', uid).eq('week', week).maybeSingle()
      return (data as MinefieldAttemptRow | null) ?? null
    },
    async saveMinefield(uid, week, a) {
      const row = { revealed: a.revealed, flagged: a.flagged, status: a.status, busts: a.busts, updated_at: nowIso() }
      const { data } = await admin.from('minefield_attempts').update(row)
        .eq('user_id', uid).eq('week', week).eq('points_awarded', 0)
        .select('user_id')
      if (data && data.length > 0) return
      await admin.from('minefield_attempts').upsert(
        { user_id: uid, week, ...row, points_awarded: 0 },
        { onConflict: 'user_id,week', ignoreDuplicates: true },
      )
    },
    async bankMinefield(uid, week, a, existed) {
      const row = { revealed: a.revealed, flagged: a.flagged, status: a.status, points_awarded: a.points_awarded, busts: a.busts, updated_at: nowIso() }
      if (!existed) {
        const { error } = await admin.from('minefield_attempts').insert({ user_id: uid, week, ...row })
        if (!error) return true
      }
      const { data } = await admin.from('minefield_attempts').update(row)
        .eq('user_id', uid).eq('week', week).eq('points_awarded', 0)
        .select('user_id')
      return !!data && data.length > 0
    },

    async riggingAttempt(uid, week) {
      const { data } = await admin.from('rigging_attempts').select('paths, status, points_awarded').eq('user_id', uid).eq('week', week).maybeSingle()
      return (data as RiggingAttemptRow | null) ?? null
    },
    async saveRiggingActive(uid, week, paths) {
      const updated_at = nowIso()
      const { data } = await admin.from('rigging_attempts')
        .update({ paths, updated_at })
        .eq('user_id', uid).eq('week', week).eq('status', 'active')
        .select('user_id')
      if (data && data.length > 0) return
      // No row yet: create it. A row that exists but is cleared makes this a no-op.
      await admin.from('rigging_attempts').upsert(
        { user_id: uid, week, paths, status: 'active', points_awarded: 0, updated_at },
        { onConflict: 'user_id,week', ignoreDuplicates: true },
      )
    },
    async clearRigging(uid, week, paths, points) {
      const { data } = await admin.from('rigging_attempts')
        .update({ paths, status: 'cleared', points_awarded: points, updated_at: nowIso() })
        .eq('user_id', uid).eq('week', week).eq('status', 'active').eq('points_awarded', 0)
        .select('user_id')
      return !!data && data.length > 0
    },

    async holdAttempt(uid, week) {
      const { data } = await admin.from('sudoku_attempts').select('progress, solved, doubloons_awarded, updated_at').eq('user_id', uid).eq('date', week).maybeSingle()
      return (data as HoldAttemptRow | null) ?? null
    },
    async saveHold(uid, week, read, next) {
      const row = { ...next, updated_at: nowIso() }
      if (read.updated_at === undefined) {
        const { error } = await admin.from('sudoku_attempts').insert({ user_id: uid, date: week, ...row })
        return !error
      }
      const q = admin.from('sudoku_attempts').update(row).eq('user_id', uid).eq('date', week)
      const { data } = await (read.updated_at === null ? q.is('updated_at', null) : q.eq('updated_at', read.updated_at))
        .select('user_id')
      return !!data && data.length > 0
    },

    async claimLandmarks(uid, read, next) {
      const q = admin.from('profiles').update({ charting_landmarks_claimed: next }).eq('id', uid)
      const { data } = await (read == null
        ? q.is('charting_landmarks_claimed', null)
        : q.eq('charting_landmarks_claimed', `{${read.join(',')}}`)
      ).select('id')
      return !!data && data.length > 0
    },
  }
}
