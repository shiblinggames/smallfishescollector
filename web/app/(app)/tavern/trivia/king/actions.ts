'use server'

// Pirate King — server-authoritative play. The full ladder (with
// answers) only ever lives server-side; clients get the current
// question stripped, every answer is judged here, and the 50/50's
// removed options are persisted so a reload can't re-roll them.
// Types live in ../constants ('use server' files silently drop
// non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysLadder, type GeneratedRung } from './generate'
import {
  PIRATE_KING_PRIZES,
  PIRATE_KING_RUNGS,
  kingHavenValue,
  type PirateKingState,
  type PirateKingStatus,
  type KingQuestionClient,
  type AnswerKingResult,
} from '../constants'

interface AttemptRow {
  rung: number
  status: PirateKingStatus
  fifty: { rung: number; removed: number[] } | null
  gems_awarded: number
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function stripQuestion(q: GeneratedRung, rung: number, fifty: AttemptRow['fifty']): KingQuestionClient {
  return {
    question: q.question,
    options: q.options,
    removed: fifty && fifty.rung === rung ? fifty.removed : [],
  }
}

async function payOut(userId: string, gems: number, reason: string) {
  if (gems <= 0) return
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('gems').eq('id', userId).single()
  await Promise.all([
    admin.from('profiles').update({ gems: (profile?.gems ?? 0) + gems }).eq('id', userId),
    admin.from('gem_transactions').insert({ user_id: userId, amount: gems, reason }),
  ])
}

export async function getPirateKingState(): Promise<PirateKingState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const today = todayStr()

  const [ladder, { data: attempt }] = await Promise.all([
    getTodaysLadder(),
    admin.from('trivia_ladder_attempts')
      .select('rung, status, fifty, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!ladder) return { error: 'No ladder available right now. Try again in a moment.' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, gems_awarded: 0 }

  return {
    date: today,
    status: a.status,
    rung: a.rung,
    gemsAwarded: a.gems_awarded,
    fiftyUsed: a.fifty !== null,
    current: a.status === 'active' ? stripQuestion(ladder[a.rung], a.rung, a.fifty) : null,
  }
}

export async function answerKingRung(
  rung: number,
  chosenIndex: number
): Promise<AnswerKingResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  if (typeof chosenIndex !== 'number' || chosenIndex < 0 || chosenIndex > 3) {
    return { error: 'Invalid answer' }
  }

  const admin = createAdminClient()
  const today = todayStr()

  const [ladder, { data: attempt }] = await Promise.all([
    getTodaysLadder(),
    admin.from('trivia_ladder_attempts')
      .select('rung, status, fifty, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!ladder) return { error: 'No ladder available' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, gems_awarded: 0 }
  if (a.status !== 'active') return { error: 'The run is over for today' }
  // Stale client / double submit guard: the answer must target the
  // rung the server says is current.
  if (rung !== a.rung) return { error: 'Out of step with the ladder' }
  // The 50/50 already struck this option.
  if (a.fifty && a.fifty.rung === rung && a.fifty.removed.includes(chosenIndex)) {
    return { error: 'That option was struck by the 50/50' }
  }

  const q = ladder[rung]
  const correct = chosenIndex === q.correct_index

  let status: PirateKingStatus
  let newRung: number
  let gems = 0
  if (correct) {
    newRung = rung + 1
    status = newRung === PIRATE_KING_RUNGS ? 'crowned' : 'active'
    if (status === 'crowned') gems = PIRATE_KING_PRIZES[PIRATE_KING_RUNGS - 1]
  } else {
    newRung = rung
    status = 'busted'
    gems = kingHavenValue(rung)
  }

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: today,
    rung: newRung,
    status,
    fifty: a.fifty,
    gems_awarded: status === 'active' ? 0 : gems,
  })

  if (status === 'crowned') {
    await payOut(user.id, gems, `Pirate King: crowned, all ${PIRATE_KING_RUNGS} questions`)
  } else if (status === 'busted' && gems > 0) {
    await payOut(user.id, gems, `Pirate King: fell to the haven at ${gems} ◆`)
  }

  return {
    correct,
    correctIndex: q.correct_index,
    explanation: q.explanation,
    status,
    rung: newRung,
    gemsAwarded: status === 'active' ? 0 : gems,
    next: status === 'active' ? stripQuestion(ladder[newRung], newRung, a.fifty) : null,
  }
}

// Named spend*, not use*: a use-prefixed export trips the React
// rules-of-hooks lint when called inside a transition callback.
export async function spendKingFiftyFifty(): Promise<{ removed: number[] } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const today = todayStr()

  const [ladder, { data: attempt }] = await Promise.all([
    getTodaysLadder(),
    admin.from('trivia_ladder_attempts')
      .select('rung, status, fifty, gems_awarded')
      .eq('user_id', user.id).eq('date', today)
      .single(),
  ])
  if (!ladder) return { error: 'No ladder available' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, gems_awarded: 0 }
  if (a.status !== 'active') return { error: 'The run is over for today' }
  if (a.fifty) return { error: 'The 50/50 is already spent' }

  // Strike two of the three wrong options at random.
  const q = ladder[a.rung]
  const wrong = [0, 1, 2, 3].filter(i => i !== q.correct_index)
  wrong.splice(Math.floor(Math.random() * wrong.length), 1)
  const removed = wrong.sort((x, y) => x - y)

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: today,
    rung: a.rung,
    status: 'active',
    fifty: { rung: a.rung, removed },
    gems_awarded: 0,
  })

  return { removed }
}

export async function walkKingAway(): Promise<{ status: 'walked'; gemsAwarded: number } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const today = todayStr()

  const { data: attempt } = await admin.from('trivia_ladder_attempts')
    .select('rung, status, fifty, gems_awarded')
    .eq('user_id', user.id).eq('date', today)
    .single()

  const a = attempt as AttemptRow | null
  if (!a || a.status !== 'active') return { error: 'No run to walk away from' }
  if (a.rung < 1) return { error: 'Answer at least one question first' }

  const gems = PIRATE_KING_PRIZES[a.rung - 1]

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: today,
    rung: a.rung,
    status: 'walked',
    fifty: a.fifty,
    gems_awarded: gems,
  })
  await payOut(user.id, gems, `Pirate King: walked at rung ${a.rung} with ${gems} ◆`)

  return { status: 'walked', gemsAwarded: gems }
}
