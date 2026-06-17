import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { PIRATE_KING_RUNGS, kingWeekStr } from '../constants'
import { findTriviaIssues, TRIVIA_GEN_MODEL, type TriviaIssue } from '@/lib/triviaVerify'

// Pirate King generator — a ten-question ladder a WEEK (keyed by the
// Monday week-start), difficulty ramping from rung 1 (anyone at the
// bar gets it) to rung 10 (true enthusiast), authored by Claude on
// the midnight cron and cached in trivia_ladders. The cron still runs
// nightly; Tuesday through Sunday this is a cache hit, Monday rigs
// the fresh ladder. Same cached/generate/fallback shape as the
// Captain's Board generator next door. The avoid-list pulls from BOTH
// recent ladders and recent boards so the two games never serve the
// same fact.

export interface GeneratedRung {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

const SYSTEM_PROMPT = `You write trivia questions for a nautical fishing game called Sea's The Booty. Players are sea creatures: captains, sailors, and crews. Questions must be interesting, fair, and fun. Only state verifiable, well-documented facts. If you are not certain a fact is accurate, do not use it.`

function buildPrompt(recentQuestions: string[], priorIssues: TriviaIssue[] = []): string {
  const avoidBlock = recentQuestions.length > 0
    ? `\n\nDO NOT repeat or closely paraphrase any of these recently used questions:\n${recentQuestions.map(q => `- ${q}`).join('\n')}`
    : ''
  // On a regeneration pass, tell the author exactly what a fact-checker caught
  // last time so it doesn't repeat the same mistakes.
  const fixBlock = priorIssues.length > 0
    ? `\n\nYour previous attempt failed fact-checking on these. Do not repeat them; make sure every correct_index is truly correct and every stem matches its answer:\n${priorIssues.map(p => `- ${p.problem}`).join('\n')}`
    : ''
  return `Generate this week's Pirate King ladder: exactly 10 questions in strict ascending difficulty.

Topics: mix freely across fish biology and behavior, the ocean and the deep sea, maritime history and pirate lore, and the craft of fishing. Vary the topics across the ladder; no two consecutive questions on the same narrow topic.

Difficulty ramp:
- Questions 1-3: common knowledge. Nearly everyone should get these.
- Questions 4-6: requires genuine familiarity with the topic.
- Questions 7-8: hard. For enthusiasts.
- Questions 9-10: very hard but still fair and verifiable. No trick questions, no hyper-obscure minutiae; a well-read enthusiast should have a real shot.

Return ONLY a valid JSON array of exactly 10 objects in ladder order, no other text:
[
  {
    "question": "...",
    "options": ["...", "...", "...", "..."],
    "correct_index": 0,
    "explanation": "1-2 sentence explanation of the correct answer."
  }
]

Rules:
- options must have exactly 4 entries, all plausible, all distinct, only one correct
- correct_index must be 0, 1, 2, or 3 and the correct position must vary across the 10 questions
- Keep questions under 140 characters and options under 40 characters; this renders on a phone
- explanation is shown after answering; make it a satisfying little fact, not a restatement${avoidBlock}${fixBlock}`
}

function isValidRung(r: GeneratedRung): boolean {
  if (typeof r.question !== 'string' || !r.question) return false
  if (!Array.isArray(r.options) || r.options.length !== 4) return false
  if (r.options.some(o => typeof o !== 'string' || !o)) return false
  const normalized = r.options.map(o => o.trim().toLowerCase().replace(/\s+/g, ' '))
  if (new Set(normalized).size !== 4) return false
  if (typeof r.correct_index !== 'number' || r.correct_index < 0 || r.correct_index > 3) return false
  if (typeof r.explanation !== 'string' || !r.explanation) return false
  return true
}

export async function getThisWeeksLadder(): Promise<GeneratedRung[] | null> {
  const admin = createAdminClient()
  const week = kingWeekStr()
  const today = new Date().toISOString().split('T')[0]

  const { data: cached } = await admin
    .from('trivia_ladders')
    .select('ladder')
    .eq('date', week)
    .single()

  if (cached) return cached.ladder as GeneratedRung[]

  try {
    // Avoid recent ladders and recent boards (including today's) so
    // the two games never serve the same fact.
    const [{ data: recentLadders }, { data: recentBoards }] = await Promise.all([
      admin.from('trivia_ladders').select('ladder')
        .lt('date', week).order('date', { ascending: false }).limit(5),
      admin.from('trivia_boards').select('board')
        .lte('date', today).order('date', { ascending: false }).limit(5),
    ])
    const recentQuestions = [
      ...(recentLadders ?? []).flatMap(r => (r.ladder as GeneratedRung[]).map(q => q.question)),
      ...(recentBoards ?? []).flatMap(r => (r.board as { question: string }[]).map(q => q.question)),
    ]

    // Author -> structural validate -> independent fact-check. Regenerate (up
    // to 3 tries) feeding the fact-checker's complaints back in, so a mislabeled
    // answer or a stem/answer contradiction never reaches players.
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
      const ladder: GeneratedRung[] = JSON.parse(text)

      if (!Array.isArray(ladder) || ladder.length !== PIRATE_KING_RUNGS) {
        throw new Error(`Expected ${PIRATE_KING_RUNGS} rungs, got ${Array.isArray(ladder) ? ladder.length : typeof ladder}`)
      }
      for (const rung of ladder) {
        if (!isValidRung(rung)) throw new Error(`Invalid rung: ${JSON.stringify(rung).slice(0, 120)}`)
      }

      const issues = await findTriviaIssues(ladder)
      if (issues.length === 0) {
        await admin.from('trivia_ladders').insert({ date: week, ladder })
        return ladder
      }
      console.warn(`[pirate-king] attempt ${attempt} failed fact-check (${issues.length} issue(s)); regenerating`, issues.map(i => i.problem))
      priorIssues = issues
    }
    throw new Error('Ladder failed fact-check after 3 attempts')
  } catch (err) {
    console.error('[pirate-king] generation failed:', err)

    const { data: fallback } = await admin
      .from('trivia_ladders')
      .select('ladder')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    return (fallback?.ladder as GeneratedRung[] | undefined) ?? null
  }
}
