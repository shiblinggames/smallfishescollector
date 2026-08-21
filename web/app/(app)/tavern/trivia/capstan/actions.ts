'use server'

// Spin the Capstan — server-authoritative play. The phrases (with answers) only
// ever live server-side in trivia_capstan; clients get a MASKED length pattern and
// every spin, letter, and solve is judged here. A weekly set of 3, Captain-only.
// The wheel is rolled on the SERVER (a client can't forge the value it hits), and
// the round bank / strikes / pending spin are persisted so a reload can't re-roll.
// Types + pure helpers live in ../constants ('use server' drops non-async exports).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPremiumActive } from '@/lib/premium'
import { getThisWeeksCapstan, type GeneratedPuzzle } from './generate'
import {
  kingWeekStr,
  normalizeCapstan,
  capstanMask,
  capstanSolvePoints,
  parlorRank,
  isCapstanVowel,
  CAPSTAN_WHEEL,
  CAPSTAN_MAX_STRIKES,
  CAPSTAN_MAX_HAZARD_RUN,
  CAPSTAN_VOWEL_COST,
  type CapstanStatus,
  type CapstanState,
  type CapstanPuzzleClient,
  type CapstanSpinResult,
  type CapstanLetterResult,
  type CapstanSolveResult,
} from '../constants'

interface CapstanRun {
  /** EVERY letter tried, hit or miss. Misses live here too so the board can grey
   *  them out and the guards below can refuse a second go at a letter that is
   *  already known not to be in the phrase. */
  called: string[]
  bank: number
  strikes: number
  status: CapstanStatus
  pendingValue: number | null
  earned: number
  /** Hazards dealt back to back so far. See CAPSTAN_MAX_HAZARD_RUN. Optional
   *  because runs opened before this shipped do not carry it; readRun defaults it. */
  hazardRun?: number
}

const freshRun = (): CapstanRun => ({ called: [], bank: 0, strikes: 0, status: 'active', pendingValue: null, earned: 0, hazardRun: 0 })

type RunsMap = Record<string, CapstanRun>

function readRun(runs: RunsMap, index: number): CapstanRun {
  return { ...freshRun(), ...(runs[String(index)] ?? {}) }
}

function toClient(index: number, gen: GeneratedPuzzle, run: CapstanRun): CapstanPuzzleClient {
  const done = run.status !== 'active'
  return {
    index,
    category: gen.category,
    mask: capstanMask(gen.phrase, run.called),
    called: run.called,
    bank: run.bank,
    strikes: run.strikes,
    status: run.status,
    pendingValue: run.pendingValue,
    phrase: done ? normalizeCapstan(gen.phrase) : null,
    earned: run.earned,
  }
}

/** Auth + Captain gate + this week's puzzle set + the player's attempt row. */
async function load(): Promise<
  | { error: string }
  | { userId: string; admin: ReturnType<typeof createAdminClient>; week: string; puzzles: GeneratedPuzzle[]; runs: RunsMap; doubloonsAwarded: number }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Not signed in.' }

  const admin = createAdminClient()
  const { data: prof } = await admin
    .from('profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', user.id).single()
  if (!isPremiumActive(prof)) return { error: 'Spin the Capstan is a Captain-only game.' }

  const puzzles = await getThisWeeksCapstan()
  if (!puzzles || puzzles.length === 0) return { error: 'The capstan is being rigged. Check back shortly.' }

  const week = kingWeekStr()
  const { data: attempt } = await admin
    .from('trivia_capstan_attempts')
    .select('runs, doubloons_awarded')
    .eq('user_id', user.id).eq('date', week).single()

  return {
    userId: user.id,
    admin,
    week,
    puzzles,
    runs: (attempt?.runs as RunsMap | null) ?? {},
    doubloonsAwarded: (attempt?.doubloons_awarded as number | null) ?? 0,
  }
}

export async function getCapstanState(): Promise<CapstanState | { error: string }> {
  const ctx = await load()
  if ('error' in ctx) return ctx
  return {
    date: ctx.week,
    puzzles: ctx.puzzles.map((gen, i) => toClient(i, gen, readRun(ctx.runs, i))),
    doubloonsAwarded: ctx.doubloonsAwarded,
  }
}

async function persist(admin: ReturnType<typeof createAdminClient>, userId: string, week: string, runs: RunsMap, doubloonsAwarded: number) {
  await admin.from('trivia_capstan_attempts').upsert({
    user_id: userId,
    date: week,
    runs,
    doubloons_awarded: doubloonsAwarded,
    updated_at: new Date().toISOString(),
  })
}

/** Spin the capstan — the server rolls a wedge and resolves hazards immediately;
 *  a value wedge arms the next consonant call. */
export async function spinCapstan(index: number): Promise<CapstanSpinResult | { error: string }> {
  const ctx = await load()
  if ('error' in ctx) return ctx
  const gen = ctx.puzzles[index]
  if (!gen) return { error: 'No such puzzle.' }
  const run = readRun(ctx.runs, index)
  if (run.status !== 'active') return { error: 'This puzzle is already finished.' }
  if (run.pendingValue !== null) return { error: 'Call a letter first.' }

  // Server-authoritative roll — the client only learns which wedge afterward.
  //
  // After CAPSTAN_MAX_HAZARD_RUN hazards in a row the pool narrows to the value
  // wedges. Narrowing the POOL rather than re-rolling until it likes the answer
  // keeps every wedge equally likely within that pool, and still returns a real
  // index so the capstan animates to a wedge that is actually there.
  const spent = (run.hazardRun ?? 0) >= CAPSTAN_MAX_HAZARD_RUN
  const pool = CAPSTAN_WHEEL
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !spent || typeof w === 'number')
  const pick = pool[Math.floor(Math.random() * pool.length)]
  const wedgeIndex = pick.i
  const wedge = pick.w

  let outcome: CapstanSpinResult['outcome']
  if (wedge === 'overboard') {
    outcome = 'overboard'
    run.bank = 0
    run.hazardRun = (run.hazardRun ?? 0) + 1
  } else if (wedge === 'lose_turn') {
    outcome = 'lose_turn'
    run.strikes += 1
    run.hazardRun = (run.hazardRun ?? 0) + 1
    if (run.strikes >= CAPSTAN_MAX_STRIKES) run.status = 'failed'
  } else {
    outcome = 'value'
    run.pendingValue = wedge
    run.hazardRun = 0
  }

  ctx.runs[String(index)] = run
  await persist(ctx.admin, ctx.userId, ctx.week, ctx.runs, ctx.doubloonsAwarded)
  return { wedgeIndex, wedge, outcome, puzzle: toClient(index, gen, run) }
}

/** Call a consonant against the armed spin value. Hit → value × occurrences into the
 *  bank; miss → a strike. */
export async function callConsonant(index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const ctx = await load()
  if ('error' in ctx) return ctx
  const gen = ctx.puzzles[index]
  if (!gen) return { error: 'No such puzzle.' }
  const run = readRun(ctx.runs, index)
  if (run.status !== 'active') return { error: 'This puzzle is already finished.' }
  if (run.pendingValue === null) return { error: 'Spin the capstan first.' }

  const letter = (letterRaw ?? '').toUpperCase()
  if (!/^[A-Z]$/.test(letter) || isCapstanVowel(letter)) return { error: 'Call a single consonant.' }
  if (run.called.includes(letter)) return { error: 'You have already tried that letter.' }

  const value = run.pendingValue
  run.pendingValue = null
  const phrase = normalizeCapstan(gen.phrase)
  const count = phrase.split('').filter(ch => ch === letter).length
  let gained = 0
  // RECORDED EITHER WAY. A miss used to go unrecorded, so the board never greyed
  // it out and the guard above could not see it: the same dead letter could be
  // called again and again, burning a spin and a strike each time on information
  // the game already had.
  run.called.push(letter)
  if (count > 0) {
    gained = value * count
    run.bank += gained
  } else {
    run.strikes += 1
    if (run.strikes >= CAPSTAN_MAX_STRIKES) run.status = 'failed'
  }

  ctx.runs[String(index)] = run
  await persist(ctx.admin, ctx.userId, ctx.week, ctx.runs, ctx.doubloonsAwarded)
  return { letter, count, gained, puzzle: toClient(index, gen, run) }
}

/** Buy a vowel — a flat fee drawn from the round bank reveals it if present. A
 *  wasted fee (vowel absent) is its own cost; no strike. */
export async function buyVowel(index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const ctx = await load()
  if ('error' in ctx) return ctx
  const gen = ctx.puzzles[index]
  if (!gen) return { error: 'No such puzzle.' }
  const run = readRun(ctx.runs, index)
  if (run.status !== 'active') return { error: 'This puzzle is already finished.' }
  if (run.pendingValue !== null) return { error: 'Call your consonant first.' }

  const letter = (letterRaw ?? '').toUpperCase()
  if (!/^[A-Z]$/.test(letter) || !isCapstanVowel(letter)) return { error: 'Pick a vowel.' }
  if (run.called.includes(letter)) return { error: 'You have already tried that letter.' }
  if (run.bank < CAPSTAN_VOWEL_COST) return { error: `A vowel costs ${CAPSTAN_VOWEL_COST} in the bank.` }

  run.bank -= CAPSTAN_VOWEL_COST
  const phrase = normalizeCapstan(gen.phrase)
  const count = phrase.split('').filter(ch => ch === letter).length
  // Recorded even when absent, so a wasted fee is paid once rather than as many
  // times as the player is willing to tap the same vowel.
  run.called.push(letter)

  ctx.runs[String(index)] = run
  await persist(ctx.admin, ctx.userId, ctx.week, ctx.runs, ctx.doubloonsAwarded)
  return { letter, count, gained: 0, puzzle: toClient(index, gen, run) }
}

/** Solve attempt — a correct guess banks the round total (doubloons + parlor
 *  points toward the shared rank); a wrong one costs a strike. */
export async function solveCapstan(index: number, guessRaw: string): Promise<CapstanSolveResult | { error: string }> {
  const ctx = await load()
  if ('error' in ctx) return ctx
  const gen = ctx.puzzles[index]
  if (!gen) return { error: 'No such puzzle.' }
  const run = readRun(ctx.runs, index)
  if (run.status !== 'active') return { error: 'This puzzle is already finished.' }

  const phrase = normalizeCapstan(gen.phrase)
  const correct = normalizeCapstan(guessRaw ?? '') === phrase

  let newDoubloons: number | null = null
  let pointsEarned = 0
  let newPoints = 0
  let rankedUp = false

  if (correct) {
    run.pendingValue = null
    run.status = 'solved'
    // Reveal the whole phrase for the client's board.
    run.called = Array.from(new Set(phrase.replace(/ /g, '').split('')))
    run.earned = run.bank
    pointsEarned = capstanSolvePoints(run.strikes)

    // Read the currencies, pay doubloons + points in one profiles patch.
    const { data: prof } = await ctx.admin
      .from('profiles')
      .select('doubloons, parlor_points')
      .eq('id', ctx.userId).single()
    const prevDoubloons = (prof?.doubloons as number | null) ?? 0
    const prevPoints = (prof?.parlor_points as number | null) ?? 0
    newPoints = prevPoints + pointsEarned
    rankedUp = parlorRank(prevPoints).rank.title !== parlorRank(newPoints).rank.title
    newDoubloons = prevDoubloons + run.earned

    ctx.doubloonsAwarded += run.earned
    await ctx.admin.from('profiles').update({ doubloons: newDoubloons, parlor_points: newPoints }).eq('id', ctx.userId)
    if (run.earned > 0) {
      await ctx.admin.from('doubloon_transactions').insert({
        user_id: ctx.userId,
        amount: run.earned,
        reason: `Spin the Capstan: solved ${gen.category}`,
      })
    }
  } else {
    run.strikes += 1
    if (run.strikes >= CAPSTAN_MAX_STRIKES) run.status = 'failed'
  }

  ctx.runs[String(index)] = run
  await persist(ctx.admin, ctx.userId, ctx.week, ctx.runs, ctx.doubloonsAwarded)
  return {
    correct,
    puzzle: toClient(index, gen, run),
    earned: run.earned,
    newDoubloons,
    pointsEarned,
    newPoints,
    rankedUp,
  }
}
