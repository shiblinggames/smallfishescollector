'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

const CORRECT_REWARD = 50

export interface SubmitResult {
  correct: boolean
  correctIndex: number
  explanation: string
  reward: number
  newDoubloons: number
}

export async function submitQuizAnswer(
  chosenIndex: number
): Promise<SubmitResult | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: existing }, { data: quiz }, { data: profile }] = await Promise.all([
    admin.from('quiz_answers').select('correct, reward').eq('user_id', user.id).eq('date', today).single(),
    admin.from('daily_quiz').select('correct_index, explanation').eq('date', today).single(),
    admin.from('profiles').select('doubloons').eq('id', user.id).single(),
  ])

  if (existing) return { error: 'Already answered today' }
  if (!quiz) return { error: 'No quiz available' }

  const correct = chosenIndex === quiz.correct_index
  const reward = correct ? CORRECT_REWARD : 0
  const newDoubloons = (profile?.doubloons ?? 0) + reward

  await Promise.all([
    admin.from('quiz_answers').insert({
      user_id: user.id,
      date: today,
      chosen_index: chosenIndex,
      correct,
      reward,
    }),
    ...(reward > 0
      ? [admin.from('profiles').update({ doubloons: newDoubloons }).eq('id', user.id)]
      : []),
  ])

  revalidatePath('/tavern')

  return {
    correct,
    correctIndex: quiz.correct_index,
    explanation: quiz.explanation,
    reward,
    newDoubloons,
  }
}
