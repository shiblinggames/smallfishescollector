'use server'

// Pirate King — server-authoritative play. The full ladder (with
// answers) only ever lives server-side; clients get the current
// question stripped, every answer is judged here, and the 50/50's
// removed options are persisted so a reload can't re-roll them.
// One run per WEEK, keyed by the Monday week-start; pays doubloons.
// Types live in ../constants ('use server' files silently drop
// non-async exports at build).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { grantBadgeDirect } from '@/lib/badgeGrant'
import { getThisWeeksLadder, type GeneratedRung } from './generate'
import {
  PIRATE_KING_PRIZES,
  PIRATE_KING_RUNGS,
  PIRATE_KING_CROWN_GEMS,
  kingHavenValue,
  kingWeekStr,
  type PirateKingState,
  type PirateKingStatus,
  type KingQuestionClient,
  type AnswerKingResult,
} from '../constants'

interface AttemptRow {
  rung: number
  status: PirateKingStatus
  fifty: { rung: number; removed: number[] } | null
  doubloons_awarded: number
}

const ATTEMPT_COLS = 'rung, status, fifty, doubloons_awarded'

function stripQuestion(q: GeneratedRung, rung: number, fifty: AttemptRow['fifty']): KingQuestionClient {
  return {
    question: q.question,
    options: q.options,
    removed: fifty && fifty.rung === rung ? fifty.removed : [],
  }
}

/** Pays doubloons and returns the new wallet total (null if nothing
 *  was paid) so the client can tick the Nav header. */
async function payOut(userId: string, amount: number, reason: string): Promise<number | null> {
  if (amount <= 0) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', userId).single()
  const newTotal = (profile?.doubloons ?? 0) + amount
  await Promise.all([
    admin.from('profiles').update({ doubloons: newTotal }).eq('id', userId),
    admin.from('doubloon_transactions').insert({ user_id: userId, amount, reason }),
  ])
  return newTotal
}

/** Grants gems (the crown bonus) and returns the new gem total, null if none.
 *  Sequential after payOut so the two profile writes never clobber each other. */
async function payGems(userId: string, amount: number): Promise<number | null> {
  if (amount <= 0) return null
  const admin = createAdminClient()
  const { data: profile } = await admin.from('profiles').select('gems').eq('id', userId).single()
  const newTotal = (profile?.gems ?? 0) + amount
  await admin.from('profiles').update({ gems: newTotal }).eq('id', userId)
  return newTotal
}

export async function getPirateKingState(): Promise<PirateKingState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const week = kingWeekStr()

  const [ladder, { data: attempt }] = await Promise.all([
    getThisWeeksLadder(),
    admin.from('trivia_ladder_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', week)
      .single(),
  ])
  if (!ladder) return { error: 'No ladder available right now. Try again in a moment.' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, doubloons_awarded: 0 }

  return {
    date: week,
    status: a.status,
    rung: a.rung,
    doubloonsAwarded: a.doubloons_awarded,
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
  const week = kingWeekStr()

  const [ladder, { data: attempt }, { data: prof }] = await Promise.all([
    getThisWeeksLadder(),
    admin.from('trivia_ladder_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', week)
      .single(),
    admin.from('profiles').select('parlor_streak, parlor_best_streak').eq('id', user.id).single(),
  ])
  if (!ladder) return { error: 'No ladder available' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, doubloons_awarded: 0 }
  if (a.status !== 'active') return { error: 'The run is over for this week' }
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
  let won = 0
  if (correct) {
    newRung = rung + 1
    status = newRung === PIRATE_KING_RUNGS ? 'crowned' : 'active'
    if (status === 'crowned') won = PIRATE_KING_PRIZES[PIRATE_KING_RUNGS - 1]
  } else {
    newRung = rung
    status = 'busted'
    won = kingHavenValue(rung)
  }

  // The crown (all 10 rungs) also banks a gem bonus — the Parlor's premium prize.
  // Idempotent by the status !== 'active' guard above, so it pays exactly once.
  const gemsWon = status === 'crowned' ? PIRATE_KING_CROWN_GEMS : 0

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: week,
    rung: newRung,
    status,
    fifty: a.fifty,
    doubloons_awarded: status === 'active' ? 0 : won,
    gems_awarded: gemsWon,
  })

  let newDoubloons: number | null = null
  let newGems: number | null = null
  if (status === 'crowned') {
    newDoubloons = await payOut(user.id, won, `Pirate King: crowned, all ${PIRATE_KING_RUNGS} questions`)
    newGems = await payGems(user.id, gemsWon)
  } else if (status === 'busted' && won > 0) {
    newDoubloons = await payOut(user.id, won, `Pirate King: fell to the haven at ${won} ⟡`)
  }

  // Parlor streak (shared with the Board): a right answer extends it, a bust
  // breaks it. Own column-only write, sequential after the payouts.
  const prevStreak = (prof?.parlor_streak as number | null) ?? 0
  const prevBest = (prof?.parlor_best_streak as number | null) ?? 0
  const currentStreak = correct ? prevStreak + 1 : 0
  const brokeStreak = correct ? 0 : prevStreak
  const bestStreak = Math.max(prevBest, currentStreak)
  await admin.from('profiles').update({ parlor_streak: currentStreak, parlor_best_streak: bestStreak }).eq('id', user.id)

  // Badge hooks (best-effort): the crown, and the rung-7 stepping stone.
  if (status === 'crowned') { try { await grantBadgeDirect(user.id, 'crowned') } catch { /* best-effort */ } }
  if (newRung >= 7) { try { await grantBadgeDirect(user.id, 'throne_in_sight') } catch { /* best-effort */ } }

  return {
    correct,
    correctIndex: q.correct_index,
    explanation: q.explanation,
    status,
    rung: newRung,
    doubloonsAwarded: status === 'active' ? 0 : won,
    newDoubloons,
    gemsWon,
    newGems,
    currentStreak,
    brokeStreak,
    bestStreak,
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
  const week = kingWeekStr()

  const [ladder, { data: attempt }] = await Promise.all([
    getThisWeeksLadder(),
    admin.from('trivia_ladder_attempts')
      .select(ATTEMPT_COLS)
      .eq('user_id', user.id).eq('date', week)
      .single(),
  ])
  if (!ladder) return { error: 'No ladder available' }

  const a = (attempt as AttemptRow | null) ?? { rung: 0, status: 'active' as const, fifty: null, doubloons_awarded: 0 }
  if (a.status !== 'active') return { error: 'The run is over for this week' }
  if (a.fifty) return { error: 'The 50/50 is already spent' }

  // Strike two of the three wrong options at random.
  const q = ladder[a.rung]
  const wrong = [0, 1, 2, 3].filter(i => i !== q.correct_index)
  wrong.splice(Math.floor(Math.random() * wrong.length), 1)
  const removed = wrong.sort((x, y) => x - y)

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: week,
    rung: a.rung,
    status: 'active',
    fifty: { rung: a.rung, removed },
    doubloons_awarded: 0,
  })

  return { removed }
}

export async function walkKingAway(): Promise<{ status: 'walked'; doubloonsAwarded: number; newDoubloons: number | null } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const week = kingWeekStr()

  const { data: attempt } = await admin.from('trivia_ladder_attempts')
    .select(ATTEMPT_COLS)
    .eq('user_id', user.id).eq('date', week)
    .single()

  const a = attempt as AttemptRow | null
  if (!a || a.status !== 'active') return { error: 'No run to walk away from' }
  if (a.rung < 1) return { error: 'Answer at least one question first' }

  const won = PIRATE_KING_PRIZES[a.rung - 1]

  await admin.from('trivia_ladder_attempts').upsert({
    user_id: user.id,
    date: week,
    rung: a.rung,
    status: 'walked',
    fifty: a.fifty,
    doubloons_awarded: won,
  })
  const newDoubloons = await payOut(user.id, won, `Pirate King: walked at rung ${a.rung} with ${won} ⟡`)

  return { status: 'walked', doubloonsAwarded: won, newDoubloons }
}
