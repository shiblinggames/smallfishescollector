// The Parlor — shared constants + types for the trivia hub games.
// Plain module (NOT 'use server') so sync helpers and types survive
// the build; server actions import from here.

export const TRIVIA_CATEGORIES = [
  { key: 'FISH', label: 'Fish Facts', color: '#60a5fa' },
  { key: 'DEEP', label: 'The Deep', color: '#a78bfa' },
  { key: 'LORE', label: 'Salt & Legend', color: '#f0c040' },
  { key: 'CATCH', label: 'The Catch', color: '#34d399' },
] as const

export type TriviaCategoryKey = (typeof TRIVIA_CATEGORIES)[number]['key']

export const TRIVIA_CATEGORY_KEYS = TRIVIA_CATEGORIES.map(c => c.key) as TriviaCategoryKey[]

export function categoryMeta(key: TriviaCategoryKey) {
  return TRIVIA_CATEGORIES.find(c => c.key === key)!
}

/** Doubloon payout per tier (index = tier - 1). The board is weekly
 *  (fresh Monday) and the player plays ONE card a day, picking from the
 *  12 on the board (4 topics × 3 tiers) — up to 7 over the week. The
 *  richer the tier, the harder the clue. */
export const TRIVIA_TIER_VALUES = [50, 100, 200] as const

export const TRIVIA_TIERS = [1, 2, 3] as const

// ── Answer timer (anti-lookup) ──────────────────────────────────────
// A question can't be looked up in time if you're on a clock. The timer starts
// SERVER-SIDE the moment a question is revealed (the board commit / the King
// reveal), and the server rejects any answer that lands after the limit — a
// client countdown can't be trusted alone. Reloading never resets the clock
// (the reveal timestamp is stored), so you can't stall on a lookup. GRACE covers
// network + clock skew so an honest last-second answer isn't unfairly voided.
export const TRIVIA_ANSWER_SECONDS = 12
export const TRIVIA_TIMER_GRACE_MS = 4000
/** True once a reveal timestamp is older than the limit (+ grace). serverNow and
 *  revealedAt are ISO strings from the server; kept pure so both sides can call it. */
export function triviaTimedOut(revealedAt: string | null, now: number): boolean {
  if (!revealedAt) return true
  return now - new Date(revealedAt).getTime() > TRIVIA_ANSWER_SECONDS * 1000 + TRIVIA_TIMER_GRACE_MS
}

export function triviaTileKey(category: TriviaCategoryKey, tier: number): string {
  return `${category}-${tier}`
}

/** One tile as the client sees it. question/options only ride along
 *  once the card is committed (you commit to a card before its question
 *  is revealed, so you can't read all 12 and cherry-pick the easy one)
 *  or already answered; correct_index + explanation only once answered. */
export interface BoardTileClient {
  key: string
  category: TriviaCategoryKey
  tier: 1 | 2 | 3
  value: number
  question: string | null
  options: string[] | null
  answered: null | {
    chosen: number
    correct: boolean
    correctIndex: number
    explanation: string
  }
  /** Committed on a past day but never answered — forfeited, can't be
   *  played again (anti-cheat: no revealing tonight, answering tomorrow). */
  spent?: boolean
}

export interface CaptainsBoardState {
  /** Week-start Monday this board belongs to. */
  date: string
  tiles: BoardTileClient[]
  /** Picks allowed per day — 1 for everyone, 2 for members. */
  picksAllowed: number
  /** Picks used today (committed or answered). */
  picksToday: number
  /** True once the day's picks are spent — the board locks until tomorrow. */
  playedToday: boolean
  /** The card committed today but not yet answered — the resume target so
   *  a refresh reopens the same question. null when nothing is pending. */
  committedKey: string | null
  /** When the committed card's question was revealed (ISO), for the answer timer;
   *  null when nothing is pending. Paired with serverNow so the client can show an
   *  accurate countdown even after a reload. */
  committedAt: string | null
  /** The server's clock at state-fetch time (ISO) — the countdown's zero point. */
  serverNow: string
  doubloonsAwarded: number
}

export interface AnswerTileResult {
  correct: boolean
  /** The answer landed after the timer ran out (server-judged) — shown as
   *  "Time's up" and counted as a miss. */
  timedOut: boolean
  correctIndex: number
  explanation: string
  doubloonsWon: number
  totalAwarded: number
  /** Wallet total after the payout, null when nothing was won — the
   *  client forwards it to the Nav's doubloons-changed listener. */
  newDoubloons: number | null
  /** Gems won this answer when a weekly correct-answer milestone was crossed
   *  (0 if none), + the new gem total for the gems-changed dispatch. */
  gemsWon: number
  newGems: number | null
  /** Parlor streak after this answer (0 if wrong), the streak it BROKE (>0 only
   *  on a wrong answer that ended a run), and the all-time best. */
  currentStreak: number
  brokeStreak: number
  bestStreak: number
  /** Parlor points earned this answer + the new running total (drives the rank). */
  pointsEarned: number
  newPoints: number
  /** True when this answer pushed the point total into a NEW rank — the cue to
   *  tell the player a reward is waiting to collect in the Parlor lobby. */
  rankedUp: boolean
}

// ── Parlor mastery: streak → rank ────────────────────────────────────
// ONE streak across both games — any correct answer continues it, any wrong one
// breaks it. best_streak is the permanent record that sets your Parlor RANK, a
// title you climb and show off. Prestige, not currency (no economy impact).
export interface ParlorRank { at: number; title: string; color: string; gems: number }
// `at` is a POINT total (points accumulate from every correct answer and never
// reset — charting-style). Reaching a rank pays its `gems` ONCE (escalating), so
// it's a steady, always-forward chase totalling 3000 ◆ to Parlor Legend — the same
// gem scale as the World Chart, deliberately a long grind with legs. Tunable here.
export const PARLOR_RANKS: ParlorRank[] = [
  { at: 0,    title: 'Greenhorn',     color: '#8a8478', gems: 0 },
  { at: 15,   title: 'Card Hand',     color: '#7fd49a', gems: 25 },
  { at: 40,   title: 'Sharp',         color: '#60a5fa', gems: 50 },
  { at: 85,   title: 'Cardsharp',     color: '#a78bfa', gems: 100 },
  { at: 150,  title: 'Rounder',       color: '#f0abfc', gems: 150 },
  { at: 240,  title: 'Parlor Master', color: '#f0c040', gems: 225 },
  { at: 360,  title: 'High Roller',   color: '#ffa94d', gems: 325 },
  { at: 520,  title: 'Kingpin',       color: '#ff6b35', gems: 450 },
  { at: 720,  title: 'Grandee',       color: '#ff3b47', gems: 675 },
  { at: 1000, title: 'Parlor Legend', color: '#e879f9', gems: 1000 },
]
// Points per activity — harder answers are worth more; nothing is lost on a miss.
// Tuned so EACH game's weekly MAX lands in a tight 15-20 band, keeping the climb to
// Parlor Legend a long grind: Board 20 (all 12 cards), King 18 (crowned run), Capstan
// 15 (three clean solves). Doubloon payouts are separate and still scale by tier/rung.
export function boardCardPoints(tier: number): number { return Math.min(tier, 2) }  // 1/2/2 → 20 over the 12-card board
export const KING_RUNG_POINTS = 1      // each correct rung (×10 rungs = 10)
export const KING_CROWN_POINTS = 8     // bonus for crowning the full ladder → 18 max

/** Current rank + the next rung (null if maxed) for an accumulated point total. */
export function parlorRank(points: number): { rank: ParlorRank; next: ParlorRank | null } {
  let rank = PARLOR_RANKS[0]
  for (const r of PARLOR_RANKS) if (points >= r.at) rank = r
  return { rank, next: PARLOR_RANKS[PARLOR_RANKS.indexOf(rank) + 1] ?? null }
}
/** Cumulative gems a player is OWED for every rank their points have reached — the
 *  claim action pays `total - already_claimed` so each rank pays exactly once. */
export function rankGemsTotalFor(points: number): number {
  return PARLOR_RANKS.reduce((sum, r) => sum + (points >= r.at ? r.gems : 0), 0)
}

// ── Manual rank claims (charting-style) ─────────────────────────────
// Gems are NOT auto-paid on a right answer any more. Points accumulate; when they
// cross a rank you must CLAIM it — a satisfying, one-rank-at-a-time deposit. The
// profiles column `parlor_rank_gems_awarded` holds the running total of gems ALREADY
// claimed; since every rank's gem value is positive, that running sum lands exactly
// on a rank boundary, so `cum > claimed` cleanly flags a reached-but-unclaimed rank.

/** The next single rank a player can claim (lowest reached-but-unpaid), or null.
 *  `cumGems` is the new `parlor_rank_gems_awarded` value once this rank is claimed. */
export function nextClaimableParlorRank(points: number, claimedGems: number): { rank: ParlorRank; index: number; cumGems: number } | null {
  let cum = 0
  for (let i = 0; i < PARLOR_RANKS.length; i++) {
    const r = PARLOR_RANKS[i]
    cum += r.gems
    if (r.gems > 0 && points >= r.at && cum > claimedGems) return { rank: r, index: i, cumGems: cum }
  }
  return null
}

/** Every rank sitting unclaimed right now — its length drives the "N to claim"
 *  badge/pulse; the sum of their gems is what's waiting in the pot. */
export function claimableParlorRanks(points: number, claimedGems: number): ParlorRank[] {
  const out: ParlorRank[] = []
  let cum = 0
  for (const r of PARLOR_RANKS) {
    cum += r.gems
    if (r.gems > 0 && points >= r.at && cum > claimedGems) out.push(r)
  }
  return out
}

/** Total gems waiting to be claimed for the point total, given what's been claimed. */
export function claimableGemsTotal(points: number, claimedGems: number): number {
  return Math.max(0, rankGemsTotalFor(points) - claimedGems)
}
/** The host's in-character reaction to an answer. Pure (client-safe); leans on
 *  the streak (or the one just broken) so it never feels canned. */
export function parlorHostReaction(correct: boolean, streak: number, broke = 0): string {
  if (!correct) {
    if (broke >= 8) return `${broke} straight, gone in a heartbeat. The parlor giveth, the parlor taketh.`
    if (broke >= 4) return `There goes a fine run — back to nothing. Steady the hand.`
    return 'Cold water. Shake it off and pick again.'
  }
  if (streak >= 12) return "The whole room's holding its breath. Don't you dare blink."
  if (streak >= 8)  return `${streak} in a row — you're on a proper heater now.`
  if (streak >= 4)  return `${streak} straight. The house is starting to sweat.`
  const lines = ['Well read.', 'Sharp as a gaff hook.', 'The coin knows its master.', 'Clean as you like.']
  return lines[streak % lines.length]
}

// ── Pirate King ─────────────────────────────────────────────────────
// Millionaire-style ladder: ten rungs, prizes climb, answer wrong and
// you fall to the last safe haven. One run a WEEK (fresh ladder each
// Monday), one 50/50 lifeline. Pays doubloons like the board.

/** Monday (UTC) of the current week — the key the weekly ladder and
 *  attempts are stored under. */
export function kingWeekStr(now = new Date()): string {
  const diff = (now.getUTCDay() + 6) % 7
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff))
  return monday.toISOString().split('T')[0]
}

/** Prize per rung (index = rung - 1). A crowned run banks 1000 ⟡. */
export const PIRATE_KING_PRIZES = [20, 40, 60, 100, 160, 240, 360, 520, 720, 1000] as const

export const PIRATE_KING_RUNGS = PIRATE_KING_PRIZES.length

/** Rungs whose prize is safe once passed: bust above a haven and you
 *  keep its prize instead of losing the lot. */
export const PIRATE_KING_HAVENS = [4, 7] as const

/** What a bust pays at a given rung (rung = questions answered
 *  correctly so far): the highest haven prize at or below it. */
export function kingHavenValue(rung: number): number {
  let safe = 0
  for (const h of PIRATE_KING_HAVENS) {
    if (rung >= h) safe = PIRATE_KING_PRIZES[h - 1]
  }
  return safe
}

export type PirateKingStatus = 'active' | 'walked' | 'busted' | 'crowned'

/** The current question as the client sees it — never the answer.
 *  removed = option indexes struck by the 50/50 lifeline. */
export interface KingQuestionClient {
  question: string
  options: string[]
  removed: number[]
}

export interface PirateKingState {
  /** Week-start Monday this run belongs to. */
  date: string
  status: PirateKingStatus
  /** Questions answered correctly so far (0-10). While active, the
   *  current question is rung + 1. */
  rung: number
  doubloonsAwarded: number
  fiftyUsed: boolean
  /** The current rung's question — only present when the run is active AND the
   *  rung has been REVEALED (the clock is running / resuming). null means the
   *  player must reveal it first (which starts the timer). */
  current: KingQuestionClient | null
  /** When the current rung was revealed (ISO), or null if not revealed yet. */
  startedAt: string | null
  /** The server's clock at fetch time (ISO) — the countdown's zero point. */
  serverNow: string
}

/** Question served + timer stamped when a rung is revealed (startKingRung). */
export interface KingRevealResult {
  current: KingQuestionClient
  startedAt: string
  serverNow: string
}

export interface AnswerKingResult {
  correct: boolean
  /** The answer landed after the timer ran out (server-judged) — a timeout busts
   *  the run just like a wrong answer, shown as "Time's up". */
  timedOut: boolean
  correctIndex: number
  explanation: string
  status: PirateKingStatus
  rung: number
  doubloonsAwarded: number
  /** Wallet total after a terminal payout, null when nothing paid —
   *  the client forwards it to the Nav's doubloons-changed listener. */
  newDoubloons: number | null
  /** Crown gem bonus (0 unless this answer crowned the run) + the new gem
   *  total for the gems-changed dispatch. */
  gemsWon: number
  newGems: number | null
  /** Parlor streak after this answer (0 if wrong), the streak it BROKE, and the
   *  all-time best — shared with the Captain's Board. */
  currentStreak: number
  brokeStreak: number
  bestStreak: number
  /** Parlor points earned this answer + the new running total (drives the rank). */
  pointsEarned: number
  newPoints: number
  /** True when this answer pushed the point total into a NEW rank — cue to tell the
   *  player a reward is waiting to collect in the Parlor lobby. */
  rankedUp: boolean
  // No `next` here on purpose: the next rung's question is only served (and its
  // clock started) by startKingRung when the player chooses to climb, so it can't
  // be read ahead of the timer.
}

// ── Spin the Capstan (Wheel-of-Fortune phrase puzzle) ───────────────
// Captain-only. A WEEKLY SET OF 3 nautical phrases, solved at your own pace. You
// spin the capstan for a doubloon value, call consonants (value × occurrences into
// your round bank), buy vowels, and solve to bank it. HAZARD wedges add the tension:
// Overboard wipes the round bank, Lose a Turn costs a strike. Three strikes and the
// puzzle is lost to the deep. The phrase never reaches an unsolved client — the
// server sends a masked length pattern. All tunable here.

export const CAPSTAN_PUZZLES_PER_WEEK = 3
export const CAPSTAN_MAX_STRIKES = 3
export const CAPSTAN_VOWEL_COST = 250            // ⟡ drawn from the round bank per vowel
export const CAPSTAN_VOWELS = ['A', 'E', 'I', 'O', 'U'] as const

export const CAPSTAN_CATEGORIES = ['Ship & Sail', 'Sea Legend', 'Pirate Saying', 'Fish Tale', 'Old Salt'] as const
export type CapstanCategory = (typeof CAPSTAN_CATEGORIES)[number]

/** The wheel. Value wedges + hazards; the server rolls uniformly across this array
 *  and the client animates the capstan to the returned index. */
export type CapstanWedge = number | 'overboard' | 'lose_turn'
// One Overboard and one Lose a Turn, sat roughly opposite each other; the rest are
// value wedges. The server rolls uniformly across this array.
export const CAPSTAN_WHEEL: CapstanWedge[] = [
  250, 400, 150, 'overboard', 500, 300, 350, 200,
  650, 300, 450, 'lose_turn', 800, 250, 550, 150,
]

/**
 * Most hazards the wheel may deal BACK TO BACK before the next spin is forced to
 * land on a value wedge.
 *
 * Two hazards in sixteen is a 1-in-256 chance of three in a row, which sounds
 * like nothing until it happens: a captain spun Lose, Lose, Overboard, Lose and
 * was out on strikes having never once called a letter. That is not a hard round,
 * it is not being allowed to play, and no amount of skill or patience answers it.
 *
 * So the wheel is honest right up to the point where it would take the round away
 * before it started, and then it is not. It costs the player nothing (the odds of
 * a hazard fall from 12.5% to about 12.3%) and it removes the one outcome the
 * game has no answer for.
 */
export const CAPSTAN_MAX_HAZARD_RUN = 2

/** Parlor points a solved puzzle grants toward the shared rank — a base plus a
 *  clean (no-strike) bonus. Kept in line with the Board (1-3/card) and King. */
export const CAPSTAN_SOLVE_POINTS = 3
export const CAPSTAN_CLEAN_BONUS = 2
export function capstanSolvePoints(strikes: number): number {
  return CAPSTAN_SOLVE_POINTS + (strikes === 0 ? CAPSTAN_CLEAN_BONUS : 0)
}

export function isCapstanVowel(ch: string): boolean {
  return (CAPSTAN_VOWELS as readonly string[]).includes(ch.toUpperCase())
}

/** Normalize a phrase or a solve guess: uppercase, letters + spaces only, collapse
 *  runs of whitespace. Both the stored phrase and a player's guess pass through this
 *  so the compare is punctuation/spacing-proof. */
export function normalizeCapstan(s: string): string {
  return s.toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Build the masked length pattern the client renders while a puzzle is unsolved:
 *  each word → an array of cells, each cell the revealed uppercase letter or null
 *  for a still-hidden slot. Spaces separate the word arrays and never leak letters. */
export function capstanMask(phrase: string, called: string[]): (string | null)[][] {
  const up = new Set(called.map(c => c.toUpperCase()))
  return normalizeCapstan(phrase).split(' ').map(word =>
    word.split('').map(ch => (up.has(ch) ? ch : null)),
  )
}

export type CapstanStatus = 'active' | 'solved' | 'failed'

/** One puzzle as the client sees it — the full phrase is null until solved/failed. */
export interface CapstanPuzzleClient {
  index: number
  category: string
  /** Masked length pattern (words → cells). Never contains an unrevealed letter. */
  mask: (string | null)[][]
  called: string[]
  bank: number
  strikes: number
  status: CapstanStatus
  /** The value the last spin landed on, awaiting a consonant call. null = must spin
   *  (or a hazard was just resolved). */
  pendingValue: number | null
  /** Revealed only once the puzzle is solved or lost. */
  phrase: string | null
  /** Doubloons banked on solve (0 until then / on a loss). */
  earned: number
}

export interface CapstanState {
  /** Week-start Monday this set belongs to. */
  date: string
  puzzles: CapstanPuzzleClient[]
  /** Doubloons banked across the week's set (all solved puzzles). */
  doubloonsAwarded: number
}

/** Outcome of a spin: 'value' arms a consonant call; the hazards resolve immediately. */
export type CapstanSpinOutcome = 'value' | 'overboard' | 'lose_turn'

export interface CapstanSpinResult {
  wedgeIndex: number
  wedge: CapstanWedge
  outcome: CapstanSpinOutcome
  puzzle: CapstanPuzzleClient
}

export interface CapstanLetterResult {
  /** The consonant/vowel outcome: how many times it appeared (0 = a miss). */
  letter: string
  count: number
  /** Doubloons added to the bank this call (consonant only). */
  gained: number
  puzzle: CapstanPuzzleClient
}

export interface CapstanSolveResult {
  correct: boolean
  puzzle: CapstanPuzzleClient
  /** Present only on a winning solve. */
  earned: number
  newDoubloons: number | null
  pointsEarned: number
  newPoints: number
  rankedUp: boolean
}
