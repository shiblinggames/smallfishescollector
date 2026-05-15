'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getTodaysFishPuzzle } from './fish-of-the-day/generate'

const MAX_GUESSES    = 4
const STARTING_GEMS  = 100

export type HintType = 'picture' | 'length' | 'first_letter' | 'attribute' | 'letter' | 'next_clue'

const HINT_COSTS: Record<HintType, number> = {
  picture:      40,
  next_clue:    25,
  length:       15,
  attribute:    10,
  first_letter:  8,
  letter:        5,
}

const ATTRIBUTE_KEYS = ['water_type', 'region', 'is_edible', 'size_category'] as const
const ATTRIBUTE_LABELS: Record<string, string> = {
  water_type:    'Water',
  region:        'Region',
  is_edible:     'Edible',
  size_category: 'Size',
}

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

type SpeciesAttrs = {
  name: string
  water_type: string | null
  region: string | null
  is_edible: boolean | null
  size_category: string | null
}

export interface HintsUsed {
  picture?: boolean
  length?: boolean
  first_letter?: boolean
  attributes?: string[]      // attribute keys, e.g. ['water_type', 'size_category']
  letters?: number[]         // character indices revealed in common_name
  next_clue_count?: number   // how many extra clues purchased (clue 1 is free)
}

export interface RevealedHints {
  picture_url: string | null      // populated only if picture hint bought
  word_lengths: number[] | null    // [4, 4] for "Mahi Mahi" — only if length hint bought
  first_letter: string | null
  attributes: { key: string; label: string; value: string }[]
  letters: { position: number; char: string }[]
}

export interface FishPuzzleState {
  date: string
  clues: string[]               // unlocked clues only — clue 1 free, rest bought
  cluesTotal: number
  guesses: string[]
  maxGuesses: number
  hintsUsed: HintsUsed
  hintBuysTotal: number         // total hints purchased; gates 1-per-round
  revealed: RevealedHints
  gemsRemaining: number
  hintCosts: Record<HintType, number>
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

function fishImageUrl(name: string): string {
  return `/fish/${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.png`
}

function gemsSpent(hints: HintsUsed): number {
  let spent = 0
  if (hints.picture)      spent += HINT_COSTS.picture
  if (hints.length)       spent += HINT_COSTS.length
  if (hints.first_letter) spent += HINT_COSTS.first_letter
  spent += (hints.attributes?.length    ?? 0) * HINT_COSTS.attribute
  spent += (hints.letters?.length       ?? 0) * HINT_COSTS.letter
  spent += (hints.next_clue_count       ?? 0) * HINT_COSTS.next_clue
  return spent
}

function hintBuysTotal(hints: HintsUsed): number {
  let n = 0
  if (hints.picture)      n += 1
  if (hints.length)       n += 1
  if (hints.first_letter) n += 1
  n += (hints.attributes?.length    ?? 0)
  n += (hints.letters?.length       ?? 0)
  n += (hints.next_clue_count       ?? 0)
  return n
}

function buildRevealed(hints: HintsUsed, answerName: string, answerAttrs: SpeciesAttrs | null): RevealedHints {
  const revealed: RevealedHints = {
    picture_url:  hints.picture ? fishImageUrl(answerName) : null,
    word_lengths: hints.length ? answerName.split(/\s+/).map(w => w.length) : null,
    first_letter: hints.first_letter ? answerName.charAt(0) : null,
    attributes:   [],
    letters:      [],
  }
  if (hints.attributes && answerAttrs) {
    for (const key of hints.attributes) {
      const raw = answerAttrs[key as keyof SpeciesAttrs]
      let value = ''
      if (key === 'is_edible') value = raw == null ? '' : raw ? 'Yes' : 'No'
      else value = (raw as string | null) ?? ''
      revealed.attributes.push({ key, label: ATTRIBUTE_LABELS[key] ?? key, value })
    }
  }
  if (hints.letters) {
    for (const pos of hints.letters) {
      const char = answerName.charAt(pos)
      if (char) revealed.letters.push({ position: pos, char })
    }
  }
  return revealed
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
  const isOver = solved || guesses.length >= MAX_GUESSES
  const hintsUsed: HintsUsed = (attempt?.hints_used as HintsUsed | null) ?? {}
  const cluesUnlocked = Math.min(1 + (hintsUsed.next_clue_count ?? 0), 4)
  const allClues = [fish.clue_1, fish.clue_2, fish.clue_3, fish.clue_4]

  // Resolve answer attrs (needed for revealed hints + once-over)
  let answerAttrs: SpeciesAttrs | null = null
  if (hintsUsed.attributes?.length || isOver) {
    const { data: rows } = await admin
      .from('fish_species')
      .select('name, water_type, region, is_edible, size_category')
      .eq('name', fish.common_name)
      .single()
    answerAttrs = (rows as SpeciesAttrs | null) ?? null
  }

  const revealed = buildRevealed(hintsUsed, fish.common_name, answerAttrs)
  const gemsRemaining = Math.max(0, STARTING_GEMS - gemsSpent(hintsUsed))

  return {
    date: today,
    clues: allClues.slice(0, isOver ? 4 : cluesUnlocked),
    cluesTotal: 4,
    guesses,
    maxGuesses: MAX_GUESSES,
    hintsUsed,
    hintBuysTotal: hintBuysTotal(hintsUsed),
    revealed,
    gemsRemaining,
    hintCosts: HINT_COSTS,
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
  isOver: boolean
  streak?: number
  milestoneReward?: number
  answer?: FishAnswer
  gemsRemaining: number
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

  if (existing?.solved || (existing?.guesses?.length ?? 0) >= MAX_GUESSES) {
    return { error: 'Already finished' }
  }

  const guesses: string[] = existing?.guesses ?? []
  const hintsUsed: HintsUsed = (existing?.hints_used as HintsUsed | null) ?? {}
  const correct = guessName.toLowerCase() === fish.common_name.toLowerCase()
  const newGuesses = [...guesses, guessName]
  const isOver = correct || newGuesses.length >= MAX_GUESSES
  const remaining = Math.max(0, STARTING_GEMS - gemsSpent(hintsUsed))
  const guessGems = correct ? remaining : 0

  const payload = { guesses: newGuesses, solved: correct, gems_awarded: guessGems }
  if (existing) {
    await admin.from('daily_fish_attempts').update(payload).eq('id', existing.id)
  } else {
    await admin.from('daily_fish_attempts').insert({ user_id: user.id, date: today, ...payload })
  }

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
      const newStreak = correct
        ? (profile.last_fotd_date === yesterday ? (profile.fotd_streak ?? 0) + 1 : 1)
        : 0
      const newLongest = Math.max(newStreak, profile.fotd_longest_streak ?? 0)
      const bonus = correct ? milestoneBonus(newStreak) : 0
      const newGems = (profile.gems ?? 0) + guessGems + bonus

      const writes: PromiseLike<unknown>[] = [
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
          reason: `Fish of the Day: ${fish.common_name} (${remaining} ◆ banked)`,
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

      return {
        correct,
        gems: correct ? guessGems : 0,
        isOver,
        streak: newStreak,
        milestoneReward: bonus > 0 ? bonus : undefined,
        answer,
        gemsRemaining: remaining,
      }
    }
  }

  return {
    correct,
    gems: correct ? guessGems : undefined,
    isOver,
    answer: isOver ? answer : undefined,
    gemsRemaining: remaining,
  }
}

export async function purchaseHint(type: HintType): Promise<
  | { ok: true; hintsUsed: HintsUsed; revealed: RevealedHints; gemsRemaining: number; hintBuysTotal: number; unlockedClue?: string }
  | { error: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' }

  const cost = HINT_COSTS[type]
  if (cost == null) return { error: 'Unknown hint type' }

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

  if (existing?.solved) return { error: 'Already solved' }
  const guessCount = existing?.guesses?.length ?? 0
  if (guessCount >= MAX_GUESSES) return { error: 'Out of guesses' }

  const hints: HintsUsed = (existing?.hints_used as HintsUsed | null) ?? {}
  // One hint per round: hint count must not exceed (current guess count + 1)
  if (hintBuysTotal(hints) > guessCount) return { error: 'Make a guess first' }
  const spentSoFar = gemsSpent(hints)
  if (spentSoFar + cost > STARTING_GEMS) return { error: 'Not enough gems remaining' }

  // Pull answer attrs/species pool as needed
  const { data: answerAttrsRow } = await admin
    .from('fish_species')
    .select('name, water_type, region, is_edible, size_category')
    .eq('name', fish.common_name)
    .single()
  const answerAttrs = (answerAttrsRow as SpeciesAttrs | null) ?? null

  const next: HintsUsed = { ...hints }

  if (type === 'picture') {
    if (hints.picture) return { error: 'Picture already revealed' }
    next.picture = true
  } else if (type === 'length') {
    if (hints.length) return { error: 'Length already revealed' }
    next.length = true
  } else if (type === 'first_letter') {
    if (hints.first_letter) return { error: 'First letter already revealed' }
    next.first_letter = true
  } else if (type === 'attribute') {
    const taken = new Set(hints.attributes ?? [])
    const remaining = ATTRIBUTE_KEYS.filter(k => !taken.has(k))
    if (remaining.length === 0) return { error: 'All attributes already revealed' }
    const pick = remaining[Math.floor(Math.random() * remaining.length)]
    next.attributes = [...(hints.attributes ?? []), pick]
  } else if (type === 'letter') {
    const taken = new Set(hints.letters ?? [])
    const allPositions = [...fish.common_name].map((ch, i) => ({ ch, i })).filter(p => /[a-zA-Z]/.test(p.ch))
    const remaining = allPositions.filter(p => !taken.has(p.i))
    if (remaining.length === 0) return { error: 'All letters already revealed' }
    const pick = remaining[Math.floor(Math.random() * remaining.length)]
    next.letters = [...(hints.letters ?? []), pick.i]
  } else if (type === 'next_clue') {
    const current = hints.next_clue_count ?? 0
    if (current >= 3) return { error: 'All clues already unlocked' }
    next.next_clue_count = current + 1
  }

  const payload = { hints_used: next }
  if (existing) {
    await admin.from('daily_fish_attempts').update(payload).eq('id', existing.id)
  } else {
    await admin.from('daily_fish_attempts').insert({
      user_id: user.id, date: today, guesses: [], solved: false, gems_awarded: 0, ...payload,
    })
  }

  const revealed = buildRevealed(next, fish.common_name, answerAttrs)
  const gemsRemaining = Math.max(0, STARTING_GEMS - gemsSpent(next))
  const allClues = [fish.clue_1, fish.clue_2, fish.clue_3, fish.clue_4]
  const unlockedClue = type === 'next_clue' ? allClues[next.next_clue_count!] : undefined
  return { ok: true, hintsUsed: next, revealed, gemsRemaining, hintBuysTotal: hintBuysTotal(next), unlockedClue }
}

export async function getAllFishNames(): Promise<string[]> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]
  const [{ data: eligible }, { data: todayPuzzle }] = await Promise.all([
    admin.from('fish_species').select('name').eq('fotd_eligible', true).order('name'),
    admin.from('daily_fish_generated').select('common_name').eq('date', today).single(),
  ])
  const names = new Set((eligible ?? []).map((r: { name: string }) => r.name))
  if (todayPuzzle?.common_name) names.add(todayPuzzle.common_name)
  return [...names].sort()
}
