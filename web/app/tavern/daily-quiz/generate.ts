import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'

export interface QuizData {
  question: string
  options: string[]
  correct_index: number
  explanation: string
  topic: string
}

const SYSTEM_PROMPT = `You generate fish and ocean trivia questions for a collectible card game called Small Fishes. Questions should be interesting, educational, and fun. Only state verifiable facts — never guess or make things up.`

const USER_PROMPT = `Generate one fish/ocean trivia question. Return ONLY a valid JSON object in this exact format, with no other text:
{
  "question": "...",
  "options": ["option A", "option B", "option C", "option D"],
  "correct_index": 0,
  "explanation": "1-2 sentence explanation of the correct answer.",
  "topic": "biology"
}

Rules:
- correct_index must be 0, 1, 2, or 3 corresponding to the correct option
- options must have exactly 4 entries, all plausible but only one correct
- topic must be one of: biology, behavior, habitat, fishing, record, history
- The correct option should appear in different positions each day (not always 0)
- Questions should vary: anatomy, world records, famous species, fishing techniques, ocean facts, conservation`

export async function getTodaysQuiz(): Promise<QuizData | null> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: cached } = await admin
    .from('daily_quiz')
    .select('question, options, correct_index, explanation, topic')
    .eq('date', today)
    .single()

  if (cached) return cached as QuizData

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: USER_PROMPT }],
    })

    const text = (message.content[0] as { type: string; text: string }).text.trim()
    const quiz: QuizData = JSON.parse(text)

    if (
      typeof quiz.question !== 'string' ||
      !Array.isArray(quiz.options) ||
      quiz.options.length !== 4 ||
      typeof quiz.correct_index !== 'number' ||
      quiz.correct_index < 0 ||
      quiz.correct_index > 3 ||
      typeof quiz.explanation !== 'string'
    ) {
      throw new Error('Invalid quiz structure from Claude')
    }

    await admin.from('daily_quiz').insert({ date: today, ...quiz })

    return quiz
  } catch (err) {
    console.error('[daily-quiz] generation failed:', err)

    // Fall back to yesterday's quiz if generation fails
    const { data: fallback } = await admin
      .from('daily_quiz')
      .select('question, options, correct_index, explanation, topic')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    return (fallback as QuizData | null) ?? null
  }
}
