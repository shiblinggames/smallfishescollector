'use server'

// The Captain's Board — server-authoritative play. The full board (with
// answers) only ever lives server-side; clients get a stripped payload and
// every answer is judged here. The board is WEEKLY (fresh each Monday) and the
// player plays ONE card a day: they commit to a card (which reveals its
// question — you can't read all 12 and cherry-pick the easy one), then answer
// it for doubloons. Committing locks the board until tomorrow; over a week you
// pick up to 7 of the 12 cards. Types live in ../constants ('use server' files
// silently drop non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getThisWeeksBoard, type GeneratedTile } from './generate'
import {
  TRIVIA_TIER_VALUES,
  triviaTileKey,
  categoryMeta,
  kingWeekStr,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

/** Per-card record. `chosen`/`correct` are absent while the card is committed
 *  (revealed) but not yet answered. `day` is the date it was committed. */
interface AnswerEntry { day: string; chosen?: number; correct?: boolean }
interface AttemptRow {
  answers: Record<string, AnswerEntry>
  doubloons_awarded: number
}

const ATTEMPT_COLS = 'answers, doubloons_awarded'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

/** The card committed today but not yet answered — the resume target. */
function committedKeyToday(answers: Record<string, AnswerEntry>, today: string): string | null {
  for (const [k, a] of Object.entries(answers)) {
    if (a.day === today && a.chosen === undefined) return k
  }
  return null
}
/** Has the player used their one play for today (committed OR answered)? */
function hasPlayedToday(answers: Record<string, AnswerEntry>, today: string): boolean {
  return Object.values(answers).some(a => a.day === today)
}

function buildTiles(
  board: GeneratedTile[],
  answers: Record<string, AnswerEntry>,
  committedKey: string | null,
): BoardTileClient[] {
  return board.map(t => {
    const key = triviaTileKey(t.category, t.tier)
    const a = answers[key]
    const isAnswered = !!a && a.chosen !== undefined
    // A committed-but-unanswered entry that ISN'T today's pending card was
    // committed on a past day and forfeited — dead, not playable.
    const isSpent = !!a && a.chosen === undefined && key !== committedKey
    // Reveal the question/options only once the card is committed (today) or
    // already answered — never before, so the board can't be window-shopped.
    const reveal = isAnswered || key === committedKey
    return {
      key,
      category: t.category,
      tier: t.tier,
      value: TRIVIA_TIER_VALUES[t.tier - 1],
      question: reveal ? t.question : null,
      options: reveal ? t.options : null,
      answered: isAnswered
        ? { chosen: a!.chosen!, correct: a!.correct!, correctIndex: t.correct_index, explanation: t.explanation }
        : null,
      spent: isSpent || undefined,
    }
  })
}

export async function getCaptainsBoardState(): Promise<CaptainsBoardState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const week = kingWeekStr()
  const today = todayStr()

  const [board, { data: attempt }] = await Promise.all([
    getThisWeeksBoard(),
    admin.from('trivia_board_attempts').select(ATTEMPT_COLS).eq('user_id', user.id).eq('date', week).single(),
  ])
  if (!board) return { error: 'No board available right now. Try again in a moment.' }

  const a = (attempt as AttemptRow | null) ?? { answers: {}, doubloons_awarded: 0 }
  const committedKey = committedKeyToday(a.answers, today)

  return {
    date: week,
    tiles: buildTiles(board, a.answers, committedKey),
    playedToday: hasPlayedToday(a.answers, today),
    committedKey,
    doubloonsAwarded: a.doubloons_awarded,
  }
}

/** Commit the player's one card for the day — reveals its question and locks
 *  the board until tomorrow. The committed card must then be answered (a
 *  refresh resumes it); it can't be swapped for another. */
export async function playCaptainsCard(key: string): Promise<CaptainsBoardState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const week = kingWeekStr()
  const today = todayStr()

  const [board, { data: attempt }] = await Promise.all([
    getThisWeeksBoard(),
    admin.from('trivia_board_attempts').select(ATTEMPT_COLS).eq('user_id', user.id).eq('date', week).single(),
  ])
  if (!board) return { error: 'No board available' }

  const a = (attempt as AttemptRow | null) ?? { answers: {}, doubloons_awarded: 0 }
  const answers = { ...a.answers }

  const existingCommitted = committedKeyToday(answers, today)
  // Re-committing today's pending card is idempotent — just re-reveal it
  // (resume after a refresh). Handle this BEFORE the generic guards.
  if (existingCommitted === key) {
    return {
      date: week,
      tiles: buildTiles(board, answers, key),
      playedToday: true,
      committedKey: key,
      doubloonsAwarded: a.doubloons_awarded,
    }
  }
  if (existingCommitted) return { error: "You've already chosen your card for today." }
  if (hasPlayedToday(answers, today)) return { error: "You've already played today. Come back tomorrow for your next card." }
  // Any existing entry means the card was already answered OR forfeited — dead.
  if (answers[key]) return { error: 'That card has already been played.' }

  const tile = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown card' }

  answers[key] = { day: today }
  await admin.from('trivia_board_attempts').upsert({
    user_id: user.id,
    date: week,
    category: null,
    answers,
    doubloons_awarded: a.doubloons_awarded,
  })

  return {
    date: week,
    tiles: buildTiles(board, answers, key),
    playedToday: true,
    committedKey: key,
    doubloonsAwarded: a.doubloons_awarded,
  }
}

export async function answerCaptainsTile(
  key: string,
  chosenIndex: number,
): Promise<AnswerTileResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof chosenIndex !== 'number' || chosenIndex < 0 || chosenIndex > 3) return { error: 'Invalid answer' }

  const admin = createAdminClient()
  const week = kingWeekStr()
  const today = todayStr()

  const [board, { data: attempt }, { data: profile }] = await Promise.all([
    getThisWeeksBoard(),
    admin.from('trivia_board_attempts').select(ATTEMPT_COLS).eq('user_id', user.id).eq('date', week).single(),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])
  if (!board) return { error: 'No board available' }

  const a = (attempt as AttemptRow | null) ?? { answers: {}, doubloons_awarded: 0 }
  const entry = a.answers[key]
  // You can only answer the card you committed TODAY, and only once — a card
  // committed on a past day is forfeited (anti-cheat: no looking it up overnight).
  if (!entry || entry.day !== today) return { error: 'Choose your card first' }
  if (entry.chosen !== undefined) return { error: 'Card already answered' }

  const tile = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown card' }

  const correct = chosenIndex === tile.correct_index
  const value = TRIVIA_TIER_VALUES[tile.tier - 1]
  const doubloonsWon = correct ? value : 0
  const totalAwarded = a.doubloons_awarded + doubloonsWon
  const newDoubloons = doubloonsWon > 0 ? (profile?.doubloons ?? 0) + doubloonsWon : null
  const newAnswers = { ...a.answers, [key]: { day: today, chosen: chosenIndex, correct } }

  const writes: PromiseLike<unknown>[] = [
    admin.from('trivia_board_attempts').upsert({
      user_id: user.id,
      date: week,
      category: null,
      answers: newAnswers,
      doubloons_awarded: totalAwarded,
    }),
  ]
  if (newDoubloons !== null) {
    writes.push(admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id))
    writes.push(admin.from('doubloon_transactions').insert({
      user_id: user.id,
      amount: doubloonsWon,
      reason: `Captain's Board: ${categoryMeta(tile.category).label} for ${value} ⟡`,
    }))
  }
  await Promise.all(writes)

  return {
    correct,
    correctIndex: tile.correct_index,
    explanation: tile.explanation,
    doubloonsWon,
    totalAwarded,
    newDoubloons,
  }
}
