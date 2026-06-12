'use server'

// The Captain's Board — server-authoritative play. The full board
// (with answers) only ever lives server-side; clients get a stripped
// payload and every answer is judged here. The player locks in ONE
// category column a day and climbs its three clues in order for
// doubloons; question text is withheld until the column is locked so
// nobody window-shops all four columns first. Types live in
// ../constants ('use server' files silently drop non-async exports
// at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysBoard, type GeneratedTile } from './generate'
import {
  TRIVIA_TIER_VALUES,
  TRIVIA_CATEGORY_KEYS,
  triviaTileKey,
  categoryMeta,
  type TriviaCategoryKey,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

interface AttemptRow {
  category: TriviaCategoryKey | null
  answers: Record<string, { chosen: number; correct: boolean }>
  doubloons_awarded: number
}

const ATTEMPT_COLS = 'category, answers, doubloons_awarded'

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function buildTiles(board: GeneratedTile[], a: AttemptRow): BoardTileClient[] {
  return board.map(t => {
    const key = triviaTileKey(t.category, t.tier)
    const ans = a.answers[key]
    const inLockedColumn = a.category === t.category
    return {
      key,
      category: t.category,
      tier: t.tier,
      value: TRIVIA_TIER_VALUES[t.tier - 1],
      question: inLockedColumn ? t.question : null,
      options: inLockedColumn ? t.options : null,
      answered: ans
        ? { chosen: ans.chosen, correct: ans.correct, correctIndex: t.correct_index, explanation: t.explanation }
        : null,
    }
  })
}

export async function getCaptainsBoardState(): Promise<CaptainsBoardState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const today = todayStr()

  const [board, { data: attempt }] = await Promise.all([
    getTodaysBoard(),
    admin.from('trivia_board_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!board) return { error: 'No board available right now. Try again in a moment.' }

  const a = (attempt as AttemptRow | null) ?? { category: null, answers: {}, doubloons_awarded: 0 }

  return {
    date: today,
    tiles: buildTiles(board, a),
    lockedCategory: a.category,
    doubloonsAwarded: a.doubloons_awarded,
  }
}

export async function lockCaptainsColumn(
  category: TriviaCategoryKey
): Promise<CaptainsBoardState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (!TRIVIA_CATEGORY_KEYS.includes(category)) return { error: 'Unknown category' }

  const admin = createAdminClient()
  const today = todayStr()

  const [board, { data: attempt }] = await Promise.all([
    getTodaysBoard(),
    admin.from('trivia_board_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!board) return { error: 'No board available' }

  const existing = attempt as AttemptRow | null
  if (existing?.category) return { error: 'A column is already locked in today' }

  await admin.from('trivia_board_attempts').upsert({
    user_id: user.id,
    date: today,
    category,
    answers: existing?.answers ?? {},
    doubloons_awarded: existing?.doubloons_awarded ?? 0,
  })

  const a: AttemptRow = { category, answers: existing?.answers ?? {}, doubloons_awarded: existing?.doubloons_awarded ?? 0 }
  return {
    date: today,
    tiles: buildTiles(board, a),
    lockedCategory: category,
    doubloonsAwarded: a.doubloons_awarded,
  }
}

export async function answerCaptainsTile(
  key: string,
  chosenIndex: number
): Promise<AnswerTileResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof chosenIndex !== 'number' || chosenIndex < 0 || chosenIndex > 3) {
    return { error: 'Invalid answer' }
  }

  const admin = createAdminClient()
  const today = todayStr()

  const [board, { data: attempt }, { data: profile }] = await Promise.all([
    getTodaysBoard(),
    admin.from('trivia_board_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', today)
      .single(),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])
  if (!board) return { error: 'No board available' }

  const a = (attempt as AttemptRow | null) ?? { category: null, answers: {}, doubloons_awarded: 0 }
  if (!a.category) return { error: 'Lock in a column first' }

  const tile: GeneratedTile | undefined = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown tile' }
  if (tile.category !== a.category) return { error: 'That column is not yours today' }
  if (a.answers[key]) return { error: 'Clue already answered' }

  // Clues climb in order: this tile must be the lowest unanswered
  // tier of the locked column.
  for (let tier = 1; tier < tile.tier; tier++) {
    if (!a.answers[triviaTileKey(a.category, tier)]) {
      return { error: 'Answer the clues in order' }
    }
  }

  const correct = chosenIndex === tile.correct_index
  const value = TRIVIA_TIER_VALUES[tile.tier - 1]
  const doubloonsWon = correct ? value : 0
  const totalAwarded = a.doubloons_awarded + doubloonsWon
  const newAnswers = { ...a.answers, [key]: { chosen: chosenIndex, correct } }

  const writes: PromiseLike<unknown>[] = [
    admin.from('trivia_board_attempts').upsert({
      user_id: user.id,
      date: today,
      category: a.category,
      answers: newAnswers,
      doubloons_awarded: totalAwarded,
    }),
  ]
  if (doubloonsWon > 0) {
    writes.push(
      admin.from('profiles')
        .update({ doubloons: (profile?.doubloons ?? 0) + doubloonsWon })
        .eq('id', user.id)
    )
    writes.push(
      admin.from('doubloon_transactions').insert({
        user_id: user.id,
        amount: doubloonsWon,
        reason: `Captain's Board: ${categoryMeta(tile.category).label} for ${value} ⟡`,
      })
    )
  }
  await Promise.all(writes)

  return {
    correct,
    correctIndex: tile.correct_index,
    explanation: tile.explanation,
    doubloonsWon,
    totalAwarded,
  }
}
