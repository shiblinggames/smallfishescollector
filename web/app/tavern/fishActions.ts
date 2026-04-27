'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAchievements } from '@/lib/checkAchievements'
import { getTodaysFishPuzzle } from './fish-of-the-day/generate'
import { FISH_SPECIES } from '@/lib/fish-species'

const GEM_REWARDS = [100, 75, 50, 25]

export interface FishAnswer {
  common_name: string
  scientific_name: string | null
  fun_fact: string
  habitat?: string
  diet?: string
  size?: string
  conservation_status?: string
  range?: string
}

export interface FishPuzzleState {
  date: string
  cluesRevealed: string[]
  guesses: string[]
  solved: boolean
  isOver: boolean
  gems_awarded: number
  streak: number
  longestStreak: number
  answer?: FishAnswer
}

function milestoneBonus(streak: number): number {
  if (streak === 3) return 25
  if (streak % 30 === 0) return 150
  if (streak % 7 === 0) return 50
  return 0
}

export async function getDailyFishPuzzle(): Promise<FishPuzzleState | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const fish = await getTodaysFishPuzzle()
  if (!fish) return { error: 'No fish available' }

  const [{ data: attempt }, { data: profile }] = await Promise.all([
    admin.from('daily_fish_attempts').select('*').eq('user_id', user.id).eq('date', today).single(),
    admin.from('profiles').select('fotd_streak, fotd_longest_streak').eq('id', user.id).single(),
  ])

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
    gems_awarded: attempt?.gems_awarded ?? 0,
    streak: profile?.fotd_streak ?? 0,
    longestStreak: profile?.fotd_longest_streak ?? 0,
    answer: isOver ? {
      common_name: fish.common_name,
      scientific_name: fish.scientific_name,
      fun_fact: fish.fun_fact,
      habitat: fish.habitat,
      diet: fish.diet,
      size: fish.size,
      conservation_status: fish.conservation_status,
      range: fish.range,
    } : undefined,
  }
}

export async function submitFishGuess(guessName: string): Promise<{
  correct: boolean
  gems?: number
  nextClue?: string
  isOver: boolean
  streak?: number
  milestoneReward?: number
  newAchievements?: string[]
  answer?: FishAnswer
} | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const fish = await getTodaysFishPuzzle()
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
  const guessGems = correct ? (GEM_REWARDS[guessIndex] ?? 0) : 0

  const payload = { guesses: newGuesses, solved: correct, gems_awarded: guessGems }
  if (existing) {
    await admin.from('daily_fish_attempts').update(payload).eq('id', existing.id)
  } else {
    await admin.from('daily_fish_attempts').insert({ user_id: user.id, date: today, ...payload })
  }

  const allClues = [fish.clue_1, fish.clue_2, fish.clue_3, fish.clue_4]
  const nextClue = !correct && newGuesses.length < 4 ? allClues[newGuesses.length] : undefined

  const answer: FishAnswer = {
    common_name: fish.common_name,
    scientific_name: fish.scientific_name,
    fun_fact: fish.fun_fact,
    habitat: fish.habitat,
    diet: fish.diet,
    size: fish.size,
    conservation_status: fish.conservation_status,
    range: fish.range,
  }

  if (isOver) {
    const { data: profile } = await admin
      .from('profiles')
      .select('gems, fotd_streak, fotd_longest_streak, last_fotd_date')
      .eq('id', user.id)
      .single()

    if (profile) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
      const newStreak = profile.last_fotd_date === yesterday
        ? (profile.fotd_streak ?? 0) + 1
        : 1
      const newLongest = Math.max(newStreak, profile.fotd_longest_streak ?? 0)
      const bonus = milestoneBonus(newStreak)
      const newGems = (profile.gems ?? 0) + guessGems + bonus

      const writes: any[] = [
        admin.from('profiles').update({
          gems: newGems,
          fotd_streak: newStreak,
          fotd_longest_streak: newLongest,
          last_fotd_date: today,
        }).eq('id', user.id),
      ]
      if (correct && guessGems > 0) {
        writes.push(admin.from('gem_transactions').insert({
          user_id: user.id,
          amount: guessGems,
          reason: `Fish of the Day: ${fish.common_name} in ${guessIndex + 1} guess${guessIndex + 1 !== 1 ? 'es' : ''}`,
        }))
      }
      if (bonus > 0) {
        writes.push(admin.from('gem_transactions').insert({
          user_id: user.id,
          amount: bonus,
          reason: `Fish of the Day: ${newStreak}-day streak`,
        }))
      }
      await Promise.all(writes)

      const newAchievements = await checkAchievements(user.id, {
        type: 'fotd',
        streak: newStreak,
        guessCount: correct ? guessIndex + 1 : 4,
      })

      return {
        correct,
        gems: correct ? guessGems : undefined,
        nextClue,
        isOver,
        streak: newStreak,
        milestoneReward: bonus > 0 ? bonus : undefined,
        newAchievements,
        answer,
      }
    }
  }

  return {
    correct,
    gems: correct ? guessGems : undefined,
    nextClue,
    isOver,
    answer: isOver ? answer : undefined,
  }
}

export async function getAllFishNames(): Promise<string[]> {
  return [...FISH_SPECIES].sort()
}
