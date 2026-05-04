import { anthropic } from './anthropic'
import { getCrewTrait } from './crew-traits'
import { createAdminClient } from './supabase/admin'
import type { VoyageEvent, VoyageRoute } from './voyageEvents'
import { ROUTE_CONFIGS } from './voyageEvents'

export interface VoyageCrewMember {
  name: string
  rarity: string
  variantId: number
}

export interface VoyageLogInput {
  voyageId: number
  route: VoyageRoute
  crew: VoyageCrewMember[]
  events: VoyageEvent[]
  totalDoubloons: number
  totalGems: number
  crewLostNames: string[]  // names of crew who didn't return
}

export async function generateVoyageLog(input: VoyageLogInput): Promise<string> {
  const routeConfig = ROUTE_CONFIGS[input.route]

  const crewLines = input.crew.map(c => {
    const trait = getCrewTrait(c.name, c.rarity)
    const lost = input.crewLostNames.includes(c.name)
    return `${c.name} (${c.rarity})${lost ? ' — DID NOT RETURN' : ''}: "${trait}"`
  }).join('\n')

  const eventLines = input.events.map(e => {
    const icon = e.outcome === 'success' ? '✓' : e.outcome === 'failure' ? '✗' : '~'
    return `${icon} ${e.title} (${e.type}) — ${e.narrative}`
  }).join('\n')

  const hasCatfish = input.crew.some(c => c.name === 'Catfish')
  const hasDobyMick = input.crew.some(c => c.name === 'Doby Mick')
  const abyssNote = (hasCatfish && hasDobyMick && input.route === 'deep')
    ? '\nNote: Both Catfish and Doby Mick are aboard. They do not speak to each other on deep runs. Reference this tension without explaining it.'
    : ''

  const lootLine = [
    input.totalDoubloons > 0 ? `${input.totalDoubloons} doubloons` : null,
    input.totalGems > 0 ? `${input.totalGems} gems` : null,
  ].filter(Boolean).join(', ') || 'nothing'

  const crewLostLine = input.crewLostNames.length > 0
    ? `Crew lost: ${input.crewLostNames.join(', ')}`
    : 'All crew returned'

  const prompt = `You write captain's log entries for a pirate fish game called Seas the Booty.
All characters are anthropomorphized fish pirates. The world has four factions:
The Saltwater Brotherhood (ruthless pirates), The Gilded Net (merchant guild, not always honest),
The Deepwatch (mysterious enforcers), The Drifters (nomadic, no allegiance).
Named figures: Valdris (giant Moray Eel, Brotherhood captain), Barnacle Pete (Pufferfish smuggler).

The captain stays at port and sends a crew on a long voyage. Write a captain's log entry recorded after the crew returned.
3 to 5 sentences. First person. Past tense.
Written as if scrawled in a journal the night the crew came home.

VOYAGE DATA:
Route: ${routeConfig.name} (${routeConfig.tagline})
Loot returned: ${lootLine}
${crewLostLine}

CREW SENT:
${crewLines}

WHAT HAPPENED AT SEA:
${eventLines || 'Nothing reported'}
${abyssNote}

TONE RULES — follow exactly:
- Terse and atmospheric. The world is dangerous and indifferent.
- The captain wasn't there — they sent the crew and waited. Write from that remove.
- Reference crew by name when notable. Their trait should feel consistent with their actions — don't quote it, let it color the writing.
- If crew was lost, state it plainly. Don't mourn. Record.
- Don't describe game mechanics. Write what it felt like.
- The last sentence should land. Make it mean something.
- Vary length and drama — a quiet coastal run gets a short entry, a brutal deep crossing gets weight.
- NEVER use: "Unfortunately", "Sadly", "We tried our best", "lesson learned", "all in all".

REFERENCE EXAMPLES (match this tone exactly):

Example 1 — crew loss on deep crossing:
"Sent them into the Howling Deep at dawn. They came back at midnight with 780 doubloons and one fewer face at the table. Lionfish didn't make it past the third encounter — the report doesn't specify what happened and nobody's going to push. The rest ate. I counted the coin. We don't talk about the Howling Deep."

Example 2 — clean coastal run:
"Easy crossing. The Inner Sea was calm and the crew moved through it without incident. Bass brought back 340 doubloons and a ring nobody recognized. I didn't ask where it came from."

Example 3 — rough open voyage, no loss:
"The Crossing tried to take them. A Brotherhood intercept at midpoint, weather coming in behind it. Hammerhead held the line long enough for the others to push through. They came back intact, if not clean. 620 doubloons. Good crew."

Example 4 — total wipeout (all crew lost):
"They didn't come back. The ship did. I don't know what that means and I'm not sure I want to."

Return ONLY the log entry. No title. No label. Just the prose.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = response.content[0]
  return block.type === 'text' ? block.text.trim() : ''
}

export async function generateAndSaveVoyageLog(input: VoyageLogInput): Promise<void> {
  try {
    const log = await generateVoyageLog(input)
    const admin = createAdminClient()
    await admin.from('daily_voyages').update({
      captains_log: log,
      log_generated_at: new Date().toISOString(),
    }).eq('id', input.voyageId)
  } catch (err) {
    console.error('Voyage log generation failed:', err)
  }
}
