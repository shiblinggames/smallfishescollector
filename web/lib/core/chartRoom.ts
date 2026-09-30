// ── THE CHART ROOM, CORE (Steam prep, 2026-09-29) ──
//
// The Chart Room's four weekly puzzles and the World Chart with nothing of the
// web in them: Treasure Match (the run replayed, never believed), the Minefield
// (every reveal judged here), the Quartermaster's Hold (four sudoku, solutions
// never sent) and Lay the Rigging (the solve validated here), the landmark
// claims their points uncover, and the room's guide. Each takes the store
// (ChartData) and the captain's id. On the web the server actions
// (charting/actions, minefieldActions, worldChartActions, chart-room/actions,
// hold/actions, rigging/actions) check the session and hand these the Supabase
// store; offline, the local save's, which builds its own weekly boards.
//
// Moved verbatim out of the actions. The only edits: the session read became
// `uid`; every table read and guarded write became a store operation; the week
// keys and stamps read the game clock.

import { clockNow } from '@/lib/clock'
import { LANDMARKS, WORLD_CHART_COMPLETION_BONUS } from '@/lib/worldChart'
import { makeRng, initialBoard, resolveSwap, hasValidMove, reshuffle } from '@/app/(app)/charting/treasureMatch'
import {
  MATCH_TARGET, MATCH_MAX_POINTS, WILD_DROP_CHANCE, matchWeekStr, pointsForScore,
  type MatchState, type SubmitMatchResult,
} from '@/app/(app)/charting/constants'
import { floodReveal, adjacentMineCount, safeCellCount } from '@/app/(app)/charting/minefield'
import { MINEFIELD_POINTS, minefieldWeekStr, type MinefieldState, type RevealResult, type RevealedTile } from '@/app/(app)/charting/minefieldConstants'
import {
  HOLD_DIFFICULTIES, HOLD_META, HOLD_CELLS, holdPayout, holdPoints, holdWeekStr, isHoldDifficulty, isValidBoardString,
  type HoldDifficulty, type HoldState, type HoldPuzzleClient, type TallyHoldResult, type SubmitHoldResult,
} from '@/app/(app)/tavern/chart-room/hold/constants'
import { isSolved } from '@/app/(app)/tavern/chart-room/rigging/rigging'
import { RIGGING_POINTS, riggingWeekStr, type RiggingState, type SubmitRiggingResult } from '@/app/(app)/tavern/chart-room/rigging/constants'
import type { MinefieldLayout } from '@/lib/chartBoards'
import type { ChartData, HoldAttemptRow, MinefieldAttemptRow } from '@/lib/data/chartData'

const now = () => new Date(clockNow())

async function loadPuzzlePoints(db: ChartData, uid: string): Promise<number> {
  const data = await db.profile(uid, 'puzzle_points')
  return (data?.puzzle_points as number | null) ?? 0
}

/** First-visit Chart Room guide dismissal (see components/LobbyGuide). */
export async function markChartingGuideSeen(db: ChartData, uid: string): Promise<void> {
  await db.updateProfile(uid, { has_seen_charting_guide: true })
}

// ── Treasure Match ────────────────────────────────────────────────────────────
//
// The board is seeded and deterministic (one shared puzzle a week), and the
// run is REPLAYED here from the swaps the client made to derive the score. It
// used to take the client's reported score on trust; a tester edited that
// number in memory and took the week's full five points without playing.

export async function getMatchState(db: ChartData, uid: string): Promise<MatchState | { error: string }> {
  const week = matchWeekStr(now())
  const [config, attempt, points] = await Promise.all([
    db.weeklyMatch(week),
    db.matchAttempt(uid, week),
    loadPuzzlePoints(db, uid),
  ])
  if (!config) return { error: 'No board this week. Try again in a moment.' }
  const a = attempt ?? { status: 'active' as const, best_score: 0, points_awarded: 0 }

  return {
    week,
    seed: config.seed,
    cols: config.cols,
    rows: config.rows,
    types: config.types,
    // Drive tiers off the constant (MATCH_TARGET = 5/5 score), not the
    // per-board config.target, so older cached boards still tier correctly.
    target: MATCH_TARGET,
    moves: config.moves,
    status: a.status,
    bestScore: a.best_score,
    pointsAwarded: a.points_awarded,
    puzzlePoints: points,
  }
}

/**
 * REPLAY THE RUN, DO NOT BELIEVE IT.
 *
 * The client sends the SWAPS it made and the score is recomputed from them:
 * the engine is pure and the board is deterministic from the week's seed. A
 * forged payload can only be a list of swaps, and a list of swaps that resolves
 * into a winning score IS a solution to the puzzle.
 *
 * THE REPLAY MUST MATCH THE CLIENT EXACTLY. The RNG is one stateful stream
 * shared by every refill and reshuffle, so the loop mirrors attemptSwap's order
 * precisely: resolve, score, spend a move, stop on target or on the last move,
 * and only reshuffle if the run continues.
 *
 * The best score maps to a tier (0-5 charting points) and only the DELTA over
 * what was already awarded is banked, so a player who first hits 2/5 and later
 * 4/5 gets +2 more, capped at 5.
 */
export async function submitMatch(db: ChartData, uid: string, moves: [number, number][]): Promise<SubmitMatchResult | { error: string }> {
  if (!Array.isArray(moves)) return { error: 'Please reload the page and try again.' }

  const week = matchWeekStr(now())
  const [config, attemptRow, oldPoints] = await Promise.all([
    db.weeklyMatch(week),
    db.matchAttempt(uid, week),
    loadPuzzlePoints(db, uid),
  ])
  if (!config) return { error: 'No board this week' }
  const attempt = attemptRow ?? { status: 'active' as const, best_score: 0, points_awarded: 0 }

  // More swaps than the run allows is not a near miss, it is a forgery.
  if (moves.length > config.moves) {
    await db.flagAnomaly(uid, 'implausible:matchMoveCount', 3, { sent: moves.length, allowed: config.moves })
    return { error: 'Invalid run' }
  }

  const { cols, rows, types, target, seed } = config
  const cells = cols * rows
  const rng = makeRng(seed)
  let board = initialBoard(rng, cols, rows, types)
  let score = 0
  let movesLeft = config.moves

  for (const mv of moves) {
    if (!Array.isArray(mv) || mv.length !== 2) return { error: 'Invalid run' }
    const [a, b] = mv
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= cells || b >= cells) {
      return { error: 'Invalid run' }
    }
    // A swap that forms no match is refused by the client without spending a
    // move or touching the RNG, so it can never appear in an honest log.
    const res = resolveSwap(board, a, b, cols, rows, types, rng, WILD_DROP_CHANCE)
    if (!res) {
      await db.flagAnomaly(uid, 'implausible:matchInvalidSwap', 3, { a, b, at: moves.indexOf(mv) })
      return { error: 'Invalid run' }
    }
    board = res.finalBoard
    score += res.totalGained
    movesLeft--
    if (score >= target) break
    if (movesLeft <= 0) break
    if (!hasValidMove(board, cols, rows)) board = reshuffle(rng, cols, rows, types)
  }

  const bestScore = Math.max(attempt.best_score, Math.floor(score))
  const tier = pointsForScore(bestScore)                    // 0-5 for the best score
  const delta = Math.max(0, tier - attempt.points_awarded)  // never claw back
  const maxed = tier >= MATCH_MAX_POINTS

  if (delta <= 0) {
    // No new tier: just keep the (possibly improved) best score. Never writes
    // the points: a stale copy written back over a concurrent bank would let
    // the same tier be banked twice.
    await db.raiseMatchBest(uid, week, bestScore, maxed)
    return { bestScore, tier, pointsWon: 0, maxed, newPuzzlePoints: null }
  }

  // Bank the new tier FIRST, and only from the tier we read. Two submits fired
  // together both reach here; only the one whose write lands is paid.
  const won = await db.bankMatchTier(uid, week, attempt.points_awarded, { status: maxed ? 'cleared' : 'active', best_score: bestScore, points_awarded: tier })
  if (!won) return { bestScore, tier, pointsWon: 0, maxed, newPuzzlePoints: null }

  const newPuzzlePoints = oldPoints + delta
  await db.updateProfile(uid, { puzzle_points: newPuzzlePoints })
  return { bestScore, tier, pointsWon: delta, maxed, newPuzzlePoints }
}

// ── The Minefield ─────────────────────────────────────────────────────────────
//
// The mine layout lives only in the store; the client learns a tile is a mine
// ONLY by busting on it (and a bust resets the board, so it can't be farmed for
// intel). The first clear of the week banks puzzle points; unlimited retries,
// no doubloons.

function tilesFrom(indices: number[], layout: MinefieldLayout): RevealedTile[] {
  const mines = new Set(layout.mines)
  return indices.map(i => ({ i, adj: adjacentMineCount(mines, i, layout.cols, layout.rows) }))
}

const freshMinefield = (layout: MinefieldLayout): MinefieldAttemptRow =>
  ({ revealed: [...layout.opening], flagged: [], status: 'active', points_awarded: 0, busts: 0 })

export async function getMinefieldState(db: ChartData, uid: string): Promise<MinefieldState | { error: string }> {
  const week = minefieldWeekStr(now())
  const [layout, existing, points] = await Promise.all([
    db.weeklyMinefield(week),
    db.minefieldAttempt(uid, week),
    loadPuzzlePoints(db, uid),
  ])
  if (!layout) return { error: 'No board this week. Try again in a moment.' }

  // First visit this week: start everyone on the guaranteed-safe opening.
  let a = existing
  if (!a) {
    a = freshMinefield(layout)
    await db.saveMinefield(uid, week, a)
  }

  return {
    week,
    cols: layout.cols,
    rows: layout.rows,
    mineCount: layout.mineCount,
    revealed: tilesFrom(a.revealed, layout),
    flagged: a.flagged,
    status: a.status,
    busts: a.busts,
    pointsAwarded: a.points_awarded,
    reward: MINEFIELD_POINTS,
    puzzlePoints: points,
  }
}

export async function revealCell(db: ChartData, uid: string, index: number): Promise<RevealResult | { error: string }> {
  const week = minefieldWeekStr(now())
  const [layout, existing] = await Promise.all([db.weeklyMinefield(week), db.minefieldAttempt(uid, week)])
  if (!layout) return { error: 'No board this week' }
  if (!Number.isInteger(index) || index < 0 || index >= layout.cols * layout.rows) {
    return { error: 'Invalid tile' }
  }

  const a: MinefieldAttemptRow = existing ?? freshMinefield(layout)

  if (a.status === 'cleared') {
    return { busted: false, cleared: true, revealed: tilesFrom(a.revealed, layout), status: 'cleared', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  const revealedSet = new Set(a.revealed)
  const flaggedSet = new Set(a.flagged)
  if (revealedSet.has(index) || flaggedSet.has(index)) {
    return { busted: false, cleared: false, revealed: tilesFrom(a.revealed, layout), status: 'active', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  const mines = new Set(layout.mines)

  // Struck a mine: bust. Reset to the opening, keep flags, bump the count.
  if (mines.has(index)) {
    a.revealed = [...layout.opening]
    a.busts += 1
    await db.saveMinefield(uid, week, a)
    return { busted: true, cleared: false, revealed: tilesFrom(a.revealed, layout), status: 'active', busts: a.busts, pointsWon: 0, newPuzzlePoints: null }
  }

  // Safe: flood reveal, then check for a full clear.
  const fresh = floodReveal(mines, layout.cols, layout.rows, index, revealedSet, flaggedSet)
  fresh.forEach(i => revealedSet.add(i))
  a.revealed = [...revealedSet]

  const cleared = a.revealed.length >= safeCellCount(layout.cols, layout.rows, layout.mineCount)
  let pointsWon = 0
  let newPuzzlePoints: number | null = null

  if (cleared && a.points_awarded === 0) {
    a.status = 'cleared'
    a.points_awarded = MINEFIELD_POINTS
    if (await db.bankMinefield(uid, week, a, existing !== null)) {
      pointsWon = MINEFIELD_POINTS
      newPuzzlePoints = (await loadPuzzlePoints(db, uid)) + MINEFIELD_POINTS
      await db.updateProfile(uid, { puzzle_points: newPuzzlePoints })
    }
  } else {
    if (cleared) a.status = 'cleared'
    await db.saveMinefield(uid, week, a)
  }

  return { busted: false, cleared, revealed: tilesFrom(a.revealed, layout), status: a.status, busts: a.busts, pointsWon, newPuzzlePoints }
}

export async function toggleFlag(db: ChartData, uid: string, index: number): Promise<{ flagged: number[] } | { error: string }> {
  const week = minefieldWeekStr(now())
  const [layout, existing] = await Promise.all([db.weeklyMinefield(week), db.minefieldAttempt(uid, week)])
  if (!layout) return { error: 'No board this week' }
  if (!Number.isInteger(index) || index < 0 || index >= layout.cols * layout.rows) {
    return { error: 'Invalid tile' }
  }

  const a: MinefieldAttemptRow = existing ?? freshMinefield(layout)
  if (a.status === 'cleared') return { flagged: a.flagged }
  if (a.revealed.includes(index)) return { flagged: a.flagged } // can't flag a revealed tile

  const set = new Set(a.flagged)
  if (set.has(index)) set.delete(index); else set.add(index)
  a.flagged = [...set]
  await db.saveMinefield(uid, week, a)
  return { flagged: a.flagged }
}

// ── The World Chart ───────────────────────────────────────────────────────────
//
// Reveal state derives from lifetime puzzle_points (read-only); this owns only
// the one-time gem CLAIM per landmark.

export async function getWorldChartState(db: ChartData, uid: string): Promise<{ points: number; claimed: number[] }> {
  const data = await db.profile(uid, 'puzzle_points, charting_landmarks_claimed')
  return {
    points: (data?.puzzle_points as number | null) ?? 0,
    claimed: (data?.charting_landmarks_claimed as number[] | null) ?? [],
  }
}

/** Collect a discovered landmark's gems. Pays once; re-validates the threshold
 *  and the claimed set so the client can't forge a payout. */
export async function claimLandmark(db: ChartData, uid: string, landmarkId: number): Promise<
  { ok: true; gems: number; awarded: number; bonus: number; completed: boolean; claimed: number[] } | { error: string }
> {
  const landmark = LANDMARKS.find(l => l.id === landmarkId)
  if (!landmark) return { error: 'Unknown landmark' }

  const profile = await db.profile(uid, 'puzzle_points, charting_landmarks_claimed')
  if (!profile) return { error: 'No profile' }

  const points = (profile.puzzle_points as number | null) ?? 0
  const claimed = (profile.charting_landmarks_claimed as number[] | null) ?? []

  if (points < landmark.threshold) return { error: 'Not yet discovered' }
  if (claimed.includes(landmarkId)) return { error: 'Already claimed' }

  const newClaimed = [...claimed, landmarkId]
  // Completing the LAST landmark pays the one-time completion bonus on top: a
  // crossing that can only happen once.
  const completed = newClaimed.length === LANDMARKS.length
  const bonus = completed ? WORLD_CHART_COMPLETION_BONUS : 0
  const awarded = landmark.gems + bonus
  // Record the claim FIRST, and only over the exact claimed set we read. Two
  // taps fired together both reach here; only the one whose write lands is
  // paid (and only it can be the one that completes the chart).
  if (!(await db.claimLandmarks(uid, (profile.charting_landmarks_claimed as number[] | null) ?? null, newClaimed))) return { error: 'Already claimed' }

  const newGems = await db.grant(uid, 'gems', awarded)
  await db.ledger(uid, landmark.gems, `World Chart: ${landmark.name}`, 'gems')
  if (completed) await db.ledger(uid, bonus, 'World Chart: fully charted', 'gems')

  // Badge hooks (also covered by the derive, but granted now for an immediate unlock).
  db.grantBadge(uid, 'landfall').catch(() => {})
  if (newClaimed.length >= 7) db.grantBadge(uid, 'uncharted_no_more').catch(() => {})
  if (completed) db.grantBadge(uid, 'master_cartographer').catch(() => {})

  return { ok: true, gems: newGems, awarded, bonus, completed, claimed: newClaimed }
}

// ── The Quartermaster's Hold ──────────────────────────────────────────────────
//
// FOUR holds a week, all open: any or all of the four difficulties can be
// played and solved independently. Each solve pays doubloons (difficulty +
// clean bonus) AND banks its difficulty in charting points. The solutions
// never leave the store; every tally and submit is judged here.

const emptyHold = (): HoldAttemptRow => ({ progress: {}, solved: {}, doubloons_awarded: 0 })

/** 81 comma-separated runs of unique digits 1-9, or empty. Rejects anything
 *  else so a forged save cannot stuff arbitrary text into the attempt row. */
function isValidNotesString(n: string): boolean {
  if (n.length > 81 * 10) return false
  const parts = n.split(',')
  if (parts.length !== 81) return false
  return parts.every(p => /^[1-9]*$/.test(p) && new Set(p).size === p.length)
}

export async function getHoldState(db: ChartData, uid: string): Promise<HoldState | { error: string }> {
  const week = holdWeekStr(now())
  const [puzzles, attemptRow, points] = await Promise.all([db.weeklySudoku(week), db.holdAttempt(uid, week), loadPuzzlePoints(db, uid)])
  if (!puzzles) return { error: 'No holds to stow right now. Try again in a moment.' }
  const attempt = attemptRow ?? emptyHold()

  const out: HoldPuzzleClient[] = HOLD_DIFFICULTIES.map(d => {
    const prog = attempt.progress[d] ?? null
    const solved = attempt.solved[d] ?? null
    return {
      difficulty: d,
      givens: puzzles[d].givens,           // givens ONLY, never the solution
      progress: prog?.entries ?? null,
      notes: prog?.notes ?? null,
      hintsUsed: prog?.hints ?? 0,
      solved: solved ? { doubloons: solved.doubloons, clean: solved.clean } : null,
    }
  })

  return { date: week, puzzles: out, doubloonsAwarded: attempt.doubloons_awarded, puzzlePoints: points }
}

/** Persist in-flight entries (and pencil marks) so the player can resume. Never
 *  touches the hint count or the solved map. */
export async function saveHoldProgress(db: ChartData, uid: string, difficulty: HoldDifficulty, entries: string, notes?: string): Promise<{ ok: true } | { error: string }> {
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }
  if (notes != null && !isValidNotesString(notes)) return { error: 'Invalid notes' }

  const week = holdWeekStr(now())
  const attempt = (await db.holdAttempt(uid, week)) ?? emptyHold()
  if (attempt.solved[difficulty]) return { ok: true } // already banked

  const prevHints = attempt.progress[difficulty]?.hints ?? 0
  const prevNotes = attempt.progress[difficulty]?.notes
  const progress = { ...attempt.progress, [difficulty]: { entries, hints: prevHints, notes: notes ?? prevNotes } }
  // A save that loses a race is simply skipped; the next autosave carries it.
  await db.saveHold(uid, week, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded })
  return { ok: true }
}

/** Ask the quartermaster to tally the manifest: flags wrong filled cells
 *  against the solution. Spends the clean bonus (bumps hints). */
export async function tallyHold(db: ChartData, uid: string, difficulty: HoldDifficulty, entries: string): Promise<TallyHoldResult | { error: string }> {
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }

  const week = holdWeekStr(now())
  const [puzzles, attemptRow] = await Promise.all([db.weeklySudoku(week), db.holdAttempt(uid, week)])
  if (!puzzles) return { error: 'No holds available' }
  const attempt = attemptRow ?? emptyHold()

  const solution = puzzles[difficulty].solution
  const wrong = new Array(HOLD_CELLS).fill(false)
  for (let i = 0; i < HOLD_CELLS; i++) {
    if (entries[i] !== '.' && entries[i] !== solution[i]) wrong[i] = true
  }

  const hints = (attempt.progress[difficulty]?.hints ?? 0) + 1
  const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
  // The hint is recorded before the mask goes back; no record, no mask.
  if (!(await db.saveHold(uid, week, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded }))) {
    return { error: 'The quartermaster lost count. Try again.' }
  }

  return { wrong, hintsUsed: hints }
}

export async function submitHold(db: ChartData, uid: string, difficulty: HoldDifficulty, entries: string): Promise<SubmitHoldResult | { error: string }> {
  if (!isHoldDifficulty(difficulty)) return { error: 'Unknown hold' }
  if (!isValidBoardString(entries)) return { error: 'Invalid board' }

  const week = holdWeekStr(now())
  const [puzzles, attemptRow, profile] = await Promise.all([
    db.weeklySudoku(week),
    db.holdAttempt(uid, week),
    db.profile(uid, 'puzzle_points'),
  ])
  if (!puzzles) return { error: 'No holds available' }
  const attempt = attemptRow ?? emptyHold()
  if (attempt.solved[difficulty]) return { error: 'This hold is already stowed' }

  const { givens, solution } = puzzles[difficulty]

  for (let i = 0; i < HOLD_CELLS; i++) {
    if (givens[i] !== '.' && entries[i] !== givens[i]) return { error: 'The manifest has been tampered with' }
  }
  if (entries.includes('.')) return { error: 'The hold is not yet full' }

  const correct = entries === solution
  const oldPoints = Number(profile?.puzzle_points ?? 0)

  if (!correct) {
    const wrong = new Array(HOLD_CELLS).fill(false)
    for (let i = 0; i < HOLD_CELLS; i++) if (entries[i] !== solution[i]) wrong[i] = true
    // A wrong submit hands back the same wrong-cell mask a tally does, so it
    // counts as a tally. Free masks would let a full board be walked to the
    // answer one resubmit at a time and still be paid as clean.
    const hints = (attempt.progress[difficulty]?.hints ?? 0) + 1
    const progress = { ...attempt.progress, [difficulty]: { entries, hints } }
    if (!(await db.saveHold(uid, week, attempt, { progress, solved: attempt.solved, doubloons_awarded: attempt.doubloons_awarded }))) {
      return { error: 'The quartermaster lost count. Try again.' }
    }
    return {
      correct: false, wrong, doubloonsWon: 0, clean: false, newDoubloons: null,
      pointsWon: 0, newPuzzlePoints: oldPoints, hintsUsed: hints,
    }
  }

  // Correct + first solve this week: pay doubloons + bank puzzle points.
  const clean = (attempt.progress[difficulty]?.hints ?? 0) === 0
  const doubloonsWon = holdPayout(difficulty, clean)
  const pointsWon = holdPoints(difficulty)
  const totalAwarded = attempt.doubloons_awarded + doubloonsWon
  const newPuzzlePoints = oldPoints + pointsWon

  const solved = { ...attempt.solved, [difficulty]: { doubloons: doubloonsWon, clean, points: pointsWon, solved_at: now().toISOString() } }
  const progress = { ...attempt.progress, [difficulty]: { entries, hints: attempt.progress[difficulty]?.hints ?? 0 } }

  // Mark it stowed FIRST (guarded on the row we read); pay only if this request
  // is the one that stowed it.
  if (!(await db.saveHold(uid, week, attempt, { progress, solved, doubloons_awarded: totalAwarded }))) {
    return { error: 'This hold is already stowed' }
  }
  const newDoubloons = await db.grant(uid, 'doubloons', doubloonsWon)
  await Promise.all([
    db.updateProfile(uid, { puzzle_points: newPuzzlePoints }),
    db.ledger(uid, doubloonsWon, `The Hold: ${HOLD_META[difficulty].label}${clean ? ' (clean)' : ''}`),
  ])

  // Badge hooks (weekly, one-shot feats that can't be derived from stored
  // state): the hardest hold, and all four this week.
  if (difficulty === 'extreme') db.grantBadge(uid, 'fully_laden').catch(() => {})
  if (Object.keys(solved).length === HOLD_DIFFICULTIES.length) db.grantBadge(uid, 'clean_manifest').catch(() => {})

  return { correct: true, doubloonsWon, clean, newDoubloons, pointsWon, newPuzzlePoints }
}

// ── Lay the Rigging ───────────────────────────────────────────────────────────
//
// The board is solvable by construction; the player draws ropes and the full
// solve is validated here before any points are banked. The first clear of the
// week banks its puzzle points.

export async function getRiggingState(db: ChartData, uid: string): Promise<RiggingState | { error: string }> {
  const week = riggingWeekStr(now())
  const [layout, attemptRow, points] = await Promise.all([db.weeklyRigging(week), db.riggingAttempt(uid, week), loadPuzzlePoints(db, uid)])
  if (!layout) return { error: 'No rigging to lay this week. Try again in a moment.' }
  const attempt = attemptRow ?? { paths: {}, status: 'active' as const, points_awarded: 0 }

  return {
    week,
    cols: layout.cols,
    rows: layout.rows,
    pairs: layout.pairs,
    paths: attempt.paths ?? {},
    status: attempt.status,
    pointsAwarded: attempt.points_awarded,
    reward: RIGGING_POINTS,
    puzzlePoints: points,
  }
}

/** Persist in-flight ropes so the player can resume (debounced client). */
export async function saveRiggingPaths(db: ChartData, uid: string, paths: Record<number, number[]>): Promise<{ ok: true } | { error: string }> {
  if (typeof paths !== 'object' || paths === null) return { error: 'Invalid paths' }
  const week = riggingWeekStr(now())
  const attempt = await db.riggingAttempt(uid, week)
  if (attempt?.status === 'cleared') return { ok: true }
  await db.saveRiggingActive(uid, week, paths)
  return { ok: true }
}

export async function submitRigging(db: ChartData, uid: string, paths: Record<number, number[]>): Promise<SubmitRiggingResult | { error: string }> {
  const week = riggingWeekStr(now())
  const [layout, attemptRow, oldPoints] = await Promise.all([db.weeklyRigging(week), db.riggingAttempt(uid, week), loadPuzzlePoints(db, uid)])
  if (!layout) return { error: 'No board this week' }
  const attempt = attemptRow ?? { paths: {}, status: 'active' as const, points_awarded: 0 }

  const solved = isSolved(layout.cols, layout.rows, layout.pairs, paths)

  if (!solved) {
    // Persist progress, no award.
    if (attempt.status !== 'cleared') await db.saveRiggingActive(uid, week, paths)
    return { solved: false, pointsWon: 0, newPuzzlePoints: null }
  }

  // Already banked this week? No double pay.
  if (attempt.points_awarded > 0 || attempt.status === 'cleared') {
    return { solved: true, pointsWon: 0, newPuzzlePoints: null }
  }

  // Clear it FIRST, and only from the unbanked state. Two submits fired
  // together both reach here; only the one whose write lands banks points.
  await db.saveRiggingActive(uid, week, paths)
  if (!(await db.clearRigging(uid, week, paths, RIGGING_POINTS))) return { solved: true, pointsWon: 0, newPuzzlePoints: null }

  const newPuzzlePoints = oldPoints + RIGGING_POINTS
  await db.updateProfile(uid, { puzzle_points: newPuzzlePoints })
  return { solved: true, pointsWon: RIGGING_POINTS, newPuzzlePoints }
}
