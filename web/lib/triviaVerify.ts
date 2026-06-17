import { anthropic } from '@/lib/anthropic'

// Shared correctness gate for generated trivia (the Captain's Board + the
// Pirate King ladder). The generators only ever validated STRUCTURE (4 options,
// distinct, valid index) — never whether the marked answer is actually right.
// That let two error classes through to live players:
//   1. correct_index pointing at the wrong option (explanation said one thing,
//      the index said another).
//   2. a question whose stem contradicts its own answer (e.g. asking "female to
//      male" but marking the clownfish, which changes male to female).
//
// This module re-answers each question with an INDEPENDENT, stronger model that
// never sees the marked answer, then compares. Anything it confidently answers
// differently, or flags as ambiguous / multi-answer / unanswerable, is returned
// as an issue so the generator can regenerate before publishing.

/** Model the generators author with. Bumped off haiku — a stronger author makes
 *  far fewer factual + index mistakes at negligible nightly cost. */
export const TRIVIA_GEN_MODEL = 'claude-sonnet-4-6'
/** Independent verifier. Kept separate so the role is explicit; uses the same
 *  capable tier so it reliably out-reasons a bad question. */
export const TRIVIA_VERIFY_MODEL = 'claude-sonnet-4-6'

export interface TriviaItem {
  question: string
  options: string[]
  correct_index: number
  explanation?: string
}

export interface TriviaIssue {
  /** Index into the items array. */
  index: number
  /** Short machine/human reason, fed back into the regeneration prompt. */
  problem: string
}

const VERIFY_SYSTEM = `You are a meticulous trivia fact-checker. You are given multiple-choice questions WITHOUT their marked answers. For each, determine the single correct option using only well-established, verifiable facts. Be conservative: if a question has more than one defensible correct answer, no correct answer, or is ambiguous or factually shaky, say so. Do not guess to be agreeable.`

function buildVerifyPrompt(items: TriviaItem[]): string {
  const blocks = items.map((it, i) => {
    const opts = it.options.map((o, j) => `    ${j}: ${o}`).join('\n')
    return `Q${i}: ${it.question}\n${opts}`
  }).join('\n\n')
  return `Fact-check each question below. For each, pick the index (0-3) of the single correct option based strictly on established facts.

${blocks}

Return ONLY a JSON array, one object per question in order, no other text:
[
  { "id": 0, "answer": <0-3>, "sure": true|false, "issue": "" }
]
- "answer": the index YOU believe is correct, judged independently.
- "sure": true only if you are confident; false if it's a genuine toss-up for you.
- "issue": "" when the question is clean. Otherwise a short reason it is broken: "ambiguous", "multiple correct" (name them), "no correct option", "stem contradicts the intended answer", or "fact is inaccurate".`
}

interface VerifyVerdict { id: number; answer: number; sure: boolean; issue: string }

/** Run the independent verifier and return the items that look wrong. Returns
 *  [] on any verifier failure (parse / API) so a verifier outage degrades to the
 *  prior behavior — never blocks a nightly publish. */
export async function findTriviaIssues(items: TriviaItem[]): Promise<TriviaIssue[]> {
  if (items.length === 0) return []
  try {
    const message = await anthropic.messages.create({
      model: TRIVIA_VERIFY_MODEL,
      max_tokens: 2000,
      system: VERIFY_SYSTEM,
      messages: [{ role: 'user', content: buildVerifyPrompt(items) }],
    })
    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const verdicts: VerifyVerdict[] = JSON.parse(text)
    if (!Array.isArray(verdicts)) return []

    const issues: TriviaIssue[] = []
    for (const v of verdicts) {
      const i = v?.id
      if (typeof i !== 'number' || i < 0 || i >= items.length) continue
      const item = items[i]
      // A flagged structural/factual problem always counts.
      if (typeof v.issue === 'string' && v.issue.trim()) {
        issues.push({ index: i, problem: `${items[i].question} -> ${v.issue.trim()}` })
        continue
      }
      // A CONFIDENT disagreement on the answer counts (catches mislabeled
      // correct_index + stem/answer contradictions). A non-confident
      // difference is ignored so genuinely hard questions aren't nuked.
      if (v.sure === true && typeof v.answer === 'number' && v.answer !== item.correct_index) {
        issues.push({
          index: i,
          problem: `${item.question} -> marked option ${item.correct_index} ("${item.options[item.correct_index]}") but the correct answer is option ${v.answer} ("${item.options[v.answer] ?? '?'}")`,
        })
      }
    }
    return issues
  } catch (err) {
    console.error('[trivia-verify] verifier failed (publishing without the extra gate):', err)
    return []
  }
}
