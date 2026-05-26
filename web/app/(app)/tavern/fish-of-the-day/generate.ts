import { createAdminClient } from '@/lib/supabase/admin'
import { anthropic } from '@/lib/anthropic'

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

interface PromptSpecies {
  name: string
  water_type: string | null
  region: string | null
  is_edible: boolean | null
  size_category: string | null
}

function describeAttrs(s: PromptSpecies): string {
  const parts: string[] = []
  if (s.water_type)     parts.push(`water_type=${s.water_type}`)
  if (s.region)         parts.push(`region=${s.region}`)
  if (s.size_category)  parts.push(`size_category=${s.size_category}`)
  if (s.is_edible !== null) parts.push(`edible=${s.is_edible ? 'yes' : 'no'}`)
  return parts.join(' · ')
}

// Family / category terms that immediately identify a fish if mentioned in a clue.
// The picker filters by substring, so "a medium ray" instantly narrows to rays when
// the answer is "Stingray". Any of these that appear in the common_name become
// forbidden substrings for all clues.
const FAMILY_TERMS = [
  'ray', 'shark', 'eel', 'cod', 'tuna', 'perch', 'bass', 'trout', 'salmon',
  'pike', 'carp', 'snapper', 'grouper', 'flounder', 'halibut', 'herring',
  'mackerel', 'sardine', 'anchovy', 'minnow', 'goby', 'wrasse', 'sole', 'gar',
  'puffer', 'whale', 'dolphin', 'angler', 'barracuda', 'piranha', 'crab',
  'lobster', 'shrimp', 'jelly', 'squid', 'octopus', 'manta', 'marlin', 'mahi',
  'cichlid', 'koi', 'catfish', 'sturgeon', 'arapaima', 'arowana', 'tarpon',
  'bonefish', 'sailfish', 'swordfish', 'wahoo', 'snook', 'tilapia', 'guppy',
  'sunfish', 'lionfish', 'seahorse', 'stingray', 'hammerhead', 'thresher',
  'parrotfish', 'triggerfish', 'pufferfish', 'lamprey', 'pacu', 'discus',
  'oscar', 'angelfish', 'clownfish', 'bluegill', 'crappie', 'walleye',
  'sturgeon', 'gar', 'bowfin',
]

function forbiddenSubstrings(commonName: string): string[] {
  const lower = commonName.toLowerCase()
  const forbidden = new Set<string>()
  // Always forbid the last word of the name (usually the family/category).
  const words = lower.split(/\s+/).filter(w => w.length >= 3)
  if (words.length > 0) forbidden.add(words[words.length - 1])
  // Forbid any family term that appears as a substring of the name.
  for (const term of FAMILY_TERMS) {
    if (lower.includes(term)) forbidden.add(term)
  }
  return [...forbidden]
}

function clueViolation(clue: string, forbidden: string[]): string | null {
  const words = (clue.toLowerCase().match(/[a-z]+/g) ?? [])
  for (const word of words) {
    for (const term of forbidden) {
      if (word.includes(term)) return term
    }
  }
  return null
}

function buildPrompt(species: PromptSpecies, forbidden: string[]): string {
  const attrs = describeAttrs(species)
  const forbiddenLine = forbidden.length > 0
    ? `\n\nFORBIDDEN SUBSTRINGS — NONE of these may appear anywhere in any clue (case-insensitive, no substring use either):\n${forbidden.map(t => `  - "${t}"`).join('\n')}\n\nThe player's guess picker filters by substring, so any of these would let them cheat the puzzle. Use generic biology language instead (e.g. for "Stingray" never say "ray" — say "a cartilaginous bottom-dweller" or "a flattened cartilaginous predator"; for "Whale Shark" never say "shark" or "whale" — say "a filter-feeder" or "a gentle giant").`
    : ''
  return `Generate a daily fish puzzle for "${species.name}". Return ONLY valid JSON with no other text.

ANSWER ATTRIBUTES (this is the data the game compares guesses against — every clue must align with these):
${attrs}${forbiddenLine}

The puzzle has 4 clues. Each clue must narrow down the candidate species pool — generic flavor is not allowed. Each later clue should bring the player closer to a unique identification.

- Clue 1: State the answer's water type (saltwater / freshwater / brackish — pick the most natural phrasing) AND the geographic region from the attributes above, woven into a single sentence about habitat or ecosystem. This must rule out roughly half the candidate pool by itself.
- Clue 2: State the size class (small / medium / large — translate "${species.size_category ?? 'medium'}" naturally, e.g. "a fish under 30cm" or "a giant exceeding two meters") AND its diet or hunting behavior.
- Clue 3: A distinctive physical characteristic, coloration, or adaptation specific to this species — concrete and visual.
- Clue 4: A nearly definitive fact — world record, cultural significance, unique evolutionary trait, or a striking behavior — that strongly points to this species without naming it.

JSON format:
{
  "common_name": ${JSON.stringify(species.name)},
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
- common_name must be exactly ${JSON.stringify(species.name)} (do not change capitalization or wording)
- Clues must align with the attributes above (the game will compare guesses against this data)
- Only state facts you are certain are accurate
- Clues must NOT contain the fish's common or scientific name OR any of the forbidden substrings above
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

  const { data: speciesRows } = await admin
    .from('fish_species')
    .select('name, water_type, region, is_edible, size_category')
    .eq('fotd_eligible', true)
  const allSpecies = (speciesRows ?? []) as PromptSpecies[]
  const allNames = allSpecies.map(s => s.name)

  const windowStart = new Date(Date.now() - 54 * 86400000).toISOString().split('T')[0]
  const { data: recentRows } = await admin
    .from('daily_fish_generated')
    .select('common_name')
    .gte('date', windowStart)
    .lt('date', today)

  const recentNames = new Set((recentRows ?? []).map((r: { common_name: string }) => r.common_name))
  const available = allSpecies.filter(s => !recentNames.has(s.name))
  const pool = available.length > 0 ? available : allSpecies
  const chosen = pool[Math.floor(Math.random() * pool.length)]
  const forbidden = forbiddenSubstrings(chosen.name)

  const MAX_ATTEMPTS = 3
  try {
    let fish: GeneratedFish | null = null
    let lastViolation: { clue: string; term: string } | null = null

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const violationNote = lastViolation
        ? `\n\nREJECTED PREVIOUS ATTEMPT — your last "${lastViolation.clue}" contained the forbidden substring "${lastViolation.term}". Rewrite WITHOUT it.`
        : ''
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildPrompt(chosen, forbidden) + violationNote }],
      })

      const raw = (message.content[0] as { type: string; text: string }).text.trim()
      const text = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
      const candidate: GeneratedFish = JSON.parse(text)

      const required: (keyof GeneratedFish)[] = [
        'common_name', 'scientific_name', 'clue_1', 'clue_2', 'clue_3', 'clue_4',
        'fun_fact', 'habitat', 'diet', 'size', 'conservation_status', 'range',
      ]
      for (const key of required) {
        if (typeof candidate[key] !== 'string' || !candidate[key]) {
          throw new Error(`Missing or empty field: ${key}`)
        }
      }
      if (!allNames.includes(candidate.common_name)) {
        throw new Error(`Species not in approved list: ${candidate.common_name}`)
      }

      // Validate clues for forbidden substrings
      let violation: { clue: string; term: string } | null = null
      for (const k of ['clue_1', 'clue_2', 'clue_3', 'clue_4'] as const) {
        const term = clueViolation(candidate[k], forbidden)
        if (term) { violation = { clue: k, term }; break }
      }
      if (!violation) {
        fish = candidate
        break
      }
      console.warn(`[fish-of-the-day] attempt ${attempt + 1}: ${violation.clue} leaks "${violation.term}", retrying`)
      lastViolation = violation
    }

    if (!fish) throw new Error('Failed to generate clean clues after retries')

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
