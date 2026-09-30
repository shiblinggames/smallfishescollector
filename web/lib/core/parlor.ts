// ── THE PARLOR, CORE (Steam prep, 2026-09-29) ──
//
// The Parlor's three games and its rank with nothing of the web in them: the
// Captain's Board (one card a day off a weekly board of twelve), Spin the
// Capstan (a weekly set of phrases, Captain-only), the Pirate King (a weekly
// ten-rung ladder) and the rank rewards they all climb. Each takes the store
// (TriviaData) and the captain's id. On the web the server actions
// (tavern/trivia/actions, board/actions, capstan/actions, king/actions) check
// the session and hand these the Supabase store; offline, the local save's,
// which plays the week's questions from the shipped bank.
//
// Server-authoritative play: the questions with their answers live in the
// store; the client gets a stripped payload and every answer, spin, letter and
// solve is judged here. Every game moves its row only from the exact state it
// read, and pays only if this request made the move.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; every table read and guarded write became a store operation; the day,
// the week and the answer clocks read the game clock.

import { clockNow } from '@/lib/clock'
import { isPremiumActive } from '@/lib/premium'
import { rngNext } from '@/lib/rng'
import {
  TRIVIA_TIER_VALUES, triviaTileKey, categoryMeta, kingWeekStr, boardCardPoints, parlorRank, triviaTimedOut,
  nextClaimableParlorRank,
  normalizeCapstan, capstanMask, capstanSolvePoints, isCapstanVowel,
  CAPSTAN_WHEEL, CAPSTAN_MAX_STRIKES, CAPSTAN_MAX_HAZARD_RUN, CAPSTAN_VOWEL_COST,
  PIRATE_KING_PRIZES, PIRATE_KING_RUNGS, KING_RUNG_POINTS, KING_CROWN_POINTS, kingHavenValue,
  type CaptainsBoardState, type BoardTileClient, type AnswerTileResult,
  type CapstanState, type CapstanPuzzleClient, type CapstanSpinResult, type CapstanLetterResult, type CapstanSolveResult,
  type PirateKingState, type PirateKingStatus, type KingQuestionClient, type KingRevealResult, type AnswerKingResult,
} from '@/app/(app)/tavern/trivia/constants'
import type { GeneratedTile } from '@/app/(app)/tavern/trivia/board/generate'
import type { GeneratedPuzzle } from '@/app/(app)/tavern/trivia/capstan/generate'
import type { GeneratedRung } from '@/app/(app)/tavern/trivia/king/generate'
import type { TriviaData, BoardAnswerEntry, BoardAttemptRow, CapstanRun, CapstanRuns, LadderAttemptRow } from '@/lib/data/triviaData'

const nowIso = () => new Date(clockNow()).toISOString()
const todayStr = () => nowIso().split('T')[0]
const weekStr = () => kingWeekStr(new Date(clockNow()))

// ── The Parlor's rank ─────────────────────────────────────────────────────────
//
// The rank rewards are CLAIMED, not auto-paid. Points accumulate as you play;
// each rank your points have reached then waits in the lobby to be collected
// for its gems, one tap at a time. `parlor_rank_gems_awarded` holds the running
// total already claimed and is the double-claim guard.

export type ClaimParlorResult =
  | {
      ok: true
      title: string
      color: string
      gemsWon: number
      newGems: number
      newAwarded: number
      /** True when another reached-but-unclaimed rank is still waiting. */
      moreClaimable: boolean
    }
  | { error: string }

/** Collect the next unclaimed rank the player has reached. Pays exactly ONE rank's
 *  gems (the lowest reached-but-unpaid), advancing the awarded total to that rank's
 *  boundary so it can never pay twice, even if the Board and King both crossed it. */
export async function claimParlorRank(db: TriviaData, uid: string): Promise<ClaimParlorResult> {
  const profile = await db.profile(uid, 'parlor_points, parlor_rank_gems_awarded, gems')

  const points = (profile?.parlor_points as number | null) ?? 0
  const claimed = (profile?.parlor_rank_gems_awarded as number | null) ?? 0

  const next = nextClaimableParlorRank(points, claimed)
  if (!next) return { error: 'No rank to claim yet.' }

  const gemsWon = next.rank.gems
  const newAwarded = next.cumGems
  // Advance the claimed total FIRST, and only from the value we read. Two taps
  // fired together both reach here; only the one whose write lands is paid.
  const moved = await db.updateProfileIf(uid, { parlor_rank_gems_awarded: newAwarded },
    [profile?.parlor_rank_gems_awarded == null ? { col: 'parlor_rank_gems_awarded', is: null } : { col: 'parlor_rank_gems_awarded', eq: claimed }])
  if (!moved) return { error: 'That rank was already collected.' }

  const newGems = await db.grant(uid, 'gems', gemsWon)
  await db.ledger(uid, gemsWon, `The Parlor: ${next.rank.title}`, 'gems')

  // Point-based Parlor badges, granted the moment the matching rank is collected.
  if (points >= 85) db.grantBadge(uid, 'parlor_cardsharp').catch(() => {})
  if (points >= 520) db.grantBadge(uid, 'parlor_kingpin').catch(() => {})
  if (points >= 1000) db.grantBadge(uid, 'parlor_legend').catch(() => {})

  const more = nextClaimableParlorRank(points, newAwarded)
  return { ok: true, title: next.rank.title, color: next.rank.color, gemsWon, newGems, newAwarded, moreClaimable: !!more }
}

/** First-visit Parlor guide dismissal (see components/LobbyGuide). */
export async function markParlorGuideSeen(db: TriviaData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_parlor_guide: true })
}

// ── The Captain's Board ───────────────────────────────────────────────────────
//
// The board is WEEKLY (fresh each Monday) and the player plays ONE card a day
// (two for members): they commit to a card, which reveals its question (you
// can't read all 12 and cherry-pick the easy one), then answer it for
// doubloons. Over a week they pick up to 7 of the 12 cards.

/** The card committed today but not yet answered: the resume target. */
function committedKeyToday(answers: Record<string, BoardAnswerEntry>, today: string): string | null {
  for (const [k, a] of Object.entries(answers)) {
    if (a.day === today && a.chosen === undefined) return k
  }
  return null
}
/** How many cards the player has played today (committed OR answered). */
function playsToday(answers: Record<string, BoardAnswerEntry>, today: string): number {
  return Object.values(answers).filter(a => a.day === today).length
}
/** Picks per day: 1 for everyone, 2 for members. */
const MEMBER_PICKS = 2
const FREE_PICKS = 1

async function picksAllowedFor(db: TriviaData, uid: string): Promise<number> {
  const data = await db.profile(uid, 'is_premium, premium_expires_at')
  return isPremiumActive(data as Parameters<typeof isPremiumActive>[0]) ? MEMBER_PICKS : FREE_PICKS
}

function buildTiles(board: GeneratedTile[], answers: Record<string, BoardAnswerEntry>, committedKey: string | null): BoardTileClient[] {
  return board.map(t => {
    const key = triviaTileKey(t.category, t.tier)
    const a = answers[key]
    const isAnswered = !!a && a.chosen !== undefined
    // A committed-but-unanswered entry that ISN'T today's pending card was
    // committed on a past day and forfeited: dead, not playable.
    const isSpent = !!a && a.chosen === undefined && key !== committedKey
    // Reveal the question/options only once the card is committed (today) or
    // already answered, never before, so the board can't be window-shopped.
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

const NO_BOARD_ATTEMPT = (): BoardAttemptRow => ({ answers: {}, doubloons_awarded: 0, gems_awarded: 0 })

export async function getCaptainsBoardState(db: TriviaData, uid: string): Promise<CaptainsBoardState | { error: string }> {
  const week = weekStr()
  const today = todayStr()
  const [board, attempt, picksAllowed] = await Promise.all([db.weeklyBoard(week), db.boardAttempt(uid, week), picksAllowedFor(db, uid)])
  if (!board) return { error: 'No board available right now. Try again in a moment.' }

  const a = attempt ?? NO_BOARD_ATTEMPT()
  const committedKey = committedKeyToday(a.answers, today)
  const picks = playsToday(a.answers, today)

  return {
    date: week,
    tiles: buildTiles(board, a.answers, committedKey),
    picksAllowed,
    picksToday: picks,
    playedToday: picks >= picksAllowed,
    committedKey,
    committedAt: committedKey ? (a.answers[committedKey]?.revealedAt ?? null) : null,
    serverNow: nowIso(),
    doubloonsAwarded: a.doubloons_awarded,
  }
}

/** Commit the player's card for the day: reveals its question and locks the
 *  board. The committed card must then be answered (a refresh resumes it); it
 *  can't be swapped for another. */
export async function playCaptainsCard(db: TriviaData, uid: string, key: string): Promise<CaptainsBoardState | { error: string }> {
  const week = weekStr()
  const today = todayStr()
  const [board, attempt, picksAllowed] = await Promise.all([db.weeklyBoard(week), db.boardAttempt(uid, week), picksAllowedFor(db, uid)])
  if (!board) return { error: 'No board available' }

  const a = attempt ?? NO_BOARD_ATTEMPT()
  const answers = { ...a.answers }
  const picks = playsToday(answers, today)

  const existingCommitted = committedKeyToday(answers, today)
  // Re-committing today's pending card is idempotent: just re-reveal it
  // (resume after a refresh). Handle this BEFORE the generic guards.
  if (existingCommitted === key) {
    return {
      date: week,
      tiles: buildTiles(board, answers, key),
      picksAllowed,
      picksToday: picks,
      playedToday: picks >= picksAllowed,
      committedKey: key,
      committedAt: answers[key]?.revealedAt ?? null,
      serverNow: nowIso(),
      doubloonsAwarded: a.doubloons_awarded,
    }
  }
  // One card in flight at a time: members get 2 picks a day but must answer
  // the card they revealed before revealing the next.
  if (existingCommitted) return { error: 'Answer the card you already revealed first.' }
  if (picks >= picksAllowed) {
    return { error: picksAllowed > 1 ? `You've used both picks today. Come back tomorrow.` : "You've already played today. Come back tomorrow for your next card." }
  }
  // Any existing entry means the card was already answered OR forfeited: dead.
  if (answers[key]) return { error: 'That card has already been played.' }

  const tile = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown card' }

  // Stamp the reveal time: the answer clock's start. A resume hits the
  // idempotent branch above and keeps this original stamp (no timer reset).
  const revealedAt = nowIso()
  answers[key] = { day: today, revealedAt }
  await db.saveBoardAttempt(uid, week, { answers, doubloons_awarded: a.doubloons_awarded })

  return {
    date: week,
    tiles: buildTiles(board, answers, key),
    picksAllowed,
    picksToday: picks + 1,
    playedToday: (picks + 1) >= picksAllowed,
    committedKey: key,
    committedAt: revealedAt,
    serverNow: nowIso(),
    doubloonsAwarded: a.doubloons_awarded,
  }
}

export async function answerCaptainsTile(db: TriviaData, uid: string, key: string, chosenIndex: number): Promise<AnswerTileResult | { error: string }> {
  // -1 is the client's "timed out, no answer" sentinel; 0-3 is a real pick.
  if (typeof chosenIndex !== 'number' || chosenIndex < -1 || chosenIndex > 3) return { error: 'Invalid answer' }

  const week = weekStr()
  const today = todayStr()
  const [board, attempt, profile] = await Promise.all([
    db.weeklyBoard(week),
    db.boardAttempt(uid, week),
    db.profile(uid, 'doubloons, gems, parlor_streak, parlor_best_streak, parlor_rank_gems_awarded, parlor_points'),
  ])
  if (!board) return { error: 'No board available' }

  const a = attempt ?? NO_BOARD_ATTEMPT()
  const entry = a.answers[key]
  // You can only answer the card you committed TODAY, and only once: a card
  // committed on a past day is forfeited (no looking it up overnight).
  if (!entry || entry.day !== today) return { error: 'Choose your card first' }
  if (entry.chosen !== undefined) return { error: 'Card already answered' }

  const tile = board.find(t => triviaTileKey(t.category, t.tier) === key)
  if (!tile) return { error: 'Unknown card' }

  // Answer timer: the clock started when the card was revealed. A late answer
  // or the -1 timeout sentinel is a miss, judged here so a doctored client
  // can't beat the clock. A MISSING stamp is grandfathered.
  const timedOut = chosenIndex === -1 || (entry.revealedAt != null && triviaTimedOut(entry.revealedAt, clockNow()))
  const correct = !timedOut && chosenIndex === tile.correct_index
  const value = TRIVIA_TIER_VALUES[tile.tier - 1]
  const doubloonsWon = correct ? value : 0
  const totalAwarded = a.doubloons_awarded + doubloonsWon
  const newAnswers = { ...a.answers, [key]: { day: today, chosen: chosenIndex, correct, revealedAt: entry.revealedAt } }

  // Parlor streak (shared with the King): a correct answer extends it, a wrong
  // one breaks it. best is the permanent record behind the rank.
  const prevStreak = (profile?.parlor_streak as number | null) ?? 0
  const prevBest = (profile?.parlor_best_streak as number | null) ?? 0
  const currentStreak = correct ? prevStreak + 1 : 0
  const brokeStreak = correct ? 0 : prevStreak
  const bestStreak = Math.max(prevBest, currentStreak)

  // Parlor POINTS drive the rank (accumulate, never reset). A correct card scores
  // its tier; a miss scores nothing.
  const prevPoints = (profile?.parlor_points as number | null) ?? 0
  const pointsEarned = correct ? boardCardPoints(tile.tier) : 0
  const newPoints = prevPoints + pointsEarned
  const rankedUp = parlorRank(prevPoints).rank.title !== parlorRank(newPoints).rank.title

  // Gems are collected with the rank in the lobby (claimParlorRank), not here.
  const gemsWon = 0
  const newGems: number | null = null

  // Record the choice FIRST, and only if the answers are still exactly what we
  // read. Two answers fired together both reach here; only one is paid.
  if (!(await db.recordBoardAnswer(uid, week, a.answers, { answers: newAnswers, doubloons_awarded: totalAwarded, gems_awarded: a.gems_awarded }))) {
    return { error: 'Card already answered' }
  }

  const newDoubloons = doubloonsWon > 0 ? await db.grant(uid, 'doubloons', doubloonsWon) : null

  await Promise.all([
    db.updateProfile(uid, { parlor_streak: currentStreak, parlor_best_streak: bestStreak, parlor_points: newPoints }),
    newDoubloons !== null ? db.ledger(uid, doubloonsWon, `Captain's Board: ${categoryMeta(tile.category).label} for ${value} ⟡`) : null,
  ])

  // Clean Sweep badge (best-effort): every card on the board answered correctly.
  if (correct && board.every(t => newAnswers[triviaTileKey(t.category, t.tier)]?.correct === true)) {
    try { await db.grantBadge(uid, 'clean_sweep') } catch { /* best-effort */ }
  }

  return {
    correct, timedOut,
    correctIndex: tile.correct_index,
    explanation: tile.explanation,
    doubloonsWon, totalAwarded, newDoubloons, gemsWon, newGems,
    currentStreak, brokeStreak, bestStreak, pointsEarned, newPoints, rankedUp,
  }
}

// ── Spin the Capstan ──────────────────────────────────────────────────────────
//
// A weekly set of phrases, Captain-only. The wheel is rolled HERE (a client
// can't forge the value it hits), and the round bank, strikes and pending spin
// are persisted so a reload can't re-roll.

const freshRun = (): CapstanRun => ({ called: [], bank: 0, strikes: 0, status: 'active', pendingValue: null, earned: 0, hazardRun: 0 })

function readRun(runs: CapstanRuns, index: number): CapstanRun {
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

type CapstanCtx = { week: string; puzzles: GeneratedPuzzle[]; runs: CapstanRuns; doubloonsAwarded: number; readAs: string | null }

/** The Captain gate, this week's phrases and the player's runs. */
async function loadCapstan(db: TriviaData, uid: string): Promise<{ error: string } | CapstanCtx> {
  const prof = await db.profile(uid, 'is_premium, premium_expires_at')
  if (!isPremiumActive(prof as Parameters<typeof isPremiumActive>[0])) return { error: 'Spin the Capstan is a Captain-only game.' }

  const week = weekStr()
  const puzzles = await db.weeklyCapstan(week)
  if (!puzzles || puzzles.length === 0) return { error: 'The capstan is being rigged. Check back shortly.' }

  const attempt = await db.capstanAttempt(uid, week)
  return {
    week,
    puzzles,
    runs: attempt?.runs ?? {},
    doubloonsAwarded: attempt?.doubloons_awarded ?? 0,
    // The runs exactly as read, frozen before anything mutates them: a save only
    // lands if the row still holds this. null = no row yet.
    readAs: attempt ? JSON.stringify(attempt.runs ?? {}) : null,
  }
}

const saveRuns = (db: TriviaData, uid: string, ctx: CapstanCtx) =>
  db.saveCapstanRuns(uid, ctx.week, ctx.runs, ctx.doubloonsAwarded, ctx.readAs)

const OUT_OF_STEP = { error: 'The capstan moved on. Refresh and try again.' }

export async function getCapstanState(db: TriviaData, uid: string): Promise<CapstanState | { error: string }> {
  const ctx = await loadCapstan(db, uid)
  if ('error' in ctx) return ctx
  return {
    date: ctx.week,
    puzzles: ctx.puzzles.map((gen, i) => toClient(i, gen, readRun(ctx.runs, i))),
    doubloonsAwarded: ctx.doubloonsAwarded,
  }
}

/** Spin the capstan: the wedge is rolled here and hazards resolve at once; a
 *  value wedge arms the next consonant call. */
export async function spinCapstan(db: TriviaData, uid: string, index: number): Promise<CapstanSpinResult | { error: string }> {
  const ctx = await loadCapstan(db, uid)
  if ('error' in ctx) return ctx
  const gen = ctx.puzzles[index]
  if (!gen) return { error: 'No such puzzle.' }
  const run = readRun(ctx.runs, index)
  if (run.status !== 'active') return { error: 'This puzzle is already finished.' }
  if (run.pendingValue !== null) return { error: 'Call a letter first.' }

  // After CAPSTAN_MAX_HAZARD_RUN hazards in a row the pool narrows to the value
  // wedges. Narrowing the POOL rather than re-rolling until it likes the answer
  // keeps every wedge equally likely within that pool, and still returns a real
  // index so the capstan animates to a wedge that is actually there.
  const spent = (run.hazardRun ?? 0) >= CAPSTAN_MAX_HAZARD_RUN
  const pool = CAPSTAN_WHEEL
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => !spent || typeof w === 'number')
  const pick = pool[Math.floor(rngNext() * pool.length)]
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
  if (!(await saveRuns(db, uid, ctx))) return OUT_OF_STEP
  return { wedgeIndex, wedge, outcome, puzzle: toClient(index, gen, run) }
}

/** Call a consonant against the armed spin value. Hit: value × occurrences into
 *  the bank; miss: a strike. */
export async function callConsonant(db: TriviaData, uid: string, index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const ctx = await loadCapstan(db, uid)
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
  // RECORDED EITHER WAY, so a dead letter can't be called again and again,
  // burning a spin and a strike each time on information the game already had.
  run.called.push(letter)
  if (count > 0) {
    gained = value * count
    run.bank += gained
  } else {
    run.strikes += 1
    if (run.strikes >= CAPSTAN_MAX_STRIKES) run.status = 'failed'
  }

  ctx.runs[String(index)] = run
  if (!(await saveRuns(db, uid, ctx))) return OUT_OF_STEP
  return { letter, count, gained, puzzle: toClient(index, gen, run) }
}

/** Buy a vowel: a flat fee from the round bank reveals it if present. A wasted
 *  fee (vowel absent) is its own cost; no strike. */
export async function buyVowel(db: TriviaData, uid: string, index: number, letterRaw: string): Promise<CapstanLetterResult | { error: string }> {
  const ctx = await loadCapstan(db, uid)
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
  // Recorded even when absent, so a wasted fee is paid once.
  run.called.push(letter)

  ctx.runs[String(index)] = run
  if (!(await saveRuns(db, uid, ctx))) return OUT_OF_STEP
  return { letter, count, gained: 0, puzzle: toClient(index, gen, run) }
}

/** Solve attempt: a correct guess banks the round total (doubloons + parlor
 *  points toward the shared rank); a wrong one costs a strike. */
export async function solveCapstan(db: TriviaData, uid: string, index: number, guessRaw: string): Promise<CapstanSolveResult | { error: string }> {
  const ctx = await loadCapstan(db, uid)
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
    ctx.doubloonsAwarded += run.earned

    // Flip the run to solved FIRST (guarded on the runs we read), and pay only
    // if this request is the one that flipped it.
    ctx.runs[String(index)] = run
    if (!(await saveRuns(db, uid, ctx))) return OUT_OF_STEP

    const prof = await db.profile(uid, 'parlor_points')
    const prevPoints = (prof?.parlor_points as number | null) ?? 0
    newPoints = prevPoints + pointsEarned
    rankedUp = parlorRank(prevPoints).rank.title !== parlorRank(newPoints).rank.title
    newDoubloons = await db.grant(uid, 'doubloons', run.earned)

    await db.updateProfile(uid, { parlor_points: newPoints })
    if (run.earned > 0) await db.ledger(uid, run.earned, `Spin the Capstan: solved ${gen.category}`)
  } else {
    run.strikes += 1
    if (run.strikes >= CAPSTAN_MAX_STRIKES) run.status = 'failed'
    ctx.runs[String(index)] = run
    if (!(await saveRuns(db, uid, ctx))) return OUT_OF_STEP
  }

  return { correct, puzzle: toClient(index, gen, run), earned: run.earned, newDoubloons, pointsEarned, newPoints, rankedUp }
}

// ── The Pirate King ───────────────────────────────────────────────────────────
//
// One run per WEEK up a ten-rung ladder; pays doubloons. The 50/50's struck
// options are persisted so a reload can't re-roll them.

const NO_RUN = (): LadderAttemptRow => ({ rung: 0, status: 'active', fifty: null, doubloons_awarded: 0, current_started_at: null })

function stripQuestion(q: GeneratedRung, rung: number, fifty: LadderAttemptRow['fifty']): KingQuestionClient {
  return { question: q.question, options: q.options, removed: fifty && fifty.rung === rung ? fifty.removed : [] }
}

/** Pays doubloons and returns the new wallet total (null if nothing was paid). */
async function payOut(db: TriviaData, uid: string, amount: number, reason: string): Promise<number | null> {
  if (amount <= 0) return null
  const newTotal = await db.grant(uid, 'doubloons', amount)
  await db.ledger(uid, amount, reason)
  return newTotal
}

export async function getPirateKingState(db: TriviaData, uid: string): Promise<PirateKingState | { error: string }> {
  const week = weekStr()
  const [ladder, attempt] = await Promise.all([db.weeklyLadder(week), db.ladderAttempt(uid, week)])
  if (!ladder) return { error: 'No ladder available right now. Try again in a moment.' }

  const a = attempt ?? NO_RUN()
  // The current rung's question is only handed back once it's been REVEALED
  // (its clock is running). If not, the client shows the reveal prompt, and
  // startKingRung serves it and starts the timer.
  const revealed = a.status === 'active' && a.current_started_at !== null
  return {
    date: week,
    status: a.status,
    rung: a.rung,
    doubloonsAwarded: a.doubloons_awarded,
    fiftyUsed: a.fifty !== null,
    current: revealed ? stripQuestion(ladder[a.rung], a.rung, a.fifty) : null,
    startedAt: revealed ? a.current_started_at : null,
    serverNow: nowIso(),
  }
}

/** Reveal the current rung's question and start its answer clock. Idempotent: a
 *  reload returns the same startedAt (the clock never resets, so you can't
 *  stall on a lookup). */
export async function startKingRung(db: TriviaData, uid: string): Promise<KingRevealResult | { error: string }> {
  const week = weekStr()
  const [ladder, attempt] = await Promise.all([db.weeklyLadder(week), db.ladderAttempt(uid, week)])
  if (!ladder) return { error: 'No ladder available' }

  const a = attempt ?? NO_RUN()
  if (a.status !== 'active') return { error: 'The run is over for this week' }

  // Only stamp on the FIRST reveal of this rung; a reload keeps the original
  // clock. Guarded, and it writes ONLY the stamp: a whole-row write from a stale
  // read could put a busted run back to active.
  const startedAt = a.current_started_at ?? nowIso()
  if (a.current_started_at === null) {
    if (!(await db.advanceLadder(uid, week, attempt, { current_started_at: startedAt }))) return { error: 'Out of step with the ladder' }
  }

  return { current: stripQuestion(ladder[a.rung], a.rung, a.fifty), startedAt, serverNow: nowIso() }
}

export async function answerKingRung(db: TriviaData, uid: string, rung: number, chosenIndex: number): Promise<AnswerKingResult | { error: string }> {
  // -1 is the client's "timed out, no answer" sentinel; 0-3 is a real pick.
  if (typeof chosenIndex !== 'number' || chosenIndex < -1 || chosenIndex > 3) return { error: 'Invalid answer' }

  const week = weekStr()
  const [ladder, attempt, prof] = await Promise.all([
    db.weeklyLadder(week),
    db.ladderAttempt(uid, week),
    db.profile(uid, 'parlor_streak, parlor_best_streak, parlor_rank_gems_awarded, parlor_points'),
  ])
  if (!ladder) return { error: 'No ladder available' }

  const a = attempt ?? NO_RUN()
  if (a.status !== 'active') return { error: 'The run is over for this week' }
  // Stale client / double submit guard: the answer must target the current rung.
  if (rung !== a.rung) return { error: 'Out of step with the ladder' }
  // The 50/50 already struck this option.
  if (a.fifty && a.fifty.rung === rung && a.fifty.removed.includes(chosenIndex)) {
    return { error: 'That option was struck by the 50/50' }
  }

  // Answer timer: the clock started when the rung was revealed. A late answer or
  // the -1 sentinel is a miss. A MISSING stamp is grandfathered; the question
  // can't be fetched without startKingRung stamping the clock.
  const timedOut = chosenIndex === -1 || (a.current_started_at != null && triviaTimedOut(a.current_started_at, clockNow()))
  const q = ladder[rung]
  const correct = !timedOut && chosenIndex === q.correct_index

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

  // Parlor streak (shared with the Board): a right answer extends it, a bust
  // breaks it. Points accumulate toward the shared rank.
  const prevStreak = (prof?.parlor_streak as number | null) ?? 0
  const prevBest = (prof?.parlor_best_streak as number | null) ?? 0
  const currentStreak = correct ? prevStreak + 1 : 0
  const brokeStreak = correct ? 0 : prevStreak
  const bestStreak = Math.max(prevBest, currentStreak)
  const prevPoints = (prof?.parlor_points as number | null) ?? 0
  const pointsEarned = correct ? KING_RUNG_POINTS + (status === 'crowned' ? KING_CROWN_POINTS : 0) : 0
  const newPoints = prevPoints + pointsEarned
  const rankedUp = parlorRank(prevPoints).rank.title !== parlorRank(newPoints).rank.title

  // Gems are collected with the rank in the lobby, not here.
  const gemsWon = 0
  const newGems: number | null = null

  // The rung moves FIRST, and only from the exact state we judged against. Two
  // answers fired together both reach here; only the one that lands is paid.
  const moved = await db.advanceLadder(uid, week, attempt, {
    rung: newRung,
    status,
    doubloons_awarded: status === 'active' ? 0 : won,
    gems_awarded: gemsWon,
    // The climbed-to rung is NOT revealed yet; its clock starts on startKingRung.
    current_started_at: null,
  })
  if (!moved) return { error: 'Out of step with the ladder' }

  let newDoubloons: number | null = null
  if (status === 'crowned') {
    newDoubloons = await payOut(db, uid, won, `Pirate King: crowned, all ${PIRATE_KING_RUNGS} questions`)
  } else if (status === 'busted' && won > 0) {
    newDoubloons = await payOut(db, uid, won, `Pirate King: fell to the haven at ${won} ⟡`)
  }

  await db.updateProfile(uid, { parlor_streak: currentStreak, parlor_best_streak: bestStreak, parlor_points: newPoints })

  // Badge hooks (best-effort): the crown, and the rung-7 stepping stone.
  if (status === 'crowned') { try { await db.grantBadge(uid, 'crowned') } catch { /* best-effort */ } }
  if (newRung >= 7) { try { await db.grantBadge(uid, 'throne_in_sight') } catch { /* best-effort */ } }

  return {
    correct, timedOut,
    correctIndex: q.correct_index,
    explanation: q.explanation,
    status, rung: newRung,
    doubloonsAwarded: status === 'active' ? 0 : won,
    newDoubloons, gemsWon, newGems,
    currentStreak, brokeStreak, bestStreak, pointsEarned, newPoints, rankedUp,
  }
}

/** Strike two of the three wrong options, once a run. Using it does NOT reset
 *  the clock. */
export async function spendKingFiftyFifty(db: TriviaData, uid: string): Promise<{ removed: number[] } | { error: string }> {
  const week = weekStr()
  const [ladder, attempt] = await Promise.all([db.weeklyLadder(week), db.ladderAttempt(uid, week)])
  if (!ladder) return { error: 'No ladder available' }

  const a = attempt ?? NO_RUN()
  if (a.status !== 'active') return { error: 'The run is over for this week' }
  if (a.fifty) return { error: 'The 50/50 is already spent' }

  const q = ladder[a.rung]
  const wrong = [0, 1, 2, 3].filter(i => i !== q.correct_index)
  wrong.splice(Math.floor(rngNext() * wrong.length), 1)
  const removed = wrong.sort((x, y) => x - y)

  if (!(await db.advanceLadder(uid, week, attempt, { fifty: { rung: a.rung, removed } }))) return { error: 'The 50/50 is already spent' }
  return { removed }
}

export async function walkKingAway(db: TriviaData, uid: string): Promise<{ status: 'walked'; doubloonsAwarded: number; newDoubloons: number | null } | { error: string }> {
  const week = weekStr()
  const a = await db.ladderAttempt(uid, week)
  if (!a || a.status !== 'active') return { error: 'No run to walk away from' }
  if (a.rung < 1) return { error: 'Answer at least one question first' }

  const won = PIRATE_KING_PRIZES[a.rung - 1]

  // Walk FIRST, guarded on the run still being where we read it; pay only if
  // this request is the one that ended it.
  if (!(await db.advanceLadder(uid, week, a, { status: 'walked', doubloons_awarded: won, current_started_at: null }))) return { error: 'No run to walk away from' }
  const newDoubloons = await payOut(db, uid, won, `Pirate King: walked at rung ${a.rung} with ${won} ⟡`)

  return { status: 'walked', doubloonsAwarded: won, newDoubloons }
}
