import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'
import { FISH_SPECIES } from '@/lib/fish-species'

export interface GeneratedFish {
  common_name: string
  scientific_name: string
  clue_1: string
  clue_2: string
  clue_3: string
  clue_4: string
  fun_fact: string
  habitat: string
  diet: string
  size: string
  conservation_status: string
  range: string
}

const SYSTEM_PROMPT = `You are a marine biologist writing content for a fish-themed card game. Your job is to generate fish puzzle clues and facts. You must only state verifiable, well-documented facts. If you are not certain of a fact, do not include it.`

function buildPrompt(speciesList: string): string {
  return `Pick ONE fish from this list and generate a daily puzzle for it. Return ONLY valid JSON with no other text.

SPECIES LIST:
${speciesList}

The puzzle has 4 progressive clues — each one more identifying than the last:
- Clue 1: Broad habitat or ecosystem (e.g. "Found in warm tropical oceans worldwide"). Do NOT name the species or give it away.
- Clue 2: Diet or behavior (e.g. "An opportunistic predator that hunts in open water"). Still no species name.
- Clue 3: A distinctive physical characteristic or adaptation.
- Clue 4: A very specific, nearly definitive fact (world record, unique trait, cultural significance).

JSON format:
{
  "common_name": "...",
  "scientific_name": "...",
  "clue_1": "...",
  "clue_2": "...",
  "clue_3": "...",
  "clue_4": "...",
  "fun_fact": "One fascinating sentence about this species.",
  "habitat": "Brief description of where it lives.",
  "diet": "What it eats.",
  "size": "Typical length and weight range.",
  "conservation_status": "IUCN status (e.g. Least Concern, Vulnerable, Endangered).",
  "range": "Geographic distribution in one sentence."
}

Rules:
- Only use the species from the list above
- Only state facts you are certain are accurate
- Clues must not contain the fish's common or scientific name
- Each clue should be 1-2 sentences`
}

export async function getTodaysFishPuzzle(): Promise<GeneratedFish | null> {
  const admin = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  const { data: cached } = await admin
    .from('daily_fish_generated')
    .select('*')
    .eq('date', today)
    .single()

  if (cached) return cached as GeneratedFish

  const speciesList = [...FISH_SPECIES].sort(() => 0.5 - Math.random()).join('\n')

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(speciesList) }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()
    const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
    const fish: GeneratedFish = JSON.parse(text)

    const required: (keyof GeneratedFish)[] = [
      'common_name', 'scientific_name', 'clue_1', 'clue_2', 'clue_3', 'clue_4',
      'fun_fact', 'habitat', 'diet', 'size', 'conservation_status', 'range',
    ]
    for (const key of required) {
      if (typeof fish[key] !== 'string' || !fish[key]) {
        throw new Error(`Missing or empty field: ${key}`)
      }
    }

    if (!FISH_SPECIES.includes(fish.common_name as any)) {
      throw new Error(`Species not in approved list: ${fish.common_name}`)
    }

    await admin.from('daily_fish_generated').insert({ date: today, ...fish })

    return fish
  } catch (err) {
    console.error('[fish-of-the-day] generation failed:', err)

    const { data: fallback } = await admin
      .from('daily_fish_generated')
      .select('*')
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    return (fallback as GeneratedFish | null) ?? null
  }
}
