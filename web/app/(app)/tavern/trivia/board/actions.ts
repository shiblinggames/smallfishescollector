'use server'

// The Captain's Board — server-authoritative play. The full board
// (with answers) only ever lives server-side; clients get a stripped
// payload and every answer is judged here. Types live in ../constants
// ('use server' files silently drop non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysBoard, type GeneratedTile } from './generate'
import {
  TRIVIA_TIER_VALUES,
  triviaTileKey,
  categoryMeta,
  type CaptainsBoardState,
  type BoardTileClient,
  type AnswerTileResult,
} from '../constants'

interface AttemptRow {
  answers: Record<string, { chosen: number; correct: boolean }>
  gems_awarded: number
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
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
      .select('answers, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!board) return { error: 'No board available right now. Try again in a moment.' }

  const answers = (attempt as AttemptRow | null)?.answers ?? {}

  const tiles: BoardTileClient[] = board.map(t => {
    const key = triviaTileKey(t.category, t.tier)
    const a = answers[key]
    return {
      key,
      category: t.category,
      tier: t.tier,
      value: TRIVIA_TIER_VALUES[t.tier - 1],
      question: t.question,
      options: t.options,
      answered: a
        ? { chosen: a.chosen, correct: a.correct, correctIndex: t.correct_index, explanation: t.explanation }
        : null,
    }
  })

  return {
    date: today,
    tiles,
    gemsAwarded: (attempt as AttemptRow | null)?.gems_awarded ?? 0,
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
      .select('answers, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
    admin.from('profiles').select('gems').eq('id', user.id).single(),
  ])
  if (!board) return { error: 'No board available' }

  const tile: GeneratedTile | undefined = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown tile' }

  const answers = (attempt as AttemptRow | null)?.answers ?? {}
  if (answers[key]) return { error: 'Tile already answered' }

  const correct = chosenIndex === tile.correct_index
  const value = TRIVIA_TIER_VALUES[tile.tier - 1]
  const gemsWon = correct ? value : 0
  const totalAwarded = ((attempt as AttemptRow | null)?.gems_awarded ?? 0) + gemsWon
  const newAnswers = { ...answers, [key]: { chosen: chosenIndex, correct } }

  const writes: PromiseLike<unknown>[] = [
    admin.from('trivia_board_attempts').upsert({
      user_id: user.id,
      date: today,
      answers: newAnswers,
      gems_awarded: totalAwarded,
    }),
  ]
  if (gemsWon > 0) {
    writes.push(
      admin.from('profiles')
        .update({ gems: (profile?.gems ?? 0) + gemsWon })
        .eq('id', user.id)
    )
    writes.push(
      admin.from('gem_transactions').insert({
        user_id: user.id,
        amount: gemsWon,
        reason: `Captain's Board: ${categoryMeta(tile.category).label} for ${value} ◆`,
      })
    )
  }
  await Promise.all(writes)

  return {
    correct,
    correctIndex: tile.correct_index,
    explanation: tile.explanation,
    gemsWon,
    totalAwarded,
  }
}
