'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const DOUBLOON_REWARDS = [100, 75, 50, 25]

export interface FishPuzzleState {
  date: string
  cluesRevealed: string[]
  guesses: string[]
  solved: boolean
  isOver: boolean
  doubloons_awarded: number
  answer?: {
    common_name: string
    scientific_name: string | null
    fun_fact: string
  }
}

async function getTodaysFish(admin: ReturnType<typeof createAdminClient>, today: string) {
  const { data: scheduled } = await admin
    .from('daily_fish')
    .select('fish(*)')
    .eq('date', today)
    .single()

  if (scheduled?.fish) return scheduled.fish as any

  // Deterministic fallback: pick fish by day number
  const dayNumber = Math.floor(new Date(today + 'T00:00:00Z').getTime() / 86400000)
  const { data: allFish } = await admin.from('fish').select('*').order('id')
  if (!allFish?.length) return null
  return allFish[dayNumber % allFish.length]
}

export async function getDailyFishPuzzle(): Promise<FishPuzzleState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const fish = await getTodaysFish(admin, today)
  if (!fish) return { error: 'No fish available' }

  const { data: attempt } = await admin
    .from('daily_fish_attempts')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  const guesses: string[] = attempt?.guesses ?? []
  const solved: boolean = attempt?.solved ?? false
  const isOver = solved || guesses.length >= 4

  const wrongCount = solved ? guesses.length - 1 : guesses.length
  const numClues = Math.min(wrongCount + 1, 4)
  const cluesRevealed = [fish.clue_1, fish.clue_2, fish.clue_3, fish.clue_4].slice(0, numClues)

  return {
    date: today,
    cluesRevealed,
    guesses,
    solved,
    isOver,
    doubloons_awarded: attempt?.doubloons_awarded ?? 0,
    answer: isOver ? {
      common_name: fish.common_name,
      scientific_name: fish.scientific_name,
      fun_fact: fish.fun_fact,
    } : undefined,
  }
}

export async function submitFishGuess(guessName: string): Promise<{
  correct: boolean
  doubloons?: number
  nextClue?: string
  isOver: boolean
  answer?: { common_name: string; scientific_name: string | null; fun_fact: string }
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const fish = await getTodaysFish(admin, today)
  if (!fish) return { error: 'No fish today' }

  const { data: existing } = await admin
    .from('daily_fish_attempts')
    .select('*')
    .eq('user_id', user.id)
    .eq('date', today)
    .single()

  if (existing?.solved || (existing?.guesses?.length ?? 0) >= 4) {
    return { error: 'Already finished' }
  }

  const guesses: string[] = existing?.guesses ?? []
  const guessIndex = guesses.length
  const correct = guessName.toLowerCase() === fish.common_name.toLowerCase()
  const newGuesses = [...guesses, guessName]
  const isOver = correct || newGuesses.length >= 4
  const doubloons = correct ? (DOUBLOON_REWARDS[guessIndex] ?? 0) : 0

  const payload = { guesses: newGuesses, solved: correct, doubloons_awarded: doubloons }

  if (existing) {
    await admin.from('daily_fish_attempts').update(payload).eq('id', existing.id)
  } else {
    await admin.from('daily_fish_attempts').insert({ user_id: user.id, date: today, ...payload })
  }

  if (correct && doubloons > 0) {
    const { data: profile } = await admin.from('profiles').select('doubloons').eq('id', user.id).single()
    if (profile) {
      await Promise.all([
        admin.from('profiles').update({ doubloons: profile.doubloons + doubloons }).eq('id', user.id),
        admin.from('doubloon_transactions').insert({
          user_id: user.id,
          amount: doubloons,
          reason: `Fish of the Day: ${fish.common_name} in ${guessIndex + 1} guess${guessIndex + 1 !== 1 ? 'es' : ''}`,
        }),
      ])
    }
  }

  const allClues = [fish.clue_1, fish.clue_2, fish.clue_3, fish.clue_4]
  const nextClue = !correct && newGuesses.length < 4 ? allClues[newGuesses.length] : undefined

  return {
    correct,
    doubloons: correct ? doubloons : undefined,
    nextClue,
    isOver,
    answer: isOver ? {
      common_name: fish.common_name,
      scientific_name: fish.scientific_name,
      fun_fact: fish.fun_fact,
    } : undefined,
  }
}

export async function getAllFishNames(): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin.from('fish').select('common_name').order('common_name')
  return (data ?? []).map(r => r.common_name)
}
