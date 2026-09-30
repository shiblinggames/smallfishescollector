// ── THE THREE LOBBIES, SHAPED (Steam prep, 2026-09-30) ──
//
// The Chart Room, the Den and the Parlor each open on a lobby whose props the
// web page builds on the server. Built here from pieces instead, like the sea
// chart (lib/core/seaPage): the web page reads its pieces from Supabase, the
// desktop from the save, and these turn either into the lobby's props.
//
// The "top three" on each lobby are other captains, so offline they are empty
// (the leaderboards retire on Steam).
//
// Moved verbatim out of the three page.tsx files.

import { isPremiumActive } from '@/lib/premium'
import { MATCH_MAX_POINTS } from '@/app/(app)/charting/constants'
import { MINEFIELD_POINTS } from '@/app/(app)/charting/minefieldConstants'
import { RIGGING_POINTS } from '@/app/(app)/tavern/chart-room/rigging/constants'
import type { PirateKingStatus } from '@/app/(app)/tavern/trivia/constants'
import type { Row } from '@/lib/data/common'

type Maybe<T> = T | { error: string }

// ── The Chart Room ──────────────────────────────────────────────────────────

export type ChartRoomPieces = {
  profile: Row | null
  hold: Maybe<{ puzzles: { solved: unknown }[]; doubloonsAwarded: number }>
  match: Maybe<{ status: 'active' | 'cleared' }>
  minefield: Maybe<{ status: 'active' | 'cleared' }>
  rigging: Maybe<{ status: 'active' | 'cleared'; reward: number }>
  topCharters: { username: string; points: number }[]
}

export function chartRoomLobbyProps(p: ChartRoomPieces) {
  const { profile, hold, match, minefield, rigging } = p
  return {
    holdSolved: 'error' in hold ? 0 : hold.puzzles.filter(x => !!x.solved).length,
    holdDoubloonsToday: 'error' in hold ? 0 : hold.doubloonsAwarded,
    matchStatus: ('error' in match ? 'active' : match.status) as 'active' | 'cleared',
    matchReward: MATCH_MAX_POINTS,
    minefieldStatus: ('error' in minefield ? 'active' : minefield.status) as 'active' | 'cleared',
    minefieldReward: MINEFIELD_POINTS,
    riggingStatus: ('error' in rigging ? 'active' : rigging.status) as 'active' | 'cleared',
    riggingReward: 'error' in rigging ? RIGGING_POINTS : rigging.reward,
    puzzlePoints: Number(profile?.puzzle_points ?? 0),
    chartingClaimed: (profile?.charting_landmarks_claimed as number[] | null) ?? [],
    topCharters: p.topCharters,
    isMember: isPremiumActive(profile),
    hasSeenGuide: (profile?.has_seen_charting_guide as boolean | null) ?? false,
  }
}

// ── The Parlor ──────────────────────────────────────────────────────────────

export type ParlorLobbyPieces = {
  profile: Row | null
  /** This week's Captain's Board attempt. */
  board: { answers: unknown; doubloons_awarded?: number | null } | null
  /** This week's Pirate King climb. */
  king: { rung: number; status: string; doubloons_awarded: number } | null
  /** This week's Capstan runs. */
  capstan: { runs: unknown } | null
  topParlor: { username: string; points: number }[]
  /** Today, as a UTC date string (the Board deals by day). */
  today: string
}

export function parlorLobbyProps(p: ParlorLobbyPieces) {
  const { profile } = p
  const boardAnswers = (p.board?.answers as Record<string, { day?: string; chosen?: number }> | null) ?? {}
  const picksAllowed = isPremiumActive(profile) ? 2 : 1
  const boardPicksToday = Object.values(boardAnswers).filter(a => a.day === p.today).length
  const capstanRuns = (p.capstan?.runs as Record<string, { status?: string }> | null) ?? {}
  return {
    boardPlayedToday: boardPicksToday >= picksAllowed,
    boardPlayedThisWeek: Object.values(boardAnswers).filter(a => a.chosen !== undefined).length,
    doubloonsThisWeek: Number(p.board?.doubloons_awarded ?? 0),
    king: p.king
      ? { status: p.king.status as PirateKingStatus, rung: p.king.rung, doubloonsAwarded: p.king.doubloons_awarded }
      : null,
    parlorStreak: (profile?.parlor_streak as number | null) ?? 0,
    parlorPoints: (profile?.parlor_points as number | null) ?? 0,
    parlorRankGemsClaimed: (profile?.parlor_rank_gems_awarded as number | null) ?? 0,
    isCaptain: isPremiumActive(profile),
    capstanSolved: Object.values(capstanRuns).filter(r => r.status === 'solved').length,
    topParlor: p.topParlor,
    hasSeenGuide: (profile?.has_seen_parlor_guide as boolean | null) ?? false,
  }
}
