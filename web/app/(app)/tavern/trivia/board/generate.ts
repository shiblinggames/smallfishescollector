import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { TRIVIA_CATEGORY_KEYS, TRIVIA_TIERS, kingWeekStr, type TriviaCategoryKey } from '../constants'
import { findTriviaIssues, TRIVIA_GEN_MODEL, type TriviaIssue } from '@/lib/triviaVerify'

// The Captain's Board generator — twelve fresh questions a night
// (4 categories x 3 tiers), authored by Claude on the midnight cron
// and cached in trivia_boards. Same shape as the old fish-of-the-day
// and daily-quiz generators: cached fetch, generate on miss, fall
// back to the most recent previous board if generation fails.

export interface GeneratedTile {
  category: TriviaCategoryKey
  tier: 1 | 2 | 3
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

const SYSTEM_PROMPT = `You write trivia questions for a nautical fishing game called Sea's The Booty. Players are sea creatures: captains, sailors, and crews. Questions must be interesting, fair, and fun. Only state verifiable, well-documented facts. If you are not certain a fact is accurate, do not use it.`

const CATEGORY_BRIEFS: Record<TriviaCategoryKey, string> = {
  FISH: 'Fish Facts: fish biology, anatomy, species identification, fish behavior and senses',
  DEEP: 'The Deep: the ocean itself. Ocean zones, geography, currents, record depths, deep-sea creatures, strange phenomena',
  LORE: 'Salt & Legend: maritime history, real pirate history, sea myths and legends, famous ships and voyages',
  CATCH: 'The Catch: the craft of fishing. Techniques, tackle, angling records, commercial fishing history, seafood',
}

function buildPrompt(recentQuestions: string[], priorIssues: TriviaIssue[] = []): string {
  const avoidBlock = recentQuestions.length > 0
    ? `\n\nDO NOT repeat or closely paraphrase any of these recently used questions:\n${recentQuestions.map(q => `- ${q}`).join('\n')}`
    : ''
  // On a regeneration pass, hand back exactly what the fact-checker caught.
  const fixBlock = priorIssues.length > 0
    ? `\n\nYour previous attempt failed fact-checking on these. Do not repeat them; make sure every correct_index is truly correct and every stem matches its answer:\n${priorIssues.map(p => `- ${p.problem}`).join('\n')}`
    : ''
  return `Generate today's trivia board: exactly 12 questions, one for every combination of the 4 categories and 3 difficulty tiers.

Categories:
- FISH. ${CATEGORY_BRIEFS.FISH}
- DEEP. ${CATEGORY_BRIEFS.DEEP}
- LORE. ${CATEGORY_BRIEFS.LORE}
- CATCH. ${CATEGORY_BRIEFS.CATCH}

Tiers:
- Tier 1: common knowledge. Most casual players should get it.
- Tier 2: requires genuine familiarity with the topic.
- Tier 3: hard. For enthusiasts, but still fair. No trick questions, no hyper-obscure minutiae.

Return ONLY a valid JSON array of exactly 12 objects, no other text:
[
  {
    "category": "FISH",
    "tier": 1,
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct_index": 0,
    "explanation": "1-2 sentence explanation of the correct answer."
  }
]

Rules:
- Exactly one question per category-tier pair (FISH 1, FISH 2, FISH 3, DEEP 1, ... CATCH 3)
- options must have exactly 4 entries, all plausible, all distinct, only one correct
- correct_index must be 0, 1, 2, or 3 and the correct position must vary across the 12 questions
- Keep questions under 140 characters and options under 40 characters; this renders on a phone
- explanation is shown after answering; make it a satisfying little fact, not a restatement${avoidBlock}${fixBlock}`
}

function isValidTile(t: GeneratedTile): boolean {
  if (!TRIVIA_CATEGORY_KEYS.includes(t.category)) return false
  if (!(TRIVIA_TIERS as readonly number[]).includes(t.tier)) return false
  if (typeof t.question !== 'string' || !t.question) return false
  if (!Array.isArray(t.options) || t.options.length !== 4) return false
  if (t.options.some(o => typeof o !== 'string' || !o)) return false
  const normalized = t.options.map(o => o.trim().toLowerCase().replace(/\s+/g, ' '))
  if (new Set(normalized).size !== 4) return false
  if (typeof t.correct_index !== 'number' || t.correct_index < 0 || t.correct_index > 3) return false
  if (typeof t.explanation !== 'string' || !t.explanation) return false
  return true
}

export async function getThisWeeksBoard(): Promise<GeneratedTile[] | null> {
  const admin = createAdminClient()
  // Weekly board, keyed by the Monday week-start (same key the Pirate King
  // ladder uses). Tue–Sun this is a cache hit; Monday rolls a fresh board.
  const week = kingWeekStr()

  const { data: cached } = await admin
    .from('trivia_boards')
    .select('board')
    .eq('date', week)
    .single()

  if (cached) return cached.board as GeneratedTile[]

  try {
    // Last few weeks' boards feed the avoid-list so the board doesn't
    // circle the same favorite facts week to week.
    const { data: recentRows } = await admin
      .from('trivia_boards')
      .select('board')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(5)
    const recentQuestions = (recentRows ?? [])
      .flatMap(r => (r.board as GeneratedTile[]).map(t => t.question))

    // Author -> structural validate -> independent fact-check, regenerating
    // (up to 3 tries) with the fact-checker's complaints fed back in so a wrong
    // answer or a self-contradicting question never reaches players.
    let priorIssues: TriviaIssue[] = []
    for (let attempt = 1; attempt <= 3; attempt++) {
      const message = await anthropic.messages.create({
        model: TRIVIA_GEN_MODEL,
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(recentQuestions, priorIssues) }],
      })

      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const board: GeneratedTile[] = JSON.parse(text)

      if (!Array.isArray(board) || board.length !== 12) {
        throw new Error(`Expected 12 tiles, got ${Array.isArray(board) ? board.length : typeof board}`)
      }
      for (const tile of board) {
        if (!isValidTile(tile)) throw new Error(`Invalid tile: ${JSON.stringify(tile).slice(0, 120)}`)
      }
      // Every category-tier pair exactly once.
      const combos = new Set(board.map(t => `${t.category}-${t.tier}`))
      if (combos.size !== 12) throw new Error('Duplicate or missing category-tier pairs')

      const issues = await findTriviaIssues(board)
      if (issues.length === 0) {
        await admin.from('trivia_boards').insert({ date: week, board })
        return board
      }
      console.warn(`[captains-board] attempt ${attempt} failed fact-check (${issues.length} issue(s)); regenerating`, issues.map(i => i.problem))
      priorIssues = issues
    }
    throw new Error('Board failed fact-check after 3 attempts')
  } catch (err) {
    console.error('[captains-board] generation failed:', err)

    const { data: fallback } = await admin
      .from('trivia_boards')
      .select('board')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    return (fallback?.board as GeneratedTile[] | undefined) ?? null
  }
}
