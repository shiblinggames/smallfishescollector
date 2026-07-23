import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { TRIVIA_GEN_MODEL } from '@/lib/triviaVerify'
import {
  kingWeekStr,
  normalizeCapstan,
  CAPSTAN_CATEGORIES,
  CAPSTAN_PUZZLES_PER_WEEK,
  type CapstanCategory,
} from '../constants'

// Spin the Capstan generator — a fresh WEEKLY set of 3 nautical phrases, authored
// by Claude and cached in trivia_capstan. Mirrors the Board/King pipeline: cached
// fetch, generate on miss (author → structural-validate → independent sanity-check,
// up to 3 tries), fall back to the most recent set if generation fails.

export interface GeneratedPuzzle {
  category: CapstanCategory
  phrase: string
}

const SYSTEM_PROMPT = `You write hidden phrases for a Wheel-of-Fortune style word game in a nautical pirate world called Sea's The Booty. The players are sea creatures — captains, sailors, crews. Phrases must be well-known, wholesome, family-friendly, and instantly recognizable once solved. Use ONLY common English letters A-Z and single spaces: no numbers, punctuation, apostrophes, hyphens, or accents.`

const CATEGORY_BRIEFS: Record<CapstanCategory, string> = {
  'Ship & Sail': 'a common phrase or term about ships, sailing, or the sea (e.g. ALL HANDS ON DECK, SMOOTH SAILING, BATTEN DOWN THE HATCHES)',
  'Sea Legend': 'a famous sea myth, legend, place, or maritime saying (e.g. DAVY JONES LOCKER, THE SEVEN SEAS, RED SKY AT NIGHT)',
  'Pirate Saying': 'a classic pirate or treasure phrase (e.g. X MARKS THE SPOT, SHIVER ME TIMBERS, PIECES OF EIGHT)',
  'Fish Tale': 'a common fishing or fish-related phrase or idiom (e.g. A BIG CATCH, PLENTY OF FISH IN THE SEA, HOOK LINE AND SINKER)',
  'Old Salt': 'a weathered idiom an old sailor might say, seaworthy in spirit (e.g. LEARN THE ROPES, THREE SHEETS TO THE WIND, A LOOSE CANNON)',
}

function buildPrompt(recentPhrases: string[], priorProblems: string[] = []): string {
  const cats = CAPSTAN_CATEGORIES.slice(0, CAPSTAN_PUZZLES_PER_WEEK)
  const avoidBlock = recentPhrases.length > 0
    ? `\n\nDO NOT reuse or closely paraphrase any of these recently used phrases:\n${recentPhrases.map(p => `- ${p}`).join('\n')}`
    : ''
  const fixBlock = priorProblems.length > 0
    ? `\n\nYour previous attempt was rejected for these reasons. Fix every one:\n${priorProblems.map(p => `- ${p}`).join('\n')}`
    : ''
  return `Generate this week's Spin the Capstan set: exactly ${CAPSTAN_PUZZLES_PER_WEEK} hidden phrases, one for each category below.

Categories:
${cats.map(c => `- ${c}. ${CATEGORY_BRIEFS[c]}`).join('\n')}

Return ONLY a valid JSON array of exactly ${CAPSTAN_PUZZLES_PER_WEEK} objects, no other text:
[
  { "category": "${cats[0]}", "phrase": "ALL HANDS ON DECK" }
]

Rules:
- One phrase per category, in the order listed.
- UPPERCASE, letters A-Z and single spaces ONLY. No punctuation, numbers, or apostrophes (write DAVY JONES LOCKER, not DAVY JONES' LOCKER).
- 2 to 6 words; each phrase 12 to 40 characters total; no single word longer than 12 letters.
- Must be a genuinely well-known phrase a casual player can recognize — no obscure or made-up sayings.
- The three phrases must be clearly different from each other.${avoidBlock}${fixBlock}`
}

function structuralProblem(p: GeneratedPuzzle): string | null {
  if (!CAPSTAN_CATEGORIES.includes(p.category)) return `unknown category "${p.category}"`
  if (typeof p.phrase !== 'string' || !p.phrase) return 'missing phrase'
  const norm = normalizeCapstan(p.phrase)
  if (norm !== p.phrase.toUpperCase().trim()) return `"${p.phrase}" has illegal characters (letters + spaces only)`
  const words = norm.split(' ')
  if (words.length < 2 || words.length > 6) return `"${norm}" must be 2-6 words`
  if (norm.length < 12 || norm.length > 40) return `"${norm}" must be 12-40 characters`
  if (words.some(w => w.length > 12)) return `"${norm}" has a word longer than 12 letters`
  return null
}

const VERIFY_SYSTEM = `You vet phrases for a family-friendly Wheel-of-Fortune word game. For each phrase, judge ONLY: is it a genuinely well-known, recognizable English phrase that fits its category, and is it wholesome/appropriate? Be conservative — flag anything obscure, made-up, awkward, or off-theme.`

interface Verdict { id: number; ok: boolean; issue: string }

/** Independent sanity check: is each phrase real, recognizable, on-theme, clean?
 *  Returns problem strings to feed back into regeneration. [] on verifier failure
 *  so an API blip never blanks the weekly set. */
async function findPhraseProblems(puzzles: GeneratedPuzzle[]): Promise<string[]> {
  if (puzzles.length === 0) return []
  try {
    const blocks = puzzles.map((p, i) => `P${i} [${p.category}]: ${p.phrase}`).join('\n')
    const message = await anthropic.messages.create({
      model: TRIVIA_GEN_MODEL,
      max_tokens: 1200,
      system: VERIFY_SYSTEM,
      messages: [{ role: 'user', content: `Vet each phrase. Return ONLY a JSON array, one object per phrase in order:\n[{ "id": 0, "ok": true, "issue": "" }]\n- ok: true if it is a well-known, recognizable, on-theme, wholesome phrase.\n- issue: "" when clean, else a short reason ("obscure", "not a real phrase", "off-theme", "inappropriate").\n\n${blocks}` }],
    })
    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const verdicts: Verdict[] = JSON.parse(text)
    if (!Array.isArray(verdicts)) return []
    const problems: string[] = []
    for (const v of verdicts) {
      if (typeof v?.id !== 'number' || v.id < 0 || v.id >= puzzles.length) continue
      if (v.ok === false || (typeof v.issue === 'string' && v.issue.trim())) {
        problems.push(`${puzzles[v.id].phrase} -> ${(v.issue || 'not recognizable').trim()}`)
      }
    }
    return problems
  } catch (err) {
    console.error('[capstan] phrase verifier failed (publishing without the extra gate):', err)
    return []
  }
}

export async function getThisWeeksCapstan(): Promise<GeneratedPuzzle[] | null> {
  const admin = createAdminClient()
  const week = kingWeekStr()

  const { data: cached } = await admin
    .from('trivia_capstan')
    .select('puzzles')
    .eq('date', week)
    .single()

  if (cached) return cached.puzzles as GeneratedPuzzle[]

  try {
    const { data: recentRows } = await admin
      .from('trivia_capstan')
      .select('puzzles')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(6)
    const recentPhrases = (recentRows ?? []).flatMap(r => (r.puzzles as GeneratedPuzzle[]).map(p => p.phrase))

    let priorProblems: string[] = []
    for (let attempt = 1; attempt <= 3; attempt++) {
      const message = await anthropic.messages.create({
        model: TRIVIA_GEN_MODEL,
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(recentPhrases, priorProblems) }],
      })
      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const puzzles: GeneratedPuzzle[] = JSON.parse(jsonText)

      if (!Array.isArray(puzzles) || puzzles.length !== CAPSTAN_PUZZLES_PER_WEEK) {
        throw new Error(`Expected ${CAPSTAN_PUZZLES_PER_WEEK} puzzles, got ${Array.isArray(puzzles) ? puzzles.length : typeof puzzles}`)
      }
      // Normalize the phrase to the canonical uppercase/letters-only form before storing.
      for (const p of puzzles) p.phrase = normalizeCapstan(p.phrase ?? '')

      const structural = puzzles.map(structuralProblem).filter((x): x is string => x !== null)
      if (structural.length === 0 && new Set(puzzles.map(p => p.phrase)).size === puzzles.length) {
        const problems = await findPhraseProblems(puzzles)
        if (problems.length === 0) {
          await admin.from('trivia_capstan').insert({ date: week, puzzles })
          return puzzles
        }
        priorProblems = problems
      } else {
        priorProblems = structural.length ? structural : ['the three phrases must all be different']
      }
      console.warn(`[capstan] attempt ${attempt} rejected; regenerating`, priorProblems)
    }
    throw new Error('Capstan set failed validation after 3 attempts')
  } catch (err) {
    console.error('[capstan] generation failed:', err)
    const { data: fallback } = await admin
      .from('trivia_capstan')
      .select('puzzles')
      .lt('date', week)
      .order('date', { ascending: false })
      .limit(1)
      .single()
    return (fallback?.puzzles as GeneratedPuzzle[] | undefined) ?? null
  }
}
